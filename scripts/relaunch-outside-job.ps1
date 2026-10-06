<#
  RELAUNCH THE STUDIO OUTSIDE THE CLAUDE APP'S JOB OBJECT (reliability investigation 2026-10-06, proposal P1).

  Docker Desktop, the host worker and the :4200 web server were started from Claude sessions, so they live in the
  Claude desktop app's Windows job object and are terminated whenever the app updates or restarts (that is what
  "crashed" Docker on 2026-10-06 05:19 local). This script moves all three out, in an IDLE window:

    1. preconditions: no job running (PREPARING..POSTPROCESSING) in the live studio; otherwise it stops (use -Force
       only if the operator accepts that the running attempts are lost and retried)
    2. stop the host worker and the :4200 web server (no job is running, so nothing is lost)
    3. quit Docker Desktop GRACEFULLY (`docker desktop stop`) and wait until its processes are gone - never killed;
       if it does not quit within 3 min the script stops and asks for Quit from the tray
    4. docker-watchdog --start-docker (moves a stale secrets-engine socket folder aside, attaches the model store
       D:\models\vewbox-models.vhdx - docs/MODELS-STORAGE.md - then starts Docker via WMI)
    5. wait for the engine and vewbox-db-1 healthy
    6. --start-worker, --start-web, wait for http://127.0.0.1:4200/api/health
    7. --start-self --fix --worker --web --watch 60 (the watchdog itself, outside the job)
    8. a final read-only watchdog report: no CONTAINED warning expected

  Usage (from any shell; the script launches everything through WMI, so where it runs from does not matter):
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\relaunch-outside-job.ps1 -DryRun
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\relaunch-outside-job.ps1
  -Repo defaults to the checkout this script lives in (the main checkout D:\vewbox). Never resets Docker, never
  restarts a container.
#>
param(
  [string]$Repo = (Split-Path -Parent $PSScriptRoot),
  [switch]$DryRun,
  [switch]$Force,
  [int]$WebPort = 4200
)
$ErrorActionPreference = 'Stop'
$Repo = $Repo.TrimEnd('\', '/')
function Say($m) { Write-Host ("[relaunch {0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
function Fail($m) { Write-Host ("[relaunch] STOPPED: {0}" -f $m) -ForegroundColor Red; exit 1 }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Fail 'node.exe is not on PATH' }
$tsx = Join-Path $Repo 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path $tsx)) { Fail "tsx not found under $Repo (node_modules missing?)" }
function Watchdog([string[]]$a) {
  Push-Location $Repo
  try { & $node $tsx scripts/docker-watchdog.ts @a | Out-Host; return $LASTEXITCODE } finally { Pop-Location }
}
function EngineUp { try { $v = & docker version --format '{{.Server.Version}}' 2>$null; return [bool]$v } catch { return $false } }
function DbHealthy { try { return ((& docker inspect -f '{{.State.Health.Status}}' vewbox-db-1 2>$null) -eq 'healthy') } catch { return $false } }
function WebHealthy { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 "http://127.0.0.1:$WebPort/api/health"; return $r.StatusCode -lt 500 } catch { return $false } }
function WaitFor([string]$what, [scriptblock]$cond, [int]$seconds) {
  $t0 = Get-Date
  while (-not (& $cond)) {
    if (((Get-Date) - $t0).TotalSeconds -gt $seconds) { return $false }
    Start-Sleep -Seconds 5
  }
  Say "$what after $([int]((Get-Date) - $t0).TotalSeconds) s"; return $true
}
function TreeOf([int]$rootPid) {
  $all = Get-CimInstance Win32_Process; $ids = @($rootPid); $added = $true
  while ($added) { $added = $false; foreach ($p in $all) { if ($ids -contains [int]$p.ParentProcessId -and -not ($ids -contains [int]$p.ProcessId)) { $ids += [int]$p.ProcessId; $added = $true } } }
  return $ids
}
function RootsOf([string]$like) {
  $all = Get-CimInstance Win32_Process
  $hits = @($all | Where-Object { $_.CommandLine -like $like -and $_.Name -eq 'node.exe' })
  $roots = @()
  foreach ($h in $hits) {
    $x = $h
    for ($i = 0; $i -lt 6; $i++) {
      $parent = $all | Where-Object { $_.ProcessId -eq $x.ParentProcessId } | Select-Object -First 1
      if (-not $parent -or $parent.Name -notin 'node.exe','powershell.exe','cmd.exe') { break }
      if ($parent.Name -eq 'powershell.exe' -and $parent.CommandLine -notlike "*$Repo*") { break }
      $x = $parent
    }
    # only the main checkout's processes: never an agent's worktree worker or server
    if ("$($x.CommandLine) $($h.CommandLine)" -like '*\.claude\worktrees\*') { continue }
    if ($roots -notcontains [int]$x.ProcessId) { $roots += [int]$x.ProcessId }
  }
  return $roots
}

# 1. preconditions --------------------------------------------------------------------------------------------
Say "repo $Repo; dry run: $DryRun"
if (-not (EngineUp)) { Say 'the Docker engine is not answering now: steps 2-3 are skipped, the relaunch starts at step 4' }
else {
  $running = (& docker exec vewbox-db-1 psql -U vewbox -d vewbox -t -A -c "select count(*) from jobs where status in ('PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')" 2>$null)
  $running = [int]("$running".Trim())
  Say "jobs running in the live studio: $running"
  if ($running -gt 0 -and $DryRun) { Say "a real run would STOP here: $running job(s) running" }
  elseif ($running -gt 0 -and -not $Force) { Fail "$running job(s) are running. Wait for an idle window (or pause intake: scripts/studio-intake.ts pause, and let them finish). -Force accepts losing the running attempts." }
}
$workerRoots = RootsOf '*src/worker/index.ts*'
$webRoots = RootsOf '*scripts/serve.ts*'
Say ("host worker process trees: {0}; web server trees: {1}" -f ($workerRoots -join ','), ($webRoots -join ','))
if ($DryRun) {
  Say 'DRY RUN - would: stop those trees; docker desktop stop (graceful, wait <= 3 min); docker-watchdog --start-docker; wait engine + db (<= 5 min); --start-worker; --start-web; wait /api/health (<= 5 min); --start-self --fix --worker --web --watch 60; final report.'
  [void](Watchdog @('--web')); exit 0
}

# 2. stop the worker and the web server ----------------------------------------------------------------------------
foreach ($r in @($workerRoots + $webRoots)) {
  $ids = TreeOf $r
  Say "stopping process tree $r ($($ids.Count) processes)"
  foreach ($id in ($ids | Sort-Object -Descending)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
}

# 3. quit Docker Desktop gracefully ----------------------------------------------------------------------------------
if (Get-Process -Name 'Docker Desktop','com.docker.backend' -ErrorAction SilentlyContinue) {
  Say 'docker desktop stop (graceful)'
  & docker desktop stop 2>&1 | ForEach-Object { Say "  $_" }
  if (-not (WaitFor 'Docker Desktop quit' { -not (Get-Process -Name 'Docker Desktop','com.docker.backend' -ErrorAction SilentlyContinue) } 180)) {
    Fail 'Docker Desktop did not quit within 3 min. Quit it from the tray icon (Quit Docker Desktop), wait until it is gone, then run this script again. Do NOT end it in Task Manager and NEVER use Reset to factory defaults.'
  }
}

# 4-5. Docker outside the job ---------------------------------------------------------------------------------------
if ((Watchdog @('--start-docker')) -ne 0) { Fail 'docker-watchdog --start-docker refused (see above)' }
if (-not (WaitFor 'engine up' { EngineUp } 300)) { Fail 'the engine did not answer within 5 min; look at Docker Desktop' }
if (-not (WaitFor 'vewbox-db-1 healthy' { DbHealthy } 300)) { Fail 'vewbox-db-1 is not healthy after 5 min' }

# 6. worker and web outside the job ---------------------------------------------------------------------------------
if ((Watchdog @('--start-worker')) -ne 0) { Fail 'could not start the worker' }
if ((Watchdog @('--start-web', '--web-port', "$WebPort")) -ne 0) { Fail 'could not start the web server' }
if (-not (WaitFor "web /api/health on :$WebPort" { WebHealthy } 300)) { Say "WARNING: /api/health did not answer within 5 min; look at $Repo\var\web-detached.log" }

# 7. the watchdog itself, outside the job ---------------------------------------------------------------------------
[void](Watchdog @('--start-self', '--fix', '--worker', '--web', '--web-port', "$WebPort", '--watch', '60'))

# 8. verify ----------------------------------------------------------------------------------------------------------
Start-Sleep -Seconds 10
$code = Watchdog @('--web', '--web-port', "$WebPort")
if ($code -eq 0) { Say 'DONE: Docker Desktop, the worker and the web server run outside the app''s job; the watchdog is watching (var/docker-watchdog.log).' }
else { Say 'DONE with warnings (see the report above).' }
