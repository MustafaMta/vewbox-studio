import { healedMark } from './scars';

/** THE NEUTRAL IDENTITY (producer, 2026-10-09: "canonical appearance should be emotionally neutral … distinguish a
 *  permanent distinguishing feature from a temporary physical condition"). The design model is told this, and still
 *  wrote "a warm, approachable expression" and "eyes crinkling when he laughs" into a face (Marcus Bell, before the
 *  rule): a picture drawn from those words smiles in every shot. So after the model answers:
 *  - a clause of a LOOK field (face, eyes, hair, skin, build) that describes an expression, a mood or a habit moves to
 *    the personality;
 *  - a DISTINGUISHING detail that is a temporary condition (a fresh cut, a bruise, wet, a bandage, blood) is not part of
 *    the identity — it is dropped and reported (a scene gives a person a condition, not the identity);
 *  - a scar is a permanent feature and is stored as a healed one (src/domain/scars.ts). Pure. */

// "laughter lines" and "smile lines" are wrinkles — physical, kept; "laughs", "smiling" are expressions
const EXPRESSION = /\b(smil(e|es|ing)\b(?! lines)|grin\w*|laugh(s|ing)?\b|frown\w*|scowl\w*|express\w*|approachable|friendly|warm(ly)?|kind(ly)?|stern|angry|anger|sad(ly|ness)?|worried|anxious|cheerful|joyful|happy|serious look|mood|crinkl\w* when|when (he|she|they) (smiles|laughs|talks|speaks))\b/i;
// a piece that IS an expression (a noun or verb of one), not merely a physical piece with a mood adjective on it
const PIECE_EXPRESSION = /\b(smil(e|es|ing)\b(?! lines)|grin\w*|laugh(s|ing)?\b|frown\w*|scowl\w*|crinkl\w*|expression|expressive|approachable|friendly|mood|kind(ly)?$)|^\s*(often|usually|always)\b|^\s*(a |an )?(warm|kind|stern|cheerful|serious)\s*$/i;
// a mood adjective in front of a physical noun
const MOOD_WORD = /\b(warm|kind|friendly|stern|cheerful|gentle|sad|angry|worried)\b,?\s*/gi;
const TEMPORARY =/\b(fresh|bleeding|blood(y|ied)?|bruis\w*|swollen|wet|soaked|drenched|bandag\w*|plaster|stitch\w*|scab\w*|open wound|cut lip|black eye|sweat\w*|tear-stained|muddy)\b/i;
const LOOK_FIELDS = ['face', 'eyes', 'hair', 'skin', 'build'] as const;

/** A scar as the IDENTITY stores it: the word "healed" in its own words ("a thin scar through the left eyebrow" →
 *  "a thin healed scar through the left eyebrow"), within the 120 characters a distinguishing detail may have. The
 *  full drawing instruction (`healedMark`: "an old, fully healed scar: a thin pale flat line …") is added where a
 *  picture or a video is described, never stored — stored, it made a detail too long for the character record and
 *  Phase 1 character A's design was refused (2026-10-09, job-5f1863dfdd). */
export function healedWord(d: string, max = 120): string {
  if (/\bhealed\b/i.test(d) || healedMark(d) === d) return d;
  const h = d.replace(/\bscar(s|red)?\b/i, (w) => `healed ${w}`);
  return h.length <= max ? h : d;
}

export interface NeutralLookReport { movedToPersonality: string[]; droppedConditions: string[]; healed: string[] }

const clauses = (s: string) => s.split(/(?<=[.;])\s+|,\s+(?=(?:and |with |but )?[a-z])/i).map((x) => x.trim()).filter(Boolean);

export function neutralLook<T extends Partial<Record<(typeof LOOK_FIELDS)[number], string>> & { distinguishing?: string[]; personality?: string }>(d: T): { design: T; report: NeutralLookReport } {
  const report: NeutralLookReport = { movedToPersonality: [], droppedConditions: [], healed: [] };
  const out: T = { ...d };
  for (const k of LOOK_FIELDS) {
    const v = d[k];
    if (typeof v !== 'string' || !v.trim()) continue;
    const moved: string[] = [];
    // clause by clause, and inside a clause piece by piece (split at with / and / but / despite): only the pieces that
    // describe an expression go — "Round and friendly with apple-cheeks" keeps "Round with apple-cheeks"
    const kept = clauses(v).map((raw) => {
      let clause = raw.replace(/[.;,]+$/, '');
      if (!EXPRESSION.test(clause)) return clause;
      // 1. a trailing tail that describes an expression ("… that are expressive and kind", "often crinkling … when he
      //    smiles", "despite his formal attire" after an expression)
      const tail = /\s+(that|which|often|despite|when|as)\s+.*$/i.exec(clause);
      if (tail && EXPRESSION.test(tail[0])) { moved.push(tail[0].trim()); clause = clause.slice(0, tail.index); }
      // 2. the pieces that are expressions
      const bits = clause.split(/(\s+(?:with|and|but|despite)\s+)/i);
      const out: string[] = [];
      let droppedPrev = false;
      for (let i = 0; i < bits.length; i += 2) {
        const piece = bits[i];
        // a "despite …" after a dropped expression belongs to it ("an approachable expression despite his attire")
        const despite = i > 0 && /despite/i.test(bits[i - 1]);
        if (PIECE_EXPRESSION.test(piece) || (despite && droppedPrev)) { moved.push(piece.trim()); droppedPrev = true; continue; }
        droppedPrev = false;
        if (out.length && i > 0) out.push(bits[i - 1]);
        out.push(piece);
      }
      // 3. a mood adjective left on a physical noun ("Warm brown eyes" → "brown eyes")
      return out.join('').replace(MOOD_WORD, (w) => { moved.push(w.trim()); return ''; }).replace(/\s+/g, ' ').replace(/^(and|with|but|despite)\s+/i, '').trim();
    }).filter((x) => x && /\w/.test(x) && !/^(a|an|the|and|with)$/i.test(x));
    if (moved.length && kept.length) {
      const first = kept.join(', ').replace(/\s+/g, ' ').trim();
      (out as Record<string, unknown>)[k] = first.charAt(0).toUpperCase() + first.slice(1);
      report.movedToPersonality.push(...moved.filter((m) => m && /\w/.test(m)));
    }
  }
  if (report.movedToPersonality.length) out.personality = [d.personality?.trim().replace(/[.;]+$/, ''), ...report.movedToPersonality.map((m) => m.replace(/[.;]+$/, ''))].filter(Boolean).join('; ');
  if (Array.isArray(d.distinguishing)) {
    out.distinguishing = d.distinguishing.flatMap((x) => {
      if (/\bscar(s|red)?\b/i.test(x) && !/\b(fresh|bleeding|open)\b/i.test(x)) { const h = healedWord(x); if (h !== x) report.healed.push(x); return [h]; }
      if (TEMPORARY.test(x)) { report.droppedConditions.push(x); return []; }
      return [x];
    });
  }
  return { design: out, report };
}
