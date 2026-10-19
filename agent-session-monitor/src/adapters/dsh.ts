import fs from 'node:fs';
import path from 'node:path';
import { decompress } from 'fzstd';
import chokidar from 'chokidar';
import type { SessionDelta, SessionRecord, ToolName, TurnRecord } from '../types.js';
import { BaseAdapter, lastPathSegment, truncate } from './base.js';
import { logger } from '../logger.js';

interface DshHeader { type: string; version?: number; id?: string; createdAt?: number; cwd?: string; delegationDepth?: number }
interface DshEvent { type: string; seq?: number; time?: number; data?: Record<string, unknown> }

interface ParsedSession {
  sessionId: string;
  cwd: string;
  title?: string;
  createdAt: number;
  delegationDepth: number;
  turns: TurnRecord[];
  lastAssistantText?: string;
  blocked: boolean;
  running: boolean;
  v4: boolean;
}

export function parseFile(file: string): ParsedSession | null {  let buf: Uint8Array;
  try {
    buf = fs.readFileSync(file);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') { logger.debug(`dsh 文件已消失（轮转）: ${file}`); return null; }
    throw e;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(decompress(buf));
  } catch (e) {
    logger.debug(`dsh 解压失败: ${file}`, String(e));
    return null;
  }
  const lines = text.split('\n');
  let header: DshHeader | null = null;
  const turns = new Map<number, TurnRecord>();
  let title: string | undefined;
  let lastAssistantText: string | undefined;
  const pendingApprovals = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    let ev: DshEvent;
    try { ev = JSON.parse(line) as DshEvent; } catch { continue; }
    if (!header && ev.type === 'session') {
      header = ev as unknown as DshHeader;
      continue;
    }
    const d = (ev.data ?? {}) as Record<string, unknown>;
    switch (ev.type) {
      case 'session/title':
        title = typeof d.title === 'string' ? d.title : title;
        break;
      case 'turn/start': {
        const n = Number(d.turn ?? turns.size + 1);
        if (!turns.has(n)) turns.set(n, { turnId: `t${n}`, status: 'running', startedAt: ev.time ?? Date.now() });
        break;
      }
      case 'turn/end': {
        const n = Number(d.turn ?? turns.size);
        const reason = (d.reason ?? {}) as { kind?: string; error?: { code?: string; message?: string } };
        const kind = reason.kind ?? 'completed';
        const tr = turns.get(n) ?? { turnId: `t${n}`, status: 'running', startedAt: ev.time ?? Date.now() };
        tr.status = kind === 'completed' ? 'completed' : kind === 'error' ? 'error' : 'cancelled';
        tr.endedAt = ev.time;
        tr.errorCode = reason.error?.code;
        turns.set(n, tr);
        break;
      }
      case 'approval/asked':
        if (typeof d.id === 'string') pendingApprovals.add(d.id);
        break;
      case 'approval/decided':
        if (typeof d.id === 'string') pendingApprovals.delete(d.id);
        break;
      case 'assistant/message': {
        const t = typeof d.text === 'string' ? d.text : typeof d.content === 'string' ? d.content : undefined;
        if (t) lastAssistantText = t;
        break;
      }
      default:
        break;
    }
  }

  if (!header) return null;
  const turnList = [...turns.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  const running = turnList.length > 0 && turnList[turnList.length - 1]!.status === 'running';
  return {
    sessionId: header.id ?? path.basename(path.dirname(file)),
    cwd: header.cwd ?? '',
    title,
    createdAt: header.createdAt ?? 0,
    delegationDepth: header.delegationDepth ?? 0,
    turns: turnList,
    lastAssistantText,
    blocked: pendingApprovals.size > 0,
    running,
    v4: (header.version ?? 4) === 4,
  };
}

export function toRecord(tool: ToolName, p: ParsedSession): SessionRecord {
  const last = p.turns[p.turns.length - 1];
  const status: SessionRecord['status'] = p.blocked ? 'blocked' : p.running ? 'running'
    : last?.status === 'error' ? 'error'
    : last?.status === 'cancelled' ? 'cancelled'
    : last ? 'completed' : 'idle';
  const totalTokens = p.turns.reduce((s, t) => s + (t.tokens ?? 0), 0) || undefined;
  return {
    tool,
    projectId: p.cwd,
    projectName: lastPathSegment(p.cwd) || '未知项目',
    sessionId: p.sessionId,
    title: truncate(p.title, 80) ?? p.sessionId.replace(/^session-/, '').slice(0, 8),
    status,
    startedAt: p.createdAt,
    lastTurnAt: last?.endedAt ?? last?.startedAt ?? p.createdAt,
    turns: p.turns,
    totalTokens,
    lastAssistantExcerpt: truncate(p.lastAssistantText, 100),
    delegationDepth: p.delegationDepth,
  };
}

export class DshAdapter extends BaseAdapter {
  name: ToolName = 'dsh';
  private sessionsDir: string;
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private lastSessions = new Map<string, SessionRecord>();
  private pending = new Map<string, NodeJS.Timeout>();
  private destroyCb: ((d: SessionDelta) => void) | null = null;

  constructor(sessionsDir: string) {
    super();
    this.sessionsDir = sessionsDir;
  }

  async start(): Promise<void> {
    if (!fs.existsSync(this.sessionsDir)) {
      this.markErr(`目录不存在: ${this.sessionsDir}`);
      return;
    }
    this.watcher = chokidar.watch(this.sessionsDir, {
      ignoreInitial: true,
      persistent: true,
      depth: 4,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    });
    this.watcher.on('add', (f) => this.schedule(f));
    this.watcher.on('change', (f) => this.schedule(f));
    this.watcher.on('unlink', (f) => this.schedule(f, true));
    this.watcher.on('error', (e) => logger.debug('dsh watcher error', String(e)));
    this.markOk();
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }

  /** 文件级 delta 回调（watcher 触发的即时通知路径） */
  setDeltaConsumer(cb: (d: SessionDelta) => void): void {
    this.destroyCb = cb;
  }

  private schedule(file: string, removed = false): void {
    if (!file.endsWith('.zstd')) return;
    const old = this.pending.get(file);
    if (old) clearTimeout(old);
    this.pending.set(file, setTimeout(() => {
      this.pending.delete(file);
      void this.handleFile(file, removed);
    }, 300));
  }

  private handleFile(file: string, removed: boolean): void {
    try {
      const dir = path.dirname(file);
      const sessionIdFromPath = path.basename(dir).replace(/^session-/, '');
      if (removed) {
        const prev = this.lastSessions.get(sessionIdFromPath);
        if (prev) {
          prev.status = 'completed';
          this.destroyCb?.({ tool: this.name, sessionId: prev.sessionId, kind: 'session-status', from: 'running', to: 'completed', record: prev });
        }
        return;
      }
      const parsed = parseFile(file);
      if (!parsed || !parsed.v4) {
        logger.debug(`dsh 跳过非 v4 或空文件: ${file}`);
        return;
      }
      const record = toRecord(this.name, parsed);
      const prev = this.lastSessions.get(record.sessionId);

      // 产出 delta：回合完成 + 状态跳变（含 blocked）
      for (const t of record.turns) {
        const prevTurn = prev?.turns.find(x => x.turnId === t.turnId);
        if (t.status !== 'running' && (!prevTurn || prevTurn.status === 'running')) {
          const r = { ...record, turns: record.turns };
          this.lastSessions.set(record.sessionId, record);
          this.destroyCb?.({ tool: this.name, sessionId: record.sessionId, kind: 'turn-completed', from: 'running', to: t.status, record: r, turn: t });
        }
      }
      if (!prev || prev.status !== record.status) {
        this.lastSessions.set(record.sessionId, record);
        this.destroyCb?.({
          tool: this.name, sessionId: record.sessionId, kind: record.status === 'blocked' ? 'blocked' : 'session-status',
          from: prev?.status ?? 'idle', to: record.status, record,
        });
      } else {
        this.lastSessions.set(record.sessionId, record);
      }
      this.markOk();
    } catch (e) {
      this.markErr(String(e));
      logger.debug('dsh handleFile error', String(e));
    }
  }

  /** 启动全量扫描（建基线），staggered 防止 IO 峰值 */
  async initialScan(): Promise<void> {
    let files: string[] = [];
    try {
      files = await fs.promises.readdir(this.sessionsDir, { recursive: true }) as unknown as string[];
    } catch {
      return;
    }
    const zstd = files.filter(f => f.endsWith('.zstd')).slice(-120); // 最多处理最近 120 个
    for (const rel of zstd) {
      this.handleFile(path.join(this.sessionsDir, rel), false);
      await new Promise(r => setTimeout(r, 5));
    }
  }

  async poll(): Promise<SessionDelta[]> {
    // DSH 是事件驱动（watcher），poll 只做健康检查
    if (this.h.online) this.markOk();
    else await this.start();
    return [];
  }
}
