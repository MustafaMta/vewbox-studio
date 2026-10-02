import type { Job, JobPayload, JobType } from '@/domain/jobs';
import type { Character, VoiceIdentity, VoiceSample } from '@/domain/types';
import type { Dialect, Language, Style } from '@/domain/vocabulary';

/** THE WAVE-2 CONTRACT, AS THE FRONTEND CODES AGAINST IT — docs/CONTRACTS-CHARACTER-VOICE.md §1.1, §1.2 and §1.4.
 *  The Backend branch adds `CREATE_CHARACTER`, the extended `VOICE_BUILD` payload and the extended `VoiceIdentity`
 *  to src/domain/*; until the merge these local types mirror those shapes, and the two casts below are the ONLY
 *  places the frontend steps outside the domain's job typing. When the domain types land, delete the casts and the
 *  mirrored types and import from '@/domain/jobs' and '@/domain/types'. */

export type CreateStepName = 'design' | 'appearance' | 'sheet' | 'voice';
export const CREATE_STEPS: readonly CreateStepName[] = ['design', 'appearance', 'sheet', 'voice'];
/** The child job each step runs. */
export const STEP_JOB: Record<CreateStepName, JobType> = { design: 'DESIGN_CHARACTER', appearance: 'CHARACTER_APPEARANCE', sheet: 'CHARACTER_REFS', voice: 'VOICE_BUILD' };

export type CharacterProfileInput = Pick<Character, 'name' | 'nameAr' | 'role' | 'style' | 'sex' | 'species' | 'ageYears' | 'build' | 'face' | 'hair' | 'skin' | 'eyes' | 'wardrobe' | 'personality' | 'distinguishing' | 'language' | 'dialect' | 'canon' | 'notes'> & { voice?: { pitch: Character['voice']['pitch']; pace: Character['voice']['pace']; timbre?: string; notes?: string } };

/** contract §1.1 — `CREATE_CHARACTER` payload (zod in src/domain/jobs.ts on the backend branch). */
export interface CreateCharacterPayload {
  mode: 'AUTO' | 'MANUAL' | 'REFERENCE';
  name?: string; brief?: string;
  profile?: Partial<CharacterProfileInput>;
  referenceAssetId?: string;
  style?: Style; language?: Language; dialect?: Dialect; productionId?: string; showId?: string;
  voice?: { mode: 'NONE' | 'REFERENCE' | 'AUTOMATIC'; referenceSampleId?: string };
  draw?: boolean;
}
export interface CreateStepOutcome { step: CreateStepName; status: 'done' | 'skipped' | 'failed'; jobId?: string; reason?: string; failureClass?: string }
export interface CreateCharacterResult { characterId: string; steps: CreateStepOutcome[] }

/** contract §1.4 — `VOICE_BUILD` payload. */
export interface VoiceBuildPayload { characterId: string; mode: 'REFERENCE' | 'AUTOMATIC' | 'MANUAL'; referenceSampleId?: string; provider?: 'LOCAL_TTS' | 'MINIMAX'; providerVoiceId?: string }

/** contract §1.4 — the extended identity. Every added field is optional here so the current records still type. */
export interface VoiceIdentityV2 extends VoiceIdentity {
  mode?: 'REFERENCE' | 'AUTOMATIC' | 'MANUAL';
  referenceSampleId?: string;
  referenceWindow?: { from: number; to: number; assetId: string };
  referenceText?: string;
  params?: { speed?: number; emotionAlpha?: number; seed?: number; nfe?: number; cfg?: number } & Record<string, unknown>;
  proof?: { sampleId: string; assetId: string; text: string; wer?: number; cer?: number; coverage?: number; heard?: string };
  status?: 'ACTIVE' | 'REVIEW' | 'STALE';
  engineVersion?: string;
  jobId?: string;
}

/** contract §1.2 — what `POST /api/assets` returns for `purpose: 'character-reference'` (typed beside the fetcher). */
export type { ImageReferenceValidation } from '@/studio/api';

/** contract §1.4 — `POST /api/characters/:id/voice-reference`. */
export interface VoiceReferenceValidation {
  durationSeconds: number; sampleRate: number; channels: number; integratedLufs: number; truePeakDbtp: number;
  speech: { present: boolean; words: number; language: Language | 'UNKNOWN'; transcript: string; confidence: number };
  snrDb?: number; music?: boolean;
}
export type VoiceReferenceRefusal = 'TOO_SHORT' | 'TOO_LONG' | 'NO_SPEECH' | 'TOO_QUIET' | 'CLIPPING' | 'WRONG_LANGUAGE' | 'BAD_FORMAT';
export type VoiceReferenceResult =
  | { ok: true; sample: VoiceSample & { trimmedAssetId?: string }; validation: VoiceReferenceValidation }
  | { ok: false; code: VoiceReferenceRefusal; message: string; validation?: Partial<VoiceReferenceValidation> };

type StartJob = <T extends JobType>(type: T, payload: JobPayload<T>, opts?: { idempotencyKey?: string; priority?: number }) => Promise<Job>;

// contract: CREATE_CHARACTER (backend branch) — the one cast; the job type is not in src/domain/jobs.ts yet.
export const startCreateCharacter = (startJob: StartJob, payload: CreateCharacterPayload): Promise<Job> => startJob('CREATE_CHARACTER' as never, payload as never);

// contract: VOICE_BUILD extended payload (backend branch) — `mode` and `referenceSampleId` are not in the zod schema yet.
export const startVoiceBuild = (startJob: StartJob, payload: VoiceBuildPayload, opts?: { idempotencyKey?: string }): Promise<Job> => startJob('VOICE_BUILD', payload as never, opts);

export const isCreateCharacterJob = (j: Job): boolean => (j.type as string) === 'CREATE_CHARACTER';
export const createResultOf = (j: Job | undefined): CreateCharacterResult | null => (j?.result && typeof j.result.characterId === 'string' && Array.isArray(j.result.steps) ? (j.result as unknown as CreateCharacterResult) : null);
