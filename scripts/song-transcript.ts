/** Print what the ASR service hears on an audio file, segment by segment with times — an independent check of a
 *  song's lyric placement (the vocal stem is the usual input).
 *  Usage: pnpm exec tsx --env-file=.env --env-file=.env.local scripts/song-transcript.ts <file> [en|ar] */
import { transcribe } from '@/server/providers/speech';

const [file, language = 'en'] = process.argv.slice(2);
if (!file) { console.error('usage: song-transcript.ts <file> [en|ar]'); process.exit(2); }
const t = await transcribe(file, { language: language as 'en' | 'ar' });
for (const s of t.segments) console.log(`${s.start.toFixed(2).padStart(6)}–${s.end.toFixed(2).padEnd(6)} ${s.text.trim()}`);
