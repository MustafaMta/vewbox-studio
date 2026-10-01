import { bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { Beat, Brief, CharacterRef, ContinuityState, ExportRecord, IdeaPreferences, LocationRef, PendingReference, QaReport, Settings, ShotDialogue, Song, TakeReference, Voice } from '@/domain/types';
import type { JobError, JobProgress } from '@/domain/jobs';

/** THE DATABASE — the studio's source of truth. Shows, seasons, productions, scenes, shots, takes, characters,
 *  locations and assets are rows; the collections a page edits as one thing (beats and lines, dialogue, references,
 *  a song) are JSON columns on their row. Jobs, their events and measurements live beside them. */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

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
  createdAt: ts('created_at').notNull(),
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
