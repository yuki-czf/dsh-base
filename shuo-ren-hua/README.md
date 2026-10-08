# shuo-ren-hua（说人话）

让 Agent/LLM 的中文回复变成简单、易懂、直接的自然语言。规则综合自 GitHub 上验证过的三个 skill（i-have-adhd / plain-english / simple-man），中文化并加入中文 AI 腔禁用词表与防编造条款。

## 生效机制

| 层 | 载体 | 强度 |
|---|---|---|
| 全局 AGENTS.md 标记块 | `~/.config/opencode/AGENTS.md` 等 | 每轮强制注入（系统层） |
| 全局 skill | `~/.config/opencode/skills/shuo-ren-hua/` 等 | 按需触发（三档强度 + 完整词表） |

生效标志：回复以 🎯 **结论：** 开头、以 👉 **下一步：** 结尾。

## 安装 / 更新（幂等，重跑即更新）

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1                      # 自动检测：默认 opencode + claude
powershell -ExecutionPolicy Bypass -File install.ps1 -Clients opencode,codex,zcode
```

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Remove
```

## 分发到别的机器 / 项目

```powershell
git clone https://github.com/yuki-czf/dsh-base.git
cd dsh-base\shuo-ren-hua
powershell -ExecutionPolicy Bypass -File install.ps1 -Clients opencode,claude
```

## 维护

- 规则改动只改 `skill\SKILL.md`（正文）和 `agents-global\AGENTS.snippet.md`（注入片段），保持两者同步
- 版本号：`skill\SKILL.md` frontmatter 的 `version:` 字段是单一真源，snippet 标记行同步手动更新
- 安装器逻辑：skill 目录整目录覆盖；AGENTS.md 只动 `# >>> shuo-ren-hua` 到 `# <<< shuo-ren-hua` 之间的标记块，文件里其他内容不碰

## 文件结构

```
shuo-ren-hua\
├── skill\SKILL.md               # 技能本体（唯一真源，含 version）
├── agents-global\AGENTS.snippet.md  # 全局注入片段（带管理标记）
├── install.ps1                  # 安装/更新/卸载器
└── README.md
```
