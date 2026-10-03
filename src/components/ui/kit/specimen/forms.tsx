'use client';

import { useState } from 'react';
import { STYLES } from '@/domain/vocabulary';
import { T } from '@/lib/copy';
import { Button } from '../Button';
import { Segmented } from '../Choice';
import { Checkbox, ChipInput, Dropzone, ErrorSummary, Field, FormFooter, Input, SaveWord, Select, SettingsSummary, ShapedDropzone, Textarea, Toggle } from '../Field';
import { FilterChips, FiltersButton, FiltersDrawer, SearchField } from '../Filters';
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
    <SpecSection id="forms" title={'Forms'} lead={'Fields are 40 px (compact 32) on surface-1 with the control boundary; the focus is the light ring; every message is tied to its field.'}>
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
      <SpecRow label="Dropzone (upload)">
        <Cell state={'Rest'} wide><Dropzone label="Drop a song file here, or choose one" hint="MP3, WAV or M4A · up to 50 MB" accept="audio/*" onFile={() => undefined} /></Cell>
        <Cell state={'Drag over'} wide><div className="kit-spec-drag"><Dropzone label="Drop to upload" hint="One file" accept="audio/*" onFile={() => undefined} /></div></Cell>
        <Cell state={'Uploading'} wide><Dropzone label="river-lights.m4a" accept="audio/*" onFile={() => undefined} progress={0.42} /></Cell>
        <Cell state={'Error'} wide><Dropzone label="Drop a song file here, or choose one" hint="MP3, WAV or M4A" accept="audio/*" onFile={() => undefined} error={'That file is not audio. Choose an MP3, WAV or M4A.'} /></Cell>
        <Cell state={'Disabled, with its reason'} wide><Dropzone label="Upload a song" accept="audio/*" onFile={() => undefined} disabledReason="The library is read-only while the studio is paused." /></Cell>
        <Cell state={'Row'} wide><Dropzone row label="Add a reference picture" hint="PNG or JPEG" accept="image/*" onFile={() => undefined} /></Cell>
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

export function SearchSpec() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string[]>(['finished']);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string[]>>({ style: ['CARTOON'] });
  const count = Object.values(filters).reduce((n, v) => n + v.length, 0) + status.length;
  return (
    <SpecSection id="search" title="Search and filters" lead="A catalogue shows a chip row and one Filters button (more than six items); the drawer holds every facet. The state belongs in the URL (useCatalogueParams).">
      <SpecRow label="SearchField">
        <Cell state="Empty" wide><SearchField value={q} onChange={setQ} label="Search the shows" placeholder="Search the shows" /></Cell>
        <Cell state="With a query" wide><SearchField value="kite" onChange={() => undefined} label="Search the shows (filled)" /></Cell>
        <Cell state="Disabled" wide><SearchField value="" onChange={() => undefined} label="Search the shows (disabled)" disabled /></Cell>
      </SpecRow>
      <SpecRow label="FilterChips · FiltersButton">
        <div className="kit-spec-wide">
          <div className="filter-row">
            <FilterChips label="Status" multiple value={status} onChange={setStatus} options={[
              { value: 'finished', label: 'Finished', count: 4 }, { value: 'producing', label: 'Producing', count: 2 }, { value: 'waiting', label: 'Waiting for you', count: 1 },
              { value: 'draft', label: 'Draft', count: 0, disabled: true, reason: 'No drafts' },
            ]} />
            <FiltersButton count={count} onClick={() => setOpen(true)} expanded={open} />
          </div>
          <div className="filter-row">
            <span className="chip is-hover">Hover</span><span className="chip is-focus">Focus</span><span className="chip is-selected">Selected<span className="count">3</span></span><button type="button" className="chip" disabled>Disabled</button>
          </div>
        </div>
      </SpecRow>
      <FiltersDrawer open={open} onClose={() => setOpen(false)} value={filters} onChange={setFilters} resultCount={12} facets={[
        { id: 'style', label: 'Style', options: [{ value: 'CARTOON', label: 'Cartoon' }, { value: 'ANIME', label: 'Anime' }, { value: 'REALISTIC', label: 'Realistic' }] },
        { id: 'lang', label: 'Language', multiple: true, options: [{ value: 'EN', label: 'English' }, { value: 'AR', label: 'Arabic' }] },
      ]} />
    </SpecSection>
  );
}
