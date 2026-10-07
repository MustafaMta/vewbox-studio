/* ACE-STEP TIMBRE REFERENCE — a controlled check (Phase 3 singer identity). The same caption, lyrics, length and seed,
 * composed twice: without a reference (control) and with the given voice as ACE-Step 1.5's text2music timbre reference
 * (docker/comfyui/custom_nodes/vewbox_ace_timbre.py). Each vocal is separated (Demucs) and compared with the reference:
 * ECAPA cosine, pitch, tone. It writes the audio and a report to the output folder and touches nothing in the studio.
 * It is an ENGINEERING test of the mechanism, never a production song and never a choice between takes.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts MUSIC 24000 -- \
 *     pnpm exec tsx --env-file=.env --env-file=.env.local scripts/ace-timbre-check.ts --ref <wav> --out <dir> \
 *       [--caption "..."] [--lyrics-file <txt>] [--seconds 30] [--seed 7] [--language en]
 */
async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const ref = opt('ref'); const out = opt('out');
  if (!ref || !out) throw new Error('--ref <wav> and --out <dir> are required');
  const caption = opt('caption', 'gentle pop ballad, piano and soft strings, intimate lead vocal')!;
  const lyrics = opt('lyrics-file') ? await fs.readFile(opt('lyrics-file')!, 'utf8') : '[Verse]\nThe lights along the harbour\nare waiting just for you\n\n[Chorus]\nHold on, hold on\nthe night is almost through';
  const seconds = Number(opt('seconds', '30')); const seed = Number(opt('seed', '7')); const language = opt('language', 'en');
  const comfy = await import('@/server/providers/comfy');
  const { aceStepSong } = await import('@/server/workflows');
  const { separateStems } = await import('@/server/providers/speech');
  const { embedVoice, voiceProfile } = await import('@/server/providers/voice-design');
  await fs.mkdir(out, { recursive: true });
  const refName = await comfy.uploadInput(ref, { ext: path.extname(ref).slice(1) || 'wav' });
  const cosine = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const refEmb = (await embedVoice(ref)).embedding; const refProfile = await voiceProfile(ref);
  const results: Record<string, unknown> = {};
  for (const arm of ['control', 'reference'] as const) {
    const graph = aceStepSong({ caption, lyrics, seconds, seed, language, filenamePrefix: `vewbox/timbre-check-${arm}`, ...(arm === 'reference' ? { timbreReference: refName } : {}) });
    const t0 = Date.now();
    const run = await comfy.run(graph, { promptKey: `:timbre-check:${arm}:${seed}:${Date.now()}`, timeoutMs: 20 * 60_000 });
    const o = comfy.firstOutput(run.outputs, 'audio');
    if (!o) throw new Error(`${arm}: no audio`);
    const song = path.join(out, `${arm}.flac`);
    await fs.writeFile(song, await comfy.view(o));
    const stemsDir = path.join(out, `${arm}-stems`);
    await fs.mkdir(stemsDir, { recursive: true });
    const st = await separateStems(song, stemsDir);
    const vocals = st.files.vocals;
    const emb = (await embedVoice(vocals)).embedding;
    results[arm] = { song, vocals, ms: Date.now() - t0, cosineToReference: Number(cosine(emb, refEmb).toFixed(3)), profile: await voiceProfile(vocals) };
    console.log(arm, JSON.stringify(results[arm]));
  }
  const report = { at: new Date().toISOString(), reference: { file: ref, profile: refProfile }, caption, lyrics, seconds, seed, language, results, note: 'Engineering check of the timbre mechanism. ECAPA on a singing stem against a speech reference is relative evidence only; a person listens.' };
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`report: ${path.join(out, 'report.json')}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
