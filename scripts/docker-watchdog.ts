/** DOCKER / WORKER WATCHDOG (src/server/ops/docker-watchdog.ts has the why: processes started from a Claude session
 *  live in the Claude app's job object and are killed when the app updates — that is what "crashed" Docker Desktop on
 *  2026-10-06 05:19 local).
 *
 *    pnpm exec tsx scripts/docker-watchdog.ts                 report once (read-only; the default)
 *    pnpm exec tsx scripts/docker-watchdog.ts --watch 60      report every 60 s
 *    pnpm exec tsx scripts/docker-watchdog.ts --fix --worker --watch 60
 *        after a crash: rename the stale secrets-engine socket folder aside, start Docker Desktop OUTSIDE the app's job,
 *        wait for the engine and the database, start the host worker outside the job (at most 2 Docker starts an hour)
 *    pnpm exec tsx scripts/docker-watchdog.ts --start-worker   start the host worker outside the job, now
 *    pnpm exec tsx scripts/docker-watchdog.ts --start-web      start the studio web server (:4200, --web-port) outside the job
 *        (--fix --web: restarted only when /api/health does not answer and nothing listens on the port)
 *    pnpm exec tsx scripts/docker-watchdog.ts --start-docker   start Docker Desktop outside the job (only if not running)
 *
 *  It never kills Docker Desktop, never restarts a container, never resets anything. Exit code 0 = healthy, 1 = a
 *  warning was reported. Run the watcher itself outside the app's job too (e.g. `--start-self`), or it dies with the
 *  app like everything else. */
import path from 'node:path';
import { dockerDesktopExe, planWatchdog, probeDb, probeEngine, probePortListening, probeProcesses, probeWebHealth, renameStaleSocketFolder, secretsSocketExists, spawnOutsideJob, webCommandLine, workerAliveAgeMs, workerCommandLine, type WatchdogAction } from '../src/server/ops/docker-watchdog';

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const repo = path.resolve(val('--repo') ?? process.cwd());
const fix = has('--fix');
const workerWanted = has('--worker');
const webWanted = has('--web');
const webPort = Number(val('--web-port') ?? 4200);
const watchS = Number(val('--watch') ?? 0);
const say = (m: string) => console.log(`[watchdog ${new Date().toISOString()}] ${m}`);

let downSince: number | undefined;
const starts: number[] = [];

async function startWorker() { const pid = await spawnOutsideJob(workerCommandLine(repo), repo); say(`worker started outside the app's job (pid ${pid}); log: var/worker-detached.log`); }
async function startWeb() { const pid = await spawnOutsideJob(webCommandLine(repo, process.execPath, webPort), repo); say(`web server starting outside the app's job on 127.0.0.1:${webPort} (pid ${pid}); log: var/web-detached.log`); }
async function startDocker() { const exe = dockerDesktopExe(); const pid = await spawnOutsideJob(`"${exe}"`); starts.push(Date.now()); say(`Docker Desktop started outside the app's job (pid ${pid})`); }

async function pass(): Promise<boolean> {
  const engineOk = await probeEngine();
  if (engineOk) downSince = undefined; else downSince ??= Date.now();
  const procs = await probeProcesses();
  const state = {
    engineOk, dockerProcesses: procs.docker, engineDownForMs: downSince ? Date.now() - downSince : 0,
    secretsSocketExists: secretsSocketExists(), dbHealthy: engineOk ? await probeDb() : false,
    workerRunning: procs.worker > 0, workerAliveAgeMs: workerAliveAgeMs(), workerWanted,
    containment: procs.containment, web: { port: webPort, healthy: await probeWebHealth(webPort), listening: await probePortListening(webPort), wanted: webWanted }, recentDockerStarts: starts.filter((t) => Date.now() - t < 3600_000).length,
  };
  const actions = planWatchdog(state, { fix });
  let healthy = true;
  for (const a of actions as WatchdogAction[]) {
    if (a.kind === 'ok') say(a.detail);
    else if (a.kind === 'warn') { healthy = false; say(`WARN ${a.code}: ${a.detail}`); }
    else if (a.kind === 'rename-stale-socket') { const to = await renameStaleSocketFolder(); say(to ? `stale secrets-engine socket folder moved aside: ${to}` : 'no stale socket folder to move'); }
    else if (a.kind === 'start-docker') await startDocker();
    else if (a.kind === 'wait-engine') {
      const t0 = Date.now();
      while (!(await probeEngine()) && Date.now() - t0 < 5 * 60_000) await new Promise((r) => setTimeout(r, 5000));
      say((await probeEngine()) ? `engine up after ${Math.round((Date.now() - t0) / 1000)} s` : 'engine still down after 5 min');
    } else if (a.kind === 'start-worker') await startWorker();
    else if (a.kind === 'start-web') await startWeb();
  }
  return healthy;
}

if (has('--start-worker')) { await startWorker(); process.exit(0); }
if (has('--start-web')) {
  if (await probePortListening(webPort)) { say(`something already listens on :${webPort}: not started`); process.exit(1); }
  await startWeb(); process.exit(0);
}
if (has('--start-docker')) {
  if ((await probeProcesses()).docker > 0) { say('Docker Desktop is already running: not started (quit it gracefully first to relaunch it outside the job)'); process.exit(1); }
  if (secretsSocketExists()) say(`stale socket folder moved aside: ${await renameStaleSocketFolder()}`);
  await startDocker(); process.exit(0);
}
if (has('--start-self')) {
  const rest = argv.filter((a) => a !== '--start-self');
  const pid = await spawnOutsideJob(`powershell.exe -NoProfile -WindowStyle Hidden -Command "Set-Location -LiteralPath '${repo}'; & '${process.execPath}' '${path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs')}' scripts/docker-watchdog.ts ${rest.join(' ')} *>> var/docker-watchdog.log"`, repo);
  say(`watchdog started outside the app's job (pid ${pid}); log: var/docker-watchdog.log`);
  process.exit(0);
}
if (!watchS) process.exit((await pass()) ? 0 : 1);
for (;;) { try { await pass(); } catch (e) { say(`pass failed: ${(e as Error).message}`); } await new Promise((r) => setTimeout(r, Math.max(15, watchS) * 1000)); }
