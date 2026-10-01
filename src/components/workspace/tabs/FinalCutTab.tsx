'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, castOf, shotHref, shotLabel } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, Card, Details, Field, Notice, SampleMark, Select, Status, Thumb } from '@/components/ui/kit';
import { LaterButton } from '@/components/ui/later';
import { VideoPlaceholder, VideoPlayer } from '@/components/players/VideoPlayer';
import { IconDownload, IconFinalCut } from '@/components/ui/icons';
import { aspectLabel, fmtSeconds, ratioClass, ratioCss } from '@/lib/format';

/** FINAL CUT — the chosen takes in order with the sound under them, then export. The assembled cut shown for the
 *  sample episode is a sample clip; when there is none, the sequence below is the cut, described. */
export function FinalCutTab({ p }: { p: Production }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const cut = assetById(state, p.cutAssetId);
  const seq = p.shots.map((sh) => ({ sh, take: sh.takes.find((t) => t.id === sh.selectedTakeId) }));
  const missing = seq.filter((x) => !x.take).length;
  const total = seq.reduce((a, x) => a + x.sh.durationSeconds, 0);
  const cast = castOf(state, p);
  const [format, setFormat] = useState('mp4-h264'); const [res, setRes] = useState('1080'); const [subs, setSubs] = useState(p.language === 'AR' ? 'ar' : 'none');
  if (p.shots.length === 0) return <Notice title={T('empty.shots')}>{T('empty.shots.hint')} <Link href="?tab=storyboard" className="font-medium text-accent-text hover:underline">{T('tab.storyboard')} →</Link></Notice>;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="h2">{T('final.assembled')}</h2>{missing > 0 ? <Status tone="warn">{missing} {T('final.missing')}</Status> : <Status tone="ok">{seq.length} {T('produce.shotsReady')}</Status>}</div>
          {cut ? <div className={p.aspect === 'VERTICAL_9_16' ? 'mx-auto max-w-sm' : ''}><VideoPlayer src={cut.src} poster={cut.poster} title={p.title} aspect={ratioCss(p.aspect)} /><p className="mt-2 flex items-center gap-2 text-xs text-muted"><IconFinalCut className="size-3.5" />{T('final.sampleCut')}{cut.sample && <SampleMark className="!bg-surface-3 !text-muted" />} · {fmtSeconds(cut.durationSeconds)}</p></div>
            : <VideoPlaceholder ratio={ratioCss(p.aspect)} className={p.aspect === 'VERTICAL_9_16' ? 'mx-auto max-w-sm' : ''} title={T('final.noCut')} hint={T('final.noCut.hint')} action={<LaterButton size="sm">{T('final.assemble')}</LaterButton>} />}
        </section>

        <section aria-labelledby="seq">
          <div className="mb-3 flex items-baseline justify-between gap-2"><h2 id="seq" className="h2">{T('final.sequence')}<span className="ms-2 text-sm font-normal text-faint num">{seq.length}</span></h2><span className="num text-sm text-muted">{fmtSeconds(total)} {T('misc.of')} {fmtSeconds(p.targetSeconds)}</span></div>
          <ol className="flex gap-2 overflow-x-auto pb-2">
            {seq.map(({ sh, take }, i) => {
              const a = assetById(state, take?.assetId) ?? assetById(state, sh.openingFrameAssetId);
              return (
                <li key={sh.id} className="w-32 flex-none sm:w-40">
                  <Link href={shotHref(p, sh.id)} className="group block">
                    <div className="relative"><Thumb src={a?.poster ?? a?.src} alt={`${shotLabel(p, sh)}`} ratio={ratioClass(p.aspect)} className={`rounded-md ${take ? '' : 'opacity-60'}`} empty="—" /><span className="absolute start-1.5 top-1.5 rounded bg-black/60 px-1 font-latin text-[11px] font-semibold text-white">{i + 1}</span>{!take && <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-warn-soft px-1 text-center text-[10px] font-medium text-warn">{T('produce.chooseTake')}</span>}</div>
                    <p className="mt-1 truncate text-xs"><span className="font-latin font-medium">{shotLabel(p, sh)}</span> <span className="text-muted num">· {fmtSeconds(sh.durationSeconds)}</span></p>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 space-y-1.5" aria-label={T('final.sound')}>
            {[[T('final.dialogueTrack'), seq.filter((x) => x.sh.dialogue.length).length, 'bg-info'], [T('final.musicTrack'), p.song ? 1 : 0, 'bg-accent'], [T('final.ambienceTrack'), p.scenes.length, 'bg-ok']].map(([label, n, tone]) => (
              <div key={String(label)} className="flex items-center gap-3 text-xs"><span className="w-20 flex-none text-muted">{label}</span><div className="flex h-5 flex-1 gap-0.5 overflow-hidden rounded bg-surface-2">{seq.map(({ sh }) => <span key={sh.id} className={`h-full ${Number(n) > 0 && (label === T('final.ambienceTrack') || label === T('final.musicTrack') || sh.dialogue.length) ? String(tone) : 'bg-surface-3'} opacity-70`} style={{ flex: sh.durationSeconds }} />)}</div></div>
            ))}
            <p className="text-[11px] text-faint">{T('final.sound')}: {cast.filter((c) => c.voice.selectedSampleId).length}/{cast.length} {T('lib.voiceSelected')} · {T('later.short').toLowerCase()}</p>
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <Card>
          <h2 className="h3 mb-3">{T('final.export')}</h2>
          <div className="space-y-3">
            <Field label="Format"><Select value={format} onChange={(e) => setFormat(e.target.value)} options={[{ value: 'mp4-h264', label: 'MP4 · H.264' }, { value: 'mp4-h265', label: 'MP4 · H.265' }, { value: 'mov-prores', label: 'MOV · ProRes' }]} /></Field>
            <Field label="Resolution"><Select value={res} onChange={(e) => setRes(e.target.value)} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K' }]} /></Field>
            <Field label="Subtitles"><Select value={subs} onChange={(e) => setSubs(e.target.value)} options={[{ value: 'none', label: '—' }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }, { value: 'both', label: 'AR + EN' }]} /></Field>
            <p className="text-xs text-muted">{aspectLabel(p.aspect)} · {fmtSeconds(total)}</p>
            <LaterButton variant="primary" icon={<IconDownload />} className="w-full">{T('final.export')}</LaterButton>
            <p className="text-xs text-faint">{T('final.exportHint')}</p>
          </div>
        </Card>
        <Details summary={T('shot.advanced')}><p className="text-xs text-muted">Loudness −23 LUFS · true peak −1 dB · dialogue 0 dB · music −14 dB · ambience −12 dB</p></Details>
        {missing === 0 && p.stage !== 'COMPLETE' && <Button className="w-full" onClick={() => { act('markStepDone', p.id, 'FINAL_CUT'); toast.ok(T('toast.saved')); }}>{T('btn.markDone')}</Button>}
      </aside>
    </div>
  );
}
