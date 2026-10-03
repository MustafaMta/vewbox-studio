'use client';

import Link from 'next/link';
import { useStudio } from '@/studio/store';
import { assetById, productionHref, showById } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { PageHeader } from '@/components/ui/page';
import { Empty } from '@/components/ui/cinema';
import { Badge, Status } from '@/components/ui/kit';
import { VideoPlayer } from '@/components/players/VideoPlayer';
import { IconDownload, IconTv } from '@/components/ui/icons';
import { fmtAgo, fmtBytes, fmtSeconds, ratioCss } from '@/lib/format';

/** THE SCREENING ROOM — every production with an assembled cut, newest first, with its exports to download. A
 *  production without a real cut is not here; a sample cut is marked as such. */
export default function ScreeningPage() {
  const { state } = useStudio();
  const items = state.productions.filter((p) => p.cutAssetId && assetById(state, p.cutAssetId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <PageHeader title={T('screening.title')} subtitle={T('screening.lead')} />
      {items.length === 0 ? <Empty icon={<IconTv />} title={T('screening.empty')} hint={T('screening.empty.hint')} /> : (
        <ul className="grid gap-8 lg:grid-cols-2">
          {items.map((p) => {
            const cut = assetById(state, p.cutAssetId)!;
            const show = showById(state, p.showId);
            const exports = (p.exports ?? []).map((e) => ({ e, a: assetById(state, e.assetId) })).filter((x) => x.a);
            return (
              <li key={p.id} className="card overflow-hidden">
                <div className={p.aspect === 'VERTICAL_9_16' ? 'mx-auto max-w-sm' : ''}><VideoPlayer src={cut.src} poster={cut.poster} title={p.title} aspect={ratioCss(p.aspect)} /></div>
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11.5px] text-faint" dir="auto">{p.kind === 'EPISODE' && show ? `${show.title} · ${T('misc.episodeOf')} ${p.episodeNumber}` : T.dyn(`kind.${p.kind}`)} · {fmtSeconds(cut.durationSeconds)} · {fmtAgo(cut.createdAt ?? p.updatedAt)}</p>
                      <h2 className="bi mt-0.5 text-[17px] font-semibold text-fg" dir="auto"><span>{p.title}</span>{p.titleAr && <span className="bi-ar" dir="rtl">{p.titleAr}</span>}</h2>
                    </div>
                    <div className="flex items-center gap-2">{cut.sample ? <Badge tone="warn">{T('label.sample')}</Badge> : <Status tone="ok">{T('screening.cut')}</Status>}<Link href={`${productionHref(p)}?tab=final`} className="btn btn-subtle btn-sm">{T('btn.open')}</Link></div>
                  </div>
                  {exports.length > 0 && (
                    <ul className="mt-4 divide-y divide-line/70 text-[12.5px]">
                      {exports.map(({ e, a }) => <li key={e.assetId} className="flex flex-wrap items-center gap-x-3 py-2"><span className="font-latin text-fg">{e.resolution}p {e.format}</span><span className="text-faint">{e.subtitles !== 'none' ? `${T('final.subtitles')} ${e.subtitles}` : ''}</span><span className="num text-faint">{fmtBytes(a!.bytes)}</span><a href={a!.src} download className="ms-auto btn btn-ghost btn-xs"><IconDownload aria-hidden />{T('final.download')}</a></li>)}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
