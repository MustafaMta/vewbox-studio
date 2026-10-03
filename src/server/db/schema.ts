import { bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Beat, Brief, CanonicalImage, CharacterRef, ContinuityState, ExportRecord, IdeaPreferences, LocationRef, PendingReference, QaReport, Settings, ShotDialogue, Song, TakeReference, Voice } from '@/domain/types';
import type { JobError, JobProgress } from '@/domain/jobs';
import type { Presentation } from '@/domain/presentation';

/** THE DATABASE — the studio's source of truth. Shows, seasons, productions, scenes, shots, takes, characters,
 *  locations and assets are rows; the collections a page edits as one thing (beats and lines, dialogue, references,
 *  a song) are JSON columns on their row. Jobs, their events and measurements live beside them. */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/** `characters.canonical_image`: the canonical image without its asset id (that is `canonical_asset_id`). */
export type StoredCanonicalImage = Omit<CanonicalImage, 'assetId'>;

export const shows = pgTable('shows', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  titleAr: text('title_ar'),
  logline: text('logline').notNull().default(''),
  genre: text('genre').notNull().default(''),
  style: text('style').notNull(),
  language: text('language').notNull(),
  dialect: text('dialect'),
  aspect: text('aspect').notNull(),
  synopsis: text('synopsis'),
  coverAssetId: text('cover_asset_id'),
  posterAssetId: text('poster_asset_id'),
  castIds: text('cast_ids').array().notNull().default([]),
  locationIds: text('location_ids').array().notNull().default([]),
  bible: jsonb('bible').$type<NonNullable<import('@/domain/types').Show['bible']>>(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const seasons = pgTable('seasons', {
  id: text('id').primaryKey(),
  showId: text('show_id').notNull().references(() => shows.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  arc: text('arc').notNull().default(''),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('seasons_show_idx').on(t.showId)]);

export const productions = pgTable('productions', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  showId: text('show_id').references(() => shows.id, { onDelete: 'cascade' }),
  seasonId: text('season_id').references(() => seasons.id, { onDelete: 'cascade' }),
  episodeNumber: integer('episode_number'),
  title: text('title').notNull(),
  titleAr: text('title_ar'),
  logline: text('logline').notNull().default(''),
  synopsis: text('synopsis').notNull().default(''),
  style: text('style').notNull(),
  language: text('language').notNull(),
  dialect: text('dialect'),
  aspect: text('aspect').notNull(),
  targetSeconds: integer('target_seconds').notNull(),
  stage: text('stage').notNull(),
  brief: jsonb('brief').$type<Brief>().notNull(),
  castIds: text('cast_ids').array().notNull().default([]),
  locationIds: text('location_ids').array().notNull().default([]),
  song: jsonb('song').$type<Song>(),
  coverAssetId: text('cover_asset_id'),
  posterAssetId: text('poster_asset_id'),
  artist: text('artist'),
  concept: text('concept'),
  genre: text('genre'),
  mood: text('mood'),
  cutAssetId: text('cut_asset_id'),
  exports: jsonb('exports').$type<ExportRecord[]>(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
}, (t) => [index('productions_show_idx').on(t.showId), index('productions_season_idx').on(t.seasonId)]);

export const scenes = pgTable('scenes', {
  id: text('id').primaryKey(),
  productionId: text('production_id').notNull().references(() => productions.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  locationId: text('location_id'),
  timeOfDay: text('time_of_day').notNull(),
  characterIds: text('character_ids').array().notNull().default([]),
  beats: jsonb('beats').$type<Beat[]>().notNull().default([]),
  purpose: text('purpose'),
  emotionalObjective: text('emotional_objective'),
  entryState: text('entry_state'),
  exitState: text('exit_state'),
}, (t) => [index('scenes_production_idx').on(t.productionId)]);

export const shots = pgTable('shots', {
  id: text('id').primaryKey(),
  productionId: text('production_id').notNull().references(() => productions.id, { onDelete: 'cascade' }),
  sceneId: text('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  number: integer('number').notNull(),
  purpose: text('purpose').notNull().default(''),
  action: text('action').notNull().default(''),
  framing: text('framing').notNull(),
  cameraMove: text('camera_move').notNull(),
  durationSeconds: doublePrecision('duration_seconds').notNull(),
  characterIds: text('character_ids').array().notNull().default([]),
  dialogue: jsonb('dialogue').$type<ShotDialogue[]>().notNull().default([]),
  transition: text('transition').notNull(),
  openingFrameAssetId: text('opening_frame_asset_id'),
  endingFrameAssetId: text('ending_frame_asset_id'),
  selectedTakeId: text('selected_take_id'),
  songWindow: jsonb('song_window').$type<{ from: number; to: number }>(),
  performance: jsonb('performance').$type<NonNullable<import('@/domain/types').Shot['performance']>>(),
  notes: text('notes'),
  continuity: jsonb('continuity').$type<ContinuityState>(),
  prompt: text('prompt'),
}, (t) => [index('shots_production_idx').on(t.productionId), index('shots_scene_idx').on(t.sceneId)]);

export const takes = pgTable('takes', {
  id: text('id').primaryKey(),
  shotId: text('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  productionId: text('production_id').notNull(),
  position: integer('position').notNull(),
  label: text('label').notNull(),
  assetId: text('asset_id').notNull(),
  createdAt: ts('created_at').notNull(),
  note: text('note'),
  status: text('status').notNull().default('READY'),
  provider: text('provider'),
  model: text('model'),
  requestId: text('request_id'),
  prompt: text('prompt'),
  params: jsonb('params').$type<Record<string, unknown>>(),
  seed: integer('seed'),
  references: jsonb('references').$type<TakeReference[]>(),
  width: integer('width'),
  height: integer('height'),
  durationSeconds: doublePrecision('duration_seconds'),
  fps: doublePrecision('fps'),
  generationMs: integer('generation_ms'),
  costUsd: doublePrecision('cost_usd'),
  qa: jsonb('qa').$type<QaReport>(),
  rejectionReason: text('rejection_reason'),
  jobId: text('job_id'),
  codeVersion: text('code_version'),
  workflowVersion: text('workflow_version'),
  thumbnailAssetId: text('thumbnail_asset_id'),
  trimStartFrames: integer('trim_start_frames'),
  soundtrack: jsonb('soundtrack').$type<{ kind: 'DIALOGUE' | 'SONG'; assetId?: string; lines: Array<{ lineId: string; from: number; to: number }> }>(),
  /** CONTINUATION | CUT | STORY_TRANSITION, as generated; and the take whose tail a continuation anchored */
  relation: text('relation'),
  continuesTakeId: text('continues_take_id'),
}, (t) => [index('takes_shot_idx').on(t.shotId), index('takes_production_idx').on(t.productionId)]);

export const characters = pgTable('characters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameAr: text('name_ar'),
  role: text('role').notNull().default(''),
  style: text('style').notNull(),
  sex: text('sex').notNull(),
  species: text('species'),
  ageYears: integer('age_years').notNull().default(30),
  build: text('build').notNull().default(''),
  face: text('face').notNull().default(''),
  hair: text('hair').notNull().default(''),
  skin: text('skin').notNull().default(''),
  eyes: text('eyes').notNull().default(''),
  distinguishing: text('distinguishing').array().notNull().default([]),
  wardrobe: text('wardrobe').notNull().default(''),
  personality: text('personality').notNull().default(''),
  language: text('language').notNull(),
  dialect: text('dialect'),
  voice: jsonb('voice').$type<Voice>().notNull(),
  refs: jsonb('refs').$type<CharacterRef[]>().notNull().default([]),
  portraitAssetId: text('portrait_asset_id'),
  usageKnown: boolean('usage_known').notNull().default(true),
  pendingReference: jsonb('pending_reference').$type<PendingReference>(),
  canon: jsonb('canon').$type<NonNullable<import('@/domain/types').Character['canon']>>(),
  notes: text('notes'),
  /** THE CANONICAL IMAGE (docs/CONTRACTS-IDENTITY-PACK.md v2): the one front full-body image as a column — queryable,
   *  and the picture cannot be deleted from under the character (RESTRICT; the saver deletes asset rows last) — plus
   *  status, version, how it was drawn, the check and the approval as JSON. The domain's `Character.canonicalImage`
   *  is assembled from both (src/server/studio/canonical-image.ts). */
  canonicalAssetId: text('canonical_asset_id').references(() => assets.id, { onDelete: 'restrict' }),
  canonicalImage: jsonb('canonical_image').$type<StoredCanonicalImage>(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

/** Append-only: a character was in a take. Rows are marked, never deleted, so the continuity rule holds. */
export const characterUsage = pgTable('character_usage', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  productionId: text('production_id').notNull(),
  productionTitle: text('production_title').notNull(),
  shotId: text('shot_id').notNull(),
  shotLabel: text('shot_label').notNull(),
  takeId: text('take_id').notNull(),
  takeLabel: text('take_label').notNull(),
  recordedAt: ts('recorded_at').notNull(),
  status: text('status').notNull().default('IN_TAKE'),
  /** The canonical image version the character had when the take was recorded (null: none yet, or an older record). */
  canonicalImageVersion: integer('canonical_image_version'),
}, (t) => [uniqueIndex('character_usage_unique').on(t.characterId, t.shotId, t.takeId), index('character_usage_character_idx').on(t.characterId)]);

export const locations = pgTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameAr: text('name_ar'),
  kind: text('kind').notNull(),
  description: text('description').notNull().default(''),
  style: text('style').notNull(),
  lighting: text('lighting').array().notNull().default([]),
  landmarks: text('landmarks').array().notNull().default([]),
  props: text('props').array().notNull().default([]),
  refs: jsonb('refs').$type<LocationRef[]>().notNull().default([]),
  masterAssetId: text('master_asset_id'),
  layout: jsonb('layout').$type<NonNullable<import('@/domain/types').Location['layout']>>(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const assets = pgTable('assets', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  /** PUBLIC: a bundled file under the public folder (sample media). LIBRARY: a file under LIBRARY_ROOT. */
  storage: text('storage').notNull(),
  path: text('path').notNull(),
  posterAssetId: text('poster_asset_id'),
  posterPath: text('poster_path'),
  label: text('label').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationSeconds: doublePrecision('duration_seconds'),
  fps: doublePrecision('fps'),
  tags: text('tags').array().notNull().default([]),
  sample: boolean('sample').notNull().default(false),
  origin: text('origin').notNull(),
  mimeType: text('mime_type'),
  bytes: integer('bytes'),
  sha256: text('sha256'),
  provenance: jsonb('provenance').$type<Record<string, unknown>>(),
  jobId: text('job_id'),
  /** Set by MEDIA_PROBE / the file sweep when the file behind the record cannot be read; the pages say so. */
  unavailable: boolean('unavailable').notNull().default(false),
  /** Character/location imagery: CANONICAL (an identity view), SECONDARY, RAW; null for everything else. */
  tier: text('tier'),
  createdAt: ts('created_at').notNull(),
  /** Pictures: dominant hue, edge colour, light backdrop, focal point, face box (docs/DESIGN-SYSTEM-V4.md §2.4),
   *  measured at ingest; null until measured (scripts/presentation-backfill.ts fills older rows). */
  presentation: jsonb('presentation').$type<Presentation>(),
});

export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  data: jsonb('data').$type<Settings>().notNull(),
  updatedAt: ts('updated_at').notNull(),
});

/** One row per studio: a version that changes with every command, for cheap change detection. */
export const studioMeta = pgTable('studio_meta', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().default(0),
  seededAt: ts('seeded_at'),
  seedKind: text('seed_kind'),
  /** The version right after the last seed/reset: `version === seedVersion` means untouched. */
  seedVersion: integer('seed_version').notNull().default(0),
  updatedAt: ts('updated_at').notNull(),
  /** Job intake paused (maintenance, cleanup): no job is accepted and no worker claims one until resumed. */
  intakePausedAt: ts('intake_paused_at'),
  intakePausedReason: text('intake_paused_reason'),
});

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  status: text('status').notNull().default('QUEUED'),
  priority: integer('priority').notNull().default(0),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  progress: jsonb('progress').$type<JobProgress>(),
  error: jsonb('error').$type<JobError>(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  runAfter: ts('run_after'),
  lockedBy: text('locked_by'),
  lockedAt: ts('locked_at'),
  heartbeatAt: ts('heartbeat_at'),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
  cancelRequested: boolean('cancel_requested').notNull().default(false),
  idempotencyKey: text('idempotency_key'),
  providerTaskId: text('provider_task_id'),
  parentId: text('parent_id'),
  productionId: text('production_id'),
  sceneId: text('scene_id'),
  shotId: text('shot_id'),
  takeId: text('take_id'),
  characterId: text('character_id'),
  locationId: text('location_id'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
}, (t) => [uniqueIndex('jobs_idempotency_idx').on(t.idempotencyKey), index('jobs_status_idx').on(t.status, t.priority, t.createdAt), index('jobs_production_idx').on(t.productionId), index('jobs_parent_idx').on(t.parentId)]);

export const jobEvents = pgTable('job_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  at: ts('at').notNull(),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),
}, (t) => [index('job_events_job_idx').on(t.jobId, t.id)]);

export const metrics = pgTable('metrics', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull(),
  jobId: text('job_id'),
  name: text('name').notNull(),
  value: doublePrecision('value').notNull(),
  unit: text('unit'),
  labels: jsonb('labels').$type<Record<string, string | number | boolean>>(),
}, (t) => [index('metrics_name_idx').on(t.name, t.at)]);

export const continuityVersions = pgTable('continuity_versions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  shotId: text('shot_id').notNull().references(() => shots.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  state: jsonb('state').$type<ContinuityState>().notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('continuity_shot_idx').on(t.shotId, t.version)]);

// ------------------------------------------------------------------------------------------- the studio organisation
// Departments, agents, tools and skills are defined in code (src/server/org/model.ts) and persisted here with their
// versions so pages, API and history read one organisation. Runs, handoffs, QA reports, approvals and studio events
// are the live record of its work.

export const departments = pgTable('departments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameAr: text('name_ar'),
  directorId: text('director_id').notNull(),
  responsibility: text('responsibility').notNull(),
  responsibilityAr: text('responsibility_ar'),
  stages: text('stages').array().notNull().default([]),
  order: integer('order').notNull().default(0),
  /** roles the department would need but nobody executes yet (model.ts PLANNED_ROLES) */
  plannedRoles: jsonb('planned_roles').$type<Array<{ id: string; name: string; nameAr: string; would: string; reason: string; reasonAr: string; phase: string }>>().notNull().default([]),
  orgVersion: integer('org_version').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameAr: text('name_ar'),
  departmentId: text('department_id').notNull(),
  role: text('role').notNull(),
  roleAr: text('role_ar'),
  description: text('description').notNull(),
  descriptionAr: text('description_ar'),
  /** delegated steps it performs inside other agents' jobs, and payload routes of a job type it executes */
  steps: jsonb('steps').$type<Array<{ id: string; name: string; nameAr: string; where: string }>>().notNull().default([]),
  payloadRoutes: jsonb('payload_routes').$type<Array<{ jobType: string; when: string }>>().notNull().default([]),
  systemInstructions: text('system_instructions').notNull(),
  model: text('model').notNull(),
  skills: text('skills').array().notNull().default([]),
  tools: text('tools').array().notNull().default([]),
  inputSchema: text('input_schema').notNull(),
  outputSchema: text('output_schema').notNull(),
  limits: jsonb('limits').$type<{ timeoutMs: number; maxAttempts: number; resource: string }>().notNull(),
  version: text('version').notNull(),
  qualityRequirements: text('quality_requirements').array().notNull().default([]),
  jobTypes: text('job_types').array().notNull().default([]),
  orgVersion: integer('org_version').notNull(),
  updatedAt: ts('updated_at').notNull(),
}, (t) => [index('agents_department_idx').on(t.departmentId)]);

export const tools = pgTable('tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  version: text('version').notNull(),
  inputSchema: text('input_schema').notNull(),
  outputSchema: text('output_schema').notNull(),
  permissions: text('permissions').array().notNull().default([]),
  timeoutMs: integer('timeout_ms').notNull(),
  resource: text('resource').notNull(),
  vramMb: integer('vram_mb'),
  errors: text('errors').array().notNull().default([]),
  orgVersion: integer('org_version').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  source: text('source').notNull(),
  sourceVersion: text('source_version').notNull(),
  supportedModels: text('supported_models').array().notNull().default([]),
  requiredTools: text('required_tools').array().notNull().default([]),
  /** computed at sync from evidence (VERIFIED / UNAVAILABLE / DRAFT); `note` holds the reason */
  status: text('status').notNull(),
  note: text('note'),
  /** PROMPT / PROCEDURE / REFERENCE, and the evidence the status was computed from */
  kind: text('kind'),
  evidence: jsonb('evidence').$type<{ implementedBy: Array<{ path: string; present: boolean }>; verifiedBy: Array<{ path: string; present: boolean }>; usedBy: string[]; injectedInto: string[] }>(),
  /** the SKILL.md body as read from disk at sync time (so the page shows what the agent reads) */
  instructions: text('instructions'),
  orgVersion: integer('org_version').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

/** One execution of a job by an agent: what it called, how it ended, how it was classified. */
export const agentRuns = pgTable('agent_runs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  departmentId: text('department_id').notNull(),
  jobId: text('job_id').notNull(),
  jobType: text('job_type').notNull(),
  attempt: integer('attempt').notNull(),
  productionId: text('production_id'),
  shotId: text('shot_id'),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  outcome: text('outcome'),
  failureClass: text('failure_class'),
  errorMessage: text('error_message'),
  toolCalls: jsonb('tool_calls').$type<Array<{ tool: string; version?: string; ms: number; ok: boolean; error?: string; failureClass?: string; at: string }>>().notNull().default([]),
  ms: integer('ms'),
  costUsd: doublePrecision('cost_usd'),
  /** A delegated step: the run of the agent whose job this step belongs to, and what the step does. */
  parentRunId: text('parent_run_id'),
  purpose: text('purpose'),
  /** What the run ran with: the agent's version, the organisation version, the model, skill and tool versions. */
  agentVersion: text('agent_version'),
  orgVersion: integer('org_version'),
  versions: jsonb('versions').$type<{ model: string; skills: Record<string, string>; tools: Record<string, string> }>(),
}, (t) => [index('agent_runs_agent_idx').on(t.agentId, t.startedAt), index('agent_runs_production_idx').on(t.productionId), index('agent_runs_job_idx').on(t.jobId), index('agent_runs_parent_idx').on(t.parentRunId)]);

/** A department's explicit delivery to the next one. */
export const handoffs = pgTable('handoffs', {
  id: text('id').primaryKey(),
  productionId: text('production_id').notNull(),
  stage: text('stage').notNull(),
  producerDepartment: text('producer_department').notNull(),
  receiverDepartment: text('receiver_department'),
  artifactIds: text('artifact_ids').array().notNull().default([]),
  inputVersions: jsonb('input_versions').$type<Record<string, string | number>>().notNull().default({}),
  outputVersions: jsonb('output_versions').$type<Record<string, string | number>>().notNull().default({}),
  validation: jsonb('validation').$type<{ ok: boolean; checks: Array<{ name: string; ok: boolean; detail?: string }> }>().notNull(),
  qualityStatus: text('quality_status').notNull(),
  remainingDependencies: text('remaining_dependencies').array().notNull().default([]),
  jobId: text('job_id'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('handoffs_production_idx').on(t.productionId, t.createdAt)]);

/** An inspector's structured verdict on a subject (take, cut, export, character, location). */
export const qaReports = pgTable('qa_reports', {
  id: text('id').primaryKey(),
  productionId: text('production_id'),
  subjectKind: text('subject_kind').notNull(),
  subjectId: text('subject_id').notNull(),
  inspectorId: text('inspector_id').notNull(),
  checks: jsonb('checks').$type<Array<{ name: string; ok: boolean; value?: string | number; threshold?: string | number; detail?: string }>>().notNull(),
  failureClass: text('failure_class'),
  decision: text('decision').notNull(),
  evidenceAssetIds: text('evidence_asset_ids').array().notNull().default([]),
  notes: text('notes'),
  jobId: text('job_id'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('qa_reports_production_idx').on(t.productionId, t.createdAt), index('qa_reports_subject_idx').on(t.subjectKind, t.subjectId)]);

/** A human decision on a subjective or gated matter. */
export const approvals = pgTable('approvals', {
  id: text('id').primaryKey(),
  productionId: text('production_id').notNull(),
  stage: text('stage').notNull(),
  subjectKind: text('subject_kind').notNull(),
  subjectId: text('subject_id').notNull(),
  decision: text('decision').notNull(),
  by: text('by').notNull(),
  note: text('note'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('approvals_production_idx').on(t.productionId, t.createdAt)]);

/** The studio's activity feed: real work, attributed to the department and agent that did it. */
export const studioEvents = pgTable('studio_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull(),
  departmentId: text('department_id').notNull(),
  agentId: text('agent_id'),
  productionId: text('production_id'),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),
  jobId: text('job_id'),
}, (t) => [index('studio_events_at_idx').on(t.at), index('studio_events_production_idx').on(t.productionId, t.at)]);

/** A repeated attempt, investigated: what failed, why, what changed. */
export const reliabilityEvents = pgTable('reliability_events', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  jobType: text('job_type').notNull(),
  productionId: text('production_id'),
  shotId: text('shot_id'),
  attempt: integer('attempt').notNull(),
  failureClass: text('failure_class').notNull(),
  failureMessage: text('failure_message'),
  changeMade: text('change_made'),
  resolved: boolean('resolved').notNull().default(false),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('reliability_events_job_idx').on(t.jobId), index('reliability_events_at_idx').on(t.createdAt)]);

export const models = pgTable('models', {
  name: text('name').primaryKey(),
  version: text('version').notNull(),
  source: text('source').notNull(),
  license: text('license').notNull(),
  kind: text('kind').notNull(),
  local: boolean('local').notNull(),
  path: text('path'),
  sha256: text('sha256'),
  bytes: doublePrecision('bytes'),
  vramMb: integer('vram_mb'),
  status: text('status').notNull().default('UNKNOWN'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  updatedAt: ts('updated_at').notNull(),
});

export const workflows = pgTable('workflows', {
  name: text('name').notNull(),
  version: text('version').notNull(),
  graph: jsonb('graph').$type<Record<string, unknown>>().notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.name, t.version] })]);

/** Proposals the story engine wrote, kept so a producer can come back to one and so acceptance is reproducible. */
export const proposals = pgTable('proposals', {
  id: text('id').primaryKey(),
  jobId: text('job_id'),
  request: jsonb('request').$type<{ kind: string; showId?: string; seasonId?: string; preferences: IdeaPreferences; brief?: string }>().notNull(),
  proposal: jsonb('proposal').$type<import('@/domain/types').IdeaProposal>().notNull(),
  createdAt: ts('created_at').notNull(),
});

// ------------------------------------------------------------------------------------------------- the World Bible
// docs/research/MINIMAX-CONTINUITY.md §4 (src/domain/world.ts, src/server/world). Append-only: rows are inserted,
// never updated or deleted by the studio. No foreign keys to the studio's rows: the history outlives a deleted show
// or production, and the studio saver never touches these tables.

/** A revision of a scope's World Bible (`show:<id>` or `production:<id>`): the resolved bible and what changed. */
export const worldRevisions = pgTable('world_revisions', {
  id: text('id').primaryKey(),
  scopeKey: text('scope_key').notNull(),
  showId: text('show_id'),
  productionId: text('production_id'),
  number: integer('number').notNull(),
  parentId: text('parent_id'),
  authorKind: text('author_kind').notNull(),
  authorId: text('author_id').notNull(),
  reason: text('reason').notNull(),
  changes: jsonb('changes').$type<import('@/domain/types').WorldChange[]>().notNull().default([]),
  hash: text('hash').notNull(),
  bible: jsonb('bible').$type<import('@/domain/types').WorldBible>().notNull(),
  jobId: text('job_id'),
  createdAt: ts('created_at').notNull(),
}, (t) => [uniqueIndex('world_revisions_scope_number_idx').on(t.scopeKey, t.number), index('world_revisions_show_idx').on(t.showId), index('world_revisions_production_idx').on(t.productionId)]);

/** A production's pin to a revision (the latest row is the pin): at story approval, and each safe re-pin after. */
export const worldPins = pgTable('world_pins', {
  id: text('id').primaryKey(),
  productionId: text('production_id').notNull(),
  revisionId: text('revision_id').notNull().references(() => worldRevisions.id, { onDelete: 'restrict' }),
  revisionNumber: integer('revision_number').notNull(),
  scopeKey: text('scope_key').notNull(),
  reason: text('reason').notNull(),
  approvalId: text('approval_id'),
  diff: jsonb('diff').$type<import('@/domain/types').WorldChange[]>().notNull().default([]),
  by: text('by').notNull(),
  jobId: text('job_id'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('world_pins_production_idx').on(t.productionId, t.createdAt)]);

/** What a job read from the bible for a shot: the revision, whether it was the pin, the plate and images used. */
export const worldReads = pgTable('world_reads', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  productionId: text('production_id').notNull(),
  revisionId: text('revision_id').notNull(),
  revisionNumber: integer('revision_number').notNull(),
  pinned: boolean('pinned').notNull(),
  jobId: text('job_id'),
  jobType: text('job_type').notNull(),
  shotId: text('shot_id'),
  takeId: text('take_id'),
  read: jsonb('read').$type<import('@/domain/types').WorldRead>().notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('world_reads_production_idx').on(t.productionId, t.createdAt), index('world_reads_take_idx').on(t.takeId)]);

/** The production audio timeline a cut was rendered from (src/domain/timeline.ts), one revision per change. */
export const audioTimelines = pgTable('audio_timelines', {
  id: text('id').primaryKey(),
  productionId: text('production_id').notNull(),
  revision: integer('revision').notNull(),
  hash: text('hash').notNull(),
  timeline: jsonb('timeline').$type<Record<string, unknown>>().notNull(),
  cutAssetId: text('cut_asset_id'),
  jobId: text('job_id'),
  createdAt: ts('created_at').notNull(),
}, (t) => [uniqueIndex('audio_timelines_production_revision_idx').on(t.productionId, t.revision)]);

// ------------------------------------------------------------------------- research and story development
// docs/CONTRACTS-AUTO-IDEA.md — evidence the Trend Research Agent gathered, the cache that keeps it from being fetched
// twice, each run's coverage, and the versioned artifacts every development agent writes.

/** One fetch from one source (a provider + query + language/region), with its expiry. A later run inside the expiry
 *  reuses the items instead of calling the source again. */
export const researchCache = pgTable('research_cache', {
  key: text('key').primaryKey(),
  platform: text('platform').notNull(),
  provider: text('provider').notNull(),
  query: text('query').notNull(),
  status: text('status').notNull(),
  detail: text('detail').notNull().default(''),
  itemIds: text('item_ids').array().notNull().default([]),
  fetchedAt: ts('fetched_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [index('research_cache_expires_idx').on(t.expiresAt)]);

/** A piece of evidence (src/domain/development.ts ResearchItem). Unique per platform + URL: a later fetch updates the
 *  measurements and retrievedAt rather than duplicating it. */
export const researchItems = pgTable('research_items', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  provider: text('provider').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  publishedAt: ts('published_at'),
  retrievedAt: ts('retrieved_at').notNull(),
  category: text('category').notNull(),
  language: text('language'),
  region: text('region'),
  metrics: jsonb('metrics').$type<import('@/domain/development').ResearchMetrics>().notNull().default({}),
  excerpt: text('excerpt'),
  query: text('query').notNull(),
  creator: text('creator'),
}, (t) => [uniqueIndex('research_items_url_idx').on(t.platform, t.url), index('research_items_retrieved_idx').on(t.retrievedAt)]);

/** One research run of one Auto Idea: the topics chosen, what every platform answered, the items used. */
export const researchRuns = pgTable('research_runs', {
  id: text('id').primaryKey(),
  ideaJobId: text('idea_job_id'),
  jobId: text('job_id'),
  status: text('status').notNull(),
  request: jsonb('request').$type<Record<string, unknown>>().notNull(),
  topics: jsonb('topics').$type<import('@/domain/development').ResearchTopic[]>().notNull().default([]),
  coverage: jsonb('coverage').$type<import('@/domain/development').ProviderCoverage[]>().notNull().default([]),
  itemIds: text('item_ids').array().notNull().default([]),
  reusedFromCache: integer('reused_from_cache').notNull().default(0),
  limitations: text('limitations').array().notNull().default([]),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
}, (t) => [index('research_runs_idea_idx').on(t.ideaJobId)]);

/** The versioned output of each development stage (research summary, audience analysis, concepts, draft, review).
 *  A revision is a new row with the next version; nothing is overwritten. */
export const developmentArtifacts = pgTable('development_artifacts', {
  id: text('id').primaryKey(),
  ideaJobId: text('idea_job_id').notNull(),
  stage: text('stage').notNull(),
  version: integer('version').notNull(),
  agentId: text('agent_id').notNull(),
  jobId: text('job_id'),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [uniqueIndex('development_artifacts_stage_idx').on(t.ideaJobId, t.stage, t.version)]);
