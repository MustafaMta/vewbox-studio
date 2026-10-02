'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '@/domain/jobs';
import { isActiveStatus, isTerminalStatus } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { useStudio } from '@/studio/store';
import { api } from '@/studio/api';
import { assetById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useEngineStatus, useUnsavedGuard } from '@/lib/hooks';
import { Crumbs } from '@/components/ui/nav';
import { PageHeader } from '@/components/ui/page';
import { Badge, Button, ChoiceCards, Notice } from '@/components/ui/kit';
import { IconAuto, IconImageAdd, IconManual, IconOpen, IconRetry } from '@/components/ui/icons';
import { CharacterForm } from '../CharacterForm';
import { createResultOf, startCreateCharacter, startVoiceBuild, type CharacterProfileInput, type CreateCharacterPayload, type CreateStepName } from '../contract';
import { SharedHeader, type HeaderValues } from './SharedHeader';
import { DescribeStart, describeVoiceMode, type DescribeRecording, type DescribeValues } from './DescribeStart';
import { PictureStart, type PictureValues } from './PictureStart';
import { CreationProgress } from './CreationProgress';
import { ReadyCard } from './ReadyCard';
import { checkBrief, createdCharacterId, creationSettled, creationSteps, describeVoicePayload, engineGate } from './preflight';

type Start = 'describe' | 'sheet' | 'picture';
const KEY = 'vewbox.newCharacter';
interface Draft { start: Start; header: HeaderValues; describe: DescribeValues; jobId?: string; referenceAssetId?: string }

const readDraft = (): Partial<Draft> => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Partial<Draft>; } catch { return {}; } };
const writeDraft = (d: Partial<Draft>) => { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* fine */ } };

/** A NEW CHARACTER — one page, three ways in: Describe them (a line, or just a name; Casting writes the sheet and
 *  draws the look), Write the sheet (the form; the agents fill what is left blank), From a picture (a reference
 *  image, checked before anything runs). Above the three, the shared header: for whom, the style, the language and
 *  its dialect. One parent job, CREATE_CHARACTER, runs the chain and the page shows its four real steps; a failed
 *  step keeps what was made and offers the one action that fixes it; the finished character opens on its profile
 *  with a "just created" banner. The choice, the brief and the running job survive a reload (sessionStorage). */
export function CreateCharacter() {
  const T = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { state, jobs, startJob, cancelJob, act } = useStudio();
  const engines = useEngineStatus();
  const def = state.settings.defaults;
  const draft = useRef<Partial<Draft>>({});
  const [hydrated, setHydrated] = useState(false);
  const [start, setStart] = useState<Start>('describe');
  const [header, setHeader] = useState<HeaderValues>({ forId: sp.get('show') ? `show:${sp.get('show')}` : sp.get('production') ? `p:${sp.get('production')}` : '', style: def.style, language: def.language, dialect: def.dialect });
  const [describe, setDescribe] = useState<DescribeValues>({ name: '', brief: '', voiceMode: 'NONE' });
  const [picture, setPicture] = useState<PictureValues>({ name: '', role: '', keep: 'FACE', note: '' });
  const [sheetPrefill, setSheetPrefill] = useState<{ name?: string; personality?: string }>({});
  const [parentId, setParentId] = useState<string | null>(null);
  const [polled, setPolled] = useState<Job | null>(null);
  const [retries, setRetries] = useState<Partial<Record<CreateStepName, string>>>({});
  const [lastPayload, setLastPayload] = useState<CreateCharacterPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // the recording chosen on the Describe start, and what became of it once the character existed (finding 15)
  const [recording, setRecording] = useState<DescribeRecording | null>(null);
  const [voiceUpload, setVoiceUpload] = useState<{ forJob: string; state: 'waiting' | 'uploading' | 'accepted' | 'refused' | 'error'; message?: string; sampleId?: string } | null>(null);

  // the home chosen in the header becomes the show or production the character is for
  const forShow = header.forId.startsWith('show:') ? state.shows.find((s) => s.id === header.forId.slice(5)) : undefined;
  const forProduction = header.forId.startsWith('p:') ? state.productions.find((p) => p.id === header.forId.slice(2)) : undefined;

  // remembered across a reload: the start, the header, the brief and the running job
  useEffect(() => {
    const d = readDraft(); draft.current = d;
    if (d.start) setStart(d.start);
    if (d.header && !sp.get('show') && !sp.get('production')) setHeader(d.header);
    if (d.describe) setDescribe({ ...d.describe, voiceMode: describeVoiceMode(d.describe.voiceMode) });
    if (d.jobId) setParentId(d.jobId);
    setHydrated(true);
  }, [sp]);
  useEffect(() => { if (hydrated) writeDraft({ start, header, describe, jobId: parentId ?? undefined }); }, [hydrated, start, header, describe, parentId]);
  // when a show is chosen, its look and language are the defaults
  useEffect(() => { if (forShow) setHeader((h) => ({ ...h, style: forShow.style, language: forShow.language, dialect: forShow.dialect ?? h.dialect })); }, [forShow]);

  // the parent job: from the store's job list (the event stream) and, while it runs, from GET /api/jobs/{id}
  const fromStore = parentId ? jobs.find((j) => j.id === parentId) : undefined;
  const parent = useMemo(() => [fromStore, polled].filter((j): j is Job => Boolean(j) && j!.id === parentId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [fromStore, polled, parentId]);
  useEffect(() => {
    if (!parentId) { setPolled(null); return; }
    let on = true;
    const tick = () => api.job(parentId).then((r) => { if (on) setPolled(r.job); }).catch(() => { /* the store's copy still updates */ });
    tick();
    const t = setInterval(() => { if (parent && isTerminalStatus(parent.status) && !Object.keys(retries).length) return; tick(); }, 3000);
    return () => { on = false; clearInterval(t); };
  }, [parentId, parent?.status, retries]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => creationSteps(parent, jobs, retries), [parent, jobs, retries]);
  const characterId = createdCharacterId(parent, jobs);
  const created = characterId ? state.characters.find((c) => c.id === characterId) : undefined;
  // the recording keeps the page "running" while it is being checked, or while it waits for a character that is still
  // being made (a creation that ended without a character has nothing to attach it to)
  const recordingBusy = Boolean(voiceUpload && voiceUpload.forJob === parentId && (voiceUpload.state === 'uploading' || (voiceUpload.state === 'waiting' && (Boolean(characterId) || !parent || isActiveStatus(parent.status)))));
  const settled = creationSettled(parent, steps) && !recordingBusy;
  const allGood = settled && parent?.status === 'COMPLETED' && steps.every((s) => s.state === 'done' || s.state === 'skipped') && Boolean(created);
  const running = Boolean(parentId) && !allGood;
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
  const needsVoice = describe.voiceMode === 'RECORDING';
  const gate = engineGate(engines.status, start === 'sheet' ? ['images'] : needsVoice ? ['images', 'voice'] : ['images']);
  const gateReason = !gate.ok ? `${T('char.create.engineDown')}: ${gate.blocked.map((b) => `${T.dyn(`status.${b.need}`)} — ${b.detail}`).join(' · ')}` : null;
  const dialectReason = header.language === 'AR' && !header.dialect ? T('char.create.needDialect') : null;
  const disabledReason = gateReason ?? dialectReason;

  useUnsavedGuard(!parentId && (describe.brief.trim().length > 0 || picture.note.trim().length > 0), T('char.create.leave'));

  const basePayload = (): Pick<CreateCharacterPayload, 'style' | 'language' | 'dialect' | 'productionId' | 'showId'> => ({ style: header.style, language: header.language, dialect: header.language === 'AR' ? header.dialect : undefined, showId: forShow?.id, productionId: forProduction?.id });

  const launch = useCallback(async (payload: CreateCharacterPayload, withRecording = false) => {
    setBusy(true); setStartError(null);
    try {
      const job = await startCreateCharacter(startJob, payload);
      setLastPayload(payload); setRetries({}); setPolled(null); setParentId(job.id);
      setVoiceUpload(withRecording ? { forJob: job.id, state: 'waiting' } : null);
      writeDraft({ ...readDraft(), jobId: job.id, referenceAssetId: payload.referenceAssetId });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setStartError(isStudioError(e) ? e.message : (e as Error).message); }
    finally { setBusy(false); }
  }, [startJob]);

  const submitDescribe = () => {
    const check = checkBrief(describe.brief, describe.name); if (!check.ok) return;
    const profile: Partial<CharacterProfileInput> = {};
    if (describe.sex) profile.sex = describe.sex; if (describe.ageYears) profile.ageYears = describe.ageYears; if (describe.species) profile.species = describe.species;
    // a recording added here is uploaded once the character exists; the chain's voice step (AUTOMATIC) builds from it
    // — an AUTOMATIC voice always needs an uploaded recording, there is no voice bank
    const voice = describeVoicePayload(describe.voiceMode, Boolean(recording));
    void launch({ mode: 'AUTO', name: describe.name.trim() || undefined, brief: describe.brief.trim() || undefined, profile: Object.keys(profile).length ? profile : undefined, ...basePayload(), voice, draw: true }, voice.mode === 'AUTOMATIC');
  };
  const submitSheet = (profile: CharacterProfileInput, draw: boolean) => {
    void launch({ mode: 'MANUAL', profile, ...basePayload(), voice: { mode: 'NONE' }, draw });
  };
  const submitPicture = () => {
    if (!picture.asset) return;
    const keep = picture.keep === 'FACE' ? T('char.create.keepFace.prompt') : T('char.create.keepAll.prompt');
    const brief = [keep, picture.note.trim()].filter(Boolean).join(' ');
    // the look is the picture's (never designed from words); who they are — sex and age when the producer says —
    // travels in the profile, the rest is designed from the name, the role and the note
    const ageYears = picture.ageYears && Number.isInteger(picture.ageYears) && picture.ageYears >= 1 && picture.ageYears <= 120 ? picture.ageYears : undefined;
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
      const job = step === 'appearance' ? await startJob('CHARACTER_APPEARANCE', { characterId })
        : step === 'sheet' ? await startJob('CHARACTER_REFS', { characterId })
        : await startVoiceBuild(startJob, { characterId, mode: lastPayload?.voice?.referenceSampleId ? 'REFERENCE' : 'AUTOMATIC', referenceSampleId: lastPayload?.voice?.referenceSampleId });
      setRetries((r) => ({ ...r, [step]: job.id }));
    } catch (e) { toast.bad(`${T('gen.failed')}: ${isStudioError(e) ? e.message : (e as Error).message}`); }
  };
  const writeMyself = () => { setSheetPrefill({ name: lastPayload?.name ?? describe.name, personality: lastPayload?.brief ?? describe.brief }); reset(); setStart('sheet'); };
  const cancel = async () => { if (!parentId) return; setCancelling(true); try { await cancelJob(parentId); } catch (e) { toast.bad((e as Error).message); } finally { setCancelling(false); } };
  const reset = () => { setParentId(null); setPolled(null); setRetries({}); setVoiceUpload(null); writeDraft({ ...readDraft(), jobId: undefined, referenceAssetId: undefined }); };
  const discard = () => { if (created) { try { act('deleteCharacter', created.id); toast.ok(T('toast.deleted')); } catch (e) { toast.bad((e as Error).message); return; } } reset(); };
  const anotherLook = async () => { if (!characterId) return; try { const job = await startJob('CHARACTER_APPEARANCE', { characterId }); setRetries((r) => ({ ...r, appearance: job.id })); } catch (e) { toast.bad((e as Error).message); } };

  const profileHref = characterId ? `/characters/${characterId}?tab=appearance&created=${parentId ?? ''}` : '/characters';
  const cancelHref = forShow ? `/shows/${forShow.id}?tab=characters` : '/characters';
  const engineBadge = engines.status && !engines.status.images.ok ? <Badge tone="warn">{T('char.create.needsEngine')}</Badge> : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <Crumbs items={[{ href: '/characters', label: T('nav.characters') }, { label: T('lib.addCharacter') }]} />
      <PageHeader title={T('lib.addCharacter')} subtitle={T('char.create.lead')} className="mb-6" />

      {!running && !allGood && (
        <div className="space-y-6">
          <SharedHeader value={header} onChange={setHeader} />
          {gateReason && (
            <Notice tone="warn" title={T('char.create.engineDownTitle')} action={<span className="flex flex-wrap gap-2"><Link href="/settings#engines" className="btn btn-secondary btn-sm">{T('char.create.openEngines')}</Link><Button size="sm" variant="ghost" icon={<IconRetry />} loading={engines.loading} onClick={engines.reload}>{T('btn.refresh')}</Button></span>}>
              {gate.blocked.map((b) => <span key={b.need} className="block" dir="auto">{T.dyn(`status.${b.need}`)}: {b.detail}</span>)}
              <span className="mt-1 block">{T('char.create.sheetAlwaysWorks')}</span>
            </Notice>
          )}
          <ChoiceCards name="start" size="lg" columns={3} value={start} onChange={(v) => { setStart(v); setStartError(null); }} options={[
            { value: 'describe', label: <span className="flex items-center gap-2">{T('char.create.describe')}{engineBadge}</span>, hint: T('char.create.describe.hint'), icon: <IconAuto /> },
            { value: 'sheet', label: T('char.create.sheet'), hint: T('char.create.sheet.hint'), icon: <IconManual /> },
            { value: 'picture', label: <span className="flex items-center gap-2">{T('char.create.picture')}{engineBadge}</span>, hint: T('char.create.picture.hint'), icon: <IconImageAdd /> },
          ]} />
          {startError && <Notice tone="bad" title={T('gen.failed')}>{startError}</Notice>}
          <div key={start} className="fade-in">
            {start === 'describe' && <DescribeStart value={describe} onChange={setDescribe} recording={recording} onRecording={setRecording} onSubmit={submitDescribe} busy={busy} disabledReason={disabledReason} onCancel={() => router.push(cancelHref)} />}
            {start === 'sheet' && <div className="card p-4 sm:p-6"><CharacterForm onSaved={() => undefined} onCancel={() => router.push(cancelHref)} create={{ style: header.style, language: header.language, dialect: header.language === 'AR' ? header.dialect : undefined, name: sheetPrefill.name, personality: sheetPrefill.personality, onCreate: submitSheet, busy, drawDisabledReason: disabledReason ?? undefined }} /></div>}
            {start === 'picture' && <PictureStart value={picture} onChange={setPicture} onSubmit={submitPicture} busy={busy} disabledReason={disabledReason} onCancel={() => router.push(cancelHref)} />}
          </div>
        </div>
      )}

      {running && (
        <div className="space-y-4">
          <CreationProgress parent={parent} steps={steps} characterId={characterId} referenceSrc={start === 'picture' || draft.current.referenceAssetId ? referenceSrc : undefined} onCancel={() => void cancel()} cancelling={cancelling} onRetryStep={(s) => void retryStep(s)} onWriteMyself={writeMyself}>
            {voiceUpload && voiceUpload.forJob === parentId && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]" role="status">
                <span className={`status ${voiceUpload.state === 'accepted' ? 'status-ok' : voiceUpload.state === 'refused' || voiceUpload.state === 'error' ? 'status-bad' : 'status-info'}`} dir="auto">
                  {T.dyn(`char.create.rec.${voiceUpload.state}`)}{voiceUpload.message ? ` — ${voiceUpload.message}` : ''}
                </span>
                {voiceUpload.state === 'error' && recording && <Button size="sm" variant="ghost" icon={<IconRetry />} onClick={() => setVoiceUpload({ ...voiceUpload, state: 'waiting', message: undefined })}>{T('jobs.retry')}</Button>}
                {(voiceUpload.state === 'refused' || voiceUpload.state === 'error') && characterId && <Link href={`/characters/${characterId}?tab=voice`} className="btn btn-secondary btn-sm">{T('char.create.addRecording')}</Link>}
              </div>
            )}
            {settled && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
                {created ? <>
                  <p className="me-auto text-[13px] text-body" dir="auto">{T('char.create.partial').replace('{name}', created.name)}</p>
                  <Link href={profileHref} className="btn btn-primary"><IconOpen aria-hidden />{T('char.create.openProfile')}</Link>
                </> : <>
                  <p className="me-auto text-[13px] text-body">{T('char.create.nothingMade')}</p>
                  <Button variant="secondary" icon={<IconRetry />} onClick={() => { if (lastPayload) void launch(lastPayload, relaunchWithRecording()); else reset(); }}>{T('jobs.retry')}</Button>
                  <Button variant="ghost" onClick={reset}>{T('btn.back')}</Button>
                </>}
              </div>
            )}
          </CreationProgress>
          {!settled && parent && isActiveStatus(parent.status) && <p className="text-[12px] text-faint">{T('char.create.runningHint')}</p>}
        </div>
      )}

      {allGood && created && <ReadyCard c={created} steps={steps} profileHref={profileHref} onAnotherLook={() => void anotherLook()} onDiscard={discard} anotherLookDisabled={gateReason ?? undefined} />}
    </div>
  );
}
