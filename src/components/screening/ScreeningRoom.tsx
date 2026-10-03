'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import type { CutNote } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { Room, useRoom } from '@/components/shell/Room';
import { useToast } from '@/components/ui/toast';
import { MediaCardSkeleton, PosterCard } from '@/components/media';
import { Segmented, Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { usePlayerCore } from '@/components/players/PlayerCore';
import { Theatre } from './Theatre';
import { Composer, Review, numbered, type PaneTab } from './Review';
import { useNotes } from './notes';
import { cutView, notesOfCut, screeningHref, screeningList, screeningOf, shotAt, slateOf, type TimelineShot } from './model';

/** THE SCREENING ROOM (docs/DESIGN-SYSTEM-V5.md §8.12; docs/design/VISUAL-STANDARD-V5.1.md; the producer's Krea
 *  reference) — `/screening?p=<productionId>` (Home's "Screen it") opens the theatre: the cut at its native ratio on
 *  black with the transport docked under it, the review pane beside it (notes, shots, export), and under them the
 *  programme: what is screening, the cut versions (Cut 1, 2, 3 — B3), the download and the slate. Without `p` the room
 *  lists every production with a cut as poster cards. The lights go down while the film plays and the producer is
 *  idle (the shell's useRoom). Every fact comes from the studio's records; notes are the real B2 records. */

export function ScreeningRoom() {
  const params = useSearchParams();
  const p = params.get('p');
  return <><Room value="theatre" />{p ? <TheatreView productionId={p} version={Number(params.get('cut')) || null} /> : <Lobby />}</>;
}

// ------------------------------------------------------------------------------------------------------ the lobby

function Lobby() {
  const { state } = useStudio();
  const cards = useMemo(() => screeningList(state), [state]);
  return (
    <div className="theatre-lobby">
      <header className="theatre-lobby-head">
        <h1 className="t-page">Screening Room</h1>
        <p className="t-body">{cards.length ? 'Every film with an assembled cut, ready to watch and review.' : 'Nothing to screen yet. A film appears here when Post-Production assembles its cut.'}</p>
      </header>
      {cards.length > 0
        ? <ul className="theatre-grid" role="list">{cards.map((c) => <li key={c.id}><PosterCard href={c.href} title={c.title} titleLang={c.lang} meta={c.meta} asset={c.poster?.asset} src={c.poster?.src} /></li>)}</ul>
        : <div className="theatre-lobby-empty"><Link className="btn btn-secondary" href="/production">Open Production</Link></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- the theatre

function NotScreening({ title, sentence, href, action }: { title: string; sentence: string; href: string; action: string }) {
  return (
    <div className="theatre-missing">
      <div className="theatre-missing-frame"><p className="t-body">{sentence}</p></div>
      <h1 className="t-page">{title}</h1>
      <Link className="btn btn-secondary" href={href}>{action}</Link>
    </div>
  );
}

function TheatreView({ productionId, version }: { productionId: string; version: number | null }) {
  const { state } = useStudio();
  const sc = useMemo(() => screeningOf(state, productionId), [state, productionId]);
  const cut = useMemo(() => (sc ? cutView(state, sc, version) : null), [state, sc, version]);
  if (!sc) return <NotScreening title="This film isn't in the studio" sentence="Nothing to screen." href="/screening" action="Back to the Screening Room" />;
  if (!cut) return <NotScreening title={sc.title} sentence="Nothing to screen yet. A cut appears here when Post-Production assembles it." href={`${sc.href}/production`} action="Open Production" />;
  return <Screen key={sc.production.id} sc={sc} cut={cut} />;
}

function Screen({ sc, cut }: { sc: NonNullable<ReturnType<typeof screeningOf>>; cut: NonNullable<ReturnType<typeof cutView>> }) {
  const router = useRouter();
  const toast = useToast();
  const { setLightsDown } = useRoom();
  const c = usePlayerCore({ src: cut.src, fps: 24, aspect: `${cut.width} / ${cut.height}` });
  const { notes: all, loaded, error, add, resolve, send } = useNotes(sc.production.id);
  const notes = useMemo(() => notesOfCut(all, cut), [all, cut]);
  const pins = useMemo(() => numbered(notes), [notes]);
  const [tab, setTab] = useState<PaneTab>('notes');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const shotNow = shotAt(cut.timeline, c.time);

  // ---- switching versions keeps the playhead, so the same moment can be compared across cuts
  const carry = useRef<number | null>(null);
  const pick = useCallback((v: number) => {
    carry.current = c.time;
    setActiveId(null); setDraftPin(null); setPinMode(false);
    router.replace(screeningHref(sc.production.id, v), { scroll: false });
  }, [c.time, router, sc.production.id]);
  useEffect(() => { if (c.ready && carry.current !== null) { const t = carry.current; carry.current = null; if (t > 0) c.seek(Math.min(t, c.duration)); } }, [c.ready, c.duration, c.seek]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- lights down: while the film plays and the producer is idle for 2 s; any movement or key brings them back
  useEffect(() => {
    if (!c.playing) { setLightsDown(false); return; }
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => { if (t) clearTimeout(t); t = setTimeout(() => setLightsDown(true), 2000); };
    const wake = () => { setLightsDown(false); arm(); };
    arm();
    window.addEventListener('pointermove', wake); window.addEventListener('keydown', wake); window.addEventListener('pointerdown', wake);
    return () => { if (t) clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); window.removeEventListener('pointerdown', wake); };
  }, [c.playing, setLightsDown]);
  useEffect(() => () => setLightsDown(false), [setLightsDown]);

  const jump = useCallback((t: number, noteId?: string) => { c.pause(); c.seek(t); setActiveId(noteId ?? null); }, [c]);
  const noteHere = useCallback(() => { c.pause(); setTab('notes'); requestAnimationFrame(() => composer.current?.focus()); }, [c]);
  const shotStep = useCallback((dir: -1 | 1) => {
    const i = cut.timeline.findIndex((s) => s === shotAt(cut.timeline, c.time));
    const next = cut.timeline[Math.min(cut.timeline.length - 1, Math.max(0, i + dir))];
    if (next) c.seek(next.start);
  }, [cut.timeline, c]);

  const addNote = useCallback(async (text: string) => {
    const n = await add({ productionId: sc.production.id, cutAssetId: cut.version.assetId, timecode: Math.round(c.time * 100) / 100, pin: draftPin ?? undefined, text });
    setDraftPin(null); setPinMode(false); setActiveId(n.id);
  }, [add, sc.production.id, cut.version.assetId, c.time, draftPin]);
  const onResolve = useCallback(async (n: CutNote) => {
    try { await resolve(n.id, n.status !== 'resolved'); } catch (e) { toast.bad((e as Error).message); }
  }, [resolve, toast]);
  const onSend = useCallback(async (n: CutNote, shot: TimelineShot) => {
    try { await send(n.id, shot.shotId); toast.push({ tone: 'ok', text: `Sent to shot ${shot.label}: the note is in the shot's notes for its next take.`, link: { label: `Open shot ${shot.label}`, href: shot.href } }); }
    catch (e) { toast.bad((e as Error).message); }
  }, [send, toast]);

  const download = sc.exports[0] ? { href: sc.exports[0].href, filename: sc.exports[0].filename, words: sc.exports[0].words.slice(0, 2).join(' · ') } : { href: cut.version.asset.src, filename: `cut-${cut.version.version}.mp4`, words: `cut ${cut.version.version}` };
  const options = sc.versions.map((v) => ({ value: String(v.version), label: <>Cut {v.version}{v.current && <span className="theatre-latest"> · current</span>}</> }));

  return (
    <div className="theatre-room">
      <div className="theatre">
        <Theatre core={c} cut={cut} title={sc.title} pins={pins} activeId={activeId} onSelectNote={(id) => { const n = notes.find((x) => x.id === id); if (n) jump(n.timecode, id); setTab('notes'); }}
          pinMode={pinMode} draftPin={draftPin} onPlacePin={(pt) => { setDraftPin(pt); setPinMode(false); composer.current?.focus(); }} onNote={noteHere} onShot={shotStep} />
        <Review tab={tab} onTab={setTab} cut={cut} sc={sc} notes={notes} loaded={loaded} error={error} time={c.time} activeId={activeId} onJump={jump} onResolve={onResolve} onSend={onSend}
          composer={<Composer ref={composer} time={c.time} shot={shotNow} cutVersion={cut.version.version} pinMode={pinMode} draftPin={draftPin}
            onPinMode={(on) => { setPinMode(on); if (on) c.pause(); }} onClearPin={() => setDraftPin(null)} onFocus={() => c.pause()} onAdd={addNote} />} />
        {/* the programme: on a phone it sits between the film and the review pane */}
        <section className="theatre-prog" aria-labelledby="theatre-title" data-lights-dim>
          <p className="t-label theatre-kicker">Now screening</p>
          <div className="theatre-prog-row">
            <h1 id="theatre-title" className="t-hero theatre-title"><bdi lang={sc.lang}>{sc.title}</bdi></h1>
            <div className="theatre-prog-acts">
              {sc.versions.length > 1 && <Segmented label="Cut version" value={String(cut.version.version)} onChange={(v) => pick(Number(v))} options={options} className="theatre-versions" />}
              <Link className="btn btn-secondary" href={`${sc.href}/production`}>Open production</Link>
              <a className="btn btn-primary" href={download.href} download={download.filename} aria-label={`Download the film (${download.words})`}><Download aria-hidden />Download</a>
            </div>
          </div>
          <p className="t-meta theatre-slate">{slateOf(sc, cut).map((s) => <span key={s}>{s}</span>)}</p>
          {sc.logline && <p className="t-lead theatre-logline" dir="auto">{sc.logline}</p>}
        </section>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------------- the skeleton

const subscribeNone = () => () => {};
/** Which view the address asks for, before the page knows its data (the route skeleton has no props). */
function useWantsTheatre(): boolean {
  return useSyncExternalStore(subscribeNone, () => new URLSearchParams(window.location.search).has('p'), () => true);
}

/** The Screening Room while the studio's first snapshot loads (§5.22): the theatre in its exact shapes (the same
 *  classes size the stage, the docked transport, the review pane and the programme), or the poster grid for the list. */
export function ScreeningSkeleton({ view }: { view?: 'theatre' | 'list' }) {
  const wants = useWantsTheatre();
  const v = view ?? (wants ? 'theatre' : 'list');
  if (v === 'list') {
    return (
      <SkeletonRegion label="Opening the Screening Room…" className="theatre-lobby theatre-skeleton">
        <Room value="theatre" />
        <div className="theatre-lobby-head"><div className="t-page"><Skeleton.Line size="title" width="14rem" /></div><div className="t-body"><Skeleton.Line width="24rem" /></div></div>
        <div className="theatre-grid">{Array.from({ length: 6 }, (_, i) => <div key={i}><MediaCardSkeleton ratio="2/3" /></div>)}</div>
      </SkeletonRegion>
    );
  }
  return (
    <SkeletonRegion label="Opening the Screening Room…" className="theatre-room theatre-skeleton">
      <Room value="theatre" />
      <div className="theatre">
        <div className="theatre-stage" style={{ '--tw': 16, '--th': 9 } as React.CSSProperties}>
          <div className="theatre-pic" />
          <div className="ptransport theatre-transport"><Skeleton.Block width={36} height={36} radius="pill" /><span className="theatre-seek-sk"><Skeleton.Line width="100%" /></span></div>
        </div>
        <div className="theatre-pane">
          <div className="theatre-tabs-wrap"><div className="tabs"><span className="tab"><Skeleton.Line width="3rem" /></span><span className="tab"><Skeleton.Line width="3rem" /></span><span className="tab"><Skeleton.Line width="3rem" /></span></div></div>
          <div className="theatre-panel">
            <div className="theatre-composer">
              <span className="theatre-composer-at t-label"><Skeleton.Line width="9rem" /></span>
              <Skeleton.Block className="theatre-composer-text" width="100%" height="auto" radius="md" />
              <div className="theatre-composer-acts"><Skeleton.Block width={140} height={32} radius="pill" /><Skeleton.Block width={96} height={32} radius="pill" /></div>
            </div>
          </div>
        </div>
        <div className="theatre-prog">
          <div className="t-label theatre-kicker"><Skeleton.Line width="6rem" /></div>
          <div className="theatre-prog-row"><div className="t-hero theatre-title"><Skeleton.Line size="title" width="16rem" /></div>
            <div className="theatre-prog-acts"><Skeleton.Block width={232} height={36} radius="md" /><Skeleton.Block width={150} height={40} radius="pill" /><Skeleton.Block width={124} height={40} radius="pill" /></div></div>
          <div className="t-meta theatre-slate"><Skeleton.Line width="22rem" /></div>
          <div className="t-lead theatre-logline"><Skeleton.Line width="92%" /><Skeleton.Line width="58%" /></div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
