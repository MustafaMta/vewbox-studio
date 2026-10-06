/* PLANNING-LLM BENCHMARK REPORT (docs/research/MODEL-EVAL-2026-10.md §7): reads every model's evidence written by
 * scripts/model-eval-llm-suite.ts (docs/evidence/model-eval-2026-10/llm-suite/<model>/) and prints one comparison:
 * reliability (first calls valid, repairs, re-asks, cut answers, errors), speed (answer tokens per second, time per
 * task), memory (card peak, Docker VM RAM peak) and the episode's mechanical continuity checks over all 11 scenes:
 *  - the World Bible's planted fact: Elias's bandage is on his LEFT hand (shots that name a bandaged hand, and which side);
 *  - the direction look repeated in a prompt although the studio prepends it ("high-end 3D animated feature film");
 *  - a silent shot whose prompt still says someone speaks; a speaking shot framed WIDE;
 *  - screen direction flips between consecutive cut shots of the same character (the 180° line);
 *  - wardrobe agreement: the share of a shot's wardrobe words found in the canonical wardrobe (Elias) or in the first
 *    one the plan described (the others) — 1 = nothing new invented.
 *   pnpm exec tsx scripts/model-eval-llm-report.ts [--json out.json] */
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = path.join(process.cwd(), 'docs/evidence/model-eval-2026-10/llm-suite');
const argv = process.argv.slice(2);
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : '';

interface Shot { durationSeconds: number; framing: string; boundary?: string; prompt: string; action: string; characterIds: string[]; dialogue: Array<{ id: string }>; continuity: { characters: Array<{ characterId: string; wardrobe?: string; screenDirection?: string; holding?: string[] }> }; staging?: { beats?: Array<{ action: string }> }; notes?: string[] }
interface Call { task: string; ms: number; attempts: number; firstAttemptValid: boolean; everyFirstCallValid?: boolean; repairs?: number; reasks?: number; truncatedAttempts?: number; error?: string; tokPerS?: number; answerTokens?: number; vramPeakMiB?: number; ram?: { containerGiB?: number; vmUsedGiB?: number }; attemptsDetail: Array<{ kind?: string; promptTokens?: number; completionTokens?: number; finishReason?: string; ms: number }> }

const ELIAS = 'char-56c47abc59';
const SPEECH = /\b(says|speaks?|speaking|whispers?|shouts?|asks?|replies|mutters?|finishes speaking|delivers? (?:the|her|his) line|lips (?:move|moving))\b/i;
const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['and', 'with', 'the', 'his', 'her', 'over', 'under'].includes(w)));
/** how much of what a shot says the character wears agrees with the reference wardrobe (1 = nothing new invented) */
const jac = (a: Set<string>, b: Set<string>) => (a.size ? [...a].filter((x) => b.has(x)).length / a.size : 1);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

/** older records have no attempt kind: a repair is a call whose prompt carries the earlier answer */
function kinds(c: Call) {
  return c.attemptsDetail.map((a, i) => a.kind ?? (i > 0 && (a.promptTokens ?? 0) > (c.attemptsDetail[i - 1].promptTokens ?? 0) + 0.6 * (c.attemptsDetail[i - 1].completionTokens ?? 0) ? 'repair' : 'first'));
}

async function main() {
  const models = (await fs.readdir(BASE, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name !== 'fixtures').map((d) => d.name);
  const canonElias = 'Striped navy-and-white wool sweater (V-neck, rolled sleeves), yellow raincoat (fur collar, brass buttons), gray flannel trousers (brass-buckled belt), black rubber boots (missing left heel tread)';
  const out: Record<string, unknown> = {};
  for (const m of models) {
    const dir = path.join(BASE, m);
    const summary = await fs.readFile(path.join(dir, 'summary.json'), 'utf8').then((t) => JSON.parse(t) as { calls: Call[] }, () => ({ calls: [] as Call[] }));
    const calls = summary.calls;
    const group = (t: string) => t.replace(/-s\d\d$/, '');
    const tasks: Record<string, unknown> = {};
    for (const t of new Set(calls.map((c) => group(c.task)))) {
      const cs = calls.filter((c) => group(c.task) === t);
      const ks = cs.map(kinds);
      tasks[t] = {
        n: cs.length,
        validNoRepair: cs.filter((c, i) => !c.error && !ks[i].includes('repair') && !c.attemptsDetail.some((a) => a.finishReason === 'length')).length,
        repairs: ks.flat().filter((k) => k === 'repair').length,
        cut: cs.reduce((a, c) => a + c.attemptsDetail.filter((x) => x.finishReason === 'length').length, 0),
        errors: cs.filter((c) => c.error).map((c) => c.error!.slice(0, 120)),
        medianS: Math.round(median(cs.map((c) => c.ms)) / 1000),
        totalS: Math.round(cs.reduce((a, c) => a + c.ms, 0) / 1000),
        tokPerS: Number(median(cs.map((c) => c.tokPerS ?? NaN).filter(Number.isFinite)).toFixed(1)),
        cardPeakMiB: Math.max(...cs.map((c) => c.vramPeakMiB ?? 0)),
        vmRamPeakGiB: Math.max(...cs.map((c) => c.ram?.vmUsedGiB ?? 0).filter(Number.isFinite)),
      };
    }
    // the episode's shots, scene by scene
    const files = (await fs.readdir(dir)).filter((f) => /^ep-plan-s\d\d-run1\.json$/.test(f)).sort();
    const scenes: Array<{ scene: number; shots: Shot[] }> = [];
    for (const f of files) { const j = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as { answer?: { shots: Shot[] } }; if (j.answer) scenes.push({ scene: Number(f.slice(9, 11)), shots: j.answer.shots }); }
    const shots = scenes.flatMap((s) => s.shots);
    const text = (s: Shot) => `${s.prompt} ${s.action} ${(s.staging?.beats ?? []).map((b) => b.action).join(' ')}`;
    const bandage = shots.filter((s) => /bandag/i.test(text(s)));
    const bandSide = { left: bandage.filter((s) => /left (hand|palm)[^.]{0,40}bandag|bandag[^.]{0,60}left (hand|palm)/i.test(text(s))).length, right: bandage.filter((s) => /right (hand|palm)[^.]{0,40}bandag|bandag[^.]{0,60}right (hand|palm)/i.test(text(s))).length, unsided: 0 };
    bandSide.unsided = bandage.length - bandSide.left - bandSide.right;
    const prefixRepeated = shots.filter((s) => /high-end 3d animated feature film|stylized cg characters with appealing proportions/i.test(s.prompt)).length;
    const silentSpeech = shots.filter((s) => s.dialogue.length === 0 && SPEECH.test(s.prompt)).length;
    const wideSpeaking = shots.filter((s) => s.dialogue.length > 0 && /WIDE/.test(s.framing)).length;
    // 180°: the same character, consecutive shots joined by a cut/continuous, LEFT ↔ RIGHT
    let flips = 0; let pairs = 0;
    for (const sc of scenes) for (let i = 1; i < sc.shots.length; i++) {
      const a = sc.shots[i - 1]; const b = sc.shots[i]; if (b.boundary === 'transition') continue;
      for (const c of b.continuity.characters) { const p = a.continuity.characters.find((x) => x.characterId === c.characterId); if (!p || !['LEFT', 'RIGHT'].includes(p.screenDirection ?? '') || !['LEFT', 'RIGHT'].includes(c.screenDirection ?? '')) continue; pairs++; if (p.screenDirection !== c.screenDirection) flips++; }
    }
    const wardrobe: Record<string, { n: number; median: number; min: number }> = {};
    const firstOf: Record<string, string> = {};
    const ov: Record<string, number[]> = {};
    for (const s of shots) for (const c of s.continuity.characters) { if (!c.wardrobe) continue; firstOf[c.characterId] ??= c.wardrobe; (ov[c.characterId] ??= []).push(jac(tok(c.wardrobe), tok(c.characterId === ELIAS ? canonElias : firstOf[c.characterId]))); }
    for (const [id, xs] of Object.entries(ov)) wardrobe[id] = { n: xs.length, median: Number(median(xs).toFixed(2)), min: Number(Math.min(...xs).toFixed(2)) };
    out[m] = { tasks, episode: scenes.length ? { scenes: scenes.length, shots: shots.length, seconds: shots.reduce((a, s) => a + s.durationSeconds, 0), linesAssigned: shots.reduce((a, s) => a + s.dialogue.length, 0), bandagedHandShots: bandage.length, bandSide, prefixRepeated, silentShotSpeech: silentSpeech, wideSpeaking, screenDirectionFlips: `${flips}/${pairs}`, wardrobe, transitions: shots.filter((s) => s.boundary === 'transition').length, continuous: shots.filter((s) => s.boundary === 'continuous').length } : undefined };
  }
  console.log(JSON.stringify(out, null, 2));
  if (jsonOut) await fs.writeFile(jsonOut, JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
