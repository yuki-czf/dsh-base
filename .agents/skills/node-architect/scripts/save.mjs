#!/usr/bin/env node
/**
 * save.mjs — Cross-platform (Node.js) equivalent of save.ps1
 *
 * Usage:
 *   node save.mjs lock   --session main
 *   node save.mjs unlock --session main
 *   node save.mjs save   --node "Run login flow" --session main --context-file ctx-tmp.md [--completed]
 *   node save.mjs commit --node "Run login flow" --session main --batch 2 --context-file ctx-tmp.md
 *   node save.mjs verify --node "Run login flow" --session main [--completed]
 *   node save.mjs verify-batch --node "Run login flow" --session main --batch 2
 *   node save.mjs check-tombstone
 *   node save.mjs trim-decisions [--keep 20]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';

// ---------- Arg parsing ----------
const args = process.argv.slice(2);
const action = args[0];
function getArg(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return def;
  return args[i + 1];
}
function hasFlag(name) { return args.includes(`--${name}`); }

const project = resolve(getArg('project', process.cwd()));
const session = getArg('session', 'main');
const node = getArg('node', '');
const batch = getArg('batch', '');
const contextFile = getArg('context-file', '');
const keep = parseInt(getArg('keep', '20'), 10);
const completed = hasFlag('completed');
const nodesDir = join(project, '.nodes');
const lockDir = join(nodesDir, '.lock.d');
const lockOwnerFile = join(lockDir, 'owner');
const oldLockPath = join(nodesDir, '.lock');
const TIMEOUT_MIN = 10;

// ---------- Validation ----------
if (!existsSync(nodesDir)) { console.error(`Not found: ${nodesDir} (run init-nodes first)`); process.exit(1); }

const VALID_ACTIONS = ['lock', 'unlock', 'verify', 'verify-batch', 'commit', 'save', 'check-tombstone', 'trim-decisions'];
if (!VALID_ACTIONS.includes(action)) {
  console.error(`Usage: node save.mjs <${VALID_ACTIONS.join('|')}> [options]`);
  process.exit(1);
}

if (action === 'verify-batch') {
  if (!node) die('verify-batch requires --node');
  if (!batch) die('verify-batch requires --batch <N>');
}
if (action === 'commit') {
  if (!node) die('commit requires --node');
  if (!batch) die('commit requires --batch <N>');
  if (!contextFile) die('commit requires --context-file');
}
if (action === 'save') {
  if (!node) die('save requires --node');
  if (!contextFile) die('save requires --context-file');
}

function die(msg) { console.error(`[FAIL] ${msg}`); process.exit(1); }

// ---------- Helpers ----------
function readUtf8(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}
function writeUtf8(path, content) {
  writeFileSync(path, content, 'utf-8');
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------- Lock migration ----------
function migrateOldLock() {
  if (existsSync(oldLockPath) && statSync(oldLockPath).isFile()) {
    const content = readUtf8(oldLockPath);
    if (!existsSync(lockDir)) mkdirSync(lockDir);
    writeUtf8(lockOwnerFile, content);
    unlinkSync(oldLockPath);
    console.log('Migrated old .lock file to .lock.d/ directory lock');
  }
}

function getLockInfo() {
  migrateOldLock();
  if (!existsSync(lockDir) || !existsSync(lockOwnerFile)) return null;
  const raw = readUtf8(lockOwnerFile);
  const parts = raw.split('|');
  const owner = parts[0] || '';
  let ts = null;
  let ageMin = Infinity;
  if (parts.length >= 2) {
    try { ts = new Date(parts[1].trim()); ageMin = (Date.now() - ts.getTime()) / 60000; } catch { }
  }
  return { owner, ts, ageMin };
}

function acquireLock(sess) {
  migrateOldLock();
  const cur = getLockInfo();
  if (cur) {
    if (cur.owner === sess) {
      writeUtf8(lockOwnerFile, `${sess}|${nowStamp()}`);
      return { ok: true, msg: `Refreshed own lock (${sess})` };
    }
    if (cur.ageMin < TIMEOUT_MIN) {
      return { ok: false, msg: `Lock held by '${cur.owner}' (${Math.floor(cur.ageMin)} min ago), not timed out. Retry later.` };
    }
    console.log(`Warning: Overriding expired lock (owner '${cur.owner}', ${Math.floor(cur.ageMin)} min ago)`);
    rmSync(lockDir, { recursive: true, force: true });
  }
  try {
    mkdirSync(lockDir);  // atomic — fails if exists
    writeUtf8(lockOwnerFile, `${sess}|${nowStamp()}`);
    return { ok: true, msg: `Lock acquired (${sess})` };
  } catch {
    const rival = getLockInfo();
    return { ok: false, msg: `Lock race lost to '${rival?.owner || 'unknown'}'. Retry later.` };
  }
}

function releaseLock(sess) {
  migrateOldLock();
  const cur = getLockInfo();
  if (!cur) return { ok: true, msg: 'No lock to release' };
  if (cur.owner !== sess && cur.ageMin < TIMEOUT_MIN) {
    return { ok: false, msg: `Lock belongs to '${cur.owner}', not timed out. Cannot release.` };
  }
  rmSync(lockDir, { recursive: true, force: true });
  return { ok: true, msg: `Lock released (${sess})` };
}

// ---------- Tombstone ----------
function getStaleTombstone() {
  const logPath = join(nodesDir, 'SESSIONS', '_compactions.log');
  if (!existsSync(logPath)) return null;
  const lines = readUtf8(logPath).split(/\r?\n/);
  let latest = null;
  for (const line of lines) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
    if (m) {
      const t = new Date(m[1].replace(' ', 'T'));
      if (!latest || t > latest) latest = t;
    }
  }
  if (!latest) return null;
  const checkPaths = ['CONTEXT.md', 'PROGRESS.md', 'DECISIONS.md'];
  const checkDirs = ['SESSIONS', 'archive'];
  for (const rel of checkPaths) {
    const p = join(nodesDir, rel);
    if (existsSync(p) && statSync(p).mtime > latest) return null;
  }
  for (const d of checkDirs) {
    const dp = join(nodesDir, d);
    if (existsSync(dp)) {
      for (const f of readdirSync(dp)) {
        if (f === '_compactions.log') continue;
        const fp = join(dp, f);
        if (statSync(fp).isFile() && statSync(fp).mtime > latest) return null;
      }
    }
  }
  return latest;
}

// ---------- Actions ----------

if (action === 'lock') {
  const r = acquireLock(session);
  console.log(r.ok ? `OK: ${r.msg}` : `[FAIL] ${r.msg}`);
  process.exit(r.ok ? 0 : 1);
}

if (action === 'unlock') {
  const r = releaseLock(session);
  console.log(r.ok ? `OK: ${r.msg}` : `[FAIL] ${r.msg}`);
  process.exit(r.ok ? 0 : 1);
}

if (action === 'check-tombstone') {
  const stale = getStaleTombstone();
  if (!stale) {
    console.log('OK: No unprocessed compaction tombstones.');
    process.exit(0);
  }
  console.log(`[WARN] Compaction tombstone (${stale.toISOString().slice(0, 19)}) with no subsequent .nodes writes — catch-up checkpoint may be missing.`);
  process.exit(3);
}

if (action === 'trim-decisions') {
  const decPath = join(nodesDir, 'DECISIONS.md');
  if (!existsSync(decPath)) die('DECISIONS.md not found');
  const raw = readUtf8(decPath);
  const lines = raw.split(/\r?\n/);
  const sectionStarts = [];
  lines.forEach((l, i) => { if (/^## /.test(l)) sectionStarts.push(i); });

  if (sectionStarts.length <= keep) {
    console.log(`OK: DECISIONS.md has ${sectionStarts.length} entries (threshold: ${keep}). No trimming needed.`);
    process.exit(0);
  }

  const cutIndex = sectionStarts[sectionStarts.length - keep];
  const headerEnd = sectionStarts[0];
  const header = lines.slice(0, headerEnd).join('\n').trimEnd();
  const oldEntries = lines.slice(headerEnd, cutIndex).join('\n').trimEnd();
  const remaining = lines.slice(cutIndex).join('\n').trimEnd();

  const archiveDir = join(nodesDir, 'archive');
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
  const dateStr = today();
  const archPath = join(archiveDir, `decisions-${dateStr}.md`);
  writeUtf8(archPath, `# Archived Decisions (${dateStr})\n\n> Trimmed from DECISIONS.md (kept latest ${keep} entries).\n\n${oldEntries}\n`);
  console.log(`Archived ${sectionStarts.length - keep} old entries to archive/decisions-${dateStr}.md`);

  writeUtf8(decPath, `${header}\n\n> Older entries archived: archive/decisions-*.md\n\n${remaining}\n`);
  console.log(`OK: DECISIONS.md trimmed to ${keep} entries.`);
  process.exit(0);
}

// ---------- verify-batch ----------
function verifyBatch(vNode, vSession, vBatch) {
  const n = vBatch;
  const n1 = n + 1;
  let fails = 0;
  const ctxPath = join(nodesDir, 'CONTEXT.md');
  const progPath = join(nodesDir, 'PROGRESS.md');
  const sessPath = join(nodesDir, 'SESSIONS', `${vSession}.md`);

  console.log(`Batch checkpoint verify (node: ${vNode} | session: ${vSession} | batch ${n})`);

  function check(ok, label, fix) {
    if (ok) { console.log(`  [OK]   ${label}`); }
    else { console.log(`  [FAIL] ${label}`); if (fix) console.log(`         Fix: ${fix}`); fails++; }
  }

  check(existsSync(ctxPath), 'CONTEXT.md exists', 'Run init-nodes');
  check(existsSync(progPath), 'PROGRESS.md exists', 'Run init-nodes');
  check(existsSync(join(nodesDir, 'SESSIONS')), 'SESSIONS/ directory exists', 'Run init-nodes');

  const prog = readUtf8(progPath) || '';
  const nodeLines = prog.split(/\r?\n/).filter(l => /^\|/.test(l) && l.includes(vNode));
  check(nodeLines.length > 0, `PROGRESS.md contains node: ${vNode}`, 'Register node in PROGRESS.md');

  // Batch status
  const nextPat = new RegExp(`(?<!\\d)${n1}/\\d+`);
  let statusOk = false;
  for (const l of nodeLines) {
    if (nextPat.test(l) || l.includes('待验收')) { statusOk = true; break; }
  }
  check(statusOk, `PROGRESS node status is batch ${n1}/M or pending-review`, `Update PROGRESS status to batch ${n1}/M or pending-review`);

  // SESSIONS non-empty
  const sessOk = existsSync(sessPath) && statSync(sessPath).size > 0;
  check(sessOk, `SESSIONS/${vSession}.md non-empty`, 'Write session state per template');

  // Batch completion marker
  const sessTxt = readUtf8(sessPath) || '';
  const markers = [`已完成批${n}`, `批${n} 已完成`, `batch ${n} done`, `completed batch ${n}`];
  check(markers.some(m => sessTxt.includes(m)), `SESSIONS contains batch ${n} completion marker`, `Write: completed batch ${n}: <output>`);

  // CONTEXT today
  const ctx = readUtf8(ctxPath) || '';
  check(ctx.includes(today()), 'CONTEXT.md last-updated is today', 'Rewrite CONTEXT.md with today date');

  // CONTEXT freshness
  const ctxHasNode = ctx.includes(vNode);
  let ctxNextOk = false;
  const ctxLines = ctx.split(/\r?\n/);
  for (let i = 0; i < ctxLines.length; i++) {
    if (ctxLines[i].includes('下一步')) {
      const chunk = ctxLines.slice(i, i + 4).join('\n');
      const nextRe = new RegExp(`(?<!\\d)${n1}(?!\\d)`);
      if (nextRe.test(chunk) || chunk.includes('待验收')) ctxNextOk = true;
      break;
    }
  }
  check(ctxHasNode && ctxNextOk, `CONTEXT.md contains node and next-step points to batch ${n1} or pending-review`, `Rewrite CONTEXT.md next-step`);

  // Tombstone info
  const stale = getStaleTombstone();
  if (stale) console.log(`  [WARN] Compaction tombstone with no subsequent writes — run check-tombstone`);

  if (fails > 0) {
    console.log(`\n[FAIL] Batch checkpoint verify failed (${fails} items). Fix and re-run.`);
  } else {
    console.log('\n[OK] Batch checkpoint verify passed.');
  }
  return fails;
}

if (action === 'verify-batch') {
  process.exit(verifyBatch(node, session, parseInt(batch, 10)) > 0 ? 1 : 0);
}

// ---------- commit ----------
if (action === 'commit') {
  const ctxSrc = isAbsolute(contextFile) ? contextFile : join(project, contextFile);
  if (!existsSync(ctxSrc)) die(`ContextFile not found: ${ctxSrc}`);
  const ctxDst = join(nodesDir, 'CONTEXT.md');
  if (resolve(ctxSrc) === resolve(ctxDst)) die('ContextFile must not be CONTEXT.md itself');

  const r = acquireLock(session);
  if (!r.ok) { console.error(`[FAIL] ${r.msg} ContextFile preserved for retry.`); process.exit(1); }

  writeUtf8(ctxDst, readUtf8(ctxSrc));
  unlinkSync(ctxSrc);
  console.log('OK: CONTEXT.md atomically replaced, staged file cleaned');

  releaseLock(session);
  console.log(`OK: Lock released (${session})`);

  process.exit(verifyBatch(node, session, parseInt(batch, 10)) > 0 ? 1 : 0);
}

// ---------- save (one-shot non-batch) ----------
let actionForVerify = action;
if (action === 'save') {
  const ctxSrc = isAbsolute(contextFile) ? contextFile : join(project, contextFile);
  if (!existsSync(ctxSrc)) die(`ContextFile not found: ${ctxSrc}`);
  const ctxDst = join(nodesDir, 'CONTEXT.md');
  if (resolve(ctxSrc) === resolve(ctxDst)) die('ContextFile must not be CONTEXT.md itself');

  const r = acquireLock(session);
  if (!r.ok) { console.error(`[FAIL] ${r.msg} ContextFile preserved for retry.`); process.exit(1); }

  writeUtf8(ctxDst, readUtf8(ctxSrc));
  unlinkSync(ctxSrc);
  console.log('OK: CONTEXT.md atomically replaced, staged file cleaned');

  releaseLock(session);
  console.log(`OK: Lock released (${session})`);

  actionForVerify = 'verify';  // fall through to verify
}

// ---------- verify ----------
if (actionForVerify === 'verify' || action === 'verify') {
  let fails = 0;
  function check(ok, label, fix) {
    if (ok) { console.log(`  [OK]   ${label}`); }
    else { console.log(`  [FAIL] ${label}`); if (fix) console.log(`         Fix: ${fix}`); fails++; }
  }

  const mode = completed ? 'node-complete' : 'mid-checkpoint';
  console.log(`Checkpoint verify (node: ${node || '-'} | session: ${session} | ${mode})`);

  const ctxPath = join(nodesDir, 'CONTEXT.md');
  const progPath = join(nodesDir, 'PROGRESS.md');
  const decPath = join(nodesDir, 'DECISIONS.md');
  const sessPath = join(nodesDir, 'SESSIONS', `${session}.md`);

  check(existsSync(ctxPath), 'CONTEXT.md exists', 'Run init-nodes');
  check(existsSync(progPath), 'PROGRESS.md exists', 'Run init-nodes');
  check(existsSync(decPath), 'DECISIONS.md exists', 'Run init-nodes');
  check(existsSync(join(nodesDir, 'SESSIONS')), 'SESSIONS/ directory exists', 'Run init-nodes');

  if (node) {
    const prog = readUtf8(progPath) || '';
    check(prog.includes(node), `PROGRESS.md contains node: ${node}`, 'Register node in PROGRESS.md');
  }

  const sessOk = existsSync(sessPath) && statSync(sessPath).size > 0;
  check(sessOk, `SESSIONS/${session}.md non-empty`, 'Write session state per template');

  const ctx = readUtf8(ctxPath) || '';
  check(ctx.includes(today()), 'CONTEXT.md last-updated is today', 'Rewrite CONTEXT.md with today date');

  if (completed) {
    if (!node) die('-completed requires --node');
    const archPath = join(nodesDir, 'archive', `${node}.md`);
    if (!existsSync(archPath)) {
      const tplPath = join(nodesDir, 'archive', '_template.md');
      if (existsSync(tplPath)) {
        writeUtf8(archPath, readUtf8(tplPath).replace(/{节点名}/g, node));
        console.log(`  [OK]   archive/${node}.md (skeleton generated — fill in details)`);
      } else {
        check(false, `archive/${node}.md exists`, 'Create from template');
      }
    } else {
      check(true, `archive/${node}.md exists`);
    }
  }

  // Info: DECISIONS line count
  if (existsSync(decPath)) {
    const decLines = (readUtf8(decPath) || '').split(/\r?\n/).length;
    if (decLines > 200) {
      console.log(`  [WARN] DECISIONS.md has ${decLines} lines (threshold: 200). Run: node save.mjs trim-decisions`);
    }
  }

  // Info: stale pending-review nodes
  if (existsSync(progPath)) {
    const progLines = (readUtf8(progPath) || '').split(/\r?\n/);
    for (const pl of progLines) {
      if (/^\|/.test(pl) && pl.includes('待验收')) {
        const dateMatch = pl.match(/(\d{4}-\d{2}-\d{2})\s*\|?\s*$/);
        if (dateMatch) {
          const days = Math.floor((Date.now() - new Date(dateMatch[1]).getTime()) / 86400000);
          if (days > 14) {
            const fields = pl.split('|');
            const nname = fields.length >= 3 ? fields[2].trim() : '?';
            console.log(`  [WARN] Node '${nname}' has been pending-review for ${days} days`);
          }
        }
      }
    }
  }

  // Info: tombstone
  const stale = getStaleTombstone();
  if (stale) console.log(`  [WARN] Compaction tombstone with no subsequent writes — run check-tombstone`);

  if (fails > 0) {
    console.log(`\n[FAIL] Checkpoint verify failed (${fails} items). Fix and re-run.`);
    process.exit(1);
  }
  console.log('\n[OK] Checkpoint verify passed.');
  process.exit(0);
}
