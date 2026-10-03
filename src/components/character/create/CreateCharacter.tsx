'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '@/domain/jobs';
import { isActiveStatus } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { useStudio } from '@/studio/store';
import { api, type StartedJob } from '@/studio/api';
import { assetById, primaryImageOf } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { useEngineStatus, useUnsavedGuard } from '@/lib/hooks';
import { Crumbs } from '@/components/ui/nav';
import { PageHeader } from '@/components/ui/page';
import { Button, ChoiceCards, Notice } from '@/components/ui/kit';
import { IconAuto, IconImageAdd, IconManual, IconOpen, IconRetry } from '@/components/ui/icons';
import { dialectLabel } from '@/lib/format';
import { createResultOf, startCreateCharacter, startVoiceBuild, type CreateCharacterPayload, type CreateStepName } from '../contract';
import { EMPTY_SHEET, SHEET_STEPS, sheetAge, sheetPayload, type SheetStep, type SheetValues } from '../sheetModel';
import { SettingsSummary, type HeaderValues } from './SharedHeader';
import { DescribeStart, describeVoiceMode, type DescribeRecording, type DescribeValues } from './DescribeStart';
import { PictureStart, type PictureValues } from './PictureStart';
import { SheetStart } from './SheetStart';
import { CreationProgress } from './CreationProgress';
import { ReadyCard } from './ReadyCard';
import { checkBrief, createdCharacterId, creationSettled, creationSteps, describeVoicePayload, engineGate } from './preflight';

type Start = 'describe' | 'sheet' | 'picture';
const STARTS: readonly Start[] = ['describe', 'sheet', 'picture'];
const KEY = 'vewbox.newCharacter';
interface Draft { start: Start; header: HeaderValues; describe: DescribeValues; sheet: SheetValues; sheetStep: SheetStep; jobId?: string; referenceAssetId?: string }

const readDraft = (): Partial<Draft> => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Partial<Draft>; } catch { return {}; } };
const writeDraft = (d: Partial<Draft>) => { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* fine */ } };

/** A NEW CHARACTER (DESIGN-SYSTEM-V3 §9.5; docs/CONTRACTS-IDENTITY-PACK.md v2) — the method first (Describe them ·
 *  Write the sheet · From a picture), then the one essential input of that method, the production settings as a
 *  one-line summary, and more control disclosed. One parent job, CREATE_CHARACTER, runs the chain and the page shows
 *  its real steps — design → image → voice — and then the producer's own step: approving the image. A failed step
 *  keeps what was made and offers the one action that fixes it. Leaving is safe: the choice, the brief and the
 *  running job survive a reload (sessionStorage) and the work goes on. When done, the profile takes over. */
export function CreateCharacter() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { state, jobs, startJob, cancelJob, act } = useStudio();
  const engines = useEngineStatus();
  const def = state.settings.defaults;
  const draft = useRef<Partial<Draft>>({});
  const [hydrated, setHydrated] = useState(false);
  const asked = sp.get('start');
  const [start, setStart] = useState<Start>(STARTS.includes(asked as Start) ? (asked as Start) : 'describe');
  const [header, setHeader] = useState<HeaderValues>({ forId: sp.get('show') ? `show:${sp.get('show')}` : sp.get('production') ? `p:${sp.get('production')}` : '', style: def.style, language: def.language, dialect: def.dialect });
  const [describe, setDescribe] = useState<DescribeValues>({ name: '', brief: '', voiceMode: 'NONE' });
  const [picture, setPicture] = useState<PictureValues>({ name: '', role: '', keep: 'FACE', note: '' });
  const [sheet, setSheet] = useState<SheetValues>(EMPTY_SHEET);
  const [sheetStep, setSheetStep] = useState<SheetStep>('identity');
  const [parentId, setParentId] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Job | null>(null);
  const [retries, setRetries] = useState<Partial<Record<CreateStepName, string>>>({});
  const [lastPayload, setLastPayload] = useState<CreateCharacterPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // the recording chosen on the Describe start, and what became of it once the character existed (finding 15)
  const [recording, setRecording] = useState<DescribeRecording | null>(null);
  const [voiceUpload, setVoiceUpload] = useState<{ forJob: string; state: 'waiting' | 'uploading' | 'accepted' | 'refused' | 'error'; message?: string; sampleId?: string } | null>(null);

  // the home chosen in the settings becomes the show or production the character is for
  const forShow = header.forId.startsWith('show:') ? state.shows.find((s) => s.id === header.forId.slice(5)) : undefined;
  const forProduction = header.forId.startsWith('p:') ? state.productions.find((p) => p.id === header.forId.slice(2)) : undefined;

  // remembered across a reload: the start (unless the link asks for one), the settings, the brief, the sheet and the running job
  useEffect(() => {
    const d = readDraft(); draft.current = d;
    if (d.start && !STARTS.includes(asked as Start)) setStart(d.start);
    if (d.header && !sp.get('show') && !sp.get('production')) setHeader(d.header);
    if (d.describe) setDescribe({ ...d.describe, voiceMode: describeVoiceMode(d.describe.voiceMode) });
    if (d.sheet) setSheet({ ...EMPTY_SHEET, ...d.sheet });
    if (d.sheetStep && SHEET_STEPS.includes(d.sheetStep)) setSheetStep(d.sheetStep);
    // an explicit start in the address (?start=…, the directory's "three ways to start") asks for a NEW character: the
    // remembered run is not restored (it goes on; its profile shows it) — D5, found 2026-10-03
    if (d.jobId && !STARTS.includes(asked as Start)) setParentId(d.jobId);
    else if (d.jobId) writeDraft({ ...d, jobId: undefined, referenceAssetId: undefined });
    setHydrated(true);
  }, [sp, asked]);
  useEffect(() => { if (hydrated) writeDraft({ start, header, describe, sheet, sheetStep, jobId: parentId ?? undefined, referenceAssetId: draft.current.referenceAssetId }); }, [hydrated, start, header, describe, sheet, sheetStep, parentId]);
  // when a show is chosen, its look and language are the defaults
  useEffect(() => { if (forShow) setHeader((h) => ({ ...h, style: forShow.style, language: forShow.language, dialect: forShow.dialect ?? h.dialect })); }, [forShow]);

  // the parent job: the store's copy, which the event stream keeps current (each job event carries the row); read once
  // from GET /api/jobs/{id} when the page (re)opens on a remembered job, which may be older than the store's list
  const fromStore = parentId ? jobs.find((j) => j.id === parentId) : undefined;
  const parent = useMemo(() => [fromStore, fetched].filter((j): j is Job => Boolean(j) && j!.id === parentId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [fromStore, fetched, parentId]);
  useEffect(() => {
    if (!parentId) { setFetched(null); return; }
    let on = true;
    // a remembered job the server no longer has (removed by a reset or a cleanup) is forgotten, never shown as running
    api.job(parentId).then((r) => { if (on) setFetched(r.job); }).catch((e: unknown) => {
      if (on && isStudioError(e) && e.code === 'NOT_FOUND') { setParentId(null); setFetched(null); writeDraft({ ...readDraft(), jobId: undefined }); }
      /* otherwise the store's copy still updates */
    });
    return () => { on = false; };
  }, [parentId]);

  const steps = useMemo(() => creationSteps(parent, jobs, retries), [parent, jobs, retries]);
  const characterId = createdCharacterId(parent, jobs);
  const created = characterId ? state.characters.find((c) => c.id === characterId) : undefined;
  // the recording keeps the page "running" while it is being checked, or while it waits for a character that is still
  // being made (a creation that ended without a character has nothing to attach it to)
  const recordingBusy = Boolean(voiceUpload && voiceUpload.forJob === parentId && (voiceUpload.state === 'uploading' || (voiceUpload.state === 'waiting' && (Boolean(characterId) || !parent || isActiveStatus(parent.status)))));
  const settled = creationSettled(parent, steps) && !recordingBusy;
  const imageDone = steps.find((s) => s.step === 'image')?.state === 'done';
  const ready = settled && Boolean(created) && imageDone && Boolean(created && primaryImageOf(created));
  const running = Boolean(parentId) && !ready;
  const referenceSrc = assetById(state, picture.asset?.id ?? draft.current.referenceAssetId)?.src;

  // the recording chosen on the Describe start is checked as soon as the character exists (the voice-reference
  // endpoint needs the character); the chain's voice step builds from it when it is there in time, and when the chain
  // passed the voice step first, the page builds it now — that build is the voice row (finding 15)
  useEffect(() => {
    if (!voiceUpload || voiceUpload.forJob !== parentId || voiceUpload.state !== 'waiting' || !characterId || !recording) return;
    const c = state.characters.find((x) => x.id === characterId);
    if (!c) return;
    setVoiceUpload({ ...voiceUpload, state: 'uploading' });
    api.uploadVoiceReference(characterId, recording.file, { label: recording.file.name.replace(/\.[a-z0-9]+$/i, ''), language: c.language, dialect: c.dialect })
      .then((r) => setVoiceUpload((v) => (v && v.forJob === voiceUpload.forJob ? (r.ok ? { ...v, state: 'accepted', sampleId: r.sample.id } : { ...v, state: 'refused', message: r.message }) : v)))
      .catch((e: unknown) => setVoiceUpload((v) => (v && v.forJob === voiceUpload.forJob ? { ...v, state: 'error', message: isStudioError(e) ? e.message : (e as Error).message } : v)));
  }, [voiceUpload, parentId, characterId, recording, state.characters]);
  const voiceOutcome = createResultOf(parent)?.steps.find((s) => s.step === 'voice');
  useEffect(() => {
    if (!voiceUpload || voiceUpload.state !== 'accepted' || !voiceUpload.sampleId || !characterId || retries.voice) return;
    if (!voiceOutcome || voiceOutcome.status !== 'skipped') return; // the chain built it (or is about to)
    const sampleId = voiceUpload.sampleId;
    startVoiceBuild(startJob, { characterId, mode: 'REFERENCE', referenceSampleId: sampleId })
      .then((job) => setRetries((r) => ({ ...r, voice: job.id })))
      .catch((e: unknown) => setVoiceUpload((v) => (v ? { ...v, state: 'error', message: isStudioError(e) ? e.message : (e as Error).message } : v)));
  }, [voiceUpload, voiceOutcome, characterId, retries.voice, startJob]);

  // preflight: the engines this start needs, read live
  const needsVoice = start === 'describe' && describe.voiceMode === 'RECORDING';
  const gate = engineGate(engines.status, needsVoice ? ['images', 'voice'] : ['images']);
  const gateReason = !gate.ok ? `${'Not reachable'}: ${gate.blocked.map((b) => `${T.dyn(`status.${b.need}`)} — ${b.detail}`).join(' · ')}` : null;
  const dialectReason = header.language === 'AR' && !header.dialect ? 'Choose a dialect for an Arabic character.' : null;
  const disabledReason = gateReason ?? dialectReason;

  useUnsavedGuard(!parentId && (describe.brief.trim().length > 0 || picture.note.trim().length > 0 || sheet.name.trim().length > 0), 'Leave without creating the character? The brief is lost.');

  const basePayload = (): Pick<CreateCharacterPayload, 'style' | 'language' | 'dialect' | 'productionId' | 'showId'> => ({ style: header.style, language: header.language, dialect: header.language === 'AR' ? header.dialect : undefined, showId: forShow?.id, productionId: forProduction?.id });
  const say = (job: StartedJob) => { for (const w of job.warnings ?? []) toast.push({ tone: 'info', text: w.detail }); };

  const launch = useCallback(async (payload: CreateCharacterPayload, withRecording = false) => {
    setBusy(true); setStartError(null);
    try {
      const job = await startCreateCharacter(startJob, payload);
      say(job);
      setLastPayload(payload); setRetries({}); setFetched(null); setParentId(job.id);
      setVoiceUpload(withRecording ? { forJob: job.id, state: 'waiting' } : null);
      draft.current = { ...draft.current, referenceAssetId: payload.referenceAssetId };
      writeDraft({ ...readDraft(), jobId: job.id, referenceAssetId: payload.referenceAssetId });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setStartError(isStudioError(e) ? e.message : (e as Error).message); }
    finally { setBusy(false); }
  }, [startJob]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitDescribe = () => {
    const check = checkBrief(describe.brief, describe.name); if (!check.ok) return;
    const ageYears = sheetAge({ band: describe.band, exactAge: describe.ageYears });
    const profile: NonNullable<CreateCharacterPayload['profile']> = {};
    if (describe.sex) profile.sex = describe.sex; if (ageYears) profile.ageYears = ageYears; if (describe.species) profile.species = describe.species;
    // a recording added here is uploaded once the character exists; the chain's voice step (AUTOMATIC) builds from it
    const voice = describeVoicePayload(describe.voiceMode, Boolean(recording));
    void launch({ mode: 'AUTO', name: describe.name.trim() || undefined, brief: describe.brief.trim() || undefined, profile: Object.keys(profile).length ? profile : undefined, ...basePayload(), voice, draw: true }, voice.mode === 'AUTOMATIC');
  };
  const submitSheet = (draw: boolean) => {
    const { profile, brief } = sheetPayload(sheet, { style: header.style, language: header.language, dialect: header.dialect });
    void launch({ mode: 'MANUAL', name: profile.name, profile, brief, ...basePayload(), voice: { mode: 'NONE' }, draw });
  };
  const submitPicture = () => {
    if (!picture.asset) return;
    const keep = picture.keep === 'FACE' ? 'Keep the face from the reference picture; everything else follows the sheet.' : 'Keep the face, hair and wardrobe from the reference picture.';
    const brief = [keep, picture.note.trim()].filter(Boolean).join(' ');
    // the look is the picture's (never designed from words); who they are travels in the profile
    const ageYears = sheetAge({ band: picture.band });
    // keeping the face only: the hair and clothes the producer wrote are deliberate changes (empty: the picture's)
    const changes = picture.keep === 'FACE' ? { hair: picture.hair?.trim() || undefined, wardrobe: picture.wardrobe?.trim() || undefined } : {};
    void launch({ mode: 'REFERENCE', name: picture.name.trim() || undefined, brief, profile: { name: picture.name.trim() || undefined, role: picture.role.trim() || undefined, sex: picture.sex, ageYears, ...changes, style: header.style, language: header.language, dialect: header.language === 'AR' ? header.dialect : undefined }, referenceAssetId: picture.asset.id, ...basePayload(), voice: { mode: 'NONE' }, draw: true });
  };

  /** A relaunch of a creation that made nothing carries the recording again (it was never uploaded: no character). */
  const relaunchWithRecording = () => lastPayload?.voice?.mode === 'AUTOMATIC' && Boolean(recording);

  /** One recovery per failed step: the design step re-runs the whole chain (the brief is kept); a later step re-runs
   *  only its own job for the record that exists, and the row then follows that job. */
  const retryStep = async (step: CreateStepName) => {
    try {
      if (step === 'design' || !characterId) { if (lastPayload) await launch(lastPayload, relaunchWithRecording()); return; }
      const job = step === 'image' ? await startJob('CHARACTER_APPEARANCE', { characterId })
        : await startVoiceBuild(startJob, { characterId, mode: lastPayload?.voice?.referenceSampleId ? 'REFERENCE' : 'AUTOMATIC', referenceSampleId: lastPayload?.voice?.referenceSampleId });
      say(job);
      setRetries((r) => ({ ...r, [step]: job.id }));
    } catch (e) { toast.bad(`${'Could not start'}: ${isStudioError(e) ? e.message : (e as Error).message}`); }
  };
  const writeMyself = () => { setSheet((s) => ({ ...s, name: lastPayload?.name ?? describe.name, look: lastPayload?.brief ?? describe.brief })); setSheetStep('identity'); reset(); setStart('sheet'); };
  const cancel = async () => { if (!parentId) return; setCancelling(true); try { await cancelJob(parentId); } catch (e) { toast.bad((e as Error).message); } finally { setCancelling(false); } };
  const reset = () => { setParentId(null); setFetched(null); setRetries({}); setVoiceUpload(null); draft.current = { ...draft.current, referenceAssetId: undefined }; writeDraft({ ...readDraft(), jobId: undefined, referenceAssetId: undefined }); };
  const discard = () => { if (created) { try { act('deleteCharacter', created.id); toast.ok('Deleted.'); } catch (e) { toast.bad((e as Error).message); return; } } reset(); };
  const drawAgain = async () => { if (!characterId) return; try { const job = await startJob('CHARACTER_APPEARANCE', { characterId }); say(job); setRetries((r) => ({ ...r, image: job.id })); } catch (e) { toast.bad((e as Error).message); } };

  const profileHref = characterId ? `/characters/${characterId}?created=${parentId ?? ''}#image` : '/characters';
  const cancelHref = forShow ? `/shows/${forShow.id}?tab=characters` : '/characters';
  const settings = <SettingsSummary value={header} onChange={setHeader} />;

  return (
    <div className="max-w-[64rem]">
      <Crumbs items={[{ href: '/characters', label: 'Characters' }, { label: 'New character' }]} />
      <PageHeader title={'New character'} subtitle={'Start the way that suits you. Nothing is drawn until you say so.'} />

      {!running && !ready && (
        <div className="space-y-8">
          <section aria-labelledby="how-h">
            <h2 id="how-h" className="section-title mb-4">{'How do you want to start?'}</h2>
            <ChoiceCards name="start" size="lg" columns={3} label={'How do you want to start?'} value={start} onChange={(v) => { setStart(v); setStartError(null); }} options={[
              { value: 'describe', label: 'Describe them', hint: 'A line is enough; Casting does the rest.', icon: <IconAuto /> },
              { value: 'sheet', label: 'Write the sheet', hint: 'You fill it in; the image is drawn when you ask.', icon: <IconManual /> },
              { value: 'picture', label: 'From a picture', hint: 'The studio draws them to match your reference.', icon: <IconImageAdd /> },
            ]} />
          </section>
          {gateReason && start !== 'sheet' && (
            <Notice tone="warn" title={'An engine this start needs is not reachable'} action={<span className="flex flex-wrap gap-2"><Link href="/settings#engines" className="btn btn-secondary btn-sm">{'Settings → Engines'}</Link><Button size="sm" variant="quiet" icon={<IconRetry />} loading={engines.loading} onClick={engines.reload}>{'Refresh'}</Button></span>}>
              {gate.blocked.map((b) => <span key={b.need} className="block" dir="auto">{T.dyn(`status.${b.need}`)}: {b.detail}</span>)}
              <span className="mt-1 block">{'Write the sheet always works; the look can be drawn once the engine is back.'}</span>
            </Notice>
          )}
          {startError && <Notice tone="bad" title={'Could not start'}>{startError}</Notice>}
          <div key={start} className="fade-in">
            {start === 'describe' && <DescribeStart value={describe} onChange={setDescribe} recording={recording} onRecording={setRecording} onSubmit={submitDescribe} busy={busy} disabledReason={disabledReason} onCancel={() => router.push(cancelHref)} settings={settings} />}
            {start === 'sheet' && <SheetStart value={sheet} onChange={setSheet} step={sheetStep} onStep={setSheetStep} onCreate={submitSheet} busy={busy} drawDisabledReason={disabledReason} onCancel={() => router.push(cancelHref)} settings={settings} language={header.language} styleWord={T.dyn(`style.${header.style}`)} languageWord={header.language === 'AR' ? `${'Arabic'} (${dialectLabel(header.dialect)})` : 'English'} />}
            {start === 'picture' && <PictureStart value={picture} onChange={setPicture} onSubmit={submitPicture} busy={busy} disabledReason={disabledReason} onCancel={() => router.push(cancelHref)} settings={settings} />}
          </div>
        </div>
      )}

      {running && (
        <div className="space-y-4">
          <p className="text-[13px] text-muted" role="note">{'You can leave this page: the work goes on, and the character’s profile shows it when it is done.'}</p>
          <CreationProgress parent={parent} steps={steps} characterId={characterId} settled={settled} referenceSrc={start === 'picture' || draft.current.referenceAssetId ? referenceSrc : undefined} onCancel={() => void cancel()} cancelling={cancelling} onRetryStep={(s) => void retryStep(s)} onWriteMyself={writeMyself}>
            {voiceUpload && voiceUpload.forJob === parentId && (
              <div className="mt-3 flex flex-wrap items-center gap-2" role="status">
                <span className={`status ${voiceUpload.state === 'accepted' ? 'status-ok' : voiceUpload.state === 'refused' || voiceUpload.state === 'error' ? 'status-bad' : 'status-info'}`} dir="auto">
                  {T.dyn(`char.create.rec.${voiceUpload.state}`)}{voiceUpload.message ? ` — ${voiceUpload.message}` : ''}
                </span>
                {voiceUpload.state === 'error' && recording && <Button size="sm" variant="quiet" icon={<IconRetry />} onClick={() => setVoiceUpload({ ...voiceUpload, state: 'waiting', message: undefined })}>{'Retry'}</Button>}
                {(voiceUpload.state === 'refused' || voiceUpload.state === 'error') && characterId && <Link href={`/characters/${characterId}#voice`} className="btn btn-secondary btn-sm">{'Add a recording'}</Link>}
              </div>
            )}
            {settled && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
                {created ? <>
                  <p className="me-auto text-[13px] text-body" dir="auto">{'{name} exists. Open the profile to finish what did not run.'.replace('{name}', created.name)}</p>
                  <Link href={profileHref} className="btn btn-primary"><IconOpen aria-hidden />{'Open profile'}</Link>
                </> : <>
                  <p className="me-auto text-[13px] text-body">{'Nothing was created; your brief is kept.'}</p>
                  <Button variant="secondary" icon={<IconRetry />} onClick={() => { if (lastPayload) void launch(lastPayload, relaunchWithRecording()); else reset(); }}>{'Retry'}</Button>
                  <Button variant="quiet" onClick={reset}>{'Back'}</Button>
                </>}
              </div>
            )}
          </CreationProgress>
        </div>
      )}

      {ready && created && <ReadyCard c={created} profileHref={profileHref} onAnotherLook={() => void drawAgain()} onDiscard={discard} anotherLookDisabled={gateReason ?? undefined} />}
    </div>
  );
}
