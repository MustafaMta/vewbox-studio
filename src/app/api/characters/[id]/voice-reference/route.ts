import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { voiceLock } from '@/domain/rules';
import type { VoiceSample } from '@/domain/types';
import { DIALECTS, LANGUAGES, type Dialect, type Language } from '@/domain/vocabulary';
import { commands, readState } from '@/server/studio/engine';
import { adoptFile, assertSafeId, assetFromStored, removeFile, storeBuffer } from '@/server/media';
import { tmpDir } from '@/server/media/ffmpeg';
import { measureVoiceReference, type Refusal } from '@/server/studio/voice-reference';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** UPLOAD A VOICE REFERENCE — `POST /api/characters/:id/voice-reference`, multipart: `file` (audio), optional
 *  `label`, `transcript` (the producer's, kept over the transcription), `language`, `dialect`.
 *
 *  The recording is stored, measured (duration, sample rate, loudness, true peak), its window cut at a silence
 *  boundary and levelled to −20 LUFS, and that window is transcribed — through the studio's own client — to prove
 *  there is speech, in the right language. A recording that fails is refused with one of the contract's codes
 *  (TOO_SHORT | TOO_LONG | NO_SPEECH | TOO_QUIET | CLIPPING | WRONG_LANGUAGE | BAD_FORMAT) and nothing is kept.
 *  One that passes becomes an UPLOADED sample (text = the transcript, provenance.validation = the measurements,
 *  provenance.trimmedAssetId = the 24 kHz window stored as a DERIVED asset) — chosen as the voice when the
 *  character has none yet, never when the voice is locked. Response: diagnosis §3.2 `VoiceReferenceResult`. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  assertSafeId(id);
  const form = await req.formData().catch(() => { throw new StudioError('INVALID', 'Expected multipart form data.'); });
  const file = form.get('file');
  if (!(file instanceof File)) throw new StudioError('INVALID', 'No file was sent.');
  const label = String(form.get('label') ?? file.name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 200);
  const transcript = form.get('transcript') ? String(form.get('transcript')).trim().slice(0, 4000) : undefined;
  const languageIn = form.get('language') ? String(form.get('language')) : undefined;
  const dialectIn = form.get('dialect') ? String(form.get('dialect')) : undefined;
  if (languageIn && !(LANGUAGES as readonly string[]).includes(languageIn)) throw new StudioError('INVALID', `language must be one of ${LANGUAGES.join(', ')}.`);
  if (dialectIn && !(DIALECTS as readonly string[]).includes(dialectIn)) throw new StudioError('INVALID', `dialect must be one of ${DIALECTS.join(', ')}.`);
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === id);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found.');
  const language = (languageIn as Language | undefined) ?? c.language;
  const dialect = language === 'AR' ? (dialectIn as Dialect | undefined) ?? c.dialect : undefined;

  const refuse = (r: Refusal, validation?: Record<string, unknown>) => json({ ok: false, code: r.code, message: r.message, validation, error: { code: 'INVALID', message: r.message, details: { reason: r.code, validation } } }, { status: 400 });

  const assetId = nid('up');
  const buf = Buffer.from(await file.arrayBuffer());
  let stored: Awaited<ReturnType<typeof storeBuffer>>;
  try { stored = await storeBuffer(assetId, buf, { declaredType: file.type, expectKind: 'AUDIO' }); }
  catch (e) { if (e instanceof StudioError && e.code === 'INVALID') return refuse({ code: 'BAD_FORMAT', message: e.message }); throw e; }
  const work = await tmpDir('voice-ref');
  try {
    const measured = await measureVoiceReference(stored.absPath, { probe: stored.probe, expectLanguage: language, trimmedOut: path.join(work, `${assetId}-24k.wav`) });
    if (measured.refusal) { await removeFile(stored.relPath); return refuse(measured.refusal, measured.validation as unknown as Record<string, unknown>); }
    const trimmedId = nid('gen');
    const trimmed = await adoptFile(trimmedId, measured.trimmedFile, { expectKind: 'AUDIO' });
    const text = transcript || measured.validation.speech.transcript;
    const heard = measured.validation.speech.language;
    const sampleId = nid('voice');
    // the first real recording of a character with no voice becomes the voice; a locked voice is never touched
    const select = !c.voice.selectedSampleId && !c.voice.identity && !voiceLock(c).locked;
    const sample: Omit<VoiceSample, 'id'> & { id: string } = { id: sampleId, label, assetId, source: 'UPLOADED', text, language: heard === 'UNKNOWN' ? language : heard, dialect, durationSeconds: stored.probe?.durationSeconds, provenance: { validation: measured.validation, trimmedAssetId: trimmedId, window: measured.window, transcriptBy: transcript ? 'PRODUCER' : 'ASR', gainDb: measured.gainDb } };
    try {
      await commands([
        { name: 'addAsset', args: [assetFromStored(assetId, stored, { label: `${c.name} — ${label}`, tags: ['voice', 'recording', 'reference'], origin: 'UPLOAD', provenance: { originalName: file.name.slice(0, 200), characterId: c.id, validation: measured.validation } })] },
        { name: 'addAsset', args: [assetFromStored(trimmedId, trimmed, { label: `${c.name} — ${label} (reference window ${measured.window.from}–${measured.window.to} s)`, tags: ['voice', 'reference', 'window'], origin: 'DERIVED', provenance: { from: assetId, characterId: c.id, window: measured.window, gainDb: measured.gainDb, targetLufs: -20, sampleRate: 24000 } })] },
        { name: 'addVoiceSample', args: [c.id, sample, select] },
      ], 'upload');
    } catch (e) { await removeFile(stored.relPath); await removeFile(trimmed.relPath); throw e; }
    const fresh = (await readState()).state.characters.find((x) => x.id === c.id);
    return json({ ok: true, sample: fresh?.voice.samples.find((s) => s.id === sampleId) ?? sample, trimmedAssetId: trimmedId, selected: select, validation: measured.validation, window: measured.window }, { status: 201 });
  } catch (e) {
    // a measurement or service failure keeps nothing: the producer tries again when the service is back
    if (!(e instanceof StudioError) || e.code === 'UNAVAILABLE' || e.code === 'PROVIDER' || e.code === 'NOT_CONFIGURED') await removeFile(stored.relPath).catch(() => {});
    throw e;
  } finally { await fsp.rm(work, { recursive: true, force: true }).catch(() => {}); }
});
