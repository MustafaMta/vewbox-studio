'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IdeaPreferences, IdeaProposal, Season, Show } from '@/domain/types';
import { isActiveStatus } from '@/domain/jobs';
import { DIALECTS, type Dialect, type Language } from '@/domain/vocabulary';
import { api } from '@/studio/api';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { shortWhen } from '@/components/home/model';
import { Button, DisclosureCard, ErrorNotice, Field, FormFooter, Input, JobDot, Notice, Segmented, Select, Skeleton, StageSteps, StageStepsSkeleton, Textarea } from '@/components/ui/kit';
import { IconAuto, IconChevronRight, IconManual } from '@/components/ui/icons';
import { Panel, PickGrid, StylePicker, castItems, placeItems } from './parts';
import { SongPanel, type SongDraft } from './Song';
import { Review } from './Review';
import { useDevelopment, useEngines, useResearchSources } from './hooks';
import { KIND_INFO, autoAvailability, dialectWords, elapsed, ideasOf, lengthWords, researchLine, stageRows, validateAuto, type CreateKind, type Idea } from './model';
import { focusField } from './ManualFlow';
import type { PreviewState } from './CreateFlow';

/** AUTO — one line or a theme (or nothing), optional preferences, then the studio's story team develops a real idea
 *  (an AUTO_IDEA job and its stages, read from /api/development), then the producer picks it — edits and keeps
 *  what the story needs — and creates it. Earlier ideas the studio wrote for this kind can be picked too. When the
 *  story engine is offline or the studio takes no new work, the page says so and offers the manual brief. The idea
 *  lives in the URL (`?idea=<job id>`), so leaving the page and coming back finds it again. */

export function AutoFlow({ kind, show, season, song, setSong, onPreview, onManual }: { kind: CreateKind; show?: Show; season?: Season; song: SongDraft; setSong: (s: SongDraft) => void; onPreview: (p: PreviewState) => void; onManual: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { state, jobs, startJob, cancelJob } = useStudio();
  const info = KIND_INFO[kind];
  const isMV = kind === 'music-video';
  const inShow = kind === 'season' || kind === 'episode';
  const engines = useEngines();
  const avail = autoAvailability(engines);
  const research = useResearchSources();
  const ideaParam = sp.get('idea') ?? sp.get('proposal');
  const job = ideaParam ? jobs.find((j) => j.id === ideaParam) : undefined;
  const { view, error: devError } = useDevelopment(ideaParam, job ? `${job.status}:${job.progress?.phase ?? ''}:${job.updatedAt}` : null);
  const [line, setLine] = useState('');
  const [prefs, setPrefs] = useState<IdeaPreferences>(show ? {} : { research: 'AUTO' });
  const [songError, setSongError] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ proposal: IdeaProposal; jobId?: string; id: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setNow] = useState(0);
  const setPref = (x: Partial<IdeaPreferences>) => setPrefs((p) => ({ ...p, ...x }));
  const toggle = (key: 'castIds' | 'locationIds') => (id: string) => setPrefs((p) => { const xs = p[key] ?? []; return { ...p, [key]: xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id] }; });

  const goIdea = useCallback((id: string | null) => {
    const q = new URLSearchParams(sp.toString());
    q.delete('proposal'); q.set('mode', 'auto');
    if (id) q.set('idea', id); else q.delete('idea');
    router.replace(`${pathname}?${q}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [sp, pathname, router]);

  // the proposal opens once the idea is written; a proposal id in the URL (an older link) opens directly
  useEffect(() => {
    if (!ideaParam) { setPicked(null); setLoadError(null); return; }
    if (picked && (picked.jobId === ideaParam || picked.id === ideaParam)) return;
    const pid = view?.job.status === 'COMPLETED' ? (view.proposal?.id ?? (view.job.result?.proposalId as string | undefined)) : devError ? ideaParam : undefined;
    if (!pid) return;
    let live = true;
    api.proposal(pid).then((r) => { if (live) setPicked({ proposal: r.proposal, jobId: r.jobId ?? undefined, id: r.id }); }).catch((e) => { if (live) setLoadError((e as Error).message); });
    return () => { live = false; };
  }, [ideaParam, view, devError, picked]);

  // the stepper's clocks
  const running = Boolean(view && isActiveStatus(view.job.status));
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow((n) => n + 1), 1000); return () => clearInterval(t); }, [running]);

  const ideas = useMemo(() => ideasOf(jobs, state.productions, kind, show?.id, productionHref).filter((i) => i.jobId !== ideaParam).slice(0, 6), [jobs, state.productions, kind, show?.id, ideaParam]);

  useEffect(() => {
    if (picked) return;
    onPreview({ title: '', placeholder: running ? 'The studio is writing…' : 'The studio proposes the title', state: running ? 'Developing' : 'Not made yet', slate: { style: prefs.style ?? show?.style, language: prefs.language ?? show?.language, dialect: prefs.dialect ?? show?.dialect, seconds: prefs.durationSeconds, aspect: show?.aspect } });
  }, [picked, running, prefs, show, onPreview]);

  const develop = async (again?: Record<string, unknown>) => {
    const e = validateAuto(kind, { song: isMV ? { source: song.source, uploaded: Boolean(song.upload) } : undefined });
    setSongError(e.song);
    if (e.song) { focusField('create-song'); return; }
    setStarting(true); setStartError(null);
    const lyrics = isMV && song.source === 'upload' && song.lyrics.trim() ? `\n\nThe song is the producer's own upload. Its lyrics:\n${song.lyrics.trim()}` : isMV && song.source === 'upload' ? '\n\nThe song is the producer\'s own upload (no lyrics given).' : '';
    const brief = (line.trim() + lyrics).trim().slice(0, 4000) || undefined;
    try {
      const j = await startJob('AUTO_IDEA', (again as never) ?? { kind: info.request, showId: show?.id, seasonId: kind === 'episode' ? season?.id : undefined, preferences: prefs, brief });
      setPicked(null);
      goIdea(j.id);
    } catch (err) { setStartError((err as Error).message); }
    finally { setStarting(false); }
  };

  // ---------------------------------------------------------------------------------------------- pick
  if (ideaParam && picked) {
    return <Review kind={kind} show={show} season={season} initial={picked.proposal} proposalJobId={picked.jobId} prefs={prefs} song={song} onPreview={onPreview}
      onBack={() => goIdea(null)} onAnother={avail.state === 'ready' ? () => void develop() : undefined} anotherBusy={starting} />;
  }

  // ---------------------------------------------------------------------------------------------- developing
  if (ideaParam) {
    const failed = view && (view.job.status === 'FAILED' || view.job.status === 'CANCELLED');
    const rows = stageRows(view);
    if (loadError || (devError && !view)) {
      return (
        <div className="create-flow">
          <ErrorNotice title="This idea could not be opened" why={loadError ?? devError} action={<Button size="sm" onClick={() => goIdea(null)}>Start a new idea</Button>} alternatives={<Button size="sm" variant="quiet" onClick={onManual}>Write it yourself</Button>} />
        </div>
      );
    }
    return (
      <div className="create-flow">
        {failed && (
          <ErrorNotice title={view!.job.status === 'CANCELLED' ? 'The idea was stopped' : 'The idea could not be developed'}
            why={view!.job.status === 'CANCELLED' ? 'Nothing was made. Start again whenever you like.' : 'The story team stopped before the proposal was written. Nothing was made.'}
            details={view!.job.error?.message ?? null}
            action={avail.state === 'ready' ? <Button size="sm" onClick={() => void develop(job?.payload)} loading={starting}>Try again</Button> : undefined}
            alternatives={<Button size="sm" variant="quiet" onClick={onManual}>Write it yourself</Button>} />
        )}
        <Panel id="create-dev-h" title={failed ? 'Where it stopped' : 'The studio is developing your idea'}
          description={failed ? undefined : 'The story team researches, writes and reviews it. You can leave this page; the idea waits for you here.'}
          end={view?.job.createdAt ? <span className="t-ro t-ro-md create-clock">{elapsed(view.job.startedAt ?? view.job.createdAt, view.job.finishedAt)}</span> : undefined}>
          {!view ? <StageStepsSkeleton count={8} label="Reading the idea’s progress…" /> : (
            <StageSteps label="The story team’s stages" stages={rows.map((r) => ({
              id: r.stage, label: r.label, who: r.who, state: r.state, note: r.note,
              time: r.state === 'running' || r.state === 'done' ? elapsed(r.startedAt, r.finishedAt) : r.state === 'skipped' ? 'Skipped' : r.state === 'failed' ? 'Stopped' : '',
            }))} />
          )}
        </Panel>
        <FormFooter start={<Button variant="quiet" onClick={() => goIdea(null)}>Back</Button>}>
          {!failed && running && <Button onClick={() => void cancelJob(ideaParam)}>Stop</Button>}
          <Button icon={<IconManual />} onClick={onManual}>Write it yourself</Button>
        </FormFooter>
      </div>
    );
  }

  // ---------------------------------------------------------------------------------------------- start
  // until the engines have answered, the panels hold their places (so an "offline" notice never pushes the page down)
  if (avail.state === 'checking') {
    return (
      <div className="create-flow" aria-busy="true">
        <p className="sr-only" role="status">Checking the story engine…</p>
        {isMV && <Skeleton.Block className="create-panel" width="100%" height={232} radius="md" />}
        <Skeleton.Block className="create-panel" width="100%" height={294} radius="md" />
        <div className="form-footer"><span className="t-meta create-avail">Checking the story engine…</span><span className="form-footer-actions"><Skeleton.Block width={168} height="var(--control-h)" radius="pill" /></span></div>
      </div>
    );
  }
  const unavailable = avail.state === 'unavailable';
  return (
    <form className="create-flow" noValidate onSubmit={(e) => { e.preventDefault(); if (!unavailable) void develop(); }}>
      {unavailable && (
        <Notice tone="warn" title={avail.title} className="create-engine" action={<Button size="sm" variant="primary" icon={<IconManual />} onClick={onManual}>Write it yourself</Button>}>
          <span id="create-engine-why">{avail.why}</span>
        </Notice>
      )}
      {isMV && <SongPanel mode="auto" song={song} setSong={(s) => { setSong(s); setSongError(undefined); }} error={songError} />}

      <Panel id="create-idea-h" title="Your idea" description={inShow && show ? `The studio continues ${show.title} from where it left off, with its cast, its world and its language.` : 'One line or a theme is enough. Leave it empty and the studio starts from nothing.'}>
        <div className="create-stack">
          <Field label="One line or a theme" optional>
            <Textarea id="create-idea" rows={3} maxLength={3000} value={line} onChange={(e) => setLine(e.target.value)} />
          </Field>
          <DisclosureCard variant="inline" title="Preferences" description={Object.values(prefs).filter((v) => (Array.isArray(v) ? v.length : v && v !== 'AUTO')).length ? 'Some are set' : 'All up to the studio'}>
            <div className="create-stack">
              {!inShow && <StylePicker value={prefs.style ?? null} auto="Studio decides" onChange={(s) => setPref({ style: s ?? undefined })} />}
              {!inShow && (
                <div className="create-row">
                  <div className="create-field"><p className="label">Language</p><Segmented label="Language" value={prefs.language ?? 'AUTO'} onChange={(v) => setPref({ language: v === 'AUTO' ? undefined : (v as Language), dialect: v === 'AR' ? prefs.dialect ?? 'IRAQI_BAGHDADI' : undefined })} options={[{ value: 'AUTO', label: 'Studio decides' }, { value: 'EN', label: 'English' }, { value: 'AR', label: 'Arabic' }]} /></div>
                  {prefs.language === 'AR' && <Field label="Dialect" className="create-field"><Select value={prefs.dialect ?? 'IRAQI_BAGHDADI'} onChange={(e) => setPref({ dialect: e.target.value as Dialect })} options={DIALECTS.map((d) => ({ value: d, label: dialectWords(d) }))} /></Field>}
                </div>
              )}
              {info.durations && (
                <div className="create-field"><p className="label">Length</p><Segmented label="Length" value={prefs.durationSeconds ? String(prefs.durationSeconds) : 'AUTO'} onChange={(v) => setPref({ durationSeconds: v === 'AUTO' ? undefined : Number(v) })} options={[{ value: 'AUTO', label: 'Studio decides' }, ...info.durations.map((d) => ({ value: String(d), label: lengthWords(d) }))]} /></div>
              )}
              <div className="create-row">
                <Field label="Who it is for" optional className="create-field"><Input value={prefs.audience ?? ''} maxLength={200} onChange={(e) => setPref({ audience: e.target.value || undefined })} /></Field>
                <Field label="Mood" optional className="create-field"><Input value={prefs.mood ?? ''} maxLength={120} onChange={(e) => setPref({ mood: e.target.value || undefined })} /></Field>
                {!inShow && <Field label="Genre" optional className="create-field"><Input value={prefs.genre ?? ''} maxLength={60} onChange={(e) => setPref({ genre: e.target.value || undefined })} /></Field>}
              </div>
              {!isMV && (
                <div className="create-field">
                  <p className="label">Characters to include</p>
                  {state.characters.length ? <PickGrid shape="figure" label="Characters to include" items={castItems(state)} selected={prefs.castIds ?? []} onToggle={toggle('castIds')} /> : <p className="t-body">No characters yet; the studio proposes new ones.</p>}
                </div>
              )}
              <div className="create-field">
                <p className="label">Locations to include</p>
                {state.locations.length ? <PickGrid shape="plate" label="Locations to include" items={placeItems(state)} selected={prefs.locationIds ?? []} onToggle={toggle('locationIds')} /> : <p className="t-body">No locations yet; the studio proposes places with the story.</p>}
              </div>
              {!inShow && (
                <div className="create-field">
                  <p className="label">Trend research</p>
                  <Segmented label="Trend research" value={prefs.research ?? 'AUTO'} onChange={(v) => setPref({ research: v as 'AUTO' | 'OFF' })} options={[{ value: 'AUTO', label: 'Use it' }, { value: 'OFF', label: 'Original only' }]} />
                  <p className="help">{prefs.research === 'OFF' ? 'The idea will be an original concept, with no research.' : researchLine(research) || 'Checking which sources are reachable…'}</p>
                </div>
              )}
            </div>
          </DisclosureCard>
        </div>
      </Panel>

      {isMV && (
        <Panel id="create-performers-h" title="Performers" description="Who sings it on screen. Leave it to the studio, or choose them now.">
          {state.characters.length ? <PickGrid shape="figure" label="Performers" items={castItems(state)} selected={prefs.castIds ?? []} onToggle={toggle('castIds')} /> : <p className="t-body">No characters yet; the studio proposes performers.</p>}
        </Panel>
      )}

      {startError && <ErrorNotice title="The studio did not start the idea" why={startError} action={<Button size="sm" onClick={onManual} icon={<IconManual />}>Write it yourself</Button>} />}

      <FormFooter start={<span className="t-meta create-avail">{avail.state === 'ready' ? 'The story team takes a few minutes.' : 'Auto ideas are unavailable right now.'}</span>}>
        <Button type="submit" variant="primary" icon={<IconAuto />} loading={starting} disabled={unavailable} aria-describedby={unavailable ? 'create-engine-why' : undefined}>Develop an idea</Button>
      </FormFooter>

      {ideas.length > 0 && <Ideas ideas={ideas} onOpen={goIdea} />}
    </form>
  );
}

/** The ideas the studio already wrote (or is writing) for this kind: open one to pick it. */
function Ideas({ ideas, onOpen }: { ideas: Idea[]; onOpen: (jobId: string) => void }) {
  return (
    <section className="create-ideas" aria-labelledby="create-ideas-h">
      <div className="create-ideas-head">
        <h2 id="create-ideas-h" className="t-section">Ideas the studio wrote</h2>
        <p className="t-body">Pick one up where it was left. Each is a real proposal; nothing was made from it unless it says so.</p>
      </div>
      <ul className="create-idea-list" role="list">
        {ideas.map((i) => (
          <li key={i.jobId}>
            <div className="card create-idea">
              <span className="create-idea-words">
                <span className="t-card name"><bdi>{i.title}</bdi></span>
                <span className="t-meta create-idea-meta">{[shortWhen(i.at), i.brief && i.brief !== i.title ? `From “${i.brief.slice(0, 80)}”` : null].filter(Boolean).join(' · ')}</span>
              </span>
              {i.status === 'developing' ? <JobDot>{i.message ?? 'Developing'}</JobDot> : i.status === 'made' ? <span className="badge badge-ok">Made</span> : <span className="badge">Ready to pick</span>}
              {i.status === 'made' && i.made
                ? <Link className="btn btn-secondary btn-sm" href={i.made.href}>Open<IconChevronRight aria-hidden /></Link>
                : <Button size="sm" onClick={() => onOpen(i.jobId)}>{i.status === 'developing' ? 'Follow' : 'Review'}<IconChevronRight aria-hidden /></Button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
