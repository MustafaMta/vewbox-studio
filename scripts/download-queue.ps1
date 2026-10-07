# THE MODEL DOWNLOAD QUEUE (producer directive 2026-10-07): one large download at a time on the constrained link, in
# the producer's order, each through the resumable, revision-pinned, sha256-verifying fetcher (docker/models/fetch.py,
# HF_TOKEN from .env, never printed). Waits for any other download (var/locks/download.lock) first. A failed group is
# retried (the fetcher resumes its partial files); the queue never skips ahead past a failure it could not recover.
#   powershell -NoProfile -File scripts/download-queue.ps1 [-Groups a,b,c] [-WaitFor <file that must exist first>]
param(
  [string[]]$Groups = @('llm-qwen3.8-27b-nvfp4', 'asr-qwen3-asr-1.7b', 'align-qwen3-forced-aligner-0.6b', 'music-ace-step-xl', 'sfx-moss-soundeffect-v2'),
  [string]$WaitFor = '',
  [switch]$Demucs
)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$lock = 'var/locks/download.lock'
function Say($m) { "$((Get-Date).ToUniversalTime().ToString('s'))Z $m" }

if ($WaitFor) { while (-not (Test-Path $WaitFor)) { Start-Sleep 60 } }
while (Test-Path $lock) { Start-Sleep 30 }
New-Item -ItemType Directory -Force var/locks | Out-Null
"model download queue: $($Groups -join ', ') $(Get-Date -Format o)" | Out-File -Encoding utf8 $lock
try {
  foreach ($g in $Groups) {
    Say "START $g"
    $ok = $false
    for ($n = 1; $n -le 30 -and -not $ok; $n++) {
      docker compose -p vewbox --profile models run --rm models --manifest manifest.json --root /models --groups $g 2>&1 | Select-Object -Last 3
      if ($LASTEXITCODE -eq 0) { $ok = $true } else { Say "$g attempt $n failed (exit $LASTEXITCODE); resuming in 30 s"; Start-Sleep 30 }
    }
    if (-not $ok) { Say "STOPPED: $g did not complete after 30 attempts"; exit 1 }
    Say "DONE $g"
  }
  if ($Demucs) {
    # htdemucs_ft: Demucs's four published checkpoints (not on Hugging Face) into TORCH_HOME = <store>/cache/torch; each
    # file name carries the first 8 hex of its sha256, which Demucs checks on load and this step checks here
    Say 'START htdemucs_ft'
    # fetched by the host's curl (the Windows certificate store trusts the antivirus's HTTPS re-signing; a container's
    # does not), staged on D:, verified, then copied into the store
    $stage = 'D:\vewbox-data\staging\htdemucs_ft'
    New-Item -ItemType Directory -Force $stage | Out-Null
    foreach ($f in 'f7e0c4bc-ba3fe64a.th', 'd12395a8-e57c48e6.th', '92cfc3b6-ef3bcb9c.th', '04573f0d-f3cf25b2.th') {
      curl.exe -sfL -C - --retry 20 --retry-all-errors -o "$stage\$f" "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/$f"
      $sha = (Get-FileHash "$stage\$f" -Algorithm SHA256).Hash.ToLower()
      $want = ($f -split '-')[1] -replace '\.th$', ''
      if (-not $sha.StartsWith($want)) { Say "STOPPED: htdemucs_ft $f sha256 $sha does not start with $want"; exit 1 }
      Say "ok $f $((Get-Item "$stage\$f").Length) bytes sha256 $sha"
    }
    docker run --rm -v vewbox_models_store:/models -v "${stage}:/in:ro" alpine sh -c 'mkdir -p /models/cache/torch/hub/checkpoints && cp /in/*.th /models/cache/torch/hub/checkpoints/ && ls -la /models/cache/torch/hub/checkpoints'
    if ($LASTEXITCODE -ne 0) { Say 'STOPPED: htdemucs_ft copy'; exit 1 }
    Say 'DONE htdemucs_ft'
  }
  Say 'QUEUE COMPLETE'
} finally { Remove-Item $lock -ErrorAction SilentlyContinue }
