'use client';

import { useState } from 'react';
import { useOrg, useReliability } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { PageHeader, Section } from '@/components/ui/page';
import { ActivityFeed, ReliabilityPanel } from '@/components/studio/org';
import { CompanyDiagram, EdgeDetail, OrchestratorPanel } from '@/components/studio/Orchestrator';
import { Notice } from '@/components/ui/kit';

/** THE STUDIO COMPANY — the organisation as a diagram: the Studio Orchestrator in the centre, the departments
 *  around it, the handoffs between them. Everything shown is read from the records (runs, handoffs, approvals,
 *  jobs); a department lights only while its agents work. Selecting the orchestrator opens the state of every
 *  production; a department opens its workspace; a connection opens the handoff behind it. */
export default function StudioPage() {
  const T = useT();
  const { connected } = useStudio();
  const { data: org, error } = useOrg();
  const { data: rel } = useReliability(24 * 7);
  const [panel, setPanel] = useState<'orchestrator' | null>(null);
  const [edge, setEdge] = useState<string | null>(null);
  if (error) return <><PageHeader title={T('nav.company')} /><Notice tone="bad" title={T('status.disconnected')}>{error}</Notice></>;
  if (!org) return <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96" /><div className="skeleton mt-8 aspect-[16/11] max-h-[720px]" /></div>;
  return (
    <>
      <PageHeader title={T('nav.company')} subtitle={T('studio.lead')} className="mb-6" />
      {!connected && <Notice tone="warn" className="mb-4">{T('status.disconnected')}</Notice>}
      <CompanyDiagram org={org} selectedEdge={edge} onSelectEdge={(k) => { setEdge(k); if (k) setPanel(null); }} orchestratorOpen={panel === 'orchestrator'} onSelectOrchestrator={() => { setPanel((p) => (p === 'orchestrator' ? null : 'orchestrator')); setEdge(null); }} />
      <p className="mt-3 text-[12px] text-faint">{T('orch.selectHint')}</p>
      <div className="mt-6 space-y-6">
        {panel === 'orchestrator' && <OrchestratorPanel org={org} />}
        {edge && <EdgeDetail org={org} edgeKey={edge} onClose={() => setEdge(null)} />}
      </div>

      <div className="mt-12 grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title={T('studio.activity')} description={T('studio.activity.hint')}>
          <div className="card px-5 py-2"><ActivityFeed events={org.events.slice(0, 30)} agents={org.agents} departments={org.departments} /></div>
        </Section>
        <Section title={T('studio.reliability')} description={T('studio.reliability.hint')}>
          {rel ? <ReliabilityPanel r={rel} /> : <div className="skeleton h-40" />}
        </Section>
      </div>
    </>
  );
}
