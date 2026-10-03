'use client';

import { useState } from 'react';
import { STYLES } from '@/domain/vocabulary';
import { T } from '@/lib/copy';
import { Button } from '../Button';
import { Segmented } from '../Choice';
import { Checkbox, ChipInput, ErrorSummary, Field, FormFooter, Input, SaveWord, Select, SettingsSummary, ShapedDropzone, Textarea, Toggle } from '../Field';
import { Recorder } from '../Recorder';
import { Cell, SpecRow, SpecSection } from './parts';

export function FormsSpec() {
  const [marks, setMarks] = useState<string[]>(['Round glasses', 'A scar over the brow']);
  const [style, setStyle] = useState('CARTOON');
  const [previews, setPreviews] = useState(true);
  const [keep, setKeep] = useState(true);
  const [picked, setPicked] = useState<{ name: string; src?: string; kind?: 'image' | 'audio' } | null>({ name: 'layla-full-body.svg', src: '/sample/characters/layla-full-body.svg', kind: 'image' });
  const [refused, setRefused] = useState<string | null>(null);
  const styleOptions = STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }));
  return (
    <SpecSection id="forms" title={'Forms'} lead={'Fields are 40 px (compact 32), the focus is an iris edge, and every message is tied to its field.'}>
      <SpecRow label="Field">
        <Cell state={'Rest'} wide><Field label={'Title'} help={'Shown on the key art and in the catalogue.'}><Input placeholder={'The Kite'} /></Field></Cell>
        <Cell state={'Hover'} wide><Field label={'Title'}><Input className="is-hover" defaultValue={'The Kite'} /></Field></Cell>
        <Cell state={'Focus'} wide><Field label={'Title'}><Input className="is-focus" defaultValue={'The Kite'} /></Field></Cell>
        <Cell state={'Disabled'} wide><Field label={'Title'} help={'Locked: an episode of this show is finished.'}><Input disabled defaultValue={'The Kite'} /></Field></Cell>
        <Cell state={'Error'} wide><Field label={'Title'} error={'Give the show a title.'}><Input defaultValue="" /></Field></Cell>
        <Cell state={'Optional'} wide><Field label={'Notes'} optional><Textarea rows={2} placeholder={'A line is enough.'} /></Field></Cell>
      </SpecRow>
      <SpecRow label="Select · Checkbox · Toggle">
        <Cell state={'Rest'} wide><Field label={'Visual style'}><Select value={style} onChange={(e) => setStyle(e.target.value)} options={styleOptions} /></Field></Cell>
        <Cell state={'Selected'} wide><Checkbox label={'Keep the earlier version'} checked={keep} onChange={(e) => setKeep(e.target.checked)} /></Cell>
        <Cell state={'Selected'} wide><Toggle label={'Hero previews'} help={'A muted preview plays once, after 2 seconds.'} checked={previews} onChange={setPreviews} /></Cell>
      </SpecRow>
      <SpecRow label="ErrorSummary">
        <div className="min-w-0 flex-1">
          <ErrorSummary errors={[
            { id: 'kit-err-title', message: 'Give the show a title.' }, { id: 'kit-err-style', message: 'Choose a visual style.' },
            { id: 'kit-err-lang', message: 'Choose a language.' }, { id: 'kit-err-brief', message: 'Write a line about the story.' },
          ]} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={'Title'} error={'Give the show a title.'}><Input id="kit-err-title" /></Field>
            <Field label={'Visual style'} error={'Choose a visual style.'}><Select id="kit-err-style" value="" onChange={() => undefined} placeholder="—" options={styleOptions} /></Field>
            <Field label={'Language'} error={'Choose a language.'}><Select id="kit-err-lang" value="" onChange={() => undefined} placeholder="—" options={[{ value: 'EN', label: 'English' }, { value: 'AR', label: 'Arabic' }]} /></Field>
            <Field label={'What happens in this episode?'} error={'Write a line about the story.'}><Input id="kit-err-brief" /></Field>
          </div>
        </div>
      </SpecRow>
      <SpecRow label="SettingsSummary">
        <div className="min-w-0 flex-1">
          <SettingsSummary items={['For The Kite', T.dyn(`style.${style}`), 'Arabic (Iraqi Baghdadi)']}>
            <Field label={'Visual style'}><Select value={style} onChange={(e) => setStyle(e.target.value)} options={styleOptions} /></Field>
          </SettingsSummary>
        </div>
      </SpecRow>
      <SpecRow label="ChipInput">
        <div className="min-w-0 flex-1 max-w-[var(--measure-form)]">
          <Field label={'Distinguishing marks'} help={'Enter or a comma adds it; Backspace in the empty field removes the last one.'}><ChipInput value={marks} onChange={setMarks} placeholder={'Type a mark, then Enter'} /></Field>
        </div>
      </SpecRow>
      <SpecRow label="ShapedDropzone">
        <Cell state="928:1664">
          <ShapedDropzone ratio="928/1664" label={'From a picture'} hint={'PNG or JPEG, 512 px or more'} accept="image/png,image/jpeg" file={picked}
            onFile={(f) => { if (/svg|gif/.test(f.type)) { setRefused('SVG and GIF are refused. Choose a PNG or a JPEG.'); return; } setRefused(null); setPicked({ name: f.name, src: URL.createObjectURL(f), kind: 'image' }); }}
            onRemove={() => setPicked(null)} error={refused} className="w-[11rem]" />
        </Cell>
        <Cell state="1:1"><ShapedDropzone ratio="1/1" label={'Sleeve artwork'} hint="PNG · JPEG" accept="image/png,image/jpeg" onFile={() => undefined} className="w-[12rem]" /></Cell>
        <Cell state={`16:9 · ${'Error'}`} wide><ShapedDropzone ratio="16/9" label={'A photo of the place'} accept="image/png,image/jpeg" onFile={() => undefined} error={'SVG and GIF are refused. Choose a PNG or a JPEG.'} className="w-[18rem]" /></Cell>
        <Cell state="4:1" wide><ShapedDropzone ratio="4/1" label={'The song file'} accept="audio/*" onFile={() => undefined} className="w-[22rem] max-w-full" /></Cell>
      </SpecRow>
      <SpecRow label="Recorder">
        <div className="min-w-0 flex-1 max-w-[var(--measure-form)]"><Recorder onRecorded={() => undefined} primary /></div>
      </SpecRow>
      <SpecRow label="FormFooter · SaveWord">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-4"><SaveWord state="saved" /><SaveWord state="saving" /><SaveWord state="unsaved" /></div>
          <FormFooter start={<span className="caption">About a minute.</span>}>
            <Button variant="quiet">Cancel</Button>
            <Button variant="primary">Save</Button>
          </FormFooter>
        </div>
      </SpecRow>
      <SpecRow label={'Compact'}>
        <div data-density="compact" className="min-w-0 flex-1 kit-spec-sample">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={'Title'}><Input defaultValue={'The Kite'} /></Field>
            <Field label={'Visual style'}><Select value={style} onChange={(e) => setStyle(e.target.value)} options={styleOptions} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented label={'Lighting states'} value="dusk" onChange={() => undefined} options={[{ value: 'day', label: 'Day' }, { value: 'dusk', label: 'Dusk' }]} />
            <Button size="sm">Duplicate</Button>
            <Button variant="primary">Save</Button>
          </div>
        </div>
      </SpecRow>
    </SpecSection>
  );
}
