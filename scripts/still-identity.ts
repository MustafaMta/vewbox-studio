/* STILL IDENTITY — the SFace cosine of each still picture's face against a character's canonical image (the take QA's
 * own /qa/identity, on a one-second clip of the still). An ENGINEERING measurement; touches nothing in the studio.
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts ASR 4000 -- \
 *     pnpm exec tsx --env-file=.env --env-file=.env.local scripts/still-identity.ts --character <id> <png>...
 */
async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--character'); const characterId = i >= 0 ? args[i + 1] : undefined;
  const files = args.filter((a, k) => k !== i && k !== i + 1);
  if (!characterId || !files.length) throw new Error('--character <id> and at least one picture are required');
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const { readState } = await import('@/server/studio/engine');
  const { assetFile } = await import('@/server/media');
  const { primaryImageOf } = await import('@/domain/identity');
  const { ffmpeg } = await import('@/server/media/ffmpeg');
  const { faceIdentity, judgeIdentity } = await import('@/server/providers/qa-service');
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId); if (!c) throw new Error('character not found');
  const ref = state.assets.find((a) => a.id === primaryImageOf(c)); if (!ref) throw new Error('no canonical image');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'still-id-'));
  for (const f of files) {
    const clip = path.join(dir, `${path.basename(f, path.extname(f))}.mp4`);
    await ffmpeg(['-hide_banner', '-nostdin', '-y', '-loop', '1', '-i', f, '-t', '1', '-r', '24', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', clip]);
    const r = await faceIdentity(clip, [{ characterId, image: assetFile(ref) }]);
    const j = judgeIdentity(r);
    console.log(`${path.basename(f)}: ${j.verdict} median ${j.characters[characterId]?.median?.toFixed(3) ?? '-'} ${j.detail.join('; ')}`);
  }
  await fs.rm(dir, { recursive: true, force: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
