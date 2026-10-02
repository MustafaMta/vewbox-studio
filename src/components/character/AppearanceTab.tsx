'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Character } from '@/domain/types';
import { CHARACTER_REF_ROLES, type CharacterRefRole } from '@/domain/vocabulary';
import { isActiveStatus } from '@/domain/jobs';
import { useJobsFor, useStudio } from '@/studio/store';
import { api } from '@/studio/api';
import { assetById } from '@/studio/selectors';
import type { AppearanceLock } from '@/domain/rules';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Dropzone, Select, Spinner } from '@/components/ui/kit';
import { Art, Block, Empty } from '@/components/ui/cinema';
import { ImagePair, ImagePreview, ResultSlot } from '@/components/ui/preview';
import { FailureNotice, RecoveryAction, useErrorCopy } from '@/components/ui/progress';
import { JobButton, useStartJob } from '@/components/ui/jobs';
import { IconArrowRight, IconCheck, IconDelete, IconGenerate, IconImageAdd, IconRetry, IconShield, IconUpload } from '@/components/ui/icons';
import { checkImageDims, checkImageFile, measureImage } from './create/preflight';
import { fmtBytes } from '@/lib/format';

/** The identity sheet, in a fixed order; FACE is the crop the portrait rests on, OUTFIT is a wardrobe variant. */
export const SHEET_VIEWS: CharacterRefRole[] = ['FRONT', 'THREE_QUARTER', 'SIDE', 'BACK', 'FULL_BODY', 'EXPRESSION'];
/** The ROLE is the view a tile stands for; `ref.view` is provenance (how it was drawn: 'SHEET_TILE' for a tile
 *  cut from the identity sheet, 'FACE' for the crop, else the view name) and never decides where a tile sits. */
const viewOf = (r: Character['refs'][number]): string => r.role;

/** APPEARANCE — the portrait beside the generate card with the reference → result pair; the running job's phase
 *  sits in the result frame where the eye waits, a failure sits there with its one recovery action, and a picture
 *  appears there only when the studio drew one. Then the reference sheet as tiles in a fixed order, each with
 *  "Redraw this view"; then the other views and outfits. A locked character keeps every control visible and
 *  disabled, with the reason beside them. */
export function AppearanceTab({ c, lock }: { c: Character; lock: AppearanceLock }) {
  const T = useT();
  const { state, act, removeAsset, refresh } = useStudio();
  const toast = useToast();
  const { start } = useStartJob();
  const copyOf = useErrorCopy();
  const [role, setRole] = useState<CharacterRefRole>('FRONT');
  const [busy, setBusy] = useState<'ref' | 'view' | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const portrait = assetById(state, c.portraitAssetId);
  const pending = assetById(state, c.pendingReference?.assetId);
  const hasAppearance = Boolean(c.portraitAssetId);
  const lookJobs = useJobsFor({ characterId: c.id, type: 'CHARACTER_APPEARANCE' });
  const activeLook = lookJobs.find((j) => isActiveStatus(j.status));
  const lastLook = lookJobs[0];
  const drawn = portrait && !portrait.unavailable && portrait.origin === 'GENERATED' ? portrait : undefined;

  /** The reference is checked in the browser (type, size, 512 px) and then by the server (`purpose: 'character-reference'`). */
  const addReference = async (file: File) => {
    setRefError(null);
    const refuse = checkImageFile(file);
    if (refuse) { setRefError(refuse === 'TYPE' ? T('char.create.img.type') : `${T('char.create.img.size')} (${fmtBytes(file.size)})`); return; }
    try { const d = await measureImage(file); if (checkImageDims(d.width, d.height)) { setRefError(`${T('char.create.img.minSide')} (${d.width} × ${d.height})`); return; } } catch { setRefError(T('char.create.img.type')); return; }
    setBusy('ref');
    const previous = c.pendingReference?.assetId;
    try {
      const r = await api.uploadReference(file, { label: `${c.name} — ${T('char.ref.label')}`, tags: ['character', 'reference upload'] });
      await refresh();
      if (r.validation && !r.validation.ok) { setRefError(`${T('char.create.img.refused')}: ${r.validation.reasons.map((x) => T.dyn(`char.create.img.reason.${x}`, x)).join(' · ')}`); await removeAsset(r.asset.id); return; }
      act('setPendingReference', c.id, r.asset.id);
      if (previous) await removeAsset(previous);
      toast.ok(previous ? T('char.ref.replaced') : T('char.ref.added'));
    } catch (e) { setRefError((e as Error).message); }
    finally { setBusy(null); }
  };
  const removeReference = async () => { const id = c.pendingReference?.assetId; act('setPendingReference', c.id, undefined); if (id) await removeAsset(id); toast.ok(T('char.ref.removed')); };
  const addView = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.bad(T('char.ref.notImage')); return; }
    setBusy('view');
    try {
      const asset = await api.upload(file, { label: `${c.name} — ${T.dyn(`char.view.${role}`)}`, tags: ['character', 'reference'], expect: 'IMAGE' });
      await refresh();
      act('updateCharacter', c.id, { refs: [...c.refs, { id: `ref-${asset.id}`, role, assetId: asset.id }], portraitAssetId: c.portraitAssetId ?? asset.id });
      toast.ok(T('media.added'));
    } catch (e) { toast.bad((e as Error).message); }
    finally { setBusy(null); }
  };

  const sheet = SHEET_VIEWS.map((v) => ({ view: v, ref: c.refs.find((r) => viewOf(r) === v) }));
  const others = c.refs.filter((r) => !SHEET_VIEWS.includes(viewOf(r) as CharacterRefRole) && r.assetId !== c.portraitAssetId);

  const tileTools = (r: Character['refs'][number]) => !lock.locked && (
    <span className="card-tools absolute bottom-2 end-2 flex gap-1">
      {c.portraitAssetId !== r.assetId && <button type="button" className="btn btn-secondary btn-xs" onClick={() => act('updateCharacter', c.id, { portraitAssetId: r.assetId })}><IconCheck />{T('char.setPortrait')}</button>}
      <button type="button" className="btn btn-secondary btn-xs btn-icon" aria-label={`${T('btn.remove')} ${T.dyn(`char.view.${viewOf(r)}`)}`} onClick={() => act('updateCharacter', c.id, { refs: c.refs.filter((x) => x.id !== r.id) })}><IconDelete /></button>
    </span>
  );

  /** The result frame: the live phase, the failure with its action, the drawn portrait, or honest words. */
  const result = activeLook
    ? <ResultSlot tone="busy" icon={<Spinner className="size-5" />}>{activeLook.progress?.message || T('jobs.inProgress')}{activeLook.progress?.step && activeLook.progress.total ? ` · ${activeLook.progress.step}/${activeLook.progress.total}` : ''}</ResultSlot>
    : lastLook?.status === 'FAILED' && (!drawn || drawn.jobId !== lastLook.id) && !lock.locked
      ? <div className="space-y-2"><ResultSlot tone="bad">{copyOf(lastLook.error).title}</ResultSlot><FailureNotice copy={copyOf(lastLook.error)} jobId={lastLook.id} action={<RecoveryAction copy={copyOf(lastLook.error)} onRetry={() => void start('CHARACTER_APPEARANCE', { characterId: c.id })} jobId={lastLook.id} custom={{ reference: <span className="text-[12.5px] text-muted">{T('char.ref.needReference')}</span>, usage: <Link href={`/characters/${c.id}?tab=used`} className="btn btn-secondary btn-sm">{T('char.lock.seeUsage')}</Link> }} />} /></div>
      : drawn
        ? <ImagePreview src={drawn.src} alt={T('char.ref.result')} fileName={drawn.label} width={drawn.width} height={drawn.height} bytes={drawn.bytes} caption={T('char.appearance.current')} />
        : <ResultSlot icon={<IconGenerate />}>{T('char.ref.resultNone')}</ResultSlot>;

  return (
    <div className="space-y-10">
      <section aria-labelledby="look-h" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <h2 id="look-h" className="section-title mb-3">{T('char.appearance')}</h2>
          <div className="max-w-sm"><Art src={portrait?.src} alt={c.name} ratio="portrait" title={hasAppearance ? c.name : T('char.noAppearance')} sample={portrait?.sample} unavailable={portrait?.unavailable} /></div>
          <p className="mt-2 text-[12px] text-faint">{hasAppearance ? (portrait?.sample ? T('char.appearance.sample') : portrait?.origin === 'UPLOAD' ? T('char.appearance.uploaded') : T('char.appearance.current')) : T('char.noAppearance.hint')}</p>
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="section-title">{hasAppearance ? T('char.regenerate.title') : T('char.generate.title')}</h2>
          <p className="mt-1 text-[13px] text-muted">{T('char.generate.lead')}</p>
          {lock.locked && (
            <div role="note" id="appearance-lock" className="mt-4 flex items-start gap-3 rounded-xl border border-violet-500/40 bg-primary/[0.05] p-3">
              <span aria-hidden className="grid size-8 flex-none place-items-center rounded-lg bg-accent-soft text-violet-300 [&>svg]:size-4"><IconShield /></span>
              <div className="min-w-0 text-[12.5px]">
                <p className="font-semibold text-fg">{lock.reason === 'USED' ? T('char.lock.used') : T('char.lock.unknown')}</p>
                <p className="mt-0.5 text-muted">{T('char.lock.hint')}</p>
                {lock.videos.length > 0 && <p className="mt-1 text-body" dir="auto">{lock.videos.slice(0, 3).map((v) => `${v.productionTitle} · ${T('label.shot')} ${v.shotLabel}`).join(' · ')}{lock.videos.length > 3 ? ` +${lock.videos.length - 3}` : ''}</p>}
                <Link href={`/characters/${c.id}?tab=used`} className="mt-1 inline-flex items-center gap-1 font-medium text-violet-300 hover:underline">{T('char.lock.seeUsage')}<IconArrowRight aria-hidden className="size-3.5 rtl:rotate-180" /></Link>
              </div>
            </div>
          )}
          <div className="mt-4">
            <ImagePair
              reference={pending && !lock.locked
                ? <ImagePreview src={pending.src} alt={T('char.ref.yours')} fileName={pending.label} width={pending.width} height={pending.height} bytes={pending.bytes} unavailable={pending.unavailable} onReplace={(f) => void addReference(f)} onRemove={() => void removeReference()} busy={busy === 'ref'} caption={T('char.ref.kept')} />
                : <Dropzone label={T('char.ref.upload')} hint={lock.locked ? T('char.lock.short') : T('char.ref.uploadHint')} accept="image/png,image/jpeg,image/webp" icon={<IconImageAdd />} disabled={lock.locked} busy={busy === 'ref'} onFile={(f) => void addReference(f)} error={refError} />}
              result={result} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
            {lock.locked
              ? <Button variant="primary" icon={<IconGenerate />} disabled aria-describedby="appearance-lock">{hasAppearance ? T('char.regenerate') : T('char.generate')}</Button>
              : <><JobButton type="CHARACTER_APPEARANCE" payload={{ characterId: c.id }} target={{ characterId: c.id }} variant="primary" icon={<IconGenerate />}>{hasAppearance ? (pending ? T('char.regenerateFromRef') : T('char.regenerate')) : (pending ? T('char.generateFromRef') : T('char.generate'))}</JobButton>
                {hasAppearance && <JobButton type="CHARACTER_REFS" payload={{ characterId: c.id }} target={{ characterId: c.id }} variant="secondary" icon={<IconImageAdd />}>{T('gen.refs')}</JobButton>}</>}
          </div>
        </div>
      </section>

      <Block title={T('char.sheet.title')} count={sheet.filter((s) => s.ref).length} description={T('char.sheet.hint')}
        actions={!lock.locked && <div className="flex flex-wrap items-center gap-2"><Select aria-label={T('char.viewKind')} value={role} onChange={(e) => setRole(e.target.value as CharacterRefRole)} options={CHARACTER_REF_ROLES.map((r) => ({ value: r, label: T.dyn(`char.view.${r}`) }))} className="w-auto" /><label className="btn btn-secondary btn-sm cursor-pointer" aria-busy={busy === 'view' || undefined}><IconUpload aria-hidden />{T('char.addView')}<input type="file" accept="image/*" className="sr-only" aria-label={T('char.addView')} onChange={(e) => { const f = e.target.files?.[0]; if (f) void addView(f); e.target.value = ''; }} /></label></div>}>
        {!hasAppearance ? <Empty compact title={T('empty.references')} hint={T('char.sheet.needPortrait')} /> : (
          <ul className="grid-portraits">
            {sheet.map(({ view, ref }) => {
              const a = assetById(state, ref?.assetId);
              return (
                <li key={view} className="poster-card group relative">
                  {ref ? <Art src={a?.src} ratio="portrait" title={T.dyn(`char.view.${view}`)} sample={a?.sample} unavailable={a?.unavailable}>{tileTools(ref)}</Art>
                    : <div className="poster grid aspect-[4/5] place-items-center border-dashed p-3 text-center text-[12px] text-faint">{T('char.view.notDrawn')}</div>}
                  <p className="poster-title text-sm">{T.dyn(`char.view.${view}`)}{ref && c.portraitAssetId === ref.assetId && <span className="ms-2 text-[12px] font-medium text-accent">{T('label.portrait')}</span>}</p>
                  <div className="mt-1.5"><RedrawView c={c} view={view} exists={Boolean(ref)} locked={lock.locked} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </Block>
      {others.length > 0 && (
        <Block title={T('char.outfits')} count={others.length}>
          <ul className="grid-portraits">
            {others.map((r) => { const a = assetById(state, r.assetId); return <li key={r.id} className="poster-card group relative"><Art src={a?.src} ratio="portrait" title={T.dyn(`char.view.${viewOf(r)}`)} sample={a?.sample} unavailable={a?.unavailable}>{tileTools(r)}</Art><p className="poster-title text-sm">{T.dyn(`char.view.${viewOf(r)}`)}</p></li>; })}
          </ul>
        </Block>
      )}
    </div>
  );
}

/** "Redraw this view" — a CHARACTER_REFS job for that one view (`roles: [view]`); the tile shows the job's own phase. */
function RedrawView({ c, view, exists, locked }: { c: Character; view: CharacterRefRole; exists: boolean; locked: boolean }) {
  const T = useT();
  const { start, busy } = useStartJob();
  const { retryJob } = useStudio();
  const copyOf = useErrorCopy();
  const mine = useJobsFor({ characterId: c.id, type: 'CHARACTER_REFS' }).filter((j) => Array.isArray(j.payload.roles) && (j.payload.roles as string[]).length === 1 && (j.payload.roles as string[])[0] === view);
  const active = mine.find((j) => isActiveStatus(j.status));
  const last = mine[0];
  if (locked) return <Button size="xs" variant="ghost" icon={<IconGenerate />} disabled aria-describedby="appearance-lock">{exists ? T('char.view.redraw') : T('char.view.draw')}</Button>;
  if (active) return <span className="status status-info status-live text-[11.5px]"><Spinner className="me-1 size-3" />{active.progress?.message || T('jobs.inProgress')}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Button size="xs" variant="ghost" icon={<IconGenerate />} loading={busy} onClick={() => void start('CHARACTER_REFS', { characterId: c.id, roles: [view] }, { quiet: true })}>{exists ? T('char.view.redraw') : T('char.view.draw')}</Button>
      {last?.status === 'FAILED' && <span className="inline-flex items-center gap-1 text-[11.5px] text-bad" title={last.error?.message}><span className="max-w-[9rem] truncate">{copyOf(last.error).title}</span><button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => void retryJob(last.id)}><IconRetry className="inline size-3" /> {T('jobs.retry')}</button></span>}
    </span>
  );
}
