'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { IdeaPreferences, IdeaProposal, Season, Show, Song } from '@/domain/types';
import { ASPECTS, DIALECTS, type Aspect, type Dialect, type Language } from '@/domain/vocabulary';
import { nid } from '@/domain/actions';
import { splitLyrics } from '@/domain/lyrics';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, Field, FormFooter, Input, Notice, Segmented, Select, SettingsSummary, Textarea } from '@/components/ui/kit';
import { AudioPlayer } from '@/components/players/Controls';
import { nameLang } from '@/components/home/model';
import { IconShuffle } from '@/components/ui/icons';
import { AspectGlyph, Panel, PickGrid, StylePicker, figureOf, plateOf } from './parts';
import type { SongDraft } from './Song';
import { ASPECT_WORDS, KIND_INFO, LANGUAGE_WORDS, STYLE_WORDS, dialectWords, languageWords, lengthWords, type CreateKind } from './model';
import { focusField } from './ManualFlow';
import type { PreviewState } from './CreateFlow';

/** PICK — the studio's proposal as one editable sheet: the title and the line, the story's structure, who is in it
 *  and where it happens (keep or leave each), the look, the song for a music video, and how the studio developed it.
 *  Nothing exists until Create, which accepts the proposal through the studio's own command (acceptProposal). */

const PLATFORM: Record<string, string> = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', YOUTUBE: 'YouTube', NEWS: 'News', WIKIPEDIA: 'Wikipedia' };

export function Review({ kind, show, season, initial, proposalJobId, prefs, song, onAnother, anotherBusy, onBack, onPreview }: {
  kind: CreateKind; show?: Show; season?: Season; initial: IdeaProposal; proposalJobId?: string; prefs: IdeaPreferences; song: SongDraft;
  onAnother?: () => void; anotherBusy?: boolean; onBack: () => void; onPreview: (p: PreviewState) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { state, act } = useStudio();
  const info = KIND_INFO[kind];
  const isMV = kind === 'music-video';
  const inShow = kind === 'season' || kind === 'episode';
  const [p, setP] = useState<IdeaProposal>(initial);
  const [keepCast, setKeepCast] = useState<string[]>(initial.cast.map((c) => c.key));
  const [keepPlaces, setKeepPlaces] = useState<string[]>(initial.locations.map((l) => l.key));
  const [aspect, setAspect] = useState<Aspect>(show?.aspect ?? state.settings.defaults.aspect);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const set = (x: Partial<IdeaProposal>) => setP((cur) => ({ ...cur, ...x }));
  const toggle = (set_: (f: (xs: string[]) => string[]) => void) => (key: string) => set_((xs) => (xs.includes(key) ? xs.filter((x) => x !== key) : [...xs, key]));
  const uploaded = isMV && song.source === 'upload' && song.upload ? song.upload : null;

  useEffect(() => { onPreview({ title: p.title, placeholder: `Untitled ${info.noun}`, state: 'Proposed by the studio', slate: { style: p.style, language: p.language, dialect: p.dialect, seconds: p.durationSeconds, aspect: inShow ? undefined : aspect } }); }, [p.title, p.style, p.language, p.dialect, p.durationSeconds, aspect, info.noun, inShow, onPreview]);

  const create = () => {
    if (!p.title.trim()) { setError('The title can’t be empty.'); focusField('create-review-title'); return; }
    setCreating(true);
    try {
      const r = act('acceptProposal', { kind: info.request, showId: show?.id, seasonId: season?.id, aspect, proposal: { ...p, title: p.title.trim() }, keepCast, keepLocations: keepPlaces, preferences: prefs, proposalJobId });
      if (uploaded) {
        const prod = r.production;
        const lyrics = song.lyrics.trim();
        const dur = uploaded.duration ?? p.durationSeconds;
        const s: Song = { id: nid('song'), title: p.song?.title || p.title, source: 'UPLOADED', assetId: uploaded.assetId, durationSeconds: dur, caption: p.song?.caption ?? '', lyrics: lyrics || undefined, sections: lyrics ? splitLyrics(lyrics, dur).map((x) => ({ ...x, singerIds: prod.castIds })) : [], singerIds: prod.castIds };
        act('updateProduction', prod.id, { song: s, targetSeconds: dur });
      }
      toast.ok(`${p.title.trim()} is created as a draft`);
      const prod = r.production;
      router.push(kind === 'show' && prod.showId ? `/shows/${prod.showId}` : kind === 'season' && prod.showId ? `/shows/${prod.showId}?tab=seasons&season=${prod.seasonId}` : productionHref(prod));
    } catch (e) { setCreating(false); toast.bad((e as Error).message); }
  };

  const d = p.development;
  const sources = d?.research.coverage.filter((c) => ['OK', 'CACHED'].includes(c.status) && c.items > 0).map((c) => PLATFORM[c.platform] ?? c.platform) ?? [];
  const researchSentence = !d ? null : d.note || (sources.length ? `Built on what audiences watch now: ${d.research.itemIds.length} sources from ${sources.join(' and ')}.` : 'Original concept — no trend research was used.');
  const reviewWords = (r: NonNullable<typeof d>['reviews'][number]) => `${r.reviewer === 'STORY_EDITOR' ? 'Story editor' : 'Audience experience'} ${r.verdict === 'APPROVE' ? 'approved it' : 'asked for changes'}${r.draft === 1 ? ' in the first draft' : ''}`;

  return (
    <form className="create-flow" noValidate onSubmit={(e) => { e.preventDefault(); create(); }}>
      <Notice tone="ok" title="The studio proposes this">Change anything you like. Nothing is made until you create it.</Notice>

      <Panel id="create-review-h" title="The idea">
        <div className="create-stack">
          <Field label="Title" error={error}>
            <Input id="create-review-title" className="input-lg" value={p.title} maxLength={120} onChange={(e) => { set({ title: e.target.value }); setError(null); }} />
          </Field>
          <Field label="One line"><Textarea rows={2} value={p.logline} onChange={(e) => set({ logline: e.target.value })} /></Field>
          <Field label="Premise"><Textarea rows={5} value={p.premise} onChange={(e) => set({ premise: e.target.value })} /></Field>
          {d?.hook && <div className="create-field"><p className="label">The first seconds</p><p className="t-body content-para" dir="auto">{d.hook}</p></div>}
          <SettingsSummary items={[STYLE_WORDS[p.style].label, languageWords(p.language, p.dialect), lengthWords(p.durationSeconds), inShow ? null : ASPECT_WORDS[aspect].label, p.genre || null, p.mood || null]}>
            <div className="create-stack create-settings">
              {!inShow && <StylePicker value={p.style} onChange={(s) => s && set({ style: s })} />}
              {!inShow && (
                <div className="create-row">
                  <div className="create-field"><p className="label">Language</p><Segmented label="Language" value={p.language} onChange={(v: Language) => set({ language: v, dialect: v === 'AR' ? p.dialect ?? 'IRAQI_BAGHDADI' : undefined })} options={(['EN', 'AR'] as const).map((l) => ({ value: l, label: LANGUAGE_WORDS[l] }))} /></div>
                  {p.language === 'AR' && <Field label="Dialect" className="create-field"><Select value={p.dialect ?? 'IRAQI_BAGHDADI'} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectWords(x) }))} /></Field>}
                </div>
              )}
              <div className="create-row">
                <Field label="Length in seconds" className="create-field"><Input type="number" min={5} max={3600} value={p.durationSeconds} onChange={(e) => set({ durationSeconds: Math.max(5, Math.min(3600, Number(e.target.value) || 5)) })} /></Field>
                {!inShow && <div className="create-field"><p className="label">Format</p><Segmented label="Format" value={aspect} onChange={setAspect} options={ASPECTS.map((a) => ({ value: a, label: ASPECT_WORDS[a].label, icon: <AspectGlyph a={a} /> }))} /></div>}
              </div>
              <div className="create-row">
                <Field label="Genre" className="create-field"><Input value={p.genre} onChange={(e) => set({ genre: e.target.value })} /></Field>
                <Field label="Mood" className="create-field"><Input value={p.mood} onChange={(e) => set({ mood: e.target.value })} /></Field>
              </div>
            </div>
          </SettingsSummary>
        </div>
      </Panel>

      {p.structure.length > 0 && (
        <Panel id="create-structure-h" title={kind === 'show' ? 'The first episodes' : kind === 'season' ? 'The season’s episodes' : 'The story'} description={kind === 'show' || kind === 'season' ? 'The first becomes an episode now; the rest are the arc.' : 'Each becomes a scene of the story.'}>
          <ol className="create-structure">
            {p.structure.map((x, i) => (
              <li key={i}>
                <span className="t-ro-md create-structure-n">{i + 1}</span>
                <span className="create-structure-words"><span className="t-card content-para" dir="auto">{x.title}</span><span className="t-body content-para" dir="auto">{x.summary}</span></span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {isMV && (
        <Panel id="create-review-song-h" title="The song" description={uploaded ? 'Your song. The video follows its sections.' : 'Written by the studio; it is made when production starts.'}>
          {uploaded ? (
            <AudioPlayer src={uploaded.src} title={uploaded.name} duration={uploaded.duration} />
          ) : p.song ? (
            <div className="create-stack">
              <Field label="Song title"><Input value={p.song.title} onChange={(e) => set({ song: { ...p.song!, title: e.target.value } })} /></Field>
              <Field label="What it sounds like"><Textarea rows={2} value={p.song.caption} onChange={(e) => set({ song: { ...p.song!, caption: e.target.value } })} /></Field>
              <Field label="Lyrics" help="Blank lines separate the sections."><Textarea rows={8} value={p.song.lyrics} onChange={(e) => set({ song: { ...p.song!, lyrics: e.target.value } })} /></Field>
            </div>
          ) : <p className="t-body">The proposal has no song yet; the studio writes it when production starts.</p>}
        </Panel>
      )}

      <Panel id="create-review-cast-h" title={isMV ? 'Performers' : 'Cast'} description="Keep who the story needs. New characters are added to the studio without a picture; you cast them next.">
        {p.cast.length ? (
          <PickGrid shape="figure" label={isMV ? 'Performers' : 'Cast'} selected={keepCast} onToggle={toggle(setKeepCast)}
            items={p.cast.map((c) => { const ch = c.characterId ? state.characters.find((x) => x.id === c.characterId) : undefined; return { id: c.key, name: c.name, sub: ch ? (c.fromPreference ? 'Your choice' : 'In the studio') : 'New character', asset: ch ? figureOf(state, ch) : undefined }; })} />
        ) : <p className="t-body">The proposal names no one yet.</p>}
      </Panel>

      <Panel id="create-review-places-h" title="Locations">
        {p.locations.length ? (
          <PickGrid shape="plate" label="Locations" selected={keepPlaces} onToggle={toggle(setKeepPlaces)}
            items={p.locations.map((l) => { const loc = l.locationId ? state.locations.find((x) => x.id === l.locationId) : undefined; return { id: l.key, name: l.name, sub: loc ? 'In the studio' : 'New location', asset: loc ? plateOf(state, loc) : undefined }; })} />
        ) : <p className="t-body">The proposal names no place yet.</p>}
      </Panel>

      {d && (
        <details className="card create-panel create-more">
          <summary className="create-more-summary"><span className="t-title">How the studio developed this</span><span className="t-body">{researchSentence}</span></summary>
          <div className="create-stack create-more-body">
            {d.concepts && d.concepts.concepts.length > 0 && (
              <div className="create-field">
                <p className="label">{d.concepts.concepts.length} concepts were considered</p>
                <ul className="create-concepts" role="list">
                  {d.concepts.concepts.map((c) => (
                    <li key={c.id} data-chosen={c.id === d.concepts!.chosenId || undefined}>
                      <span className="create-concept-head"><span className="t-card name"><bdi lang={nameLang(c.title)}>{c.title}</bdi></span>{c.id === d.concepts!.chosenId && <span className="badge badge-ok">Chosen</span>}</span>
                      <span className="t-body content-para" dir="auto">{c.gloss?.logline ?? c.logline}</span>
                    </li>
                  ))}
                </ul>
                {d.concepts.rationale && <p className="t-meta content-para" dir="auto">{d.concepts.rationale}</p>}
              </div>
            )}
            {d.reviews.length > 0 && (
              <div className="create-field">
                <p className="label">Reviews</p>
                <ul className="create-reviews" role="list">
                  {d.reviews.map((r, i) => <li key={i}><span className="t-body">{reviewWords(r)}.</span>{r.summary && <span className="t-meta content-para" dir="auto">{r.summary}</span>}</li>)}
                </ul>
                {d.revisions > 0 && <p className="t-meta">The screenwriter revised the draft once to answer the notes.</p>}
              </div>
            )}
            {d.sources && d.sources.length > 0 && (
              <div className="create-field">
                <p className="label">Sources</p>
                <ul className="create-sources" role="list">
                  {d.sources.slice(0, 8).map((s) => <li key={s.id}><a className="link-quiet" href={s.url} target="_blank" rel="noreferrer noopener"><bdi>{s.title}</bdi></a><span className="t-meta">{PLATFORM[s.platform] ?? s.platform}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
      {d?.openIssues && d.openIssues.length > 0 && (
        <Notice tone="warn" title="The studio’s checks still note">
          <ul className="create-issues">{d.openIssues.map((x, i) => <li key={i} className="content-para" dir="auto">{x.note}</li>)}</ul>
        </Notice>
      )}

      <FormFooter start={<Button variant="quiet" onClick={onBack}>Back</Button>}>
        {onAnother && <Button icon={<IconShuffle />} onClick={onAnother} loading={anotherBusy} disabled={creating}>Write another</Button>}
        <Button type="submit" variant="primary" loading={creating}>{`Create ${info.noun}`}</Button>
      </FormFooter>
    </form>
  );
}
