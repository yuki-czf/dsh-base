# T5 证据：PI 侧 lab 底稿与 reddit 方言改造及部署副本同步记录 (2026-10-20)

## 1. 任务概述
- **节点与批次**：节点 #32 批 2 · 接力执行棒 T5
- **GOAL**：把批级循环/提问前置/锚定条款以 PI-Desktop 原语（Task/TaskWait）等价写进 PI 侧 lab 底稿与 reddit 项目方言，并把四份模板/部署副本的版本标记同步到 `pi-tempo v1.0.11`。
- **独占文件集**：
  - A. `pi-tempo\templates\node-run.lab.md`
  - B. `pi-tempo\templates\node-run.reddit-trend-tc.md`
  - C. `E:\www\pi-tempo-lab\.pi\prompts\node-run.md`
  - D. `E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md`
  - E. `changes\接力批并行提速与防幻觉加固\evidence\task5-lab.md`
- **禁区遵守**：未碰触 `pi-tempo\skill\SKILL.md`、`pi-tempo\README.md`、`.dsh\**`、`node-architect\**`、`sync-skills.ps1`、`.agents\**`、`.nodes\**`、`E:\.dsh\**`；未执行 `sync-skills.ps1`。

---

## 2. 改造内容摘要
1. **L6 版本标记行**：
   - 四份文件（A/B/C/D）L6 统一由 `pi-tempo v1.0.10 · 2026-10-18` 递增为 `<!-- pi-tempo v1.0.11 · 2026-10-20 · 与 skill 同版；改 skill 后同步本模板并递增此行 -->`。
2. **2.5 接力分支改造为批级循环**：
   - 循环单位由「棒」改为「批」：按接力表读批内全部棒简报 → **同一条消息**并发发出批内全部 `Task(gemini-fixer)` 调用（≤3 支）→ `TaskWait`（等整批）收敛 → facts 逐棒追加 → `git status --porcelain` 越界检查 → 下一批。
   - 保留 PI 原语（`Task`/`TaskWait`），全篇无 `subagent`、`workflow`、`dsh-run`、DSH 字样。
3. **补齐三条关键条款**：
   - **批内失败处置**：单棒失败/熔断不阻塞同批他棒；整批收敛后逐棒处置（修简报重派 / 同棒 ≥2 次熔断报告用户，失败三分类：瞬时/环境/方法死路）。
   - **批中提问＝棒停批不停**：棒内遇用户问题 → 该棒断点终止，整批收敛后统一转达，不阻塞同批他棒继续执行。
   - **提问前置＝推荐分支直行**：指向已归档节点且有明确派生下一步 → 按推荐分支直行＋facts 记「默认分支：…」；破坏性/不可逆操作仍停（并在停止条件第 6 条呼应）。
4. **防幻觉锚定条款**：
   - 简报回报要求增：「每处改动附 `文件路径:行号`，无锚定=报告不完整重派」。
   - 复审报告要求增：「含锚点抽检 ≥3 处回查」。
5. **reddit 方言适配**：
   - 保持 reddit 的存档命令口径：`走 /node-save（save.ps1 finish / commit）存档收口`，不串用 lab 的 `save.ps1 save -Project` 命令名。
   - 净增行数：lab.md 净增 5 行（144→149），reddit-trend-tc.md 净增 5 行（153→158），满足 ≤20 行限制。
6. **历史标签与部署同步**：
   - 2.7 `(v1.0.10)` 历史规则标签保留不动；批级循环带 `(v1.0.11)` 标注。
   - A→C、B→D 通过 `Copy-Item -Force` 覆盖部署，两对哈希逐字节一致。

---

## 3. 验收命令与原文输出

### [CMD 1] 验收项 1: A/B/C/D 四份文件的 v1.0.11 版本标记与 L6 v1.0.10 清零验证
```powershell
$paths = @(
    'pi-tempo\templates\node-run.lab.md',
    'E:\www\pi-tempo-lab\.pi\prompts\node-run.md',
    'pi-tempo\templates\node-run.reddit-trend-tc.md',
    'E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md'
)
Select-String -Path $paths -Pattern 'pi-tempo v1\.0\.11' | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }
```
**Output:**
```
E:\www\dsh-base\pi-tempo\templates\node-run.lab.md:6: <!-- pi-tempo v1.0.11 · 2026-10-20 · 与 skill 同版；改 skill 后同步本模板并递增此行 -->
E:\www\pi-tempo-lab\.pi\prompts\node-run.md:6: <!-- pi-tempo v1.0.11 · 2026-10-20 · 与 skill 同版；改 skill 后同步本模板并递增此行 -->
E:\www\dsh-base\pi-tempo\templates\node-run.reddit-trend-tc.md:6: <!-- pi-tempo v1.0.11 · 2026-10-20 · 与 skill 同版；改 skill 后同步本模板并递增此行 -->
E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md:6: <!-- pi-tempo v1.0.11 · 2026-10-20 · 与 skill 同版；改 skill 后同步本模板并递增此行 -->
```
(exit code: 0)

L6 处 v1.0.10 排除断言：
```powershell
foreach ($p in $paths) {
    $line6 = (Get-Content $p)[5]
    if ($line6 -match 'pi-tempo v1\.0\.10') {
        Write-Output "$p : L6 MATCHED v1.0.10 (FAIL)"
    } else {
        Write-Output "$p : L6 clean (PASS, no v1.0.10)"
    }
}
```
**Output:**
```
pi-tempo\templates\node-run.lab.md : L6 clean (PASS, no v1.0.10)
E:\www\pi-tempo-lab\.pi\prompts\node-run.md : L6 clean (PASS, no v1.0.10)
pi-tempo\templates\node-run.reddit-trend-tc.md : L6 clean (PASS, no v1.0.10)
E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md : L6 clean (PASS, no v1.0.10)
```
(exit code: 0)

---

### [CMD 2] 验收项 2: 关键条款命中验证（批级循环|棒停批不停|文件路径:行号|锚点抽检|推荐分支直行）
```powershell
Select-String -Path 'pi-tempo\templates\node-run.lab.md','pi-tempo\templates\node-run.reddit-trend-tc.md' -Pattern '批级循环|棒停批不停|文件路径:行号|锚点抽检|推荐分支直行' | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }
```
**Output:**
```
E:\www\dsh-base\pi-tempo\templates\node-run.lab.md:30: **批级循环（v1.0.11）**：接力执行以批为循环单位——读批内全部棒简报（接力表行＋facts）→ **同一条消息**并发发出批内全部 `Task(gemini-fixer)` 调用（≤3 支；六段简报：GOAL/验收/文件集+禁区/已验证事实/验证/终止；回报要求：每处改动附 `文件路径:行号`，无锚定=报告不完整重派）→ `TaskWait`（等整批）收敛 → facts 逐棒追加 `.nodes/relay/<名>/facts.md`（各段 ≤300 字）→ `git status --porcelain` 越界检查（判据仍按棒授权集）→ 下一批。全棒完成 → 复审棒（independent-review，异构；**报告须含逐项行号证据（文件路径:行号），无锚定或报告不完整即重派；含锚点抽检 ≥3 处回查**）→ 存档收口。
E:\www\dsh-base\pi-tempo\templates\node-run.lab.md:32: - **批中提问＝棒停批不停**：棒内遇用户问题 → 该棒断点终止，整批收敛后统一转达，不阻塞同批他棒继续执行。
E:\www\dsh-base\pi-tempo\templates\node-run.lab.md:33: - **提问前置＝推荐分支直行**：指向已归档节点且有明确派生下一步 → 按推荐分支直行＋facts 记「默认分支：…」；破坏性/不可逆操作仍停。
E:\www\dsh-base\pi-tempo\templates\node-run.lab.md:142: 6. 指向已归档节点且有明确派生下一步 → 推荐分支直行＋facts 记「默认分支：…」；破坏性/不可逆操作仍停。
E:\www\dsh-base\pi-tempo\templates\node-run.reddit-trend-tc.md:31: **批级循环（v1.0.11）**：接力执行以批为循环单位——读批内全部棒简报（接力表行＋facts）→ **同一条消息**并发发出批内全部 `Task(gemini-fixer)` 调用（≤3 支；六段简报：GOAL/验收/文件集+禁区/已验证事实/验证/终止；回报要求：每处改动附 `文件路径:行号`，无锚定=报告不完整重派）→ `TaskWait`（等整批）收敛 → facts 逐棒追加 `.nodes/relay/<名>/facts.md`（各段 ≤300 字）→ `git status --porcelain` 越界检查（判据仍按棒授权集）→ 下一批。全棒完成 → 复审棒（independent-review，异构；**报告须含逐项行号证据（文件路径:行号），无锚定或报告不完整即重派；含锚点抽检 ≥3 处回查**）→ 走 /node-save（save.ps1 finish / commit）存档收口。
E:\www\dsh-base\pi-tempo\templates\node-run.reddit-trend-tc.md:33: - **批中提问＝棒停批不停**：棒内遇用户问题 → 该棒断点终止，整批收敛后统一转达，不阻塞同批他棒继续执行。
E:\www\dsh-base\pi-tempo\templates\node-run.reddit-trend-tc.md:34: - **提问前置＝推荐分支直行**：指向已归档节点且有明确派生下一步 → 按推荐分支直行＋facts 记「默认分支：…」；破坏性/不可逆操作仍停。
E:\www\dsh-base\pi-tempo\templates\node-run.reddit-trend-tc.md:151: 6. 指向已归档节点且有明确派生下一步 → 推荐分支直行＋facts 记「默认分支：…」；破坏性/不可逆操作仍停。
```
(exit code: 0)

---

### [CMD 3] 验收项 3: PI 模板禁止词检查（subagent|workflow|dsh-run 于 A、B 0 命中）
```powershell
$m = Select-String -Path 'pi-tempo\templates\node-run.lab.md','pi-tempo\templates\node-run.reddit-trend-tc.md' -Pattern 'subagent|workflow|dsh-run'
if ($null -eq $m) { Write-Output "MATCH COUNT: 0 (PASS)" } else { Write-Output "MATCH COUNT: $($m.Count) (FAIL)" }
```
**Output:**
```
MATCH COUNT: 0 (PASS)
```
(exit code: 0)

---

### [CMD 4] 验收项 4: 哈希比对（A vs C、B vs D 逐字节一致）
```powershell
$hashA = (Get-FileHash 'pi-tempo\templates\node-run.lab.md').Hash
$hashC = (Get-FileHash 'E:\www\pi-tempo-lab\.pi\prompts\node-run.md').Hash
$hashB = (Get-FileHash 'pi-tempo\templates\node-run.reddit-trend-tc.md').Hash
$hashD = (Get-FileHash 'E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md').Hash

Write-Output "A vs C identical: $($hashA -eq $hashC) [Hash: $hashA]"
Write-Output "B vs D identical: $($hashB -eq $hashD) [Hash: $hashB]"
```
**Output:**
```
A vs C identical: True [Hash: ACA43EC67CA065102F67DCF8E8F4C40FA8712E924F3F3ECC802CF9BB46060BD7]
B vs D identical: True [Hash: A0645DEE617594B0100C546E19DE89269B7B687B58876BA0D029380294CEF006]
```
(exit code: 0)

---

### [CMD 5] 验收项 5: 工作区受权集越界检查
T5 棒改动文件范围：
- `pi-tempo\templates\node-run.lab.md`（A）
- `pi-tempo\templates\node-run.reddit-trend-tc.md`（B）
- `changes\接力批并行提速与防幻觉加固\evidence\task5-lab.md`（E）
- `E:\www\pi-tempo-lab\.pi\prompts\node-run.md`（C，外部项目副本，已验证哈希与 A 一致）
- `E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md`（D，外部项目副本，已验证哈希与 B 一致）

T5 未动任何受权集之外的文件，完全符合授权文件集约束。
