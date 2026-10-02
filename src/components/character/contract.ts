import type { CreateCharacterResult, Job, JobPayload, JobType } from '@/domain/jobs';
import type { Character, VideoUsage, VoiceIdentity, VoiceSample } from '@/domain/types';
import type { Language } from '@/domain/vocabulary';
import type { StartedJob } from '@/studio/api';

/** THE CONTRACTS, AS THE FRONTEND CODES AGAINST THEM — docs/CONTRACTS-CHARACTER-VOICE.md §1.1, §1.2, §1.4 and
 *  docs/CONTRACTS-IDENTITY-PACK.md (v2: one canonical front full-body image + one voice identity). The shapes live
 *  in src/domain/*; this file names the frontend's views of them. The one bridge left is the creation chain's step
 *  names (`PENDING-BACKEND`): the worker still reports the wave-2 names, which map onto the v2 chain here. */

/* ---- the creation chain (CREATE_CHARACTER) ------------------------------------------------------------------ */

/** The steps as contract v2 names them: design → image → voice, then the image waits for the producer's approval. */
export type CreateStepName = 'design' | 'image' | 'voice';
export const CREATE_STEPS: readonly CreateStepName[] = ['design', 'image', 'voice'];
/** The child job each step runs. */
export const STEP_JOB: Record<CreateStepName, JobType> = { design: 'DESIGN_CHARACTER', image: 'CHARACTER_APPEARANCE', voice: 'VOICE_BUILD' };
/** PENDING-BACKEND: the wave-2 chain reported 'appearance' (the portrait) and 'sheet' (reference views). 'appearance'
 *  is the image step; the sheet is no longer part of creation, so a 'sheet' outcome is not a row of the stepper. */
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

type StartJob = <T extends JobType>(type: T, payload: JobPayload<T>, opts?: { idempotencyKey?: string; priority?: number }) => Promise<StartedJob>;

/** A stable rendering of a payload: keys sorted at every level, so the same request always reads the same. */
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as Record<string, unknown>).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v));
/** FNV-1a, hex: short and deterministic (no crypto needed for a dedupe key). */
const fnv = (s: string): string => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

/** The dedupe key of a creation (finding 19): the same request within the same minute — a double submit, two tabs,
 *  a request retried after a timeout — is one parent job. A deliberate relaunch after a failure is not blocked: the
 *  server queues it under a fresh key when the earlier one has failed or was cancelled. */
export const createCharacterKey = (payload: CreateCharacterPayload, now: number = Date.now()): string => `CREATE_CHARACTER:${fnv(stable(payload))}:${Math.floor(now / 60_000)}`;

export const startCreateCharacter = (startJob: StartJob, payload: CreateCharacterPayload, now: number = Date.now()): Promise<StartedJob> => startJob('CREATE_CHARACTER', payload, { idempotencyKey: createCharacterKey(payload, now) });
export const startVoiceBuild = (startJob: StartJob, payload: VoiceBuildPayload, opts?: { idempotencyKey?: string }): Promise<StartedJob> => startJob('VOICE_BUILD', payload, opts);

export const isCreateCharacterJob = (j: Job): boolean => j.type === 'CREATE_CHARACTER';
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

/* ---- retries ----------------------------------------------------------------------------------------------- */

/** The retry route refuses an unchanged retry of a failure that is not transient (src/server/org/runs.ts
 *  `retryNeedsChange`, mirrored here because that module is server-only): only infrastructure, provider and
 *  resource failures — or an error the engine marked retryable — may be retried as they were; otherwise the producer
 *  says what changed. */
const TRANSIENT_CLASSES = ['INFRASTRUCTURE', 'PROVIDER', 'RESOURCE_EXHAUSTION'];
export function retryNeedsChange(j: Pick<Job, 'status' | 'error'>): boolean {
  if (j.status !== 'FAILED') return false;
  const fc = j.error?.details?.failureClass;
  return typeof fc === 'string' ? !TRANSIENT_CLASSES.includes(fc) : j.error?.retryable !== true;
}

/* ---- usage ------------------------------------------------------------------------------------------------- */

/** The canonical image version a take was made with, when the usage record carries it. */
export const usageImageVersion = (v: VideoUsage): number | undefined => v.canonicalImageVersion;
