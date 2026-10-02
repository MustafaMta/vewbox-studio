import type { CreateCharacterResult, CreateCharacterStep, Job, JobPayload, JobType } from '@/domain/jobs';
import type { Character, VoiceIdentity, VoiceSample } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';

/** THE WAVE-2 CONTRACT, AS THE FRONTEND CODES AGAINST IT — docs/CONTRACTS-CHARACTER-VOICE.md §1.1, §1.2 and §1.4.
 *  Since the Backend merge the shapes live in src/domain/* (zod-validated on the server); this file only names the
 *  frontend's views of them, so every page codes against the domain's typing with no casts. */

export type CreateStepName = CreateCharacterStep;
export const CREATE_STEPS: readonly CreateStepName[] = ['design', 'appearance', 'sheet', 'voice'];
/** The child job each step runs. */
export const STEP_JOB: Record<CreateStepName, JobType> = { design: 'DESIGN_CHARACTER', appearance: 'CHARACTER_APPEARANCE', sheet: 'CHARACTER_REFS', voice: 'VOICE_BUILD' };

/** The written sheet as the form collects it: the profile the server validates plus the voice description. */
export type CharacterProfileInput = Pick<Character, 'name' | 'nameAr' | 'role' | 'style' | 'sex' | 'species' | 'ageYears' | 'build' | 'face' | 'hair' | 'skin' | 'eyes' | 'wardrobe' | 'personality' | 'distinguishing' | 'language' | 'dialect' | 'canon' | 'notes'> & { voice?: { pitch: Character['voice']['pitch']; pace: Character['voice']['pace']; timbre?: string; notes?: string } };

/** contract §1.1 — `CREATE_CHARACTER` payload (zod `JOB_PAYLOADS.CREATE_CHARACTER`). */
export type CreateCharacterPayload = JobPayload<'CREATE_CHARACTER'>;
export type { CreateCharacterResult };
export type CreateStepOutcome = CreateCharacterResult['steps'][number];

/** contract §1.4 — `VOICE_BUILD` payload (zod `JOB_PAYLOADS.VOICE_BUILD`). */
export type VoiceBuildPayload = JobPayload<'VOICE_BUILD'>;

/** contract §1.4 — the extended identity is the domain's `VoiceIdentity`; the name stays for the pages that read it. */
export type VoiceIdentityV2 = VoiceIdentity;

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

type StartJob = <T extends JobType>(type: T, payload: JobPayload<T>, opts?: { idempotencyKey?: string; priority?: number }) => Promise<Job>;

export const startCreateCharacter = (startJob: StartJob, payload: CreateCharacterPayload): Promise<Job> => startJob('CREATE_CHARACTER', payload);
export const startVoiceBuild = (startJob: StartJob, payload: VoiceBuildPayload, opts?: { idempotencyKey?: string }): Promise<Job> => startJob('VOICE_BUILD', payload, opts);

export const isCreateCharacterJob = (j: Job): boolean => j.type === 'CREATE_CHARACTER';
export const createResultOf = (j: Job | undefined): CreateCharacterResult | null => (j?.result && typeof j.result.characterId === 'string' && Array.isArray(j.result.steps) ? (j.result as unknown as CreateCharacterResult) : null);
