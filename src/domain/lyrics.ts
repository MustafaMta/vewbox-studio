import type { LyricSection } from './types';
import { nid } from './ids';

/** Lyrics typed with blank lines between sections become timed sections spread evenly over the song. Section tags
 *  (`[verse]`, `[chorus]`, …) are read when present; Arabic text goes to `textAr`. Shared by the wizard, the song
 *  editor and the story engine. */
export function splitLyrics(text: string, total: number): LyricSection[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const n = Math.max(blocks.length, 1); const each = total / n;
  return blocks.map((b, i) => {
    const m = /^\[(intro|verse|pre[- ]?chorus|chorus|bridge|outro|instrumental)\]\s*/i.exec(b);
    const kind = (m ? m[1].toUpperCase().replace(/[- ]/g, '_') : 'VERSE') as LyricSection['kind'];
    const body = m ? b.slice(m[0].length) : b;
    const isAr = /[؀-ۿ]/.test(body);
    return { id: nid('sec'), kind, text: isAr ? '' : body, textAr: isAr ? body : undefined, singerIds: [], from: Math.round(i * each), to: Math.round((i + 1) * each) };
  });
}

/** Lyrics as a music engine expects them: one tagged block per section. */
export function joinLyrics(sections: LyricSection[]): string {
  const tag: Record<LyricSection['kind'], string> = { INTRO: '[Intro]', VERSE: '[Verse]', PRE_CHORUS: '[Pre-Chorus]', CHORUS: '[Chorus]', BRIDGE: '[Bridge]', OUTRO: '[Outro]', INSTRUMENTAL: '[Instrumental]' };
  return sections.map((s) => `${tag[s.kind]}\n${(s.textAr || s.text || '').trim()}`.trim()).join('\n\n');
}
