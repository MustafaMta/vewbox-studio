'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production, Shot } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { assetById, castOf, locationById, shotHref, shotLabel } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, Menu, MenuItem, MenuLink, Modal, StateWord } from '@/components/ui/kit';
import { Frame } from '@/components/media/Frame';
import { displaySrc, runtime } from '@/components/home/model';
import { ShotFields, emptyShot, type ShotDraft } from '../ShotForm';
import { IconDelete, IconDown, IconDuplicate, IconEdit, IconGenerate, IconPlus, IconUp } from '@/components/ui/icons';
import { GenButton, type StudioGate } from '../gate';
import { BOUNDARY_WORDS, boundaryOf, frameRatioOf, shotState, vocab, workspaceHref } from '../model';

/** STORYBOARD — the shots as frames, scene by scene, in the film's ratio. Drag a frame onto another to reorder it in
 *  its scene (or use its menu); open one to work on it. The shot planner drafts the board from the script on request. */
export function StoryboardTab({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, act, jobs } = useStudio();
  const toast = useToast();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const counts = { framed: p.shots.filter((s) => s.openingFrameAssetId).length, filmed: p.shots.filter((s) => s.takes.length).length, chosen: p.shots.filter((s) => s.selectedTakeId).length };
  const total = p.shots.reduce((a, s) => a + s.durationSeconds, 0);
  const scripted = p.scenes.some((sc) => sc.beats.length > 0);
  const hasTakes = p.shots.some((s) => s.takes.length > 0);
  const ratio = frameRatioOf(p);
  const drop = (target: string | null) => { if (dragging && dragging !== target) act('reorderShot', p.id, dragging, target); setDragging(null); setOver(null); };

  return (
    <div className="ws-main ws-board">
      <div className="ws-pane-head">
        <h1 className="t-section">Storyboard</h1>
        <span className="ws-pane-state t-meta ws-slate"><span>{p.shots.length} planned</span><span>{counts.framed} framed</span><span>{counts.filmed} with takes</span><span>{counts.chosen} selected</span><span>{runtime(total) ?? '0:00'} of {runtime(p.targetSeconds)}</span></span>
      </div>
      <div className="ws-gen-row">
        <GenButton gate={gate} engine="story" type="PLAN_SHOTS" payload={{ productionId: p.id, force: hasTakes }} target={{ productionId: p.id }} icon={<IconGenerate aria-hidden />} disabled={!scripted} reason="Write the script first."
          confirm={hasTakes ? 'This production already has takes. Replanning replaces its shots; their takes stay only in the library. Continue?' : undefined}>{p.shots.length ? 'Replan the shots' : 'Plan the shots'}</GenButton>
        <AddShot p={p} variant="secondary" />
      </div>
      {p.scenes.length === 0 ? <p className="t-body ws-empty">No scenes yet. <Link className="ws-textlink" href={workspaceHref(p, p.kind === 'MUSIC_VIDEO' ? 'visual' : 'story')}>Write the story first</Link>.</p> : p.scenes.map((sc) => {
        const shots = p.shots.filter((s) => s.sceneId === sc.id);
        const loc = locationById(state, sc.locationId);
        return (
          <section key={sc.id} className="ws-scene" aria-labelledby={`ws-sb-${sc.id}`}>
            <div className="ws-scene-head">
              <h2 id={`ws-sb-${sc.id}`} className="t-title name"><bdi>{sc.number} · {sc.title}</bdi></h2>
              <span className="t-meta ws-slate"><span>{vocab(sc.timeOfDay).toLowerCase()}</span>{loc && <span><bdi>{loc.name}</bdi></span>}<span>{shots.length} {shots.length === 1 ? 'shot' : 'shots'}</span></span>
            </div>
            {shots.length === 0 ? <p className="t-body ws-empty">No shots in this scene yet.</p> : (
              <ol className="ws-strip ws-board-strip" role="list" data-ratio={ratio} onDragOver={(e) => e.preventDefault()}>
                {shots.map((sh, i) => (
                  <BoardCard key={sh.id} p={p} sh={sh} first={i === 0} last={i === shots.length - 1} dragging={dragging === sh.id} over={over === sh.id && dragging !== sh.id}
                    stateWords={shotState(p, sh, jobs)} pic={assetById(state, sh.takes.find((t) => t.id === sh.selectedTakeId)?.thumbnailAssetId) ?? assetById(state, sh.openingFrameAssetId)}
                    onDragStart={() => setDragging(sh.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onDragOver={() => setOver(sh.id)} onDrop={() => drop(sh.id)}
                    onMove={(d) => act('moveShot', p.id, sh.id, d)} onDuplicate={() => { act('duplicateShot', p.id, sh.id); toast.ok('Shot duplicated.'); }}
                    onDelete={() => { if (window.confirm('Delete this shot and its takes?')) { act('deleteShot', p.id, sh.id); toast.ok('Deleted.'); } }} />
                ))}
                {dragging && <li className="ws-drop-end" data-over={over === `end-${sc.id}` || undefined} onDragOver={(e) => { e.preventDefault(); setOver(`end-${sc.id}`); }} onDrop={() => drop(null)} aria-hidden />}
              </ol>
            )}
          </section>
        );
      })}
      {p.shots.length > 0 && <p className="t-meta">Drag a frame onto another to reorder the shots in a scene, or use a shot’s menu.</p>}
      {p.shots.length > 0 && p.stage === 'STORYBOARD' && <div className="ws-gen-row"><Button size="sm" onClick={() => { act('markStepDone', p.id, 'STORYBOARD'); toast.ok('Saved.'); }}>Mark the storyboard done</Button></div>}
    </div>
  );
}

function BoardCard({ p, sh, first, last, dragging, over, pic, stateWords, onDragStart, onDragEnd, onDragOver, onDrop, onMove, onDuplicate, onDelete }: {
  p: Production; sh: Shot; first: boolean; last: boolean; dragging: boolean; over: boolean; pic: ReturnType<typeof assetById>; stateWords: { words: string; tone: 'done' | 'running' | 'waiting' | 'idle' | 'failed' };
  onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const { state } = useStudio();
  const everyone = castOf(state, p);
  const cast = everyone.filter((c) => sh.characterIds.includes(c.id));
  const href = shotHref(p, sh.id);
  // PRE-PRODUCTION AT A GLANCE (producer directive: the board is pre-production, not a table of prompts): how the
  // shot joins the one before, the first line spoken and by whom, whether every speaker has a voice, what continuity
  // the shot carries
  const boundary = boundaryOf(p, sh);
  const lines = sh.dialogue.filter((d) => (p.language === 'AR' ? d.textAr || d.text : d.text || d.textAr)?.trim());
  const speakerOf = (id: string) => everyone.find((c) => c.id === id);
  const opening = lines[0];
  const openingText = opening ? (p.language === 'AR' ? opening.textAr || opening.text : opening.text || opening.textAr) ?? '' : '';
  const speakers = [...new Set(lines.map((d) => d.characterId))].map(speakerOf).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const voiceless = speakers.filter((c) => !c.voice.identity);
  const cont = sh.continuity;
  const carried = cont ? [cont.characters?.length ? `${cont.characters.length} ${cont.characters.length === 1 ? 'look' : 'looks'}` : '', cont.props?.length ? `${cont.props.length} ${cont.props.length === 1 ? 'prop' : 'props'}` : ''].filter(Boolean) : [];
  return (
    <li draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={(e) => { e.preventDefault(); onDragOver(); }} onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className="ws-board-card" data-dragging={dragging || undefined} data-over={over || undefined}>
      <Link className="ws-shot" href={href}>
        <Frame asset={pic} src={displaySrc(pic)} ratio={frameRatioOf(p)} fit="cover" alt="" decorative art={artVars(pic)} title={sh.purpose || `Shot ${shotLabel(p, sh)}`} titleState="notDrawn" className="ws-shot-frame">
          <span className="art-chip ws-ro">{shotLabel(p, sh)} · {sh.durationSeconds} s</span>
        </Frame>
        <span className="ws-shot-name">{vocab(sh.framing)} · {vocab(sh.cameraMove).toLowerCase()} · <span className="t-meta">{BOUNDARY_WORDS[boundary]?.label ?? boundary}</span></span>
        <span className="ws-shot-purpose" dir="auto">{sh.purpose || sh.action || 'No purpose written'}</span>
        {opening && <span className="ws-shot-line" dir="auto"><span className="t-label name"><bdi>{speakerOf(opening.characterId)?.name ?? 'Someone'}</bdi></span> {openingText}{lines.length > 1 && <span className="t-meta"> · +{lines.length - 1} {lines.length === 2 ? 'line' : 'lines'}</span>}</span>}
        {(speakers.length > 0 || carried.length > 0) && (
          <span className="t-meta ws-shot-facts">
            {speakers.length > 0 && <span>{voiceless.length ? <><bdi>{voiceless.map((c) => c.name).join(', ')}</bdi>: no voice yet</> : speakers.length === 1 ? 'Voice ready' : 'Voices ready'}</span>}
            {carried.length > 0 && <span>Continuity: {carried.join(', ')}</span>}
          </span>
        )}
        <span className="ws-shot-state"><StateWord tone={stateWords.tone}>{stateWords.words}</StateWord>{cast.length > 0 && <span className="t-meta name"><bdi>{cast.map((c) => c.name).join(', ')}</bdi></span>}</span>
      </Link>
      <span className="ws-board-menu">
        <Menu label={`Shot ${shotLabel(p, sh)}: more`}>
          <MenuLink href={href} icon={<IconEdit aria-hidden />}>Open the shot</MenuLink>
          <MenuItem icon={<IconUp aria-hidden />} disabled={first} onClick={() => onMove(-1)}>Move earlier</MenuItem>
          <MenuItem icon={<IconDown aria-hidden />} disabled={last} onClick={() => onMove(1)}>Move later</MenuItem>
          <MenuItem icon={<IconDuplicate aria-hidden />} onClick={onDuplicate}>Duplicate</MenuItem>
          <MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={onDelete}>Delete the shot</MenuItem>
        </Menu>
      </span>
    </li>
  );
}

export function AddShot({ p, sceneId, variant = 'primary' }: { p: Production; sceneId?: string; variant?: 'primary' | 'secondary' }) {
  const { act } = useStudio(); const toast = useToast();
  const [draft, setDraft] = useState<ShotDraft>(() => emptyShot(sceneId ?? p.scenes[p.scenes.length - 1]?.id ?? ''));
  return (
    <Modal size="lg" title="Add a shot" trigger={(open) => <Button size="sm" variant={variant} icon={<IconPlus aria-hidden />} disabled={p.scenes.length === 0} onClick={() => { setDraft(emptyShot(sceneId ?? p.scenes[p.scenes.length - 1]?.id ?? '')); open(); }}>Add a shot</Button>}>
      {(close) => (
        <form className="ws-form" onSubmit={(e) => { e.preventDefault(); if (!draft.sceneId) return; act('addShot', p.id, draft); toast.ok('Shot added.'); close(); }}>
          <ShotFields p={p} draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} showScene />
          <div className="ws-form-foot"><Button variant="quiet" onClick={close}>Cancel</Button><Button type="submit" variant="primary">Add</Button></div>
        </form>
      )}
    </Modal>
  );
}
