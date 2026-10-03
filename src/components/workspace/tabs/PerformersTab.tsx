'use client';

import Link from 'next/link';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, castOf, primaryImageSrc } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { Badge, Status } from '@/components/ui/kit';
import { Art, Block, Empty } from '@/components/ui/cinema';
import { JobButton } from '@/components/ui/jobs';
import { IconAuto } from '@/components/ui/icons';
import { Picker } from '@/components/library/CanonPicker';
import { TrackButton } from '@/components/players/PlayerProvider';
import { words } from '@/lib/format';

/** PERFORMERS — who sings, what they sing, and how they sound. The voice is chosen on the character's page; here
 *  it is previewed through the studio's one player. */
export function PerformersTab({ p }: { p: Production }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const cast = castOf(state, p);
  const song = p.song;
  const setCast = (ids: string[]) => { act('updateProduction', p.id, { castIds: ids }); if (song) act('updateSong', p.id, { singerIds: ids }); toast.ok(T('toast.saved')); };
  return (
    <Block title={T('tab.performers')} count={cast.length} description={T('mv.performers.hint')} actions={<div className="flex flex-wrap items-center gap-2">
      {song && p.shots.length > 0 && <JobButton type="PLAN_SHOTS" payload={{ productionId: p.id, performanceOnly: true }} target={{ productionId: p.id }} size="sm" icon={<IconAuto />} title={T('gen.performance.hint')}>{T('gen.performance')}</JobButton>}
      <Picker kind="cast" style={p.style} selected={p.castIds} onChange={setCast} label={T('mv.addPerformer')} /></div>}>
      {cast.length === 0 ? <Empty title={T('empty.cast')} hint={T('mv.performers.hint')} action={<Picker kind="cast" style={p.style} selected={p.castIds} onChange={setCast} label={T('mv.addPerformer')} />} /> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cast.map((c, i) => {
            const sections = song?.sections.filter((s) => s.singerIds.includes(c.id)) ?? [];
            const sample = c.voice.samples.find((v) => v.id === c.voice.selectedSampleId);
            const audio = assetById(state, sample?.assetId);
            return (
              <li key={c.id} className="panel flex gap-4 p-4">
                <Link href={`/characters/${c.id}`} className="poster-link w-24 flex-none"><Art src={primaryImageSrc(state, c)} ratio="portrait" top title={c.name} className="!rounded-lg" /></Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/characters/${c.id}`} className="bi truncate font-medium hover:underline" dir="auto"><span>{c.name}</span>{c.nameAr && <span className="bi-ar" dir="rtl">{c.nameAr}</span>}</Link>{i === 0 && <Badge tone="accent">{T('mv.lead')}</Badge>}</div>
                  <p className="mt-0.5 truncate text-sm text-muted" dir="auto">{c.role}</p>
                  <p className="mt-2 text-xs text-muted">{sections.length ? sections.map((s) => words(s.kind)).join(' · ') : T('mv.noSection')}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {sample && audio && !audio.unavailable ? <><TrackButton size="xs" track={{ id: `voice-${c.id}-${sample.id}`, src: audio.src, title: `${c.name} — ${sample.label}` }} labelPlay={T('misc.play')} labelPause={T('misc.pause')} /><span className="text-xs">{T('char.voiceIdentity')}: <span className="font-medium">{sample.label}</span> · {words(c.voice.pitch)} · {c.voice.timbre}</span></>
                      : <Status tone="neutral"><Link href={`/characters/${c.id}?tab=voice`} className="hover:underline">{T('lib.noVoice')}</Link></Status>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}
