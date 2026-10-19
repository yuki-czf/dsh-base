---
name: prometheus-spec-installer
description: 安装或更新 prometheus-spec（带权限闸门的规划 agent，只出计划不动手）到本机 opencode。当用户说"装 prometheus-spec / 安装 prometheus-spec / 安装规划智能体 / 更新 prometheus-spec / 装 Prometheus"，或要在新机器上启用规划 agent 时使用。
version: v1.1
---

# prometheus-spec 安装器（全局引导）

在任意位置运行（`<母版目录>` 需按实际 clone 位置替换——即 dsh-base 仓库的 `prometheus-spec` 目录）：

```powershell
powershell -ExecutionPolicy Bypass -File "<母版目录>\install.ps1" -Core
```

- `-Core`：只装必备三件（prometheus-spec agent + librarian 子agent + 本引导 skill），无交互
- 无参数：交互模式，打印四层依赖清单（REQUIRED / STRONGLY REC / PROJECT-OPTIONAL / OPTIONAL）逐层选择
- `-All`：必备 + 仓库内所有可装项；`-Remove`：先备份再卸载

**更新语义**：重跑同一条命令即为更新——幂等安全；若目标文件被手工改过，安装器会先备份（`<文件>.bak-<时间戳>`）再覆盖。装完后新开会话生效。

装完后立即：
1. 确认 `~/.config/opencode/agents/prometheus-spec.md` 与 `~/.config/opencode/agents/librarian.md` 存在且路径为 `~/` 形态
2. 向用户复述已装内容 + 提示：新开会话生效；spec-superflow / talk-human 等依赖按 README 处理

若命令里的 `<母版目录>` 已失效（换机/移动目录）：找到 dsh-base 克隆位置，改用实际路径的 `prometheus-spec\install.ps1` 重跑同一命令。
