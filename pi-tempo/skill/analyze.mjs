// PI-Desktop 里 gemini-3.8-flash 的工具使用体检器（无依赖，Node 18+；node:sqlite 需 Node 22+）
// 用法: node analyze.mjs [<pi.sqlite 路径>] [<sessions 目录>]
// 默认: %USERPROFILE%\.pi-desktop\pi.sqlite 与 %USERPROFILE%\.pi-desktop\sessions
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.USERPROFILE ?? process.env.HOME;
const dbPath = process.argv[2] ?? join(HOME, '.pi-desktop', 'pi.sqlite');
const sessionsDir = process.argv[3] ?? join(HOME, '.pi-desktop', 'sessions');
const CPA = process.argv[4] ?? 'YOUR_PROVIDER_ID'; // CPA provider id（换了就传第 4 个参数）

const db = new DatabaseSync(dbPath, { readOnly: true });
const turns = db.prepare("SELECT id, session_id, status, started_at, ended_at, input_tokens, output_tokens FROM turns WHERE provider_id=? AND model_id='gemini-3.8-flash'").all(CPA);
const sids = [...new Set(turns.map((t) => t.session_id))];
db.close();

const byStatus = {};
let wallSum = 0, wallN = 0, maxWall = 0, tokIn = 0, tokOut = 0;
for (const t of turns) {
  byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const w = (t.ended_at - t.started_at) / 1000;
  if (t.status === 'completed') { wallSum += w; wallN++; maxWall = Math.max(maxWall, w); }
  tokIn += t.input_tokens ?? 0; tokOut += t.output_tokens ?? 0;
}

const toolCalls = new Map(), toolErrs = new Map();
const editCodes = new Map(), bashBuckets = new Map();
let msgTotal = 0, toolMsgTotal = 0, errMsgTotal = 0;

const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

for (const sid of sids) {
  const f = join(sessionsDir, `${sid}.jsonl`);
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'message') continue;
    msgTotal++;
    if (o.role !== 'tool') continue;
    toolMsgTotal++;
    const name = o.toolName ?? '?';
    bump(toolCalls, name);
    if (!o.isError) continue;
    errMsgTotal++;
    bump(toolErrs, name);
    const b = (o.blocks ?? [])[0] ?? {};
    if (name === 'Edit') {
      let code = 'unknown';
      try { code = JSON.parse(b?.result?.content?.[0]?.text ?? '{}').code ?? 'unknown'; } catch {}
      bump(editCodes, code);
      continue;
    }
    if (name === 'Bash') {
      const det = b?.result?.details ?? {};
      if (det.code === 'TOOL_TIMEOUT') { bump(bashBuckets, 'TOOL_TIMEOUT(>60s)'); continue; }
      let env = null; try { env = JSON.parse(b?.result?.content?.[0]?.text ?? 'null'); } catch {}
      const err = String(env?.stderr ?? '').replace(/\s+/g, ' ');
      const out = String(env?.stdout ?? '').replace(/\s+/g, ' ');
      let bucket;
      if (/FAILED|failed\b|AssertionError|test session starts/.test(out + err)) bucket = '测试失败(真实信号)';
      else if (/error TS\d/.test(out + err)) bucket = '类型检查错误(真实信号)';
      else if (/Cannot find path|does not exist|No such file|ENOENT|找不到路径/i.test(err)) bucket = '路径不存在';
      else if (/not recognized|CommandNotFound|无法将.*识别/i.test(err)) bucket = '命令敲错/未安装';
      else if (/ModuleNotFoundError|ImportError|Cannot find module|No module named/i.test(err)) bucket = '依赖/环境缺失';
      else if (/SyntaxError|Unexpected token|ParserError/i.test(err)) bucket = '临时脚本语法错误';
      else if (/warn |Warning|deprecat|browserslist/i.test(err + out)) bucket = 'stderr 噪声(npm/deprecation)';
      else if (env?.exitCode === 1 && !err.trim()) bucket = 'grep/条件未命中(正常)';
      else bucket = `其他(exit=${env?.exitCode ?? det.exitCode ?? '?'})`;
      bump(bashBuckets, bucket);
    }
  }
}

const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
console.log(`# gemini-3.8-flash 体检（PI-Desktop）  ${new Date().toISOString().slice(0, 10)}`);
console.log(`sessions=${sids.length} turns=${turns.length} ${JSON.stringify(byStatus)}`);
console.log(`completed 平均墙钟=${(wallSum / Math.max(1, wallN)).toFixed(0)}s 最长=${maxWall.toFixed(0)}s  token in=${tokIn} out=${tokOut}`);
console.log(`messages=${msgTotal} toolMessages=${toolMsgTotal} toolErrors=${errMsgTotal}`);
console.log('\n## 工具调用 / 错误率');
for (const [n, c] of [...toolCalls].sort((a, b) => (toolErrs.get(b[0]) ?? 0) - (toolErrs.get(a[0]) ?? 0)))
  console.log(`  ${n.padEnd(26)} calls=${String(c).padStart(5)} errors=${String(toolErrs.get(n) ?? 0).padStart(5)} ${pct(toolErrs.get(n) ?? 0, c)}`);
console.log('\n## Edit 失败码');
for (const [k, v] of [...editCodes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\n## Bash 失败分桶');
for (const [k, v] of [...bashBuckets].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
