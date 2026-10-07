/* FRAME EXPRESSION LAB — why a storyboard frame copies the canonical portrait's expression instead of the shot's
 * (2026-10-08, "The Last Crossing" 1.1–1.2: a strained, soaked climb drawn as a smiling, dry man). One shot, the same
 * references and seed, controlled prompt variants, each changing ONE thing:
 *   A  the frame prompt exactly as the studio builds it
 *   B  A without the expression words inside the identity description ("warm, approachable expression", "smiles")
 *   C  B plus an explicit instruction for the moment's expression and condition (an edit model follows instructions)
 * Writes PNGs and a report to --out; touches nothing in the studio. An ENGINEERING diagnostic, never a production frame.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts IMAGE 22000 -- \
 *     pnpm exec tsx --env-file=.env --env-file=.env.local scripts/frame-expression-lab.ts --production <id> --shot <id> --out <dir> [--seed 11]
 */
async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const productionId = opt('production'); const shotId = opt('shot'); const out = opt('out');
  if (!productionId || !shotId || !out) throw new Error('--production, --shot and --out are required');
  const seed = Number(opt('seed', '11'));
  const { readState } = await import('@/server/studio/engine');
  const { castOf, worldOf } = await import('@/studio/selectors');
  const { frameReferences } = await import('@/worker/handlers/images');
  const { framePrompt, frameContinuityLine } = await import('@/server/story/prompts');
  const { qwenEdit } = await import('@/server/workflows');
  const { ASPECT_INFO } = await import('@/domain/vocabulary');
  const comfy = await import('@/server/providers/comfy');
  const { assetFile } = await import('@/server/media');
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId); if (!p) throw new Error('production not found');
  const sh = p.shots.find((x) => x.id === shotId); if (!sh) throw new Error('shot not found');
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const cast = castOf(state, p); const loc = worldOf(state, p).find((l) => l.id === scene?.locationId);
  const { refs, crops, notes, imageOf } = frameReferences(state, p, sh);
  const own = frameContinuityLine(sh, cast, imageOf);
  const base = framePrompt(p, sh, cast, loc, scene, { pictured: new Set(imageOf.keys()) }) + (own ? ` Continuity: ${own}` : '');
  const guidance = ` Use the reference pictures: ${notes.join('; ')}.`;
  // B: the identity description without its expression clauses (only inside the reference notes)
  const EXPRESSION = /[^;,.]*\b(expression|smil\w*|laugh\w*|grin\w*|crinkl\w*)\b[^;,.]*[;,]?/gi;
  const quiet = guidance.replace(EXPRESSION, '').replace(/\s{2,}/g, ' ').replace(/;\s*;/g, ';');
  const x = sh.continuity?.characters?.[0];
  const instruction = x ? ` Make his expression ${(x.emotion ?? 'as the moment demands').toLowerCase()} — brow drawn, jaw set, breathing hard${x.condition ? `; he is ${x.condition.toLowerCase()}: hair wet and flattened, rain on his face and suit` : ''}.` : '';
  const variants: Record<string, string> = { A: base + guidance, B: base + quiet, C: base + instruction + quiet };
  const info = ASPECT_INFO[p.aspect];
  const uploaded = await Promise.all(refs.map((a) => comfy.uploadInput(assetFile(a))));
  await fs.mkdir(out, { recursive: true });
  const report: Record<string, unknown> = { productionId, shotId, seed, refs: refs.map((r) => r.id), variants };
  for (const [name, prompt] of Object.entries(variants)) {
    const graph = qwenEdit({ prompt, negative: 'text, watermark, logo, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head', references: uploaded, width: info.width, height: info.height, seed, crops: crops.some(Boolean) ? crops : undefined });
    const t0 = Date.now();
    const run = await comfy.run(graph, { promptKey: `:frame-lab:${shotId}:${name}:${seed}:${Date.now()}`, timeoutMs: 15 * 60_000 });
    const o = comfy.firstOutput(run.outputs, 'images'); if (!o) throw new Error(`${name}: no image`);
    const file = path.join(out, `${name}.png`);
    await fs.writeFile(file, await comfy.view(o));
    console.log(`${name}: ${file} (${Date.now() - t0} ms)`);
  }
  // D: a second, edit-only pass on C with C as the ONLY picture: change the expression and the condition, keep the rest
  if (x) {
    const editRef = await comfy.uploadInput(path.join(out, 'C.png'));
    const edit = `Edit this picture. Change only the man's face and condition: his expression becomes ${(x.emotion ?? 'serious').toLowerCase()} and breathless — brow furrowed, eyes narrowed, jaw tight, lips parted, no smile${x.condition ? `; his hair and suit are ${x.condition.toLowerCase().includes('soak') ? 'soaked with rain, hair wet and flattened, drops on his face' : x.condition.toLowerCase()}` : ''}. Keep everything else exactly as it is: the same man and face shape, the same place, framing, light and colours.`;
    const t0 = Date.now();
    const run = await comfy.run(qwenEdit({ prompt: edit, negative: 'smile, grin, laughing, text, watermark', references: [editRef], width: info.width, height: info.height, seed }), { promptKey: `:frame-lab:${shotId}:D:${seed}:${Date.now()}`, timeoutMs: 15 * 60_000 });
    const o = comfy.firstOutput(run.outputs, 'images'); if (!o) throw new Error('D: no image');
    await fs.writeFile(path.join(out, 'D.png'), await comfy.view(o));
    (report.variants as Record<string, string>).D = edit;
    console.log(`D: ${path.join(out, 'D.png')} (${Date.now() - t0} ms)`);
    // E: the same edit with the canonical portrait as a second picture, the face's identity anchor
    const person = refs.find((r) => r.tags?.includes('canonical') || r.label?.toLowerCase().includes('canonical')) ?? refs.find((r) => [...imageOf.values()].includes(refs.indexOf(r) + 1));
    if (person) {
      const anchor = uploaded[refs.indexOf(person)];
      const editE = edit.replace('Edit this picture.', 'Edit picture 1. Picture 2 shows the same man: keep his face, its shape and every mark on it (the scar on his eyebrow) exactly as in picture 2, but not picture 2\'s expression.');
      const t1 = Date.now();
      const runE = await comfy.run(qwenEdit({ prompt: editE, negative: 'smile, grin, laughing, text, watermark', references: [editRef, anchor], width: info.width, height: info.height, seed }), { promptKey: `:frame-lab:${shotId}:E:${seed}:${Date.now()}`, timeoutMs: 15 * 60_000 });
      const oE = comfy.firstOutput(runE.outputs, 'images'); if (!oE) throw new Error('E: no image');
      await fs.writeFile(path.join(out, 'E.png'), await comfy.view(oE));
      (report.variants as Record<string, string>).E = editE;
      console.log(`E: ${path.join(out, 'E.png')} (${Date.now() - t1} ms)`);
    }
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
