'use client';

import { ASPECTS, DIALECTS, LANGUAGES, STYLES } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { updateSettings } from '@/domain/actions';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { PageHeader, Section } from '@/components/ui/page';
import { ConfirmButton, Field, Segmented, Select, Status, Toggle } from '@/components/ui/kit';
import { IconBlocked } from '@/components/ui/icons';
import { aspectLabel, dialectLabel } from '@/lib/format';

/** SETTINGS — the interface, defaults for new projects, the sample data, and the one honest note about generation.
 *  Quiet and practical: a heading, a card, the controls. */
export default function SettingsPage() {
  const T = useT();
  const { state, act, reset, startEmpty, modified } = useStudio();
  const toast = useToast();
  const s = state.settings;
  const set = (patch: Parameters<typeof updateSettings>[1]) => act('updateSettings', patch);
  const empty = state.productions.length + state.characters.length + state.locations.length + state.shows.length === 0;
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
      <Section id="generation" title={T('settings.generation')}>
        <div className="card flex gap-4 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn"><IconBlocked className="size-[18px]" aria-hidden /></span>
          <div>
            <div className="flex items-center gap-2 text-[14px] font-semibold text-fg"><span className="dot bg-warn" aria-hidden />{T('app.notConnected')}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{T('settings.generation.body')}</p>
          </div>
        </div>
      </Section>
      <Section id="data" title={T('settings.data')} description={T('settings.data.hint')}>
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {empty ? <Status tone="neutral">{T('settings.data.empty')}</Status> : modified ? <Status tone="info">{T('settings.data.modified')}</Status> : <Status tone="ok">{T('settings.data.pristine')}</Status>}
            <ConfirmButton variant="secondary" label={T('btn.reset')} title={T('btn.reset')} message={T('settings.resetConfirm')} confirmLabel={T('btn.reset')} onConfirm={() => { void reset().then(() => toast.ok(T('toast.reset'))); }} />
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
