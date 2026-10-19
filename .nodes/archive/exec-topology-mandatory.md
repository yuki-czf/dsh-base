# 执行拓扑必填化：委派双槽与三层闸门（#27）

> 2026-10-18 · 会话 pidesktop-gemini · 起因：reddit-trend-tc #273 规划端（openchamber/prometheus-spec）读到 v1.13.2 执行接力判据仍自设豁免，执行端忠实自干 57min／ctx 498.6k／看门狗 6 弹。

## 问题（三层缺口，证据见 DECISIONS #27）

1. spec-superflow 五件套模板无执行拓扑节——执行模型写死「交接单 build agent」，从不问「谁执行」。
2. node-architect 协议委派单槽——`收口独立复审` 是默认必做，写上即完成委派义务；执行接力是建议非闸门。
3. 模型判断系统性偏差——「要不要派」永远判自干，跨客户端/跨模型第三次实测应验。

## 改动清单（node-architect v1.13.3 ＋ pi-tempo v1.0.9）

| 文件 | 改动 |
|---|---|
| `node-architect/skill/references/PROTOCOL.md` | 规则 7 重写为「委派双槽」（执行槽+收口槽，无执行槽＝登记非法）；规则 8 增④拓扑传导（行→contract，Execution Topology 节必含） |
| `node-architect/skill/SKILL.md` | 版本 1.13.3；铁律 2 与效率条款改双槽表述 |
| `node-architect/skill/references/templates/PROGRESS.md` | 注释块改双槽词汇＋兼容读法 |
| `node-architect/skill/scripts/save.ps1` | next-node 硬闸：-Accept 缺 `执行:` 槽 → throw exit 1（CJK 经码点构造，PS5.1 ANSI 安全；旧式 `委派:执行接力` 等价放行） |
| `pi-tempo/skill/SKILL.md` | 版本 1.0.9；§10 加「执行槽闸」条 |
| `pi-tempo/templates/node-run.reddit-trend-tc.md` | 版本行 v1.0.9；新增 2.4 执行槽闸；2.5 触发条件识别 `执行:执行接力` |
| `pi-tempo/templates/node-run.lab.md` | 同上 |
| `pi-tempo/README.md` | 版本史加 v1.0.9 条 |

## 验证

- save.ps1 `ParseFile` 0 语法错误。
- **拒绝路径实测**：`next-node -Accept "<旧式委派:收口独立复审文本>"` → `[FAIL] Accept text missing execution slot … Append '执行:执行接力' … or '执行:—(自干理由)'`，exit 1，中文提示渲染正常。
- **放行路径实测（dogfood）**：本节点自身以双槽 -Accept 登记成功（#27）。
- `sync-skills.ps1` **17/17 OK**（三项目＋全局＋模板，v1.13.3／v1.0.9 一致，互锁检查过）。
- `pack.ps1` 产出 `dist/node-architect-v1.13.3.zip`（77 KB）＋ sha256。

## 执行效率复盘

- 预估 20 分钟 / 实际 ~25 分钟（另含 openchamber SQLite 取证约 15 分钟，属前轮调查）。
- 最大浪费点：Edit 首批 4 处因正文行漏 `+` 前缀被解析器拒（1 轮往返）。
- 可复用结论：判断层缺陷只能用「没有默认值的必填字段」闸门兜住——措辞再严格也挡不住自设豁免；登记端硬闸比执行端提示词更早、更便宜。

## 遗留

- prometheus-spec.md 补节＝用户在 openchamber 执行（话术已交付）。
- 274 号节点首用双槽＋执行接力实测（新会话，重启 PI-Desktop 装载 v1.0.9 正文）。
- reddit-trend-tc 与 pi-tempo-lab 两仓的同步产物待各自会话 commit。
