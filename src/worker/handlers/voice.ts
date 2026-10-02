import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Character, Production } from '@/domain/types';
import { command, readState } from '@/server/studio/engine';
import { castOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor } from '@/server/media';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { pickEngine, synthesize, transcribe, wordErrorRate } from '@/server/providers/speech';
import * as minimax from '@/server/providers/minimax';
import { env } from '@/server/env';
import { recordMetric } from '@/server/jobs/queue';
import { registerUnloader } from '../gpu';
import { unloadAsr, unloadTts } from '@/server/providers/speech';

/** VOICES — one persistent identity per character (which engine, which reference recording, which revision), a
 *  preview line, and the recording of every dialogue line of a production. Each generated line is transcribed back
 *  and compared with the script; a line that drifts too far is regenerated once and flagged if it still drifts. */

registerUnloader('TTS', unloadTts);
registerUnloader('ASR', unloadAsr);

const TTS_VRAM = 8000;
const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });

export interface Reference { file: string; asset: Asset; /** what the recording says, transcribed once; the F5-based engine needs it */ text?: string }

/** The character's reference recording as a clean mono 24 kHz WAV (3–15 s), or null when there is none usable. */
export async function referenceWav(c: Character, assets: Asset[], dir: string): Promise<Reference | null> {
  // the chosen voice first, then any recording the producer uploaded, then any other real audio; the bundled sample
  // voices are placeholders for the UI, never a reference to clone from
  const candidates = [c.voice.samples.find((s) => s.id === c.voice.selectedSampleId), ...c.voice.samples.filter((s) => s.source === 'UPLOADED'), ...c.voice.samples].filter((s): s is NonNullable<typeof s> => Boolean(s?.assetId));
  const a = candidates.map((s) => assets.find((x) => x.id === s.assetId)).find((x) => x && !x.sample && x.kind === 'AUDIO');
  if (!a) return null;
  const out = path.join(dir, `ref-${c.id}.wav`);
  // keep the most speech-like 12 seconds after a short lead-in, mono 24 kHz, light normalisation
  await ffmpeg(['-i', assetFile(a), '-ss', '0.2', '-t', '12', '-ac', '1', '-ar', '24000', '-af', 'loudnorm=I=-20:TP=-2:LRA=9', out], { timeoutMs: 120_000 });
  return { file: out, asset: a };
}

/** What the reference recording says. Habibi (F5-TTS) conditions on the reference transcript; without it the
 *  service would transcribe the clip itself with a Whisper it downloads on first use, blocking the whole service. */
export async function referenceText(ctx: HandlerContext, ref: Reference): Promise<string | undefined> {
  if (ref.text !== undefined) return ref.text || undefined;
  try {
    const t = await ctx.gpu('ASR', 4000, () => transcribe(ref.file, { language: 'auto' }), { jobId: ctx.job.id });
    ref.text = t.text.trim();
  } catch (e) { await ctx.event('warn', `reference transcription skipped: ${(e as Error).message}`); ref.text = ''; }
  return ref.text || undefined;
}

export async function speakLine(ctx: HandlerContext, c: Character, text: string, ref: Reference, dir: string, opts: { emotion?: string; delivery?: string } = {}) {
  const provider = (c.voice.identity?.provider ?? (env().MINIMAX_API_KEY && (await readState()).state.settings.generation?.voiceProvider === 'MINIMAX' ? 'MINIMAX' : 'LOCAL_TTS')) as 'LOCAL_TTS' | 'MINIMAX';
  if (provider === 'MINIMAX') {
    const voiceId = c.voice.identity?.providerVoiceId;
    if (!voiceId) throw new StudioError('INVALID', 'Build the voice first (MiniMax clone).');
    const r = await minimax.speak({ text, voiceId, languageBoost: c.language === 'AR' ? 'Arabic' : 'English', emotion: opts.emotion, format: 'wav' });
    const file = path.join(dir, `mm-${Date.now().toString(36)}.wav`);
    await fsp.writeFile(file, r.bytes);
    return { file, engine: 'minimax', model: env().MINIMAX_SPEECH_MODEL, ms: 0 };
  }
  // a line that switches into English (technical words, names in Latin script) goes to the bilingual engine: the Iraqi
  // model has no English and turns such words into Arabic-shaped noise (docs/evidence/iraqi-suite.md)
  const mixed = /[A-Za-z]{2,}/.test(text) && /[؀-ۿ]/.test(text);
  const engine = mixed ? 'indextts' : pickEngine(c.language, c.dialect, (c.voice.identity?.model as 'indextts' | 'habibi' | undefined) ?? 'auto');
  const refText = engine === 'habibi' ? await referenceText(ctx, ref) : undefined;
  return ctx.gpu('TTS', TTS_VRAM, () => synthesize({ text, language: c.language, dialect: c.dialect, referenceWav: ref.file, referenceText: refText, emotion: opts.emotion ?? opts.delivery, speed: 1.0, engine }, dir), { jobId: ctx.job.id });
}

/** Say the line back: transcribe and compare. Returns the WER and the transcript; never throws on a bad line. */
export async function verifyLine(ctx: HandlerContext, file: string, text: string, language: Character['language']): Promise<{ wer: number; heard: string } | null> {
  try {
    const t = await ctx.gpu('ASR', 4000, () => transcribe(file, { language: language === 'AR' ? 'ar' : 'en' }), { jobId: ctx.job.id });
    return { wer: wordErrorRate(text, t.text, language), heard: t.text };
  } catch (e) { await ctx.event('warn', `transcription skipped: ${(e as Error).message}`); return null; }
}

export const voiceBuild: Handler = async (ctx) => {
  const { characterId, provider } = ctx.job.payload as { characterId: string; referenceAssetId?: string; provider?: 'LOCAL_TTS' | 'MINIMAX' };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  const dir = await tmpDir('voice');
  const ref = await referenceWav(c, state.assets, dir);
  if (!ref) throw new StudioError('INVALID', `${c.name} has no recording to build a voice from. Upload a 5–30 second clip of the voice on the Voice tab first.`);
  await ctx.progress('PREPARING', { phase: 'preparing', message: `Reference recording for ${c.name}` });
  const useMinimax = (provider ?? state.settings.generation?.voiceProvider) === 'MINIMAX' && Boolean(env().MINIMAX_API_KEY);
  let identity: { provider: 'LOCAL_TTS' | 'MINIMAX'; model: string; providerVoiceId?: string };
  if (useMinimax) {
    await ctx.progress('GENERATING', { phase: 'cloning', message: 'Cloning the voice with MiniMax' });
    const voiceId = `vb_${c.id.replace(/[^a-z0-9]/gi, '').slice(0, 20)}_${Date.now().toString(36)}`;
    const r = await minimax.cloneVoice({ file: ref.file, voiceId, languageBoost: c.language === 'AR' ? 'Arabic' : 'English' });
    identity = { provider: 'MINIMAX', model: env().MINIMAX_SPEECH_MODEL, providerVoiceId: r.voiceId };
  } else {
    identity = { provider: 'LOCAL_TTS', model: pickEngine(c.language, c.dialect) };
  }
  await command('setVoiceIdentity', [c.id, { ...identity, referenceAssetId: ref.asset.id, language: c.language, dialect: c.dialect }], 'worker');
  // a proof line in the character's language
  const text = c.language === 'AR' ? (c.dialect === 'IRAQI_BAGHDADI' ? 'هلا بيك. اني اسمي ' + (c.nameAr || c.name) + '، وهذا صوتي.' : 'أهلاً بك. اسمي ' + (c.nameAr || c.name) + '، وهذا صوتي.') : `Hello. My name is ${c.name}, and this is my voice.`;
  await ctx.progress('GENERATING', { phase: 'speaking', message: 'Speaking a proof line' });
  const fresh = (await readState()).state.characters.find((x) => x.id === c.id)!;
  const line = await speakLine(ctx, fresh, text, ref, dir);
  const check = await verifyLine(ctx, line.file, text, c.language);
  const id = nid('gen');
  const stored = await adoptFile(id, line.file, { expectKind: 'AUDIO' });
  await command('addAsset', [assetFromStored(id, stored, { label: `${c.name} — voice`, tags: ['voice', 'generated'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, reference: ref.asset.id, check } })], 'worker');
  await command('addVoiceSample', [c.id, { label: `Studio voice (${line.engine})`, assetId: id, source: 'GENERATED', text, language: c.language, jobId: ctx.job.id }, true], 'worker');
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  await recordMetric('voice.build_ms', line.ms, 'ms', { engine: line.engine }, ctx.job.id);
  return { identity, sampleAssetId: id, engine: line.engine, check };
};

export const voicePreview: Handler = async (ctx) => {
  const { characterId, text, emotion } = ctx.job.payload as { characterId: string; text: string; emotion?: string };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  const dir = await tmpDir('voice');
  const ref = await referenceWav(c, state.assets, dir);
  if (!ref) throw new StudioError('INVALID', `${c.name} has no recording to speak with. Upload a short clip of the voice first.`);
  await ctx.progress('GENERATING', { phase: 'speaking', message: `Speaking as ${c.name}` });
  const line = await speakLine(ctx, c, text, ref, dir, { emotion });
  const check = await verifyLine(ctx, line.file, text, c.language);
  const id = nid('gen');
  const stored = await adoptFile(id, line.file, { expectKind: 'AUDIO' });
  await command('addAsset', [assetFromStored(id, stored, { label: `${c.name} — “${text.slice(0, 40)}”`, tags: ['voice', 'preview'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, reference: ref.asset.id, check } })], 'worker');
  await command('addVoiceSample', [c.id, { label: text.slice(0, 48), assetId: id, source: 'GENERATED', text, language: c.language, jobId: ctx.job.id }, false], 'worker');
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  return { assetId: id, engine: line.engine, durationSeconds: stored.probe?.durationSeconds, check };
};

export const dialogueAudio: Handler = async (ctx) => {
  const { productionId, shotIds, force } = ctx.job.payload as { productionId: string; shotIds?: string[]; force?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId) as Production | undefined;
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const cast = castOf(state, p);
  const dir = await tmpDir('dialogue');
  const refs = new Map<string, { file: string; asset: Asset } | null>();
  const lines = p.shots.filter((sh) => !shotIds?.length || shotIds.includes(sh.id)).flatMap((sh) => sh.dialogue.filter((d) => force || !d.audioAssetId).map((d) => ({ sh, d })));
  if (lines.length === 0) return { lines: 0, message: 'every line already has a recording' };
  let done = 0; let flagged = 0;
  for (const { sh, d } of lines) {
    const c = cast.find((x) => x.id === d.characterId);
    if (!c) continue;
    if (!refs.has(c.id)) refs.set(c.id, await referenceWav(c, state.assets, dir));
    const ref = refs.get(c.id);
    if (!ref) { await ctx.event('warn', `${c.name} has no voice recording; line skipped`, { shotId: sh.id, lineId: d.id }); continue; }
    const text = p.language === 'AR' ? (d.textAr || d.text) : d.text;
    if (!text?.trim()) continue;
    await ctx.progress('GENERATING', { phase: 'recording', message: `${c.name}: “${text.slice(0, 40)}”`, step: done + 1, total: lines.length });
    let line = await speakLine(ctx, c, text, ref, dir);
    let check = await verifyLine(ctx, line.file, text, c.language);
    if (check && check.wer > 0.35) { await ctx.event('warn', `line drifted (WER ${(check.wer * 100).toFixed(0)}%), regenerating once`, { heard: check.heard }); line = await speakLine(ctx, c, text, ref, dir); check = await verifyLine(ctx, line.file, text, c.language); if (check && check.wer > 0.35) flagged++; }
    const id = nid('gen');
    const stored = await adoptFile(id, line.file, { expectKind: 'AUDIO' });
    await command('addAsset', [assetFromStored(id, stored, { label: `${p.title} ${sh.number} — ${c.name}: “${text.slice(0, 32)}”`, tags: ['dialogue', 'voice'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { engine: line.engine, model: line.model, text, characterId: c.id, shotId: sh.id, lineId: d.id, check } })], 'worker');
    await command('setDialogueAudio', [p.id, sh.id, d.id, { audioAssetId: id, durationSeconds: stored.probe?.durationSeconds ?? 0 }], 'worker');
    done++;
    await ctx.checkpoint();
  }
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  return { lines: done, flagged, awaitingReview: flagged > 0 };
};
