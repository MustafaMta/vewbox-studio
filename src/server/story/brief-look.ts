/** WHAT THE BRIEF SAYS ABOUT THE LOOK IS KEPT, IN THE RIGHT FIELD (acceptance run 2026-10-05: an Auto character's
 *  design dropped the brief's "grey moustache"; 2026-10-06: a realistic design carried a "grey handlebar moustache" in
 *  its WARDROBE). The story model is asked to state facial hair exactly, but a request is not a guarantee. After the
 *  design comes back:
 *  - a feature of the BODY (facial hair, eyewear, marks, tattoos, a bald head, braids, piercings…) never lives in the
 *    wardrobe: a wardrobe clause that names one is taken out of the wardrobe and moved to the face (facial hair) or the
 *    distinguishing details (the rest);
 *  - a feature the brief names that no look field mentions is carried over in the producer's own words — facial hair
 *    into the face description, the rest first among the distinguishing details (headwear and a cane are worn or
 *    carried, so a wardrobe mention of them counts);
 *  so the identity line and the canonical image carry it. Nothing is invented: only words the producer or the design
 *  wrote. Pure. */

export type LookPlace = 'FACE' | 'DISTINGUISHING' | 'WORN';
export interface LookFeature { id: string; words: RegExp; place: LookPlace }

/** The look features a brief may name, each with every way the design may say it, and where it belongs. */
export const LOOK_FEATURES: readonly LookFeature[] = [
  { id: 'moustache', words: /\b(moustaches?|mustaches?|mustachioed)\b/i, place: 'FACE' },
  { id: 'beard', words: /\b(beards?|bearded)\b/i, place: 'FACE' },
  { id: 'goatee', words: /\bgoatees?\b/i, place: 'FACE' },
  { id: 'stubble', words: /\b(stubble|stubbled|unshaven)\b/i, place: 'FACE' },
  { id: 'sideburns', words: /\bsideburns?\b/i, place: 'FACE' },
  { id: 'clean-shaven', words: /\bclean[- ]shaven\b/i, place: 'FACE' },
  { id: 'glasses', words: /\b(glasses|spectacles|eyeglasses|sunglasses|monocle)\b/i, place: 'DISTINGUISHING' },
  { id: 'eyepatch', words: /\beye[- ]?patch\b/i, place: 'DISTINGUISHING' },
  { id: 'scar', words: /\bscars?(red)?\b/i, place: 'DISTINGUISHING' },
  { id: 'tattoo', words: /\btattoo(s|ed)?\b/i, place: 'DISTINGUISHING' },
  { id: 'freckles', words: /\bfreckle(s|d)?\b/i, place: 'DISTINGUISHING' },
  { id: 'mole', words: /\b(mole|birthmark)\b/i, place: 'DISTINGUISHING' },
  { id: 'bald', words: /\b(bald|balding|shaved head|shaven head)\b/i, place: 'DISTINGUISHING' },
  { id: 'braid', words: /\b(braids?|braided|plaits?|ponytail|dreadlocks|bun)\b/i, place: 'DISTINGUISHING' },
  { id: 'piercing', words: /\b(piercings?|nose ring)\b/i, place: 'DISTINGUISHING' },
  { id: 'headwear', words: /\b(hijab|headscarf|turban|keffiyeh|kufiya|shemagh|ghutra|cap|hat|beret|veil)\b/i, place: 'WORN' },
  { id: 'cane', words: /\b(cane|walking stick|crutch(es)?|wheelchair)\b/i, place: 'WORN' },
];

/** The clause of the brief that names a feature, in the producer's words ("a grey moustache"). */
export function featurePhrase(brief: string, f: LookFeature): string | undefined {
  // clauses: a comma, semicolon or full stop, or the words that join one look detail to the next
  const clauses = brief.split(/[,;.:!?()]|\s+(?:with|and|who|while|but|plus|wearing|has|having)\s+/i).map((c) => c.trim()).filter(Boolean);
  const hit = clauses.find((c) => f.words.test(c));
  if (!hit) return undefined;
  // the clause around the feature's word: up to five words before it and five after (the description, not the sentence)
  const ws = hit.split(/\s+/);
  const at = ws.findIndex((w) => f.words.test(w.replace(/[^\p{L}-]/gu, ' ')));
  const end = at < 0 ? ws.length : Math.min(ws.length, at + 6);
  const start = Math.max(0, (at < 0 ? ws.length : at) - 5);
  return ws.slice(start, end).join(' ').replace(/^(in|of|from)\s+/i, '').trim() || undefined;
}

export interface LookFields { build?: string; face?: string; hair?: string; skin?: string; eyes?: string; distinguishing?: string[]; wardrobe?: string }

const BODY = LOOK_FEATURES.filter((f) => f.place !== 'WORN');
/** The wardrobe's clauses (", " "; " " and "), each a garment or an accessory. */
const wardrobeClauses = (w: string) => w.split(/\s*[;,]\s*|\s+and\s+/i).map((c) => c.trim()).filter(Boolean);
const joinWardrobe = (cs: string[]) => (cs.length <= 1 ? cs.join('') : `${cs.slice(0, -1).join(', ')} and ${cs[cs.length - 1]}`);
const addToFace = (face: string | undefined, phrase: string) => (face?.trim() ? `${face.trim().replace(/[.;,]$/, '')}; ${phrase}` : phrase);

/** The design with every body feature in a look field (moved out of the wardrobe, or carried over from the brief), and
 *  which features were `carried` (from the brief) or `moved` (out of the wardrobe). At most 6 distinguishing details. */
export function keepBriefLook<T extends LookFields>(brief: string, design: T): { design: T; carried: string[]; moved: string[] } {
  let face = design.face;
  let distinguishing = [...(design.distinguishing ?? [])];
  let wardrobe = design.wardrobe;
  const moved: string[] = [];
  // 1) a body feature in the wardrobe moves to its own field (the wardrobe keeps its garments)
  if (wardrobe) {
    const keep: string[] = [];
    for (const c of wardrobeClauses(wardrobe)) {
      const f = BODY.find((x) => x.words.test(c));
      if (!f) { keep.push(c); continue; }
      moved.push(c);
      if (f.place === 'FACE') face = addToFace(face, c); else distinguishing = [c, ...distinguishing];
    }
    if (moved.length) wardrobe = joinWardrobe(keep);
  }
  // 2) a feature the brief names that no look field mentions is carried over in the brief's words
  const lookOf = (place: LookPlace) => [design.build, face, design.hair, design.skin, design.eyes, ...distinguishing, ...(place === 'WORN' ? [wardrobe] : [])].filter(Boolean).join(' \n ');
  const carried: string[] = [];
  for (const f of LOOK_FEATURES) {
    if (!f.words.test(brief) || f.words.test(lookOf(f.place))) continue;
    const phrase = featurePhrase(brief, f);
    if (!phrase || carried.includes(phrase)) continue;
    carried.push(phrase);
    if (f.place === 'FACE') face = addToFace(face, phrase); else distinguishing = [phrase, ...distinguishing];
  }
  if (!carried.length && !moved.length) return { design, carried, moved };
  return { design: { ...design, face, wardrobe, distinguishing: distinguishing.slice(0, 6) }, carried, moved };
}
