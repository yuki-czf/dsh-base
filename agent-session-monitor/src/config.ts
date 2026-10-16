import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export interface Config {
  server: {
    port: number;
    host: string;
    auth: { enabled: boolean; token: string };
  };
  baseUrl: string;
  poll: {
    intervalMs: number;
    stuckAfterMs: number;
    silenceMs: number;
    historyDays: number;
  };
  adapters: {
    openchamber: { enabled: boolean; port: number };
    'pi-desktop': { enabled: boolean; dbPath: string };
    zcode: { enabled: boolean; dbPath: string };
    dsh: { enabled: boolean; sessionsDir: string };
  };
  notify: {
    mergeWindowMs: number;
    minGapMs: number;
    maxRetries: number;
    breakerAfterConsecutiveFails: number;
    backlogDigestThreshold: number;
  };
  bot: { enabled: boolean; allowedUserIds: string[] };
  feishu: {
    webhookUrl?: string;   // env FEISHU_WEBHOOK_URL
    appId?: string;        // env FEISHU_APP_ID
    appSecret?: string;    // env FEISHU_APP_SECRET
  };
  dataDir: string;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findConfigPath(): string {
  const explicit = process.env.CONFIG_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const local = path.join(ROOT, 'config.yaml');
  if (fs.existsSync(local)) return local;
  const example = path.join(ROOT, 'config.example.yaml');
  if (fs.existsSync(example)) return example;
  throw new Error('未找到 config.yaml 或 config.example.yaml');
}

function num(v: unknown, def: number, min: number, max: number, field: string): number {
  if (v === undefined || v === null || v === '') return def;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`无效配置: ${field} 必须是数字（得到 "${String(v)}"）`);
  if (n < min || n > max) throw new Error(`无效配置: ${field} 必须在 ${min}..${max}（得到 ${n}）`);
  return n;
}

export function loadConfig(overrides?: Partial<Config>): Config {
  const file = findConfigPath();
  const raw = YAML.parse(fs.readFileSync(file, 'utf8')) as Record<string, any> | null;
  const r = raw ?? {};

  const port = num(r?.server?.port, 7788, 1024, 65535, 'server.port');
  if (port === 57123 || port === 63884) {
    throw new Error(`无效配置: server.port ${port} 是被监控工具的端口，必须避开`);
  }

  const authEnabled = r?.server?.auth?.enabled !== false;
  const authToken = String(r?.server?.auth?.token ?? 'change-me-to-a-long-random-string');

  const cfg: Config = {
    server: {
      port,
      host: String(r?.server?.host ?? '0.0.0.0'),
      auth: { enabled: authEnabled, token: authToken },
    },
    baseUrl: String(r?.baseUrl ?? `http://127.0.0.1:${port}`).replace(/\/$/, ''),
    poll: {
      intervalMs: num(r?.poll?.intervalMs, 10_000, 5_000, 60_000, 'poll.intervalMs'),
      stuckAfterMs: num(r?.poll?.stuckAfterMs, 1_800_000, 60_000, 24 * 3600_000, 'poll.stuckAfterMs'),
      silenceMs: num(r?.poll?.silenceMs, 60_000, 0, 600_000, 'poll.silenceMs'),
      historyDays: num(r?.poll?.historyDays, 7, 1, 90, 'poll.historyDays'),
    },
    adapters: {
      openchamber: {
        enabled: r?.adapters?.openchamber?.enabled !== false,
        port: num(r?.adapters?.openchamber?.port, 57123, 1024, 65535, 'adapters.openchamber.port'),
      },
      'pi-desktop': {
        enabled: r?.adapters?.['pi-desktop']?.enabled !== false,
        dbPath: String(r?.adapters?.['pi-desktop']?.dbPath ?? 'C:/Users/tc/.pi-desktop/pi.sqlite'),
      },
      zcode: {
        enabled: r?.adapters?.zcode?.enabled !== false,
        dbPath: String(r?.adapters?.zcode?.dbPath ?? 'C:/Users/tc/.zcode/cli/db/db.sqlite'),
      },
      dsh: {
        enabled: r?.adapters?.dsh?.enabled !== false,
        sessionsDir: String(r?.adapters?.dsh?.sessionsDir ?? 'C:/Users/tc/.dsh/sessions'),
      },
    },
    notify: {
      mergeWindowMs: num(r?.notify?.mergeWindowMs, 600_000, 0, 3600_000, 'notify.mergeWindowMs'),
      minGapMs: num(r?.notify?.minGapMs, 3_000, 0, 60_000, 'notify.minGapMs'),
      maxRetries: num(r?.notify?.maxRetries, 3, 0, 10, 'notify.maxRetries'),
      breakerAfterConsecutiveFails: num(r?.notify?.breakerAfterConsecutiveFails, 5, 1, 100, 'notify.breakerAfterConsecutiveFails'),
      backlogDigestThreshold: num(r?.notify?.backlogDigestThreshold, 5, 2, 100, 'notify.backlogDigestThreshold'),
    },
    bot: {
      enabled: r?.bot?.enabled !== false,
      allowedUserIds: Array.isArray(r?.bot?.allowedUserIds) ? r.bot.allowedUserIds.map(String) : [],
    },
    feishu: {
      webhookUrl: process.env.FEISHU_WEBHOOK_URL,
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
    },
    dataDir: path.join(ROOT, 'data'),
    ...(overrides ?? {}),
  };

  // 环境变量覆盖
  if (process.env.PORT) cfg.server.port = num(process.env.PORT, cfg.server.port, 1024, 65535, 'PORT');
  if (overrides?.baseUrl) cfg.baseUrl = overrides.baseUrl;

  return cfg;
}

export function checkConfigOnly(): Config {
  const cfg = loadConfig();
  return cfg;
}

export const ROOT_DIR = ROOT;
