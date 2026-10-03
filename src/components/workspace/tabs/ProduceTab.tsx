'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production, Shot, Take } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, needsTake, readyTakes, shotHref, shotLabel } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { Button, Details, KV, Notice, SampleMark, Segmented, Status, Thumb } from '@/components/ui/kit';
import { JobButton } from '@/components/ui/jobs';
import { VideoPlayer } from '@/components/players/VideoPlayer';
import { IconCheck, IconFrame, IconProduce, IconTake } from '@/components/ui/icons';
import { fmtSeconds, ratioClass, ratioCss } from '@/lib/format';
import { StageGate, useStageApproved } from '@/components/studio/Approve';

/** PRODUCE — frames and takes for every shot, and the one choice that matters: which take goes into the cut.
 *  Every button here starts a real job; progress and failures show in place and in Activity. */
export function ProduceTab({ p }: { p: Production }) {
  const { act } = useStudio();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'open' | 'chosen'>('all');
  // a shot whose chosen take is only a bundled sample clip still needs a real take
  const shots = p.shots.filter((s) => filter === 'all' || (filter === 'chosen' ? !needsTake(s) : needsTake(s)));
  const chosen = p.shots.filter((s) => !needsTake(s)).length;
  const open = p.shots.filter((s) => needsTake(s)).length;
  const lines = p.shots.reduce((a, sh) => a + sh.dialogue.length, 0);
  const voiced = p.shots.reduce((a, sh) => a + sh.dialogue.filter((d) => d.audioAssetId).length, 0);
  // speaking shots whose chosen take never proved its words against the script (older takes, or a failing check)
  const unverifiedSpeaking = p.shots.filter((sh) => { const t = sh.takes.find((x) => x.id === sh.selectedTakeId); const c = t?.qa?.checks.find((x) => x.name === 'script-spoken'); return sh.dialogue.length > 0 && (!t || t.provider === 'SAMPLE' || !c || !c.ok); }).length;
  const storyApproved = useStageApproved(p.id, 'STORY');
  if (p.shots.length === 0) return <Notice title={T('empty.shots')}>{T('empty.shots.hint')} <Link href="?tab=storyboard" className="font-medium text-accent-text hover:underline">{T('tab.storyboard')} →</Link></Notice>;
  return (
    <div className="space-y-6">
      <StageGate productionId={p.id} stage="STORY" title={T('gate.story')} hint={T('gate.story.hint')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{T('produce.lead')} <span className="num font-medium text-fg">{chosen}/{p.shots.length}</span> {T('produce.shotsReady')}.</p>
        <div className="flex flex-wrap items-center gap-2">
          {open > 0 && <JobButton type="PRODUCE" payload={{ productionId: p.id }} target={{ productionId: p.id }} variant="primary" size="sm" icon={<IconProduce />} title={storyApproved === false ? T('gate.story') : T('gen.produceAll.hint')} disabled={storyApproved === false}>{T('gen.produceAll')}</JobButton>}
          {lines > 0 && p.kind !== 'MUSIC_VIDEO' && unverifiedSpeaking > 0 && <JobButton type="PRODUCE" payload={{ productionId: p.id, respeak: true }} target={{ productionId: p.id }} size="sm" title={storyApproved === false ? T('gate.story') : T('gen.respeak.hint')} disabled={storyApproved === false}>{T('gen.respeak')} · {unverifiedSpeaking}</JobButton>}
          {lines > 0 && p.kind !== 'MUSIC_VIDEO' && <span className="inline-flex items-center gap-2"><JobButton type="DIALOGUE_AUDIO" payload={{ productionId: p.id, force: voiced === lines }} target={{ productionId: p.id }} size="sm" title={T('gen.dialogue.hint')}>{T('gen.dialogue')}</JobButton><span className="text-xs text-muted"><span className="num">{voiced}/{lines}</span> {T('produce.linesVoiced')}</span></span>}
          <Segmented label={T('label.status')} value={filter} onChange={setFilter} options={[{ value: 'all', label: T('label.all') }, { value: 'open', label: T('produce.chooseTake') }, { value: 'chosen', label: T('board.chosen') }]} />
        </div>
      </div>
      {p.shots.some((s) => s.takes.some((t) => t.provider === 'SAMPLE')) && <p className="text-xs text-faint">{T('produce.sampleNote')}</p>}
      <ol className="space-y-4">{shots.map((sh) => <ShotRow key={sh.id} p={p} sh={sh} onSelect={(id) => { try { act('selectTake', p.id, sh.id, id); if (id) toast.ok(T('toast.takeSelected')); } catch (e) { toast.bad((e as Error).message); } }} />)}</ol>
      {chosen === p.shots.length && p.stage === 'PRODUCE' && <Button onClick={() => { act('markStepDone', p.id, 'PRODUCE'); toast.ok(T('toast.saved')); }}>{T('btn.markDone')}</Button>}
    </div>
  );
}

function ShotRow({ p, sh, onSelect }: { p: Production; sh: Shot; onSelect: (takeId: string | undefined) => void }) {
  const { state } = useStudio();
  const [preview, setPreview] = useState<string | null>(null);
  const opening = assetById(state, sh.openingFrameAssetId); const ending = assetById(state, sh.endingFrameAssetId);
  const selected = sh.takes.find((t) => t.id === sh.selectedTakeId);
  const shown = sh.takes.find((t) => t.id === (preview ?? sh.selectedTakeId));
  const shownAsset = assetById(state, shown?.assetId);
  const ratio = ratioClass(p.aspect);
  const vertical = p.aspect === 'VERTICAL_9_16';
  const usable = readyTakes(sh);
  return (
    <li className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href={shotHref(p, sh.id)} className="font-latin text-sm font-semibold hover:text-accent-text">{shotLabel(p, sh)}</Link>
        <span className="min-w-0 flex-1 truncate text-sm" dir="auto">{sh.purpose || sh.action}</span>
        <span className="num text-xs text-muted">{fmtSeconds(sh.durationSeconds)}</span>
        {selected ? <Status tone="ok">{T('produce.selectedTake')}: {selected.label}</Status> : usable.length ? <Status tone="warn">{T('produce.chooseTake')}</Status> : <Status>{T('produce.noTakes')}</Status>}
      </div>
      <div className={`grid gap-4 ${vertical ? 'lg:grid-cols-[minmax(0,14rem)_1fr]' : 'lg:grid-cols-[minmax(0,28rem)_1fr]'}`}>
        <div>
          {shownAsset ? <VideoPlayer src={shownAsset.src} poster={shownAsset.poster} title={`${shotLabel(p, sh)} ${shown?.label}`} compact aspect={ratioCss(p.aspect)} className={vertical ? 'mx-auto max-w-[14rem]' : ''} /> : <Thumb src={opening?.src} alt="" ratio={ratio} empty={T('board.noFrame')} className={vertical ? 'mx-auto max-w-[14rem]' : ''} />}
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">{shownAsset ? <span className="flex items-center gap-1.5"><IconTake className="size-3.5" />{shown?.label}{shownAsset.sample && <SampleMark className="!bg-surface-3 !text-muted" />}{shown?.status === 'REJECTED' && <span className="badge badge-bad">{T('gen.rejected')}</span>}</span> : <span className="flex items-center gap-1.5"><IconFrame className="size-3.5" />{T('produce.opening')}</span>}{shown?.note && <span className="truncate" dir="auto">{shown.note}</span>}</div>
          {shown && shown.provider !== 'SAMPLE' && <TakeProvenance take={shown} />}
        </div>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">{T('label.frames')}</p>
            <div className="flex flex-wrap items-start gap-2">
              <figure className="w-24"><Thumb src={opening?.src} alt={T('produce.opening')} ratio={ratio} className="rounded-md" empty="—" /><figcaption className="mt-1 text-[11px] text-muted">{T('produce.opening')}</figcaption></figure>
              <figure className="w-24"><Thumb src={ending?.src} alt={T('produce.ending')} ratio={ratio} className="rounded-md" empty="—" /><figcaption className="mt-1 text-[11px] text-muted">{T('produce.ending')}</figcaption></figure>
              <JobButton type="SHOT_FRAMES" payload={{ productionId: p.id, shotId: sh.id }} target={{ productionId: p.id, shotId: sh.id }} size="xs" icon={<IconFrame />} className="mt-6">{T('gen.frames')}</JobButton>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">{T('label.takes')}<span className="ms-1 num text-faint">{sh.takes.length}</span></p>
            <ul className="flex flex-wrap items-start gap-2" role="radiogroup" aria-label={`${shotLabel(p, sh)} ${T('label.takes')}`}>
              {sh.takes.map((t) => {
                const a = assetById(state, t.assetId); const on = sh.selectedTakeId === t.id; const showing = (preview ?? sh.selectedTakeId) === t.id; const rejected = t.status === 'REJECTED';
                return (
                  <li key={t.id} className="w-24">
                    <button type="button" role="radio" aria-checked={on} aria-label={`${t.label}${on ? ` (${T('btn.selected')})` : ''}${rejected ? ` (${T('gen.rejected')})` : ''}`} onClick={() => setPreview(t.id)} onDoubleClick={() => { if (!rejected) onSelect(t.id); }} className={`relative block w-full overflow-hidden rounded-md border-2 transition ${on ? 'border-ok' : showing ? 'border-accent' : 'border-transparent hover:border-line-strong'} ${rejected ? 'opacity-50' : ''}`}>
                      <Thumb src={a?.poster ?? a?.src} alt="" ratio={ratio} className="rounded-none" />
                      {on && <span className="absolute end-1 top-1 grid size-4 place-items-center rounded-full bg-ok text-white"><IconCheck className="size-3" /></span>}
                    </button>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[11px]"><span className="truncate">{t.label}</span>{!on && !rejected && <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => onSelect(t.id)}>{T('btn.select')}</button>}</div>
                  </li>
                );
              })}
              <li className="w-28"><JobButton type="GENERATE_TAKE" payload={{ productionId: p.id, shotId: sh.id }} target={{ productionId: p.id, shotId: sh.id }} size="xs" icon={<IconTake />} className="mt-1 w-full">{sh.takes.length ? T('gen.anotherTake') : T('gen.take')}</JobButton></li>
            </ul>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Where a generated take came from: provider, model, request, time, cost and the automatic checks. */
export function TakeProvenance({ take }: { take: Take }) {
  const failed = take.qa?.checks.filter((c) => !c.ok) ?? [];
  return (
    <Details summary={<span className="text-xs">{T('gen.provenance')}{take.qa ? <span className={`ms-2 badge ${take.qa.ok ? 'badge-ok' : 'badge-bad'}`}>{take.qa.ok ? T('gen.qaPassed') : T('gen.qaFailed')}</span> : null}</span>} className="mt-2">
      <KV rows={[[T('gen.model'), take.model ?? take.provider ?? '—'], [T('gen.request'), take.requestId ?? '—'], [T('gen.time'), take.generationMs ? fmtSeconds(Math.round(take.generationMs / 1000)) : '—'], [T('gen.cost'), take.costUsd != null ? `$${take.costUsd.toFixed(2)}` : '—'], [T('label.duration'), take.durationSeconds ? fmtSeconds(take.durationSeconds) : '—'], ['Size', take.width ? `${take.width}×${take.height} @ ${take.fps?.toFixed(0) ?? '?'} fps` : '—'], ...(take.workflowVersion ? [['Workflow', take.workflowVersion] as [string, string]] : [])]} />
      {take.rejectionReason && <p className="mt-2 text-xs text-bad" dir="auto">{take.rejectionReason}</p>}
      {failed.length > 0 && <ul className="mt-2 space-y-0.5 text-[11px] text-warn">{failed.map((c) => <li key={c.name}>{c.name}: {String(c.value ?? '')} {c.threshold ? `(${c.threshold})` : ''} {c.detail ?? ''}</li>)}</ul>}
      {take.prompt && <Details summary={<span className="text-[11px]">{T('gen.prompt')}</span>} className="mt-2"><p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted" dir="auto">{take.prompt}</p></Details>}
    </Details>
  );
}
