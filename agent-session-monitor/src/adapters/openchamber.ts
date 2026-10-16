import type { SessionDelta, SessionRecord, ToolName, TurnRecord } from '../types.js';
import { BaseAdapter, lastPathSegment, truncate } from './base.js';
import { logger, safeUrl } from '../logger.js';

interface OcStatusEntry { status: string; lastUpdateAt: number; metadata?: Record<string, unknown> }
interface OcDetail {
  id: string; projectID?: string; agent?: string;
  model?: { id?: string; providerID?: string; variant?: string };
  cost?: number;
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };
  outcome?: string;
  time?: { created?: number; updated?: number; idle?: number };
  title?: string;
  metadata?: { openchamber?: { assist?: { recap?: string } } };
  location?: { directory?: string };
}

function tokensTotal(t: OcDetail['tokens']): number | undefined {
  if (!t) return undefined;
  const sum = (t.input ?? 0) + (t.output ?? 0) + (t.reasoning ?? 0) + (t.cache?.read ?? 0) + (t.cache?.write ?? 0);
  return sum > 0 ? sum : undefined;
}

export class OpenChamberAdapter extends BaseAdapter {
  name: ToolName = 'openchamber';
  private base: string;
  private port: number;
  private lastSessions = new Map<string, { status: string; lastUpdateAt: number }>();
  /** 详情节流：每轮每会话最多拉一次详情 */
  private lastDetailFetch = new Map<string, number>();

  constructor(port: number) {
    super();
    this.port = port;
    this.base = `http://127.0.0.1:${port}`;
  }

  async start(): Promise<void> { /* HTTP 轮询无启动动作 */ }
  async stop(): Promise<void> { /* 无 */ }

  private async getJson<T>(p: string, timeoutMs = 5000): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.base}${p}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${p}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  }

  async poll(): Promise<SessionDelta[]> {
    try {
      const st = await this.getJson<{ sessions: Record<string, OcStatusEntry> }>('/api/sessions/status');
      let active: Record<string, { type: string }> = {};
      try {
        const a = await this.getJson<{ data: Record<string, { type: string }> }>('/api/session/active');
        active = a.data ?? {};
      } catch { /* active 可选 */ }
      this.markOk();

      const deltas: SessionDelta[] = [];
      const seen = new Set<string>();
      for (const [id, info] of Object.entries(st.sessions ?? {})) {
        seen.add(id);
        const prev = this.lastSessions.get(id);
        const running = active[id]?.type === 'running' || info.status === 'running';
        const changed = !prev || prev.status !== (running ? 'running' : info.status) || prev.lastUpdateAt !== info.lastUpdateAt;

        if (!changed) continue;

        // 详情节流：同一秒内不重复拉；但 running→结束转变必须拉详情（outcome 判定依赖它）
        const now = Date.now();
        const lastFetch = this.lastDetailFetch.get(id) ?? 0;
        if (now - lastFetch < 2000 && prev && prev.status !== 'running') continue;
        this.lastDetailFetch.set(id, now);

        let detail: OcDetail | null = null;
        try { detail = (await this.getJson<{ data: OcDetail }>(`/api/session/${id}`)).data; }
        catch (e) { logger.debug(`openchamber detail fail ${id}`, String(e)); }

        const projectDir = detail?.location?.directory;
        const projectName = lastPathSegment(projectDir) || '未知项目';
        const prevStatus = prev?.status ?? 'idle';
        const newStatus = running ? 'running' : (info.status === 'idle' ? 'idle' : info.status);

        const record: SessionRecord = {
          tool: 'openchamber',
          projectId: detail?.projectID ?? '',
          projectName,
          sessionId: id,
          title: truncate(detail?.title, 80) ?? id.slice(0, 8),
          status: newStatus === 'running' ? 'running' : (newStatus === 'idle' ? 'idle' : 'idle'),
          startedAt: detail?.time?.created ?? info.lastUpdateAt,
          lastTurnAt: detail?.time?.updated ?? info.lastUpdateAt,
          turns: [],
          totalTokens: tokensTotal(detail?.tokens),
          model: detail?.model ? `${detail.model.id ?? ''}${detail.model.variant ? '#' + detail.model.variant : ''}` : undefined,
          lastAssistantExcerpt: truncate(detail?.metadata?.openchamber?.assist?.recap, 100),
        };

        // 首见会话：发一条基线 delta（面板可见；静默期由聚合器吸收通知）
        if (!prev) {
          const record: SessionRecord = {
            tool: this.name,
            projectId: detail?.projectID ?? '',
            projectName: lastPathSegment(detail?.location?.directory) || '未知项目',
            sessionId: id,
            title: truncate(detail?.title, 80) ?? id.slice(0, 8),
            status: running ? 'running' : 'idle',
            startedAt: detail?.time?.created ?? info.lastUpdateAt,
            lastTurnAt: detail?.time?.updated ?? info.lastUpdateAt,
            turns: [],
            totalTokens: tokensTotal(detail?.tokens),
            model: detail?.model ? `${detail.model.id ?? ''}${detail.model.variant ? '#' + detail.model.variant : ''}` : undefined,
            lastAssistantExcerpt: truncate(detail?.metadata?.openchamber?.assist?.recap, 100),
          };
          this.lastSessions.set(id, { status: running ? 'running' : info.status, lastUpdateAt: info.lastUpdateAt });
          deltas.push({ tool: this.name, sessionId: id, kind: 'session-status', from: 'offline', to: record.status, record });
          continue;
        }

        // running → idle 转变：合成回合完成事件（outcome 判成败）
        if (prev && prevStatus === 'running' && !running && detail) {
          const outcome = detail.outcome ?? 'succeeded';
          const status = outcome === 'succeeded' ? 'completed' : (outcome === 'cancelled' ? 'cancelled' : 'error');
          const duration = Math.max(0, (detail.time?.updated ?? now) - (prev.lastUpdateAt || (detail.time?.created ?? now)));
          const turn: TurnRecord = {
            turnId: `oc-${detail.time?.updated ?? now}`,
            status,
            startedAt: prev.lastUpdateAt,
            endedAt: detail.time?.updated ?? now,
            tokens: record.totalTokens,
            model: record.model,
            errorCode: status === 'error' ? outcome : undefined,
          };
          record.turns = [turn];
          deltas.push({ tool: this.name, sessionId: id, kind: 'turn-completed', from: 'running', to: status, record, turn });
        } else if (prev && prevStatus !== newStatus) {
          deltas.push({ tool: this.name, sessionId: id, kind: 'session-status', from: prevStatus, to: newStatus, record });
        }

        this.lastSessions.set(id, { status: newStatus, lastUpdateAt: info.lastUpdateAt });
      }

      // 清理消失的会话状态
      for (const id of [...this.lastSessions.keys()]) {
        if (!seen.has(id)) this.lastSessions.delete(id);
      }
      return deltas;
    } catch (e) {
      this.markErr(String(e));
      if (this.failCount === 5) logger.warn(`openchamber 连续 5 次失败，标记离线（端口 ${this.port}，${safeUrl(this.base)}）`);
      return [];
    }
  }
}
