import fs from 'node:fs/promises';
import path from 'node:path';

/** SOURCE ADAPTERS for the Iraqi dataset pipeline (scripts/iraqi-dataset.ts): a source lists its utterances (the audio
 *  file as obtained, the original transcript, the speaker) and says what consent state its licence record gives. The
 *  pipeline measures, filters and writes; the source files are never modified.
 *
 *  `generic-folder`: raw/<source>/ holds audio files and a `metadata.csv` (LJSpeech style: `id|transcript` or
 *  `file|speaker|transcript`, pipe-separated) or a `metadata.jsonl` ({ file, transcript, speaker? }). The corpus-specific
 *  adapter for hayderkharrufa/iraqi-dialect-tts-corpus is added once its files and licence are verified
 *  (docs/research/iraqi-voice-production.md). */

export interface SourceUtterance { audio: string; transcript: string; speaker: string }
export interface SourceAdapter { id: string; consent: 'LICENSED_DATASET' | 'CONSENTED_RECORDING' | 'UNKNOWN'; utterances(rawDir: string): AsyncGenerator<SourceUtterance> }

const AUDIO = /\.(wav|flac|mp3|m4a|ogg)$/i;

async function* genericFolder(rawDir: string): AsyncGenerator<SourceUtterance> {
  const jsonl = path.join(rawDir, 'metadata.jsonl');
  const csv = path.join(rawDir, 'metadata.csv');
  if (await exists(jsonl)) {
    for (const line of (await fs.readFile(jsonl, 'utf8')).split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { file: string; transcript: string; speaker?: string };
      yield { audio: path.resolve(rawDir, r.file), transcript: r.transcript, speaker: r.speaker ?? 'unknown' };
    }
    return;
  }
  if (await exists(csv)) {
    for (const line of (await fs.readFile(csv, 'utf8')).split('\n')) {
      if (!line.trim()) continue;
      const cells = line.split('|');
      const [a, b] = cells;
      const file = AUDIO.test(a) ? a : `${a}.wav`;
      const speaker = cells.length >= 3 ? b : 'unknown';
      const transcript = cells.length >= 3 ? cells.slice(2).join('|') : (b ?? '');
      yield { audio: await resolveAudio(rawDir, file), transcript, speaker };
    }
    return;
  }
  throw new Error(`${rawDir}: no metadata.jsonl or metadata.csv`);
}

async function resolveAudio(rawDir: string, file: string): Promise<string> {
  for (const cand of [path.join(rawDir, file), path.join(rawDir, 'wavs', file), path.join(rawDir, 'audio', file)]) if (await exists(cand)) return cand;
  return path.join(rawDir, file);
}
const exists = (f: string) => fs.stat(f).then(() => true, () => false);

export function sourceAdapter(id: string): SourceAdapter {
  // every source is a licensed dataset until a consented studio recording exists; the licence record itself is
  // checked by the pipeline before anything is read
  return { id, consent: 'LICENSED_DATASET', utterances: genericFolder };
}
