'use client';

import { useState } from 'react';
import { STYLES } from '@/domain/vocabulary';
import { useT } from '../../locale';
import { Button } from '../Button';
import { Segmented } from '../Choice';
import { Checkbox, ChipInput, ErrorSummary, Field, FormFooter, Input, SaveWord, Select, SettingsSummary, ShapedDropzone, Textarea, Toggle } from '../Field';
import { Recorder } from '../Recorder';
import { Cell, SpecRow, SpecSection } from './parts';

export function FormsSpec() {
  const T = useT();
  const [marks, setMarks] = useState<string[]>([T('kit.spec.chip1'), T('kit.spec.chip2')]);
  const [style, setStyle] = useState('CARTOON');
  const [previews, setPreviews] = useState(true);
  const [keep, setKeep] = useState(true);
  const [picked, setPicked] = useState<{ name: string; src?: string; kind?: 'image' | 'audio' } | null>({ name: 'layla-full-body.svg', src: '/sample/characters/layla-full-body.svg', kind: 'image' });
  const [refused, setRefused] = useState<string | null>(null);
  const styleOptions = STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }));
  return (
    <SpecSection id="forms" title={T('kit.spec.sec.forms')} lead={T('kit.spec.forms.lead')}>
      <SpecRow label="Field">
        <Cell state={T('kit.spec.rest')} wide><Field label={T('label.title')} help={T('kit.spec.help.title')}><Input placeholder={T('kit.spec.ph.title')} /></Field></Cell>
        <Cell state={T('kit.spec.hover')} wide><Field label={T('label.title')}><Input className="is-hover" defaultValue={T('kit.spec.ph.title')} /></Field></Cell>
        <Cell state={T('kit.spec.focus')} wide><Field label={T('label.title')}><Input className="is-focus" defaultValue={T('kit.spec.ph.title')} /></Field></Cell>
        <Cell state={T('kit.spec.disabled')} wide><Field label={T('label.title')} help={T('kit.spec.help.locked')}><Input disabled defaultValue={T('kit.spec.ph.title')} /></Field></Cell>
        <Cell state={T('kit.spec.error')} wide><Field label={T('label.title')} error={T('kit.spec.err.title')}><Input defaultValue="" /></Field></Cell>
        <Cell state={T('kit.spec.optional')} wide><Field label={T('label.notes')} optional><Textarea rows={2} placeholder={T('kit.spec.briefPh')} /></Field></Cell>
      </SpecRow>
      <SpecRow label="Select · Checkbox · Toggle">
        <Cell state={T('kit.spec.rest')} wide><Field label={T('label.style')}><Select value={style} onChange={(e) => setStyle(e.target.value)} options={styleOptions} /></Field></Cell>
        <Cell state={T('kit.spec.selected')} wide><Checkbox label={T('kit.spec.check')} checked={keep} onChange={(e) => setKeep(e.target.checked)} /></Cell>
        <Cell state={T('kit.spec.selected')} wide><Toggle label={T('kit.spec.toggle')} help={T('kit.spec.toggleHint')} checked={previews} onChange={setPreviews} /></Cell>
      </SpecRow>
      <SpecRow label="ErrorSummary">
        <div className="min-w-0 flex-1">
          <ErrorSummary errors={[
            { id: 'kit-err-title', message: T('kit.spec.err.title') }, { id: 'kit-err-style', message: T('kit.spec.err.style') },
            { id: 'kit-err-lang', message: T('kit.spec.err.lang') }, { id: 'kit-err-brief', message: T('kit.spec.err.brief') },
          ]} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={T('label.title')} error={T('kit.spec.err.title')}><Input id="kit-err-title" /></Field>
            <Field label={T('label.style')} error={T('kit.spec.err.style')}><Select id="kit-err-style" value="" onChange={() => undefined} placeholder="—" options={styleOptions} /></Field>
            <Field label={T('label.language')} error={T('kit.spec.err.lang')}><Select id="kit-err-lang" value="" onChange={() => undefined} placeholder="—" options={[{ value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }]} /></Field>
            <Field label={T('kit.spec.brief')} error={T('kit.spec.err.brief')}><Input id="kit-err-brief" /></Field>
          </div>
        </div>
      </SpecRow>
      <SpecRow label="SettingsSummary">
        <div className="min-w-0 flex-1">
          <SettingsSummary items={[T('kit.spec.forKite'), T.dyn(`style.${style}`), T('kit.spec.lang')]}>
            <Field label={T('label.style')}><Select value={style} onChange={(e) => setStyle(e.target.value)} options={styleOptions} /></Field>
          </SettingsSummary>
        </div>
      </SpecRow>
      <SpecRow label="ChipInput">
        <div className="min-w-0 flex-1 max-w-[var(--measure-form)]">
          <Field label={T('label.distinguishing')} help={T('kit.spec.chipHelp')}><ChipInput value={marks} onChange={setMarks} placeholder={T('kit.spec.chipPh')} /></Field>
        </div>
      </SpecRow>
      <SpecRow label="ShapedDropzone">
        <Cell state="928:1664">
          <ShapedDropzone ratio="928/1664" label={T('kit.spec.drop.picture')} hint={T('kit.spec.drop.pictureHint')} accept="image/png,image/jpeg" file={picked}
            onFile={(f) => { if (/svg|gif/.test(f.type)) { setRefused(T('kit.spec.drop.refused')); return; } setRefused(null); setPicked({ name: f.name, src: URL.createObjectURL(f), kind: 'image' }); }}
            onRemove={() => setPicked(null)} error={refused} className="w-[11rem]" />
        </Cell>
        <Cell state="1:1"><ShapedDropzone ratio="1/1" label={T('kit.spec.drop.sleeve')} hint="PNG · JPEG" accept="image/png,image/jpeg" onFile={() => undefined} className="w-[12rem]" /></Cell>
        <Cell state={`16:9 · ${T('kit.spec.error')}`} wide><ShapedDropzone ratio="16/9" label={T('kit.spec.drop.plate')} accept="image/png,image/jpeg" onFile={() => undefined} error={T('kit.spec.drop.refused')} className="w-[18rem]" /></Cell>
        <Cell state="4:1" wide><ShapedDropzone ratio="4/1" label={T('kit.spec.drop.audio')} accept="audio/*" onFile={() => undefined} className="w-[22rem] max-w-full" /></Cell>
      </SpecRow>
      <SpecRow label="Recorder">
        <div className="min-w-0 flex-1 max-w-[var(--measure-form)]"><Recorder onRecorded={() => undefined} primary /></div>
      </SpecRow>
      <SpecRow label="FormFooter · SaveWord">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-4"><SaveWord state="saved" /><SaveWord state="saving" /><SaveWord state="unsaved" /></div>
          <FormFooter start={<span className="caption">{T('kit.spec.estimate')}</span>}>
            <Button variant="quiet">{T('btn.cancel')}</Button>
            <Button variant="primary">{T('btn.save')}</Button>
          </FormFooter>
        </div>
      </SpecRow>
      <SpecRow label={T('kit.spec.density.compact')}>
        <div data-density="compact" className="min-w-0 flex-1 kit-spec-sample">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={T('label.title')}><Input defaultValue={T('kit.spec.ph.title')} /></Field>
            <Field label={T('label.style')}><Select value={style} onChange={(e) => setStyle(e.target.value)} options={styleOptions} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented label={T('label.lighting')} value="dusk" onChange={() => undefined} options={[{ value: 'day', label: T('kit.spec.day') }, { value: 'dusk', label: T('kit.spec.dusk') }]} />
            <Button size="sm">{T('btn.duplicate')}</Button>
            <Button variant="primary">{T('btn.save')}</Button>
          </div>
        </div>
      </SpecRow>
    </SpecSection>
  );
}
