import type { Character } from '@/domain/types';
import type { ViewRole } from './qwen-image';
import { VIEW_SPEC } from './qwen-image';

/** IDENTITY TOKENS AND SEEDS — the pure helpers behind the character sheet. The identity line is the short, fixed
 *  list of the things that drifted between views in the first sheets (facial hair, shoe colour, accessories, fabric
 *  pattern, restrictions): written once from the record and repeated verbatim in every prompt that draws the
 *  character. The identity seed is one number per character used for the sheet and every derived view. */

const clean = (s?: string | false | null) => (s || '').replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim();

/** Deterministic: the same record always yields the same line. Pieces are de-duplicated case-insensitively. */
export function identityLine(c: Pick<Character, 'hair' | 'eyes' | 'skin' | 'build' | 'distinguishing' | 'wardrobe'> & { canon?: Character['canon'] }): string {
  const stored = clean(c.canon?.identityLine);
  if (stored) return stored;
  const parts: string[] = [];
  const push = (s?: string | false | null) => { const v = clean(s); if (v && !parts.some((p) => p.toLowerCase() === v.toLowerCase())) parts.push(v); };
  push(c.hair && `${c.hair} hair`);
  push(c.eyes && `${c.eyes} eyes`);
  push(c.skin && c.skin !== '—' && `${c.skin} skin`);
  push(c.build && `${c.build} build`);
  push(c.wardrobe && `wearing ${c.wardrobe}`);
  for (const d of (c.distinguishing ?? []).slice(0, 6)) push(d);
  const acc = (c.canon?.accessories ?? []).map(clean).filter(Boolean);
  if (acc.length) push(`accessories: ${acc.join(', ')}`);
  for (const r of (c.canon?.visualRestrictions ?? []).slice(0, 4)) push(r && r.charAt(0).toLowerCase() + r.slice(1));
  const line = parts.join('; ');
  return line ? `Identity: ${line}.` : '';
}

/** FNV-1a over the id, folded to ComfyUI's 31-bit seed range: a character gets the same seed on every machine. */
export function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 2 ** 31;
}

export function identitySeedFor(c: Pick<Character, 'id'> & { canon?: Character['canon'] }): number {
  const s = c.canon?.identitySeed;
  return typeof s === 'number' && Number.isFinite(s) && s >= 0 ? Math.floor(s) % 2 ** 31 : seedFromId(c.id);
}

/** Per-view offsets from the identity seed, so each derived view is reproducible and distinct; a redraw of one view
 *  bumps the previous seed by one. */
export const VIEW_SEED_OFFSET: Record<ViewRole, number> = { FRONT: 0, THREE_QUARTER: 0, SIDE: 0, BACK: 0, FACE: 0, FULL_BODY: 11, EXPRESSION: 17, OUTFIT: 19 };

/** The canonical sheet prompt: the layout instruction first (the direction text must not win over the view), the
 *  identity line verbatim, then the production direction. */
export function sheetPrompt(i: { identityLine: string; direction?: string; subject?: string }): string {
  const who = clean(i.subject) || 'the same person as in image 1, whose face is image 2';
  return clean([
    `Character turnaround reference sheet of ${who}: four full-body views side by side on one plain mid-grey background, left to right: front view, three-quarter view turned 45 degrees to the left, exact left profile side view, back view.`,
    'Identical face, hair, skin, build and the exact same outfit in every view.',
    i.identityLine,
    'Standing, arms relaxed, neutral expression, feet visible, even studio light, no text, no labels, no props.',
    i.direction,
  ].map(clean).filter(Boolean).join(' '));
}

/** A derived view from the fixed three references: image 1 the FRONT tile (pose), image 2 the face crop (face),
 *  image 3 the whole sheet (wardrobe truth). With the Multiple-Angles LoRA the camera tokens lead the prompt. */
export function viewPrompt(i: { view: ViewRole; identityLine: string; direction?: string; angleLora?: boolean }): string {
  const spec = VIEW_SPEC[i.view];
  const angle = i.angleLora && spec.angle ? `<sks> ${spec.angle}. ` : '';
  return clean([
    angle + `The person in image 1, with the face exactly as in image 2 and the outfit exactly as in image 3: ${spec.prose}.`,
    i.identityLine,
    i.direction,
    'Plain mid-grey background, even studio light, no text, no labels, no props.',
  ].map(clean).filter(Boolean).join(' '));
}
