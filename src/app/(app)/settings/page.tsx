'use client';

import { useEffect, useState } from 'react';
import { ASPECTS, DIALECTS, LANGUAGES, STYLES } from '@/domain/vocabulary';
import { JOB_LABELS, type JobType } from '@/domain/jobs';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { PageHeader, Section } from '@/components/ui/page';
import { Button, ConfirmButton, Field, Segmented, Select, Status, Toggle } from '@/components/ui/kit';
import { IconRetry } from '@/components/ui/icons';
import { aspectLabel, dialectLabel } from '@/lib/format';

interface EngineRow { ok: boolean; detail: string; where: 'hosted' | 'local' | null; backend?: string; model?: string }
interface StatusBody { video: EngineRow; story: EngineRow; images: EngineRow; voice: EngineRow; transcription: EngineRow; music: EngineRow; gpu: { device?: string; vramTotal?: number; vramFree?: number } | null; minimaxConfigured: boolean }
interface RegistryBody { models: Array<{ name: string; version: string; license: string; kind: string; local: boolean; status: string; bytes?: number | null }>; workflows: Array<{ name: string; version: string; nodes: number }> }
interface MetricsBody { hours: number; queue: { queued: number; running: number; failed24h: number; completed24h: number }; jobs: Array<{ type: string; completed: number; failed: number; cancelled: number; running: number; meanAttempts: number; p50Ms: number | null }>; metrics: Array<{ name: string; unit: string | null; count: number; p50: number; p95: number }> }

const fmtMs = (ms: number | null) => (ms === null || !Number.isFinite(ms) ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 120_000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`);
const fmtGb = (b?: number | null) => (b ? `${(b / 1073741824).toFixed(b > 10 * 1073741824 ? 0 : 1)} GB` : '');

/** MODELS AND RELIABILITY — the registry rows (what weights exist and whether their engine sees them) and job
 *  outcomes with timings, straight from the database. Nothing here is estimated. */
function RegistryPanels() {
  const T = useT();
  const [reg, setReg] = useState<RegistryBody | null>(null);
  const [met, setMet] = useState<MetricsBody | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    fetch('/api/registry', { cache: 'no-store' }).then((r) => r.json()).then(setReg).catch(() => setReg(null));
    fetch('/api/metrics?hours=168', { cache: 'no-store' }).then((r) => r.json()).then(setMet).catch(() => setMet(null));
  }, []);
  // reading the registry never asks the engines; this does (the worker also checks on every start)
  const checkAgain = () => { setChecking(true); fetch('/api/registry', { method: 'POST', cache: 'no-store' }).then((r) => r.json()).then(setReg).catch(() => undefined).finally(() => setChecking(false)); };
  const tone = (s: string) => (s === 'PRESENT' || s === 'CONFIGURED' || s === 'SERVICE' ? 'ok' : s === 'MISSING' || s === 'NO_KEY' ? 'warn' : 'neutral');
  const label = (s: string) => T.dyn(`registry.status.${s}`);
  const shown = reg ? (open ? reg.models : reg.models.filter((m) => m.status !== 'PRESENT' || !m.local || m.kind === 'DIFFUSION')) : [];
  const more = reg && reg.models.length > shown.length ? <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{T('registry.showAll')} ({reg.models.length})</Button> : open ? <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{T('registry.showFewer')}</Button> : null;
  return (
    <>
      <Section id="models" title={T('registry.title')} description={T('registry.lead')} action={<span className="flex flex-wrap items-center gap-2">{more}<Button size="sm" icon={<IconRetry />} loading={checking} onClick={checkAgain}>{T('btn.refresh')}</Button></span>}>
        <div className="card divide-y divide-line p-0">
          {!reg && <p className="px-5 py-3 text-[12.5px] text-muted">…</p>}
          {shown.map((m) => (
            <div key={m.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0"><p className="truncate font-latin text-[13px] text-fg">{m.name}</p><p className="text-[12px] text-muted">{m.kind.toLowerCase().replace('_', ' ')} · {m.license}{m.bytes ? ` · ${fmtGb(m.bytes)}` : ''}</p></div>
              <div className="flex items-center gap-2"><span className="badge">{m.local ? T('status.local') : T('status.hosted')}</span><Status tone={tone(m.status)}>{label(m.status)}</Status></div>
            </div>
          ))}
          {reg && reg.workflows.length > 0 && <div className="px-5 py-3 text-[12px] text-muted">{T('registry.workflows')}: {reg.workflows.map((w) => `${w.name}@${w.version}`).join(' · ')}</div>}
        </div>
      </Section>
      <Section id="reliability" title={T('reliability.title')} description={T('reliability.lead')}>
        <div className="card divide-y divide-line p-0">
          {!met && <p className="px-5 py-3 text-[12.5px] text-muted">…</p>}
          {met && met.jobs.length === 0 && <p className="px-5 py-3 text-[12.5px] text-muted">{T('reliability.none')}</p>}
          {met?.jobs.map((j) => (
            <div key={j.type} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
              <p className="text-[13px] font-medium text-fg">{JOB_LABELS[j.type as JobType]?.[T.locale] ?? j.type}</p>
              <p className="num text-[12.5px] text-muted">{j.completed} {T('reliability.completed')} · {j.failed} {T('reliability.failed')} · {j.cancelled} {T('reliability.cancelled')}{j.running ? ` · ${j.running} ${T('reliability.running')}` : ''} · {T('reliability.attempts')} {j.meanAttempts.toFixed(2)} · p50 {fmtMs(j.p50Ms)}</p>
            </div>
          ))}
          {met && met.metrics.length > 0 && (
            <div className="px-5 py-3">
              <p className="mb-1 text-[12px] font-medium text-fg">{T('reliability.timings')}</p>
              <ul className="space-y-0.5">{met.metrics.map((m) => <li key={m.name} className="num flex justify-between gap-3 text-[12px] text-muted"><span className="font-latin">{m.name}</span><span>n={m.count} · p50 {m.unit === 'ms' ? fmtMs(m.p50) : m.p50.toFixed(2)} · p95 {m.unit === 'ms' ? fmtMs(m.p95) : m.p95.toFixed(2)}</span></li>)}</ul>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

/** SETTINGS — the interface, defaults for new projects, the engines (what runs where, live), and the studio's data:
 *  what it holds, how it began, and the one way to empty it. */
export default function SettingsPage() {
  const T = useT();
  const { state, act, startEmpty, seeded, connected } = useStudio();
  const toast = useToast();
  const s = state.settings;
  const set = (patch: Parameters<typeof act<'updateSettings'>>[1]) => act('updateSettings', patch);
  const empty = state.productions.length + state.characters.length + state.locations.length + state.shows.length === 0;
  const files = state.assets.filter((a) => !a.sample).length;
  const holds = T('settings.data.holds').replace('{productions}', String(state.productions.length)).replace('{characters}', String(state.characters.length)).replace('{locations}', String(state.locations.length)).replace('{files}', String(files));
  const began = seeded?.at ? T(seeded.kind === 'sample' ? 'settings.data.began.sample' : 'settings.data.began.empty').replace('{date}', new Date(seeded.at).toLocaleDateString(T.locale === 'ar' ? 'ar-IQ' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })) : null;
  const [status, setStatus] = useState<StatusBody | null>(null);
  const [checking, setChecking] = useState(false);
  const check = () => { setChecking(true); fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).then(setStatus).catch(() => setStatus(null)).finally(() => setChecking(false)); };
  useEffect(() => { check(); }, []);
  const rows: Array<[string, EngineRow | undefined]> = status ? [[T('status.video'), status.video], [T('status.story'), status.story], [T('status.images'), status.images], [T('status.voice'), status.voice], [T('status.transcription'), status.transcription], [T('status.music'), status.music]] : [];
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader title={T('nav.settings')} subtitle={T('settings.lead')} className="mb-0" />
      <Section title={T('settings.interface')}>
        <div className="card space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[13.5px] font-medium text-fg">{T('label.interfaceLanguage')}</span><Segmented label={T('label.interfaceLanguage')} value={s.uiLanguage} onChange={(v) => set({ uiLanguage: v })} options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} /></div>
          <div className="divider" />
          <Toggle label={T('settings.motion')} help={T('settings.motion.hint')} checked={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
        </div>
      </Section>
      <Section title={T('settings.defaults')}>
        <div className="card grid gap-4 p-5 sm:grid-cols-2">
          <Field label={T('label.style')}><Select value={s.defaults.style} onChange={(e) => set({ defaults: { ...s.defaults, style: e.target.value as typeof s.defaults.style } })} options={STYLES.map((x) => ({ value: x, label: T.dyn(`style.${x}`) }))} /></Field>
          <Field label={T('label.aspect')}><Select value={s.defaults.aspect} onChange={(e) => set({ defaults: { ...s.defaults, aspect: e.target.value as typeof s.defaults.aspect } })} options={ASPECTS.map((x) => ({ value: x, label: aspectLabel(x) }))} /></Field>
          <Field label={T('label.language')}><Select value={s.defaults.language} onChange={(e) => set({ defaults: { ...s.defaults, language: e.target.value as typeof s.defaults.language } })} options={LANGUAGES.map((x) => ({ value: x, label: x === 'EN' ? T('label.english') : T('label.arabic') }))} /></Field>
          <Field label={T('label.dialect')}><Select value={s.defaults.dialect} onChange={(e) => set({ defaults: { ...s.defaults, dialect: e.target.value as typeof s.defaults.dialect } })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x, T.locale) }))} /></Field>
        </div>
      </Section>
      <Section id="generation" title={T('status.title')} description={T('status.lead')} action={<Button size="sm" icon={<IconRetry />} loading={checking} onClick={check}>{T('btn.refresh')}</Button>}>
        <div className="card divide-y divide-line p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><span className="text-[13.5px] font-medium text-fg">{T('app.name')}</span>{connected ? <Status tone="ok">{T('status.connected')}</Status> : <Status tone="warn" live>{T('status.disconnected')}</Status>}</div>
          {rows.map(([label, r]) => (
            <div key={label} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0"><p className="text-[13.5px] font-medium text-fg">{label}</p><p className="text-[12.5px] text-muted" dir="auto">{r?.detail ?? '—'}{r?.model ? ` · ${r.model}` : ''}</p></div>
              <div className="flex items-center gap-2">{r?.where && <span className="badge">{r.where === 'hosted' ? T('status.hosted') : T('status.local')}</span>}{r ? <Status tone={r.ok ? 'ok' : 'warn'}>{r.ok ? T('status.ready') : T('status.notReady')}</Status> : <Status>{T('status.offline')}</Status>}</div>
            </div>
          ))}
          {status?.gpu && <div className="px-5 py-3 text-[12.5px] text-muted">GPU: {status.gpu.device} · {status.gpu.vramFree && status.gpu.vramTotal ? `${Math.round(status.gpu.vramFree / 1073741824)} / ${Math.round(status.gpu.vramTotal / 1073741824)} GB free` : ''}</div>}
          {status && !status.minimaxConfigured && <div className="px-5 py-3 text-[12.5px] text-muted">{T('settings.generation.body')}</div>}
        </div>
      </Section>
      <RegistryPanels />
      <Section id="data" title={T('settings.data')} description={T('settings.data.hint')}>
        <div className="card space-y-4 p-5">
          <div className="space-y-1">
            {empty ? <Status tone="neutral">{T('settings.data.empty')}</Status> : <p className="text-[13.5px] text-body">{holds}</p>}
            {began && <p className="text-[12.5px] text-muted">{began}</p>}
          </div>
          <div className="divider" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-[13px] text-muted">{T('settings.startEmpty.hint')}</p>
            <ConfirmButton variant="secondary" label={T('settings.startEmpty')} title={T('settings.startEmpty')} message={T('settings.startEmptyConfirm')} confirmLabel={T('settings.startEmpty')} onConfirm={() => { void startEmpty().then(() => toast.ok(T('toast.emptied'))); }} />
          </div>
        </div>
      </Section>
      <Section title={T('settings.about')}>
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted">{T('settings.about.body')}</p>
      </Section>
    </div>
  );
}
