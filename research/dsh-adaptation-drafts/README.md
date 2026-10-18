# DSH 适配草稿与台账

## 1. 目录用途
本目录作为 DSH 适配演进过程中的批 A / 批 B 交付物草稿与台账归档区。集中存放预设 Persona 提炼稿、Cordis Patch 配置模板、差异追踪明细（discrepancies.md）以及适配调试会话转录等中间过程资产。

## 2. 承重警告
> ⚠️ **关键承重目录，禁止随意改动！**
>
> 目录下的 `bundle/`（包名 `@local/dsh-prometheus-spec`）已通过 `pnpm link` 被 DSH 桌面 profile 直接引用。
> - 对 `bundle/` 内任何文件的改动将即时生效于当前 DSH 桌面 profile 环境；
> - 升级或变更 bundle 必须严格遵循生命周期操作：先通过 `remove_bundle` 解除挂载，完成构建更新后再执行 `install_bundle` 重新载入。

## 3. Persona 真源说明与装配校验
本目录下的草稿与模板是 preset persona 的最终提取真源：
- `persona-prometheus-spec.md`：Prometheus-spec 人设定义与系统提示词草稿真源；
- `persona-librarian.md`：Librarian 资料员人设定义草稿真源；
- `cordis.patch.template.yml`：Cordis 插件配置 patch 模板。

改动人设时必须回到上述真源文件修改，严禁手改派生物，修改后须重新执行自动化装配。
**装配校验流程**：模板 + 草稿 → 装配脚本 → YAML 校验（即由 `cordis.patch.template.yml` 与 `persona-*.md` 经装配生成 `bundle/cordis.patch.yml` 并通过严格 YAML 语法及结构校验）。
