import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ACTIVITY_HIDDEN_KINDS, isActivityNoise } from '@/domain/phases';
import { studioEventConditions } from '@/server/org/runs';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B9: a run's phase changes are recorded (RUN_PHASE) but are bookkeeping — no
 *  activity list shows them (Production activity, Studio Company recent work, a department's, an agent's or a
 *  character's recent work) and no open page refetches on them. */

const dialect = new PgDialect();
const where = (opts: Parameters<typeof studioEventConditions>[0]) => { const c = studioEventConditions(opts); return c ? dialect.sqlToQuery(c) : { sql: '', params: [] as unknown[] }; };

const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));

describe('phase events stay out of the activity lists', () => {
  it('RUN_PHASE is the bookkeeping kind; real work is not', () => {
    // TOOL_CALL (step 15): one row per tool call, the run's record — never activity
    expect(ACTIVITY_HIDDEN_KINDS).toEqual(['RUN_PHASE', 'TOOL_CALL']);
    expect(isActivityNoise('RUN_PHASE')).toBe(true);
    expect(isActivityNoise('TOOL_CALL')).toBe(true);
    for (const k of ['RUN_STARTED', 'RUN_COMPLETED', 'RUN_FAILED', 'TAKE_ACCEPTED', 'NOTE_ADDED', 'HANDOFF', undefined, null, '']) expect(isActivityNoise(k)).toBe(false);
  });
  it('every activity query leaves RUN_PHASE out unless the status row asks for it', () => {
    for (const opts of [{}, { productionId: 'p' }, { departmentId: 'VIDEO' }, { agentId: 'video-director' }, { since: '2026-10-03T00:00:00.000Z' }]) {
      const q = where(opts);
      expect(q.sql).toMatch(/"studio_events"\."kind" not in \(\$\d+, \$\d+\)/);
      expect(q.params).toContain('RUN_PHASE');
      expect(q.params).toContain('TOOL_CALL');
    }
    const q = where({ jobId: 'job-1', includeBookkeeping: true });
    expect(q.sql).not.toMatch(/not in/);
    expect(q.params).toEqual(['job-1']);
  });
  it('the routes behind the activity lists read through listStudioEvents and none opts in; nothing else reads the table', () => {
    const files = walk(path.join('src'));
    const readers = files.filter((f) => /from\(schema\.studioEvents\)/.test(fs.readFileSync(f, 'utf8')));
    expect(readers.map((f) => f.replace(/\\/g, '/'))).toEqual(['src/server/org/runs.ts']);
    const routes = files.filter((f) => /listStudioEvents\(/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith('runs.ts'));
    expect(routes.length).toBeGreaterThanOrEqual(5); // org, events, department, production, agent
    for (const f of routes) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/includeBookkeeping/);
  });
  it('the browser does not refetch on a phase notice', () => {
    const store = fs.readFileSync(path.join('src', 'studio', 'store.tsx'), 'utf8');
    expect(store).toMatch(/addEventListener\('activity', \(ev\) => \{ try \{ if \(isActivityNoise\(/);
  });
});
