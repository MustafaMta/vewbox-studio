import { iraqiNumberWords, westernDigits } from '@/server/providers/iraqi-text';

/** THE TRAINING TRANSCRIPT NORMALISATION (the producer's master directive §9): the original transcript is kept on the
 *  record untouched; this derives the form the model is trained on. It NEVER touches the dialect letters (چ گ پ ڤ) or the
 *  spelling of a word — only whitespace, punctuation spacing, invisible marks, tatweel, and digits (spelled the Baghdadi
 *  way, as the studio's line preparation does for the engines). Diacritics (tashkeel) are removed: the corpus is not
 *  consistently vocalised and a model trained on mixed vocalisation learns noise. Pure. */
export function normaliseIraqi(text: string): string {
  let t = westernDigits(text);
  t = t.replace(/[ـ​-‏‪-‮﻿]/g, '');          // tatweel, zero-width and bidi marks
  t = t.replace(/[ً-ْٰ]/g, '');                               // tashkeel
  t = t.replace(/\d+/g, (d) => iraqiNumberWords(Number(d)));
  t = t.replace(/\s*([،,؛;:!؟?.])\s*/g, '$1 ').replace(/\s+/g, ' ').trim();  // one space after punctuation
  return t;
}
