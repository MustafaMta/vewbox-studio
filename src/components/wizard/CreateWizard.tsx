'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { AutoIdeaRequest, IdeaPreferences, IdeaProposal, Production, Song } from '@/domain/types';
import { api } from '@/studio/api';
import { ASPECTS, DIALECTS, DURATIONS, STYLES, type Aspect, type Dialect, type Language, type Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { nid } from '@/domain/actions';
import { splitLyrics } from '@/domain/lyrics';
import { assetSrc, productionHref, seasonById, showById } from '@/studio/selectors';
import { SAMPLE_VARIANTS, sampleProposal } from '@/domain/proposals';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { AddTile, Button, ChoiceCards, Details, Dropzone, Field, Input, Modal, Notice, PickGrid, Segmented, Select, Textarea } from '@/components/ui/kit';
import { Art, Dots } from '@/components/ui/cinema';
import { CharacterForm } from '@/components/character/CharacterForm';
import { LocationForm } from '@/components/location/LocationForm';
import { AudioPlayer } from '@/components/players/Controls';
import { IconLocations as IconLocationPin, IconAuto, IconChevronLeft, IconChevronRight, IconManual, IconMusicVideos, IconPlus, IconPreferences, IconShuffle, IconStory, IconUpload, IconVersions } from '@/components/ui/icons';
import { aspectLabel, dialectLabel, fmtSeconds } from '@/lib/format';

export type WizardKind = 'show' | 'episode' | 'short' | 'music-video';
type StepId = 'song' | 'idea' | 'look' | 'people' | 'review';
const REQ_KIND: Record<WizardKind, AutoIdeaRequest['kind']> = { show: 'SHOW', episode: 'EPISODE', short: 'SHORT', 'music-video': 'MUSIC_VIDEO' };

/** CREATING — two ways in, side by side.
 *
 *  AUTO IDEA needs nothing: one button, "Create an idea for me". Preferences (style, language and dialect, length,
 *  mood, characters and places to include, a music video's treatment) are optional and collapsed; each defaults to
 *  "let the studio decide". For an episode the show's world is the context. The result — concept, title, premise,
 *  structure, cast and places, the song for a music video — comes back as one editable review; nothing is created
 *  until it is accepted. Automatic writing is not connected in this build, so the review holds a labelled SAMPLE
 *  proposal (src/demo/proposals.ts); the preferences still shape it the way a backend must.
 *
 *  MANUAL BRIEF needs a title or a short description, nothing else; look, people and (for a music video) the song
 *  are optional steps with defaults. */
export function CreateWizard({ kind, showId, seasonId }: { kind: WizardKind; showId?: string; seasonId?: string }) {
  const T = useT();
  const { state, jobs, startJob } = useStudio();
  const show = showById(state, showId);
  const season = seasonById(state, seasonId);
  const [path, setPath] = useState<'start' | 'manual' | 'review'>('start');
  const [prefs, setPrefs] = useState<IdeaPreferences>({});
  const [variant, setVariant] = useState(0);
  const [proposal, setProposal] = useState<IdeaProposal | null>(null);
  const [proposalJobId, setProposalJobId] = useState<string | undefined>();
  const [premise, setPremise] = useState('');
  const [waitingOn, setWaitingOn] = useState<string | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const heading = kind === 'show' ? T('wizard.newShow') : kind === 'episode' ? T('wizard.newEpisode') : kind === 'short' ? T('wizard.newShort') : T('wizard.newMusicVideo');
  const cancelHref = kind === 'episode' && show ? `/shows/${show.id}?tab=seasons${season ? `&season=${season.id}` : ''}` : kind === 'show' ? '/shows' : kind === 'short' ? '/shorts' : '/music-videos';
  const request = (): AutoIdeaRequest => ({ kind: REQ_KIND[kind], showId: show?.id, seasonId: season?.id, preferences: prefs });
  /** The written example, for when no story engine is reachable. Labelled as a sample wherever it appears. */
  const proposeSample = (v: number) => { setVariant(v); setProposal(sampleProposal(state, request(), v)); setProposalJobId(undefined); setPath('review'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  /** The real thing: an AUTO_IDEA job; the review opens when it finishes. */
  const propose = async () => {
    setProposeError(null);
    try { const job = await startJob('AUTO_IDEA', { ...request(), brief: premise.trim() || undefined }); setWaitingOn(job.id); }
    catch (e) { setProposeError((e as Error).message); }
  };
  const waiting = waitingOn ? jobs.find((j) => j.id === waitingOn) : undefined;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const openProposal = useCallback((id: string, jobId?: string) => api.proposal(id).then((r) => { setProposal(r.proposal); setProposalJobId(jobId ?? r.jobId ?? undefined); setWaitingOn(null); setPath('review'); const q = new URLSearchParams(sp.toString()); q.set('proposal', id); router.replace(`${pathname}?${q}`, { scroll: false }); window.scrollTo({ top: 0, behavior: 'smooth' }); }), [router, pathname, sp]);
  useEffect(() => {
    if (!waiting) return;
    if (waiting.status === 'COMPLETED' && waiting.result?.proposalId) openProposal(String(waiting.result.proposalId), waiting.id).catch((e) => { setProposeError((e as Error).message); setWaitingOn(null); });
    else if (waiting.status === 'FAILED' || waiting.status === 'CANCELLED') { setProposeError(waiting.error?.message ?? T('auto.failed')); setWaitingOn(null); }
  }, [waiting, T, openProposal]);
  // a proposal already written (the page was reloaded, or a link was shared) reopens its review
  const urlProposal = sp.get('proposal');
  useEffect(() => { if (urlProposal && !proposal) openProposal(urlProposal).catch(() => {}); }, [urlProposal, proposal, openProposal]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          {kind === 'episode' && show && <p className="eyebrow mb-1" dir="auto">{show.title}{season ? ` · ${T('kind.SEASON')} ${season.number}` : ''}</p>}
          <h1 className="h1">{heading}</h1>
        </div>
        <Link href={cancelHref} className="btn btn-ghost btn-sm">{T('btn.cancel')}</Link>
      </div>

      {path === 'start' && (
        <div className="space-y-4 fade-in">
          <section className="card p-5 sm:p-6" aria-labelledby="auto-h">
            <div className="flex items-start gap-4">
              <span aria-hidden className="grid size-11 flex-none place-items-center rounded-xl bg-accent-soft text-violet-300 [&>svg]:size-5"><IconAuto /></span>
              <div className="min-w-0 flex-1">
                <h2 id="auto-h" className="h2">{T('auto.title')}</h2>
                <p className="mt-1 text-[13.5px] text-muted">{T('auto.lead')}</p>
                {kind === 'episode' && show && <p className="mt-2 text-[12.5px] text-faint" dir="auto">{T('auto.showContext')} {show.title}: {T.dyn(`style.${show.style}`)} · {show.castIds.length} {T('tab.characters').toLowerCase()} · {show.locationIds.length} {T('tab.locations').toLowerCase()}.</p>}
              </div>
            </div>
            <div className="mt-5"><Field label={T('auto.premiseLabel')} help={T('auto.premiseHint')}><Textarea value={premise} onChange={(e) => setPremise(e.target.value)} rows={2} maxLength={4000} /></Field></div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button variant="primary" className="btn-lg" icon={<IconAuto />} onClick={() => void propose()} loading={Boolean(waiting)} disabled={Boolean(waiting)}>{T('auto.create')}</Button>
              {waiting ? <span className="text-[12px] text-muted">{waiting.progress?.message ?? T('auto.writing')} · {T('auto.writingHint')}</span> : <span className="text-[12px] text-faint">{T('auto.nothingRequired')}</span>}
              <Button variant="quiet" size="sm" onClick={() => proposeSample(0)} disabled={Boolean(waiting)}>{T('auto.useSample')}</Button>
            </div>
            {proposeError && <Notice tone="bad" className="mt-4" title={T('auto.failed')} action={<Button size="sm" variant="secondary" onClick={() => proposeSample(0)}>{T('auto.useSample')}</Button>}>{proposeError}</Notice>}
            <Details summary={<span className="inline-flex items-center gap-1.5"><IconPreferences aria-hidden className="size-4" />{T('auto.preferences')}{Object.values(prefs).some((v) => (Array.isArray(v) ? v.length : v)) ? <span className="badge badge-accent ms-1">{T('auto.preferencesSet')}</span> : null}</span>} className="mt-5 border-t border-line/70 pt-4">
              <Preferences kind={kind} prefs={prefs} setPrefs={setPrefs} inheritsFromShow={Boolean(show)} />
            </Details>
          </section>

          <section className="card flex flex-wrap items-center gap-4 p-5 sm:p-6" aria-labelledby="manual-h">
            <span aria-hidden className="grid size-11 flex-none place-items-center rounded-xl bg-raised-2 text-muted [&>svg]:size-5"><IconManual /></span>
            <div className="min-w-0 flex-1 basis-60"><h2 id="manual-h" className="h2">{T('manual.title')}</h2><p className="mt-1 text-[13.5px] text-muted">{T('manual.lead')}</p></div>
            <Button variant="secondary" icon={<IconManual />} onClick={() => setPath('manual')}>{T('manual.start')}</Button>
          </section>
        </div>
      )}

      {path === 'review' && proposal && <Review kind={kind} showId={show?.id} seasonId={season?.id} proposal={proposal} setProposal={setProposal} prefs={prefs} proposalJobId={proposalJobId} onBack={() => setPath('start')} onAnother={proposal.sample ? (SAMPLE_VARIANTS[REQ_KIND[kind]] > 1 ? () => proposeSample(variant + 1) : undefined) : () => { setPath('start'); void propose(); }} />}
      {path === 'manual' && <Manual kind={kind} showId={show?.id} seasonId={season?.id} onBack={() => setPath('start')} />}
    </div>
  );
}

/** The optional preferences. Each one starts at "let the studio decide". */
function Preferences({ kind, prefs, setPrefs, inheritsFromShow }: { kind: WizardKind; prefs: IdeaPreferences; setPrefs: (p: IdeaPreferences) => void; inheritsFromShow: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const set = (p: Partial<IdeaPreferences>) => setPrefs({ ...prefs, ...p });
  const durations = DURATIONS[kind === 'music-video' ? 'MUSIC_VIDEO' : kind === 'short' ? 'SHORT' : 'EPISODE'];
  const auto = inheritsFromShow ? T('auto.fromShow') : T('auto.decide');
  const toggle = (key: 'castIds' | 'locationIds', id: string) => { const xs = prefs[key] ?? []; set({ [key]: xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id] }); };
  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-faint">{T('auto.preferencesHint')}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><p className="label">{T('label.style')}</p><Segmented label={T('label.style')} value={prefs.style ?? 'AUTO'} onChange={(v) => set({ style: v === 'AUTO' ? undefined : (v as Style) })} options={[{ value: 'AUTO', label: auto }, ...STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))]} /></div>
        <div><p className="label">{T('label.language')}</p><Segmented label={T('label.language')} value={prefs.language ?? 'AUTO'} onChange={(v) => set({ language: v === 'AUTO' ? undefined : (v as Language), dialect: v === 'EN' ? undefined : prefs.dialect })} options={[{ value: 'AUTO', label: auto }, { value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }]} /></div>
        {prefs.language !== 'EN' && <Field label={T('label.dialect')}><Select value={prefs.dialect ?? ''} onChange={(e) => set({ dialect: (e.target.value || undefined) as Dialect | undefined })} placeholder={auto} options={DIALECTS.map((d) => ({ value: d, label: dialectLabel(d, T.locale) }))} /></Field>}
        <div><p className="label">{T('label.duration')}</p><Segmented label={T('label.duration')} value={prefs.durationSeconds ? String(prefs.durationSeconds) : 'AUTO'} onChange={(v) => set({ durationSeconds: v === 'AUTO' ? undefined : Number(v) })} options={[{ value: 'AUTO', label: auto }, ...durations.map((d) => ({ value: String(d), label: fmtSeconds(d) }))]} /></div>
        <Field label={T('auto.mood')} hint={T('wizard.optional')} help={T('auto.moodHelp')}><Input value={prefs.mood ?? ''} onChange={(e) => set({ mood: e.target.value || undefined })} /></Field>
        {kind === 'music-video' && <div><p className="label">{T('wizard.concept')}</p><Segmented label={T('wizard.concept')} value={prefs.concept ?? 'AUTO'} onChange={(v) => set({ concept: v === 'AUTO' ? undefined : (v as IdeaPreferences['concept']) })} options={[{ value: 'AUTO', label: T('auto.decide') }, { value: 'PERFORMANCE', label: T('mv.concept.PERFORMANCE') }, { value: 'NARRATIVE', label: T('mv.concept.NARRATIVE') }, { value: 'MIXED', label: T('mv.concept.MIXED') }]} /></div>}
      </div>
      <div>
        <p className="label">{kind === 'music-video' ? T('auto.includePerformers') : T('auto.includeCast')}</p>
        <p className="help -mt-1 mb-2">{T('auto.includeHint')}</p>
        <PickGrid items={state.characters.map((c) => ({ id: c.id, label: c.name, src: assetSrc(state, c.portraitAssetId), sub: c.role }))} selected={prefs.castIds ?? []} onToggle={(id) => toggle('castIds', id)} empty={<p className="text-sm text-faint">{T('empty.characters')}</p>} />
      </div>
      <div>
        <p className="label">{T('auto.includeLocations')}</p>
        <PickGrid ratio="aspect-video" items={state.locations.map((l) => ({ id: l.id, label: l.name, src: assetSrc(state, l.masterAssetId), sub: l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior') }))} selected={prefs.locationIds ?? []} onToggle={(id) => toggle('locationIds', id)} empty={<p className="text-sm text-faint">{T('empty.locations')}</p>} />
      </div>
    </div>
  );
}

/** THE REVIEW — the whole proposal, editable, before anything exists. */
function Review({ kind, showId, seasonId, proposal, setProposal, prefs, onBack, onAnother, proposalJobId }: { kind: WizardKind; showId?: string; seasonId?: string; proposal: IdeaProposal; setProposal: (p: IdeaProposal) => void; prefs: IdeaPreferences; onBack: () => void; onAnother?: () => void; proposalJobId?: string }) {
  const T = useT();
  const router = useRouter();
  const toast = useToast();
  const { state, act } = useStudio();
  const [keepCast, setKeepCast] = useState<string[]>(proposal.cast.map((c) => c.key));
  const [keepLocs, setKeepLocs] = useState<string[]>(proposal.locations.map((l) => l.key));
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<Aspect>(showById(state, showId)?.aspect ?? state.settings.defaults.aspect);
  const set = (p: Partial<IdeaProposal>) => setProposal({ ...proposal, ...p });
  const toggle = (xs: string[], set_: (v: string[]) => void, key: string) => set_(xs.includes(key) ? xs.filter((x) => x !== key) : [...xs, key]);
  const isMV = kind === 'music-video';
  const create = () => {
    if (!proposal.title.trim()) { setError(T('wizard.needTitle')); return; }
    try {
      const r = act('acceptProposal', { kind: REQ_KIND[kind], showId, seasonId, aspect, proposal, keepCast, keepLocations: keepLocs, preferences: prefs, proposalJobId });
      toast.ok(T('toast.created'));
      router.push(productionHref(r.production));
    } catch (e) { setError((e as Error).message); }
  };
  const badge = (x: { isNew: boolean; fromPreference: boolean }) => x.fromPreference ? <span className="badge badge-accent">{T('auto.yourChoice')}</span> : x.isNew ? <span className="badge badge-info">{T('auto.new')}</span> : <span className="badge">{T('auto.existing')}</span>;
  return (
    <div className="space-y-6 fade-in">
      {proposal.sample ? <Notice tone="info" title={T('auto.sampleTitle')}>{T('auto.sampleBody')}</Notice> : <Notice tone="ok" title={T('auto.generatedTitle')}>{T('auto.generatedBody')}</Notice>}
      <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="concept-h">
        <div className="flex items-center justify-between gap-2"><h2 id="concept-h" className="h2">{T('auto.concept')}</h2>{proposal.sample && <span className="badge">{T('label.sample')}</span>}</div>
        <Field label={T('label.title')} required error={error}><Input value={proposal.title} onChange={(e) => { set({ title: e.target.value }); setError(null); }} /></Field>
        <Field label={T('label.logline')}><Input value={proposal.logline} onChange={(e) => set({ logline: e.target.value })} /></Field>
        <Field label={T('auto.premise')}><Textarea value={proposal.premise} onChange={(e) => set({ premise: e.target.value })} rows={4} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={T('label.genre')}><Input value={proposal.genre} onChange={(e) => set({ genre: e.target.value })} /></Field>
          <Field label={T('auto.mood')}><Input value={proposal.mood} onChange={(e) => set({ mood: e.target.value })} /></Field>
          <Field label={T('label.style')}><Select value={proposal.style} onChange={(e) => set({ style: e.target.value as Style })} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} /></Field>
          <Field label={T('label.language')}><Select value={proposal.language} onChange={(e) => set({ language: e.target.value as Language, dialect: e.target.value === 'AR' ? proposal.dialect ?? state.settings.defaults.dialect : undefined })} options={[{ value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }]} /></Field>
          {proposal.language === 'AR' && <Field label={T('label.dialect')}><Select value={proposal.dialect ?? 'IRAQI_BAGHDADI'} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((d) => ({ value: d, label: dialectLabel(d, T.locale) }))} /></Field>}
          <Field label={`${T('label.duration')} (${T('label.seconds')})`}><Input type="number" min={5} max={3600} value={proposal.durationSeconds} onChange={(e) => set({ durationSeconds: Number(e.target.value) || 5 })} /></Field>
          {kind !== 'episode' && <Field label={T('label.aspect')}><Select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} options={ASPECTS.map((a) => ({ value: a, label: aspectLabel(a) }))} /></Field>}
          {isMV && <Field label={T('wizard.concept')}><Select value={proposal.concept ?? 'PERFORMANCE'} onChange={(e) => set({ concept: e.target.value as IdeaProposal['concept'] })} options={(['PERFORMANCE', 'NARRATIVE', 'MIXED'] as const).map((c) => ({ value: c, label: T.dyn(`mv.concept.${c}`) }))} /></Field>}
        </div>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="structure-h">
        <h2 id="structure-h" className="h2">{kind === 'show' ? T('auto.firstEpisodes') : T('auto.structure')}</h2>
        <ol className="mt-3 space-y-2">{proposal.structure.map((x, i) => <li key={i} className="flex gap-3 rounded-lg bg-input px-3 py-2.5"><span className="num mt-0.5 grid size-6 flex-none place-items-center rounded-md bg-raised-2 text-[12px] font-semibold">{i + 1}</span><span className="min-w-0"><span className="block text-[13.5px] font-semibold text-fg" dir="auto">{x.title}</span><span className="block text-[12.5px] text-muted" dir="auto">{x.summary}</span></span></li>)}</ol>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="cast-h">
        <h2 id="cast-h" className="h2">{isMV ? T('step.performers') : T('label.cast')}</h2>
        <p className="mt-1 text-[12.5px] text-faint">{T('auto.castHint')}</p>
        <ul className="mt-3 space-y-2">
          {proposal.cast.map((c) => {
            const on = keepCast.includes(c.key);
            const existing = c.characterId ? state.characters.find((x) => x.id === c.characterId) : undefined;
            return (
              <li key={c.key} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-line-strong bg-raised' : 'border-line opacity-60'}`}>
                <div className="w-12 flex-none">{existing ? <Art src={assetSrc(state, existing.portraitAssetId)} ratio="portrait" title={c.name} className="!rounded-md" /> : <span aria-hidden className="grid aspect-[4/5] w-full place-items-center rounded-md border border-dashed border-line-strong bg-input text-[15px] font-semibold text-muted">{c.name.trim().charAt(0) || '?'}</span>}</div>
                <div className="min-w-0 flex-1">
                  {c.isNew ? (
                    <div className="grid gap-2 sm:grid-cols-2"><Input aria-label={`${T('label.name')} (${c.name})`} value={c.name} onChange={(e) => set({ cast: proposal.cast.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)) })} /><Input aria-label={`${T('label.role')} (${c.name})`} value={c.role} onChange={(e) => set({ cast: proposal.cast.map((x) => (x.key === c.key ? { ...x, role: e.target.value } : x)) })} /></div>
                  ) : <p className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold text-fg" dir="auto">{c.name}</span><span className="text-[12.5px] text-faint" dir="auto">{c.role}</span></p>}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">{badge(c)}<span dir="auto">{c.reason}</span></p>
                </div>
                <label className="flex flex-none cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" className="check" checked={on} onChange={() => toggle(keepCast, setKeepCast, c.key)} aria-label={`${T('auto.include')} ${c.name}`} />{T('auto.include')}</label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="loc-h">
        <h2 id="loc-h" className="h2">{T('label.locations')}</h2>
        <ul className="mt-3 space-y-2">
          {proposal.locations.map((l) => {
            const on = keepLocs.includes(l.key);
            const existing = l.locationId ? state.locations.find((x) => x.id === l.locationId) : undefined;
            return (
              <li key={l.key} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-line-strong bg-raised' : 'border-line opacity-60'}`}>
                <div className="w-20 flex-none">{existing ? <Art src={assetSrc(state, existing.masterAssetId)} ratio="wide" title={l.name} className="!rounded-md" /> : <span aria-hidden className="grid aspect-video w-full place-items-center rounded-md border border-dashed border-line-strong bg-input text-muted [&>svg]:size-4"><IconLocationPin /></span>}</div>
                <div className="min-w-0 flex-1">
                  {l.isNew ? <Input aria-label={`${T('label.name')} (${l.name})`} value={l.name} onChange={(e) => set({ locations: proposal.locations.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)) })} /> : <p className="text-[14px] font-semibold text-fg" dir="auto">{l.name}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">{badge(l)}<span className="line-clamp-1" dir="auto">{l.description}</span></p>
                </div>
                <label className="flex flex-none cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" className="check" checked={on} onChange={() => toggle(keepLocs, setKeepLocs, l.key)} aria-label={`${T('auto.include')} ${l.name}`} />{T('auto.include')}</label>
              </li>
            );
          })}
        </ul>
      </section>

      {isMV && proposal.song && (
        <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="song-h">
          <h2 id="song-h" className="h2">{T('wizard.song')}</h2>
          <Field label={T('song.title')}><Input value={proposal.song.title} onChange={(e) => set({ song: { ...proposal.song!, title: e.target.value } })} /></Field>
          <Field label={T('wizard.songCaption')}><Textarea value={proposal.song.caption} rows={2} onChange={(e) => set({ song: { ...proposal.song!, caption: e.target.value } })} /></Field>
          <Field label={T('wizard.lyrics')} help={T('wizard.lyrics.help')}><Textarea value={proposal.song.lyrics} rows={6} onChange={(e) => set({ song: { ...proposal.song!, lyrics: e.target.value } })} /></Field>
          <p className="text-[12px] text-faint">{T('wizard.createdSong')}</p>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" icon={<IconChevronLeft className="rtl:rotate-180" />} onClick={onBack}>{T('auto.backToPreferences')}</Button>
        <div className="flex flex-wrap items-center gap-2">
          {onAnother && <Button variant="secondary" icon={<IconShuffle />} onClick={onAnother}>{proposal.sample ? T('auto.another') : T('auto.writeAnother')}</Button>}
          <Button variant="primary" onClick={create}>{T('wizard.createProject')}</Button>
        </div>
      </div>
    </div>
  );
}

/** MANUAL BRIEF — a title or a description is enough; everything after has a default. */
function Manual({ kind, showId, seasonId, onBack }: { kind: WizardKind; showId?: string; seasonId?: string; onBack: () => void }) {
  const T = useT();
  const router = useRouter();
  const toast = useToast();
  const { state, act, addFile } = useStudio();
  const show = showById(state, showId);
  const season = seasonById(state, seasonId);
  const def = state.settings.defaults;
  const isMV = kind === 'music-video';
  const prodKind: Production['kind'] = isMV ? 'MUSIC_VIDEO' : kind === 'short' ? 'SHORT' : 'EPISODE';
  const steps: StepId[] = isMV ? ['idea', 'song', 'look', 'people', 'review'] : ['idea', 'look', 'people', 'review'];
  const stepLabel: Record<StepId, string> = { song: T('step.song'), idea: T('step.brief'), look: T('step.look'), people: isMV ? T('step.performers') : T('step.people'), review: T('step.review') };
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const [text, setText] = useState(''); const [title, setTitle] = useState('');
  const [style, setStyle] = useState<Style>(show?.style ?? def.style);
  const [language, setLanguage] = useState<Language>(show?.language ?? def.language);
  const [dialect, setDialect] = useState<Dialect>(show?.dialect ?? def.dialect);
  const [aspect, setAspect] = useState<Aspect>(show?.aspect ?? def.aspect);
  const durations = DURATIONS[prodKind];
  const [duration, setDuration] = useState<number>(durations[1]);
  const [concept, setConcept] = useState<'PERFORMANCE' | 'NARRATIVE' | 'MIXED'>('PERFORMANCE');
  const [cast, setCast] = useState<string[]>([]); const [locs, setLocs] = useState<string[]>([]);
  const inheritedCast = show?.castIds ?? []; const inheritedLocs = show?.locationIds ?? [];
  const [titleAr, setTitleAr] = useState(''); const [genre, setGenre] = useState(''); const [logline, setLogline] = useState('');
  const [songMode, setSongMode] = useState<'LATER' | 'GENERATE' | 'UPLOAD'>('LATER');
  const [caption, setCaption] = useState(''); const [lyrics, setLyrics] = useState('');
  const [upload, setUpload] = useState<{ assetId: string; name: string; duration?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finalTitle = (title.trim() || text.trim().split(/\n/)[0].slice(0, 60) || '').trim();

  const validate = (s: StepId): string | null => {
    if (s === 'idea' && !title.trim() && !text.trim()) return T('wizard.needTitle');
    if (s === 'song' && songMode === 'GENERATE' && !caption.trim() && !lyrics.trim()) return T('wizard.needSongWords');
    if (s === 'song' && songMode === 'UPLOAD' && !upload) return T('wizard.needSongFile');
    return null;
  };
  const next = () => { const e = validate(step); setError(e); if (!e) { setStepIdx((i) => Math.min(i + 1, steps.length - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const back = () => { setError(null); if (stepIdx === 0) onBack(); else setStepIdx((i) => i - 1); };
  const buildSong = (): Song | undefined => {
    if (!isMV) return undefined;
    if (songMode === 'UPLOAD' && upload) return { id: nid('song'), title: finalTitle, source: 'UPLOADED', assetId: upload.assetId, durationSeconds: upload.duration ?? duration, caption: '', sections: [], singerIds: cast };
    if (songMode === 'GENERATE') return { id: nid('song'), title: finalTitle, source: 'GENERATED_EXAMPLE', durationSeconds: duration, caption: caption.trim(), sections: splitLyrics(lyrics, duration).map((s) => ({ ...s, singerIds: cast })), singerIds: cast };
    return undefined;
  };
  const create = () => {
    for (const s of steps) { const e = validate(s); if (e) { setStepIdx(steps.indexOf(s)); setError(e); return; } }
    const brief = { mode: 'MANUAL' as const, text: text.trim() };
    const common = { title: finalTitle, titleAr: titleAr || undefined, logline: logline.trim(), style, language, dialect: language === 'AR' ? dialect : undefined, aspect, targetSeconds: duration, brief, castIds: cast, locationIds: locs };
    let href = '/';
    try {
      if (kind === 'show') {
        const r = act('addShow', { ...common, logline: common.logline || brief.text, genre: genre.trim(), castIds: cast, locationIds: locs });
        const ep = act('addProduction', { ...common, title: `${T('kind.EPISODE')} 1`, titleAr: undefined, kind: 'EPISODE', showId: r.show.id, seasonId: r.season.id, castIds: [], locationIds: [] });
        href = productionHref(ep.production);
      } else {
        const r = act('addProduction', { ...common, kind: prodKind, showId: show?.id, seasonId: season?.id, song: buildSong() });
        href = productionHref(r.production);
        if (isMV || genre.trim()) act('updateProduction', r.production.id, { genre: genre.trim() || undefined, ...(isMV ? { concept, artist: state.characters.filter((c) => cast.includes(c.id)).map((c) => c.name).join(' & ') || undefined } : {}) });
      }
    } catch (e) { setError((e as Error).message); return; }
    toast.ok(T('toast.created'));
    router.push(href);
  };
  const onFile = async (f: File) => { if (!f.type.startsWith('audio/')) { setError(T('voice.notAudio')); return; } const r = await addFile(f, { label: f.name, tags: ['song', 'upload'] }); if (!r.ok) { toast.bad(r.error); return; } setUpload({ assetId: r.asset.id, name: f.name }); setError(null); toast.ok(T('media.added')); };
  const sampleTrack = state.assets.find((x) => x.id === 'song-uploaded');
  const castNames = state.characters.filter((c) => cast.includes(c.id) || inheritedCast.includes(c.id)).map((c) => c.name);
  const locNames = state.locations.filter((l) => locs.includes(l.id) || inheritedLocs.includes(l.id)).map((l) => l.name);
  const heading = kind === 'show' ? T('wizard.newShow') : kind === 'episode' ? T('wizard.newEpisode') : kind === 'short' ? T('wizard.newShort') : T('wizard.newMusicVideo');

  return (
    <div className="fade-in">
      <ol className="stepper mb-8 flex-wrap" aria-label={T('manual.title')}>
        {steps.map((s, i) => <li key={s} className="contents"><button type="button" className="inline-flex items-center gap-2 rounded-md disabled:cursor-default" aria-current={i === stepIdx ? 'step' : undefined} data-done={i < stepIdx ? '' : undefined} disabled={i > stepIdx} onClick={() => { setError(null); setStepIdx(i); }}><span className="stepper-n">{i + 1}</span><span className={i === stepIdx ? 'text-fg' : ''}>{stepLabel[s]}</span></button>{i < steps.length - 1 && <span className="h-px w-6 bg-line" aria-hidden />}</li>)}
      </ol>
      {kind === 'episode' && show && stepIdx === 0 && <p className="mb-5 text-sm text-muted">{T('wizard.inherits')}</p>}

      <div className="fade-in" key={step}>
        {step === 'idea' && (
          <section className="space-y-5" aria-labelledby="w-idea">
            <div><h2 id="w-idea" className="h2">{T('manual.title')}</h2><p className="mt-1 text-sm text-muted">{T('manual.lead')}</p></div>
            <div className="card space-y-4 p-5">
              <Field label={T('label.title')} error={error && !title.trim() && !text.trim() ? error : null}><Input value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} autoFocus /></Field>
              <Field label={T('manual.description')} hint={T('wizard.optional')} help={T('manual.descriptionHelp')}><Textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={5} /></Field>
            </div>
          </section>
        )}

        {step === 'song' && (
          <section className="space-y-5" aria-labelledby="w-song">
            <div><h2 id="w-song" className="h2">{T('wizard.song')}</h2><p className="mt-1 text-sm text-muted">{T('manual.songOptional')}</p></div>
            <ChoiceCards name="song" columns={3} value={songMode} onChange={(v) => { setSongMode(v); setError(null); }} options={[{ value: 'LATER', label: T('manual.songLater'), hint: T('manual.songLater.hint'), icon: <IconChevronRight className="rtl:rotate-180" /> }, { value: 'GENERATE', label: T('wizard.generateSong'), hint: T('wizard.generateSong.hint'), icon: <IconMusicVideos /> }, { value: 'UPLOAD', label: T('wizard.uploadSong'), hint: T('wizard.uploadSong.hint'), icon: <IconUpload /> }]} />
            {songMode === 'GENERATE' && (
              <>
                <Field label={T('wizard.songCaption')} help={T('wizard.songCaption.help')} error={error && !caption.trim() && !lyrics.trim() ? error : null}><Textarea value={caption} onChange={(e) => { setCaption(e.target.value); setError(null); }} rows={2} /></Field>
                <Field label={T('wizard.lyrics')} help={T('wizard.lyrics.help')}><Textarea value={lyrics} onChange={(e) => { setLyrics(e.target.value); setError(null); }} rows={8} /></Field>
                <Notice tone="info">{T('wizard.createdSong')}</Notice>
              </>
            )}
            {songMode === 'UPLOAD' && (
              <div className="space-y-3">
                {upload ? <div className="card flex flex-wrap items-center gap-3 p-3"><span className="min-w-0 flex-1 truncate text-sm font-medium" dir="auto">{upload.name}</span><AudioPlayer src={assetSrc(state, upload.assetId) ?? ''} title={upload.name} duration={upload.duration} className="w-full sm:w-80" /><Button variant="quiet" size="sm" onClick={() => setUpload(null)}>{T('btn.remove')}</Button></div> : (
                  <>
                    <Dropzone label={T('wizard.uploadSong')} hint={T('lib.uploadHint')} accept="audio/*" icon={<IconUpload />} onFile={(f) => void onFile(f)} />
                    {sampleTrack && <button type="button" className="text-sm text-fg underline-offset-2 hover:underline" onClick={() => setUpload({ assetId: sampleTrack.id, name: sampleTrack.label, duration: sampleTrack.durationSeconds })}>{T('label.sampleContent')}: {T('song.uploaded').toLowerCase()}</button>}
                  </>
                )}
                {error && !upload && <p role="alert" className="help text-bad">{error}</p>}
              </div>
            )}
          </section>
        )}

        {step === 'look' && (
          <section className="space-y-6" aria-labelledby="w-look">
            <div><h2 id="w-look" className="h2">{T('wizard.lookAndFormat')}</h2><p className="mt-1 text-sm text-muted">{T('manual.defaultsHint')}</p></div>
            <ChoiceCards name="style" value={style} onChange={setStyle} columns={3} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`), hint: T.dyn(`style.${s}.hint`), preview: <StylePreview style={s} /> }))} />
            {isMV && <div><p className="label">{T('wizard.concept')}</p><ChoiceCards name="concept" columns={3} value={concept} onChange={setConcept} options={[{ value: 'PERFORMANCE', label: T('mv.concept.PERFORMANCE'), hint: T('mv.concept.PERFORMANCE.hint'), icon: <IconMusicVideos /> }, { value: 'NARRATIVE', label: T('mv.concept.NARRATIVE'), hint: T('mv.concept.NARRATIVE.hint'), icon: <IconStory /> }, { value: 'MIXED', label: T('mv.concept.MIXED'), hint: T('mv.concept.MIXED.hint'), icon: <IconVersions /> }]} /></div>}
            <div className="grid gap-5 sm:grid-cols-2">
              <div><p className="label">{T('label.language')}</p><Segmented label={T('label.language')} value={language} onChange={setLanguage} options={[{ value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }]} /></div>
              {language === 'AR' && <Field label={T('label.dialect')}><Select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)} options={DIALECTS.map((d) => ({ value: d, label: dialectLabel(d, T.locale) }))} /></Field>}
              <div>
                <p className="label">{T('label.duration')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented label={T('label.duration')} value={durations.includes(duration) ? String(duration) : 'custom'} onChange={(v) => { if (v !== 'custom') setDuration(Number(v)); }} options={[...durations.map((d) => ({ value: String(d), label: fmtSeconds(d) })), { value: 'custom', label: '…' }]} />
                  <Input type="number" min={5} max={3600} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 5)} aria-label={`${T('label.duration')} (${T('label.seconds')})`} className="w-24" />
                </div>
              </div>
              <div>
                <p className="label">{T('label.aspect')}</p>
                <div role="radiogroup" aria-label={T('label.aspect')} className="flex flex-wrap gap-2">
                  {ASPECTS.map((a) => { const on = aspect === a; return <button key={a} type="button" role="radio" aria-checked={on} onClick={() => setAspect(a)} className={`flex min-h-9 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${on ? 'border-primary bg-primary text-on-primary' : 'border-line text-muted hover:border-line-strong'}`}><AspectBox a={a} />{aspectLabel(a)}</button>; })}
                </div>
              </div>
            </div>
            <Details summary={T('wizard.moreSettings')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={T('label.titleAr')}><Input value={titleAr} dir="rtl" onChange={(e) => setTitleAr(e.target.value)} /></Field>
                <Field label={T('label.genre')}><Input value={genre} onChange={(e) => setGenre(e.target.value)} /></Field>
                <Field label={T('label.logline')} className="sm:col-span-2"><Input value={logline} onChange={(e) => setLogline(e.target.value)} /></Field>
              </div>
            </Details>
          </section>
        )}

        {step === 'people' && (
          <section className="space-y-6" aria-labelledby="w-people">
            <div><h2 id="w-people" className="h2">{isMV ? T('step.performers') : T('wizard.people')}</h2><p className="mt-1 text-sm text-muted">{T('wizard.optional')}{kind === 'episode' && inheritedCast.length > 0 ? ` · ${inheritedCast.length} ${T('lib.inheritedFromShow')}` : ''}</p></div>
            <div>
              <p className="label">{isMV ? T('wizard.singer') : T('label.cast')}</p>
              <PickGrid items={state.characters.map((c) => ({ id: c.id, label: c.name, src: assetSrc(state, c.portraitAssetId), sub: inheritedCast.includes(c.id) ? T('lib.inheritedFromShow') : c.role }))} selected={[...cast, ...inheritedCast]} onToggle={(id) => { if (inheritedCast.includes(id)) return; setCast((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id])); }}
                extra={<Modal size="lg" title={T('lib.addCharacter')} trigger={(open) => <AddTile onClick={open}><IconPlus aria-hidden className="size-5" />{T('btn.createNew')}</AddTile>}>{(close) => <CharacterForm defaultStyle={style} onSaved={(id) => { setCast((xs) => [...xs, id]); close(); }} onCancel={close} />}</Modal>} />
            </div>
            <div>
              <p className="label">{T('label.locations')}</p>
              <PickGrid ratio="aspect-video" items={state.locations.map((l) => ({ id: l.id, label: l.name, src: assetSrc(state, l.masterAssetId), sub: inheritedLocs.includes(l.id) ? T('lib.inheritedFromShow') : l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior') }))} selected={[...locs, ...inheritedLocs]} onToggle={(id) => { if (inheritedLocs.includes(id)) return; setLocs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id])); }}
                extra={<Modal size="lg" title={T('lib.addLocation')} trigger={(open) => <AddTile ratio="aspect-video" onClick={open}><IconPlus aria-hidden className="size-5" />{T('btn.createNew')}</AddTile>}>{(close) => <LocationForm defaultStyle={style} onSaved={(id) => { setLocs((xs) => [...xs, id]); close(); }} onCancel={close} />}</Modal>} />
            </div>
          </section>
        )}

        {step === 'review' && (
          <section className="space-y-5" aria-labelledby="w-review">
            <div><h2 id="w-review" className="h2">{T('step.review')}</h2><p className="mt-1 text-sm text-muted">{T('wizard.reviewHint')}</p></div>
            <div className="card flex gap-5 p-5">
              <div className="w-24 flex-none sm:w-32"><Art src={undefined} ratio={isMV ? 'square' : 'poster'} title={finalTitle || heading} /></div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{T.dyn(`kind.${prodKind}`)}{genre ? ` · ${genre}` : ''}</p>
                <p className="mt-1 text-2xl font-semibold text-fg" dir="auto">{finalTitle || '—'}</p>
                {(text || logline) && <p className="mt-2 text-sm text-muted" dir="auto">{logline || text}</p>}
                <p className="mt-3 text-sm text-muted"><Dots items={[T.dyn(`style.${style}`), `${language}${language === 'AR' ? ` · ${dialectLabel(dialect, T.locale)}` : ''}`, aspectLabel(aspect).split(' · ')[0], fmtSeconds(duration), isMV ? T.dyn(`mv.concept.${concept}`) : null]} /></p>
                <dl className="kv mt-4">
                  {isMV && <><dt>{T('wizard.song')}</dt><dd>{songMode === 'UPLOAD' ? upload?.name : songMode === 'GENERATE' ? `${T('song.generated')} · ${splitLyrics(lyrics, duration).length} ${T('mv.sections')}` : T('manual.songLater')}</dd></>}
                  <dt>{isMV ? T('step.performers') : T('label.cast')}</dt><dd>{castNames.length ? castNames.join(', ') : '—'}</dd>
                  <dt>{T('label.locations')}</dt><dd>{locNames.length ? locNames.join(', ') : '—'}</dd>
                </dl>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" icon={<IconChevronLeft className="rtl:rotate-180" />} onClick={back}>{T('btn.back')}</Button>
        <span className="num text-xs text-faint">{stepIdx + 1} {T('step.of')} {steps.length}</span>
        {step === 'review' ? <Button variant="primary" onClick={create}>{T('wizard.createProject')}</Button> : <Button variant="primary" onClick={next}>{T('btn.next')}<IconChevronRight className="rtl:rotate-180" /></Button>}
      </div>
    </div>
  );
}

export { splitLyrics };

/** Three small drawings that say what a style is, without a picture from anywhere. */
export function StylePreview({ style }: { style: Style }) {
  if (style === 'CARTOON') return <svg viewBox="0 0 160 90" className="block w-full" aria-hidden><rect width="160" height="90" fill="#e8c46a" /><circle cx="52" cy="46" r="24" fill="#d9573b" /><rect x="88" y="26" width="46" height="40" rx="8" fill="#2f6fb5" /><path d="M0 74 Q40 58 80 74 T160 74 V90 H0Z" fill="#3f8a5a" /></svg>;
  if (style === 'ANIME') return <svg viewBox="0 0 160 90" className="block w-full" aria-hidden><defs><linearGradient id="an" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9b8e8" /><stop offset="1" stopColor="#7a5aa6" /></linearGradient></defs><rect width="160" height="90" fill="url(#an)" /><circle cx="118" cy="26" r="12" fill="#fff6d6" /><path d="M0 90 L30 44 L52 70 L78 30 L110 68 L130 52 L160 90 Z" fill="#2b2140" /><path d="M0 90 L30 44 L52 70 L78 30" fill="none" stroke="#f3eefc" strokeWidth="1.2" /></svg>;
  return <svg viewBox="0 0 160 90" className="block w-full" aria-hidden><defs><linearGradient id="re" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#5f7ea0" /><stop offset="1" stopColor="#1a1712" /></linearGradient><radialGradient id="rg" cx="0.7" cy="0.3" r="0.6"><stop offset="0" stopColor="#f2d59a" stopOpacity="0.9" /><stop offset="1" stopColor="#f2d59a" stopOpacity="0" /></radialGradient></defs><rect width="160" height="90" fill="url(#re)" /><rect width="160" height="90" fill="url(#rg)" /><ellipse cx="60" cy="64" rx="14" ry="26" fill="#14110d" opacity="0.9" /><rect y="80" width="160" height="10" fill="#0c0a08" /></svg>;
}

export function AspectBox({ a }: { a: Aspect }) {
  const [w, h] = a === 'WIDE_16_9' ? [20, 11.25] : a === 'VERTICAL_9_16' ? [9, 16] : a === 'SQUARE_1_1' ? [14, 14] : [24, 10];
  return <span aria-hidden className="inline-block rounded-[2px] border border-current" style={{ width: w, height: h }} />;
}
