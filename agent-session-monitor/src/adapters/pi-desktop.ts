import type { SessionDelta, SessionRecord, ToolName, TurnRecord } from '../types.js';
import { BaseAdapter, lastPathSegment, truncate } from './base.js';
import { openReadonlySqlite } from '../db.js';
import type { DB } from '../db.js';
import { logger } from '../logger.js';

interface RawTurn {
  id: string; session_id: string; status: string; model_id: string | null;
  error_code: string | null; input_tokens: number; output_tokens: number;
  started_at: number; ended_at: number | null;
}
interface RawSession { id: string; title: string; project_id: number | null; model_id: string | null; created_at: number; updated_at: number }
interface RawProject { id: number; path: string; name: string }

function mapTurn(t: RawTurn): TurnRecord {
  const status = t.status === 'running' ? 'running'
    : t.status === 'error' ? 'error'
    : t.status === 'cancelled' ? 'cancelled'
    : 'completed';
  return {
    turnId: t.id,
    status,
    startedAt: t.started_at,
    endedAt: t.ended_at ?? undefined,
    tokens: (t.input_tokens ?? 0) + (t.output_tokens ?? 0) || undefined,
    model: t.model_id ?? undefined,
    errorCode: t.error_code ?? undefined,
  };
}

export class PiDesktopAdapter extends BaseAdapter {
  name: ToolName = 'pi-desktop';
  private dbPath: string;
  private db: DB | null = null;
  private projects = new Map<number, RawProject>();
  private watermark = 0;
  /** 待复查的 running 回合：key = `${session_id}/${turn_id}` */
  private runningTurns = new Map<string, number>(); // key -> startedAt
  private sessionCache = new Map<string, SessionRecord>();

  constructor(dbPath: string) {
    super();
    this.dbPath = dbPath;
  }

  async start(): Promise<void> {
    try {
      this.db = openReadonlySqlite(this.dbPath);
      const projects = this.db.prepare('SELECT id, path, name FROM projects').all() as RawProject[];
      for (const p of projects) this.projects.set(p.id, p);
      this.markOk();
    } catch (e) {
      this.markErr(String(e));
      logger.warn(`pi-desktop 库打开失败（只读）: ${String(e)}`);
    }
  }

  async stop(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private projectName(pid: number | null): string {
    if (pid == null) return '未知项目';
    const p = this.projects.get(pid);
    return p?.name || lastPathSegment(p?.path) || '未知项目';
  }

  private lastAssistant(sessionId: string): string | undefined {
    if (!this.db) return undefined;
    try {
      const row = this.db.prepare(
        "SELECT text FROM messages WHERE session_id = ? AND role = 'assistant' AND is_error = 0 AND text IS NOT NULL ORDER BY seq DESC LIMIT 1"
      ).get(sessionId) as { text: string } | undefined;
      return truncate(row?.text, 100);
    } catch { return undefined; }
  }

  private buildRecord(sess: RawSession, status: string, lastTurnAt: number): SessionRecord {
    return {
      tool: this.name,
      projectId: String(sess.project_id ?? ''),
      projectName: this.projectName(sess.project_id),
      sessionId: sess.id,
      title: truncate(sess.title, 80) ?? sess.id.slice(0, 8),
      status: status as SessionRecord['status'],
      startedAt: sess.created_at,
      lastTurnAt,
      turns: [],
      model: sess.model_id ?? undefined,
      lastAssistantExcerpt: this.lastAssistant(sess.id),
    };
  }

  async poll(): Promise<SessionDelta[]> {
    if (!this.db) {
      // 尝试重连（工具可能刚启动）
      await this.start();
      if (!this.db) return [];
    }
    try {
      const deltas: SessionDelta[] = [];
      const db = this.db;

      // 1) 水位增量：新回合
      const newTurns = db.prepare(
        'SELECT * FROM turns WHERE started_at > ? ORDER BY started_at ASC LIMIT 500'
      ).all(this.watermark) as RawTurn[];

      // 2) 复查已知 running 回合是否完成
      const rechecked: RawTurn[] = [];
      const stmtById = db.prepare('SELECT * FROM turns WHERE session_id = ? AND id = ?');
      for (const key of [...this.runningTurns.keys()]) {
        const [sid, tid] = key.split('/');
        const row = stmtById.get(sid!, tid!) as RawTurn | undefined;
        if (!row) { this.runningTurns.delete(key); continue; }
        if (row.status !== 'running') { rechecked.push(row); this.runningTurns.delete(key); }
      }

      const process = (t: RawTurn, isNew: boolean) => {
        if (t.status === 'running') {
          this.runningTurns.set(`${t.session_id}/${t.id}`, t.started_at);
        }
        if (isNew) this.watermark = Math.max(this.watermark, t.started_at);
        const sess = db.prepare('SELECT * FROM sessions WHERE id = ?').get(t.session_id) as RawSession | undefined;
        if (!sess) return;
        const mapped = mapTurn(t);
        const prev = this.sessionCache.get(t.session_id);

        if (mapped.status !== 'running') {
          const record = this.buildRecord(sess, mapped.status === 'error' ? 'error' : mapped.status === 'cancelled' ? 'cancelled' : 'completed', mapped.endedAt ?? mapped.startedAt);
          record.turns = [mapped];
          this.sessionCache.set(t.session_id, record);
          deltas.push({
            tool: this.name, sessionId: t.session_id, kind: 'turn-completed',
            from: 'running', to: mapped.status, record, turn: mapped,
          });
        } else if (!prev || prev.status !== 'running') {
          const record = this.buildRecord(sess, 'running', t.started_at);
          record.turns = [mapped];
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
