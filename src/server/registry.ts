import fsp from 'node:fs/promises';
import { englishEngine } from './providers/voice-engines';
import path from 'node:path';
import { sql as dsql } from 'drizzle-orm';
import { db, schema } from './db/client';
import { env } from './env';
import * as comfy from './providers/comfy';
import { MODELS, aceStepSong, minimaxH3Video, minimaxMusic3Song, qwenCanonicalImage, qwenEdit, qwenReferenceCanonical, qwenSecondary, qwenTextToImage, referenceReadGraph, workflowVersion, type Graph } from './workflows';
import { log } from './log';

/** THE MODEL AND WORKFLOW REGISTRY — what the studio can generate with, as rows in Postgres: every pinned weight from
 *  the manifest with its licence and whether the engine that serves it can see it right now, the hosted MiniMax
 *  models with whether a key exists, and every workflow template with a version hash of its structure (the hash a
 *  take records). Synced by the worker on boot and on an explicit check (POST /api/registry); reading never syncs. */

interface ManifestFile { repo: string; file: string; folder: string; bytes?: number; sha256?: string; license: string }
interface Manifest { groups: Array<{ name: string; purpose: string; files: ManifestFile[] }> }

export async function readManifest(): Promise<Manifest | null> {
  const candidates = [process.env.MODELS_MANIFEST, path.resolve(process.cwd(), 'docker/models/manifest.json')].filter(Boolean) as string[];
  for (const p of candidates) { try { return JSON.parse(await fsp.readFile(p, 'utf8')) as Manifest; } catch { /* next */ } }
  return null;
}

const KIND_BY_FOLDER: Record<string, string> = { diffusion_models: 'DIFFUSION', text_encoders: 'TEXT_ENCODER', vae: 'VAE', loras: 'LORA' };

/** The templates, rendered once with placeholder inputs, so their structure can be versioned. */
export function workflowTemplates(): Array<{ name: string; graph: Graph }> {
  return [
    { name: 'qwen-image.t2i', graph: qwenTextToImage({ prompt: '', width: 1024, height: 1024 }) },
    { name: 'qwen-image.edit', graph: qwenEdit({ prompt: '', references: ['a.png', 'b.png', 'c.png'] }) },
    // the canonical character image (docs/CONTRACTS-IDENTITY-PACK.md v2) and its optional secondary material
    { name: 'qwen-image.canonical', graph: qwenCanonicalImage({ prompt: '' }) },
    { name: 'qwen-image.canonical-draft', graph: qwenCanonicalImage({ prompt: '', quality: false }) },
    // the Image Reference redraw (character from a picture): Qwen-Image-Edit-2511, the only engine since 2026-10-06
    { name: 'qwen-image.canonical-reference', graph: qwenReferenceCanonical({ upload: 'a.png', faceRect: { x: 0, y: 0, width: 256, height: 256 }, prompt: '' }) },
    { name: 'qwen3.5.reference-read', graph: referenceReadGraph({ image: 'a.png', describe: true }) },
    { name: 'qwen-image.secondary', graph: qwenSecondary({ canonical: 'a.png', kind: 'EXPRESSION', prompt: '' }) },
    { name: 'qwen-image.secondary-portrait', graph: qwenSecondary({ canonical: 'a.png', kind: 'PORTRAIT', prompt: '', crop: { x: 0, y: 0, width: 512, height: 640 } }) },
    { name: 'minimax-h3.fl2va', graph: minimaxH3Video({ prompt: '', width: 1280, height: 720, seconds: 6, firstFrame: 'a.png', lastFrame: 'b.png' }) },
    { name: 'minimax-h3.ref2va', graph: minimaxH3Video({ prompt: '', width: 1280, height: 720, seconds: 6, referenceImages: ['a.png'], referenceAudio: ['a.wav'] }) },
    // the explicit draft tier (turbo LoRAs): versioned and node-checked beside the final tier the other templates use
    { name: 'minimax-h3.ref2va-draft', graph: minimaxH3Video({ prompt: '', width: 1280, height: 720, seconds: 6, referenceImages: ['a.png'], referenceAudio: ['a.wav'], quality: 'draft' }) },
    { name: 'minimax-h3.fl2va-draft', graph: minimaxH3Video({ prompt: '', width: 1280, height: 720, seconds: 6, firstFrame: 'a.png', lastFrame: 'b.png', quality: 'draft' }) },
    // a reference shot with its opening frame anchored at 0 and the recorded line at frame 0 (CUT / STORY_TRANSITION)
    { name: 'minimax-h3.ref2va-opening', graph: minimaxH3Video({ prompt: '', width: 1280, height: 720, seconds: 6, referenceImages: ['a.png', 'b.png'], firstFrame: 'c.png', guides: [{ frameIdx: 0, audio: 'a.wav' }] }) },
    // a continuation: the previous take's tail, frames AND sound, at 0; the recorded line at the first new frame
    { name: 'minimax-h3.ref2va-continuation', graph: minimaxH3Video({ prompt: '', width: 1280, height: 720, seconds: 6, referenceImages: ['a.png', 'b.png'], guides: [{ frameIdx: 0, image: 'tail.mov', imageIsVideo: true, audioFromVideo: true }, { frameIdx: 22, audio: 'a.wav' }] }) },
    { name: 'ace-step-1.5.xl-sft.song', graph: aceStepSong({ caption: '', lyrics: '', seconds: 60, variant: 'xl-sft' }) },
    { name: 'ace-step-1.5.xl-turbo.song', graph: aceStepSong({ caption: '', lyrics: '', seconds: 60, variant: 'xl-turbo' }) },
    { name: 'minimax-music-3.song', graph: minimaxMusic3Song({ caption: '', lyrics: '', seconds: 60 }) },
  ];
}

export interface RegistryRow { name: string; version: string; source: string; license: string; kind: string; local: boolean; path?: string | null; sha256?: string | null; bytes?: number | null; status: string; metadata?: Record<string, unknown> | null; updatedAt: string }

export async function syncRegistry(): Promise<{ models: number; workflows: number; present: number }> {
  const e = env();
  const now = new Date().toISOString();
  const rows: Array<typeof schema.models.$inferInsert> = [];
  // local weights: presence as the serving engine reports it
  const manifest = await readManifest();
  const comfyUp = (await comfy.health()).ok;
  const listings = new Map<string, string[]>();
  if (comfyUp) for (const folder of ['diffusion_models', 'text_encoders', 'vae', 'loras']) listings.set(folder, await comfy.listModels(folder).catch(() => [] as string[]));
  const asrHealth = await fetch(`${e.ASR_URL}/health`, { signal: AbortSignal.timeout(2500) }).then((r) => r.json() as Promise<{ weights_present?: boolean }>).catch(() => null);
  const used = new Set<string>(Object.values(MODELS));
  for (const g of manifest?.groups ?? []) {
    for (const f of g.files) {
      const base = path.posix.basename(f.file);
      const folder = f.folder;
      let status = 'UNKNOWN';
      if (listings.has(folder)) status = listings.get(folder)!.includes(base) ? 'PRESENT' : 'MISSING';
      else if (folder.startsWith('asr/')) status = asrHealth ? (asrHealth.weights_present ? 'PRESENT' : 'MISSING') : 'UNKNOWN';
      rows.push({ name: `${folder}/${base}`, version: f.repo, source: `https://huggingface.co/${f.repo}/blob/main/${f.file}`, license: f.license, kind: KIND_BY_FOLDER[folder] ?? (folder.startsWith('asr') ? 'ASR' : 'WEIGHTS'), local: true, path: `${folder}/${base}`, sha256: f.sha256 ?? null, bytes: f.bytes ?? null, vramMb: null, status, metadata: { group: g.name, purpose: g.purpose, usedByWorkflows: used.has(base) }, updatedAt: now });
    }
  }
  // voices and transcription (served by their own containers)
  rows.push({ name: 'voice/indextts-2.5', version: '2.5', source: 'https://github.com/index-tts/index-tts', license: 'bilibili Model Use License (commercial use below 100M MAU / RMB 1bn revenue; outputs must not train other models, §3.4c)', kind: 'TTS', local: true, status: 'SERVICE', metadata: { service: e.TTS_URL, languages: ['EN', 'AR'] }, updatedAt: now });
  rows.push({ name: 'voice/habibi-tts-irq', version: 'IRQ', source: 'https://huggingface.co/SWivid/Habibi-TTS', license: 'Apache-2.0 per licensor; data-provenance risk (F5-TTS init on Emilia, CC-BY-NC); legal review before commercial release', kind: 'TTS', local: true, status: 'SERVICE', metadata: { service: e.TTS_HABIBI_URL, languages: ['AR-IQ'] }, updatedAt: now });
  // MOSS-TTS v1.5: the English production candidate (PRODUCTION-STACK-DIRECTIVE 2026-10-06); SERVICE once promoted
  // (VOICE_ENGINE_EN=moss, compose profile `moss`), PRESENT on the store until then
  rows.push({ name: 'voice/moss-tts-v1.5', version: '1.5', source: 'https://huggingface.co/OpenMOSS-Team/MOSS-TTS-v1.5', license: 'Apache-2.0', kind: 'TTS', local: true, status: englishEngine(e.VOICE_ENGINE_EN) === 'moss' ? 'SERVICE' : 'PRESENT', metadata: { service: e.TTS_MOSS_URL, languages: ['EN', 'AR'], role: englishEngine(e.VOICE_ENGINE_EN) === 'moss' ? 'the English voice engine for new voices' : 'candidate (profile moss); promoted by VOICE_ENGINE_EN=moss after the real-UI proof' }, updatedAt: now });
  rows.push({ name: 'audio/demucs-htdemucs', version: '4.0.1', source: 'https://github.com/adefossez/demucs', license: 'MIT', kind: 'SEPARATION', local: true, status: asrHealth ? 'SERVICE' : 'UNKNOWN', metadata: { service: e.ASR_URL }, updatedAt: now });
  // hosted MiniMax
  const key = Boolean(e.MINIMAX_API_KEY);
  for (const [name, version, kind] of [['minimax/video', e.MINIMAX_VIDEO_MODEL, 'VIDEO'], ['minimax/text', e.MINIMAX_TEXT_MODEL, 'LLM'], ['minimax/speech', e.MINIMAX_SPEECH_MODEL, 'TTS'], ['minimax/music', e.MINIMAX_MUSIC_MODEL, 'MUSIC']] as const) {
    rows.push({ name, version, source: e.MINIMAX_BASE_URL, license: 'MiniMax platform terms (per-use billing)', kind, local: false, status: key ? 'CONFIGURED' : 'NO_KEY', metadata: { endpoint: name === 'minimax/video' ? '/v2/video_generation' : undefined }, updatedAt: now });
  }
  // local story model
  rows.push({ name: 'llm/openai-compatible', version: e.OPENAI_COMPATIBLE_MODEL, source: e.OPENAI_COMPATIBLE_BASE_URL, license: 'per model (Qwen3.6 / Qwen3: Apache-2.0; Gemma 4: Apache-2.0 with the Gemma Terms of Use linked)', kind: 'LLM', local: true, status: 'SERVICE', metadata: null, updatedAt: now });
  // rendered once per sync (each template builds a full graph)
  const templates = workflowTemplates();
  await db().transaction(async (tx) => {
    for (const r of rows) await tx.insert(schema.models).values(r).onConflictDoUpdate({ target: schema.models.name, set: { ...r } });
    for (const w of templates) {
      const version = workflowVersion(w.graph);
      await tx.insert(schema.workflows).values({ name: w.name, version, graph: w.graph as unknown as Record<string, unknown>, createdAt: now }).onConflictDoNothing();
    }
  });
  const present = rows.filter((r) => r.status === 'PRESENT').length;
  log.info({ models: rows.length, present, workflows: templates.length }, 'registry synced');
  return { models: rows.length, workflows: templates.length, present };
}

export async function readRegistry(): Promise<{ models: RegistryRow[]; workflows: Array<{ name: string; version: string; createdAt: string; nodes: number }> }> {
  const models = await db().select().from(schema.models).orderBy(schema.models.kind, schema.models.name);
  const wf = await db().execute<{ name: string; version: string; created_at: string; nodes: number }>(dsql`select name, version, created_at, (select count(*) from jsonb_object_keys(graph)) as nodes from workflows order by name, created_at desc`);
  return { models: models as RegistryRow[], workflows: wf.map((w) => ({ name: w.name, version: w.version, createdAt: w.created_at, nodes: Number(w.nodes) })) };
}

/** Metrics summary for the Reliability panel: per metric name, count, mean, p50, p95 over a window. */
export async function metricsSummary(hours = 24): Promise<Array<{ name: string; unit: string | null; count: number; mean: number; p50: number; p95: number; max: number }>> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = await db().execute<{ name: string; unit: string | null; count: string; mean: number; p50: number; p95: number; max: number }>(dsql`
    select name, max(unit) as unit, count(*) as count, avg(value) as mean,
           percentile_cont(0.5) within group (order by value) as p50,
           percentile_cont(0.95) within group (order by value) as p95,
           max(value) as max
    from metrics where at > ${since} group by name order by name`);
  return rows.map((r) => ({ name: r.name, unit: r.unit, count: Number(r.count), mean: Number(r.mean), p50: Number(r.p50), p95: Number(r.p95), max: Number(r.max) }));
}

/** Job outcomes over a window: per type, how many completed / failed / cancelled, attempts, and durations. */
export async function jobOutcomes(hours = 24): Promise<Array<{ type: string; completed: number; failed: number; cancelled: number; running: number; meanAttempts: number; p50Ms: number | null }>> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = await db().execute<{ type: string; completed: string; failed: string; cancelled: string; running: string; mean_attempts: number; p50_ms: number | null }>(dsql`
    select type,
      count(*) filter (where status = 'COMPLETED') as completed,
      count(*) filter (where status = 'FAILED') as failed,
      count(*) filter (where status = 'CANCELLED') as cancelled,
      count(*) filter (where status in ('QUEUED','PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')) as running,
      avg(attempts) as mean_attempts,
      percentile_cont(0.5) within group (order by extract(epoch from (finished_at::timestamptz - started_at::timestamptz)) * 1000) filter (where status = 'COMPLETED' and started_at is not null and finished_at is not null) as p50_ms
    from jobs where created_at > ${since} group by type order by type`);
  return rows.map((r) => ({ type: r.type, completed: Number(r.completed), failed: Number(r.failed), cancelled: Number(r.cancelled), running: Number(r.running), meanAttempts: Number(r.mean_attempts), p50Ms: r.p50_ms === null ? null : Number(r.p50_ms) }));
}
