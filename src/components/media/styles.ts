import type { Style } from '@/domain/vocabulary';

/** The three looks in words: the name and one line (the style picker, slates, summaries). A plain module, so server
 *  code may read it too. */
export const STYLE_WORDS: Record<Style, { label: string; hint: string }> = {
  CARTOON: { label: 'Cartoon', hint: 'Bold and warm' },
  ANIME: { label: 'Anime', hint: 'Clean lines, painted skies' },
  REALISTIC: { label: 'Realistic', hint: 'Cinematic light' },
};
