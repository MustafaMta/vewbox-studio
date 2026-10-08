/* SCENE REVIEW SHEETS (directive 2026-10-08 item 6: "the final scene must be evaluated as one film sequence"). For an
 * assembled cut (the production's current cut, or --cut <assetId>): the cut's own timeline (its provenance: each shot's
 * start and length in the cut) gives every join; for each join a sheet of the 6 frames before and 6 after it at 12 fps,
 * and the whole scene at 2 fps. A person still watches the cut at normal speed — these sheets are the reviewer's notes,
 * not the verdict. Read only; writes var/eval/scene-review/<cutId>/.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/scene-review.ts <productionId> [--cut <assetId>]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function main() {
  const productionId = process.argv[2];
  const i = process.argv.indexOf('--cut');
  const { readState } = await import('@/server/studio/engine');
  const { assetFile } = await import('@/server/media');
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new Error(`no production ${productionId}`);
  const cut = state.assets.find((a) => a.id === (i > 0 ? process.argv[i + 1] : p.cutAssetId));
  if (!cut) throw new Error('no cut: assemble the production first');
  const file = assetFile(cut);
  const shots = ((cut.provenance as { shots?: Array<{ shotId: string; start: number; duration: number; relation?: string; join?: unknown }> }).shots ?? []);
  const out = path.resolve('var/eval/scene-review', cut.id);
  await fs.mkdir(out, { recursive: true });
  const number = (id: string) => { const sh = p.shots.find((s) => s.id === id); const sc = p.scenes.find((x) => x.id === sh?.sceneId); return sh ? `${sc?.number ?? '?'}.${sh.number}` : id; };
  await run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', 'fps=2,scale=320:-1,tile=8x8', '-frames:v', '1', path.join(out, 'scene-2fps.png')]);
  const joins: string[] = [];
  for (let k = 1; k < shots.length; k++) {
    const t = shots[k].start;
    const name = `join-${number(shots[k - 1].shotId)}-to-${number(shots[k].shotId)}.png`;
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.max(0, t - 0.5)), '-t', '1', '-i', file, '-vf', 'fps=12,scale=320:-1,tile=6x2', '-frames:v', '1', path.join(out, name)]);
    joins.push(`${name}: at ${t.toFixed(2)} s (${shots[k].relation ?? '?'})`);
  }
  await fs.writeFile(path.join(out, 'index.txt'), [`${p.title} — cut ${cut.id} (${file})`, `${shots.length} shots`, ...shots.map((s) => `  ${number(s.shotId)}: ${s.start.toFixed(2)}–${(s.start + s.duration).toFixed(2)} s ${s.relation ?? ''}`), 'joins (top row: the 0.5 s before; bottom row: the 0.5 s after):', ...joins.map((j) => `  ${j}`)].join('\n'), 'utf8');
  console.log(await fs.readFile(path.join(out, 'index.txt'), 'utf8'));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
