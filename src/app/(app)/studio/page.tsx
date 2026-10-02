'use client';

import Link from 'next/link';
import { useOrg, useReliability } from '@/studio/org';
import { useT } from '@/components/ui/locale';
import { PageHeader, Section } from '@/components/ui/page';
import { ActivityFeed, AgentRow, DepartmentCard, PipelineGraph, ReliabilityPanel } from '@/components/studio/org';
import { Status } from '@/components/ui/kit';

/** THE STUDIO — the company overview: the Executive Office, the eight departments as cards with what they have
 *  really done, the live activity feed, the pipeline graph and the reliability figures. Nothing fabricated: an
 *  agent that has not run says so. */
export default function StudioPage() {
  const T = useT();
  const { data: org, error } = useOrg();
  const { data: rel } = useReliability(24 * 7);
  if (error) return <PageHeader title={T('studio.title')} subtitle={error} />;
  if (!org) return <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96" /><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-40" />)}</div></div>;
  const exec = org.departments.find((d) => d.id === 'EXECUTIVE');
  const depts = org.departments.filter((d) => d.id !== 'EXECUTIVE');
  const running = org.stats.reduce((n, s) => n + s.running, 0);
  return (
    <>
      <PageHeader title={T('studio.title')} subtitle={T('studio.lead')} action={<Status tone={running ? 'info' : org.queue.queued ? 'neutral' : 'ok'} live={running > 0}>{running ? `${running} ${T('jobs.running')}` : org.queue.queued ? `${org.queue.queued} ${T('jobs.waiting')}` : T('status.connected')}</Status>} />

      {exec && (
        <Section title={exec.name} description={exec.responsibility} className="mb-10" action={<Link href={`/studio/departments/${exec.id}`} className="btn btn-subtle btn-sm">{T('btn.open')}</Link>}>
          <ul className="card divide-y divide-line/70 px-4 py-1">{org.agents.filter((a) => a.department === 'EXECUTIVE').map((a) => <AgentRow key={a.id} a={a} stat={org.stats.find((s) => s.agentId === a.id)} director={a.id === exec.directorId} />)}</ul>
        </Section>
      )}

      <Section title={T('studio.departments')} count={depts.length} className="mb-10">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{depts.map((d) => <DepartmentCard key={d.id} d={d} agents={org.agents} stats={org.stats} events={org.events} />)}</ul>
      </Section>

      <Section title={T('studio.pipeline')} description={T('studio.pipeline.hint')} className="mb-10">
        <PipelineGraph stages={org.pipeline} departments={org.departments} />
      </Section>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title={T('studio.activity')} description={T('studio.activity.hint')}>
          <div className="card px-5 py-2"><ActivityFeed events={org.events} agents={org.agents} departments={org.departments} /></div>
        </Section>
        <Section title={T('studio.reliability')} description={T('studio.reliability.hint')}>
          {rel ? <ReliabilityPanel r={rel} /> : <div className="skeleton h-40" />}
        </Section>
      </div>
    </>
  );
}
