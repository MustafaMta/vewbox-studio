'use client';

import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { IconPlay } from '@/components/ui/icons';
import { FaceCircle } from '@/components/media/FaceCircle';
import type { Picture } from '@/components/media/art';
import { fmtClock } from '../time';

/** THE SECTIONS TABLE (docs/DESIGN-SYSTEM-V4.md §5.13) — the song's sections as a real <table> (Music video Overview;
 *  Song & Lyrics in edit): # · Section · Singer · Shots · Time, and a totals footer ("3:42 · 8 sections · 24 shots ·
 *  song version 3"). Rows are 48 px (36 compact). `#` becomes a ▶ button ("Play from Verse 1") on hover and focus. The
 *  row being sung sets its name in 600 ivory and the tally replaces its number. Shot pips are 6 px squares (done
 *  muted, missing strong hairline); the words "2 of 3" are the accessible content. On a phone the Shots column folds
 *  into the row's second line. Times are LTR. */

export interface SectionRow { id: string; name: string; singer?: { name: string; lang?: string; asset?: Picture | null; src?: string | null } | null; shotsDone: number; shotsTotal: number; from: number; to: number }

function Pips({ done, total }: { done: number; total: number }) {
  const T = useT();
  return (
    <span className="pips">
      <span className="pips-row" aria-hidden>{Array.from({ length: total }, (_, i) => <span key={i} data-done={i < done || undefined} />)}</span>
      <span className="num pips-n">{T.f('media.sections.of', { a: done, b: total })}</span>
    </span>
  );
}

export function SectionsTable({ rows, time, onPlayFrom, version, duration, className }: { rows: SectionRow[]; time?: number; onPlayFrom?: (row: SectionRow) => void; version?: number; duration?: number; className?: string }) {
  const T = useT();
  const live = time === undefined ? -1 : rows.findIndex((r) => time >= r.from && time < r.to);
  const shots = rows.reduce((n, r) => n + r.shotsTotal, 0);
  const total = duration ?? rows.reduce((m, r) => Math.max(m, r.to), 0);
  return (
    <table className={cls('table sections', className)}>
      <caption className="sr-only">{T('media.sections.caption')}</caption>
      <thead>
        <tr>
          <th scope="col" className="sections-n">#</th>
          <th scope="col">{T('media.sections.section')}</th>
          <th scope="col">{T('media.sections.singer')}</th>
          <th scope="col" className="sections-shots">{T('media.sections.shots')}</th>
          <th scope="col" className="sections-time">{T('media.sections.time')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const now = i === live;
          return (
            <tr key={r.id} data-live={now || undefined} aria-current={now ? 'true' : undefined}>
              <td className="sections-n">
                {onPlayFrom ? (
                  <button type="button" className="sections-play" aria-label={T.f('media.sections.playFrom', { name: r.name })} onClick={() => onPlayFrom(r)}>
                    {now ? <span className="m-tally" aria-hidden /> : <span className="num sections-num" aria-hidden>{i + 1}</span>}
                    <IconPlay aria-hidden className="sections-glyph" />
                  </button>
                ) : now ? <span className="m-tally" aria-hidden /> : <span className="num">{i + 1}</span>}
                {now && <span className="sr-only">{T('media.sections.nowSung')}</span>}
              </td>
              <th scope="row" className="sections-name" dir="auto">
                {r.name}
                <span className="sections-shots-inline"><Pips done={r.shotsDone} total={r.shotsTotal} /></span>
              </th>
              <td>{r.singer ? <span className="sections-singer"><FaceCircle name={r.singer.name} asset={r.singer.asset} src={r.singer.src} size={24} decorative ring={now ? 'speaking' : undefined} /><span dir="auto" lang={r.singer.lang}>{r.singer.name}</span></span> : <span className="sections-none"><span aria-hidden>—</span><span className="sr-only">{T('media.lyrics.noSinger')}</span></span>}</td>
              <td className="sections-shots"><Pips done={r.shotsDone} total={r.shotsTotal} /></td>
              <td className="sections-time"><span className="mono" dir="ltr">{fmtClock(r.from)}–{fmtClock(r.to)}</span></td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5} className="sections-total">
            <span className="mono" dir="ltr">{fmtClock(total)}</span> · {T.p('media.count.sections', rows.length)} · {T.p('media.count.shots', shots)}{version !== undefined && <> · {T.f('media.songVersion', { n: version })}</>}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
