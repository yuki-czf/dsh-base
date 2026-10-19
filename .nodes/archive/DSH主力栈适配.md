# 归档：DSH主力栈适配（PROGRESS #16）

> 状态：已完成 · 2026-10-18 · owner main · 蓝图 `research/dsh-desktop-adaptation.md`（唯一图纸）
> 一句话：把 prometheus-spec + node-architect/pi-tempo + subagent 全家桶迁入 DSH Desktop，形成「规划（强模型）→ node-run 调度 → Gemini 执行棒并行 → 异构复审 → 存档」闭环。

## 交付物

- **批A**：`.agents/skills/pi-tempo/SKILL.md`（A1 方言版，云端 v1.0.10 底稿）＋ `subagents/{gemini-fixer,gemini-scout,independent-review}.md`（A2）＋ `.dsh/skills/node-run.md`（A3）＋ `.agents/skills/prometheus-spec/SKILL.md`（A4）＋ `research/dsh-adaptation-drafts/persona-{prometheus-spec,librarian}.md`（A5/A6）
- **批B**：`@local/dsh-prometheus-spec` bundle **v1.3.1**（pnpm link 于 `research\dsh-adaptation-drafts\bundle`，**承重目录**）——五预设实体化＋主/子层级标注（Prometheus-Spec 主智能体；Librarian/Gemini-Fixer/Gemini-Scout/Independent-Review 子代理）＋ tool-subagent 四元白名单＋ `subagent-model-selection-settings` override（enabled＋双路由）
- 路由终态：执行/测绘＝`vps-direct/gemini-3.8-flash`；复审＝`zai-coding-cn/glm-5.3-flash`（异构）

## 验收结果（蓝图 §6 十项全 PASS）

| 项 | 结果 | 关键证据 |
|---|---|---|
| ① A1-A6 落位+frontmatter | PASS | 批A 校验脚本；三 skill 活目录实证 |
| ② 技能目录+ '/'面 | PASS | 会话技能目录实时出现；用户 GUI 确认 node-run |
| ③ A1 普适内核保留 | PASS | 收口复审对照云端 v1.0.10 逐节行号核证 |
| ④ 两 preset 行激活+选择器 | PASS | list_plugins 行 active 无诊断；Agent 预设页五卡截图（用户设 Prometheus-Spec 为默认预设） |
| ⑤ 规划首步行为 | PASS | session-41b6a8c2 转录：首调 skill(prometheus-spec)、仅写 changes/、🎯版式、问而不写 |
| ⑥ librarian 实派 | PASS | 同上话术B：子会话头 agentPreset=librarian、工具集 web_fetch/grep/read 零写、react.dev permalink |
| ⑦ 并发 fan-in（gemini 路由） | PASS | session-3dae291f：同 step 双派（差1ms）、子会话 request/header provider=vps-direct、policy 采样非 null、双到齐后合并带行号 |
| ⑧ 真实小节点接力试跑 | PASS | session-3b39f1cd（节点 #17，4批5棒）：基线→fixer×2 并行→零越界（三层证据）→复审不完整重派1次→通过带行号；调度器零源码写 |
| 执行槽 | PASS | 本会话即执行棒，两批+四轮追加验证全走完 |
| 收口独立复审 | PASS | 裁决=通过零阻断（3 建议级滞后已修；复审棒实际 glm-5.3 同族自审——漏传路由参数，异构证据由 ⑧ 补足，记 #16 诚实更正） |

## 关键定案（详见 DECISIONS 2026-10-18 两条 + discrepancies 16 条）

1. 规划预设 fs 全量挂＋persona 闸门（开放问题2 定案：dsh-tool-fs 四开关可只读挂载，minimal 官方示范；路径级闸门留二期 policy——子会话宿主面工具泄漏（#15）加强其立项论据）
2. tool-subagent「override」按实际层次落地为预设内整块重述（Host 行在 web-app 层 disabled）
3. 四棒实体化＋主/子标注（用户决策，超出蓝图的设计升级）
4. 路由键 `vps-direct` 从用户配置提取（密钥打码）；Desktop 无子智能体设置卡 → bundle override 兜底
5. 试跑节点 #17 同日完成（接力全流程实证），其 relay 档案在 `.nodes/relay/试跑草稿目录文档化/`

## 踩坑记录（新增可复用）

- skill frontmatter 平文本值含 ASCII `: ` → 整个 skill 静默丢弃（#3）
- link 包版本变更须 remove_bundle→install_bundle（#10/#11）
- DSH 会话日志 `~/.dsh/sessions/<workspace-dir>/<id>/session.v4.jsonl.zstd`（python zstandard 解压；子会话目录无 session- 前缀；该目录下父会话带前缀）——验收审计的标准通道
- 审计脚本注意：日志 tool/call 的参数在 `data.arguments`（部分日志）或 `data.params`（另一些），投影缓存 `storages/session_projcache/sessions/<id>.json` 是快速核账入口（agentPreset/subagentModelSelectionPolicy/subagentCatalog/modelSelection）

## 遗留（后续节点）

- **二期 policy 插件**：fs 事件级路径闸门（放行 changes/+.nodes/），有立项论据（#15 宿主面泄漏），按蓝图「等越权写证据」再启动
- bundle 迁正式位置（随母版分发时）；dist 打包；git ACL 修复后母版合流（pi-tempo/prometheus-spec 目录补齐＋版本对齐）
- ssh-runner DSH 客户端按 bundle 格式重写（旧节点16 断代，另立节点）
- 索引锚点 GitHub 渲染可点击性未验（低优先）；prometheus-spec 会话跑 changes/ 五件套全流程的实测（本节点只验了 draft 阶段）
