'use client';

import Link from 'next/link';
import type { Character } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, primaryImageOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { Button, ConfirmButton, Status } from '@/components/ui/kit';
import { IconArrowRight, IconDelete, IconGenerate } from '@/components/ui/icons';
import { dialectLabel } from '@/lib/format';
import { CharacterImage } from '../CharacterImage';
import { VoicePlayer } from '../VoicePlayer';
import { identityStatus, imageKindOf, statusWords, voiceTrackSource } from '../identity';

/** READY — the chain is done and the last word is the producer's: the canonical image, the name and role, the voice
 *  to hear when one was built, and the image's state ("Draft — awaiting your approval"). One primary action hands
 *  over to the profile, where the image is approved. Draw again redraws the image only; Discard removes the record. */
export function ReadyCard({ c, profileHref, onAnotherLook, onDiscard, anotherLookDisabled }: { c: Character; profileHref: string; onAnotherLook: () => void; onDiscard: () => void; anotherLookDisabled?: string }) {
  const T = useT();
  const { state } = useStudio();
  const image = assetById(state, primaryImageOf(c));
  const s = identityStatus(c);
  const words = statusWords(s);
  const voice = voiceTrackSource(c);
  const va = assetById(state, voice.assetId);
  const lang = `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`;
  const track = va && !va.unavailable && va.src ? { id: `voice-${c.id}-${va.id}`, src: va.src, title: c.name, subtitle: lang, duration: va.durationSeconds } : null;
  return (
    <section className="panel p-4 fade-in sm:p-5" aria-labelledby="ready-h">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="max-w-[14rem]"><CharacterImage src={image?.src} kind={image ? imageKindOf(c) : 'NONE'} name={c.name} unavailable={image?.unavailable} alt={T('cast.image.alt').replace('{name}', c.name)} /></div>
        <div className="min-w-0">
          <Status tone={words.tone === 'warn' ? 'warn' : words.tone === 'ok' ? 'ok' : 'neutral'}>{T(words.long)}</Status>
          <h2 id="ready-h" className="h2 mt-2" dir="auto">{c.name}</h2>
          {c.nameAr && <p className="text-sm text-muted"><bdi dir="rtl" lang="ar">{c.nameAr}</bdi></p>}
          <p className="mt-1 text-[14px] text-body" dir="auto">{c.role || '—'}</p>
          <div className="mt-4">
            {track ? <VoicePlayer track={track} name={voice.text ? `“${voice.text}”` : T('voice.proofLine')} detail={lang} source={voice.source} /> : <p className="text-[13px] text-faint">{T('char.create.noVoiceYet')}</p>}
          </div>
          <p className="mt-4 max-w-[60ch] text-[13px] leading-5 text-muted">{s.kind === 'DRAFT' ? T('cast.ready.approveHint') : T('cast.ready.openHint')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href={profileHref} className="btn btn-primary">{s.kind === 'DRAFT' ? T('cast.ready.review') : T('char.create.openProfile')}<IconArrowRight aria-hidden className="rtl:rotate-180" /></Link>
            <Button variant="secondary" icon={<IconGenerate />} onClick={onAnotherLook} disabled={Boolean(anotherLookDisabled)} title={anotherLookDisabled}>{T('char.create.drawAgain')}</Button>
            <ConfirmButton variant="ghost" size="sm" icon={<IconDelete />} label={T('cast.ready.discard')} title={`${T('btn.delete')}: ${c.name}`} message={T('char.deleteConfirm')} onConfirm={onDiscard} />
          </div>
        </div>
      </div>
    </section>
  );
}
