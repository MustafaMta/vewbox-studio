import { StudioError } from '@/domain/errors';
import { json, route } from '@/server/http';
import { workflowTemplates } from '@/server/registry';
import { workflowVersion } from '@/server/workflows';

export const dynamic = 'force-dynamic';

/** One workflow template as the studio would send it to ComfyUI (placeholder inputs), with its version. */
export const GET = route(async (_req, ctx: { params: Promise<{ name: string }> }) => {
  const { name } = await ctx.params;
  const t = workflowTemplates().find((w) => w.name === name);
  if (!t) throw new StudioError('NOT_FOUND', `No workflow template named ${name}`);
  return json({ name: t.name, version: workflowVersion(t.graph), graph: t.graph }, { headers: { 'Cache-Control': 'no-store' } });
});
