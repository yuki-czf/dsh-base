import { describe, it, expect } from 'vitest';
import { Aggregator } from '../src/core/aggregator.js';
import { openDb, migrate } from '../src/db.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { SessionDelta, SessionRecord, NotifyEvent } from '../src/types.js';

function mkRecord(status: SessionRecord['status']): SessionRecord {
  return {
    tool: 'dsh', projectId: 'p', projectName: 'proj', sessionId: 's1',
    title: '任务', status, startedAt: 1, lastTurnAt: 2, turns: [],
  };
}

function mkDelta(turn: SessionDelta['turn']): SessionDelta {
  return {
    tool: 'dsh', sessionId: 's1', kind: 'turn-completed',
    from: 'running', to: turn!.status, record: mkRecord(turn!.status), turn,
  };
}

describe('Aggregator', () => {
  it('静默期只建基线不出事件', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-agg-'));
    const db = openDb(dir); migrate(db);
    const events: NotifyEvent[] = [];
    const agg = new Aggregator(db, (ev) => events.push(ev), { stuckAfterMs: 60_000, silenceMs: 600_000 });
    agg.ingest([mkDelta({ turnId: 't1', status: 'completed', startedAt: 1, endedAt: 2 })]);
    expect(events.length).toBe(0);
    const row = db.prepare(`SELECT status FROM sessions WHERE tool='dsh' AND session_id='s1'`).get() as { status: string };
    expect(row.status).toBe('completed');
    db.close();
  });

  it('同一回合跳变去重（重放不重复通知）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-agg-'));
    const db = openDb(dir); migrate(db);
    const events: NotifyEvent[] = [];
    const agg = new Aggregator(db, (ev) => events.push(ev), { stuckAfterMs: 60_000, silenceMs: 0 });
    const d = mkDelta({ turnId: 't1', status: 'completed', startedAt: 1, endedAt: 2 });
    agg.ingest([d]);
    agg.ingest([{ ...d }]);
    expect(events.length).toBe(1);
    db.close();
  });

  it('通知事件字段完整（项目/标题/耗时/token/detailUrl）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-agg-'));
    const db = openDb(dir); migrate(db);
    const events: NotifyEvent[] = [];
    const agg = new Aggregator(db, (ev) => events.push(ev), { stuckAfterMs: 60_000, silenceMs: 0 });
    agg.ingest([mkDelta({ turnId: 't9', status: 'error', startedAt: 10, endedAt: 120, tokens: 77, errorCode: 'X1' })]);
    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(ev.projectName).toBe('proj');
    expect(ev.title).toBe('任务');
    expect(ev.status).toBe('error');
    expect(ev.durationMs).toBe(110);
    expect(ev.tokens).toBe(77);
    expect(ev.errorCode).toBe('X1');
    expect(ev.detailUrl).toBe('/session/dsh/s1');
    db.close();
  });
});
