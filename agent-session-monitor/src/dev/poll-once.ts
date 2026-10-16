// 单轮采集验证脚本：node dist/dev/poll-once.js --adapter <openchamber|pi-desktop|zcode|dsh>
import { loadConfig } from '../config.js';
import { OpenChamberAdapter } from '../adapters/openchamber.js';
import { PiDesktopAdapter } from '../adapters/pi-desktop.js';
import { ZCodeAdapter } from '../adapters/zcode.js';
import { DshAdapter } from '../adapters/dsh.js';

const name = process.argv[process.argv.indexOf('--adapter') + 1] ?? 'openchamber';
const cfg = loadConfig();

let adapter;
if (name === 'openchamber') adapter = new OpenChamberAdapter(cfg.adapters.openchamber.port);
else if (name === 'pi-desktop') adapter = new PiDesktopAdapter(cfg.adapters['pi-desktop'].dbPath);
else if (name === 'zcode') adapter = new ZCodeAdapter(cfg.adapters.zcode.dbPath);
else if (name === 'dsh') adapter = new DshAdapter(cfg.adapters.dsh.sessionsDir);
else { console.error(`未知适配器: ${name}`); process.exit(1); }

await adapter.start();
if (name === 'dsh') {
  await (adapter as DshAdapter).initialScan();
  console.log(JSON.stringify({ health: adapter.health() }, null, 2));
} else {
  const t0 = Date.now();
  const deltas = await adapter.poll();
  const ms = Date.now() - t0;
  console.log(JSON.stringify({
    health: adapter.health(),
    elapsedMs: ms,
    deltas: deltas.map(d => ({ kind: d.kind, from: d.from, to: d.to, session: d.record, turn: d.turn })),
  }, null, 2));
}
await adapter.stop();
