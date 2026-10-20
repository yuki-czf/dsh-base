# DSH NEXT 插件同步清单（旧设备 → 新设备）

> 生成于 2026-10-20，来源：`E:\.dsh\profiles\desktop\`（cordis.yml / .dsh-market/log.ndjson / node_modules）
> 本设备插件数据根目录：`E:\.dsh\`（profiles/desktop 为当前激活 profile）

## 一、需要在插件市场重新安装的插件（启用中，11 个）

| # | 包名 | 版本 | 说明 |
|---|------|------|------|
| 1 | `dshmarket` | 1.66.44 | 插件市场本体（新设备装完市场后它会自动跟进版本） |
| 2 | `dsh-plugin-tool-management` | 0.21.1 | 插件工具管理 |
| 3 | `dsh-builtin-browser` | 0.4.13 | 内置浏览器（提供 dsh_browser_* 工具） |
| 4 | `dsh-ops` | 0.3.0 | ops 工具链（shell / file / ptc；background 子插件在本机为关闭态） |
| 5 | `dsh-subagent-default-model` | 2.1.7 | 子代理默认模型路由（当前指向 opencode-go / deepseek-v4.1-flash，round-robin + failover） |
| 6 | `dsh-better-sidebar` | 0.28.0 | 侧栏增强 |
| 7 | `dsh-endfield-theme` | 1.4.0 | Endfield 主题 |
| 8 | `@copylee/dsh-proxy` | 0.4.5 | HTTP(S) 代理（本机：global 关，cpa / opencode-go 直连） |
| 9 | `@ychris12138/dsh-usage-stats` | 0.3.6 | Token 用量 / 成本统计 |
| 10 | `@linxin666/dsh-client-ui-task-board` | 0.4.7 | Web GUI 任务看板 |
| 11 | `@local/dsh-prometheus-spec` | 1.3.2 | 本地插件（prometheus-spec 调研规划工作流）——注意：装在 @local scope，新设备若市场搜不到，需从旧设备拷贝源包后本地安装 |

## 二、本机装过但已停用的插件（可选同步，2 个）

| 包名 | 版本 | 状态 |
|------|------|------|
| `@kenz1117/dsh-ui-usage-billing` | 1.6.2 | 2026-10-20 关闭（被 usage-stats 替代） |
| `dsh-subusage` | 0.14.2 | 2026-10-20 关闭（当时卸载被运行中会话阻止，包还在） |

## 三、不用同步（DSH NEXT 官方自带）

所有 `@deepseek-ai/*` 包（agent、llm、session、tool-*、plugin-manager 等）随应用本体安装，新设备装好 DSH NEXT 即有。

## 四、插件之外、想完整还原体验还需带走的东西

| 内容 | 旧设备路径 |
|------|-----------|
| 全局 skills（含自定义 pi-tempo 等） | `C:\Users\tc\.agents\skills\` |
| 子代理 persona（gemini-fixer / gemini-scout / independent-review） | `C:\Users\tc\.agents\subagents\` |
| dsh-run skill | `E:\.dsh\skills\dsh-run.md` |
| LLM 提供商配置（zai-coding-cn / cpa / opencode-go / aiatudio / oc-zen + 各家模型表） | `E:\.dsh\profiles\desktop\cordis.patch.yml`（纯配置，可直接拷贝覆盖新设备同名文件） |
| 市场收藏（whale-persona、endfield-theme 仓库）与地区设置 | `E:\.dsh\profiles\desktop\.dsh-market\state.json` |

## 五、新设备安装顺序建议

1. 安装 DSH NEXT 本体（官方自带插件即齐）。
2. 在插件市场依次搜索安装第一节 11 个包（`dshmarket` 通常已内置，其余 10 个逐个装）。
3. 拷贝 `cordis.patch.yml` 到新设备对应 profile 目录，恢复 LLM 提供商与模型路由配置（⚠️ 其中 `desktop-next.runtime.patch.json` 的 `trustedHosts: 192.168.20.214` 是旧设备局域网地址，新设备按需改）。
4. 如需 persona / skills 完整一致，再同步第四节对应目录。
5. API Key 走环境变量（ZAI_CODING_CN_API_KEY / CPA_API_KEY / OPENCODE_GO_API_KEY / AIATUDIO_API_KEY / OC_ZEN_API_KEY / DEEPSEEK_API_KEY），需在新设备重新设置，不在任何同步文件里。

> 校验方法：新设备装完后打开插件管理页，对照本表逐个核对版本号。
