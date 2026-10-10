/* AN INTERNAL GATE DECISION (the autonomous completion directive, 2026-10-10): the producer gives no approvals between
 * phases; the engineering QA reviews the subject against the brief and records the gate decision as
 * AUTO_APPROVED_BY_ENGINEERING_QA (never as the producer's approval). The script prints the subject first (the story: scenes,
 * beats, lines, performance; the cut: the chosen takes) — the review is the engineer reading it — then records the decision
 * bound to the subject's hash, so a later change re-closes the gate exactly as a human approval would.
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/auto-approve.ts --production-id <id> --stage STORY|EDIT [--decide APPROVED|REJECTED|CHANGES --note "…"]
 * Without --decide it only prints the subject. */
const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };

async function main() {
  const productionId = arg('production-id'); const stage = arg('stage') as 'STORY' | 'EDIT' | undefined;
  if (!productionId || !stage) throw new Error('--production-id and --stage STORY|EDIT are required');
  const { readState } = await import('@/server/studio/engine');
  const { approvalSubjectHash } = await import('@/domain/approvals');
  const { recordApproval, listApprovals } = await import('@/server/org/runs');
  const { state, versions } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new Error('production not found');
  if (stage === 'STORY') {
    console.log(JSON.stringify({ title: p.title, logline: p.logline, synopsis: p.synopsis, genre: p.genre, mood: p.mood, cast: p.castIds, locations: p.locationIds.map((id) => { const l = state.locations.find((x) => x.id === id); return l ? { id, name: l.name, kind: l.kind } : id; }), scenes: p.scenes.map((sc) => ({ number: sc.number, title: sc.title, location: state.locations.find((x) => x.id === sc.locationId)?.name, timeOfDay: sc.timeOfDay, characters: sc.characterIds.map((id) => state.characters.find((c) => c.id === id)?.name ?? id), purpose: sc.purpose, beats: sc.beats.map((b) => ({ action: b.action, lines: (b as { lines?: Array<{ text?: string }> }).lines?.map((l) => l.text) })) })), shots: p.shots.length, song: p.song ? { title: p.song.title, sections: p.song.sections.map((s) => ({ kind: s.kind, from: s.from, to: s.to, performanceMode: s.performanceMode, singers: s.singerIds })) } : undefined }, null, 1));
  } else {
    console.log(JSON.stringify({ title: p.title, cut: p.cutAssetId, cutStale: p.cutStale, shots: p.shots.map((sh) => ({ number: sh.number, seconds: sh.durationSeconds, chosen: sh.selectedTakeId, takes: sh.takes.length, qa: sh.takes.find((t) => t.id === sh.selectedTakeId)?.qa?.checks.filter((c) => !c.ok).map((c) => c.name) })) }, null, 1));
  }
  const existing = await listApprovals(productionId);
  console.error(`[gate] ${existing.length} approval(s) on record: ${existing.map((a) => `${a.stage}:${a.decision}:${a.by}`).join(', ') || 'none'}`);
  const decide = arg('decide') as 'APPROVED' | 'REJECTED' | 'CHANGES' | undefined;
  if (!decide) return;
  const note = `AUTO_APPROVED_BY_ENGINEERING_QA — ${arg('note', 'reviewed against the brief by the engineering QA (autonomous completion directive, 2026-10-10); not the producer\'s approval')}`;
  const id = await recordApproval({ productionId, stage, subjectKind: stage === 'STORY' ? 'STORY' : 'CUT', subjectId: productionId, decision: decide, by: 'engineering-qa', note, subjectHash: approvalSubjectHash(p, stage), subjectVersion: versions.productions.get(p.id) });
  console.log(JSON.stringify({ recorded: id, stage, decision: decide, by: 'engineering-qa', note }, null, 1));
}
main().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });
