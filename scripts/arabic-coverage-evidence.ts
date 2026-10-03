/** OLD VS NEW WORD COVERAGE on every transcript in docs/evidence/voice-design/ (contract v2 §4).
 *
 *  Old: the studio's word-level `scriptCoverage` (what the voice check used before v2).
 *  New: the voice check's coverage now — `arabicWordCoverage` (space-insensitive alignment, src/server/media/
 *  arabic-align.ts) for Arabic, unchanged `scriptCoverage` for English — and the verdict of `judgeHeard`, which also
 *  sends a line that fails only on «چ» words to REVIEW. CER is unchanged and reported beside them.
 *
 *  Pure text; no service is called. Writes docs/evidence/voice-identity-v2/coverage-old-vs-new.json.
 *  Run: pnpm exec tsx scripts/arabic-coverage-evidence.ts */
import fs from 'node:fs';
import path from 'node:path';
import { charErrorRate, scriptCoverage, verdict } from '@/server/providers/speech';
import { wordDiff } from '@/server/media/arabic-align';
import { heardMetrics } from '@/worker/handlers/voice-measure';
import { judgeHeard } from '@/worker/handlers/voice';
import type { Language } from '@/domain/vocabulary';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, 'docs/evidence/voice-design');
const OUT = path.join(ROOT, 'docs/evidence/voice-identity-v2/coverage-old-vs-new.json');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(EVIDENCE, rel), 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Pair { source: string; item: string; language: Language; intended: string; heard: string }
const pairs: Pair[] = [];
const add = (source: string, item: string, language: Language, intended: unknown, heard: unknown) => { if (typeof intended === 'string' && typeof heard === 'string') pairs.push({ source, item, language, intended, heard }); };

// report.json: design candidates (both files), the clone hop, the Habibi experiment, and run 1
const report = read('report.json');
for (const d of report.designs ?? []) for (const c of d.candidates ?? []) for (const kind of ['native', 'reference'] as const) add('report.json', `${d.id} c${c.index} ${kind}`, d.language, d.text, c[kind]?.asr?.transcript);
add('report.json', 'cloneHop (IndexTTS from the EN seed)', 'EN', report.cloneHop?.lineEngine?.text, report.cloneHop?.rendering?.asr?.transcript);
add('report.json', 'habibiExperiment (Habibi IRQ from an MSA seed)', 'AR', report.habibiExperiment?.lineEngine?.text, report.habibiExperiment?.rendering?.asr?.transcript);
add('report.json', 'run1 cloneHop', 'EN', report.run1?.cloneHop?.lineEngine?.text, report.run1?.cloneHop?.rendering?.asr?.transcript);
add('report.json', 'run1 habibiExperiment (reference over 12 s)', 'AR', report.run1?.habibiExperiment?.lineEngine?.text, report.run1?.habibiExperiment?.rendering?.asr?.transcript);

// iraqi-ab: the seeds and every render of both Habibi passes, and the real-speaker control
for (const file of ['iraqi-ab/results.json', 'iraqi-ab/results-h8.json']) {
  if (!fs.existsSync(path.join(EVIDENCE, file))) continue;
  const r = read(file);
  for (const s of r.seeds ?? []) add(file, `seed ${s.arm}-${s.voice}-c${s.candidate} (${s.file})`, 'AR', s.text, s.asr?.heard);
  for (const x of r.renders ?? []) add(file, `${x.file}`, 'AR', x.intended, x.heard);
  add(file, 'control reference (Habibi IRQ.wav, real speaker)', 'AR', r.anchor?.referenceText, r.anchor?.asrOfReference?.heard);
  for (const x of r.anchor?.renders ?? []) add(file, `control ${x.line ?? x.file ?? ''}`, 'AR', x.intended, x.heard);
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const rows = pairs.map((p) => {
  const oldCoverage = scriptCoverage(p.intended, p.heard, p.language);
  const m = heardMetrics(p.intended, p.heard, p.language);
  const cer = charErrorRate(p.intended, p.heard, p.language);
  const oldVerdict = verdict({ coverage: oldCoverage, cer, context: 'line' }).status;
  const now = judgeHeard(p.intended, p.heard, p.language, 'line');
  const diffs = p.language === 'AR' ? wordDiff(p.intended, p.heard).filter((d) => d.kind !== 'VARIANT') : [];
  return { ...p, cer: round(cer), coverage: { old: round(oldCoverage), new: round(m.coverage) }, verdict: { old: oldVerdict, new: now.status }, ...(now.reasons.length ? { reasons: now.reasons } : {}), ...(diffs.length ? { diffs: diffs.map((d) => `${d.kind}: ${d.ref.join(' ') || '∅'} → ${d.hyp.join(' ') || '∅'}`) } : {}) };
});

const by = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred);
const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const summarise = (list: typeof rows) => {
  const t: Record<string, number> = {};
  for (const r of list) { const k = `${r.verdict.old}→${r.verdict.new}`; t[k] = (t[k] ?? 0) + 1; }
  return { lines: list.length, meanCoverage: { old: mean(list.map((r) => r.coverage.old)), new: mean(list.map((r) => r.coverage.new)) }, coverageChanged: list.filter((r) => r.coverage.new !== r.coverage.old).length, verdictTransitions: t };
};
const sources = [...new Set(rows.map((r) => r.source))];
const out = {
  createdAt: new Date().toISOString(),
  script: 'scripts/arabic-coverage-evidence.ts',
  note: 'Text comparison of what Whisper large-v3 wrote with what was intended. Old = word-level scriptCoverage; new = the v2 voice check (Arabic: space-insensitive word alignment of src/server/media/arabic-align.ts; English unchanged) and judgeHeard (a line failing only on چ-words is REVIEW, never FAIL). CER is unchanged. Nothing here measures pronunciation, accent or dialect.',
  gates: { line: { coverage: 0.85, cer: 0.15 } },
  summary: { all: summarise(rows), arabic: summarise(by((r) => r.language === 'AR')), english: summarise(by((r) => r.language === 'EN')), bySource: Object.fromEntries(sources.map((s) => [s, summarise(by((r) => r.source === s))])) },
  changed: rows.filter((r) => r.coverage.new !== r.coverage.old || r.verdict.new !== r.verdict.old),
  all: rows,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.summary, null, 2));
console.log(`changed: ${out.changed.length} of ${rows.length}; written ${path.relative(ROOT, OUT)}`);
