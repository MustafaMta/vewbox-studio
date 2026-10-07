/* VOICE IDENTITY MATRIX (Phase 1 evidence): every recorded line of the given characters (the proof line and the
 * spoken previews) embedded with the studio's speaker encoder (ECAPA, the tts-design service), then the mean cosine
 * within each character (one persistent voice: high) and between characters (distinct voices: low). Reads the studio;
 * writes nothing.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/voice-identity-matrix.ts <characterId> [...]
 */
async function main() {
  const ids = process.argv.slice(2);
  const { readState } = await import('@/server/studio/engine');
  const { embedVoice } = await import('@/server/providers/voice-design');
  const { assetFile } = await import('@/server/media');
  const { state } = await readState();
  const emb = new Map<string, number[][]>();
  for (const id of ids) {
    const c = state.characters.find((x) => x.id === id);
    if (!c) throw new Error(`no character ${id}`);
    const files = c.voice.samples.map((s) => state.assets.find((a) => a.id === s.assetId)).filter((a): a is NonNullable<typeof a> => Boolean(a)).map((a) => assetFile(a));
    const list: number[][] = [];
    for (const f of files) list.push((await embedVoice(f)).embedding);
    emb.set(c.name, list);
    console.log(`${c.name}: ${list.length} lines`);
  }
  const cos = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0) / Math.sqrt(a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0));
  const names = [...emb.keys()];
  const mean = (a: string, b: string) => {
    const xs: number[] = [];
    const A = emb.get(a)!, B = emb.get(b)!;
    for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (a !== b || i < j) xs.push(cos(A[i], B[j]));
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  };
  console.log(`\n${''.padEnd(16)}${names.map((n) => n.padEnd(16)).join('')}`);
  for (const a of names) console.log(`${a.padEnd(16)}${names.map((b) => mean(a, b).toFixed(3).padEnd(16)).join('')}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
