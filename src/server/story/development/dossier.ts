import type { AudienceAnalysis, ConceptSet, DevelopmentDossier, DevelopmentStep, IdeaKind, ResearchItem, ResearchRunSummary, StoryReview } from '@/domain/development';
import type { DevelopmentArtifact } from '@/server/development/artifacts';
import type { IdeaContext } from './context';
import type { DraftContent } from './engine';

/** THE DEVELOPMENT DOSSIER — everything the proposal rests on, summarised for the review page: research coverage per
 *  platform in priority order, the sources, the patterns, the three concepts and the choice, both reviews of draft 1,
 *  the one revision and what it answered, every stage's artifact and step. Pure: built from the stored artifacts. */

export interface DossierInput {
  c: Pick<IdeaContext, 'ideaJobId' | 'kind' | 'strategy' | 'language' | 'dialect' | 'audience'>;
  research: DevelopmentArtifact<{ run: ResearchRunSummary }>;
  items: ResearchItem[];
  audience?: DevelopmentArtifact<AudienceAnalysis>;
  concepts?: DevelopmentArtifact<ConceptSet>;
  drafts: Array<DevelopmentArtifact<DraftContent>>;
  reviews: Array<DevelopmentArtifact<StoryReview>>;
  steps: DevelopmentStep[];
}

export function buildDossier(i: DossierInput): DevelopmentDossier {
  const run = i.research.content.run;
  const final = [...i.drafts].sort((a, b) => b.content.draft - a.content.draft)[0];
  const first = i.drafts.find((d) => d.content.draft === 1);
  const revised = i.drafts.filter((d) => d.content.draft > 1);
  const artifacts = [i.research, i.audience, i.concepts, ...i.drafts, ...i.reviews].filter((a): a is DevelopmentArtifact<never> => Boolean(a)).map((a) => ({ stage: a.stage, artifactId: a.id, version: a.version, agentId: a.agentId, jobId: a.jobId }));
  const g = final?.content.gloss;
  return {
    version: 1, ideaJobId: i.c.ideaJobId, format: i.c.kind as IdeaKind, strategy: i.c.strategy,
    audience: i.audience?.content.audience ?? i.c.audience ?? '',
    language: i.c.language, dialect: i.c.dialect,
    // a run that queried something is stored (GET /api/research/runs/:id); one written for research off or failed is not
    research: { runId: run.topics.length ? run.id : undefined, status: run.status, coverage: run.coverage, limitations: run.limitations, itemIds: run.itemIds, reusedFromCache: run.reusedFromCache },
    sources: i.items,
    analysis: i.audience?.content, concepts: i.concepts?.content,
    // the reviews of the first draft (the revision is not re-reviewed in a loop)
    reviews: i.reviews.map((r) => r.content).filter((r) => r.draft === (first?.content.draft ?? 1)),
    revisions: revised.length ? 1 : 0,
    revisionNotes: revised[0]?.content.answered,
    steps: i.steps, artifacts,
    hook: final?.content.hook, ending: final?.content.ending,
    gloss: i.c.language === 'AR' && g ? { title: final.content.proposal.title, logline: g.logline, premise: g.premise, hook: g.hook, ending: g.ending, structure: g.structure?.map((x) => ({ title: x.title, summary: x.summary })) } : undefined,
    note: run.status === 'DISABLED' ? 'Original concept — no trend research was used.' : run.status === 'UNAVAILABLE' ? `Original concept — research was unavailable (${run.limitations[0] ?? 'no source answered'}).` : undefined,
  };
}
