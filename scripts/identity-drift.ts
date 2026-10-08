/* IDENTITY DRIFT PROBE (directive 2026-10-08 item 12: "edited frame → H3 gradually moves back toward the canonical
 * face"). For every READY take filmed from a drawn opening frame, each person's face is measured over the take against
 * TWO references — the canonical image and the opening frame itself (SFace, the asr service's /qa/identity, CPU) — and
 * the first and last second are compared:
 *   toFrame falls and toCanonical rises  → the take drifts from the moment's face back to the portrait
 *   both hold                            → no drift
 * Read only; writes var/eval/identity-drift-2026-10/report.json. Evidence only: nothing is changed from it.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/identity-drift.ts [productionId ...]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ASR = (process.env.ASR_URL ?? 'http://127.0.0.1:8030').replace(/\/$/, '');
interface Frame { t: number; cosine: number | null }

async function identity(video: string, refs: Array<{ key: string; image: string }>): Promise<Record<string, Frame[]>> {
  const fd = new FormData();
  fd.set('video', new Blob([await fs.readFile(video)]), path.basename(video));
  fd.set('characters', JSON.stringify(refs.map((r) => r.key)));
  for (const r of refs) fd.append('references', new Blob([await fs.readFile(r.image)]), `${r.key}.png`);
  fd.set('sample_fps', '4');
  const res = await fetch(`${ASR}/qa/identity`, { method: 'POST', body: fd, signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) throw new Error(`identity ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { characters: Record<string, { series: Frame[] }> };
  return Object.fromEntries(Object.entries(j.characters).map(([k, v]) => [k, v.series]));
}

const mean = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null; };

async function main() {
  const ids = process.argv.slice(2);
  const { readState } = await import('@/server/studio/engine');
  const { assetFile } = await import('@/server/media');
  const { primaryImageOf } = await import('@/domain/identity');
  const { state } = await readState();
  const rows: unknown[] = [];
  for (const p of state.productions.filter((x) => !ids.length || ids.includes(x.id))) {
    for (const sh of p.shots) for (const t of sh.takes) {
      if (t.status !== 'READY') continue;
      const video = state.assets.find((a) => a.id === t.assetId);
      const frameId = (video?.provenance as { references?: Array<{ kind?: string; assetId?: string }> } | undefined)?.references?.find((r) => r.kind === 'FIRST_FRAME')?.assetId;
      const frame = state.assets.find((a) => a.id === frameId);
      if (!video || !frame) continue;
      const people = sh.characterIds.map((id) => state.characters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
      const refs = people.flatMap((c) => { const canon = state.assets.find((a) => a.id === primaryImageOf(c)); return canon ? [{ key: `${c.id}|canonical`, image: assetFile(canon) }, { key: `${c.id}|frame`, image: assetFile(frame) }] : []; });
      // a two-person opening frame holds two faces: as a reference it is ambiguous — one-person shots only
      if (!refs.length || people.length !== 1) continue;
      try {
        // one call per reference: given both at once the service gives each face to its better match, and the other
        // reference reads null (the first probe read "canonical null" for every first second)
        const series: Record<string, Frame[]> = {};
        for (const r of refs) Object.assign(series, await identity(assetFile(video), [r]));
        const dur = Math.max(...Object.values(series).flat().map((f) => f.t), 0);
        for (const c of people) {
          const can = series[`${c.id}|canonical`] ?? []; const fr = series[`${c.id}|frame`] ?? [];
          const first = (s: Frame[]) => mean(s.filter((f) => f.t <= 1).map((f) => f.cosine));
          const last = (s: Frame[]) => mean(s.filter((f) => f.t >= dur - 1).map((f) => f.cosine));
          const row = { production: p.title, shot: sh.number, take: t.id, framing: sh.framing, character: c.name, frameEdited: Boolean((frame.provenance as { momentEdit?: unknown } | undefined)?.momentEdit), toCanonical: { first: first(can), last: last(can) }, toFrame: { first: first(fr), last: last(fr) } };
          const dc = (row.toCanonical.last ?? 0) - (row.toCanonical.first ?? 0), df = (row.toFrame.last ?? 0) - (row.toFrame.first ?? 0);
          const reading = row.toCanonical.first === null || row.toFrame.first === null ? 'NOT_MEASURED' : df < -0.05 && dc > 0.03 ? 'DRIFTS_TO_CANONICAL' : df < -0.05 ? 'DRIFTS_AWAY_FROM_BOTH' : 'HOLDS';
          rows.push({ ...row, reading });
          console.log(`${p.title} ${sh.number} ${c.name}${row.frameEdited ? ' (edited frame)' : ''}: canonical ${row.toCanonical.first}→${row.toCanonical.last}, frame ${row.toFrame.first}→${row.toFrame.last}: ${reading}`);
        }
      } catch (e) { console.log(`${p.title} ${sh.number} ${t.id}: ${(e as Error).message.split('\n')[0]}`); }
    }
  }
  const out = path.resolve('var/eval/identity-drift-2026-10/report.json');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2), 'utf8');
  console.log(`\n${rows.length} measurement(s) → ${out}`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
