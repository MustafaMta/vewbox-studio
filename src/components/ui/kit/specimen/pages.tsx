'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../locale';
import { IconPlus, IconRetry } from '../../icons';
import { ApprovalCard } from '../ApprovalCard';
import { Button, LinkButton } from '../Button';
import { Segmented } from '../Choice';
import { CompactHeader } from '../CompactHeader';
import { CreationShell, MadeNotice, ReviewActions, Stepper, useMethodOptions, type CreationMethod } from '../Creation';
import { Field, SaveWord, SettingsSummary, Textarea } from '../Field';
import { MenuButton, MenuItem } from '../Overlay';
import { PageHeader } from '../PageHeader';
import { ErrorNotice, LoadingFrame, LoadingLine, Notice, PageEmpty, PartialLine, SampleBadge, SectionEmpty, TextBars } from '../States';
import { StateWord } from '../Status';
import { TabBar } from '../Tabs';
import { Cell, Slot, SpecRow, SpecSection } from './parts';

export function StatesSpec() {
  const T = useT();
  return (
    <SpecSection id="states" title={T('kit.spec.sec.states')} lead={T('kit.spec.states.lead')}>
      <SpecRow label="PageEmpty">
        <div className="min-w-0 flex-1">
          <PageEmpty art={<Slot ratio="16/9" className="w-[min(100%,22rem)]">{T('kit.spec.slot.titleCard')}</Slot>}
            primary={<Button variant="primary" icon={<IconPlus />}>{T('kit.spec.pal.newShow')}</Button>}
            alternatives={<Button>{T('kit.create.manual')}</Button>}>
            {T('kit.spec.empty.page')}
          </PageEmpty>
        </div>
      </SpecRow>
      <SpecRow label="SectionEmpty">
        <SectionEmpty action={<Button size="sm">{T('kit.spec.empty.action')}</Button>}>{T('kit.spec.empty.section')}</SectionEmpty>
      </SpecRow>
      <SpecRow label={T('kit.spec.loading')}>
        <Cell state="16:9"><LoadingFrame ratio="16/9" label={T('kit.spec.loadingKeyArt')} className="w-[14rem]" /></Cell>
        <Cell state={T('kit.spec.phase')}><LoadingFrame ratio="2/3" phase={T('jp.drawing')} lines={1} className="w-[8rem]" /></Cell>
        <Cell state="TextBars"><div className="w-[12rem]"><TextBars lines={3} /></div></Cell>
        <Cell state="LoadingLine" wide><LoadingLine /></Cell>
      </SpecRow>
      <SpecRow label="ErrorNotice">
        <div className="min-w-0 flex-1">
          <ErrorNotice live={false} title={T('err.PROVIDER')} why={T('err.PROVIDER.hint')} kept={T('kit.spec.err.kept')}
            action={<Button size="sm" icon={<IconRetry />}>{T('err.PROVIDER.fix')}</Button>} alternatives={<Button size="sm" variant="quiet">{T('err.openJob')}</Button>}
            details="RuntimeError: out of memory while sampling (step 14 of 30) at sampler.run (graph node 7)" />
        </div>
      </SpecRow>
      <SpecRow label="PartialLine · SAMPLE">
        <PartialLine items={[T('kit.spec.episode4'), T('kit.spec.cutMissing'), T('kit.spec.shotsChosen')]} />
        <SampleBadge />
      </SpecRow>
      <SpecRow label="Notice">
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
          <Notice tone="info" title={T('kit.spec.notice.info')} />
          <Notice tone="ok" title={T('kit.spec.notice.ok')} />
          <Notice tone="warn" title={T('kit.spec.notice.warn')} />
          <Notice tone="bad" title={T('kit.spec.notice.bad')} icon={undefined} />
        </div>
      </SpecRow>
    </SpecSection>
  );
}

function Paper() {
  const T = useT();
  return <div className="paper prose-copy p-5" dir="auto">{T('kit.spec.approval.excerpt')}</div>;
}
function Frames() {
  const T = useT();
  return (
    <div>
      <div className="kit-spec-frames">
        {['01', '02', '03', '04', '05', '06'].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={n} src={`/sample/frames/frame-${n}-a.svg`} alt={T.f('kit.spec.frameAlt', { n: Number(n) })} />
        ))}
      </div>
      <SampleBadge className="mt-2" />
    </div>
  );
}

export function ApprovalSpec() {
  const T = useT();
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return (
    <SpecSection id="approval" title={T('kit.spec.sec.approval')} lead={T('kit.spec.approval.lead')}>
      <ApprovalCard id="kit-story" media={<Paper />} kind={T('tab.story')} title={T('kit.spec.approval.title')} provenance={T('kit.spec.approval.from')} ask={T('kit.spec.approval.ask')}
        onApprove={() => wait(900)} onRequestChanges={() => wait(600)} openHref="#approval" onUndo={() => undefined} />
      <ApprovalCard id="kit-frames" media={<Frames />} kind={T('tab.storyboard')} title={T('kit.spec.approval.title')} provenance={T('kit.spec.approval.from')} ask={T('kit.spec.approval.askFrames')}
        onApprove={() => undefined} busy />
      <ApprovalCard id="kit-failed" media={<Paper />} kind={T('tab.story')} title={T('kit.spec.approval.title')} ask={T('kit.spec.approval.ask')}
        onApprove={() => undefined} failure={<ErrorNotice live={false} title={T('kit.approval.failed')} why={T('kit.approval.failedWhy')} details="POST /api/commands 503 (approveStory)" />} />
      <ApprovalCard id="kit-done" kind={T('tab.story')} title={T('kit.spec.approval.title')} onApprove={() => undefined} approved onUndo={() => undefined} />
    </SpecSection>
  );
}

export function HeadersSpec() {
  const T = useT();
  const hero = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState('storyboard');
  // the lobby example opens scrolled past its hero, so the header is seen in its shown state
  useEffect(() => { if (box.current && hero.current) box.current.scrollTop = hero.current.offsetHeight + 24; }, []);
  const more = <MenuButton label={T('nav.more')} iconOnly variant="quiet" size="sm"><MenuItem>{T('btn.edit')}</MenuItem><MenuItem>{T('btn.duplicate')}</MenuItem></MenuButton>;
  return (
    <SpecSection id="headers" title={T('kit.spec.sec.headers')} lead={T('kit.spec.headers.lead')}>
      <div className="kit-spec-sample">
        <PageHeader className="!mb-0" back={{ href: '#headers', label: T('nav.characters') }} eyebrow={T('kit.spec.header.eyebrow')} title={T('nav.characters')} count={7} subtitle={T('kit.spec.header.lead')}
          primary={<Button variant="primary" icon={<IconPlus />}>{T('kit.spec.newChar')}</Button>} secondary={<Button>{T('btn.select')}</Button>} more={<MenuButton label={T('nav.more')} iconOnly variant="quiet"><MenuItem>{T('btn.edit')}</MenuItem></MenuButton>} />
      </div>
      <SpecRow label={`CompactHeader · ${T('kit.spec.lobby')}`}>
        <div ref={box} className="kit-spec-scrollbox" tabIndex={0} aria-label={T('kit.spec.scrollbox')}>
          <CompactHeader mode="lobby" watch={hero} scrollRoot={box} contained back={{ href: '#headers', label: T('kit.spec.backShows') }} title={T('kit.spec.show')}
            status={<StateWord tone="waiting">{T('kit.sub.waiting')}</StateWord>} primary={<Button size="sm" variant="primary">{T('kit.spec.continue')}</Button>} more={more} />
          <div ref={hero}><Slot ratio="21/9">{T('kit.spec.slot.hero')}</Slot></div>
          <p className="mt-4 text-muted">{T('kit.spec.scrollHint')}</p>
          <TextBars lines={3} className="mt-6" />
          <TextBars lines={3} className="mt-6" />
          <TextBars lines={3} className="mt-6 pb-40" />
        </div>
      </SpecRow>
      <SpecRow label={`CompactHeader · ${T('kit.spec.cutting')}`}>
        <div className="kit-spec-scrollbox kit-spec-cutting" data-room="cutting" data-density="compact" tabIndex={0} aria-label={T('kit.spec.scrollbox')}>
          <CompactHeader mode="cutting" contained back={{ href: '#headers', label: T('kit.spec.backShows') }} title={T('kit.spec.episode')} status={<StateWord tone="running">{T('kit.state.running')}</StateWord>}
            tabs={<TabBar tabs={[{ id: 'story', label: T('tab.story') }, { id: 'storyboard', label: T('tab.storyboard') }, { id: 'produce', label: T('tab.produce') }]} current={tab} onSelect={setTab} ariaLabel={T('kit.spec.tabsLabel')} />}
            save={<SaveWord state="saved" />} primary={<Button size="sm" variant="primary">{T('kit.spec.continue')}</Button>} more={more} />
          <div className="mt-4 grid gap-4"><TextBars lines={3} /><TextBars lines={3} /><TextBars lines={3} className="pb-24" /></div>
        </div>
      </SpecRow>
    </SpecSection>
  );
}

export function CreationSpec() {
  const T = useT();
  const methods = useMethodOptions();
  const [method, setMethod] = useState<CreationMethod>('auto');
  const [brief, setBrief] = useState('');
  const [len, setLen] = useState('6');
  return (
    <SpecSection id="creation" title={T('kit.spec.sec.creation')} lead={T('kit.spec.creation.lead')}>
      <div>
        <CreationShell
          back={{ href: '#creation', label: T('kit.spec.backTo') }} cancel={{ href: '#creation' }}
          title={T('kit.spec.newEpisode')} slate={<p className="slate">{T('kit.spec.creation.slate')}</p>}
          method={{ value: method, onChange: setMethod, options: methods }}
          preview={<Slot ratio="16/9">{brief ? <span className="t-card-lg text-muted" dir="auto">{brief}</span> : T('kit.spec.slot.titleCard')}</Slot>}
          estimate={T('kit.spec.estimate')} primary={<Button variant="primary">{method === 'auto' ? T('kit.spec.propose') : T('btn.create')}</Button>}
          moreControl={<Segmented label={T('kit.spec.length')} value={len} onChange={setLen} options={[{ value: '3', label: T('kit.spec.len3') }, { value: '6', label: T('kit.spec.len6') }, { value: '10', label: T('kit.spec.len10') }]} />}
        >
          <Field label={T('kit.spec.brief')} optional><Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={T('kit.spec.briefPh')} /></Field>
          <SettingsSummary className="mt-4" items={[T('kit.spec.forShow'), T.dyn('style.CARTOON'), T('kit.spec.lang')]}>
            <Segmented label={T('kit.spec.length')} value={len} onChange={setLen} options={[{ value: '3', label: T('kit.spec.len3') }, { value: '6', label: T('kit.spec.len6') }]} />
          </SettingsSummary>
        </CreationShell>
      </div>
      <SpecRow label="Stepper">
        <Stepper steps={[{ id: 'identity', label: T('kit.spec.step.identity') }, { id: 'look', label: T('kit.spec.step.look') }, { id: 'voice', label: T('tab.voice') }]} current={1} />
      </SpecRow>
      <SpecRow label="ReviewActions">
        <div className="min-w-0 flex-1"><ReviewActions onCreate={() => undefined} onAnother={() => undefined} onPreferences={() => undefined} /></div>
      </SpecRow>
      <SpecRow label="MadeNotice">
        <div className="min-w-0 flex-1"><MadeNotice next={<LinkButton href="#approval" size="sm">{T('kit.spec.made.next')}</LinkButton>} onDismiss={() => undefined}>{T('kit.spec.made')}</MadeNotice></div>
      </SpecRow>
    </SpecSection>
  );
}
