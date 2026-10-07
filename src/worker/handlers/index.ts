import type { Job, JobStatus, JobProgress, JobType } from '@/domain/jobs';
import type { Logger } from '@/server/log';
import type { GpuLease } from '../gpu';
import type { AgentDef } from '@/server/org/model';
import type { Delegator, ToolRunner } from '@/server/org/tools';
import type { NewStudioEvent } from '@/server/org/runs';

/** What every job handler gets. Handlers are plain async functions: they read the studio, call providers, write
 *  results back through studio commands, and return a small result object for the job record. Every job runs *as*
 *  a registered agent: provider calls go through `tool()` (allow-list, timeout, record) and what the agent did is
 *  announced with `activity()` so the Studio pages show real work. */
export interface HandlerContext {
  job: Job;
  log: Logger;
  workerId: string;
  /** the agent this job runs as, and the id of its recorded run */
  agent: AgentDef;
  runId: string;
  /** call a registered tool on the agent's allow-list; the call is timed and recorded on the run */
  tool: ToolRunner;
  /** run a specialist's real step inside this job as THAT agent (child run, its own allow-list, recorded); use
   *  `step()` below, which also works in tests that build a context without it */
  delegate?: Delegator;
  /** a studio event attributed to this agent (department and job filled in) */
  activity: (kind: string, message: string, data?: Record<string, unknown>, opts?: Partial<Pick<NewStudioEvent, 'agentId' | 'departmentId' | 'productionId'>>) => Promise<void>;
  /** Throws when the job was cancelled; call between steps. */
  checkpoint: () => Promise<void>;
  /** Report a phase (and keep the lease alive). */
  progress: (status: JobStatus, progress: JobProgress, extra?: { providerTaskId?: string; takeId?: string }) => Promise<void>;
  event: (level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => Promise<void>;
  /** Hold the GPU for a local model; released automatically when the callback returns. */
  gpu: GpuLease;
  /** Aborted when the job is cancelled, passes its deadline or loses its lease (src/server/jobs/context.ts). Providers,
   *  ffmpeg and ComfyUI already follow it through the job scope; pass it to anything else long-running. */
  signal?: AbortSignal;
}

export type Handler = (ctx: HandlerContext) => Promise<(Record<string, unknown> & { awaitingReview?: boolean }) | void>;

import { mediaProbe } from './media-probe';
import { designCharacter, developStory, episodeContinuity, writeScript, planShots } from './story';
import { autoIdea, ideaAudience, ideaConcepts, ideaResearch, ideaReview, ideaWrite } from './development';
import { generateTake } from './take';
import { characterAppearance, characterRefs, locationPlates, shotFrames } from './images';
import { voiceBuild, voicePreview, dialogueAudio } from './voice';
import { voiceDesign } from './voice-design';
import { checkSong, generateSong, writeSong } from './music';
import { assemble, exportCut } from './assemble';
import { produce } from './produce';
import { createCharacter } from './character';
import { correctLipsync } from './lipsync';

export const HANDLERS: Partial<Record<JobType, Handler>> = {
  CREATE_CHARACTER: createCharacter,
  MEDIA_PROBE: mediaProbe,
  AUTO_IDEA: autoIdea, DEVELOP_STORY: developStory, WRITE_SCRIPT: writeScript, PLAN_SHOTS: planShots,
  GENERATE_TAKE: generateTake, CORRECT_LIPSYNC: correctLipsync,
  CHARACTER_APPEARANCE: characterAppearance, CHARACTER_REFS: characterRefs, LOCATION_PLATES: locationPlates, SHOT_FRAMES: shotFrames,
  VOICE_DESIGN: voiceDesign, VOICE_BUILD: voiceBuild, VOICE_PREVIEW: voicePreview, DIALOGUE_AUDIO: dialogueAudio,
  WRITE_SONG: writeSong, GENERATE_SONG: generateSong, CHECK_SONG: checkSong,
  ASSEMBLE: assemble, EXPORT: exportCut,
  PRODUCE: produce,
  EPISODE_CONTINUITY: episodeContinuity, DESIGN_CHARACTER: designCharacter,
  // the research-driven Auto Idea's stages (AUTO_IDEA orchestrates them as child jobs)
  IDEA_RESEARCH: ideaResearch, IDEA_AUDIENCE: ideaAudience, IDEA_CONCEPTS: ideaConcepts, IDEA_WRITE: ideaWrite, IDEA_REVIEW: ideaReview,
};
