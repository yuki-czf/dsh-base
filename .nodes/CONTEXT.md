# 项目快照 CONTEXT

> 本文件是项目的一页纸快照，任何会话开工前必读。永远保持一屏以内，细节放 archive/。
> 最后更新：2026-10-18（由 node-architect 存档流程维护）

## 项目一句话

node-architect：把"设计先行 + 节点存档 + 读档恢复"的长项目协议做成集中式多客户端安装包；本仓库是它的母版与试验场（GitHub: yuki-czf/dsh-base）。

## 当前节点

- **PROGRESS #16 `DSH主力栈适配`（已完成，main，归档 `archive/DSH主力栈适配.md`）**：蓝图 `research/dsh-desktop-adaptation.md` 全部落地——§6 十项全 PASS（含 ⑧ 试跑节点 #17）。DSH 侧终态：三 skill（pi-tempo/prometheus-spec/node-run）＋ bundle **v1.3.1** 五预设（Prometheus-Spec 主智能体·**用户已设为默认预设**＋四子代理）＋ 子代理模型选择 override（执行/测绘=vps-direct/gemini-3.8-flash，复审=zai-coding-cn/glm-5.3-flash）
- **下一步候选（按序）**：①二期 policy 插件（fs 路径闸门；立项论据=discrepancies #15 宿主面工具泄漏，触发条件=出现越权写证据）②git ACL 修复→母版合流（pi-tempo/prometheus-spec 目录补齐+版本对齐）+ bundle 迁正式位 ③ssh-runner DSH 客户端按 bundle 格式重写（旧节点16 断代）④prometheus-spec 会话跑 changes/ 五件套全流程实测（本节点只验到 draft 阶段）
- **环境注记**：save.ps1 存档需 full access 会话（受限令牌锁创建被拒）；dsh-builtin-browser 缺 Electron；link 包升级须 remove_bundle→install_bundle；会话日志审计通道=`~/.dsh/sessions/<workspace>/<id>/session.v4.jsonl.zstd`（python zstandard）＋`storages/session_projcache/sessions/<id>.json`
- **DSH 插件开发坑**（详见 archive/dsh-plan-popup.md + discrepancies）：skill frontmatter ASCII 冒号静默丢弃；子会话工具面=preset行∪宿主面（preset 只读保证有边界）

## 活跃会话

| 会话 | 负责 | 更新时间 |
|---|---|---|
| main | #16/#17 收口归档完毕，待下一节点 | 2026-10-18 |
| perf-gemini-lean | 一次性委托（mubai）+ TTFT 续篇（OpenCode）：Gemini 载荷与行为改造 v3+v12 已落地（详见 SESSIONS/perf-gemini-lean.md 与 _diag/gemini-perf/REPORT.md） | 2026-09-26 |
| opencode-main | 云端线 ssh-runner / remote-install（历史，GitHub 侧） | 2026-08-22 |

## 关键路径提醒

- **工作区是正式 git 克隆**（main ↔ origin/main）：改完 commit/push；凭据走 Windows 凭据管理器（lapland1009）；**git 网络操作仍禁用**（FETCH_HEAD ACL 坏，本地落后云端约 3 周），修复后先 pull 再继续
- **维护正向流程**：只改母版 `node-architect\skill\` → 重跑 `install.ps1` → `pack.ps1` 刷新 dist → 根 `dist\` 安装包与 README 引用同步换版 → commit/push
- **别项目更新话术**：任意项目说「更新节点协议」→ 全局引导跑母版 install.ps1（幂等，`.nodes` 档案保留）；改触发词后重跑 `-Bootstrap`（写 C 盘，DSH 沙箱内需提权）
- 母版 .ps1 保持 BOM；**新增代码块一律 ASCII-only（CJK 用 \uXXXX 转义）**防剥 BOM 后 PS 5.1 ANSI 解析碎裂；PS 单引号串内禁 `<>`；remote-install.ps1 纯 ASCII 无 BOM
- git 约定：autocrlf=true（仓库 blob LF / Windows 检出 CRLF）；`.gitignore` 忽略本地工作态（.sisyphus/.zcode/_diag/tmp-zcode-e2e/.opencode 生成物/node_modules）
- 版本号唯一真源 = `skill/SKILL.md` frontmatter；PROTOCOL/AGENTS 由 init 运行时注入；verify 的 `-Node` 用无斜杠短名
- 大任务两套范式二选一（询问制）：spec-superflow 或 分批约定；命令速查见 `skill/references/QUICKREF.md`
- **DSH 适配资产**（#16 交付，勿手改承重目录）：`.agents/skills/{pi-tempo,prometheus-spec}/`、`.dsh/skills/node-run.md`、`research/dsh-adaptation-drafts/`（bundle+persona 真源+台账 16 条）；改动走「模板→装配脚本→YAML 校验」流程
- **本机 ~/.dsh gemini-lean 已到 v12**（2026-09-26）：wire 名单 16（subagent 放行，需重启 DSH 桌面生效）；回滚 = `.bak-dsh-v12-20260926`（yml）+ `host.js.bak-v11` + 删 rulesText 两行。教训：工具目录真源是 `system-prompt/assemble` 瀑布（详见 DECISIONS 2026-09-26 两条）

## 下一步

1. **policy 插件二期**（等越权写证据触发）或 **git ACL 修复+母版合流**（二选一开工，询问用户）
2. ssh-runner DSH 客户端重写（旧节点16 断代）：按 bundle 格式另立节点
3. **gemini-lean v12 实测**：重启 DSH 桌面 → 新 lean 会话验收（wire 16 / adaptive 掩码日志 / subagent 真调 / 首步 plan-first）→ 与家里侧 CPA 数据会师 A/B
4. DSH 插件侧遗留：节点 8 待验收；节点 7 并入 8 验收
5. 并行遗留：节点 3（L2 桥接）按 v1.5.0 口径复核
6. 云端线遗留：#12 dsh-mcp skill（AI 纪律层）待开始；新校验尚未在真实批次中跑过
