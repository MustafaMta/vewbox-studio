/** The planner's name as the studio shows it (Settings › Engines, the engine room). Pure. The studio has ONE planner:
 *  Qwen3.8-27B-NVFP4 on the local vLLM server; any other configured id is shown as it is. */
export const PLANNER_MODEL = 'Qwen3.8-27B-NVFP4';

export function llmDisplayName(model: string | undefined | null): string {
  const m = (model ?? '').trim();
  if (!m) return PLANNER_MODEL;
  const l = m.toLowerCase();
  if (l === PLANNER_MODEL.toLowerCase() || l.endsWith('/qwen3.8-27b-nvfp4')) return PLANNER_MODEL;
  return m;
}
