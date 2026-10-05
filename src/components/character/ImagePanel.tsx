'use client';

import { useState, type ReactNode } from 'react';
import type { Character } from '@/domain/types';
import { useJobsFor, useStudio } from '@/studio/store';
import { api } from '@/studio/api';
import { assetById } from '@/studio/selectors';
import { redrawsFromEarlierPicture } from '@/domain/identity';
import { derivedFaceReference, faceReferenceProvenance } from '@/domain/face-reference';
import { useToast } from '@/components/ui/toast';
import { Button, Dialog, Dropzone, Field, StateWord, Textarea } from '@/components/ui/kit';
import { ImagePreview } from '@/components/ui/preview';
import { FailureNotice, useErrorCopy } from '@/components/ui/progress';
import { useStartJob } from '@/components/ui/jobs';
import { IconCheck, IconGenerate, IconImageAdd, IconShield } from '@/components/ui/icons';
import { fmtBytes, fmtDate } from '@/lib/format';
import { approval, canRedraw, imageJobs, type IdentityStatus } from './identity';
import { checkImageDims, checkImageFile, measureImage, refusalReasons } from './create/preflight';

/** THE FIGURE'S STATE AND ITS ACTIONS (contract v2 §4), beside the figure: where the canonical image stands, said once
 *  — waiting for your approval (Approve, Redraw), approved (Redraw), locked because it was filmed (the reason, nothing
 *  to press), or no image yet (Draw the image) — then the actions in one row, the page's other actions (`extra`)
 *  after them. A drawing in progress shows its phase in the figure; a failed one says why, with Draw again. Approving a
 *  draft whose automatic check failed asks for the reason (the override), inline. */
export function IdentityBlock({ c, s, extra }: { c: Character; s: IdentityStatus; extra?: ReactNode }) {
  const { act, state } = useStudio();
  const toast = useToast();
  const copyOf = useErrorCopy();
  const { start, busy } = useStartJob();
  const jobs = useJobsFor({ characterId: c.id, type: 'CHARACTER_APPEARANCE' });
  const { running, failed } = imageJobs(c, jobs);
  const ok = approval(s, Boolean(running));
  const [reason, setReason] = useState<string | null>(null);
  const [redraw, setRedraw] = useState(false);
  const approve = (why?: string) => {
    if (s.version === undefined) return;
    try { act('approveCanonicalImage', c.id, s.version, why ? { override: true, reason: why } : {}); toast.ok(`${c.name}’s figure is approved.`); setReason(null); } catch (e) { toast.bad((e as Error).message); }
  };
  const draw = () => void start('CHARACTER_APPEARANCE', { characterId: c.id }, { quiet: true });
  const filmed = s.videos === 1 ? 'Filmed in 1 video' : `Filmed in ${s.videos} videos`;
  const derived = c.canonicalImage ? derivedFaceReference(state.assets, c.canonicalImage.assetId) : undefined;

  return (
    <div className="char-identity">
      <div className="char-state">
        {s.kind === 'LOCKED' ? <span className="state-word" data-tone="idle"><IconShield aria-hidden className="identity-shield" />{s.lock.reason === 'UNKNOWN' ? 'Locked · history not on record' : `Locked · ${filmed.toLowerCase()}`}</span>
          : s.kind === 'APPROVED' ? <StateWord tone="done">Approved</StateWord>
          : s.kind === 'DRAFT' ? <StateWord tone="waiting">Waiting for your approval</StateWord>
          : running ? <StateWord tone="running">Drawing the figure</StateWord>
          : <StateWord tone="idle">{s.legacyPortrait ? 'Only an older portrait' : 'No figure yet'}</StateWord>}
        {s.version !== undefined && <span className="t-meta">Version {s.version}{s.approvedAt && s.kind === 'APPROVED' ? ` · approved ${fmtDate(s.approvedAt)}` : ''}</span>}
      </div>
      {s.kind === 'LOCKED' && <p className="t-body char-note" id="identity-lock">{s.lock.reason === 'UNKNOWN' ? 'Its video history is not on record, so the figure and the voice are kept as if filmed. Name, description, personality and notes stay editable.' : 'The figure and the voice are kept as they were filmed, for continuity. Name, description, personality and notes stay editable.'}{s.lock.videos.length > 0 && <> <a className="link-quiet" href="#appears">See where</a></>}</p>}
      {s.kind === 'DRAFT' && <p className="t-body char-note" data-tone="wait">Check the face, the clothes and the whole figure. Once approved, this image is the character in every shot.</p>}
      {s.kind === 'NONE' && !running && <p className="t-body char-note">{s.legacyPortrait ? 'This character has an older close-up portrait. Draw the full-length figure to give them a canonical identity.' : 'One full-length figure from the front becomes the character’s identity everywhere.'}</p>}
      {s.checkFailed && <p className="t-body char-note" dir="auto">The automatic check flagged this image{s.checkNotes.length ? `: ${s.checkNotes.join(' · ')}` : '.'}</p>}
      {/* a production-only reference derived from this image (a face crop for close shots, FINAL §12): traceable to it,
          never an identity, never in the character's references — said here once, not shown as a second picture */}
      {derived && <p className="t-meta char-derived">Derived · production only: a close-up of the face cut from version {faceReferenceProvenance(derived)?.canonicalVersion ?? s.version} for close shots. <a className="link-quiet" href={`/assets?asset=${encodeURIComponent(derived.id)}`}>See it</a></p>}

      {failed && canRedraw(s) && <div className="char-voice"><FailureNotice copy={copyOf(failed.error)} jobId={failed.id} action={<Button size="sm" variant="secondary" icon={<IconGenerate />} loading={busy} onClick={draw}>Draw again</Button>} /></div>}

      {reason === null ? (
        <div className="char-acts">
          {canRedraw(s) && s.kind === 'DRAFT' && <Button variant="primary" icon={<IconCheck />} disabled={!ok.can} aria-describedby={!ok.can ? 'approve-why' : undefined} onClick={() => (ok.needsOverride ? setReason('') : approve())}>Approve</Button>}
          {canRedraw(s) && s.kind === 'NONE' && !running && <Button variant="primary" icon={<IconGenerate />} loading={busy} onClick={draw}>Draw the figure</Button>}
          {canRedraw(s) && s.kind !== 'NONE' && !running && <Button variant="secondary" icon={<IconGenerate />} onClick={() => setRedraw(true)}>Redraw</Button>}
          {extra}
          {s.kind === 'DRAFT' && ok.block === 'DRAWING' && <p id="approve-why" className="t-meta char-acts-why">Approve once the new drawing has finished.</p>}
        </div>
      ) : (
        <form className="char-override" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) approve(reason.trim()); }}>
          <Field label="Why is it right despite the check?" help="Your reason is recorded with the approval."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} autoFocus /></Field>
          <div className="char-override-acts"><Button variant="quiet" onClick={() => setReason(null)}>Cancel</Button><Button type="submit" variant="primary" icon={<IconCheck />} disabled={!reason.trim()}>Approve anyway</Button></div>
        </form>
      )}
      <RedrawDialog c={c} open={redraw} onClose={() => setRedraw(false)} />
    </div>
  );
}

/** Redraw, in a dialog that says what happens (a new version that waits as a draft; the current image is kept as an
 *  earlier version and not shown) and can take a reference picture to guide the look (checked in the browser, then by
 *  the server). */
export function RedrawDialog({ c, open, onClose }: { c: Character; open: boolean; onClose: () => void }) {
  const { start, busy: starting } = useStartJob();
  const [busy, setBusy] = useState(false);
  const go = async () => { const job = await start('CHARACTER_APPEARANCE', { characterId: c.id }, { quiet: true }); if (job) onClose(); };
  return (
    <Dialog open={open} onClose={onClose} title={`Redraw ${c.name}`} description="A new version is drawn and waits for your approval. The current figure is kept as an earlier version and is not shown." busy={busy}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<IconGenerate />} loading={starting} disabled={busy} onClick={() => void go()}>Redraw</Button></>}>
      {open && <RedrawReference c={c} onBusy={setBusy} busy={busy} />}
    </Dialog>
  );
}

function RedrawReference({ c, busy, onBusy }: { c: Character; busy: boolean; onBusy: (b: boolean) => void }) {
  const { state, act, refresh, removeAsset } = useStudio();
  const [error, setError] = useState<string | null>(null);
  const pending = assetById(state, c.pendingReference?.assetId);
  const add = async (file: File) => {
    setError(null);
    const refuse = checkImageFile(file);
    if (refuse) { setError(refuse === 'TYPE' ? 'Not a usable picture: PNG, JPEG or WebP only.' : `Too large: 20 MB at most (${fmtBytes(file.size)}).`); return; }
    try { const d = await measureImage(file); if (checkImageDims(d.width, d.height)) { setError(`Too small: the shortest side must be at least 512 px (${d.width} × ${d.height}).`); return; } } catch { setError('Not a usable picture: PNG, JPEG or WebP only.'); return; }
    onBusy(true);
    const previous = c.pendingReference?.assetId;
    try {
      const r = await api.uploadReference(file, { label: `${c.name} — reference upload`, tags: ['character', 'reference upload'] });
      await refresh();
      if (r.validation && !r.validation.ok) { setError(`The studio cannot use this picture: ${refusalReasons(r.validation.reasons).join(' · ')}`); await removeAsset(r.asset.id); return; }
      act('setPendingReference', c.id, r.asset.id, r.validation);
      if (previous) await removeAsset(previous);
    } catch (e) { setError((e as Error).message); }
    finally { onBusy(false); }
  };
  const remove = async () => { const id = c.pendingReference?.assetId; act('setPendingReference', c.id, undefined); if (id) await removeAsset(id); };
  return (
    <div className="char-form">
      <div>
        <p className="label">Reference picture <span className="field-optional">optional</span></p>
        {pending
          ? <div className="pc-figure-note"><ImagePreview src={pending.src} alt="Your reference" fileName={pending.label} width={pending.width} height={pending.height} bytes={pending.bytes} unavailable={pending.unavailable} onReplace={(f) => void add(f)} onRemove={() => void remove()} busy={busy} /></div>
          : <Dropzone label="Upload a reference" hint="PNG, JPEG or WebP · at least 512 px on the short side · up to 20 MB" accept="image/png,image/jpeg,image/webp" icon={<IconImageAdd />} busy={busy} onFile={(f) => void add(f)} error={error} row />}
        {pending && error && <p role="alert" className="help text-bad">{error}</p>}
        <p className="help">{pending ? 'The new figure follows this picture; it is not the figure itself.' : redrawsFromEarlierPicture(c) ? 'Without a new picture, the figure is drawn again from the reference this character was made from.' : 'Without a picture, the figure is drawn from the written look.'}</p>
      </div>
    </div>
  );
}
