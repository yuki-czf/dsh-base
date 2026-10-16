// 手动发一张测试卡：node dist/dev/send-test-card.js --kind turn --status completed
import { loadConfig } from '../config.js';
import { FeishuWebhook } from '../notify/feishu-webhook.js';
import { logger } from '../logger.js';

const arg = (n: string, def: string): string => {
  const i = process.argv.indexOf(n);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? def;
};
const cfg = loadConfig();
const kind = arg('--kind', 'turn') as 'turn' | 'stuck' | 'crashed';
const status = arg('--status', 'completed');

const ev = {
  kind,
  tool: 'openchamber' as const,
  sessionId: 'test-' + Date.now(),
  projectName: 'dsh-base（测试）',
  title: '飞书通知连通性测试 ' + new Date().toLocaleTimeString(),
  status,
  durationMs: 23 * 60_000,
  tokens: 89_000,
  model: 'glm-5.3-flash',
  errorCode: status === 'error' ? 'PI_AI_ERROR' : undefined,
  excerpt: '这是一张测试卡片：定位为聚合投递延迟，非 bug，已恢复并归档。'.repeat(2),
  detailUrl: cfg.baseUrl + '/',
};

const hook = new FeishuWebhook(cfg.feishu.webhookUrl);
if (!hook.configured) {
  console.error('❌ FEISHU_WEBHOOK_URL 未配置（环境变量）');
  process.exit(1);
}
try {
  await hook.deliver([ev]);
  console.log('✅ 测试卡片已发送，请在飞书群里确认收到');
} catch (e) {
  console.error('❌ 发送失败:', String(e));
  process.exit(1);
}
