# sync-skills.ps1 - one command to deploy + verify BOTH master skills (node-architect & pi-tempo).
# Solves: two masters x multiple projects x global deploy spots = manual sync debt.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File sync-skills.ps1              # deploy all + verify
#   powershell -NoProfile -ExecutionPolicy Bypass -File sync-skills.ps1 -CheckOnly  # verify only, no writes
#   ... -Projects @('E:\www\dsh-base','E:\www\reddit\reddit-trend-tc')               # override project set
#
# Verification strategy: file HASH comparison master<->deployed (byte-identical proves the
# feature is in place - no CJK grepping inside this script, which PS5.1 cannot parse
# reliably without BOM). Version markers use ASCII regex only.
param(
  [string[]]$Projects = @('E:\www\dsh-base', 'E:\www\reddit\reddit-trend-tc', 'E:\www\pi-tempo-lab'),
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Continue'
$root  = Split-Path -Parent $MyInvocation.MyCommand.Path   # dsh-base
$home2 = $env:USERPROFILE
$fail  = 0
$results = New-Object System.Collections.Generic.List[string]

function Add-Result([string]$where, [string]$check, [bool]$ok) {
  $script:fail += (-not $ok)
  $script:results.Add(("{0,-38} {1,-44} {2}" -f $where, $check, ($(if ($ok) {'OK'} else {'FAIL'}))))
}
function Get-Hash([string]$p) {
  if (-not (Test-Path $p)) { return $null }
  (Get-FileHash -Path $p -Algorithm SHA256).Hash
}
function Same([string]$a, [string]$b) {
  $ha = Get-Hash $a; $hb = Get-Hash $b
  ($null -ne $ha) -and ($ha -eq $hb)
}
# Protocol files: install substitutes 'v__VER__' placeholder -> real version. Compare version-normalized text.
function Same-Protocol([string]$master, [string]$deployed) {
  if (-not (Test-Path $master) -or -not (Test-Path $deployed)) { return $false }
  $na = ((Get-Content $master -Raw -Encoding UTF8)   -replace 'v__VER__|v\d+\.\d+\.\d+', 'vX')
  $nb = ((Get-Content $deployed -Raw -Encoding UTF8) -replace 'v__VER__|v\d+\.\d+\.\d+', 'vX')
  ($na -ceq $nb)
}

# ---------- 1) node-architect: per-project install ----------
if (-not $CheckOnly) {
  foreach ($p in $Projects) {
    if (-not (Test-Path $p)) { continue }
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'node-architect\install.ps1') -Project $p 2>&1
    $ver = ($out | Select-String -Pattern 'v\d+\.\d+\.\d+' | Select-Object -Last 1)
    Write-Host ("[node-architect] {0} -> {1}" -f $p, $ver.Matches[0].Value)
  }
}

# ---------- 2) pi-tempo: global skill + subagents + per-project templates ----------
$ptSkill  = Join-Path $root 'pi-tempo\skill'
$ptSubs   = Join-Path $root 'pi-tempo\subagents'
$ptTmpl   = Join-Path $root 'pi-tempo\templates'
$gSkill   = Join-Path $home2 '.agents\skills\pi-tempo'
$gSubs    = Join-Path $home2 '.agents\subagents'
$tmplMap  = @{
  'E:\www\pi-tempo-lab'       = 'node-run.lab.md'
  'E:\www\reddit\reddit-trend-tc' = 'node-run.reddit-trend-tc.md'
}
if (-not $CheckOnly) {
  New-Item -ItemType Directory -Force -Path $gSkill | Out-Null
  Copy-Item (Join-Path $ptSkill '*') $gSkill -Recurse -Force
  Copy-Item (Join-Path $ptSubs '*.md') $gSubs -Force
  foreach ($p in $Projects) {
    if ($tmplMap.ContainsKey($p) -and (Test-Path $p)) {
      $dst = Join-Path $p '.pi\prompts'
      New-Item -ItemType Directory -Force -Path $dst | Out-Null
      Copy-Item (Join-Path $ptTmpl $tmplMap[$p]) (Join-Path $dst 'node-run.md') -Force
      Write-Host ("[pi-tempo] template {0} -> {1}" -f $tmplMap[$p], $p)
    }
  }
}

# ---------- 3) verification ----------
# 3.1 pi-tempo version consistency (ASCII regex on markers)
$ptMaster = Join-Path $ptSkill 'SKILL.md'
$mVer = ((Select-String -Path $ptMaster -Pattern '^version:\s*([\d\.]+)').Matches[0].Groups[1].Value)
Add-Result 'pi-tempo master SKILL.md' "version=$mVer parsed" ($mVer -match '^\d+\.\d+\.\d+$')
$gVer = ((Select-String -Path (Join-Path $gSkill 'SKILL.md') -Pattern '^version:\s*([\d\.]+)').Matches[0].Groups[1].Value)
Add-Result 'global ~/.agents/skills' "SKILL version $gVer == master" ($gVer -eq $mVer)

$tmplSpots = @(
  @{ where = 'master template lab';        path = (Join-Path $ptTmpl 'node-run.lab.md') },
  @{ where = 'master template reddit';     path = (Join-Path $ptTmpl 'node-run.reddit-trend-tc.md') },
  @{ where = 'deploy lab .pi/prompts';     path = 'E:\www\pi-tempo-lab\.pi\prompts\node-run.md' },
  @{ where = 'deploy reddit .pi/prompts';  path = 'E:\www\reddit\reddit-trend-tc\.pi\prompts\node-run.md' }
)
foreach ($s in $tmplSpots) {
  if (Test-Path $s.path) {
    $hit = Select-String -Path $s.path -Pattern 'pi-tempo v[\d\.]+' | Select-Object -First 1
    $tv = if ($hit) { $hit.Matches[0].Value -replace 'pi-tempo v', '' } else { 'none' }
    Add-Result $s.where "marker v$tv == skill v$mVer" ($tv -eq $mVer)
  } else {
    Add-Result $s.where 'file exists' $false
  }
}

# 3.2 subagent byte-identity (hash): fixer/scout/review master -> global
foreach ($n in @('gemini-fixer', 'gemini-scout', 'independent-review')) {
  Add-Result ("subagent {0}" -f $n) 'global == master (hash)' (Same (Join-Path $ptSubs "$n.md") (Join-Path $gSubs "$n.md"))
}

# 3.3 node-architect per-project: mirror PROTOCOL + .nodes PROTOCOL == master (hash)
$naMaster = Join-Path $root 'node-architect\skill\references\PROTOCOL.md'
foreach ($p in $Projects) {
  if (-not (Test-Path $p)) { continue }
  $tag = Split-Path $p -Leaf
  $mirror = Join-Path $p '.agents\skills\node-architect\references\PROTOCOL.md'
  $nodes  = Join-Path $p '.nodes\PROTOCOL.md'
  Add-Result ("node-arch {0} mirror" -f $tag) 'skill PROTOCOL == master (hash)' (Same $naMaster $mirror)
  Add-Result ("node-arch {0} .nodes" -f $tag) '.nodes/PROTOCOL == master (norm)' (Same-Protocol $naMaster $nodes)
  # interlock: deployed node-run 2.5 branch needs PROTOCOL relay vocabulary (both hash==master implies both present)
  $nr = Join-Path $p '.pi\prompts\node-run.md'
  if (Test-Path $nr) {
    $hasRelayBranch = ((Select-String -Path $nr -Pattern '2\.5' | Measure-Object).Count -gt 0)
    $protoOK = (Same-Protocol $naMaster $nodes)
    Add-Result ("interlock {0}" -f $tag) 'node-run 2.5 <-> PROTOCOL relay' (-not ($hasRelayBranch -and -not $protoOK))
  }
}

# ---------- 4) summary ----------
Write-Host ''
Write-Host ('==== sync-skills {0} ====' -f $(if ($CheckOnly) { 'CHECK-ONLY' } else { 'DEPLOY+VERIFY' }))
$results | ForEach-Object { Write-Host $_ }
Write-Host ('{0} check(s), {1} failure(s)' -f $results.Count, $fail)
exit $(if ($fail -gt 0) { 1 } else { 0 })
