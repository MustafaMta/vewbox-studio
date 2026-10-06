import { describe, expect, it } from 'vitest';
import type { Asset, Production, ShotRelation, Take } from '@/domain/types';
import { anchoredLineStarts, auditTimeline, buildAudioTimeline, JOIN_SPEECH, REPLACED_SPEECH_PAD_SAMPLES, ROOM_BED, ROOM_TONE, roomToneStretch, SAMPLES_PER_FRAME, songWindowFrames, windowEndSourceFrame, type AudioCue } from '@/domain/timeline';
import { buildMixPlan, buildTimeline, CUT_RATE } from '@/server/media/assembly';
import { gainExpression, mixPlanOf, trackFilter } from '@/server/media/mix';
import { DEFAULT_AUDIO_POLICY } from '@/domain/world';

/** THE PRODUCTION AUDIO TIMELINE (src/domain/timeline.ts) and the mix plan made from it: the cut's clock (the song in
 *  a music video, each shot's own sound in a film), the picture conformed to it, the dialogue policy (the take's
 *  speech or the character's recorded line), the song once (master or stems, never both), beds ducked under voices,
 *  the continuation cross-fade, and the audit that refuses a source, a song or a voice twice. */

const F = SAMPLES_PER_FRAME;
const media = (id: string, o: { kind?: 'VIDEO' | 'AUDIO'; hasAudio?: boolean; seconds?: number } = {}): Asset => ({ id, kind: o.kind ?? 'VIDEO', src: `/x/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', durationSeconds: o.seconds ?? 5, provenance: { path: `x/${id}`, probe: { hasAudio: o.hasAudio ?? true } }, createdAt: 'x' } as Asset);

interface ShotSpec { seconds: number; planned?: number; trim?: number; intended?: number; hasAudio?: boolean; relation?: ShotRelation; songWindow?: { from: number; to: number }; lines?: Array<{ id: string; audio: string; seconds: number; from?: number; to?: number }>; speechOk?: boolean; sungAlong?: boolean }
function production(kind: 'SHORT' | 'MUSIC_VIDEO', specs: ShotSpec[], song?: { seconds: number; stems?: { vocals?: string; instrumental?: string } }): { p: Production; assets: Asset[] } {
  const assets: Asset[] = [];
  const shots = specs.map((s, i) => {
    assets.push(media(`vid-${i}`, { hasAudio: s.hasAudio ?? true, seconds: s.seconds }));
    for (const l of s.lines ?? []) assets.push(media(l.audio, { kind: 'AUDIO', seconds: l.seconds }));
    const take: Take = { id: `take-${i}`, label: 'Take 1', assetId: `vid-${i}`, createdAt: 'x', status: 'READY', provider: 'MINIMAX', durationSeconds: s.seconds, trimStartFrames: s.trim, relation: s.relation, params: s.intended ? { timeline: { newFrames: s.intended } } : undefined, qa: { ok: true, checks: s.lines?.length ? [{ name: 'script-spoken', ok: s.speechOk ?? true }] : [{ name: 'decodable', ok: true }] }, soundtrack: s.sungAlong ? { kind: 'SONG', assetId: 'song', lines: [] } : s.lines?.some((l) => l.from !== undefined) ? { kind: 'DIALOGUE', lines: s.lines.filter((l) => l.from !== undefined).map((l) => ({ lineId: l.id, from: l.from!, to: l.to! })) } : undefined };
    return { id: `shot-${i}`, sceneId: 's1', number: i + 1, purpose: '', action: '', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: s.planned ?? s.seconds, characterIds: [], dialogue: (s.lines ?? []).map((l) => ({ id: l.id, characterId: 'c', text: 'hi', audioAssetId: l.audio, durationSeconds: l.seconds })), transition: 'CUT', takes: [take], selectedTakeId: take.id, songWindow: s.songWindow };
  });
  if (song) { assets.push(media('song', { kind: 'AUDIO', seconds: song.seconds })); for (const id of Object.values(song.stems ?? {})) if (id) assets.push(media(id, { kind: 'AUDIO', seconds: song.seconds })); }
  const p = { id: 'p', kind, title: 'P', scenes: [{ id: 's1', number: 1, title: 'S', timeOfDay: 'DUSK', characterIds: [], beats: [] }], shots, song: song ? { id: 'song-rec', title: 'Song', source: 'GENERATED', assetId: 'song', durationSeconds: song.seconds, caption: '', sections: [], singerIds: [], stems: song.stems } : undefined } as unknown as Production;
  return { p, assets };
}

describe('the clock', () => {
  it('a film: each shot fills the frames its take was made for, the continuation head dropped, the rest of the take left out', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5 }, { seconds: 158 / 24, trim: 22, intended: 120, relation: 'CONTINUATION' }]);
    const tl = buildTimeline(p, assets);
    expect(tl.items.map((it) => [it.startFrame, it.frames, it.trimStartFrames, it.basis])).toEqual([[0, 120, 0, 'AVAILABLE'], [120, 120, 22, 'INTENDED']]);
    expect(tl.totalFrames).toBe(240);
    expect(tl.audio.clock).toBe('DIALOGUE');
    expect(tl.audio.notes.join(' ')).toMatch(/16 frame\(s\) past what the take was generated for are left out/);
  });

  it('a continuation whose head was kept (join HARD) is a hard cut on the clock: no cross-fade, the reason noted', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5 }, { seconds: 158 / 24, intended: 158, relation: 'CONTINUATION' }]);
    p.shots[1].takes[0].params = { timeline: { newFrames: 158 }, guide: { frames: 22, join: 'HARD', why: 'the model did not repeat the tail' } };
    const tl = buildAudioTimeline(p, assets);
    expect(tl.shots.map((s) => [s.sourceStartFrame, s.frames, s.join])).toEqual([[0, 120, undefined], [0, 158, 'HARD']]);
    expect(tl.notes.join(' ')).toMatch(/joined by a hard cut \(its head was kept: the model did not repeat the tail\)/);
    expect(tl.notes.join(' ')).not.toMatch(/cross-fades/);
    const b = tl.cues.find((c) => c.id === 'take-take-1')!;
    expect(b).toMatchObject({ startSample: 120 * F, sourceOffsetSamples: 0, fadeInSamples: 480 });
    // a trimmed continuation reads TRIM and cross-fades
    const { p: q, assets: qa } = production('SHORT', [{ seconds: 5 }, { seconds: 158 / 24, trim: 22, intended: 120, relation: 'CONTINUATION' }]);
    const tq = buildAudioTimeline(q, qa);
    expect(tq.shots[1].join).toBe('TRIM');
    expect(tq.notes.join(' ')).toMatch(/cross-fades over 3 frames/);
  });

  it('never cuts into a line the take was heard to speak', () => {
    const { p, assets } = production('SHORT', [{ seconds: 158 / 24, trim: 22, intended: 120, lines: [{ id: 'l1', audio: 'rec-1', seconds: 1.5, from: 4.6, to: 6.0 }] }]);
    const tl = buildTimeline(p, assets);
    expect(tl.items[0].frames).toBe(Math.ceil((6.0 - 22 / 24 + 0.3) * 24)); // 130, past the intended 120
  });

  it('a music video: the song is the clock — windows tile the song, a short take holds, a gap is run over, alignment moves frames not the clock', () => {
    const { p, assets } = production('MUSIC_VIDEO', [{ seconds: 8.5, planned: 8 }, { seconds: 7, songWindow: { from: 8, to: 16 } }, { seconds: 8, trim: 22, songWindow: { from: 20, to: 28 } }], { seconds: 30 });
    const tl = buildAudioTimeline(p, assets);
    expect(tl.clock).toBe('SONG');
    expect(tl.shots.map((s) => [s.startFrame, s.frames, s.holdFrames, s.basis])).toEqual([[0, 192, 0, 'SONG'], [192, 288, 120, 'SONG'], [480, 192, 22, 'SONG']]);
    expect(tl.notes.join(' ')).toMatch(/16\.00–20\.00 s has no shot: shot shot-1 runs on over it/);
    expect(tl.totalFrames).toBe(672);
    // every take's own sound is muted; the master plays once from the first window, fading as the cut ends early
    expect(tl.cues.filter((c) => c.kind === 'GENERATED_VIDEO_AUDIO').every((c) => c.muted && c.gain === 0)).toBe(true);
    const master = tl.cues.filter((c) => c.kind === 'MASTER_MUSIC');
    expect(master).toHaveLength(1);
    expect(master[0]).toMatchObject({ startSample: 0, sourceOffsetSamples: 0, durationSamples: 672 * F, gain: 1, fadeOutSamples: 24000 });
    const aligned = buildAudioTimeline(p, assets, { extraTrim: { 'shot-0': 5 } });
    expect(aligned.shots[0]).toMatchObject({ startFrame: 0, frames: 192, sourceStartFrame: 5 });
    expect(aligned.totalFrames).toBe(672);
    // the take is generated for its window, and the cut and the take read the same window
    expect(songWindowFrames(p).windows.get('shot-1')).toEqual({ fromFrame: 192, toFrame: 480 });
  });

  it('a music video whose first window is not at 0 starts the song there', () => {
    const { p, assets } = production('MUSIC_VIDEO', [{ seconds: 8, songWindow: { from: 4, to: 12 } }], { seconds: 30 });
    const tl = buildAudioTimeline(p, assets);
    expect(tl.songOffsetFrames).toBe(96);
    expect(tl.cues.find((c) => c.kind === 'MASTER_MUSIC')).toMatchObject({ startSample: 0, sourceOffsetSamples: 96 * F, durationSamples: 192 * F });
  });

  it('the guide of the next shot is cut from where the window ends, not the take’s end', () => {
    const { p } = production('SHORT', [{ seconds: 158 / 24, trim: 22, intended: 120 }]);
    const sh = p.shots[0];
    expect(windowEndSourceFrame(p, sh, sh.takes[0], undefined)).toBe(142);
  });
});

describe('the dialogue policy', () => {
  const speaking = (speechOk: boolean, hasAudio = true) => production('SHORT', [{ seconds: 158 / 24, trim: 22, intended: 120, hasAudio, speechOk, lines: [{ id: 'l1', audio: 'rec-1', seconds: 1.5, from: 0.5 + 22 / 24, to: 2.0 + 22 / 24 }] }]);
  const head = 0.5 * CUT_RATE;

  it('AUTO: a take whose speech check failed plays the character’s recorded line where it speaks, its own sound muted under it', () => {
    const { p, assets } = speaking(false);
    const tl = buildAudioTimeline(p, assets);
    const line = tl.cues.find((c) => c.kind === 'DIALOGUE')!;
    expect(line).toMatchObject({ sourceAssetId: 'rec-1', startSample: head, durationSamples: 1.5 * CUT_RATE, voice: true, lineId: 'l1' });
    const take = tl.cues.find((c) => c.kind === 'GENERATED_VIDEO_AUDIO')!;
    expect(take.automation?.spans).toEqual([{ from: head - REPLACED_SPEECH_PAD_SAMPLES, to: head + 1.5 * CUT_RATE + REPLACED_SPEECH_PAD_SAMPLES, gain: 0 }]);
    expect(tl.problems).toEqual([]);
  });

  it('AUTO, audio-first: a take generated to the current recordings plays them where they were anchored (not where the transcriber heard them), its own re-voicing muted', () => {
    const { p, assets } = speaking(true);
    const t = p.shots[0].takes[0];
    // heard by the transcriber at 0.5 s after the head; anchored (the guide) at 0.9 s after it
    t.soundtrack = { kind: 'DIALOGUE', assetId: 'joined', lines: [{ lineId: 'l1', from: 0.5 + 22 / 24, to: 2.0 + 22 / 24, anchoredFrom: 0.9 + 22 / 24, audioAssetId: 'rec-1' }] };
    const tl = buildAudioTimeline(p, assets);
    const line = tl.cues.find((c) => c.kind === 'DIALOGUE')!;
    expect(line).toMatchObject({ sourceAssetId: 'rec-1', startSample: Math.round(0.9 * CUT_RATE), lineId: 'l1' });
    expect(line.policy).toMatch(/generated to it \(audio-first\)/);
    expect(tl.cues.find((c) => c.kind === 'GENERATED_VIDEO_AUDIO')!.automation?.spans).toHaveLength(1);
    expect(tl.problems).toEqual([]);
    // the line was recorded again since: the take was not made to it — its own speech stays (its check passed)
    t.soundtrack.lines[0].audioAssetId = 'rec-0';
    expect(buildAudioTimeline(p, assets).cues.some((c) => c.kind === 'DIALOGUE')).toBe(false);
    // MODEL_VOICE keeps the take's speech anyway
    t.soundtrack.lines[0].audioAssetId = 'rec-1';
    expect(buildAudioTimeline(p, assets, { policy: { ...DEFAULT_AUDIO_POLICY, dialogue: 'MODEL_VOICE' } }).cues.some((c) => c.kind === 'DIALOGUE')).toBe(false);
  });

  it('room tone: the longest stretch of the take without speech loops under each replaced span; without one the take is ducked, never silenced', () => {
    expect(roomToneStretch({ head: 0, takeSeconds: 6.58, speech: [{ from: 0.4, to: 4.87 }] })).toEqual({ from: 4.99, to: 6.53 });
    expect(roomToneStretch({ head: 22 / 24, takeSeconds: 6.58, speech: [{ from: 1.3, to: 6.5 }] })).toBeUndefined();
    const { p, assets } = speaking(false);
    const tl = buildAudioTimeline(p, assets);
    const room = tl.cues.find((c) => c.kind === 'AMBIENCE')!;
    expect(room).toMatchObject({ sourceAssetId: 'vid-0', loopSamples: expect.any(Number), voice: false, fadeInSamples: ROOM_TONE.rampSamples });
    const take = tl.cues.find((c) => c.kind === 'GENERATED_VIDEO_AUDIO')!;
    expect(room.startSample).toBe(take.startSample + take.automation!.spans[0].from - ROOM_TONE.rampSamples);
    expect(tl.problems).toEqual([]);
    // the whole take is speech: ducked −20 dB
    p.shots[0].takes[0].soundtrack!.lines[0] = { lineId: 'l1', from: 22 / 24, to: 158 / 24 };
    const ducked = buildAudioTimeline(p, assets);
    expect(ducked.cues.some((c) => c.kind === 'AMBIENCE')).toBe(false);
    expect(ducked.cues.find((c) => c.kind === 'GENERATED_VIDEO_AUDIO')!.automation!.spans[0].gain).toBe(ROOM_TONE.duckGain);
  });

  it('a take made before the anchor was recorded: read from its joined soundtrack’s line list with the join rule', () => {
    const { p, assets } = production('SHORT', [{ seconds: 8, lines: [{ id: 'l1', audio: 'rec-1', seconds: 1.5, from: 0.05, to: 1.6 }, { id: 'l2', audio: 'rec-2', seconds: 2, from: 2.0, to: 4.0 }] }]);
    const t = p.shots[0].takes[0];
    t.soundtrack = { ...t.soundtrack!, assetId: 'joined' };
    assets.push({ ...media('joined', { kind: 'AUDIO', seconds: 4.55 }), provenance: { path: 'x/joined', lineAssets: ['rec-1', 'rec-2'] } } as Asset);
    expect([...anchoredLineStarts(p.shots[0], t, (id) => assets.find((a) => a.id === id))!]).toEqual([['l1', JOIN_SPEECH.leadIn], ['l2', JOIN_SPEECH.leadIn + 1.5 + JOIN_SPEECH.gap]]);
    const lines = buildAudioTimeline(p, assets).cues.filter((c) => c.kind === 'DIALOGUE');
    expect(lines.map((c) => c.startSample)).toEqual([Math.round(0.4 * CUT_RATE), Math.round(2.25 * CUT_RATE)]);
    // a line whose recording is not in the joined track: not anchored
    p.shots[0].dialogue[1].audioAssetId = 'rec-3';
    assets.push(media('rec-3', { kind: 'AUDIO', seconds: 2 }));
    expect(anchoredLineStarts(p.shots[0], t, (id) => assets.find((a) => a.id === id))).toBeUndefined();
  });

  it('AUTO keeps a take whose speech passed; RECORDED_VOICE replaces it anyway; MODEL_VOICE never does', () => {
    const ok = speaking(true);
    expect(buildAudioTimeline(ok.p, ok.assets).cues.some((c) => c.kind === 'DIALOGUE')).toBe(false);
    expect(buildAudioTimeline(ok.p, ok.assets, { policy: { ...DEFAULT_AUDIO_POLICY, dialogue: 'RECORDED_VOICE' } }).cues.filter((c) => c.kind === 'DIALOGUE')).toHaveLength(1);
    const bad = speaking(false);
    expect(buildAudioTimeline(bad.p, bad.assets, { policy: { ...DEFAULT_AUDIO_POLICY, dialogue: 'MODEL_VOICE' } }).cues.some((c) => c.kind === 'DIALOGUE')).toBe(false);
  });

  it('a silent take always gets its recorded lines', () => {
    const { p, assets } = speaking(true, false);
    const tl = buildAudioTimeline(p, assets, { policy: { ...DEFAULT_AUDIO_POLICY, dialogue: 'MODEL_VOICE' } });
    expect(tl.cues.map((c) => c.kind)).toEqual(['DIALOGUE']);
    expect(tl.cues[0].policy).toMatch(/under a take without its own sound/);
  });
});

describe('songs and beds', () => {
  it('a song under a film is its instrumental stem (no vocals under speech), ducked under every voice', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5, lines: [{ id: 'l1', audio: 'rec-1', seconds: 1, from: 1, to: 2 }] }], { seconds: 30, stems: { vocals: 'voc', instrumental: 'inst' } });
    const tl = buildAudioTimeline(p, assets);
    const bed = tl.cues.find((c) => c.lineage === 'song:song')!;
    expect(bed).toMatchObject({ kind: 'MUSIC', sourceAssetId: 'inst', gain: 0.35, voice: false });
    expect(bed.automation?.spans[0]).toMatchObject({ from: 0, to: 120 * F });
    expect(bed.automation!.spans[0].gain).toBeCloseTo(0.12 / 0.35, 5);
    expect(tl.cues.some((c) => c.sourceAssetId === 'song' || c.sourceAssetId === 'voc')).toBe(false);
    expect(tl.problems).toEqual([]);
  });

  it('without a stem the master is the bed, its vocals ducked under speech so no two voices are heard at once', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5, lines: [{ id: 'l1', audio: 'rec-1', seconds: 1, from: 1, to: 2 }] }], { seconds: 30 });
    const tl = buildAudioTimeline(p, assets);
    expect(tl.cues.find((c) => c.lineage === 'song:song')).toMatchObject({ kind: 'MASTER_MUSIC', voice: true });
    expect(tl.problems).toEqual([]);
  });
});

describe('the continuation join', () => {
  it('the two takes’ sound cross-fades over 3 frames (equal power), B’s head sound used for it', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5 }, { seconds: 158 / 24, trim: 22, intended: 120, relation: 'CONTINUATION' }]);
    const tl = buildAudioTimeline(p, assets);
    const [a, b] = tl.cues.filter((c) => c.kind === 'GENERATED_VIDEO_AUDIO');
    expect(b).toMatchObject({ startSample: 117 * F, sourceOffsetSamples: 19 * F, durationSamples: 123 * F, fadeInSamples: 3 * F, fadeInCurve: 'qsin' });
    expect(a).toMatchObject({ startSample: 0, durationSamples: 120 * F, fadeOutSamples: 3 * F, fadeOutCurve: 'qsin' });
    expect(tl.problems).toEqual([]);
  });

  it('a hard join when a recorded line of the shot before runs to its end', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5, speechOk: false, lines: [{ id: 'l1', audio: 'rec-1', seconds: 2, from: 3.0, to: 4.99 }] }, { seconds: 158 / 24, trim: 22, intended: 120, relation: 'CONTINUATION' }]);
    const tl = buildAudioTimeline(p, assets);
    expect(tl.cues.find((c) => c.shotId === 'shot-1' && c.kind === 'GENERATED_VIDEO_AUDIO')).toMatchObject({ startSample: 120 * F, sourceOffsetSamples: 22 * F });
    expect(tl.notes.join(' ')).toMatch(/hard join/);
  });
});

describe('the audit: a source, a song or a voice never twice', () => {
  const cue = (over: Partial<AudioCue>): AudioCue => ({ id: Math.random().toString(36), kind: 'DIALOGUE', sourceAssetId: 'x', lineage: 'line:x', startSample: 0, durationSamples: 48000, sourceOffsetSamples: 0, gain: 1, fadeInSamples: 480, fadeOutSamples: 480, voice: true, policy: 't', ...over });
  it('refuses the same stretch of one file twice', () => {
    expect(auditTimeline({ cues: [cue({ sourceAssetId: 'a', lineage: 'take:a', voice: false }), cue({ sourceAssetId: 'a', lineage: 'take:a', voice: false, startSample: 1000 })] }).map((p) => p.kind)).toContain('ROUTED_TWICE');
  });
  it('refuses a song with its own vocal stem, and an unmuted take that sang along under the master; stems together are the song once', () => {
    expect(auditTimeline({ cues: [cue({ kind: 'MASTER_MUSIC', sourceAssetId: 'song', lineage: 'song:s' }), cue({ kind: 'LEAD_VOCAL', sourceAssetId: 'voc', lineage: 'song:s' })] }).map((p) => p.kind)).toContain('DUPLICATE_SONG');
    expect(auditTimeline({ cues: [cue({ kind: 'MASTER_MUSIC', sourceAssetId: 'song', lineage: 'song:s' }), cue({ kind: 'GENERATED_VIDEO_AUDIO', sourceAssetId: 'take', lineage: 'song:s' })] }).map((p) => p.kind)).toContain('DUPLICATE_SONG');
    expect(auditTimeline({ cues: [cue({ kind: 'MUSIC', sourceAssetId: 'inst', lineage: 'song:s', voice: false }), cue({ kind: 'LEAD_VOCAL', sourceAssetId: 'voc', lineage: 'song:s' })] })).toEqual([]);
  });
  it('refuses a recorded line over the take’s own speech unless the take is muted under it', () => {
    const take = cue({ kind: 'GENERATED_VIDEO_AUDIO', sourceAssetId: 'take', lineage: 'take:t', durationSamples: 240000 });
    const line = cue({ sourceAssetId: 'rec', lineage: 'line:l', startSample: 48000, durationSamples: 48000 });
    expect(auditTimeline({ cues: [take, line] }).map((p) => p.kind)).toEqual(['VOICE_OVERLAP']);
    expect(auditTimeline({ cues: [{ ...take, automation: { rampSamples: 960, spans: [{ from: 48000, to: 96000, gain: 0 }] } }, line] })).toEqual([]);
  });
  it('the mix plan refuses a timeline with a problem as AUDIO_DUPLICATION', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5 }]);
    const tl = buildAudioTimeline(p, assets);
    tl.problems = [{ kind: 'VOICE_OVERLAP', detail: 'two voices', cueIds: [] }];
    expect(() => mixPlanOf(p, tl)).toThrow(expect.objectContaining({ failureClass: 'AUDIO_DUPLICATION' }));
  });
});

describe('the mix plan and its filters', () => {
  it('one track per cue, a take’s own sound at unity with its head skipped, the film target −23 LUFS', () => {
    const { p, assets } = production('SHORT', [{ seconds: 5 }, { seconds: 158 / 24, trim: 22, intended: 120 }]);
    const plan = buildMixPlan(p, buildTimeline(p, assets));
    expect(plan.targetLufs).toBe(-23);
    expect(plan.tracks.filter((t) => t.kind !== 'AMBIENCE').map((t) => [t.kind, t.sourceAssetId, t.startSample, t.sourceOffsetSamples, t.gain])).toEqual([['GENERATED_VIDEO_AUDIO', 'vid-0', 0, 0, 1], ['GENERATED_VIDEO_AUDIO', 'vid-1', 120 * F, 22 * F, 1]]);
    // the place's room bed under the whole run of shots there, from the first take's room, −10 dB, looped
    const bed = plan.tracks.find((t) => t.kind === 'AMBIENCE')!;
    expect(bed).toMatchObject({ sourceAssetId: 'vid-0', startSample: 0, durationSamples: 240 * F, gain: ROOM_BED.gain, voice: false, loopSamples: expect.any(Number) });
    expect(plan.tracks.filter((t) => t.kind === 'AMBIENCE')).toHaveLength(1);
    const mv = production('MUSIC_VIDEO', [{ seconds: 5 }], { seconds: 30 });
    expect(buildMixPlan(mv.p, buildTimeline(mv.p, mv.assets)).targetLufs).toBe(-14);
  });

  it('a track’s filter cuts by sample, fades its edges, places it by sample; automation becomes a volume expression', () => {
    const f = trackFilter({ cueId: 'c', kind: 'DIALOGUE', sourceAssetId: 'a', lineage: 'line:a', sourceOffsetSamples: 100, startSample: 48000, durationSamples: 9600, gain: 0.5, policy: '', voice: true, fadeInSamples: 480, fadeOutSamples: 2000, fadeOutCurve: 'qsin', automation: { rampSamples: 960, spans: [{ from: 4800, to: 7200, gain: 0 }] } }, '[1:a]', '[t1]', 48000);
    expect(f).toMatch(/^\[1:a\]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start_sample=100:end_sample=9700,asetpts=PTS-STARTPTS,asetnsamples=n=240:p=0,volume=volume=max\(0\\,1-/);
    expect(f).toContain('volume=0.5000,afade=t=in:ss=0:ns=480:curve=tri,afade=t=out:ss=7600:ns=2000:curve=qsin,adelay=48000S:all=1[t1]');
    expect(gainExpression({ rampSamples: 960, spans: [{ from: 4800, to: 7200, gain: 0 }] }, 48000)).toBe('max(0\\,1-1*clip(min((t-0.08)/0.02\\,(0.17-t)/0.02)\\,0\\,1))');
  });
});
