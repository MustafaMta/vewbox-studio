/** A SCAR IS DRAWN HEALED (2026-10-08: "a small healed scar on his left eyebrow" drew Marcus Bell a fresh red cut, and the
 *  same words drew Elena Ward a bleeding gash — 2 of 2): a detail naming a scar says what a healed one looks like, unless
 *  it says the wound is fresh. Used by every picture and every video prompt that describes a person. Pure (tested). */
export function healedMark(d: string): string {
  if (!/\bscar(s|red)?\b/i.test(d) || /\b(fresh|new|bleeding|open|raw|recent)\b/i.test(d) || /fully healed scar/i.test(d)) return d;
  return `${d.replace(/[.;]+$/, '')} (an old, fully healed scar: a thin pale flat line, the skin closed, no redness, no blood, no cut)`;
}

/** A whole description with every scar clause drawn healed (clauses split at ';' and ','): a line stored before
 *  `healedMark` existed drew a fresh cut on both faces of "The Relief" 1.7's first frame and of 1.8's video. Pure. */
export function healedLine(line: string): string {
  // split at ';' and ',' outside parentheses only: the healed clause itself holds commas, and a second pass must not
  // find a scar in it again (idempotent)
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ';' || ch === ',')) {
      let sep = ch;
      while (line[i + 1] === ' ') { sep += ' '; i++; }
      parts.push(cur, sep); cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((part, k) => (k % 2 ? part : healedMark(part))).join('');
}

/** Whether anyone described carries a scar that must stay healed (then a prompt says no fresh wounds). Pure. */
export const hasHealedScar = (texts: Array<string | undefined>): boolean => texts.some((t) => Boolean(t) && /\bscar(s|red)?\b/i.test(t!) && !/\b(fresh|bleeding|open|raw)\b/i.test(t!));
