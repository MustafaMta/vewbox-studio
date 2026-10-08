import type { Character } from '@/domain/types';
import type { Style } from '@/domain/vocabulary';
import { MODELS, seed32, type Graph } from './index';
import { editModel, faceCheck, FACE_CHECK_OUTPUTS, SECONDARY_SPEC, type SecondaryMaterialKind } from './qwen-image';

/** THE CANONICAL CHARACTER IMAGE — one front full-body figure per character (docs/CONTRACTS-IDENTITY-PACK.md v2),
 *  drawn with the installed Qwen stack: Qwen-Image-2512 from the English identity line (Auto, Manual), or
 *  Qwen-Image-Edit-2511 from the producer's uploaded picture (Image Reference), whose identity line is written from a
 *  description of the picture by Qwen3.5-4B inside core ComfyUI (`TextGenerate`) — never invented.
 *  What the wave-2 portraits got wrong and this module fixes (evidence: docs/evidence/image-v2/REPORT.md):
 *  - the medium is the first words of the prompt, so a Cartoon character is a CG render, not a studio photograph;
 *  - the identity line is English (non-Latin pieces are reported, never sent to the model) and states style and age;
 *  - the framing is a whole standing figure, head to feet with margin, on a plain background (one frame, 928×1664);
 *  - a front view says where the character's own left and right are in the picture, so side-specific details land on
 *    the correct side.
 *  Pure builders and parsers: the worker uploads, runs and reads the named output nodes. `MODELS` is read inside the
 *  functions only (this module is re-exported by ./index). */

// ------------------------------------------------------------------------------------------------ text helpers

const squash = (s?: string | null | false) => (s || '').replace(/\s+/g, ' ').trim();

/** Keep sentence boundaries: every piece ends with a full stop (or its own : ! ?) before the next one starts. */
export function sentences(parts: Array<string | undefined | null | false>): string {
  return parts.map(squash).filter(Boolean).map((p) => (/[.!?:]$/.test(p) ? p : `${p}.`)).join(' ');
}

/** True when the text contains a letter outside the Latin script (Arabic, Cyrillic, CJK…). Qwen-Image reads English
 *  and Chinese; an Arabic identity line reached the model verbatim in wave 2. */
export const hasNonLatinLetters = (s: string) => /(?=\p{L})\P{Script=Latin}/u.test(s);

const CYRILLIC_TO_LATIN: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const GREEK_TO_LATIN: Record<string, string> = { α: 'a', β: 'b', ε: 'e', η: 'h', ι: 'i', κ: 'k', μ: 'm', ν: 'n', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x' };

/** Repair an English field the design model wrote with stray letters from another alphabet (found 2026-10-03:
 *  "deshdaша" — a garment word with two Cyrillic letters — made the whole wardrobe vanish from the identity line).
 *  A word that is Latin with Cyrillic/Greek letters mixed in is transliterated letter by letter; a word wholly in
 *  another script (Arabic, CJK…) cannot be repaired here and is dropped AND reported — never the whole field. */
export function latinizeField(text: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const words = text.split(/(\s+)/).map((w) => {
    if (!hasNonLatinLetters(w)) return w;
    const mixed = /\p{Script=Latin}/u.test(w);
    const onlyCyrGreek = !/(?=\p{L})[^\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u.test(w);
    if (mixed && onlyCyrGreek) return [...w].map((ch) => { const lo = ch.toLowerCase(); const t = CYRILLIC_TO_LATIN[lo] ?? GREEK_TO_LATIN[lo]; return t === undefined ? ch : ch === lo ? t : t.charAt(0).toUpperCase() + t.slice(1); }).join('');
    dropped.push(w);
    return '';
  });
  return { text: words.join('').replace(/\s{2,}/g, ' ').replace(/\s+([,;.])/g, '$1').trim(), dropped };
}

// ----------------------------------------------------------------------------------------------- per style

/** The first words of every canonical prompt (the medium before anything else), the medium as a noun phrase for the
 *  Image Reference redraw, the style noun that starts the identity line, and the "not this medium" words (effective
 *  in quality mode, where cfg > 1). */
export const STYLE_MEDIUM: Record<Style, { lead: string; noun: string; identity: string; negative: string }> = {
  CARTOON: {
    lead: '3D animated feature-film character design, stylized CG render, not a photograph:',
    noun: 'a stylized 3D animated feature-film character (CG render, not a photograph)',
    identity: 'stylized 3D animated character',
    negative: 'photograph, photorealistic, live-action, real person, realistic skin pores',
  },
  // "Japanese anime" named with what makes it anime (D10, docs/evidence/flux-vs-qwen/anime): with "2D anime …" alone
  // Qwen drew the courier as a western comic (2/2 → 0/2 with this wording) and klein redrew photos as a western flat
  // cartoon (4/4 → 1/4)
  ANIME: {
    lead: 'Japanese anime character design, drawn like a modern Japanese TV anime: large expressive anime eyes with highlights, small simple nose and mouth, thin clean line art, cel shading with hard-edged two-tone shadows, flat colours, not a photograph, not 3D:',
    noun: 'a Japanese anime character, drawn like a modern Japanese TV anime (anime character design: large expressive anime eyes with highlights, small simple nose and mouth, thin clean line art, cel shading with hard-edged two-tone shadows, flat colours, not 3D)',
    identity: 'Japanese anime character',
    negative: 'photograph, photorealistic, 3D render, CG, realistic skin texture, real person',
  },
  REALISTIC: {
    lead: 'Photorealistic full-length studio photograph of a real person, 50 mm lens:',
    noun: 'a photorealistic full-length studio photograph of a real person',
    identity: 'photorealistic real person',
    negative: 'illustration, cartoon, anime, 3D render, CG, painting, plastic skin',
  },
};

/** The wave-2 negative plus the style's own "not this medium" words. */
export const negativeFor = (style: Style) => `text, lettering, watermark, logo, brand mark, trademark, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head, cropped feet, ${STYLE_MEDIUM[style].negative}`;

// --------------------------------------------------------------------------------------- English identity line

export type IdentitySource = Pick<Character, 'hair' | 'eyes' | 'skin' | 'build' | 'distinguishing' | 'wardrobe'> & Partial<Pick<Character, 'ageYears' | 'sex' | 'species' | 'face'>> & { canon?: Character['canon'] };

export interface CanonicalIdentityLine {
  /** "Identity: stylized 3D animated character, a woman of about 35; …." — Latin script only ('' when nothing is known) */
  line: string;
  /** pieces left out because they are not in Latin script: translate them (story engine) and store an English
   *  `canon.identityLine`, or refuse to draw with this list as the reason — never send them to the image model */
  nonLatin: string[];
  /** whether the line states the age */
  hasAge: boolean;
}

const AGE_WORDS = /\b(about|around|aged?|approximately)\s+\d{1,3}\b|\b\d{1,3}\s*(-\s*)?(years?|yrs?|year-old)\b|\b(baby|toddler|child|kid|teen(age(d|r)?)?|adolescent|elderly|old|young|middle-aged|in (his|her|their) (twenties|thirties|forties|fifties|sixties|seventies|eighties))\b/i;

/** "a woman of about 35", "a teenage boy of about 15", "a cat" — the age and sex words every prompt needs (wave 2 had
 *  none, and a woman of 35 was redrawn as a teenager). */
export function whoPhrase(c: Partial<Pick<Character, 'ageYears' | 'sex' | 'species'>>): string {
  const species = squash(c.species);
  if (species && !/^(human|person|people)$/i.test(species)) return `a ${species}`;
  const age = Number(c.ageYears);
  const known = Number.isFinite(age) && age > 0;
  const noun = c.sex === 'FEMALE' ? (known && age < 13 ? 'girl' : known && age < 18 ? 'teenage girl' : 'woman') : c.sex === 'MALE' ? (known && age < 13 ? 'boy' : known && age < 18 ? 'teenage boy' : 'man') : (known && age < 13 ? 'child' : known && age < 18 ? 'teenager' : 'person');
  return known ? `a ${noun} of about ${Math.round(age)}` : `a ${noun}`;
}

// ------------------------------------------------------------------- details stated unambiguously (D13)

const MOUSTACHE = /\b(mo?ustach(?:e|es|ioed)|mustachio(?:ed)?)\b/i;
const BEARD = /\b(beard(?:ed|s)?|goatee|stubble|sideburns?|whiskers|chin ?strap)\b/i;
const NO_BEARD = /\b(?:no|without|never)\s+(?:a\s+|any\s+)?(?:beard|stubble|goatee)\b|\bbeardless\b|\bclean[- ]shaven\s+(?:chin|jaw|cheeks?)\b/gi;
const CLEAN_SHAVEN = /\bclean[- ]shaven\b/i;
const ALREADY_EXPLICIT = /\bclean[- ]shaven\s+(?:chin|jaw|cheeks?)\b|\bno beard\b|\bno (?:beard,? )?(?:and )?no mo?ustache\b|\bshaved smooth\b/i;

/** The facial hair stated so it cannot be read two ways (D13: a "thick, gray mustache" was drawn as a full beard in 2
 *  of 2 realistic draws): a moustache without a beard → "facial hair: <the moustache> only, clean-shaven chin, jaw and
 *  cheeks, no beard"; clean-shaven → "clean-shaven: no beard, no moustache". A beard, a text that already says it,
 *  or nothing about facial hair → undefined (nothing is invented). */
export function facialHairStatement(texts: Array<string | undefined | null>): string | undefined {
  const all = texts.filter(Boolean).join('; ');
  if (!all || ALREADY_EXPLICIT.test(all)) return undefined;
  const beard = BEARD.test(all.replace(NO_BEARD, ' '));
  const moustache = MOUSTACHE.test(all);
  if (moustache && !beard) {
    const clause = all.split(/[;.]/).find((s) => MOUSTACHE.test(s)) ?? '';
    const m = /((?:[\w'-]+,?\s+){0,4})(mo?ustach(?:e|es|ioed)|mustachio(?:ed)?)/i.exec(clause);
    const words = (m ? squash(`${m[1]}${m[2]}`) : 'moustache').split(' ');
    // the moustache's own words only: what follows the last connecting word ("with a neat black moustache" → "neat black moustache")
    const stop = words.reduce((at, w, k) => (/^(with|from|and|has|wears|wearing|of|in|on|under|over|by|a|an|the|his|her|their)$/i.test(w.replace(/,$/, '')) ? k : at), -1);
    const phrase = words.slice(stop + 1).join(' ');
    return `facial hair: ${phrase} only; the chin, jaw and cheeks are shaved smooth`;
  }
  if (CLEAN_SHAVEN.test(all) && !moustache && !beard) return 'clean-shaven: the chin, jaw, cheeks and upper lip are shaved smooth';
  return undefined;
}

/** Robes whose cut a model does not know by name (Arabic and North African garments). */
const ROBE = /\b(dishdashas?|dishdash|deshdashas?|dishdasheh|thobes?|thawbs?|thoub|kanduras?|kandouras?|kandooras?|jalabiyas?|jallabiyas?|jellabiyas?|galabeyas?|galabiyas?|gallabiyas?|jilbabs?|djellabas?|abayas?)\b/i;
const ANKLE = /\b(?:ankle|floor)[- ]?(?:length|long)\b|\bto the (?:ankles|floor)\b|\breach(?:es|ing)? (?:down )?to the (?:ankles|floor)\b/i;
const OTHER_LENGTH = /\b(?:knee|calf|mid-calf|thigh|hip|waist)[- ]?(?:length|long)?\b|\b(?:short|cropped)\b/i;
const TROUSERS = /\b(trousers|pants|slacks|jeans|sirwal)\b/i;

/** A culturally specific garment's cut stated in the same words (D13: an Iraqi dishdasha was drawn tunic-length, over
 *  visible patterned trousers): a robe of the dishdasha family or an abaya with no length given becomes "ankle-length
 *  <robe> (…reaching down to the ankles)", and trousers listed with an ankle-length robe are said to be worn under
 *  it. A length the text gives is kept; every other word is kept exactly. Idempotent. */
export function garmentCut(wardrobe: string): string {
  let over: 'robe' | 'cloak' | undefined;
  const clauses = wardrobe.split(/\s*;\s*/).map((cl) => {
    const m = ROBE.exec(cl);
    if (!m) return cl;
    const kind = /abaya/i.test(m[1]) ? 'cloak' : 'robe';
    if (ANKLE.test(cl)) { over = kind; return cl; }
    if (OTHER_LENGTH.test(cl)) return cl;
    over = kind;
    return `${cl.slice(0, m.index)}ankle-length ${m[1]} (a loose ${kind} reaching down to the ankles)${cl.slice(m.index + m[1].length)}`;
  });
  if (over && TROUSERS.test(wardrobe) && !/\bunder the (?:robe|cloak|dishdasha|thobe|abaya)\b/i.test(wardrobe)) clauses.push(`the trousers are worn under the ${over} and show only at the ankles`);
  return clauses.join('; ');
}

/** One look field as a piece of the line: its own inner semicolons become commas (the line's pieces are separated by
 *  "; "), a short value takes its noun after it ("dark brown eyes"), a value that already names it stays as written,
 *  and a long one is labelled ("eyes: dark brown, sharp but kind, …") — never "…that never fades eyes". */
export function lookPiece(value: string | undefined, noun: string): string {
  const v = squash(value).replace(/\s*;\s*/g, ', ').replace(/[.,;]+$/, '');
  if (!v) return '';
  if (new RegExp(`\\b${noun}\\b`, 'i').test(v)) return v;
  return !/,/.test(v) && v.split(/\s+/).length <= 4 ? `${v} ${noun}` : `${noun}: ${v}`;
}

/** The English identity line (contract §2.1: style first, then age, build, face, hair, skin, every garment with its
 *  colour, accessories with their side of the body, footwear). A stored English line wins (with the style and, when
 *  it has none, the age added); a stored line in another script is reported in `nonLatin` and the line is derived from
 *  the fields, whose non-Latin pieces are reported too. Facial hair and a culturally specific garment's cut are stated
 *  unambiguously (D13: `facialHairStatement`, `garmentCut`). Deterministic and de-duplicated. */
export function canonicalIdentityLine(c: IdentitySource, opts: { style?: Style } = {}): CanonicalIdentityLine {
  const nonLatin: string[] = [];
  const who = whoPhrase(c);
  const lead = opts.style ? `${STYLE_MEDIUM[opts.style].identity}, ` : '';
  const stored = healedMark(squash(c.canon?.identityLine).replace(/^identity:\s*/i, '').replace(/[.;]+$/, ''));
  if (stored && !hasNonLatinLetters(stored)) {
    const statesAge = AGE_WORDS.test(stored);
    const facial = facialHairStatement([stored]);
    const clear = `${garmentCut(stored)}${facial ? `; ${facial}` : ''}`;
    const body = statesAge || who === 'a person' ? clear : `${who}; ${clear}`;
    const styled = opts.style && body.toLowerCase().includes(STYLE_MEDIUM[opts.style].identity.toLowerCase()) ? body : `${lead}${body}`;
    return { line: `Identity: ${styled}.`, nonLatin, hasAge: statesAge || /\d/.test(who) };
  }
  if (stored) nonLatin.push(stored);
  const parts: string[] = [];
  /** the Latin text of a piece ('' when it is reported as non-Latin) */
  const latin = (s?: string | false | null): string => {
    const v = squash(s || '').replace(/[.;]+$/, '');
    if (!v || !hasNonLatinLetters(v)) return v;
    // a word with stray letters of another alphabet is repaired ("deshdaша" → "deshdasha", D12); a field with a word
    // wholly in another script is reported whole (a dropped word would leave a stub like "hair" with nothing to draw)
    const fixed = latinizeField(v);
    if (fixed.dropped.length) { nonLatin.push(v); return ''; }
    return fixed.text;
  };
  const push = (v: string) => { if (v && !parts.some((p) => p.toLowerCase() === v.toLowerCase())) parts.push(v); };
  const build = latin(c.build && lookPiece(c.build, 'build'));
  const face = latin(c.face && lookPiece(c.face, 'face'));
  const hair = latin(c.hair && lookPiece(c.hair, 'hair'));
  const eyes = latin(c.eyes && lookPiece(c.eyes, 'eyes'));
  const skin = latin(c.skin && c.skin !== '—' && lookPiece(c.skin, 'skin'));
  const wardrobe = latin(c.wardrobe && `wearing ${c.wardrobe}`);
  const distinguishing = (c.distinguishing ?? []).slice(0, 8).map((d) => healedMark(latin(d)));
  const acc = (c.canon?.accessories ?? []).map((a) => squash(a)).filter(Boolean);
  nonLatin.push(...acc.filter(hasNonLatinLetters));
  const accLatin = acc.filter((a) => !hasNonLatinLetters(a));
  const restrictions = (c.canon?.visualRestrictions ?? []).slice(0, 4).map((r) => latin(r && r.charAt(0).toLowerCase() + r.slice(1)));
  // the facial hair is found in the fields as written (their own clauses), Latin words only
  const quiet = (s?: string) => (s && hasNonLatinLetters(s) ? latinizeField(s).text : s ?? '');
  push(build);
  push(face);
  // a woman's "clean-shaven" is no statement to draw (the designer wrote "clean-shaven skin" for Elena Ward, 2026-10-08)
  const facialHair = facialHairStatement([quiet(c.face), quiet(c.hair), ...distinguishing, ...restrictions]) ?? '';
  push(c.sex === 'FEMALE' && /^clean-shaven/i.test(facialHair) ? '' : facialHair);
  push(hair);
  push(eyes);
  push(skin);
  push(wardrobe && garmentCut(wardrobe));
  for (const d of distinguishing) push(d);
  if (accLatin.length) push(`accessories: ${accLatin.join(', ')}`);
  for (const r of restrictions) push(r);
  if (!parts.length && who === 'a person') return { line: '', nonLatin, hasAge: false };
  return { line: `Identity: ${lead}${[who, ...parts].join('; ')}.`, nonLatin, hasAge: /\d/.test(who) };
}

/** The negative words for a character whose look names a healed scar: the words alone did not stop a fresh wound
 *  being drawn (Elena Ward's redraw, 2026-10-08), and the canonical model runs at cfg 4, where a negative prompt acts.
 *  Empty when no healed scar is named. Pure (tested). */
export function woundNegative(c: Pick<Character, 'distinguishing' | 'face'>): string {
  const texts = [...(c.distinguishing ?? []), c.face ?? ''];
  return texts.some((d) => /\bscar(s|red)?\b/i.test(d) && healedMark(d) !== d) ? ', fresh wound, bleeding cut, open gash, red scratch, blood, scab, stitches' : '';
}

/** A SCAR IS DRAWN HEALED (2026-10-08: "a small healed scar on his left eyebrow" drew Marcus Bell a fresh red cut, and the
 *  same words drew Elena Ward a bleeding gash — 2 of 2): a distinguishing detail naming a scar says what a healed one
 *  looks like, unless it says the wound is fresh. Pure (tested). */
export function healedMark(d: string): string {
  if (!/\bscar(s|red)?\b/i.test(d) || /\b(fresh|new|bleeding|open|raw|recent)\b/i.test(d) || /fully healed scar/i.test(d)) return d;
  return `${d.replace(/[.;]+$/, '')} (an old, fully healed scar: a thin pale flat line, the skin closed, no redness, no blood, no cut)`;
}

/** A whole identity line with every scar clause drawn healed: a line stored before `healedMark` existed (Marcus Bell's
 *  "A small, healed scar on his left eyebrow") drew a fresh cut on both faces of "The Relief" 1.7's first frame. Pure. */
export const healedLine = (line: string): string => line.split(/(;\s*)/).map((part) => (/^;\s*$/.test(part) ? part : healedMark(part))).join('');

// ------------------------------------------------------------------------------------------ the canonical image

/** One frame for every canonical image: Qwen-Image's native 9:16 size. */
export const CANONICAL_FRAME = { width: 928, height: 1664 } as const;
export const CANONICAL_OUTPUT = 'save_canonical';

/** The whole-figure framing every canonical image shares. */
export const CANONICAL_FRAMING = 'one character, full-body front view facing the camera, the whole figure from the top of the head to the soles of the feet inside the picture with clear margin above the head and below the feet, standing in a relaxed neutral pose, arms relaxed at the sides, neutral expression, plain neutral mid-grey studio background, even soft studio light, no props, no text';

/** Auto / Manual: the medium first, the framing, the English identity line, the style's character construction and
 *  visual language, the avoid list (`styleDirection(style)` fields). (A sentence telling the model where the
 *  character's own left and right are in a front view was tried and dropped: 15/24 side-specific details on the
 *  correct side with it, 15/24 without — REPORT §3.) */
export function canonicalPrompt(i: { style: Style; identityLine: string; character?: string; visual?: string; avoid?: string }): string {
  return sentences([`${STYLE_MEDIUM[i.style].lead} ${CANONICAL_FRAMING}`, i.identityLine, i.character, i.visual, i.avoid]);
}

/** Image Reference: the upload (image 1, and its face crop as image 2 when a face was found) guides the look; the
 *  identity line written from the picture's description supplies only what the picture does not show. */
export function referenceCanonicalPrompt(i: { style: Style; identityLine: string; faceImage?: boolean; character?: string; visual?: string }): string {
  return sentences([
    `Redraw the person in image 1${i.faceImage ? ', with the face exactly as in image 2,' : ''} as ${STYLE_MEDIUM[i.style].noun}: ${CANONICAL_FRAMING}`,
    'Keep the face shape, age, skin tone, hair, facial hair, glasses and every visible garment and colour exactly as in the picture; complete what the picture does not show from the description',
    i.identityLine, i.character, i.visual,
  ]);
}

/** The head-and-shoulders part of a canonical image for the close-up portrait, 4:5: from the figure's box the framing
 *  check recorded (fractions of the picture) — the top 36 % of the figure with a margin above the head — else the top
 *  40 % of the picture. In pixels of the picture. */
export function portraitCrop(size: { width: number; height: number }, box?: { x: number; y: number; w: number; h: number } | null): PxRect {
  const W = size.width, H = size.height;
  const top = box ? Math.max(0, (box.y - 0.03) * H) : 0;
  const height = Math.min(H - top, box ? box.h * H * 0.36 + 0.05 * H : 0.4 * H);
  const width = Math.min(W, height * 0.8);
  const cx = box ? (box.x + box.w / 2) * W : W / 2;
  const x = Math.max(0, Math.min(W - width, cx - width / 2));
  return { x: Math.round(x), y: Math.round(top), width: Math.floor(width), height: Math.floor(height) };
}

/** Secondary material (contract v2 §1, on request only): what the kind shows, of the person in image 1 (the canonical
 *  image) in the production's medium, everything that makes them who they are kept as in image 1, the identity line,
 *  the visual direction, a plain background. */
export function secondaryPrompt(i: { kind: SecondaryMaterialKind; style: Style; identityLine: string; visual?: string }): string {
  // a close-up keeps only the head: the whole identity line (garments, footwear) made Edit-2511 redraw the whole
  // figure even from a head-and-shoulders crop (GPU check 2026-10-03, docs/evidence/image-v2/d13)
  const closeUp = i.kind === 'PORTRAIT';
  return sentences([
    `${SECONDARY_SPEC[i.kind].prose}, of the same person as in image 1, drawn as ${STYLE_MEDIUM[i.style].noun}`,
    closeUp ? 'Keep the face, age, skin tone, hair and anything worn on the head or face exactly as in image 1' : 'Keep the face, age, skin tone, hair, facial hair, glasses and every garment, colour and accessory exactly as in image 1',
    closeUp ? '' : i.identityLine,
    i.visual,
    'Plain neutral mid-grey studio background, even soft studio light, no text, no labels, no props',
  ]);
}

/** Auto / Manual: Qwen-Image-2512 at 928×1664. `quality` (default) = no Lightning LoRA, 30 steps, cfg 4 with the
 *  negative (~42 s on the 5090): clean cel-shaded anime and feature-animation cartoon, where the Lightning 8-step
 *  draft (~6–9 s) drew semi-realistic painted figures (REPORT §3); `quality: false` = the Lightning draft. */
export function qwenCanonicalImage(i: { prompt: string; negative?: string; seed?: number; quality?: boolean; steps?: number; cfg?: number; filenamePrefix?: string }): Graph {
  const quality = i.quality ?? true;
  const g: Graph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.qwenDit, weight_dtype: 'default' }, _meta: { title: 'Qwen-Image-2512' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.qwenClip, type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.qwenVae } },
  };
  let model: [string, number] = ['1', 0];
  if (!quality) { g['4'] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: MODELS.qwenLightning, strength_model: 1.0 } }; model = ['4', 0]; }
  g['5'] = { class_type: 'ModelSamplingAuraFlow', inputs: { model, shift: 3.1 } };
  g['6'] = { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: i.prompt } };
  g['7'] = { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: i.negative ?? '' } };
  g['8'] = { class_type: 'EmptySD3LatentImage', inputs: { width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, batch_size: 1 } };
  g['9'] = { class_type: 'KSampler', inputs: { model: ['5', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: seed32(i.seed), steps: i.steps ?? (quality ? 30 : 8), cfg: i.cfg ?? (quality ? 4.0 : 1.0), sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } };
  g['10'] = { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } };
  g[CANONICAL_OUTPUT] = { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/canonical' } };
  return g;
}

/** Image Reference: Qwen-Image-Edit-2511, image1 = the upload, image2 = its face (an uploaded face crop `face`, or
 *  `faceRect` cut from the upload inside the graph and scaled to 1024²), output in the canonical frame. Quality mode
 *  (24 steps, cfg 4) by default — it is the identity anchor. */
export function qwenReferenceCanonical(i: { upload: string; face?: string; faceRect?: PxRect; prompt: string; negative?: string; seed?: number; quality?: boolean; filenamePrefix?: string }): Graph {
  const quality = i.quality ?? true;
  const g: Graph = {};
  const model = editModel(g, { quality });
  g['img1'] = { class_type: 'LoadImage', inputs: { image: i.upload } };
  g['img1s'] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['img1', 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } };
  const images: Record<string, unknown> = { image1: ['img1s', 0] };
  if (i.face) {
    g['img2'] = { class_type: 'LoadImage', inputs: { image: i.face } };
    g['img2s'] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['img2', 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } };
    images.image2 = ['img2s', 0];
  } else if (i.faceRect) {
    const r = i.faceRect;
    g['facecrop'] = { class_type: 'ImageCrop', inputs: { image: ['img1', 0], width: Math.max(16, Math.round(r.width)), height: Math.max(16, Math.round(r.height)), x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)) } };
    g['img2s'] = { class_type: 'ImageScale', inputs: { image: ['facecrop', 0], upscale_method: 'lanczos', width: 1024, height: 1024, crop: 'center' } };
    images.image2 = ['img2s', 0];
  }
  g['6'] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['2', 0], prompt: i.prompt, vae: ['3', 0], ...images } };
  g['7'] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['2', 0], prompt: i.negative ?? '', vae: ['3', 0], ...images } };
  g['8'] = { class_type: 'EmptySD3LatentImage', inputs: { width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, batch_size: 1 } };
  g['9'] = { class_type: 'KSampler', inputs: { model, positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: seed32(i.seed), steps: quality ? 24 : 4, cfg: quality ? 4.0 : 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } };
  g['10'] = { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } };
  g[CANONICAL_OUTPUT] = { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/canonical-ref' } };
  return g;
}

// ------------------------------------------------------------------------------- face crop of an upload

export interface PxRect { x: number; y: number; width: number; height: number }
export interface FaceBoxPx extends PxRect { score?: number }

/** The bounding boxes `faceCheck` returns through PreviewAny (MediaPipe, ComfyUI 0.38.1): a JSON list per image of
 *  `{x, y, width, height, label, score}` in pixels. Largest first; anything unparsable is an empty list. */
export function parseFaceBoxes(text: string | string[] | undefined): FaceBoxPx[] {
  const raw = Array.isArray(text) ? text.join('\n') : text ?? '';
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const out: FaceBoxPx[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const [x, y, width, height] = [o.x, o.y, o.width, o.height].map(Number);
    if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) out.push({ x, y, width, height, ...(Number.isFinite(Number(o.score)) ? { score: Number(o.score) } : {}) });
  };
  walk(data);
  return out.sort((a, b) => b.width * b.height - a.width * a.height);
}

/** The square face crop around a detected box: the box's long side plus `margin` on every side, centred a little
 *  below the box centre so chin and jaw are inside (wave 2's fixed box cut a face at the lips), clamped. */
export function faceCropRect(box: PxRect, image: { width: number; height: number }, opts: { margin?: number; chinBias?: number } = {}): PxRect {
  const margin = opts.margin ?? 0.25, chinBias = opts.chinBias ?? 0.08;
  let side = Math.max(box.width, box.height) * (1 + 2 * margin);
  side = Math.max(16, Math.min(side, image.width, image.height));
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2 + chinBias * box.height;
  const x = Math.max(0, Math.min(image.width - side, cx - side / 2));
  const y = Math.max(0, Math.min(image.height - side, cy - side / 2));
  const s = Math.floor(side);
  return { x: Math.round(x), y: Math.round(y), width: s, height: s };
}

// ---------------------------------------------------------------- vision-language model (Qwen3.5-4B, ComfyUI)

/** PreviewAny node id that carries the generated text for an item (`textOutput(run.outputs, vlmOutput(key))`). */
export const vlmOutput = (key: string) => `vlm_${key}`;
export interface VlmItem { key: string; image: string; prompt: string }

/** Qwen3.5-4B in core ComfyUI: one CLIPLoader, one TextGenerate per item (greedy: sampling off, thinking off), pictures
 *  scaled to ≤ `megapixels`. All items share one model load. */
export function qwenVlmText(i: { items: VlmItem[]; system?: string; maxLength?: number; megapixels?: number }): Graph {
  if (!i.items.length) throw new Error('qwenVlmText needs at least one item');
  const keys = new Set<string>();
  const g: Graph = { clip: { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.vlm, type: 'stable_diffusion', device: 'default' }, _meta: { title: 'Qwen3.5-4B' } } };
  if (i.system) g['sys'] = { class_type: 'PrimitiveStringMultiline', inputs: { value: i.system } };
  i.items.forEach((it, k) => {
    if (!/^[a-z0-9_]+$/i.test(it.key) || keys.has(it.key)) throw new Error(`bad or duplicate VLM item key "${it.key}"`);
    keys.add(it.key);
    g[`img_${k}`] = { class_type: 'LoadImage', inputs: { image: it.image } };
    g[`imgs_${k}`] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: [`img_${k}`, 0], upscale_method: 'lanczos', megapixels: Math.max(0.1, Math.min(1.5, i.megapixels ?? 1.0)), resolution_steps: 16 } };
    g[`gen_${k}`] = { class_type: 'TextGenerate', inputs: { clip: ['clip', 0], prompt: it.prompt, max_length: Math.max(16, Math.min(4096, Math.round(i.maxLength ?? 768))), sampling_mode: 'off', image: [`imgs_${k}`, 0], thinking: false, use_default_template: true, ...(i.system ? { system_prompt: ['sys', 0] } : {}) } };
    g[vlmOutput(it.key)] = { class_type: 'PreviewAny', inputs: { source: [`gen_${k}`, 0] } };
  });
  return g;
}

export const REFERENCE_DESCRIBE_KEY = 'describe';

/** One ComfyUI prompt that reads an uploaded reference picture: the MediaPipe face boxes (`FACE_CHECK_OUTPUTS.bboxes`,
 *  for the face crop given to the redraw) and, when the vision model is installed, the description
 *  (`vlmOutput(REFERENCE_DESCRIBE_KEY)`) the identity line is written from. */
export function referenceReadGraph(i: { image: string; describe: boolean }): Graph {
  const g = faceCheck({ image: i.image, numFaces: 3, minConfidence: 0.5 });
  if (!i.describe) return g;
  return { ...g, ...qwenVlmText({ items: [{ key: REFERENCE_DESCRIBE_KEY, image: i.image, prompt: DESCRIBE_PROMPT }], system: DESCRIBE_SYSTEM, maxLength: 900 }) };
}
export { FACE_CHECK_OUTPUTS as REFERENCE_FACE_OUTPUTS };

/** The first JSON object in a model answer (code fences, a <think> block and prose around it are ignored). */
export function firstJsonObject(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  if (start < 0) throw new Error('the answer has no JSON object');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  return JSON.parse(t.slice(start));
}

/** The system prompt of the Image Reference description (CHARACTER-IMAGE-V2.md §8). */
export const DESCRIBE_SYSTEM = 'You describe the visible appearance of one person for a costume and character designer. Describe only what is visible. Do not guess names, ethnicity, nationality, religion or health. Use plain English colour words. Answer with JSON only.';
export const DESCRIBE_PROMPT = [
  'Describe the person in the picture as one JSON object with exactly these keys:',
  '{"ageRange": "e.g. 30-40", "sex": "female | male | unclear", "build": "", "skinTone": "", "faceShape": "",',
  '"hair": {"colour": "", "length": "", "texture": "", "style": ""}, "facialHair": "none or a description",',
  '"eyes": {"colour": "or not visible"}, "eyebrows": "", "glasses": "none or a description", "marks": [],',
  '"clothing": [{"item": "", "colour": "", "pattern": ""}], "footwear": "or not visible", "accessories": [],',
  '"notVisible": [], "confidence": {"<field>": "low | medium | high"}}.',
  'For an accessory worn on one side of the body say which side, as the person\'s own left or right.',
  'Use "not visible" for anything you cannot see. No prose outside the JSON.',
].join(' ');

export interface CharacterDescription {
  ageRange?: string; sex?: string; build?: string; skinTone?: string; faceShape?: string;
  hair: { colour?: string; length?: string; texture?: string; style?: string };
  facialHair?: string; eyes?: string; eyebrows?: string; glasses?: string; marks: string[];
  clothing: Array<{ item: string; colour?: string; pattern?: string }>;
  footwear?: string; accessories: string[]; notVisible: string[];
  confidence: Record<string, 'low' | 'medium' | 'high'>;
}

const str = (v: unknown): string | undefined => {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return undefined;
  const s = squash(v);
  return s && !/^(n\/?a|null|none given|unknown|-)$/i.test(s) ? s : undefined;
};
const field = (o: unknown, ...keys: string[]) => (o && typeof o === 'object' ? keys.map((k) => (o as Record<string, unknown>)[k]).find((v) => v !== undefined && v !== null) : undefined);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'object' && x ? Object.values(x).map(str).filter(Boolean).join(' ') : str(x))).filter((x): x is string => Boolean(x)) : typeof v === 'string' ? v.split(/[;,]/).map(squash).filter(Boolean) : []);
const NOT_VISIBLE = /^(not visible|not shown|unseen|cannot (be )?see|n\/a)/i;

/** Parse and normalise the description (code fences, prose around the JSON, strings for objects, missing keys).
 *  Throws when there is no JSON object at all. */
export function parseCharacterDescription(text: string): CharacterDescription {
  const raw = firstJsonObject(text) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the description is not a JSON object');
  const hairRaw = raw.hair;
  const hair = typeof hairRaw === 'object' && hairRaw ? { colour: str(field(hairRaw, 'colour', 'color')), length: str(field(hairRaw, 'length')), texture: str(field(hairRaw, 'texture')), style: str(field(hairRaw, 'style')) } : { style: str(hairRaw) };
  const eyes = typeof raw.eyes === 'object' && raw.eyes ? str(field(raw.eyes, 'colour', 'color')) : str(raw.eyes);
  const clothing = (Array.isArray(raw.clothing) ? raw.clothing : []).map((c) => (typeof c === 'string' ? { item: squash(c) } : { item: str(field(c, 'item')) ?? '', colour: str(field(c, 'colour', 'color')), pattern: str(field(c, 'pattern')) })).filter((c) => c.item);
  const confidence: CharacterDescription['confidence'] = {};
  if (raw.confidence && typeof raw.confidence === 'object') for (const [k, v] of Object.entries(raw.confidence as Record<string, unknown>)) { const s = String(v).toLowerCase(); if (s === 'low' || s === 'medium' || s === 'high') confidence[k] = s; }
  return {
    ageRange: str(raw.ageRange ?? raw.age), sex: str(raw.sex ?? raw.gender), build: str(raw.build), skinTone: str(raw.skinTone ?? raw.skin), faceShape: str(raw.faceShape),
    hair, facialHair: str(raw.facialHair), eyes, eyebrows: str(raw.eyebrows), glasses: str(raw.glasses), marks: strList(raw.marks),
    clothing, footwear: str(raw.footwear), accessories: strList(raw.accessories), notVisible: strList(raw.notVisible), confidence,
  };
}

/** The English identity line written from a description: visible, not-low-confidence fields only (low-confidence
 *  fields are returned for the page to show, never used silently), style first when given. What the picture does not
 *  show (`notVisible`, e.g. shoes in a head shot) is returned so the design step fills only those, marked "designed". */
export function identityLineFromDescription(d: CharacterDescription, opts: { style?: Style } = {}): { line: string; lowConfidence: string[]; notVisible: string[] } {
  const low = new Set(Object.entries(d.confidence).filter(([, v]) => v === 'low').map(([k]) => k));
  const lowConfidence: string[] = [];
  const parts: string[] = [];
  const add = (key: string, v: string | undefined, fmt: (s: string) => string = (s) => s) => {
    if (!v || NOT_VISIBLE.test(v)) return;
    if (low.has(key) || [...low].some((l) => l.startsWith(`${key}.`))) { lowConfidence.push(key); return; }
    parts.push(fmt(v));
  };
  // the age as the picture shows it, in the words a prompt needs: a child or a teenager is said so ("a teenage boy aged
  // about 10-19", "a girl" — never "a woman aged about child"), an adult by the range
  const female = /^f/i.test(d.sex ?? ''), male = /^m/i.test(d.sex ?? '');
  const ageText = d.ageRange && !NOT_VISIBLE.test(d.ageRange) && !low.has('ageRange') ? squash(d.ageRange.replace(/\s*years?( old)?/i, '')) : '';
  const ages = (ageText.match(/\d{1,3}/g) ?? []).map(Number);
  const oldest = ages.length ? Math.max(...ages) : /child|kid|toddler|baby/i.test(ageText) ? 10 : /teen|adolescent/i.test(ageText) ? 16 : undefined;
  const noun = oldest !== undefined && oldest <= 12 ? (female ? 'girl' : male ? 'boy' : 'child') : oldest !== undefined && oldest <= 19 ? (female ? 'teenage girl' : male ? 'teenage boy' : 'teenager') : (female ? 'woman' : male ? 'man' : 'person');
  const age = ages.length ? ` aged about ${ageText}` : '';
  if (d.ageRange && low.has('ageRange')) lowConfidence.push('ageRange');
  parts.push(`${opts.style ? `${STYLE_MEDIUM[opts.style].identity}, ` : ''}a ${noun}${age}`);
  add('build', d.build, (s) => `${s} build`);
  add('faceShape', d.faceShape, (s) => `${s} face`);
  const hair = [d.hair.length, d.hair.texture, d.hair.colour].filter((x) => x && !NOT_VISIBLE.test(x)).join(' ');
  add('hair', hair ? `${hair} hair${d.hair.style && !NOT_VISIBLE.test(d.hair.style) ? `, ${d.hair.style}` : ''}` : d.hair.style);
  add('eyes', d.eyes, (s) => `${s} eyes`);
  add('skinTone', d.skinTone, (s) => `${s} skin`);
  // a moustache the picture shows without a beard is said to be only that (D13)
  if (d.facialHair && !/^(none|no)\b/i.test(d.facialHair)) add('facialHair', d.facialHair, (s) => facialHairStatement([s]) ?? s);
  else if (d.facialHair && !female) parts.push('no facial hair');
  if (d.glasses && !/^(none|no)\b/i.test(d.glasses)) add('glasses', d.glasses, (s) => (/glass|spectacle/i.test(s) ? s : `glasses (${s})`));
  for (const m of d.marks) add('marks', m);
  const clothes = d.clothing.map((c) => squash([c.colour, c.pattern && !/^(none|plain|solid)$/i.test(c.pattern) ? c.pattern : '', c.item].filter(Boolean).join(' ')));
  if (clothes.length) add('clothing', `wearing ${clothes.join(', ')}`);
  // an accessory entry is a thing worn, not a field's answer: "glasses none" / "none" are dropped (a model that reads
  // words literally would draw them), and glasses are said once, by their own field
  const accessories = d.accessories.map((a) => squash(a.replace(/\b(none|both|n\/a)\b/gi, ''))).filter((a) => a && !/^(no|none)$/i.test(a) && !(d.glasses && /\b(glasses|spectacles)\b/i.test(a)));
  if (accessories.length) add('accessories', `accessories: ${accessories.join(', ')}`);
  add('footwear', d.footwear);
  const notVisible = [...new Set([...d.notVisible, ...(d.footwear && NOT_VISIBLE.test(d.footwear) ? ['footwear'] : [])])];
  return { line: `Identity: ${parts.join('; ')}.`, lowConfidence: [...new Set(lowConfidence)], notVisible };
}

/** What the text-only design step may know of a reference picture it cannot see (D15): the apparent age and sex and
 *  what is visibly worn or carried — low-confidence and not-visible fields left out, short phrases only — so the
 *  designed role, age and voice never contradict the picture. */
export interface PictureFacts { apparentAge?: string; sex?: 'male' | 'female'; visible: string[] }

export function pictureFacts(d: CharacterDescription): PictureFacts {
  const low = new Set(Object.entries(d.confidence).filter(([, v]) => v === 'low').map(([k]) => k));
  const sure = (key: string, v: string | undefined): v is string => Boolean(v) && !NOT_VISIBLE.test(v!) && !low.has(key) && ![...low].some((l) => l.startsWith(`${key}.`));
  const none = (v: string) => /^(none|no)\b/i.test(v);
  const visible: string[] = [];
  const add = (v: string) => { const s = squash(v).slice(0, 60); if (s && !visible.some((x) => x.toLowerCase() === s.toLowerCase())) visible.push(s); };
  const hair = [d.hair.length, d.hair.colour].filter((x) => x && !NOT_VISIBLE.test(x)).join(' ');
  if (hair && !low.has('hair') && ![...low].some((l) => l.startsWith('hair.'))) add(`${hair} hair`);
  if (sure('facialHair', d.facialHair)) add(none(d.facialHair) ? 'no facial hair' : d.facialHair);
  if (sure('glasses', d.glasses) && !none(d.glasses)) add(/glass|spectacle/i.test(d.glasses) ? d.glasses : `glasses (${d.glasses})`);
  if (!low.has('clothing')) for (const c of d.clothing) add([c.colour, c.item].filter(Boolean).join(' '));
  if (sure('footwear', d.footwear)) add(d.footwear);
  if (!low.has('accessories')) for (const a of d.accessories) add(a);
  const sex = low.has('sex') ? undefined : /^f/i.test(d.sex ?? '') ? 'female' as const : /^m/i.test(d.sex ?? '') ? 'male' as const : undefined;
  return { ...(sure('ageRange', d.ageRange) ? { apparentAge: d.ageRange.replace(/\s*years?( old)?/i, '').slice(0, 20) } : {}), ...(sex ? { sex } : {}), visible: visible.slice(0, 10) };
}

// --------------------------------------------------------------------------------------- style judgement

export const STYLE_CHECK_PROMPT = 'Look at the picture. Answer with JSON only: {"medium": "photograph | 3d_render | 2d_drawing", "fullBody": true or false, "figures": number}. "photograph" = a photo of a real person; "3d_render" = a computer-animated 3D CG character; "2d_drawing" = a 2D anime, cartoon or illustration drawing. "fullBody" = the whole figure from the top of the head to the feet is inside the picture. "figures" = how many people are shown.';

export interface StyleJudgement { medium?: 'photograph' | '3d_render' | '2d_drawing'; fullBody?: boolean; figures?: number }
export const EXPECTED_MEDIUM: Record<Style, NonNullable<StyleJudgement['medium']>> = { CARTOON: '3d_render', ANIME: '2d_drawing', REALISTIC: 'photograph' };

export function parseStyleJudgement(text: string): StyleJudgement {
  const raw = firstJsonObject(text) as Record<string, unknown>;
  const m = String(raw.medium ?? '').toLowerCase();
  const medium = /photo/.test(m) ? 'photograph' : /3d|cg|render/.test(m) ? '3d_render' : /2d|draw|anime|illustr|cartoon/.test(m) ? '2d_drawing' : undefined;
  const fb = raw.fullBody ?? raw.full_body;
  return { medium, fullBody: typeof fb === 'boolean' ? fb : typeof fb === 'string' ? /^(true|yes)$/i.test(fb) : undefined, figures: Number.isFinite(Number(raw.figures)) ? Number(raw.figures) : undefined };
}
