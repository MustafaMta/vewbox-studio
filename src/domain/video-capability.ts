/** WHAT A VIDEO ENGINE CAN DO — model-specific continuation settings as DATA (cloud directive 2026-10-05 §6: "Do not
 *  blindly hard-code the 22-frame MinimaxStoryBuilder value. Model-specific continuation settings must live in
 *  capability/configuration data"). Every number the shot pack, the preflight, the guide validation and the cut read
 *  about the engine comes from one record here; the studio's settings and a shot's own override choose WITHIN it, and a
 *  choice the engine cannot honour is refused with a reason (never floored silently).
 *
 *  MiniMax is the only video family (README; docs/MODELS.md). Two backends of it:
 *  - `minimax-h3-local`: the open weights in ComfyUI v0.38.1 (`comfy_extras/nodes_minimax_h3.py`, read on the
 *    workstation, docs/research/STORYBUILDER-INTEGRATION.md §b.2): 24 fps; clip lengths on the 17k+5 grid, trained range
 *    124–362; `MiniMaxH3AddGuide` keeps an image batch of < 5 frames as ONE frame and snaps anything longer DOWN to
 *    17k+5 (5, 22, 39 …); guide audio is resampled to the audio VAE (40 latent steps a second) and cropped to the track;
 *    Ref2VA takes ≤ 9 pictures, ≤ 3 videos, ≤ 3 audios.
 *  - `minimax-h3-api`: the hosted endpoint — no anchored guides, frame and reference roles never mixed, so a
 *    continuation is lowered to "the previous take's last frame as the first frame" (MINIMAX-CONTINUITY.md §1.4).
 *  Pure. */

export type VideoEngineId = 'minimax-h3-local' | 'minimax-h3-api';

export interface FrameGrid { /** n = base + step·k */ base: number; step: number }

export interface VideoCapability {
  id: VideoEngineId;
  family: 'MINIMAX';
  fps: number;
  /** clip lengths the engine generates (requests snap UP onto it), inside [minFrames, maxFrames] */
  grid: FrameGrid;
  minFrames: number;
  maxFrames: number;
  /** the hosted request ceiling in seconds (the local engine is bounded by maxFrames) */
  maxSeconds: number;
  refs: { images: number; videos: number; audios: number; /** per reference audio clip, seconds */ audioSeconds?: { min: number; max: number }; audioTotalSeconds?: number;
    /** how the engine sizes a reference picture before encoding it (nodes_minimax_h3.py MiniMaxH3ReferenceToVideo):
     *  `match` scales it DOWN (never up) to the generation's pixel area, `max` to `maxShortEdge` on the short edge; each
     *  side then rounds to `multiple` */
    imageSizing?: { mode: 'match' | 'max'; maxShortEdge: number; multiple: number };
    /** the derived face reference (src/domain/face-reference.ts): below `minFacePx` face pixels in the encoded
     *  canonical picture, a shot at one of `framings` may add a face crop of the canonical image (START values) */
    faceReference?: { minFacePx: number; framings: import('./vocabulary').Framing[] } };
  /** anchored guides on the target timeline (frames and their sound): what a CONTINUOUS boundary needs */
  guides?: {
    /** how the node keeps an image batch: below `singleFrameBelow` frames → 1 frame; otherwise snapped DOWN onto `grid` */
    grid: FrameGrid;
    singleFrameBelow: number;
    /** guide audio is encoded at this latent rate: a guide length never lands on an audio-latent step unless
     *  frames·rate/fps is whole — the reason the join cross-fades */
    audioLatentHz: number;
    /** the guide length a continuation uses unless the studio or the shot chooses another (a length the node keeps) */
    defaultContinuationFrames: number;
    /** the lengths a producer may choose (each a length the node keeps; longer = more motion context, less new picture) */
    continuationChoices: number[];
    /** at most this many guides chained on one request (a recorded soundtrack, a tail, an opening and an ending frame) */
    maxPerRequest: number;
    /** the head of a continuation is a close RE-RENDER of the tail, not a copy (keyframe rows are conditioning, never
     *  updated): the head is measured before it is dropped (src/server/media/guide-head.ts) */
    headIsReRender: true;
    /** anchored audio steers timing/prosody/timbre; the output audio is always new (docs/AUDIOVISUAL-QA.md E1) */
    audioIsConditioning: true;
  };
  /** how a CONTINUOUS boundary is honoured without guides */
  continuationLowering?: 'LAST_FRAME_AS_FIRST';
  /** in-take editorial cuts (`[Shot N]` inside one generation) */
  inTakeCuts: boolean;
  /** native audio (speech, sound) generated with the picture */
  nativeAudio: boolean;
  /** QUALITY TIERS of the local engine (docs/research/MODEL-EVAL-2026-10.md §8.4): `final` is what every take is made at
   *  unless the producer explicitly asks for a draft; `draft` is the fast path, recorded as such on the take — never
   *  used silently. `engineFactor`: the tier's engine time against the turbo draft, for deadlines and estimates. */
  tiers?: Record<VideoQualityTier, VideoTierConfig>;
}

export type VideoQualityTier = 'draft' | 'final';
export interface VideoTierConfig {
  /** the distillation (turbo) LoRA on, with its step count; off = the base model at `steps` */
  turbo: boolean;
  steps: number;
  scheduler: 'simple' | 'beta' | 'normal';
  refImageSize: 'match' | 'max';
  /** engine time relative to the draft tier (measured) */
  engineFactor: number;
  /** what the producer is told about the tier */
  label: string;
}

export const MINIMAX_H3_LOCAL: VideoCapability = {
  id: 'minimax-h3-local', family: 'MINIMAX', fps: 24,
  grid: { base: 5, step: 17 }, minFrames: 124, maxFrames: 362, maxSeconds: 15,
  refs: {
    images: 9, videos: 3, audios: 3,
    imageSizing: { mode: 'match', maxShortEdge: 2048, multiple: 32 },
    // MinimaxStoryBuilder sheets.py (dead code there, but its arithmetic holds for the node): ~140 px of face after the
    // `match` downscale "is not enough for reference-to-video to hold a likeness"; our full-body canonical at 1280x736
    // lands there. START: 192 px; G13 calibrates it
    faceReference: { minFacePx: 192, framings: ['MEDIUM', 'MEDIUM_CLOSE_UP', 'CLOSE_UP', 'EXTREME_CLOSE_UP', 'TWO_SHOT', 'OVER_THE_SHOULDER'] },
  },
  guides: {
    grid: { base: 5, step: 17 }, singleFrameBelow: 5, audioLatentHz: 40,
    // 22 frames ≈ 0.92 s: motion, speech rhythm and room tone (the official template's continuation idiom). It is the
    // DEFAULT of this engine, measured on the workstation (minimax-p1 C1: head PSNR 38.7 dB), not a law of the studio.
    defaultContinuationFrames: 22,
    continuationChoices: [5, 22, 39],
    maxPerRequest: 4,
    headIsReRender: true, audioIsConditioning: true,
  },
  inTakeCuts: true, nativeAudio: true,
  // MODEL-EVAL-2026-10.md §8.4 (2026-10-06, The Static Sky scene 1 shots 1–2, seed 970007, first attempts): the base
  // model at 20 steps (the official templates' default; the checkpoints are CFG-distilled, so no CFG) held the planned
  // MEDIUM_CLOSE_UP as one continuous shot with SFace median 0.69 (0 frames below 0.363) where the Ref2VA turbo LoRA
  // cut three times inside the take and drifted to 0.33 (55 % below); engine 350 s vs 110 s (×3.2) at the same
  // 31.7–31.9 GB card and 46 GiB host RAM. Turbo stays as the explicit draft tier.
  tiers: {
    final: { turbo: false, steps: 20, scheduler: 'simple', refImageSize: 'match', engineFactor: 3.2, label: 'Final: MiniMax H3 base model, 20 steps' },
    draft: { turbo: true, steps: 0, scheduler: 'simple', refImageSize: 'match', engineFactor: 1, label: 'Draft: MiniMax H3 turbo LoRA (4 steps reference / 8 steps frames), about 3× faster, less stable framing and identity' },
  },
};

/** The draft tier's measured engine time for a 124-frame (5 s) Ref2VA clip at 1344×768 with its references, the
 *  checkpoint warm (MODEL-EVAL §8.4: 110 s; §5 V1 119 s with the cold load). */
export const H3_DRAFT_ENGINE_MS_AT_124 = 110_000;
/** Expected engine time of a local H3 clip: the tier's factor × the measured draft time, scaled by frames^1.5 (between
 *  the linear MLP cost and the quadratic attention cost of the video tokens; an estimate until long final clips are
 *  measured). */
export function h3EngineEstimateMs(frames: number, tier: VideoQualityTier, cap: VideoCapability = MINIMAX_H3_LOCAL): number {
  const factor = cap.tiers?.[tier]?.engineFactor ?? 1;
  return Math.round(factor * H3_DRAFT_ENGINE_MS_AT_124 * Math.pow(Math.max(1, frames) / 124, 1.5));
}
/** How long the worker waits for one local H3 run before failing it: 4× the estimate (a cold load, a busy card),
 *  never below the old fixed 90 min and never above 3 h. A final 15-s clip (362 frames) gets ≈ 117 min. */
export const H3_RUN_TIMEOUT_MIN_MS = 90 * 60_000;
export const H3_RUN_TIMEOUT_MAX_MS = 180 * 60_000;
export function h3RunTimeoutMs(frames: number, tier: VideoQualityTier, cap: VideoCapability = MINIMAX_H3_LOCAL): number {
  return Math.min(H3_RUN_TIMEOUT_MAX_MS, Math.max(H3_RUN_TIMEOUT_MIN_MS, 4 * h3EngineEstimateMs(frames, tier, cap)));
}

/** The tier a take is made at: `final` unless `draft` is asked explicitly. */
export const videoTier = (cap: VideoCapability, requested?: VideoQualityTier): { tier: VideoQualityTier; config?: VideoTierConfig } =>
  cap.tiers ? { tier: requested === 'draft' ? 'draft' : 'final', config: cap.tiers[requested === 'draft' ? 'draft' : 'final'] } : { tier: 'final' };

export const MINIMAX_H3_API: VideoCapability = {
  id: 'minimax-h3-api', family: 'MINIMAX', fps: 24,
  grid: { base: 0, step: 1 }, minFrames: 96, maxFrames: 360, maxSeconds: 15,
  refs: { images: 9, videos: 0, audios: 3 },
  continuationLowering: 'LAST_FRAME_AS_FIRST',
  inTakeCuts: false, nativeAudio: true,
};

export const capabilityFor = (backend: 'local' | 'api'): VideoCapability => (backend === 'local' ? MINIMAX_H3_LOCAL : MINIMAX_H3_API);

const onGrid = (n: number, g: FrameGrid) => g.step <= 1 || (((n - g.base) % g.step) + g.step) % g.step === 0;

/** The clip length the engine generates for `seconds`: snapped UP onto the grid, held in [minFrames, maxFrames]. */
export function framesFor(cap: VideoCapability, seconds: number): number {
  const raw = Math.max(cap.grid.base || 1, Math.round(seconds * cap.fps));
  const up = cap.grid.step <= 1 ? raw : raw + ((((cap.grid.base - raw) % cap.grid.step) + cap.grid.step) % cap.grid.step);
  return Math.min(cap.maxFrames, Math.max(cap.minFrames, up));
}

/** Frames the guide node KEEPS of an `n`-frame clip (fewer than `singleFrameBelow` → 1; else snapped DOWN onto the grid). */
export function guideFramesKept(cap: VideoCapability, n: number): number {
  const g = cap.guides;
  if (!g) return 0;
  if (n < g.singleFrameBelow) return 1;
  let k = Math.floor(n);
  while (k > g.grid.base && !onGrid(k, g.grid)) k--;
  return k;
}

/** Every guide length the node keeps that fits under `maxFrames` (5, 22, 39 … for H3). */
export function guideLengths(cap: VideoCapability, upTo = 60): number[] {
  const g = cap.guides;
  if (!g) return [];
  const out: number[] = [];
  for (let n = g.grid.base; n <= upTo; n += g.grid.step) out.push(n);
  return out;
}

/** THE CONTINUATION SETTINGS a request uses, resolved from the engine's capability, the studio's choice and the shot's
 *  own override (shot > studio > engine default). `guideAudio`: AUTO anchors the tail's sound unless the rules of the
 *  shot pack mute it (a silent shot after speech); OFF never anchors it; ON anchors it even then. */
export type GuideAudioMode = 'AUTO' | 'ON' | 'OFF';
export interface ContinuationChoice { guideFrames?: number; guideAudio?: GuideAudioMode; /** studio only: re-anchor after this many continuous shots in a row (src/domain/production-context.ts REANCHOR) */ reanchorAfter?: number }
export interface ContinuationSettings {
  engine: VideoEngineId;
  /** frames of the previous take's tail anchored at frame 0 (0 when the engine has no guides) */
  guideFrames: number;
  guideAudio: GuideAudioMode;
  /** where the numbers came from */
  source: { guideFrames: 'SHOT' | 'STUDIO' | 'ENGINE'; guideAudio: 'SHOT' | 'STUDIO' | 'ENGINE' };
  /** a choice that could not be honoured, and what was used instead */
  problems: string[];
}

export function resolveContinuation(cap: VideoCapability, studio?: ContinuationChoice, shot?: ContinuationChoice): ContinuationSettings {
  const problems: string[] = [];
  const g = cap.guides;
  if (!g) return { engine: cap.id, guideFrames: 0, guideAudio: 'OFF', source: { guideFrames: 'ENGINE', guideAudio: 'ENGINE' }, problems: [] };
  let guideFrames = g.defaultContinuationFrames; let fSource: ContinuationSettings['source']['guideFrames'] = 'ENGINE';
  for (const [choice, src] of [[studio?.guideFrames, 'STUDIO'], [shot?.guideFrames, 'SHOT']] as const) {
    if (choice === undefined) continue;
    const kept = guideFramesKept(cap, choice);
    if (!g.continuationChoices.includes(choice)) { problems.push(`${src === 'SHOT' ? 'the shot' : 'the studio'} asks for a ${choice}-frame guide; ${cap.id} keeps ${kept} of it and allows ${g.continuationChoices.join(', ')} — ${guideFrames} used`); continue; }
    guideFrames = choice; fSource = src;
  }
  let guideAudio: GuideAudioMode = 'AUTO'; let aSource: ContinuationSettings['source']['guideAudio'] = 'ENGINE';
  if (studio?.guideAudio) { guideAudio = studio.guideAudio; aSource = 'STUDIO'; }
  if (shot?.guideAudio) { guideAudio = shot.guideAudio; aSource = 'SHOT'; }
  return { engine: cap.id, guideFrames, guideAudio, source: { guideFrames: fSource, guideAudio: aSource }, problems };
}

/** New picture a continuation can carry after its guide: `maxFrames − guide`; never truncated silently. */
export function continuationBudget(cap: VideoCapability, guideFrames: number, newSeconds: number): { guideFrames: number; budgetFrames: number; neededFrames: number; fits: boolean } {
  const neededFrames = Math.max(1, Math.round(newSeconds * cap.fps));
  const budgetFrames = cap.maxFrames - Math.max(0, guideFrames);
  return { guideFrames, budgetFrames, neededFrames, fits: neededFrames <= budgetFrames };
}

/** Audio-latent steps a guide of `frames` spans (information for the join: 22 frames = 36.67 at 40 Hz). */
export const guideAudioLatentSteps = (cap: VideoCapability, frames: number): number => (cap.guides ? Number(((frames / cap.fps) * cap.guides.audioLatentHz).toFixed(2)) : 0);
