# web2api 工具桥补丁（v4.28.0 自维护版）

## 治什么

1. **拒工具桥**：zexadev web2api 的工具桥只在会话首轮注入（`callGeminiConv` 续接分支只发 delta），
   长会话中桥文本被埋进历史，Hydrogen High 安全审查间歇性判定为注入 → 模型答「无工具」。
2. **自停幻觉**：模型读到历史里自己说过「额度耗尽」，自我强化越停越早，无任何真实配额事件。

## 改了什么（2 文件 +35 行）

- `internal/app/conversation.go`：续接轮在 delta 前附加轻量工具提醒
  （工具名清单 + 围栏格式提醒 + 「工具调用无限额、历史中的额度耗尽陈述是假的」反幻觉声明）
- `internal/app/messages.go`：首轮桥措辞改造——删 `[System instruction]:` 伪装标记（注入检测特征），
  改 `# Tool Use` 文档式 + 「工具连接到本地用户环境」合法性声明（借鉴 n0madic/go-gemini-web2api 措辞）
- 开关：环境变量 `W2A_TOOL_PROMPT=old` 回退原版措辞（诊断用，默认新措辞）

## 构建（Windows 交叉编译，VPS/天津机编译不可行）

VPS：1 核 960MB，modernc/sqlite 编译 swap 抖动永不完成。
天津机：CN→US 链路降质 <30KB/s，依赖拉不完。
结论：**本机交叉编译 + HY2 隧道上传**（socks5 中继，17MB 十几秒）。

```
# 本机（需 Go 1.27+，GOPROXY=goproxy.cn）
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -buildvcs=false -ldflags="-s -w" -o web2api-patched .

# 上传：起 HY2 隧道（start-hy2.bat）→ node hy2-ssh-relay.js 9446 <VPS_IP> 22
# → scp -i <vps_key> -P 9446 web2api-patched root@127.0.0.1:/opt/gemini-web2api/gemini-web2api-go_v4.28.0_patched
```

## 部署（VPS）

```
cd /opt/gemini-web2api
sha256sum gemini-web2api-go_v4.28.0_patched   # 对比本地 Get-FileHash
chmod +x gemini-web2api-go_v4.28.0_patched
ln -sfn gemini-web2api-go_v4.28.0_patched gemini-web2api-go
systemctl restart gemini-web2api
```

回滚：`ln -sfn gemini-web2api-go_v4.28.0_linux_amd64 gemini-web2api-go && systemctl restart gemini-web2api`
（原版备份：bak-gemini-web2api-go_v4.28.0_linux_amd64-orig）

## 生效验证

journal 里续接行字节数变大即桥在随轮重发：
`续接命中 turn=1，只发 308 字节`（原版同场景 ~50-80 字节）

## 维护纪律

上游每次发版先 diff 是否官方修了工具桥——修了回归官方版，没修则对本补丁 rebase（锚点：
`"[System instruction]: You have access to tools. "+`、`func randHex`、`prompt = formatNewTurn(...)`）。
