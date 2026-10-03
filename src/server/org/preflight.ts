import type { Asset, Character, Production, Shot, StudioState } from '@/domain/types';
import type { JobType } from '@/domain/jobs';
import { H3_MAX_FRAMES, H3_MIN_FRAMES } from '@/server/workflows/minimax-h3';
import { clipSecondsFor, continuationSource, guideProblems, plannedGuides, previousShot, resolveShotPack } from '@/server/production/shot-pack';
import { canChangeAppearance, isCloneSource, voiceBuildLockProblem } from '@/domain/rules';
import { IRAQI_NEEDS_RECORDING, automaticVoicePlan, castNames, cloneEligible, descriptionProblem, designedIraqiOn, isConsentedUpload, isIraqi } from '@/domain/voice-identity';
import { isCanonicalApproved, primaryImageOf, primaryImageSourceOf } from '@/domain/identity';
import { castOf, worldOf } from '@/studio/selectors';
import type { FailureClass } from './model';

/** PREFLIGHT — what must be true before an engine is asked for anything. Each check names the failure class a
 *  violation would be, so a refused request is already classified and the correction is named; nothing is retried
 *  blindly. The checks are pure (state in, verdict out) so the same preflight runs in the worker and in tests. */

export interface PreflightCheck { name: string; ok: boolean; detail?: string; failureClass: FailureClass }
/** Something the producer should know that does not stop the job (e.g. "identity not approved"). Kept apart from
 *  `checks` so every reader of a failed check keeps meaning a refusal. */
export interface PreflightWarning { name: string; detail: string; characterIds?: string[] }
export interface Preflight { ok: boolean; checks: PreflightCheck[]; warnings: PreflightWarning[] }

/** The identity warning (docs/CONTRACTS-IDENTITY-PACK.md v2 §3): a character whose canonical image is not APPROVED
 *  can be cast and filmed, but the producer is told. */
function identityWarning(characters: Character[]): PreflightWarning | null {
  const pending = characters.filter((c) => !isCanonicalApproved(c));
  if (!pending.length) return null;
  return { name: 'identity-approved', detail: `identity not approved: ${pending.map((c) => `${c.name} (${c.canonicalImage ? `draft v${c.canonicalImage.version}` : primaryImageSourceOf(c) === 'PORTRAIT' ? 'legacy portrait, no canonical image' : 'no canonical image'})`).join(', ')}`, characterIds: pending.map((c) => c.id) };
}

/** MiniMax H3 limits as the local graphs apply them — verified in ComfyUI v0.38.1 `nodes_minimax_h3.py`:
 *  `MiniMaxH3ReferenceToVideo` takes at most 9 pictures, 3 videos and 3 audios; frames snap up to the 17k+5 grid and
 *  the trained range is 124–362 frames; guide clips are 5, 22, 39 … frames and must fit inside the clip. The studio
 *  chains at most 4 guides. */
export const H3_LIMITS = { maxReferenceImages: 9, maxReferenceVideos: 3, maxReferenceAudio: 3, minSeconds: 1, maxSeconds: 15, maxGuides: 4, minFrames: H3_MIN_FRAMES, maxFrames: H3_MAX_FRAMES } as const;

const usableImage = (a?: Asset) => Boolean(a && a.kind === 'IMAGE' && !a.sample && a.mimeType !== 'image/svg+xml');
const usableAudio = (a?: Asset) => Boolean(a && a.kind === 'AUDIO' && !a.sample);

export function preflightTake(state: StudioState, p: Production, sh: Shot, opts: { backend: 'local' | 'api'; customPrompt?: boolean }): Preflight {
  const checks: PreflightCheck[] = [];
  const warnings: PreflightWarning[] = [];
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
  // the parameters: the clip the engine will really make (frames snapped up, held in the trained range)
  const pack = resolveShotPack(state, p, sh, { backend: opts.backend });
  const clip = clipSecondsFor(pack, sh.durationSeconds);
  add('duration-in-range', sh.durationSeconds >= H3_LIMITS.minSeconds && sh.durationSeconds <= H3_LIMITS.maxSeconds, 'WRONG_PARAMETERS', `${sh.durationSeconds} s → ${clip.frames} frames (${(clip.frames / 24).toFixed(2)} s; engine ${H3_LIMITS.minSeconds}–${H3_LIMITS.maxSeconds} s, trained ${H3_LIMITS.minFrames}–${H3_LIMITS.maxFrames} frames)`);
  if (clip.truncated) warnings.push({ name: 'continuation-length', detail: `a continuation carries at most ${clip.newFrames} new frames (${(clip.newFrames / 24).toFixed(1)} s) after its ${pack.trimStartFrames}-frame guide; the planned ${sh.durationSeconds} s is cut short — split the shot` });
  // references and their limits (the pack's slot order): each character's primary image is the canonical front
  // full-body image (a character drawn before canonical images falls back to the legacy portrait), then the plate,
  // then the drawn opening frame when it is bound as a picture
  const inShot = sh.characterIds.map((id) => cast.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
  const primaries = inShot.map((c) => byId(primaryImageOf(c))).filter(usableImage);
  add('reference-pictures-within-limit', pack.pictures.length <= H3_LIMITS.maxReferenceImages, 'UNSUPPORTED_CAPABILITY', `${pack.pictures.length} picture(s) (${pack.subjects.length} character(s)${pack.location ? ', the plate' : ''}${pack.openingPicture ? ', the opening frame' : ''}), limit ${H3_LIMITS.maxReferenceImages}`);
  const overBudget = pack.unreferenced.filter((u) => /budget/.test(u.reason));
  if (overBudget.length) warnings.push({ name: 'characters-over-picture-budget', detail: `${overBudget.length} character(s) beyond the ${H3_LIMITS.maxReferenceImages}-picture budget go unreferenced: ${overBudget.map((u) => cast.find((c) => c.id === u.characterId)?.name ?? u.characterId).join(', ')}`, characterIds: overBudget.map((u) => u.characterId) });
  // identity comes from the characters' own images on every shot (an opening frame is a production asset, not an
  // identity; a hosted continuation in frame mode is the one documented exception)
  const identityNeeded = sh.characterIds.length > 0;
  const identityOk = !identityNeeded || primaries.length > 0 || (pack.opening.kind === 'LAST_FRAME_AS_FIRST');
  add('identity-reference-present', identityOk, 'MISSING_REFERENCE', identityOk ? (identityNeeded ? (pack.graph === 'FRAMES' ? 'the previous take’s last frame (hosted frame mode)' : `${pack.subjects.length} character image(s) bound as subjects`) : undefined) : 'the shot has characters but none has a canonical image to hold their identity; draw them first');
  // guides: count and fit, as the request will chain them (the soundtrack guide exists for a speaking or singing shot)
  const soundtrack = opts.backend === 'local' && !opts.customPrompt && ((p.kind === 'MUSIC_VIDEO' && Boolean(p.song?.assetId) && (sh.performance?.mode ?? 'SOLO') !== 'INSTRUMENTAL') || (p.kind !== 'MUSIC_VIDEO' && sh.dialogue.length > 0));
  const guides = plannedGuides(pack, { soundtrack });
  add('guides-within-limit', guides.length <= H3_LIMITS.maxGuides, 'UNSUPPORTED_CAPABILITY', `${guides.length} guide(s)${guides.length ? ` (${guides.map((g) => `${g.kind.toLowerCase()}@${g.frameIdx}`).join(', ')})` : ''}, limit ${H3_LIMITS.maxGuides}`);
  const misfit = guideProblems(guides, clip.frames);
  add('guides-fit-clip', misfit.length === 0, 'WRONG_PARAMETERS', misfit.length ? misfit.join('; ') : undefined);
  // the editorial transition agrees with the relation (relationToPrevious decides the request; transition only renders)
  if (pack.relation === 'CONTINUATION' && (sh.transition === 'DISSOLVE' || sh.transition === 'FADE')) warnings.push({ name: 'transition-matches-relation', detail: `a continuation is joined by a cut, not a ${sh.transition.toLowerCase()}` });
  if (pack.relation === 'CUT' && sh.transition === 'EXTEND') warnings.push({ name: 'transition-matches-relation', detail: 'EXTEND on a shot planned as a cut: it is generated as a cut (relationToPrevious decides)' });
  if (pack.lowering) warnings.push({ name: 'hosted-lowering', detail: pack.lowering });
  if (identityNeeded) {
    const missing = inShot.filter((c) => !usableImage(byId(primaryImageOf(c))));
    const legacy = inShot.filter((c) => primaryImageSourceOf(c) === 'PORTRAIT' && usableImage(byId(c.portraitAssetId)));
    add('every-character-has-image', missing.length === 0, 'MISSING_REFERENCE', missing.length ? `no canonical image for ${missing.map((c) => c.name).join(', ')}; draw the character first` : legacy.length ? `legacy portrait for ${legacy.map((c) => c.name).join(', ')}` : undefined);
    const w = identityWarning(inShot);
    if (w) warnings.push(w);
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
    const prev = previousShot(p, sh);
    const sameScene = Boolean(prev && prev.sceneId === sh.sceneId);
    const ok = !sameScene || Boolean(continuationSource(state, prev));
    add('continuation-source-ready', ok, 'INCONSISTENT_PLAN', ok ? (sameScene ? `previous take available (${pack.opening.kind === 'TAIL' ? `its last ${pack.opening.frames} frames${pack.opening.withAudio ? ' and their sound' : ' without their sound (it speaks there; this shot has no lines)'} at frame 0` : pack.opening.kind === 'LAST_FRAME_AS_FIRST' ? 'its last frame as the first frame (hosted)' : 'tail'})` : 'first shot of its scene; treated as a cut') : `shot ${prev?.number} has no accepted take yet; this shot continues it`);
  }
  return { ok: checks.every((c) => c.ok), checks, warnings };
}

/** Why a picture cannot be drawn from, or null when it can: it must be a real uploaded picture (never a bundled
 *  sample), present on disk, at least 512 px on its short side, and not refused by the upload validation. */
export function referenceImageProblem(state: StudioState, assetId: string | undefined, validation?: { ok: boolean; reasons: string[] }): string | null {
  if (!assetId) return 'no reference picture';
  const a = state.assets.find((x) => x.id === assetId);
  if (!a) return `reference picture ${assetId} no longer exists`;
  if (a.kind !== 'IMAGE') return 'the reference is not a picture';
  if (a.sample) return 'the reference is a bundled sample picture, not an upload';
  if (a.mimeType === 'image/svg+xml') return 'the reference is an SVG';
  if (a.unavailable) return 'the reference picture’s file is missing from the library';
  if (a.width && a.height && Math.min(a.width, a.height) < 512) return `the reference is ${a.width}×${a.height}; at least 512 px on the short side is needed`;
  if (validation && !validation.ok) return `the reference failed validation: ${validation.reasons.join(', ') || 'unusable'}`;
  return null;
}

/** Why a recording cannot be cloned from, or null: the sample must be the producer's upload with a real audio file. */
export function referenceAudioProblem(state: StudioState, sample: Character['voice']['samples'][number] | undefined): string | null {
  if (!sample) return 'no recording';
  if (!isCloneSource(sample)) return sample.source === 'GENERATED' ? 'a generated line cannot be cloned from; upload a recording' : 'a bundled sample voice cannot be cloned from; upload a recording';
  const a = state.assets.find((x) => x.id === sample.assetId);
  if (!a) return `the recording ${sample.assetId} no longer exists`;
  if (a.kind !== 'AUDIO' || a.sample) return 'the recording is not an uploaded audio file';
  if (a.unavailable) return 'the recording’s file is missing from the library';
  if (sample.provenance?.validation && !sample.provenance.validation.speech.present) return 'the recording has no speech in it';
  return null;
}

/** What must be true before a character job is queued: the references it would draw or clone from are usable
 *  (MISSING_REFERENCE names what to upload) and the character is not locked for that kind of change. */
export function preflightCharacter(state: StudioState, c: Character, type: JobType, payload: Record<string, unknown> = {}): Preflight {
  const checks: PreflightCheck[] = [];
  const warnings: PreflightWarning[] = [];
  const add = (name: string, ok: boolean, failureClass: FailureClass, detail?: string) => checks.push({ name, ok, failureClass, detail });
  if (type === 'CHARACTER_APPEARANCE' || type === 'CHARACTER_REFS') {
    add('appearance-unlocked', canChangeAppearance(c), 'INCONSISTENT_PLAN', canChangeAppearance(c) ? undefined : `${c.name} has been used in a video; the appearance is preserved`);
  }
  if (type === 'CHARACTER_APPEARANCE') {
    // a redraw of an approved image is a new DRAFT version until the producer approves it again
    if (canChangeAppearance(c) && isCanonicalApproved(c)) warnings.push({ name: 'approved-identity-redrawn', detail: `${c.name}’s approved canonical image (v${c.canonicalImage!.version}) is replaced by a draft until the new one is approved`, characterIds: [c.id] });
  } else {
    const w = identityWarning([c]);
    if (w) warnings.push(w);
  }
  if (type === 'CHARACTER_APPEARANCE' && c.pendingReference) {
    const problem = referenceImageProblem(state, c.pendingReference.assetId, c.pendingReference.validation);
    add('reference-picture-usable', !problem, 'MISSING_REFERENCE', problem ? `${problem}; upload another picture or clear the reference to draw from the description` : 'reference picture ready');
  }
  if (type === 'CHARACTER_REFS') {
    // optional secondary material is drawn from the primary image: the canonical image, or the legacy portrait of a
    // character drawn before canonical images
    const problem = referenceImageProblem(state, primaryImageOf(c));
    add('primary-image-usable', !problem, 'MISSING_REFERENCE', problem ? `${problem}; draw the character first` : primaryImageSourceOf(c) === 'CANONICAL' ? 'canonical image ready' : 'legacy portrait ready');
  }
  if (type === 'VOICE_BUILD') {
    const mode = (payload.mode as string | undefined) ?? 'AUTOMATIC';
    // a voice locked by its chosen recording alone may be built only from that recording (AUTOMATIC is held to it)
    const lockProblem = voiceBuildLockProblem(c, mode === 'REFERENCE' ? (payload.referenceSampleId as string | undefined) : mode === 'AUTOMATIC' ? c.voice.selectedSampleId : undefined);
    add('voice-unlocked', !lockProblem, 'INCONSISTENT_PLAN', lockProblem ?? undefined);
    if (mode === 'REFERENCE') {
      const sample = c.voice.samples.find((s) => s.id === payload.referenceSampleId);
      const problem = referenceAudioProblem(state, sample);
      add('reference-recording-usable', !problem, 'MISSING_REFERENCE', problem ?? `cloning from “${sample?.label}”`);
      // contract v2 §1: a real person's recording is cloned only with the producer's consent statement
      if (!problem && sample) add('reference-recording-consented', isConsentedUpload(sample), 'INVALID_INPUT', isConsentedUpload(sample) ? `consent: ${sample.consent!.statement}` : `“${sample.label}” has no consent statement (CONSENT_REQUIRED); confirm that it is your voice or that the speaker gave permission`);
    } else if (mode === 'AUTOMATIC') {
      // contract v2 §2: a consented recording, else a design (EN/MSA), else the Iraqi refusal
      const plan = automaticVoicePlan(c, state.assets, state.settings);
      add('automatic-voice-source', plan.kind !== 'REFUSE', plan.kind === 'REFUSE' && plan.code === 'CONSENT_REQUIRED' ? 'INVALID_INPUT' : 'MISSING_REFERENCE', plan.kind === 'UPLOAD' ? `cloning from the consented recording “${plan.label}”` : plan.kind === 'DESIGN' ? (plan.experiment ? 'designing an Arabic seed for the Iraqi engine (experiment: dialect unverified, REVIEW)' : `designing a voice from ${c.name}’s profile (studio-designed synthetic voice)`) : plan.message);
    } else if (mode === 'DESIGN') {
      const problem = designChoiceProblem(state, c, payload.designId as string | undefined, payload.candidate as number | undefined);
      add('design-candidate-usable', !problem, 'MISSING_REFERENCE', problem ?? `design ${String(payload.designId)} candidate ${String(payload.candidate)}`);
    } else if (mode === 'MANUAL') {
      add('catalogue-voice-named', Boolean(payload.providerVoiceId), 'INVALID_INPUT', payload.providerVoiceId ? String(payload.providerVoiceId) : 'a catalogue voice needs providerVoiceId');
    }
  }
  if (type === 'VOICE_DESIGN') {
    const lockProblem = voiceBuildLockProblem(c, undefined);
    add('voice-unlocked', !lockProblem, 'INCONSISTENT_PLAN', lockProblem ?? undefined);
    const iraqiRefused = isIraqi(c) && !designedIraqiOn(state.settings);
    add('design-language', !iraqiRefused, 'MISSING_REFERENCE', iraqiRefused ? IRAQI_NEEDS_RECORDING : isIraqi(c) ? 'Iraqi designed-seed experiment (dialect unverified, REVIEW)' : `${c.language === 'AR' ? 'MSA' : 'English'} design`);
    const description = typeof payload.description === 'string' ? payload.description : undefined;
    if (description !== undefined) {
      const problem = descriptionProblem(description, castNames(state));
      add('description-describes-attributes', !problem, 'INVALID_INPUT', problem ? `the description is refused (Rule V-DESIGN): ${problem}` : undefined);
    }
  }
  return { ok: checks.every((x) => x.ok), checks, warnings };
}

/** Why a design candidate cannot be pinned (VOICE_BUILD DESIGN), or null: the record and candidate exist on this
 *  character, its seed file is there, it can be a clone reference (≤ 11.5 s, no clipped samples), and an Iraqi design
 *  needs the experiment switch. The file's sha256 is checked by the worker at the clone boundary (Rule V-DESIGN). */
export function designChoiceProblem(state: StudioState, c: Character, designId: string | undefined, candidate: number | undefined): string | null {
  const rec = c.voice.designs?.find((d) => d.id === designId);
  if (!rec) return `${c.name} has no voice design ${designId ?? '(none named)'}; design a voice first`;
  const cand = rec.candidates.find((x) => x.index === candidate);
  if (!cand) return `design ${rec.id} has no candidate ${candidate ?? '(none named)'}`;
  const a = state.assets.find((x) => x.id === cand.assetId);
  if (!a || a.kind !== 'AUDIO' || a.unavailable) return `candidate ${cand.index}'s seed file is missing from the library`;
  if (!cloneEligible(cand)) return `candidate ${cand.index} cannot be a voice reference (${cand.durationSeconds.toFixed(2)} s, ${cand.measured.clippedSamples ?? 0} clipped samples; a reference is at most 11.5 s with none)`;
  if (isIraqi(c) && !designedIraqiOn(state.settings)) return IRAQI_NEEDS_RECORDING;
  return null;
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
  return { ok: checks.every((c) => c.ok), checks, warnings: [] };
}
