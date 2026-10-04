'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { CutNote } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { Room, useRoom } from '@/components/shell/Room';
import { useToast } from '@/components/ui/toast';
import { PosterCard } from '@/components/media';
import { Segmented } from '@/components/ui/kit';
import type { PlayerCore } from '@/components/players/PlayerCore';
import type { PlayerHandle } from '@/components/players/InlinePlayer';
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
  const player = useRef<PlayerHandle>(null);
  const [{ time, playing }, setPlay] = useState({ time: 0, playing: false });
  const { notes: all, loaded, error, add, resolve, send } = useNotes(sc.production.id);
  const notes = useMemo(() => notesOfCut(all, cut), [all, cut]);
  const pins = useMemo(() => numbered(notes), [notes]);
  const [tab, setTab] = useState<PaneTab>('notes');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const shotNow = shotAt(cut.timeline, time);
  const pause = useCallback(() => player.current?.pause(), []);

  // ---- switching versions keeps the playhead, so the same moment can be compared across cuts
  const carry = useRef<number | null>(null);
  const pick = useCallback((v: number) => {
    carry.current = player.current?.state().time ?? null;
    setActiveId(null); setDraftPin(null); setPinMode(false);
    router.replace(screeningHref(sc.production.id, v), { scroll: false });
  }, [router, sc.production.id]);
  const onState = useCallback((s: { time: number; duration: number; playing: boolean }) => {
    setPlay((x) => (x.time === s.time && x.playing === s.playing ? x : { time: s.time, playing: s.playing }));
    // the new version's picture is ready: carry the playhead over
    if (carry.current !== null && s.duration > 0) { const t = carry.current; carry.current = null; if (t > 0) player.current?.seek(Math.min(t, s.duration)); }
  }, []);

  // ---- lights down: while the film plays and the producer is idle for 2 s; any movement or key brings them back
  useEffect(() => {
    if (!playing) { setLightsDown(false); return; }
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => { if (t) clearTimeout(t); t = setTimeout(() => setLightsDown(true), 2000); };
    const wake = () => { setLightsDown(false); arm(); };
    arm();
    window.addEventListener('pointermove', wake); window.addEventListener('keydown', wake); window.addEventListener('pointerdown', wake);
    return () => { if (t) clearTimeout(t); window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); window.removeEventListener('pointerdown', wake); };
  }, [playing, setLightsDown]);
  useEffect(() => () => setLightsDown(false), [setLightsDown]);

  const jump = useCallback((t: number, noteId?: string) => { player.current?.pause(); player.current?.seek(t); setActiveId(noteId ?? null); }, []);
  const noteHere = useCallback(() => { player.current?.pause(); setTab('notes'); requestAnimationFrame(() => composer.current?.focus()); }, []);
  const shotStep = useCallback((dir: -1 | 1, c: PlayerCore) => {
    const i = cut.timeline.findIndex((s) => s === shotAt(cut.timeline, c.time));
    const next = cut.timeline[Math.min(cut.timeline.length - 1, Math.max(0, i + dir))];
    if (next) c.seek(next.start);
  }, [cut.timeline]);

  const addNote = useCallback(async (text: string) => {
    const at = player.current?.state().time ?? time;
    const n = await add({ productionId: sc.production.id, cutAssetId: cut.version.assetId, timecode: Math.round(at * 100) / 100, pin: draftPin ?? undefined, text });
    setDraftPin(null); setPinMode(false); setActiveId(n.id);
  }, [add, sc.production.id, cut.version.assetId, time, draftPin]);
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
        <Theatre ref={player} cut={cut} title={sc.title} pins={pins} activeId={activeId} onSelectNote={(id) => { const n = notes.find((x) => x.id === id); if (n) jump(n.timecode, id); setTab('notes'); }}
          pinMode={pinMode} draftPin={draftPin} onPlacePin={(pt) => { setDraftPin(pt); setPinMode(false); composer.current?.focus(); }} onNote={noteHere} onShot={shotStep} onState={onState} />
        <Review tab={tab} onTab={setTab} cut={cut} sc={sc} notes={notes} loaded={loaded} error={error} time={time} activeId={activeId} onJump={jump} onResolve={onResolve} onSend={onSend}
          composer={<Composer ref={composer} time={time} shot={shotNow} cutVersion={cut.version.version} pinMode={pinMode} draftPin={draftPin}
            onPinMode={(on) => { setPinMode(on); if (on) pause(); }} onClearPin={() => setDraftPin(null)} onFocus={pause} onAdd={addNote} />} />
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

/** The room's skeleton lives in ./ScreeningSkeleton (drawn synchronously by the shell); re-exported for the page. */
export { ScreeningSkeleton } from './ScreeningSkeleton';
