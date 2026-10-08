import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';

/** THE VOICE COMPARISON (docs/VOICE-ENGINE.md §7): an evaluation run (scripts/voice-acting-eval.ts) read for the Voice
 *  Studio — blind. The page gets each line's clips as letters; which engine made a letter stays on the server
 *  (blind-key.json) until a listener's ratings are stored, and is then revealed to that listener. A clip is served by
 *  (run, test, letter): no path ever comes from a request. Scores are only what listeners gave; the machine's numbers
 *  are shown apart, as supporting evidence, and only once someone has graded (so they cannot steer the listening). */

/** The runs the page may show, newest first: the id is what a request names, never a path. */
export const EVAL_RUNS = [
  { id: 'iraqi-listening-2026-10', label: 'Iraqi listening pack', dir: 'var/eval/iraqi-listening-2026-10' },
  { id: 'voice-acting-2026-10', label: 'Acting evaluation', dir: 'var/eval/voice-acting-2026-10' },
] as const;
export type EvalRunId = (typeof EVAL_RUNS)[number]['id'];
const runOf = (id?: string) => EVAL_RUNS.find((r) => r.id === id) ?? EVAL_RUNS[0];

export const DEFAULT_SCALES = ['natural', 'baghdadi', 'emotion', 'pronunciation', 'same_voice'];

interface Take { arm: string; test: string; engine: string; ok: boolean; error?: string; file?: string; seconds?: number; ms?: number; rtf?: number; peakVramMb?: number; licence?: string; engineVersion?: string; seed?: number; score?: Record<string, unknown> }
interface Report { set?: string; arms: Array<{ id: string; engine: string; acting: string }>; refs: Array<{ language: string; file: string; source: string; licence: string; labOnly: boolean }>; takes: Take[]; grades: Grade[] | null }
export interface Rating { test: string; letter: string; note?: string; [scale: string]: number | string | undefined }
interface Grade { by: string; native: boolean; dialect?: string; at: string; ratings: Array<Rating & { arm?: string }> }
interface SetFile { tests: Array<{ id: string; language: 'AR' | 'EN'; intent: string; text: string }>; scales?: string[] }

const readJson = async <T>(f: string): Promise<T | null> => { try { return JSON.parse(await fsp.readFile(f, 'utf8')) as T; } catch { return null; } };
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

async function load(id?: string) {
  const run = runOf(id);
  const dir = path.resolve(run.dir);
  const report = await readJson<Report>(path.join(dir, 'report.json'));
  const key = await readJson<Record<string, Record<string, string>>>(path.join(dir, 'blind-key.json'));
  // the set the run was made from, as the report names it (only a fixture inside tests/fixtures/voice)
  const setPath = report?.set && path.resolve(report.set).startsWith(path.resolve('tests/fixtures/voice') + path.sep) ? path.resolve(report.set) : path.resolve('tests/fixtures/voice/acting-eval-2026-10.json');
  const set = await readJson<SetFile>(setPath);
  return { run, dir, report, key, set, scales: set?.scales?.length ? set.scales : DEFAULT_SCALES };
}

/** The runs that exist, for the page's picker. */
export async function comparisonRuns() {
  const out: Array<{ id: string; label: string }> = [];
  for (const r of EVAL_RUNS) if (await readJson(path.join(path.resolve(r.dir), 'report.json'))) out.push({ id: r.id, label: r.label });
  return out;
}

/** What the page shows for a run: the tests with their blind clips, the reference, the scales, who has graded, and —
 *  once someone graded — the per-engine summary of the listeners' ratings beside the machine's numbers. */
export async function comparisonView(id?: string) {
  const { run, report, key, set, scales } = await load(id);
  if (!report || !key || !set) return { ready: false as const, run: run.id, runs: await comparisonRuns(), why: 'This listening pack is still being prepared (scripts/voice-acting-eval.ts report).' };
  const q = (test: string, clip: string) => `/api/voice-eval/clip?run=${encodeURIComponent(run.id)}&test=${encodeURIComponent(test)}&clip=${encodeURIComponent(clip)}`;
  const tests = set.tests.map((t) => ({
    id: t.id, language: t.language, intent: t.intent, text: t.text,
    clips: Object.keys(key[t.id] ?? {}).sort().map((letter) => ({ letter, src: q(t.id, letter) })),
    reference: report.refs.some((r) => r.language === t.language) ? q(t.id, 'ref') : undefined,
    failed: report.takes.filter((x) => x.test === t.id && !x.ok).length,
  }));
  const grades = report.grades ?? [];
  const graded = grades.map((g) => ({ by: g.by, native: g.native, dialect: g.dialect, at: g.at, ratings: g.ratings.length }));
  const results = grades.length ? report.arms.map((a) => {
    const rs: Array<Record<string, unknown> & { native: boolean }> = grades.flatMap((g) => g.ratings.filter((r) => r.arm === a.id).map((r) => ({ ...r, native: g.native })));
    const takes = report.takes.filter((x) => x.arm === a.id);
    const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
    return {
      arm: a.id, engine: a.engine, acting: a.acting,
      listeners: Object.fromEntries(scales.map((k) => [k, mean(rs.map((r) => num(r[k])).filter((v): v is number => v !== undefined))])),
      nativeListeners: Object.fromEntries(scales.map((k) => [k, mean(rs.filter((r) => r.native).map((r) => num(r[k])).filter((v): v is number => v !== undefined))])),
      ratings: rs.length,
      machine: {
        attempted: takes.length, failed: takes.filter((x) => !x.ok).map((x) => ({ test: x.test, error: x.error })),
        rtf: mean(takes.map((x) => x.rtf).filter((v): v is number => typeof v === 'number')),
        cer: mean(takes.map((x) => x.score?.cer).filter((v): v is number => typeof v === 'number')),
        peakVramMb: Math.max(0, ...takes.map((x) => x.peakVramMb ?? 0)) || null,
      },
      licence: takes.find((x) => x.licence)?.licence ?? null,
    };
  }) : null;
  return { ready: true as const, run: run.id, runs: await comparisonRuns(), labOnly: report.refs.some((r) => r.labOnly), scales, tests, graded, results };
}

/** The file behind (run, test, letter) — or the reference of the test's language for `ref`. */
export async function clipFile(test: string, clip: string, id?: string): Promise<string> {
  const { dir, report, key, set } = await load(id);
  if (!report || !key || !set) throw new StudioError('NOT_FOUND', 'No evaluation run.');
  const t = set.tests.find((x) => x.id === test);
  if (!t) throw new StudioError('NOT_FOUND', `No test ${test}.`);
  let rel: string | undefined;
  if (clip === 'ref') rel = report.refs.find((r) => r.language === t.language)?.file;
  else { const arm = key[test]?.[clip]; rel = arm ? report.takes.find((x) => x.test === test && x.arm === arm && x.ok)?.file : undefined; }
  if (!rel) throw new StudioError('NOT_FOUND', `No clip ${clip} for ${test}.`);
  const file = path.resolve(dir, rel);
  if (!file.startsWith(dir + path.sep)) throw new StudioError('INVALID', 'The clip is outside the run.');
  return file;
}

/** Store a listener's ratings, unblinded on the server, and reveal to them which engine each letter they rated was.
 *  A rating outside 1–5, an unknown scale, test or letter is refused; nothing is ever filled in for the listener. */
export async function storeGrades(input: { by: string; native: boolean; dialect?: string; ratings: Rating[] }, at: string, id?: string): Promise<{ stored: number; reveal: Record<string, Record<string, { arm: string; engine: string; acting: string }>> }> {
  const { dir, report, key, scales } = await load(id);
  if (!report || !key) throw new StudioError('NOT_FOUND', 'No evaluation run.');
  const by = input.by.trim();
  if (!by) throw new StudioError('INVALID', 'Say who is listening.');
  const ratings = input.ratings.filter((r) => scales.some((k) => typeof r[k] === 'number') || (typeof r.note === 'string' && r.note.trim()));
  if (!ratings.length) throw new StudioError('INVALID', 'Nothing was rated.');
  for (const r of ratings) {
    if (!key[r.test]?.[r.letter]) throw new StudioError('INVALID', `No clip ${r.letter} in ${r.test}.`);
    for (const [k, v] of Object.entries(r)) {
      if (k === 'test' || k === 'letter' || k === 'note') continue;
      if (!scales.includes(k)) throw new StudioError('INVALID', `${k} is not a scale of this pack.`);
      if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5)) throw new StudioError('INVALID', `${k} must be 1–5.`);
    }
  }
  const grade: Grade = { by, native: input.native, ...(input.dialect ? { dialect: input.dialect } : {}), at, ratings: ratings.map((r) => ({ ...r, note: typeof r.note === 'string' ? r.note.trim() || undefined : undefined, arm: key[r.test][r.letter] })) };
  report.grades = [...(report.grades ?? []), grade];
  await fsp.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  const armOf = (a: string) => report.arms.find((x) => x.id === a);
  const reveal: Record<string, Record<string, { arm: string; engine: string; acting: string }>> = {};
  for (const t of new Set(ratings.map((r) => r.test))) reveal[t] = Object.fromEntries(Object.entries(key[t] ?? {}).map(([letter, arm]) => [letter, { arm, engine: armOf(arm)?.engine ?? arm, acting: armOf(arm)?.acting ?? '' }]));
  return { stored: grade.ratings.length, reveal };
}
