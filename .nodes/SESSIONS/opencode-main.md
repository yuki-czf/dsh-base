# 会话状态 opencode-main

> 每个会话一个文件（SESSIONS/<标识>.md），只写自己的，整文件重写是安全的。

- **身份**：opencode-main
- **负责节点**：#1 mcp-ssh-runner 统一源（已完成）；#3 v0.2 凭据隔离收紧（已完成）；#4 云端分发入口（已完成+推送+冒烟）
- **手头进行**：等待 raw CDN 缓存过期后验证正式一行式
- **暂停点**：节点 #2（dsh-mcp skill 纪律层）待启动；cursor/zed/claude 三端真机回归未做
- **未决问题**：正式一行式验证 pending（CDN 缓存 ~5min）；多客户端并发 SSH 留候选节点
- **最后动作**：2026-08-22 推送 c1b48e5+1f48925；云端冒烟发现 BOM 毒化 irm|iex（已修，API 通道全功能验证通过）；补记供应链锁文件（master package-lock + installer 拷贝）
