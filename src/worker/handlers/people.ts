import fsp from 'node:fs/promises';
import path from 'node:path';
import type { HandlerContext } from './index';
import type { ToolRunner } from '@/server/org/tools';
import type { Shot } from '@/domain/types';
import * as comfy from '@/server/providers/comfy';
import { MODELS, qwenVlmText, vlmOutput } from '@/server/workflows';
import { frameAt, tmpDir } from '@/server/media/ffmpeg';

/** PEOPLE ON SCREEN (D30, D33) — the installed Qwen3.5-4B counts the people physically in a picture, portraits on the
 *  wall excluded (10/10 on the frames of "The Static Sky"). Storyboard frames are counted after drawing; takes are
 *  sampled every half second, because a duplicated character can live for half a second only (shot 2.3: a second
 *  Najm walked in while the first faded out). */

export const PEOPLE_COUNT_PROMPT = 'How many people are physically present in this picture? Count every person, child or figure standing or sitting in the room, even when partly hidden. Do not count people who only appear in a photograph, portrait, poster or painting on the wall. Answer with the number only.';

/** How many people a picture of the shot should hold: the shot's people, less the one whose eyes the camera is (a
 *  point-of-view shot) — unless its staging declares extras or its action brings in others (a crowd, customers,
 *  passers-by), which the studio does not count. */
export function peopleExpected(sh: Pick<Shot, 'action' | 'staging'>, people: unknown[]): number | undefined {
  const seen = sh.staging?.pov ? people.filter((id) => id !== sh.staging!.pov) : people;
  if (!seen.length) return undefined;
  if (sh.staging?.extras?.length) return undefined;
  if (/\b(crowd|people|customers|passers?-?by|strangers|children|guests|audience|others|everyone|onlookers|patrons|workers|soldiers)\b/i.test(sh.action)) return undefined;
  return seen.length;
}

/** The shot's action features a picture or a reflection of a person: the counter can take it for one (2.4 of "The
 *  Static Sky": the wife's portrait filling the frame counted as a second person), so a surplus there is a question
 *  for the producer, not a rejection. */
export const showsPictureOfPeople = (action: string): boolean => /\b(photo|photograph|portrait|painting|poster|picture|reflection|mirror|screen|television|tv|statue|mannequin)s?\b/i.test(action);

/** The number in the model's answer, or undefined. */
export const parseCount = (text: string | undefined): number | undefined => { const n = Number(/\d+/.exec(text ?? '')?.[0]); return Number.isFinite(n) ? n : undefined; };

/** Whether the vision model is installed in ComfyUI. */
export async function canCountPeople(): Promise<boolean> {
  return (await comfy.listModels('text_encoders').catch(() => [] as string[])).includes(MODELS.vlm);
}

/** The tool a count runs as: the caller names it, so the organisation's allow-lists can see it (static scan). */
export type CountTool = 'image.describe_reference';

/** Count the people in local picture files in ONE ComfyUI prompt (one model load), under the image lease. */
export async function countPeopleInFiles(ctx: HandlerContext, tool: ToolRunner, toolId: CountTool, files: string[], label: string): Promise<Array<number | undefined>> {
  if (!files.length) return [];
  const uploads = await Promise.all(files.map((f) => comfy.uploadInput(f)));
  const graph = qwenVlmText({ items: uploads.map((image, k) => ({ key: `p${k}`, image, prompt: PEOPLE_COUNT_PROMPT })), maxLength: 16, megapixels: 0.6 });
  // the count's prompt key (audit H8, step 7): the graph is a function of the pictures (their upload names are content
  // hashes), so a restarted attempt re-attaches to the count it already asked for
  const run = await ctx.gpu('IMAGE', 9000, () => tool(toolId, () => comfy.run(graph, { timeoutMs: 10 * 60_000, promptKey: `${ctx.job.id}:people:${label}` }), { label, input: { graph, label } }), { jobId: ctx.job.id });
  return uploads.map((_, k) => parseCount(comfy.textOutput(run.outputs, vlmOutput(`p${k}`))));
}

/** The people over a video's time, every `every` seconds from `from` to `to` (the new frames of a take). */
export async function countPeopleOverTime(ctx: HandlerContext, tool: ToolRunner, toolId: CountTool, video: string, opts: { from: number; to: number; every?: number; label: string }): Promise<Array<{ at: number; n: number | undefined }>> {
  const every = opts.every ?? 0.5;
  const times: number[] = [];
  for (let t = opts.from + 0.1; t < opts.to - 0.05; t += every) times.push(Number(t.toFixed(2)));
  const dir = await tmpDir('people');
  try {
    const files: string[] = [];
    for (const t of times) files.push(await frameAt(video, path.join(dir, `f${files.length}.png`), Math.round(t * 24)));
    const counts = await countPeopleInFiles(ctx, tool, toolId, files, opts.label);
    return times.map((at, i) => ({ at, n: counts[i] }));
  } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** The verdict on a take: more people than the shot holds at any sampled moment fails it (strangers, a duplicated
 *  character); fewer is allowed (framing can leave someone out). */
export function peopleVerdict(samples: Array<{ at: number; n: number | undefined }>, expected: number): { ok: boolean; max?: number; at: number[] } {
  const extra = samples.filter((s) => s.n !== undefined && s.n > expected);
  const counted = samples.map((s) => s.n).filter((n): n is number => n !== undefined);
  return { ok: extra.length === 0, max: counted.length ? Math.max(...counted) : undefined, at: extra.map((s) => s.at) };
}
