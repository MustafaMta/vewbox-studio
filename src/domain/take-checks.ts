import type { QaCheck, Shot, Take } from './types';

/** A TAKE'S CHECKS, AS THE PRODUCER READS THEM (cloud directive §10, final directive §19: quality failures stay
 *  visible; nothing regenerates silently). The worker writes every check on `take.qa.checks` (src/worker/handlers/take.ts):
 *  - GATE checks decide whether the take can be used at all (the picture is decodable, the length, the script was
 *    spoken, nobody extra on screen…): a failed one rejects the take;
 *  - REVIEW checks are continuity signals (the place against its plate, the identities, lip-sync, fades, repeated
 *    frames, unplanned cuts, repeated speech, line timing, the container): a failed one flags the take for a look,
 *    never a rejection;
 *  - a check that could not run is NOT MEASURED — never shown as a pass.
 *  Pure; tested in tests/unit/take-checks.test.ts. Shared by the worker (src/worker/handlers/take.ts: the take's verdict
 *  and the auto-select rule, `takeVerdict`) and the pages (src/components/workspace/checks.ts re-exports it). */

export type CheckKind = 'GATE' | 'REVIEW';
export type CheckOutcome = 'FAILED' | 'REVIEW' | 'NOT_MEASURED' | 'PASSED';

const INFO: Record<string, { label: string; kind: CheckKind }> = {
  decodable: { label: 'The clip plays', kind: 'GATE' },
  duration: { label: 'Length', kind: 'GATE' },
  resolution: { label: 'Resolution', kind: 'GATE' },
  frame_rate: { label: 'Frame rate', kind: 'GATE' },
  audio_stream: { label: 'Sound track present', kind: 'GATE' },
  black_frames: { label: 'Black frames', kind: 'GATE' },
  frozen_video: { label: 'Frozen picture', kind: 'GATE' },
  flicker: { label: 'Flicker', kind: 'GATE' },
  audio_silence: { label: 'Silence', kind: 'GATE' },
  audio_peak: { label: 'Sound level', kind: 'GATE' },
  signal_analysis: { label: 'Picture and sound analysis', kind: 'GATE' },
  'script-spoken': { label: 'The lines are spoken', kind: 'GATE' },
  'people-on-screen': { label: 'People on screen', kind: 'GATE' },
  'guide-head-repeats-tail': { label: 'Join with the shot before', kind: 'REVIEW' },
  'identity-references-applied': { label: 'Character references applied', kind: 'REVIEW' },
  'location-matches-plate': { label: 'The place against its plate', kind: 'REVIEW' },
  'identity-similarity': { label: 'Faces against their canonical images', kind: 'REVIEW' },
  'lip-sync': { label: 'Lip-sync against the recorded lines', kind: 'REVIEW' },
  'singing-sync': { label: 'Singing against the song', kind: 'REVIEW' },
  'no-accidental-fade': { label: 'No fade or black dip', kind: 'REVIEW' },
  'no-duplicate-frames': { label: 'No repeated frames', kind: 'REVIEW' },
  'no-unplanned-cut': { label: 'No unplanned cut inside the take', kind: 'REVIEW' },
  'no-repeated-speech': { label: 'No speech repeated beyond the script', kind: 'REVIEW' },
  'dialogue-timing': { label: 'Each line on time', kind: 'REVIEW' },
  'container-valid': { label: 'File the cut can use', kind: 'REVIEW' },
  'continuity-measured': { label: 'Continuity measurements', kind: 'REVIEW' },
};

/** The producer's name for a check and whether it gates the take (an unknown check gates: a new check is never hidden). */
export function checkInfo(name: string): { label: string; kind: CheckKind } {
  const known = INFO[name];
  if (known) return known;
  const w = name.replace(/[_-]+/g, ' ').trim();
  return { label: w.charAt(0).toUpperCase() + w.slice(1), kind: 'GATE' };
}

const NOT_RUN = /^(not measured|not comparable|not verified)\b/i;

export interface TakeCheck { name: string; label: string; kind: CheckKind; outcome: CheckOutcome; detail?: string; value?: number | string; threshold?: number | string }
export interface LipSyncState { verdict: 'PASS' | 'REVIEW' | 'FAIL' | 'NOT_MEASURED'; against?: 'RECORDED' | 'SONG' | 'TAKE_AUDIO'; lagFrames?: number | null; repaired: boolean }
export interface TakeChecks {
  checks: TakeCheck[];
  failed: TakeCheck[];
  review: TakeCheck[];
  notMeasured: TakeCheck[];
  passed: TakeCheck[];
  lipSync?: LipSyncState;
  /** one line for a take card and the history: "2 flags to review: lip-sync, fade" */
  summary: string;
  tone: 'done' | 'waiting' | 'failed' | 'idle';
}

const outcomeOf = (c: QaCheck, kind: CheckKind): CheckOutcome => {
  if (!c.ok) return kind === 'GATE' ? 'FAILED' : 'REVIEW';
  return c.detail && NOT_RUN.test(c.detail.trim()) ? 'NOT_MEASURED' : 'PASSED';
};

/** What a failed or flagged check means, in a few words for the card and the history. */
const PROBLEM: Record<string, string> = {
  decodable: 'the clip does not play', duration: 'wrong length', resolution: 'resolution too low', frame_rate: 'frame rate too low', audio_stream: 'no sound track', black_frames: 'black frames', frozen_video: 'frozen picture', flicker: 'flicker', audio_silence: 'silent', audio_peak: 'sound clips', signal_analysis: 'could not be analysed',
  'script-spoken': 'the lines were not spoken as written', 'people-on-screen': 'someone extra on screen',
  'identity-references-applied': 'a character reference missing', 'location-matches-plate': 'the place drifted from its plate', 'identity-similarity': 'a face drifted from its canonical image', 'lip-sync': 'lip-sync', 'singing-sync': 'singing sync',
  'no-accidental-fade': 'a fade or black dip', 'no-duplicate-frames': 'repeated frames', 'no-unplanned-cut': 'an unplanned cut', 'no-repeated-speech': 'speech repeated beyond the script', 'dialogue-timing': 'line timing', 'container-valid': 'the file format',
};
const short = (c: { name: string; label: string }) => PROBLEM[c.name] ?? c.label.charAt(0).toLowerCase() + c.label.slice(1);

/** Every check on a take, grouped; `undefined` when the take was never checked (an upload, a sample). */
export function takeChecksOf(t: Pick<Take, 'qa' | 'params' | 'status'>): TakeChecks | undefined {
  if (!t.qa) return undefined;
  const checks = t.qa.checks.map((c): TakeCheck => {
    const info = checkInfo(c.name);
    // the worker rejects only on gate checks; a review check that the worker did mark as failing the take (an old
    // record without the split) still reads as review: the take's status says whether it was rejected
    return { name: c.name, label: info.label, kind: info.kind, outcome: outcomeOf(c, info.kind), detail: c.detail, value: c.value, threshold: c.threshold };
  });
  const by = (o: CheckOutcome) => checks.filter((c) => c.outcome === o);
  const failed = by('FAILED'); const review = by('REVIEW'); const notMeasured = by('NOT_MEASURED'); const passed = by('PASSED');
  const ls = (t.params as { lipSync?: { verdict?: string; against?: string; lagFrames?: number | null; offsetRepair?: boolean } } | undefined)?.lipSync;
  const lipSync: LipSyncState | undefined = ls && typeof ls.verdict === 'string' ? { verdict: ls.verdict as LipSyncState['verdict'], against: ls.against as LipSyncState['against'], lagFrames: ls.lagFrames ?? null, repaired: Boolean(ls.offsetRepair) && ls.against === 'RECORDED' } : undefined;
  const list = (xs: TakeCheck[]) => xs.slice(0, 3).map(short).join(', ') + (xs.length > 3 ? ` and ${xs.length - 3} more` : '');
  let summary: string; let tone: TakeChecks['tone'];
  if (failed.length) { summary = `${failed.length === 1 ? 'Failed' : `${failed.length} checks failed`}: ${list(failed)}`; tone = 'failed'; }
  else if (review.length) { summary = `${review.length} ${review.length === 1 ? 'flag' : 'flags'} to review: ${list(review)}`; tone = 'waiting'; }
  else if (t.status === 'REJECTED') { summary = 'Failed its checks'; tone = 'failed'; }
  else { summary = notMeasured.length ? `Passed · ${notMeasured.length} not measured` : 'Passed its checks'; tone = notMeasured.length ? 'idle' : 'done'; }
  return { checks, failed, review, notMeasured, passed, lipSync, summary, tone };
}

/** THE TAKE'S VERDICT (QA Q6, 2026-10-06), one rule for the worker and the pages:
 *  - REJECT: the take failed its gate (`report.ok` false — unchanged semantics: the take is REJECTED);
 *  - REVIEW: it passed the gate but a check FAILED or is flagged TO REVIEW (a continuity signal, a gate check the
 *    worker kept for a look such as "a picture of someone on screen"), or it could not be verified (`unverified`) —
 *    the take stays READY and choosable, but the studio never chooses it on its own (no IF_UNCHOSEN auto-select);
 *  - ACCEPT: nothing failed or flagged; checks that could not run (NOT MEASURED) do not block, they are shown.
 *  `flags` names the checks that made it REVIEW. Pure. */
export type TakeDecision = 'ACCEPT' | 'REVIEW' | 'REJECT';
export interface TakeVerdict { decision: TakeDecision; autoChoose: boolean; flags: string[]; notMeasured: string[] }
export function takeVerdict(qa: Pick<NonNullable<Take['qa']>, 'ok' | 'checks'> | undefined, opts: { unverified?: boolean } = {}): TakeVerdict {
  if (!qa) return { decision: 'ACCEPT', autoChoose: !opts.unverified, flags: [], notMeasured: [] };
  const grouped = takeChecksOf({ qa: { ok: qa.ok, checks: qa.checks }, status: qa.ok ? 'READY' : 'REJECTED' })!;
  const flags = [...grouped.failed, ...grouped.review].map((c) => c.name);
  const notMeasured = grouped.notMeasured.map((c) => c.name);
  if (!qa.ok) return { decision: 'REJECT', autoChoose: false, flags, notMeasured };
  const review = flags.length > 0 || Boolean(opts.unverified);
  return { decision: review ? 'REVIEW' : 'ACCEPT', autoChoose: !review, flags: opts.unverified && !flags.includes('script-spoken') ? [...flags, 'script-spoken'] : flags, notMeasured };
}

/** The verdict a take carries (`params.verdict`, written by the worker since 2026-10-06), else the one its checks give
 *  (an older take). */
export function takeVerdictOf(t: Pick<Take, 'qa' | 'params' | 'status'>): TakeVerdict {
  const v = (t.params as { verdict?: Partial<TakeVerdict> } | undefined)?.verdict;
  if (v && (v.decision === 'ACCEPT' || v.decision === 'REVIEW' || v.decision === 'REJECT')) return { decision: v.decision, autoChoose: Boolean(v.autoChoose), flags: Array.isArray(v.flags) ? v.flags : [], notMeasured: Array.isArray(v.notMeasured) ? v.notMeasured : [] };
  const unverified = t.qa?.checks.some((c) => c.name === 'script-spoken' && /not verified/i.test(c.detail ?? '')) ?? false;
  const base = takeVerdict(t.qa, { unverified });
  return t.status === 'REJECTED' && base.decision !== 'REJECT' ? { ...base, decision: 'REJECT', autoChoose: false } : base;
}

/** The lip-sync result in words (never a pass when it was not measured). */
export function lipSyncWords(ls: LipSyncState): string {
  const against = ls.against === 'RECORDED' ? 'the recorded lines' : ls.against === 'SONG' ? 'the song' : 'the take’s own sound';
  if (ls.verdict === 'NOT_MEASURED') return 'Lip-sync not measured';
  const lag = typeof ls.lagFrames === 'number' && ls.lagFrames !== 0 ? `, mouths ${Math.abs(ls.lagFrames)} ${Math.abs(ls.lagFrames) === 1 ? 'frame' : 'frames'} ${ls.lagFrames > 0 ? 'late' : 'early'}` : '';
  const verdict = ls.verdict === 'PASS' ? 'In sync' : ls.verdict === 'REVIEW' ? 'Review' : 'Out of sync';
  return `${verdict} with ${against}${lag}${ls.repaired ? ' — the cut moves the line onto the mouths' : ''}`;
}

/** THE AUTHORITATIVE LINE (audio-first dialogue, final directive §15): a line's recording is the one spoken
 *  performance; its alignment (word times from the ASR service's forced alignment, kept on the recording) is what the
 *  take is planned and checked against. Read from the recording's asset provenance. */
export interface LineAudioState { recorded: boolean; stale: boolean; seconds?: number; aligned: 'ALIGNED' | 'NOT_ALIGNED' | 'UNKNOWN'; words?: number; why?: string; voiceRevision?: number }

/** `alignment` on a line recording (src/worker/handlers/take.ts lineAlignment): `{ verdict, words: [{ text, start,
 *  end }], coverage, detail }`; no words = the aligner did not answer (recorded as such, never guessed). A recording
 *  made before forced alignment existed has no `alignment` at all: UNKNOWN. */
export function lineAudioOf(d: Shot['dialogue'][number], asset: { durationSeconds?: number; provenance?: unknown; unavailable?: boolean } | undefined, current: boolean): LineAudioState {
  if (!d.audioAssetId || !asset || asset.unavailable) return { recorded: false, stale: false, aligned: 'UNKNOWN' };
  const prov = (asset.provenance ?? {}) as { alignment?: { words?: unknown[]; verdict?: string; detail?: unknown }; text?: string };
  const words = Array.isArray(prov.alignment?.words) ? prov.alignment!.words!.length : undefined;
  const aligned: LineAudioState['aligned'] = words && words > 0 ? 'ALIGNED' : prov.alignment ? 'NOT_ALIGNED' : 'UNKNOWN';
  const detail = prov.alignment?.detail;
  const why = aligned === 'NOT_ALIGNED' ? (Array.isArray(detail) ? detail.filter((x) => typeof x === 'string').join('; ') : typeof detail === 'string' ? detail : prov.alignment?.verdict?.toLowerCase().replace(/_/g, ' ')) || undefined : undefined;
  // `current`: the worker's own rule (src/domain/voice-identity.ts lineRecordingCurrent — the words and the voice
  // revision the recording was made with); a recording that is not current is recorded again by the next take
  return { recorded: true, stale: !current, seconds: d.durationSeconds ?? asset.durationSeconds, aligned, words, why, voiceRevision: d.voiceRevision };
}

/** The line's state in the producer's words (the shot page's dialogue list). */
export function lineAudioWords(s: LineAudioState): { words: string; tone: 'done' | 'waiting' | 'idle' } {
  if (!s.recorded) return { words: 'Not recorded yet: the next take records it first, then films to it', tone: 'idle' };
  if (s.stale) return { words: 'The recording is out of date (the line or the voice changed): the next take records it again', tone: 'waiting' };
  const len = s.seconds ? `${s.seconds.toFixed(1)} s` : 'Recorded';
  if (s.aligned === 'ALIGNED') return { words: `${len} · the authoritative line · ${s.words} words timed by forced alignment`, tone: 'done' };
  if (s.aligned === 'NOT_ALIGNED') return { words: `${len} · the authoritative line · word timing not measured${s.why ? ` (${s.why})` : ''}`, tone: 'waiting' };
  return { words: `${len} · the authoritative line · recorded before word timing was measured`, tone: 'idle' };
}
