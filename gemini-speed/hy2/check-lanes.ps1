# HY2 tri-lane health check logic (v5)
# Fast probe: every lane /v1/models (tunnel + key)
# Deep probe: Web lane real chat completion (catches WARP drift / proxy breaker / upstream 302 that models-probe cannot see)
Set-Location $PSScriptRoot
$lanes = @(
  @{p=9443; n='CPA';       k='cpa-api-key.txt';      deep=$false},
  @{p=9444; n='AIStudio';  k='aistudio-api-key.txt'; deep=$false},
  @{p=9445; n='Web';       k='web-api-key.txt';      deep=$true}
)
foreach ($l in $lanes) {
  $kf = $l.k
  if (-not (Test-Path $kf)) { Write-Host ('[--] ' + $l.n + ' (' + $l.p + ') skipped - no ' + $kf); continue }
  $k = (Get-Content -LiteralPath $kf -Raw).Trim()

  # fast probe
  $up = $true
  try {
    $r = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $l.p + '/v1/models') -Headers @{Authorization=('Bearer '+$k)} -TimeoutSec 12 -UseBasicParsing
    Write-Host ('[OK] ' + $l.n + ' (' + $l.p + ') models HTTP ' + $r.StatusCode)
  } catch {
    $up = $false
    if ($_.Exception.Response) { Write-Host ('[?] ' + $l.n + ' (' + $l.p + ') models HTTP ' + [int]$_.Exception.Response.StatusCode + ' - key problem') }
    else { Write-Host ('[X] ' + $l.n + ' (' + $l.p + ') tunnel down: ' + $_.Exception.Message) }
  }

  # deep probe: Web lane only (AI Studio has ~50/day quota - do not burn it on checks; CPA suspended)
  if ($l.deep -and $up) {
    $body = '{"model":"gemini-3.8-flash","messages":[{"role":"user","content":"Reply with exactly: ok"}]}'
    try {
      $t0 = Get-Date
      $r2 = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $l.p + '/v1/chat/completions') -Method Post -Body $body -ContentType 'application/json' -Headers @{Authorization=('Bearer '+$k)} -TimeoutSec 100 -UseBasicParsing
      $dt = [int]((Get-Date) - $t0).TotalSeconds
      $c = ($r2.Content | ConvertFrom-Json).choices[0].message.content
      Write-Host ('[OK] ' + $l.n + ' deep completion ' + $dt + 's -> "' + $c + '" (upstream healthy)')
    } catch {
      if ($_.Exception.Response) {
        try {
          $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
          $err = $sr.ReadToEnd()
          if ($err.Length -gt 140) { $err = $err.Substring(0,140) }
        } catch { $err = '' }
        Write-Host ('[X] ' + $l.n + ' deep completion HTTP ' + [int]$_.Exception.Response.StatusCode + ' - UPSTREAM PROBLEM: ' + $err)
        Write-Host ('    hint: if "circuit-breaker" or 302 above -> warp-watch should auto-heal in ~5min, or ssh reset breaker')
      } else {
        Write-Host ('[X] ' + $l.n + ' deep completion failed (timeout/stall): ' + $_.Exception.Message)
      }
    }
  }
}
