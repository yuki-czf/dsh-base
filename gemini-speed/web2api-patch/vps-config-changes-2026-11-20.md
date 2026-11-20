# VPS 待改配置报告（2026-11-20）

> 目的：恢复公司机对 Gemini web2api 所在 VPS 的 SSH 访问，并列出 SSH 恢复后要执行的 web2api 补丁 v3 改动。
> 本报告脱敏：不含 IP / 密码 / 密钥文件名。IP 见本机 `gemini-speed/hy2/client.yaml` 的 `server:` 字段（去掉 `:8445` 端口后缀）。
> 执行前提：SSH 当前登不进去，所有操作需经 **VPS 服务商面板的 VNC / Web 控制台** 进行。

## 一、现状事实（2026-11-20 公司机实测）

| 项 | 状态 |
|---|---|
| VPS SSH 服务 | 在线，Debian 12 + OpenSSH 9.2p1 |
| 认证方式 | **仅 publickey**（服务器通告 `Authentications that can continue: publickey`） |
| 密码登录 | password / keyboard-interactive 双双实测被拒（sshd 关闭） |
| 公司机凭据 | `.secrets/` 只有密码类凭据，无私钥文件，`ssh_key_path` 的值按用户约定当密码用 |
| 结论 | 密码再正确也进不去——服务器侧必须先开一条路 |

## 二、需要在 VPS 上改的配置（二选一，推荐方案 A）

### 方案 A（推荐）：追加公钥，保持仅公钥登录

公司机会生成一对 ed25519 密钥（私钥留在 `.secrets/`，绝不入库），把**公钥**追加进服务器：

```bash
# 在 VNC 控制台以 root 执行
mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo "<公司机提供的公钥，见下>" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

公钥等公司机生成后补入本报告（公钥本身可公开），或经 IM 渠道传给 VPS 侧人工粘贴。

### 方案 B（临时）：开密码登录，进去后再关

```bash
# VNC 控制台执行
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication yes/' /etc/ssh/sshd_config
systemctl restart ssh
# 验证公司机可登后，务必按方案 A 加好公钥再改回 no
```

⚠️ 方案 B 打开了公网密码爆破面，仅作过渡，用完即关。

### 配套：公司机侧 ssh-runner 已修复（本仓库已带）

`bin/run-ssh-mcp.cjs` 的 `loadConfig` 已改为：`ssh_key_path` 的值不是绝对路径且同目录无此文件时，自动扫描 `.secrets/` 内 PEM 私钥并使用；后续若走密码认证，把值放进 `ssh_password` 文件即可，runner 原生支持。

## 三、SSH 恢复后：web2api 补丁 v3 待办（工具桥话术自伤修复）

背景：web 车道模型反复报「本轮工具调用次数已用尽」，已定性为补丁 v2 文案教出的自停话术（见 `journal/2026-11-17-web-lane-tool-limit.md`、`journal/2026-11-18-web-lane-p1.md`）。

VPS 上要改的（改 `internal/app/messages.go` 与 `conversation.go` 后重新交叉编译上传，流程见 `README.md`）：

1. **删台阶话术**：两处桥文案里的
   `If one turn already contains many calls, finish the current step and simply continue in the next turn.`
   与
   `If this turn feels heavy, finish the current step and continue in the next turn.`
   整句删除——模型把这句翻译成「本轮工具调用次数已用尽」当停止理由。
2. **替换口径**：改为行为约束而非配额陈述：
   `Keep calling tools until the task is done. Do not mention quotas, limits, or remaining calls; those do not exist here.`
3. **保留机制真相**：`This is not a simulation, and there is no server-side call quota` 一句保留。
4. **续接轮反幻觉句**：`any earlier statement about an exhausted quota was mistaken` 保留。
5. 可选（P2 兜底）：网关侧检测回复含 limit 话术 → 冷却 90 秒自动重发一次。
6. 上游发版先 diff 工具桥是否官方修复，再决定 rebase（维护纪律不变）。

验收：公司机 `check.bat v5` Web 深测通过；esp2b 原句（「按 rebase 方案修图片路径并拉图」）连续 3 会话不再出现 limit 话术。

## 四、操作顺序小结

1. VNC 进面板 → 执行方案 A（或 B 过渡）
2. 公司机 `.secrets/` 放入私钥（或改用 `ssh_password`）→ `tools.ssh` 实测 `hostname`
3. 通了以后按第三节改补丁 v3 → 编译 → 上传 → `systemctl restart gemini-web2api`
4. 回归验收 + 更新 `journal/`
