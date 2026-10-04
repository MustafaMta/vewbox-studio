'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Job } from '@/domain/jobs';
import type { Production, Shot, ShotDialogue, Take } from '@/domain/types';
import { CAMERA_MOVES, FRAMINGS, TRANSITIONS, type CameraMove, type Framing, type Transition } from '@/domain/vocabulary';
import { nid } from '@/domain/actions';
import { useStudio } from '@/studio/store';
import { useShell } from '@/components/shell/context';
import { artVars } from '@/studio/presentation';
import { assetById, castOf, locationById, primaryImageOf, shotHref, shotLabel } from '@/studio/selectors';
import { identityStatus, voiceTrackSource } from '@/components/character/identity';
import { useToast } from '@/components/ui/toast';
import { useDraft, useUnsavedGuard } from '@/lib/hooks';
import { Button, Field, Input, Menu, MenuItem, Segmented, StateWord, Textarea, cls } from '@/components/ui/kit';
import { RetryControl } from '@/components/ui/jobs';
import { useErrorCopy } from '@/components/ui/progress';
import { Frame } from '@/components/media/Frame';
import { FaceCircle } from '@/components/media/FaceCircle';
import { CanvasPlayer } from '@/components/players/CanvasPlayer';
import { CompareAB } from '@/components/edit/CompareAB';
import { TrackButton } from '@/components/players/PlayerProvider';
import { displaySrc, shortWhen } from '@/components/home/model';
import { IconChevronLeft, IconChevronRight, IconClose, IconCompare, IconDelete, IconDuplicate, IconFrame, IconTake, IconUpload, IconVoice } from '@/components/ui/icons';
import { GenButton, useStudioGate } from './gate';
import { RunningRow } from './Running';
import { ShotFailure } from './Failed';
import { WorkspaceShell } from './WorkspaceShell';
import { FramingDraw, MoveDraw, Picks } from '@/components/edit';
import { activeShotJob, canUseTake, expectationWords, frameRatioOf, jobsOf, linesToHear, neighbours, orderedShots, spokenDuration, takeVerdict, vocab, workspaceHref } from './model';

/** THE SHOT WORKSPACE (docs/DESIGN-SYSTEM-V5.md §8.11) — the shot is the session. The canvas holds one dominant
 *  picture: the take being judged at its native ratio, or the opening frame (the ending frame on request), or, with
 *  nothing drawn yet, the shot's purpose as a title card. Under it the status row (what is running, its real phase and
 *  elapsed time, Cancel; or what to expect), the takes side by side with their judgement (use, good, rejected, compare
 *  two) and the attempts as the shot's history. The inspector (360) holds the generation controls in disclosure
 *  sections: camera and framing, cast and references, action and dialogue (with the voices to hear), generation
 *  settings, notes and details. Never a node editor, never engine internals. `[` and `]` move between shots. */

type View = 'take' | 'opening' | 'ending';
type Draft = Pick<Shot, 'purpose' | 'action' | 'framing' | 'cameraMove' | 'durationSeconds' | 'characterIds' | 'dialogue' | 'transition' | 'openingFrameAssetId' | 'endingFrameAssetId' | 'notes'>;
const LENGTHS = [4, 5, 6, 7, 8, 10];

export function ShotWorkspace({ p, shot }: { p: Production; shot: Shot }) {
  const { state, act, jobs, addFile } = useStudio();
  const { decisions } = useShell();
  const toast = useToast();
  const router = useRouter();
  const gate = useStudioGate();
  const ratio = frameRatioOf(p);
  const scene = p.scenes.find((sc) => sc.id === shot.sceneId);
  const { prev, next } = neighbours(p, shot.id);
  const running = activeShotJob(p, shot.id, jobs);
  const toHear = linesToHear(p, decisions.items, shot.id);

  const { draft, patch, dirty, reset } = useDraft<Draft>({ purpose: shot.purpose, action: shot.action, framing: shot.framing, cameraMove: shot.cameraMove, durationSeconds: shot.durationSeconds, characterIds: shot.characterIds, dialogue: shot.dialogue, transition: shot.transition, openingFrameAssetId: shot.openingFrameAssetId, endingFrameAssetId: shot.endingFrameAssetId, notes: shot.notes });
  useUnsavedGuard(dirty, 'This shot has unsaved changes. Leave anyway?');
  const save = () => { act('updateShot', p.id, shot.id, draft); toast.ok('Shot saved.'); };

  const newestFirst = useMemo(() => [...shot.takes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [shot.takes]);
  const [shownId, setShownId] = useState<string | null>(shot.selectedTakeId ?? newestFirst[0]?.id ?? null);
  const shown = shot.takes.find((t) => t.id === shownId);
  const [view, setView] = useState<View>(shown ? 'take' : 'opening');
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const shownAsset = assetById(state, shown?.assetId);
  const opening = assetById(state, draft.openingFrameAssetId); const ending = assetById(state, draft.endingFrameAssetId);

  // [ and ] move between shots (Frame.io), unless the producer is typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '[' && prev) { e.preventDefault(); router.push(shotHref(p, prev.id)); }
      if (e.key === ']' && next) { e.preventDefault(); router.push(shotHref(p, next.id)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, prev, next, router]);

  const takeNo = (t: Take) => shot.takes.indexOf(t) + 1;
  const use = (t: Take) => { try { act('selectTake', p.id, shot.id, t.id); toast.ok(`Take ${takeNo(t)} is in the cut.`); } catch (e) { toast.bad((e as Error).message); } };
  const rate = (t: Take, rating: 'GOOD' | 'REJECTED' | null) => {
    let reason: string | undefined;
    if (rating === 'REJECTED') { const r = window.prompt('Why is this take rejected? (optional)', ''); if (r === null) return; reason = r.trim() || undefined; }
    try { act('rateTake', p.id, shot.id, t.id, rating, { reason, by: 'producer' }); toast.ok(rating === 'GOOD' ? `Take ${takeNo(t)} marked good.` : rating === 'REJECTED' ? `Take ${takeNo(t)} rejected; it stays in the attempts.` : 'Judgement withdrawn.'); } catch (e) { toast.bad((e as Error).message); }
  };
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  const [uploading, setUploading] = useState(false);
  const uploadTake = async (file: File) => {
    setUploading(true);
    try {
      const r = await addFile(file, { label: `${shotLabel(p, shot)} — ${file.name}`, tags: ['take', 'upload'], expect: 'VIDEO' });
      if (!r.ok) { toast.bad(r.error); return; }
      act('addTake', p.id, shot.id, { assetId: r.asset.id, provider: 'UPLOAD', label: file.name.replace(/\.[^.]+$/, ''), width: r.asset.width, height: r.asset.height, durationSeconds: r.asset.durationSeconds, fps: r.asset.fps });
      toast.ok('Your clip was added as a take.');
    } finally { setUploading(false); }
  };

  const ca = shot.takes.find((t) => t.id === compare[0]); const cb = shot.takes.find((t) => t.id === compare[1]);
  const caAsset = assetById(state, ca?.assetId); const cbAsset = assetById(state, cb?.assetId);
  const canvasTitle = view === 'take' && shown ? `Take ${takeNo(shown)} · ${takeVerdict(shot, shown).words}${shown.qa ? (shown.qa.ok ? ' · passed its checks' : ' · a check failed') : ''}` : view === 'ending' ? 'Ending frame' : 'Opening frame';
  const readout = view === 'take' && shown ? [shown.width && shown.height ? `${shown.width}×${shown.height}` : null, shown.fps ? `${Math.round(shown.fps)} fps` : null, shown.durationSeconds ? `${shown.durationSeconds.toFixed(1)} s` : null].filter(Boolean).join(' · ') : (view === 'ending' ? ending : opening)?.width ? `${(view === 'ending' ? ending : opening)!.width}×${(view === 'ending' ? ending : opening)!.height}` : '';

  return (
    <WorkspaceShell p={p} tab="produce" shotId={shot.id} gate={gate} view="shot">
      <section className="ws-stage" aria-labelledby="ws-shot-h">
        <h1 id="ws-shot-h" className="sr-only">Shot {shotLabel(p, shot)} of {p.title}</h1>
        <ShotSwitcher p={p} shot={shot} prev={prev} next={next} />
        <div className="ws-stage-head">
          <span className="ws-stage-title">{canvasTitle}</span>
          {readout && <span className="ws-ro ws-stage-ro">{readout}</span>}
        </div>
        <div className="ws-canvas canvas" data-ratio={ratio}>
          {comparing && caAsset && cbAsset ? (
            <CompareAB a={{ src: caAsset.src, poster: caAsset.poster, label: `Take ${takeNo(ca!)}`, chosen: shot.selectedTakeId === ca!.id }} b={{ src: cbAsset.src, poster: cbAsset.poster, label: `Take ${takeNo(cb!)}`, chosen: shot.selectedTakeId === cb!.id }}
              onChoose={(w) => { const t = w === 'A' ? ca! : cb!; if (canUseTake(t)) use(t); }} fps={shown?.fps} aspect={ratio} />
          ) : view === 'take' && shownAsset && !shownAsset.unavailable ? (
            <CanvasPlayer key={shownAsset.id} src={shownAsset.src} poster={shownAsset.poster} fps={shown?.fps} title={`Shot ${shotLabel(p, shot)}, take ${shown ? takeNo(shown) : ''}`} aspect={ratio.replace('/', ' / ')} />
          ) : (
            <div className="ws-canvas-still">
              <Frame asset={view === 'ending' ? ending : opening} ratio={ratio} fit="contain" judge alt={view === 'ending' ? `Ending frame of shot ${shotLabel(p, shot)}` : `Opening frame of shot ${shotLabel(p, shot)}`} radius="none" priority
                art={artVars(view === 'ending' ? ending : opening)} title={draft.purpose || `Shot ${shotLabel(p, shot)}`} titleState="notDrawn"
                state={running ? 'drawing' : 'ready'} phase={running ? 'Being made' : undefined} />
            </div>
          )}
        </div>
        <div className="ws-canvas-bar">
          <Segmented<View> label="On the canvas" value={view} onChange={(v) => { setView(v); setComparing(false); }} size="sm" options={[
            { value: 'take', label: shown ? `Take ${takeNo(shown)}` : 'Take', disabled: !shown },
            { value: 'opening', label: 'Opening frame', disabled: !opening },
            { value: 'ending', label: 'Ending frame', disabled: !ending },
          ]} />
          {compare.length === 2 && <Button size="sm" icon={<IconCompare aria-hidden />} onClick={() => setComparing((c) => !c)} aria-pressed={comparing}>{comparing ? 'Stop comparing' : `Compare takes ${compare.map((id) => takeNo(shot.takes.find((t) => t.id === id)!)).join(' and ')}`}</Button>}
        </div>

        <ShotFailure p={p} shotId={shot.id} gate={gate} />
        <StatusRow p={p} shot={shot} running={running} />

        <section className="ws-takes" aria-labelledby="ws-takes-h">
          <div className="ws-sub-head">
            <h2 id="ws-takes-h" className="t-title">Takes <span className="ws-ro ws-count">{shot.takes.length}</span></h2>
            <span className="t-meta">{shot.selectedTakeId ? 'One is in the cut' : shot.takes.length ? 'None is in the cut yet' : 'No takes yet'}{shot.takes.length > 1 ? ' · tick two to compare' : ''}</span>
          </div>
          {shot.takes.length === 0 && !running ? <p className="t-body ws-empty">No takes yet. Set the shot up in the inspector, then make the first take.</p> : (
            <ul className="ws-take-row" role="list" data-ratio={ratio}>
              {running?.type === 'GENERATE_TAKE' && (
                <li className="ws-take ws-take-pending" aria-label="A take is being made">
                  <span className="ws-take-frame"><Frame ratio={ratio} alt="" title="New take" titleState="drawing" state="drawing" phase="Being made" decorative radius="none" /></span>
                  <span className="ws-take-name">New take</span><span className="t-meta">Being made</span>
                </li>
              )}
              {shot.takes.map((t) => {
                const pic = assetById(state, t.thumbnailAssetId) ?? assetById(state, shot.openingFrameAssetId);
                const verdict = takeVerdict(shot, t);
                const on = shot.selectedTakeId === t.id;
                return (
                  <li key={t.id} className="ws-take" data-selected={on || undefined} data-shown={t.id === shownId && view === 'take' ? '' : undefined} data-rejected={!canUseTake(t) || undefined}>
                    <button type="button" className="ws-take-frame" onClick={() => { setShownId(t.id); setView('take'); setComparing(false); }} aria-label={`Show take ${takeNo(t)} on the canvas`} aria-pressed={t.id === shownId && view === 'take'}>
                      <Frame asset={pic} src={displaySrc(pic)} ratio={ratio} fit="cover" alt="" decorative radius="none" art={artVars(pic)} title={`Take ${takeNo(t)}`} titleState="notDrawn" judge>
                        {t.durationSeconds ? <span className="art-chip ws-ro">{t.durationSeconds.toFixed(1)} s</span> : null}
                      </Frame>
                    </button>
                    <span className="ws-take-name">Take {takeNo(t)}{t.provider === 'UPLOAD' ? ' · your clip' : t.provider === 'SAMPLE' ? ' · sample' : ''}</span>
                    <StateWord tone={verdict.tone}>{verdict.words}</StateWord>
                    {t.generationMs ? <span className="t-meta">made in {spokenDuration(t.generationMs)}</span> : <span className="t-meta">{shortWhen(t.createdAt)}</span>}
                    <span className="ws-take-acts">
                      {!on && canUseTake(t) && <Button size="sm" onClick={() => use(t)}>Use this take</Button>}
                      {canUseTake(t) && t.status !== 'REJECTED' && (t.rating === 'GOOD'
                        ? <Button size="sm" variant="quiet" onClick={() => rate(t, null)} aria-label={`Take ${takeNo(t)}: withdraw “good”`}>Good · undo</Button>
                        : <Button size="sm" variant="quiet" onClick={() => rate(t, 'GOOD')}>Good</Button>)}
                      {t.rating === 'REJECTED' ? <Button size="sm" variant="quiet" onClick={() => rate(t, null)}>Restore</Button> : t.status !== 'REJECTED' && <Button size="sm" variant="quiet" onClick={() => rate(t, 'REJECTED')}>Reject</Button>}
                      {shot.takes.length > 1 && <label className="ws-compare-tick"><input type="checkbox" checked={compare.includes(t.id)} onChange={() => toggleCompare(t.id)} />Compare</label>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Attempts shot={shot} jobs={jobsOf(p, jobs).filter((j) => j.type === 'GENERATE_TAKE' && j.shotId === shot.id)} />
      </section>

      <aside className="ws-inspector" aria-label={`Shot ${shotLabel(p, shot)}: settings`}>
        <div className="ws-insp-head">
          <p className="t-label name"><bdi>Scene {scene?.number} · {scene?.title}</bdi>{scene ? ` · ${vocab(scene.timeOfDay).toLowerCase()}` : ''}</p>
          <h2 className="ws-insp-title">Shot {shotLabel(p, shot)}</h2>
          <p className="t-meta">{vocab(draft.framing)} · {vocab(draft.cameraMove).toLowerCase()} · {draft.durationSeconds} s</p>
        </div>

        <Generate p={p} shot={shot} gate={gate} dirty={dirty} />

        <details className="ws-disc" open>
          <summary className="ws-disc-sum">Camera and framing</summary>
          <div className="ws-disc-body">
            <Field label="Framing"><Picks<Framing> label="Framing" value={draft.framing} options={FRAMINGS.map((v) => ({ value: v, label: vocab(v) }))} onChange={(v) => patch({ framing: v })} draw={(v) => <FramingDraw f={v} />} /></Field>
            <Field label="Camera"><Picks<CameraMove> label="Camera move" value={draft.cameraMove} options={CAMERA_MOVES.map((v) => ({ value: v, label: vocab(v) }))} onChange={(v) => patch({ cameraMove: v })} draw={(v) => <MoveDraw m={v} />} /></Field>
            <Field label="Length"><Segmented<string> label="Length in seconds" size="sm" value={String(draft.durationSeconds)} onChange={(v) => patch({ durationSeconds: Number(v) })} options={[...new Set([...LENGTHS, draft.durationSeconds])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n} s` }))} /></Field>
            <Field label="Into the shot" help="How it joins the shot before it."><Segmented<Transition> label="Into the shot" size="sm" value={draft.transition} onChange={(v) => patch({ transition: v })} options={TRANSITIONS.map((t) => ({ value: t, label: t === 'EXTEND' ? 'Continues' : vocab(t) }))} /></Field>
          </div>
        </details>

        <details className="ws-disc" open>
          <summary className="ws-disc-sum">Cast and references</summary>
          <div className="ws-disc-body">
            <References p={p} draft={draft} patch={patch} sceneLocationId={scene?.locationId} timeOfDay={scene?.timeOfDay} />
          </div>
        </details>

        <details className="ws-disc" open>
          <summary className="ws-disc-sum">Action and dialogue</summary>
          <div className="ws-disc-body">
            <Field label="What the shot is for"><Input value={draft.purpose} onChange={(e) => patch({ purpose: e.target.value })} dir="auto" placeholder="One line: why this shot exists" /></Field>
            <Field label="What happens"><Textarea value={draft.action} onChange={(e) => patch({ action: e.target.value })} rows={3} dir="auto" /></Field>
            <Dialogue p={p} shot={shot} draft={draft} patch={patch} toHear={toHear} gate={gate} />
          </div>
        </details>

        <details className="ws-disc">
          <summary className="ws-disc-sum">Notes</summary>
          <div className="ws-disc-body">
            <Field label="Notes for this shot"><Textarea value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} rows={3} dir="auto" /></Field>
          </div>
        </details>

        <details className="ws-disc">
          <summary className="ws-disc-sum">Details{shown ? ` · take ${takeNo(shown)}` : ''}</summary>
          <div className="ws-disc-body"><Provenance take={shown} shot={shot} /></div>
        </details>

        <div className="ws-insp-foot" data-dirty={dirty || undefined}>
          {dirty ? <span className="t-meta">Unsaved changes</span> : <span className="t-meta">Saved</span>}
          <span className="ws-actions">
            {dirty && <Button size="sm" variant="quiet" onClick={reset}>Discard</Button>}
            <Button size="sm" variant="primary" disabled={!dirty} onClick={save}>Save the shot</Button>
            <Menu label={`Shot ${shotLabel(p, shot)}: more`}>
              <label className="menu-item ws-upload" aria-disabled={uploading}><IconUpload aria-hidden />{uploading ? 'Adding your clip…' : 'Add your own clip as a take'}<input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadTake(f); e.target.value = ''; }} /></label>
              <MenuItem icon={<IconDuplicate aria-hidden />} onClick={() => { act('duplicateShot', p.id, shot.id); toast.ok('Shot duplicated.'); router.push(workspaceHref(p, 'storyboard')); }}>Duplicate the shot</MenuItem>
              <MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={() => { if (window.confirm('Delete this shot and its takes?')) { act('deleteShot', p.id, shot.id); toast.ok('Deleted.'); router.push(workspaceHref(p, 'storyboard')); } }}>Delete the shot</MenuItem>
            </Menu>
          </span>
        </div>
      </aside>
    </WorkspaceShell>
  );
}

/** Under 1280 the outline folds into this bar: the scene and shot as a menu of every shot, and ‹ › for the neighbours. */
function ShotSwitcher({ p, shot, prev, next }: { p: Production; shot: Shot; prev?: Shot; next?: Shot }) {
  const router = useRouter();
  return (
    <div className="ws-switcher">
      <Link className={cls('btn btn-secondary btn-sm btn-icon', !prev && 'is-disabled')} href={prev ? shotHref(p, prev.id) : '#'} aria-disabled={!prev || undefined} tabIndex={prev ? undefined : -1} aria-label={prev ? `Previous shot, ${shotLabel(p, prev)}` : 'No previous shot'}><IconChevronLeft aria-hidden /></Link>
      <select className="select ws-switcher-select" aria-label="Go to a shot" value={shot.id} onChange={(e) => router.push(shotHref(p, e.target.value))}>
        {orderedShots(p).map((sh) => { const sc = p.scenes.find((x) => x.id === sh.sceneId); return <option key={sh.id} value={sh.id}>{`Scene ${sc?.number ?? '?'} · Shot ${shotLabel(p, sh)} · ${vocab(sh.framing)}`}</option>; })}
      </select>
      <Link className={cls('btn btn-secondary btn-sm btn-icon', !next && 'is-disabled')} href={next ? shotHref(p, next.id) : '#'} aria-disabled={!next || undefined} tabIndex={next ? undefined : -1} aria-label={next ? `Next shot, ${shotLabel(p, next)}` : 'No next shot'}><IconChevronRight aria-hidden /></Link>
    </div>
  );
}

/** The status row (§8.11): what is being made for this shot now, with its real phase, elapsed time and Cancel; or
 *  nothing running and what a take here took; or the paused studio. */
function StatusRow({ p, shot, running }: { p: Production; shot: Shot; running?: Job }) {
  const expect = expectationWords(p, shot.id);
  if (running) return <div className="ws-status"><RunningRow job={running} p={p} expect={running.type === 'GENERATE_TAKE' ? expect : null} /></div>;
  return (
    <p className="ws-status ws-status-idle">
      <span className="state-dot" data-tone="idle" aria-hidden />
      Nothing is being made for this shot now.
      {expect && <span className="t-meta"> · {expect.charAt(0).toUpperCase() + expect.slice(1)}</span>}
    </p>
  );
}

/** The shot's history, newest first: every take and every attempt that did not become one (cancelled, failed), each
 *  with what happened in words and, for a failure, what is kept and the one way to try again. */
function Attempts({ shot, jobs }: { shot: Shot; jobs: Job[] }) {
  const copyOf = useErrorCopy();
  const items = [
    ...shot.takes.map((t) => ({ at: t.createdAt, take: t, job: undefined as Job | undefined })),
    ...jobs.filter((j) => j.status === 'FAILED' || j.status === 'CANCELLED').map((j) => ({ at: j.finishedAt ?? j.updatedAt ?? j.createdAt, take: undefined as Take | undefined, job: j })),
  ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  if (items.length === 0) return null;
  return (
    <section className="ws-attempts" aria-labelledby="ws-att-h">
      <div className="ws-sub-head"><h2 id="ws-att-h" className="t-title">Attempts</h2><span className="t-meta">Newest first</span></div>
      <ol className="ws-att-list" role="list">
        {items.map((x) => {
          if (x.take) {
            const t = x.take; const n = shot.takes.indexOf(t) + 1; const v = takeVerdict(shot, t);
            return (
              <li key={t.id}>
                <span className="ws-ro ws-att-t">{shortWhen(t.createdAt)}</span>
                <span className="ws-att-d">Take {n}{t.generationMs ? ` · ${spokenDuration(t.generationMs)}` : ''}{t.qa ? (t.qa.ok ? ' · passed its checks' : ' · a check failed') : ''} · {v.words.toLowerCase()}</span>
              </li>
            );
          }
          const j = x.job!;
          const cancelled = j.status === 'CANCELLED';
          const copy = cancelled ? null : copyOf(j.error);
          return (
            <li key={j.id} data-failed={!cancelled || undefined}>
              <span className="ws-ro ws-att-t">{shortWhen(x.at)}</span>
              <span className="ws-att-d">{cancelled ? `Cancelled${j.startedAt ? '' : ' before it started'} · nothing was lost` : <>{copy!.title} · your settings and references are kept</>}</span>
              {!cancelled && <span className="ws-att-act"><RetryControl job={j} size="sm" /></span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The generation block at the top of the inspector: the quality asked for, the one primary (a new take), drawing the
 *  frames, and whether the new take becomes the shot's choice when it passes. Their states are real: paused, an
 *  engine offline, a running job (with Cancel), a failure (with its recovery). */
function Generate({ p, shot, gate, dirty }: { p: Production; shot: Shot; gate: ReturnType<typeof useStudioGate>; dirty: boolean }) {
  const [quality, setQuality] = useState<'draft' | 'final'>('final');
  const [select, setSelect] = useState(false);
  const [seed, setSeed] = useState<'new' | 'reuse'>('new');
  const last = [...shot.takes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <div className="ws-gen-block">
      <Segmented<'draft' | 'final'> label="Quality" size="sm" value={quality} onChange={setQuality} options={[{ value: 'draft', label: 'Draft · faster' }, { value: 'final', label: 'Final' }]} />
      {quality === 'draft' && <p className="t-meta">Today every take is made at final quality; a draft request is recorded with the take.</p>}
      <GenButton gate={gate} engine="video" type="GENERATE_TAKE" variant="primary" icon={<IconTake aria-hidden />} target={{ productionId: p.id, shotId: shot.id }}
        payload={{ productionId: p.id, shotId: shot.id, quality, ...(select ? { select: true } : {}), ...(seed === 'reuse' && last?.seed !== undefined ? { seed: last.seed } : {}) }}
        disabled={dirty} reason="Save the shot first: the new take is made from the saved shot.">{shot.takes.length ? 'New take' : 'Make the first take'}</GenButton>
      <GenButton gate={gate} engine="images" type="SHOT_FRAMES" variant="secondary" icon={<IconFrame aria-hidden />} target={{ productionId: p.id, shotId: shot.id }} payload={{ productionId: p.id, shotId: shot.id, ending: true }}
        disabled={dirty} reason="Save the shot first.">{shot.openingFrameAssetId ? 'Draw the frames again' : 'Draw the opening and ending frames'}</GenButton>
      <details className="ws-disc ws-disc-inner">
        <summary className="ws-disc-sum">Generation settings</summary>
        <div className="ws-disc-body">
          <Field label="Seed" help={last?.seed !== undefined ? `Reusing keeps take ${shot.takes.indexOf(last) + 1}’s variation and changes only what you edited.` : 'No take with a recorded seed yet.'}>
            <Segmented<'new' | 'reuse'> label="Seed" size="sm" value={seed} onChange={setSeed} options={[{ value: 'new', label: 'A new variation' }, { value: 'reuse', label: 'Same as the last take', disabled: last?.seed === undefined }]} />
          </Field>
          <label className="ws-check"><input type="checkbox" checked={select} onChange={(e) => setSelect(e.target.checked)} />Put the new take in the cut when it passes its checks</label>
        </div>
      </details>
    </div>
  );
}

/** Cast and references: the shot's characters as named chips with their canonical face and voice state (toggle who is
 *  in frame), the scene's location plate with its lighting, and the two frame slots with the exclusion said in place. */
function References({ p, draft, patch, sceneLocationId, timeOfDay }: { p: Production; draft: Draft; patch: (x: Partial<Draft>) => void; sceneLocationId?: string; timeOfDay?: string }) {
  const { state } = useStudio();
  const cast = castOf(state, p);
  const loc = locationById(state, sceneLocationId);
  const plate = assetById(state, loc?.masterAssetId);
  const opening = assetById(state, draft.openingFrameAssetId); const ending = assetById(state, draft.endingFrameAssetId);
  return (
    <>
      <fieldset className="ws-fieldset">
        <legend className="t-label">Characters in the shot</legend>
        {cast.length === 0 ? <p className="t-meta">Nobody in the cast yet.</p> : (
          <div className="ws-ref-chips">
            {cast.map((c) => {
              const on = draft.characterIds.includes(c.id);
              const pic = assetById(state, primaryImageOf(c));
              const id = identityStatus(c);
              const voice = voiceTrackSource(c).kind !== 'NONE';
              return (
                <button key={c.id} type="button" className="chip ws-ref-chip" aria-pressed={on} onClick={() => patch({ characterIds: on ? draft.characterIds.filter((x) => x !== c.id) : [...draft.characterIds, c.id] })}
                  title={`${c.name} · ${id.kind === 'APPROVED' || id.kind === 'LOCKED' ? 'image approved' : id.kind === 'DRAFT' ? 'image not approved yet' : 'no image yet'} · ${voice ? 'voice ready' : 'no voice yet'}`}>
                  <FaceCircle name={c.name} asset={pic} size={24} decorative />
                  <span className="name"><bdi>{c.name}</bdi></span>
                  <span className="state-dot" data-tone={voice ? 'done' : 'idle'} aria-hidden />
                  <span className="sr-only">{voice ? ', voice ready' : ', no voice yet'}{id.kind === 'DRAFT' ? ', image not approved yet' : ''}</span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="ws-ref-loc">
        <span className="t-label">Location</span>
        {loc ? (
          <Link href={`/locations/${loc.id}`} className="ws-plate ws-plate-sm">
            <Frame asset={plate} ratio="16/9" fit="cover" alt="" decorative art={artVars(plate)} title={loc.name} radius="none" />
            <span className="ws-plate-name name"><bdi>{loc.name}</bdi>{timeOfDay ? ` · ${vocab(timeOfDay).toLowerCase()}` : ''}</span>
          </Link>
        ) : <p className="t-meta">The scene has no location.</p>}
      </div>
      <div className="ws-slots">
        {([['openingFrameAssetId', 'Opening frame', opening], ['endingFrameAssetId', 'Ending frame (optional)', ending]] as const).map(([key, label, a]) => (
          <div key={key} className="ws-slot">
            <span className="t-label">{label}</span>
            <span className="ws-slot-frame" data-ratio={frameRatioOf(p)}>
              <Frame asset={a} ratio={frameRatioOf(p)} fit="cover" alt="" decorative art={artVars(a)} title={a ? label : 'Not drawn'} titleState="notDrawn" radius="none" judge />
              {a && <button type="button" className="btn btn-secondary btn-sm btn-icon ws-slot-x" aria-label={`Remove the ${label.toLowerCase().replace(' (optional)', '')}`} onClick={() => patch({ [key]: undefined } as Partial<Draft>)}><IconClose aria-hidden /></button>}
            </span>
          </div>
        ))}
      </div>
      <p className="t-meta ws-exclusion">With both an opening and an ending frame, no other reference pictures can be added; the characters and the location still guide the take by name.</p>
    </>
  );
}

/** The shot's lines: the speaker's face and name, the line in its own script (Arabic isolated and right-to-left), the
 *  recording to hear, and — when the automatic check could not hear it back or it drifted from the script — the
 *  review waiting on it with the way to record it again. */
function Dialogue({ p, shot, draft, patch, toHear, gate }: { p: Production; shot: Shot; draft: Draft; patch: (x: Partial<Draft>) => void; toHear: Map<string, 'NOT_HEARD' | 'DRIFTED'>; gate: ReturnType<typeof useStudioGate> }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const cast = castOf(state, p);
  const keep = (ids: string[]) => {
    try { act('keepLineRecordings', p.id, ids.map((lineId) => ({ shotId: shot.id, lineId })), { by: 'producer' }); toast.ok(ids.length === 1 ? 'Recording kept.' : `${ids.length} recordings kept.`); }
    catch (e) { toast.bad((e as Error).message); }
  };
  const flagged = [...toHear.keys()].filter((id) => draft.dialogue.some((d) => d.id === id));
  const speakers = draft.characterIds.length ? cast.filter((c) => draft.characterIds.includes(c.id)) : cast;
  const setLine = (id: string, x: Partial<ShotDialogue>) => patch({ dialogue: draft.dialogue.map((d) => (d.id === id ? { ...d, ...x } : d)) });
  const arabic = p.language === 'AR';
  return (
    <fieldset className="ws-fieldset">
      <legend className="t-label">Dialogue</legend>
      {flagged.length > 1 && <div className="ws-review"><span className="t-meta">{flagged.length} lines wait to be heard again.</span><Button size="sm" onClick={() => keep(flagged)}>Keep all {flagged.length} recordings</Button></div>}
      {draft.dialogue.length === 0 ? <p className="t-meta">No lines in this shot.</p> : (
        <ul className="ws-dlg" role="list">
          {draft.dialogue.map((d) => {
            const c = cast.find((x) => x.id === d.characterId);
            const audio = assetById(state, d.audioAssetId);
            const review = toHear.get(d.id);
            return (
              <li key={d.id} className="ws-dlg-line" data-review={review ? '' : undefined}>
                <div className="ws-dlg-who">
                  <FaceCircle name={c?.name ?? 'Unknown'} asset={c ? assetById(state, primaryImageOf(c)) : null} size={24} decorative />
                  <select className="select ws-dlg-select" aria-label="Who speaks" value={d.characterId} onChange={(e) => setLine(d.id, { characterId: e.target.value })}>
                    {speakers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {audio && !audio.unavailable ? <TrackButton size="xs" track={{ id: `line-${d.id}`, src: audio.src, title: `${c?.name ?? 'Line'}: ${d.text}` }} labelPlay={`Hear ${c?.name ?? 'the line'}`} labelPause="Pause" /> : <span className="t-meta">Not recorded</span>}
                  <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label="Remove the line" onClick={() => patch({ dialogue: draft.dialogue.filter((x) => x.id !== d.id) })}><IconDelete aria-hidden /></button>
                </div>
                {arabic && <Textarea value={d.textAr ?? ''} rows={2} dir="rtl" lang="ar" aria-label={`${c?.name ?? 'Line'}: the line in Arabic`} placeholder="The line in Arabic" className="ws-line-ar" onChange={(e) => setLine(d.id, { textAr: e.target.value })} />}
                <Textarea value={d.text} rows={2} dir="auto" aria-label={`${c?.name ?? 'Line'}: ${arabic ? 'English, for review' : 'the line'}`} placeholder={arabic ? 'English, for review' : 'The line'} onChange={(e) => setLine(d.id, { text: e.target.value })} />
                {review && (
                  <div className="ws-review">
                    <span className="badge badge-wait">Hear it again</span>
                    <span className="t-meta">{review === 'NOT_HEARD' ? 'The automatic check could not hear it back; listen and confirm it.' : 'It drifted from the script; listen and decide.'}</span>
                    {audio && <Button size="sm" onClick={() => keep([d.id])}>Keep this recording</Button>}
                    <GenButton gate={gate} engine="voice" type="DIALOGUE_AUDIO" payload={{ productionId: p.id, shotIds: [shot.id], force: true }} target={{ productionId: p.id }} variant="quiet" icon={<IconVoice aria-hidden />} compact>Record it again</GenButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" variant="quiet" disabled={speakers.length === 0} onClick={() => patch({ dialogue: [...draft.dialogue, { id: nid('d'), characterId: draft.characterIds[0] ?? speakers[0]?.id ?? '', text: '' }] })}>Add a line</Button>
    </fieldset>
  );
}

/** Where the take came from, for the curious: who made it, when, how long it took, its checks and the words it was
 *  made from. Engine names appear only here. */
function Provenance({ take, shot }: { take?: Take; shot: Shot }) {
  if (!take) return <p className="t-meta">No take yet. The words the studio composes for this shot are shown here once a take is made.</p>;
  const failed = take.qa?.checks.filter((c) => !c.ok) ?? [];
  const rows: Array<[string, string]> = [
    ['Made by', take.provider === 'UPLOAD' ? 'Your upload' : take.provider === 'SAMPLE' ? 'A bundled sample clip' : take.model ?? take.provider ?? '—'],
    ['When', shortWhen(take.createdAt) ?? '—'],
    ['Time to make', take.generationMs ? spokenDuration(take.generationMs) : '—'],
    ['Size', take.width ? `${take.width}×${take.height}${take.fps ? ` · ${Math.round(take.fps)} fps` : ''}` : '—'],
    ['Length', take.durationSeconds ? `${take.durationSeconds.toFixed(1)} s` : '—'],
    ['Checks', take.qa ? (take.qa.ok ? 'Passed' : `${failed.length} failed`) : 'Not checked'],
    ...(take.costUsd ? [['Cost', `$${take.costUsd.toFixed(2)}`] as [string, string]] : []),
    ...(take.relation ? [['Joins the shot before', take.relation === 'CONTINUATION' ? 'Continues it' : take.relation === 'CUT' ? 'A cut' : 'A story transition'] as [string, string]] : []),
  ];
  return (
    <div className="ws-prov">
      <dl className="ws-dl">{rows.map(([k, v]) => <div key={k}><dt className="t-label">{k}</dt><dd>{v}</dd></div>)}</dl>
      {failed.length > 0 && <ul className="ws-prov-checks" role="list">{failed.map((c) => <li key={c.name} className="t-meta">{c.name}{c.detail ? `: ${c.detail}` : ''}</li>)}</ul>}
      {(take.rejectionReason || take.ratingReason) && <p className="t-meta" dir="auto">{take.ratingReason ?? take.rejectionReason}</p>}
      {(take.prompt || shot.prompt) && (
        <details className="ws-disc ws-disc-inner">
          <summary className="ws-disc-sum">The words it was made from</summary>
          <p className="ws-prompt" dir="auto">{take.prompt ?? shot.prompt}</p>
        </details>
      )}
    </div>
  );
}
