<#
  RETIRE THE OLD MODEL COPIES (docs/MODELS-STORAGE.md, "Migration record"). Run by the PRODUCER: it permanently deletes
  model files from the old Docker volumes vewbox_models / vewbox_ollama (inside Docker's disk image on C:) once their
  copies in the model store (D:\models\vewbox-models.vhdx) are verified and in use.

  Default = DRY RUN: prints what would be deleted and every check, deletes nothing.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\models-store-retire.ps1                 # dry run
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\models-store-retire.ps1 -Execute        # delete folders
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\models-store-retire.ps1 -Execute -DropVolumes
        # when nothing references the old volumes any more: remove vewbox_models and vewbox_ollama entirely

  Before ANY deletion, per folder:
    1. every file of the folder is in the store at its place (docker/models/layout.json) with the same size, and its
       sha256 was checked at copy time (the store's /models/.migration/copy-log.jsonl);
    2. no RUNNING container that mounts the old volume reads that folder (the readers per folder are listed below;
       ComfyUI's folders wait for comfyui, the voice-bench folders for the tts-bench-* containers).
  A folder that fails a check is skipped and reported; nothing else is touched. pgdata, var/, the source and every
  other volume are never touched. Deleting inside a volume does NOT shrink docker_data.vhdx on C:; the script ends
  with an fstrim of Docker's data disk (harmless, no downtime) so a later compaction can give the space back
  (docs/MODELS-STORAGE.md "Reclaiming C:").
#>
param([switch]$Execute, [switch]$DropVolumes, [string[]]$Only)
$ErrorActionPreference = 'Continue'
$Root = '/run/desktop/mnt/host/wsl/models'
function Say($m) { Write-Host ("[retire {0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
function CFreeGB { [math]::Round((Get-PSDrive C).Free / 1GB, 1) }

# folder of the OLD vewbox_models volume -> the containers (name patterns) that may still read it from that volume
$Folders = [ordered]@{
  'asr' = @(); 'align' = @(); 'demucs' = @(); 'hf-home' = @(); 'identity' = @(); 'qa' = @(); 'lipsync' = @()
  'tts/indextts-2.5' = @(); 'tts/habibi' = @()
  'diffusion_models' = @('comfyui'); 'text_encoders' = @('comfyui'); 'vae' = @('comfyui'); 'loras' = @('comfyui'); 'detection' = @('comfyui')
  'tts/voxcpm2' = @('tts-bench'); 'tts/bench' = @('tts-bench'); 'eval' = @('tts-bench')
}
if ($Only) { $keep = [ordered]@{}; foreach ($k in $Folders.Keys) { if ($Only -contains $k) { $keep[$k] = $Folders[$k] } }; $Folders = $keep }

Say ("mode: {0}; C: free {1} GB" -f ($(if ($Execute) { 'EXECUTE' } else { 'DRY RUN' })), (CFreeGB))
$marker = docker run --rm -v /run/desktop/mnt/host/wsl:/w:ro alpine test -f /w/models/.vewbox-models; if ($LASTEXITCODE -ne 0) { Say 'STOP: the model store is not attached (no marker); nothing is deleted'; exit 1 }

# running containers that mount the OLD volume
$oldUsers = @(docker ps --filter volume=vewbox_models --format '{{.Names}}')
Say ("running containers on the old vewbox_models: {0}" -f ($(if ($oldUsers.Count) { $oldUsers -join ', ' } else { 'none' })))

# the per-folder store check (size of every file + sha256 recorded at copy time), in a throwaway container
$check = @'
import json, os, sys
sys.path.insert(0, "/repo/scripts/lib")
layout = json.load(open("/repo/docker/models/layout.json"))
def physical(l):
    top, _, rest = l.partition("/")
    if top in layout["comfyui"]["folders"]: return layout["comfyui"]["dir"] + "/" + l
    r = layout.get("renamed", {}).get(top)
    return (r + ("/" + rest if rest else "")) if r else l
log = set()
for f in ("/new/.migration/copy-log.jsonl", "/new/.migration/copy-log-attempt1.jsonl"):
    if os.path.exists(f):
        for line in open(f):
            r = json.loads(line)
            if r.get("ok") and r.get("sha256"): log.add(r["dst"].replace("/dst/", "/new/", 1))
folder = sys.argv[1]
base = "/old/" + folder
if not os.path.isdir(base): print(json.dumps({"folder": folder, "ok": True, "absent": True})); sys.exit(0)
n = b = 0; bad = []
for root, dirs, files in os.walk(base):
    dirs[:] = [d for d in dirs if d != ".hf"]
    for fn in files:
        p = os.path.join(root, fn); rel = os.path.relpath(p, "/old")
        if os.path.islink(p): continue
        if rel.endswith((".incomplete", ".lock", ".tmp")): continue
        q = "/new/" + physical(rel)
        if not os.path.exists(q) or os.path.getsize(q) != os.path.getsize(p): bad.append(rel + " (missing or size differs)"); continue
        if q not in log: bad.append(rel + " (no sha256 record of the copy)"); continue
        n += 1; b += os.path.getsize(p)
tot = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(base) for f in fs if not os.path.islink(os.path.join(r, f)))
print(json.dumps({"folder": folder, "ok": not bad, "files_verified": n, "bytes_verified": b, "bytes_in_folder_incl_scaffolding": tot, "problems": bad[:10]}))
'@
$repo = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP 'vewbox-retire-check.py'
[IO.File]::WriteAllText($tmp, $check, (New-Object System.Text.UTF8Encoding $false))

$freed = 0
foreach ($f in $Folders.Keys) {
  $readers = @($oldUsers | Where-Object { $n = $_; @($Folders[$f] | Where-Object { $n -like "*$_*" }).Count -gt 0 })
  if ($readers.Count) { Say "SKIP $f : still read from the old volume by $($readers -join ', ')"; continue }
  $j = docker run --rm -v vewbox_models:/old:ro -v "${Root}:/new:ro" -v "${repo}:/repo:ro" -v "${tmp}:/check.py:ro" --entrypoint python vewbox/models:dev /check.py $f | ConvertFrom-Json
  if (-not $j.ok) { Say "SKIP $f : $($j.problems -join '; ')"; continue }
  if ($j.absent) { Say "$f : already gone"; continue }
  Say ("{0} : {1} files, {2:N2} GB verified in the store" -f $f, $j.files_verified, ($j.bytes_in_folder_incl_scaffolding / 1GB))
  if ($Execute) {
    docker run --rm -v vewbox_models:/old --entrypoint sh vewbox/models:dev -c "rm -rf '/old/$f'"
    if ($LASTEXITCODE -eq 0) { $freed += $j.bytes_in_folder_incl_scaffolding; Say "  deleted /old/$f" } else { Say "  delete FAILED for $f" }
  }
}
# the old Ollama volume: every blob is named by its sha256 and was checked at copy time; nothing may mount it
$ol = @(docker ps -a --filter volume=vewbox_ollama --format '{{.Names}} ({{.Status}})')
if ($ol.Count) { Say "SKIP vewbox_ollama: still referenced by $($ol -join ', ')" }
elseif ($DropVolumes) { Say 'vewbox_ollama: no container references it' }

if ($DropVolumes) {
  foreach ($v in 'vewbox_models', 'vewbox_ollama') {
    $refs = @(docker ps -a --filter volume=$v --format '{{.Names}} ({{.Status}})')
    if ($refs.Count) { Say "KEEP volume $v : referenced by $($refs -join ', ') (remove or recreate those containers first)"; continue }
    $size = docker run --rm -v "${v}:/v:ro" alpine du -sh /v
    if ($Execute) { docker volume rm $v | Out-Null; if ($LASTEXITCODE -eq 0) { Say "volume $v removed ($size)" } else { Say "volume $v NOT removed" } }
    else { Say "would remove volume $v ($size)" }
  }
}
if ($Execute) {
  # tell the virtual disk which blocks are free (no downtime); the file on C: shrinks only at compaction
  docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -- fstrim -v /mnt/docker-desktop-disk | ForEach-Object { Say "fstrim: $_" }
}
Say ("done; {0:N1} GB of folders deleted; C: free now {1} GB (docker_data.vhdx keeps its size until compacted)" -f ($freed / 1GB), (CFreeGB))
