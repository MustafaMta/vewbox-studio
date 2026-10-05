import type { Asset, LyricSection, Production, Shot, ShotRelation, Song, Take, WorldAudioPolicy } from './types';
import { StudioError } from './errors';
import { usableAudio } from './identity';
import { DEFAULT_AUDIO_POLICY } from './world';

/** TIME ON THE CUT — where each shot sits in the production's running order, and for a music video which part of
 *  the song (and which sung lines) a shot covers. Pure functions shared by planning, prompting and assembly.
 *  The second half is THE PRODUCTION AUDIO TIMELINE (docs/research/MINIMAX-CONTINUITY.md §5): the authoritative
 *  clock of the cut and every sound on it, as typed cues with a stable source, a sample-exact placement and the
 *  policy that set them — the cut's picture conforms to it, never the other way round. */

export interface Window { from: number; to: number }

/** Shots in cut order: scenes by number, shots by number within the scene. */
export function orderedShots(p: Production): Shot[] {
  const sceneOrder = new Map(p.scenes.map((sc) => [sc.id, sc.number]));
  return [...p.shots].sort((a, b) => (sceneOrder.get(a.sceneId) ?? 0) - (sceneOrder.get(b.sceneId) ?? 0) || a.number - b.number);
}

/** The planned window of every shot, from the sum of the planned durations before it. */
function plannedWindows(p: Production): Map<string, Window> {
  const out = new Map<string, Window>();
  let t = 0;
  for (const sh of orderedShots(p)) { const d = Math.max(0, sh.durationSeconds || 0); out.set(sh.id, { from: t, to: t + d }); t += d; }
  return out;
}

/** The window of every shot. A music video with a song: its window ON THE SONG (song time), as the audio timeline
 *  below tiles it — the producer's `songWindow` when set, else the plan's — so the take's anchored stretch, the sung
 *  lines in its prompt, the singing assignment and the cut all read the same window. Otherwise: the plan, back to
 *  back (the cut's own clock is the audio timeline). */
export function shotWindows(p: Production): Map<string, Window> {
  if (p.kind === 'MUSIC_VIDEO' && p.song) return new Map([...songWindowFrames(p).windows].map(([id, w]) => [id, { from: w.fromFrame / CLOCK_FPS, to: w.toFrame / CLOCK_FPS }]));
  return plannedWindows(p);
}

/** The song section that owns most of a window (ties go to the earlier section). */
export function sectionFor(song: Song, w: Window): LyricSection | undefined {
  let best: LyricSection | undefined; let bestOverlap = 0;
  for (const sec of song.sections) {
    const overlap = Math.min(sec.to, w.to) - Math.max(sec.from, w.from);
    if (overlap > bestOverlap) { best = sec; bestOverlap = overlap; }
  }
  return best ?? song.sections.find((s) => w.from < s.to && w.to > s.from);
}

export interface SungLine { singerId: string; text: string; textAr?: string; role?: 'LEAD' | 'BACKING' }

/** The lyric lines a shot's window covers, with their singers. Alternating sections carry their own per-line
 *  assignment; otherwise the section's lines are spread evenly over its duration and every assigned singer sings. */
export function sungLinesFor(song: Song, w: Window, language: 'EN' | 'AR'): SungLine[] {
  const sec = sectionFor(song, w);
  if (!sec || sec.performanceMode === 'INSTRUMENTAL' || sec.kind === 'INSTRUMENTAL') return [];
  const span = Math.max(0.001, sec.to - sec.from);
  if (sec.lines?.length) {
    const n = sec.lines.length;
    return sec.lines.map((l, i) => ({ ...l, from: l.from ?? sec.from + (span * i) / n, to: l.to ?? sec.from + (span * (i + 1)) / n }))
      .filter((l) => l.from < w.to && l.to > w.from)
      .map((l) => ({ singerId: l.singerId, text: l.text, ...(l.role ? { role: l.role } : {}) }));
  }
  const source = (language === 'AR' ? sec.textAr || sec.text : sec.text) || '';
  const lines = source.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0 || sec.singerIds.length === 0) return [];
  const n = lines.length;
  // real timing from the aligned vocal track when it exists, else an even spread over the section
  const timed = sec.lineTimes?.length === n ? sec.lineTimes : undefined;
  const picked = lines.map((text, i) => ({ text, from: timed ? timed[i].from : sec.from + (span * i) / n, to: timed ? timed[i].to : sec.from + (span * (i + 1)) / n })).filter((l) => l.from < w.to && l.to > w.from);
  const en = sec.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return picked.flatMap((l) => sec.singerIds.map((singerId) => ({ singerId, text: language === 'AR' ? (en[lines.indexOf(l.text)] ?? l.text) : l.text, textAr: language === 'AR' ? l.text : undefined })));
}

/** Who performs in a shot's window: the section's singers (and, for LISTENER sections, who listens). */
export function performanceFor(song: Song, w: Window): Shot['performance'] | undefined {
  const sec = sectionFor(song, w);
  if (!sec) return undefined;
  const mode = sec.performanceMode ?? (sec.kind === 'INSTRUMENTAL' || sec.singerIds.length === 0 ? 'INSTRUMENTAL' : sec.singerIds.length === 1 ? 'SOLO' : sec.singerIds.length === 2 ? 'DUET' : 'ENSEMBLE');
  return { mode, singerIds: mode === 'INSTRUMENTAL' ? [] : sec.singerIds, listenerIds: mode === 'LISTENER' ? song.singerIds.filter((id) => !sec.singerIds.includes(id)) : undefined };
}

// ================================================================================== THE PRODUCTION AUDIO TIMELINE

/** The clock: whole frames at 24 fps, whole samples at 48 kHz (2000 samples a frame). */
export const CLOCK_FPS = 24;
export const CLOCK_RATE = 48000;
export const SAMPLES_PER_FRAME = CLOCK_RATE / CLOCK_FPS;
/** every cue edge fades over 10 ms (no clicks at a join) */
export const EDGE_FADE_SAMPLES = 480;
/** a continuation join: the two takes' sound cross-fade (equal power) over this many frames; E3 decides the default */
export const JOIN_CROSSFADE_FRAMES = 3;
/** a song under dialogue: its level, and how far it ducks under a voice (with a 200 ms ramp) */
export const BED = { gain: 0.35, ducked: 0.12, rampSamples: 9600 } as const;
/** a cue at or below this effective gain is a bed, not a competing voice */
export const VOICE_AUDIBLE_GAIN = 0.2;

/** What a sound is. MASTER_MUSIC: a song's full mix (music and vocals). MUSIC: its instrumental stem. LEAD_VOCAL /
 *  BACKING_VOCAL: its vocal stems. GENERATED_VIDEO_AUDIO: a MiniMax take's own sound (speech, room, foley). */
export type AudioCueKind = 'DIALOGUE' | 'MASTER_MUSIC' | 'MUSIC' | 'LEAD_VOCAL' | 'BACKING_VOCAL' | 'AMBIENCE' | 'FOLEY' | 'SOUND_EFFECTS' | 'GENERATED_VIDEO_AUDIO';

/** One shot on the clock: where it sits (frames), which frames of its take fill it, and why it is that long.
 *  SONG: its window on the song (music video). INTENDED: the new content its take was generated for (the take
 *  records it). AVAILABLE: the whole take after its head (an uploaded or older take). `holdFrames` repeat the take's
 *  last frame when the take is shorter than its window (only a song window can ask for more than the take has). */
export interface ShotClock { shotId: string; sceneId: string; takeId: string; assetId: string; relation?: ShotRelation; /** a continuation: whether its guide head is dropped (TRIM) or kept as a hard cut (HARD) */ join?: GuideJoin; startFrame: number; frames: number; sourceStartFrame: number; availableFrames: number; holdFrames: number; basis: 'SONG' | 'INTENDED' | 'AVAILABLE' }

/** A gain change inside a cue (cue-relative samples): the cue plays at `gain` × its own gain inside [from, to), with a
 *  linear ramp of `rampSamples` outside the span (ducking a bed under a voice; muting a take's speech under the
 *  recorded line that replaces it). */
export interface GainSpan { from: number; to: number; gain: number }

export interface AudioCue {
  id: string;
  kind: AudioCueKind;
  sourceAssetId: string;
  /** what the sound IS, beyond the file: `song:<asset>` for a song's master, its stems and a take that sang along to
   *  it; `line:<id>` for a recorded line; `take:<id>` for a take's own sound; `ambience:<asset>` */
  lineage: string;
  startSample: number;
  durationSamples: number;
  sourceOffsetSamples: number;
  gain: number;
  muted?: boolean;
  fadeInSamples: number;
  fadeOutSamples: number;
  fadeInCurve?: 'tri' | 'qsin';
  fadeOutCurve?: 'tri' | 'qsin';
  automation?: { rampSamples: number; spans: GainSpan[] };
  /** the source repeats to fill the cue (an ambience bed) */
  loop?: boolean;
  /** it carries a voice (speech or singing) */
  voice: boolean;
  shotId?: string;
  lineId?: string;
  characterId?: string;
  /** why it is here at this level (shown in the Final Cut mix panel and kept in the cut's provenance) */
  policy: string;
}

/** STALE_JOIN: a continuation take whose predecessor's chosen take is not the one it continued (src/domain/continuation.ts) */
export type AudioProblemKind = 'DUPLICATE_SONG' | 'VOICE_OVERLAP' | 'ROUTED_TWICE' | 'STALE_JOIN';
export interface AudioProblem { kind: AudioProblemKind; detail: string; cueIds: string[] }

export interface AudioTimeline {
  version: 1;
  fps: number;
  rate: number;
  /** SONG: the song is the clock (music video); DIALOGUE: the shots' windows, each from its own sound */
  clock: 'SONG' | 'DIALOGUE';
  totalFrames: number;
  totalSamples: number;
  /** a music video: the song frame the cut starts at */
  songOffsetFrames: number;
  policy: WorldAudioPolicy;
  shots: ShotClock[];
  cues: AudioCue[];
  notes: string[];
  problems: AudioProblem[];
}

/** What a take was generated to cover (take.ts writes `params.timeline`): the new frames after its head. */
export function intendedFrames(t: Pick<Take, 'params'>): number | undefined {
  const v = (t.params as { timeline?: { newFrames?: unknown } } | undefined)?.timeline?.newFrames;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

/** How a continuation take joins the shot before it. TRIM: its guide head is dropped (the cut cross-fades the sound
 *  over the join and the join QA judges it); HARD: its head was kept because the model did not repeat the tail, or
 *  the guide was never anchored (over the frame budget) — a cut, measured but not judged (take.ts writes
 *  `params.guide.join`; src/server/media/guide-head.ts). */
export type GuideJoin = 'TRIM' | 'HARD';
export function guideJoinOf(t: Pick<Take, 'relation' | 'trimStartFrames' | 'params'>): GuideJoin | undefined {
  const join = (t.params as { guide?: { join?: unknown } } | undefined)?.guide?.join;
  if (join === 'HARD' || join === 'TRIM') return join;
  return t.relation === 'CONTINUATION' && (t.trimStartFrames ?? 0) > 0 ? 'TRIM' : undefined;
}

const probeHasAudio = (a: Asset | undefined) => Boolean((a?.provenance as { probe?: { hasAudio?: boolean } } | undefined)?.probe?.hasAudio);
const takeOf = (sh: Shot) => sh.takes.find((x) => x.id === sh.selectedTakeId);
const relationOf = (sh: Shot, t: Take | undefined): ShotRelation | undefined => t?.relation ?? sh.continuity?.relationToPrevious;

/** A music video's song windows in song frames, one per shot in cut order: the shot's own `songWindow` when the
 *  producer set one, else the plan's back-to-back window. They TILE the song: a gap is filled by the shot before it
 *  (it runs on), an overlap is taken from the later shot; the cut starts at the first window. */
export function songWindowFrames(p: Production): { windows: Map<string, { fromFrame: number; toFrame: number }>; notes: string[] } {
  const planned = plannedWindows(p);
  const notes: string[] = [];
  const out = new Map<string, { fromFrame: number; toFrame: number }>();
  let prev: { id: string; w: { fromFrame: number; toFrame: number } } | undefined;
  for (const sh of orderedShots(p)) {
    const raw = sh.songWindow && sh.songWindow.to > sh.songWindow.from ? sh.songWindow : planned.get(sh.id)!;
    let fromFrame = Math.max(0, Math.round(raw.from * CLOCK_FPS));
    const toFrame = Math.max(fromFrame + 1, Math.round(raw.to * CLOCK_FPS));
    if (prev) {
      if (fromFrame > prev.w.toFrame) { notes.push(`song ${(prev.w.toFrame / CLOCK_FPS).toFixed(2)}–${(fromFrame / CLOCK_FPS).toFixed(2)} s has no shot: shot ${prev.id} runs on over it`); prev.w.toFrame = fromFrame; }
      else if (fromFrame < prev.w.toFrame) { notes.push(`shot ${sh.id}'s window overlaps the one before it: it starts at ${(prev.w.toFrame / CLOCK_FPS).toFixed(2)} s`); fromFrame = prev.w.toFrame; }
    }
    const w = { fromFrame, toFrame: Math.max(fromFrame + 1, toFrame) };
    out.set(sh.id, w); prev = { id: sh.id, w };
  }
  return { windows: out, notes };
}

/** How many frames of a shot's take the cut shows (its window), before any hold: the song window in a music video;
 *  otherwise the frames its take was generated for — never cutting into a line the take was heard to speak — or,
 *  for a take that does not say, all of it after its head. `extraTrim`: head frames dropped by alignment. */
export function shotWindowFrames(p: Production, sh: Shot, t: Take, asset: Asset | undefined, opts: { extraTrim?: number; songWindows?: Map<string, { fromFrame: number; toFrame: number }> } = {}): { frames: number; available: number; sourceStart: number; basis: ShotClock['basis'] } {
  const sourceStart = Math.max(0, t.trimStartFrames ?? 0) + Math.max(0, opts.extraTrim ?? 0);
  const total = Math.round((t.durationSeconds ?? asset?.durationSeconds ?? sh.durationSeconds) * CLOCK_FPS);
  const available = Math.max(1, total - sourceStart);
  const songAsset = p.kind === 'MUSIC_VIDEO' && p.song?.assetId ? p.song.assetId : undefined;
  if (songAsset) {
    const w = (opts.songWindows ?? songWindowFrames(p).windows).get(sh.id);
    if (w) return { frames: w.toFrame - w.fromFrame, available, sourceStart, basis: 'SONG' };
  }
  const intended = intendedFrames(t);
  if (intended) {
    const head = sourceStart / CLOCK_FPS;
    const lastWord = t.soundtrack?.kind === 'DIALOGUE' && t.soundtrack.lines.length ? Math.max(...t.soundtrack.lines.map((l) => l.to)) : 0;
    const speech = lastWord > head ? Math.ceil((lastWord - head + 0.3) * CLOCK_FPS) : 0;
    return { frames: Math.min(available, Math.max(intended, speech)), available, sourceStart, basis: 'INTENDED' };
  }
  return { frames: available, available, sourceStart, basis: 'AVAILABLE' };
}

/** The source frame where a shot's window ends: what the audience sees last of it — a continuation's guide is cut
 *  from here, so the next shot continues exactly from the picture the cut shows. */
export function windowEndSourceFrame(p: Production, sh: Shot, t: Take, asset: Asset | undefined): number {
  const w = shotWindowFrames(p, sh, t, asset);
  return w.sourceStart + Math.min(w.frames, w.available);
}

const S = (frames: number) => frames * SAMPLES_PER_FRAME;
const secS = (seconds: number) => Math.round(seconds * CLOCK_RATE);

export interface AudioTimelineOptions {
  policy?: WorldAudioPolicy;
  /** head frames dropped per shot by sound-to-picture alignment (music video) */
  extraTrim?: Record<string, number>;
  /** an ambience bed per location (from the World Bible) */
  ambience?: Record<string, string>;
  /** a stale continuation join (the predecessor's choice changed since the take was made) is normally refused; the
   *  producer's override assembles it anyway, as a hard cut, with a note */
  allowStaleJoins?: boolean;
}

/** THE PRODUCTION AUDIO TIMELINE of a production whose shots all have a chosen take. Rules:
 *  1. The clock. A music video with a song: the song is the clock — every shot occupies exactly its song window,
 *     whatever its take's length (a short take holds its last frame, a long one is cut), so nothing drifts. A film:
 *     every shot occupies the frames its take was generated for (from its sound), back to back.
 *  2. One sound per source, typed: the take's own sound, recorded lines, the song (master OR its stems, never both),
 *     ambience beds; each cue is cut from its source by sample and placed at a sample.
 *  3. Dialogue policy (World Bible `audio.dialogue`): MODEL_VOICE keeps the take's speech; RECORDED_VOICE plays the
 *     character's recorded line at the place the take speaks it and mutes the take's sound under it; AUTO does that
 *     only where the take is silent or its speech check did not pass. A take with no sound always gets its lines.
 *  4. Songs. A music video: the master from its first window, the takes muted (MiniMax sang along to its stretch: a
 *     second copy of the song). A film: the song is a bed — its instrumental stem when one exists (no vocals under
 *     speech), else the master — ducked under every voice.
 *  5. Edges: 10 ms fades on every cue; a continuation join cross-fades the two takes' sound over 3 frames.
 *  6. Audit: no source routed twice, no song twice, no two voices at full level at once — `problems` lists any. */
export function buildAudioTimeline(p: Production, assets: Asset[], opts: AudioTimelineOptions = {}): AudioTimeline {
  const policy = opts.policy ?? DEFAULT_AUDIO_POLICY;
  const notes: string[] = [];
  const byId = (id?: string) => (id ? assets.find((a) => a.id === id) : undefined);
  const ordered = orderedShots(p);
  if (!ordered.length) throw new StudioError('INVALID', 'There are no shots to assemble.');
  const song = p.song?.assetId ? byId(p.song.assetId) : undefined;
  const songOk = usableAudio(song) ? song : undefined;
  const musicVideo = p.kind === 'MUSIC_VIDEO' && Boolean(songOk);
  const tiled = musicVideo ? songWindowFrames(p) : undefined;
  if (tiled) notes.push(...tiled.notes);
  // 1) THE CLOCK
  const shots: ShotClock[] = [];
  const staleProblems: AudioProblem[] = [];
  let frame = 0;
  const songOffsetFrames = tiled ? Math.min(...[...tiled.windows.values()].map((w) => w.fromFrame)) : 0;
  for (const sh of ordered) {
    const t = takeOf(sh);
    if (!t) throw new StudioError('INVALID', `Shot ${p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? '?'}.${sh.number} has no chosen take.`);
    const a = byId(t.assetId);
    if (!a) throw new StudioError('NOT_FOUND', `The file of ${t.label} is missing.`);
    const w = shotWindowFrames(p, sh, t, a, { extraTrim: opts.extraTrim?.[sh.id], songWindows: tiled?.windows });
    const startFrame = tiled ? tiled.windows.get(sh.id)!.fromFrame - songOffsetFrames : frame;
    const holdFrames = Math.max(0, w.frames - w.available);
    if (holdFrames) notes.push(`shot ${sh.id}: its take is ${holdFrames} frame(s) short of its song window; the last frame holds`);
    else if (w.basis !== 'SONG' && w.available > w.frames) notes.push(`shot ${sh.id}: ${w.available - w.frames} frame(s) past what the take was generated for are left out`);
    let join = guideJoinOf(t);
    if (join === 'HARD') notes.push(`shot ${sh.id}: a continuation joined by a hard cut (its head was kept: ${(t.params as { guide?: { why?: string } } | undefined)?.guide?.why ?? 'the guide was not anchored'})`);
    // A STALE JOIN (src/domain/continuation.ts): the take continues a tail the cut no longer shows — refused, unless
    // the producer's override assembles it anyway, as a hard cut
    if (t.stale) {
      const detail = `shot ${sh.id}: its take ${t.label} is a stale continuation (${t.stale.detail})`;
      if (opts.allowStaleJoins) { join = 'HARD'; notes.push(`${detail}; assembled anyway as a hard cut (producer override)`); }
      else staleProblems.push({ kind: 'STALE_JOIN', detail, cueIds: [`take-${t.id}`] });
    }
    shots.push({ shotId: sh.id, sceneId: sh.sceneId, takeId: t.id, assetId: a.id, relation: relationOf(sh, t), join, startFrame, frames: w.frames, sourceStartFrame: w.sourceStart, availableFrames: w.available, holdFrames, basis: w.basis });
    frame = startFrame + w.frames;
  }
  const totalFrames = frame;
  const totalSamples = S(totalFrames);
  const cues: AudioCue[] = [];
  const edge = (c: Omit<AudioCue, 'fadeInSamples' | 'fadeOutSamples'> & Partial<Pick<AudioCue, 'fadeInSamples' | 'fadeOutSamples'>>): AudioCue => ({ fadeInSamples: Math.min(EDGE_FADE_SAMPLES, Math.floor(c.durationSamples / 2)), fadeOutSamples: Math.min(EDGE_FADE_SAMPLES, Math.floor(c.durationSamples / 2)), ...c });
  // 2) TAKES AND LINES
  const takeCue = new Map<string, AudioCue>();
  for (const s of shots) {
    const sh = ordered.find((x) => x.id === s.shotId)!;
    const t = takeOf(sh)!;
    const a = byId(s.assetId);
    const hasAudio = probeHasAudio(a);
    const head = s.sourceStartFrame / CLOCK_FPS;
    const shotStart = S(s.startFrame);
    const shotEnd = S(s.startFrame + s.frames);
    const sungAlong = t.soundtrack?.kind === 'SONG';
    const lines = sh.dialogue.filter((d) => usableAudio(byId(d.audioAssetId)));
    const speechCheck = t.qa?.checks.find((c) => c.name === 'script-spoken');
    let mode: 'KEEP' | 'REPLACE' | 'UNDER_SILENT' | 'NONE' = 'KEEP';
    if (!hasAudio) mode = lines.length && !musicVideo ? 'UNDER_SILENT' : 'NONE';
    else if (musicVideo || sh.dialogue.length === 0) mode = 'KEEP';
    else if (policy.dialogue === 'MODEL_VOICE') mode = 'KEEP';
    else if (policy.dialogue === 'RECORDED_VOICE') mode = lines.length ? 'REPLACE' : 'KEEP';
    else mode = lines.length && speechCheck?.ok !== true ? 'REPLACE' : 'KEEP';
    if (policy.dialogue === 'RECORDED_VOICE' && hasAudio && sh.dialogue.length && !lines.length) notes.push(`shot ${sh.id}: no recorded lines to play; the take's own speech stays`);
    // recorded lines: at the place the take speaks them (its placed windows, take-relative), else one after another
    const lineCues: AudioCue[] = [];
    if (mode === 'REPLACE' || mode === 'UNDER_SILENT') {
      const placed = t.soundtrack?.kind === 'DIALOGUE' ? t.soundtrack.lines : [];
      let cursor = shotStart + secS(0.2);
      for (const d of lines) {
        const la = byId(d.audioAssetId)!;
        const dur = secS(la.durationSeconds ?? d.durationSeconds ?? 2);
        const w = placed.find((x) => x.lineId === d.id);
        let start = w && w.from >= head ? shotStart + secS(w.from - head) : cursor;
        const before = lineCues.at(-1);
        if (before && start < before.startSample + before.durationSamples) { start = before.startSample + before.durationSamples + secS(0.1); notes.push(`shot ${sh.id}: line ${d.id} would overlap the line before it; moved after it`); }
        let durationSamples = dur;
        if (start + durationSamples > shotEnd) { durationSamples = Math.max(0, shotEnd - start); notes.push(`shot ${sh.id}: line ${d.id} runs past the shot's end; cut there`); }
        if (durationSamples <= 0) { notes.push(`shot ${sh.id}: line ${d.id} has no room in the shot; not played`); continue; }
        lineCues.push(edge({ id: `line-${d.id}`, kind: 'DIALOGUE', sourceAssetId: la.id, lineage: `line:${d.id}`, startSample: start, durationSamples, sourceOffsetSamples: 0, gain: 1, voice: true, shotId: sh.id, lineId: d.id, characterId: d.characterId, policy: mode === 'REPLACE' ? `the character's recorded line replaces the take's speech (${policy.dialogue === 'AUTO' ? 'its speech check did not pass' : 'policy: recorded voice'})` : 'recorded line under a take without its own sound' }));
        cursor = start + durationSamples + secS(0.25);
      }
    }
    if (hasAudio) {
      const durationSamples = S(Math.min(s.frames, s.availableFrames));
      const c = edge({ id: `take-${t.id}`, kind: 'GENERATED_VIDEO_AUDIO', sourceAssetId: s.assetId, lineage: musicVideo && sungAlong ? `song:${songOk!.id}` : `take:${t.id}`, startSample: shotStart, durationSamples, sourceOffsetSamples: S(s.sourceStartFrame), gain: musicVideo ? 0 : 1, muted: musicVideo || undefined, voice: sh.dialogue.length > 0 || sungAlong, shotId: sh.id, policy: musicVideo ? 'music video: the song master is the soundtrack; the take sang along to it' : mode === 'REPLACE' ? 'the take\'s room and movement; muted under the recorded lines that replace its speech' : t.soundtrack?.kind === 'DIALOGUE' ? 'the take speaks its lines (MiniMax H3, speech checked)' : 'native MiniMax sound' });
      if (mode === 'REPLACE' && lineCues.length) c.automation = { rampSamples: secS(0.02), spans: lineCues.map((l) => ({ from: l.startSample - shotStart, to: l.startSample + l.durationSamples - shotStart, gain: 0 })) };
      cues.push(c); takeCue.set(s.shotId, c);
    }
    cues.push(...lineCues);
  }
  // 5b) CONTINUATION JOINS: the two takes' sound cross-fades (B's guide head carries A's tail, re-rendered) — unless
  //     a recorded line of A plays into its last frames: B's head would bring the take's own speech back under it
  const k = JOIN_CROSSFADE_FRAMES;
  for (let i = 1; i < shots.length; i++) {
    const s = shots[i]; const prev = shots[i - 1];
    const a = takeCue.get(prev.shotId); const b = takeCue.get(s.shotId);
    if (s.relation !== 'CONTINUATION' || s.join === 'HARD' || !a || !b || a.muted || b.muted || s.sourceStartFrame < k || prev.frames < 2 * k || s.frames < 2 * k) continue;
    const prevEnd = S(prev.startFrame + prev.frames);
    if (cues.some((c) => c.kind === 'DIALOGUE' && c.shotId === prev.shotId && c.startSample + c.durationSamples > prevEnd - S(k))) { notes.push(`continuation join before shot ${s.shotId}: hard join (a recorded line of shot ${prev.shotId} runs to its end)`); continue; }
    b.startSample -= S(k); b.sourceOffsetSamples -= S(k); b.durationSamples += S(k); b.fadeInSamples = S(k); b.fadeInCurve = 'qsin';
    if (b.automation) b.automation.spans = b.automation.spans.map((x) => ({ ...x, from: x.from + S(k), to: x.to + S(k) }));
    a.fadeOutSamples = S(k); a.fadeOutCurve = 'qsin';
    notes.push(`continuation join before shot ${s.shotId}: the takes' sound cross-fades over ${k} frames`);
  }
  // 4) THE SONG
  if (musicVideo && songOk) {
    const left = Math.max(0, secS(songOk.durationSeconds ?? 0) - S(songOffsetFrames));
    const durationSamples = songOk.durationSeconds ? Math.min(totalSamples, left) : totalSamples;
    const endsEarly = songOk.durationSeconds ? left > totalSamples + secS(0.05) : false;
    cues.push({ id: `song-${songOk.id}`, kind: 'MASTER_MUSIC', sourceAssetId: songOk.id, lineage: `song:${songOk.id}`, startSample: 0, durationSamples, sourceOffsetSamples: S(songOffsetFrames), gain: 1, voice: true, fadeInSamples: songOffsetFrames ? EDGE_FADE_SAMPLES : 0, fadeOutSamples: endsEarly ? secS(0.5) : EDGE_FADE_SAMPLES, policy: `the song master, once, from ${(songOffsetFrames / CLOCK_FPS).toFixed(2)} s of the song${endsEarly ? '; the cut ends before the song and it fades out' : ''}` });
  } else if (songOk) {
    const stem = policy.songBed === 'INSTRUMENTAL_WHEN_AVAILABLE' ? byId(p.song?.stems?.instrumental) : undefined;
    const bedSource = usableAudio(stem) ? stem : songOk;
    const voiced = cues.filter((c) => c.voice && !c.muted && c.gain > 0).map((c) => ({ from: c.startSample, to: c.startSample + c.durationSamples, gain: BED.ducked / BED.gain }));
    const spans = mergeSpans(voiced, BED.rampSamples);
    cues.push(edge({ id: `bed-${bedSource.id}`, kind: bedSource === songOk ? 'MASTER_MUSIC' : 'MUSIC', sourceAssetId: bedSource.id, lineage: `song:${songOk.id}`, startSample: 0, durationSamples: Math.min(totalSamples, songOk.durationSeconds ? secS(songOk.durationSeconds) : totalSamples), sourceOffsetSamples: 0, gain: BED.gain, voice: bedSource === songOk, automation: spans.length ? { rampSamples: BED.rampSamples, spans } : undefined, policy: bedSource === songOk ? 'the song as a bed under dialogue, ducked under every voice' : 'the song\'s instrumental stem as a bed: no sung vocals under speech; ducked under every voice' }));
  }
  // AMBIENCE: one bed per run of scenes at a place that has one, across the cuts between them
  if (opts.ambience) {
    let run: { asset: string; from: number; to: number; locationId: string } | undefined;
    const flush = () => { if (run) cues.push({ id: `amb-${run.locationId}-${run.from}`, kind: 'AMBIENCE', sourceAssetId: run.asset, lineage: `ambience:${run.asset}:${run.from}`, startSample: run.from, durationSamples: run.to - run.from, sourceOffsetSamples: 0, gain: 0.5, loop: true, voice: false, fadeInSamples: Math.min(secS(0.25), Math.floor((run.to - run.from) / 2)), fadeOutSamples: Math.min(secS(0.25), Math.floor((run.to - run.from) / 2)), policy: 'the place\'s ambience bed, continuous across the cuts inside it' }); run = undefined; };
    for (const s of shots) {
      const loc = p.scenes.find((sc) => sc.id === s.sceneId)?.locationId;
      const asset = loc ? opts.ambience[loc] : undefined;
      const ok = asset && usableAudio(byId(asset)) ? asset : undefined;
      if (run && (!ok || ok !== run.asset)) flush();
      if (ok) { if (run) run.to = S(s.startFrame + s.frames); else run = { asset: ok, from: S(s.startFrame), to: S(s.startFrame + s.frames), locationId: loc! }; }
    }
    flush();
  }
  const timeline: AudioTimeline = { version: 1, fps: CLOCK_FPS, rate: CLOCK_RATE, clock: musicVideo ? 'SONG' : 'DIALOGUE', totalFrames, totalSamples, songOffsetFrames, policy, shots, cues, notes, problems: [] };
  timeline.problems = [...staleProblems, ...auditTimeline(timeline)];
  return timeline;
}

/** Spans merged where their ramps would overlap (the lower gain wins), sorted. */
export function mergeSpans(spans: GainSpan[], ramp: number): GainSpan[] {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const out: GainSpan[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && s.from - ramp <= last.to + ramp) { last.to = Math.max(last.to, s.to); last.gain = Math.min(last.gain, s.gain); }
    else out.push({ ...s });
  }
  return out;
}

type Span = [number, number];
const live = (c: AudioCue) => !c.muted && c.gain > 0;
/** The stretches where a voiced cue is heard above a bed's level. */
function audibleVoice(c: AudioCue): Span[] {
  if (!c.voice || !live(c) || c.gain <= VOICE_AUDIBLE_GAIN) return [];
  let spans: Span[] = [[c.startSample, c.startSample + c.durationSamples]];
  for (const g of c.automation?.spans ?? []) {
    if (c.gain * g.gain > VOICE_AUDIBLE_GAIN) continue;
    const [a, b] = [c.startSample + g.from, c.startSample + g.to];
    spans = spans.flatMap(([x, y]): Span[] => (b <= x || a >= y ? [[x, y]] : [...(a > x ? [[x, a] as Span] : []), ...(b < y ? [[b, y] as Span] : [])]));
  }
  return spans;
}
const overlap = (a: Span[], b: Span[]) => { let n = 0; for (const [x, y] of a) for (const [u, v] of b) n += Math.max(0, Math.min(y, v) - Math.max(x, u)); return n; };

/** The duplicate-source rules, checked on the finished timeline:
 *  ROUTED_TWICE — one file heard twice at once (the same source stretch on two live cues);
 *  DUPLICATE_SONG — one song twice at once: its master with a stem of it, two cues of it, or a take that sang along
 *  to it left unmuted under it (the vocal and instrumental stems together are the song once);
 *  VOICE_OVERLAP — two voices at full level at once (a recorded line over the take's own speech, two lines, a song's
 *  vocals not ducked under speech); the cross-fade of a continuation join is the same voice handing over. */
export function auditTimeline(t: Pick<AudioTimeline, 'cues'>): AudioProblem[] {
  const problems: AudioProblem[] = [];
  const cues = t.cues.filter(live);
  for (let i = 0; i < cues.length; i++) for (let j = i + 1; j < cues.length; j++) {
    const a = cues[i]; const b = cues[j];
    const timeOverlap = Math.min(a.startSample + a.durationSamples, b.startSample + b.durationSamples) - Math.max(a.startSample, b.startSample);
    if (timeOverlap <= 0) continue;
    if (a.sourceAssetId === b.sourceAssetId && !a.loop && !b.loop) {
      const srcOverlap = Math.min(a.sourceOffsetSamples + a.durationSamples, b.sourceOffsetSamples + b.durationSamples) - Math.max(a.sourceOffsetSamples, b.sourceOffsetSamples);
      if (srcOverlap > 0) problems.push({ kind: 'ROUTED_TWICE', detail: `${a.kind} ${a.sourceAssetId} is routed twice`, cueIds: [a.id, b.id] });
    }
    if (a.lineage.startsWith('song:') && a.lineage === b.lineage) {
      const stems = new Set([a.kind, b.kind]);
      const stemPair = stems.has('MUSIC') && (stems.has('LEAD_VOCAL') || stems.has('BACKING_VOCAL')) || (stems.has('LEAD_VOCAL') && stems.has('BACKING_VOCAL'));
      if (!stemPair) problems.push({ kind: 'DUPLICATE_SONG', detail: `the song ${a.lineage.slice(5)} would play twice (${a.kind} with ${b.kind})`, cueIds: [a.id, b.id] });
    }
    const voices = overlap(audibleVoice(a), audibleVoice(b));
    if (voices > 0) {
      // the hand-over of a continuation join: one fades out exactly as the other fades in, no longer than the fades
      const [first, second] = a.startSample <= b.startSample ? [a, b] : [b, a];
      const handover = first.kind === 'GENERATED_VIDEO_AUDIO' && second.kind === 'GENERATED_VIDEO_AUDIO' && voices <= Math.min(first.fadeOutSamples, second.fadeInSamples) && second.startSample >= first.startSample + first.durationSamples - first.fadeOutSamples;
      if (!handover) problems.push({ kind: 'VOICE_OVERLAP', detail: `${a.kind}${a.shotId ? ` (${a.shotId})` : ''} and ${b.kind}${b.shotId ? ` (${b.shotId})` : ''} are both heard as voices for ${(voices / CLOCK_RATE).toFixed(2)} s`, cueIds: [a.id, b.id] });
    }
  }
  return problems;
}

/** A compact, stable form of a timeline for provenance and the stored revision (cue ids, kinds, placements). */
export function timelineDigest(t: AudioTimeline) {
  return { clock: t.clock, totalFrames: t.totalFrames, songOffsetFrames: t.songOffsetFrames, policy: t.policy, shots: t.shots.map((s) => ({ shotId: s.shotId, takeId: s.takeId, startFrame: s.startFrame, frames: s.frames, sourceStartFrame: s.sourceStartFrame, holdFrames: s.holdFrames, basis: s.basis, relation: s.relation, join: s.join })), cues: t.cues.map((c) => ({ id: c.id, kind: c.kind, source: c.sourceAssetId, lineage: c.lineage, start: c.startSample, duration: c.durationSamples, offset: c.sourceOffsetSamples, gain: c.gain, muted: c.muted ?? false, ducked: c.automation?.spans.length ?? 0 })), problems: t.problems, notes: t.notes };
}
