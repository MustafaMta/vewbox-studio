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

/** A stable rendering of a payload: keys sorted at every level, so the same request always reads the same. */
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as Record<string, unknown>).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v));
/** FNV-1a, hex: short and deterministic (no crypto needed for a dedupe key). */
const fnv = (s: string): string => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

/** The dedupe key of a creation (finding 19): the same request within the same minute — a double submit, two tabs,
 *  a request retried after a timeout — is one parent job. A deliberate relaunch after a failure is not blocked: the
 *  server queues it under a fresh key when the earlier one has failed or was cancelled. */
export const createCharacterKey = (payload: CreateCharacterPayload, now: number = Date.now()): string => `CREATE_CHARACTER:${fnv(stable(payload))}:${Math.floor(now / 60_000)}`;

export const startCreateCharacter = (startJob: StartJob, payload: CreateCharacterPayload, now: number = Date.now()): Promise<Job> => startJob('CREATE_CHARACTER', payload, { idempotencyKey: createCharacterKey(payload, now) });
export const startVoiceBuild = (startJob: StartJob, payload: VoiceBuildPayload, opts?: { idempotencyKey?: string }): Promise<Job> => startJob('VOICE_BUILD', payload, opts);

export const isCreateCharacterJob = (j: Job): boolean => j.type === 'CREATE_CHARACTER';
export const createResultOf = (j: Job | undefined): CreateCharacterResult | null => (j?.result && typeof j.result.characterId === 'string' && Array.isArray(j.result.steps) ? (j.result as unknown as CreateCharacterResult) : null);
