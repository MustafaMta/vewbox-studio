import type { Asset, Character } from '@/domain/types';

/** THE LOOK AS THE PROFILE SHOWS IT (finding 3). A character made from a picture has no written look: the story
 *  model is text-only and never saw the picture, so the face, hair, skin, eyes, build and wardrobe stay empty and the
 *  picture is the look. The profile says "from the reference picture" for those fields until the producer writes
 *  them. Pure; unit-tested. */

export const LOOK_KEYS = ['build', 'face', 'hair', 'eyes', 'skin', 'wardrobe'] as const satisfies ReadonlyArray<keyof Character>;
export type LookKey = (typeof LOOK_KEYS)[number];

/** The look comes from a picture: one is pending (the drawing has not replaced it yet), or the portrait was drawn
 *  from one (the CHARACTER_APPEARANCE provenance says `lookFrom: 'REFERENCE'`). */
export function lookFromReference(c: Pick<Character, 'pendingReference' | 'portraitAssetId'>, assets: Pick<Asset, 'id' | 'provenance'>[]): boolean {
  if (c.pendingReference) return true;
  const portrait = c.portraitAssetId ? assets.find((a) => a.id === c.portraitAssetId) : undefined;
  return portrait?.provenance?.lookFrom === 'REFERENCE';
}

/** One look field for display: the producer's words when written; otherwise "from the reference picture" when the
 *  look is a picture's, else a dash. */
export function lookFieldText(value: string | undefined, fromReference: boolean, fromReferenceText: string): string {
  const v = (value ?? '').trim();
  if (v && v !== '—') return v;
  return fromReference ? fromReferenceText : '—';
}
