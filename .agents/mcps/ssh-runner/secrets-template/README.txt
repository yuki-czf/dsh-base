SSH MCP 凭据填写说明（复制为无后缀文件放到 .secrets/ 目录）

需要创建的文件（每文件一个字段，纯文本，结尾不留空行）：
  ssh_host        服务器 IP 或域名            （必填）
  ssh_port        端口，缺省 22               （可选）
  ssh_user        登录用户名                  （必填）
  ssh_password    密码认证：填密码             （与 ssh_key_path 二选一）
  ssh_key_path    密钥认证：填私钥文件绝对路径 （推荐，与 ssh_password 二选一）

要点：
  - 一次文件读取最多暴露一个字段；不要把多字段合并进任何 JSON
  - install.ps1 会自动把本目录模板复制为 .secrets/ 下同名文件（已存在不覆盖）
  - .secrets/ 已被 .gitignore 排除，且 ACL 收紧为仅当前用户可读
  - 推荐密钥认证：ssh-keygen 生成后把公钥追加到服务器 ~/.ssh/authorized_keys，
    本地只留 ssh_key_path 指向私钥，服务器上可直接关闭密码登录
