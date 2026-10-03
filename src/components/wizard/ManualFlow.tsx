'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Production, Season, Show, Song } from '@/domain/types';
import { ASPECTS, DIALECTS, type Aspect, type Dialect, type Language, type Style } from '@/domain/vocabulary';
import { nid } from '@/domain/actions';
import { splitLyrics } from '@/domain/lyrics';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, Field, FormFooter, Input, LinkButton, Segmented, Select, Textarea } from '@/components/ui/kit';
import { AspectGlyph, Panel, PickGrid, StylePicker, castItems, placeItems } from './parts';
import { SongPanel, type SongDraft } from './Song';
import { ASPECT_WORDS, KIND_INFO, dialectWords, firstError, lengthWords, titleFrom, validateManual, type CreateKind, type ManualErrors } from './model';
import type { PreviewState } from './CreateFlow';

/** MANUAL — the minimal brief (a title or one line; the look and the format have the studio's defaults), with the
 *  rest behind "More control": the cast from the real characters, the places, the genre, an exact length. A music
 *  video starts with its song and then its performers. Create writes the draft through the studio's commands
 *  (addShow, addSeason, addProduction, updateProduction) and lands on the new thing's own page. */

export function focusField(id: string) {
  const el = document.getElementById(id);
  const target = el && el.matches('input, textarea, select, button') ? el : el?.querySelector<HTMLElement>('input:not([type=file]), textarea, select, button');
  target?.focus();
  (target ?? el)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

export function ManualFlow({ kind, show, season, song, setSong, onPreview }: { kind: CreateKind; show?: Show; season?: Season; song: SongDraft; setSong: (s: SongDraft) => void; onPreview: (p: PreviewState) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { state, act } = useStudio();
  const info = KIND_INFO[kind];
  const def = state.settings.defaults;
  const inShow = kind === 'episode' || kind === 'season';
  const isMV = kind === 'music-video';
  const [title, setTitle] = useState('');
  const [line, setLine] = useState('');
  const [style, setStyle] = useState<Style>(show?.style ?? def.style);
  const [language, setLanguage] = useState<Language>(show?.language ?? def.language);
  const [dialect, setDialect] = useState<Dialect>(show?.dialect ?? def.dialect ?? 'IRAQI_BAGHDADI');
  const [aspect, setAspect] = useState<Aspect>(show?.aspect ?? (kind === 'short' ? def.aspect : def.aspect));
  const [seconds, setSeconds] = useState<number | null>(info.durations ? info.durations[1] : null);
  const [genre, setGenre] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [concept, setConcept] = useState<'PERFORMANCE' | 'NARRATIVE' | 'MIXED'>('PERFORMANCE');
  const [cast, setCast] = useState<string[]>([]);
  const [places, setPlaces] = useState<string[]>([]);
  const [errors, setErrors] = useState<ManualErrors>({});
  const [creating, setCreating] = useState(false);
  const inheritedCast = show?.castIds ?? [];
  const inheritedPlaces = show?.locationIds ?? [];
  const seasonNo = show ? state.seasons.filter((x) => x.showId === show.id).length + 1 : 1;
  const toggle = (set: (f: (xs: string[]) => string[]) => void) => (id: string) => set((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  useEffect(() => {
    onPreview({ title: kind === 'season' ? title : titleFrom(title, line), placeholder: kind === 'season' ? `Season ${seasonNo}` : `Untitled ${info.noun}`, state: 'Not made yet', slate: { style, language, dialect, seconds: seconds ?? undefined, aspect: kind === 'season' ? undefined : aspect } });
  }, [title, line, style, language, dialect, seconds, aspect, kind, info.noun, onPreview, seasonNo]);

  const create = () => {
    const e = validateManual(kind, { title, line, seconds, song: isMV ? { source: song.source, uploaded: Boolean(song.upload) } : undefined });
    setErrors(e);
    const first = firstError(e);
    if (first) { focusField(first === 'title' ? 'create-title' : first === 'song' ? 'create-song' : 'create-seconds'); return; }
    setCreating(true);
    const finalTitle = titleFrom(title, line);
    try {
      if (kind === 'season' && show) {
        const r = act('addSeason', show.id, title.trim() || undefined, line.trim());
        toast.ok(`${r.season.title} added to ${show.title}`);
        router.push(`/shows/${show.id}?tab=seasons&season=${r.season.id}`);
        return;
      }
      const brief = { mode: 'MANUAL' as const, text: line.trim() };
      const common = { title: finalTitle, titleAr: titleAr.trim() || undefined, logline: line.trim(), style, language, dialect: language === 'AR' ? dialect : undefined, aspect, brief, castIds: cast, locationIds: places };
      if (kind === 'show') {
        const r = act('addShow', { ...common, genre: genre.trim(), synopsis: line.trim() || undefined });
        toast.ok(`${r.show.title} is ready for its first episode`);
        router.push(`/shows/${r.show.id}`);
        return;
      }
      const prodKind: Production['kind'] = isMV ? 'MUSIC_VIDEO' : kind === 'short' ? 'SHORT' : 'EPISODE';
      const length = seconds ?? info.durations?.[1] ?? 60;
      const lyrics = song.lyrics.trim();
      const songRecord: Song | undefined = !isMV ? undefined : song.source === 'upload' && song.upload
        ? { id: nid('song'), title: finalTitle, source: 'UPLOADED', assetId: song.upload.assetId, durationSeconds: song.upload.duration ?? length, caption: song.about.trim(), lyrics: lyrics || undefined, sections: lyrics ? splitLyrics(lyrics, song.upload.duration ?? length).map((s) => ({ ...s, singerIds: cast })) : [], singerIds: cast }
        : { id: nid('song'), title: finalTitle, source: 'GENERATED_EXAMPLE', durationSeconds: length, caption: song.about.trim() || line.trim(), lyrics: lyrics || undefined, sections: splitLyrics(lyrics, length).map((s) => ({ ...s, singerIds: cast })), singerIds: cast };
      const r = act('addProduction', { ...common, kind: prodKind, showId: show?.id, seasonId: season?.id, targetSeconds: length, song: songRecord });
      if (isMV || genre.trim()) act('updateProduction', r.production.id, { genre: genre.trim() || undefined, ...(isMV ? { concept, artist: state.characters.filter((c) => cast.includes(c.id)).map((c) => c.name).join(' & ') || undefined } : {}) });
      toast.ok(`${r.production.title} is created as a draft`);
      router.push(productionHref(r.production));
    } catch (err) {
      setCreating(false);
      toast.bad((err as Error).message);
    }
  };

  const titleErr = errors.title;
  const castPanel = (
    <div className="create-field">
      <p className="label">{isMV ? 'Performers' : 'Cast'}</p>
      {state.characters.length ? (
        <PickGrid shape="figure" label={isMV ? 'Performers' : 'Cast'} items={castItems(state, (c) => (inheritedCast.includes(c.id) ? 'In the show' : undefined))} selected={cast} locked={inheritedCast} onToggle={toggle(setCast)} />
      ) : <p className="t-body">No characters yet. The studio can cast new ones once the story is written.</p>}
    </div>
  );
  const placesPanel = (
    <div className="create-field">
      <p className="label">Locations</p>
      {state.locations.length ? (
        <PickGrid shape="plate" label="Locations" items={placeItems(state)} selected={places} locked={inheritedPlaces} onToggle={toggle(setPlaces)} />
      ) : <p className="t-body">No locations yet. The studio proposes places with the story.</p>}
    </div>
  );

  return (
    <form className="create-flow" noValidate onSubmit={(e) => { e.preventDefault(); create(); }}>
      {isMV && <SongPanel mode="manual" song={song} setSong={(s) => { setSong(s); setErrors((x) => ({ ...x, song: undefined })); }} error={errors.song} />}

      <Panel id="create-brief-h" title={kind === 'season' ? 'The season' : 'The brief'} description={kind === 'season' ? 'A title or one line about the arc is enough. The season keeps the show’s language, cast and world.' : 'A title or one line is enough. Everything else has a default you can change.'}>
        <div className="create-stack">
          <Field label="Title" error={titleErr}>
            <Input id="create-title" className="input-lg" value={title} maxLength={120} autoComplete="off" placeholder={kind === 'season' ? `Season ${seasonNo}` : undefined}
              onChange={(e) => { setTitle(e.target.value); if (titleErr) setErrors((x) => ({ ...x, title: undefined })); }} />
          </Field>
          <Field label={kind === 'season' ? 'The arc' : 'One line'} optional help={kind === 'season' ? 'Where the season goes, in a sentence or two.' : 'What happens, to whom. The studio develops the story from it.'}>
            <Textarea rows={3} maxLength={4000} value={line} onChange={(e) => { setLine(e.target.value); if (titleErr) setErrors((x) => ({ ...x, title: undefined })); }} />
          </Field>
        </div>
      </Panel>

      {kind !== 'season' && (
        <Panel id="create-look-h" title="Look and format" description={inShow && show ? `From ${show.title}: the episode keeps the show’s style, language and format.` : 'The studio’s defaults are chosen; change any of them.'}>
          <div className="create-stack">
            {!inShow && <StylePicker value={style} onChange={(s) => s && setStyle(s)} />}
            {!inShow && (
              <div className="create-row">
                <div className="create-field">
                  <p className="label" id="create-lang-l">Language</p>
                  <Segmented label="Language" value={language} onChange={setLanguage} options={[{ value: 'EN', label: 'English' }, { value: 'AR', label: 'Arabic' }]} />
                </div>
                {language === 'AR' && (
                  <Field label="Dialect" className="create-field">
                    <Select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)} options={DIALECTS.map((d) => ({ value: d, label: dialectWords(d) }))} />
                  </Field>
                )}
              </div>
            )}
            <div className="create-row">
              {info.durations && (
                <div className="create-field">
                  <p className="label">Length</p>
                  <Segmented label="Length" value={seconds != null && info.durations.includes(seconds) ? String(seconds) : ''} onChange={(v) => { setSeconds(Number(v)); setErrors((x) => ({ ...x, seconds: undefined })); }} options={info.durations.map((d) => ({ value: String(d), label: lengthWords(d) }))} />
                </div>
              )}
              {!inShow && (
                <div className="create-field">
                  <p className="label">Format</p>
                  <Segmented label="Format" value={aspect} onChange={setAspect} options={ASPECTS.map((a) => ({ value: a, label: ASPECT_WORDS[a].label, icon: <AspectGlyph a={a} /> }))} />
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {isMV && <Panel id="create-performers-h" title="Performers" description="Who sings it on screen. Choose one or more, or let the studio cast them later.">{castPanel}</Panel>}

      {kind !== 'season' && (
        <details className="card create-panel create-more" open={Boolean(errors.seconds) || undefined}>
          <summary className="create-more-summary"><span className="t-title">More control</span><span className="t-body">{isMV ? 'Locations, treatment, genre and an exact length' : kind === 'show' ? 'Cast, locations, genre and an Arabic title' : 'Cast, locations, genre and an exact length'}</span></summary>
          <div className="create-stack create-more-body">
            {!isMV && castPanel}
            {placesPanel}
            {isMV && (
              <div className="create-field">
                <p className="label">Treatment</p>
                <Segmented label="Treatment" value={concept} onChange={setConcept} options={[{ value: 'PERFORMANCE', label: 'Performance' }, { value: 'NARRATIVE', label: 'Story' }, { value: 'MIXED', label: 'Both' }]} />
              </div>
            )}
            <div className="create-row">
              <Field label="Genre" optional className="create-field"><Input value={genre} maxLength={60} onChange={(e) => setGenre(e.target.value)} /></Field>
              {!inShow && <Field label="Arabic title" optional className="create-field"><Input value={titleAr} dir="rtl" lang="ar" maxLength={120} onChange={(e) => setTitleAr(e.target.value)} /></Field>}
              {info.durations && (
                <Field label="Exact length in seconds" optional error={errors.seconds} className="create-field">
                  <Input id="create-seconds" type="number" inputMode="numeric" min={5} max={3600} value={seconds ?? ''} onChange={(e) => { setSeconds(e.target.value === '' ? null : Number(e.target.value)); setErrors((x) => ({ ...x, seconds: undefined })); }} />
                </Field>
              )}
            </div>
          </div>
        </details>
      )}

      <FormFooter start={<span className="t-meta">Nothing is generated until you start production.</span>}>
        <LinkButton href={show && inShow ? `/shows/${show.id}` : info.back.href} variant="quiet">Cancel</LinkButton>
        <Button type="submit" variant="primary" loading={creating}>{`Create ${info.noun}`}</Button>
      </FormFooter>
    </form>
  );
}
