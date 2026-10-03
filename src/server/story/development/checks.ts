import { RESEARCH_PLATFORMS, type AudienceAnalysis, type ConceptSet, type DevelopmentStage, type ResearchRunSummary, type StoryReview } from '@/domain/development';
import type { DraftContent } from './engine';

/** HAND-OFF CHECKS between development stages (contract §1: RESEARCH → AUDIENCE → … recorded with recordHandoff). Each
 *  stage's artifact is checked for what the next stage relies on. Pure. */

export type Check = { name: string; ok: boolean; detail?: string };
/** Upstream artifact ids an artifact was built from (stored beside its content). */
export interface BasedOn { researchArtifactId?: string; audienceArtifactId?: string; conceptsArtifactId?: string; draftArtifactId?: string; reviewArtifactIds?: string[] }

const ARABIC = /[؀-ۿ]/;

export function stageChecks(stage: DevelopmentStage, content: unknown, ctx: { language?: string; itemIds?: string[] } = {}): Check[] {
  switch (stage) {
    case 'RESEARCH': {
      const run = (content as { run: ResearchRunSummary }).run;
      const order = run.coverage.map((c) => c.platform).join(',') === RESEARCH_PLATFORMS.join(',');
      return [
        { name: 'coverage-of-every-platform-in-priority-order', ok: order, detail: run.coverage.map((c) => `${c.platform} ${c.status}`).join(', ') },
        { name: 'every-status-explained', ok: run.coverage.every((c) => c.detail.trim().length > 0) },
        { name: 'evidence-recorded', ok: true, detail: `${run.itemIds.length} item(s), ${run.reusedFromCache} reused from cache, run ${run.status}` },
      ];
    }
    case 'AUDIENCE': {
      const a = content as AudienceAnalysis;
      const known = new Set(ctx.itemIds ?? []);
      const unknown = a.patterns.flatMap((p) => p.evidenceIds.filter((id) => !known.has(id)));
      return [
        { name: 'patterns-present', ok: a.patterns.length >= 3, detail: `${a.patterns.length} pattern(s), basis ${a.basis}` },
        { name: 'evidence-ids-exist', ok: unknown.length === 0, detail: unknown.length ? `unknown: ${unknown.slice(0, 4).join(', ')}` : undefined },
        { name: 'measurements-traced', ok: a.patterns.every((p) => !p.measured || p.evidenceIds.length > 0) },
        { name: 'cautions-stated', ok: a.cautions.length > 0 },
      ];
    }
    case 'CONCEPTS': {
      const s = content as ConceptSet;
      const chosen = s.originality.find((o) => o.conceptId === s.chosenId);
      const c = s.concepts.find((x) => x.id === s.chosenId);
      return [
        { name: 'three-concepts', ok: s.concepts.length === 3 },
        { name: 'chosen-concept-is-original', ok: Boolean(chosen?.ok), detail: chosen?.note },
        { name: 'rationale-names-its-patterns', ok: Boolean(c && c.patternIds.some((p) => s.rationale.includes(p))) },
      ];
    }
    case 'WRITING':
    case 'REVISION': {
      const d = content as DraftContent;
      const checks: Check[] = [
        { name: 'structure-present', ok: d.proposal.structure.length >= 2, detail: `${d.proposal.structure.length} item(s)` },
        { name: 'hook-and-ending', ok: Boolean(d.hook.trim() && d.ending.trim()) },
        { name: 'cast-and-places', ok: d.proposal.cast.length > 0 && d.proposal.locations.length > 0, detail: `${d.proposal.cast.length} cast (${d.proposal.cast.filter((x) => x.isNew).length} new), ${d.proposal.locations.length} place(s)` },
      ];
      if (ctx.language === 'AR') checks.push({ name: 'written-in-the-dialect', ok: ARABIC.test(`${d.proposal.logline} ${d.proposal.premise}`) });
      if (stage === 'REVISION') checks.push({ name: 'notes-answered', ok: Boolean(d.answered?.length), detail: `${d.answered?.length ?? 0} answer(s)` });
      return checks;
    }
    case 'EDITING':
    case 'AUDIENCE_REVIEW': {
      const r = content as StoryReview;
      return [
        { name: 'rubric-scored', ok: Object.keys(r.scores).length > 0, detail: Object.entries(r.scores).map(([k, v]) => `${k} ${v}`).join(', ') },
        { name: 'verdict', ok: true, detail: `${r.verdict}; ${r.issues.length} issue(s), ${r.issues.filter((i) => i.severity === 'MAJOR').length} major` },
      ];
    }
    default: return [];
  }
}
