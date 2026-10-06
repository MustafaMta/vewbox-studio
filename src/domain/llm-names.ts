/** The story model's name as the studio shows it (Settings › Engines, the engine room). Pure. The production planner
 *  is Qwen3.8-27B-FP8 on vLLM (docs/research/MODEL-EVAL-2026-10.md §12); Gemma 4 31B on Ollama is the emergency
 *  fallback only. */
export const PLANNER_MODEL = 'Qwen3.8-27B-FP8';

export function llmDisplayName(model: string | undefined | null): string {
  const m = (model ?? '').trim();
  if (!m) return PLANNER_MODEL;
  const l = m.toLowerCase();
  if (l === PLANNER_MODEL.toLowerCase() || l.endsWith('/qwen3.8-27b-fp8')) return PLANNER_MODEL;
  if (l.startsWith('gemma4:31b')) return 'Gemma 4 31B (emergency fallback)';
  if (l.startsWith('qwen3.6:27b')) return 'Qwen3.6-27B (Ollama, retired)';
  if (l.startsWith('qwen3:14b')) return 'Qwen3 14B (preview)';
  return m;
}
