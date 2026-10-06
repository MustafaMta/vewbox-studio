'use client';

import Link from 'next/link';
import type { Character } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { Button, StateWord, useConfirm } from '@/components/ui/kit';
import { IconArrowRight, IconDelete, IconGenerate, IconPlus } from '@/components/ui/icons';
import { Frame } from '@/components/media/Frame';
import { VoicePlayer } from '../VoicePlayer';
import { identityStatus } from '../identity';
import { languageWords } from '../EditDialogs';
import { figureOf, nameLang, voiceTrackOf } from '../parts';

/** READY — the chain is done and the last word is the producer's: the figure, the name and role, the voice to hear
 *  when one was built, and the figure's state. One primary hands over to the profile, where the figure is approved.
 *  Draw again redraws the figure only; Discard deletes the record (with a confirm). */
export function ReadyCard({ c, profileHref, onAnotherLook, onDiscard, onNew, anotherLookDisabled }: { c: Character; profileHref: string; onAnotherLook: () => void; onDiscard: () => void; /** a new character from an empty form; this one stays */ onNew?: () => void; anotherLookDisabled?: string }) {
  const { state } = useStudio();
  const confirm = useConfirm();
  const figure = figureOf(state, c);
  const s = identityStatus(c);
  const track = voiceTrackOf(state, c);
  const discard = async () => { if (await confirm({ title: `Discard ${c.name}?`, body: 'The character is deleted from the studio.', confirmLabel: `Discard ${c.name}`, tone: 'danger' })) onDiscard(); };
  return (
    <section className="card pc-create-card pc-ready" aria-labelledby="ready-h">
      <Frame asset={figure} ratio="928/1664" fit="contain" alt={`${c.name}, full length, from the front`} art={artVars(figure)} title={c.name} titleLang={nameLang(c.name)} titleState="noImage" judge />
      <div className="pc-ready-words">
        {s.kind === 'DRAFT' ? <StateWord tone="waiting">Waiting for your approval</StateWord> : <StateWord tone="done">Ready</StateWord>}
        <h2 id="ready-h" className="t-hero"><bdi lang={nameLang(c.name)}>{c.name}</bdi></h2>
        <p className="t-lead" dir="auto">{c.role || 'No description yet.'}</p>
        {track ? <VoicePlayer track={track} name={track.subtitle ? `“${track.subtitle}”` : 'Proof line'} detail={languageWords(c)} /> : <p className="t-meta">No voice yet: make one on the profile.</p>}
        <p className="t-body pc-empty-line">{s.kind === 'DRAFT' ? 'The figure is a draft until you approve it on the profile.' : 'The character is ready.'}</p>
        <div className="char-form-acts">
          <Link href={profileHref} className="btn btn-primary">{s.kind === 'DRAFT' ? 'Review and approve' : 'Open the profile'}<IconArrowRight aria-hidden /></Link>
          <Button variant="secondary" icon={<IconGenerate />} onClick={onAnotherLook} disabled={Boolean(anotherLookDisabled)} title={anotherLookDisabled}>Draw again</Button>
          <Button variant="quiet" icon={<IconDelete />} onClick={() => void discard()}>Discard</Button>
        </div>
        {onNew && <div className="char-form-acts pc-ready-new"><span className="t-body">{c.name} is kept in the studio.</span><Button variant="secondary" icon={<IconPlus />} onClick={onNew}>Start a new character</Button></div>}
      </div>
    </section>
  );
}
