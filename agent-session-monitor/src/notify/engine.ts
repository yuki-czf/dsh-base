import type { NotifyEvent } from '../types.js';
import type { DB } from '../db.js';
import { logger } from '../logger.js';

export interface Deliver {
  (events: NotifyEvent[]): Promise<void>;
}

interface MergedItem {
  head: NotifyEvent;          // 窗口内第一条（决定主标题）
  items: NotifyEvent[];       // 全部条目（含第一条）
  timer: NodeJS.Timeout;
}

/**
 * 通知管线：合并窗口 → 队列（限流间隔）→ 交付 → 重试/熔断
 * 宕机积压：flushBacklog() 合并成 digest
 */
export class NotifyEngine {
  private deliverFn: Deliver;
  private cfg: { mergeWindowMs: number; minGapMs: number; maxRetries: number; breakerAfterConsecutiveFails: number; backlogDigestThreshold: number };
  private db: DB;
  private merging = new Map<string, MergedItem>(); // key = tool/sessionId
  private queue: NotifyEvent[] = [];
  private draining = false;
  private lastSentAt = 0;
  private consecutiveFails = 0;
  private breakerOpenState = false;

  constructor(db: DB, cfg: NotifyEngine['cfg'], deliver: Deliver) {
    this.db = db;
    this.cfg = cfg;
    this.deliverFn = deliver;
  }

  get breakerActive(): boolean {
    return this.breakerOpenState;
  }

  /** 聚合器入口：进合并窗口，窗口到期后成批交付 */
  submit(ev: NotifyEvent): void {
    if (this.breakerOpenState) {
      logger.warn('通知熔断中，丢弃本次推送（面板可见示警）');
      this.logNotify(ev, false, 'breaker open');
      return;
    }
    // 异常类（stuck/crashed/digest）不走合并窗口，直接入队
    if (ev.kind !== 'turn') {
      this.enqueue(ev);
      return;
    }
    const key = `${ev.tool}/${ev.sessionId}`;
    const cur = this.merging.get(key);
    if (cur) {
      cur.items.push(ev);
      cur.head.excerpt = ev.excerpt ?? cur.head.excerpt;
      cur.head.tokens = ev.tokens ?? cur.head.tokens;
      return;
    }
    const item: MergedItem = { head: ev, items: [ev], timer: null as unknown as NodeJS.Timeout };
    item.timer = setTimeout(() => {
      this.merging.delete(key);
      // 窗口内多条回合 → 合成一张卡（items 列表）
      const merged: NotifyEvent = item.items.length > 1
        ? { ...item.head, items: [...item.items], title: item.head.title }
        : item.head;
      this.enqueue(merged);
    }, this.cfg.mergeWindowMs);
    this.merging.set(key, item);
  }

  private enqueue(ev: NotifyEvent): void {
    this.queue.push(ev);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const ev = this.queue.shift()!;
        const gap = this.cfg.minGapMs - (Date.now() - this.lastSentAt);
        if (gap > 0) await sleep(gap);
        await this.deliverWithRetry([ev]);
        this.lastSentAt = Date.now();
      }
    } finally {
      this.draining = false;
    }
  }

  private async deliverWithRetry(batch: NotifyEvent[]): Promise<void> {
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      try {
        await this.deliverFn(batch);
        this.consecutiveFails = 0;
        for (const ev of batch) this.logNotify(ev, true);
        return;
      } catch (e) {
        this.consecutiveFails += 1;
        logger.warn(`通知交付失败（第 ${attempt + 1} 次）: ${String(e)}`);
        if (this.consecutiveFails >= this.cfg.breakerAfterConsecutiveFails) {
          this.breakerOpenState = true;
          logger.error(`连续 ${this.consecutiveFails} 次交付失败，熔断开启（不再发飞书，面板示警）`);
          for (const ev of batch) this.logNotify(ev, false, 'breaker');
          return;
        }
        if (attempt < this.cfg.maxRetries) await sleep(Math.min(30_000, 1000 * 2 ** attempt));
      }
    }
    for (const ev of batch) this.logNotify(ev, false, 'max retries');
  }

  /** 启动时处理积压：>= threshold 合并 digest，否则逐条 */
  flushBacklog(events: NotifyEvent[]): void {
    if (events.length === 0) return;
    if (events.length >= this.cfg.backlogDigestThreshold) {
      this.enqueue({
        kind: 'digest',
        tool: events[0]!.tool,
        sessionId: 'digest',
        projectName: '多项目',
        title: `离线期间完成 ${events.length} 项`,
        status: 'digest',
        detailUrl: this.baseUrl,
        items: events,
      });
    } else {
      for (const ev of events) this.enqueue(ev);
    }
  }

  baseUrl = '/';

  private logNotify(ev: NotifyEvent, ok: boolean, error?: string): void {
    try {
      this.db.prepare('INSERT INTO notify_log(created_at, kind, payload, ok, error) VALUES (?, ?, ?, ?, ?)')
        .run(Date.now(), ev.kind, JSON.stringify({ ...ev, excerpt: ev.excerpt?.slice(0, 50), detailUrl: undefined }), ok ? 1 : 0, error ?? null);
    } catch { /* ignore */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
