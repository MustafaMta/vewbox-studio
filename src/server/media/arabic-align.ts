import { normalizeIraqi, scriptCoverage } from '@/server/providers/speech';

/** SPACE-INSENSITIVE ARABIC COMPARISON — beside the studio's own metrics (`charErrorRate`, `scriptCoverage` in
 *  speech.ts). Since voice identity v2 (contract §4) the voice check's ARABIC word coverage is `arabicWordCoverage`
 *  below and a line failing only on «چ» words is REVIEW (`unconfirmableCh`); English keeps `scriptCoverage`, and CER is
 *  unchanged. Whisper writes Iraqi speech with its own word boundaries
 *  («گلتلك» comes back as «قلت لك», «شكو ماكو» as «شكوماكو»), and a word-level coverage then counts a correctly heard
 *  phrase as missing. Here both sides go through the same dialect fold (`normalizeIraqi`), then:
 *   - `letterCoverage`: the share of the intended letters heard, in order (LCS over letters, spaces removed);
 *   - `letterErrorRate`: edit distance over letters / intended letters (spaces removed);
 *   - `wordDiff`: the word alignment, with every difference classified as SPACING (same letters, other boundaries),
 *     SUBSTITUTION (other letters: «باچر» → «باسر»), DELETION or INSERTION; and VARIANT for words that differ in
 *     spelling but fold to the same word (Whisper's MSA spelling of a dialect sound: «گعد» written «قعد»).
 *  None of this says anything about pronunciation or dialect: it compares what Whisper wrote with what was intended. */

/** Folded letters only (digits kept): the sentence-level dialect fold, then every space and mark removed. */
export const foldedLetters = (s: string): string => normalizeIraqi(s).replace(/[^\p{L}\p{N}]/gu, '');

/** Letters of one raw word as written (diacritics, tatweel and punctuation removed, no fold), for display. */
const rawLetters = (w: string): string => w.normalize('NFC').replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

function lcsLength<T>(a: readonly T[], b: readonly T[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

function editDistance<T>(a: readonly T[], b: readonly T[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Share of the intended (folded) letters that were heard in order; spaces do not count. 1 for an empty reference. */
export function letterCoverage(reference: string, hypothesis: string): number {
  const r = Array.from(foldedLetters(reference)); const h = Array.from(foldedLetters(hypothesis));
  return r.length === 0 ? 1 : lcsLength(r, h) / r.length;
}

/** Edit distance over folded letters / intended letters; spaces do not count. */
export function letterErrorRate(reference: string, hypothesis: string): number {
  const r = Array.from(foldedLetters(reference)); const h = Array.from(foldedLetters(hypothesis));
  return r.length === 0 ? (h.length === 0 ? 0 : 1) : editDistance(r, h) / r.length;
}

export type WordDiffKind = 'SPACING' | 'SUBSTITUTION' | 'DELETION' | 'INSERTION' | 'VARIANT';
export interface WordDiff {
  kind: WordDiffKind;
  /** the intended words and the heard words of this block, as written (no diacritics) */
  ref: string[]; hyp: string[];
  /** for SUBSTITUTION and VARIANT: the letters that changed, intended→heard, as written (e.g. «چ→س») */
  letters?: string[];
}

/** Letter changes between two written strings (aligned by edit distance), e.g. «باچر» vs «باسر» → ['چ→س']. A run of
 *  changed letters is reported as one change; '∅' marks a missing or an extra letter. */
export function letterChanges(ref: string, hyp: string): string[] {
  const a = Array.from(ref); const b = Array.from(hyp);
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ops: Array<{ r: string; h: string } | null> = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { ops.push(a[i - 1] === b[j - 1] ? null : { r: a[i - 1], h: b[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ r: a[i - 1], h: '' }); i--; }
    else { ops.push({ r: '', h: b[j - 1] }); j--; }
  }
  ops.reverse();
  const out: string[] = []; let run: { r: string; h: string } | null = null;
  for (const op of ops) {
    if (op) { run = run ? { r: run.r + op.r, h: run.h + op.h } : { ...op }; continue; }
    if (run) { out.push(`${run.r || '∅'}→${run.h || '∅'}`); run = null; }
  }
  if (run) out.push(`${run.r || '∅'}→${run.h || '∅'}`);
  return out;
}

/** Longest run of words one spacing segment may join or split («شكو ماكو» ↔ «شكوماكو» is 2:1). */
const MAX_SPAN = 4;

/** One stretch of the word alignment, as written words: a MATCH (one word each side, equal after the fold), a SPACING
 *  segment (same letters, other boundaries), or an ERROR block (consecutive substituted, missing and extra words). */
export interface AlignedBlock { kind: 'MATCH' | 'SPACING' | 'ERROR'; ref: string[]; hyp: string[] }

/** Align intended and heard words and classify every difference. Each word is folded on its own; the alignment is an
 *  edit distance whose cheap moves are a match (same folded word, free) and a SPACING segment (k intended words whose
 *  folded letters equal l heard words', k + l ≥ 3; the shortest such segment is taken); a substituted, missing or extra
 *  word is an error. Consecutive errors
 *  form one SUBSTITUTION / DELETION / INSERTION block; a match spelled differently before the fold is a VARIANT. */
export function wordDiff(reference: string, hypothesis: string): WordDiff[] {
  return alignWords(reference, hypothesis).flatMap((b): WordDiff[] => {
    if (b.kind === 'MATCH') return b.ref[0] !== b.hyp[0] ? [{ kind: 'VARIANT', ref: b.ref, hyp: b.hyp, letters: letterChanges(b.ref[0], b.hyp[0]) }] : [];
    if (b.kind === 'SPACING') return [{ kind: 'SPACING', ref: b.ref, hyp: b.hyp }];
    if (b.ref.length && b.hyp.length) return [{ kind: 'SUBSTITUTION', ref: b.ref, hyp: b.hyp, letters: letterChanges(b.ref.join(''), b.hyp.join('')) }];
    return [b.ref.length ? { kind: 'DELETION', ref: b.ref, hyp: b.hyp } : { kind: 'INSERTION', ref: b.ref, hyp: b.hyp }];
  });
}

/** The whole alignment behind `wordDiff`, matches included, in order. */
export function alignWords(reference: string, hypothesis: string): AlignedBlock[] {
  const words = (s: string) => s.split(/\s+/).map(rawLetters).filter(Boolean);
  const R = words(reference); const H = words(hypothesis);
  const fr = R.map((w) => foldedLetters(w)); const fh = H.map((w) => foldedLetters(w));
  type Step = { kind: 'M' | 'SP' | 'S' | 'D' | 'I'; di: number; dj: number };
  const INF = Number.MAX_SAFE_INTEGER;
  // a word error costs ERR; a spacing segment costs its word count, so the shortest segment wins and any number of
  // spacing segments is still cheaper than one error
  const ERR = 1000;
  const cost: number[][] = Array.from({ length: R.length + 1 }, () => new Array<number>(H.length + 1).fill(INF));
  const step: Array<Array<Step | null>> = Array.from({ length: R.length + 1 }, () => new Array<Step | null>(H.length + 1).fill(null));
  cost[0][0] = 0;
  for (let i = 0; i <= R.length; i++) {
    for (let j = 0; j <= H.length; j++) {
      const c = cost[i][j];
      if (c === INF) continue;
      const relax = (ni: number, nj: number, add: number, s: Step) => { if (c + add < cost[ni][nj]) { cost[ni][nj] = c + add; step[ni][nj] = s; } };
      // free moves first so that, at equal cost, a match or a spacing segment wins over a substitution
      if (i < R.length && j < H.length && fr[i] === fh[j]) relax(i + 1, j + 1, 0, { kind: 'M', di: 1, dj: 1 });
      for (let k = 1; k <= MAX_SPAN && i + k <= R.length; k++) {
        const left = fr.slice(i, i + k).join('');
        for (let l = 1; l <= MAX_SPAN && j + l <= H.length; l++) {
          if (k + l < 3) continue;
          // k = l with every word equal is a run of matches, not a boundary change
          if (k === l && fr.slice(i, i + k).every((w, n) => w === fh[j + n])) continue;
          if (left === fh.slice(j, j + l).join('')) relax(i + k, j + l, k + l, { kind: 'SP', di: k, dj: l });
        }
      }
      if (i < R.length && j < H.length) relax(i + 1, j + 1, ERR, { kind: 'S', di: 1, dj: 1 });
      if (i < R.length) relax(i + 1, j, ERR, { kind: 'D', di: 1, dj: 0 });
      if (j < H.length) relax(i, j + 1, ERR, { kind: 'I', di: 0, dj: 1 });
    }
  }
  const path: Array<Step & { i: number; j: number }> = [];
  for (let i = R.length, j = H.length; i > 0 || j > 0;) { const s = step[i][j]!; i -= s.di; j -= s.dj; path.push({ ...s, i, j }); }
  path.reverse();

  const out: AlignedBlock[] = [];
  let block: AlignedBlock | null = null;
  const flush = () => { if (block) out.push(block); block = null; };
  for (const s of path) {
    const ref = R.slice(s.i, s.i + s.di); const hyp = H.slice(s.j, s.j + s.dj);
    if (s.kind === 'M') { flush(); out.push({ kind: 'MATCH', ref, hyp }); continue; }
    if (s.kind === 'SP') { flush(); out.push({ kind: 'SPACING', ref, hyp }); continue; }
    block ??= { kind: 'ERROR', ref: [], hyp: [] };
    block.ref.push(...ref); block.hyp.push(...hyp);
  }
  flush();
  return out;
}

// ------------------------------------------------------------------------------- the voice check (contract v2 §4)

/** An error block whose words agree once the WHOLE phrase is folded (the sentence fold maps phrases a word-by-word fold
 *  cannot: «اثنى عشر» is «اثنعش», «ما كو» is «ماكو»): heard, not missing. */
const phraseFoldEqual = (b: AlignedBlock) => b.hyp.length > 0 && foldedLetters(b.ref.join(' ')) === foldedLetters(b.hyp.join(' '));

/** ARABIC WORD COVERAGE for the voice check (contract v2 §4): the share of intended words heard, on the
 *  space-insensitive alignment above — a SPACING segment («گلتلك» written «قلت لك») and a fold-equal variant are heard;
 *  a word heard with other letters («باچر» written «باسر») or not at all is missing. Never lower than the studio's
 *  word-level `scriptCoverage` (the sentence fold's view), so nothing that passed before fails now. English keeps
 *  `scriptCoverage`. */
export function arabicWordCoverage(reference: string, hypothesis: string): number {
  const blocks = alignWords(reference, hypothesis);
  const total = blocks.reduce((n, b) => n + b.ref.length, 0);
  if (total === 0) return 1;
  const missing = blocks.reduce((n, b) => n + (b.kind === 'ERROR' && !phraseFoldEqual(b) ? b.ref.length : 0), 0);
  return Math.max((total - missing) / total, scriptCoverage(reference, hypothesis, 'AR'));
}

/** «چ» CANNOT BE CONFIRMED BY ASR: in the Iraqi A/B it never came back as چ, ج or تش in 36 tries, a real Iraqi clip
 *  included. The substitution blocks whose intended words all carry چ (something was heard there, with other letters),
 *  and the hypothesis with exactly those blocks taken as heard — so the voice check can tell a line that fails only on
 *  چ-words (REVIEW, for a listener) from one that fails on other words too. A missing word is never forgiven. */
export function unconfirmableCh(reference: string, hypothesis: string): { blocks: WordDiff[]; forgiven: string } {
  const aligned = alignWords(reference, hypothesis);
  const isCh = (b: AlignedBlock) => b.kind === 'ERROR' && b.ref.length > 0 && b.hyp.length > 0 && !phraseFoldEqual(b) && b.ref.every((w) => w.includes('چ'));
  return {
    blocks: aligned.filter(isCh).map((b) => ({ kind: 'SUBSTITUTION' as const, ref: b.ref, hyp: b.hyp, letters: letterChanges(b.ref.join(''), b.hyp.join('')) })),
    forgiven: aligned.flatMap((b) => (isCh(b) ? b.ref : b.hyp)).join(' '),
  };
}
