'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Production, WorldAudioPolicy, WorldBible, WorldChange, WorldPin, WorldRevision } from '@/domain/types';
import { useLive } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { assetById } from '@/studio/selectors';
import { useToast } from '@/components/ui/toast';
import { Button, ErrorState, Input, SectionHead, Segmented, Skeleton, StateWord } from '@/components/ui/kit';
import { Frame } from '@/components/media/Frame';
import { IconDelete, IconPlus } from '@/components/ui/icons';
import { dayTime, vocab } from './model';

/** THE WORLD BIBLE IN THE WORKSPACE (src/domain/world.ts; GET/POST /api/productions/:id/world): the versioned record
 *  every take of this production is made against — the world's rules, its people (the canonical image and voice
 *  revision each holds, the wardrobe seen), its places (the identity version, every plate, the frames an approved cut
 *  established, whether the place is locked), its props, the story timeline, the audio policy — and which revision
 *  this production reads (pinned at its story's approval), what a newer revision would change, and the pin history.
 *  The producer adds their own rules, relationships and timeline facts and sets the audio policy here; everything else
 *  is changed where it lives (a character's page, a location's page, the scenes) and arrives as a new revision. */

interface View {
  scopeKey: string; recorded: boolean;
  reading: { number: number | null; pinned: boolean; createdAt?: string; reason?: string; author?: WorldRevision['author'] };
  latest: { number: number; createdAt: string; reason: string; author: WorldRevision['author'] } | null;
  bible: WorldBible; pending: { changes: WorldChange[]; blocking: WorldChange[] };
  pins: Array<Pick<WorldPin, 'revisionNumber' | 'reason' | 'by' | 'createdAt'> & { changes: number }>;
}

const SOURCE: Record<string, string> = { SHOW_BIBLE: 'show bible', STYLE: 'style', PRODUCER: 'yours', SCENE: 'a scene' };
const ROLE: Record<string, string> = { MASTER: 'Master plate', VIEW: 'View', STATE: 'Time of day', ESTABLISHED: 'Established in a cut' };

export function WorldBiblePanel({ p }: { p: Production }) {
  const { state } = useStudio();
  const toast = useToast();
  const url = `/api/productions/${encodeURIComponent(p.id)}/world`;
  const { data, error, reload } = useLive<View>(url, [state.version]);
  const [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, by: 'producer' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: { message?: string }; message?: string }).error?.message ?? (j as { message?: string }).message ?? `HTTP ${r.status}`);
      toast.ok(ok); reload();
    } catch (e) { toast.bad((e as Error).message); } finally { setBusy(false); }
  };
  if (error && !data) return <section className="ws-sec" aria-labelledby="ws-world-h"><SectionHead id="ws-world-h" title="World Bible" /><ErrorState title="The World Bible could not be read" action={<Button size="sm" onClick={reload}>Try again</Button>} details={error}>The production is unchanged; only this view failed.</ErrorState></section>;
  if (!data) return <WorldBibleSkeleton />;
  const b = data.bible;
  const name = (id: string) => b.characters.find((c) => c.characterId === id)?.name ?? state.characters.find((c) => c.id === id)?.name ?? id;
  const head = !data.recorded ? 'Not recorded yet: derived from the studio as it is; the first take records revision 1.'
    : data.reading.pinned ? `Revision ${data.reading.number}, pinned at the story’s approval${data.reading.createdAt ? ` (${dayTime(data.reading.createdAt)})` : ''}.`
      : `Revision ${data.reading.number}, read but not pinned: the story is not approved yet.`;
  return (
    <section className="ws-sec ws-world" aria-labelledby="ws-world-h" aria-busy={busy || undefined}>
      <SectionHead id="ws-world-h" title="World Bible" description={`What every take of this ${p.showId ? 'show' : 'production'} is made against. ${head}`} />
      {data.pending.changes.length > 0 && (
        <div className="card ws-world-pending" role="status">
          <StateWord tone={data.pending.blocking.length ? 'waiting' : 'idle'}>{`Revision ${data.latest?.number} has ${data.pending.changes.length} ${data.pending.changes.length === 1 ? 'change' : 'changes'}`}</StateWord>
          <p className="t-meta">{data.pending.blocking.length ? `${data.pending.blocking.length} would change what this production already filmed, so it stays on revision ${data.reading.number}; approve the story again to take them.` : 'Nothing it already filmed changes: the next take follows them.'}</p>
          <ul className="t-meta ws-world-changes" role="list">{data.pending.changes.slice(0, 8).map((c, i) => <li key={i} dir="auto" data-blocking={data.pending.blocking.includes(c) || undefined}>{c.op.toLowerCase()} · {c.detail ?? c.path}</li>)}</ul>
        </div>
      )}

      <div className="ws-world-grid">
        <WorldList title="Rules" count={b.rules.length} empty="No world rules yet." add={{ label: 'Add a rule', placeholder: 'A rule of this world (magic has a price; it is always autumn)', busy, onAdd: (text) => send({ action: 'addRule', text }, 'Rule added: a new revision.') }}
          items={b.rules.map((r) => ({ id: r.id, text: r.text, meta: SOURCE[r.source] ?? r.source, remove: r.source === 'PRODUCER' ? () => send({ action: 'removeRule', id: r.id }, 'Rule removed: a new revision.') : undefined }))} />
        <WorldList title="Relationships" count={b.relationships.length} empty="No relationships written yet." add={{ label: 'Add a relationship', placeholder: 'Who is what to whom', busy, onAdd: (text) => send({ action: 'addRelationship', text }, 'Relationship added: a new revision.') }}
          items={b.relationships.map((r) => ({ id: r.id, text: r.text, meta: [SOURCE[r.source] ?? r.source, r.characterIds.map(name).join(', ')].filter(Boolean).join(' · '), remove: r.source === 'PRODUCER' ? () => send({ action: 'removeRelationship', id: r.id }, 'Relationship removed.') : undefined }))} />
      </div>

      <div className="ws-world-block">
        <h3 className="t-title">People</h3>
        {b.characters.length === 0 ? <p className="t-meta">Nobody in this world yet.</p> : (
          <ul className="ws-files" role="list">
            {b.characters.map((c) => (
              <li key={c.characterId}>
                <span className="ws-file-words"><Link className="ws-file-name name" href={`/characters/${encodeURIComponent(c.characterId)}`}><bdi>{c.name}</bdi></Link>
                  <span className="t-meta" dir="auto">{[c.canonical ? `image v${c.canonical.version} ${c.canonical.status === 'APPROVED' ? 'approved' : 'draft'}` : 'no canonical image', c.voice ? `voice revision ${c.voice.revision}${c.voice.status !== 'ACTIVE' ? ` (${c.voice.status.toLowerCase()})` : ''}` : 'no voice', c.wardrobe.length ? `wears: ${c.wardrobe.map((w) => w.label).join('; ')}` : null].filter(Boolean).join(' · ')}</span></span>
                <StateWord tone={c.canonical?.status === 'APPROVED' ? 'done' : 'waiting'}>{c.canonical?.status === 'APPROVED' ? 'Approved' : 'Not approved'}</StateWord>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ws-world-block">
        <h3 className="t-title">Places</h3>
        {b.locations.length === 0 ? <p className="t-meta">No place in this world yet.</p> : b.locations.map((l) => (
          <div key={l.locationId} className="card ws-world-place">
            <div className="ws-world-place-head">
              <Link className="t-card name" href={`/locations/${encodeURIComponent(l.locationId)}`}><bdi>{l.name}</bdi></Link>
              <span className="t-meta">{vocab(l.kind)} · identity v{l.identity.version} · {l.plates.length} {l.plates.length === 1 ? 'plate' : 'plates'}</span>
              {l.locked ? <StateWord tone="done">Locked: used in an approved cut</StateWord> : <StateWord tone="idle">Not locked yet</StateWord>}
            </div>
            {l.canon.fixedFeatures.length > 0 && <p className="t-meta" dir="auto">Fixed: {l.canon.fixedFeatures.join('; ')}</p>}
            {l.plates.length > 0 && (
              <ul className="ws-world-plates" role="list">
                {l.plates.map((pl) => { const a = assetById(state, pl.assetId); return (
                  <li key={pl.assetId}>
                    <Frame asset={a} ratio="16/9" fit="cover" alt="" decorative art={artVars(a)} title={pl.label} radius="none" />
                    <span className="t-meta">{ROLE[pl.role] ?? pl.role}{pl.timeOfDay ? ` · ${vocab(pl.timeOfDay).toLowerCase()}` : ''}</span>
                  </li>
                ); })}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="ws-world-grid">
        <div className="ws-world-block">
          <h3 className="t-title">Props</h3>
          {b.props.length === 0 ? <p className="t-meta">No props recorded yet.</p> : <ul className="ws-files" role="list">{b.props.map((x) => <li key={x.id}><span className="ws-file-words"><span className="ws-file-name" dir="auto">{x.name}</span><span className="t-meta" dir="auto">{[x.ownerCharacterId ? `${name(x.ownerCharacterId)}’s` : null, x.last?.state, x.last?.position].filter(Boolean).join(' · ') || 'Not seen in a shot yet'}</span></span></li>)}</ul>}
        </div>
        <WorldList title="Timeline" count={b.timeline.length} empty="Nothing has happened yet." add={{ label: 'Add a fact', placeholder: 'Something that is true from now on in the story', busy, onAdd: (text) => send({ action: 'addEvent', text }, 'Fact added to the timeline.') }}
          items={b.timeline.slice(-12).map((e) => ({ id: e.id, text: e.text, meta: SOURCE[e.source] ?? e.source, remove: e.source === 'PRODUCER' ? () => send({ action: 'removeEvent', id: e.id }, 'Fact removed.') : undefined }))} />
      </div>

      <div className="ws-world-block">
        <h3 className="t-title">Sound in the cut</h3>
        <AudioPolicy value={b.audio} busy={busy} onChange={(audio) => send({ action: 'audio', audio }, 'Audio policy saved: a new revision.')} />
      </div>

      {data.pins.length > 0 && (
        <details className="ws-disc ws-disc-inner">
          <summary className="ws-disc-sum">Pin history ({data.pins.length})</summary>
          <ul className="t-meta ws-world-changes" role="list">{data.pins.map((x, i) => <li key={i}>{dayTime(x.createdAt)} · revision {x.revisionNumber} · {x.reason === 'STORY_APPROVAL' ? 'at the story’s approval' : 'followed safely'} · {x.changes} {x.changes === 1 ? 'change' : 'changes'}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function WorldList({ title, count, items, empty, add }: { title: string; count: number; items: Array<{ id: string; text: string; meta?: string; remove?: () => void }>; empty: string; add?: { label: string; placeholder: string; busy: boolean; onAdd: (text: string) => void } }) {
  const [text, setText] = useState('');
  return (
    <div className="ws-world-block">
      <h3 className="t-title">{title} <span className="ws-ro ws-count">{count}</span></h3>
      {items.length === 0 ? <p className="t-meta">{empty}</p> : (
        <ul className="ws-files" role="list">
          {items.map((x) => (
            <li key={x.id}>
              <span className="ws-file-words"><span className="ws-file-name" dir="auto">{x.text}</span>{x.meta && <span className="t-meta">{x.meta}</span>}</span>
              {x.remove && <Button size="sm" variant="quiet" icon={<IconDelete aria-hidden />} aria-label={`Remove: ${x.text}`} onClick={x.remove} />}
            </li>
          ))}
        </ul>
      )}
      {add && (
        <form className="ws-world-add" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { add.onAdd(text.trim()); setText(''); } }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={add.placeholder} aria-label={add.label} dir="auto" maxLength={600} />
          <Button type="submit" size="sm" icon={<IconPlus aria-hidden />} disabled={!text.trim() || add.busy}>{add.label}</Button>
        </form>
      )}
    </div>
  );
}

function AudioPolicy({ value, onChange, busy }: { value: WorldAudioPolicy; onChange: (a: WorldAudioPolicy) => void; busy: boolean }) {
  return (
    <div className="ws-world-audio">
      <div className="ws-fieldset">
        <span className="t-label">Dialogue</span>
        <Segmented<WorldAudioPolicy['dialogue']> label="Dialogue in the cut" size="sm" value={value.dialogue} onChange={(dialogue) => { if (!busy) onChange({ ...value, dialogue }); }}
          options={[{ value: 'AUTO', label: 'Automatic' }, { value: 'RECORDED_VOICE', label: 'The recorded line' }, { value: 'MODEL_VOICE', label: 'The take’s own speech' }]} />
        <p className="t-meta">{value.dialogue === 'RECORDED_VOICE' ? 'Every speaking shot plays the character’s recorded line.' : value.dialogue === 'MODEL_VOICE' ? 'Every speaking shot keeps the speech the take was made with.' : 'The recorded line where the take is silent or its speech check failed; the take’s own speech elsewhere.'}</p>
      </div>
      <div className="ws-fieldset">
        <span className="t-label">A song under dialogue</span>
        <Segmented<WorldAudioPolicy['songBed']> label="A song under dialogue" size="sm" value={value.songBed} onChange={(songBed) => { if (!busy) onChange({ ...value, songBed }); }}
          options={[{ value: 'INSTRUMENTAL_WHEN_AVAILABLE', label: 'Instrumental when there is one' }, { value: 'MASTER', label: 'The full song, lowered' }]} />
      </div>
    </div>
  );
}

export function WorldBibleSkeleton() {
  return (
    <section className="ws-sec ws-world" aria-busy>
      <Skeleton.Line size="title" width="10rem" />
      <Skeleton.Line width="60%" />
      <div className="ws-world-grid">{[0, 1].map((i) => <div key={i} className="ws-world-block"><Skeleton.Text lines={4} /></div>)}</div>
      <div className="ws-world-block"><Skeleton.Text lines={3} /></div>
    </section>
  );
}
