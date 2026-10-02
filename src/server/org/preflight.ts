import type { Asset, Production, Shot, StudioState } from '@/domain/types';
import { orderedShots } from '@/domain/timeline';
import { castOf, worldOf } from '@/studio/selectors';
import type { FailureClass } from './model';

/** PREFLIGHT — what must be true before an engine is asked for anything. Each check names the failure class a
 *  violation would be, so a refused request is already classified and the correction is named; nothing is retried
 *  blindly. The checks are pure (state in, verdict out) so the same preflight runs in the worker and in tests. */

export interface PreflightCheck { name: string; ok: boolean; detail?: string; failureClass: FailureClass }
export interface Preflight { ok: boolean; checks: PreflightCheck[] }

/** MiniMax H3 limits as the local graphs apply them. */
export const H3_LIMITS = { maxReferenceImages: 9, maxReferenceAudio: 3, minSeconds: 1, maxSeconds: 15, maxGuides: 4 } as const;

const usableImage = (a?: Asset) => Boolean(a && a.kind === 'IMAGE' && !a.sample && a.mimeType !== 'image/svg+xml');
const usableAudio = (a?: Asset) => Boolean(a && a.kind === 'AUDIO' && !a.sample);

export function preflightTake(state: StudioState, p: Production, sh: Shot, opts: { backend: 'local' | 'api'; customPrompt?: boolean }): Preflight {
  const checks: PreflightCheck[] = [];
  const add = (name: string, ok: boolean, failureClass: FailureClass, detail?: string) => checks.push({ name, ok, failureClass, detail });
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  const cast = castOf(state, p); const world = worldOf(state, p);
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  // the plan
  add('scene-exists', Boolean(scene), 'INCONSISTENT_PLAN', scene ? undefined : `shot ${sh.id} belongs to no scene of the production`);
  const loc = world.find((l) => l.id === scene?.locationId);
  add('location-resolved', p.kind === 'MUSIC_VIDEO' || Boolean(loc), 'INCONSISTENT_PLAN', loc ? loc.name : 'the scene has no location in this production’s world');
  const unknownCast = sh.characterIds.filter((id) => !cast.some((c) => c.id === id));
  add('characters-in-cast', unknownCast.length === 0, 'INCONSISTENT_PLAN', unknownCast.length ? `${unknownCast.length} character id(s) are not in the cast` : undefined);
  const unknownSpeakers = sh.dialogue.filter((d) => !cast.some((c) => c.id === d.characterId));
  add('speakers-in-cast', unknownSpeakers.length === 0, 'INCONSISTENT_PLAN', unknownSpeakers.length ? `${unknownSpeakers.length} line(s) belong to nobody in the cast` : undefined);
  // the prompt
  const hasWords = Boolean(opts.customPrompt || sh.prompt?.trim() || sh.action?.trim());
  add('prompt-complete', hasWords, 'PROMPT_AMBIGUITY', hasWords ? undefined : 'the shot has neither an action nor a prompt');
  const emptyLines = sh.dialogue.filter((d) => !(p.language === 'AR' ? d.textAr || d.text : d.text)?.trim());
  add('lines-have-text', emptyLines.length === 0, 'PROMPT_AMBIGUITY', emptyLines.length ? `${emptyLines.length} empty line(s)` : undefined);
  // the parameters
  add('duration-in-range', sh.durationSeconds >= H3_LIMITS.minSeconds && sh.durationSeconds <= H3_LIMITS.maxSeconds, 'WRONG_PARAMETERS', `${sh.durationSeconds} s (engine: ${H3_LIMITS.minSeconds}–${H3_LIMITS.maxSeconds} s)`);
  // references and their limits
  const opening = byId(sh.openingFrameAssetId);
  const portraits = sh.characterIds.map((id) => byId(cast.find((c) => c.id === id)?.portraitAssetId)).filter(usableImage);
  const plate = byId(loc?.masterAssetId);
  const pictures = (usableImage(opening) ? 1 : 0) + portraits.length + (usableImage(plate) ? 1 : 0);
  add('reference-pictures-within-limit', pictures <= H3_LIMITS.maxReferenceImages, 'UNSUPPORTED_CAPABILITY', `${pictures} picture(s), limit ${H3_LIMITS.maxReferenceImages}`);
  const identityNeeded = sh.characterIds.length > 0;
  const identityOk = !identityNeeded || usableImage(opening) || portraits.length > 0;
  add('identity-reference-present', identityOk, 'MISSING_REFERENCE', identityOk ? (usableImage(opening) ? 'opening frame' : `${portraits.length} portrait(s)`) : 'the shot has characters but neither an opening frame nor a portrait to hold their identity; draw them first');
  if (identityNeeded) {
    const missing = sh.characterIds.map((id) => cast.find((c) => c.id === id)).filter((c) => c && !usableImage(byId(c.portraitAssetId))).map((c) => c!.name);
    add('every-character-has-portrait', missing.length === 0, 'MISSING_REFERENCE', missing.length ? `no portrait for ${missing.join(', ')}` : undefined);
  }
  // audio before video: a speaking shot (film, local engine) needs a canonical voice for every speaker
  const speakers = Array.from(new Set(sh.dialogue.map((d) => d.characterId)));
  if (p.kind !== 'MUSIC_VIDEO' && speakers.length && opts.backend === 'local' && !opts.customPrompt) {
    const voiceless = speakers.map((id) => cast.find((c) => c.id === id)).filter((c) => c && !c.voice.samples.some((s) => s.assetId && usableAudio(byId(s.assetId)))).map((c) => c!.name);
    add('speakers-have-voices', voiceless.length === 0, 'MISSING_REFERENCE', voiceless.length ? `no voice recording for ${voiceless.join(', ')}; upload one on the Voice tab` : `${speakers.length} speaker(s) with recordings`);
    add('voice-references-within-limit', speakers.length <= H3_LIMITS.maxReferenceAudio, 'UNSUPPORTED_CAPABILITY', `${speakers.length} speaker(s), limit ${H3_LIMITS.maxReferenceAudio}`);
  }
  // a music video shot needs the song and its stretch
  if (p.kind === 'MUSIC_VIDEO' && (sh.performance?.mode ?? 'SOLO') !== 'INSTRUMENTAL') {
    const song = byId(p.song?.assetId);
    add('song-present', usableAudio(song), 'MISSING_REFERENCE', usableAudio(song) ? undefined : 'the music video has no generated or uploaded song yet');
  }
  // a continuation needs the take it continues
  if (sh.continuity?.relationToPrevious === 'CONTINUATION') {
    const ordered = orderedShots(p);
    const prev = ordered[ordered.findIndex((x) => x.id === sh.id) - 1];
    const sameScene = prev && prev.sceneId === sh.sceneId;
    const prevTake = prev?.takes.find((t) => t.id === prev.selectedTakeId);
    const ok = !sameScene || Boolean(prevTake && prevTake.provider !== 'SAMPLE' && byId(prevTake.assetId)?.kind === 'VIDEO');
    add('continuation-source-ready', ok, 'INCONSISTENT_PLAN', ok ? (sameScene ? 'previous take available' : 'first shot of its scene; treated as a cut') : `shot ${prev?.number} has no accepted take yet; this shot continues it`);
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** What must exist before a scene can be planned into shots. */
export function preflightPlan(p: Production, sceneIds?: string[]): Preflight {
  const checks: PreflightCheck[] = [];
  const targets = sceneIds?.length ? p.scenes.filter((sc) => sceneIds.includes(sc.id)) : p.scenes;
  checks.push({ name: 'scenes-present', ok: targets.length > 0, failureClass: 'INVALID_INPUT', detail: `${targets.length} scene(s)` });
  const unwritten = targets.filter((sc) => sc.beats.length === 0);
  checks.push({ name: 'scenes-written', ok: unwritten.length === 0, failureClass: 'INCONSISTENT_PLAN', detail: unwritten.length ? `${unwritten.length} scene(s) without beats` : undefined });
  const noLocation = targets.filter((sc) => !sc.locationId);
  checks.push({ name: 'scenes-located', ok: noLocation.length === 0, failureClass: 'INCONSISTENT_PLAN', detail: noLocation.length ? `${noLocation.length} scene(s) without a location` : undefined });
  return { ok: checks.every((c) => c.ok), checks };
}
