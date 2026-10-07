/* THE IRAQI LAB RUN (Phase 3 engineering, producer decision 2026-10-07). A REFERENCE WITHOUT SPEAKER PERMISSION (the
 * upstream Habibi IRQ demo clip) may be used ONLY to prove the technical pipeline:
 *
 *   each test line, spoken ONCE  →  Habibi-TTS Specialized IRQ (Arabic script) / MOSS-TTS v1.5 (English), same reference
 *   →  Qwen3-ASR-1.7B (auto language)  +  the Arabic-dialect Whisper  →  the چ/گ phoneme gate (when its model is present)
 *   →  speaker evidence (ECAPA to the reference, pitch, tone) and the cross-language identity comparison
 *
 * Nothing is written to the studio, no character is created, nothing is promoted. Every file and the report carry
 * LAB_LABEL. The final Iraqi acceptance needs a real consented Baghdadi reference.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/iraqi-lab.ts --ref <wav> --ref-text "<what it says>" --out <dir>
 *     [--lines conv-04,q-02,...] [--english "line one|line two"] [--seed 7]
 */
const LAB_LABEL = 'LAB TEST — NOT PRODUCTION / NO SPEAKER PERMISSION';

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const ref = opt('ref'); const refText = opt('ref-text'); const out = opt('out');
  if (!ref || !refText || !out) throw new Error('--ref, --ref-text and --out are required');
  const seed = Number(opt('seed', '7'));
  const ids = (opt('lines', 'conv-02,conv-04,conv-07,q-02,q-06,num-07,name-02,name-04,emo-anger-01,emo-tender-02,emo-humour-03,long-01,short-01') ?? '').split(',').filter(Boolean);
  const english = (opt('english', 'I told you the ferry would be late again, so we wait by the lights.|Stay here with me for a minute, I will be right back.') ?? '').split('|').filter(Boolean);
  const set = JSON.parse(await fs.readFile('tests/fixtures/voice/iraqi-eval-set.json', 'utf8')) as { lines: Array<{ id: string; textAr?: string; text?: string; features?: string[]; emotion?: string }> };
  const { gpuLease } = await import('@/server/gpu/lease');
  const { synthesize, routeLine, transcribe } = await import('@/server/providers/speech');
  const { prepareLineText } = await import('@/server/providers/iraqi-text');
  const { transcribeQwen, dialectPhonemes } = await import('@/server/providers/qa-service');
  const { judgeLine } = await import('@/server/media/iraqi-phonology');
  const { embedVoice, voiceProfile } = await import('@/server/providers/voice-design');
  const { crossLanguageIdentity } = await import('@/server/media/cross-language-identity');
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'LAB-TEST-NOT-PRODUCTION.txt'), `${LAB_LABEL}\nReference: ${ref} (no speaker permission — engineering fixture only)\n`);

  type Row = { id: string; language: 'AR' | 'EN'; text: string; features?: string[]; emotion?: string; engine?: string; file?: string; seconds?: number; prepared?: string[]; error?: string; qwen?: unknown; whisper?: unknown; phonology?: unknown; speaker?: unknown };
  const rows: Row[] = [
    ...ids.map((id) => { const l = set.lines.find((x) => x.id === id); if (!l) throw new Error(`no eval line ${id}`); return { id, language: 'AR' as const, text: (l.textAr ?? l.text)!, features: l.features, emotion: l.emotion }; }),
    ...english.map((t, i) => ({ id: `en-${i + 1}`, language: 'EN' as const, text: t })),
  ];

  // 1) SPEECH: each line ONCE (the first-attempt rule), Arabic script → Habibi IRQ, Latin → the English engine (MOSS)
  await gpuLease('TTS', 24000, async () => {
    for (const r of rows) {
      const route = routeLine(r.text, 'AR', 'IRAQI_BAGHDADI');
      const prep = prepareLineText(r.text, { engine: route.engine === 'habibi' ? 'habibi' : 'indextts', language: r.language, dialect: r.language === 'AR' ? 'IRAQI_BAGHDADI' : undefined });
      try {
        const s = await synthesize({ text: prep.text, language: r.language, dialect: r.language === 'AR' ? 'IRAQI_BAGHDADI' : undefined, referenceWav: ref, referenceText: refText, engine: route.engine, seed }, out);
        const file = path.join(out, `LAB-TEST_${r.id}_${route.engine}.wav`);
        await fs.rename(s.file, file);
        Object.assign(r, { engine: route.engine, file, seconds: s.durationSeconds, prepared: prep.changes });
        console.log(`spoke ${r.id} (${route.engine}, ${s.durationSeconds.toFixed(1)} s)`);
      } catch (e) { r.error = (e as Error).message; console.log(`FAILED ${r.id}: ${r.error}`); }
    }
  }, { priority: 'normal' } as never);

  // 2) HEARING: Qwen3-ASR (auto — a forced language can translate), the dialect Whisper, the phoneme gate
  await gpuLease('ASR', 8000, async () => {
    for (const r of rows.filter((x) => x.file)) {
      r.qwen = await transcribeQwen(r.file!);
      const w = await transcribe(r.file!, { language: r.language === 'AR' ? 'ar' : 'en' }).catch((e) => ({ error: (e as Error).message }));
      r.whisper = 'text' in (w as object) ? { model: (w as { model?: string }).model, text: (w as { text: string }).text } : w;
      if (r.language === 'AR') {
        const ph = await dialectPhonemes(r.file!, r.text);
        r.phonology = ph.available ? { ...judgeLine(ph.words), coverage: ph.coverage } : { verdict: 'UNAVAILABLE', reason: (ph as { reason?: string }).reason };
      }
      console.log(`heard ${r.id}`);
    }
  }, { priority: 'normal' } as never);

  // 3) SPEAKER: each line against the reference, and Arabic (Habibi) vs English (MOSS)
  const R = { embedding: (await embedVoice(ref)).embedding, profile: await voiceProfile(ref) };
  const cos = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const rendered: Record<string, { embedding: number[]; profile: Awaited<ReturnType<typeof voiceProfile>> }> = {};
  for (const r of rows.filter((x) => x.file && (x.seconds ?? 0) >= 1)) {
    try { const e = (await embedVoice(r.file!)).embedding; const p = await voiceProfile(r.file!); rendered[r.id] = { embedding: e, profile: p }; r.speaker = { cosineToReference: Number(cos(e, R.embedding).toFixed(3)), f0MedianHz: p.f0MedianHz, centroidMedianHz: p.centroidMedianHz }; } catch (e) { r.speaker = { error: (e as Error).message }; }
  }
  const identity = crossLanguageIdentity(R, rows.filter((r) => r.language === 'AR' && rendered[r.id]).map((r) => rendered[r.id]), rows.filter((r) => r.language === 'EN' && rendered[r.id]).map((r) => rendered[r.id]));
  const report = { label: LAB_LABEL, at: new Date().toISOString(), reference: { file: ref, text: refText, profile: R.profile }, seed, rows, identity, note: 'Engineering evidence only. Iraqi dialect, naturalness and identity are decided by a native listener; this reference has no speaker permission and nothing here may be promoted.' };
  await fs.writeFile(path.join(out, 'LAB-TEST-report.json'), JSON.stringify(report, null, 2));
  console.log(`report: ${path.join(out, 'LAB-TEST-report.json')}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
