import fsp from 'node:fs/promises';
import path from 'node:path';
import { StudioError } from '@/domain/errors';

/** THE VOICE COMPARISON (docs/VOICE-ENGINE.md §Evaluation): the evaluation harness's run (scripts/voice-acting-eval.ts)
 *  read for the Voice Studio — blind. The page gets each test's clips as letters; which engine made a letter stays on
 *  the server (blind-key.json) until a listener's ratings are stored with it. A clip is served by (test, letter): no
 *  path ever comes from a request. Scores are only what listeners gave; the machine's numbers are shown apart, as
 *  supporting evidence, and only once someone has graded (so they cannot steer the listening). */

export const EVAL_RUN = () => path.resolve(process.env.VOICE_EVAL_RUN ?? 'var/eval/voice-acting-2026-10');

interface Take { arm: string; test: string; engine: string; ok: boolean; error?: string; file?: string; seconds?: number; ms?: number; rtf?: number; peakVramMb?: number; licence?: string; score?: Record<string, unknown> }
interface Report { arms: Array<{ id: string; engine: string; acting: string }>; refs: Array<{ language: string; file: string; source: string; licence: string; labOnly: boolean }>; takes: Take[]; grades: Grade[] | null }
export interface Rating { test: string; letter: string; natural?: number; baghdadi?: number; emotion?: number; pronunciation?: number; same_voice?: number; note?: string }
interface Grade { by: string; native: boolean; dialect?: string; at: string; ratings: Array<Rating & { arm?: string }> }
interface SetFile { tests: Array<{ id: string; language: 'AR' | 'EN'; intent: string; text: string }> }

const readJson = async <T>(f: string): Promise<T | null> => { try { return JSON.parse(await fsp.readFile(f, 'utf8')) as T; } catch { return null; } };
const SCALES = ['natural', 'baghdadi', 'emotion', 'pronunciation', 'same_voice'] as const;

async function load() {
  const dir = EVAL_RUN();
  const report = await readJson<Report>(path.join(dir, 'report.json'));
  const key = await readJson<Record<string, Record<string, string>>>(path.join(dir, 'blind-key.json'));
  const set = await readJson<SetFile>(path.resolve('tests/fixtures/voice/acting-eval-2026-10.json'));
  return { dir, report, key, set };
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/** What the page shows: the tests with their blind clips, the references, who has graded, and — once someone graded —
 *  the per-engine summary of the listeners' ratings beside the machine's numbers. */
export async function comparisonView() {
  const { report, key, set } = await load();
  if (!report || !key || !set) return { ready: false as const, why: 'No evaluation run has been reported yet (scripts/voice-acting-eval.ts report).' };
  const tests = set.tests.map((t) => ({
    id: t.id, language: t.language, intent: t.intent, text: t.text,
    clips: Object.keys(key[t.id] ?? {}).sort().map((letter) => ({ letter, src: `/api/voice-eval/clip?test=${encodeURIComponent(t.id)}&clip=${encodeURIComponent(letter)}` })),
    reference: report.refs.some((r) => r.language === t.language) ? `/api/voice-eval/clip?test=${encodeURIComponent(t.id)}&clip=ref` : undefined,
    failed: report.takes.filter((x) => x.test === t.id && !x.ok).length,
  }));
  const grades = report.grades ?? [];
  const graded = grades.map((g) => ({ by: g.by, native: g.native, dialect: g.dialect, at: g.at, ratings: g.ratings.length }));
  const results = grades.length ? report.arms.map((a) => {
    const rs = grades.flatMap((g) => g.ratings.filter((r) => r.arm === a.id).map((r) => ({ ...r, native: g.native })));
    const takes = report.takes.filter((x) => x.arm === a.id);
    return {
      arm: a.id, engine: a.engine, acting: a.acting,
      listeners: Object.fromEntries(SCALES.map((k) => [k, mean(rs.map((r) => r[k]).filter((v): v is number => typeof v === 'number'))])),
      nativeListeners: Object.fromEntries(SCALES.map((k) => [k, mean(rs.filter((r) => r.native).map((r) => r[k]).filter((v): v is number => typeof v === 'number'))])),
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
  return { ready: true as const, labOnly: report.refs.some((r) => r.labOnly), tests, graded, results };
}

/** The file behind (test, letter) — or the reference of the test's language for `ref`. */
export async function clipFile(test: string, clip: string): Promise<string> {
  const { dir, report, key, set } = await load();
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

/** Store a listener's ratings, unblinded on the server. A rating outside 1–5, an unknown test or letter is refused;
 *  nothing is ever filled in for the listener. */
export async function storeGrades(input: { by: string; native: boolean; dialect?: string; ratings: Rating[] }, at: string): Promise<{ stored: number }> {
  const { dir, report, key } = await load();
  if (!report || !key) throw new StudioError('NOT_FOUND', 'No evaluation run.');
  const by = input.by.trim();
  if (!by) throw new StudioError('INVALID', 'Say who is listening.');
  const ratings = input.ratings.filter((r) => SCALES.some((k) => typeof r[k] === 'number') || r.note?.trim());
  if (!ratings.length) throw new StudioError('INVALID', 'Nothing was rated.');
  for (const r of ratings) {
    if (!key[r.test]?.[r.letter]) throw new StudioError('INVALID', `No clip ${r.letter} in ${r.test}.`);
    for (const k of SCALES) { const v = r[k]; if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > 5)) throw new StudioError('INVALID', `${k} must be 1–5.`); }
  }
  const grade: Grade = { by, native: input.native, ...(input.dialect ? { dialect: input.dialect } : {}), at, ratings: ratings.map((r) => ({ ...r, note: r.note?.trim() || undefined, arm: key[r.test][r.letter] })) };
  report.grades = [...(report.grades ?? []), grade];
  await fsp.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  return { stored: grade.ratings.length };
}
