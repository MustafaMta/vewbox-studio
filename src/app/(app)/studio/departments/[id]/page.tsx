'use client';

import { useParams } from 'next/navigation';
import { useEvents, useOrg } from '@/studio/org';
import { useT } from '@/components/ui/locale';
import { PageHeader, Section } from '@/components/ui/page';
import { ActivityFeed, AgentRow, PipelineGraph, SkillChip, ToolChip, deptHue } from '@/components/studio/org';
import { cls } from '@/components/ui/kit';

/** A DEPARTMENT'S WORKSPACE — its responsibility and stages, its director and agents with their real numbers, the
 *  skills and tools its people use, and its own activity. */
export default function DepartmentPage() {
  const T = useT();
  const { id } = useParams<{ id: string }>();
  const { data: org } = useOrg();
  const { data: ev } = useEvents({ department: id, limit: 80 });
  if (!org) return <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96" /></div>;
  const d = org.departments.find((x) => x.id === id);
  if (!d) return <PageHeader title={id} subtitle="No such department." back={{ href: '/studio', label: T('studio.title') }} />;
  const agents = org.agents.filter((a) => a.department === d.id);
  const director = org.agents.find((a) => a.id === d.directorId);
  const skillIds = Array.from(new Set(agents.flatMap((a) => a.skills)));
  const toolIds = Array.from(new Set(agents.flatMap((a) => a.tools)));
  const stages = org.pipeline.filter((s) => d.stages.includes(s.id));
  return (
    <>
      <div className={cls('-mx-5 -mt-6 mb-8 bg-gradient-to-b to-transparent px-5 pt-6 sm:-mx-8 sm:-mt-8 sm:px-8 sm:pt-8 lg:-mt-10 lg:pt-10', deptHue(d.id))}>
        <PageHeader title={d.name} titleAr={d.nameAr} eyebrow={d.id === 'EXECUTIVE' ? T('studio.executive') : `${T('studio.stages')}: ${d.stages.map((s) => T.dyn(`pipeline.${s}`, s)).join(' · ')}`} subtitle={d.responsibility} back={{ href: '/studio', label: T('studio.title') }} className="mb-2" />
        <p className="pb-6 text-[13px] text-muted">{T('studio.director')}: <span className="text-fg">{director?.name ?? d.directorId}</span>{director && director.department !== d.id ? ` (${org.departments.find((x) => x.id === director.department)?.name})` : ''}</p>
      </div>

      {stages.length > 0 && <Section title={T('studio.stages')} className="mb-10"><PipelineGraph stages={stages} departments={org.departments} /></Section>}

      <Section title={T('studio.agents')} count={agents.length} className="mb-10">
        <ul className="card divide-y divide-line/70 px-4 py-1">{agents.map((a) => <AgentRow key={a.id} a={a} stat={org.stats.find((s) => s.agentId === a.id)} director={a.id === d.directorId} />)}</ul>
      </Section>

      <div className="mb-10 grid gap-6 md:grid-cols-2">
        <Section title={T('studio.skills')} count={skillIds.length}><ul className="flex flex-wrap gap-2">{skillIds.map((sid) => { const s = org.skills.find((x) => x.id === sid); return s ? <li key={sid}><SkillChip s={s} /></li> : null; })}</ul></Section>
        <Section title={T('studio.tools')} count={toolIds.length}><ul className="flex flex-wrap gap-2">{toolIds.map((tid) => { const t = org.tools.find((x) => x.id === tid); return t ? <li key={tid}><ToolChip t={t} /></li> : null; })}</ul></Section>
      </div>

      <Section title={T('studio.activity')} description={T('studio.activity.hint')}>
        <div className="card px-5 py-2"><ActivityFeed events={ev?.events ?? []} agents={org.agents} departments={org.departments} /></div>
      </Section>
    </>
  );
}
