'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import type { Season, Show } from '@/domain/types';
import { ASPECTS, DIALECTS, DURATIONS, STYLES, type Aspect, type Dialect, type Language, type Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { dialectLabel } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { Button, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui/kit';
import { FigureCard, MediaTile } from '@/components/media';
import { ASPECT_LABEL, BIBLE_PARTS, LANGUAGE_LABEL, STYLE_LABEL, episodesOfSeason, figure, minutes, plate, seasonsOfShow, type BibleKey } from './model';

/** THE SHOWS PAGES' DIALOGS — creating inside a show (New season, New episode) and editing it (details, cast, world,
 *  bible, a season). Each runs one existing studio command (src/domain/actions.ts through the store's `act`):
 *  addSeason · addProduction · updateShow · updateSeason. "Let the studio propose" hands over to the existing Auto Idea
 *  flow (/new/season, /new/episode), which writes a proposal for review before anything is created. Fields validate on
 *  submit and say what is missing beside the field. */

type Method = 'auto' | 'manual';
const METHODS = [{ value: 'auto' as const, label: 'Let the studio propose' }, { value: 'manual' as const, label: 'Write it yourself' }];

function useResetOnOpen(open: boolean, reset: () => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) reset(); }, [open]);
}

function Footer({ onClose, formId, children, busy }: { onClose: () => void; formId?: string; children: ReactNode; busy?: boolean }) {
  return <><Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>{formId ? <Button type="submit" form={formId} variant="primary" loading={busy}>{children}</Button> : children}</>;
}

// ------------------------------------------------------------------------------------------------- new season

export function NewSeasonDialog({ show, open, onClose }: { show: Show; open: boolean; onClose: () => void }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const formId = useId();
  const number = seasonsOfShow(state, show.id).length + 1;
  const [method, setMethod] = useState<Method>('manual');
  const [title, setTitle] = useState('');
  const [arc, setArc] = useState('');
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, () => { setMethod('manual'); setTitle(''); setArc(''); setError(null); });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !arc.trim()) { setError('Give the season a title or one line about it.'); return; }
    try {
      const r = act('addSeason', show.id, title.trim() || `Season ${number}`, arc.trim());
      toast.ok(`Season ${number} added`);
      onClose();
      router.replace(`/shows/${encodeURIComponent(show.id)}?season=${encodeURIComponent(r.season.id)}#episodes`, { scroll: false });
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="New season" description={<>Season {number} of <bdi>{show.title}</bdi>. It inherits the show’s cast, world and bible.</>}
      footer={method === 'manual' ? <Footer onClose={onClose} formId={formId}>Add season {number}</Footer> : <Footer onClose={onClose}><Link className="btn btn-primary" href={`/new/season?show=${encodeURIComponent(show.id)}`}>Continue to the proposal</Link></Footer>}>
      <div className="show-dialog">
        <Segmented label="How to start" value={method} onChange={setMethod} options={METHODS} />
        {method === 'auto' ? (
          <p className="t-body">The studio reads the show so far — its episodes, open storylines and cast — and proposes the season’s arc and its first episode. You review the proposal before anything is created.</p>
        ) : (
          <form id={formId} className="show-dialog-form" onSubmit={submit} noValidate>
            <Field label="Title" optional><Input value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder={`Season ${number}`} maxLength={120} /></Field>
            <Field label="What happens this season" error={error} help={error ? undefined : 'One line is enough. A title or this line is needed.'}>
              <Textarea value={arc} onChange={(e) => { setArc(e.target.value); setError(null); }} rows={3} maxLength={2000} />
            </Field>
          </form>
        )}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ new episode

export function NewEpisodeDialog({ show, seasonId, open, onClose }: { show: Show; seasonId?: string | null; open: boolean; onClose: () => void }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const formId = useId();
  const seasons = seasonsOfShow(state, show.id);
  const [sid, setSid] = useState<string>('');
  const [method, setMethod] = useState<Method>('manual');
  const [title, setTitle] = useState('');
  const [line, setLine] = useState('');
  const [length, setLength] = useState(String(DURATIONS.EPISODE[1]));
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, () => { setSid(seasons.find((s) => s.id === seasonId)?.id ?? seasons[seasons.length - 1]?.id ?? ''); setMethod('manual'); setTitle(''); setLine(''); setLength(String(DURATIONS.EPISODE[1])); setError(null); });
  const season = seasons.find((s) => s.id === sid);
  const number = season ? episodesOfSeason(state, season.id).length + 1 : 1;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!season) return;
    if (!title.trim()) { setError(line.trim() ? 'Give the episode a title.' : 'Give the episode a title; one line about it helps the studio.'); return; }
    try {
      const r = act('addProduction', {
        kind: 'EPISODE', showId: show.id, seasonId: season.id, title: title.trim(), logline: line.trim(), synopsis: '',
        style: show.style, language: show.language, dialect: show.dialect, aspect: show.aspect, targetSeconds: Number(length),
        brief: { mode: 'MANUAL', text: line.trim() }, castIds: [], locationIds: [],
      });
      toast.ok(`Episode ${number} added`);
      onClose();
      router.push(productionHref(r.production));
    } catch (err) { setError((err as Error).message); }
  };
  if (!season) return null;
  return (
    <Dialog open={open} onClose={onClose} title="New episode" description={<>Episode {number} of Season {season.number}, <bdi>{show.title}</bdi>. It inherits the show’s look, cast and world.</>}
      footer={method === 'manual' ? <Footer onClose={onClose} formId={formId}>Add episode {number}</Footer> : <Footer onClose={onClose}><Link className="btn btn-primary" href={`/new/episode?show=${encodeURIComponent(show.id)}&season=${encodeURIComponent(season.id)}`}>Continue to the proposal</Link></Footer>}>
      <div className="show-dialog">
        <Segmented label="How to start" value={method} onChange={setMethod} options={METHODS} />
        {seasons.length > 1 && (
          <Field label="Season"><Select value={sid} onChange={(e) => setSid(e.target.value)} options={seasons.map((s) => ({ value: s.id, label: `Season ${s.number}${s.title && s.title !== `Season ${s.number}` ? ` · ${s.title}` : ''}` }))} /></Field>
        )}
        {method === 'auto' ? (
          <p className="t-body">The studio continues from the show’s bible and the episodes before it, and proposes the next episode’s story. You review it before anything is created.</p>
        ) : (
          <form id={formId} className="show-dialog-form" onSubmit={submit} noValidate>
            <Field label="Title" error={error}><Input value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder={`Episode ${number}`} maxLength={120} required /></Field>
            <Field label="What happens" optional help="One line: the studio writes the story from it."><Textarea value={line} onChange={(e) => setLine(e.target.value)} rows={3} maxLength={2000} /></Field>
            <Field label="Length"><Select value={length} onChange={(e) => setLength(e.target.value)} options={DURATIONS.EPISODE.map((s) => ({ value: String(s), label: `About ${minutes(s)}` }))} /></Field>
          </form>
        )}
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------------------------- edit details

export function EditShowDialog({ show, open, onClose }: { show: Show; open: boolean; onClose: () => void }) {
  const { act } = useStudio();
  const toast = useToast();
  const formId = useId();
  const initial = () => ({ title: show.title, logline: show.logline, synopsis: show.synopsis ?? '', genre: show.genre, style: show.style, language: show.language, dialect: (show.dialect ?? 'IRAQI_BAGHDADI') as Dialect, aspect: show.aspect });
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, () => { setD(initial()); setError(null); });
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.title.trim()) { setError('A show needs a title.'); return; }
    act('updateShow', show.id, { ...d, title: d.title.trim(), logline: d.logline.trim(), synopsis: d.synopsis.trim() || undefined, genre: d.genre.trim(), dialect: d.language === 'AR' ? d.dialect : undefined });
    toast.ok('Show saved');
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Edit the show" footer={<Footer onClose={onClose} formId={formId}>Save</Footer>}>
      <form id={formId} className="show-dialog-form" onSubmit={submit} noValidate>
        <div className="show-dialog-cols">
          <Field label="Title" error={error}><Input value={d.title} onChange={(e) => { set({ title: e.target.value }); setError(null); }} maxLength={120} /></Field>
          <Field label="Genre" optional><Input value={d.genre} onChange={(e) => set({ genre: e.target.value })} maxLength={60} /></Field>
        </div>
        <Field label="Logline" optional><Input value={d.logline} onChange={(e) => set({ logline: e.target.value })} maxLength={300} /></Field>
        <Field label="Premise" optional><Textarea value={d.synopsis} onChange={(e) => set({ synopsis: e.target.value })} rows={4} /></Field>
        <div className="show-dialog-cols">
          <Field label="Style"><Select value={d.style} onChange={(e) => set({ style: e.target.value as Style })} options={STYLES.map((s) => ({ value: s, label: STYLE_LABEL[s] ?? s }))} /></Field>
          <Field label="Picture shape"><Select value={d.aspect} onChange={(e) => set({ aspect: e.target.value as Aspect })} options={ASPECTS.map((a) => ({ value: a, label: ASPECT_LABEL[a] ?? a }))} /></Field>
          <Field label="Language"><Select value={d.language} onChange={(e) => set({ language: e.target.value as Language })} options={(['EN', 'AR'] as const).map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))} /></Field>
          {d.language === 'AR' && <Field label="Dialect"><Select value={d.dialect} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x) }))} /></Field>}
        </div>
      </form>
    </Dialog>
  );
}

// -------------------------------------------------------------------------------------------- cast and world

/** The show's cast or world: every character (or location) of the studio as a toggle; saving runs updateShow. */
export function CanonDialog({ show, kind, open, onClose }: { show: Show; kind: 'cast' | 'world'; open: boolean; onClose: () => void }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const current = kind === 'cast' ? show.castIds : show.locationIds;
  const [ids, setIds] = useState<string[]>(current);
  useResetOnOpen(open, () => setIds(current));
  // ONE STYLE PER PRODUCTION (src/domain/style-rule.ts): the show's style only; a member of another style it already
  // has stays visible, marked, so it can be taken out
  const items = useMemo(() => {
    const offered = <X extends { id: string; style: Style }>(xs: X[]) => xs.filter((x) => x.style === show.style || current.includes(x.id));
    const other = (x: { style: Style }) => (x.style !== show.style ? ` · ${STYLE_LABEL[x.style] ?? x.style}, another style` : '');
    return kind === 'cast' ? offered(state.characters).map((c) => ({ ...figure(state, c), meta: `${c.role}${other(c)}` })) : offered(state.locations).map((l) => { const it = plate(state, l); return { ...it, meta: `${it.meta}${other(l)}` }; });
  }, [kind, state, show.style, current]);
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const save = () => { try { act('updateShow', show.id, kind === 'cast' ? { castIds: ids } : { locationIds: ids }); toast.ok(kind === 'cast' ? 'Cast saved' : 'World saved'); onClose(); } catch (e) { toast.bad((e as Error).message); } };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={kind === 'cast' ? 'The show’s cast' : 'The show’s world'}
      description={kind === 'cast' ? 'Every episode can use these characters with their canonical look and voice.' : 'Every episode can film in these places.'}
      footer={<Footer onClose={onClose}><Button variant="primary" onClick={save}>Save · {ids.length} chosen</Button></Footer>}>
      {items.length === 0 ? (
        <p className="t-body">{kind === 'cast' ? 'The studio has no characters yet.' : 'The studio has no locations yet.'} <Link className="shead-link" href={kind === 'cast' ? '/characters/new' : '/locations/new'}>{kind === 'cast' ? 'New character' : 'New location'}</Link></p>
      ) : (
        <ul className="show-pick" data-kind={kind} role="list">
          {items.map((it) => (
            <li key={it.id}>
              {kind === 'cast'
                ? <FigureCard onSelect={() => toggle(it.id)} selected={ids.includes(it.id)} asset={it.picture?.asset} src={it.picture?.src} name={it.name} nameLang={it.lang} badge={it.meta ? <span className="t-meta name"><bdi>{it.meta}</bdi></span> : undefined} />
                : <MediaTile onSelect={() => toggle(it.id)} selected={ids.includes(it.id)} asset={it.picture?.asset} src={it.picture?.src} title={it.name} titleLang={it.lang} meta={[it.meta]} />}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------- the bible

export function BibleDialog({ show, open, onClose }: { show: Show; open: boolean; onClose: () => void }) {
  const { act } = useStudio();
  const toast = useToast();
  const formId = useId();
  const read = () => { const b = show.bible ?? {}; return { worldRules: (b.worldRules ?? []).join('\n'), relationships: (b.relationships ?? []).join('\n'), timeline: (b.timeline ?? []).join('\n'), unresolved: (b.unresolved ?? []).join('\n'), styleNotes: b.styleNotes ?? '' }; };
  const [d, setD] = useState(read);
  useResetOnOpen(open, () => setD(read()));
  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    act('updateShow', show.id, { bible: { worldRules: lines(d.worldRules), relationships: lines(d.relationships), timeline: lines(d.timeline), unresolved: lines(d.unresolved), styleNotes: d.styleNotes.trim() || undefined } });
    toast.ok('Bible saved');
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="The show bible" description="One fact per line. The story engine respects these in every episode." footer={<Footer onClose={onClose} formId={formId}>Save the bible</Footer>}>
      <form id={formId} className="show-dialog-form" onSubmit={submit}>
        <div className="show-dialog-cols">
          {BIBLE_PARTS.map((p) => (
            <Field key={p.key} label={p.title} help={p.hint}><Textarea value={d[p.key as BibleKey]} onChange={(e) => setD({ ...d, [p.key]: e.target.value })} rows={4} /></Field>
          ))}
        </div>
        <Field label="Art direction" optional><Textarea value={d.styleNotes} onChange={(e) => setD({ ...d, styleNotes: e.target.value })} rows={2} /></Field>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ a season

export function EditSeasonDialog({ season, open, onClose }: { season: Season; open: boolean; onClose: () => void }) {
  const { act } = useStudio();
  const toast = useToast();
  const formId = useId();
  const [title, setTitle] = useState(season.title);
  const [arc, setArc] = useState(season.arc);
  useResetOnOpen(open, () => { setTitle(season.title); setArc(season.arc); });
  const submit = (e: React.FormEvent) => { e.preventDefault(); act('updateSeason', season.id, { title: title.trim() || `Season ${season.number}`, arc: arc.trim() }); toast.ok('Season saved'); onClose(); };
  return (
    <Dialog open={open} onClose={onClose} title={`Edit season ${season.number}`} footer={<Footer onClose={onClose} formId={formId}>Save</Footer>}>
      <form id={formId} className="show-dialog-form" onSubmit={submit}>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Season ${season.number}`} maxLength={120} /></Field>
        <Field label="What happens this season" optional><Textarea value={arc} onChange={(e) => setArc(e.target.value)} rows={4} /></Field>
      </form>
    </Dialog>
  );
}
