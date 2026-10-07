import type { LyricSection } from '@/domain/types';
import { normalizeArabic } from '../providers/speech';

/** LYRIC ALIGNMENT — the written lines of a song placed on the real vocal track. The vocal stem is transcribed with
 *  word timings; each lyric line is matched to the best-scoring run of transcript words in order (a monotone
 *  alignment: lines never cross), and takes that run's first and last word times. Sung words are mis-heard far more
 *  than spoken ones, so matching is fuzzy and a line that finds no credible run keeps an even spread inside its
 *  section instead of a wrong anchor. Section boundaries from the plan are respected as soft limits. */

export interface Word { start: number; end: number; word: string }
export interface AlignedLine { sectionId: string; index: number; text: string; textAr?: string; from: number; to: number; confidence: number; method: 'ALIGNED' | 'SPREAD' }

const norm = (s: string, lang: 'EN' | 'AR') => (lang === 'AR' ? normalizeArabic(s) : s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim());
const tokens = (s: string, lang: 'EN' | 'AR') => norm(s, lang).split(' ').filter(Boolean);

/** Similarity of two words: exact, or a shared prefix of at least three letters, or a small edit distance. */
function similar(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b.slice(0, 3)) || b.startsWith(a.slice(0, 3)))) return 0.7;
  const d = edit(a, b);
  const m = Math.max(a.length, b.length);
  return m > 0 && d / m <= 0.34 ? 0.6 : 0;
}
function edit(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = dp[0]; dp[0] = i; for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; } }
  return dp[b.length];
}

/** Score of matching `line` tokens against transcript words [i, i+len): mean best similarity in order. */
function runScore(line: string[], words: string[], i: number, len: number): number {
  let total = 0; let w = i;
  for (const tok of line) {
    let best = 0; let at = w;
    for (let k = w; k < i + len && k < w + 3; k++) { const s = similar(tok, words[k] ?? ''); if (s > best) { best = s; at = k; } }
    total += best; if (best > 0) w = at + 1;
  }
  return total / Math.max(1, line.length);
}

/** FORCED ALIGNMENT OF A SECTION'S KNOWN LYRICS (the asr service's /align: wav2vec2 CTC with WhisperX's trellis, on
 *  the vocal stem): the words come back in script order, one per whitespace token holding a letter or a digit
 *  (`scriptWords`), so each written line owns the next `n` of them. A line is timed from its first to its last ALIGNED
 *  word; a line with fewer than half of its words aligned keeps no CTC time (undefined: the transcript match or the
 *  spread stays). Pure, tested. */
export function linesFromForcedAlignment(lines: string[], words: Array<{ start: number | null; end: number | null; aligned: boolean }>, wordsOf: (line: string) => string[]): Array<{ from: number; to: number; aligned: number; total: number } | undefined> {
  const out: Array<{ from: number; to: number; aligned: number; total: number } | undefined> = [];
  let k = 0;
  for (const line of lines) {
    const n = wordsOf(line).length;
    const mine = words.slice(k, k + n);
    k += n;
    const ok = mine.filter((w) => w.aligned && w.start !== null && w.end !== null);
    if (!n || ok.length * 2 < n) { out.push(undefined); continue; }
    out.push({ from: Math.min(...ok.map((w) => w.start!)), to: Math.max(...ok.map((w) => w.end!)), aligned: ok.length, total: n });
  }
  return out;
}

export function alignLyrics(sections: LyricSection[], words: Word[], lang: 'EN' | 'AR'): AlignedLine[] {
  const out: AlignedLine[] = [];
  const wtok = words.map((w) => norm(w.word, lang));
  let cursor = 0; // transcript words are consumed in order
  const hasWords = (s: LyricSection) => Boolean(((lang === 'AR' ? s.textAr || s.text : s.text) || '').trim());
  for (const [k, sec] of sections.entries()) {
    // a window reaches over the wordless sections after it (an outro, a break) up to the next sung section: no other
    // lyrics compete for those words, and a singer who runs into the planned outro is still found (Harbour Lights' last
    // line, sung at 86 s of a chorus planned to end at 84)
    const next = sections.slice(k + 1).find(hasWords);
    const end = next ? next.from : Math.max(sec.to, ...sections.slice(k + 1).map((s) => s.to));
    const source = (lang === 'AR' ? sec.textAr || sec.text : sec.text) || '';
    const lines = source.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const en = sec.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const span = Math.max(0.001, sec.to - sec.from) / Math.max(1, lines.length);
    // only words that fall inside (a padded) section window are candidates
    const lo = Math.max(cursor, words.findIndex((w) => w.end >= sec.from - 1.5));
    const hi = (() => { const j = words.findIndex((w) => w.start > Math.max(sec.to, end) + 1.5); return j < 0 ? words.length : j; })();
    let local = Math.max(0, lo);
    lines.forEach((text, i) => {
      const toks = tokens(text, lang);
      let best = { score: 0, i: -1, len: 0 };
      for (let s = local; s < hi; s++) {
        for (let len = Math.max(1, toks.length - 2); len <= toks.length + 3 && s + len <= hi; len++) {
          const sc = runScore(toks, wtok, s, len);
          if (sc > best.score + 1e-9) best = { score: sc, i: s, len };
        }
        if (best.score >= 0.95) break;
      }
      const spreadFrom = sec.from + span * i, spreadTo = sec.from + span * (i + 1);
      if (best.i >= 0 && best.score >= 0.5 && toks.length >= 2) {
        const from = words[best.i].start, to = words[Math.min(words.length - 1, best.i + best.len - 1)].end;
        out.push({ sectionId: sec.id, index: i, text: en[i] ?? text, textAr: lang === 'AR' ? text : undefined, from, to: Math.max(to, from + 0.3), confidence: best.score, method: 'ALIGNED' });
        local = best.i + best.len; cursor = local;
      } else out.push({ sectionId: sec.id, index: i, text: en[i] ?? text, textAr: lang === 'AR' ? text : undefined, from: spreadFrom, to: spreadTo, confidence: best.score, method: 'SPREAD' });
    });
  }
  // lines never overlap or run backwards: a later line starts no earlier than the previous one ends
  for (let k = 1; k < out.length; k++) if (out[k].from < out[k - 1].to) { out[k].from = out[k - 1].to; if (out[k].to < out[k].from + 0.3) out[k].to = out[k].from + 0.3; }
  return out;
}
