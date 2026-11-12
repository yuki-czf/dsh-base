# HY2 双车道客户端包（gemini-speed/hy2）

Gemini 网关的 Hysteria2 客户端：一条隧道两条车道，公司/家里通用。

## 车道一览

| 本地端口 | VPS 目标 | 车道 | 客户端 baseURL |
|---|---|---|---|
| `127.0.0.1:9443` | `127.0.0.1:8318` | CPA（cliproxyapi + slow-guard） | `http://127.0.0.1:9443/v1` |
| `127.0.0.1:9444` | `127.0.0.1:2048` | AI Studio（aistudio2api，Pro 49 模型） | `http://127.0.0.1:9444/v1` |

- 传输：Hysteria2（UDP 8445，brutal up 4 / down 8 Mbps，fastOpen）
- AI Studio 车道模型：`gemini-3.8-flash`（TTFT ~9s）、`gemini-4-argon`（~7s），function calling 已验证
- CPA 车道模型走账号池，详见 agent 文档（`../gemini-speed.md`）

## 新机接入（一次性，约 5 分钟）

```powershell
git clone https://github.com/yuki-czf/dsh-base.git   # 或已有 clone 则 git pull
cd dsh-base\gemini-speed\hy2

# 1. 放 hysteria.exe（24MB 不入库）：从 hy2-portable v2 包复制，或
#    https://github.com/apernet/hysteria/releases 下 v2.13.0 windows amd64

# 2. 生成自己的 client.yaml（占位符值从家里 hy2 目录的 client.yaml 抄）
copy client.template.yaml client.yaml
notepad client.yaml     # 替换 __VPS_IP__ 和 __TUNNEL_PASSWORD__

# 3. 放两个 key 文件（内容不入库，从家里传）：
#    cpa-api-key.txt        —— CPA 车道 key（家里 C:\Users\zifeng\wg-cpa\api-key.txt）
#    aistudio-api-key.txt   —— AI Studio 车道 key（家里 G:\www\coze_app\.secrets\ 下同名文件）

# 4. 启动 + 自检
.\start-hy2.bat         # 看门狗隐藏启动
.\check.bat             # 两条车道都应 [OK]
.\install-autostart.bat # 可选：开机自启
```

## 更新流程

任何机器改了配置/脚本 → `git push`；其他机器 → `git pull` 后双击 `start-hy2.bat`（自动杀旧进程拉新的）。

## opencode provider（AI Studio 车道示例）

```json
"aistudio": {
  "name": "AIStudio",
  "package": "aisdk:@ai-sdk/openai-compatible",
  "settings": {
    "baseURL": "http://127.0.0.1:9444/v1",
    "apiKey": "{file:<此目录>/aistudio-api-key.txt}"
  },
  "models": { "gemini-3.8-flash": {}, "gemini-4-argon": {} }
}
```

完整写法参考家里 `~/.config/opencode/opencode.json` 的 `providers.aistudio` 段。

## 安全纪律

- **本目录永远不含密钥**：真实 `client.yaml`、两个 key 文件均已 gitignore，别用 `-f` 提交
- 隧道密码/IP 只在各自机器的 client.yaml 里，渠道自传（IM/手抄均可）
- 服务端配置（VPS /etc/hysteria/config.yaml）不放公仓，灾难恢复看 coze_app 项目 `.nodes/`

## 文件说明

| 文件 | 用途 |
|---|---|
| `client.template.yaml` | 配置模板（占位符版） |
| `start-hy2.bat` | 启动（隐藏 + 看门狗） |
| `run-hy2.bat` | 看门狗循环（崩溃 5s 自动重启） |
| `invisible.vbs` | 隐藏窗口包装（v2 修复版，Chr(34) 规避引号坑） |
| `check.bat` | 双车道健康检查 |
| `install-autostart.bat` / `uninstall-autostart.bat` | 计划任务自启 装/卸 |
