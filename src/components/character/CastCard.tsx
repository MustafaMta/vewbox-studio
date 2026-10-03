'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Character } from '@/domain/types';
import { useJobsFor, useStudio } from '@/studio/store';
import { assetById, primaryImageOf } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { Status } from '@/components/ui/kit';
import { IconPause, IconPlay, IconShield } from '@/components/ui/icons';
import { usePlayer, useTrackState, type Track } from '@/components/players/PlayerProvider';
import { CharacterImage, FramePhase } from './CharacterImage';
import { identityStatus, imageJobs, imageKindOf, statusWords, voiceState, voiceTrackSource } from './identity';

/** A CAST CARD (DESIGN-SYSTEM-V3 §6, §9.4) — boxless: the canonical full-body image in a 2:3 frame with nothing
 *  written on it; beneath it the name (and the Arabic name), the role on one line, and one quiet line of state: the
 *  identity (Draft · Approved · Locked in N videos) and whether there is a voice. The voice's play disc and the menu
 *  sit on the frame's bottom corner, shown on hover and focus (always on touch). The picture and the words are one
 *  link to the profile. */
export function CastCard({ c, menu }: { c: Character; menu?: ReactNode }) {
  const { state } = useStudio();
  const jobs = useJobsFor({ characterId: c.id, type: 'CHARACTER_APPEARANCE' });
  const image = assetById(state, primaryImageOf(c));
  const s = identityStatus(c);
  const words = statusWords(s);
  const { running } = imageJobs(c, jobs);
  const voice = voiceTrackSource(c);
  const vAsset = assetById(state, voice.assetId);
  const track: Track | null = vAsset && !vAsset.unavailable && vAsset.src ? { id: `voice-${c.id}-${vAsset.id}`, src: vAsset.src, title: c.name, subtitle: voice.text, artworkSrc: image?.src, duration: vAsset.durationSeconds } : null;
  const hasVoice = voiceState(c) !== 'NONE' || Boolean(c.voice.selectedSampleId);
  const href = `/characters/${c.id}`;
  return (
    <li className="poster-card group relative min-w-0">
      <div className="relative">
        <Link href={href} className="poster-link block outline-none" aria-label={[c.name, c.role, T(words.short)].filter(Boolean).join(' — ')}>
          <CharacterImage src={image?.src} kind={image ? imageKindOf(c) : 'NONE'} name={c.name} unavailable={image?.unavailable}>
            {running && <FramePhase>{running.progress?.message || T('cast.image.drawing')}</FramePhase>}
          </CharacterImage>
        </Link>
        {(track || menu) && (
          <div className="card-tools absolute bottom-2 end-2 flex items-center gap-1 rounded-full border border-line-strong bg-raised-2 p-1">
            {track && <CardPlay track={track} name={c.name} />}
            {menu}
          </div>
        )}
      </div>
      <Link href={href} tabIndex={-1} aria-hidden className="mt-2.5 block min-w-0">
        <p className="bi text-[15px] font-semibold leading-5 text-fg" dir="auto"><span className="truncate">{c.name}</span>{c.nameAr && <span className="bi-ar" dir="rtl">{c.nameAr}</span>}</p>
        <p className="mt-0.5 truncate text-[13px] leading-5 text-muted" dir="auto">{c.role || '—'}</p>
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
          {s.kind === 'LOCKED'
            ? <span className="inline-flex items-center gap-1 text-muted"><IconShield aria-hidden className="size-3.5" />{s.lock.reason === 'UNKNOWN' ? T('cast.status.locked') : (s.videos === 1 ? T('cast.card.inVideo') : T('cast.card.inVideos').replace('{n}', String(s.videos)))}</span>
            : <Status tone={words.tone === 'warn' ? 'warn' : words.tone === 'ok' ? 'ok' : 'neutral'}>{T(words.short)}</Status>}
          <span aria-hidden className="text-ink-500">·</span>
          <span>{hasVoice ? T('cast.card.voice') : T('cast.card.noVoice')}</span>
        </p>
      </Link>
    </li>
  );
}

/** The 32 px ivory play disc of a card, through the shared player. */
function CardPlay({ track, name }: { track: Track; name: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  return (
    <button type="button" onClick={() => p.toggle(track)} aria-pressed={st.playing} aria-label={`${st.playing ? T('misc.pause') : T('misc.play')} ${T('cast.voice.of')} ${name}`}
      className="grid size-8 place-items-center rounded-full bg-primary text-on-primary transition-colors hover:bg-[var(--primary-hover)] [&>svg]:size-3.5">
      {st.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden className="translate-x-px" />}
    </button>
  );
}
