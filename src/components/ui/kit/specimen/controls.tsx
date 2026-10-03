'use client';

import { useState } from 'react';
import { T } from '@/lib/copy';
import { IconAuto, IconClose, IconEdit, IconImageAdd, IconManual, IconPlus, IconScript } from '../../icons';
import { Button, type ButtonVariant } from '../Button';
import { CatalogueBar, type Facet, type Filters, type View } from '../CatalogueBar';
import { ChoiceTiles, Segmented } from '../Choice';
import { cls } from '../cls';
import { Badge, FilterChip, IdentityState, ProgressBar, StageWord, StateWord, StatusStrip, useStageSub } from '../Status';
import { SampleBadge } from '../States';
import { Crumbs, TabBar, TabPanel } from '../Tabs';
import { Cell, SpecRow, SpecSection } from './parts';

export function ButtonsSpec() {
  const rows: Array<[ButtonVariant, string, string]> = [
    ['primary', 'Primary', 'Save'],
    ['secondary', 'Secondary', 'Edit'],
    ['quiet', 'Quiet', 'Cancel'],
    ['danger', 'Danger', 'Remove'],
    ['destructive', 'Destructive (dialogs only)', 'Delete'],
  ];
  return (
    <SpecSection id="buttons" title={'Buttons'} lead={'One ivory primary per region. The filled red button lives only inside a confirm.'}>
      {rows.map(([v, name, label]) => (
        <SpecRow key={v} label={name}>
          <Cell state={'Rest'}><Button variant={v}>{label}</Button></Cell>
          <Cell state={'Hover'}><Button variant={v} className="is-hover">{label}</Button></Cell>
          <Cell state={'Focus'}><Button variant={v} className="is-focus">{label}</Button></Cell>
          <Cell state={'Disabled'}><Button variant={v} disabled>{label}</Button></Cell>
          <Cell state={'Loading'}><Button variant={v} loading>{label}</Button></Cell>
        </SpecRow>
      ))}
      <SpecRow label={'Sizes'}>
        <Cell state="lg"><Button variant="primary" size="lg" icon={<IconPlus />}>New show</Button></Cell>
        <Cell state="40"><Button icon={<IconEdit />}>Edit</Button></Cell>
        <Cell state="sm"><Button size="sm">Duplicate</Button></Cell>
        <Cell state="xs"><Button size="xs" variant="quiet">Open</Button></Cell>
        <Cell state={'Icon only'}><Button aria-label={'Edit'} icon={<IconEdit />} /></Cell>
        <Cell state={'Pressed'}><Button aria-pressed="true">List</Button></Cell>
      </SpecRow>
    </SpecSection>
  );
}

export function StatusSpec() {
  const sub = useStageSub();
  return (
    <SpecSection id="status" title={'Status'} lead={'State lives under the picture, in words: a dot and a phrase, never colour alone.'}>
      <SpecRow label="StateWord">
        <Cell state="idle"><StateWord tone="idle">Not started</StateWord></Cell>
        <Cell state="running"><StateWord tone="running">Running</StateWord></Cell>
        <Cell state="done"><StateWord tone="done">Done</StateWord></Cell>
        <Cell state="waiting"><StateWord tone="waiting">Waiting for you</StateWord></Cell>
        <Cell state="failed"><StateWord tone="failed">Failed</StateWord></Cell>
      </SpecRow>
      <SpecRow label="IdentityState">
        <Cell state="draft"><IdentityState state="draft" /></Cell>
        <Cell state="approved"><IdentityState state="approved" /></Cell>
        <Cell state="locked"><IdentityState state="locked" videos={2} /></Cell>
        <Cell state="none"><IdentityState state="none" /></Cell>
      </SpecRow>
      <SpecRow label="StageWord">
        <Cell state="STORY"><StageWord stage="STORY" sub={sub.refused} tone="failed" /></Cell>
        <Cell state="CAST_AND_WORLD"><StageWord stage="CAST_AND_WORLD" /></Cell>
        <Cell state="STORYBOARD"><StageWord stage="STORYBOARD" sub={sub.waiting} tone="waiting" /></Cell>
        <Cell state="PRODUCE" wide><StageWord stage="PRODUCE" sub={sub.running('drawing shot 7 of 20')} tone="running" /></Cell>
        <Cell state="FINAL_CUT"><StageWord stage="FINAL_CUT" /></Cell>
        <Cell state="COMPLETE"><StageWord stage="COMPLETE" /></Cell>
      </SpecRow>
      <SpecRow label="StatusStrip">
        <Cell state={'Rest'} wide><StatusStrip href="#approval">Waiting for you: approve the story of Episode 4</StatusStrip></Cell>
        <Cell state={'Focus'} wide><StatusStrip href="#approval" className="is-focus">Waiting for you: approve the story of Episode 4</StatusStrip></Cell>
      </SpecRow>
      <SpecRow label="Badge · FilterChip">
        <Cell state={'Count'}><Badge><span className="num">12</span></Badge></Cell>
        <Cell state="SAMPLE"><SampleBadge /></Cell>
        <Cell state={'Rest'}><FilterChip onRemove={() => undefined}>{T.dyn('style.CARTOON')}</FilterChip></Cell>
        <Cell state={'Hover'}><span className="filter-chip"><span>Arabic</span><button type="button" className="filter-chip-x is-hover" aria-label={`Remove the filter ${'Arabic'}`}><IconClose aria-hidden /></button></span></Cell>
      </SpecRow>
      <SpecRow label="ProgressBar">
        <Cell state="30 %" wide><ProgressBar value={0.3} label={'Progress of the export'} /></Cell>
        <Cell state="75 %" wide><ProgressBar value={0.75} label={'Progress of the export'} /></Cell>
      </SpecRow>
    </SpecSection>
  );
}

export function NavigationSpec() {
  const [tab, setTab] = useState('story');
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'story', label: 'Story' },
    { id: 'storyboard', label: 'Storyboard', count: 20 },
    { id: 'produce', label: 'Produce' },
    { id: 'final', label: 'Final Cut', disabled: true },
  ];
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>({ style: ['CARTOON'], lang: ['AR'] });
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const [view, setView] = useState<View>('grid');
  const facets: Facet[] = [
    { id: 'style', label: 'Style', kind: 'one', options: ['CARTOON', 'ANIME', 'REALISTIC'].map((s) => ({ value: s, label: T.dyn(`style.${s}`) })) },
    { id: 'lang', label: 'Language', kind: 'many', options: [{ value: 'EN', label: 'English' }, { value: 'AR', label: 'Arabic' }] },
  ];
  return (
    <SpecSection id="navigation" title={'In-page navigation'} lead={'Switching is instant: only the 2 px underline moves. The arrow keys follow the reading direction.'}>
      <SpecRow label="TabBar">
        <div className="min-w-0 flex-1">
          <TabBar tabs={tabs} current={tab} onSelect={setTab} ariaLabel={'Episode workspace'} idBase="kit-tabs" />
          {tabs.map((x) => <TabPanel key={x.id} idBase="kit-tabs" id={x.id} current={tab} className="pt-4"><p className="text-muted">{`The ${typeof x.label === 'string' ? x.label : x.id} panel. No fade: it is simply there.`}</p></TabPanel>)}
        </div>
      </SpecRow>
      <SpecRow label={'States'}>
        <Cell state={'Hover'}><span className="tab is-hover">Overview</span></Cell>
        <Cell state={'Focus'}><span className="tab is-focus">Produce</span></Cell>
        <Cell state={'Selected'}><span className="tab is-selected">Story</span></Cell>
        <Cell state={'Disabled'}><button type="button" className="tab" disabled>Final Cut</button></Cell>
      </SpecRow>
      <SpecRow label="Crumbs">
        <Crumbs items={[{ href: '#navigation', label: 'The Last Sip' }, { href: '#navigation', label: 'Season 1' }, { href: '#navigation', label: 'Episode 3' }, { label: 'Shot 12' }]} />
      </SpecRow>
      <SpecRow label="CatalogueBar">
        <div className="min-w-0 flex-1">
          <CatalogueBar q={q} onQ={setQ} placeholder={'Search the cast…'} facets={facets} filters={filters} onFilters={setFilters}
            sort={sort} sorts={[{ value: 'recent', label: 'Recently updated' }, { value: 'title', label: 'Title' }]} onSort={setSort} view={view} onView={setView} />
        </div>
      </SpecRow>
      <p className="caption">The row of section links at the top of this page is the AnchorNav: it follows the section in view.</p>
    </SpecSection>
  );
}

export function ChoicesSpec() {
  const [light, setLight] = useState<'day' | 'dusk' | 'night'>('dusk');
  const [mode, setMode] = useState<'song' | 'video'>('song');
  const [method, setMethod] = useState<'auto' | 'manual'>('auto');
  const [start, setStart] = useState<'describe' | 'sheet' | 'picture'>('describe');
  return (
    <SpecSection id="choices" title={'Choices'} lead={'One Tab stop per group; the arrow keys move the choice. A disabled choice says why, in words.'}>
      <SpecRow label="Segmented">
        <Cell state={'Selected'}>
          <Segmented label={'Lighting states'} value={light} onChange={setLight} options={[{ value: 'day', label: 'Day' }, { value: 'dusk', label: 'Dusk' }, { value: 'night', label: 'Night' }]} />
        </Cell>
        <Cell state={'Disabled'} wide>
          <Segmented label={'Song or video'} value={mode} onChange={setMode} options={[{ value: 'song', label: 'Song' }, { value: 'video', label: 'Video', disabled: true, reason: 'No cut yet' }]} />
        </Cell>
        <Cell state={'Hover'}>
          <span className="seg" aria-hidden><span className="is-hover">Day</span><span className="is-selected">Dusk</span></span>
        </Cell>
        <Cell state="sm">
          <Segmented size="sm" label={'Lighting states'} value={light} onChange={setLight} options={[{ value: 'day', label: 'Day' }, { value: 'dusk', label: 'Dusk' }, { value: 'night', label: 'Night' }]} />
        </Cell>
      </SpecRow>
      <SpecRow label="ChoiceTiles · 2">
        <div className="min-w-0 flex-1">
          <ChoiceTiles label={'How do you want to start?'} value={method} onChange={setMethod} options={[
            { value: 'auto', label: 'Let the studio propose', hint: 'A line is enough. You review everything before anything is made.', icon: <IconAuto /> },
            { value: 'manual', label: 'Write it yourself', hint: 'A title or a line; every other field has a sensible default.', icon: <IconManual /> },
          ]} />
        </div>
      </SpecRow>
      <SpecRow label="ChoiceTiles · 3">
        <div className="min-w-0 flex-1">
          <ChoiceTiles columns={3} label={'How do you want to start the character?'} value={start} onChange={setStart} options={[
            { value: 'describe', label: 'Describe them', hint: 'A line about who they are.', icon: <IconScript /> },
            { value: 'sheet', label: 'Fill in a sheet', hint: 'Name, look and voice, field by field.', icon: <IconEdit /> },
            { value: 'picture', label: 'From a picture', icon: <IconImageAdd />, disabled: true, reason: 'Needs the image engine, which is not running.' },
          ]} />
        </div>
      </SpecRow>
      <SpecRow label={'States'}>
        <Cell state={'Hover'} wide><span className="choice-tile is-hover" aria-hidden><span className="choice-tile-text"><span className="choice-tile-title">Write it yourself</span></span><span className="radio-mark" /></span></Cell>
        <Cell state={'Focus'} wide><span className={cls('choice-tile', 'is-focus', 'is-selected')} aria-hidden><span className="choice-tile-text"><span className="choice-tile-title">Let the studio propose</span></span><span className="radio-mark" /></span></Cell>
      </SpecRow>
    </SpecSection>
  );
}
