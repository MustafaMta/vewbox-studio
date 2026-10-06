<#
  COMPACT DOCKER'S DATA DISK (docs/MODELS-STORAGE.md "Reclaiming C:"). Run by the PRODUCER in an ADMIN PowerShell,
  in the agreed window, after scripts/models-store-retire.ps1 -Execute (-DropVolumes) has run.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\compact-docker-disk.ps1 -DryRun     # print each step
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\compact-docker-disk.ps1             # do it

  Steps: (1) preconditions: admin; the retire record (var\models-store\retire.log) exists with its fstrim; no studio job
  PREPARING..POSTPROCESSING; (2) quit Docker Desktop gracefully (`docker desktop stop`) and wait until its processes
  are gone (never killed); (3) `wsl --shutdown` (this also detaches the model store; it is re-attached by the watchdog);
  (4) diskpart, from a generated script file: select vdisk / attach vdisk readonly / compact vdisk / detach vdisk, on
  docker_data.vhdx ONLY, with its size before and after; (5) stop with a clear message on any error. It never touches
  another VHDX (D:\models\vewbox-models.vhdx included), never deletes anything, never resets Docker, and does not
  start Docker again: (6) back in the normal (non-admin) session the coordinator runs `docker-watchdog --start-docker`
  (attaches the model store first), then the P1 relaunch and the sign-in task.
#>
param([switch]$DryRun, [string]$Repo = (Split-Path -Parent $PSScriptRoot), [string]$Vhdx = (Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'))
$ErrorActionPreference = 'Continue'
# the whole run is kept in var\models-store\compact-<time>.log, readable from the normal session afterwards
$logDir = Join-Path $Repo 'var\models-store'; New-Item -ItemType Directory -Force $logDir | Out-Null
try { Start-Transcript -Path (Join-Path $logDir ("compact-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))) | Out-Null } catch { }
function Say($m) { Write-Host ("[compact {0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
function Fail($m) { Write-Host ("[compact] STOPPED: {0}" -f $m) -ForegroundColor Red; Write-Host '[compact] Nothing was deleted. Docker is not restarted by this script: return to the normal session and run docker-watchdog --start-docker.'; exit 1 }
function SizeGB($p) { [math]::Round((Get-Item -LiteralPath $p).Length / 1GB, 2) }
function Step($n, $what, [scriptblock]$do) { Say "STEP $n - $what"; if ($DryRun) { Say '  (dry run: not executed)' } else { & $do } }

# (1) preconditions ------------------------------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) { Fail 'diskpart needs an ADMIN PowerShell (Run as administrator).' }
if (-not $isAdmin) { Say 'not admin (fine for a dry run; the real run needs Run as administrator)' }
$full = [IO.Path]::GetFullPath($Vhdx)
if ((Split-Path -Leaf $full) -ne 'docker_data.vhdx' -or $full -notlike "$env:LOCALAPPDATA\Docker\wsl\disk\*") { Fail "refusing: $full is not Docker Desktop's docker_data.vhdx" }
if (-not (Test-Path -LiteralPath $full)) { Fail "$full does not exist" }
$log = Join-Path $Repo 'var\models-store\retire.log'
if (-not (Test-Path $log)) { Fail "no retire record ($log): run scripts\models-store-retire.ps1 -Execute first" }
$last = Get-Content $log | Where-Object { $_ } | Select-Object -Last 1 | ConvertFrom-Json
if (-not $last.fstrim) { Fail 'the last retire run recorded no fstrim; run models-store-retire.ps1 -Execute again' }
Say ("retire record: {0}, {1:N1} GB of folders deleted, old volumes left: {2}" -f $last.at, ($last.freedBytes / 1GB), ($(if ($last.oldVolumesLeft) { $last.oldVolumesLeft -join ', ' } else { 'none' })))
$engine = $false; try { $engine = [bool](docker version --format '{{.Server.Version}}' 2>$null) } catch { }
if ($engine) {
  $running = docker exec vewbox-db-1 psql -U vewbox -d vewbox -t -A -c "select count(*) from jobs where status in ('PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')" 2>$null
  if ("$running".Trim() -notmatch '^\d+$') { Fail 'could not read the job table (is vewbox-db-1 up?)' }
  if ([int]"$running".Trim() -gt 0 -and $DryRun) { Say "a real run would STOP here: $("$running".Trim()) studio job(s) are running" }
  elseif ([int]"$running".Trim() -gt 0) { Fail"$("$running".Trim()) studio job(s) are running: wait for an idle window (pause intake: scripts/studio-intake.ts pause)" }
  else { Say 'no studio job is running' }
} else { Say 'the Docker engine is not answering: Docker is treated as already stopped' }
$before = SizeGB $full
$cBefore = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
Say "docker_data.vhdx $before GB; C: free $cBefore GB"

# (2) quit Docker Desktop gracefully ---------------------------------------------------------------------------------
Step 2 'quit Docker Desktop gracefully (docker desktop stop) and wait until its processes are gone' {
  if (Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue) {
    & docker desktop stop 2>&1 | ForEach-Object { Say "  $_" }
    $t0 = Get-Date
    while (Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue) {
      if (((Get-Date) - $t0).TotalSeconds -gt 300) { Fail 'Docker Desktop did not quit within 5 min. Quit it from the tray (Quit Docker Desktop) and run this again. Never end it in Task Manager; never Reset to factory defaults.' }
      Start-Sleep 5
    }
    Say "  Docker Desktop quit after $([int]((Get-Date) - $t0).TotalSeconds) s"
  } else { Say '  Docker Desktop is not running' }
}

# (3) shut the WSL VM down (releases docker_data.vhdx; also detaches the model store) -------------------------------
Step 3 'wsl --shutdown' {
  & wsl.exe --shutdown
  if ($LASTEXITCODE -ne 0) { Fail "wsl --shutdown failed ($LASTEXITCODE)" }
  Start-Sleep 8
}

# (4) diskpart compact, docker_data.vhdx only ------------------------------------------------------------------------
$dp = Join-Path $env:TEMP 'vewbox-compact-docker.diskpart'
$script = "select vdisk file=`"$full`"`r`nattach vdisk readonly`r`ncompact vdisk`r`ndetach vdisk`r`nexit`r`n"
Say "diskpart script ($dp):"; $script -split "`r`n" | Where-Object { $_ } | ForEach-Object { Say "  $_" }
Step 4 'diskpart compact (this takes a while for a 430 GB file)' {
  [IO.File]::WriteAllText($dp, $script, [Text.Encoding]::ASCII)
  $t0 = Get-Date
  $out = & diskpart.exe /s $dp 2>&1
  $out | ForEach-Object { Say "  $_" }
  if ($LASTEXITCODE -ne 0 -or @($out | Where-Object { "$_" -match 'error|failed|denied' }).Count) {
    $det = [IO.Path]::ChangeExtension($dp, '.detach')
    [IO.File]::WriteAllText($det, "select vdisk file=`"$full`"`r`ndetach vdisk`r`nexit`r`n", [Text.Encoding]::ASCII)
    & diskpart.exe /s $det 2>&1 | ForEach-Object { Say "  (detach) $_" }
    Fail "diskpart reported an error (exit $LASTEXITCODE); the disk was detached again. See the lines above."
  }
  Say "  compact took $([int]((Get-Date) - $t0).TotalMinutes) min"
}
$after = SizeGB $full
$cAfter = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
Say "docker_data.vhdx $before GB -> $after GB; C: free $cBefore GB -> $cAfter GB"

# (6) hand back --------------------------------------------------------------------------------------------------------
Say 'DONE. Close this admin window and return to the normal (non-admin) session. There the coordinator runs:'
Say '  pnpm exec tsx scripts/docker-watchdog.ts --start-docker   (attaches the model store, then starts Docker Desktop)'
Say '  then the P1 relaunch (worker and web outside the job) and the sign-in task.'
