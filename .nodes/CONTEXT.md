# 项目快照 CONTEXT

> 本文件是项目的一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-09-26（由 node-architect 存档流程维护）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **节点 16**：`共享MCP-ssh-runner-DSH`（待验收）——ssh-runner installer 增补 DSH 客户端：`-Clients dsh` 生成 DSH Agent 预设（完整组装 + `# >>> dsh-mcp-shared:ssh` 受管块），`-DshProjectPreset` 写 `<项目>\.dsh\agent-presets\` 并在 profile patch 幂等登记 roots
- **设计要点**：
  1. DSH 没有项目级 MCP 配置层 → 项目级 opt-in 的唯一载体是 **Agent 预设**（`agent-presets` 按 agent 作用域挂载）；预设必须是完整组装，故生成器 = 基座全文 + 受管块
  2. 基座发现顺序：`-DshPresetSource` 显式 → `$DshHome\.agent-presets\standard\agent.cordis.yml` → DSH 安装目录 `...\dsh-agent-presets\presets\standard\agent.cordis.yml`
  3. 默认写用户根 `$DshHome\.agent-presets\<项目>-ssh\`（零额外配置即被 DSH 发现）；`-DshProjectPreset` 才是"文件随仓库走"+roots 登记
  4. 幂等 = 受管块整块替换（块外逐字节保留）；`preset.yml` 已存在不覆盖
- **开工侦察结论**（小节点，无批次计划，落此）：① 测试基建 = 无（仓库仅 `_diag/` 备份里一个 test），门禁改为自建 temp 沙箱脚本；② 无新依赖；③ 门禁合并成一条：temp 项目 × temp `DSH_HOME` 跑两遍 + 哈希比对 + YAML/JSON 解析

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| main | 节点 16 跨客户端共享 MCP（ssh-runner 增补 DSH 客户端，待验收） | 2026-09-22 |
| perf-gemini-lean | 一次性委托（mubai）+ TTFT 续篇（OpenCode）：Gemini 载荷与行为改造 v3+v12 已落地（详见 SESSIONS/perf-gemini-lean.md 与 _diag/gemini-perf/REPORT.md） | 2026-09-26 |
| opencode-main | 云端线 ssh-runner / remote-install（历史，GitHub 侧） | 2026-08-22 |

## 关键路径提醒

- **工作区是正式 git 克隆**（main ↔ origin/main）：开工先 `git pull`；改完 commit/push；凭据走 Windows 凭据管理器（lapland1009）
- **维护正向流程**：只改母版 `node-architect\skill\` → 重跑 `install.ps1` → `pack.ps1` 刷新 dist → 根 `dist\` 安装包与 README 引用同步换版 → commit/push
- **别项目更新话术**：任意项目说「更新节点协议」→ 全局引导跑母版 install.ps1（幂等，`.nodes` 档案保留）；改触发词后重跑 `-Bootstrap`（写 C 盘，DSH 沙箱内需提权）
- 母版 .ps1 保持 BOM；**新增代码块一律 ASCII-only（CJK 用 \uXXXX 转义）**防剥 BOM 后 PS 5.1 ANSI 解析碎裂；PS 单引号串内禁 `<>`；remote-install.ps1 纯 ASCII 无 BOM
- git 约定：autocrlf=true（仓库 blob LF / Windows 检出 CRLF）；`.gitignore` 忽略本地工作态（.sisyphus/.zcode/_diag/tmp-zcode-e2e/.opencode 生成物/node_modules）
- 版本号唯一真源 = `skill/SKILL.md` frontmatter；PROTOCOL/AGENTS 由 init 运行时注入；verify 的 `-Node` 用无斜杠短名
- 大任务两套范式二选一（询问制）：spec-superflow 或 分批约定；命令速查见 `skill/references/QUICKREF.md`
- **DSH 插件开发坑**（详见 archive/dsh-plan-popup.md）：pnpm file: 副本 inode 不同步、缺 `dsh.client` 声明则浏览器拿不到模块、Shadow DOM 穿透、DOM 自排除、新增 bundle 必须重启
- **本机 ~/.dsh gemini-lean 已到 v12**（2026-09-26）：wire 名单 16（subagent 放行，**需重启 DSH 桌面生效，可调性待实测**）；rulesText 含 plan-first+技能按需（热改已生效）；TSCG 压缩已实测否决（真实目录仅省 0.3%）；standard 会话零影响；回滚 = `.bak-dsh-v12-20260926`（yml）+ `host.js.bak-v11` + 删 rulesText 两行。CPA 侧（家里）：connection-pool 已开、preview 静默切换已关、session-affinity 维持关（实测否决）。教训：工具目录真源是 `system-prompt/assemble` 瀑布（详见 DECISIONS 2026-09-26 两条）

## 下一步

1. **gemini-lean v12 实测**：重启 DSH 桌面 → 新 lean 会话验收（wire 16 / adaptive 掩码日志 / subagent 真调 / 首步 plan-first）→ 与家里侧 CPA-Manager 数据会师 A/B（同任务双端对质 TTFT/缓存命中）
2. **节点 16**：收口（状态 待验收，等用户在 GUI 选一次预设确认工具可见）
3. DSH 插件侧遗留：节点 8 待验收；节点 7 并入 8 验收
4. 并行遗留：节点 3（L2 桥接）进行中——batch-executor 已退役，L2 桥接与派生相关结论按 v1.5.0 口径复核
5. 云端线遗留：#12 dsh-mcp skill（AI 纪律层）**待开始**（与本节点互补：#11 installer 生成器 + #12 纪律层）；新校验（侦察段/校准日志/归档占位符）尚未在真实批次中跑过
