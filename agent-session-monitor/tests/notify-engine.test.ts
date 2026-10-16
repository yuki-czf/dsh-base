import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NotifyEngine, type Deliver } from '../src/notify/engine.js';
import { openDb, migrate } from '../src/db.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { NotifyEvent } from '../src/types.js';

function mkEvent(n: number, sessionId = 's1'): NotifyEvent {
  return {
    kind: 'turn', tool: 'dsh', sessionId,
    projectName: 'proj', title: `任务 ${n}`, status: 'completed',
    durationMs: 1000, tokens: 500, detailUrl: '/session/dsh/s1', excerpt: 'ok',
  };
}

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-notify-')); });
afterEach(() => { vi.useRealTimers(); });

describe('NotifyEngine', () => {
  it('同会话合并窗口内多回合 → 一张卡（items 合并）', async () => {
    vi.useFakeTimers();
    const db = openDb(dir); migrate(db);
    const delivered: NotifyEvent[][] = [];
    const deliver: Deliver = async (evs) => { delivered.push(evs); };
    const eng = new NotifyEngine(db, { mergeWindowMs: 1000, minGapMs: 0, maxRetries: 0, breakerAfterConsecutiveFails: 5, backlogDigestThreshold: 5 }, deliver);

    eng.submit(mkEvent(1));
    eng.submit(mkEvent(2));
    eng.submit(mkEvent(3));
    await vi.advanceTimersByTimeAsync(1100);
    // 合并后的 1 张卡（items=3）
    expect(delivered.length).toBe(1);
    expect(delivered[0]![0]!.items?.length).toBe(3);
    db.close();
  });

  it('连续交付失败达阈值 → 熔断，后续事件不再交付', async () => {
    const db = openDb(dir); migrate(db);
    let calls = 0;
    const deliver: Deliver = async () => { calls += 1; throw new Error('boom'); };
    const eng = new NotifyEngine(db, { mergeWindowMs: 0, minGapMs: 0, maxRetries: 0, breakerAfterConsecutiveFails: 3, backlogDigestThreshold: 5 }, deliver);

    eng.submit({ ...mkEvent(1), kind: 'crashed', status: 'crashed' });
    eng.submit({ ...mkEvent(2), kind: 'crashed', status: 'crashed' });
    eng.submit({ ...mkEvent(3), kind: 'crashed', status: 'crashed' });
    // drain 是异步链，等待微任务 flush
    await new Promise(r => setTimeout(r, 30));
    expect(eng.breakerActive).toBe(true);
    const callsAtBreaker = calls;
    eng.submit({ ...mkEvent(4), kind: 'crashed', status: 'crashed' });
    await new Promise(r => setTimeout(r, 30));
    expect(calls).toBe(callsAtBreaker); // 熔断后不再调用
    db.close();
  });

  it('积压 ≥ 阈值 → 合并 digest', async () => {
    const db = openDb(dir); migrate(db);
    const delivered: NotifyEvent[][] = [];
    const deliver: Deliver = async (evs) => { delivered.push(evs); };
    const eng = new NotifyEngine(db, { mergeWindowMs: 0, minGapMs: 0, maxRetries: 0, breakerAfterConsecutiveFails: 5, backlogDigestThreshold: 3 }, deliver);
    eng.flushBacklog([mkEvent(1), mkEvent(2), mkEvent(3), mkEvent(4)]);
    await new Promise(r => setTimeout(r, 30));
    expect(delivered.length).toBe(1);
    expect(delivered[0]![0]!.kind).toBe('digest');
    expect(delivered[0]![0]!.items?.length).toBe(4);
    db.close();
  });
});
