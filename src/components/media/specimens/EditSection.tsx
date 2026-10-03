'use client';

import { useState } from 'react';
import { T } from '@/lib/copy';
import { IconAddNote, IconEdit, IconPlus } from '@/components/ui/icons';
import { CanvasPlayer } from '@/components/players/CanvasPlayer';
import { FilmStrip } from '@/components/edit/FilmStrip';
import { DualScaleStrip } from '@/components/edit/DualScaleStrip';
import { StoryboardReel } from '@/components/edit/StoryboardReel';
import { CompareAB } from '@/components/edit/CompareAB';
import { Timeline } from '@/components/edit/Timeline';
import { DockLayout } from '@/components/edit/DockLayout';
import { Inspector, MIXED, shared, useMixedLabel } from '@/components/edit/Inspector';
import { FocusModeButton, FocusModeProvider } from '@/components/edit/FocusMode';
import { VersionStack } from '@/components/edit/VersionStack';
import { ToolButton, ToolRow } from '@/components/edit/ToolRow';
import { EPISODE, SONGS } from './data';
import { Block, Cell } from './ui';

/** The cutting-room section of the specimen page (§5.12 strips and reel, §5.14, §5.20). */
export function EditSection() {
  const mixed = useMixedLabel();
  const shots = EPISODE.shots;
  const frames = shots.map((s) => ({ id: s.id, number: s.n, src: s.frame, label: s.purpose }));
  const [current, setCurrent] = useState('s3');
  const [time, setTime] = useState(7.5);
  const [clips, setClips] = useState(() => { let t = 0; return shots.map((s) => { const c = { id: s.id, number: s.n, from: t, to: t + s.d, purpose: s.purpose }; t += s.d; return c; }); });
  const [selected, setSelected] = useState<string[]>(['s3']);
  const [win, setWin] = useState(0);
  const [version, setVersion] = useState('v2');
  const total = clips[clips.length - 1].to;
  const dialogue = shots.flatMap((s, i) => (s.line ? [{ id: `d${s.id}`, from: clips[i].from + 0.3, to: clips[i].to - 0.4, text: s.line, lang: 'en' }] : []));
  // a programme longer than five minutes, for the dual-scale strip: the seven shots repeated as twelve scenes of 30 s
  const long = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, from: i * 30, to: (i + 1) * 30, src: shots[i % shots.length].frame }));
  const shot = shots.find((s) => s.id === current) ?? shots[0];
  const sel = shots.filter((s) => selected.includes(s.id));
  const dur = shared(sel.map((s) => s.d));

  return (
    <section id="edit" className="spec-section" aria-labelledby="spec-edit-h">
      <h2 id="spec-edit-h" className="h2 spec-section-h">{T('media.spec.edit')}</h2>

      <Block title={T('media.spec.strips')}>
        <div className="spec-stack">
          <Cell label="lobby"><FilmStrip frames={frames} variant="lobby" current={current} onSelect={(f) => setCurrent(f.id)} /></Cell>
          <Cell label="cutting room"><div data-room="cutting"><FilmStrip frames={frames} variant="cutting" current={current} onSelect={(f) => setCurrent(f.id)} /></div></Cell>
          <Cell label="9:16"><FilmStrip frames={[1, 2, 3, 4].map((n) => ({ id: `v${n}`, number: n, src: `/sample/frames/vertical-${n}-a.svg` }))} aspect="9/16" /></Cell>
        </div>
      </Block>

      <Block title={T('media.spec.dual')}>
        <div data-room="cutting">
          <DualScaleStrip duration={360} start={win} length={60} onStart={setWin} segments={long}>
            <FilmStrip frames={long.filter((s) => s.to > win && s.from < win + 60).map((s, i) => ({ id: s.id, number: Math.round(s.from / 30) + 1, src: s.src ?? null, label: `${i}` }))} variant="cutting" />
          </DualScaleStrip>
        </div>
      </Block>

      <Block title={T('media.spec.reel')}>
        <div className="spec-row spec-row-2">
          <StoryboardReel shots={shots.map((s) => ({ id: s.id, number: s.n, src: s.frame, duration: s.d }))} onShot={(i) => setCurrent(shots[i].id)} />
          <FilmStrip frames={frames} current={current} onSelect={(f) => setCurrent(f.id)} />
        </div>
      </Block>

      <Block title={T('media.spec.compare')}>
        <div data-room="cutting" data-density="compact">
          <CompareAB a={{ src: shots[0].take!, poster: shots[0].frame!, label: `${T.f('media.versions.version', { n: 2 })}`, chosen: true }} b={{ src: '/sample/takes/take-01.mp4', poster: shots[0].frame!, label: T.f('media.versions.version', { n: 1 }) }} onChoose={() => undefined} />
        </div>
      </Block>

      <Block title={T('media.spec.timeline')}>
        <div data-room="cutting" data-density="compact">
          <Timeline duration={total} time={time} onSeek={setTime} clips={clips} dialogue={dialogue} music={{ src: SONGS[0].audio!, label: SONGS[0].title }}
            selected={selected} onSelect={setSelected} onTrim={(id, edge, t) => setClips((xs) => xs.map((c) => (c.id === id ? { ...c, [edge === 'start' ? 'from' : 'to']: t } : c)))} />
        </div>
      </Block>

      <Block title={T('media.spec.dock')}>
        <FocusModeProvider>
          <div data-room="cutting" data-density="compact" className="spec-dock">
            <DockLayout id="spec" canvasTitle={T('media.spec.frame')} tools={<FocusModeButton />}
              list={{ title: T('media.spec.shots'), content: (
                <ul className="spec-shotlist">{shots.map((s) => (
                  <li key={s.id}><button type="button" className="ebtn spec-shot" aria-pressed={s.id === current} onClick={() => setCurrent(s.id)}><span className="tc">{s.n}</span><span dir="auto">{s.purpose}</span></button></li>
                ))}</ul>
              ) }}
              canvas={<CanvasPlayer src={shot.take ?? EPISODE.cut} poster={shot.frame ?? undefined} title={shot.purpose} />}
              inspector={{ title: T('media.spec.details'), content: (
                <Inspector kind={T.f('media.shot', { n: shot.n })} name={shot.purpose}
                  sections={[{ id: 'versions', title: T('media.versions.label'), content: <VersionStack versions={[1, 2, 3].map((n) => ({ id: `v${n}`, n }))} current={version} onPick={setVersion} onCompare={() => undefined} /> }]}
                  details={<p className="tc">{shot.take}</p>} />
              ) }}
              footer={<FilmStrip frames={frames} variant="cutting" current={current} onSelect={(f) => setCurrent(f.id)} />} />
          </div>
        </FocusModeProvider>
      </Block>

      <Block title={T('media.spec.inspector')}>
        <div className="spec-row spec-row-3">
          <Cell><div className="spec-panel"><Inspector kind={T.f('media.shot', { n: shot.n })} name={shot.purpose} sections={[{ id: 'd', title: T('media.sections.time'), content: <p className="tc">{shot.d} s</p> }]} /></div></Cell>
          <Cell><div className="spec-panel"><Inspector count={Math.max(2, sel.length)} sections={[{ id: 'd', title: T('media.sections.time'), content: <p className="tc">{dur === MIXED || sel.length < 2 ? mixed : `${String(dur)} s`}</p> }]} /></div></Cell>
          <Cell><div className="spec-panel"><Inspector /></div></Cell>
        </div>
      </Block>

      <Block title={T('media.spec.versions')}>
        <div className="spec-stack">
          <VersionStack versions={[1, 2, 3, 4, 5].map((n) => ({ id: `v${n}`, n }))} current={version} onPick={setVersion} onCompare={() => undefined} />
          <div className="spec-toolrow">
            <ToolRow floating={false}>
              <ToolButton first icon={<IconEdit aria-hidden />} onClick={() => undefined}>{T('media.spec.a.trim')}</ToolButton>
              <ToolButton icon={<IconPlus aria-hidden />} onClick={() => undefined}>{T('media.spec.a.split')}</ToolButton>
              <ToolButton icon={<IconAddNote aria-hidden />} onClick={() => undefined}>{T('media.spec.a.note')}</ToolButton>
            </ToolRow>
          </div>
        </div>
      </Block>
    </section>
  );
}
