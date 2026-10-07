/** Prove the song post-processing on an EXISTING recording, without composing again (a new GENERATE_SONG is a new
 *  seed — a second creative attempt) and without writing to the studio: the level trim on the raw file, the planned
 *  section windows over the real length, and the lyric placement on the vocal stem.
 *  Usage: pnpm exec tsx --env-file=.env --env-file=.env.local scripts/song-reprocess-check.ts <productionId> */
import os from 'node:os';
import path from 'node:path';
import { readState } from '@/server/studio/engine';
import { assetFile } from '@/server/media';
import { ffmpeg } from '@/server/media/ffmpeg';
import { loudness } from '@/server/media/voice-check';
import { transcribe } from '@/server/providers/speech';
import { alignLyrics } from '@/server/media/lyrics';
import { levelTrimDb, scaleSections } from '@/worker/handlers/music';

const productionId = process.argv[2];
const { state } = await readState();
const p = state.productions.find((x) => x.id === productionId);
if (!p?.song?.assetId || !p.song.stems?.vocals) { console.error('no recorded song with stems'); process.exit(2); }
const song = state.assets.find((a) => a.id === p.song!.assetId)!;
const vocals = state.assets.find((a) => a.id === p.song!.stems!.vocals)!;
const duration = song.durationSeconds ?? p.song.durationSeconds;

// 1) the level trim
const raw = await loudness(assetFile(song));
const gain = levelTrimDb(raw.truePeakDbtp);
const out = path.join(os.tmpdir(), `song-trim-${Date.now()}.flac`);
await ffmpeg(['-y', '-i', assetFile(song), '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'flac', out]);
const after = await loudness(out);
console.log(`level: raw ${raw.integratedLufs.toFixed(1)} LUFS / ${raw.truePeakDbtp.toFixed(2)} dBTP → trim ${gain.toFixed(2)} dB → ${after.integratedLufs.toFixed(1)} LUFS / ${after.truePeakDbtp.toFixed(2)} dBTP`);

// 2) the planned windows: each section by what it holds (as songFromPlan times them), over the real length
const weights = p.song.sections.map((s) => (s.kind !== 'INSTRUMENTAL' && s.text.trim() ? s.text.split('\n').filter((l) => l.trim()).length : 2));
const total = weights.reduce((a, w) => a + w, 0);
const at = (i: number) => (p.song!.durationSeconds * weights.slice(0, i).reduce((a, w) => a + w, 0)) / total;
const planned = scaleSections(p.song.sections.map((s, i) => ({ ...s, from: Math.round(at(i)), to: Math.round(at(i + 1)) })), duration);

// 3) the lyric placement on the vocal stem (the transcript match the studio runs)
const t = await transcribe(assetFile(vocals), { language: p.language === 'AR' ? 'ar' : 'en' });
const words = t.segments.flatMap((s) => s.words ?? []).map((w) => ({ start: w.start, end: w.end, word: w.word }));
const lines = alignLyrics(planned, words, p.language === 'AR' ? 'AR' : 'EN');
for (const s of planned) {
  const mine = lines.filter((l) => l.sectionId === s.id);
  console.log(`${s.kind.padEnd(12)} window ${String(s.from).padStart(3)}–${String(s.to).padEnd(3)} ${mine.map((l) => `${l.method === 'ALIGNED' ? '✓' : '·'}${l.from.toFixed(1)}`).join(' ')}`);
}
console.log(`placed by the transcript: ${lines.filter((l) => l.method === 'ALIGNED').length} of ${lines.length}`);
