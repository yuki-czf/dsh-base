import type { Adapter, AdapterHealth, ToolName } from '../types.js';

export abstract class BaseAdapter implements Adapter {
  abstract name: ToolName;
  protected h: AdapterHealth = { online: false, lastPollAt: 0 };
  protected failCount = 0;

  health(): AdapterHealth {
    return { ...this.h };
  }

  protected markOk(): void {
    this.failCount = 0;
    this.h = { online: true, lastPollAt: Date.now() };
  }

  protected markErr(err: string): void {
    this.failCount += 1;
    this.h = { online: false, lastPollAt: Date.now(), lastError: err };
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract poll(): Promise<import('../types.js').SessionDelta[]>;
}

export function truncate(s: string | undefined | null, n: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

export function lastPathSegment(p: string | undefined | null): string {
  if (!p) return '';
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const seg = norm.split('/').pop() ?? '';
  return seg;
}
