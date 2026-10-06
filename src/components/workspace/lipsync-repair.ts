import type { JobPayload } from '@/domain/jobs';
import type { Production, Shot, Take } from '@/domain/types';
import { lipsyncRepairOffer } from '@/domain/lipsync-correction';

/** "REPAIR LIP-SYNC" ON A TAKE, as the pages read it (src/domain/lipsync-correction.ts decides; this only words it).
 *  The action redraws the mouth region of one take to its recorded line and makes a NEW take beside it; nothing here
 *  runs without the producer's confirmation and reason. Pure; tested in tests/unit/lipsync-repair-ui.test.ts. */

export const REPAIR_REASON_MIN = 3;

export interface RepairOffer {
  available: boolean;
  /** the take's own lip-sync check asked for it (FAIL / REVIEW): the action is emphasised */
  flagged: boolean;
  /** why the action is off: the corrector's reasons, else the studio's (paused, terms, an engine offline) */
  disabledReason: string | null;
  reasons: string[];
}

/** Whether to offer the repair on this take, and the one line that says why not. `studioReason` is the gate's own
 *  reason (intake paused, the terms, the video engine offline), which wins over the corrector's. */
export function repairOfferOf(p: Pick<Production, 'kind' | 'style'>, sh: Pick<Shot, 'dialogue' | 'characterIds'>, take: Take, studioReason: string | null = null): RepairOffer {
  const o = lipsyncRepairOffer(p, sh, take);
  const disabledReason = studioReason ?? (o.available ? null : o.reasons.map((r) => r.charAt(0).toUpperCase() + r.slice(1).replace(/\s*\(enabled:.*$/, '') + '.').join(' '));
  return { available: o.available && !studioReason, flagged: o.flagged, disabledReason, reasons: o.reasons };
}

/** The job the Repair dialog queues (POST /api/jobs, zod-validated and terms-gated on the server). */
export function repairPayload(p: Pick<Production, 'id'>, sh: Pick<Shot, 'id'>, take: Pick<Take, 'id'>, reason: string, select: boolean): JobPayload<'CORRECT_LIPSYNC'> {
  return { productionId: p.id, shotId: sh.id, takeId: take.id, confirm: true, reason: reason.trim(), ...(select ? { select: true } : {}) };
}

export const reasonReady = (reason: string): boolean => reason.trim().length >= REPAIR_REASON_MIN;

export interface RepairMeasureRow { label: string; before: string; after: string; better?: boolean }
export interface RepairInfo {
  fromTakeId: string;
  reason?: string;
  accepted: boolean;
  notes: string[];
  problems: string[];
  rows: RepairMeasureRow[];
  engine?: string;
}

type Pair = { before: number | null; after: number | null } | undefined;
const f = (x: number | null | undefined) => (x === null || x === undefined ? 'not measured' : x.toFixed(2));
const row = (label: string, pair: Pair, higherIsBetter = true): RepairMeasureRow | null => (pair ? { label, before: f(pair.before), after: f(pair.after), better: pair.before !== null && pair.after !== null ? (higherIsBetter ? pair.after >= pair.before : pair.after <= pair.before) : undefined } : null);

/** What a corrected take records about its repair (`params.postProcess` + `derivedFrom`), or undefined for any other
 *  take. The numbers are shown as the worker measured them, before and after; nothing is computed here. */
export function repairInfoOf(take: Pick<Take, 'derivedFrom' | 'params' | 'status'>): RepairInfo | undefined {
  if (!take.derivedFrom || take.derivedFrom.process !== 'LIPSYNC_CORRECTION') return undefined;
  const pp = (take.params as { postProcess?: { reason?: unknown; engine?: unknown; verdict?: { accepted?: unknown; notes?: unknown; problems?: unknown }; measures?: Record<string, unknown> } } | undefined)?.postProcess;
  const m = (pp?.measures ?? {}) as { corr?: Pair; activityInside?: Pair; canonical?: Pair; selfIdentity?: Pair; frames?: { original: number; corrected: number }; fullStrengthShare?: number; faceHeightPx?: number | null };
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const rows = [
    row('Mouth follows the audio (r)', m.corr),
    row('Mouth activity while speaking', m.activityInside),
    row('Same face as the original', m.selfIdentity),
    row('Identity to the canonical image', m.canonical),
    m.frames ? { label: 'Frames', before: String(m.frames.original), after: String(m.frames.corrected), better: m.frames.corrected === m.frames.original } : null,
    typeof m.fullStrengthShare === 'number' ? { label: 'Corrected at full strength', before: '—', after: `${Math.round(m.fullStrengthShare * 100)} %` } : null,
  ].filter((r): r is RepairMeasureRow => Boolean(r));
  return {
    fromTakeId: take.derivedFrom.takeId,
    reason: typeof pp?.reason === 'string' ? pp.reason : undefined,
    accepted: typeof pp?.verdict?.accepted === 'boolean' ? pp.verdict.accepted : take.status === 'READY',
    notes: strings(pp?.verdict?.notes), problems: strings(pp?.verdict?.problems), rows,
    engine: typeof pp?.engine === 'string' ? pp.engine : undefined,
  };
}
