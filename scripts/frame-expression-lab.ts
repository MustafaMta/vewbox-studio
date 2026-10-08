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
    // D3: the same edit naming the character's own hair and facial hair as what to keep (from the design record)
    const who = state.characters.find((c) => c.id === [...imageOf.keys()][0]);
    if (who) {
      const keep = [who.hair, (who.face ?? '').split(/[,;]/).find((s) => /beard|moustache|mustache|stubble|goatee|clean-shaven/i.test(s))].filter(Boolean).join('; ');
      const edit3 = edit.replace('Keep everything else exactly as it is:', `Keep everything else exactly as it is: ${keep};`);
      const t4 = Date.now();
      const run3 = await comfy.run(qwenEdit({ prompt: edit3, negative: 'smile, grin, laughing, clean-shaven, text, watermark', references: [editRef], width: info.width, height: info.height, seed }), { promptKey: `:frame-lab:${shotId}:D3:${seed}:${Date.now()}`, timeoutMs: 15 * 60_000 });
      const o3 = comfy.firstOutput(run3.outputs, 'images'); if (!o3) throw new Error('D3: no image');
      await fs.writeFile(path.join(out, 'D3.png'), await comfy.view(o3));
      (report.variants as Record<string, string>).D3 = edit3;
      console.log(`D3: ${path.join(out, 'D3.png')} (${Date.now() - t4} ms) keep="${keep}"`);
    }
    // D2: the same edit in quality mode (no Lightning LoRA, the full step count)
    const tq = Date.now();
    const runQ = await comfy.run(qwenEdit({ prompt: edit, negative: 'smile, grin, laughing, text, watermark', references: [editRef], width: info.width, height: info.height, seed, quality: true }), { promptKey: `:frame-lab:${shotId}:D2:${seed}:${Date.now()}`, timeoutMs: 15 * 60_000 });
    const oQ = comfy.firstOutput(runQ.outputs, 'images'); if (!oQ) throw new Error('D2: no image');
    await fs.writeFile(path.join(out, 'D2.png'), await comfy.view(oQ));
    console.log(`D2: ${path.join(out, 'D2.png')} (${Date.now() - tq} ms)`);
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
  // F: compose from a NEUTRAL close-up portrait of the person (drawn here from the canonical image, the studio's PORTRAIT
  // secondary material) instead of the smiling full figure, with C's instruction — no edit pass afterwards
  if (opt('portrait') !== 'no') {
    const { qwenSecondary } = await import('@/server/workflows/qwen-image');
    const { secondaryPrompt } = await import('@/server/workflows/canonical-image');
    const personId = [...imageOf.keys()][0];
    const person = state.characters.find((c) => c.id === personId);
    const canonicalIdx = person ? imageOf.get(person.id)! - 1 : -1;
    if (person && canonicalIdx >= 0) {
      const line = person.canonicalImage?.identityLine ?? '';
      const t2 = Date.now();
      const runP = await comfy.run(qwenSecondary({ canonical: uploaded[canonicalIdx], kind: 'PORTRAIT', prompt: secondaryPrompt({ kind: 'PORTRAIT', style: person.style, identityLine: line }), negative: 'text, watermark', seed }), { promptKey: `:frame-lab:${shotId}:portrait:${seed}:${Date.now()}`, timeoutMs: 15 * 60_000 });
      const oP = comfy.firstOutput(runP.outputs, 'images'); if (!oP) throw new Error('portrait: no image');
      await fs.writeFile(path.join(out, 'portrait.png'), await comfy.view(oP));
      console.log(`portrait: ${path.join(out, 'portrait.png')} (${Date.now() - t2} ms)`);
      const portraitRef = await comfy.uploadInput(path.join(out, 'portrait.png'));
      const refsF = uploaded.map((u, k) => (k === canonicalIdx ? portraitRef : u));
      const cropsF = crops.map((c, k) => (k === canonicalIdx ? undefined : c));
      const t3 = Date.now();
      const runF = await comfy.run(qwenEdit({ prompt: variants.C, negative: 'text, watermark, logo, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head', references: refsF, width: info.width, height: info.height, seed, crops: cropsF.some(Boolean) ? cropsF : undefined }), { promptKey: `:frame-lab:${shotId}:F:${seed}:${Date.now()}`, timeoutMs: 15 * 60_000 });
      const oF = comfy.firstOutput(runF.outputs, 'images'); if (!oF) throw new Error('F: no image');
      await fs.writeFile(path.join(out, 'F.png'), await comfy.view(oF));
      console.log(`F: ${path.join(out, 'F.png')} (${Date.now() - t3} ms)`);
    }
  }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
