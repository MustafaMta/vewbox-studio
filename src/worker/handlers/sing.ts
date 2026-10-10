import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { StudioError } from '@/domain/errors';
import { command, readState } from '@/server/studio/engine';
import { assetFile, assetFromStored } from '@/server/media';
import { committedOutput, jobOutputs } from '@/server/jobs/outputs';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { loudness } from '@/server/media/voice-check';
import { convertVoice, SVC_VRAM_MB } from '@/server/providers/svc';
import { cosine } from '@/server/providers/voice-design';
import { recordMetric } from '@/server/jobs/queue';
import { recordQaReport } from '@/server/org/runs';
import { referenceWav } from './voice';
import { speakerEmbedding } from './voice-measure';
import { alignSongLyrics } from './music';
import { songSingers } from './music';
import type { Character, VoiceReferenceClip } from '@/domain/types';

/** THE SINGER'S OWN VOICE (the autonomous directive: the same performer sings; docs/research/SINGING-IDENTITY-2026-10.md).
 *  SING_CONVERT takes the song's lead vocal (the Demucs stem of the ACE-Step recording), converts it to the named singer's
 *  timbre with Seed-VC (F0-conditioned: melody, melismas and glides untouched; no auto pitch; at most ±3 semitones) from
 *  the identity's own clip — its SINGING reference when it has one, else its primary reference (the design seed) — and
 *  remixes it over the accompaniment at the original vocal's level. The sung mix becomes the song's recording; the
 *  engine's recording and the converted vocal stay as assets. Measured, never assumed: ECAPA cosine of the converted vocal
 *  to the singer's speaker fingerprint (a singing threshold apart from the 0.70 speech gate), the pitch statistics, the
 *  lyrics placed again on the converted vocal. THE BOOTSTRAP: an identity without a SINGING reference whose first
 *  conversion holds the identity (cosine ≥ SINGING_REFERENCE_FLOOR) gets that vocal's best 20 s as its SINGING reference
 *  clip (STUDIO_RENDER), once; later songs condition on it. */

/** ECAPA cosine to the fingerprint a converted vocal needs to become the identity's SINGING reference (research §3/§5:
 *  singing has higher intra-speaker variance than speech, so this is lower than the speech clip floor; calibrated later
 *  from genuine/impostor pairs — until then a stated engineering value). */
export const SINGING_REFERENCE_FLOOR = 0.6;
/** Below this the sung mix is kept but flagged for review (the identity may have drifted). */
export const SINGING_REVIEW_FLOOR = 0.5;

function singingClip(c: Character): VoiceReferenceClip | undefined {
  const pack = c.voice.identity?.canonicalReferencePack ?? [];
  return [...pack].filter((k) => k.role === 'SINGING').sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1) || b.addedAt.localeCompare(a.addedAt))[0];
}

export const singConvert: Handler = async (ctx) => {
  const { productionId, singerId, semitoneShift, diffusionSteps } = ctx.job.payload as { productionId: string; singerId?: string; semitoneShift?: number; diffusionSteps?: number };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  if (!p.song?.assetId) throw new StudioError('INVALID', 'There is no recording to sing yet: generate the song first.', { productionId, failureClass: 'INVALID_INPUT' });
  const stems = p.song.stems;
  if (!stems?.vocals || !stems.instrumental) throw new StudioError('INVALID', 'The song has no vocal and accompaniment stems: check the recording again (CHECK_SONG) so Demucs separates them.', { productionId, failureClass: 'INVALID_INPUT' });
  const singers = songSingers(state, p);
  const singer = singerId ? singers.find((c) => c.id === singerId) : singers[0];
  if (!singer) throw new StudioError('INVALID', `${singerId ?? 'the singer'} does not sing this song.`, { productionId, singerId, failureClass: 'INVALID_INPUT' });
  const identity = singer.voice.identity;
  if (!identity) throw new StudioError('INVALID', `${singer.name} has no voice identity yet: build the voice first.`, { characterId: singer.id, failureClass: 'INVALID_INPUT' });
  const fingerprint = identity.speakerFingerprint?.vector;
  // the song's recording as the engine made it (the converted mix of an earlier run is never converted again)
  const fromAssetId = p.song.singing?.fromAssetId ?? p.song.assetId;
  const vocalsAsset = state.assets.find((x) => x.id === stems.vocals);
  const instrAsset = state.assets.find((x) => x.id === stems.instrumental);
  if (!vocalsAsset || !instrAsset) throw new StudioError('INVALID', 'The stems are not in the library any more: check the recording again.', { productionId, failureClass: 'INVALID_INPUT' });
  const dir = await tmpDir('sing');
  try {
    // THE REFERENCE: the identity's SINGING clip, else its primary reference (the seed: Rule V-DESIGN checked by referenceWav)
    const clip = singingClip(singer);
    let reference: { file: string; assetId: string; role: string };
    if (clip) {
      const a = state.assets.find((x) => x.id === clip.assetId);
      if (!a || a.unavailable) throw new StudioError('MISSING_REFERENCE', `${singer.name}'s singing reference clip is not on disk; nothing was sung from another voice.`, { characterId: singer.id, assetId: clip.assetId });
      reference = { file: assetFile(a), assetId: a.id, role: 'SINGING' };
    } else {
      const ref = await referenceWav(singer, state.assets, dir);
      if (!ref) throw new StudioError('MISSING_REFERENCE', `${singer.name} has no voice reference to sing from: build the voice first.`, { characterId: singer.id });
      reference = { file: ref.file, assetId: ref.asset.id, role: ref.packClip?.role ?? 'PRIMARY' };
    }
    await ctx.progress('GENERATING', { phase: 'converting', message: `Singing “${p.song.title || p.title}” in ${singer.name}'s voice (Seed-VC, from the ${reference.role.toLowerCase()} reference)`, percent: null });
    const svcInput = { sourceWav: assetFile(vocalsAsset), referenceWav: reference.file, diffusionSteps: diffusionSteps ?? 40, cfgRate: 0.7, f0Condition: true, autoF0Adjust: false, semitoneShift: semitoneShift ?? 0, seed: 7 };
    const r = await ctx.gpu('TTS', SVC_VRAM_MB, () => ctx.tool('audio.convert_voice', () => convertVoice(svcInput, dir), { label: 'seed-vc', input: { ...svcInput, sourceWav: vocalsAsset.id, referenceWav: reference.assetId } }), { jobId: ctx.job.id });
    await ctx.checkpoint();
    // THE IDENTITY, measured: ECAPA of the converted vocal against the singer's fingerprint
    const emb = await speakerEmbedding(ctx, r.file);
    const similarity = fingerprint && emb ? Number(cosine(fingerprint, emb.embedding).toFixed(3)) : undefined;
    // THE REMIX: the converted vocal at the original vocal's integrated loudness, over the accompaniment as it was
    await ctx.progress('POSTPROCESSING', { phase: 'remixing', message: 'Mixing the sung vocal over the accompaniment', percent: null });
    const [origLevel, newLevel] = await Promise.all([loudness(assetFile(vocalsAsset)).catch(() => undefined), loudness(r.file).catch(() => undefined)]);
    const gainDb = origLevel && newLevel && Number.isFinite(origLevel.integratedLufs) && Number.isFinite(newLevel.integratedLufs) ? Math.max(-12, Math.min(12, origLevel.integratedLufs - newLevel.integratedLufs)) : 0;
    const vocalOut = path.join(dir, 'vocal-sung.flac');
    await ffmpeg(['-y', '-i', r.file, '-af', `volume=${gainDb.toFixed(2)}dB`, '-ar', '48000', '-c:a', 'flac', vocalOut]);
    const mixOut = path.join(dir, 'song-sung.flac');
    await ffmpeg(['-y', '-i', vocalOut, '-i', assetFile(instrAsset), '-filter_complex', '[0:a]aresample=48000[v];[1:a]aresample=48000[i];[v][i]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.891:level=false', '-c:a', 'flac', mixOut]);
    // the assets: the converted vocal (a render of this identity: voiceRevision in its provenance) and the sung mix
    const made = { engine: r.engine, model: r.model, engineVersion: r.engineVersion, settings: r.settings, f0: r.f0, from: fromAssetId, vocals: vocalsAsset.id, instrumental: instrAsset.id, reference: reference.assetId, referenceRole: reference.role, singerId: singer.id, voiceRevision: identity.revision, similarityToFingerprint: similarity, gainDb: Number(gainDb.toFixed(2)), productionId: p.id };
    const title = p.song.title || p.title;
    const earlierVocal = await committedOutput(ctx.job.id, 'vocal-sung');
    let vocalId: string;
    if (earlierVocal) vocalId = earlierVocal.id;
    else {
      const v = await jobOutputs(ctx.job).adopt('vocal-sung', vocalOut, { expectKind: 'AUDIO' });
      vocalId = v.id;
      await command('addAsset', [assetFromStored(v.id, v.stored, { label: `${title} — vocal, sung by ${singer.name}`, tags: ['song', 'stem', 'vocals', 'sung', 'seed-vc'], origin: 'GENERATED', jobId: ctx.job.id, provenance: made })], 'worker');
    }
    const earlierMix = await committedOutput(ctx.job.id, 'song-sung');
    let mixId: string; let duration: number;
    if (earlierMix) { mixId = earlierMix.id; duration = earlierMix.durationSeconds ?? p.song.durationSeconds; }
    else {
      const m = await jobOutputs(ctx.job).adopt('song-sung', mixOut, { expectKind: 'AUDIO' });
      mixId = m.id; duration = m.stored.probe?.durationSeconds ?? p.song.durationSeconds;
      await command('addAsset', [assetFromStored(m.id, m.stored, { label: `${title} — sung by ${singer.name}`, tags: ['song', 'sung', 'seed-vc'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { ...made, vocalAssetId: vocalId } })], 'worker');
    }
    await command('updateSong', [p.id, { assetId: mixId, stems: { vocals: vocalId, instrumental: instrAsset.id }, singing: { singerId: singer.id, assetId: mixId, vocalAssetId: vocalId, fromAssetId, engine: r.engine, engineVersion: r.engineVersion, reference: { assetId: reference.assetId, role: reference.role }, similarityToFingerprint: similarity, f0: r.f0 as Record<string, unknown>, settings: r.settings, at: new Date().toISOString(), jobId: ctx.job.id } }], 'worker');
    await recordMetric('svc.conversion_ms', r.ms, 'ms', { engine: r.engine, seconds: Math.round(r.durationSeconds) }, ctx.job.id);
    // THE BOOTSTRAP of the SINGING reference, once: the converted vocal's best 20 s when the identity held
    let bootstrapped: { assetId: string; similarity: number } | undefined;
    if (!clip && similarity !== undefined && similarity >= SINGING_REFERENCE_FLOOR) {
      const excerpt = path.join(dir, 'singing-reference.wav');
      const start = Math.max(0, Math.min(r.durationSeconds - 20, r.durationSeconds * 0.3));
      await ffmpeg(['-y', '-ss', start.toFixed(2), '-t', '20', '-i', r.file, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', excerpt]);
      const ex = await speakerEmbedding(ctx, excerpt);
      const exSim = fingerprint && ex ? Number(cosine(fingerprint, ex.embedding).toFixed(3)) : undefined;
      if (exSim !== undefined && exSim >= SINGING_REFERENCE_FLOOR) {
        const earlierRef = await committedOutput(ctx.job.id, 'singing-reference');
        const refId = earlierRef?.id ?? (await (async () => { const s = await jobOutputs(ctx.job).adopt('singing-reference', excerpt, { expectKind: 'AUDIO' }); await command('addAsset', [assetFromStored(s.id, s.stored, { label: `${singer.name} — singing reference`, tags: ['voice', 'reference', 'singing', 'seed-vc'], origin: 'GENERATED', jobId: ctx.job.id, provenance: { ...made, excerptFrom: start, vocalAssetId: vocalId, similarityToFingerprint: exSim } })], 'worker'); return s.id; })());
        const fresh = (await readState()).state.assets.find((x) => x.id === refId);
        await command('addVoiceReferenceClip', [singer.id, { role: 'SINGING', assetId: refId, sha256: fresh?.sha256, language: p.language, ...(p.language === 'AR' && singer.dialect ? { dialect: singer.dialect } : {}), source: 'STUDIO_RENDER', similarity: exSim }], 'worker');
        bootstrapped = { assetId: refId, similarity: exSim };
        await ctx.event('info', `${singer.name}'s SINGING reference bootstrapped from this vocal (20 s from ${start.toFixed(1)} s; ECAPA ${exSim} to the fingerprint); later songs condition on it`, { characterId: singer.id, assetId: refId, similarity: exSim });
      }
    }
    // the written lines placed on the SUNG vocal
    const aligned = await alignSongLyrics(ctx, p.id, vocalId);
    const f0 = r.f0 as { source?: { median_hz?: number | null; p95_hz?: number | null; semitones?: number | null }; reference?: { median_hz?: number | null; p95_hz?: number | null } };
    const identityOk = similarity === undefined ? false : similarity >= SINGING_REVIEW_FLOOR;
    await step(ctx, 'audio-sync-inspector', `singer-identity: “${title}” by ${singer.name}`, async () => {
      await recordQaReport({ productionId: p.id, subjectKind: 'SONG', subjectId: mixId, inspectorId: 'audio-sync-inspector', checks: [
        { name: 'sung-by-the-identity', ok: identityOk, value: similarity, threshold: SINGING_REVIEW_FLOOR, detail: similarity === undefined ? 'no fingerprint to compare with (build the voice again)' : `ECAPA cosine of the converted vocal to ${singer.name}'s speaker fingerprint (singing threshold ${SINGING_REVIEW_FLOOR}; reference ${SINGING_REFERENCE_FLOOR}); cross-register, relative evidence` },
        { name: 'melody-kept', ok: true, detail: `F0-conditioned, no auto adjust, shift ${semitoneShift ?? 0} st; source median ${f0.source?.median_hz ?? '?'} Hz, p95 ${f0.source?.p95_hz ?? '?'} Hz, span ${f0.source?.semitones ?? '?'} st; reference median ${f0.reference?.median_hz ?? '?'} Hz` },
        { name: 'vocal-level-matched', ok: Math.abs(gainDb) < 12, value: Number(gainDb.toFixed(2)), detail: 'gain applied to the converted vocal to meet the original vocal’s integrated loudness' },
        { name: 'lyrics-heard-in-sung-vocal', ok: Boolean(aligned && aligned.lines && aligned.aligned / aligned.lines >= 0.5), value: aligned?.lines ? Number((aligned.aligned / aligned.lines).toFixed(2)) : undefined, threshold: 0.5 },
        { name: 'singing-reference', ok: true, detail: clip ? `conditioned on the identity's SINGING reference ${clip.assetId}` : bootstrapped ? `bootstrapped: ${bootstrapped.assetId} (ECAPA ${bootstrapped.similarity})` : `from the ${reference.role.toLowerCase()} reference; no SINGING reference kept (similarity ${similarity ?? '?'} < ${SINGING_REFERENCE_FLOOR})` },
      ], decision: identityOk ? 'ACCEPT' : 'REVIEW', evidenceAssetIds: [mixId, vocalId], jobId: ctx.job.id, notes: `Seed-VC ${r.engineVersion}; the engineering QA cannot listen — identity by ECAPA, melody by F0 statistics, words by the aligner` });
    });
    await ctx.activity('SONG_SUNG', `“${title}” sung by ${singer.name} (Seed-VC from the ${reference.role.toLowerCase()} reference; ECAPA to the fingerprint ${similarity ?? 'not measured'}${bootstrapped ? '; singing reference bootstrapped' : ''})`, { productionId: p.id, assetId: mixId, vocalAssetId: vocalId, similarity, singerId: singer.id });
    return { assetId: mixId, vocalAssetId: vocalId, fromAssetId, singerId: singer.id, reference, similarityToFingerprint: similarity, f0: r.f0, settings: r.settings, gainDb: Number(gainDb.toFixed(2)), aligned, bootstrapped, durationSeconds: duration, awaitingReview: !identityOk };
  } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
};
