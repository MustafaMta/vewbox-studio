'use client';

import Link from 'next/link';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { assetById, castOf, primaryImageOf, showById } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { SectionHead, StateWord } from '@/components/ui/kit';
import { Frame } from '@/components/media/Frame';
import { CanonPicker, Picker } from '@/components/library/CanonPicker';
import { TrackButton } from '@/components/players/PlayerProvider';
import { IconAuto } from '@/components/ui/icons';
import { GenButton, type StudioGate } from '../gate';
import { vocab } from '../model';

/** PERFORMERS (a music video) — who sings, what they sing, and how they sound: each performer's canonical figure,
 *  the sections they sing and their voice, previewed through the studio's one player. The voice is chosen on the
 *  character's page. */
export function PerformersTab({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const cast = castOf(state, p);
  const song = p.song;
  const setCast = (ids: string[]) => { act('updateProduction', p.id, { castIds: ids }); if (song) act('updateSong', p.id, { singerIds: ids }); toast.ok('Saved.'); };
  return (
    <div className="ws-main">
      <div className="ws-pane-head"><h1 className="t-section">Performers</h1></div>
      <SectionHead title="Who sings" count={cast.length || null} description="Who sings and how they sound. Each performer’s voice is chosen on their character page." action={<Picker kind="cast" style={p.style} selected={p.castIds} onChange={setCast} label="Add a performer" />} />
      {song && p.shots.length > 0 && <div className="ws-gen-row"><GenButton gate={gate} engine="story" type="PLAN_SHOTS" payload={{ productionId: p.id, performanceOnly: true }} target={{ productionId: p.id }} icon={<IconAuto aria-hidden />}>Assign the singing</GenButton><span className="t-meta">Decides who sings each section from the lyrics and the story, and copies it onto the planned shots.</span></div>}
      {cast.length === 0 ? <p className="t-body ws-empty">Nobody in the cast yet.</p> : <PeopleGrid p={p} people={cast.map((c) => c.id)} lead />}
    </div>
  );
}

/** CAST AND WORLD (a film) — the production's characters and locations, chosen from the studio's casting directory;
 *  a show's own canon is inherited and shown as such. */
export function CastTab({ p }: { p: Production }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const show = showById(state, p.showId);
  const save = (patch: Partial<Production>) => { act('updateProduction', p.id, patch); toast.ok('Saved.'); };
  return (
    <div className="ws-main">
      <div className="ws-pane-head"><h1 className="t-section">Cast and world</h1></div>
      <section className="ws-sec-tight" aria-label="Characters">
        <CanonPicker only="cast" castIds={p.castIds} locationIds={p.locationIds} inheritedCast={show?.castIds} inheritedLocations={show?.locationIds} style={p.style} onChange={save} />
      </section>
      <section className="ws-sec" aria-label="Locations">
        <CanonPicker only="locations" castIds={p.castIds} locationIds={p.locationIds} inheritedCast={show?.castIds} inheritedLocations={show?.locationIds} style={p.style} onChange={save} />
      </section>
    </div>
  );
}

function PeopleGrid({ p, people, lead }: { p: Production; people: string[]; lead?: boolean }) {
  const { state } = useStudio();
  const song = p.song;
  return (
    <ul className="ws-people" role="list">
      {people.map((id, i) => {
        const c = state.characters.find((x) => x.id === id);
        if (!c) return null;
        const pic = assetById(state, primaryImageOf(c));
        const sections = song?.sections.filter((s) => s.singerIds.includes(c.id)) ?? [];
        const sample = c.voice.samples.find((v) => v.id === c.voice.selectedSampleId);
        const audio = assetById(state, sample?.assetId);
        return (
          <li key={c.id} className="card ws-person">
            <Link href={`/characters/${c.id}`} className="ws-person-fig" aria-label={c.name}><Frame asset={pic} ratio="928/1664" fit="contain" alt="" decorative art={artVars(pic)} title={c.name} radius="none" /></Link>
            <div className="ws-person-words">
              <Link href={`/characters/${c.id}`} className="t-card name"><bdi>{c.name}</bdi></Link>
              <span className="t-meta name"><bdi>{c.role}</bdi></span>
              {lead && i === 0 && <span className="badge badge-neutral">Lead</span>}
              <span className="t-meta">{sections.length ? sections.map((s) => vocab(s.kind)).join(' · ') : 'No section assigned yet'}</span>
              {sample && audio && !audio.unavailable
                ? <span className="ws-voice"><TrackButton size="xs" track={{ id: `voice-${c.id}-${sample.id}`, src: audio.src, title: `${c.name} — ${sample.label}` }} labelPlay={`Play ${c.name}’s voice`} labelPause="Pause" /><span className="t-meta">{sample.label} · {vocab(c.voice.pitch).toLowerCase()} pitch</span></span>
                : <Link className="ws-textlink" href={`/characters/${c.id}?tab=voice`}><StateWord tone="idle">No voice yet</StateWord></Link>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
