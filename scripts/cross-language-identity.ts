/* CROSS-LANGUAGE VOICE IDENTITY (Phase 3 evidence): a bilingual character's generated lines, split by script (Arabic
 * → Habibi IRQ, Latin → MOSS), against each other and against the consented reference — ECAPA similarity (the
 * tts-design service), pitch, tone and formants (/voice-profile) — judged by src/server/media/cross-language-identity.ts.
 * Never a pass: CONSISTENT or MISMATCH_SUSPECTED, and the producer listens. Reads the studio; writes the report only.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/cross-language-identity.ts <characterId> [--out <file.json>]
 */
async function main() {
  const [id, ...rest] = process.argv.slice(2);
  const out = rest[rest.indexOf('--out') + 1] && rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : undefined;
  const fs = await import('node:fs/promises');
  const { readState } = await import('@/server/studio/engine');
  const { embedVoice, voiceProfile } = await import('@/server/providers/voice-design');
  const { lineScript } = await import('@/server/providers/speech');
  const { assetFile } = await import('@/server/media');
  const { crossLanguageIdentity } = await import('@/server/media/cross-language-identity');
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === id);
  if (!c) throw new Error(`no character ${id}`);
  const fileOf = (assetId?: string) => { const a = state.assets.find((x) => x.id === assetId); return a ? assetFile(a) : undefined; };
  const render = async (file: string) => ({ embedding: (await embedVoice(file)).embedding, profile: await voiceProfile(file) });
  // the consented reference: the identity's own (its trimmed window when stored)
  const ref = c.voice.samples.find((s) => s.source === 'UPLOADED' && s.consent);
  const refFile = fileOf((ref?.provenance?.trimmedAssetId as string | undefined) ?? ref?.assetId);
  const lines = c.voice.samples.filter((s) => s.source === 'GENERATED' && s.text && s.assetId);
  const arabic: Array<{ text: string; file: string }> = []; const english: Array<{ text: string; file: string }> = [];
  for (const s of lines) { const f = fileOf(s.assetId); if (!f) continue; (lineScript(s.text!) === 'AR' ? arabic : lineScript(s.text!) === 'LATIN' ? english : []).push({ text: s.text!, file: f }); }
  console.log(`${c.name}: reference ${refFile ? 'yes' : 'none'}, ${arabic.length} Arabic line(s), ${english.length} English line(s)`);
  const R = refFile ? await render(refFile) : null;
  const A = await Promise.all(arabic.map((x) => render(x.file)));
  const E = await Promise.all(english.map((x) => render(x.file)));
  const evidence = crossLanguageIdentity(R, A, E);
  const report = { character: { id: c.id, name: c.name }, at: new Date().toISOString(), reference: refFile, arabic: arabic.map((x, i) => ({ ...x, profile: A[i].profile })), english: english.map((x, i) => ({ ...x, profile: E[i].profile })), evidence, note: 'Machine evidence only — the producer listens and decides whether both languages sound like the same performer.' };
  console.log(JSON.stringify(evidence, null, 2));
  if (out) { await fs.writeFile(out, JSON.stringify(report, null, 2)); console.log(`report: ${out}`); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
