'use client';

import { useState } from 'react';
import { useT } from '../../locale';
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
  const T = useT();
  const rows: Array<[ButtonVariant, string, string]> = [
    ['primary', T('kit.spec.v.primary'), T('btn.save')],
    ['secondary', T('kit.spec.v.secondary'), T('btn.edit')],
    ['quiet', T('kit.spec.v.quiet'), T('btn.cancel')],
    ['danger', T('kit.spec.v.danger'), T('btn.remove')],
    ['destructive', T('kit.spec.v.destructive'), T('btn.delete')],
  ];
  return (
    <SpecSection id="buttons" title={T('kit.spec.sec.buttons')} lead={T('kit.spec.buttons.lead')}>
      {rows.map(([v, name, label]) => (
        <SpecRow key={v} label={name}>
          <Cell state={T('kit.spec.rest')}><Button variant={v}>{label}</Button></Cell>
          <Cell state={T('kit.spec.hover')}><Button variant={v} className="is-hover">{label}</Button></Cell>
          <Cell state={T('kit.spec.focus')}><Button variant={v} className="is-focus">{label}</Button></Cell>
          <Cell state={T('kit.spec.disabled')}><Button variant={v} disabled>{label}</Button></Cell>
          <Cell state={T('kit.spec.loading')}><Button variant={v} loading>{label}</Button></Cell>
        </SpecRow>
      ))}
      <SpecRow label={T('kit.spec.sizes')}>
        <Cell state="lg"><Button variant="primary" size="lg" icon={<IconPlus />}>{T('kit.spec.pal.newShow')}</Button></Cell>
        <Cell state="40"><Button icon={<IconEdit />}>{T('btn.edit')}</Button></Cell>
        <Cell state="sm"><Button size="sm">{T('btn.duplicate')}</Button></Cell>
        <Cell state="xs"><Button size="xs" variant="quiet">{T('btn.open')}</Button></Cell>
        <Cell state={T('kit.spec.iconOnly')}><Button aria-label={T('btn.edit')} icon={<IconEdit />} /></Cell>
        <Cell state={T('kit.spec.pressed')}><Button aria-pressed="true">{T('view.list')}</Button></Cell>
      </SpecRow>
    </SpecSection>
  );
}

export function StatusSpec() {
  const T = useT();
  const sub = useStageSub();
  return (
    <SpecSection id="status" title={T('kit.spec.sec.status')} lead={T('kit.spec.status.lead')}>
      <SpecRow label="StateWord">
        <Cell state="idle"><StateWord tone="idle">{T('kit.spec.tone.idle')}</StateWord></Cell>
        <Cell state="running"><StateWord tone="running">{T('kit.state.running')}</StateWord></Cell>
        <Cell state="done"><StateWord tone="done">{T('kit.spec.tone.done')}</StateWord></Cell>
        <Cell state="waiting"><StateWord tone="waiting">{T('kit.sub.waiting')}</StateWord></Cell>
        <Cell state="failed"><StateWord tone="failed">{T('kit.spec.tone.failed')}</StateWord></Cell>
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
        <Cell state="PRODUCE" wide><StageWord stage="PRODUCE" sub={sub.running(T('kit.spec.drawingShot'))} tone="running" /></Cell>
        <Cell state="FINAL_CUT"><StageWord stage="FINAL_CUT" /></Cell>
        <Cell state="COMPLETE"><StageWord stage="COMPLETE" /></Cell>
      </SpecRow>
      <SpecRow label="StatusStrip">
        <Cell state={T('kit.spec.rest')} wide><StatusStrip href="#approval">{T('kit.spec.strip')}</StatusStrip></Cell>
        <Cell state={T('kit.spec.focus')} wide><StatusStrip href="#approval" className="is-focus">{T('kit.spec.strip')}</StatusStrip></Cell>
      </SpecRow>
      <SpecRow label="Badge · FilterChip">
        <Cell state={T('kit.spec.count')}><Badge><span className="num">12</span></Badge></Cell>
        <Cell state="SAMPLE"><SampleBadge /></Cell>
        <Cell state={T('kit.spec.rest')}><FilterChip onRemove={() => undefined}>{T.dyn('style.CARTOON')}</FilterChip></Cell>
        <Cell state={T('kit.spec.hover')}><span className="filter-chip"><span>{T('label.arabic')}</span><button type="button" className="filter-chip-x is-hover" aria-label={T.f('kit.filter.remove', { label: T('label.arabic') })}><IconClose aria-hidden /></button></span></Cell>
      </SpecRow>
      <SpecRow label="ProgressBar">
        <Cell state="30 %" wide><ProgressBar value={0.3} label={T('kit.spec.progress')} /></Cell>
        <Cell state="75 %" wide><ProgressBar value={0.75} label={T('kit.spec.progress')} /></Cell>
      </SpecRow>
    </SpecSection>
  );
}

export function NavigationSpec() {
  const T = useT();
  const [tab, setTab] = useState('story');
  const tabs = [
    { id: 'overview', label: T('tab.overview') },
    { id: 'story', label: T('tab.story') },
    { id: 'storyboard', label: T('tab.storyboard'), count: 20 },
    { id: 'produce', label: T('tab.produce') },
    { id: 'final', label: T('tab.finalCut'), disabled: true },
  ];
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>({ style: ['CARTOON'], lang: ['AR'] });
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const [view, setView] = useState<View>('grid');
  const facets: Facet[] = [
    { id: 'style', label: T('lib.filterStyle'), kind: 'one', options: ['CARTOON', 'ANIME', 'REALISTIC'].map((s) => ({ value: s, label: T.dyn(`style.${s}`) })) },
    { id: 'lang', label: T('lib.filterLanguage'), kind: 'many', options: [{ value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }] },
  ];
  return (
    <SpecSection id="navigation" title={T('kit.spec.sec.navigation')} lead={T('kit.spec.navigation.lead')}>
      <SpecRow label="TabBar">
        <div className="min-w-0 flex-1">
          <TabBar tabs={tabs} current={tab} onSelect={setTab} ariaLabel={T('kit.spec.tabsLabel')} idBase="kit-tabs" />
          {tabs.map((x) => <TabPanel key={x.id} idBase="kit-tabs" id={x.id} current={tab} className="pt-4"><p className="text-muted">{T.f('kit.spec.panel', { name: typeof x.label === 'string' ? x.label : x.id })}</p></TabPanel>)}
        </div>
      </SpecRow>
      <SpecRow label={T('kit.spec.states')}>
        <Cell state={T('kit.spec.hover')}><span className="tab is-hover">{T('tab.overview')}</span></Cell>
        <Cell state={T('kit.spec.focus')}><span className="tab is-focus">{T('tab.produce')}</span></Cell>
        <Cell state={T('kit.spec.selected')}><span className="tab is-selected">{T('tab.story')}</span></Cell>
        <Cell state={T('kit.spec.disabled')}><span className="tab is-disabled">{T('tab.finalCut')}</span></Cell>
      </SpecRow>
      <SpecRow label="Crumbs">
        <Crumbs items={[{ href: '#navigation', label: T('kit.spec.show') }, { href: '#navigation', label: T('kit.spec.season') }, { href: '#navigation', label: T('kit.spec.episode') }, { label: T('kit.spec.shot') }]} />
      </SpecRow>
      <SpecRow label="CatalogueBar">
        <div className="min-w-0 flex-1">
          <CatalogueBar q={q} onQ={setQ} placeholder={T('kit.spec.searchCast')} facets={facets} filters={filters} onFilters={setFilters}
            sort={sort} sorts={[{ value: 'recent', label: T('lib.sortRecent') }, { value: 'title', label: T('lib.sortTitle') }]} onSort={setSort} view={view} onView={setView} />
        </div>
      </SpecRow>
      <p className="caption">{T('kit.spec.anchorNote')}</p>
    </SpecSection>
  );
}

export function ChoicesSpec() {
  const T = useT();
  const [light, setLight] = useState<'day' | 'dusk' | 'night'>('dusk');
  const [mode, setMode] = useState<'song' | 'video'>('song');
  const [method, setMethod] = useState<'auto' | 'manual'>('auto');
  const [start, setStart] = useState<'describe' | 'sheet' | 'picture'>('describe');
  return (
    <SpecSection id="choices" title={T('kit.spec.sec.choices')} lead={T('kit.spec.choices.lead')}>
      <SpecRow label="Segmented">
        <Cell state={T('kit.spec.selected')}>
          <Segmented label={T('label.lighting')} value={light} onChange={setLight} options={[{ value: 'day', label: T('kit.spec.day') }, { value: 'dusk', label: T('kit.spec.dusk') }, { value: 'night', label: T('kit.spec.night') }]} />
        </Cell>
        <Cell state={T('kit.spec.disabled')} wide>
          <Segmented label={T('kit.spec.songVideo')} value={mode} onChange={setMode} options={[{ value: 'song', label: T('kit.spec.song') }, { value: 'video', label: T('kit.spec.video'), disabled: true, reason: T('kit.spec.noCut') }]} />
        </Cell>
        <Cell state={T('kit.spec.hover')}>
          <span className="seg" aria-hidden><span className="is-hover">{T('kit.spec.day')}</span><span className="is-selected">{T('kit.spec.dusk')}</span></span>
        </Cell>
        <Cell state="sm">
          <Segmented size="sm" label={T('label.lighting')} value={light} onChange={setLight} options={[{ value: 'day', label: T('kit.spec.day') }, { value: 'dusk', label: T('kit.spec.dusk') }, { value: 'night', label: T('kit.spec.night') }]} />
        </Cell>
      </SpecRow>
      <SpecRow label="ChoiceTiles · 2">
        <div className="min-w-0 flex-1">
          <ChoiceTiles label={T('kit.create.how')} value={method} onChange={setMethod} options={[
            { value: 'auto', label: T('kit.create.auto'), hint: T('kit.create.autoHint'), icon: <IconAuto /> },
            { value: 'manual', label: T('kit.create.manual'), hint: T('kit.create.manualHint'), icon: <IconManual /> },
          ]} />
        </div>
      </SpecRow>
      <SpecRow label="ChoiceTiles · 3">
        <div className="min-w-0 flex-1">
          <ChoiceTiles columns={3} label={T('kit.spec.startLabel')} value={start} onChange={setStart} options={[
            { value: 'describe', label: T('kit.spec.tile.describe'), hint: T('kit.spec.tile.describeHint'), icon: <IconScript /> },
            { value: 'sheet', label: T('kit.spec.tile.sheet'), hint: T('kit.spec.tile.sheetHint'), icon: <IconEdit /> },
            { value: 'picture', label: T('kit.spec.drop.picture'), icon: <IconImageAdd />, disabled: true, reason: T('kit.spec.tile.needEngine') },
          ]} />
        </div>
      </SpecRow>
      <SpecRow label={T('kit.spec.states')}>
        <Cell state={T('kit.spec.hover')} wide><span className="choice-tile is-hover" aria-hidden><span className="choice-tile-text"><span className="choice-tile-title">{T('kit.create.manual')}</span></span><span className="radio-mark" /></span></Cell>
        <Cell state={T('kit.spec.focus')} wide><span className={cls('choice-tile', 'is-focus', 'is-selected')} aria-hidden><span className="choice-tile-text"><span className="choice-tile-title">{T('kit.create.auto')}</span></span><span className="radio-mark" /></span></Cell>
      </SpecRow>
    </SpecSection>
  );
}
