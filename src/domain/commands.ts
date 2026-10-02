import { z } from 'zod';
import type { StudioState } from './types';
import * as A from './actions';
import { withCommandContext } from './ids';
import { StudioError } from './errors';
import { DIALECTS, LANGUAGES, PACES, PITCHES, SEXES, STYLES } from './vocabulary';

/** THE COMMAND SET — every studio action by name, so the browser and the server run the same function. A command
 *  is `{ name, args, seed, at }`: the seed fixes the ids it creates and `at` fixes its clock, so both sides agree. */

export const COMMANDS = {
  addShow: A.addShow, updateShow: A.updateShow, deleteShow: A.deleteShow,
  addSeason: A.addSeason, updateSeason: A.updateSeason, deleteSeason: A.deleteSeason,
  addProduction: A.addProduction, updateProduction: A.updateProduction, deleteProduction: A.deleteProduction, duplicateProduction: A.duplicateProduction,
  setStage: A.setStage, markStepDone: A.markStepDone, recordExport: A.recordExport, setCut: A.setCut,
  addScene: A.addScene, updateScene: A.updateScene, deleteScene: A.deleteScene, replaceScript: A.replaceScript,
  addShot: A.addShot, replaceSceneShots: A.replaceSceneShots, updateShot: A.updateShot, deleteShot: A.deleteShot, duplicateShot: A.duplicateShot, moveShot: A.moveShot, reorderShot: A.reorderShot, setShotContinuity: A.setShotContinuity,
  selectTake: A.selectTake, noteTake: A.noteTake, rejectTake: A.rejectTake, removeTake: A.removeTake, addTake: A.addTake, setShotFrames: A.setShotFrames, setDialogueAudio: A.setDialogueAudio,
  setSong: A.setSong, updateSong: A.updateSong,
  addCharacter: A.addCharacter, updateCharacter: A.updateCharacter, setPendingReference: A.setPendingReference, setCharacterAppearance: A.setCharacterAppearance, addCharacterRefs: A.addCharacterRefs,
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
export const CharacterProfileSchema = ProfileBase.refine(noDialectOnEnglish.check, { message: noDialectOnEnglish.message, path: noDialectOnEnglish.path });

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
  lineEngine: short(40), similarityModel: short(200).optional(), candidates: z.array(designCandidate).min(1).max(3), similarity: z.array(z.array(z.number())).max(3).optional(),
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

/** Tuples of positional args, by command. */
export const COMMAND_ARG_SCHEMAS: Partial<Record<CommandName, z.ZodType<unknown[]>>> = {
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
