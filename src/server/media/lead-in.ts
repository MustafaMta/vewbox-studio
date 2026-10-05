/** ONE-WORD LINES ON INDEXTTS (docs/research/MODEL-EVAL-2026-10.md §4, open item 7). IndexTTS 2.5 does not stop after
 *  a single word: its speech model keeps generating to ≈ 1.3–1.5 s and fills the rest with an invented syllable
 *  («Nothing.» → "Nothing. Thang.", «Now?» → "Now, de-sip."; 9 of 18 one-word lines over 6 words × 3 seeds). Sentence
 *  punctuation does not cure it ("Nothing..." 1/3 still garbled, "... Nothing." 3/3). Spoken AFTER a lead-in sentence
 *  the word is the end of a longer utterance and comes out clean (18/18), with the closing intonation of its own
 *  mark. So the engine hears ONE_WORD_LEAD_IN + the word (`prepareLineText`), and the line is cut after synthesis at
 *  the silence before the word, located by the transcript's word timings (`leadInCutPoint`) and refined on the samples
 *  (`quietestPoint`); `cutWavStart` writes the line from there. Pure functions; the handler does the I/O. */

/** The lead-in the engine speaks first: seven plain words ending in a full stop, so a pause separates it from the line
 *  (measured gap 0.14–0.56 s before the word). */
export const ONE_WORD_LEAD_IN = 'That is all I have to say.';
export const ONE_WORD_LEAD_IN_WORDS = 7;

/** A line that is one Latin word with its punctuation («Nothing.», «Now?», «Mm-hmm…»). */
export const isOneWordLine = (text: string): boolean => /^[\s"'“‘(]*[A-Za-zÀ-ɏ]+(?:['’-][A-Za-zÀ-ɏ]+)*[\s.!?…,;:"'”’)]*$/u.test(text);

const fold = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

export interface TimedWord { start: number; end: number; word: string }

/** Where the lead-in ends and the line begins, from the transcript's words: the target is the LAST word heard that is
 *  the line's word (folded: case and punctuation), with most of the lead-in heard before it. The window to cut in runs
 *  from the end of the word before it to the target's start. `null` when the line's word is not the last thing heard
 *  or too little of the lead-in was heard — the caller then does not use this take: the lead-in must never reach a
 *  film. */
export function leadInCutPoint(words: TimedWord[], line: string): { from: number; to: number; target: TimedWord } | null {
  const want = fold(line);
  const heard = words.filter((w) => fold(w.word));
  const k = heard.length - 1;
  if (k < ONE_WORD_LEAD_IN_WORDS - 2 || fold(heard[k].word) !== want) return null;
  const before = heard[k - 1];
  return { from: Math.min(before.end, heard[k].start), to: heard[k].start, target: heard[k] };
}

/** Where to cut between the lead-in and the word, in seconds: in [from − 0.05, to + 0.03] (the transcript's timings
 *  are only ≈ 0.1 s exact), the LATEST 10 ms window about as quiet as the quietest one (RMS within 2× / +30), so the
 *  pause is left behind and the word keeps its onset; then 40 ms of that pause is kept before it. */
export function quietestPoint(samples: Int16Array, sampleRate: number, from: number, to: number): number {
  const lo = Math.max(0, from - 0.05), hi = Math.max(lo, to + 0.03);
  const win = Math.max(1, Math.round(sampleRate * 0.01)), step = Math.max(1, Math.floor(win / 2));
  const rmsAt: Array<[number, number]> = [];
  for (let s = Math.floor(lo * sampleRate); s + win <= Math.min(samples.length, Math.ceil(hi * sampleRate)); s += step) {
    let acc = 0;
    for (let i = s; i < s + win; i++) acc += samples[i] * samples[i];
    rmsAt.push([(s + win / 2) / sampleRate, Math.sqrt(acc / win)]);
  }
  if (!rmsAt.length) return lo;
  const floor = Math.min(...rmsAt.map(([, r]) => r));
  const quiet = rmsAt.filter(([, r]) => r <= Math.max(floor * 2, floor + 30));
  return Math.max(lo, quiet[quiet.length - 1][0] - 0.04);
}

interface Chunk { id: string; body: Buffer }
function chunks(wav: Buffer): Chunk[] {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  const out: Chunk[] = [];
  for (let p = 12; p + 8 <= wav.length;) {
    const id = wav.toString('ascii', p, p + 4); const size = wav.readUInt32LE(p + 4);
    out.push({ id, body: wav.subarray(p + 8, Math.min(wav.length, p + 8 + size)) });
    p += 8 + size + (size % 2);
  }
  return out;
}

/** The samples of a 16-bit PCM mono WAV (what the voice services write) and its rate. */
export function readPcm16(wav: Buffer): { samples: Int16Array; sampleRate: number } {
  const cs = chunks(wav);
  const fmt = cs.find((c) => c.id === 'fmt ')?.body; const data = cs.find((c) => c.id === 'data')?.body;
  if (!fmt || !data) throw new Error('WAV without fmt/data');
  if (fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 1 || fmt.readUInt16LE(14) !== 16) throw new Error('not 16-bit PCM mono');
  const copy = Buffer.from(data);
  return { samples: new Int16Array(copy.buffer, copy.byteOffset, Math.floor(copy.length / 2)), sampleRate: fmt.readUInt32LE(4) };
}

/** The same WAV from `fromSeconds` on, with a short fade-in; every other chunk (the service's provenance INFO list,
 *  "synthetic speech … not a voice reference") is kept as it was. */
export function cutWavStart(wav: Buffer, fromSeconds: number, fadeMs = 12): Buffer {
  const { samples, sampleRate } = readPcm16(wav);
  const start = Math.max(0, Math.min(samples.length, Math.round(fromSeconds * sampleRate)));
  const kept = Int16Array.from(samples.subarray(start));
  const fade = Math.min(kept.length, Math.round((sampleRate * fadeMs) / 1000));
  for (let i = 0; i < fade; i++) kept[i] = Math.round((kept[i] * i) / fade);
  const data = Buffer.from(kept.buffer, kept.byteOffset, kept.byteLength);
  const parts: Buffer[] = [];
  for (const c of chunks(wav)) {
    const body = c.id === 'data' ? data : c.body;
    const head = Buffer.alloc(8); head.write(c.id, 0, 'ascii'); head.writeUInt32LE(body.length, 4);
    parts.push(head, body, ...(body.length % 2 ? [Buffer.alloc(1)] : []));
  }
  const riff = Buffer.alloc(12); riff.write('RIFF', 0, 'ascii'); riff.writeUInt32LE(4 + parts.reduce((a, b) => a + b.length, 0), 4); riff.write('WAVE', 8, 'ascii');
  return Buffer.concat([riff, ...parts]);
}
