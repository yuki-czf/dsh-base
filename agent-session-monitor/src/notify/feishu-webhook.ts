import type { NotifyEvent } from '../types.js';
import { buildCard } from './card.js';
import { logger, safeUrl } from '../logger.js';

/** 飞书自定义机器人 webhook 交付（notify engine 的 Deliver 实现） */
export class FeishuWebhook {
  private url: string | undefined;

  constructor(webhookUrl: string | undefined) {
    this.url = webhookUrl;
  }

  get configured(): boolean {
    return !!this.url;
  }

  async deliver(events: NotifyEvent[]): Promise<void> {
    if (!this.url) throw new Error('FEISHU_WEBHOOK_URL 未配置');
    for (const ev of events) {
      const body = buildCard(ev);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { code?: number; StatusCode?: number; msg?: string };
        const code = json.code ?? json.StatusCode ?? 0;
        if (code !== 0) throw new Error(`feishu code=${code} msg=${json.msg ?? ''}`);
        logger.info(`已推送飞书卡片: ${ev.kind}/${ev.status} → ${ev.projectName}/${ev.title}`);
      } finally {
        clearTimeout(t);
      }
    }
  }
}
