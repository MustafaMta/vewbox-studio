import { H3_FPS, h3GuideClipFrames } from '@/server/workflows/minimax-h3';

/** THE CONTINUATION GUIDE, VALIDATED (docs/research/STORYBUILDER-INTEGRATION.md §f.1, gap V1). `MiniMaxH3AddGuide`
 *  never refuses a short clip: an image batch under 5 frames becomes one frame, anything else is snapped DOWN to
 *  5, 22, 39 … (17k+5) — so a 21-frame tail silently anchors 5 frames while the cut would still drop 22 genuinely new
 *  frames. Nothing here trusts the request: the clip is counted after it is written (`tailClip`), judged against the
 *  node's real guide lengths before the engine is touched, and the length the node WILL keep is what the take
 *  records and what the trim reads. Pure, so the rule is tested. */

/** The guide lengths the installed node keeps at 24 fps (5, 22, 39 …); the audio latent runs at 40 Hz, so no guide
 *  length lands on an audio-latent step (22 frames = 36.67 steps) — the reason the join cross-fades. */
export const H3_GUIDE_LENGTHS = [5, 22, 39] as const;
export const H3_AUDIO_LATENT_HZ = 40;

export interface GuideClipFacts { frames: number; hasAudio: boolean; audioSeconds?: number }
export interface GuideWant { /** the guide length the pack planned (what the trim will drop) */ frames: number; withAudio: boolean }
export interface GuideVerdict {
  ok: boolean;
  /** the length the node keeps of this clip (what the take records and the cut trims) */
  frames: number;
  /** audio latent steps the guide spans (information for the join: never a whole number for 22 frames) */
  audioLatentSteps: number;
  problems: string[];
}

/** Judge a written guide clip against what was asked for. A problem is a refusal (WRONG_PARAMETERS), never a silent
 *  floor: the frame count must be exactly the planned one, that count must be a length the node keeps, and when the
 *  tail carries its sound the sound must be there and run as long as the picture (within one frame). */
export function validateGuideClip(clip: GuideClipFacts, want: GuideWant, fps = H3_FPS): GuideVerdict {
  const problems: string[] = [];
  const kept = h3GuideClipFrames(clip.frames);
  if (clip.frames !== want.frames) problems.push(`the tail clip has ${clip.frames} frame${clip.frames === 1 ? '' : 's'}, not the ${want.frames} planned${kept !== clip.frames ? ` (the node would silently keep ${kept})` : ''}`);
  else if (kept !== clip.frames) problems.push(`${clip.frames} frames is not a guide length the node keeps (5, 22, 39 …): it would silently keep ${kept}`);
  if (want.withAudio) {
    if (!clip.hasAudio) problems.push('the tail clip carries no sound but the guide anchors it with its sound');
    else if (clip.audioSeconds !== undefined && Math.abs(clip.audioSeconds - clip.frames / fps) > 1 / fps) problems.push(`the tail's sound runs ${clip.audioSeconds.toFixed(3)} s for ${clip.frames} frames (${(clip.frames / fps).toFixed(3)} s)`);
  }
  return { ok: problems.length === 0, frames: kept, audioLatentSteps: Number(((kept / fps) * H3_AUDIO_LATENT_HZ).toFixed(2)), problems };
}

/** What a take records about its guide (`params.guide`): the length the node kept, what the clip held, where it was
 *  cut from, and — after generation — whether the head repeated the tail (src/server/media/guide-head.ts). */
export interface GuideRecord {
  /** frames the node anchored (the trim reads THIS, never a constant) */
  frames: number;
  sourceFrames: number;
  withAudio: boolean;
  audioSeconds?: number;
  audioLatentSteps: number;
  /** the previous take's frame after the last guide frame (the window's end on the audio timeline) */
  sourceEndFrame?: number;
}
