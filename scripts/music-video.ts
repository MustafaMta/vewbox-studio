/* THE ORIGINAL SONG AND ITS SINGER (the autonomous directive, 2026-10-10: singer identity → original English song →
 * music video): one MUSIC_VIDEO production for one Phase 1 character, then the song chain as the studio runs it —
 * WRITE_SONG (Qwen3.8 writes concept, structure, lyrics, tempo, key) → GENERATE_SONG (ONE ACE-Step 1.5 XL-SFT recording,
 * stems, lyrics placed) → SING_CONVERT (the lead vocal in the singer's own voice, Seed-VC; the SINGING reference
 * bootstrapped once). One generation per request; every job's result printed as evidence.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/music-video.ts create --character-id <id> --title "…" [--seconds 75] [--language EN|AR] [--brief "…"]
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/music-video.ts song --production-id <id> [--step write|record|sing|all] [--attempt N]
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/music-video.ts status --production-id <id> */
import { sql } from 'drizzle-orm';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };

async function waitJob(id: string, maxMinutes = 60): Promise<{ status: string; result: Record<string, unknown> | null; error: unknown }> {
  const { db } = await import('@/server/db/client');
  type Row = { status: string; result: Record<string, unknown> | null; error: unknown };
  for (let i = 0; i < maxMinutes * 6; i++) {
    const q = (await db().execute(sql`select status, result, error from jobs where id = ${id}`)) as unknown as { rows?: Row[] };
    const row = (q.rows ?? (q as unknown as Row[]))[0];
    if (row && ['COMPLETED', 'AWAITING_REVIEW', 'FAILED', 'CANCELLED'].includes(row.status)) return row;
    await new Promise((res) => setTimeout(res, 10_000));
  }
  throw new Error(`job ${id} did not finish within ${maxMinutes} minutes`);
}

async function create() {
  const characterId = arg('character-id'); const title = arg('title');
  if (!characterId || !title) throw new Error('--character-id and --title are required');
  const seconds = Number(arg('seconds', '75'));
  const language = (arg('language', 'EN') as 'EN' | 'AR');
  const { readState, command } = await import('@/server/studio/engine');
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new Error('character not found');
  const brief = arg('brief') ?? `An original ${language === 'AR' ? 'Baghdadi Arabic' : 'English'} song performed by ${c.name}, the character herself/himself singing on camera: an intimate, cinematic music video — one performer, one place, real emotion, no spectacle for its own sake.`;
  const r = await command('addProduction', [{ kind: 'MUSIC_VIDEO', title, style: c.style, language, ...(language === 'AR' ? { dialect: c.dialect ?? 'IRAQI_BAGHDADI' } : {}), aspect: 'WIDE_16_9', targetSeconds: seconds, brief: { mode: 'MANUAL', text: brief }, castIds: [c.id], locationIds: [] }], 'worker') as unknown as { production?: { id: string } };
  const fresh = (await readState()).state;
  const p = r?.production?.id ? fresh.productions.find((x) => x.id === r.production!.id) : [...fresh.productions].filter((x) => x.kind === 'MUSIC_VIDEO' && x.title === title).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!p) throw new Error('the production was not created');
  console.log(JSON.stringify({ production: p.id, title: p.title, kind: p.kind, style: p.style, language: p.language, seconds: p.targetSeconds, cast: p.castIds }, null, 1));
}

async function song() {
  const productionId = arg('production-id'); if (!productionId) throw new Error('--production-id is required');
  const stepArg = arg('step', 'all')!;
  const attempt = Number(arg('attempt', '1'));
  const { readState } = await import('@/server/studio/engine');
  const { enqueue } = await import('@/server/jobs/queue');
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new Error('production not found');
  const steps = stepArg === 'all' ? ['write', 'record', 'sing'] : [stepArg];
  const out: Record<string, unknown> = {};
  for (const s of steps) {
    const type = s === 'write' ? 'WRITE_SONG' : s === 'record' ? 'GENERATE_SONG' : 'SING_CONVERT';
    // --shift N (sing only): the one melodic freedom, at most ±3 semitones (the research §4)
    const shift = Number(arg('shift', '0'));
    const payload = s === 'write' ? { productionId, singerIds: p.castIds } : s === 'sing' && shift ? { productionId, semitoneShift: shift } : { productionId };
    const r = await enqueue({ type, payload, idempotencyKey: `music-video:${productionId}:${s}:${attempt}`, maxAttempts: 1 });
    console.error(`[mv] ${type} job ${r.job.id} (${r.created ? 'created' : 'existing'})`);
    const row = await waitJob(r.job.id, s === 'record' ? 90 : 60);
    out[s] = { job: r.job.id, status: row.status, result: row.result, error: row.error ?? undefined };
    console.log(JSON.stringify({ step: s, job: r.job.id, status: row.status, result: row.result, error: row.error ?? undefined }, null, 1));
    if (!['COMPLETED', 'AWAITING_REVIEW'].includes(row.status)) { process.exitCode = 3; break; }
  }
}

/** The film side, one job at a time, each waited for and printed: develop (story, cast, places, scenes) → script (beats,
 *  lines) → plan (shots + the singing assignment) → plates (LOCATION_PLATES for every place of the production) → produce
 *  (frames → takes → the cut) → export. */
async function pipeline() {
  const productionId = arg('production-id'); if (!productionId) throw new Error('--production-id is required');
  const stepArg = arg('step'); if (!stepArg) throw new Error('--step develop|script|plan|plates|produce|export is required');
  const attempt = Number(arg('attempt', '1'));
  const { readState } = await import('@/server/studio/engine');
  const { enqueue } = await import('@/server/jobs/queue');
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new Error('production not found');
  const jobs: Array<{ type: string; payload: Record<string, unknown>; key: string; minutes: number }> = [];
  if (stepArg === 'develop') jobs.push({ type: 'DEVELOP_STORY', payload: { productionId }, key: `mv-film:${productionId}:develop:${attempt}`, minutes: 40 });
  else if (stepArg === 'script') jobs.push({ type: 'WRITE_SCRIPT', payload: { productionId }, key: `mv-film:${productionId}:script:${attempt}`, minutes: 40 });
  else if (stepArg === 'plan') jobs.push({ type: 'PLAN_SHOTS', payload: { productionId }, key: `mv-film:${productionId}:plan:${attempt}`, minutes: 60 });
  else if (stepArg === 'plates') for (const lid of p.locationIds) jobs.push({ type: 'LOCATION_PLATES', payload: { locationId: lid, ...(process.argv.includes('--force') ? { force: true } : {}) }, key: `mv-film:${productionId}:plates:${lid}:${attempt}`, minutes: 60 });
  else if (stepArg === 'produce') jobs.push({ type: 'PRODUCE', payload: { productionId, ...(arg('shot-ids') ? { shotIds: arg('shot-ids')!.split(',') } : {}), ...(process.argv.includes('--frames-only') ? { framesOnly: true } : {}) }, key: `mv-film:${productionId}:produce:${attempt}`, minutes: 600 });
  else if (stepArg === 'export') jobs.push({ type: 'EXPORT', payload: { productionId, format: 'mp4-h264', resolution: '1080', subtitles: p.language === 'AR' ? 'both' : 'en', credits: true }, key: `mv-film:${productionId}:export:${attempt}`, minutes: 60 });
  else throw new Error(`unknown step ${stepArg}`);
  for (const j of jobs) {
    const r = await enqueue({ type: j.type as never, payload: j.payload as never, idempotencyKey: j.key, maxAttempts: 1 });
    console.error(`[mv] ${j.type} job ${r.job.id} (${r.created ? 'created' : 'existing'})`);
    const row = await waitJob(r.job.id, j.minutes);
    console.log(JSON.stringify({ step: stepArg, type: j.type, job: r.job.id, status: row.status, result: row.result, error: row.error ?? undefined }, null, 1));
    if (!['COMPLETED', 'AWAITING_REVIEW'].includes(row.status)) { process.exitCode = 3; break; }
  }
}

async function status() {
  const productionId = arg('production-id'); if (!productionId) throw new Error('--production-id is required');
  const { readState } = await import('@/server/studio/engine');
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new Error('production not found');
  console.log(JSON.stringify({ id: p.id, title: p.title, song: p.song ? { title: p.song.title, assetId: p.song.assetId, seconds: p.song.durationSeconds, bpm: p.song.bpm, key: p.song.key, singers: p.song.singerIds, sections: p.song.sections.map((s) => ({ id: s.id, from: s.from, to: s.to, lines: (s.text ?? '').split('\n').length })), stems: p.song.stems, singing: p.song.singing, concept: p.song.concept, caption: p.song.caption, lyrics: p.song.sections.map((s) => s.text).join('\n\n') } : null }, null, 1));
}

const cmd = process.argv[2];
(cmd === 'create' ? create() : cmd === 'song' ? song() : cmd === 'pipeline' ? pipeline() : cmd === 'status' ? status() : Promise.reject(new Error('usage: music-video.ts create | song | pipeline --step develop|script|plan|plates|produce|export | status')))
  .then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e.message ?? e); process.exit(1); });
