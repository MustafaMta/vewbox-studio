# MODEL INVENTORY — what is physically in the store (docker/models/inventory.py), run inside the fetcher image with the
# working tree's docker/models mounted (no rebuild, no download). Writes var/model-inventory.json and prints the table.
#   powershell -NoProfile -File scripts/model-inventory.ps1 [-Hash] [-PruneStale]
# -Hash verifies PRESENT_UNVERIFIED files now (reads them whole); -PruneStale drops state records whose file is gone.
param([switch]$Hash, [switch]$PruneStale)
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force var | Out-Null
$queued = @()
if (Test-Path var/locks/download.lock) { $queued += ((Get-Content var/locks/download.lock -First 1) -replace '^model download queue: ', '' -replace ' \d{4}-.*$', '') -split ',\s*' }
$args = @('--manifest', '/src/manifest.json', '--root', '/models', '--json', '/out/model-inventory.json')
if ($queued.Count) { $args += @('--queued', ($queued -join ',')) }
if ($Hash) { $args += '--hash' }
if ($PruneStale) { $args += '--prune-stale' }
docker compose -p vewbox --profile models run --rm -v "$PWD\docker\models:/src:ro" -v "$PWD\var:/out" --entrypoint python models /src/inventory.py @args
