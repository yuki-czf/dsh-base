// esbuild：把 status/main.mjs 与 panel/main.mjs 各自打包成 IIFE main.js。
// 产物提交进仓库（OpenChamber 不编译扩展代码）。
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // scripts/
const src = path.resolve(here, "..");

const common = {
  bundle: true,
  format: "iife",
  target: "es2022",
  platform: "browser",
  minify: false,
  logLevel: "info",
};

await build({ ...common, entryPoints: [path.join(src, "status", "main.mjs")], outfile: path.join(src, "status", "main.js") });
await build({ ...common, entryPoints: [path.join(src, "panel", "main.mjs")], outfile: path.join(src, "panel", "main.js") });
console.log("[build] done");
