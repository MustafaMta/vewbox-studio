'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Character } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { Button, ConfirmButton } from '@/components/ui/kit';
import { Art } from '@/components/ui/cinema';
import { VoicePreview } from '@/components/players/Controls';
import { IconDelete, IconGenerate, IconOpen } from '@/components/ui/icons';
import { dialectLabel } from '@/lib/format';
import type { VoiceIdentityV2 } from '../contract';
import type { StepView } from './preflight';

const OPEN_AFTER = 6;

/** READY — the stepper collapses into the result: portrait, name, role, three traits, the proof line with a play
 *  button when a voice was built, and one primary action, Open profile (opened on its own after a short pause unless
 *  the producer touches the card). Try another look re-runs the portrait only; Discard removes the record. */
export function ReadyCard({ c, steps, profileHref, onAnotherLook, onDiscard, anotherLookDisabled }: { c: Character; steps: StepView[]; profileHref: string; onAnotherLook: () => void; onDiscard: () => void; anotherLookDisabled?: string }) {
  const T = useT();
  const { state } = useStudio();
  const portrait = assetById(state, c.portraitAssetId);
  const identity = c.voice.identity as VoiceIdentityV2 | undefined;
  const proofSample = identity?.proof ? c.voice.samples.find((s) => s.id === identity.proof!.sampleId) : undefined;
  const proofAsset = assetById(state, proofSample?.assetId ?? identity?.proof?.assetId);
  const lang = `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`;
  const track = proofAsset && !proofAsset.unavailable ? { id: `voice-${c.id}-proof`, src: proofAsset.src, title: `${c.name} — ${T('voice.proofLine')}`, subtitle: lang, artworkSrc: portrait?.src, duration: proofAsset.durationSeconds } : null;
  const [left, setLeft] = useState(OPEN_AFTER);
  const [held, setHeld] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (held) return;
    if (left <= 0) { linkRef.current?.click(); return; }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left, held]);
  const outcomes = steps.map((s) => ({ step: s.step, done: s.state === 'done' }));
  return (
    <section className="card p-4 fade-in sm:p-5" aria-labelledby="ready-h" onPointerDown={() => setHeld(true)} onKeyDown={() => setHeld(true)} onFocus={() => setHeld(true)}>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Art src={portrait?.src} ratio="portrait" title={c.name} unavailable={portrait?.unavailable} />
        <div className="min-w-0">
          <p className="eyebrow">{T('char.create.ready')}</p>
          <h2 id="ready-h" className="h2 mt-1 bi" dir="auto"><span>{c.name}</span>{c.nameAr && <span className="bi-ar" dir="rtl">{c.nameAr}</span>}</h2>
          <p className="mt-1 text-[14px] text-body" dir="auto">{c.role || '—'}</p>
          {c.distinguishing.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{c.distinguishing.slice(0, 3).map((x) => <li key={x} className="badge" dir="auto">{x}</li>)}</ul>}
          <ul className="mt-3 flex flex-wrap gap-1.5 text-[12px]" aria-label={T('char.create.made')}>
            {outcomes.map((o) => <li key={o.step} className={`badge ${o.done ? 'badge-ok' : ''}`}>{T.dyn(`char.create.step.${o.step}`)}{o.done ? '' : ` · ${T('jp.skipped')}`}</li>)}
          </ul>
          <div className="mt-4">
            {track ? <VoicePreview track={track} name={T('voice.proofLine')} detail={lang} source="GENERATED" portraitSrc={portrait?.src ?? ''} /> : <p className="text-[12.5px] text-faint">{T('char.create.noVoiceYet')}</p>}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link ref={linkRef} href={profileHref} className="btn btn-primary"><IconOpen aria-hidden />{T('char.create.openProfile')}{!held && left > 0 ? <span className="num opacity-80"> · {left}</span> : null}</Link>
            <Button variant="secondary" icon={<IconGenerate />} onClick={onAnotherLook} disabled={Boolean(anotherLookDisabled)} title={anotherLookDisabled}>{T('char.create.anotherLook')}</Button>
            <ConfirmButton variant="ghost" size="sm" icon={<IconDelete />} label={T('btn.discard')} title={`${T('btn.delete')}: ${c.name}`} message={T('char.deleteConfirm')} onConfirm={onDiscard} />
          </div>
          {!held && <p className="mt-2 text-[11.5px] text-faint">{T('char.create.opening')}</p>}
        </div>
      </div>
    </section>
  );
}
