import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HUNG_AFTER_MS, MAX_DOCKER_STARTS_PER_HOUR, planWatchdog, renameStaleSocketFolder, wmiCreateScript, workerCommandLine, type WatchdogState } from '@/server/ops/docker-watchdog';

/** The Docker/worker watchdog's decisions (pure) and its two file/command builders. */

const up: WatchdogState = { engineOk: true, dockerProcesses: 3, engineDownForMs: 0, secretsSocketExists: true, dbHealthy: true, workerRunning: true, workerAliveAgeMs: 2_000, workerWanted: true, recentDockerStarts: 0 };
const crashed: WatchdogState = { ...up, engineOk: false, dockerProcesses: 0, engineDownForMs: 30_000, dbHealthy: false, workerRunning: false };
const kinds = (a: ReturnType<typeof planWatchdog>) => a.map((x) => (x.kind === 'warn' ? `warn:${x.code}` : x.kind));

describe('docker watchdog plan', () => {
  it('healthy: nothing to do', () => {
    expect(kinds(planWatchdog(up, { fix: true }))).toEqual(['ok']);
  });
  it('after a crash (no Docker process, stale socket): report only without --fix; with --fix rename the folder, start Docker outside the job, wait — never the worker before the engine', () => {
    expect(kinds(planWatchdog(crashed, { fix: false }))).toEqual(['warn:HUNG']);
    expect(kinds(planWatchdog(crashed, { fix: true }))).toEqual(['rename-stale-socket', 'start-docker', 'wait-engine']);
    expect(kinds(planWatchdog({ ...crashed, secretsSocketExists: false }, { fix: true }))).toEqual(['start-docker', 'wait-engine']);
  });
  it('Docker processes exist but the engine is down: starting (ok), then HUNG after 10 min — never killed or restarted', () => {
    expect(kinds(planWatchdog({ ...crashed, dockerProcesses: 2, engineDownForMs: 60_000 }, { fix: true }))).toEqual(['ok']);
    const hung = planWatchdog({ ...crashed, dockerProcesses: 2, engineDownForMs: HUNG_AFTER_MS }, { fix: true });
    expect(kinds(hung)).toEqual(['warn:HUNG']);
    expect(hung[0].kind === 'warn' && hung[0].detail).toMatch(/Never "Reset to factory defaults"/);
  });
  it('restarts are capped', () => {
    expect(kinds(planWatchdog({ ...crashed, recentDockerStarts: MAX_DOCKER_STARTS_PER_HOUR }, { fix: true }))).toEqual(['warn:RESTART_CAP']);
  });
  it('the worker is started only when the engine and the database answer, with --fix and --worker', () => {
    const noWorker = { ...up, workerRunning: false };
    expect(kinds(planWatchdog({ ...noWorker, dbHealthy: false }, { fix: true }))).toEqual(['warn:DB_UNHEALTHY']);
    expect(kinds(planWatchdog(noWorker, { fix: true }))).toEqual(['start-worker']);
    expect(kinds(planWatchdog(noWorker, { fix: false }))).toEqual(['ok']);
    expect(kinds(planWatchdog({ ...noWorker, workerWanted: false }, { fix: true }))).toEqual(['ok']);
  });
  it('a worker that stopped ticking is reported, not restarted', () => {
    expect(kinds(planWatchdog({ ...up, workerAliveAgeMs: 6 * 60_000 }, { fix: true }))).toEqual(['warn:WORKER_STALE']);
  });
  it('Docker or the worker inside the Claude app job: warned (they die at the next app update), nothing restarted', () => {
    const a = planWatchdog({ ...up, containment: { dockerInAppJob: 5, workerInAppJob: 1 } }, { fix: true });
    expect(kinds(a)).toEqual(['warn:CONTAINED', 'ok']);
    expect(kinds(planWatchdog({ ...up, containment: { dockerInAppJob: 0, workerInAppJob: 0 } }, { fix: true }))).toEqual(['ok']);
  });
});

describe('docker watchdog helpers', () => {
  it('moves only a folder that holds the socket aside, under a fresh name', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-wd-'));
    expect(await renameStaleSocketFolder(root)).toBeUndefined();
    fs.mkdirSync(path.join(root, 'docker-secrets-engine')); fs.writeFileSync(path.join(root, 'docker-secrets-engine', 'engine.sock'), '');
    const now = new Date('2026-10-06T02:19:44Z');
    const first = await renameStaleSocketFolder(root, now);
    expect(first).toBe(path.join(root, 'docker-secrets-engine.stale-20261006-021944'));
    fs.mkdirSync(path.join(root, 'docker-secrets-engine')); fs.writeFileSync(path.join(root, 'docker-secrets-engine', 'engine.sock'), '');
    expect(await renameStaleSocketFolder(root, now)).toBe(`${first}-1`);
    expect(fs.existsSync(path.join(root, 'docker-secrets-engine'))).toBe(false);
  });
  it('builds the WMI create call and the worker command line with quoting intact', () => {
    expect(wmiCreateScript(`"C:\\Program Files\\Docker\\Docker Desktop.exe"`, "D:\\o'brien")).toBe(`$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '"C:\\Program Files\\Docker\\Docker Desktop.exe"'; CurrentDirectory = 'D:\\o''brien' }; if ($r.ReturnValue -ne 0) { Write-Error ("Win32_Process.Create failed: " + $r.ReturnValue); exit 1 }; $r.ProcessId`);
    const cl = workerCommandLine('D:\\volexar-studio\\volexar-studio', 'D:\\tools\\node\\node.exe');
    expect(cl).toMatch(/^powershell\.exe -NoProfile -WindowStyle Hidden -Command "/);
    expect(cl).toContain("& 'D:\\tools\\node\\node.exe' 'D:\\volexar-studio\\volexar-studio\\node_modules\\tsx\\dist\\cli.mjs' --env-file=.env --env-file=.env.local src/worker/index.ts *>> var/worker-detached.log");
  });
});

describe.runIf(process.platform === 'win32')('starting outside the job (Windows)', () => {
  it('a process created through WMI is not in this process’s job object; one from a plain spawn is', async () => {
    const { spawnOutsideJob } = await import('@/server/ops/docker-watchdog');
    const { execFileSync, spawn } = await import('node:child_process');
    const pidsOfMyJob = () => {
      const ps = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class TJ { [DllImport("kernel32.dll")] static extern bool QueryInformationJobObject(IntPtr j, int c, IntPtr i, int l, out int r); public static string P() { int s = 8 + 8 * 16384; IntPtr b = Marshal.AllocHGlobal(s); int r; if (!QueryInformationJobObject(IntPtr.Zero, 3, b, s, out r)) return "nojob"; int n = Marshal.ReadInt32(b, 4); string o = ""; for (int k = 0; k < n; k++) o += Marshal.ReadIntPtr(b, 8 + k * IntPtr.Size).ToInt64() + ","; return o; } }'; [TJ]::P()`;
      return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
    };
    const mine = pidsOfMyJob();
    if (mine === 'nojob') return; // this test process is not in a job: nothing to escape from
    const outside = await spawnOutsideJob('powershell.exe -NoProfile -WindowStyle Hidden -Command Start-Sleep 20');
    const inside = spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep 20'], { windowsHide: true });
    await new Promise((r) => setTimeout(r, 1500));
    const ids = pidsOfMyJob().split(',');
    try {
      expect(ids).not.toContain(String(outside));
      expect(ids).toContain(String(inside.pid));
    } finally { inside.kill(); try { process.kill(outside); } catch { /* gone */ } }
  }, 60_000);
});
