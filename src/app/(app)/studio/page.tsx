'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useOrg } from '@/studio/org';
import { handoffPair } from '@/studio/company';
import { useStudio } from '@/studio/store';
import { T } from '@/lib/copy';
import { PageHeader } from '@/components/ui/page';
import { Button, Notice } from '@/components/ui/kit';
import { CompanySpine, CompanyStage, EdgeLegend, RecentHandoffs, StageSkeleton, orchestratorLine, useCompany, type Selection } from '@/components/studio/Company';
import { CompanyInspector, OrchestratorView } from '@/components/studio/CompanyInspector';
import { fmtAgo } from '@/lib/format';

const VIEW_KEY = 'vewbox.company.view';

/** THE STUDIO COMPANY (docs/DESIGN-SYSTEM-V3.md §9.1) — the orchestrator constellation and its inspector, then the
 *  recent handoffs. Everything is read from the records: a department lights only while its agents work, a line
 *  exists only where a handoff was recorded. Reliability lives on Production. "View as list" (remembered) shows
 *  the spine at any width; `?select=CASTING` opens with that department selected. */
export default function StudioPage() {
  const router = useRouter();
  const { connected } = useStudio();
  const { data: org, error, reload, at } = useOrg();
  const company = useCompany(org);
  const [selection, setSelection] = useState<Selection>({ kind: 'orchestrator' });
  const [listView, setListView] = useState(false);
  useEffect(() => {
    try { setListView(localStorage.getItem(VIEW_KEY) === 'list'); } catch { /* the default view */ }
    const sel = new URLSearchParams(window.location.search).get('select');
    if (sel) setSelection({ kind: 'dept', id: sel });
  }, []);
  const toggleView = () => setListView((v) => { try { localStorage.setItem(VIEW_KEY, v ? 'orbit' : 'list'); } catch { /* fine */ } return !v; });

  // a polite line for each new handoff, at most one every 10 s
  const [announce, setAnnounce] = useState('');
  const seen = useRef<Set<string> | null>(null);
  const lastSaid = useRef(0);
  useEffect(() => {
    if (!org) return;
    const ids = new Set(org.handoffs.map((h) => h.id));
    const fresh = seen.current ? org.handoffs.filter((h) => !seen.current!.has(h.id)) : [];
    seen.current = ids;
    const h = fresh[0];
    const pair = h ? handoffPair(h) : null;
    if (!h || !pair || Date.now() - lastSaid.current < 10_000) return;
    const name = (id: string) => { const d = org.departments.find((x) => x.id === id); return d ? d.name : id; };
    lastSaid.current = Date.now();
    setAnnounce(T.f('co.announce', { from: name(pair.from), stage: T.dyn(`pipeline.${h.stage}`, h.stage), to: name(pair.to) }));
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <PageHeader size="display" title={T('nav.company')} subtitle={T('co.lead')} action={<Button aria-pressed={listView} onClick={toggleView} className="hidden md:inline-flex">{T('co.viewList')}</Button>} />;
  if (error && !org) return <>{header}<Notice tone="bad" title={T('co.error')} action={<Button onClick={reload}>{T('co.tryAgain')}</Button>}>{error}</Notice></>;
  if (!org || !company) return (
    <>{header}<div className="co-layout" aria-busy><StageSkeleton /><div className="panel hidden space-y-3 p-5 md:block"><div className="skeleton h-6 w-48" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line-short" /></div></div></>
  );
  const lastKnown = error && at ? fmtAgo(new Date(at).toISOString()) : null;
  const open = (id: string) => router.push(`/studio/departments/${id}`);
  const orchestratorPanel = (
    <section className="panel p-4" aria-labelledby="co-orch-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3"><h2 id="co-orch-h" className="h3">{T('orch.title')}</h2><span className="text-sm text-muted">{orchestratorLine(T, company)}</span></div>
      <OrchestratorView org={org} c={company} compact />
    </section>
  );
  return (
    <>
      {header}
      {!connected && <Notice tone="warn" className="mb-4">{T('status.disconnected')}</Notice>}
      <p aria-live="polite" className="sr-only">{announce}</p>
      {listView ? (
        <div className="max-w-[720px]"><CompanySpine org={org} company={company} orchestrator={orchestratorPanel} /></div>
      ) : (
        <>
          <div className="md:hidden"><CompanySpine org={org} company={company} orchestrator={orchestratorPanel} /></div>
          <div className="co-layout hidden md:grid">
            <div className="min-w-0">
              <CompanyStage org={org} company={company} selection={selection} onSelect={setSelection} onOpen={open} lastKnown={lastKnown} />
              <EdgeLegend />
            </div>
            <CompanyInspector org={org} company={company} selection={selection} onSelect={setSelection} error={error} onRetry={reload} />
          </div>
        </>
      )}
      <RecentHandoffs org={org} />
    </>
  );
}
