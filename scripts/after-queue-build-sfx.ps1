# THE SFX IMAGE IN THE DOWNLOAD ORDER (producer directive 2026-10-07: one large download at a time; MOSS-SFX v2 before
# the phoneme model). The sfx-moss image pulls ≈ 3 GB of torch wheels, so its build waits for the running queue to
# release var/locks/download.lock, holds the lock while it builds, then runs the next queue groups.
#   powershell -NoProfile -File scripts/after-queue-build-sfx.ps1 [-Then a,b,c]
param([string[]]$Then = @())
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$lock = 'var/locks/download.lock'
function Say($m) { "$((Get-Date).ToUniversalTime().ToString('s'))Z $m" }
while (Test-Path $lock) { Start-Sleep 5 }
New-Item -ItemType Directory -Force var/locks | Out-Null
"sfx-moss image build $(Get-Date -Format o)" | Out-File -Encoding utf8 $lock
$ok = $false
try {
  for ($n = 1; $n -le 5 -and -not $ok; $n++) {
    Say "BUILD sfx-moss attempt $n"
    docker compose -p vewbox --profile sfx build sfx-moss 2>&1 | Select-Object -Last 8
    if ($LASTEXITCODE -eq 0) { $ok = $true } else { Say "build attempt $n failed (exit $LASTEXITCODE); retrying in 60 s"; Start-Sleep 60 }
  }
  Say ($(if ($ok) { 'DONE sfx-moss image' } else { 'STOPPED: sfx-moss image did not build after 5 attempts' }))
} finally { Remove-Item $lock -ErrorAction SilentlyContinue }
if ($Then.Count) { & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/download-queue.ps1 -Groups ($Then -join ',') }
