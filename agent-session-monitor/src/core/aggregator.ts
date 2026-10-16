import type { SessionDelta, SessionRecord, TurnRecord, ToolName } from '../types.js';
import type { DB } from '../db.js';
import { logger } from '../logger.js';

export interface NotifySink {
  (ev: import('../types.js').NotifyEvent): void;
}

interface MonotonicTracker { [key: string]: number }

function mono(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

export class Aggregator {
  private sink: NotifySink;
  private db: DB;
  private stuckAfterMs: number;
  private silenceUntilMono: number;
  /** 正在运行回合的单调钟起点 */
  private runningTurns = new Map<string, number>();
  /** 已告警 stuck 的回合（本次进程内） */
  private stuckAlerted = new Set<string>();

  constructor(db: DB, sink: NotifySink, opts: { stuckAfterMs: number; silenceMs: number }) {
    this.db = db;
    this.sink = sink;
    this.stuckAfterMs = opts.stuckAfterMs;
    this.silenceUntilMono = mono() + opts.silenceMs;
  }

  private persistSession(r: SessionRecord): void {
    this.db.prepare(`
      INSERT INTO sessions(tool, session_id, project_id, project_name, title, status, started_at, last_turn_at, total_tokens, model, last_assistant_excerpt, delegation_depth, updated_at)
      VALUES (@tool, @sessionId, @projectId, @projectName, @title, @status, @startedAt, @lastTurnAt, @totalTokens, @model, @lastAssistantExcerpt, @delegationDepth, @updatedAt)
      ON CONFLICT(tool, session_id) DO UPDATE SET
        project_id=excluded.project_id, project_name=excluded.project_name, title=excluded.title,
        status=excluded.status, last_turn_at=excluded.last_turn_at, total_tokens=excluded.total_tokens,
        model=excluded.model, last_assistant_excerpt=excluded.last_assistant_excerpt,
        delegation_depth=excluded.delegation_depth, updated_at=excluded.updated_at
    `).run({
      tool: r.tool, sessionId: r.sessionId, projectId: r.projectId ?? '', projectName: r.projectName,
      title: r.title, status: r.status, startedAt: r.startedAt, lastTurnAt: r.lastTurnAt,
      totalTokens: r.totalTokens ?? null, model: r.model ?? null,
      lastAssistantExcerpt: r.lastAssistantExcerpt ?? null, delegationDepth: r.delegationDepth ?? null,
      updatedAt: Date.now(),
    });
  }

  private persistTurn(t: TurnRecord, tool: ToolName, sessionId: string): void {
    this.db.prepare(`
      INSERT INTO turns(tool, session_id, turn_id, status, started_at, ended_at, tokens, model, error_code, notified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(tool, session_id, turn_id) DO UPDATE SET
        status=excluded.status, ended_at=excluded.ended_at, tokens=excluded.tokens,
        error_code=excluded.error_code
    `).run(tool, sessionId, t.turnId, t.status, t.startedAt, t.endedAt ?? null, t.tokens ?? null, t.model ?? null, t.errorCode ?? null);
  }

  private alreadyNotified(tool: ToolName, sessionId: string, transition: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM dedupe WHERE tool=? AND session_id=? AND transition=?')
      .get(tool, sessionId, transition);
    return !!row;
  }

  private markNotified(tool: ToolName, sessionId: string, transition: string): void {
    this.db.prepare('INSERT OR IGNORE INTO dedupe(tool, session_id, transition, notified_at) VALUES (?, ?, ?, ?)')
      .run(tool, sessionId, transition, Date.now());
  }

  ingest(deltas: SessionDelta[]): void {
    const silent = mono() < this.silenceUntilMono;
    for (const d of deltas) {
      this.persistSession(d.record);
      if (d.turn) this.persistTurn(d.turn, d.tool, d.sessionId);

      if (silent) {
        // 静默期基线：已完成的回合直接标记已通知，避免下次重启误判为离线积压
        if (d.turn && d.turn.status !== 'running') {
          this.markNotified(d.tool, d.sessionId, `turn:${d.turn.turnId}:${d.to}`);
          this.db.prepare('UPDATE turns SET notified = 1 WHERE tool=? AND session_id=? AND turn_id=?')
            .run(d.tool, d.sessionId, d.turn.turnId);
        }
        continue;
      }

      const turnKey = `${d.tool}/${d.sessionId}/${d.turn?.turnId ?? ''}`;

      if (d.kind === 'turn-completed' && d.turn) {
        this.runningTurns.delete(turnKey);
        this.stuckAlerted.delete(turnKey);
        const transition = `turn:${d.turn.turnId}:${d.to}`;
        if (this.alreadyNotified(d.tool, d.sessionId, transition)) continue;
        this.markNotified(d.tool, d.sessionId, transition);
        this.db.prepare('UPDATE turns SET notified = 1 WHERE tool=? AND session_id=? AND turn_id=?')
          .run(d.tool, d.sessionId, d.turn.turnId);
        this.sink({
          kind: 'turn',
          tool: d.tool,
          sessionId: d.sessionId,
          projectName: d.record.projectName,
          title: d.record.title,
          status: d.to,
          durationMs: d.turn.endedAt && d.turn.startedAt ? Math.max(0, d.turn.endedAt - d.turn.startedAt) : undefined,
          tokens: d.turn.tokens ?? d.record.totalTokens,
          model: d.turn.model ?? d.record.model,
          errorCode: d.turn.errorCode,
          excerpt: d.record.lastAssistantExcerpt,
          detailUrl: `/session/${d.tool}/${encodeURIComponent(d.sessionId)}`,
        });
      } else if (d.kind === 'blocked' && d.to === 'blocked') {
        const transition = 'blocked';
        if (this.alreadyNotified(d.tool, d.sessionId, transition)) continue;
        this.markNotified(d.tool, d.sessionId, transition);
        // blocked 只在面板标橙，不发飞书（避免打扰），记录日志
        logger.info(`[blocked] ${d.tool}/${d.record.projectName}: ${d.record.title}`);
      } else if (d.kind === 'session-status' && d.to === 'running') {
        this.runningTurns.set(`${d.tool}/${d.sessionId}`, mono());
      }
    }
  }

  /** 周期性 stuck / crashed 扫描 */
  sweep(runningSessions: Array<{ tool: ToolName; sessionId: string; projectName: string; title: string; startedAt: number; processAlive: boolean; model?: string; excerpt?: string; lastTurnAt: number }>): void {
    if (mono() < this.silenceUntilMono) return;
    const now = mono();
    for (const s of runningSessions) {
      const key = `${s.tool}/${s.sessionId}`;
      const startMono = this.runningTurns.get(key);
      if (startMono === undefined) {
        this.runningTurns.set(key, now);
        continue;
      }
      const idleFor = now - startMono;
      // stuck：无进展超阈值（只报一次）
      if (idleFor > this.stuckAfterMs && !this.stuckAlerted.has(key) && s.processAlive) {
        this.stuckAlerted.add(key);
        const transition = `stuck:${s.lastTurnAt}`;
        if (this.alreadyNotified(s.tool, s.sessionId, transition)) continue;
        this.markNotified(s.tool, s.sessionId, transition);
        this.sink({
          kind: 'stuck', tool: s.tool, sessionId: s.sessionId,
          projectName: s.projectName, title: s.title, status: 'stuck',
          durationMs: idleFor, model: s.model, excerpt: s.excerpt,
          detailUrl: `/session/${s.tool}/${encodeURIComponent(s.sessionId)}`,
        });
      }
      // crashed：进程没了但会话还标着 running
      if (!s.processAlive) {
        const transition = `crashed:${s.lastTurnAt}`;
        if (this.alreadyNotified(s.tool, s.sessionId, transition)) continue;
        this.markNotified(s.tool, s.sessionId, transition);
        this.sink({
          kind: 'crashed', tool: s.tool, sessionId: s.sessionId,
          projectName: s.projectName, title: s.title, status: 'crashed',
          durationMs: idleFor, model: s.model, excerpt: s.excerpt,
          detailUrl: `/session/${s.tool}/${encodeURIComponent(s.sessionId)}`,
        });
      }
    }
  }
}
