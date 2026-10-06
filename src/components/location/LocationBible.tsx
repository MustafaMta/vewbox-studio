'use client';

import { useMemo, useState } from 'react';
import type { Location, LocationLight } from '@/domain/types';
import { TIMES_OF_DAY, type TimeOfDay } from '@/domain/vocabulary';
import { locationIdentity } from '@/domain/location';
import { useStudio } from '@/studio/store';
import { useUnsavedGuard } from '@/lib/hooks';
import { useToast } from '@/components/ui/toast';
import { Button, Field, Input, StateWord, Textarea } from '@/components/ui/kit';
import { MediaTile } from '@/components/media';
import { CastSection, usable } from '@/components/character/parts';
import { timeWord } from './LocationForm';

/** THE LOCATION BIBLE OF ONE PLACE (src/domain/location.ts; final directive §11 — a return to the same place must not
 *  produce a new room): what never changes about it — architecture, the lay of the land, how its parts sit together,
 *  materials, entrances, the camera zones — and its light design: the key light, the practical lights in the set, the
 *  colour palette and the light it has at each time of day. All of it is the place's identity (its version moves on when
 *  it changes, and a production already filming there keeps the version it was pinned to), carried in every prompt
 *  that shows the place; the light per time of day is the scene state's. Under it, the frames approved cuts established
 *  here — what the audience has already seen, reused by id when the story returns. */

type Layout = NonNullable<Location['layout']>;
interface Draft { architecture: string; geography: string; spatial: string; materials: string; entrances: string; zones: string; key: string; practicals: string; palette: string; byTime: Partial<Record<TimeOfDay, string>> }

const split = (s: string) => s.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
const join = (xs?: string[]) => (xs ?? []).join('\n');
const draftOf = (l: Location): Draft => {
  const lay = l.layout ?? {}; const li = lay.light ?? {};
  return { architecture: lay.architecture ?? '', geography: lay.geography ?? '', spatial: lay.spatial ?? '', materials: join(lay.materials), entrances: join(lay.entrances), zones: join(lay.cameraZones), key: li.key ?? '', practicals: join(li.practicals), palette: join(li.palette), byTime: { ...(li.byTime ?? {}) } };
};
/** The layout the draft stands for: empty fields dropped, so an untouched place keeps its identity hash. */
export function layoutOf(base: Layout | undefined, d: Draft): Layout {
  const t = (s: string) => s.trim() || undefined; const l = (s: string) => { const xs = split(s); return xs.length ? xs : undefined; };
  const byTime = Object.fromEntries(Object.entries(d.byTime).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v)) as LocationLight['byTime'];
  const light: LocationLight = { key: t(d.key), practicals: l(d.practicals), palette: l(d.palette), byTime: byTime && Object.keys(byTime).length ? byTime : undefined };
  const hasLight = Object.values(light).some((v) => v !== undefined);
  const out: Layout = { ...(base ?? {}), architecture: t(d.architecture), geography: t(d.geography), spatial: t(d.spatial), materials: l(d.materials), entrances: l(d.entrances), cameraZones: l(d.zones), light: hasLight ? light : undefined };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Layout;
}

export function LocationBible({ l }: { l: Location }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const initial = useMemo(() => draftOf(l), [l]);
  const [d, setD] = useState<Draft>(initial);
  const dirty = JSON.stringify(layoutOf(l.layout, d)) !== JSON.stringify(layoutOf(l.layout, initial));
  useUnsavedGuard(dirty, 'The Location Bible has unsaved changes. Leave anyway?');
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const times = [...new Set<TimeOfDay>([...l.lighting, ...(Object.keys(d.byTime) as TimeOfDay[])])];
  const [addTime, setAddTime] = useState<TimeOfDay | ''>('');
  const version = (l.identity ?? locationIdentity(l)).version;
  const save = () => {
    try { act('updateLocation', l.id, { layout: layoutOf(l.layout, d) }); toast.ok('Saved. The place’s identity moves to a new version; productions already filming here keep theirs until their story is approved again.'); }
    catch (e) { toast.bad((e as Error).message); }
  };
  const established = state.assets.filter((a) => a.kind === 'IMAGE' && a.tags.includes('established') && (a.provenance as { locationId?: string } | undefined)?.locationId === l.id);
  const prodName = (id?: string) => state.productions.find((p) => p.id === id)?.title;
  return (
    <CastSection id="bible" title="Location Bible" description={`What never changes about this place, and its light. Identity version ${version}: carried in every prompt that shows it.`}>
      <div className="card loc-bible">
        <div className="loc-bible-grid">
          <Field label="Architecture" help="What it is built of and how it looks: the building, its style, its condition."><Textarea rows={2} dir="auto" value={d.architecture} onChange={(e) => set({ architecture: e.target.value })} placeholder="e.g. a covered stall of old brick under a wooden awning" /></Field>
          <Field label="Lay of the land" help="Where it is: the street, the city, what surrounds it."><Textarea rows={2} dir="auto" value={d.geography} onChange={(e) => set({ geography: e.target.value })} placeholder="e.g. on a busy market street, between two bookshops" /></Field>
          <Field label="How its parts sit together" help="Left, right, behind: what a returning camera must find in the same place."><Textarea rows={2} dir="auto" value={d.spatial} onChange={(e) => set({ spatial: e.target.value })} placeholder="e.g. the counter faces the street; the stove at its right end" /></Field>
          <Field label="Materials" help="One per line."><Textarea rows={2} dir="auto" value={d.materials} onChange={(e) => set({ materials: e.target.value })} /></Field>
          <Field label="Entrances" help="One per line."><Textarea rows={2} dir="auto" value={d.entrances} onChange={(e) => set({ entrances: e.target.value })} /></Field>
          <Field label="Camera zones" help="Where the camera stands for its usual set-ups. One per line."><Textarea rows={2} dir="auto" value={d.zones} onChange={(e) => set({ zones: e.target.value })} /></Field>
        </div>
        <h3 className="t-title loc-bible-sub">Light</h3>
        <div className="loc-bible-grid loc-bible-grid3">
          <Field label="Key light" help="Where the main light comes from."><Input dir="auto" value={d.key} onChange={(e) => set({ key: e.target.value })} placeholder="e.g. daylight from the open street, camera left" /></Field>
          <Field label="Practical lights" help="Lamps and lights you can see in the set. One per line."><Textarea rows={2} dir="auto" value={d.practicals} onChange={(e) => set({ practicals: e.target.value })} /></Field>
          <Field label="Colour palette" help="The colours that keep the place recognisable. One per line."><Textarea rows={2} dir="auto" value={d.palette} onChange={(e) => set({ palette: e.target.value })} /></Field>
        </div>
        <div className="loc-bible-times">
          <span className="t-label">The light at each time of day</span>
          {times.length === 0 && <p className="t-meta">No time of day yet.</p>}
          {times.map((t) => (
            <Field key={t} label={timeWord(t)}><Input dir="auto" value={d.byTime[t] ?? ''} onChange={(e) => set({ byTime: { ...d.byTime, [t]: e.target.value } })} placeholder="Not written: the scene’s light words are used" /></Field>
          ))}
          <div className="loc-add">
            <select className="select" aria-label="Add a time of day" value={addTime} onChange={(e) => setAddTime(e.target.value as TimeOfDay | '')}>
              <option value="">Add a time of day…</option>
              {TIMES_OF_DAY.filter((t) => !times.includes(t)).map((t) => <option key={t} value={t}>{timeWord(t)}</option>)}
            </select>
            <Button variant="secondary" disabled={!addTime} onClick={() => { if (addTime) { set({ byTime: { ...d.byTime, [addTime]: d.byTime[addTime] ?? '' } }); setAddTime(''); } }}>Add</Button>
          </div>
        </div>
        <div className="loc-bible-foot">
          <span className="t-meta">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          {dirty && <Button variant="quiet" onClick={() => setD(initial)}>Discard</Button>}
          <Button variant="primary" disabled={!dirty} onClick={save}>Save the Location Bible</Button>
        </div>
      </div>
      <div className="loc-bible-est">
        <h3 className="t-title">Established in a cut <span className="ws-ro ws-count">{established.length}</span></h3>
        {established.length === 0 ? <p className="t-meta">Not yet. The first approved cut that shows this place makes its frames the place’s established look; a returning scene reuses them by id.</p> : (
          <ul className="pc-plates loc-plates" role="list">
            {established.map((a) => { const pv = a.provenance as { productionId?: string } | undefined; return (
              <li key={a.id}><MediaTile title={prodName(pv?.productionId) ?? 'An approved cut'} ratio="16/9" asset={usable(a) ? a : undefined} frameState={a.unavailable ? 'unavailable' : undefined} meta={[<StateWord key="s" tone="done">Established</StateWord>]} /></li>
            ); })}
          </ul>
        )}
      </div>
    </CastSection>
  );
}
