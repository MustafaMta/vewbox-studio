import type { Asset, CanonicalImage, Character, StudioState } from './types';

/** THE CANONICAL IMAGE, READ — pure questions about a character's one canonical front full-body image
 *  (docs/CONTRACTS-IDENTITY-PACK.md v2), shared by the reducers, the server preflight and the pages. */

/** NONE: not drawn yet. DRAFT: drawn, awaiting the producer. APPROVED: the official identity. */
export type CanonicalStatus = 'NONE' | 'DRAFT' | 'APPROVED';
export const canonicalStatusOf = (c: Pick<Character, 'canonicalImage'>): CanonicalStatus => c.canonicalImage?.status ?? 'NONE';
export const isCanonicalApproved = (c: Pick<Character, 'canonicalImage'>): boolean => c.canonicalImage?.status === 'APPROVED';

/** The image's automatic check FAILED (it ran and did not pass). No check means none applied — not a pass, not a
 *  failure — and does not block approval. */
export const canonicalCheckFailed = (img: Pick<CanonicalImage, 'check'> | undefined): boolean => Boolean(img?.check && !img.check.ok);

/** Why `approveCanonicalImage(version)` would be refused, or null when it may proceed. `override` stands for the
 *  producer's explicit override of a failed check (the command also requires a reason). */
export function approvalProblem(img: CanonicalImage | undefined, version: number, override = false): { code: 'INVALID' | 'CONFLICT'; message: string; details: Record<string, unknown> } | null {
  if (!img) return { code: 'INVALID', message: 'There is no canonical image to approve yet; draw it first.', details: {} };
  if (version !== img.version) return { code: 'CONFLICT', message: `The canonical image changed since it was reviewed (it is now version ${img.version}, the approval was for version ${version}); review it again.`, details: { currentVersion: img.version, requestedVersion: version } };
  if (canonicalCheckFailed(img) && !override) {
    const notes = (img.check?.notes ?? []).filter(Boolean).slice(0, 3);
    return { code: 'INVALID', message: `The image’s check failed${notes.length ? ` (${notes.join('; ')})` : ''}; redraw it, or approve with an override and a reason.`, details: { check: img.check } };
  }
  return null;
}

/** THE PRIMARY IMAGE — the canonical image everywhere (cards, lists, the detail page, cast displays, pickers,
 *  production assignment, shot references); a character drawn before canonical images falls back to the legacy
 *  portrait; otherwise none. */
export function primaryImageOf(c: Pick<Character, 'canonicalImage' | 'portraitAssetId'>): string | undefined {
  return c.canonicalImage?.assetId ?? c.portraitAssetId ?? undefined;
}

/** Where the primary image comes from: the canonical image, the legacy portrait, or nowhere. */
export function primaryImageSourceOf(c: Pick<Character, 'canonicalImage' | 'portraitAssetId'>): 'CANONICAL' | 'PORTRAIT' | null {
  if (c.canonicalImage?.assetId) return 'CANONICAL';
  return c.portraitAssetId ? 'PORTRAIT' : null;
}

/** A species only when the character is NOT human: "Human", "person", «إنسان» and the like mean no species (the design
 *  model writes "Human" for ordinary people, and every display then showed "Human" instead of sex and age). */
const HUMAN = /^(human( being)?|humans?|person|people|man|woman|boy|girl|إنسان|انسان|بشري|بشر|رجل|امرأة|إمرأة)$/i;
export function nonHumanSpecies(species: string | undefined | null): string | undefined {
  const s = species?.trim();
  return s && !HUMAN.test(s) ? s : undefined;
}

/** USABLE MEDIA — the one definition of each rule (audit B2: they were repeated in the preflight and the handlers, and
 *  the two audio checks disagreed). Three different questions, three rules:
 *  - `usableImage`: a picture a step can draw or film from — a real image, never a bundled sample or an SVG placeholder.
 *  - `usableAudio`: audio a step can play or mix (a song, a recorded line) — a real file, present in the library;
 *    generated audio counts (a generated song is the song).
 *  - a recording a voice is CLONED from is stricter: `usableRecordingAsset` (src/domain/voice-identity.ts) also refuses
 *    GENERATED audio, and which recording a character speaks from is `pickReference` there. The take preflight asks
 *    `pickReference` — exactly what the worker speaks from — not "has any audio" (that let a speaker whose only audio
 *    was a missing file or an unconsented upload pass the preflight, and the take then fell back to a default voice). */
/** The look written in words: build, face, hair, skin, eyes, wardrobe. */
export const LOOK_FIELD_KEYS = ['build', 'face', 'hair', 'skin', 'eyes', 'wardrobe'] as const satisfies ReadonlyArray<keyof Character>;

/** At least one look field is written. A character made from a picture has none until the producer writes them:
 *  the picture is its look, and a redraw without a new picture draws from that picture again (D19). */
export function lookWritten(c: Partial<Pick<Character, (typeof LOOK_FIELD_KEYS)[number]>>): boolean {
  return LOOK_FIELD_KEYS.some((k) => { const v = String(c[k] ?? '').trim(); return Boolean(v) && v !== '—'; });
}

/** A redraw without a new picture draws from the picture the current image was drawn from (D19). */
export function redrawsFromEarlierPicture(c: Pick<Character, 'pendingReference'> & Partial<Pick<Character, 'canonicalImage' | (typeof LOOK_FIELD_KEYS)[number]>>): boolean {
  return !c.pendingReference && !lookWritten(c) && Boolean(c.canonicalImage?.referenceAssetId);
}

export const usableImage = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.sample && a.mimeType !== 'image/svg+xml');
export const usableAudio = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'AUDIO' && !a.sample && !a.unavailable);

/** The character whose canonical image this picture is, if any. */
export function canonicalImageOwner(s: Pick<StudioState, 'characters'>, assetId: string): Character | undefined {
  return s.characters.find((c) => c.canonicalImage?.assetId === assetId);
}
