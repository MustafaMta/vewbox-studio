import type { CreateCharacterResult, Job, JobPayload, JobType } from '@/domain/jobs';
import type { Character, VideoUsage, VoiceIdentity, VoiceSample } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import { canonical, hashString } from '@/domain/hash';
import { nonHumanSpecies } from '@/domain/identity';
import type { StartedJob } from '@/studio/api';

/** THE CONTRACTS, AS THE FRONTEND CODES AGAINST THEM — docs/CONTRACTS-CHARACTER-VOICE.md §1.1, §1.2, §1.4 and
 *  docs/CONTRACTS-IDENTITY-PACK.md (v2: one canonical front full-body image + one voice identity). The shapes live
 *  in src/domain/*; this file names the frontend's views of them and is the ONLY place the character pages cast. The
 *  voice identity is v2 (docs/CONTRACTS-VOICE-IDENTITY-V2.md); the creation chain's 'appearance' step is shown as the
 *  image step (normaliseStep). */

/* ---- the creation chain (CREATE_CHARACTER) ------------------------------------------------------------------ */

/** The steps as contract v2 names them: design → image → voice, then the image waits for the producer's approval. */
export type CreateStepName = 'design' | 'image' | 'voice';
export const CREATE_STEPS: readonly CreateStepName[] = ['design', 'image', 'voice'];
/** The child job each step runs. */
export const STEP_JOB: Record<CreateStepName, JobType> = { design: 'DESIGN_CHARACTER', image: 'CHARACTER_APPEARANCE', voice: 'VOICE_BUILD' };
/** The worker names the image step 'appearance' (CHARACTER_APPEARANCE draws the canonical image); results the wave-2
 *  chain stored in the database may also name a 'sheet' step, which is no longer part of creation and is dropped. */
export function normaliseStep(step: string): CreateStepName | null {
  if (step === 'appearance' || step === 'front') return 'image';
  return (CREATE_STEPS as readonly string[]).includes(step) ? (step as CreateStepName) : null;
}

/** The written sheet as the form collects it: the profile the server validates plus the voice description. */
export type CharacterProfileInput = Pick<Character, 'name' | 'nameAr' | 'role' | 'style' | 'sex' | 'species' | 'ageYears' | 'build' | 'face' | 'hair' | 'skin' | 'eyes' | 'wardrobe' | 'personality' | 'distinguishing' | 'language' | 'dialect' | 'canon' | 'notes'> & { voice?: { pitch: Character['voice']['pitch']; pace: Character['voice']['pace']; timbre?: string; notes?: string } };

/** contract §1.1 — `CREATE_CHARACTER` payload (zod `JOB_PAYLOADS.CREATE_CHARACTER`). */
export type CreateCharacterPayload = JobPayload<'CREATE_CHARACTER'>;
export interface CreateStepOutcome { step: CreateStepName; status: 'done' | 'skipped' | 'failed'; jobId?: string; reason?: string; failureClass?: string }
/** The parent's result with the steps under their v2 names; `awaitingApproval` is the chain's last word ("ending
 *  awaiting your approval"). */
export interface CreateResultView { characterId: string; steps: CreateStepOutcome[]; awaitingApproval: boolean }
export type { CreateCharacterResult };

/** contract §1.4 — `VOICE_BUILD` payload (zod `JOB_PAYLOADS.VOICE_BUILD`). */
export type VoiceBuildPayload = JobPayload<'VOICE_BUILD'>;

/** contract §1.2 — what `POST /api/assets` returns for `purpose: 'character-reference'` (typed beside the fetcher). */
export type { ImageReferenceValidation } from '@/studio/api';

/** contract §1.4 — `POST /api/characters/:id/voice-reference` (src/app/api/characters/[id]/voice-reference/route.ts). */
export interface VoiceReferenceValidation {
  durationSeconds: number; sampleRate: number; channels: number; integratedLufs: number; truePeakDbtp: number;
  speech: { present: boolean; words: number; language: Language | 'UNKNOWN'; transcript: string; confidence: number };
  snrDb?: number; music?: boolean;
}
export type VoiceReferenceRefusal = 'TOO_SHORT' | 'TOO_LONG' | 'NO_SPEECH' | 'TOO_QUIET' | 'CLIPPING' | 'WRONG_LANGUAGE' | 'BAD_FORMAT';
export type VoiceReferenceResult =
  | { ok: true; sample: VoiceSample; trimmedAssetId?: string; selected?: boolean; validation: VoiceReferenceValidation; window?: { from: number; to: number } }
  | { ok: false; code: VoiceReferenceRefusal; message: string; validation?: Partial<VoiceReferenceValidation> };

type StartJob = <T extends JobType>(type: T, payload: JobPayload<T>, opts?: { idempotencyKey?: string; priority?: number }) => Promise<StartedJob>;

/** The dedupe key of a creation (finding 19): the same request within the same minute — a double submit, two tabs,
 *  a request retried after a timeout — is one parent job. A deliberate relaunch after a failure is not blocked: the
 *  server queues it under a fresh key when the earlier one has failed or was cancelled. The payload is rendered and
 *  hashed by the studio's one canonical hash (src/domain/hash.ts: keys sorted at every level, undefined dropped). */
export const createCharacterKey = (payload: CreateCharacterPayload, now: number = Date.now()): string => `CREATE_CHARACTER:${hashString(canonical(payload))}:${Math.floor(now / 60_000)}`;

export const startCreateCharacter = (startJob: StartJob, payload: CreateCharacterPayload, now: number = Date.now()): Promise<StartedJob> => startJob('CREATE_CHARACTER', payload, { idempotencyKey: createCharacterKey(payload, now) });
export const startVoiceBuild = (startJob: StartJob, payload: VoiceBuildPayload, opts?: { idempotencyKey?: string }): Promise<StartedJob> => startJob('VOICE_BUILD', payload, opts);

/** The parent's result, steps under their v2 names (a step that is not part of the chain any more is dropped). */
export const createResultOf = (j: Job | undefined): CreateResultView | null => {
  const r = j?.result as { characterId?: unknown; steps?: unknown; awaitingApproval?: unknown; status?: unknown } | undefined;
  if (!r || typeof r.characterId !== 'string' || !Array.isArray(r.steps)) return null;
  const steps = (r.steps as Array<Omit<CreateStepOutcome, 'step'> & { step: string }>).flatMap((s) => { const step = normaliseStep(s.step); return step ? [{ ...s, step }] : []; });
  return { characterId: r.characterId, steps, awaitingApproval: r.awaitingApproval === true || r.status === 'AWAITING_APPROVAL' };
};

/* ---- the canonical image: jobs ----------------------------------------------------------------------------- */

/** Optional material drawn on request only (never by creation): expressions and outfits, as CHARACTER_REFS roles.
 *  (A close-up portrait is not drawn on request; an older one is shown when it exists.) */
export const SECONDARY_KINDS = ['EXPRESSION', 'OUTFIT'] as const;
export type SecondaryKind = (typeof SECONDARY_KINDS)[number];
export const secondaryPayload = (characterId: string, kinds: readonly SecondaryKind[]): JobPayload<'CHARACTER_REFS'> => ({ characterId, roles: [...kinds] });
/** The secondary kinds a CHARACTER_REFS job draws. */
export function jobSecondary(j: Pick<Job, 'type' | 'payload'>): SecondaryKind[] {
  if (j.type !== 'CHARACTER_REFS') return [];
  const roles = (j.payload as { roles?: unknown }).roles;
  return Array.isArray(roles) ? roles.map(String).filter((x): x is SecondaryKind => (SECONDARY_KINDS as readonly string[]).includes(x)) : [];
}


/* ---- the voice identity, v2 (docs/CONTRACTS-VOICE-IDENTITY-V2.md) ------------------------------------------ */
/* Identities built before v2 carry none of the v2 fields: every read below is defensive (absent fields render as "not
   recorded"). */

export type VoiceOrigin = 'UPLOAD_CONSENTED' | 'DESIGNED' | 'HOSTED' | 'GENERATED';
export type ConsentStatement = 'MY_VOICE' | 'SPEAKER_PERMISSION';
export type DialectStatus = 'NOT_APPLICABLE' | 'UNVERIFIED' | 'LISTENER_APPROVED' | 'LISTENER_REJECTED';
export interface VoiceEvaluation { cer?: number; coverage?: number; lufs?: number; truePeakDbtp?: number; clipped?: number; seedToLineSimilarity?: number; measuredAt?: string }
export interface VoiceListening { by: 'PRODUCER'; natural: number; dialectAuthentic?: boolean; note?: string; at: string }
export interface VoiceIdentityExtras { origin?: VoiceOrigin; designId?: string; seedSha256?: string; consent?: { statement: ConsentStatement; by: 'PRODUCER'; at: string }; dialectStatus?: DialectStatus; evaluation?: VoiceEvaluation; listening: VoiceListening[] }

/** The v2 fields of a voice identity, read defensively (the wave-2 identity has none of them). */
export function voiceExtras(identity: VoiceIdentity | undefined): VoiceIdentityExtras {
  const x = (identity ?? {}) as Partial<VoiceIdentityExtras> & { listening?: unknown };
  return { origin: x.origin, designId: x.designId, seedSha256: x.seedSha256, consent: x.consent, dialectStatus: x.dialectStatus, evaluation: x.evaluation, listening: Array.isArray(x.listening) ? (x.listening as VoiceListening[]) : [] };
}

/** `VOICE_DESIGN { characterId, description }` → three candidates speaking a calibration sentence. */
export const startVoiceDesign = (startJob: StartJob, characterId: string, description: string): Promise<StartedJob> => startJob('VOICE_DESIGN', { characterId, description });
/** `VOICE_BUILD` in the v2 modes: AUTOMATIC (designed from the profile, or for Iraqi from an Iraqi recording), DESIGN
 *  (a chosen candidate of a design), REFERENCE (a consented recording). */
export const startVoiceBuildV2 = (startJob: StartJob, p: { characterId: string; mode: 'AUTOMATIC' } | { characterId: string; mode: 'DESIGN'; designId: string; candidate: number } | { characterId: string; mode: 'REFERENCE'; referenceSampleId: string }): Promise<StartedJob> => startJob('VOICE_BUILD', p);

export interface DesignCandidate { index: number; assetId?: string; seed?: number; durationSeconds?: number; cer?: number; coverage?: number; lufs?: number; passed?: boolean; reasons?: string[] }
export interface DesignResult { designId: string; description?: string; candidates: DesignCandidate[] }
/** The candidates a finished VOICE_DESIGN job returned (each with the asset that plays it), or null. */
export function designResultOf(j: Pick<Job, 'result'> | undefined): DesignResult | null {
  const r = j?.result as { designId?: unknown; description?: unknown; candidates?: unknown } | undefined;
  if (!r || typeof r.designId !== 'string' || !Array.isArray(r.candidates)) return null;
  const candidates = (r.candidates as Array<Record<string, unknown>>).map((c, i) => ({
    index: typeof c.index === 'number' ? c.index : i + 1,
    assetId: typeof c.assetId === 'string' ? c.assetId : undefined, seed: typeof c.seed === 'number' ? c.seed : undefined,
    durationSeconds: typeof c.durationSeconds === 'number' ? c.durationSeconds : typeof c.duration === 'number' ? c.duration : undefined,
    cer: typeof c.cer === 'number' ? c.cer : undefined, coverage: typeof c.coverage === 'number' ? c.coverage : undefined, lufs: typeof c.lufs === 'number' ? c.lufs : undefined,
    passed: typeof c.passed === 'boolean' ? c.passed : undefined, reasons: Array.isArray(c.reasons) ? c.reasons.map(String) : undefined,
  }));
  return { designId: r.designId, description: typeof r.description === 'string' ? r.description : undefined, candidates };
}

/** `recordVoiceListening(characterId, { natural 1–5, dialectAuthentic?, note? })` — the producer's own listening. */
export function recordVoiceListening(act: unknown, characterId: string, record: { natural: number; dialectAuthentic?: boolean; note?: string }): void {
  (act as (name: string, ...args: unknown[]) => unknown)('recordVoiceListening', characterId, record);
}

/** The Settings experiment switch that lets an Iraqi voice start from a designed Arabic seed (default off); the server
 *  keeps it at `settings.voice.allowDesignedIraqi`. */
export const designedIraqiAllowed = (settings: unknown): boolean => (settings as { voice?: { allowDesignedIraqi?: unknown } } | undefined)?.voice?.allowDesignedIraqi === true;

/** A deterministic description of the voice from the profile (contract v2 §2: sex, age, pitch, pace, timbre — no
 *  language model), as the starting text of a design the producer may edit. Personality text is left out on purpose:
 *  it can name people, and the server refuses a description that names anyone. */
export function voiceDescriptionOf(c: Pick<Character, 'sex' | 'ageYears' | 'language' | 'species'> & { voice: Pick<Character['voice'], 'pitch' | 'pace' | 'timbre'> }): string {
  const species = nonHumanSpecies(c.species);
  // the age band picks the noun, as in the image's identity line: a 16-year-old is a teenage girl, not a woman (D14)
  const noun = c.ageYears < 13 ? (c.sex === 'FEMALE' ? 'girl' : 'boy') : c.ageYears < 18 ? (c.sex === 'FEMALE' ? 'teenage girl' : 'teenage boy') : (c.sex === 'FEMALE' ? 'woman' : 'man');
  const who = species ? species : `${noun} of about ${c.ageYears}`;
  const pitch = { LOW: 'a low', MID: 'a middle', HIGH: 'a high' }[c.voice.pitch];
  const pace = { SLOW: 'slow, unhurried', MEASURED: 'measured', QUICK: 'quick' }[c.voice.pace];
  const parts = [`A ${who}`, `${pitch} voice`, `${pace} delivery`, c.voice.timbre.trim() ? c.voice.timbre.trim().toLowerCase() : '', c.language === 'AR' ? 'speaking Modern Standard Arabic' : 'speaking English'];
  return `${parts.filter(Boolean).join(', ')}.`;
}

/* ---- usage ------------------------------------------------------------------------------------------------- */

/** The canonical image version a take was made with, when the usage record carries it. */
export const usageImageVersion = (v: VideoUsage): number | undefined => v.canonicalImageVersion;
