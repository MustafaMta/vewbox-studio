'use client';

import Link from 'next/link';
import { forwardRef, useState, type FormEvent, type ReactNode } from 'react';
import { Crosshair, Download, X } from 'lucide-react';
import type { CutNote } from '@/domain/types';
import { Skeleton, TabBar, TabPanel } from '@/components/ui/kit';
import { fileSize } from '@/lib/format';
import { clock, shotAt, when, type CutView, type Screening, type SubtitleFile, type TimelineShot } from './model';

/** THE REVIEW PANE (docs/DESIGN-SYSTEM-V5.md §8.12: "review available beside it without dominating") — three tabs:
 *  Notes (the composer and this cut's timecoded notes, B2), Shots (the shots the cut was assembled from, with the take
 *  each one used, B3) and Export (the deliverables, with their subtitle files). Every row is real; an empty tab says so
 *  in one sentence. */

export type PaneTab = 'notes' | 'shots' | 'export';

export function Review({ tab, onTab, cut, sc, notes, loaded, error, time, activeId, onJump, onResolve, onSend, composer }: {
  tab: PaneTab; onTab: (t: PaneTab) => void;
  cut: CutView; sc: Screening;
  notes: CutNote[]; loaded: boolean; error: string | null;
  time: number; activeId: string | null;
  onJump: (t: number, noteId?: string) => void;
  onResolve: (n: CutNote) => void; onSend: (n: CutNote, shot: TimelineShot) => void;
  composer: ReactNode;
}) {
  const open = notes.filter((n) => n.status === 'open').length;
  const tabs = [
    { id: 'notes', label: 'Notes', count: open },
    { id: 'shots', label: 'Shots', count: cut.timeline.length },
    { id: 'export', label: 'Export', count: sc.exports.length },
  ];
  return (
    <aside className="theatre-pane" aria-label="Review" data-lights-dim>
      <div className="theatre-tabs-wrap"><TabBar tabs={tabs} current={tab} onSelect={(id) => onTab(id as PaneTab)} ariaLabel="Review" idBase="review" /></div>
      <TabPanel idBase="review" id="notes" current={tab} className="theatre-panel">
        {composer}
        <NoteList cut={cut} notes={notes} loaded={loaded} error={error} activeId={activeId} onJump={onJump} onResolve={onResolve} onSend={onSend} />
      </TabPanel>
      <TabPanel idBase="review" id="shots" current={tab} className="theatre-panel">
        <ShotList cut={cut} time={time} onJump={onJump} />
      </TabPanel>
      <TabPanel idBase="review" id="export" current={tab} className="theatre-panel">
        <Deliverables sc={sc} cut={cut} />
      </TabPanel>
    </aside>
  );
}

// -------------------------------------------------------------------------------------------------- the composer

export const Composer = forwardRef<HTMLTextAreaElement, {
  time: number; shot?: TimelineShot; cutVersion: number;
  pinMode: boolean; draftPin: { x: number; y: number } | null; onPinMode: (on: boolean) => void; onClearPin: () => void;
  onFocus: () => void; onAdd: (text: string) => Promise<void>;
}>(function Composer({ time, shot, cutVersion, pinMode, draftPin, onPinMode, onClearPin, onFocus, onAdd }, ref) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError(null);
    try { await onAdd(text.trim()); setText(''); } catch (x) { setError((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <form className="theatre-composer" onSubmit={submit} aria-label="New note">
      <label htmlFor="theatre-note-text" className="theatre-composer-at t-label">
        Note at <span className="t-ro">{clock(time)}</span>{shot ? <> · shot {shot.label}</> : null} · cut {cutVersion}
      </label>
      <textarea ref={ref} id="theatre-note-text" className="textarea theatre-composer-text" rows={2} maxLength={4000} value={text} placeholder={`What should change at ${clock(time)}?`}
        onChange={(e) => setText(e.target.value)} onFocus={onFocus}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } else if (e.key === 'Escape') e.currentTarget.blur(); }}
        aria-describedby={error ? 'theatre-note-error' : undefined} aria-invalid={error ? true : undefined} />
      {error && <p id="theatre-note-error" className="field-error" role="alert">{error}</p>}
      <div className="theatre-composer-acts">
        {draftPin
          ? <button type="button" className="btn btn-secondary btn-sm" onClick={onClearPin}><X aria-hidden />Remove the pin</button>
          : <button type="button" className="btn btn-secondary btn-sm" aria-pressed={pinMode} onClick={() => onPinMode(!pinMode)}><Crosshair aria-hidden />{pinMode ? 'Click the frame' : 'Pin on the frame'}</button>}
        <button type="submit" className="btn btn-primary btn-sm" disabled={!text.trim() || busy} aria-busy={busy || undefined}>{busy ? 'Adding…' : 'Add note'}</button>
      </div>
    </form>
  );
});

// --------------------------------------------------------------------------------------------------- the notes

/** The notes in this pane's numbering (the pins on the frame carry the same number). */
export const numbered = (notes: CutNote[]) => notes.map((note, i) => ({ note, n: i + 1 }));

export function NoteList({ cut, notes, loaded, error, activeId, onJump, onResolve, onSend }: {
  cut: CutView; notes: CutNote[]; loaded: boolean; error: string | null; activeId: string | null;
  onJump: (t: number, noteId?: string) => void;
  onResolve?: (n: CutNote) => void; onSend?: (n: CutNote, shot: TimelineShot) => void;
}) {
  if (!loaded) {
    if (error) return <p className="t-body theatre-empty" role="status">The notes could not be read: {error}</p>;
    return (
      <ol className="theatre-notes" aria-busy="true" aria-label="Loading the notes">
        {[0, 1].map((i) => <li key={i} className="theatre-note" aria-hidden><span className="theatre-note-head"><Skeleton.Line width="5rem" /></span><span className="theatre-note-text"><Skeleton.Line width="88%" /></span></li>)}
      </ol>
    );
  }
  if (notes.length === 0) return <p className="t-body theatre-empty">No notes on cut {cut.version.version} yet. Pause where something should change and write it above.</p>;
  return (
    <ol className="theatre-notes" aria-label={`Notes on cut ${cut.version.version}`}>
      {numbered(notes).map(({ note, n }) => <NoteRow key={note.id} note={note} n={n} cut={cut} active={note.id === activeId} onJump={onJump} onResolve={onResolve} onSend={onSend} />)}
    </ol>
  );
}

function NoteRow({ note, n, cut, active, onJump, onResolve, onSend }: { note: CutNote; n: number; cut: CutView; active: boolean; onJump: (t: number, noteId?: string) => void; onResolve?: (n: CutNote) => void; onSend?: (n: CutNote, shot: TimelineShot) => void }) {
  const shot = shotAt(cut.timeline, note.timecode);
  const sentTo = note.sentToShotId ? cut.timeline.find((s) => s.shotId === note.sentToShotId) : undefined;
  const resolved = note.status === 'resolved';
  const range = note.rangeEnd !== undefined && note.rangeEnd > note.timecode ? `${clock(note.timecode)}–${clock(note.rangeEnd)}` : clock(note.timecode);
  return (
    <li className="theatre-note" data-active={active || undefined} data-resolved={resolved || undefined} aria-current={active || undefined}>
      <div className="theatre-note-head">
        <button type="button" className="theatre-note-tc t-ro" onClick={() => onJump(note.timecode, note.id)} aria-label={`Jump to ${range}, note ${n}`}>{range}</button>
        <span className="theatre-note-n t-ro" data-pin={note.pin ? '' : undefined} aria-label={note.pin ? `Note ${n}, pinned on the frame` : `Note ${n}`}>{n}</span>
        {shot && <span className="t-meta">Shot {shot.label}</span>}
        {resolved && <span className="badge badge-ok theatre-note-state">Resolved</span>}
      </div>
      <p className="theatre-note-text" dir="auto">{note.text}</p>
      <div className="theatre-note-foot">
        <span className="t-meta theatre-note-by">{[note.author, when(note.createdAt)].filter(Boolean).join(' · ')}{sentTo ? ` · sent to shot ${sentTo.label}` : note.sentToShotId ? ' · sent to a shot' : ''}</span>
        <span className="theatre-note-acts">
          {sentTo
            ? <Link className="btn btn-quiet btn-sm" href={sentTo.href}>Open shot {sentTo.label}</Link>
            : shot && !resolved && onSend ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSend(note, shot)}>Send to shot {shot.label}</button> : null}
          {onResolve && <button type="button" className="btn btn-quiet btn-sm" onClick={() => onResolve(note)}>{resolved ? 'Reopen' : 'Resolve'}</button>}
        </span>
      </div>
    </li>
  );
}

// --------------------------------------------------------------------------------------------------- the shots

function ShotList({ cut, time, onJump }: { cut: CutView; time: number; onJump: (t: number) => void }) {
  if (cut.timeline.length === 0) return <p className="t-body theatre-empty">This cut does not record the shots it was assembled from.</p>;
  const now = shotAt(cut.timeline, time);
  return (
    <ol className="theatre-shots" aria-label={`Shots in cut ${cut.version.version}`}>
      {cut.timeline.map((s) => (
        <li key={`${s.shotId}-${s.start}`} className="theatre-shot" data-current={s === now || undefined}>
          <button type="button" className="theatre-shot-main" onClick={() => onJump(s.start)} aria-label={`Jump to shot ${s.label} at ${clock(s.start)}`} aria-current={s === now || undefined}>
            <span className="theatre-shot-still" aria-hidden>{s.still && <img src={s.still.thumb?.src ?? s.still.src} alt="" loading="lazy" decoding="async" />}</span>
            <span className="theatre-shot-words">
              <span className="theatre-shot-name">Shot {s.label}</span>
              <span className="t-meta">{s.takeNumber ? `Take ${s.takeNumber} of ${s.takeCount}` : s.takeCount ? `${s.takeCount} ${s.takeCount === 1 ? 'take' : 'takes'}` : 'No take recorded'}</span>
            </span>
            <span className="t-ro theatre-shot-time">{clock(s.start)}</span>
          </button>
          <Link className="btn btn-quiet btn-sm" href={s.href} aria-label={`Open shot ${s.label} in its workspace`}>Open</Link>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------- the deliverables

function Files({ files }: { files: SubtitleFile[] }) {
  if (!files.length) return null;
  return (
    <span className="theatre-files">
      {files.map((f) => <a key={f.id} className="btn btn-quiet btn-sm" href={f.src} download={f.filename} aria-label={`Download the ${f.language} subtitles (${f.format})`}><Download aria-hidden />{f.language} {f.format}</a>)}
    </span>
  );
}

const burnedWords = (s: unknown) => (typeof s === 'string' && s !== 'none' ? `${s === 'en' ? 'English' : s === 'ar' ? 'Arabic' : s} subtitles, burned in` : 'no subtitles in the picture');

function Deliverables({ sc, cut }: { sc: Screening; cut: CutView }) {
  const v = cut.version;
  return (
    <div className="theatre-deliv">
      {sc.exports.length === 0 && <p className="t-body theatre-empty">No export of this film yet. <Link className="theatre-link" href={`${sc.href}/production?tab=final`}>Export it from the final cut</Link>.</p>}
      <ul className="theatre-deliv-list" aria-label="Deliverables">
        {sc.exports.map((e) => (
          <li key={e.id} className="theatre-deliv-row">
            <div className="theatre-deliv-head">
              <span className="theatre-deliv-name">The film</span>
              <a className="btn btn-secondary btn-sm" href={e.href} download={e.filename}><Download aria-hidden />Download</a>
            </div>
            <span className="t-meta theatre-slate">{[...e.words, e.size].filter(Boolean).map((w) => <span key={w}>{w}</span>)}</span>
            <span className="t-meta">{e.subtitles}{e.createdAt ? ` · exported ${when(e.createdAt)}` : ''}</span>
            {e.subtitleFiles.length > 0 && <><span className="t-label theatre-deliv-sub">Subtitle files</span><Files files={e.subtitleFiles} /></>}
          </li>
        ))}
        <li className="theatre-deliv-row">
          <div className="theatre-deliv-head">
            <span className="theatre-deliv-name">Cut {v.version}{v.current ? ', the current cut' : ''}</span>
            <a className="btn btn-secondary btn-sm" href={v.asset.src} download={`cut-${v.version}.mp4`}><Download aria-hidden />Download</a>
          </div>
          <span className="t-meta theatre-slate">{['MP4', v.width && v.height ? `${v.width}×${v.height}` : null, v.asset.bytes ? fileSize(v.asset.bytes) : null, burnedWords(v.asset.provenance?.subtitles)].filter(Boolean).map((w) => <span key={w}>{w}</span>)}</span>
          {cut.subtitleFiles.length > 0 && <><span className="t-label theatre-deliv-sub">Subtitle files</span><Files files={cut.subtitleFiles} /></>}
        </li>
      </ul>
    </div>
  );
}
