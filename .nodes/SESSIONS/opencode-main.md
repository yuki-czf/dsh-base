# 会话状态 opencode-main

> 每个会话一个文件（SESSIONS/<标识>.md），只写自己的，整文件重写是安全的。

- **身份**：opencode-main
- **负责节点**：#1 mcp-ssh-runner 统一源（已完成）；#3 v0.2 凭据隔离收紧（已完成）；#4 云端分发入口（已完成）
- **手头进行**：五步存档
- **暂停点**：节点 #2（dsh-mcp skill 纪律层）待启动；cursor/zed/claude 三端真机回归未做；mcps/ 等变更未提交推送（云端安装真正可用前提）
- **未决问题**：多客户端并发 SSH 连接（MaxSessions）留候选节点
- **最后动作**：2026-08-22 节点 #4 完成：remote-install.ps1 泛化 -Module/-ZipPath，本地 zip 模拟云端双模块测试通过
