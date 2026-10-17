#!/usr/bin/env node
/**
 * pi-tempo watchdog — PI-Desktop 外部看门狗（pi-tempo v1.0.5 配套）
 *
 * 为什么存在：宿主没有可用的扩展 API（pi.on/sendUserMessage 全无），提示词规则在
 * >20 万 token 上下文里遵循率≈0（271 实测 69/71 小窗读）。看门狗在模型外面盯着，
 * 触线就弹 Windows 通知——它自己不会忘、不会衰减。
 *
 * 数据源（全部只读）：
 *   - ~/.pi-desktop/sessions/<id>.jsonl   工具调用（args/isError）、assistant meta.usage
 *   - ~/.pi-desktop/pi.sqlite             turns 状态（running 卡死 / error 连发）
 *
 * 五条规则（阈值可用 CLI 覆盖）：
 *   R1 失败循环   同签名工具连败 >=3（15 分钟窗，同签名成功即重置）→ 死循环熔断提示
 *   R2 上下文超限 当前上下文 >250k token（inputTokens+cacheReadTokens；降回 230k 重新武装）
 *   R3 回合卡死   单回合 running >25 分钟
 *   R4 回合风暴   单回合工具调用 >45 次（271 T3：48 次重试 38 败）
 *   R5 提供方连错 同会话 15 分钟内 >=3 个 error 回合 → 换模型提示（271 T4 教训）
 *
 * 用法：
 *   node watchdog.mjs                       常驻，10s 轮询，弹 toast
 *   node watchdog.mjs --once                扫一遍打印状态后退出（也可当状态命令）
 *   node watchdog.mjs --no-toast            只写日志不弹通知
 *   常见覆盖：--interval 5000 --ctx-limit 250000 --fail-streak 3 --turn-stuck-min 25
 *             --turn-calls 45 --provider-errors 3 --sessions-dir <path> --db <path>
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

// ---------- CLI ----------
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const num = (name, dflt) => Number(flag(name, dflt));

const OPT = {
  sessionsDir: flag('sessions-dir', path.join(os.homedir(), '.pi-desktop', 'sessions')),
  dbPath: flag('db', path.join(os.homedir(), '.pi-desktop', 'pi.sqlite')),
  intervalMs: num('interval', 10_000),
  ctxLimit: num('ctx-limit', 250_000),
  ctxRearm: num('ctx-rearm', 230_000),
  failStreak: num('fail-streak', 3),
  failWindowMs: num('fail-window-min', 15) * 60_000,
  turnStuckMs: num('turn-stuck-min', 25) * 60_000,
  turnCalls: num('turn-calls', 45),
  providerErr: num('provider-errors', 3),
  providerErrWindowMs: num('provider-err-window-min', 15) * 60_000,
  cooldownMs: num('cooldown-min', 10) * 60_000,
  once: !!flag('once', false),
  noToast: !!flag('no-toast', false),
  quiet: !!flag('quiet', false),
};

// 事件留痕：写用户日志目录（不污染本仓库）
const LOG_DIR = path.join(os.homedir(), '.pi-desktop', 'logs');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const LOG_FILE = path.join(LOG_DIR, 'pi-tempo-watchdog.jsonl');

// ---------- 通知 ----------
let toastProcBusy = 0;
function toast(title, body) {
  console.log('[ALERT]', `${new Date().toISOString()} ${title} :: ${body}`);
  try { fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), title, body }) + '\n'); } catch {}
  if (OPT.noToast || toastProcBusy > 2) return;
  toastProcBusy++;
  const ps = `
$ErrorActionPreference='SilentlyContinue'
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null
[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime]|Out-Null
$app='{1AC14E77-02E7-414D-81B3-85B8D266BF04}\\WindowsPowerShell\\v1.0\\powershell.exe'
$xml=New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastText02"><text id="1">__T__</text><text id="2">__B__</text></binding></visual></toast>')
$n=[Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($n)
`.replace('__T__', xmlEsc(title)).replace('__B__', xmlEsc(body));
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: 'ignore' });
  child.on('exit', () => { toastProcBusy--; });
  child.on('error', () => { toastProcBusy--; });
}
function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }

// 告警节流：rule+key → { ts, n }；同一键最多弹 3 次，之后只留痕（防长期卡死行无限唠叨）
const lastFired = new Map();
function fire(rule, key, title, body) {
  const k = rule + '|' + key;
  const now = Date.now();
  const rec = lastFired.get(k) ?? { ts: 0, n: 0 };
  if (now - rec.ts < OPT.cooldownMs) return;
  rec.ts = now;
  rec.n++;
  lastFired.set(k, rec);
  if (rec.n > 3) { console.log('[ALERT-silent]', k); return; }
  toast(title, body);
}

// ---------- 会话 JSONL 跟踪 ----------
// per-file state：offset / failures(Map sig→{count,lastTs}) / turnCalls / ctxMax
const files = new Map();
function stateOf(fp) {
  let st = files.get(fp);
  if (!st) {
    st = {
      offset: 0, seeded: false, turnKey: 'pre', turnCalls: 0, turnCallsAlerted: false,
      failures: new Map(), ctxMax: 0, ctxAlerted: false,
      sessionShort: path.basename(fp, '.jsonl').slice(0, 8),
    };
    files.set(fp, st);
  }
  return st;
}

function sigOf(toolName, a) {
  a = a ?? {};
  let key;
  if (toolName === 'Bash') key = String(a.command ?? '');
  else if (toolName === 'Edit' || toolName === 'Write') key = String(a.path ?? a.file_path ?? '');
  else if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') key = String(a.path ?? a.pattern ?? a.query ?? a.include ?? '');
  else if (toolName === 'Task') key = String(a.agent ?? '');
  else key = JSON.stringify(a);
  key = key.replace(/\s+/g, ' ').trim().slice(0, 160);
  return toolName + '::' + key;
}

function scanFile(fp, now) {
  let size;
  try { size = fs.statSync(fp).size; } catch { return; }
  const st = stateOf(fp);
  if (size < st.offset) { st.offset = 0; st.failures.clear(); st.turnCalls = 0; } // 截断/轮转 → 重来
  if (size === st.offset) return;
  let buf;
  try {
    const fd = fs.openSync(fp, 'r');
    buf = Buffer.alloc(size - st.offset);
    fs.readSync(fd, buf, 0, buf.length, st.offset);
    fs.closeSync(fd);
  } catch { return; }
  st.offset = size;

  const firstScan = !st.seeded;
  const lines = buf.toString('utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== 'message') continue;
    const evTs = e.createdAt ? Date.parse(e.createdAt) : now;
    const stale = firstScan || now - evTs > 5 * 60_000; // 启动回填/历史事件只记态不弹窗

    if (e.role === 'user') {
      st.turnKey = e.id ?? String(evTs);
      st.turnCalls = 0;
      st.turnCallsAlerted = false;
      continue;
    }

    if (e.role === 'tool') {
      st.turnCalls++;
      const b = e.blocks?.[0] ?? {};
      const sig = sigOf(e.toolName ?? b.name ?? '?', b.args);
      const isErr = !!(e.isError ?? b.isError ?? b.result?.isError);
      if (isErr) {
        const rec = st.failures.get(sig) ?? { count: 0, lastTs: 0 };
        rec.count = now - rec.lastTs < OPT.failWindowMs ? rec.count + 1 : 1;
        rec.lastTs = now;
        st.failures.set(sig, rec);
        if (rec.count >= OPT.failStreak) {
          if (!stale) {
            fire('R1', st.sessionShort + '|' + sig,
              `pi-tempo 看门狗：失败循环 (${st.sessionShort})`,
              `${e.toolName} 同一调用已连败 ${rec.count} 次 → 按熔断三分类处理（瞬时/环境/方法死路），别原样重试\n${sig.slice(0, 90)}`);
          }
          rec.count = 0; // 到线即重置：一次事故只提醒一次（冷却 10 分钟内不再弹）
        }
      } else {
        st.failures.delete(sig); // 同签名成功 → 重置该签名
      }
      if (st.turnCalls > OPT.turnCalls && !st.turnCallsAlerted && !stale) {
        st.turnCallsAlerted = true;
        fire('R4', st.sessionShort + '|' + st.turnKey,
          `pi-tempo 看门狗：回合风暴 (${st.sessionShort})`,
          `单回合工具调用已达 ${st.turnCalls} 次（阈值 ${OPT.turnCalls}）→ 大概率验证脚本死循环，人肉介入`);
      }
      continue;
    }

    if (e.role === 'assistant') {
      const u = e.meta?.usage;
      if (u && Number.isFinite(u.inputTokens)) {
        const ctx = (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0);
        if (ctx > st.ctxMax) st.ctxMax = ctx;
        if (st.ctxMax > OPT.ctxLimit) {
          if (!st.ctxAlerted && !stale) {
            st.ctxAlerted = true;
            fire('R2', st.sessionShort,
              `pi-tempo 看门狗：上下文超限 (${st.sessionShort})`,
              `当前上下文 ≈${Math.round(st.ctxMax / 1000)}k token（熔断线 ${Math.round(OPT.ctxLimit / 1000)}k）→ 现在写 handoff 提示词，换会话或换模型发「继续」`);
          }
        } else if (st.ctxMax < OPT.ctxRearm) {
          st.ctxAlerted = false;
        }
      }
    }
  }
  st.seeded = true;
}

// ---------- pi.sqlite：回合卡死 + 提供方连错 ----------
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* Node <22.5 → R3/R5 不可用 */ }
function scanDb(now) {
  if (!DatabaseSync) return;
  let db;
  try { db = new DatabaseSync(OPT.dbPath, { readOnly: true }); } catch { return; }
  try {
    const stuck = db.prepare(
      "SELECT id, session_id, started_at, model_id FROM turns WHERE status='running' AND started_at < ?"
    ).all(now - OPT.turnStuckMs);
    for (const t of stuck) {
      // 活跃判定：会话文件 5 分钟内有写入 = 在干活（可能是长回合/长 Bash），不算卡死
      let fresh = false;
      try { fresh = now - fs.statSync(path.join(OPT.sessionsDir, t.session_id + '.jsonl')).mtimeMs < 5 * 60_000; } catch {}
      if (fresh) continue;
      fire('R3', t.id,
        `pi-tempo 看门狗：回合卡死 (${t.session_id.slice(0, 8)})`,
        `回合已 running ${Math.round((now - t.started_at) / 60000)} 分钟且 5 分钟无任何写入（${t.model_id}）→ 不是在硬算就是在死循环，看一眼`);
    }
    const errTurns = db.prepare(
      "SELECT session_id, started_at FROM turns WHERE status='error' AND started_at > ? ORDER BY started_at DESC LIMIT 50"
    ).all(now - OPT.providerErrWindowMs);
    const bySess = new Map();
    for (const t of errTurns) bySess.set(t.session_id, (bySess.get(t.session_id) ?? 0) + 1);
    for (const [sid, n] of bySess) {
      if (n >= OPT.providerErr) {
        fire('R5', sid,
          `pi-tempo 看门狗：提供方连错 (${sid.slice(0, 8)})`,
          `15 分钟内 ${n} 个回合 error → 渠道/模型大概率不可用，换模型发「继续」（271 T4 教训）`);
      }
    }
  } catch { /* 表不在/库锁 → 跳过本轮 */ }
  try { db.close(); } catch {}
}

// ---------- 主循环 ----------
function listSessionFiles() {
  let ents;
  try { ents = fs.readdirSync(OPT.sessionsDir, { withFileTypes: true }); } catch { return []; }
  return ents
    .filter((d) => d.isFile() && d.name.endsWith('.jsonl') && !d.name.endsWith('.revisions.jsonl'))
    .map((d) => path.join(OPT.sessionsDir, d.name));
}

function tick(first = false) {
  const now = Date.now();
  const fps = listSessionFiles();
  let active = 0;
  for (const fp of fps) {
    let mtime;
    try { mtime = fs.statSync(fp).mtimeMs; } catch { continue; }
    if (now - mtime > 10 * 60_000 && !files.has(fp)) continue; // 冷会话不初始化
    scanFile(fp, now);
    if (now - mtime < 10 * 60_000) active++;
  }
  scanDb(now);
  if (first || !OPT.quiet) {
    const hot = [...files.entries()]
      .map(([fp, st]) => {
        let mtime = 0;
        try { mtime = fs.statSync(fp).mtimeMs; } catch {}
        return { fp, mtime, st };
      })
      .filter((x) => now - x.mtime < 30 * 60_000)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5);
    console.log(`[pi-tempo watchdog] ${new Date().toISOString()} 会话文件=${fps.length} 活跃=${active} 规则=R1连败${OPT.failStreak} R2>${Math.round(OPT.ctxLimit / 1000)}k R3卡${OPT.turnStuckMs / 60000}min R4>${OPT.turnCalls}次 R5连错${OPT.providerErr}`);
    for (const { st } of hot) {
      console.log(`  ${st.sessionShort}  ctx≈${Math.round(st.ctxMax / 1000)}k  本回合工具=${st.turnCalls}  连败签名=${[...st.failures.values()].filter((r) => r.count >= 2).length}`);
    }
  }
  if (OPT.once) { console.log('[done] --once 扫描完成'); process.exit(0); }
}

tick(true);
if (!OPT.once) setInterval(() => tick(), OPT.intervalMs);
