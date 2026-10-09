# THE FIRERED TICK — a resumable state machine run by the Task Scheduler every 5 minutes (the producer's order,
# 2026-10-09, after one long-running chain died when the machine slept at 12:53Z and Docker restarted on resume).
# Each tick: take the lock (one active instance; a stale lock from a dead tick is taken over) → wait for Docker →
# inspect the PHYSICAL state (scripts/model-inventory.ps1, the source of truth) → do at most ONE step → exit cleanly.
#   1. FireRedTTS3-Base weights not VERIFIED 8/8  → run the fetcher for that group once (it resumes partial blobs;
#      nothing verified is fetched again)
#   2. weights verified, image vewbox/tts-firered missing → build it once (wheels on a BuildKit cache mount)
#   3. image present, service not healthy → `up -d` and wait for /health; log SERVICE HEALTHY once
#   4. var/state/phase1-pack-ready exists (the Phase 1 listening pack is rebuilt with FireRed: the FireRed phase is
#      complete) and the H3 BF16 tier not VERIFIED → run the fetcher for video-minimax-h3-bf16 once (resumes 34.6 %)
#   5. everything done → log DONE and exit
# One network consumer at a time by construction. Survives sleep, Docker restarts and network drops: the next tick
# simply inspects and resumes. Log: var/firered-tick.log (state transitions), var/firered-tick-fetch.log (fetcher output).
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/firered-tick.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$ErrorActionPreference = 'Continue'
$log = 'var/firered-tick.log'; $flog = 'var/firered-tick-fetch.log'
function Say($m) { "$((Get-Date).ToUniversalTime().ToString('s'))Z [$PID] $m" | Out-File -FilePath $log -Append -Encoding utf8 }
New-Item -ItemType Directory -Force var/locks, var/state | Out-Null

# ---- one active instance
$lock = 'var/locks/firered-tick.lock'
if (Test-Path $lock) {
  $other = Get-Content $lock -First 1
  if ($other -match '^\d+$' -and (Get-Process -Id ([int]$other) -ErrorAction SilentlyContinue)) { exit 0 } # a live tick works
  Say "stale lock from pid $other taken over"
}
"$PID" | Out-File -FilePath $lock -Encoding ascii
try {
  # ---- Docker must answer (after a sleep/resume it comes back within minutes)
  $ok = $false
  for ($n = 0; $n -lt 20 -and -not $ok; $n++) { docker info 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $ok = $true } else { Start-Sleep 30 } }
  if (-not $ok) { Say 'docker not answering after 10 min; next tick'; exit 0 }
  # the download queue's lock belongs to the one-shot queue script; a tick must not run beside it
  if (Test-Path var/locks/download.lock) { Say 'a download-queue run holds var/locks/download.lock; next tick'; exit 0 }

  function Inventory { powershell -NoProfile -File scripts/model-inventory.ps1 2>&1 | Where-Object { $_ -match '^(eval-tts-fireredtts3-base|video-minimax-h3-bf16)\s' } }
  function Fetch($group) {
    Say "FETCH $group"
    docker compose -p vewbox --profile models run --rm models --manifest manifest.json --root /models --groups $group 2>&1 | Out-File -FilePath $flog -Append -Encoding utf8
    Say "FETCH $group exit $LASTEXITCODE"
  }
  $inv = Inventory
  $fire = ($inv | Where-Object { $_ -match '^eval-tts-fireredtts3-base' }) -join ''
  $h3 = ($inv | Where-Object { $_ -match '^video-minimax-h3-bf16' }) -join ''
  Say "state: $fire | $h3"

  # 1. the weights
  if ($fire -notmatch 'VERIFIED\s+8/ 8') { Fetch 'eval-tts-fireredtts3-base'; $after = (Inventory | Where-Object { $_ -match '^eval-tts-fireredtts3-base' }) -join ''; Say "after: $after"; if ($after -match 'VERIFIED\s+8/ 8') { Say 'WEIGHTS VERIFIED' }; exit 0 }
  # the producer's pause (2026-10-09: "after download complete pause"): the weights are fetched and verified above;
  # nothing further (build, service, H3) runs while var/state/paused exists
  if (Test-Path var/state/paused) { if (-not (Test-Path var/state/paused-logged)) { Say 'PAUSED after the verified weights (var/state/paused); remove the file to continue'; 'logged' | Out-File var/state/paused-logged }; exit 0 }
  # 2. the image
  if (-not (docker images -q vewbox/tts-firered:dev 2>$null)) {
    Say 'BUILD tts-firered'
    docker compose -p vewbox --profile firered build tts-firered 2>&1 | Out-File -FilePath var/firered-build.log -Append -Encoding utf8
    Say "BUILD exit $LASTEXITCODE"
    if (docker images -q vewbox/tts-firered:dev 2>$null) { Say 'IMAGE BUILT' }
    exit 0
  }
  # 3. the service
  $healthy = $false
  try { $h = Invoke-RestMethod -Uri http://127.0.0.1:8026/health -TimeoutSec 10; if ($h) { $healthy = $true } } catch { }
  if (-not $healthy) {
    Say 'UP tts-firered'
    docker compose -p vewbox --profile firered up -d tts-firered 2>&1 | Out-File -FilePath var/firered-build.log -Append -Encoding utf8
    for ($n = 0; $n -lt 30 -and -not $healthy; $n++) { Start-Sleep 20; try { $h = Invoke-RestMethod -Uri http://127.0.0.1:8026/health -TimeoutSec 10; if ($h) { $healthy = $true } } catch { } }
    if ($healthy) { Say "SERVICE HEALTHY $($h | ConvertTo-Json -Compress)" } else { Say 'service not healthy yet'; docker logs --tail 20 vewbox-tts-firered-1 2>&1 | Out-File -FilePath var/firered-build.log -Append -Encoding utf8 }
    exit 0
  }
  if (-not (Test-Path var/state/firered-service-healthy)) { Say "SERVICE HEALTHY $($h | ConvertTo-Json -Compress)"; (Get-Date).ToUniversalTime().ToString('s') | Out-File var/state/firered-service-healthy }
  # 4. the H3 tier, only once the FireRed phase is complete (the listening pack rebuilt with FireRed)
  if (-not (Test-Path var/state/phase1-pack-ready)) { exit 0 }
  if ($h3 -notmatch 'VERIFIED\s+3/ 3') { Fetch 'video-minimax-h3-bf16'; $after = (Inventory | Where-Object { $_ -match '^video-minimax-h3-bf16' }) -join ''; Say "after: $after"; if ($after -match 'VERIFIED\s+3/ 3') { Say 'H3 BF16 VERIFIED' }; exit 0 }
  # 5. nothing left
  if (-not (Test-Path var/state/firered-tick-done)) { Say 'DONE: weights, image, service and the H3 BF16 tier are all in place'; 'done' | Out-File var/state/firered-tick-done }
} finally { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
