'use client';

import { useState } from 'react';
import type { Character } from '@/domain/types';
import { useJobsFor, useStudio } from '@/studio/store';
import { api } from '@/studio/api';
import { assetById, primaryImageOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Dropzone, Field, Modal, Status, Textarea } from '@/components/ui/kit';
import { ImagePreview } from '@/components/ui/preview';
import { FailureNotice, useErrorCopy } from '@/components/ui/progress';
import { useStartJob } from '@/components/ui/jobs';
import { IconCheck, IconGenerate, IconImageAdd, IconShield } from '@/components/ui/icons';
import { fmtBytes, fmtDate } from '@/lib/format';
import { CharacterImage, FramePhase } from './CharacterImage';
import { approval, canRedraw, imageJobs, imageKindOf, statusWords, type IdentityStatus } from './identity';
import { checkImageDims, checkImageFile, measureImage, refusalReasons } from './create/preflight';

/** THE MAIN IMAGE AND ITS STATE — the canonical front full-body image as the profile's hero, and under it, said
 *  once, where it stands: Draft — awaiting your approval (Approve, Redraw), Approved (Redraw), Locked: used in N videos
 *  (the reason, and nothing to press), or no image yet (Draw). A drawing in progress shows the worker's own phase in
 *  the frame; a failed one says why, with Draw again. Approving a draft whose check failed asks for the reason. */
export function ImagePanel({ c, s }: { c: Character; s: IdentityStatus }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const copyOf = useErrorCopy();
  const { start, busy } = useStartJob();
  const jobs = useJobsFor({ characterId: c.id, type: 'CHARACTER_APPEARANCE' });
  const { running, failed } = imageJobs(c, jobs);
  const image = assetById(state, primaryImageOf(c));
  const words = statusWords(s);
  const ok = approval(s, Boolean(running));
  const [reason, setReason] = useState<string | null>(null);
  const approve = (why?: string) => {
    if (s.version === undefined) return;
    try { act('approveCanonicalImage', c.id, s.version, why ? { override: true, reason: why } : {}); toast.ok(T('cast.image.approved')); setReason(null); } catch (e) { toast.bad((e as Error).message); }
  };
  const draw = () => void start('CHARACTER_APPEARANCE', { characterId: c.id }, { quiet: true });
  const phase = running ? `${running.progress?.phase ? `${T.dyn(`jp.${running.progress.phase}`)} · ` : ''}${running.progress?.message || T('cast.image.drawing')}` : null;

  return (
    <figure className="min-w-0">
      <CharacterImage src={image?.src} kind={image ? imageKindOf(c) : 'NONE'} name={c.name} unavailable={image?.unavailable} alt={T('cast.image.alt').replace('{name}', c.name)} className="w-full" placeholder={running ? T('cast.image.drawing') : undefined}>
        {phase && <FramePhase>{phase}</FramePhase>}
      </CharacterImage>
      <figcaption className="mt-4 space-y-3">
        {s.kind === 'LOCKED' ? (
          <div id="identity-lock" role="note" className="flex items-start gap-2.5">
            <IconShield aria-hidden className="mt-0.5 size-3.5 flex-none text-muted" />
            <div className="min-w-0 text-[13px] leading-5">
              <p className="font-semibold text-fg">{T(words.long).replace('{n}', String(s.videos))}</p>
              <p className="mt-0.5 text-muted">{s.lock.reason === 'UNKNOWN' ? T('cast.lock.unknownWhy') : T('cast.lock.usedWhy')}</p>
              {s.lock.videos.length > 0 && <a href="#productions" className="mt-1 inline-block font-medium text-muted underline-offset-2 hover:text-fg hover:underline">{T('char.lock.seeUsage')}</a>}
            </div>
          </div>
        ) : (
          <div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Status tone={words.tone === 'warn' ? 'warn' : words.tone === 'ok' ? 'ok' : 'neutral'} className="!text-[13px]">{T(words.long)}</Status>
              {s.version !== undefined && <span className="num text-xs text-faint">{T('cast.image.version')} {s.version}{s.approvedAt && s.kind === 'APPROVED' ? ` · ${fmtDate(s.approvedAt, T.locale)}` : ''}</span>}
            </p>
            {s.kind === 'NONE' && <p className="mt-1 text-[13px] leading-5 text-muted">{s.legacyPortrait ? T('cast.image.legacyHint') : T('cast.image.noneHint')}</p>}
            {s.kind === 'DRAFT' && <p className="mt-1 text-[13px] leading-5 text-muted">{T('cast.image.draftHint')}</p>}
            {s.checkFailed && <p className="mt-2 text-[13px] leading-5 text-warn" dir="auto">{T('cast.image.checkFailed')}{s.checkNotes.length ? `: ${s.checkNotes.join(' · ')}` : ''}</p>}
          </div>
        )}

        {failed && canRedraw(s) && <FailureNotice copy={copyOf(failed.error)} jobId={failed.id} action={<Button size="sm" variant="secondary" icon={<IconGenerate />} loading={busy} onClick={draw}>{T('char.create.drawAgain')}</Button>} />}

        {canRedraw(s) && reason === null && (
          <div className="flex flex-wrap items-center gap-2">
            {s.kind === 'DRAFT' && <Button variant="primary" icon={<IconCheck />} disabled={!ok.can} aria-describedby={!ok.can ? 'approve-why' : undefined} onClick={() => (ok.needsOverride ? setReason('') : approve())}>{T('cast.image.approve')}</Button>}
            {s.kind === 'NONE'
              ? !running && <Button variant="primary" icon={<IconGenerate />} loading={busy} onClick={draw}>{T('cast.image.draw')}</Button>
              : !running && <RedrawDialog c={c} />}
            {s.kind === 'DRAFT' && ok.block === 'DRAWING' && <p id="approve-why" className="basis-full text-xs text-faint">{T('cast.image.waitDrawing')}</p>}
          </div>
        )}
        {reason !== null && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) approve(reason.trim()); }}>
            <Field label={T('cast.image.overrideLabel')} help={T('cast.image.overrideHelp')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} autoFocus /></Field>
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" icon={<IconCheck />} disabled={!reason.trim()}>{T('cast.image.approveAnyway')}</Button><Button variant="quiet" onClick={() => setReason(null)}>{T('btn.cancel')}</Button></div>
          </form>
        )}
      </figcaption>
    </figure>
  );
}

/** Redraw, in a dialog that says what happens (a new version, DRAFT until approved; the current image is kept as a
 *  previous version and never shown) and can take a reference picture to guide the look (checked in the browser,
 *  then by the server). */
export function RedrawDialog({ c }: { c: Character }) {
  const T = useT();
  return (
    <Modal title={T('cast.redraw.title')} description={T('cast.redraw.lead')} trigger={(open) => <Button variant="secondary" icon={<IconGenerate />} onClick={open}>{T('cast.image.redraw')}</Button>}>
      {(close) => <RedrawForm c={c} close={close} />}
    </Modal>
  );
}

function RedrawForm({ c, close }: { c: Character; close: () => void }) {
  const T = useT();
  const { state, act, refresh, removeAsset } = useStudio();
  const { start, busy: starting } = useStartJob();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = assetById(state, c.pendingReference?.assetId);
  const addReference = async (file: File) => {
    setError(null);
    const refuse = checkImageFile(file);
    if (refuse) { setError(refuse === 'TYPE' ? T('char.create.img.type') : `${T('char.create.img.size')} (${fmtBytes(file.size)})`); return; }
    try { const d = await measureImage(file); if (checkImageDims(d.width, d.height)) { setError(`${T('char.create.img.minSide')} (${d.width} × ${d.height})`); return; } } catch { setError(T('char.create.img.type')); return; }
    setBusy(true);
    const previous = c.pendingReference?.assetId;
    try {
      const r = await api.uploadReference(file, { label: `${c.name} — ${T('char.ref.label')}`, tags: ['character', 'reference upload'] });
      await refresh();
      if (r.validation && !r.validation.ok) { setError(`${T('char.create.img.refused')}: ${refusalReasons(r.validation.reasons).map((x) => T.dyn(`char.create.img.reason.${x}`, x)).join(' · ')}`); await removeAsset(r.asset.id); return; }
      act('setPendingReference', c.id, r.asset.id, r.validation);
      if (previous) await removeAsset(previous);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const removeReference = async () => { const id = c.pendingReference?.assetId; act('setPendingReference', c.id, undefined); if (id) await removeAsset(id); };
  const draw = async () => { const job = await start('CHARACTER_APPEARANCE', { characterId: c.id }, { quiet: true }); if (job) close(); };
  return (
    <div className="space-y-5">
      <div>
        <p className="label">{T('cast.redraw.reference')} <span className="font-normal text-faint">· {T('wizard.optional')}</span></p>
        {pending
          ? <div className="max-w-[12rem]"><ImagePreview src={pending.src} alt={T('char.ref.yours')} fileName={pending.label} width={pending.width} height={pending.height} bytes={pending.bytes} unavailable={pending.unavailable} onReplace={(f) => void addReference(f)} onRemove={() => void removeReference()} busy={busy} /></div>
          : <Dropzone label={T('char.ref.upload')} hint={T('cast.picture.rules')} accept="image/png,image/jpeg,image/webp" icon={<IconImageAdd />} busy={busy} onFile={(f) => void addReference(f)} error={error} row />}
        {pending && error && <p role="alert" className="help text-bad">{error}</p>}
        <p className="help">{pending ? T('cast.redraw.withReference') : T('cast.redraw.fromDescription')}</p>
      </div>
      <div className="sheet-actions flex justify-end gap-2"><Button variant="quiet" onClick={close}>{T('btn.cancel')}</Button><Button variant="primary" icon={<IconGenerate />} loading={starting} disabled={busy} onClick={() => void draw()}>{T('cast.redraw.go')}</Button></div>
    </div>
  );
}
