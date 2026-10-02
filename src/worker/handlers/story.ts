import type { Handler } from './index';
import type { IdeaPreferences, Scene } from '@/domain/types';
import type { Dialect } from '@/domain/vocabulary';
import type { JobPayloadParsed } from '@/domain/jobs';
import type { CharacterInput } from '@/domain/actions';
import { runCommand, type Command } from '@/domain/commands';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { performanceFor, shotWindows } from '@/domain/timeline';
import { command, commands, readState, stampCommands, type CommandSpec } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { db, schema } from '@/server/db/client';
import { recordMetric } from '@/server/jobs/queue';
import { continuityUpdate, designCharacter as design, developStory as develop, libraryGuests, planPerformance, planShots as plan, proposeIdea, writeScript as write, type PlannedShot } from '@/server/story/engine';
import { alignSongLyrics } from './music';
import type { LlmResult } from '@/server/providers/llm';
import { recordHandoff } from '@/server/org/runs';
import { preflightPlan } from '@/server/org/preflight';

/** THE STORY HANDLERS — Auto Idea, Manual Brief development, script writing, shot planning. Each runs the engine,
 *  then writes the result into the studio through commands (so the browser sees it like any other change). */

const metric = (jobId: string, r: LlmResult) => recordMetric('llm.ms', r.ms, 'ms', { provider: r.provider, model: r.model, in: r.inputTokens ?? 0, out: r.outputTokens ?? 0 }, jobId);

export const autoIdea: Handler = async (ctx) => {
  const payload = ctx.job.payload as { kind: 'SHOW' | 'SEASON' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO'; showId?: string; seasonId?: string; preferences: IdeaPreferences; brief?: string };
  await ctx.progress('GENERATING', { phase: 'writing', message: 'Writing a proposal' });
  const { state } = await readState();
  const proposal = await ctx.tool('story.structured_answer', () => proposeIdea(state, payload, { jobId: ctx.job.id, onResult: (r) => void metric(ctx.job.id, r) }), { label: 'proposal' });
  await ctx.checkpoint();
  const id = nid('proposal');
  await db().insert(schema.proposals).values({ id, jobId: ctx.job.id, request: payload, proposal, createdAt: new Date().toISOString() });
  await ctx.activity('IDEA_PROPOSED', `Proposed ${payload.kind.toLowerCase().replace('_', ' ')}: “${proposal.title}”`, { proposalId: id });
  return { proposalId: id, title: proposal.title };
};

/** THE CONTINUITY WRITER — after an episode is cut, the show's bible gains what happened, what changed between
 *  people and which storylines stay open; the next season or episode is proposed from it. */
export const episodeContinuity: Handler = async (ctx) => {
  const { productionId } = ctx.job.payload as { productionId: string };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const show = p.showId ? state.shows.find((x) => x.id === p.showId) : undefined;
  if (!show) throw new StudioError('INVALID', 'Only an episode of a show is recorded in a bible.');
  await ctx.progress('GENERATING', { phase: 'writing', message: `Recording ${p.title} in the bible of ${show.title}` });
  const out = await ctx.tool('story.structured_answer', () => continuityUpdate(state, show, p, castOf(state, p), { jobId: ctx.job.id, onResult: (r) => void metric(ctx.job.id, r) }), { label: 'continuity' });
  await ctx.checkpoint();
  const b = show.bible ?? {};
  const season = state.seasons.find((x) => x.id === p.seasonId);
  const tag = `S${season?.number ?? '?'}E${p.episodeNumber ?? '?'}`;
  // this episode's entries replace an earlier record of the same episode (a re-cut), never another episode's
  const timeline = [...(b.timeline ?? []).filter((x) => !x.startsWith(`${tag}:`)), ...out.events.map((e) => (e.startsWith(tag) ? e : `${tag}: ${e}`))];
  const resolved = new Set((out.resolved ?? []).map((x) => x.toLowerCase()));
  const unresolved = Array.from(new Set([...(b.unresolved ?? []).filter((x) => !resolved.has(x.toLowerCase())), ...out.unresolved])).slice(0, 12);
  const relationships = Array.from(new Set([...(b.relationships ?? []), ...(out.relationships ?? [])])).slice(0, 24);
  await command('updateShow', [show.id, { bible: { ...b, timeline, unresolved, relationships } }], 'worker');
  await recordHandoff({ productionId: p.id, stage: 'EDIT', producerDepartment: 'STORY', receiverDepartment: 'EXECUTIVE', artifactIds: [show.id], outputVersions: { timelineEntries: timeline.length, unresolved: unresolved.length }, validation: { ok: out.events.length > 0, checks: [{ name: 'events-recorded', ok: out.events.length > 0, detail: `${out.events.length} event(s) under ${tag}` }, { name: 'open-storylines-carried', ok: true, detail: `${unresolved.length} open` }] }, jobId: ctx.job.id });
  await ctx.activity('BIBLE_UPDATED', `${show.title}: ${tag} recorded in the bible (${out.events.length} events, ${unresolved.length} open storylines)`, { showId: show.id, events: out.events.length, unresolved: unresolved.length });
  return { events: out.events.length, unresolved: unresolved.length, resolved: out.resolved?.length ?? 0 };
};

/** CASTING — a character designed from a one-line brief, a name alone, or a partial profile the producer wrote:
 *  every appearance field is filled, so the portrait and the voice can follow; the producer's own fields are kept
 *  exactly. The record and its seat in the production or show are written in one batch; a design that does not
 *  pass the character schema creates nothing. */
export const designCharacter: Handler = async (ctx) => {
  const payload = ctx.job.payload as JobPayloadParsed<'DESIGN_CHARACTER'>;
  const { state } = await readState();
  const p = payload.productionId ? state.productions.find((x) => x.id === payload.productionId) : undefined;
  const show = payload.showId ? state.shows.find((x) => x.id === payload.showId) : p?.showId ? state.shows.find((x) => x.id === p.showId) : undefined;
  const given = payload.profile ?? {};
  const name = (given.name ?? payload.name)?.trim() || undefined;
  const style = given.style ?? payload.style ?? show?.style ?? p?.style ?? state.settings.defaults.style;
  const language = given.language ?? payload.language ?? show?.language ?? p?.language ?? state.settings.defaults.language;
  const dialect: Dialect | undefined = language === 'AR' ? given.dialect ?? payload.dialect ?? show?.dialect ?? p?.dialect ?? state.settings.defaults.dialect : undefined;
  // what the model designs from: the producer's line, what is already known of the character, or the name alone
  const known = (Object.keys(given) as Array<keyof typeof given>).filter((k) => !['name', 'style', 'language', 'dialect', 'voice', 'canon', 'notes'].includes(k)).map((k) => [k, given[k]] as const).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  const line = payload.brief?.trim();
  const brief = [line, known.length ? `Known so far — keep these exactly and fill only what is missing: ${known.join('; ')}.` : '', !line && !known.length ? `A character named ${name} for a ${style.toLowerCase()} production; invent a fitting role, look and personality.` : ''].filter(Boolean).join('\n');
  await ctx.progress('GENERATING', { phase: 'designing', message: `Designing ${name ?? 'a character'}` });
  const d = await ctx.tool('story.structured_answer', () => design(state, { brief, name, style, language, dialect, world: show ? `${show.title}: ${show.logline}` : p ? `${p.title}: ${p.logline}` : undefined }, { jobId: ctx.job.id, onResult: (r) => void metric(ctx.job.id, r) }), { label: 'design' });
  await ctx.checkpoint();
  // the producer's fields win over the model's; the voice profile too
  const input: CharacterInput = {
    name: name ?? d.name, nameAr: given.nameAr ?? d.nameAr, role: given.role ?? d.role, style, sex: given.sex ?? d.sex, species: given.species ?? d.species, ageYears: given.ageYears ?? d.ageYears,
    build: given.build || d.build, face: given.face || d.face, hair: given.hair || d.hair, skin: given.skin || d.skin, eyes: given.eyes || d.eyes, wardrobe: given.wardrobe || d.wardrobe, personality: given.personality || d.personality,
    distinguishing: given.distinguishing?.length ? given.distinguishing : d.distinguishing, language, dialect, canon: given.canon,
    notes: given.notes ?? (line ? `Designed by Casting from the brief: “${line.slice(0, 200)}”` : 'Designed by Casting from the written profile.'),
    voice: { pitch: given.voice?.pitch ?? d.voice?.pitch ?? 'MID', pace: given.voice?.pace ?? d.voice?.pace ?? 'MEASURED', timbre: given.voice?.timbre ?? d.voice?.timbre ?? '', notes: given.voice?.notes ?? d.voice?.notes ?? '' },
  };
  // one batch: the record and its seat; a dry run on the snapshot refuses a design that fails the schema (INVALID)
  // before anything is written, and tells the id the batch will mint
  const stamp = { seed: `design-${ctx.job.id}-${ctx.job.attempts}`, at: new Date().toISOString() };
  const probe = runCommand(state, stampCommands([{ name: 'addCharacter', args: [input] }], stamp)[0] as Command<'addCharacter'>);
  const characterId = probe.result.character.id;
  const batch: CommandSpec[] = [{ name: 'addCharacter', args: [input] }];
  if (p) batch.push({ name: 'updateProduction', args: [p.id, { castIds: Array.from(new Set([...p.castIds, characterId])) }] });
  if (show) batch.push({ name: 'updateShow', args: [show.id, { castIds: Array.from(new Set([...show.castIds, characterId])) }] });
  await commands(batch, 'worker', stamp);
  await ctx.activity('CHARACTER_DESIGNED', `${input.name} designed (${input.role})${line ? ' from the brief' : known.length ? ' from the written profile' : ' from the name'}`, { characterId });
  return { characterId, name: input.name };
};

export const developStory: Handler = async (ctx) => {
  const { productionId } = ctx.job.payload as { productionId: string };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  await ctx.progress('GENERATING', { phase: 'developing', message: 'Developing the story, cast and world' });
  const out = await ctx.tool('story.structured_answer', () => develop(state, p, castOf(state, p), worldOf(state, p), { jobId: ctx.job.id, onResult: (r) => void metric(ctx.job.id, r) }), { label: 'develop' });
  await ctx.checkpoint();
  await ctx.progress('POSTPROCESSING', { phase: 'saving', message: 'Saving characters, places and scenes' });
  // new characters and places first
  const nameToChar = new Map<string, string>();
  const nameToLoc = new Map<string, string>();
  for (const c of castOf(state, p)) nameToChar.set(c.name.toLowerCase(), c.id);
  for (const l of worldOf(state, p)) nameToLoc.set(l.name.toLowerCase(), l.id);
  // library members the engine may pull in by name: the same list the engine was offered (an episode gets its
  // regulars plus at most the guests its brief names; any other library name the model used is dropped)
  const guests = libraryGuests(state, p, castOf(state, p));
  for (const c of guests) if (!nameToChar.has(c.name.toLowerCase())) nameToChar.set(`lib:${c.name.toLowerCase()}`, c.id);
  // a name the story invents (newCharacters) is a member, not a foreigner: it is registered below before the
  // scene breakdown is resolved; only a library name outside the offered list is dropped
  const dropped = new Set<string>();
  const invented = new Set(out.newCharacters.map((c) => c.name.toLowerCase()));
  for (const sc of out.scenes) for (const n of sc.characterNames) if (!nameToChar.has(n.toLowerCase()) && !nameToChar.has(`lib:${n.toLowerCase()}`) && !invented.has(n.toLowerCase())) dropped.add(n);
  if (dropped.size) await ctx.event('warn', `characters outside this story's cast were dropped from the scene breakdown: ${Array.from(dropped).join(', ')}`);
  for (const l of state.locations) if (!nameToLoc.has(l.name.toLowerCase())) nameToLoc.set(`lib:${l.name.toLowerCase()}`, l.id);
  const castIds = [...p.castIds]; const locationIds = [...p.locationIds];
  // a character the model lists but puts in no scene (or leaves undesigned) is noise, not a member of the story
  const inScenes = new Set(out.scenes.flatMap((sc) => sc.characterNames.map((n) => n.toLowerCase())));
  for (const nc of out.newCharacters) {
    const key = nc.name.toLowerCase();
    if (nameToChar.has(key)) continue;
    if (!inScenes.has(key) || !nc.design?.face) { await ctx.event('warn', `invented character "${nc.name}" was not used in any scene${nc.design?.face ? '' : ' and had no design'}; dropped`); continue; }
    const r = await command('addCharacter', [{ name: nc.name, nameAr: nc.design.nameAr, role: nc.role, style: p.style, sex: nc.design.sex ?? nc.sex, species: undefined, ageYears: nc.design.ageYears ?? 30, build: nc.design.build, face: nc.design.face, hair: nc.design.hair, skin: nc.design.skin, eyes: nc.design.eyes, distinguishing: nc.design.distinguishing, wardrobe: nc.design.wardrobe, personality: nc.design.personality, language: p.language, dialect: p.dialect, canon: nc.design.canon, notes: `Created by the story engine for “${p.title}”.` }], 'worker');
    nameToChar.set(key, r.character.id); castIds.push(r.character.id);
  }
  for (const nl of out.newLocations) {
    const key = nl.name.toLowerCase();
    if (nameToLoc.has(key)) continue;
    const r = await command('addLocation', [{ name: nl.name, nameAr: nl.design.nameAr, kind: nl.design.kind, description: nl.design.description, style: p.style, lighting: nl.design.lighting, landmarks: nl.design.landmarks, props: nl.design.props, layout: nl.design.layout }], 'worker');
    nameToLoc.set(key, r.location.id); locationIds.push(r.location.id);
  }
  const resolveChar = (n: string) => nameToChar.get(n.toLowerCase()) ?? nameToChar.get(`lib:${n.toLowerCase()}`);
  const resolveLoc = (n: string) => nameToLoc.get(n.toLowerCase()) ?? nameToLoc.get(`lib:${n.toLowerCase()}`);
  for (const sc of out.scenes) { for (const n of sc.characterNames) { const id = resolveChar(n); if (id && !castIds.includes(id)) castIds.push(id); } const lid = resolveLoc(sc.locationName); if (lid && !locationIds.includes(lid)) locationIds.push(lid); }
  const scenes: Array<Omit<Scene, 'number'>> = out.scenes.map((sc) => ({ id: nid('scene'), title: sc.title, locationId: resolveLoc(sc.locationName), timeOfDay: sc.timeOfDay, characterIds: sc.characterNames.map(resolveChar).filter((x): x is string => Boolean(x)), beats: [], purpose: sc.purpose, emotionalObjective: sc.emotionalObjective, entryState: sc.entryState, exitState: sc.exitState }));
  await command('updateProduction', [p.id, { logline: out.logline, synopsis: out.synopsis, genre: out.genre ?? p.genre, mood: out.mood ?? p.mood, titleAr: p.titleAr ?? out.titleAr, castIds, locationIds }], 'worker');
  // keep existing scenes that already carry written lines; a skeleton (an accepted proposal's structure: a summary
  // beat, no lines, no place) is replaced by the developed, located and cast scenes
  const keepBeats = p.scenes.some((sc) => sc.beats.some((b) => b.lines.length > 0));
  if (!keepBeats) await command('replaceScript', [p.id, scenes], 'worker');
  // an episode's new people and places join the show's canon, so later seasons and episodes inherit them
  if (p.showId) { const show = state.shows.find((x) => x.id === p.showId); if (show) await command('updateShow', [show.id, { castIds: Array.from(new Set([...show.castIds, ...castIds])), locationIds: Array.from(new Set([...show.locationIds, ...locationIds])) }], 'worker'); }
  await command('markStepDone', [p.id, 'STORY'], 'worker');
  // STORY handoff to Casting & World: every scene located and cast by id; the human approval of the story itself
  // is recorded when the producer accepts it on the Story page
  const fresh = (await readState()).state.productions.find((x) => x.id === p.id)!;
  const unlocated = fresh.scenes.filter((sc) => !sc.locationId).length;
  const uncast = fresh.scenes.filter((sc) => sc.characterIds.length === 0).length;
  await recordHandoff({ productionId: p.id, stage: 'STORY', producerDepartment: 'STORY', receiverDepartment: 'CASTING', artifactIds: fresh.scenes.map((sc) => sc.id), outputVersions: { scenes: fresh.scenes.length, cast: castIds.length, locations: locationIds.length }, validation: { ok: fresh.scenes.length > 0 && unlocated === 0, checks: [{ name: 'scenes-present', ok: fresh.scenes.length > 0, detail: `${fresh.scenes.length} scene(s)` }, { name: 'every-scene-located', ok: unlocated === 0, detail: unlocated ? `${unlocated} scene(s) without a place` : undefined }, { name: 'every-scene-cast', ok: uncast === 0, detail: uncast ? `${uncast} scene(s) with nobody in them` : undefined }, { name: 'no-foreign-characters', ok: dropped.size === 0, detail: dropped.size ? `dropped: ${Array.from(dropped).join(', ')}` : undefined }] }, jobId: ctx.job.id });
  await ctx.activity('STORY_DEVELOPED', `“${p.title}”: ${fresh.scenes.length} scenes, ${out.newCharacters.length} new character(s), ${out.newLocations.length} new place(s)`, { scenes: fresh.scenes.length });
  return { scenes: scenes.length, newCharacters: out.newCharacters.length, newLocations: out.newLocations.length, replacedScenes: !keepBeats };
};

export const writeScript: Handler = async (ctx) => {
  const { productionId, sceneIds } = ctx.job.payload as { productionId: string; sceneIds?: string[] };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  if (p.scenes.length === 0) throw new StudioError('INVALID', 'There are no scenes to write yet. Develop the story first.');
  const cast = castOf(state, p); const world = worldOf(state, p);
  const targets = sceneIds?.length ? p.scenes.filter((sc) => sceneIds.includes(sc.id)) : p.scenes;
  // in batches so long episodes stay within the model's attention
  const batches: Scene[][] = [];
  for (let i = 0; i < targets.length; i += 4) batches.push(targets.slice(i, i + 4));
  let written = 0;
  for (const [bi, batch] of batches.entries()) {
    await ctx.progress('GENERATING', { phase: 'writing', message: `Writing scenes ${batch[0].number}–${batch[batch.length - 1].number}`, step: bi + 1, total: batches.length });
    const out = await ctx.tool('story.structured_answer', () => write(state, p, batch, cast, world, { jobId: ctx.job.id, onResult: (r) => void metric(ctx.job.id, r) }), { label: `scenes ${batch[0].number}–${batch[batch.length - 1].number}` });
    await ctx.checkpoint();
    const byName = (n: string) => cast.find((c) => c.name.toLowerCase() === n.trim().toLowerCase() || c.nameAr === n.trim());
    for (const sc of out.scenes) {
      const scene = p.scenes.find((x) => x.id === sc.sceneId);
      if (!scene) continue;
      const beats = sc.beats.map((b) => ({ id: nid('beat'), action: b.action, lines: b.lines.map((l) => { const c = byName(l.characterName); return c ? { id: nid('line'), characterId: c.id, text: l.text, textAr: l.textAr || undefined, delivery: l.delivery } : null; }).filter((x): x is NonNullable<typeof x> => Boolean(x)) }));
      const speakers = new Set(beats.flatMap((b) => b.lines.map((l) => l.characterId)));
      await command('updateScene', [p.id, scene.id, { beats, characterIds: Array.from(new Set([...scene.characterIds, ...speakers])) }], 'worker');
      written++;
    }
  }
  await command('markStepDone', [p.id, 'STORY'], 'worker');
  // SCRIPT handoff to Pre-Production: every scene has beats, every line a speaker from the cast and a gloss when
  // the production is in Arabic, no line too long to be spoken inside one clip
  const fresh = (await readState()).state.productions.find((x) => x.id === p.id)!;
  const unwritten = fresh.scenes.filter((sc) => sc.beats.length === 0).length;
  const lines = fresh.scenes.flatMap((sc) => sc.beats.flatMap((b) => b.lines));
  const unglossed = p.language === 'AR' ? lines.filter((l) => !l.textAr?.trim() || !l.text?.trim()).length : 0;
  const tooLong = lines.filter((l) => (p.language === 'AR' ? l.textAr || l.text : l.text).split(/\s+/).length > 28).length;
  await recordHandoff({ productionId: p.id, stage: 'SCRIPT', producerDepartment: 'STORY', receiverDepartment: 'PREPRODUCTION', artifactIds: fresh.scenes.map((sc) => sc.id), outputVersions: { scenes: fresh.scenes.length, lines: lines.length }, validation: { ok: unwritten === 0 && unglossed === 0 && tooLong === 0, checks: [{ name: 'every-scene-written', ok: unwritten === 0, detail: unwritten ? `${unwritten} scene(s) without beats` : `${fresh.scenes.length} scenes` }, { name: 'every-line-glossed', ok: unglossed === 0, detail: p.language === 'AR' ? (unglossed ? `${unglossed} line(s) missing the Arabic or the English` : `${lines.length} lines in Arabic with English gloss`) : 'English production' }, { name: 'lines-speakable', ok: tooLong === 0, detail: tooLong ? `${tooLong} line(s) over 28 words` : undefined }] }, jobId: ctx.job.id });
  await ctx.activity('SCRIPT_WRITTEN', `“${p.title}”: ${written} scene(s) written, ${lines.length} line(s) of dialogue`, { scenes: written, lines: lines.length });
  return { scenesWritten: written };
};

export const planShots: Handler = async (ctx) => {
  const { productionId, sceneIds, force, performanceOnly } = ctx.job.payload as { productionId: string; sceneIds?: string[]; force?: boolean; performanceOnly?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const cast = castOf(state, p); const world = worldOf(state, p);
  // music video: only redo who sings what, on the shots that already exist
  const targets = performanceOnly ? [] : sceneIds?.length ? p.scenes.filter((sc) => sceneIds.includes(sc.id)) : p.scenes;
  if (performanceOnly) {
    if (p.kind !== 'MUSIC_VIDEO' || !p.song) throw new StudioError('INVALID', 'Only a music video has a singing assignment.');
    if (p.shots.length === 0) throw new StudioError('INVALID', 'Plan the shots first; the singing assignment is copied onto them.');
    // the real vocal track first: lines placed where they are sung, so the assignment and the shot windows follow it
    if (p.song.stems?.vocals) await alignSongLyrics(ctx, p.id, p.song.stems.vocals);
    await ctx.progress('GENERATING', { phase: 'performance', message: 'Assigning the singing' });
  } else {
    const pre = preflightPlan(p, sceneIds);
    await ctx.event(pre.ok ? 'info' : 'error', `preflight ${pre.ok ? 'passed' : 'FAILED'}`, { checks: pre.checks });
    if (!pre.ok) { const failed = pre.checks.filter((c) => !c.ok); throw Object.assign(new StudioError('INVALID', failed.some((c) => c.name === 'scenes-present') ? 'There are no scenes to plan.' : failed.some((c) => c.name === 'scenes-written') ? 'Write the script before planning shots: some scenes have no beats.' : `Cannot plan: ${failed.map((c) => `${c.name} (${c.detail ?? ''})`).join('; ')}`), { failureClass: failed[0].failureClass }); }
  }
  let previous: { shot?: PlannedShot; sceneExit?: string } = {};
  // continuity carries over from the last planned shot before the first target
  const firstIdx = targets.length ? p.scenes.findIndex((sc) => sc.id === targets[0].id) : -1;
  const prior = p.shots.filter((sh) => p.scenes.findIndex((sc) => sc.id === sh.sceneId) < firstIdx).at(-1);
  if (prior?.continuity) previous = { shot: { purpose: prior.purpose, action: prior.action, framing: prior.framing, cameraMove: prior.cameraMove, durationSeconds: prior.durationSeconds, characterIds: prior.characterIds, dialogue: prior.dialogue, transition: prior.transition, continuity: prior.continuity, prompt: prior.prompt ?? '' } };
  let total = 0;
  for (const [i, scene] of targets.entries()) {
    await ctx.progress('GENERATING', { phase: 'planning', message: `Planning scene ${scene.number}: ${scene.title}`, step: i + 1, total: targets.length });
    const shots = await ctx.tool('story.structured_answer', () => plan(state, p, scene, cast, world, previous, { jobId: ctx.job.id, onResult: (r) => void metric(ctx.job.id, r) }), { label: `scene ${scene.number}` });
    await ctx.checkpoint();
    await command('replaceSceneShots', [p.id, scene.id, shots.map((sh) => ({ sceneId: scene.id, purpose: sh.purpose, action: sh.action, framing: sh.framing, cameraMove: sh.cameraMove, durationSeconds: sh.durationSeconds, characterIds: sh.characterIds, dialogue: sh.dialogue, transition: sh.transition, continuity: { ...sh.continuity, version: 1 }, prompt: sh.prompt })), Boolean(force)], 'worker');
    previous = { shot: shots[shots.length - 1], sceneExit: scene.exitState };
    total += shots.length;
  }
  // music video: make sure the singing assignment exists per section and copy it onto shots by song window
  if (p.kind === 'MUSIC_VIDEO' && p.song) {
    try {
      const plan2 = await ctx.tool('story.structured_answer', () => planPerformance(p, cast, { jobId: ctx.job.id }), { label: 'performance' });
      const sections = p.song.sections.map((sec) => { const a = plan2.find((x) => x.sectionId === sec.id); return a ? { ...sec, performanceMode: a.mode, singerIds: a.singerIds, lines: a.lines } : sec; });
      await command('updateSong', [p.id, { sections }], 'worker');
    } catch (e) { await ctx.event('warn', `performance plan skipped: ${(e as Error).message}`); }
    // every shot learns who performs in its window of the song (and who only listens), so prompts and takes follow it
    const fresh = (await readState()).state.productions.find((x) => x.id === p.id);
    if (fresh?.song) {
      const windows = shotWindows(fresh);
      for (const sh of fresh.shots) {
        const w = windows.get(sh.id); if (!w) continue;
        const perf = performanceFor(fresh.song, w);
        if (perf && JSON.stringify(perf) !== JSON.stringify(sh.performance)) await command('updateShot', [fresh.id, sh.id, { performance: perf }], 'worker');
      }
    }
  }
  await command('markStepDone', [p.id, 'STORYBOARD'], 'worker');
  // SHOT PLAN handoff to Sound (audio first) and Video: every line assigned to exactly one shot, durations inside the
  // engine's range, the running time close to the target
  const fresh = (await readState()).state.productions.find((x) => x.id === p.id)!;
  if (!performanceOnly) {
    const scriptLines = fresh.scenes.flatMap((sc) => sc.beats.flatMap((b) => b.lines.map((l) => l.id)));
    const assigned = new Map<string, number>();
    for (const sh of fresh.shots) for (const d of sh.dialogue) assigned.set(d.id, (assigned.get(d.id) ?? 0) + 1);
    const unassigned = scriptLines.filter((id) => !assigned.has(id)).length;
    const doubled = Array.from(assigned.values()).filter((n) => n > 1).length;
    const outOfRange = fresh.shots.filter((sh) => sh.durationSeconds < 3 || sh.durationSeconds > 15).length;
    const planned = fresh.shots.reduce((s, sh) => s + sh.durationSeconds, 0);
    const budgetOk = planned >= fresh.targetSeconds * 0.85 && planned <= fresh.targetSeconds * 1.25;
    await recordHandoff({ productionId: p.id, stage: 'SHOT_PLAN', producerDepartment: 'PREPRODUCTION', receiverDepartment: 'SOUND', artifactIds: fresh.shots.map((sh) => sh.id), outputVersions: { shots: fresh.shots.length, seconds: Math.round(planned) }, validation: { ok: unassigned === 0 && doubled === 0 && outOfRange === 0, checks: [{ name: 'every-line-assigned-once', ok: unassigned === 0 && doubled === 0, detail: unassigned || doubled ? `${unassigned} unassigned, ${doubled} assigned twice` : `${scriptLines.length} lines` }, { name: 'durations-in-range', ok: outOfRange === 0, detail: outOfRange ? `${outOfRange} shot(s) outside 3–15 s` : undefined }, { name: 'running-time-near-target', ok: budgetOk, detail: `${Math.round(planned)} s planned for ${fresh.targetSeconds} s` }] }, jobId: ctx.job.id });
    await ctx.activity('SHOTS_PLANNED', `“${p.title}”: ${total} shot(s) planned over ${targets.length} scene(s), ${Math.round(planned)} s`, { shots: total, seconds: Math.round(planned) });
  } else {
    await ctx.activity('SINGING_ASSIGNED', `“${p.title}”: singing assigned per section and copied onto ${fresh.shots.length} shot(s)`, { shots: fresh.shots.length });
  }
  return { shots: total, scenes: targets.length };
};
