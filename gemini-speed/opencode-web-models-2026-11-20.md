# OpenCode/OpenChamber web 车道模型配置报告（2026-11-20）

> 家里侧已生效的 `providers.web` 完整配置 + 服务端档位机制说明。公司机照抄即可复用。
> 配置热重载：改完 JSON 不用重启 OpenCode，模型选择器立刻可见。

## 一、配置位置与结构

- 文件：`~/.config/opencode/opencode.json`（Windows: `C:\Users\<user>\.config\opencode\opencode.json`）
- 节点：**`providers`（复数，v3 新格式）→ `web`**——注意与旧 `provider`（单数）key 并存，web 车道在新格式里
- 前提：HY2 隧道在跑（双击 `start-hy2.bat`），本地 9445 端口转发到 VPS web2api

## 二、providers.web 完整 JSON（可直抄）

```json
"web": {
  "name": "Gemini Web",
  "package": "aisdk:@ai-sdk/openai-compatible",
  "settings": {
    "baseURL": "http://127.0.0.1:9445/v1",
    "apiKey": "{file:C:/Users/<user>/hy2/web-api-key.txt}"
  },
  "models": {
    "gemini-3.8-flash": {
      "modelID": "gemini-3.8-flash", "name": "gemini-3.8-flash",
      "capabilities": { "tools": true, "input": ["text","image"], "output": ["text"] },
      "limit": { "context": 1048576, "output": 65536 }
    },
    "gemini-3.8-flash-thinking": {
      "modelID": "gemini-3.8-flash-thinking", "name": "gemini-3.8-flash-thinking",
      "capabilities": { "tools": true, "input": ["text","image"], "output": ["text"] },
      "limit": { "context": 1048576, "output": 65536 }
    },
    "gemini-4-neon": {
      "modelID": "gemini-4-neon", "name": "gemini-4-neon",
      "capabilities": { "tools": true, "input": ["text","image"], "output": ["text"] },
      "limit": { "context": 1048576, "output": 65536 }
    },
    "gemini-4-neon-thinking": {
      "modelID": "gemini-4-neon-thinking", "name": "gemini-4-neon-thinking",
      "capabilities": { "tools": true, "input": ["text","image"], "output": ["text"] },
      "limit": { "context": 1048576, "output": 65536 }
    },
    "gemini-4-neon-thinking-medium": {
      "modelID": "gemini-4-neon-thinking-medium", "name": "gemini-4-neon-thinking-medium",
      "capabilities": { "tools": true, "input": ["text","image"], "output": ["text"] },
      "limit": { "context": 1048576, "output": 65536 }
    }
  }
}
```

各模型条目结构相同（openai-compatible 包不识别 reasoning 参数，档位全部由模型名承载）。

## 三、思考档位机制（重要）

Gemini 桌面端的「思考强度」在 web2api 里通过**模型名后缀**映射（不是 API 参数）：

| 模型名后缀 | 桌面端档位 | wire 值 | 思考链 |
|---|---|---|---|
| 无后缀 | 普通 | 1 | Neon 系实测也吐链 |
| `-thinking` | High | 2 | ✅ reasoning_content |
| `-thinking-medium` | Medium | 4 | Neon 系实测仍吐链 |

- `gemini-4-neon-thinking-medium` 是**自维护扩展**（上游 v4.31.0 只有 argon 版 medium，而 argon→Carbon 映射对 Pro 号 502）——服务端必须跑我们的 `v4.31.0_patched` 补丁版才有这个模型
- 三档同题实测：normal 22.7s / medium 53.7s / high 29.2s，答案一致全对
- OpenAI 兼容层无 `reasoning_effort` 参数，运行中不能动态调档——换模型名即换档

## 四、使用建议

| 场景 | 选哪个 |
|---|---|
| agent 工具任务（主力） | `gemini-3.8-flash` |
| 常规深想（架构/排查） | `gemini-3.8-flash-thinking` |
| 硬题慢想（单题 30s-2min 可接受） | `gemini-4-neon` / `-thinking-medium` |
| 跑分级超深推理 | `gemini-4-neon-thinking`（注意单发可到 2 分钟，不是卡死） |

## 五、服务端前提（VPS 侧）

- 二进制：`/opt/gemini-web2api/gemini-web2api-go_v4.31.0_patched`（sha256 前缀 f82a1188，含 v3 文案补丁 + neon-medium 扩展）
- `request_timeout_sec: 600`（High 档深思考实测会被 180s 砍成 502，已放宽）
- `retry_on_timeout: false`（P1 落地）
- 已删除的配置：`gemini-4-argon` / `gemini-4-argon-thinking`（v4.31.0 起 argon→Carbon 映射，Pro 号 502 inner[31]，web 端 Carbon 大概率 Ultra 专属）

## 六、公司机复用清单

1. 抄第二节 JSON 进 `~/.config/opencode/opencode.json` 的 `providers` 节点（apiKey 路径改成公司机自己的 key 文件位置）
2. 确认公司机侧 HY2 客户端 9445 转发在（client.yaml 的 web 车道）
3. 服务端不用动（家里侧已部署，全 lane 共用 VPS）
4. 验证：OpenCode 模型选择器出现 `web/` 前缀 5 个模型；`check.bat v5` 深测通过
