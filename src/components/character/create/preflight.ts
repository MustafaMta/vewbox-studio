import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { CREATE_STEPS, STEP_JOB, createResultOf, type CreateCharacterPayload, type CreateStepName } from '../contract';
import type { EngineStatus } from '@/studio/api';

/** PREFLIGHT — everything checked in the browser before a job is queued, and the pure derivation of the creation
 *  stepper from the parent job and its children. No React, no fetch: unit-tested in tests/unit/character-create.test.ts. */

/* ---- the brief --------------------------------------------------------------------------------------------- */

export const BRIEF_MIN = 2;
export const BRIEF_MAX = 2000;

/** Describe start: a brief or a name must be present (contract §1.1: "brief or name required"). */
export function checkBrief(brief: string, name: string): { ok: true } | { ok: false; reason: 'EMPTY' | 'LONG' } {
  const b = brief.trim(); const n = name.trim();
  if (b.length > BRIEF_MAX) return { ok: false, reason: 'LONG' };
  if (b.length >= BRIEF_MIN || n.length > 0) return { ok: true };
  return { ok: false, reason: 'EMPTY' };
}

/* ---- the reference picture ---------------------------------------------------------------------------------- */

export const IMAGE_RULES = { types: ['image/png', 'image/jpeg', 'image/webp'] as const, maxBytes: 20 * 1024 * 1024, minSide: 512 };
export type ImageRefusal = 'TYPE' | 'SIZE' | 'MIN_SIDE';

/** Type and size, from the File alone (SVG and GIF are refused here, never silently ignored later). */
export function checkImageFile(f: { type: string; size: number; name?: string }): ImageRefusal | null {
  if (!(IMAGE_RULES.types as readonly string[]).includes(f.type)) return 'TYPE';
  if (f.size > IMAGE_RULES.maxBytes) return 'SIZE';
  return null;
}
/** The shortest side must be at least 512 px (measured in the browser before any upload). */
export function checkImageDims(width: number, height: number): ImageRefusal | null {
  return Math.min(width, height) < IMAGE_RULES.minSide ? 'MIN_SIDE' : null;
}
/** The server's reasons a picture was refused (contract §1.2), without its note that no face detector ran: that note
 *  is not a reason to refuse — the accepted state says "face not checked" instead. */
export const refusalReasons = (reasons: string[]): string[] => reasons.filter((r) => !/face detection not available/i.test(r));

/** How many of the character's `canon.visualRestrictions` the drawing's identity line reads, and how long each may be
 *  (src/worker/handlers/images.ts `writtenLook`; src/domain/jobs.ts `canon`). */
export const PICTURE_CHANGE_LIMITS = { items: 4, chars: 200 } as const;

/** FROM A PICTURE — the producer's "What should change?" note as the durable drawing instructions of the character
 *  (`canon.visualRestrictions`, which every drawing of the character repeats in its identity line). Before this the
 *  note travelled only in the design brief, which in this mode writes who the character is and never the look, so the
 *  image never heard it (acceptance 2026-10-05: "grey work trousers and black work boots" drawn as jeans and brown
 *  shoes). Split at sentence ends into at most four pieces of at most 200 characters; a longer piece is cut at a word. */
export function pictureChangeRestrictions(note: string): string[] {
  const { items, chars } = PICTURE_CHANGE_LIMITS;
  const cut = (s: string) => (s.length <= chars ? s : `${s.slice(0, chars).replace(/\s+\S*$/, '')}`);
  const pieces = note.replace(/\s+/g, ' ').trim().split(/(?<=[.!?;])\s+/).map((s) => s.trim().replace(/[.;]+$/, '').trim()).filter((s) => s.length > 0);
  if (pieces.length <= items) return pieces.map(cut);
  // more sentences than the line reads: the last piece carries the rest (still within the 200 characters)
  return [...pieces.slice(0, items - 1), pieces.slice(items - 1).join('; ')].map(cut);
}
/** Decode the picture in an <img> to read its real pixel size. */
export function measureImage(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('undecodable')); };
    img.src = url;
  });
}

/* ---- the reference recording -------------------------------------------------------------------------------- */

export const AUDIO_RULES = { minSeconds: 3, maxSeconds: 30, usedSeconds: 12, types: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/aac'] as const };
export type AudioVerdict = 'OK' | 'TOO_SHORT' | 'TOO_LONG' | 'BAD_FORMAT';

export function checkAudioFile(f: { type: string }): AudioVerdict | null {
  return f.type && !f.type.startsWith('audio/') ? 'BAD_FORMAT' : null;
}
/** 3–30 s accepted; longer is accepted too but the server trims a ≤ 12 s window, so the verdict says so. */
export function checkAudioDuration(seconds: number): AudioVerdict {
  if (!Number.isFinite(seconds) || seconds < AUDIO_RULES.minSeconds) return 'TOO_SHORT';
  if (seconds > AUDIO_RULES.maxSeconds) return 'TOO_LONG';
  return 'OK';
}
/** Read the duration from the file's metadata in an <audio>. Infinity/NaN (streaming containers) resolves to null. */
export function measureAudio(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { const d = a.duration; URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : null); };
    a.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    a.src = url;
  });
}

/* ---- the voice of a Describe start -------------------------------------------------------------------------- */

/** The studio has no voice bank: a voice is always cloned from a real person's recording. So the Describe start
 *  offers exactly two honest choices — no voice yet, or a recording added now (finding 15). */
export const DESCRIBE_VOICE_MODES = ['NONE', 'RECORDING'] as const;
export type DescribeVoiceMode = (typeof DESCRIBE_VOICE_MODES)[number];
/** A remembered draft from an older page may say 'AUTOMATIC' (the "Studio voice" that could never produce a voice). */
export const describeVoiceMode = (v: unknown): DescribeVoiceMode => (v === 'RECORDING' ? 'RECORDING' : 'NONE');
/** What CREATE_CHARACTER is asked for: AUTOMATIC only when a recording travels with the request (the page uploads
 *  it as soon as the character exists, and AUTOMATIC builds from the uploaded recording); otherwise no voice. */
export const describeVoicePayload = (mode: DescribeVoiceMode, hasRecording: boolean): { mode: 'AUTOMATIC' | 'NONE' } => ({ mode: mode === 'RECORDING' && hasRecording ? 'AUTOMATIC' : 'NONE' });

/* ---- the engines ------------------------------------------------------------------------------------------- */

export type EngineNeed = 'images' | 'voice' | 'story';

/** Which of the needed engines are not reachable right now, from GET /api/status. Unknown status (not loaded) gates
 *  nothing: the button stays enabled and the server says no if it must. */
export function engineGate(status: EngineStatus | null, needs: EngineNeed[]): { ok: boolean; blocked: Array<{ need: EngineNeed; detail: string }> } {
  if (!status) return { ok: true, blocked: [] };
  const blocked = needs.filter((n) => !status[n]?.ok).map((n) => ({ need: n, detail: status[n]?.detail ?? '' }));
  return { ok: blocked.length === 0, blocked };
}

/* ---- the stepper -------------------------------------------------------------------------------------------- */

export type StepState = 'pending' | 'current' | 'done' | 'failed' | 'skipped';
export interface StepView { step: CreateStepName; state: StepState; job?: Job; message?: string; /** `skipped(reason)` from the result, or the failure */ reason?: string; error?: { code: string; message: string }; progress?: { step?: number; total?: number; percent?: number | null } }

/** The four rows from the parent CREATE_CHARACTER job and its children (`parentId`), with any retry job the page
 *  started for a step on its own. The parent's result (when it has one) is the record; otherwise the children's
 *  live status; otherwise the parent's reported step/total. Never a percentage nobody reported. */
export function creationSteps(parent: Job | undefined, jobs: Job[], retries: Partial<Record<CreateStepName, string>> = {}): StepView[] {
  const result = createResultOf(parent);
  const children = parent ? jobs.filter((j) => j.parentId === parent.id) : [];
  const childFor = (step: CreateStepName) => children.filter((j) => j.type === STEP_JOB[step]).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const reported = parent?.progress?.step;
  const parentDead = parent?.status === 'FAILED' || parent?.status === 'CANCELLED';
  const characterId = createdCharacterId(parent, jobs);
  // a later job of the step's kind for the same character — "Try again" here, a redraw or a voice made on the profile —
  // supersedes what the chain recorded, even after a reload forgot the page's own retries (D4, found 2026-10-03)
  const laterFor = (step: CreateStepName, after: string | undefined) => characterId && after ? jobs.filter((j) => j.type === STEP_JOB[step] && j.characterId === characterId && j.parentId !== parent?.id && j.createdAt > after).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined;
  let firstOpen = true;
  return CREATE_STEPS.map((step, i) => {
    const recordedJob = childFor(step);
    const retry = (retries[step] ? jobs.find((j) => j.id === retries[step]) : undefined) ?? laterFor(step, recordedJob?.createdAt ?? parent?.createdAt);
    const outcome = result?.steps.find((s) => s.step === step);
    const job = retry ?? childFor(step);
    const live = (j: Job): StepView => {
      if (j.status === 'COMPLETED') return { step, state: 'done', job: j };
      if (j.status === 'FAILED') return { step, state: 'failed', job: j, error: j.error ?? { code: 'UNKNOWN', message: '' }, message: j.error?.message };
      if (j.status === 'CANCELLED') return { step, state: 'failed', job: j, error: { code: 'CANCELLED', message: '' } };
      return { step, state: 'current', job: j, message: j.progress?.message, progress: j.progress };
    };
    // a retry the page started supersedes everything the parent recorded for that step
    if (retry) return live(retry);
    if (outcome) {
      if (outcome.status === 'done') return { step, state: 'done', job };
      if (outcome.status === 'skipped') return { step, state: 'skipped', reason: outcome.reason, job };
      return { step, state: 'failed', job, reason: outcome.reason, error: { code: outcome.failureClass ?? job?.error?.code ?? 'UNKNOWN', message: outcome.reason ?? job?.error?.message ?? '' } };
    }
    if (job) return live(job);
    if (!parent) return { step, state: i === 0 ? 'current' : 'pending' };
    if (parent.status === 'COMPLETED') return { step, state: 'done' };
    // no child yet: the parent's own step counter says where it is
    const idx = typeof reported === 'number' ? reported - 1 : (isActiveStatus(parent.status) ? 0 : -1);
    if (i < idx) return { step, state: 'done' };
    if (i === idx) {
      if (parentDead) return { step, state: 'failed', error: parent.error ?? { code: parent.status === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN', message: '' }, message: parent.error?.message };
      return { step, state: 'current', message: parent.progress?.message, progress: parent.progress };
    }
    if (parentDead) {
      // the parent died before this step: the first unfinished row carries the failure, the rest are skipped
      if (firstOpen && idx < 0) { firstOpen = false; return { step, state: 'failed', error: parent.error ?? { code: parent.status === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN', message: '' }, message: parent.error?.message }; }
      return { step, state: 'skipped' };
    }
    return { step, state: 'pending' };
  });
}

/** The character the creation made (or is making), from wherever the id first appears. */
export function createdCharacterId(parent: Job | undefined, jobs: Job[]): string | undefined {
  if (!parent) return undefined;
  return createResultOf(parent)?.characterId ?? parent.characterId ?? jobs.find((j) => j.parentId === parent.id && j.characterId)?.characterId;
}

/** Everything finished (well or badly) and nothing is still running for the creation. */
export function creationSettled(parent: Job | undefined, steps: StepView[]): boolean {
  if (!parent) return false;
  if (isActiveStatus(parent.status)) return false;
  return steps.every((s) => s.state !== 'current');
}

/** WHAT "TRY AGAIN" RE-RUNS (acceptance 2026-10-06: the step's Try again did nothing): the request this page sent, or —
 *  when the page was reopened on a running or failed creation, and holds no request of its own — the parent
 *  CREATE_CHARACTER job's own payload. Null only when neither exists (the page then says so and offers the brief). */
export function retryPayloadOf(sent: CreateCharacterPayload | null, parent: Pick<Job, 'type' | 'payload'> | undefined): CreateCharacterPayload | null {
  if (sent) return sent;
  return parent?.type === 'CREATE_CHARACTER' && parent.payload && typeof parent.payload === 'object' ? (parent.payload as CreateCharacterPayload) : null;
}