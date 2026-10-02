// Run the wave-2 acceptance journeys (tests/e2e/journeys) against the running studio.
//
//   node scripts/qa-journeys.mjs [--gpu] [--restart] [--base http://localhost:4200] [--grep <regex>] [--headed] [--yes] [-- <playwright args>]
//
//   --gpu       include the `@gpu` scenarios (real generation: portraits, sheets, voices, a take). Only when the
//               architect has confirmed the GPU is free and the worker is running.
//   --restart   include Test 9: the run pauses and waits for you to restart web + worker and create
//               var/qa-restarted.flag (see docs/TEST-RESULTS.md, "Wave 2 journeys").
//   --base      the studio's address (STUDIO_URL); default http://localhost:4200.
//   --grep      only the tests whose title matches.
//   --yes       required: every test RESETS the live database to the sample studio.
//
// Evidence: screenshots under docs/evidence/qa/, the Playwright report under playwright-report/journeys/, traces
// and videos of failures under test-results/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { playwrightCommand } from './qa-journeys-command.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return false; args.splice(i, 1); return true; };
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i === -1) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const gpu = flag('gpu');
const restart = flag('restart');
const headed = flag('headed');
const yes = flag('yes');
const base = opt('base', process.env.STUDIO_URL || 'http://localhost:4200');
const grep = opt('grep', '');
const rest = args.filter((a) => a !== '--');

if (!yes) {
  console.error('The journeys reset the live database to the sample studio before every test. Re-run with --yes when that is intended.');
  process.exit(2);
}

const get = async (p) => { try { const r = await fetch(`${base}${p}`, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; } };
const health = await get('/api/health');
if (!health?.ok) { console.error(`The studio at ${base} does not answer /api/health. Start web (pnpm dev) and the worker (pnpm worker) first.`); process.exit(2); }
console.log(`studio ${base}: healthy, version ${health.version}, queue ${JSON.stringify(health.queue)}`);
const status = await get('/api/status');
if (status) {
  for (const k of ['story', 'images', 'voice', 'transcription', 'video', 'music']) console.log(`  ${k.padEnd(14)} ${status[k]?.ok ? 'ready  ' : 'not ready'}  ${status[k]?.detail ?? ''}`);
  if (status.gpu) console.log(`  gpu            ${status.gpu.device ?? ''} free ${status.gpu.vramFree ?? '?'} MB`);
  if (gpu) {
    const missing = ['story', 'images', 'voice', 'transcription'].filter((k) => !status[k]?.ok);
    if (missing.length) console.warn(`  --gpu set but not ready: ${missing.join(', ')} — those scenarios will be skipped with the reason.`);
  }
}
const active = await get('/api/jobs?active=1&limit=5');
if (active?.jobs?.length) console.warn(`  ${active.jobs.length} job(s) active on the worker right now; the reset will clear them. Wait for a free queue unless that is intended.`);

fs.mkdirSync('docs/evidence/qa', { recursive: true });
fs.mkdirSync('var', { recursive: true });
for (const f of ['var/qa-restart-requested.flag', 'var/qa-restarted.flag']) fs.rmSync(f, { force: true });

const env = { ...process.env, STUDIO_URL: base, QA_JOURNEYS: '1', QA_GPU: gpu ? '1' : '0', QA_RESTART: restart ? '1' : '0', PLAYWRIGHT_HTML_REPORT: 'playwright-report/journeys' };
// the Playwright CLI under this Node, never through a shell: --grep and trailing arguments stay one argv element each
const pw = playwrightCommand({ grep, headed, rest });
console.log(`\nplaywright ${pw.args.slice(1).map((a) => JSON.stringify(a)).join(' ')}\n  QA_GPU=${env.QA_GPU} QA_RESTART=${env.QA_RESTART}${restart ? '\n  Test 9 will pause: restart web + worker when asked, then create var/qa-restarted.flag' : ''}\n`);
const r = spawnSync(pw.command, pw.args, { stdio: 'inherit', env, ...pw.options });
if (r.error) console.error(`could not start Playwright: ${r.error.message}`);
process.exit(r.status ?? 1);
