import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { STRATEGY_OF, developmentIntentOf, emptyRun, type StoryReview } from '@/domain/development';
import type { StudioState } from '@/domain/types';
import { ideaContext, describeIdea } from '@/server/story/development/context';
import { languageRules, structureBounds, STRATEGY_RULES, continuityRules } from '@/server/story/development/strategy';
import { codeChecks, criteriaFor, finaliseReview, needsRevision, normaliseScores, type DraftForReview } from '@/server/story/development/rubric';
import { resolveDraft } from '@/server/story/development/resolve';
import { intentDirective } from '@/server/story/development/intent';
import { buildDossier } from '@/server/story/development/dossier';
import type { DraftContent } from '@/server/story/development/engine';
import type { DraftOut } from '@/server/story/development/schemas';
import { agentPrompt } from '@/server/org/skills';

/** FORMATS, CONTINUATION AND THE RUBRIC — each format's strategy and structure, a season or an episode carrying its
 *  show's history and identity, an Arabic story written in its dialect, the studio's own review checks with the
 *  verdict rule, the cast resolved against the studio, the dossier, and the intent production keeps. */

const withBible = (): StudioState => {
  const s = seed();
  const show = s.shows.find((x) => x.id === 'last-sip')!;
  show.bible = { timeline: ['S1E2: Karim promised to pay his eleven teas by Friday.'], unresolved: ['Karim still owes eleven teas to the café'], relationships: ['Layla and Abu Samir argue about the ledger'] };
  return s;
};

describe('format strategies', () => {
  it('each kind has its strategy, rules and structure size', () => {
    expect(STRATEGY_OF).toEqual({ SHORT: 'SHORT_FOCUSED', SHOW: 'SHOW_SERIAL', SEASON: 'SEASON_CONTINUATION', EPISODE: 'EPISODE_CONTINUATION', MUSIC_VIDEO: 'MUSIC_FIRST' });
    expect(STRATEGY_RULES.SHORT_FOCUSED).toMatch(/first 3–5 seconds/);
    expect(STRATEGY_RULES.SEASON_CONTINUATION).toMatch(/never restart the show/);
    expect(STRATEGY_RULES.MUSIC_FIRST).toMatch(/song comes first/);
    expect(structureBounds({ kind: 'SHORT', durationSeconds: 60 })).toMatchObject({ min: 3, max: 3 });
    expect(structureBounds({ kind: 'SHORT', durationSeconds: 120 })).toMatchObject({ min: 3, max: 6 });
    expect(structureBounds({ kind: 'SEASON', durationSeconds: 300 })).toMatchObject({ min: 3, max: 8, unit: 'episodes' });
  });
  it('an Iraqi story is written in Baghdadi Arabic from the first word, glossed after — never translated', () => {
    const iq = languageRules('AR', 'IRAQI_BAGHDADI');
    expect(iq).toMatch(/BAGHDADI ARABIC FROM THE FIRST WORD/);
    expect(iq).toMatch(/شلونك/); expect(iq).toMatch(/چ and گ/);
    expect(iq).toMatch(/Never write the story in English and translate it/);
    expect(languageRules('EN')).not.toMatch(/[؀-ۿ]/);
    expect(languageRules('AR', 'EGYPTIAN')).toMatch(/Egyptian/);
  });
});

describe('the idea’s context', () => {
  it('a season inherits its show’s language, dialect and direction whatever the preferences say, with its full history', () => {
    const s = withBible();
    const c = ideaContext(s, 'job-1', { kind: 'SEASON', showId: 'last-sip', preferences: { language: 'EN', style: 'REALISTIC', genre: 'horror' } });
    expect(c).toMatchObject({ kind: 'SEASON', strategy: 'SEASON_CONTINUATION', language: 'AR', dialect: 'IRAQI_BAGHDADI', style: 'CARTOON', genre: 'horror' });
    expect(c.continuity).toMatchObject({ title: 'The Last Sip', language: 'AR', dialect: 'IRAQI_BAGHDADI', bible: { unresolved: ['Karim still owes eleven teas to the café'] } });
    expect(c.continuity!.seasons.map((x) => x.number)).toEqual([1, 2]);
    expect(c.continuity!.returningCast.map((x) => x.id)).toEqual(['abu-samir', 'layla', 'karim', 'the-cat']);
    expect(c.library.characters).toEqual([]);
    expect(continuityRules(c)).toMatch(/never change/);
    expect(describeIdea(c)).toMatch(/Iraqi — Baghdadi Arabic cartoon next season/);
  });
  it('a new short uses the preferences, the default running time and the studio library', () => {
    const s = seed();
    const c = ideaContext(s, 'job-2', { kind: 'SHORT', preferences: { language: 'EN', style: 'CARTOON', audience: 'kids 8–12' }, brief: 'a lost cat' });
    expect(c).toMatchObject({ language: 'EN', dialect: undefined, durationSeconds: 60, audience: 'kids 8–12', brief: 'a lost cat', continuity: undefined });
    expect(c.library.characters.length).toBeGreaterThan(0);
    expect(c.library.characters.every((x) => s.characters.find((y) => y.id === x.id)!.style === 'CARTOON')).toBe(true);
  });
});

const draftOut = (over: Partial<DraftOut> = {}): DraftOut => ({
  title: 'Eleven Teas', titleAr: 'إحدعش استكان', logline: 'كريم لازم يدفع الإحدعش استكان چاي قبل الجمعة', premise: 'كريم مديون للمقهى بإحدعش استكان چاي، وليلى ماسكة الدفتر، وأبو سمير ما يريد ياخذ فلس.',
  genre: 'Comedy', mood: 'Warm', structure: [{ title: 'الدفتر', summary: 'ليلى تفتح الدفتر وتلگى دين كريم' }, { title: 'الجمعة', summary: 'كريم يحاول يدفع بقصيدة' }, { title: 'الاستكان الأخير', summary: 'أبو سمير يشطب الدين' }],
  cast: [{ existingCharacterId: 'karim', name: 'Karim', role: 'Poet' }, { existingCharacterId: 'abu-samir', name: 'Abu Samir', role: 'Owner' }, { name: 'Sami', role: 'A tea seller', appearance: 'A thin man of forty in a grey dishdasha.' }],
  locations: [{ existingLocationId: 'cafe', name: 'The café', description: 'x' }],
  hook: 'كريم يدخل المقهى ماشي على أطراف أصابعه', ending: 'أبو سمير يشطب الدين ويطلب قصيدة', ...over,
} as DraftOut);

describe('the cast and places of a draft', () => {
  it('a library id is trusted only when its name agrees; the show’s regulars are offered; the language is the request’s', () => {
    const s = withBible();
    const c = ideaContext(s, 'job-1', { kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s2', preferences: {} });
    const p = resolveDraft(s, c, draftOut({ cast: [{ existingCharacterId: 'layla', name: 'Karim', role: 'Poet' }, { name: 'Sami', role: 'Tea seller' }], language: undefined } as Partial<DraftOut>));
    expect(p.cast[0]).toMatchObject({ characterId: 'karim', isNew: false, reason: expect.stringMatching(/Returning cast of The Last Sip/) });
    expect(p.cast.find((x) => x.name === 'Sami')).toMatchObject({ isNew: true, key: 'new-c-1' });
    expect(p.cast.map((x) => x.characterId).filter(Boolean)).toEqual(expect.arrayContaining(['abu-samir', 'layla', 'karim', 'the-cat']));
    expect(p).toMatchObject({ language: 'AR', dialect: 'IRAQI_BAGHDADI', style: 'CARTOON', sample: false });
    expect(p.locations[0]).toMatchObject({ locationId: 'cafe', isNew: false });
  });
});

describe('the rubric and the studio’s own checks', () => {
  const s = withBible();
  const season = ideaContext(s, 'job-1', { kind: 'SEASON', showId: 'last-sip', preferences: {} });
  const gloss = { premise: 'Karim owes the café eleven teas; Layla keeps the ledger and Abu Samir will not take money.' };
  const draft = (over: Partial<DraftOut> = {}, g: DraftForReview['gloss'] = gloss): DraftForReview => { const p = resolveDraft(s, season, draftOut(over)); return { proposal: p, hook: over.hook ?? draftOut().hook, ending: over.ending ?? draftOut().ending, sampleLines: [{ speaker: 'Karim', line: 'هسه أدفع، والله هسه' }], gloss: g }; };
  it('criteria per format: continuity only for a continuation, the song only for a music video', () => {
    expect(criteriaFor('SEASON')).toContain('CONTINUITY'); expect(criteriaFor('SHOW')).not.toContain('CONTINUITY');
    expect(criteriaFor('MUSIC_VIDEO')).toContain('MUSIC_FIT'); expect(criteriaFor('MUSIC_VIDEO')).not.toContain('DIALOGUE'); expect(criteriaFor('SHORT')).not.toContain('MUSIC_FIT');
  });
  it('a continuation in its dialect that picks up an open storyline passes the editor’s checks (the English bible is compared through the gloss)', () => {
    expect(codeChecks('STORY_EDITOR', draft(), season, [])).toEqual([]);
    // without the gloss the Arabic draft shares no words with the English bible: the storyline reads as dropped
    expect(codeChecks('STORY_EDITOR', draft({}, {}), season, []).map((i) => [i.criterion, i.severity])).toEqual([['CONTINUITY', 'MINOR']]);
  });
  it('an Arabic story written in English, a story nobody returning carries, too many newcomers: issues marked CODE', () => {
    const english = codeChecks('STORY_EDITOR', draft({ logline: 'Karim must pay his debt by Friday', premise: 'Karim owes the café eleven teas; Layla keeps the ledger and Abu Samir refuses money.', structure: [{ title: 'Ledger', summary: 'x' }, { title: 'Friday', summary: 'y' }, { title: 'End', summary: 'z' }] }), season, []);
    expect(english.map((i) => [i.criterion, i.severity, i.source])).toEqual([['DIALOGUE', 'MAJOR', 'CODE']]);
    const strangers = draft({ cast: [{ name: 'Sami', role: 'x' }, { name: 'Huda', role: 'y' }, { name: 'Ali', role: 'z' }] } as Partial<DraftOut>);
    strangers.proposal.cast = strangers.proposal.cast.filter((x) => x.isNew);
    expect(codeChecks('STORY_EDITOR', strangers, season, []).map((i) => [i.criterion, i.severity])).toEqual([['CONTINUITY', 'MAJOR'], ['CONTINUITY', 'MINOR']]);
  });
  it('a music video without a tagged song is MAJOR; the audience’s checks want a hook the first scene delivers and an ending', () => {
    const mv = ideaContext(s, 'job-3', { kind: 'MUSIC_VIDEO', preferences: { language: 'EN' } });
    const p = resolveDraft(s, mv, draftOut({ logline: 'x', premise: 'y' }));
    expect(codeChecks('STORY_EDITOR', { proposal: p, hook: 'h', ending: 'e' }, mv, []).some((i) => i.criterion === 'MUSIC_FIT' && i.severity === 'MAJOR')).toBe(true);
    const short = ideaContext(s, 'job-4', { kind: 'SHORT', preferences: { language: 'EN', durationSeconds: 30 } });
    const sp = resolveDraft(s, short, draftOut({ structure: [{ title: 'A quiet kitchen', summary: 'She cooks' }, { title: 'b', summary: 'c' }, { title: 'd', summary: 'e' }, { title: 'f', summary: 'g' }, { title: 'h', summary: 'i' }] }));
    const issues = codeChecks('AUDIENCE_EXPERIENCE', { proposal: sp, hook: 'A phone rings in an empty flat', ending: ' ' }, short, []);
    expect(issues.map((i) => [i.criterion, i.severity])).toEqual([['OPENING', 'MINOR'], ['ENDING', 'MAJOR'], ['PACING', 'MINOR']]);
  });
  it('the verdict rule: any MAJOR issue means REVISE; scores only on the format’s criteria, a 1–10 answer halved', () => {
    const out = { scores: { opening: 8, CLARITY: 6, music: 10, Continuity: 7 }, issues: [], verdict: 'APPROVE' as const, summary: 'Good.' };
    expect(normaliseScores(out.scores, 'SEASON')).toEqual({ OPENING: 4, CLARITY: 3, CONTINUITY: 4 });
    const r = finaliseReview('STORY_EDITOR', 'story-editor', 1, out, [{ criterion: 'DIALOGUE', severity: 'MAJOR', where: 'x', note: 'y', fix: 'z', source: 'CODE' }], 'SEASON');
    expect(r).toMatchObject({ verdict: 'REVISE', draft: 1, reviewer: 'STORY_EDITOR' });
    const ok = finaliseReview('AUDIENCE_EXPERIENCE', 'audience-experience', 1, { ...out, issues: [{ criterion: 'PACING', severity: 'MINOR', where: '', note: 'n', fix: 'f' }] }, [], 'SEASON');
    expect(ok.verdict).toBe('APPROVE');
    expect(needsRevision([ok])).toBe(false); expect(needsRevision([ok, r])).toBe(true);
  });
});

describe('the dossier and the intent production keeps', () => {
  const s = seed();
  const c = ideaContext(s, 'job-9', { kind: 'SHORT', preferences: { language: 'EN', research: 'OFF' } });
  const art = <T,>(id: string, stage: string, content: T, version = 1) => ({ id, ideaJobId: 'job-9', stage: stage as 'RESEARCH', version, agentId: 'a', content, createdAt: 'x' });
  const proposal = resolveDraft(s, c, draftOut({ logline: 'L', premise: 'P' }));
  const d1: DraftContent = { proposal, hook: 'H1', ending: 'E1', strategy: 'SHORT_FOCUSED', draft: 1, conceptId: 'C1' };
  const d2: DraftContent = { ...d1, hook: 'H2', ending: 'E2', draft: 2, answered: ['#1: opened on the hook'] };
  const review = (reviewer: StoryReview['reviewer'], draft = 1): StoryReview => ({ reviewer, agentId: 'x', scores: { OPENING: 3 }, issues: [], verdict: 'REVISE', summary: 's', draft });
  it('research off: DISABLED, an explicitly original concept, the reviews of draft 1, one revision with its answers', () => {
    const dossier = buildDossier({ c, research: art('r1', 'RESEARCH', { run: emptyRun('none-job-9', 'DISABLED', 'Original concept — research was switched off for this request.') }), items: [], drafts: [art('w1', 'WRITING', d1), art('w2', 'REVISION', d2)], reviews: [art('e1', 'EDITING', review('STORY_EDITOR')), art('a1', 'AUDIENCE_REVIEW', review('AUDIENCE_EXPERIENCE'))], steps: [] } as unknown as Parameters<typeof buildDossier>[0]);
    expect(dossier).toMatchObject({ format: 'SHORT', strategy: 'SHORT_FOCUSED', research: { status: 'DISABLED', runId: undefined }, note: 'Original concept — no trend research was used.', revisions: 1, revisionNotes: ['#1: opened on the hook'], hook: 'H2', ending: 'E2' });
    expect(dossier.research.coverage.every((x) => x.status === 'DISABLED')).toBe(true);
    expect(dossier.reviews).toHaveLength(2);
    expect(dossier.artifacts.map((a) => a.artifactId)).toEqual(['r1', 'w1', 'w2', 'e1', 'a1']);
    const intent = developmentIntentOf({ mood: 'Tense', development: dossier }, 'proposal-1');
    expect(intent).toEqual({ dossierProposalId: 'proposal-1', ideaJobId: 'job-9', audience: '', tone: 'Tense', hook: 'H2', ending: 'E2', strategy: 'SHORT_FOCUSED' });
    expect(intentDirective(intent)).toMatch(/do not change the hook, the tone or the ending/);
    expect(intentDirective(undefined)).toBe('');
    expect(developmentIntentOf({ mood: 'x' })).toBeUndefined();
  });
});

describe('skills reach the development agents that call the model', () => {
  it('each review and analysis agent gets its role, instructions and PROMPT skill; the Trend Research Agent calls no model', () => {
    expect(agentPrompt('audience-research')).toMatch(/YOUR ROLE: Audience Research Agent[\s\S]*SKILL: Audience analysis from evidence/);
    expect(agentPrompt('creative-concept')).toMatch(/SKILL: Original concepts from audience patterns/);
    expect(agentPrompt('story-editor')).toMatch(/SKILL: Story editing against the rubric/);
    expect(agentPrompt('audience-experience')).toMatch(/SKILL: The audience’s experience, second by second/);
    // story-formats is a procedure (strategy.ts), not injected: the screenwriter's prompt is unchanged by it
    expect(agentPrompt('screenwriter')).not.toMatch(/Format strategies and continuation/);
    expect(agentPrompt('trend-research')).toBe('');
  });
});
