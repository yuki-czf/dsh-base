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
 *   node save.mjs checkpoint --node "Run login flow" --session main [--recon "..."] [--note "..."]
 *   node save.mjs review-audit [--over 14]
 *   node save.mjs check-tombstone
 *   node save.mjs trim-decisions [--keep 20]
 *   node save.mjs trim-context [--apply] [--max-ctx-lines 60] [--max-ctx-line-chars 6000]
 *   node save.mjs trim-progress [--apply] [--max-prog-row-chars 600]
 *   # v1.7.0 cap gate: save/commit/verify hard-check core ledger caps
 *   #   (CONTEXT <=60 lines & every line <=6000 chars; PROGRESS table rows <=600 chars;
 *   #    DECISIONS <=200 lines). Violation -> exit 4 (save/commit) or verify FAIL,
 *   #    one nudge per 10-min window (marker .nodes/.cap-nudge), everything else fail-open.
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

const VALID_ACTIONS = ['lock', 'unlock', 'verify', 'verify-batch', 'commit', 'save', 'checkpoint', 'review-audit', 'check-tombstone', 'trim-decisions', 'trim-context', 'trim-progress'];
if (!VALID_ACTIONS.includes(action)) {
  console.error(`Usage: node save.mjs <${VALID_ACTIONS.join('|')}> [options]`);
  process.exit(1);
}

// v1.7.0 cap knobs
const apply = hasFlag('apply');
const maxCtxLines = parseInt(getArg('max-ctx-lines', '60'), 10);
const maxCtxLineChars = parseInt(getArg('max-ctx-line-chars', '6000'), 10);
const maxProgRowChars = parseInt(getArg('max-prog-row-chars', '600'), 10);
const nodeColChars = parseInt(getArg('node-col-chars', '120'), 10);
const criteriaColChars = parseInt(getArg('criteria-col-chars', '250'), 10);
const statusColChars = parseInt(getArg('status-col-chars', '200'), 10);
const capNudgePath = join(nodesDir, '.cap-nudge');

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
if (action === 'checkpoint') {
  if (!node) die('checkpoint requires --node');
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

// ---------- cap gate helpers (v1.7.0) ----------
function getCapViolations(ctxText, progText, decText) {
  const v = [];
  if (ctxText) {
    const cl = ctxText.split(/\r?\n/);
    if (cl.length > maxCtxLines) v.push({ file: 'CONTEXT.md', code: 'lines', detail: `${cl.length} lines > ${maxCtxLines}` });
    const long = [];
    cl.forEach((l, i) => { if (l.length > maxCtxLineChars) long.push(i + 1); });
    if (long.length > 0) v.push({ file: 'CONTEXT.md', code: 'line-chars', detail: `line(s) ${long.join(',')} > ${maxCtxLineChars} chars` });
  }
  if (progText) {
    const rows = progText.split(/\r?\n/).filter(l => /^\|\s*\d+\s*\|/.test(l) && l.length > maxProgRowChars);
    if (rows.length > 0) v.push({ file: 'PROGRESS.md', code: 'row-chars', detail: `${rows.length} table row(s) > ${maxProgRowChars} chars` });
  }
  if (decText) {
    const dl = decText.split(/\r?\n/).length;
    if (dl > 200) v.push({ file: 'DECISIONS.md', code: 'lines', detail: `${dl} lines > 200` });
  }
  return v;
}

function getCapFingerprint(violations) {
  return violations.map(x => `${x.file}:${x.code}`).sort().join(' | ');
}

function testCapNudgeFresh(fingerprint) {
  if (!existsSync(capNudgePath)) return false;
  try {
    const raw = readUtf8(capNudgePath);
    if (!raw || raw.trim() !== fingerprint) return false;
    const ageMin = (Date.now() - statSync(capNudgePath).mtime.getTime()) / 60000;
    return ageMin < 10;
  } catch { return false; }
}

// Gate for save/commit: returns true when the action must be blocked (caller exits 4).
function testCapBlocked(stage, stagedCtx) {
  let ctxTxt = null, progTxt = null, decTxt = null;
  try {
    progTxt = readUtf8(join(nodesDir, 'PROGRESS.md'));
    decTxt = readUtf8(join(nodesDir, 'DECISIONS.md'));
  } catch { return false; }
  if (stagedCtx) { ctxTxt = stagedCtx; }
  else { try { ctxTxt = readUtf8(join(nodesDir, 'CONTEXT.md')); } catch { ctxTxt = null; } }
  let viol = [];
  try { viol = getCapViolations(ctxTxt, progTxt, decTxt); } catch { return false; }
  if (viol.length === 0) {
    try { if (existsSync(capNudgePath)) unlinkSync(capNudgePath); } catch { }
    return false;
  }
  const fp = getCapFingerprint(viol);
  if (testCapNudgeFresh(fp)) {
    console.log(`  [WARN] Cap violations present (nudge already shown within 10-min window, proceeding): ${fp}`);
    return false;
  }
  try { writeUtf8(capNudgePath, fp); } catch { }
  console.error(`[CAP-GATE] Core ledger files exceed hard caps (${stage}). Blocked this once; fix then re-run.`);
  for (const x of viol) console.error(`  - ${x.file} [${x.code}] ${x.detail}`);
  console.error(`  Fix (dry-run first, then --apply):`);
  console.error(`    node save.mjs trim-context    # roll finished entries out of CONTEXT.md -> archive/`);
  console.error(`    node save.mjs trim-progress   # truncate oversized PROGRESS.md rows -> archive/`);
  console.error(`    node save.mjs trim-decisions  # if DECISIONS.md exceeds the 200-line cap`);
  console.error(`  Re-running the SAME command within 10 minutes proceeds anyway (one nudge per window).`);
  return true;
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

// ---------- checkpoint (v1.6.1) ----------
// Lightweight mid-session marker: appends ONE line to SESSIONS/<session>.md.
// No lock, no CONTEXT write — the low-friction form of 批内检查点 (efficiency protocol #3)
// and the canonical way to register 开工侦察 conclusions (verify soft-checks for it).
if (action === 'checkpoint') {
  const recon = getArg('recon', '');
  const note = getArg('note', '');
  if (!recon && !note) die('checkpoint requires --recon and/or --note');
  const sessDir = join(nodesDir, 'SESSIONS');
  if (!existsSync(sessDir)) mkdirSync(sessDir, { recursive: true });
  const sessPath = join(sessDir, `${session}.md`);
  const prev = readUtf8(sessPath);
  const body = (prev === null ? `# 会话 ${session} 状态\n` : prev).trimEnd();
  const parts = [`- [checkpoint ${nowStamp()}] node=${node}`];
  if (recon) parts.push(`侦察=${recon}`);
  if (note) parts.push(`note=${note}`);
  writeUtf8(sessPath, `${body}\n${parts.join(' · ')}\n`);
  console.log(`OK: checkpoint appended to SESSIONS/${session}.md (node=${node})`);
  process.exit(0);
}

// ---------- review-audit (v1.6.1) ----------
// Convergence valve for pending-review nodes: lists nodes stuck in 待验收
// longer than --over days (default 14). Exit 3 = overdue found (warning).
if (action === 'review-audit') {
  const over = parseInt(getArg('over', '14'), 10);
  const rawProg = readUtf8(join(nodesDir, 'PROGRESS.md'));
  if (!rawProg) die('PROGRESS.md not found or empty');
  const rows = rawProg.split(/\r?\n/).filter(l => /^\|/.test(l) && l.includes('待验收'));
  let overdue = 0;
  console.log(`Pending-review audit (threshold > ${over} days): ${rows.length} node(s) pending review`);
  for (const l of rows) {
    const m = l.match(/(\d{4}-\d{2}-\d{2})\s*\|?\s*$/);
    if (!m) continue;
    const days = Math.floor((Date.now() - new Date(m[1]).getTime()) / 86400000);
    if (days > over) {
      overdue++;
      const fields = l.split('|');
      const nname = fields.length >= 3 ? fields[2].trim().slice(0, 48) : '?';
      console.log(`  [OVERDUE ${days}d] ${nname}`);
    }
  }
  if (overdue > 0) {
    console.log(`\n[WARN] ${overdue} overdue node(s). Actions per node: accept (mark reviewed) / deprecate / keep with reason.`);
    process.exit(3);
  }
  console.log('\nOK: No overdue pending-review nodes.');
  process.exit(0);
}

// ---------- trim-context (v1.7.0) ----------
// Rule A: blockquote line (> ...) over the char cap -> archived, replaced by dated pointer.
// Rule B: node entries "- **#<id> ✅..." -> archived. In-progress/plan entries untouched.
if (action === 'trim-context') {
  const ctxPathT = join(nodesDir, 'CONTEXT.md');
  if (!existsSync(ctxPathT)) die('CONTEXT.md not found');
  const dateStr = today();
  const archRel = `archive/context-${dateStr}.md`;
  const linesT = (readUtf8(ctxPathT) || '').split(/\r?\n/);
  const kept = [];
  const rolled = [];
  const doneEntry = /^\s*-\s*\*{0,2}#\d+\s*✅/;
  for (const ln of linesT) {
    if (/^\s*>/.test(ln) && ln.length > maxCtxLineChars) {
      rolled.push(ln);
      kept.push(`> 最后更新: ${dateStr} (full history -> ${archRel})`);
    } else if (doneEntry.test(ln)) {
      rolled.push(ln);
    } else {
      kept.push(ln);
    }
  }
  const maxLine = kept.reduce((m, k) => Math.max(m, k.length), 0);
  console.log(`trim-context: would roll out ${rolled.length} line(s); CONTEXT.md -> ${kept.length} lines (cap ${maxCtxLines}), longest kept line ${maxLine} chars (cap ${maxCtxLineChars})`);
  if (rolled.length === 0) { console.log('OK: nothing to roll out.'); process.exit(0); }
  if (!apply) { console.log('Dry-run only. Re-run with --apply to write the archive and rewrite CONTEXT.md.'); process.exit(0); }
  const archiveDir = join(nodesDir, 'archive');
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
  const archPath = join(nodesDir, archRel);
  const archBody = rolled.join('\r\n').trimEnd();
  const existing = readUtf8(archPath);
  writeUtf8(archPath, existing
    ? `${existing.trimEnd()}\n\n${archBody}\n`
    : `# CONTEXT rolled-out entries (${dateStr})\n\n> Moved by trim-context (node-architect v1.7.0). Original order preserved.\n\n${archBody}\n`);
  writeUtf8(ctxPathT, `${kept.join('\r\n').trimEnd()}\n`);
  console.log(`OK: archived ${rolled.length} line(s) to ${archRel}; CONTEXT.md rewritten.`);
  process.exit(0);
}

// ---------- trim-progress (v1.7.0) ----------
// Both-end anchored row parse (cells may contain raw '|'): | id | name | criteria... | status | owner | date |
// Full original rows archived under "## #<id>". Budget math guarantees the rebuilt row fits the cap.
if (action === 'trim-progress') {
  const progPathT = join(nodesDir, 'PROGRESS.md');
  if (!existsSync(progPathT)) die('PROGRESS.md not found');
  const dateStr = today();
  const archRel = `archive/progress-rows-${dateStr}.md`;
  const linesP = (readUtf8(progPathT) || '').split(/\r?\n/);
  const outLines = [];
  const sections = [];
  const ellip = '\u2026';
  for (const ln of linesP) {
    if (/^\|\s*\d+\s*\|/.test(ln) && ln.length > maxProgRowChars) {
      const m = ln.match(/^\|\s*(\d+)\s*\|(.*)\|\s*([^|]*?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*$/);
      if (!m) { outLines.push(ln); console.log(`  skip row (unparsable tail): ${ln.slice(0, 40)}...`); continue; }
      const nodeId = m[1], middle = m[2], owner = m[3].trim(), dateCol = m[4];
      const segs = middle.split('|').map(s => s.trim());
      if (segs.length < 3) { outLines.push(ln); console.log(`  skip row (too few middle cells): #${nodeId}`); continue; }
      const nameSeg = segs[0];
      const statusSeg = segs[segs.length - 1];
      const critSeg = segs.slice(1, -1).join('|');
      const nameNew = nameSeg.length > nodeColChars ? nameSeg.slice(0, nodeColChars - 1) + ellip : nameSeg;
      const statusNew = statusSeg.length > statusColChars ? statusSeg.slice(0, statusColChars - 1) + ellip : statusSeg;
      const overhead = nodeId.length + owner.length + dateCol.length + 24;
      let critBudget = maxProgRowChars - overhead - nameNew.length - statusNew.length;
      if (critBudget > criteriaColChars) critBudget = criteriaColChars;
      if (critBudget < 40) critBudget = 40;
      let critNew = critSeg.length > critBudget ? critSeg.slice(0, critBudget - 1) + ellip : critSeg;
      let row = `| ${nodeId} | ${nameNew} | ${critNew} | ${statusNew} | ${owner} | ${dateCol} |`;
      if (row.length > maxProgRowChars) {
        const excess = row.length - maxProgRowChars;
        const keepAt = Math.max(1, critNew.length - excess - 1);
        critNew = critNew.slice(0, keepAt) + ellip;
        row = `| ${nodeId} | ${nameNew} | ${critNew} | ${statusNew} | ${owner} | ${dateCol} |`;
      }
      outLines.push(row);
      const note = ln.includes('\u{1F7E1}') ? '\n> NOTE: in-progress node -- full row preserved below (do not lose current state).\n' : '';
      sections.push(`## #${nodeId}${note}\n${ln}`);
      console.log(`  row #${nodeId} : ${ln.length} -> ${row.length} chars`);
    } else {
      outLines.push(ln);
    }
  }
  if (sections.length === 0) { console.log(`OK: no PROGRESS.md rows exceed ${maxProgRowChars} chars.`); process.exit(0); }
  console.log(`trim-progress: ${sections.length} row(s) affected.`);
  if (!apply) { console.log('Dry-run only. Re-run with --apply to write the archive and rewrite PROGRESS.md.'); process.exit(0); }
  const archPath = join(nodesDir, archRel);
  const archBody = sections.join('\n\n');
  const existing = readUtf8(archPath);
  writeUtf8(archPath, existing
    ? `${existing.trimEnd()}\n\n${archBody}\n`
    : `# PROGRESS rolled-out rows (${dateStr})\n\n> Full original rows moved by trim-progress (node-architect v1.7.0). Locate by '## #<id>'.\n\n${archBody}\n`);
  writeUtf8(progPathT, `${outLines.join('\r\n').trimEnd()}\n`);
  console.log(`OK: ${sections.length} full row(s) archived to ${archRel}; PROGRESS.md rewritten within caps.`);
  process.exit(0);
}

if (action === 'trim-decisions') {
  const decPath = join(nodesDir, 'DECISIONS.md');
  if (!existsSync(decPath)) die('DECISIONS.md not found');
  const raw = readUtf8(decPath);
  const lines = raw.split(/\r?\n/);
  const sectionStarts = [];
  lines.forEach((l, i) => { if (/^## /.test(l)) sectionStarts.push(i); });

  // v1.7.0 line-aware keep: shrink the keep-count until remaining physical lines fit the
  // 200-line cap (floor: 5 entries). Entry-count threshold alone is not sufficient --
  // 20 multi-line entries can still exceed the cap (e.g. 203 lines).
  let keepN = Math.min(keep, sectionStarts.length);
  const headerEnd = sectionStarts[0];
  let cutIndex = 0;
  let remLines = 0;
  while (true) {
    cutIndex = sectionStarts[sectionStarts.length - keepN];
    remLines = headerEnd + (lines.length - cutIndex) + 4;   // header + kept entries + inserted archive-note block
    if (remLines <= 200 || keepN <= 5) break;
    keepN--;
  }
  if (keepN >= sectionStarts.length) {
    console.log(`OK: DECISIONS.md has ${sectionStarts.length} entries (${lines.length} lines). No trimming needed.`);
    process.exit(0);
  }
  if (remLines > 200 && keepN <= 5) {
    console.log(`[WARN] DECISIONS.md still ${remLines} lines at the 5-entry floor - largest entries are very tall; consider a manual split.`);
  }
  const header = lines.slice(0, headerEnd).join('\n').trimEnd();
  const oldEntries = lines.slice(headerEnd, cutIndex).join('\n').trimEnd();
  const remaining = lines.slice(cutIndex).join('\n').trimEnd();

  const archiveDir = join(nodesDir, 'archive');
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
  const dateStr = today();
  const archPath = join(archiveDir, `decisions-${dateStr}.md`);
  // v1.6.1 fix: same-day re-trim must APPEND, not overwrite (old entries would be lost)
  const existing = readUtf8(archPath);
  writeUtf8(archPath, existing
    ? `${existing.trimEnd()}\n\n${oldEntries}\n`
    : `# Archived Decisions (${dateStr})\n\n> Trimmed from DECISIONS.md (kept latest ${keep} entries).\n\n${oldEntries}\n`);
  console.log(`Archived ${sectionStarts.length - keepN} old entries to archive/decisions-${dateStr}.md`);

  writeUtf8(decPath, `${header}\n\n> Older entries archived: archive/decisions-*.md\n\n${remaining}\n`);
  console.log(`OK: DECISIONS.md trimmed to ${keepN} entries (${remLines} lines <= 200 cap).`);
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

  // Batch-specific D (v1.6.0 执行效率协议): plans file recon (batch 1) / calibration (batch 2+)
  const plansPath = join(nodesDir, 'plans', `${vNode}.md`);
  if (n === 1) {
    let reconOk = false;
    let reconFix = `create .nodes/plans/${vNode}.md from template`;
    if (existsSync(plansPath)) {
      const plansTxt = readUtf8(plansPath) || '';
      const plines = plansTxt.split(/\r?\n/);
      let sIdx = -1, eIdx = plines.length;
      for (let i = 0; i < plines.length; i++) {
        if (sIdx < 0 && /^#{1,3}\s*开工侦察/.test(plines[i])) { sIdx = i + 1; continue; }
        if (sIdx >= 0 && /^(#{1,3}\s|\|)/.test(plines[i])) { eIdx = i; break; }
      }
      if (sIdx < 0) {
        reconOk = true; // legacy plan (pre-v1.5.0, no recon section): skip
        reconFix = '';
      } else {
        const seg = eIdx > sIdx ? plines.slice(sIdx, eIdx).join('\n') : '';
        const hits2 = [...seg.matchAll(/\{[^{}\r\n]+\}/g)].map(m => m[0]);
        reconOk = hits2.length === 0;
        reconFix = `fill 开工侦察 placeholders in plans/${vNode}.md: ${hits2.join(', ')}`;
      }
    }
    check(reconOk, `plans/${vNode}.md recon section filled (batch 1)`, reconFix);
  } else {
    let calibOk = false;
    let calibFix = `backfill calibration log for batch ${n} in plans/${vNode}.md`;
    if (existsSync(plansPath)) {
      calibOk = new RegExp(`批${n}(?!\\d)`).test(readUtf8(plansPath) || '');
    } else {
      calibFix = `create .nodes/plans/${vNode}.md (missing)`;
    }
    check(calibOk, `plans calibration log contains batch ${n}`, calibFix);
  }

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

  if (testCapBlocked('commit', readUtf8(ctxSrc))) {
    console.error('[FAIL] Cap gate blocked commit. ContextFile preserved for retry.');
    process.exit(4);
  }

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

  if (testCapBlocked('save', readUtf8(ctxSrc))) {
    console.error('[FAIL] Cap gate blocked save. ContextFile preserved for retry.');
    process.exit(4);
  }

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

  // v1.6.1 efficiency protocol: recon marker soft check (WARN only, never FAIL).
  // A session line must contain BOTH the node name and the recon marker (侦察).
  if (node && existsSync(sessPath)) {
    const sessTxt = readUtf8(sessPath) || '';
    const hasRecon = sessTxt.split(/\r?\n/).some(l => l.includes(node) && l.includes('侦察'));
    if (!hasRecon) {
      console.log(`  [WARN] No recon marker for node '${node}' in SESSIONS/${session}.md — run: node save.mjs checkpoint --node <N> --session <S> --recon "..." (efficiency protocol)`);
    }
  }

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
      // 执行效率协议 v1.5：归档不得残留未替换的模板占位符（骨架生成那一轮除外）
      const tplPath2 = join(nodesDir, 'archive', '_template.md');
      if (existsSync(tplPath2)) {
        const archTxt = readUtf8(archPath) || '';
        const hits = [...(readUtf8(tplPath2) || '').matchAll(/\{[^{}\r\n]+\}/g)]
          .map((m) => m[0]).filter((tok) => archTxt.includes(tok));
        check(hits.length === 0, `archive/${node}.md placeholders filled`, `Replace remaining template placeholders: ${hits.join(', ')}`);
      }
    }
  }

  // v1.7.0 cap gate in verify: hard caps as FAIL items (exit 1); a fresh nudge marker
  // (written by save/commit/verify within the 10-min window) downgrades them to WARN.
  let violV = [];
  try { violV = getCapViolations(readUtf8(ctxPath), readUtf8(progPath), readUtf8(decPath)); } catch { violV = []; }
  if (violV.length > 0) {
    const fpV = getCapFingerprint(violV);
    if (testCapNudgeFresh(fpV)) {
      for (const x of violV) console.log(`  [WARN] Cap violation (nudged, proceeding): ${x.file} [${x.code}] ${x.detail}`);
    } else {
      try { writeUtf8(capNudgePath, fpV); } catch { }
      for (const x of violV) {
        check(false, `CAP ${x.file} [${x.code}] ${x.detail}`, 'run trim-context / trim-progress / trim-decisions (dry-run then --apply); re-running within 10 min proceeds anyway');
      }
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
