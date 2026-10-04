'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { Aspect, Dialect, Language, Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { seasonById, showById } from '@/studio/selectors';
import { ErrorState, Segmented, ShapeGlyph, Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { IconAuto, IconChevronLeft, IconManual } from '@/components/ui/icons';
import { Preview } from './parts';
import { emptySong, type SongDraft } from './Song';
import { AutoFlow } from './AutoFlow';
import { ManualFlow } from './ManualFlow';
import { KIND_INFO, modeOf, slateOf, type CreateKind, type CreateMode } from './model';

/** CREATE — one page for every new show, season, episode, short and music video (`/new/[kind]`). The head says what
 *  is being made; two ways in sit side by side as one switch — Auto (the studio proposes, the producer picks) and
 *  Manual (a minimal brief with more control behind a disclosure) — kept in `?mode=`. At 1024 px and wider the thing
 *  being made stands beside the form as a live preview in its own shape. Seasons and episodes take their show's
 *  language, cast and world (`?show=`, `?season=`). */

export interface PreviewState { title: string; placeholder: string; state: string; slate: { style?: Style; language?: Language; dialect?: Dialect; seconds?: number; aspect?: Aspect } }

export function CreateFlow({ kind }: { kind: CreateKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { state } = useStudio();
  const info = KIND_INFO[kind];
  const mode = modeOf(sp);
  const show = showById(state, sp.get('show'));
  const seasons = show ? state.seasons.filter((x) => x.showId === show.id).sort((a, b) => a.number - b.number) : [];
  const season = kind === 'episode' ? (seasonById(state, sp.get('season')) ?? seasons[seasons.length - 1]) : undefined;
  const [song, setSong] = useState<SongDraft>(emptySong);
  const [preview, setPreview] = useState<PreviewState>({ title: '', placeholder: `Untitled ${info.noun}`, state: 'Not made yet', slate: {} });
  const onPreview = useCallback((p: PreviewState) => setPreview(p), []);
  const setMode = (m: CreateMode) => {
    const q = new URLSearchParams(sp.toString());
    q.set('mode', m); q.delete('method'); if (m === 'manual') { q.delete('idea'); q.delete('proposal'); }
    router.replace(`${pathname}?${q}`, { scroll: false });
  };

  const needsShow = kind === 'season' || kind === 'episode';
  if (needsShow && (!show || (kind === 'episode' && !season))) {
    return (
      <div className="create create-missing">
        <ErrorState kind="page" title={show ? 'This show has no season yet' : 'This show isn’t in the studio'} back={show ? { href: `/new/season?show=${show.id}`, label: 'New season' } : { href: '/shows', label: 'Back to Shows' }}>
          {show ? 'Add a season first; its episodes follow.' : `${/^[aeiou]/.test(info.noun) ? 'An' : 'A'} ${info.noun} belongs to a show. Open the show and add it from there.`}
        </ErrorState>
      </div>
    );
  }

  const context = show ? [show.title, kind === 'episode' && season ? (season.title || `Season ${season.number}`) : kind === 'season' ? `Season ${seasons.length + 1}` : null].filter(Boolean).join(' · ') : null;
  const back = show && needsShow ? { href: `/shows/${show.id}`, label: show.title } : info.back;

  return (
    <div className="create" data-kind={kind} data-mode={mode}>
      <header className="create-head">
        <Link href={back.href} className="create-back"><IconChevronLeft aria-hidden />{back.label}</Link>
        <div className="create-title-row">
          <span className="create-glyph" aria-hidden><ShapeGlyph shape={info.shape} /></span>
          <h1 className="t-page create-title">{info.title}</h1>
        </div>
        <p className="t-lead create-lead">{context ? <>For <bdi>{context}</bdi>. </> : null}{info.line}</p>
        <div className="create-mode">
          <Segmented label="How to start" value={mode} onChange={setMode} options={[{ value: 'auto', label: 'Auto', icon: <IconAuto aria-hidden /> }, { value: 'manual', label: 'Manual', icon: <IconManual aria-hidden /> }]} />
          <p className="t-meta create-mode-hint">{mode === 'auto' ? 'The studio proposes the idea; you pick it and change anything.' : 'Write a short brief yourself; more control when you need it.'}</p>
        </div>
      </header>

      <div className="create-body">
        <div className="create-main">
          {mode === 'auto'
            ? <AutoFlow key={`${kind}-auto`} kind={kind} show={show} season={season} song={song} setSong={setSong} onPreview={onPreview} onManual={() => setMode('manual')} />
            : <ManualFlow key={`${kind}-manual`} kind={kind} show={show} season={season} song={song} setSong={setSong} onPreview={onPreview} />}
        </div>
        <aside className="create-aside" aria-label="Preview">
          <Preview ratio={info.ratio} title={preview.title} placeholder={preview.placeholder} state={preview.state} facts={slateOf(kind, preview.slate)}>
            {kind === 'music-video' && song.source === 'upload' && song.upload && <p className="t-meta name create-preview-song">Song: <bdi>{song.upload.name}</bdi></p>}
          </Preview>
        </aside>
      </div>
    </div>
  );
}

/** The flow while the studio's first snapshot loads: the head, the switch, two panels and the preview in their real
 *  sizes (the same classes size them). */
export function CreateFlowSkeleton() {
  const pathname = usePathname() ?? '';
  const k = pathname.split('/')[2] ?? 'short';
  const ratio = KIND_INFO[k as CreateKind]?.ratio ?? '2/3';
  return (
    <SkeletonRegion label="Opening the studio…" className="create create-skeleton">
      <div className="create-head">
        <span className="create-back"><Skeleton.Line width="5rem" /></span>
        <div className="create-title-row"><span className="create-glyph" /><span className="t-page create-title"><Skeleton.Line size="title" width="12rem" /></span></div>
        <span className="t-lead create-lead"><Skeleton.Line width="22rem" /></span>
        <div className="create-mode"><Skeleton.Block width={176} height={36} radius="md" /><span className="t-meta create-mode-hint"><Skeleton.Line width="18rem" /></span></div>
      </div>
      <div className="create-body">
        <div className="create-main">
          <div className="create-flow">
            <Skeleton.Block className="create-panel" width="100%" height={280} radius="md" />
            <Skeleton.Block className="create-panel" width="100%" height={200} radius="md" />
          </div>
        </div>
        <div className="create-aside"><div className="create-preview-card"><span className="t-label"><Skeleton.Line width="4rem" /></span><div className="create-preview-frame" data-ratio={ratio}><Skeleton.Media ratio={ratio} /></div></div></div>
      </div>
    </SkeletonRegion>
  );
}
