import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import type { Command, CommandName } from '@/domain/commands';
import type { StudioState } from '@/domain/types';

/** VOICE IDENTITY V2 — REAL VERIFICATION through the studio's own code paths (docs/CONTRACTS-VOICE-IDENTITY-V2.md):
 *  the VOICE_DESIGN / VOICE_BUILD / VOICE_PREVIEW handlers, the real tool runner of the Voice Casting agent (allow-list
 *  and tool contracts enforced), the real GPU lease, and the real services — tts-design (VoxCPM2 + ECAPA, :8022),
 *  IndexTTS (:8020), Habibi IRQ (:8021), faster-whisper (:8030), ffmpeg. What is NOT real: the studio is kept in memory
 *  with the real reducers (never the shared database), the library is a scratch folder, and run records are captured
 *  here instead of written to the database. Runs: (A) AUTOMATIC English, (B) AUTOMATIC MSA, (C) manual DESIGN with a
 *  chosen candidate, (D) the Iraqi refusal, (E) the allowDesignedIraqi experiment. Output: docs/evidence/voice-identity-v2/.
 *  Nothing here judges naturalness, accent or dialect: listeners do. */

const mem = vi.hoisted(() => ({ state: null as unknown as StudioState, toolCalls: [] as Array<Record<string, unknown>>, qa: [] as Array<Record<string, unknown>> }));
vi.mock('@/server/studio/engine', async () => {
  const { runCommand } = await import('@/domain/commands');
  type Spec = { name: CommandName; args: unknown[] };
  const stamp = (list: Spec[], opts: { seed?: string; at?: string } = {}) => { const s = opts.seed ?? `ev-${Math.random().toString(36).slice(2)}`; const at = opts.at ?? new Date().toISOString(); return list.map((c, i) => ({ ...c, seed: `${s}-${i}`, at }) as Command); };
  const apply = async (cmds: Command[]) => { let s = mem.state; const results: unknown[] = []; for (const c of cmds) { const r = runCommand(s, c); s = r.state; results.push(r.result ?? null); } mem.state = s; return results; };
  return { readState: async () => ({ state: mem.state, version: 1, hash: 'h' }), command: async (name: CommandName, args: unknown[]) => (await apply(stamp([{ name, args }])))[0], commands: async (list: Spec[], _o?: string, opts?: { seed?: string; at?: string }) => apply(stamp(list, opts)), stampCommands: stamp, applyCommands: async () => { throw new Error('unused'); }, notifyJobs: async () => {}, notifyChange: async () => {}, currentVersion: async () => 1 };
});
vi.mock('@/server/jobs/queue', () => ({ recordMetric: async () => {} }));
vi.mock('@/server/org/runs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/org/runs')>()),
  recordToolCall: async (runId: string, call: Record<string, unknown>) => { mem.toolCalls.push({ runId, ...call }); },
  recordQaReport: async (r: Record<string, unknown>) => { mem.qa.push(r); return 'qa'; },
  recordHandoff: async () => 'h', studioEvent: async () => {}, startDelegatedRun: async () => 'run', finishRun: async () => {},
}));

import { emptyStudio } from '@/domain/actions';
import { runCommand } from '@/domain/commands';
import { JOB_PAYLOADS, type Job, type JobType } from '@/domain/jobs';
import { agentById } from '@/server/org/model';
import { makeToolRunner } from '@/server/org/tools';
import { preflightCharacter } from '@/server/org/preflight';
import { designHealth, unloadDesign } from '@/server/providers/voice-design';
import { unloadAsr, unloadTts } from '@/server/providers/speech';
import { env } from '@/server/env';
import { log } from '@/server/log';
import { gpuLease } from '@/worker/gpu';
import { voiceBuild, voicePreview } from '@/worker/handlers/voice';
import { voiceDesign } from '@/worker/handlers/voice-design';
import type { HandlerContext, Handler } from '@/worker/handlers';

const execFileP = promisify(execFile);
const OUT = path.resolve('docs/evidence/voice-identity-v2');
const REPORT = path.join(OUT, 'report.json');
const agent = agentById('voice-casting')!;

const gpuMb = async (): Promise<{ usedMb: number; totalMb: number } | null> => {
  try { const { stdout } = await execFileP('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits']); const [u, t] = stdout.trim().split(',').map((x) => Number(x.trim())); return { usedMb: u, totalMb: t }; } catch { return null; }
};
const health = async (url: string) => { try { const r = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) }); return await r.json() as Record<string, unknown>; } catch (e) { return { error: (e as Error).message }; } };

const profile = (p: { name: string; role: string; sex: 'FEMALE' | 'MALE'; ageYears: number; language: 'EN' | 'AR'; dialect?: 'MSA' | 'IRAQI_BAGHDADI'; pitch: 'LOW' | 'MID' | 'HIGH'; pace: 'SLOW' | 'MEASURED' | 'QUICK'; timbre: string; personality: string }) => ({ name: p.name, role: p.role, style: 'REALISTIC' as const, sex: p.sex, ageYears: p.ageYears, build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: p.personality, distinguishing: [], language: p.language, dialect: p.dialect, voice: { pitch: p.pitch, pace: p.pace, timbre: p.timbre } });
const addCharacter = (input: ReturnType<typeof profile>): string => {
  const r = runCommand(mem.state, { name: 'addCharacter', args: [input], seed: `ev-${input.name}`, at: new Date().toISOString() } as Command<'addCharacter'>);
  mem.state = r.state;
  return r.result.character.id;
};
const character = (id: string) => mem.state.characters.find((c) => c.id === id)!;
const libFile = (assetId: string) => { const a = mem.state.assets.find((x) => x.id === assetId)!; return path.join(env().LIBRARY_ROOT, String(a.provenance?.path ?? '')); };
const copy = (assetId: string | undefined, run: string, name: string): string | undefined => {
  if (!assetId) return undefined;
  const src = libFile(assetId);
  if (!fs.existsSync(src)) return undefined;
  fs.mkdirSync(path.join(OUT, run), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, run, name));
  return `${run}/${name}`;
};

interface RunRecord { run: string; what: string; type: JobType; characterId: string; payload: Record<string, unknown>; preflight: unknown; startedAt: string; ms?: number; gpuBefore: unknown; gpuAfter?: unknown; result?: unknown; error?: { code?: string; message: string; failureClass?: string }; events: unknown[]; progress: unknown[]; activity: unknown[]; toolCalls: unknown[] }

async function runJob(run: string, what: string, type: JobType, handler: Handler, payload: Record<string, unknown>, jobId: string): Promise<RunRecord> {
  const parsed = (JOB_PAYLOADS[type] as { parse: (x: unknown) => Record<string, unknown> }).parse(payload);
  const characterId = String(parsed.characterId);
  const rec: RunRecord = { run, what, type, characterId, payload: parsed, preflight: preflightCharacter(mem.state, character(characterId), type, parsed), startedAt: new Date().toISOString(), gpuBefore: await gpuMb(), events: [], progress: [], activity: [], toolCalls: [] };
  const runId = `run-${jobId}`;
  const job = { id: jobId, type, status: 'PREPARING', priority: 0, payload: parsed, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: rec.startedAt, updatedAt: rec.startedAt } as Job;
  const ctx: HandlerContext = {
    job, log, workerId: 'evidence', agent, runId, tool: makeToolRunner(agent, runId, log),
    activity: async (kind, message, data) => { rec.activity.push({ kind, message, data }); },
    checkpoint: async () => {}, progress: async (status, p) => { rec.progress.push({ at: new Date().toISOString(), status, ...p }); },
    event: async (level, message, data) => { rec.events.push({ at: new Date().toISOString(), level, message, data }); },
    gpu: gpuLease,
  };
  const t0 = Date.now();
  try { rec.result = await handler(ctx); } catch (e) { const err = e as { code?: string; message: string; failureClass?: string }; rec.error = { code: err.code, message: err.message, failureClass: err.failureClass }; }
  rec.ms = Date.now() - t0;
  rec.gpuAfter = await gpuMb();
  rec.toolCalls = mem.toolCalls.filter((c) => c.runId === runId).map((c) => ({ tool: c.tool, ms: c.ms, ok: c.ok, ...(c.error ? { error: c.error } : {}) }));
  return rec;
}

/** The files a listener needs from a character's designs and identity, copied next to the report. */
function collect(run: string, characterId: string, listen: Array<{ file: string; what: string }>, purpose: string) {
  const c = character(characterId);
  const files: Record<string, unknown> = {};
  for (const d of c.voice.designs ?? []) for (const x of d.candidates) {
    const seed = copy(x.assetId, run, `${d.id}-candidate-${x.index}-seed-${x.seed}-24k.wav`);
    const previews = (x.previews ?? []).map((p, j) => copy(p.assetId, run, `${d.id}-candidate-${x.index}-preview-${j + 1}-${p.engine}.wav`));
    files[`${d.id}#${x.index}`] = { seed, previews, nativeInScratchLibrary: x.nativeAssetId ? libFile(x.nativeAssetId) : undefined };
    if (seed) listen.push({ file: seed, what: `${c.name}: designed candidate ${x.index} (VoxCPM2, 24 kHz seed${d.chosen === x.index ? ', PINNED' : ''}; gate ${x.gate.ok ? 'passed' : `failed: ${x.gate.reasons.join('; ')}`}). Does it fit the description “${d.description}”? ${purpose}` });
    for (const p of previews) if (p) listen.push({ file: p, what: `${c.name}: candidate ${x.index} heard through ${d.lineEngine} — the same voice as its seed? ${purpose}` });
  }
  const id = c.voice.identity;
  if (id?.proof) { const proof = copy(id.proof.assetId, run, 'proof-line.wav'); files.proof = proof; if (proof) listen.push({ file: proof, what: `${c.name}: the proof line spoken by the pinned identity (${id.model}) — same voice as the pinned seed? ${purpose}` }); }
  return files;
}

describe('voice identity v2 — real engines', () => {
  it('A: AUTOMATIC English, B: AUTOMATIC MSA, C: DESIGN, D: Iraqi refusal, E: the designed-Iraqi experiment', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.mkdirSync(env().LIBRARY_ROOT, { recursive: true });
    mem.state = emptyStudio({ uiLanguage: 'en', reducedMotion: false, defaults: { style: 'REALISTIC', language: 'EN', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9' } });
    const report: Record<string, unknown> = {
      createdAt: new Date().toISOString(),
      harness: 'tests/evidence/voice-identity-v2.evidence.ts (vitest.evidence.config.ts)',
      note: 'Real services through the studio code paths (handlers, the Voice Casting tool runner with its contracts, the GPU lease); the studio in memory with the real reducers, the library in a scratch folder. Measurements only: naturalness, accent, dialect authenticity and whether a voice matches its description are NOT measured — they need listeners (VOICE-IDENTITY-V2 §5.2). ECAPA is VoxCeleb-trained: relative similarity, never identity proof. Whisper large-v3 is not dialect-tuned.',
      healthBefore: { design: await designHealth().catch((e: Error) => ({ error: e.message })), indextts: await health(env().TTS_URL), habibi: await health(env().TTS_HABIBI_URL), asr: await health(env().ASR_URL) },
      gpuBefore: await gpuMb(),
      runs: [] as RunRecord[],
    };
    const save = () => fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
    const runs = report.runs as RunRecord[];
    const listen: Array<{ file: string; what: string }> = [];
    const characters: Record<string, unknown> = {};
    const snapshot = (id: string) => { const c = character(id); return { id, name: c.name, language: c.language, dialect: c.dialect, sex: c.sex, ageYears: c.ageYears, voiceProfile: { pitch: c.voice.pitch, pace: c.voice.pace, timbre: c.voice.timbre }, identity: c.voice.identity, designs: c.voice.designs, samples: c.voice.samples.map((s) => ({ id: s.id, label: s.label, source: s.source, assetId: s.assetId, text: s.text })) }; };

    // A — AUTOMATIC, English, no recording
    const rana = addCharacter(profile({ name: 'Rana', role: 'Harbour pilot', sex: 'FEMALE', ageYears: 34, language: 'EN', pitch: 'MID', pace: 'MEASURED', timbre: 'warm, clear', personality: 'steady, dry humour' }));
    runs.push(await runJob('A-automatic-en', 'AUTOMATIC English build (no recording → designed voice)', 'VOICE_BUILD', voiceBuild, { characterId: rana, mode: 'AUTOMATIC' }, 'ev-A'));
    save();
    if (character(rana).voice.identity) runs.push(await runJob('A-automatic-en', 'VOICE_PREVIEW from the pinned designed voice (persistence of the identity)', 'VOICE_PREVIEW', voicePreview, { characterId: rana, text: 'Keep the engine slow until we clear the breakwater.' }, 'ev-A-preview'));
    save();

    // B — AUTOMATIC, MSA, no recording
    const salim = addCharacter(profile({ name: 'Salim', role: 'News archivist', sex: 'MALE', ageYears: 52, language: 'AR', dialect: 'MSA', pitch: 'LOW', pace: 'SLOW', timbre: 'deep, calm', personality: 'precise' }));
    runs.push(await runJob('B-automatic-msa', 'AUTOMATIC MSA build (no recording → designed voice)', 'VOICE_BUILD', voiceBuild, { characterId: salim, mode: 'AUTOMATIC' }, 'ev-B'));
    save();

    // C — manual DESIGN: the producer's description, three candidates, a choice
    const omar = addCharacter(profile({ name: 'Omar', role: 'Bicycle courier', sex: 'MALE', ageYears: 27, language: 'EN', pitch: 'MID', pace: 'QUICK', timbre: 'bright', personality: 'restless' }));
    const design = await runJob('C-design', 'VOICE_DESIGN with the producer’s description', 'VOICE_DESIGN', voiceDesign, { characterId: omar, description: "A bright, energetic young man's voice, about 27, quick and friendly, close-microphone recording" }, 'ev-C-design');
    runs.push(design);
    save();
    const d = design.result as { designId?: string; ranking?: number[] } | undefined;
    // the producer's choice: the second-ranked candidate when there is one (a choice, not the recommendation)
    const choice = d?.ranking?.[1] ?? d?.ranking?.[0];
    if (d?.designId && choice) runs.push(await runJob('C-design', `VOICE_BUILD { mode: DESIGN } from the chosen candidate ${choice}`, 'VOICE_BUILD', voiceBuild, { characterId: omar, mode: 'DESIGN', designId: d.designId, candidate: choice }, 'ev-C-build'));
    save();

    // D — Iraqi without an Iraqi recording: refused (preflight and handler alike), nothing designed
    const hamid = addCharacter(profile({ name: 'Hamid', role: 'Tea seller', sex: 'MALE', ageYears: 45, language: 'AR', dialect: 'IRAQI_BAGHDADI', pitch: 'LOW', pace: 'MEASURED', timbre: 'husky', personality: 'talkative' }));
    runs.push(await runJob('D-iraqi-refusal', 'AUTOMATIC Iraqi build without an Iraqi recording (experiment off)', 'VOICE_BUILD', voiceBuild, { characterId: hamid, mode: 'AUTOMATIC' }, 'ev-D'));
    runs.push(await runJob('D-iraqi-refusal', 'VOICE_DESIGN for an Iraqi character (experiment off)', 'VOICE_DESIGN', voiceDesign, { characterId: hamid }, 'ev-D-design'));
    save();

    // E — the allowDesignedIraqi experiment (switched on for this run only): screened on the four probe lines
    mem.state = { ...mem.state, settings: { ...mem.state.settings, voice: { allowDesignedIraqi: true } } };
    const zahra = addCharacter(profile({ name: 'Zahra', role: 'Pharmacist', sex: 'FEMALE', ageYears: 30, language: 'AR', dialect: 'IRAQI_BAGHDADI', pitch: 'MID', pace: 'MEASURED', timbre: 'warm', personality: 'kind' }));
    runs.push(await runJob('E-iraqi-experiment', 'AUTOMATIC Iraqi build with allowDesignedIraqi ON (experiment: dialect unverified, REVIEW)', 'VOICE_BUILD', voiceBuild, { characterId: zahra, mode: 'AUTOMATIC' }, 'ev-E'));
    mem.state = { ...mem.state, settings: { ...mem.state.settings, voice: { allowDesignedIraqi: false } } };
    save();

    // the files a listener needs, and what each character ended with
    const ask = { EN: 'Natural or artificial? (EN listeners)', MSA: 'Fusha as a news reader speaks it? natural? (MSA listeners)', IRAQI: 'Iraqi or MSA-accented? (native Baghdadi listeners only)' };
    characters.A = { ...snapshot(rana), files: collect('A-automatic-en', rana, listen, ask.EN) };
    const preview = runs.find((r) => r.type === 'VOICE_PREVIEW')?.result as { assetId?: string } | undefined;
    const previewFile = copy(preview?.assetId, 'A-automatic-en', 'voice-preview-line.wav');
    if (previewFile) listen.push({ file: previewFile, what: 'Rana: a later preview line from the pinned identity — the same voice as the proof line?' });
    characters.B = { ...snapshot(salim), files: collect('B-automatic-msa', salim, listen, ask.MSA) };
    characters.C = { ...snapshot(omar), files: collect('C-design', omar, listen, ask.EN) };
    characters.D = snapshot(hamid);
    characters.E = { ...snapshot(zahra), files: collect('E-iraqi-experiment', zahra, listen, ask.IRAQI) };
    report.characters = characters;
    report.listen = { note: 'Blind, loudness-matched, headphones (VOICE-IDENTITY-V2 §5.2). File names reveal the candidate; hide them from raters.', files: listen, notMeasured: ['naturalness', 'accent (English, MSA)', 'Iraqi dialect authenticity', 'whether a voice matches its description (age, warmth, brightness)', 'emotional fit'] };
    report.qaReports = mem.qa;

    // free the card
    await unloadTts(); await unloadDesign(); await unloadAsr();
    report.gpuAfterUnload = await gpuMb();
    report.healthAfter = { design: await designHealth().catch((e: Error) => ({ error: e.message })), indextts: await health(env().TTS_URL), habibi: await health(env().TTS_HABIBI_URL), asr: await health(env().ASR_URL) };
    save();

    // what the runs must show (the numbers themselves are in the report)
    const byRun = (r: string, t: JobType) => runs.find((x) => x.run === r && x.type === t)!;
    expect(byRun('A-automatic-en', 'VOICE_BUILD').error).toBeUndefined();
    expect(character(rana).voice.identity).toMatchObject({ origin: 'DESIGNED', dialectStatus: 'NOT_APPLICABLE' });
    expect(byRun('B-automatic-msa', 'VOICE_BUILD').error).toBeUndefined();
    expect(character(salim).voice.identity).toMatchObject({ origin: 'DESIGNED', dialectStatus: 'UNVERIFIED' });
    expect(character(omar).voice.identity).toMatchObject({ origin: 'DESIGNED', mode: 'DESIGN' });
    expect(runs.filter((r) => r.run === 'D-iraqi-refusal').map((r) => r.error?.message)).toEqual(['Iraqi voices are cloned from a real Iraqi recording — record or upload 5–12 seconds of the voice.', 'Iraqi voices are cloned from a real Iraqi recording — record or upload 5–12 seconds of the voice.']);
    expect(character(hamid).voice.designs ?? []).toHaveLength(0);
  });
});
