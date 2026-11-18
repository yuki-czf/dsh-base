# 节点 #37 · dotdir-locate-fix — opencode glob/grep 点目录不可见导致存档 skill 找不到 .nodes

> 状态：**待开始**（2026-11-18 登记；用户指令：先记录问题，修复暂不执行）
> Owner：opencode-main

## 现象

opencode（V2）里 plan / build 两个 agent 调用 node-architect 存档 skill 时，都可能「找不到 .nodes 目录」——agent 用 glob/grep 探测存在性得到假阴性，误判「未装协议」→ 乱写档案到别处（如 `~/.opencode/plan`）或重复 init。

## 根因实证（2026-11-18 esp2b 会话三连探针）

| 探测方式 | 结果 |
|---|---|
| `glob(".nodes/*")` 默认参数 | No files found（目录实际存在） |
| `glob(".nodes/*", hidden:true)` | 列出 PROTOCOL/PROGRESS/DECISIONS/CONTEXT 4 文件 |
| `read(".nodes/CONTEXT.md")` 直读 | 正常 |
| `glob(".agents/skills/node-architect/scripts/*")` | No files found（skill 脚本目录同样中招） |

结论：不是 opencode v2 弄丢目录，是 **glob/grep 工具默认跳过点目录**（ripgrep 语义 hidden=false）。read/write/edit/shell 直写路径不受影响；只有「存在性探测」「文件搜索」两类动作会假阴性。plan/build 共用同一套工具，所以一起翻车。据当前所知 opencode 无配置项可改 glob 默认值，修复只能落在指令层与脚本层。

## 修复方案（纯 skill 方案 · 母版 v1.13.4 → 1.13.5）

> 设计约束（2026-11-18 审查定案）：**不通过项目根 `AGENTS.md` 加限制、不修改全局 `AGENTS.md`、不在项目根写 `.ignore`**（实测 `.ignore` 解禁 `.nodes`/`.agents` 会把 `.agents/backup/` 与 `.nodes/archive/` 暴露给日常代码检索，污染上下文）。全部修复收口在 `node-architect` skill 内部；老旧孤儿文件 `SKILL-FULL.md` 与 `init-nodes` 老指针迁移从本节点剥离，避免耦合。

1. `skill/SKILL.md`：
   - frontmatter `version: 1.13.5`。
   - `description` **第一句话**改为动作指引（控制在 80 字内，兼顾本机 `skill-compact.js` 对 `flash-build` 的首句截断）：`长项目节点存档协议：开工先直读 .nodes/CONTEXT.md 或跑 save.ps1 locate 确认（点目录禁 glob）。`
   - `whenToUse` 补明：`.nodes`/`.agents` 为点目录，`glob`/`grep` 默认不可见，禁止据此判无。
   - 铁律区最前插 **铁律 0（落点与探测铁律）**：把「禁止用 glob」转为固定步骤——探测必走 `save.ps1 locate` 或直读 `.nodes/CONTEXT.md`；含 Plan 模式豁免句（规划草稿可留 harness plan 区，正式节点档案必须在 build 模式落 `.nodes`）。
   - 效率条款同步把 `save.ps1 locate` 与脚本路径照抄置于首位。
2. `skill/commands/plan-node.md`、`node-save.md`：
   - 第 0 步删除「若 `.nodes/` 不存在……」这类诱发 `glob` 探测的空泛条件，改为固定动作：先跑 `save.ps1 locate`（或 `save.mjs locate`，或直读 `.nodes/CONTEXT.md`），**仅退出码 2 才判定未安装**。
3. `skill/references/PROTOCOL.md`：
   - `## 开工协议` 增加第 0 步「定位档案根」（控制在 2–3 行，守住 150 行红线，当前 102 行）。
4. `skill/references/QUICKREF.md`：
   - 新增「定位 `.nodes`」小节（`save.ps1 locate` 用法）；退出码表补 `2 = 未安装（未找到 .nodes）`。
5. `skill/scripts/save.ps1` + `save.mjs`：
   - 新增 `locate` 动作：`ValidateSet`（`save.ps1:28`）与 `VALID_ACTIONS`（`save.mjs:56`）同步加 `'locate'`。
   - **必须插在 `nodesDir` 存在性校验抛出异常之前**（`save.ps1:59-61` / `save.mjs:47-54`），否则未安装目录调 `locate` 会直接报错退出。
   - 语义：从 `-Project` / `--project`（默认 cwd）向上逐级查找 `.nodes`；命中即打印项目根与 `.nodes` 路径并 `exit 0`；**若当前检查目录已存在 `.git` 但无 `.nodes`，或已达盘符根仍未命中，立即停止上溯并 `exit 2`**（防误命中家目录或父级仓库里无关的 `.nodes`）。

## 实施注意

- `save.ps1` 必须保 UTF-8 BOM（`EF BB BF`）：用片段替换、勿整文件重写，改完 3 字节头部复核；`save.mjs` 保持无 BOM；均过 PS5.1 `ParseFile` / `node --check`。
- 收口按「双母版维护」流程：`sync-skills.ps1` 全绿 → `pack.ps1` 重打包 → 本仓 `install.ps1` 同步（推送须用户明示）。
- 已知唯一边界：冷启动新会话且用户未提及节点/存档时，只靠 `SKILL.md` `description` 首句提醒与 `init-nodes` 既有指针里的直读路径引导，约束力弱于写死项目 `AGENTS.md`，属纯 skill 路线下的可接受折衷。

## 验收标准（PROGRESS 行同文）

①根因与纯skill定案入DECISIONS：opencode glob/grep跳过点目录；不改项目AGENTS.md、不用.ignore（防backup/archive污染搜索），全靠skill自身+locate解决②母版v1.13.5五处：SKILL（description首句≤80字含禁glob直读/locate＋whenToUse＋铁律0含Plan豁免）／plan-node与node-save第0步改locate或直读（exit2才报未装）／PROTOCOL第0步（≤3行保150红线）／QUICKREF定位节＋退出码2／save.ps1+save.mjs增locate（插在nodesDir报错前，上溯遇.git即停，保BOM）③实测：根目录exit0／子目录命中／无.nodes或.git截断exit2／verify无回归④sync-skills全绿＋pack重打包；执行:—(母版文本与脚本小改，单批自干) 收口:独立复审(locate四态实测替代)
