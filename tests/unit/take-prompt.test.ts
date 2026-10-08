import { describe, expect, it } from 'vitest';
import { h3ReferencePrompt, lineLanguageTag, lintH3Prompt, stripDialogueTags, takePrompt, type H3Binding } from '@/server/story/prompts';
import { fixture, shotOf } from './continuity-fixture';

/** The take prompt: the planner's dialogue tags are stripped without eating the picture direction in front of them
 *  (P0.3), and on the reference graph every picture is bound in MiniMax H3's own grammar (P1): `<Subject k> is the …
 *  in <Picture k>` (installed multiframe template; MiniMax-H3 skills/h3-prompt-writing ref-en.txt), dialogue as
 *  `<Subject k> (Sx) says, <d>[Language] …</d>`, task types and retention labels from the documented vocabulary. */

describe('stripDialogueTags (P0.3)', () => {
  it('keeps the Lamp Shop 1.2 direction that the old 80-character look-behind deleted', () => {
    // the planner wrote its own tag straight after the picture direction (DB, take-a5f4787ba6)
    const planner = 'Left: tall man slumps on counter, hand on parcel. Warm morning light falls on the wooden textures. <d>[Arabic] شنو هذا الطرد؟</d>';
    const old = planner.replace(/\s*\(?[^()<]{0,80}\)?\s*<d>[\s\S]*?<\/d>\.?/g, ' ').replace(/\s{2,}/g, ' ').trim();
    expect(old).toMatch(/^Left: tall man sl?u?$/); // the DB prompt read "Left: tall man s (34-year-old woman, …"
    expect(old).not.toContain('hand on parcel');
    expect(stripDialogueTags(planner)).toBe('Left: tall man slumps on counter, hand on parcel. Warm morning light falls on the wooden textures.');
    // with the old speaker descriptor in front of the tag, only the descriptor goes with it
    expect(stripDialogueTags('Warm morning light. (34-year-old woman, Petite) <d>[Arabic] شنو هذا؟</d>')).toBe('Warm morning light.');
  });
  it('removes only the tag and the speaker label right before it', () => {
    expect(stripDialogueTags('She looks up. Amina: <d>[Arabic] تعال</d> He nods.')).toBe('She looks up. He nods.');
    expect(stripDialogueTags('The old man turns and says, <d>[English] Not today.</d> Rain on the glass.')).toBe('The old man turns and Rain on the glass.');
    expect(stripDialogueTags('<Subject 1> (S1) says, <d>[English] Hi.</d> She waves.')).toBe('She waves.');
    expect(stripDialogueTags('Two lines: <d>[English] One.</d> <d>[English] Two.</d>')).toBe('Two lines:');
    expect(stripDialogueTags('A stray <d> tag and a closing </d>')).not.toMatch(/<\/?d>/);
    expect(stripDialogueTags('No dialogue here (a quiet moment).')).toBe('No dialogue here (a quiet moment).');
  });
  it('takePrompt keeps the planner’s picture direction and appends the exact script line', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's12' ? { ...s, prompt: 'Behind the counter she slides the box over, eyes on the door. (45-year-old woman, medium build) <d>[English] We close soon.</d>' } : s)) });
    const sh = shotOf(state.productions.find((x) => x.id === p.id)!, 's12');
    const cast = state.characters.filter((c) => p.castIds.includes(c.id));
    const prompt = takePrompt(p, sh, cast, state.locations.find((l) => l.id === 'loc-pharmacy'), { timeOfDay: 'DUSK' });
    expect(prompt).toContain('Behind the counter she slides the box over, eyes on the door.');
    expect(prompt).not.toContain('We close soon');
    expect(prompt).toContain('<d>[English] We close in ten minutes.</d>');
  });
});

describe('h3ReferencePrompt (P1 grammar)', () => {
  const setup = () => {
    const { state, p } = fixture();
    const cast = state.characters.filter((c) => p.castIds.includes(c.id));
    const loc = state.locations.find((l) => l.id === 'loc-pharmacy')!;
    return { state, p, cast, loc };
  };
  const cutBinding: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: '', picture: 1 }], location: { picture: 2 }, opening: { kind: 'FRAME', picture: 3 } };

  it('always says the camera, also over the planner’s own prompt; a static shot is a locked-off frame that never changes (Tea 1.2 pushed in)', () => {
    const { p, cast, loc } = setup();
    const base = shotOf(p, 's12');
    const [a, b] = base.characterIds;
    const binding: H3Binding = { ...cutBinding, subjects: [{ characterId: a, picture: 1 }, { characterId: b, picture: 2 }], location: { picture: 3 }, opening: { kind: 'FRAME', picture: 4 } };
    const planned = { ...base, framing: 'TWO_SHOT' as const, cameraMove: 'STATIC' as const, prompt: 'A medium two-shot of the pharmacist and the customer at the counter.' };
    const prompt = h3ReferencePrompt(p, planned, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CUT' });
    const detailed = prompt.slice(prompt.indexOf('detailed_description:'));
    expect(detailed).toContain('Camera: two shot, locked off on a tripod: no zoom, no push-in');
    expect(prompt.slice(prompt.indexOf('summary:'), prompt.indexOf('retention_analysis:'))).toContain('The camera is locked off: the framing never changes.');
    expect(prompt).not.toMatch(/camera lingers/);
    const moving = h3ReferencePrompt(p, { ...planned, cameraMove: 'PUSH_IN' as const }, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CUT' });
    expect(moving).toContain('Camera: two shot, push in: one smooth, steady move');
    expect(moving).not.toContain('locked off');
    expect(takePrompt(p, planned, cast, loc, { timeOfDay: 'DUSK' })).toContain('locked off on a tripod');
  });

  it('from a frame, the people are not placed again in words (The Relief 1.4: "is center" over a frame with her on the right: a cut at 0.46 s)', () => {
    const { p, cast, loc } = setup();
    const base = shotOf(p, 's12');
    const [a] = base.characterIds;
    const sh = { ...base, characterIds: [a], framing: 'MEDIUM_CLOSE_UP' as const, cameraMove: 'STATIC' as const, continuity: { ...base.continuity!, characters: [{ characterId: a, position: 'CENTER', screenDirection: 'LEFT' as const, startPose: 'standing still', holding: ['brass thermos'], emotion: 'weary' }] } };
    const noFrame: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: a, picture: 1 }], location: { picture: 2 } };
    const free = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, noFrame, { relation: 'CUT' });
    expect(free).toMatch(/standing still, is CENTER, faces screen left/);
    const framed = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, { ...noFrame, opening: { kind: 'FRAME', picture: 3 } }, { relation: 'CUT' });
    expect(framed).not.toMatch(/is CENTER|faces screen left|standing still/);
    expect(framed).toMatch(/holds brass thermos, with a weary expression/);
  });
  it('from a drawn frame, the frame is the setting: the planner\'s scene prose is left out, the background is kept (The Relief 1.4)', () => {
    const { p, cast, loc } = setup();
    const base = shotOf(p, 's12');
    const [a] = base.characterIds;
    const sh = { ...base, characterIds: [a], framing: 'MEDIUM_CLOSE_UP' as const, action: 'She nods and gestures toward the door.', prompt: 'Close-up on her, the door behind her, rain on the windows.' };
    const noFrame: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: a, picture: 1 }], location: { picture: 2 } };
    expect(h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, noFrame, { relation: 'CUT' })).toContain('the door behind her');
    const framed = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, { ...noFrame, opening: { kind: 'FRAME', picture: 3 } }, { relation: 'CUT' });
    expect(framed).not.toContain('the door behind her');
    expect(framed).toContain("<Picture 3>'s framing, positions, background and light");
  });
  it('a close shot without an opening frame starts at its framing: the plate gives the look, not the framing (G13 shot 1 opened wide and pushed in)', () => {
    const { p, cast, loc } = setup();
    const base = shotOf(p, 's12');
    const [a] = base.characterIds;
    const noFrame: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: a, picture: 1 }], location: { picture: 2 } };
    const mcu = { ...base, characterIds: [a], framing: 'MEDIUM_CLOSE_UP' as const, cameraMove: 'STATIC' as const };
    expect(h3ReferencePrompt(p, mcu, cast, loc, { timeOfDay: 'DUSK' }, noFrame, { relation: 'STORY_TRANSITION' })).toContain('From its very first frame the shot is a medium close up: the camera is much closer than in <Picture 2>');
    expect(h3ReferencePrompt(p, { ...mcu, framing: 'WIDE' as const }, cast, loc, { timeOfDay: 'DUSK' }, noFrame, { relation: 'STORY_TRANSITION' })).not.toContain('From its very first frame');
    expect(h3ReferencePrompt(p, mcu, cast, loc, { timeOfDay: 'DUSK' }, { ...noFrame, opening: { kind: 'FRAME', picture: 3 } }, { relation: 'CUT' })).not.toContain('From its very first frame');
  });

  it('binds each canonical picture to its subject, the plate to the place, the opening frame as a frame — in the six sections, in order', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's12');
    const [a, b] = sh.characterIds;
    const binding: H3Binding = { ...cutBinding, subjects: [{ characterId: a, picture: 1 }, { characterId: b, picture: 2 }], location: { picture: 3 }, opening: { kind: 'FRAME', picture: 4 } };
    const prompt = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CUT' });
    const sections = ['subject_definitions:', 'summary:', 'retention_analysis:', 'detailed_description:', 'overall_soundscape:', 'non_diegetic_music:'];
    const at = sections.map((s) => prompt.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(prompt).toMatch(/<Subject 1> is the [^\n]+ in <Picture 1>, featuring /);
    expect(prompt).toMatch(/<Subject 2> is the [^\n]+ in <Picture 2>/);
    expect(prompt).toMatch(/<Subject 3> is the interior environment in <Picture 3>, featuring a small pharmacy/);
    expect(prompt).toContain('<Picture 4> is the first frame of [Shot 1]');
    expect(prompt).toContain('[keyframe completion + reference generation]');
    expect(prompt).toContain('<Subject 1> (appears in [Shot 1]): fully_preserved - the face, hair, skin tone, build and wardrobe of <Picture 1> are kept exactly.');
    expect(prompt).toContain('<Subject 3> (appears in [Shot 1]): partially_preserved');
    expect(prompt).toContain('<Picture 4> ([Shot 1] first frame): fully_preserved');
    expect(prompt).toContain('<Subject 1> (S1) says, <d>[English] We close in ten minutes.</d>');
    expect(prompt).toContain('a new camera angle on the same moment');
    expect(prompt).toMatch(/non_diegetic_music:\nN\/A$/);
    // described, never named
    for (const c of cast) expect(prompt).not.toContain(c.name);
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: 4, audios: 0, lines: ['We close in ten minutes.'], names: cast.map((c) => c.name) })).toMatchObject({ ok: true });
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: 4, audios: 0, lines: ['We close in ten minutes.'], names: cast.map((c) => c.name) }).checks.every((c) => c.ok)).toBe(true);
  });

  it('acceptance 2026-10-05: each line is tagged in its own script', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's12');
    const [a, b] = sh.characterIds;
    const binding: H3Binding = { ...cutBinding, subjects: [{ characterId: a, picture: 1 }, { characterId: b, picture: 2 }], location: { picture: 3 }, opening: { kind: 'FRAME', picture: 4 } };
    // an Iraqi line written in Arabic inside an English production
    const iraqi = { ...sh, dialogue: [{ ...sh.dialogue[0], text: 'هلا بيج عيني، هذا أطيب چاي ببغداد.' }] };
    const prompt = h3ReferencePrompt({ ...p, language: 'EN' }, iraqi, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CUT' });
    expect(prompt).toContain('<d>[Arabic] هلا بيج عيني، هذا أطيب چاي ببغداد.</d>');
    expect(prompt).not.toContain('[English] هلا');
  });

  it('lineLanguageTag: the script of the line, else the production language', () => {
    expect(lineLanguageTag('Excuse me, is this the famous tea?', 'AR')).toBe('English');
    expect(lineLanguageTag('تفضلي اگعدي.', 'EN')).toBe('Arabic');
    expect(lineLanguageTag('شغّل الـ wifi', 'AR')).toBe('Arabic');
    expect(lineLanguageTag('شغّل الـ wifi', 'EN')).toBe('English');
    expect(lineLanguageTag('...', 'AR')).toBe('Arabic');
  });

  it('the boundary in words: a cut without an opening frame is a new camera on the same moment; a transition opens a new scene with the story state, names bound to subjects', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's13');
    const [a] = sh.characterIds;
    const noFrame: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: a, picture: 1 }], location: { picture: 2 } };
    const cut = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, noFrame, { relation: 'CUT' });
    expect(cut).toContain('It is a new camera setup on the same moment as the previous shot: the same people, the same place, the same story state; only the camera changes.');
    expect(cut).toContain('[reference generation]');
    const who = cast.find((c) => c.id === a)!;
    const tr = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'NIGHT', entryState: `${who.name} waits outside with the box; the street is empty` }, noFrame, { relation: 'STORY_TRANSITION' });
    expect(tr).toContain('It opens a new scene in <Subject 2> at night; nothing continues from the previous shot. <Subject 1> waits outside with the box; the street is empty.');
    expect(tr).not.toContain(who.name);
    expect(lintH3Prompt(tr, { labels: 'LOCAL', pictures: 2, audios: 0, lines: [], names: cast.map((c) => c.name) }).checks.every((c) => c.ok)).toBe(true);
    // with a drawn opening frame the transition still says it opens a new scene
    const framed = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'NIGHT', entryState: 'The shop is dark.' }, { ...noFrame, opening: { kind: 'FRAME', picture: 3 } }, { relation: 'STORY_TRANSITION' });
    expect(framed).toContain('It begins from <Picture 3>, the opening of a new scene. The shop is dark.');
    // a name with no bound subject is described, never written
    const unbound = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'NIGHT', entryState: `${cast[1].name} is gone.` }, noFrame, { relation: 'STORY_TRANSITION' });
    expect(unbound).not.toContain(cast[1].name);
    expect(unbound).toMatch(/the \d+-year-old (woman|man), [^.]+ is gone\./);
  });

  it('the staging in the grammar: timed [M:SS] beats, an in-take [Shot 2] hard cut (local only), the pace, a described character, a group of extras, a point of view; retention per shot; lint passes', () => {
    const { p, cast: pictured, loc, state } = setup();
    const base = shotOf(p, 's12');
    const [a, b] = base.characterIds;
    const third = state.characters.find((c) => !base.characterIds.includes(c.id))!;
    const cast = [...pictured, third];
    const sh = { ...base, characterIds: [a, b, third.id], dialogue: [], action: `${cast.find((c) => c.id === a)!.name} sets the box down; the shoppers turn.`, staging: { pace: 'MONTAGE' as const, pov: b, extras: [{ description: 'four tired shoppers in winter coats', count: 4 }], beats: [{ at: 0, action: 'She sets the box on the counter.' }, { at: 2.5, action: `${third.name} says nothing and watches from the door.` }, { at: 4, action: 'Her hands close the lid.', cut: { camera: 'a close-up on her hands' } }, { at: 5.5, action: 'The lid clicks shut.' }] } };
    const binding: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: a, picture: 1 }, { characterId: b, picture: 2 }], location: { picture: 3 }, described: [{ characterId: third.id }] };
    const prompt = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CUT', locations: state.locations });
    // the pictured subjects, the place, then the described character and the extras — all defined
    expect(prompt).toMatch(/<Subject 4> is the [^\n]+; no reference picture: render them from this description alone/);
    expect(prompt).toContain('<Subject 5> is the group of 4 four tired shoppers in winter coats; each one a separate individual with their own face, hair and clothes, none of them sharing the face, hair or clothes of <Subject 1> or <Subject 2>; no reference picture.');
    // retention per shot of the take; the POV subject is never seen; described and extras are weak references
    expect(prompt).toContain('<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved');
    expect(prompt).toContain('<Subject 2> (appears in [Shot 1], [Shot 2]): weak_reference - the camera is their own eyes');
    expect(prompt).toContain('<Subject 4> (appears in [Shot 1], [Shot 2]): weak_reference - described, no picture');
    expect(prompt).toContain('<Subject 5> (appears in [Shot 1], [Shot 2]): weak_reference - distinct extras');
    // the summary: the people on screen (not the POV), the pace, the hard-cut clause; names bound to subjects
    expect(prompt).toContain('The target video shows <Subject 1> and <Subject 4> in <Subject 3>: <Subject 1> sets the box down; the shoppers turn.');
    expect(prompt).toContain('A run of distinct actions, each one complete before the next. The take holds 2 shots; every shot change is a hard cut: no dissolve, no fade, no on-screen text.');
    // the beats: marks, then the cut, then marks; speech scrubbed from the silent shot; names bound
    expect(prompt).toContain("The camera is <Subject 2>'s own eyes: what they see fills the frame, and they are never seen.");
    expect(prompt).toContain('[0:00] She sets the box on the counter. [0:02] <Subject 4> stays silent nothing and watches from the door. [Shot 2] At 00:04.000, hard cut to a close-up on her hands in <Subject 3>. Her hands close the lid. [0:05] The lid clicks shut.');
    expect(prompt).toContain('Nobody speaks in this shot; mouths stay closed.');
    for (const c of cast) expect(prompt).not.toContain(c.name);
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: 3, audios: 0, lines: [], names: cast.map((c) => c.name) }).checks.every((c) => c.ok)).toBe(true);
    // the hosted request keeps the beats as marks: no in-take shot, one [Shot 1]
    const hosted = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, { ...binding, labels: 'HOSTED' }, { relation: 'CUT', locations: state.locations });
    expect(hosted).not.toContain('[Shot 2]');
    expect(hosted).toContain('[0:04] Her hands close the lid.');
    expect(hosted).toContain('(appears in [Shot 1]): fully_preserved');
    // a cut to another place names it
    const away = h3ReferencePrompt(p, { ...sh, staging: { beats: [{ at: 0, action: 'She waits.' }, { at: 3, action: 'He steps out.', cut: { camera: 'a wide shot', locationId: 'loc-street' } }] } }, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CUT', locations: state.locations });
    expect(away).toContain('[Shot 2] At 00:03.000, hard cut to a wide shot in a small pharmacy with a white counter and wooden shelves. He steps out.');
  });

  it('a described speaker gets its subject and speaker id; a speaking shot is never scrubbed', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's12');
    const [a, b] = sh.characterIds;
    const prompt = h3ReferencePrompt(p, { ...sh, staging: { beats: [{ at: 0, action: 'She says the words slowly.' }] } }, cast, loc, { timeOfDay: 'DUSK' }, { labels: 'LOCAL', subjects: [{ characterId: b, picture: 1 }], location: { picture: 2 }, described: [{ characterId: a }] }, { relation: 'CUT' });
    expect(prompt).toContain('<Subject 3> (S1) says, <d>[English] We close in ten minutes.</d>');
    expect(prompt).toContain('[0:00] She says the words slowly.');
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: 2, audios: 0, lines: ['We close in ten minutes.'], names: cast.map((c) => c.name) }).checks.every((c) => c.ok)).toBe(true);
  });

  it('a continuation says it continues the anchored tail and still binds the references; no opening picture', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's12');
    const binding: H3Binding = { labels: 'LOCAL', subjects: sh.characterIds.map((characterId, i) => ({ characterId, picture: i + 1 })), location: { picture: 3 }, opening: { kind: 'TAIL', seconds: 22 / 24 } };
    const prompt = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CONTINUATION' });
    expect(prompt).toContain('It continues the previous shot without a cut: the first 0.9 seconds are the end of the previous shot');
    expect(prompt).toContain('The shot continues from the anchored end of the previous shot');
    expect(prompt).not.toContain('<Picture 4>');
    expect(prompt).toContain('[keyframe completion + reference generation]');
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: 3, audios: 0, lines: ['We close in ten minutes.'] }).ok).toBe(true);
  });

  it('a story transition with references only: [reference generation]; voice timbre clips are bound to their speaker', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's12');
    const [a] = sh.characterIds;
    const binding: H3Binding = { labels: 'LOCAL', subjects: [{ characterId: a, picture: 1 }], location: { picture: 2 }, audioRefs: [{ characterId: a }] };
    const prompt = h3ReferencePrompt(p, { ...sh, characterIds: [a] }, cast, loc, undefined, binding, { relation: 'STORY_TRANSITION' });
    expect(prompt).toContain('[reference generation + audio reference]');
    expect(prompt).toContain('<Audio 1> is the voice-timbre reference for <Subject 1> (S1).');
    expect(prompt).toContain('<Audio 1>: reference - guides the voice timbre of <Subject 1> (S1)');
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: 2, audios: 1, lines: ['We close in ten minutes.'] }).ok).toBe(true);
  });

  it('a shot without lines says nobody speaks (a continuation of a speaking tail otherwise invents words — C1)', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's13');
    const prompt = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, { labels: 'LOCAL', subjects: [{ characterId: sh.characterIds[0], picture: 1 }], location: { picture: 2 }, opening: { kind: 'TAIL', seconds: 22 / 24 } }, { relation: 'CONTINUATION' });
    expect(prompt).toContain('Nobody speaks in this shot; mouths stay closed.');
    expect(prompt).toMatch(/overall_soundscape:\nIndoor ambience of the place at dusk; no dialogue and no voices\./);
    expect(prompt).not.toContain('<d>');
  });

  it('hosted labels are “Image i” (frame roles never mixed with references, so no opening picture)', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's13');
    const prompt = h3ReferencePrompt(p, sh, cast, loc, undefined, { labels: 'HOSTED', subjects: [{ characterId: sh.characterIds[0], picture: 1 }], location: { picture: 2 } }, { relation: 'CUT' });
    expect(prompt).toContain('<Subject 1> is the');
    expect(prompt).toContain(' in Image 1');
    expect(prompt).not.toContain('<Picture');
    expect(lintH3Prompt(prompt, { labels: 'HOSTED', pictures: 2, audios: 0, lines: [] }).ok).toBe(true);
  });

  it('a producer’s own body is kept (with its own tags) inside the bindings', () => {
    const { p, cast, loc } = setup();
    const sh = shotOf(p, 's13');
    const prompt = h3ReferencePrompt(p, sh, cast, loc, undefined, { labels: 'LOCAL', subjects: [{ characterId: sh.characterIds[0], picture: 1 }], location: { picture: 2 } }, { relation: 'CUT', body: 'She laughs. <d>[English] Fine!</d>', includeDialogue: false });
    expect(prompt).toContain('She laughs. <d>[English] Fine!</d>');
    expect((prompt.match(/<d>/g) ?? []).length).toBe(1);
  });
});

describe('lintH3Prompt', () => {
  const ok = 'subject_definitions:\n<Subject 1> is the woman in <Picture 1>.\n<Subject 2> is the interior environment in <Picture 2>.\nsummary:\n[reference generation] x\ndetailed_description:\n<Subject 1> (S1) says, <d>[English] Hello there.</d>';
  it('passes a well-formed prompt', () => { expect(lintH3Prompt(ok, { labels: 'LOCAL', pictures: 2, audios: 0, lines: ['Hello there'] }).ok).toBe(true); });
  it('refuses a tag naming a picture that is not connected, and a connected picture never named', () => {
    const r = lintH3Prompt(ok.replace('<Picture 2>', '<Picture 3>'), { labels: 'LOCAL', pictures: 2, audios: 0, lines: [] });
    expect(r.ok).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.rule).sort()).toEqual(['every-picture-named', 'picture-tags-connected']);
  });
  it('refuses a missing, a repeated or a paraphrased script line', () => {
    expect(lintH3Prompt(ok, { labels: 'LOCAL', pictures: 2, audios: 0, lines: ['Hello there', 'Goodbye'] }).checks.find((c) => c.rule === 'script-lines-verbatim-once')!.ok).toBe(false);
    expect(lintH3Prompt(`${ok} <d>[English] Hello there.</d>`, { labels: 'LOCAL', pictures: 2, audios: 0, lines: ['Hello there'] }).ok).toBe(false);
    expect(lintH3Prompt(`${ok} <d>[English] Hello there.</d>`, { labels: 'LOCAL', pictures: 2, audios: 0, lines: ['Hello there', 'Hello there.'] }).ok).toBe(true);
    expect(lintH3Prompt(ok.replace('Hello there.', 'Hi there.'), { labels: 'LOCAL', pictures: 2, audios: 0, lines: ['Hello there'] }).ok).toBe(false);
  });
  it('refuses an undefined subject and unbalanced tags; a name in the prompt is a soft finding; the hosted limit is 7000', () => {
    expect(lintH3Prompt(`${ok} <Subject 3> waves.`, { labels: 'LOCAL', pictures: 2, audios: 0, lines: [] }).checks.find((c) => c.rule === 'subjects-defined')!.ok).toBe(false);
    expect(lintH3Prompt(`${ok} <d>open`, { labels: 'LOCAL', pictures: 2, audios: 0, lines: [] }).ok).toBe(false);
    const named = lintH3Prompt(`${ok} Layla smiles.`, { labels: 'LOCAL', pictures: 2, audios: 0, lines: [], names: ['Layla'] });
    expect(named.ok).toBe(true);
    expect(named.checks.find((c) => c.rule === 'no-names')).toMatchObject({ ok: false, hard: false });
    const hosted = 'subject_definitions:\n<Subject 1> is the woman in Image 1.\n' + 'x'.repeat(7100);
    expect(lintH3Prompt(hosted, { labels: 'HOSTED', pictures: 1, audios: 0, lines: [] }).checks.find((c) => c.rule === 'hosted-length')!.ok).toBe(false);
  });
});
