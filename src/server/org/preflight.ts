import type { Character, Production, Shot, StudioState } from '@/domain/types';
import { frameCheckOf } from '@/domain/frames';
import { linesCutAt, performanceSegments, shotPerformers } from '@/domain/music-performance';
import { shotWindows } from '@/domain/timeline';
import type { JobType } from '@/domain/jobs';
import { H3_MAX_FRAMES, H3_MIN_FRAMES } from '@/server/workflows/minimax-h3';
import { boundaryOf, boundaryProblem, clipSecondsFor, continuationTail, guideProblems, needsOpeningFrame, plannedGuides, previousShot, resolveShotPack } from '@/server/production/shot-pack';
import { frameBudget } from '@/server/production/guide';
import { PLATE_WIDE_FRAMINGS } from '@/server/story/prompts';
import { identityConditioning } from '@/server/production/identity-rule';
import { locationPlateVerdict } from '@/server/production/location-rule';
import { canChangeAppearance, isCloneSource, voiceBuildLockProblem } from '@/domain/rules';
import { IRAQI_NEEDS_RECORDING, automaticVoicePlan, castNames, cloneEligible, descriptionProblem, designedIraqiOn, isConsentedUpload, isIraqi, lineRecordingCurrent, pickReference, usableRecordingAsset } from '@/domain/voice-identity';
import { isCanonicalApproved, primaryImageOf, primaryImageSourceOf, usableAudio, usableImage } from '@/domain/identity';
import { castOf, worldOf } from '@/studio/selectors';
import { offStyle, productionStyleProblems } from '@/domain/style-rule';
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
  // ONE STYLE (src/domain/style-rule.ts): the place's plates and each person's canonical image are drawn in their own
  // style; a take conditioned on another style's pictures breaks the production's look
  const offPeople = offStyle(p.style, sh.characterIds, state.characters);
  const offPlace = loc && loc.style !== p.style ? loc : undefined;
  add('one-style', !offPeople.length && !offPlace, 'INCONSISTENT_PLAN', offPeople.length || offPlace ? `the production is ${p.style.toLowerCase()}; ${[...offPeople.map((c) => `${c.name} is ${c.style.toLowerCase()}`), ...(offPlace ? [`${offPlace.name} is ${offPlace.style.toLowerCase()}`] : [])].join(', ')} — use a version in the production's style` : undefined);
  // the prompt
  const hasWords = Boolean(opts.customPrompt || sh.prompt?.trim() || sh.action?.trim());
  add('prompt-complete', hasWords, 'PROMPT_AMBIGUITY', hasWords ? undefined : 'the shot has neither an action nor a prompt');
  const emptyLines = sh.dialogue.filter((d) => !(p.language === 'AR' ? d.textAr || d.text : d.text)?.trim());
  add('lines-have-text', emptyLines.length === 0, 'PROMPT_AMBIGUITY', emptyLines.length ? `${emptyLines.length} empty line(s)` : undefined);
  // the parameters: the clip the engine will really make (frames snapped up, held in the trained range)
  const pack = resolveShotPack(state, p, sh, { backend: opts.backend });
  const clip = clipSecondsFor(pack, sh.durationSeconds);
  add('duration-in-range', sh.durationSeconds >= H3_LIMITS.minSeconds && sh.durationSeconds <= H3_LIMITS.maxSeconds, 'WRONG_PARAMETERS', `${sh.durationSeconds} s → ${clip.frames} frames (${(clip.frames / 24).toFixed(2)} s; engine ${H3_LIMITS.minSeconds}–${H3_LIMITS.maxSeconds} s, trained ${H3_LIMITS.minFrames}–${H3_LIMITS.maxFrames} frames)`);
  // the frame budget (G11): the planned new content must fit after the guide; a plan that does not is refused, never
  // truncated (the worker turns a dialogue that grows past the budget into a hard cut without the guide)
  const budget = frameBudget(pack.trimStartFrames, sh.durationSeconds);
  add('continuation-fits-budget', budget.fits, 'WRONG_PARAMETERS', budget.fits ? (pack.trimStartFrames ? `${budget.neededFrames} new frames after a ${pack.trimStartFrames}-frame guide (budget ${budget.budgetFrames})` : undefined) : `a continuation carries at most ${budget.budgetFrames} new frames (${(budget.budgetFrames / 24).toFixed(1)} s) after its ${pack.trimStartFrames}-frame guide; the planned ${sh.durationSeconds} s needs ${budget.neededFrames} — split the shot (it is never truncated)`);
  // the continuation choice (src/domain/video-capability.ts): a guide length the engine does not keep is never floored
  // silently — the engine default is used and the producer is told which choice was set aside
  if (pack.continuation.problems.length) warnings.push({ name: 'continuation-choice-set-aside', detail: pack.continuation.problems.join('; ') });
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
  // THE ANCHORED FRAMES HOLD THE RIGHT PEOPLE (acceptance 2026-10-05, open item 5): a drawn opening or ending frame
  // whose people count failed is never filmed from — an anchored stranger becomes a person in the take
  for (const [which, aid] of [['opening', pack.opening.kind === 'FRAME' ? pack.opening.assetId : undefined], ['ending', pack.ending?.assetId]] as const) {
    const pc = frameCheckOf(byId(aid));
    if (pc) add(`${which}-frame-people`, pc.ok, 'INCONSISTENT_PLAN', pc.ok ? `${pc.counted} of ${pc.expected} people` : `the ${which} frame holds ${pc.counted} ${pc.counted === 1 ? 'person' : 'people'} where the shot has ${pc.expected}: draw the frames again or remove it`);
  }
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
  // THE IDENTITY RE-APPLICATION RULE on the pack (src/server/production/identity-rule.ts): every present character's
  // canonical image and the place's plate are conditioned on, or the request is refused as MISSING_REFERENCE; the
  // worker checks the same rule again on the request it built (connected files, prompt bindings)
  // THE LOCATION PLATE RULE (src/server/production/location-rule.ts): a place is filmed against its plate (the
  // Location Bible) or, when the scene is marked "establish here", from its identity line; never from words alone
  const plateRule = locationPlateVerdict(pack, scene, loc);
  if (loc) add('location-plate', plateRule.ok, 'MISSING_REFERENCE', plateRule.detail);
  const identity = identityConditioning(pack, sh, cast, p.kind === 'MUSIC_VIDEO' ? loc : loc, {});
  if (identityNeeded || loc) add('identity-conditioning', identity.ok, 'MISSING_REFERENCE', identity.ok ? (identity.lowered ? `waived: ${identity.lowered}` : `${identity.characters.length} character image(s)${identity.location ? (plateRule.mode === 'ESTABLISHING' ? ' and the place from its identity line (establish here)' : ' and the plate') : ''} conditioned on`) : identity.problems.join('; '));
  if (identityNeeded) {
    const missing = inShot.filter((c) => !usableImage(byId(primaryImageOf(c))));
    const legacy = inShot.filter((c) => primaryImageSourceOf(c) === 'PORTRAIT' && usableImage(byId(c.portraitAssetId)));
    add('every-character-has-image', missing.length === 0, 'MISSING_REFERENCE', missing.length ? `no canonical image for ${missing.map((c) => c.name).join(', ')}; draw the character first` : legacy.length ? `legacy portrait for ${legacy.map((c) => c.name).join(', ')}` : undefined);
    const w = identityWarning(inShot);
    if (w) warnings.push(w);
    // FIRST USE LOCKS THE LOOK (docs/CHARACTER-CONTINUITY.md): a take of a character never seen in a video freezes
    // the appearance it was made with, so a DRAFT canonical image is approved before its first take — afterwards a
    // draft can no longer be redrawn (cloud directive §11: "approved canonical characters exist")
    const firstUseDraft = inShot.filter((c) => c.canonicalImage?.status === 'DRAFT' && c.usage?.known === true && c.usage.videos.length === 0);
    add('canonical-approved-before-first-use', firstUseDraft.length === 0, 'MISSING_REFERENCE', firstUseDraft.length ? `approve the canonical image of ${firstUseDraft.map((c) => c.name).join(', ')} first: the first take locks the look it was filmed with` : undefined);
  }
  // THE AUTHORITATIVE AUDIO FITS THE CLIP (audio first, directive §7): the lines (recorded lengths, else an estimate)
  // with their lead-in, gaps and tail must fit the new picture the engine can make for this shot — a shot whose words
  // do not fit is split in the plan, never truncated or sped up
  const timed = pack.context.shot.dialogue;
  if (p.kind !== 'MUSIC_VIDEO' && timed.length) {
    const speech = timed.reduce((a, l) => a + (l.durationSeconds ?? 0), 0) + 0.4 + 0.35 * (timed.length - 1) + 0.3;
    const room = (H3_LIMITS.maxFrames - pack.trimStartFrames) / 24;
    const estimated = timed.some((l) => l.source === 'ESTIMATE');
    add('dialogue-fits-clip', speech <= room, 'WRONG_PARAMETERS', `${speech.toFixed(1)} s of dialogue${estimated ? ' (partly estimated: not yet recorded)' : ' (recorded)'} in at most ${room.toFixed(1)} s of new picture${speech > room ? ': split the shot' : ''}`);
  }
  // the production context's gaps (src/domain/production-context.ts): named, never invented
  for (const gap of pack.context.gaps) warnings.push({ name: 'context-gap', detail: gap });
  if (pack.context.anchoring.reanchor) warnings.push({ name: 're-anchor', detail: pack.context.anchoring.why ?? 're-anchoring' });
  // A CLOSE SHOT WITHOUT ITS OPENING FRAME (acceptance 2026-10-06, G13: every close shot without a drawn frame opened on
  // the plate's wide composition and pushed in for 2–3 s to reach its framing): draw the frames first
  if (opts.backend === 'local' && pack.location && pack.opening.kind === 'NONE' && !PLATE_WIDE_FRAMINGS.includes(sh.framing)) {
    const auto = needsOpeningFrame(pack, sh, state.settings, { customPrompt: opts.customPrompt });
    warnings.push({ name: 'opening-frame-missing', detail: auto ? `a ${sh.framing.toLowerCase().replace(/_/g, ' ')} with no opening frame: the take draws it first (a close shot without one opens on the place's wide plate and pushes in)` : `a ${sh.framing.toLowerCase().replace(/_/g, ' ')} with no opening frame starts from the place's wide plate and tends to push in to reach its framing: draw the shot's frames first` });
  }
  // THE 180° LINE, SCREEN DIRECTION, DIRECTION OF TRAVEL (src/domain/blocking.ts): staging that contradicts an earlier
  // shot of the scene is named before the generation — a warning, since a director may cross the line on purpose
  // (and then marks the shot `crossesLine`)
  for (const v of pack.context.blocking.violations) warnings.push({ name: 'screen-direction', detail: `${v.characterIds.map((id) => cast.find((c) => c.id === id)?.name ?? id).join(' and ')}: ${v.detail}`, characterIds: v.characterIds });
  // audio before video: a speaking shot (film, local engine) needs a voice for every speaker, judged as the worker
  // judges it (take.ts): every line of the speaker already has a current stored recording (reused), or there is a
  // reference to speak from (pickReference: a design seed, or a consented recording that is present). A speaker with
  // neither would be voiced by the engine's default voice, so the preflight refuses rather than pass it.
  const speakers = Array.from(new Set(sh.dialogue.map((d) => d.characterId)));
  if (p.kind !== 'MUSIC_VIDEO' && speakers.length && opts.backend === 'local' && !opts.customPrompt) {
    const spoken = (d: Shot['dialogue'][number]) => Boolean((p.language === 'AR' ? d.textAr || d.text : d.text)?.trim());
    const linesStored = (c: Character) => { const mine = sh.dialogue.filter((d) => d.characterId === c.id && spoken(d)); return mine.length > 0 && mine.every((d) => lineRecordingCurrent(d, c, state.assets)); };
    const voiceless = speakers.map((id) => cast.find((c) => c.id === id)).filter((c): c is Character => Boolean(c) && !linesStored(c!) && !pickReference(c!, state.assets));
    const unconsented = voiceless.filter((c) => c.voice.samples.some((s) => s.source === 'UPLOADED' && !isConsentedUpload(s) && usableRecordingAsset(byId(s.assetId))));
    add('speakers-have-voices', voiceless.length === 0, 'MISSING_REFERENCE', voiceless.length ? `no usable voice for ${voiceless.map((c) => c.name).join(', ')}; build one on the Voice tab${unconsented.length ? ` (${unconsented.map((c) => c.name).join(', ')}: a recording is waiting for its consent statement)` : ''}` : `${speakers.length} speaker(s) with a voice`);
    add('voice-references-within-limit', speakers.length <= H3_LIMITS.maxReferenceAudio, 'UNSUPPORTED_CAPABILITY', `${speakers.length} speaker(s), limit ${H3_LIMITS.maxReferenceAudio}`);
  }
  // a music video shot needs the song and its stretch
  if (p.kind === 'MUSIC_VIDEO' && (sh.performance?.mode ?? 'SOLO') !== 'INSTRUMENTAL') {
    const song = byId(p.song?.assetId);
    add('song-present', usableAudio(song), 'MISSING_REFERENCE', usableAudio(song) ? undefined : 'the music video has no generated or uploaded song yet');
  }
  // THE PERFORMANCE PLAN (src/domain/music-performance.ts): a shot boundary in the middle of a measured sung line
  // breaks the performance (a word cut in two); someone in the shot who does not perform there must keep lips closed
  if (p.kind === 'MUSIC_VIDEO' && p.song) {
    const w = shotWindows(p).get(sh.id);
    if (w) {
      const broken = linesCutAt(performanceSegments(p.song), w);
      if (broken.length) warnings.push({ name: 'cuts-sung-line', detail: broken.map((b) => `the shot ${Math.abs(b.at - w.from) < 1e-6 ? 'starts' : 'ends'} at ${b.at.toFixed(2)} s, inside the sung line “${b.segment.text}” (${b.segment.from.toFixed(2)}–${b.segment.to.toFixed(2)} s)`).join('; ') });
      const perf = shotPerformers(p.song, w, sh.characterIds);
      if (perf.silent.length && (perf.lead.length || perf.backing.length)) warnings.push({ name: 'non-performers-in-shot', detail: `${perf.silent.map((id) => cast.find((c) => c.id === id)?.name ?? id).join(', ')} ${perf.silent.length === 1 ? 'does' : 'do'} not sing here: told to keep lips closed; the singing check flags anyone who does`, characterIds: perf.silent });
    }
  }
  // THE BOUNDARY (src/domain/types.ts ShotBoundary): an explicit `continuous` needs a previous shot in the same scene
  // with a usable tail — a chosen real take whose window on the cut holds the guide's frames (a shorter one would be
  // floored by the node, gap V1); an explicit `cut` on the same moment needs a previous shot in the same scene. An
  // older plan's CONTINUATION at a scene's start is lowered to a cut, as before.
  const { boundary, explicit } = boundaryOf(sh);
  if (explicit) {
    const problem = boundaryProblem(state, p, sh, pack.backend);
    add('boundary-honoured', !problem, 'INCONSISTENT_PLAN', problem ?? `${boundary}: ${pack.relation.toLowerCase().replace('_', ' ')}`);
  }
  if (boundary === 'continuous') {
    const prev = previousShot(p, sh);
    const sameScene = Boolean(prev && prev.sceneId === sh.sceneId);
    const tail = sameScene ? continuationTail(state, p, prev, pack.continuation.guideFrames || undefined) : undefined;
    const ok = !sameScene || Boolean(tail?.source);
    add('continuation-source-ready', ok, 'INCONSISTENT_PLAN', ok ? (sameScene ? `previous take available (${pack.opening.kind === 'TAIL' ? `its last ${pack.opening.frames} frames${pack.opening.withAudio ? ' and their sound' : ' without their sound (it speaks there; this shot has no lines)'} at frame 0; its window shows ${tail?.windowFrames ?? '?'} frames` : pack.opening.kind === 'LAST_FRAME_AS_FIRST' ? 'its last frame as the first frame (hosted)' : 'tail'})` : 'first shot of its scene; treated as a cut') : `this shot continues shot ${prev?.number}: ${tail?.problem ?? 'no usable tail'}`);
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
export function preflightPlan(p: Production, sceneIds?: string[], state?: Pick<StudioState, 'characters' | 'locations'>): Preflight {
  const checks: PreflightCheck[] = [];
  const targets = sceneIds?.length ? p.scenes.filter((sc) => sceneIds.includes(sc.id)) : p.scenes;
  // one style (src/domain/style-rule.ts): the shots are planned against the place's plates and the cast's images
  if (state) {
    const off = productionStyleProblems(state, { ...p, scenes: targets });
    const names = [...off.people, ...off.places].map((x) => `${x.name} (${x.style.toLowerCase()})`);
    checks.push({ name: 'one-style', ok: names.length === 0, failureClass: 'INCONSISTENT_PLAN', detail: names.length ? `the production is ${p.style.toLowerCase()}; ${names.join(', ')} — use versions in its style` : undefined });
  }
  checks.push({ name: 'scenes-present', ok: targets.length > 0, failureClass: 'INVALID_INPUT', detail: `${targets.length} scene(s)` });
  const unwritten = targets.filter((sc) => sc.beats.length === 0);
  checks.push({ name: 'scenes-written', ok: unwritten.length === 0, failureClass: 'INCONSISTENT_PLAN', detail: unwritten.length ? `${unwritten.length} scene(s) without beats` : undefined });
  const noLocation = targets.filter((sc) => !sc.locationId);
  checks.push({ name: 'scenes-located', ok: noLocation.length === 0, failureClass: 'INCONSISTENT_PLAN', detail: noLocation.length ? `${noLocation.length} scene(s) without a location` : undefined });
  return { ok: checks.every((c) => c.ok), checks, warnings: [] };
}

