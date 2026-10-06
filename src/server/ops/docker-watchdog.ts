import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** THE DOCKER / WORKER WATCHDOG (reliability investigation 2026-10-06; scripts/docker-watchdog.ts).
 *
 *  ROOT CAUSE it guards against: Docker Desktop, the host worker and the dev servers were started from shells that
 *  descend from the Claude desktop app (a packaged MSIX app). Every process started that way — even with
 *  `Start-Process`, even "detached" — stays inside the app's Windows JOB OBJECT. When the app is updated
 *  (AppX "RegisterByPackageFamilyName … ForceApplicationShutdownOption", 2026-10-06 05:19:13–05:19:46 local) or
 *  restarted, every process in that job is terminated: Docker Desktop's backend log stops mid-line at 05:19:43, the
 *  WSL clients die, both distros stop, the worker and the :4200 preview die, and the abrupt end leaves the stale
 *  `docker-secrets-engine\engine.sock` that blocks the next start.
 *
 *  So: (1) processes that must outlive the app are started OUTSIDE its job — through WMI (`Win32_Process.Create`:
 *  the WMI provider host creates the process, in the user's interactive session, outside the caller's job);
 *  (2) the watchdog reports a Docker Desktop or worker that is still inside the job (it will die at the next app
 *  update) without touching it; (3) after a crash it renames the stale socket folder aside (never "Reset to factory
 *  defaults"), starts Docker Desktop outside the job, waits for the engine and the database, and starts the worker
 *  outside the job. It never kills Docker Desktop, never restarts a container (compose's restart policy does that),
 *  and never acts while Docker Desktop processes exist (starting or hung: reported only). Restarts are capped.
 *
 *  The decision is pure (`planWatchdog`, tested); probes and actions are thin wrappers below. */

export interface WatchdogState {
  /** `docker version` answered with a server version */
  engineOk: boolean;
  /** Docker Desktop / com.docker.backend processes running */
  dockerProcesses: number;
  /** ms the engine has been seen down by this watchdog (0 when up or first seen now) */
  engineDownForMs: number;
  /** the secrets-engine socket exists (meaningful only with no Docker process) */
  secretsSocketExists: boolean;
  /** the studio database container reports healthy */
  dbHealthy: boolean;
  /** a host worker process (src/worker/index.ts) is running */
  workerRunning: boolean;
  /** age of the worker's alive file (ms), when it exists */
  workerAliveAgeMs?: number;
  /** whether this watchdog may start the worker (the operator asked for it; generation not paused on purpose) */
  workerWanted: boolean;
  /** containment, when determinable (the watchdog runs inside the app's job): processes that die with the app */
  containment?: { dockerInAppJob: number; workerInAppJob: number };
  /** Docker starts this watchdog performed in the last hour */
  recentDockerStarts: number;
}

export type WatchdogAction =
  | { kind: 'ok'; detail: string }
  | { kind: 'warn'; code: 'CONTAINED' | 'HUNG' | 'WORKER_STALE' | 'RESTART_CAP' | 'DB_UNHEALTHY'; detail: string }
  | { kind: 'rename-stale-socket' }
  | { kind: 'start-docker' }
  | { kind: 'wait-engine' }
  | { kind: 'start-worker' };

export const HUNG_AFTER_MS = 10 * 60_000;
export const WORKER_STALE_AFTER_MS = 5 * 60_000;
export const MAX_DOCKER_STARTS_PER_HOUR = 2;

/** What to do now. `fix`: false = report only. Pure. */
export function planWatchdog(s: WatchdogState, opts: { fix: boolean }): WatchdogAction[] {
  const out: WatchdogAction[] = [];
  if (s.containment && (s.containment.dockerInAppJob > 0 || s.containment.workerInAppJob > 0)) {
    out.push({ kind: 'warn', code: 'CONTAINED', detail: `${s.containment.dockerInAppJob} Docker process(es) and ${s.containment.workerInAppJob} worker process(es) were launched from the Claude app (or another launcher's job object): they will be terminated at its next update, restart or exit. Relaunch them outside the job (docker-watchdog --start-docker / --start-worker) at a moment no film job is running.` });
  }
  if (!s.engineOk) {
    if (s.dockerProcesses > 0) {
      // starting, or hung: never killed by the watchdog (a force-kill is what leaves the stale socket)
      if (s.engineDownForMs >= HUNG_AFTER_MS) out.push({ kind: 'warn', code: 'HUNG', detail: `Docker Desktop processes exist but the engine has not answered for ${Math.round(s.engineDownForMs / 60_000)} min. Quit Docker Desktop gracefully (tray → Quit), then run the watchdog with --fix. Never "Reset to factory defaults" (it wipes the volumes).` });
      else out.push({ kind: 'ok', detail: 'Docker Desktop is starting (engine not answering yet)' });
      return out;
    }
    if (!opts.fix) { out.push({ kind: 'warn', code: 'HUNG', detail: `Docker is not running${s.secretsSocketExists ? ' and its stale secrets-engine socket is left behind' : ''}; run with --fix to restart it outside the app's job.` }); return out; }
    if (s.recentDockerStarts >= MAX_DOCKER_STARTS_PER_HOUR) { out.push({ kind: 'warn', code: 'RESTART_CAP', detail: `Docker was started ${s.recentDockerStarts} times in the last hour and is down again: not starting it again; a person must look.` }); return out; }
    if (s.secretsSocketExists) out.push({ kind: 'rename-stale-socket' });
    out.push({ kind: 'start-docker' }, { kind: 'wait-engine' });
    // the worker is started on the next pass, once the engine and the database answer
    return out;
  }
  if (!s.dbHealthy) { out.push({ kind: 'warn', code: 'DB_UNHEALTHY', detail: 'the engine answers but vewbox-db-1 is not healthy yet; the worker is not started' }); return out; }
  if (!s.workerRunning) {
    if (opts.fix && s.workerWanted) out.push({ kind: 'start-worker' });
    else out.push({ kind: 'ok', detail: `engine and database up; no host worker running${s.workerWanted ? ' (run with --fix to start it)' : ' (not started: --worker not given)'}` });
    return out;
  }
  if (s.workerAliveAgeMs !== undefined && s.workerAliveAgeMs > WORKER_STALE_AFTER_MS) {
    out.push({ kind: 'warn', code: 'WORKER_STALE', detail: `the worker process exists but has not ticked for ${Math.round(s.workerAliveAgeMs / 60_000)} min (its alive file); look at var/worker-detached.log — it is not restarted automatically` });
    return out;
  }
  out.push({ kind: 'ok', detail: 'engine, database and worker up' });
  return out;
}

// ------------------------------------------------------------------------------------------- outside the job

/** The PowerShell that creates `commandLine` through WMI (outside the caller's job), printing the new pid. */
export function wmiCreateScript(commandLine: string, cwd?: string): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${q(commandLine)}${cwd ? `; CurrentDirectory = ${q(cwd)}` : ''} }; if ($r.ReturnValue -ne 0) { Write-Error ("Win32_Process.Create failed: " + $r.ReturnValue); exit 1 }; $r.ProcessId`;
}

/** Start a process outside this process's job object (Windows). Returns its pid. */
export async function spawnOutsideJob(commandLine: string, cwd?: string): Promise<number> {
  if (process.platform !== 'win32') throw new Error('spawnOutsideJob is for Windows (the job object is the Windows mechanism)');
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', wmiCreateScript(commandLine, cwd)], { timeout: 60_000, windowsHide: true });
  const pid = Number(stdout.trim().split(/\s+/).pop());
  if (!Number.isFinite(pid) || pid <= 0) throw new Error(`no pid from Win32_Process.Create: ${stdout}`);
  return pid;
}

/** The host worker's command line, as the operations notes run it (env files, log appended), hidden window. */
export function workerCommandLine(repo: string, node = process.execPath): string {
  const tsx = path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const inner = `Set-Location -LiteralPath '${repo}'; $env:SERVICE_NAME='worker'; & '${node}' '${tsx}' --env-file=.env --env-file=.env.local src/worker/index.ts *>> var/worker-detached.log`;
  return `powershell.exe -NoProfile -WindowStyle Hidden -Command "${inner.replace(/"/g, '\\"')}"`;
}

export function dockerDesktopExe(env: Record<string, string | undefined> = process.env): string {
  const candidates = [path.join(env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe'), path.join(env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe')];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

/** Move the secrets-engine folder aside when its socket is stale (documented fix; the socket itself cannot be
 *  deleted). Only with no Docker process running — the caller's plan guarantees that. Returns the new name. */
export async function renameStaleSocketFolder(localAppData = process.env.LOCALAPPDATA ?? '', now = new Date()): Promise<string | undefined> {
  const dir = path.join(localAppData, 'docker-secrets-engine');
  if (!fs.existsSync(path.join(dir, 'engine.sock'))) return undefined;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  let target = `${dir}.stale-${stamp}`;
  for (let i = 1; fs.existsSync(target); i++) target = `${dir}.stale-${stamp}-${i}`;
  await fsp.rename(dir, target);
  return target;
}

// ------------------------------------------------------------------------------------------------- probes

const tryRun = async (cmd: string, args: string[], timeout = 20_000): Promise<string | undefined> => {
  try { return (await run(cmd, args, { timeout, windowsHide: true })).stdout.trim(); } catch { return undefined; }
};

export async function probeEngine(): Promise<boolean> { return Boolean(await tryRun('docker', ['version', '--format', '{{.Server.Version}}'])); }
export async function probeDb(container = 'vewbox-db-1'): Promise<boolean> { return (await tryRun('docker', ['inspect', '-f', '{{.State.Health.Status}}', container])) === 'healthy'; }

/** Docker and worker processes, and how many of them are CONTAINED: the root of their process tree (the first
 *  ancestor launched by the shell, WMI or a service) descends from the Claude app, or sits in a job object — a
 *  process launched normally (Explorer, the Start menu, Task Scheduler, WMI) is in none. (Inner processes are in jobs
 *  of their own — libuv, Docker's backend — so the root is what is judged.) */
export async function probeProcesses(): Promise<{ docker: number; worker: number; containment?: { dockerInAppJob: number; workerInAppJob: number } }> {
  const ps = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class WJ { [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, int p); [DllImport("kernel32.dll")] static extern bool IsProcessInJob(IntPtr h, IntPtr j, out bool r); [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static int InJob(int pid) { IntPtr h = OpenProcess(0x1000, false, pid); if (h == IntPtr.Zero) return -1; bool r; IsProcessInJob(h, IntPtr.Zero, out r); CloseHandle(h); return r ? 1 : 0; } }
"@
$p = Get-CimInstance Win32_Process
$byId = @{}; foreach ($x in $p) { $byId[[int]$x.ProcessId] = $x }
$launchers = 'explorer.exe','WmiPrvSE.exe','svchost.exe','services.exe','wininit.exe','taskeng.exe'
function Contained($x) {
  for ($i = 0; $i -lt 16; $i++) {
    $parent = $byId[[int]$x.ParentProcessId]
    if ($parent -and $parent.Name -eq 'claude.exe') { return $true }
    if (-not $parent -or $launchers -contains $parent.Name -or $parent.CreationDate -gt $x.CreationDate) { return ([WJ]::InJob([int]$x.ProcessId) -eq 1) }
    $x = $parent
  }
  return $false
}
$d = @($p | Where-Object { $_.Name -in 'Docker Desktop.exe','com.docker.backend.exe' })
$w = @($p | Where-Object { $_.CommandLine -like '*src/worker/index.ts*' -and $_.Name -eq 'node.exe' })
[pscustomobject]@{ docker = $d.Count; worker = $w.Count; dockerInJob = @($d | Where-Object { Contained $_ }).Count; workerInJob = @($w | Where-Object { Contained $_ }).Count } | ConvertTo-Json -Compress`;
  // run from a file: a here-string does not survive being passed through -Command
  const file = path.join(os.tmpdir(), `vewbox-watchdog-probe-${process.pid}.ps1`);
  await fsp.writeFile(file, ps, 'utf8');
  const out = await tryRun('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], 60_000).finally(() => fsp.rm(file, { force: true }).catch(() => {}));
  if (!out) return { docker: 0, worker: 0 };
  const j = JSON.parse(out.split('\n').pop()!) as { docker: number; worker: number; dockerInJob: number; workerInJob: number };
  return { docker: j.docker, worker: j.worker, containment: { dockerInAppJob: j.dockerInJob, workerInAppJob: j.workerInJob } };
}

export function workerAliveAgeMs(file = process.env.WORKER_ALIVE_FILE || path.join(os.tmpdir(), 'worker.alive'), now = Date.now()): number | undefined {
  try { return now - fs.statSync(file).mtimeMs; } catch { return undefined; }
}

export const secretsSocketExists = (localAppData = process.env.LOCALAPPDATA ?? ''): boolean => fs.existsSync(path.join(localAppData, 'docker-secrets-engine', 'engine.sock'));
