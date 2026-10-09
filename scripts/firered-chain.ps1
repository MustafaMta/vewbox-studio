# THE STRICTLY SERIAL FIRERED CHAIN (the producer's order, 2026-10-09): one network consumer at a time.
#   1. wait for the FireRedTTS3-Base weights to verify (the download queue logs DONE eval-tts-fireredtts3-base)
#   2. build the tts-firered image (its wheel downloads are the next network consumer)
#   3. start tts-firered and wait for /health
#   4. only then queue the H3 BF16 resume (network free; the voice tests use the GPU, not the link)
# Log: var/firered-chain.log. Idempotent: a verified group, a built image or a healthy service is skipped.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/firered-chain.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = 'var/firered-chain.log'
function Say($m) { "$((Get-Date).ToUniversalTime().ToString('s'))Z $m" | Tee-Object -FilePath $log -Append }
Say 'CHAIN START'
# 1. the weights
$deadline = (Get-Date).AddHours(12)
while (-not (Test-Path var/download-fireredtts3.log) -or -not (Select-String -Path var/download-fireredtts3.log -Pattern 'DONE eval-tts-fireredtts3-base' -Quiet)) {
  if (Select-String -Path var/download-fireredtts3.log -Pattern 'STOPPED' -Quiet) { Say 'CHAIN FAILED: the download queue stopped'; exit 1 }
  if ((Get-Date) -gt $deadline) { Say 'CHAIN FAILED: the weights did not verify within 12 h'; exit 1 }
  Start-Sleep 60
}
Say 'weights verified by the fetcher'
$inv = powershell -NoProfile -File scripts/model-inventory.ps1 2>&1 | Select-String -Pattern 'eval-tts-fireredtts3-base'
Say "inventory: $inv"
if (-not ($inv -match 'VERIFIED\s+8/ 8')) { Say 'CHAIN FAILED: the inventory does not show the group VERIFIED 8/8'; exit 1 }
# 2. the image
$have = docker images -q vewbox/tts-firered:dev 2>$null
if (-not $have) {
  Say 'building tts-firered'
  $ok = $false
  for ($n = 1; $n -le 5 -and -not $ok; $n++) {
    docker compose -p vewbox --profile firered build tts-firered 2>&1 | Out-File -FilePath var/firered-build.log -Append -Encoding utf8
    if ($LASTEXITCODE -eq 0) { $ok = $true } else { Say "build attempt $n failed (exit $LASTEXITCODE); retrying in 60 s"; Start-Sleep 60 }
  }
  if (-not $ok) { Say 'CHAIN FAILED: the image did not build'; exit 1 }
}
Say 'image ready'
# 3. the service
docker compose -p vewbox --profile firered up -d tts-firered 2>&1 | Out-File -FilePath var/firered-build.log -Append -Encoding utf8
$up = $false
for ($n = 1; $n -le 60 -and -not $up; $n++) {
  try { $h = Invoke-RestMethod -Uri http://127.0.0.1:8026/health -TimeoutSec 10; if ($h) { $up = $true; Say "health: $($h | ConvertTo-Json -Compress)" } } catch { Start-Sleep 20 }
}
if (-not $up) { Say 'CHAIN FAILED: tts-firered did not become healthy'; docker logs --tail 40 vewbox-tts-firered-1 2>&1 | Out-File -FilePath var/firered-build.log -Append -Encoding utf8; exit 1 }
# 4. the network is free: the H3 BF16 tier resumes from its partial files
Say 'queueing the H3 BF16 resume'
Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/download-queue.ps1','-Groups','video-minimax-h3-bf16' -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput 'var/download-h3-bf16-resume.log' -RedirectStandardError 'var/download-h3-bf16-resume.err.log' | Out-Null
Say 'CHAIN DONE'
