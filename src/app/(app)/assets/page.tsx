'use client';

import { useState } from 'react';
import type { AssetKind } from '@/domain/types';
import { assetById, type AssetView } from '@/studio/selectors';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Empty } from '@/components/ui/cinema';
import { Button, Input, Modal, Notice, Segmented, Thumb } from '@/components/ui/kit';
import { PageHeader } from '@/components/ui/page';
import { VideoPlayer } from '@/components/players/VideoPlayer';
import { AudioPlayer } from '@/components/players/Controls';
import { IconDelete, IconSearch, IconUpload } from '@/components/ui/icons';
import { fmtBytes, fmtSeconds } from '@/lib/format';

/** THE ASSET LIBRARY — every picture, clip and sound the studio holds, by kind. Bundled items are sample content;
 *  files you add here are checked and stored in the studio library on the server. */
export default function AssetsPage() {
  const T = useT();
  const { state, addFile, removeAsset } = useStudio();
  const toast = useToast();
  const [kind, setKind] = useState<AssetKind | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const items = state.assets.filter((a) => (kind === 'ALL' || a.kind === kind) && (!q.trim() || a.label.toLowerCase().includes(q.trim().toLowerCase()) || a.tags.some((t) => t.includes(q.trim().toLowerCase()))));
  const counts = { ALL: state.assets.length, IMAGE: state.assets.filter((a) => a.kind === 'IMAGE').length, VIDEO: state.assets.filter((a) => a.kind === 'VIDEO').length, AUDIO: state.assets.filter((a) => a.kind === 'AUDIO').length };
  const addFiles = async (files: FileList) => {
    for (const f of Array.from(files)) {
      const r = await addFile(f, { label: f.name, tags: ['added'] });
      if (r.ok) toast.ok(T('media.added')); else toast.bad(r.error);
    }
  };
  const upload = <label className="btn btn-primary cursor-pointer"><IconUpload aria-hidden />{T('btn.upload')}<input type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ''; }} /></label>;
  return (
    <>
      <PageHeader title={T('nav.assets')} subtitle={T('lib.uploadHint')} action={upload} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented label={T('label.kind')} value={kind} onChange={setKind} options={[{ value: 'ALL', label: `${T('label.all')} ${counts.ALL}` }, { value: 'IMAGE', label: `${T('lib.images')} ${counts.IMAGE}` }, { value: 'VIDEO', label: `${T('lib.videos')} ${counts.VIDEO}` }, { value: 'AUDIO', label: `${T('lib.audio')} ${counts.AUDIO}` }]} />
        <label className="relative min-w-0 flex-1 basis-56"><IconSearch aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T('lib.search')} aria-label={T('label.search')} className="ps-8" /></label>
      </div>
      {state.assets.length === 0 ? <Empty title={T('empty.assets')} action={upload} /> : items.length === 0 ? <Notice>{T('lib.noMatches')}</Notice> : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-3">
          {items.map((a) => <AssetTile key={a.id} a={assetById(state, a.id)!} onDelete={!a.sample ? () => { void removeAsset(a.id).then((r) => { if (r.ok) toast.ok(T('toast.deleted')); else toast.bad(`${T('asset.protected')} ${r.protectedBy}.`); }); } : undefined} />)}
        </ul>
      )}
    </>
  );
}

function AssetTile({ a, onDelete }: { a: AssetView; onDelete?: () => void }) {
  const T = useT();
  const ratio = a.width && a.height && a.height > a.width ? 'aspect-[3/4]' : 'aspect-video';
  return (
    <li className="tile">
      <Modal size="lg" title={a.label} description={a.sample ? T('label.sampleContent') : undefined} trigger={(open) => (
        <button type="button" className="flex flex-1 flex-col text-start outline-none" onClick={open}>
          <div className="relative w-full">{a.kind === 'AUDIO' && !a.unavailable ? <div className={`media media-empty ${ratio}`}><span className="text-2xl">♪</span></div> : <Thumb src={a.kind === 'VIDEO' ? a.poster ?? a.src : a.src} alt="" ratio={ratio} className="rounded-none" unavailable={a.unavailable} />}</div>
          <div className="tile-body"><p className="tile-title text-sm" dir="auto">{a.label}</p><p className="tile-meta"><span>{a.kind === 'IMAGE' ? T('lib.images') : a.kind === 'VIDEO' ? T('lib.videos') : T('lib.audio')}</span>{a.durationSeconds ? <span>{fmtSeconds(a.durationSeconds)}</span> : a.width ? <span className="num">{a.width}×{a.height}</span> : a.bytes ? <span>{fmtBytes(a.bytes)}</span> : null}{a.origin === 'UPLOAD' ? <span>{T('media.stored')}</span> : a.origin === 'GENERATED' ? <span>{T('media.generated')}</span> : null}</p></div>
        </button>
      )}>
        {(close) => (
          <div className="space-y-4">
            {a.unavailable ? <Notice tone="warn" title={T('media.unavailable')}>{T('media.unavailable.hint')}</Notice> : a.kind === 'VIDEO' ? <VideoPlayer src={a.src} poster={a.poster} title={a.label} /> : a.kind === 'AUDIO' ? <AudioPlayer src={a.src} title={a.label} duration={a.durationSeconds} /> : <Thumb src={a.src} alt={a.label} ratio={ratio} contain />}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted"><span>{a.tags.join(' · ')}</span><span className="flex gap-2">{onDelete && <Button variant="danger" size="sm" icon={<IconDelete />} onClick={() => { onDelete(); close(); }}>{T('btn.delete')}</Button>}<Button size="sm" onClick={close}>{T('btn.close')}</Button></span></div>
          </div>
        )}
      </Modal>
    </li>
  );
}
