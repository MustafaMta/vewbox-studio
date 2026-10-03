import type { AudienceAnalysis, AudiencePattern, ResearchItem, ResearchMetrics } from '@/domain/development';
import type { AudienceOut } from './schemas';

/** EVIDENCE DISCIPLINE (contract §4) — the Audience Research Agent may only measure what the sources measured. In
 *  code, after the model answered: every cited evidence id must exist in the run (an unknown one is dropped); every
 *  number written under `measured` must appear in a cited item's metrics, or the pattern is downgraded to
 *  interpretation only (its measurement removed, its confidence lowered, the reason recorded); a pattern without
 *  evidence is craft knowledge, at most MEDIUM confidence, and says so. Views measure reach, not quality: the cautions
 *  always say it when the evidence has views. */

/** The short ids the model sees (E1…En) for the run's items, in order. */
export const evidenceIds = (items: ResearchItem[]) => new Map(items.map((it, i) => [`E${i + 1}`, it.id]));

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/٬/g, ',').replace(/٫/g, '.');

/** Every number a sentence states, with how precisely it was stated: "238,832" is exact; "1.2M" means 1 200 000 give or
 *  take half its last digit (50 000); "238.8K" is 238 800 ± 50. */
export function numbersIn(text: string): Array<{ value: number; tolerance: number; raw: string }> {
  const out: Array<{ value: number; tolerance: number; raw: string }> = [];
  // a number glued to a letter is a name (E3, P2, S1E4), and a calendar date is context, not a measurement
  const re = /(?<![\p{L}\d.,])(\d[\d,]*(?:\.\d+)?)\s*(k|m|b|thousand|million|billion|ألف|الف|مليون|مليار)?(?![\p{L}\d])/giu;
  const plain = westernDigits(text).replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, ' ');
  for (const m of plain.matchAll(re)) {
    const digits = m[1].replace(/,/g, '');
    const n = Number(digits);
    if (!Number.isFinite(n)) continue;
    const unit = (m[2] ?? '').toLowerCase();
    const scale = /^(k|thousand|ألف|الف)$/.test(unit) ? 1e3 : /^(m|million|مليون)$/.test(unit) ? 1e6 : /^(b|billion|مليار)$/.test(unit) ? 1e9 : 1;
    const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
    // an abbreviated number is exact to half its last stated digit; a plain one must match exactly
    const tolerance = scale === 1 ? 0 : (scale / 10 ** decimals) / 2;
    out.push({ value: n * scale, tolerance, raw: m[0].trim() });
  }
  return out;
}

const metricValues = (m: ResearchMetrics): number[] => Object.values(m).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

/** True when every number in `measured` is one of the cited items' metrics (within its stated precision). */
export function measuredTraceable(measured: string, cited: ResearchItem[]): { ok: boolean; untraced: string[] } {
  const values = cited.flatMap((i) => metricValues(i.metrics));
  const untraced = numbersIn(measured).filter((n) => !values.some((v) => Math.abs(v - n.value) <= n.tolerance)).map((n) => n.raw);
  return { ok: untraced.length === 0, untraced };
}

const CAP: Record<AudiencePattern['confidence'], AudiencePattern['confidence']> = { HIGH: 'MEDIUM', MEDIUM: 'MEDIUM', LOW: 'LOW' };
const REACH_CAUTION = 'Views and pageviews measure reach — how many people looked — not whether a story worked for them or was liked.';

/** The model's answer → the stored analysis, with the discipline applied. `ids`: E-id → item id. */
export function disciplinedAnalysis(out: AudienceOut, items: ResearchItem[], ids: Map<string, string>, producerAudience?: string): { analysis: AudienceAnalysis; downgraded: number; droppedRefs: number } {
  const byId = new Map(items.map((i) => [i.id, i]));
  let downgraded = 0; let droppedRefs = 0;
  const patterns: AudiencePattern[] = out.patterns.map((p, n) => {
    const refs = Array.from(new Set(p.evidenceIds.map((r) => {
      const k = r.trim().toUpperCase().replace(/^#/, '');
      return ids.get(k) ?? ids.get(`E${k}`) ?? (byId.has(r.trim()) ? r.trim() : undefined);
    })));
    const known = refs.filter((x): x is string => Boolean(x));
    droppedRefs += p.evidenceIds.length - known.length;
    const notes: string[] = [];
    if (p.limitations) notes.push(p.limitations);
    let measured = p.measured?.trim() || undefined;
    let confidence = p.confidence;
    if (measured) {
      const t = known.length ? measuredTraceable(measured, known.map((id) => byId.get(id)!)) : { ok: false, untraced: ['(no cited source)'] };
      if (!t.ok) {
        downgraded++;
        notes.push(`Interpretation only: the measurement "${measured.slice(0, 80)}" could not be traced to its sources' metrics (${t.untraced.slice(0, 3).join(', ')}) and was removed.`);
        measured = undefined;
        confidence = CAP[confidence];
      }
    }
    if (!known.length) {
      confidence = CAP[confidence];
      notes.push('Craft knowledge, not measured evidence: no source is cited.');
    }
    return { id: `P${n + 1}`, kind: p.kind, pattern: p.pattern, evidenceIds: known, measured, interpretation: p.interpretation, confidence, limitations: notes.length ? notes.join(' ') : undefined };
  });
  const basis: AudienceAnalysis['basis'] = items.length && patterns.some((p) => p.evidenceIds.length) ? 'EVIDENCE' : 'CRAFT_ONLY';
  const cautions = out.cautions.filter(Boolean);
  const hasReach = items.some((i) => i.metrics.views !== undefined || i.metrics.pageviews !== undefined);
  if (hasReach && !cautions.some((c) => /reach|quality|liked|not whether|لا يعني|الجودة/i.test(c))) cautions.push(REACH_CAUTION);
  if (basis === 'CRAFT_ONLY' && !cautions.some((c) => /craft|no evidence|without evidence/i.test(c))) cautions.push('No research evidence was available: these patterns are storytelling craft, not measurements.');
  return { analysis: { audience: producerAudience?.trim() || out.audience, basis, patterns, cautions }, downgraded, droppedRefs };
}
