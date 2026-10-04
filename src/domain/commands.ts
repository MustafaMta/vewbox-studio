import { z } from 'zod';
import type { StudioState } from './types';
import * as A from './actions';
import { withCommandContext } from './ids';
import { StudioError } from './errors';
import { ASPECTS, CAMERA_MOVES, DIALECTS, FRAMINGS, KINDS, LANGUAGES, LOCATION_REF_ROLES, LYRIC_KINDS, PACES, PITCHES, SEXES, STAGES, STYLES, TIMES_OF_DAY, TRANSITIONS } from './vocabulary';

/** THE COMMAND SET — every studio action by name, so the browser and the server run the same function. A command
 *  is `{ name, args, seed, at }`: the seed fixes the ids it creates and `at` fixes its clock, so both sides agree. */

export const COMMANDS = {
  addShow: A.addShow, updateShow: A.updateShow, deleteShow: A.deleteShow,
  addSeason: A.addSeason, updateSeason: A.updateSeason, deleteSeason: A.deleteSeason,
  addProduction: A.addProduction, updateProduction: A.updateProduction, deleteProduction: A.deleteProduction, duplicateProduction: A.duplicateProduction,
  setStage: A.setStage, markStepDone: A.markStepDone, recordExport: A.recordExport, setCut: A.setCut,
  addCastMember: A.addCastMember, addLocationMember: A.addLocationMember, updateShowBible: A.updateShowBible, fillProductionFields: A.fillProductionFields,
  addScene: A.addScene, updateScene: A.updateScene, deleteScene: A.deleteScene, replaceScript: A.replaceScript,
  addShot: A.addShot, replaceSceneShots: A.replaceSceneShots, updateShot: A.updateShot, deleteShot: A.deleteShot, duplicateShot: A.duplicateShot, moveShot: A.moveShot, reorderShot: A.reorderShot, setShotContinuity: A.setShotContinuity,
  selectTake: A.selectTake, noteTake: A.noteTake, rejectTake: A.rejectTake, rateTake: A.rateTake, removeTake: A.removeTake, addTake: A.addTake, setShotFrames: A.setShotFrames, setDialogueAudio: A.setDialogueAudio, keepLineRecordings: A.keepLineRecordings,
  setSong: A.setSong, updateSong: A.updateSong,
  addCharacter: A.addCharacter, updateCharacter: A.updateCharacter, setPendingReference: A.setPendingReference,
  addVoiceSample: A.addVoiceSample, addVoiceRecording: A.addVoiceRecording, updateVoiceSample: A.updateVoiceSample, removeVoiceSample: A.removeVoiceSample, setVoiceIdentity: A.setVoiceIdentity, deleteCharacter: A.deleteCharacter, selectVoiceSample: A.selectVoiceSample,
  addVoiceDesign: A.addVoiceDesign, updateVoiceDesign: A.updateVoiceDesign, recordVoiceListening: A.recordVoiceListening, confirmVoiceConsent: A.confirmVoiceConsent,
  setCanonicalImage: A.setCanonicalImage, approveCanonicalImage: A.approveCanonicalImage,
  addLocation: A.addLocation, updateLocation: A.updateLocation, addLocationRefs: A.addLocationRefs, deleteLocation: A.deleteLocation,
  addAsset: A.addAsset, updateAsset: A.updateAsset, deleteAsset: A.deleteAsset, setAssetTier: A.setAssetTier,
  acceptProposal: A.acceptProposal,
  updateSettings: A.updateSettings,
} as const;

export type CommandName = keyof typeof COMMANDS;
type Fn<K extends CommandName> = (typeof COMMANDS)[K];
export type CommandArgs<K extends CommandName> = Parameters<Fn<K>> extends [StudioState, ...infer R] ? R : never;
type Raw<K extends CommandName> = ReturnType<Fn<K>>;
/** What a command hands back besides the state: the created show, scene, take… or nothing. */
export type CommandResult<K extends CommandName> = Raw<K> extends StudioState ? undefined : Raw<K> extends { state: StudioState } ? Omit<Raw<K>, 'state'> : never;

export interface Command<K extends CommandName = CommandName> { name: K; args: CommandArgs<K>; seed: string; at: string }

export const isCommandName = (x: unknown): x is CommandName => typeof x === 'string' && Object.prototype.hasOwnProperty.call(COMMANDS, x);

// ------------------------------------------------------------------------------------------------- arg schemas

/** ARGUMENT SCHEMAS for the character and voice commands: anything a page or a worker can send that would make a
 *  reducer throw a TypeError (a missing `voice`, an age that is not a number, a dialect that does not exist) is
 *  refused as INVALID before the reducer runs — in the browser and on the server alike, so the API answers 400,
 *  never 500. Other commands keep their reducers' own checks. */

const id = z.string().min(1).max(80);
const short = (max: number) => z.string().max(max);
const text400 = short(400);
const canon = z.object({ heightCm: z.number().positive().max(400).optional(), accessories: z.array(short(120)).max(12).optional(), visualRestrictions: z.array(short(200)).max(12).optional(), agePresentation: short(200).optional(), speech: short(400).optional() }).partial();

const noDialectOnEnglish = { check: (p: { language?: string; dialect?: string }) => !(p.language === 'EN' && p.dialect), message: 'An English-speaking character has no dialect.', path: ['dialect'] };

/** CharacterProfileInput (diagnosis §3.1): dialect only with Arabic; it defaults to the studio's when missing. */
const ProfileBase = z.object({
  name: z.string().trim().min(1).max(80),
  nameAr: short(80).optional(),
  role: short(200).default(''),
  style: z.enum(STYLES), sex: z.enum(SEXES), species: short(60).optional(),
  ageYears: z.number().int().min(1).max(120),
  build: text400.default(''), face: text400.default(''), hair: text400.default(''), skin: text400.default(''), eyes: text400.default(''), wardrobe: text400.default(''), personality: text400.default(''),
  distinguishing: z.array(short(120)).max(6).default([]),
  language: z.enum(LANGUAGES), dialect: z.enum(DIALECTS).optional(),
  canon: canon.optional(), notes: short(4000).optional(),
});

export const VoiceProfileSchema = z.object({ pitch: z.enum(PITCHES), pace: z.enum(PACES), timbre: short(200).optional(), notes: short(400).optional() });
const voicePatch = VoiceProfileSchema.partial().passthrough();
const characterRef = z.object({ id: id, role: z.string().min(1).max(40), assetId: id, approved: z.boolean().optional() });
const imageValidation = z.object({ ok: z.boolean(), width: z.number(), height: z.number(), sharpness: z.number().optional(), faces: z.number().optional(), faceBoxHeight: z.number().optional(), reasons: z.array(z.string()) });
const pendingReference = z.object({ assetId: id, addedAt: z.string(), validation: imageValidation.optional() });

const CharacterInputSchema = ProfileBase.extend({ voice: VoiceProfileSchema.partial().passthrough().optional(), refs: z.array(characterRef).max(24).optional(), portraitAssetId: id.optional(), pendingReference: pendingReference.optional() }).refine(noDialectOnEnglish.check, { message: noDialectOnEnglish.message, path: noDialectOnEnglish.path });
const CharacterPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(), nameAr: short(80).nullable().optional(), role: short(200).optional(),
  style: z.enum(STYLES).optional(), sex: z.enum(SEXES).optional(), species: short(60).nullable().optional(), ageYears: z.number().int().min(1).max(120).optional(),
  build: text400.optional(), face: text400.optional(), hair: text400.optional(), skin: text400.optional(), eyes: text400.optional(), wardrobe: text400.optional(), personality: text400.optional(),
  distinguishing: z.array(short(120)).max(6).optional(), language: z.enum(LANGUAGES).optional(), dialect: z.enum(DIALECTS).optional(),
  canon: canon.optional(), notes: short(4000).optional(), voice: voicePatch.optional(), refs: z.array(characterRef).max(24).optional(), portraitAssetId: id.optional(), pendingReference: pendingReference.optional(),
}).passthrough().refine(noDialectOnEnglish.check, { message: noDialectOnEnglish.message, path: noDialectOnEnglish.path });

const voiceSource = z.enum(['SAMPLE', 'UPLOADED', 'GENERATED']);
const validation = z.object({ durationSeconds: z.number(), sampleRate: z.number(), channels: z.number(), integratedLufs: z.number(), truePeakDbtp: z.number(), speech: z.object({ present: z.boolean(), words: z.number(), language: z.enum(['EN', 'AR', 'UNKNOWN']), transcript: z.string(), confidence: z.number() }), snrDb: z.number().optional(), music: z.boolean().optional() });
const sampleProvenance = z.object({ validation: validation.optional(), trimmedAssetId: id.optional(), window: z.object({ from: z.number(), to: z.number() }).optional() }).passthrough();
const sampleExtra = { text: short(4000).optional(), language: z.enum(LANGUAGES).optional(), dialect: z.enum(DIALECTS).optional(), durationSeconds: z.number().nonnegative().optional(), provenance: sampleProvenance.optional() };
/** The producer's consent statement (contract v2 §1). */
const consentStatement = z.enum(['MY_VOICE', 'SPEAKER_PERMISSION']);
const consent = z.object({ statement: consentStatement, by: z.literal('PRODUCER'), at: z.string().min(1).max(40) });
const VoiceSampleInputSchema = z.object({ id: id.optional(), label: short(200), assetId: id.optional(), source: voiceSource, jobId: id.optional(), consent: consent.optional(), ...sampleExtra });
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const measure = z.object({ cer: z.number().min(0).optional(), coverage: z.number().min(0).max(1).optional(), lufs: z.number().optional(), truePeakDbtp: z.number().optional() });
const VoiceIdentitySchema = z.object({
  provider: z.enum(['LOCAL_TTS', 'MINIMAX']), model: z.string().min(1).max(120), fallbackModel: z.literal('indextts').optional(),
  mode: z.enum(['REFERENCE', 'AUTOMATIC', 'MANUAL', 'DESIGN']), referenceSampleId: id.optional(), referenceAssetId: id.optional(),
  referenceWindow: z.object({ from: z.number().nonnegative(), to: z.number().positive(), assetId: id }).optional(), referenceText: short(4000).optional(), providerVoiceId: short(200).optional(),
  language: z.enum(LANGUAGES), dialect: z.enum(DIALECTS).optional(),
  params: z.object({ speed: z.number().positive().max(3), emotionAlpha: z.number().min(0).max(2), seed: z.number().int().optional(), nfe: z.number().int().positive().optional(), cfg: z.number().optional() }),
  proof: z.object({ sampleId: id, assetId: id, text: short(4000), wer: z.number().optional(), cer: z.number().optional(), coverage: z.number().optional(), heard: short(4000).optional() }),
  status: z.enum(['ACTIVE', 'REVIEW', 'STALE']).optional(), engineVersion: short(120).optional(), jobId: id.optional(),
  // voice identity v2 (the reducer enforces origin, consent and Rule V-DESIGN)
  origin: z.enum(['UPLOAD_CONSENTED', 'DESIGNED', 'HOSTED', 'GENERATED']).optional(), designId: id.optional(), seedSha256: sha256.optional(), consent: consent.optional(),
  dialectStatus: z.enum(['NOT_APPLICABLE', 'UNVERIFIED', 'LISTENER_APPROVED', 'LISTENER_REJECTED']).optional(),
  evaluation: measure.extend({ clipped: z.number().int().nonnegative().optional(), seedToLineSimilarity: z.number().min(-1).max(1).optional(), measuredAt: z.string().min(1).max(40), asrModel: short(120).optional(), similarityModel: short(200).optional() }).optional(),
});

const designMeasure = measure.extend({ durationSeconds: z.number().nonnegative(), heard: short(4000).optional(), asrModel: short(120).optional(), clippedSamples: z.number().int().nonnegative().optional() });
const designGate = z.object({ ok: z.boolean(), reasons: z.array(short(400)).max(20) });
const designPreview = z.object({ text: short(1000), assetId: id.optional(), engine: short(40), cosine: z.number().min(-1).max(1).optional(), cer: z.number().min(0).optional(), coverage: z.number().min(0).max(1).optional(), letterCoverage: z.number().min(0).max(1).optional(), heard: short(4000).optional(), durationSeconds: z.number().nonnegative().optional() });
const designScores = { previews: z.array(designPreview).max(8).optional(), similarityMean: z.number().min(-1).max(1).optional(), letterCoverageMean: z.number().min(0).max(1).optional(), cerMean: z.number().min(0).optional() };
const designCandidate = z.object({ index: z.number().int().min(1).max(3), seed: z.number().int().nonnegative(), assetId: id, sha256, durationSeconds: z.number().positive(), nativeAssetId: id.optional(), nativeSha256: sha256.optional(), measured: designMeasure, gate: designGate, ...designScores });
/** A VOICE_DESIGN record as the worker writes it (label, chosen and createdAt are the reducer's). */
const VoiceDesignRecordSchema = z.object({
  id, characterId: id, mode: z.enum(['AUTOMATIC', 'DESIGN']), engine: short(80).min(1), model: short(200), engineVersion: short(400).min(1),
  description: z.string().min(1).max(300), descriptionSource: z.enum(['PROFILE', 'PRODUCER']), language: z.enum(LANGUAGES), dialect: z.enum(DIALECTS).optional(), experiment: z.literal('DESIGNED_IRAQI').optional(),
  text: z.string().min(1).max(1000), seed: z.number().int().nonnegative(), seeds: z.array(z.number().int().nonnegative()).min(1).max(3), params: z.record(z.string(), z.number()),
  lineEngine: short(40), similarityModel: short(200).optional(), lineParams: z.object({ speed: z.number().positive().max(3), emotionAlpha: z.number().min(0).max(2), seed: z.number().int() }).optional(), candidates: z.array(designCandidate).min(1).max(3), similarity: z.array(z.array(z.number())).max(3).optional(),
  ranking: z.array(z.number().int().min(1).max(3)).max(3).optional(), rankedBy: short(400).optional(), jobId: id, createdAt: z.string().max(40).optional(),
});
const VoiceDesignPatchSchema = z.object({ candidates: z.array(z.object({ index: z.number().int().min(1).max(3), measured: designMeasure, gate: designGate, ...designScores })).max(3), ranking: z.array(z.number().int().min(1).max(3)).max(3).optional(), rankedBy: short(400).optional(), similarityModel: short(200).optional() });
const ListeningSchema = z.object({ natural: z.number().int().min(1).max(5), dialectAuthentic: z.boolean().optional(), note: short(1000).optional() });

/** The canonical image (docs/CONTRACTS-IDENTITY-PACK.md v2) as the worker reports a drawing. Status, version and
 *  approval are never taken from the caller (the reducer sets them). */
const CanonicalImageSchema = z.object({
  assetId: id, jobId: id.optional(), seed: z.number().int().optional(), referenceAssetId: id.optional(), engine: short(200).optional(), identityLine: short(4000).optional(),
  check: z.object({ ok: z.boolean(), notes: z.array(short(400)).max(20).optional() }).optional(),
  generatedAt: z.string().min(1).max(40).optional(),
});
const ApproveOptions = z.object({ override: z.boolean().optional(), reason: short(1000).optional() });

/** The producer's judgement on a take (docs/CONTRACTS-REDESIGN-BACKEND.md B5): GOOD, REJECTED or null (withdrawn),
 *  then an optional `{ reason, by }`. */
const TakeRatingSchema = z.enum(['GOOD', 'REJECTED']).nullable();
const RateOptions = z.object({ reason: short(1000).optional(), by: short(80).optional() });

/** Tuples of positional args, by command. */
export const COMMAND_ARG_SCHEMAS: Partial<Record<CommandName, z.ZodType<unknown[]>>> = {
  rateTake: z.tuple([id, id, id, TakeRatingSchema]).rest(RateOptions.optional()),
  setCanonicalImage: z.tuple([id, CanonicalImageSchema]),
  approveCanonicalImage: z.tuple([id, z.number().int().min(1)]).rest(ApproveOptions.optional()),
  setAssetTier: z.tuple([id, z.enum(['CANONICAL', 'SECONDARY', 'RAW']).nullable()]),
  addCharacter: z.tuple([CharacterInputSchema]),
  updateCharacter: z.tuple([id, CharacterPatchSchema]),
  setPendingReference: z.tuple([id, id.optional().nullable(), imageValidation.optional()]).rest(z.unknown()),
  addVoiceSample: z.tuple([id, VoiceSampleInputSchema]).rest(z.boolean().optional()),
  addVoiceRecording: z.tuple([id, id, short(200)]).rest(z.object({ ...sampleExtra, consent: consent.optional() }).optional()),
  updateVoiceSample: z.tuple([id, id, z.object({ label: short(200).optional(), ...sampleExtra })]),
  selectVoiceSample: z.tuple([id, id.optional().nullable()]).rest(z.unknown()),
  setVoiceIdentity: z.tuple([id, VoiceIdentitySchema]),
  addVoiceDesign: z.tuple([id, VoiceDesignRecordSchema]),
  updateVoiceDesign: z.tuple([id, id, VoiceDesignPatchSchema]),
  recordVoiceListening: z.tuple([id, ListeningSchema]),
  confirmVoiceConsent: z.tuple([id, id, consentStatement]),
};

/** Refuse malformed arguments with INVALID and the field named; commands without a schema pass through. */
export function validateCommandArgs(name: CommandName, args: unknown): void {
  const schema = COMMAND_ARG_SCHEMAS[name];
  if (!schema) return;
  const r = schema.safeParse(args);
  if (!r.success) throw new StudioError('INVALID', `${name}: ${r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'args'} ${i.message}`).join('; ')}`, { command: name, issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.map(String), message: i.message })) });
}

// ------------------------------------------------------------------------------------------ the command boundary

/** THE COMMAND BOUNDARY (docs/BACKEND-AUDIT-2026-10.md H1, step 2). Every command is either a CLIENT command — a
 *  producer's edit a page may send to POST /api/commands — or a SYSTEM command, written only in-process by the
 *  worker and the server's own routes (`command()` / `commands()` in src/server/studio/engine.ts): generated takes,
 *  cuts, exports, voice identities and designs, canonical images, assets and their provenance. The HTTP route refuses
 *  system commands (403) and validates every client command's arguments against CLIENT_ARG_SCHEMAS before any reducer
 *  runs. The browser keeps running every command locally (runCommand) — the split is about who may SEND one. */
export const SYSTEM_COMMANDS = [
  'recordExport', 'setCut', 'replaceScript', 'replaceSceneShots', 'setShotFrames', 'setDialogueAudio',
  'addVoiceSample', 'updateVoiceSample', 'setVoiceIdentity', 'addVoiceDesign', 'updateVoiceDesign',
  'setCanonicalImage', 'addLocationRefs', 'addAsset', 'updateAsset',
  // the workers' intent commands (step 11): what a worker means, applied to the state as it is when it runs
  'addCastMember', 'addLocationMember', 'updateShowBible', 'fillProductionFields',
] as const satisfies readonly CommandName[];
export type SystemCommandName = (typeof SYSTEM_COMMANDS)[number];
export type ClientCommandName = Exclude<CommandName, SystemCommandName>;

export const isSystemCommand = (name: CommandName): name is SystemCommandName => (SYSTEM_COMMANDS as readonly string[]).includes(name);
export const isClientCommand = (name: unknown): name is ClientCommandName => isCommandName(name) && !isSystemCommand(name);
export const CLIENT_COMMANDS = (Object.keys(COMMANDS) as CommandName[]).filter((n): n is ClientCommandName => !isSystemCommand(n));

/** A positional argument list: `required` first, then `optional` ones (absent, or null — JSON turns a trailing
 *  `undefined` into null), and nothing more. */
function argList(required: z.ZodType[], optional: z.ZodType[] = []): z.ZodType<unknown[]> {
  const all = [...required, ...optional.map((s) => s.nullish())];
  return z.array(z.unknown()).superRefine((a, ctx) => {
    if (a.length < required.length) ctx.addIssue({ code: 'custom', message: `expects ${required.length}${optional.length ? `–${all.length}` : ''} arguments, got ${a.length}` });
    if (a.length > all.length) ctx.addIssue({ code: 'custom', message: `expects at most ${all.length} arguments, got ${a.length}` });
    a.slice(0, all.length).forEach((v, i) => {
      const r = all[i].safeParse(v);
      if (!r.success) for (const iss of r.error.issues) ctx.addIssue({ code: 'custom', path: [i, ...iss.path], message: iss.message });
    });
  }) as unknown as z.ZodType<unknown[]>;
}

/** A field only the studio writes (a worker's result, a structural record): refused when a page sends it. */
const studioOwned = z.never({ message: 'is written by the studio, never sent by a page' }).optional();
const owned = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, studioOwned])) as Record<string, typeof studioOwned>;

const idList = z.array(id).max(500);
const line = (max: number) => z.string().max(max);
const textList = (max: number) => z.array(line(max)).max(200);
const titleText = z.string().max(300);
const style = z.enum(STYLES); const language = z.enum(LANGUAGES); const dialect = z.enum(DIALECTS); const aspect = z.enum(ASPECTS);
const timeOfDay = z.enum(TIMES_OF_DAY); const stage = z.enum(STAGES);
const seconds = z.number().nonnegative().max(24 * 3600);

const ShowBible = z.object({ worldRules: textList(2000), relationships: textList(2000), timeline: textList(2000), unresolved: textList(2000), styleNotes: line(8000) }).partial().passthrough();
const NewShow = z.object({ title: z.string().min(1).max(300), titleAr: titleText.optional(), logline: line(8000), genre: line(200), style, language, dialect: dialect.optional(), aspect, castIds: idList.optional(), locationIds: idList.optional(), synopsis: line(40000).optional() }).passthrough();
const ShowPatch = z.object({ title: z.string().min(1).max(300), titleAr: titleText, logline: line(8000), genre: line(200), style, language, dialect, aspect, synopsis: line(40000), coverAssetId: id, posterAssetId: id, castIds: idList, locationIds: idList, bible: ShowBible }).partial().extend(owned('id', 'createdAt')).passthrough();
const SeasonPatch = z.object({ title: titleText, arc: line(8000) }).partial().strict();

const Brief = z.object({ mode: z.enum(['AUTO_IDEA', 'MANUAL']), text: line(40000) }).passthrough();
const LyricSection = z.object({ id, kind: z.enum(LYRIC_KINDS), text: line(8000), singerIds: idList, from: seconds, to: seconds }).passthrough();
const Song = z.object({ id, title: titleText, source: z.enum(['GENERATED', 'GENERATED_EXAMPLE', 'UPLOADED']), assetId: id.optional(), durationSeconds: seconds, caption: line(8000), sections: z.array(LyricSection).max(200), singerIds: idList }).passthrough();
const SongPatch = Song.partial().passthrough();
const NewProduction = z.object({ kind: z.enum(KINDS), showId: id.optional(), seasonId: id.optional(), title: z.string().min(1).max(300), titleAr: titleText.optional(), logline: line(8000).optional(), synopsis: line(40000).optional(), style, language, dialect: dialect.optional(), aspect, targetSeconds: z.number().positive().max(4 * 3600), brief: Brief, castIds: idList, locationIds: idList, song: Song.optional() }).passthrough();
/** cutAssetId, exports and the frame poster come from ASSEMBLE/EXPORT; scenes and shots (with their takes) from the
 *  structural commands — a production patch from a page carries none of them. */
const ProductionPatch = z.object({ showId: id, seasonId: id, episodeNumber: z.number().int().positive(), title: z.string().min(1).max(300), titleAr: titleText, logline: line(8000), synopsis: line(40000), style, language, dialect, aspect, targetSeconds: z.number().positive().max(4 * 3600), stage, brief: Brief, castIds: idList, locationIds: idList, song: Song, coverAssetId: id, posterAssetId: id, artist: line(300), concept: z.enum(['PERFORMANCE', 'NARRATIVE', 'MIXED']), genre: line(200), mood: line(200) })
  .partial().extend(owned('id', 'kind', 'createdAt', 'scenes', 'shots', 'cutAssetId', 'cutStale', 'exports', 'framePosterAssetId')).passthrough();

const SceneLine = z.object({ id, characterId: id, text: line(8000) }).passthrough();
const Beat = z.object({ id, action: line(8000), lines: z.array(SceneLine).max(200) }).passthrough();
const SceneInput = z.object({ title: z.string().min(1).max(300), timeOfDay, locationId: id.optional(), characterIds: idList.optional(), purpose: line(8000).optional(), emotionalObjective: line(8000).optional(), entryState: line(8000).optional(), exitState: line(8000).optional(), beats: z.array(Beat).max(200).optional(), establishLocation: z.boolean().optional() }).passthrough();
const ScenePatch = z.object({ title: titleText, locationId: id, timeOfDay, characterIds: idList, beats: z.array(Beat).max(200), purpose: line(8000), emotionalObjective: line(8000), entryState: line(8000), exitState: line(8000), establishLocation: z.boolean() }).partial().extend(owned('id', 'number')).passthrough();

const ShotDialogue = z.object({ id, characterId: id, text: line(8000) }).passthrough();
const Continuity = z.object({ characters: z.array(z.object({ characterId: id }).passthrough()).max(50), props: z.array(z.object({ name: line(300) }).passthrough()).max(100), environment: z.object({}).passthrough(), camera: z.object({}).passthrough() }).partial().passthrough();
const shotFields = { sceneId: id, purpose: line(8000), action: line(8000), framing: z.enum(FRAMINGS), cameraMove: z.enum(CAMERA_MOVES), durationSeconds: z.number().positive().max(600), characterIds: idList, dialogue: z.array(ShotDialogue).max(100), transition: z.enum(TRANSITIONS), openingFrameAssetId: id, endingFrameAssetId: id, songWindow: z.object({ from: seconds, to: seconds }), performance: z.object({ mode: z.string().max(40), singerIds: idList }).passthrough(), notes: line(8000), continuity: Continuity, prompt: line(8000), boundary: z.enum(['continuous', 'cut', 'transition']), staging: z.object({ beats: z.array(z.object({ at: seconds, action: line(600), cut: z.object({ camera: line(200), locationId: id.optional() }).optional() })).max(12), pace: z.enum(['DWELL', 'NORMAL', 'MONTAGE']), pov: id, extras: z.array(z.object({ description: line(300), count: z.number().int().positive().max(500).optional() })).max(6), actions: z.array(line(300)).max(20) }).partial().passthrough() };
/** A shot's takes and its chosen take have their own commands (the worker's addTake, selectTake, removeTake…). */
const shotOwned = owned('id', 'number', 'takes', 'selectedTakeId');
const ShotInput = z.object(shotFields).partial().required({ sceneId: true }).extend(shotOwned).passthrough();
const ShotPatch = z.object(shotFields).partial().extend(shotOwned).passthrough();

/** The one take a page may add: the producer's own upload (ShotEditor). Generated takes, with their provenance, QA
 *  and cost, are the worker's (addTake in-process). */
const UploadedTake = z.object({ assetId: id, provider: z.literal('UPLOAD'), label: titleText.optional(), note: line(4000).optional(), width: z.number().positive().max(16384).optional(), height: z.number().positive().max(16384).optional(), durationSeconds: seconds.optional(), fps: z.number().positive().max(1000).optional() }).strict();

const LocationRef = z.object({ id, role: z.enum(LOCATION_REF_ROLES), assetId: id, label: titleText, timeOfDay: timeOfDay.optional() }).passthrough();
const locationFields = { name: z.string().min(1).max(200), nameAr: titleText, kind: z.enum(['INTERIOR', 'EXTERIOR']), description: line(8000), style, lighting: z.array(timeOfDay).max(20), landmarks: textList(400), props: textList(400), refs: z.array(LocationRef).max(200), masterAssetId: id, layout: z.object({}).passthrough() };
/** the identity (its version) is the studio's: derived by the reducers, never sent by a page */
const LocationInput = z.object(locationFields).partial().required({ name: true, kind: true, style: true }).extend(owned('id', 'createdAt', 'identity')).passthrough();
const LocationPatch = z.object(locationFields).partial().extend(owned('id', 'createdAt', 'identity')).passthrough();

const SettingsPatch = z.object({ reducedMotion: z.boolean(), defaults: z.object({ style, language, dialect, aspect }).partial().passthrough(), generation: z.object({ videoModel: line(200), videoResolution: line(40), llmProvider: line(80), voiceProvider: z.enum(['LOCAL_TTS', 'MINIMAX']) }).partial().passthrough(), voice: z.object({ allowDesignedIraqi: z.boolean() }).partial().passthrough(), research: z.object({ enabled: z.boolean(), cacheHours: z.number().min(1).max(168) }).partial().passthrough() }).partial().passthrough();

const ProposedCast = z.object({ key: line(200), name: line(200), role: line(400) }).passthrough();
const ProposedLocation = z.object({ key: line(200), name: line(200), description: line(8000) }).passthrough();
const Proposal = z.object({ sample: z.boolean(), title: z.string().min(1).max(300), logline: line(8000), premise: line(40000), genre: line(200), mood: line(200), style, language, dialect: dialect.optional(), durationSeconds: z.number().positive().max(4 * 3600), structure: z.array(z.object({ title: titleText, summary: line(8000) }).passthrough()).max(200), cast: z.array(ProposedCast).max(50), locations: z.array(ProposedLocation).max(50) }).passthrough();
const AcceptProposal = z.object({ kind: z.enum(['SHOW', 'SEASON', 'EPISODE', 'SHORT', 'MUSIC_VIDEO']), showId: id.optional(), seasonId: id.optional(), aspect, proposal: Proposal, keepCast: z.array(line(200)).max(50), keepLocations: z.array(line(200)).max(50), preferences: z.object({}).passthrough(), proposalJobId: id.optional() }).passthrough();

const existing = (name: CommandName) => COMMAND_ARG_SCHEMAS[name]!;

/** THE CLIENT ARGUMENT SCHEMAS — one for every client command (the type makes a missing one a compile error). */
export const CLIENT_ARG_SCHEMAS: Record<ClientCommandName, z.ZodType<unknown[]>> = {
  addShow: argList([NewShow]), updateShow: argList([id, ShowPatch]), deleteShow: argList([id]),
  addSeason: argList([id], [titleText, line(8000)]), updateSeason: argList([id, SeasonPatch]), deleteSeason: argList([id]),
  addProduction: argList([NewProduction]), updateProduction: argList([id, ProductionPatch]), deleteProduction: argList([id]), duplicateProduction: argList([id]),
  setStage: argList([id, stage]), markStepDone: argList([id, stage]),
  addScene: argList([id, SceneInput]), updateScene: argList([id, id, ScenePatch]), deleteScene: argList([id, id]),
  addShot: argList([id, ShotInput]), updateShot: argList([id, id, ShotPatch]), deleteShot: argList([id, id]), duplicateShot: argList([id, id]),
  moveShot: argList([id, id, z.union([z.literal(-1), z.literal(1)])]), reorderShot: argList([id, id], [id]), setShotContinuity: argList([id, id, Continuity]),
  selectTake: argList([id, id], [id]), rateTake: existing('rateTake'), noteTake: argList([id, id, id, line(4000)]), rejectTake: argList([id, id, id, line(2000)]), removeTake: argList([id, id, id]),
  addTake: argList([id, id, UploadedTake]),
  // the producer keeps flagged dialogue recordings: (productionId, [{ shotId, lineId }…], { by? })
  keepLineRecordings: argList([id, z.array(z.object({ shotId: id, lineId: id }).strict()).min(1).max(500)], [z.object({ by: line(80) }).partial().strict()]),
  setSong: argList([id], [Song]), updateSong: argList([id, SongPatch]),
  addCharacter: existing('addCharacter'), updateCharacter: existing('updateCharacter'), setPendingReference: existing('setPendingReference'), deleteCharacter: argList([id]),
  addVoiceRecording: existing('addVoiceRecording'), removeVoiceSample: argList([id, id]), selectVoiceSample: existing('selectVoiceSample'),
  recordVoiceListening: existing('recordVoiceListening'), confirmVoiceConsent: existing('confirmVoiceConsent'), approveCanonicalImage: existing('approveCanonicalImage'),
  addLocation: argList([LocationInput]), updateLocation: argList([id, LocationPatch]), deleteLocation: argList([id]),
  deleteAsset: argList([id]), setAssetTier: existing('setAssetTier'),
  acceptProposal: argList([AcceptProposal]),
  updateSettings: argList([SettingsPatch]),
};

export const systemCommandMessage = (name: string) => `${name} is written by the studio's workers; a page cannot send it.`;

/** Refuse what a page may not send: a system command (unless `allowSystem`, the one-release rollback
 *  STUDIO_LEGACY_COMMANDS=1; the route answers it 403 before calling this) or malformed arguments (INVALID, the
 *  field named). */
export function validateClientCommand(name: CommandName, args: unknown, opts: { allowSystem?: boolean } = {}): void {
  if (isSystemCommand(name)) {
    if (!opts.allowSystem) throw new StudioError('INVALID', systemCommandMessage(name), { command: name, reason: 'SYSTEM_COMMAND' });
    validateCommandArgs(name, args);
    return;
  }
  const r = CLIENT_ARG_SCHEMAS[name].safeParse(args);
  if (!r.success) throw new StudioError('INVALID', `${name}: ${r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'args'} ${i.message}`).join('; ')}`, { command: name, issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.map(String), message: i.message })) });
  validateCommandArgs(name, args);
}

/** Apply one command. Throws StudioError for a refused command (including malformed arguments). */
export function runCommand<K extends CommandName>(state: StudioState, cmd: Command<K>): { state: StudioState; result: CommandResult<K> } {
  if (!Array.isArray(cmd.args)) throw new StudioError('INVALID', `${String(cmd.name)}: args must be an array.`);
  validateCommandArgs(cmd.name, cmd.args);
  const fn = COMMANDS[cmd.name] as unknown as (s: StudioState, ...args: unknown[]) => StudioState | { state: StudioState };
  return withCommandContext(cmd.seed, cmd.at, () => {
    const out = fn(state, ...(cmd.args as unknown[]));
    if (out && typeof out === 'object' && 'state' in out && 'version' in (out as { state: StudioState }).state) {
      const { state: next, ...rest } = out as { state: StudioState } & Record<string, unknown>;
      return { state: next, result: rest as CommandResult<K> };
    }
    return { state: out as StudioState, result: undefined as CommandResult<K> };
  });
}
