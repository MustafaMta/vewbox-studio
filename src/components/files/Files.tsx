'use client';

import Link from 'next/link';
import { useUrlPanel } from '@/components/shell/useUrlPanel';
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { Asset } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { MediaTile } from '@/components/media/Cards';
import { Frame } from '@/components/media/Frame';
import type { FrameRatio } from '@/components/media/art';
import { VideoPlayer } from '@/components/players/VideoPlayer';
import { AudioPlayer } from '@/components/players/Controls';
import { TrackButton } from '@/components/players/PlayerProvider';
import { Button, ConfirmDialog, Dialog, FilterChips, SearchField, Skeleton, StateWord } from '@/components/ui/kit';
import { IconUpload } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { EmptyLine, PageHead, Row, Rows, Section } from '@/components/studio/parts';
import { FilesSkeleton } from './FilesSkeleton';
import { clip, groups as groupFiles, kindCounts, listed, originWords, ownership, size, type FileItem, type KindFilter, type OwnerFilter, type OwnerGroup, type OwnerKind } from './model';

/** FILES (docs/DESIGN-SYSTEM-V5.md §8.13) — every picture, clip, sound and subtitle the studio holds, grouped by whom
 *  it belongs to — characters, locations, productions — each in its own shape: a character's pictures as standing
 *  figures, a location's as plates, a production's frames and clips as 16:9 stills, sound as playable rows, subtitles
 *  as text. Search and two filters (kind, owner) narrow it; a file opens in place (`?asset=`), where an uploaded file
 *  that nothing uses can be deleted. Upload keeps working as before. */

const KIND_LABEL: Record<KindFilter, string> = { ALL: 'All', IMAGE: 'Pictures', VIDEO: 'Clips', AUDIO: 'Sound', SUBTITLE: 'Subtitles' };
const OWNER_SECTIONS: Array<{ kind: OwnerKind; title: string; description: string }> = [
  { kind: 'character', title: 'Characters', description: 'Each character’s pictures and voice recordings.' },
  { kind: 'location', title: 'Locations', description: 'Plates and views of each place.' },
  { kind: 'production', title: 'Productions', description: 'Frames, takes, cuts, lines and subtitles of each film.' },
  { kind: 'other', title: 'Other files', description: 'Files no character, location or production names.' },
];

export function FilesPage() {
  const { state, jobs, addFile, ready } = useStudio();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [owner, setOwner] = useState<OwnerFilter>('all');
  const [uploading, setUploading] = useState(false);
  const own = useMemo(() => ownership(state, jobs), [state, jobs]);
  const grouped = useMemo(() => groupFiles(state, own, { q, kind, owner }), [state, own, q, kind, owner]);
  const counts = useMemo(() => kindCounts(state), [state]);
  const ownerCounts = useMemo(() => { const c: Record<OwnerKind, number> = { character: 0, location: 0, production: 0, other: 0 }; for (const a of listed(state.assets)) c[(own.get(a.id)?.kind ?? 'other')] += 1; return c; }, [state, own]);
  // the viewer opens from the page's state at once; the address is mirrored (src/components/shell/useUrlPanel.ts)
  const [openId, setOpen] = useUrlPanel('asset');
  const open = openId ? state.assets.find((a) => a.id === openId) ?? null : null;
  if (!ready) return <FilesSkeleton />;
  const addFiles = async (files: FileList) => {
    setUploading(true);
    for (const f of Array.from(files)) { const r = await addFile(f, { label: f.name, tags: ['added'] }); if (r.ok) toast.ok(`Added “${f.name}”.`); else toast.bad(r.error); }
    setUploading(false);
  };
  const upload = (
    <label className="btn btn-primary fl-upload" aria-busy={uploading || undefined}>
      <IconUpload aria-hidden />{uploading ? 'Adding…' : 'Upload'}
      <input type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ''; }} />
    </label>
  );
  const shown = OWNER_SECTIONS.filter((s) => grouped[s.kind].length > 0);
  const total = Object.values(grouped).reduce((n, gs) => n + gs.reduce((m, g) => m + g.files.length, 0), 0);
  return (
    <div className="cp files">
      <PageHead title="Files" lead="Every picture, clip, sound and subtitle the studio holds, with whom it belongs to." end={upload} />
      <div className="fl-bar" role="search">
        <SearchField className="fl-search" value={q} onChange={setQ} label="Search files" placeholder="Search files and owners" />
        <FilterChips label="Kind" value={kind === 'ALL' ? [] : [kind]} onChange={(v) => setKind((v[0] as KindFilter | undefined) ?? 'ALL')} options={(['IMAGE', 'VIDEO', 'AUDIO', 'SUBTITLE'] as const).filter((k) => counts[k] > 0).map((k) => ({ value: k, label: KIND_LABEL[k], count: counts[k] }))} />
        <FilterChips label="Owner" value={owner === 'all' ? [] : [owner]} onChange={(v) => setOwner((v[0] as OwnerFilter | undefined) ?? 'all')} options={OWNER_SECTIONS.filter((s) => ownerCounts[s.kind] > 0).map((s) => ({ value: s.kind, label: s.title, count: ownerCounts[s.kind] }))} />
      </div>
      <p className="t-meta fl-count" role="status">{q || kind !== 'ALL' || owner !== 'all' ? `${total} of ${counts.ALL} files` : `${counts.ALL} files`}</p>
      {state.assets.length === 0 ? <EmptyLine action={upload}>The studio holds no files yet. Files appear here as the studio makes them, or when you upload one.</EmptyLine>
        : shown.length === 0 ? <EmptyLine action={<Button size="sm" onClick={() => { setQ(''); setKind('ALL'); setOwner('all'); }}>Clear the search and filters</Button>}>No file matches.</EmptyLine>
          : shown.map((s) => (
            <Section key={s.kind} id={`files-${s.kind}`} title={s.title} count={grouped[s.kind].reduce((n, g) => n + g.files.length, 0)} description={s.description}>
              {grouped[s.kind].map((g) => <OwnerBlock key={g.owner.id} g={g} onOpen={setOpen} />)}
            </Section>
          ))}
      <Preview asset={open} item={open ? { asset: open, owner: own.get(open.id) ?? { kind: 'other', id: 'other', name: 'Other files' }, name: open.label, kind: open.kind as FileItem['kind'] } : null} onClose={() => setOpen(null)} />
    </div>
  );
}

/** One owner: its name (a link to it) and its files, pictures in the owner's shape, clips at 16:9, sound and subtitles
 *  as rows. */
function OwnerBlock({ g, onOpen }: { g: OwnerGroup; onOpen: (id: string) => void }) {
  const pics = g.files.filter((f) => f.kind === 'IMAGE');
  const clips = g.files.filter((f) => f.kind === 'VIDEO');
  const sound = g.files.filter((f) => f.kind === 'AUDIO');
  const subs = g.files.filter((f) => f.kind === 'SUBTITLE');
  const shape: FrameRatio = g.owner.kind === 'character' ? '928/1664' : '16/9';
  const intercept = (id: string) => (e: MouseEvent) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onOpen(id); };
  const href = (id: string) => `/assets?asset=${encodeURIComponent(id)}`;
  return (
    <div className="fl-owner" aria-labelledby={`fl-${g.owner.id}`}>
      <h3 id={`fl-${g.owner.id}`} className="t-title fl-owner-h">
        {g.owner.href ? <Link href={g.owner.href} className="cp-link"><bdi lang={g.owner.lang}>{g.owner.name}</bdi></Link> : g.owner.name}
        <span className="t-ro t-ro-md fl-owner-n">{g.files.length}</span>
      </h3>
      {(pics.length > 0 || clips.length > 0) && (
        <ul className="fl-grid" role="list" data-shape={shape === '16/9' ? 'wide' : 'figure'}>
          {[...pics, ...clips].map((f) => (
            <li key={f.asset.id} onClickCapture={intercept(f.asset.id)}>
              <MediaTile href={href(f.asset.id)} title={f.name} asset={f.kind === 'IMAGE' ? f.asset : undefined} src={f.kind === 'VIDEO' ? f.asset.poster ?? null : undefined}
                ratio={f.kind === 'VIDEO' ? '16/9' : shape} fit={f.kind === 'IMAGE' && shape === '928/1664' ? 'contain' : 'cover'} art={artVars(f.asset)}
                chip={f.kind === 'VIDEO' ? clip(f.asset.durationSeconds) ?? 'Clip' : undefined} frameState={f.asset.unavailable ? 'unavailable' : undefined}
                meta={[f.kind === 'VIDEO' ? 'Clip' : originWords(f.asset), f.asset.width && f.asset.height ? `${f.asset.width}×${f.asset.height}` : null]} />
            </li>
          ))}
        </ul>
      )}
      {sound.length > 0 && (
        <Rows label={`Sound of ${g.owner.name}`} className="fl-rows">
          {sound.map((f) => (
            <Row key={f.asset.id} start={f.asset.unavailable ? <StateWord tone="failed">Missing</StateWord> : <TrackButton track={{ id: `file-${f.asset.src}`, src: f.asset.src, title: f.name, duration: f.asset.durationSeconds }} size="xs" labelPlay={`Play ${f.name}`} labelPause={`Pause ${f.name}`} />}
              title={<a href={href(f.asset.id)} onClick={intercept(f.asset.id)} className="cp-link" dir="auto">{f.name}</a>}
              meta={<span className="t-facts"><span>{originWords(f.asset)}</span>{clip(f.asset.durationSeconds) && <span>{clip(f.asset.durationSeconds)}</span>}{size(f.asset.bytes) && <span>{size(f.asset.bytes)}</span>}</span>} />
          ))}
        </Rows>
      )}
      {subs.length > 0 && (
        <Rows label={`Subtitles of ${g.owner.name}`} className="fl-rows">
          {subs.map((f) => (
            <Row key={f.asset.id} start={<span className="t-ro t-ro-md fl-sub-tag">{subtitleTag(f.asset)}</span>}
              title={<a href={href(f.asset.id)} onClick={intercept(f.asset.id)} className="cp-link" dir="auto">{f.name}</a>}
              meta={<span className="t-facts"><span>{originWords(f.asset)}</span>{size(f.asset.bytes) && <span>{size(f.asset.bytes)}</span>}</span>} />
          ))}
        </Rows>
      )}
    </div>
  );
}

const subtitleTag = (a: Pick<Asset, 'tags'>) => [a.tags.find((t) => /^(en|ar)$/.test(t)), a.tags.find((t) => /^(srt|vtt)$/.test(t))].filter(Boolean).join(' · ').toUpperCase() || 'TEXT';

/** A file, opened in place: the picture whole, the clip or the sound playing, the subtitles as text; its facts; Delete
 *  only for an uploaded file (the server refuses one that is still used, and says by whom). */
function Preview({ asset: a, item, onClose }: { asset: Asset | null; item: FileItem | null; onClose: () => void }) {
  const { removeAsset } = useStudio();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(null);
    if (!a || a.kind !== 'SUBTITLE' || a.unavailable) return;
    let on = true;
    fetch(a.src).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then((t) => { if (on) setText(t.slice(0, 6000)); }).catch(() => { if (on) setText(''); });
    return () => { on = false; };
  }, [a]);
  const del = async () => {
    if (!a) return;
    setBusy(true);
    const r = await removeAsset(a.id);
    setBusy(false); setConfirm(false);
    if (r.ok) { toast.ok(`Deleted “${a.label}”.`); onClose(); } else toast.bad(r.protectedBy ? `It is still used by ${r.protectedBy}.` : r.error);
  };
  const canDelete = Boolean(a && !a.sample && a.origin === 'UPLOAD');
  let body: ReactNode = null;
  if (a) {
    if (a.unavailable) body = <EmptyLine>The file behind this record cannot be found on the server.</EmptyLine>;
    else if (a.kind === 'VIDEO') body = <VideoPlayer src={a.src} poster={a.poster} title={a.label} />;
    else if (a.kind === 'AUDIO') body = <AudioPlayer src={a.src} title={a.label} duration={a.durationSeconds} />;
    else if (a.kind === 'SUBTITLE') body = text === null ? <Skeleton.Text lines={6} /> : text ? <pre className="t-ro fl-subtext" dir="auto">{text}</pre> : <EmptyLine>The subtitles could not be read.</EmptyLine>;
    else body = <div className="fl-pic" data-shape={item?.owner.kind === 'character' ? 'figure' : undefined}><Frame asset={a} src={a.src} ratio={item?.owner.kind === 'character' ? '928/1664' : a.width && a.height && a.height > a.width ? '2/3' : '16/9'} fit="contain" alt={a.label} judge priority radius="precise" art={artVars(a)} /></div>;
  }
  return (
    <>
      <Dialog open={Boolean(a)} onClose={onClose} size="lg" title={a ? <bdi>{a.label}</bdi> : 'File'}
        description={a ? [item?.owner.kind !== 'other' ? item?.owner.name : null, originWords(a), a.width && a.height ? `${a.width}×${a.height}` : null, clip(a.durationSeconds), size(a.bytes)].filter(Boolean).join(' · ') : undefined}
        footer={<>{canDelete && <Button variant="quiet" onClick={() => setConfirm(true)}>Delete</Button>}<Button onClick={onClose}>Close</Button></>}>
        {body}
        {a && item?.owner.href && <p className="t-meta fl-belongs">Belongs to <Link href={item.owner.href} className="cp-link"><bdi lang={item.owner.lang}>{item.owner.name}</bdi></Link>.</p>}
      </Dialog>
      <ConfirmDialog open={confirm} busy={busy} title={a ? `Delete “${a.label}”?` : 'Delete the file?'} body="The file is removed from the studio’s library. This cannot be undone." confirmLabel="Delete" onConfirm={() => void del()} onCancel={() => setConfirm(false)} />
    </>
  );
}

/** The page's skeleton lives in ./FilesSkeleton (drawn synchronously by the shell); re-exported for the page. */
export { FilesSkeleton };
