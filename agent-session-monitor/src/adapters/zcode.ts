import type { SessionDelta, SessionRecord, ToolName, TurnRecord } from '../types.js';
import { BaseAdapter, lastPathSegment, truncate } from './base.js';
import { openReadonlySqlite } from '../db.js';
import type { DB } from '../db.js';
import { logger } from '../logger.js';

interface RawTurn {
  session_id: string; turn_id: string; status: string; started_at: number;
  completed_at: number | null; duration_ms: number | null;
  input_tokens: number; output_tokens: number; computed_total_tokens: number;
  error_code: string | null; error_type: string | null; cancelled_by_user: number;
}
interface RawSession { id: string; project_id: string | null; directory: string; title: string; time_created: number; time_updated: number; task_type: string }

function mapTurn(t: RawTurn): TurnRecord {
  const status = t.status === 'running' ? 'running'
    : t.status === 'error' ? 'error'
    : t.status === 'cancelled' || t.cancelled_by_user ? 'cancelled'
    : 'completed';
  return {
    turnId: t.turn_id,
    status,
    startedAt: t.started_at,
    endedAt: t.completed_at ?? undefined,
    tokens: t.computed_total_tokens || undefined,
    errorCode: t.error_code ?? t.error_type ?? undefined,
  };
}

export class ZCodeAdapter extends BaseAdapter {
  name: ToolName = 'zcode';
  private dbPath: string;
  private db: DB | null = null;
  private watermark = 0;
  private runningTurns = new Map<string, number>(); // `${sid}/${tid}` -> startedAt
  private sessionCache = new Map<string, SessionRecord>();

  constructor(dbPath: string) {
    super();
    this.dbPath = dbPath;
  }

  async start(): Promise<void> {
    try {
      this.db = openReadonlySqlite(this.dbPath);
      this.markOk();
    } catch (e) {
      this.markErr(String(e));
      logger.warn(`zcode 库打开失败（只读）: ${String(e)}`);
    }
  }

  async stop(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private getSession(sid: string): RawSession | undefined {
    if (!this.db) return undefined;
    return this.db.prepare('SELECT id, project_id, directory, title, time_created, time_updated, task_type FROM session WHERE id = ?').get(sid) as RawSession | undefined;
  }

  private lastAssistant(sid: string): string | undefined {
    if (!this.db) return undefined;
    try {
      const rows = this.db.prepare(
        'SELECT data FROM message WHERE session_id = ? ORDER BY sequence DESC LIMIT 8'
      ).all(sid) as { data: string }[];
      for (const r of rows) {
        try {
          const obj = JSON.parse(r.data) as { role?: string; text?: string; parts?: Array<{ type?: string; text?: string }> };
          const role = obj.role;
          const text = obj.text ?? obj.parts?.filter(p => p.type === 'text').map(p => p.text).join(' ');
          if (role === 'assistant' && text) return truncate(text, 100);
        } catch { continue; }
      }
    } catch { /* ignore */ }
    return undefined;
  }

  async poll(): Promise<SessionDelta[]> {
    if (!this.db) {
      await this.start();
      if (!this.db) return [];
    }
    try {
      const deltas: SessionDelta[] = [];
      const db = this.db;

      const newTurns = db.prepare(
        'SELECT * FROM turn_usage WHERE started_at > ? ORDER BY started_at ASC LIMIT 300'
      ).all(this.watermark) as RawTurn[];

      const rechecked: RawTurn[] = [];
      const stmt = db.prepare('SELECT * FROM turn_usage WHERE session_id = ? AND turn_id = ?');
      for (const key of [...this.runningTurns.keys()]) {
        const [sid, tid] = key.split('/');
        const row = stmt.get(sid!, tid!) as RawTurn | undefined;
        if (!row) { this.runningTurns.delete(key); continue; }
        if (row.status !== 'running') { rechecked.push(row); this.runningTurns.delete(key); }
      }

      const process = (t: RawTurn, isNew: boolean) => {
        if (t.status === 'running') this.runningTurns.set(`${t.session_id}/${t.turn_id}`, t.started_at);
        if (isNew) this.watermark = Math.max(this.watermark, t.started_at);
        if (t.session_id.startsWith('sess_subagent')) return; // subagent 不单独通知，但聚合到主会话由 zcode 自身处理
        const sess = this.getSession(t.session_id);
        if (!sess) return;
        const mapped = mapTurn(t);
        const prev = this.sessionCache.get(t.session_id);

        const makeRecord = (status: SessionRecord['status'], lastTurnAt: number): SessionRecord => ({
          tool: this.name,
          projectId: sess.project_id ?? '',
          projectName: lastPathSegment(sess.directory) || '未知项目',
          sessionId: sess.id,
          title: truncate(sess.title, 80) ?? sess.id.slice(0, 8),
          status,
          startedAt: sess.time_created,
          lastTurnAt,
          turns: [mapped],
          model: undefined,
          lastAssistantExcerpt: mapped.status !== 'running' ? this.lastAssistant(sess.id) : undefined,
        });

        if (mapped.status !== 'running') {
          const record = makeRecord(mapped.status === 'error' ? 'error' : mapped.status === 'cancelled' ? 'cancelled' : 'completed', mapped.endedAt ?? mapped.startedAt);
          this.sessionCache.set(t.session_id, record);
          deltas.push({ tool: this.name, sessionId: t.session_id, kind: 'turn-completed', from: 'running', to: mapped.status, record, turn: mapped });
        } else if (!prev || prev.status !== 'running') {
          const record = makeRecord('running', t.started_at);
          this.sessionCache.set(t.session_id, record);
          deltas.push({ tool: this.name, sessionId: t.session_id, kind: 'session-status', from: prev?.status ?? 'idle', to: 'running', record });
        } else {
          prev.lastTurnAt = t.started_at;
        }
      };

      for (const t of rechecked) process(t, false);
      for (const t of newTurns) process(t, true);

      this.markOk();
      return deltas;
    } catch (e) {
      this.markErr(String(e));
      return [];
    }
  }
}
