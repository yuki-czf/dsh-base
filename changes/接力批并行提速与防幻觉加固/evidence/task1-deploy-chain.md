# T1 证据：部署链与改名清单（scout 探明 2026-10-20）

## 核心结论
1. **DSH 执行会话实际加载位 = `E:\.dsh\skills\node-run.md`**（实证：session-999658c2 的 skill_content 载入头，见 analysis.txt:269 "Base directory for this skill: E:\.dsh\skills"）
2. dsh-run.md 全机不存在（待创建）；两份 DSH 副本内容仅 provider 行不同：`E:\.dsh`（活体）＝`cpa`，dsh-base 仓内＝`vps-direct`（陈旧）——**用户口径 cpa 与活体一致**
3. `E:\.dsh\skills\` 只含 node-run.md 一个文件；cordis.yml skill-filesystem 只配内置预设目录，无用户目录
4. sync-skills.ps1 对 DSH 侧（E:\.dsh\skills）**零校验零分发**（gap 属实）；其全部 node-run 引用（tmplMap/:70/:87-88/:114-119）指向 PI 侧路径，**全部保留不动**
5. reddit-trend-tc 无 .dsh 目录，走 `.pi\prompts\node-run.md`（PI 侧，不动）

## 副本盘点（9 项）
| 路径 | 判定 | 备注 |
|---|---|---|
| E:\www\dsh-base\.dsh\skills\node-run.md | DSH 侧·仓内母版（改名+升级） | :6 头注 v1.0.10；provider=vps-direct（陈旧，随 T2 校正为 cpa） |
| **E:\.dsh\skills\node-run.md** | **DSH 侧·实际加载位（改名+升级的真正落点）** | 8466B；provider=cpa（正确） |
| E:\.dsh\skills\dsh-run.md | 不存在（创建） | |
| C:\Users\tc\.agents\skills\node-run.md | 不存在 | 该目录仅 node-architect/pi-tempo/prometheus-spec/talk-human |
| C:\Users\tc\.pi\prompts\node-run.md | 不存在（目录都没有） | PI 用户级 prompt 位在本机不落此路径 |
| E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md | PI 侧·保留 | :6 v1.0.10 与 skill 同版 |
| E:\www\pi-tempo-lab\.pi\prompts\node-run.md | PI 侧·保留 | |
| E:\www\dsh-base\pi-tempo\templates\node-run.lab.md | **PI 侧语义底稿（T5 目标确认存在）** | :6「改 skill 后同步本模板并递增此行」→ T5 由条件任务转正式任务 |
| pi-tempo\templates\node-run.reddit-trend-tc.md | PI 侧·保留 | 项目方言 |

## 引用更正清单（改 dsh-run 的位置）
| 文件:行 | 现文 | 动作 |
|---|---|---|
| research\dsh-adaptation-drafts\install-stack.md:28 | `.dsh/skills/node-run.md` | → dsh-run.md |
| research\dsh-adaptation-drafts\install-stack.md:87 | `删 ~/.dsh/skills/node-run.md` | → dsh-run.md |
| research\dsh-adaptation-drafts\install-stack.md:92 | `node-run/A2 引用的是仓库内原路由` | → dsh-run |
| research\dsh-desktop-adaptation.md:102 | `A3 \| node-run DSH 版` | → dsh-run |
| research\dsh-desktop-adaptation.md:137 | `'/' 命令面出现 node-run` | → dsh-run |
| research\dsh-adaptation-drafts\discrepancies.md:30,45 | node-run DSH 版表述 | → dsh-run |
| .agents\skills\pi-tempo\SKILL.md:202,219,236（dsh-base 与 C:\Users\tc 两份同文） | node-run 模板引用 | → 双指「/dsh-run（DSH）/node-run（PI）」（经 T4 母版改动+sync 分发同步） |
| pi-tempo\skill\SKILL.md:219,253 | 同上酌情位 | T4 处理（:219 拆双指；:253 是 v1.0.9 历史句可保留原文） |
| 保留不动 | sync-skills.ps1 全部 node-run 串（PI 语境）；pi-tempo\README.md:13,27-28；lab/reddit 两模板；research\dsh-desktop-adaptation.md:10,14,15,42,43；reddit-trend-tc SESSIONS/R1 留痕 | |

## 版本位清单
- pi-tempo `1.0.10`（→1.0.11 需同步 10 位）：pi-tempo\skill\SKILL.md:3,254；templates\node-run.lab.md:6,31；templates\node-run.reddit-trend-tc.md:6,32；README.md:54；E:\.dsh\skills\node-run.md:6；dsh-base\.dsh\skills\node-run.md:6；pi-tempo-lab 与 reddit 两 .pi\prompts 副本:6；.agents 两份 pi-tempo SKILL.md:7；research\dsh-adaptation-drafts\discrepancies.md:28
- node-architect `1.13.3`（→1.13.4 需同步 13 位）：node-architect\skill\SKILL.md:3,15,26；references\PROTOCOL.md:46,49；templates\PROGRESS.md:14；scripts\save.ps1:388,399；dsh-base AGENTS.md:2；pi-tempo\README.md:55；research\dsh-desktop-adaptation.md:15,25；discrepancies.md:30

## 不确定项（执行时验证，勿当事实）
1. 两份 .agents\skills\pi-tempo\SKILL.md 无 frontmatter `version:` 字段——scout 推断 sync-skills.ps1:81-82 解析会抛错，与历史 17/17 全绿矛盾 → T6 执行时实测确认（若真抛错则 bump 时给该位新增 version 行）
2. E:\.dsh\skills\node-run.md:7 自称「本机 node-architect v1.10.1」而仓内母版 v1.13.3 → 属陈旧注记，T2 改写头注时一并更新为 v1.13.4
