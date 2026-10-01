'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production, Shot } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, shotHref, shotLabel } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Notice, SampleMark, Segmented, Status, Thumb } from '@/components/ui/kit';
import { LaterButton } from '@/components/ui/later';
import { VideoPlayer } from '@/components/players/VideoPlayer';
import { IconCheck, IconFrame, IconTake } from '@/components/ui/icons';
import { fmtSeconds, ratioClass, ratioCss } from '@/lib/format';

/** PRODUCE — frames and takes for every shot, and the one choice that matters: which take goes into the cut.
 *  The takes here are sample clips: this is the layout, working, without a render behind it. */
export function ProduceTab({ p }: { p: Production }) {
  const T = useT();
  const { act } = useStudio();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'open' | 'chosen'>('all');
  const shots = p.shots.filter((s) => filter === 'all' || (filter === 'chosen' ? Boolean(s.selectedTakeId) : !s.selectedTakeId));
  const chosen = p.shots.filter((s) => s.selectedTakeId).length;
  if (p.shots.length === 0) return <Notice title={T('empty.shots')}>{T('empty.shots.hint')} <Link href="?tab=storyboard" className="font-medium text-accent-text hover:underline">{T('tab.storyboard')} →</Link></Notice>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{T('produce.lead')} <span className="num font-medium text-fg">{chosen}/{p.shots.length}</span> {T('produce.shotsReady')}.</p>
        <Segmented label={T('label.status')} value={filter} onChange={setFilter} options={[{ value: 'all', label: T('label.all') }, { value: 'open', label: T('produce.chooseTake') }, { value: 'chosen', label: T('board.chosen') }]} />
      </div>
      {p.shots.some((s) => s.takes.length) && <p className="text-xs text-faint">{T('produce.sampleNote')}</p>}
      <ol className="space-y-4">{shots.map((sh) => <ShotRow key={sh.id} p={p} sh={sh} onSelect={(id) => { act('selectTake', p.id, sh.id, id); if (id) toast.ok(T('toast.takeSelected')); }} />)}</ol>
      {chosen === p.shots.length && p.stage === 'PRODUCE' && <Button onClick={() => { act('markStepDone', p.id, 'PRODUCE'); toast.ok(T('toast.saved')); }}>{T('btn.markDone')}</Button>}
    </div>
  );
}

function ShotRow({ p, sh, onSelect }: { p: Production; sh: Shot; onSelect: (takeId: string | undefined) => void }) {
  const T = useT();
  const { state } = useStudio();
  const [preview, setPreview] = useState<string | null>(null);
  const opening = assetById(state, sh.openingFrameAssetId); const ending = assetById(state, sh.endingFrameAssetId);
  const selected = sh.takes.find((t) => t.id === sh.selectedTakeId);
  const shown = sh.takes.find((t) => t.id === (preview ?? sh.selectedTakeId));
  const shownAsset = assetById(state, shown?.assetId);
  const ratio = ratioClass(p.aspect);
  const vertical = p.aspect === 'VERTICAL_9_16';
  return (
    <li className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href={shotHref(p, sh.id)} className="font-latin text-sm font-semibold hover:text-accent-text">{shotLabel(p, sh)}</Link>
        <span className="min-w-0 flex-1 truncate text-sm" dir="auto">{sh.purpose || sh.action}</span>
        <span className="num text-xs text-muted">{fmtSeconds(sh.durationSeconds)}</span>
        {selected ? <Status tone="ok">{T('produce.selectedTake')}: {selected.label}</Status> : sh.takes.length ? <Status tone="warn">{T('produce.chooseTake')}</Status> : <Status>{T('produce.noTakes')}</Status>}
      </div>
      <div className={`grid gap-4 ${vertical ? 'lg:grid-cols-[minmax(0,14rem)_1fr]' : 'lg:grid-cols-[minmax(0,28rem)_1fr]'}`}>
        <div>
          {shownAsset ? <VideoPlayer src={shownAsset.src} poster={shownAsset.poster} title={`${shotLabel(p, sh)} ${shown?.label}`} compact aspect={ratioCss(p.aspect)} className={vertical ? 'mx-auto max-w-[14rem]' : ''} /> : <Thumb src={opening?.src} alt="" ratio={ratio} empty={T('board.noFrame')} className={vertical ? 'mx-auto max-w-[14rem]' : ''} />}
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">{shownAsset ? <span className="flex items-center gap-1.5"><IconTake className="size-3.5" />{shown?.label}{shownAsset.sample && <SampleMark className="!bg-surface-3 !text-muted" />}</span> : <span className="flex items-center gap-1.5"><IconFrame className="size-3.5" />{T('produce.opening')}</span>}{shown?.note && <span className="truncate" dir="auto">{shown.note}</span>}</div>
        </div>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">{T('label.frames')}</p>
            <div className="flex flex-wrap items-start gap-2">
              <figure className="w-24"><Thumb src={opening?.src} alt={T('produce.opening')} ratio={ratio} className="rounded-md" empty="—" /><figcaption className="mt-1 text-[11px] text-muted">{T('produce.opening')}</figcaption></figure>
              <figure className="w-24"><Thumb src={ending?.src} alt={T('produce.ending')} ratio={ratio} className="rounded-md" empty="—" /><figcaption className="mt-1 text-[11px] text-muted">{T('produce.ending')}</figcaption></figure>
              <LaterButton size="xs" icon={<IconFrame />} className="mt-6">{T('produce.prepareFrames')}</LaterButton>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">{T('label.takes')}<span className="ms-1 num text-faint">{sh.takes.length}</span></p>
            <ul className="flex flex-wrap items-start gap-2" role="radiogroup" aria-label={`${shotLabel(p, sh)} ${T('label.takes')}`}>
              {sh.takes.map((t) => {
                const a = assetById(state, t.assetId); const on = sh.selectedTakeId === t.id; const showing = (preview ?? sh.selectedTakeId) === t.id;
                return (
                  <li key={t.id} className="w-24">
                    <button type="button" role="radio" aria-checked={on} aria-label={`${t.label}${on ? ` (${T('btn.selected')})` : ''}`} onClick={() => setPreview(t.id)} onDoubleClick={() => onSelect(t.id)} className={`relative block w-full overflow-hidden rounded-md border-2 transition ${on ? 'border-ok' : showing ? 'border-accent' : 'border-transparent hover:border-line-strong'}`}>
                      <Thumb src={a?.poster ?? a?.src} alt="" ratio={ratio} className="rounded-none" />
                      {on && <span className="absolute end-1 top-1 grid size-4 place-items-center rounded-full bg-ok text-white"><IconCheck className="size-3" /></span>}
                    </button>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[11px]"><span className="truncate">{t.label}</span>{!on && <button type="button" className="font-medium text-accent-text hover:underline" onClick={() => onSelect(t.id)}>{T('btn.select')}</button>}</div>
                  </li>
                );
              })}
              <li className="w-24"><LaterButton size="xs" icon={<IconTake />} className="mt-1 w-full">{sh.takes.length ? T('produce.anotherTake') : T('produce.generateVideo')}</LaterButton></li>
            </ul>
          </div>
        </div>
      </div>
    </li>
  );
}
