'use client';

import Link from 'next/link';
import { useEffect, useMemo, type CSSProperties } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { Frame, FaceCircle } from '@/components/media';
import { EmptyState, ErrorState, PanelCard, SectionHead } from '@/components/ui/kit';
import { InlinePlayer } from '@/components/players/InlinePlayer';
import { AudioRow } from '@/components/players/Controls';
import { usePlayer, useTrackState } from '@/components/players/PlayerProvider';
import { IconChevronLeft, IconChevronRight, IconPlay } from '@/components/ui/icons';
import { MusicVideoMenu } from './MusicVideoMenu';
import { productionTab, titlePage, type LyricSectionView, type Person, type TitlePage } from './model';

/** A MUSIC VIDEO — its title page (DESIGN-SYSTEM-V5 §8.6 on VISUAL-STANDARD-V5.1): the song first. The sleeve with a
 *  contact shadow on the wash of its own colour; the song's title, who sings it (faces and names), the song itself on
 *  the audio row; then the lyrics section by section with each section's singer, in the language they are sung
 *  (Arabic lines take their own direction); the facts of the song and its cast beside them; the video when a cut
 *  exists. Everything that works on the music video lives in its production (/music-videos/[id]/production): the
 *  primary action continues there, at the tab of the next step. */

export function MusicVideo({ id }: { id: string }) {
  const { state } = useStudio();
  const p = state.productions.find((x) => x.id === id);
  if (!p || p.kind !== 'MUSIC_VIDEO') return <NotInStudio />;
  return <TitlePageView p={p} />;
}

function NotInStudio() {
  return (
    <ErrorState kind="page" title="This music video isn’t in the studio" back={{ href: '/music-videos', label: 'Back to Music videos' }}>
      It may have been deleted, or the link is wrong.
    </ErrorState>
  );
}

function TitlePageView({ p }: { p: Production }) {
  const { state } = useStudio();
  const m = useMemo(() => titlePage(state, p), [state, p]);
  const player = usePlayer();
  const st = useTrackState(m.track);
  // the song was replaced or removed while it was the one loaded: stop it rather than play a stale file
  useEffect(() => { const cur = player.current; if (cur && cur.id === `song-${p.id}` && (!m.track || cur.src !== m.track.src)) player.stop(); }, [player, p.id, m.track]);
  const playing = st.mine && st.playing;

  return (
    <div className="hero mv-page" style={artVars(m.sleeve.asset) as CSSProperties}>
      <section className="mv-hero" aria-labelledby="mv-title">
        <Link className="t-body mv-back" href="/music-videos"><IconChevronLeft aria-hidden />Music videos</Link>
        <div className="mv-head">
          <div className="mv-sleeve">
            <Frame asset={m.sleeve.asset} src={m.sleeve.src} ratio="1/1" fit="cover" alt={`Cover art of ${m.title}`} priority radius="hero" art={artVars(m.sleeve.asset)}
              title={m.title} titleLang={m.lang} titleState="noSleeve" className="mv-sleeve-frame" />
          </div>
          <div className="mv-words">
            <p className="t-meta mv-meta">
              <span className={`badge ${m.status.tone === 'done' ? 'badge-ok' : 'badge-neutral'}`}>{m.status.words}</span>
              <span className="mv-slate">{m.slate.map((s) => <span key={s}>{s}</span>)}</span>
            </p>
            <h1 id="mv-title" className={`${m.long ? 't-hero' : 't-display'} mv-title`}><bdi lang={m.lang}>{m.title}</bdi></h1>
            {m.altTitle && <p className="t-lead mv-alt"><bdi lang="ar">{m.altTitle}</bdi></p>}
            <Performers m={m} />
            {m.track ? <AudioRow track={m.track} meta={m.artist || undefined} className="mv-transport" />
              : <p className="t-body mv-nosong">{m.production.song ? 'The song’s file is not in the studio yet, so it cannot play here.' : 'No song yet. A music video starts with its song.'}</p>}
            <div className="mv-acts">
              <Link className="btn btn-primary" href={m.primary.href}>{m.primary.label}<IconChevronRight aria-hidden /></Link>
              {m.secondary && <Link className="btn btn-secondary" href={m.secondary.href}>{m.secondary.label}</Link>}
              <MusicVideoMenu p={p} after="catalogue" variant="secondary" size="md" next={false} />
            </div>
          </div>
        </div>
      </section>

      <div className="mv-body">
        <section className="mv-lyrics" aria-labelledby="mv-lyrics-h" data-playing={playing || undefined}>
          <SectionHead id="mv-lyrics-h" title="Lyrics" count={m.sections.length || null} description={m.lyricsLanguage ? `As they are sung, in ${m.lyricsLanguage}${m.translationLanguage ? `, with the ${m.translationLanguage} beneath` : ''}.` : undefined} />
          {m.sections.length === 0 ? (
            <EmptyState action={<Link className="btn btn-secondary btn-sm" href={productionTab(p, 'song')}>{m.production.song ? 'Write the lyrics' : 'Write the song'}</Link>}>No lyrics yet.</EmptyState>
          ) : (
            <ol className="mv-sections" role="list">
              {m.sections.map((sec) => <Section key={sec.id} sec={sec} live={st.mine && st.time >= sec.from && st.time < sec.to} onPlay={m.track ? () => player.play(m.track!, sec.from + 0.001) : undefined} />)}
            </ol>
          )}
        </section>

        <aside className="mv-side" aria-label="About the song">
          {m.facts.length > 0 && (
            <PanelCard title="About the song" columns={2} className="mv-facts" facts={m.facts.map((f) => ({ label: f.label, value: <bdi>{f.value}</bdi> }))} />
          )}
          <section className="mv-cast" aria-labelledby="mv-cast-h">
            <SectionHead id="mv-cast-h" title="Cast" count={m.cast.length || null} />
            {m.cast.length === 0 ? (
              <EmptyState action={<Link className="btn btn-secondary btn-sm" href={productionTab(p, 'performers')}>Choose performers</Link>}>Nobody is cast yet.</EmptyState>
            ) : (
              <ul className="mv-cast-list" role="list">
                {m.cast.map((c) => (
                  <li key={c.id}>
                    <Link className="mv-person" href={c.href}>
                      <FaceCircle name={c.name} asset={c.asset} src={c.src} size={40} decorative />
                      <span className="mv-person-words"><span className="t-card name"><bdi lang={c.lang}>{c.name}</bdi></span><span className="t-meta mv-person-role">{c.role}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {m.video && (
        <section className="mv-video" aria-labelledby="mv-video-h">
          <SectionHead id="mv-video-h" title="The video" description={m.video.duration ? `The final cut · ${m.video.duration}` : 'The final cut'} />
          <InlinePlayer src={m.video.src} poster={m.video.poster} title={`${m.title}, the music video`} className="mv-player" />
        </section>
      )}
    </div>
  );
}

function Performers({ m }: { m: TitlePage }) {
  if (m.performers.length === 0) return m.artist ? <p className="t-lead mv-artist"><bdi>{m.artist}</bdi></p> : null;
  return (
    <ul className="mv-performers" role="list" aria-label="Sung by">
      {m.performers.map((c: Person) => (
        <li key={c.id}>
          <Link className="mv-performer" href={c.href}>
            <FaceCircle name={c.name} asset={c.asset} src={c.src} size={28} decorative />
            <span className="name t-body mv-performer-name"><bdi lang={c.lang}>{c.name}</bdi></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({ sec, live, onPlay }: { sec: LyricSectionView; live: boolean; onPlay?: () => void }) {
  return (
    <li className="mv-sec" data-live={live || undefined}>
      <div className="mv-sec-head">
        <span className="t-label mv-sec-label">{sec.label}</span>
        <span className="t-ro mv-sec-at">{sec.at}</span>
        {sec.singers.length > 0 && (
          <span className="mv-sec-singers">
            {sec.singers.map((s) => <span key={s.id} className="t-label mv-sec-singer"><FaceCircle name={s.name} asset={s.asset} src={s.src} size={24} decorative /><span className="name"><bdi lang={s.lang}>{s.name}</bdi></span></span>)}
          </span>
        )}
        {onPlay && <button type="button" className="btn btn-quiet btn-sm btn-icon mv-sec-play" aria-label={`Play from ${sec.label}`} onClick={onPlay}><IconPlay aria-hidden /></button>}
      </div>
      {sec.instrumental ? <p className="t-meta mv-sec-quiet">Instrumental</p>
        : sec.lines.length === 0 ? <p className="t-meta mv-sec-quiet">No words yet</p>
          : (
            <div className="mv-sec-lines">
              {sec.lines.map((l, i) => (
                <p key={i} dir="auto" lang={l.lang} className="content-para lyric mv-line">
                  {l.singer && <FaceCircle name={l.singer.name} asset={l.singer.asset} src={l.singer.src} size={24} decorative className="mv-line-face" />}{l.text}
                </p>
              ))}
            </div>
          )}
      {sec.translation.length > 0 && (
        <div className="mv-sec-trans">{sec.translation.map((l, i) => <p key={i} dir="auto" lang={l.lang} className="content-para t-body">{l.text}</p>)}</div>
      )}
    </li>
  );
}

/** The title page's skeleton lives in ./skeletons (drawn synchronously by the shell); re-exported for the page. */
export { MusicVideoSkeleton } from './skeletons';
