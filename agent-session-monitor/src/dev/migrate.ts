import { loadConfig, ROOT_DIR } from '../config.js';
import { openDb, migrate, currentVersion } from '../db.js';

const cfg = loadConfig();
const db = openDb(cfg.dataDir);
migrate(db);
console.log(`迁移完成，当前版本 v${currentVersion(db)}（目标 v${1}），库: ${ROOT_DIR}/data/monitor.db`);
db.close();
