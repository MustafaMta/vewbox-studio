'use client';

import type { ReactNode } from 'react';
import { JOB_LABELS, type JobType } from '@/domain/jobs';
import { agentName, schemaFields, skillStatusOf, stepName, stepsOf, type OrgAgent, type OrgSkill, type OrgTool } from '@/studio/org';
import { useT, type TFn } from '@/components/ui/locale';
import { Details, Status } from '@/components/ui/kit';
import { failureWords } from './people';

/** THE INTERNALS, IN WORDS — what an agent executes, a tool with its typed contract, a skill with how it is used,
 *  its computed status and the evidence behind it. These sit behind a named disclosure on the department and agent
 *  pages ("How this department works", "Technical details"); ids and file paths appear only here, in mono. */

export const resourceWords = (T: TFn, r: string) => T.dyn(`res.${r}`, r);
/** Constants in prose become words: APPEARANCE_LOCKED → "the appearance lock", DESIGN_CHARACTER → “Design a
 *  character” (a job type by its label, quoted). */
export const constWords = (T: TFn, s: string) => s
  .replace(/\b(APPEARANCE_LOCKED|VOICE_LOCKED)\b/g, (m) => T.dyn(`agent.const.${m}`, m))
  .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b(?:PRODUCE|EXPORT|ASSEMBLE)\b/g, (m) => { const label = JOB_LABELS[m as JobType]?.[T.locale]; return label ? (T.locale === 'ar' ? `«${label}»` : `“${label}”`) : m; });
export const jobWords = (T: TFn, t: string) => JOB_LABELS[t as JobType]?.[T.locale] ?? t.toLowerCase().replace(/_/g, ' ');

/** What an agent executes: its job types (in words), the payload routes it takes, and its delegated steps. */
export function executesOf(T: TFn, a: OrgAgent): { jobs: string[]; steps: string[] } {
  const jobs = [...a.jobTypes.map((t) => jobWords(T, t)), ...(a.payloadRoutes ?? []).map((r) => `${jobWords(T, r.jobType)} (${T.f('agent.whenRoute', { when: r.when })})`)];
  return { jobs, steps: stepsOf(a).map((s) => stepName(s, T.locale)) };
}
export function ExecutesLine({ agent, className = '' }: { agent: OrgAgent; className?: string }) {
  const T = useT();
  const { jobs, steps } = executesOf(T, agent);
  if (!jobs.length && !steps.length) return <span className={className}>{T('dept.noPath')}</span>;
  return (
    <span className={className}>
      {jobs.length > 0 && <span><span className="text-faint">{T('dept.executes')}:</span> {jobs.join(' · ')}</span>}
      {jobs.length > 0 && steps.length > 0 && <span className="text-faint"> · </span>}
      {steps.length > 0 && <span><span className="text-faint">{T('dept.steps')}:</span> {steps.join(' · ')}</span>}
    </span>
  );
}

/** A contract's fields as a compact table: name (mono), type, required or optional, the field's own note. */
export function ContractFields({ schema, label }: { schema: unknown; label: string }) {
  const T = useT();
  const rows = schemaFields(schema);
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted">{label}</p>
      {rows.length === 0 ? <p className="mt-1 text-xs text-faint">{T('dept.contract.noFields')}</p> : (
        <ul className="mt-1 space-y-1">
          {rows.map((r) => (
            <li key={r.name} className="text-xs leading-5" dir="ltr">
              <span className="mono text-body">{r.name}</span> <span className="mono break-all text-faint">{r.type}</span> <span className={r.required ? 'text-muted' : 'text-faint'}>· {r.required ? T('dept.required') : T('dept.optional')}</span>
              {r.description && <span className="block text-faint">{r.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One tool: its name and what it does; the version, engine, limits, permissions, failure classes and the typed
 *  input/output contract behind "Technical details". */
export function ToolEntry({ tool }: { tool: OrgTool }) {
  const T = useT();
  return (
    <li className="py-3">
      <p className="text-sm"><span className="font-medium text-fg">{tool.name}</span> <span className="text-muted">— <span dir="auto">{tool.description}</span></span></p>
      <Details summary={T('dept.technical')} className="mt-1.5">
        <div className="space-y-3 rounded-[var(--r-2)] bg-input p-3">
          <p className="text-xs text-muted"><span className="mono text-body">{tool.id}</span> · {T.f('dept.toolMeta', { v: tool.version, res: resourceWords(T, tool.resource), min: Math.max(1, Math.round(tool.timeoutMs / 60_000)) })}</p>
          {tool.permissions.length > 0 && <p className="text-xs text-muted">{T('dept.permissions')}: <span className="mono">{tool.permissions.join(', ')}</span></p>}
          {tool.errors.length > 0 && <p className="text-xs text-muted">{T('dept.errors')}: {tool.errors.map((e) => failureWords(T, e)).join(', ')}</p>}
          {tool.contract ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ContractFields schema={tool.contract.input} label={`${T('dept.contract.input')} · ${tool.inputSchema}`} />
              <ContractFields schema={tool.contract.output} label={`${T('dept.contract.output')} · ${tool.outputSchema}`} />
            </div>
          ) : <p className="text-xs text-faint">{T('dept.contract.none')}</p>}
        </div>
      </Details>
    </li>
  );
}

/** One skill: name, how it is used (kind), its computed status with the reason, the evidence (code and tests, with
 *  any missing file marked), whom its text is sent to, and the text itself behind a disclosure. */
export function SkillEntry({ skill, agents }: { skill: OrgSkill; agents: OrgAgent[] }) {
  const T = useT();
  const st = skillStatusOf(skill);
  const ev = skill.evidence;
  const who = (ids: string[]) => ids.map((id) => { const a = agents.find((x) => x.id === id); return a ? agentName(a, T.locale) : id; }).join(', ');
  const files = (xs: Array<{ path: string; present: boolean }>): ReactNode => xs.map((f, i) => <span key={f.path}>{i > 0 && ', '}<span className="mono break-all">{f.path}</span>{!f.present && <span className="text-bad"> ({T('skill.missing')})</span>}</span>);
  const statusLabel = st.key === 'VERIFIED' ? T('studio.skillValidated') : st.key === 'UNAVAILABLE' ? T('studio.skillUnavailable') : T('studio.skillDraft');
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium text-fg">{skill.name}</span>
        <span className="text-muted">{T.dyn(`skill.kind.${skill.kind}`, skill.kind)}</span>
        <Status tone={st.tone}>{statusLabel}</Status>
      </div>
      {st.reason && <p className="mt-0.5 text-xs text-faint" dir="auto">{st.reason}</p>}
      {ev && (
        <dl className="mt-1.5 space-y-0.5 text-xs text-muted">
          {ev.implementedBy.length > 0 && <div><dt className="inline text-faint">{T('skill.implementedBy')}: </dt><dd className="inline" dir="ltr">{files(ev.implementedBy)}</dd></div>}
          {ev.verifiedBy.length > 0 && <div><dt className="inline text-faint">{T('skill.verifiedBy')}: </dt><dd className="inline" dir="ltr">{files(ev.verifiedBy)}</dd></div>}
          {ev.injectedInto.length > 0 && <div><dt className="inline text-faint">{T('skill.injectedInto')}: </dt><dd className="inline">{who(ev.injectedInto)}</dd></div>}
        </dl>
      )}
      {skill.instructions && (
        <Details summary={`${T('studio.instructions')} · ${T.f('skill.version', { v: skill.version })}`} className="mt-1.5">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--r-2)] bg-input p-3 font-sans text-xs leading-relaxed text-body" dir="auto">{skill.instructions}</pre>
        </Details>
      )}
    </li>
  );
}
