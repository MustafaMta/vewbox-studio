import type { Character, Production, StudioState, VideoUsage } from './types';
import { StudioError } from './errors';

/** THE CONTINUITY RULE — a character's appearance may be generated, regenerated or replaced only while that character
 *  has never been in a video. Once a take of any video contains them, their appearance is preserved.
 *
 *  - "In a video" means a take exists (or existed) for a shot the character is in. Being cast in a show, a season,
 *    an episode or a storyboard is not enough.
 *  - Every take counts, chosen or not, approved or rejected. Removing a take marks its record; it never erases it.
 *  - When the history is unknown (`usage` absent, or `known: false`), the character is treated as used.
 *
 *  This module is shared by the browser (to disable controls and explain why) and the server (to refuse). The server
 *  is the enforcement: a command that would change a used character's appearance fails with APPEARANCE_LOCKED,
 *  whatever the client sent. See docs/CHARACTER-CONTINUITY.md. */

/** The fields that make up how a character looks. Voice and the written profile are not among them. */
export const APPEARANCE_KEYS = ['portraitAssetId', 'refs', 'pendingReference', 'style', 'species', 'sex', 'ageYears', 'build', 'face', 'hair', 'skin', 'eyes', 'distinguishing', 'wardrobe', 'canon'] as const satisfies ReadonlyArray<keyof Character>;

export type AppearanceLock =
  | { locked: false; reason: null; videos: VideoUsage[] }
  | { locked: true; reason: 'USED' | 'UNKNOWN'; videos: VideoUsage[] };

export function appearanceLock(c: Pick<Character, 'usage'>): AppearanceLock {
  if (!c.usage || !c.usage.known) return { locked: true, reason: 'UNKNOWN', videos: c.usage?.videos ?? [] };
  if (c.usage.videos.length > 0) return { locked: true, reason: 'USED', videos: c.usage.videos };
  return { locked: false, reason: null, videos: [] };
}

export const canChangeAppearance = (c: Pick<Character, 'usage'>) => !appearanceLock(c).locked;

/** The appearance keys a patch touches with a real change. */
export function appearanceChanges(c: Character, patch: Partial<Character>): string[] {
  const out: string[] = [];
  for (const k of APPEARANCE_KEYS) {
    if (!(k in patch)) continue;
    if (JSON.stringify(patch[k] ?? null) !== JSON.stringify(c[k] ?? null)) out.push(k);
  }
  return out;
}

/** Refuse a patch that changes the appearance of a locked character; pass everything else through unchanged. */
export function guardCharacterPatch<P extends Partial<Character>>(c: Character, patch: P): P {
  if (canChangeAppearance(c)) return patch;
  const changed = appearanceChanges(c, patch);
  if (changed.length > 0) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity (${changed.join(', ')}).`, { characterId: c.id, fields: changed, reason: appearanceLock(c).reason });
  const out = { ...patch } as Record<string, unknown>;
  for (const k of APPEARANCE_KEYS) delete out[k];
  return out as P;
}

/** THE VOICE RULE — once a character has been in a video, the voice they spoke with is preserved like their face:
 *  the pinned identity and the chosen recording cannot be replaced or rebuilt. A character who reached their first
 *  video with no voice at all may still be given one (that breaks no existing continuity); after that it holds. */
export function voiceLock(c: Pick<Character, 'usage' | 'voice'>): { locked: boolean; reason: 'USED' | 'UNKNOWN' | null } {
  const a = appearanceLock(c);
  const hasVoice = Boolean(c.voice.identity || c.voice.selectedSampleId);
  return a.locked && hasVoice ? { locked: true, reason: a.reason } : { locked: false, reason: null };
}

export const canChangeVoice = (c: Pick<Character, 'usage' | 'voice'>) => !voiceLock(c).locked;

/** Refuse a change of the voice identity of a locked character. `what` names the change for the message. */
export function guardVoiceChange(c: Character, what: string): void {
  if (canChangeVoice(c)) return;
  throw new StudioError('VOICE_LOCKED', `${c.name} has been used in a video; the voice is preserved for continuity (${what}).`, { characterId: c.id, reason: voiceLock(c).reason });
}

/** The assets a locked character's appearance rests on: its portrait and reference views. They cannot be deleted. */
export function protectedAssetOwner(s: StudioState, assetId: string): Character | undefined {
  return s.characters.find((c) => appearanceLock(c).locked && (c.portraitAssetId === assetId || c.refs.some((r) => r.assetId === assetId)));
}

/** Record that every character in this shot has been in this take's video. Idempotent. */
export function recordTakeUsage(characters: Character[], p: Production, shotId: string, takeId: string, at: string): Character[] {
  const sh = p.shots.find((x) => x.id === shotId);
  const take = sh?.takes.find((t) => t.id === takeId);
  if (!sh || !take) return characters;
  const label = `${p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? '?'}.${sh.number}`;
  return characters.map((c) => {
    if (!sh.characterIds.includes(c.id)) return c;
    const usage = c.usage ?? { known: false, videos: [] };
    if (usage.videos.some((v) => v.takeId === takeId && v.shotId === shotId)) return c;
    const record: VideoUsage = { productionId: p.id, productionTitle: p.title, shotId, shotLabel: label, takeId, takeLabel: take.label, recordedAt: at, status: 'IN_TAKE' };
    return { ...c, usage: { ...usage, videos: [...usage.videos, record] } };
  });
}

/** A take went away: its records stay, marked. */
export function markTakeRemoved(characters: Character[], shotId: string, takeId: string): Character[] {
  return characters.map((c) => (c.usage?.videos.some((v) => v.shotId === shotId && v.takeId === takeId)
    ? { ...c, usage: { ...c.usage, videos: c.usage.videos.map((v) => (v.shotId === shotId && v.takeId === takeId ? { ...v, status: 'TAKE_REMOVED' as const } : v)) } }
    : c));
}
