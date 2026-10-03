/** V4 SCREENSHOT FIXTURES (docs/DESIGN-SYSTEM-V4.md §8.4, §8.5 F0) — the studio a reviewer sees in a capture, built
 *  from the sample studio (src/domain/sample.ts, a test fixture) and never from the shared database.
 *
 *  `scripts/capture-evidence.mjs --fixture <kind>` runs this file and answers the headless browser's own GET requests
 *  with the result (GET /api/studio, /api/jobs, /api/jobs/:id, /api/studio/org/pipeline). Nothing here is sent to a
 *  server, and the capture tool answers every write itself, so a capture never changes a record.
 *
 *    sample  the sample studio: two shows, shorts, music videos, characters and locations
 *    empty   a studio with nothing in it
 *    states  the sample studio plus the states a page must show: a draft character, a locked character, a production
 *            awaiting its STORY approval, a running job and a failed job
 *
 *  node --import tsx scripts/v4-fixture.ts <sample|empty|states> [--lang en|ar]   → the fixture as JSON on stdout */
import { seed } from '@/domain/sample';
import { emptyStudio } from '@/domain/actions';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import type { StudioState } from '@/domain/types';
import type { Job } from '@/domain/jobs';

export type FixtureKind = 'sample' | 'empty' | 'states';
export const FIXTURE_KINDS: readonly FixtureKind[] = ['sample', 'empty', 'states'];

/** One row of GET /api/studio/org/pipeline (the shape src/app/(app)/production/page.tsx reads). */
export interface PipelineRow { productionId: string; stages: Array<{ id: string; department: string; status: string; at: string | null; failed: string[] }> }
export interface Fixture { kind: FixtureKind; state: StudioState; jobs: Job[]; pipeline: { productions: PipelineRow[] } }

/** A fixed clock, so two captures of the same fixture are identical apart from what the code under review changed. */
export const FIXTURE_NOW = Date.parse('2026-10-03T09:00:00.000Z');
const ago = (hours: number) => new Date(FIXTURE_NOW - hours * 3_600_000).toISOString();

const job = (p: Partial<Job> & Pick<Job, 'id' | 'type' | 'status'>): Job => ({ priority: 0, payload: {}, attempts: 1, maxAttempts: 2, cancelRequested: false, createdAt: ago(0.2), updatedAt: ago(0.05), ...p });

export function buildFixture(kind: FixtureKind, lang: 'en' | 'ar' = 'en'): Fixture {
  const settings = { ...DEFAULT_SETTINGS, uiLanguage: lang };
  if (kind === 'empty') return { kind, state: { ...emptyStudio(settings), settings }, jobs: [], pipeline: { productions: [] } };
  const state: StudioState = { ...seed(), settings };
  if (kind === 'sample') return { kind, state, jobs: [], pipeline: { productions: [] } };

  // ---- states: every state a page has to draw, on top of the sample studio ----------------------------------------
  const byId = (id: string) => { const c = state.characters.find((x) => x.id === id); if (!c) throw new Error(`fixture: no sample character ${id}`); return c; };
  // a draft canonical image, waiting for the producer
  const layla = byId('layla');
  layla.canonicalImage = { assetId: 'ref-layla-full-body', status: 'DRAFT', version: 1, generatedAt: ago(2), check: { ok: true } };
  // an approved character used in two takes: locked
  const abu = byId('abu-samir');
  abu.canonicalImage = { assetId: 'ref-abu-samir-full-body', status: 'APPROVED', version: 2, generatedAt: ago(40), approvedAt: ago(39), check: { ok: true } };
  abu.usage = { known: true, videos: [
    { productionId: 's1e1', productionTitle: 'The Opening Hour', shotId: 'fx-shot-1', shotLabel: '1.1', takeId: 'fx-take-1', takeLabel: 'Take 2', recordedAt: ago(20), status: 'IN_TAKE', canonicalImageVersion: 2 },
    { productionId: 'night-tray', productionTitle: 'Night Tray', shotId: 'fx-shot-2', shotLabel: '1.2', takeId: 'fx-take-2', takeLabel: 'Take 1', recordedAt: ago(15), status: 'IN_TAKE', canonicalImageVersion: 2 },
  ] };
  // a production whose story waits for approval
  const boats = state.productions.find((p) => p.id === 'paper-boats');
  if (!boats) throw new Error('fixture: no sample production paper-boats');
  boats.stage = 'STORY'; boats.updatedAt = ago(1);
  const pipeline = { productions: [{ productionId: boats.id, stages: [
    { id: 'STORY', department: 'STORY', status: 'AWAITING_APPROVAL', at: ago(1), failed: [] },
    { id: 'CAST_WORLD', department: 'CASTING', status: 'BLOCKED', at: null, failed: [] },
    { id: 'SCRIPT', department: 'STORY', status: 'BLOCKED', at: null, failed: [] },
  ] }] };
  // one job running, one failed
  const jobs = [
    job({ id: 'fx-running', type: 'CHARACTER_APPEARANCE', status: 'GENERATING', characterId: 'karim', payload: { characterId: 'karim' }, progress: { phase: 'GENERATING', message: 'Drawing Karim · full length' }, startedAt: ago(0.1) }),
    job({ id: 'fx-failed', type: 'SHOT_FRAMES', status: 'FAILED', productionId: 'night-tray', payload: { productionId: 'night-tray' }, attempts: 2, error: { code: 'PROVIDER', message: 'The image engine stopped before the frame was drawn.', retryable: true }, finishedAt: ago(3), createdAt: ago(3.2), updatedAt: ago(3) }),
  ];
  return { kind, state, jobs, pipeline };
}

// ---- command line ---------------------------------------------------------------------------------------------------
const isMain = (() => { try { return import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}`).href; } catch { return false; } })();
if (isMain) {
  const args = process.argv.slice(2);
  const kind = (args.find((a) => !a.startsWith('--')) ?? 'sample') as FixtureKind;
  const li = args.indexOf('--lang');
  const lang = li >= 0 && args[li + 1] === 'ar' ? 'ar' : 'en';
  if (!FIXTURE_KINDS.includes(kind)) { console.error(`unknown fixture "${kind}" (${FIXTURE_KINDS.join(', ')})`); process.exit(2); }
  process.stdout.write(JSON.stringify(buildFixture(kind, lang)));
}
