import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { json, params, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { readOrg } from '@/server/org/registry';
import { listStudioEvents } from '@/server/org/runs';
import { db, schema } from '@/server/db/client';
import { StudioError } from '@/domain/errors';

export const dynamic = 'force-dynamic';

/** One department: its agents, what they are doing now (open runs), what they delivered (handoffs it produced),
 *  the quality results of its inspectors (or on its deliverables), and its activity. All from the records. */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const org = await readOrg();
  const department = org.departments.find((d) => d.id === id);
  if (!department) throw new StudioError('NOT_FOUND', `No department ${id}`);
  const agents = org.agents.filter((a) => a.department === id);
  const agentIds = agents.map((a) => a.id);
  const [active, recent, handoffs, reports, events] = await Promise.all([
    agentIds.length ? db().select().from(schema.agentRuns).where(and(inArray(schema.agentRuns.agentId, agentIds), isNull(schema.agentRuns.outcome))).orderBy(desc(schema.agentRuns.startedAt)).limit(50) : Promise.resolve([]),
    agentIds.length ? db().select().from(schema.agentRuns).where(inArray(schema.agentRuns.agentId, agentIds)).orderBy(desc(schema.agentRuns.startedAt)).limit(40) : Promise.resolve([]),
    db().select().from(schema.handoffs).where(eq(schema.handoffs.producerDepartment, id)).orderBy(desc(schema.handoffs.createdAt)).limit(60),
    agentIds.length ? db().select().from(schema.qaReports).where(inArray(schema.qaReports.inspectorId, agentIds)).orderBy(desc(schema.qaReports.createdAt)).limit(60) : Promise.resolve([]),
    listStudioEvents({ departmentId: id, limit: 80 }),
  ]);
  return json({ department, agents, tools: org.tools.filter((t) => agents.some((a) => a.tools.includes(t.id))), skills: org.skills.filter((s) => agents.some((a) => a.skills.includes(s.id))), activeRuns: active, recentRuns: recent, handoffs, reports, events }, { headers: { 'Cache-Control': 'no-store' } });
});
