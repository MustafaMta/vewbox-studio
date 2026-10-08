'use client';

import type { Production, Shot } from '@/domain/types';
import { useLive } from '@/studio/org';
import { StateWord } from '@/components/ui/kit';

/** BEFORE THE NEXT TAKE (final directive §20, first-attempt reliability): the take preflight the worker runs before
 *  it touches the engine, read from GET /api/productions/:id/shots/:shotId/preflight on the saved shot — what would
 *  refuse the take, and what the take would only be warned about. Every row is the server's own check; nothing here is
 *  estimated. The worker checks again when it runs (on the pinned World Bible). */

interface Check { name: string; ok: boolean; detail?: string; failureClass?: string }
interface Answer { ok: boolean; checks: Check[]; warnings: Array<{ name: string; detail: string }>; backend: 'local' | 'api' | null; version: number }

const LABEL: Record<string, string> = {
  'scene-exists': 'The shot belongs to a scene',
  'location-resolved': 'The scene has its place',
  'characters-in-cast': 'Everyone in it is in the cast',
  'speakers-in-cast': 'Every line has a speaker in the cast',
  'prompt-complete': 'The shot says what happens',
  'lines-have-text': 'Every line has words',
  'duration-in-range': 'Length the engine can make',
  'continuation-fits-budget': 'New picture fits after the guide',
  'reference-pictures-within-limit': 'Reference pictures within the limit',
  'opening-frame-people': 'Opening frame holds the right people',
  'ending-frame-people': 'Ending frame holds the right people',
  'identity-reference-present': 'A picture holds each identity',
  'guides-within-limit': 'Guides within the limit',
  'guides-fit-clip': 'Guides fit the clip',
  'location-plate': 'The place has its plate',
  'identity-conditioning': 'Characters and place are conditioned on',
  'every-character-has-image': 'Every character has a canonical image',
  'canonical-approved-before-first-use': 'Canonical images approved before first use',
  'dialogue-fits-clip': 'The recorded lines fit the clip',
  'speakers-have-voices': 'Every speaker has a voice',
  'voice-references-within-limit': 'Voices within the limit',
  'song-present': 'The song is there',
  'boundary-honoured': 'The join with the shot before can be made',
  'continuation-source-ready': 'The shot before has a take to continue',
  'video-engine-configured': 'The video engine is configured',
};
const WARN: Record<string, string> = {
  'identity-approved': 'Identity not approved',
  'continuation-choice-set-aside': 'Guide length set aside',
  'characters-over-picture-budget': 'Characters beyond the picture budget',
  'transition-matches-relation': 'Transition and join disagree',
  'hosted-lowering': 'Hosted engine lowers the join',
  'insert-from-frame': 'Insert filmed from its frame alone',
  'context-gap': 'Missing from the production context',
  're-anchor': 'Re-anchoring on the canonical images',
  'cuts-sung-line': 'The shot cuts a sung line',
  'non-performers-in-shot': 'People who do not sing here',
};
export const preflightLabel = (name: string) => LABEL[name] ?? WARN[name] ?? name.replace(/-/g, ' ');

export function Readiness({ p, shot, dirty }: { p: Production; shot: Shot; dirty: boolean }) {
  const { data, error } = useLive<Answer>(`/api/productions/${encodeURIComponent(p.id)}/shots/${encodeURIComponent(shot.id)}/preflight`, [shot]);
  if (error) return <p className="t-meta ws-ready-note" role="status">The checks before a take could not be read: {error}</p>;
  if (!data) return <p className="t-meta ws-ready-note" aria-busy="true">Reading the checks before a take…</p>;
  const failed = data.checks.filter((c) => !c.ok);
  return (
    <div className="ws-ready" aria-live="polite">
      <p className="ws-ready-head">
        <StateWord tone={failed.length ? 'failed' : data.warnings.length ? 'waiting' : 'done'}>
          {failed.length ? `${failed.length} ${failed.length === 1 ? 'check refuses' : 'checks refuse'} the take` : data.warnings.length ? `Ready · ${data.warnings.length} ${data.warnings.length === 1 ? 'warning' : 'warnings'}` : `Ready · ${data.checks.length} checks pass`}
        </StateWord>
        {dirty && <span className="t-meta"> · for the saved shot</span>}
      </p>
      {(failed.length > 0 || data.warnings.length > 0) && (
        <ul className="ws-files" role="list">
          {failed.map((c) => <li key={c.name}><span className="ws-file-words"><span className="ws-file-name">{preflightLabel(c.name)}</span>{c.detail && <span className="t-meta" dir="auto">{c.detail}</span>}</span><StateWord tone="failed">Refuses</StateWord></li>)}
          {data.warnings.map((w, i) => <li key={`${w.name}-${i}`}><span className="ws-file-words"><span className="ws-file-name">{preflightLabel(w.name)}</span><span className="t-meta" dir="auto">{w.detail}</span></span><StateWord tone="waiting">Warns</StateWord></li>)}
        </ul>
      )}
      <details className="ws-disc ws-disc-inner">
        <summary className="ws-disc-sum">Every check ({data.checks.length})</summary>
        <ul className="ws-files" role="list">
          {data.checks.map((c) => <li key={c.name}><span className="ws-file-words"><span className="ws-file-name">{preflightLabel(c.name)}</span>{c.detail && <span className="t-meta" dir="auto">{c.detail}</span>}</span><StateWord tone={c.ok ? 'done' : 'failed'}>{c.ok ? 'Passes' : 'Refuses'}</StateWord></li>)}
        </ul>
      </details>
    </div>
  );
}
