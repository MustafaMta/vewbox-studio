import { normalizeIraqi } from '@/server/providers/speech';

/** SPACE-INSENSITIVE ARABIC COMPARISON — an evaluation view beside the studio's own metrics (`charErrorRate`,
 *  `scriptCoverage` in speech.ts), not a replacement. Whisper writes Iraqi speech with its own word boundaries
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

/** Align intended and heard words and classify every difference. Each word is folded on its own; the alignment is an
 *  edit distance whose cheap moves are a match (same folded word, free) and a SPACING segment (k intended words whose
 *  folded letters equal l heard words', k + l ≥ 3; the shortest such segment is taken); a substituted, missing or extra
 *  word is an error. Consecutive errors
 *  form one SUBSTITUTION / DELETION / INSERTION block; a match spelled differently before the fold is a VARIANT. */
export function wordDiff(reference: string, hypothesis: string): WordDiff[] {
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

  const out: WordDiff[] = [];
  let block: { ref: string[]; hyp: string[] } | null = null;
  const flush = () => {
    if (!block) return;
    const { ref, hyp } = block;
    if (ref.length && hyp.length) out.push({ kind: 'SUBSTITUTION', ref, hyp, letters: letterChanges(ref.join(''), hyp.join('')) });
    else if (ref.length) out.push({ kind: 'DELETION', ref, hyp });
    else out.push({ kind: 'INSERTION', ref, hyp });
    block = null;
  };
  for (const s of path) {
    const ref = R.slice(s.i, s.i + s.di); const hyp = H.slice(s.j, s.j + s.dj);
    if (s.kind === 'M') { flush(); if (ref[0] !== hyp[0]) out.push({ kind: 'VARIANT', ref, hyp, letters: letterChanges(ref[0], hyp[0]) }); continue; }
    if (s.kind === 'SP') { flush(); out.push({ kind: 'SPACING', ref, hyp }); continue; }
    block ??= { ref: [], hyp: [] };
    block.ref.push(...ref); block.hyp.push(...hyp);
  }
  flush();
  return out;
}
