'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production, Scene, Shot } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, castOf, locationById, shotHref, shotLabel } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Badge, Button, Menu, MenuItem, MenuLink, Modal, Notice, Status, Thumb } from '@/components/ui/kit';
import { JobButton } from '@/components/ui/jobs';
import { ShotFields, emptyShot, type ShotDraft } from '../ShotForm';
import { IconDelete, IconDown, IconDrag, IconDuplicate, IconEdit, IconGenerate, IconPlus, IconUp } from '@/components/ui/icons';
import { fmtSeconds, ratioClass, words } from '@/lib/format';

/** STORYBOARD — the shots as pictures, scene by scene. Drag to reorder within a scene; open one to edit it. */
export function StoryboardTab({ p }: { p: Production }) {
  const T = useT();
  const { act } = useStudio();
  const toast = useToast();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const counts = { planned: p.shots.length, framed: p.shots.filter((s) => s.openingFrameAssetId).length, filmed: p.shots.filter((s) => s.takes.length).length, chosen: p.shots.filter((s) => s.selectedTakeId).length };
  const total = p.shots.reduce((a, s) => a + s.durationSeconds, 0);
  if (p.scenes.length === 0) return <Notice title={T('empty.shots')}>{T('empty.shots.hint')} <Link href="?tab=story" className="font-medium text-accent-text hover:underline">{T('tab.story')} →</Link></Notice>;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span><span className="num font-medium text-fg">{counts.planned}</span> {T('board.planned')}</span><span><span className="num font-medium text-fg">{counts.framed}</span> {T('board.framed')}</span><span><span className="num font-medium text-fg">{counts.filmed}</span> {T('board.filmed')}</span><span><span className="num font-medium text-fg">{counts.chosen}</span> {T('board.chosen')}</span><span className="text-faint">·</span><span className="num">{fmtSeconds(total)} {T('misc.of')} {fmtSeconds(p.targetSeconds)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <JobButton type="PLAN_SHOTS" payload={{ productionId: p.id, force: p.shots.some((s) => s.takes.length > 0) }} target={{ productionId: p.id }} size="sm" icon={<IconGenerate />} disabled={!p.scenes.some((sc) => sc.beats.length > 0)} title={!p.scenes.some((sc) => sc.beats.length > 0) ? T('next.writeScript') : undefined} confirm={p.shots.some((s) => s.takes.length > 0) ? T('gen.replanConfirm') : undefined}>{p.shots.length ? T('gen.replanShots') : T('gen.planShots')}</JobButton>
          <AddShot p={p} /></div>
      </div>
      {p.shots.length === 0 && <Notice>{T('empty.shots')} {T('empty.shots.hint')}</Notice>}
      {p.scenes.map((sc) => {
        const shots = p.shots.filter((s) => s.sceneId === sc.id);
        return (
          <section key={sc.id} aria-labelledby={`sb-${sc.id}`}>
            <SceneHeading p={p} sc={sc} count={shots.length} />
            {shots.length === 0 ? <p className="panel border-dashed px-4 py-6 text-center text-sm text-muted">{T('empty.shots')}</p> : (
              <ol className={`grid gap-4 ${p.aspect === 'VERTICAL_9_16' ? 'grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]'}`} onDragOver={(e) => e.preventDefault()}>
                {shots.map((sh, i) => (
                  <ShotCard key={sh.id} p={p} sh={sh} first={i === 0} last={i === shots.length - 1} dragging={dragging === sh.id} over={over === sh.id && dragging !== sh.id}
                    onDragStart={() => setDragging(sh.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onDragOver={() => setOver(sh.id)}
                    onDrop={() => { if (dragging && dragging !== sh.id) act('reorderShot', p.id, dragging, sh.id); setDragging(null); setOver(null); }} />
                ))}
                {dragging && <li className={`rounded-xl border-2 border-dashed ${over === `end-${sc.id}` ? 'border-accent' : 'border-line'} min-h-16`} onDragOver={(e) => { e.preventDefault(); setOver(`end-${sc.id}`); }} onDrop={() => { if (dragging) act('reorderShot', p.id, dragging, null); setDragging(null); setOver(null); }} aria-hidden />}
              </ol>
            )}
          </section>
        );
      })}
      <p className="text-xs text-faint">{T('board.dragHint')}</p>
      {p.shots.length > 0 && p.stage === 'STORYBOARD' && <Button size="sm" onClick={() => { act('markStepDone', p.id, 'STORYBOARD'); toast.ok(T('toast.saved')); }}>{T('btn.markDone')}</Button>}
    </div>
  );
}

function SceneHeading({ p, sc, count }: { p: Production; sc: Scene; count: number }) {
  const T = useT(); const { state } = useStudio();
  const loc = locationById(state, sc.locationId);
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-2">
      <h3 id={`sb-${p.id}-${sc.id}`} className="h3"><span className="badge badge-accent me-2">{T('label.scene')} {sc.number}</span><span dir="auto">{sc.title}</span></h3>
      <span className="text-xs text-faint">{loc ? loc.name : '—'} · {words(sc.timeOfDay)} · {count} {T('board.shotsIn')}</span>
    </div>
  );
}

function ShotCard({ p, sh, first, last, dragging, over, onDragStart, onDragEnd, onDragOver, onDrop }: { p: Production; sh: Shot; first: boolean; last: boolean; dragging: boolean; over: boolean; onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const frame = assetById(state, sh.openingFrameAssetId);
  const take = sh.takes.find((t) => t.id === sh.selectedTakeId);
  const cast = castOf(state, p).filter((c) => sh.characterIds.includes(c.id));
  const href = shotHref(p, sh.id);
  return (
    <li draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={(e) => { e.preventDefault(); onDragOver(); }} onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={`tile relative ${dragging ? 'opacity-40' : ''} ${over ? 'ring-2 ring-[var(--ring)] border-accent' : ''}`}>
      <Link href={href} className="flex flex-1 flex-col outline-none">
        <div className={`tile-cover ${ratioClass(p.aspect)} bg-media`}>
          <Thumb src={frame?.src} alt={`${T('label.shot')} ${shotLabel(p, sh)}`} ratio="h-full" className="h-full rounded-none" empty={T('board.noFrame')} />
          <span className="absolute start-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-latin text-xs font-semibold text-white backdrop-blur-sm">{shotLabel(p, sh)}</span>
          <span className="absolute bottom-2 end-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white backdrop-blur-sm num">{fmtSeconds(sh.durationSeconds)}</span>
        </div>
        <div className="tile-body">
          <p className="tile-title text-sm" dir="auto">{sh.purpose || sh.action || '—'}</p>
          <p className="tile-meta"><span>{words(sh.framing)}</span>{sh.cameraMove !== 'STATIC' && <span>{words(sh.cameraMove)}</span>}{cast.length > 0 && <span dir="auto">{cast.map((c) => c.name).join(', ')}</span>}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            {take ? <Status tone="ok">{T('board.chosen')}</Status> : sh.takes.length ? <Status tone="warn">{sh.takes.length} {T('label.takes').toLowerCase()}</Status> : frame ? <Status tone="info">{T('board.framed')}</Status> : <Status>{T('board.planned')}</Status>}
            {sh.dialogue.length > 0 && <Badge>{sh.dialogue.length} {T('story.lines')}</Badge>}
          </div>
        </div>
      </Link>
      <span className="card-tools absolute end-1 top-1 flex items-center gap-0.5 rounded-lg bg-black/40 backdrop-blur-sm">
        <span className="hidden cursor-grab p-1 text-white/80 sm:inline-flex" title={T('board.dragHint')}><IconDrag className="size-4" /></span>
        <Menu label={`${T('label.shot')} ${shotLabel(p, sh)}: ${T('nav.more')}`} className="[&>summary]:text-white [&>summary:hover]:bg-white/20">
          <MenuLink href={href} icon={<IconEdit />}>{T('board.editShot')}</MenuLink>
          <MenuItem icon={<IconUp />} disabled={first} onClick={() => act('moveShot', p.id, sh.id, -1)}>{T('btn.moveUp')}</MenuItem>
          <MenuItem icon={<IconDown />} disabled={last} onClick={() => act('moveShot', p.id, sh.id, 1)}>{T('btn.moveDown')}</MenuItem>
          <MenuItem icon={<IconDuplicate />} onClick={() => { act('duplicateShot', p.id, sh.id); toast.ok(T('toast.created')); }}>{T('btn.duplicate')}</MenuItem>
          <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(T('shot.deleteConfirm'))) { act('deleteShot', p.id, sh.id); toast.ok(T('toast.deleted')); } }}>{T('btn.delete')}</MenuItem>
        </Menu>
      </span>
    </li>
  );
}

export function AddShot({ p, sceneId, variant = 'primary' }: { p: Production; sceneId?: string; variant?: 'primary' | 'secondary' }) {
  const T = useT(); const { act } = useStudio(); const toast = useToast();
  const [draft, setDraft] = useState<ShotDraft>(() => emptyShot(sceneId ?? p.scenes[p.scenes.length - 1]?.id ?? ''));
  return (
    <Modal size="lg" title={T('btn.addShot')} trigger={(open) => <Button size="sm" variant={variant} icon={<IconPlus />} disabled={p.scenes.length === 0} onClick={() => { setDraft(emptyShot(sceneId ?? p.scenes[p.scenes.length - 1]?.id ?? '')); open(); }}>{T('btn.addShot')}</Button>}>
      {(close) => (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!draft.sceneId) return; act('addShot', p.id, draft); toast.ok(T('toast.created')); close(); }}>
          <ShotFields p={p} draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} showScene />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary">{T('btn.add')}</Button></div>
        </form>
      )}
    </Modal>
  );
}
