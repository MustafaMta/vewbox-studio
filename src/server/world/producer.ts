import type { Production, StudioState, WorldAudioPolicy, WorldBible, WorldChange, WorldPin, WorldRevision } from '@/domain/types';
import { nid } from '@/domain/ids';
import { StudioError } from '@/domain/errors';
import { deriveWorld, diffWorld, repinSafety, scopeKey, usageOf, worldScopeOf } from '@/domain/world';
import { appendRevision, currentPin, latestRevision, pinHistory, revisionById } from './store';

/** THE WORLD BIBLE AS THE PRODUCER SEES IT (the production workspace's World Bible panel; GET/POST
 *  /api/productions/:id/world). Reading never writes: a scope without any revision yet is shown as derived from the
 *  studio, marked unrecorded (the first job that needs it records revision 1). The producer's own facts — a world rule,
 *  a relationship, a timeline event — and the audio policy are appended as a new revision by a person (revisions are
 *  append-only; the derivation carries PRODUCER facts forward), never edited in place. A production pinned to an older
 *  revision follows the new one at its next pin check when that is safe (src/domain/world.ts repinSafety). */

export interface WorldView {
  scopeKey: string;
  recorded: boolean;
  /** the revision the production reads: its pin, else the scope's latest, else the derivation */
  reading: { number: number | null; pinned: boolean; createdAt?: string; reason?: string; author?: WorldRevision['author'] };
  latest: { number: number; createdAt: string; reason: string; author: WorldRevision['author'] } | null;
  bible: WorldBible;
  /** what the latest revision changes against the pin, and which of it would change what was already filmed */
  pending: { changes: WorldChange[]; blocking: WorldChange[] };
  pins: Array<Pick<WorldPin, 'revisionNumber' | 'reason' | 'by' | 'createdAt'> & { changes: number }>;
}

export async function worldView(state: StudioState, p: Production): Promise<WorldView> {
  const scope = worldScopeOf(p);
  const key = scopeKey(scope);
  const [latest, pin, pins] = await Promise.all([latestRevision(key), currentPin(p.id), pinHistory(p.id)]);
  const pinned = pin && pin.scopeKey === key ? await revisionById(pin.revisionId) : undefined;
  const reading = pinned ?? latest;
  const bible = reading?.bible ?? deriveWorld(state, scope, undefined, new Date().toISOString());
  const changes = pinned && latest && pinned.id !== latest.id ? diffWorld(pinned.bible, latest.bible) : [];
  const { blocking } = repinSafety(changes, usageOf(p));
  return {
    scopeKey: key,
    recorded: Boolean(latest),
    reading: { number: reading?.number ?? null, pinned: Boolean(pinned), createdAt: reading?.createdAt, reason: reading?.reason, author: reading?.author },
    latest: latest ? { number: latest.number, createdAt: latest.createdAt, reason: latest.reason, author: latest.author } : null,
    bible,
    pending: { changes, blocking },
    pins: pins.filter((x) => x.scopeKey === key).map((x) => ({ revisionNumber: x.revisionNumber, reason: x.reason, by: x.by, createdAt: x.createdAt, changes: x.diff.length })),
  };
}

export type ProducerWorldEdit =
  | { action: 'addRule'; text: string }
  | { action: 'removeRule'; id: string }
  | { action: 'addRelationship'; text: string; characterIds?: string[] }
  | { action: 'removeRelationship'; id: string }
  | { action: 'addEvent'; text: string }
  | { action: 'removeEvent'; id: string }
  | { action: 'audio'; audio: WorldAudioPolicy };

const line = (s: unknown, what: string): string => {
  const t = typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '';
  if (!t) throw new StudioError('INVALID', `A ${what} needs words.`);
  if (t.length > 600) throw new StudioError('INVALID', `A ${what} is at most 600 characters.`);
  return t;
};

/** The producer's edit as the next revision (by a person). Only PRODUCER facts can be removed: what comes from the
 *  show bible, the style or the scenes is changed where it lives. */
export async function editWorld(state: StudioState, p: Production, edit: ProducerWorldEdit, by: string): Promise<{ revision: WorldRevision; created: boolean }> {
  const scope = worldScopeOf(p);
  const now = new Date().toISOString();
  const mine = (source: string) => source === 'PRODUCER';
  let reason: string;
  const build = (latest: WorldRevision | undefined): WorldBible => {
    const b = deriveWorld(state, scope, latest?.bible, now);
    switch (edit.action) {
      case 'addRule': return { ...b, rules: [...b.rules, { id: `rule-p-${nid('r')}`, text: line(edit.text, 'rule'), scope: 'WORLD', source: 'PRODUCER' }] };
      case 'removeRule': if (!b.rules.some((r) => r.id === edit.id && mine(r.source))) throw new StudioError('INVALID', 'Only a rule you added can be removed here.'); return { ...b, rules: b.rules.filter((r) => r.id !== edit.id) };
      case 'addRelationship': { const text = line(edit.text, 'relationship'); const known = new Set(b.characters.map((c) => c.characterId)); return { ...b, relationships: [...b.relationships, { id: `rel-p-${nid('r')}`, text, characterIds: (edit.characterIds ?? []).filter((id) => known.has(id)), source: 'PRODUCER' }] }; }
      case 'removeRelationship': if (!b.relationships.some((r) => r.id === edit.id && mine(r.source))) throw new StudioError('INVALID', 'Only a relationship you added can be removed here.'); return { ...b, relationships: b.relationships.filter((r) => r.id !== edit.id) };
      case 'addEvent': { const order = Math.max(0, ...b.timeline.map((e) => e.order)) + 1; return { ...b, timeline: [...b.timeline, { id: `ev-p-${nid('e')}`, order, text: line(edit.text, 'timeline fact'), source: 'PRODUCER' }] }; }
      case 'removeEvent': if (!b.timeline.some((e) => e.id === edit.id && mine(e.source))) throw new StudioError('INVALID', 'Only a fact you added can be removed here.'); return { ...b, timeline: b.timeline.filter((e) => e.id !== edit.id) };
      case 'audio': return { ...b, audio: edit.audio };
    }
  };
  switch (edit.action) {
    case 'addRule': reason = 'the producer added a world rule'; break;
    case 'removeRule': reason = 'the producer removed a world rule'; break;
    case 'addRelationship': reason = 'the producer added a relationship'; break;
    case 'removeRelationship': reason = 'the producer removed a relationship'; break;
    case 'addEvent': reason = 'the producer added a timeline fact'; break;
    case 'removeEvent': reason = 'the producer removed a timeline fact'; break;
    case 'audio': reason = `audio policy: dialogue ${edit.audio.dialogue}, song bed ${edit.audio.songBed}`; break;
  }
  return appendRevision(scope, build, { author: { kind: 'HUMAN', id: by }, reason: reason! });
}
