/** WHAT THE BRIEF SAYS ABOUT THE LOOK IS KEPT (acceptance run 2026-10-05: an Auto character's design dropped the brief's
 *  "grey moustache" — the story model wrote salt-and-pepper hair and no facial hair, and the canonical image was drawn
 *  without it). The story model is asked to state facial hair exactly, but a request is not a guarantee: after the
 *  design comes back, every look feature the brief names (facial hair, eyewear, marks, a bald head, a head covering…)
 *  that no look field of the design mentions is carried over in the brief's own words — first among the distinguishing
 *  details, so the identity line and the canonical image carry it — and reported. Nothing is invented: only words the
 *  producer wrote. Pure. */

export interface LookFeature { id: string; words: RegExp }

/** The look features a brief may name, each with every way the design may say it. */
export const LOOK_FEATURES: readonly LookFeature[] = [
  { id: 'moustache', words: /\b(moustaches?|mustaches?|mustachioed)\b/i },
  { id: 'beard', words: /\b(beards?|bearded)\b/i },
  { id: 'goatee', words: /\bgoatees?\b/i },
  { id: 'stubble', words: /\b(stubble|stubbled|unshaven)\b/i },
  { id: 'sideburns', words: /\bsideburns?\b/i },
  { id: 'clean-shaven', words: /\bclean[- ]shaven\b/i },
  { id: 'glasses', words: /\b(glasses|spectacles|eyeglasses|sunglasses|monocle)\b/i },
  { id: 'eyepatch', words: /\beye[- ]?patch\b/i },
  { id: 'scar', words: /\bscars?(red)?\b/i },
  { id: 'tattoo', words: /\btattoo(s|ed)?\b/i },
  { id: 'freckles', words: /\bfreckle(s|d)?\b/i },
  { id: 'mole', words: /\b(mole|birthmark)\b/i },
  { id: 'bald', words: /\b(bald|balding|shaved head|shaven head)\b/i },
  { id: 'braid', words: /\b(braids?|braided|plaits?|ponytail|dreadlocks|bun)\b/i },
  { id: 'headwear', words: /\b(hijab|headscarf|turban|keffiyeh|kufiya|shemagh|ghutra|cap|hat|beret|veil)\b/i },
  { id: 'cane', words: /\b(cane|walking stick|crutch(es)?|wheelchair)\b/i },
  { id: 'piercing', words: /\b(piercings?|nose ring|earrings?)\b/i },
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

/** The design with the brief's look features it left out carried over (first among the distinguishing details, at
 *  most 6 of them), and which ones were. A feature the design names in any look field is left alone. */
export function keepBriefLook<T extends LookFields>(brief: string, design: T): { design: T; carried: string[] } {
  const look = [design.build, design.face, design.hair, design.skin, design.eyes, design.wardrobe, ...(design.distinguishing ?? [])].filter(Boolean).join(' \n ');
  const carried: string[] = [];
  for (const f of LOOK_FEATURES) {
    if (!f.words.test(brief) || f.words.test(look)) continue;
    const phrase = featurePhrase(brief, f);
    if (phrase && !carried.includes(phrase)) carried.push(phrase);
  }
  if (!carried.length) return { design, carried };
  const distinguishing = [...carried, ...(design.distinguishing ?? [])].slice(0, 6);
  return { design: { ...design, distinguishing }, carried };
}
