// QA repro (2026-10-06): an EMPTY persistent change — what "Add a change" stores the moment it is clicked — reaches the
// production context as a condition with no text, and the prompt sentences then throw.
//   pnpm exec tsx scripts/qa-empty-fact.ts http://localhost:4252
import { contextLines, productionContextFor } from '../src/domain/production-context';

const base = process.argv[2] ?? 'http://localhost:4252';
const { state } = await (await fetch(`${base}/api/studio`)).json();
const p = structuredClone(state.productions.find((x: { id: string }) => x.id === 'short-efe98843f0'));
const [s1, , s3] = p.shots.sort((a: { number: number }, b: { number: number }) => a.number - b.number);
const clara = 'char-0556d14a04';
// exactly what SceneStoryEditor's "Add a change" writes (subject = the first cast member, text ''), placed after shot 1.1
p.scenes[0].story = { changes: [{ id: 'fact-qa', text: '', subject: { kind: 'CHARACTER', characterId: clara }, atShotId: s1.id }] };
const ctx = productionContextFor(state, p, s3);
console.log('condition carried into shot 1.3:', JSON.stringify(ctx.characters.find((c) => c.characterId === clara)?.condition));
try { console.log('prompt sentences:', contextLines(ctx, () => 'the woman')); }
catch (e) { console.log('contextLines THROWS:', (e as Error).message); }
