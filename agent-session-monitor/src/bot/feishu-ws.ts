import * as lark from '@larksuiteoapi/node-sdk';
import { logger } from '../logger.js';
import { buildStatusCard, buildHelpCard, type StatusRow } from '../notify/card.js';

export interface BotDeps {
  appId?: string;
  appSecret?: string;
  allowedUserIds: string[];
  getStatusRows: () => StatusRow[];
  domain?: lark.Domain;
}

/** 飞书长连接查询机器人。凭据缺失时返回 null（模块禁用，不影响其他功能）。 */
export async function startQueryBot(deps: BotDeps): Promise<{ stop: () => Promise<void> } | null> {
  if (!deps.appId || !deps.appSecret) {
    logger.info('query-bot 已禁用：缺少 FEISHU_APP_ID / FEISHU_APP_SECRET（webhook 通知不受影响）');
    return null;
  }
  const client = new lark.Client({ appId: deps.appId, appSecret: deps.appSecret, domain: deps.domain ?? lark.Domain.Feishu });

  const wsClient = new lark.WSClient({ appId: deps.appId, appSecret: deps.appSecret, domain: deps.domain ?? lark.Domain.Feishu, loggerLevel: lark.LoggerLevel.warn });

  const eventDispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      try {
        const msg = data?.message;
        const openId = (data?.sender?.sender_id?.open_id ?? '').toString();
        if (deps.allowedUserIds.length > 0 && !deps.allowedUserIds.includes(openId)) {
          logger.debug(`query-bot 忽略未授权用户 ${openId}`);
          return;
        }
        const text = String(msg?.content ?? '');
        let parsed = '';
        try { parsed = String((JSON.parse(text) as { text?: string }).text ?? ''); } catch { parsed = text; }
        const trimmed = parsed.trim();

        let card: Record<string, unknown>;
        if (trimmed === '帮助' || trimmed === 'help') {
          card = buildHelpCard();
        } else {
          card = buildStatusCard(deps.getStatusRows());
        }
        if (msg?.chat_id) {
          await client.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: {
              receive_id: msg.chat_id,
              msg_type: 'interactive',
              content: JSON.stringify(card),
            },
          });
          logger.info(`query-bot 已回复「${trimmed || '状态'}」→ chat ${msg.chat_id}`);
        }
      } catch (e) {
        logger.error('query-bot 消息处理失败', String(e));
      }
    },
  });

  logger.info('query-bot 长连接启动中…');
  // WSClient.start() 常驻，不 await 完成
  void wsClient.start({ eventDispatcher }).then(() => {
    logger.info('query-bot 长连接已建立');
  }).catch((e: unknown) => {
    logger.error(`query-bot 长连接失败: ${String(e)}（通知与面板不受影响）`);
  });

  return {
    stop: async () => {
      try { wsClient.close?.(); } catch { /* ignore */ }
    },
  };
}
