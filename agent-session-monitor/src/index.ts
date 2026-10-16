import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { openDb, migrate, kvSet, type DB } from './db.js';
import { logger, setLogFile, safeUrl } from './logger.js';
import { Aggregator } from './core/aggregator.js';
import { NotifyEngine } from './notify/engine.js';
import { FeishuWebhook } from './notify/feishu-webhook.js';
import { OpenChamberAdapter } from './adapters/openchamber.js';
import { PiDesktopAdapter } from './adapters/pi-desktop.js';
import { ZCodeAdapter } from './adapters/zcode.js';
import { DshAdapter } from './adapters/dsh.js';
import { startWeb } from './web/server.js';
import { startQueryBot } from './bot/feishu-ws.js';
import type { Adapter, NotifyEvent, SessionRecord, SessionDelta, ToolName } from './types.js';

function lanIps(): string[] {
  const out: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

async function portInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true));
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port, host);
  });
}

function buildSessionGetter(live: Map<string, SessionRecord>) {
  return {
    getSessions: () => [...live.values()],
    getSession: (tool: ToolName, id: string) => live.get(`${tool}/${id}`),
  };
}

async function main(): Promise<void> {
  if (process.argv.includes('--check-config')) {
    const cfg = loadConfig();
    console.log('配置有效');
    console.log(`面板端口: ${cfg.server.port}（鉴权 ${cfg.server.auth.enabled ? '开启' : '⚠️ 关闭'}）`);
    console.log(`候选局域网 IP: ${lanIps().join(', ') || '无'}`);
    console.log(`BASE_URL: ${cfg.baseUrl}`);
    return;
  }

  const cfg = loadConfig();
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  setLogFile(path.join(cfg.dataDir, 'monitor.log'));

  if (cfg.server.auth.enabled && cfg.server.auth.token === 'change-me-to-a-long-random-string') {
    logger.warn('⚠️ 面板 token 仍为默认值，请在 config.yaml 修改');
  }
  if (!cfg.server.auth.enabled) {
    logger.warn('⚠️⚠️ 面板鉴权已关闭：同一 WiFi 下任何设备均可查看会话内容');
  }

  // 单实例锁：端口占用即退出
  if (await portInUse(cfg.server.port, cfg.server.host)) {
    console.error(`已在运行（端口 ${cfg.server.port} 被占用），本次启动退出。`);
    process.exit(1);
  }

  const db: DB = openDb(cfg.dataDir);
  migrate(db);
  kvSet(db, 'lastStartAt', String(Date.now()));

  // 通知管线
  const webhook = new FeishuWebhook(cfg.feishu.webhookUrl);
  const engine = new NotifyEngine(db, cfg.notify, async (events) => {
    if (!webhook.configured) throw new Error('FEISHU_WEBHOOK_URL 未配置（通知不可用，请在环境变量中设置后重启）');
    await webhook.deliver(events);
  });

  // 离线积压：已完成但未通知的旧回合 → digest
  const backlogRows = db.prepare(
    'SELECT tool, session_id, status, started_at, ended_at, tokens, model, error_code FROM turns WHERE notified = 0 AND status != ? AND ended_at IS NOT NULL AND ended_at < ? LIMIT 50'
  ).all('running', Date.now() - cfg.poll.silenceMs) as Array<{ tool: ToolName; session_id: string; status: string; started_at: number; ended_at: number; tokens: number | null; model: string | null; error_code: string | null }>;
  const sessionsMeta = new Map(db.prepare('SELECT tool, session_id, project_name, title, last_assistant_excerpt FROM sessions').all().map((r: any) => [`${r.tool}/${r.session_id}`, r] as const));
  const backlog: NotifyEvent[] = backlogRows.map(t => {
    const meta = sessionsMeta.get(`${t.tool}/${t.session_id}`);
    return {
      kind: 'turn', tool: t.tool, sessionId: t.session_id,
      projectName: meta?.project_name ?? '未知项目', title: meta?.title ?? t.session_id.slice(0, 8),
      status: t.status, durationMs: Math.max(0, t.ended_at - t.started_at), tokens: t.tokens ?? undefined,
      model: t.model ?? undefined, errorCode: t.error_code ?? undefined,
      excerpt: meta?.last_assistant_excerpt, detailUrl: `/session/${t.tool}/${encodeURIComponent(t.session_id)}`,
    };
  });

  // 实时会话状态（面板数据源）
  const live = new Map<string, SessionRecord>();
  const aggregator = new Aggregator(db, (ev) => engine.submit(ev), {
    stuckAfterMs: cfg.poll.stuckAfterMs,
    silenceMs: cfg.poll.silenceMs,
  });
  const ingest = (deltas: SessionDelta[]) => {
    aggregator.ingest(deltas);
    for (const d of deltas) live.set(`${d.tool}/${d.sessionId}`, d.record);
  };

  // 适配器
  const adapters: Adapter[] = [];
  if (cfg.adapters.openchamber.enabled) adapters.push(new OpenChamberAdapter(cfg.adapters.openchamber.port));
  if (cfg.adapters['pi-desktop'].enabled) adapters.push(new PiDesktopAdapter(cfg.adapters['pi-desktop'].dbPath));
  if (cfg.adapters.zcode.enabled) adapters.push(new ZCodeAdapter(cfg.adapters.zcode.dbPath));
  let dsh: DshAdapter | null = null;
  if (cfg.adapters.dsh.enabled) {
    dsh = new DshAdapter(cfg.adapters.dsh.sessionsDir);
    dsh.setDeltaConsumer((d) => ingest([d]));
    adapters.push(dsh);
  }
  for (const a of adapters) await a.start();
  if (dsh) void dsh.initialScan();

  // 轮询循环
  const pollable = adapters.filter(a => !(a instanceof DshAdapter));
  const pollLoop = setInterval(async () => {
    for (const a of pollable) {
      try { ingest(await a.poll()); } catch (e) { logger.debug(`poll ${a.name} error`, String(e)); }
    }
  }, cfg.poll.intervalMs);

  // sweep 循环：stuck / crashed
  const dbExists = (p: string) => { try { return fs.existsSync(p); } catch { return true; } };
  const sweepLoop = setInterval(() => {
    const running = [...live.values()].filter(s => s.status === 'running').map(s => ({
      tool: s.tool, sessionId: s.sessionId, projectName: s.projectName, title: s.title,
      startedAt: s.startedAt, lastTurnAt: s.lastTurnAt, model: s.model, excerpt: s.lastAssistantExcerpt,
      processAlive: s.tool === 'openchamber'
        ? true
        : s.tool === 'pi-desktop' ? dbExists(cfg.adapters['pi-desktop'].dbPath)
        : s.tool === 'zcode' ? dbExists(cfg.adapters.zcode.dbPath)
        : dbExists(cfg.adapters.dsh.sessionsDir),
    }));
    aggregator.sweep(running);
  }, 60_000);

  // 启动静默结束后再处理积压（避免与静默基线冲突）
  setTimeout(() => engine.flushBacklog(backlog), cfg.poll.silenceMs + 1000);

  // 查询机器人
  const bot = await startQueryBot({
    appId: cfg.feishu.appId,
    appSecret: cfg.feishu.appSecret,
    allowedUserIds: cfg.bot.allowedUserIds,
    getStatusRows: () => [...live.values()].map(s => ({
      tool: s.tool, projectName: s.projectName, title: s.title, status: s.status,
      lastTurnAt: s.lastTurnAt, sessionId: s.sessionId, detailUrl: `/session/${s.tool}/${encodeURIComponent(s.sessionId)}`,
    })),
  });

  // 面板
  // 面板数据源：DB 全量（7 天内）+ 内存实时状态覆盖
  const getSessions = (): SessionRecord[] => {
    const cutoff = Date.now() - cfg.poll.historyDays * 86_400_000;
    const rows = db.prepare(
      'SELECT * FROM sessions WHERE last_turn_at >= ? OR status = ? ORDER BY last_turn_at DESC LIMIT 500'
    ).all(cutoff, 'running') as Array<{
      tool: ToolName; session_id: string; project_id: string; project_name: string; title: string;
      status: string; started_at: number; last_turn_at: number; total_tokens: number | null;
      model: string | null; last_assistant_excerpt: string | null; delegation_depth: number | null;
    }>;
    return rows.map(r => {
      const liveRec = live.get(`${r.tool}/${r.session_id}`);
      if (liveRec) return liveRec;
      return {
        tool: r.tool, projectId: r.project_id, projectName: r.project_name, sessionId: r.session_id,
        title: r.title, status: r.status as SessionRecord['status'], startedAt: r.started_at,
        lastTurnAt: r.last_turn_at, turns: [], totalTokens: r.total_tokens ?? undefined,
        model: r.model ?? undefined, lastAssistantExcerpt: r.last_assistant_excerpt ?? undefined,
        delegationDepth: r.delegation_depth ?? undefined,
      };
    });
  };
  engine.baseUrl = cfg.baseUrl;
  const web = await startWeb({
    cfg: { port: cfg.server.port, host: cfg.server.host, auth: cfg.server.auth },
    db,
    getSessions,
    getSession: (tool: ToolName, id: string) => getSessions().find(s => s.tool === tool && s.sessionId === id) ?? live.get(`${tool}/${id}`),
    getHealth: () => Object.fromEntries(adapters.map(a => [a.name, a.health()])),
    breakerActive: () => engine.breakerActive,
    historyDaysMs: () => cfg.poll.historyDays * 86_400_000,
  });

  const ips = lanIps();
  const tokenQ = cfg.server.auth.enabled ? `?token=${cfg.server.auth.token.slice(0, 4)}****（完整 token 见 config.yaml）` : '';
  console.log('──────────────────────────────────────────────');
  console.log(`✅ agent-session-monitor 已启动`);
  console.log(`   本机面板:   http://127.0.0.1:${cfg.server.port}/${tokenQ}`);
  for (const ip of ips) console.log(`   局域网面板: http://${ip}:${cfg.server.port}/${tokenQ}`);
  console.log(`   飞书通知:   ${cfg.feishu.webhookUrl ? '已配置 ' + safeUrl(cfg.feishu.webhookUrl) : '❌ 未配置（设置 FEISHU_WEBHOOK_URL）'}`);
  console.log(`   查询机器人: ${bot ? '已启用' : '禁用（缺自建应用凭据）'}`);
  console.log(`   轮询周期:   ${cfg.poll.intervalMs / 1000}s · 静默期 ${cfg.poll.silenceMs / 1000}s`);
  console.log('──────────────────────────────────────────────');

  const shutdown = async () => {
    clearInterval(pollLoop);
    clearInterval(sweepLoop);
    await bot?.stop();
    await web.stop();
    for (const a of adapters) await a.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e) => {
  if (String(e?.['code'] ?? '') === 'EADDRINUSE') {
    console.error('已在运行（端口被占用），本次启动退出。');
    process.exit(1);
  }
  console.error('启动失败:', e);
  process.exit(1);
});
