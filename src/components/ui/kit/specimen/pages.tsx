'use client';

import { useEffect, useRef, useState } from 'react';
import { IconPlus } from '../../icons';
import { ApprovalCard } from '../ApprovalCard';
import { Button, LinkButton } from '../Button';
import { Segmented } from '../Choice';
import { CompactHeader } from '../CompactHeader';
import { CreationShell, MadeNotice, ReviewActions, Stepper, useMethodOptions, type CreationMethod } from '../Creation';
import { Field, SaveWord, SettingsSummary, Textarea } from '../Field';
import { MenuButton, MenuItem } from '../Overlay';
import { PageHeader } from '../PageHeader';
import { ErrorNotice, SampleBadge, TextBars } from '../States';
import { StateWord } from '../Status';
import { TabBar } from '../Tabs';
import { Slot, SpecRow, SpecSection } from './parts';
import { DisclosureCard, StageSteps, StageStepsSkeleton } from '../Pickers';
import { StylePicker } from '@/components/media/StylePicker';
import type { Style } from '@/domain/vocabulary';

function Paper() {
  return <div className="paper prose-copy p-5" dir="auto">Abu Samir’s café, at dusk. The radio crackles; Amina turns the dial until a voice answers. “Is anyone still listening?”</div>;
}
function Frames() {
  return (
    <div>
      <div className="kit-spec-frames">
        {['01', '02', '03', '04', '05', '06'].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={n} src={`/sample/frames/frame-${n}-a.svg`} alt={`Storyboard frame ${Number(n)}`} />
        ))}
      </div>
      <SampleBadge className="mt-2" />
    </div>
  );
}

export function ApprovalSpec() {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return (
    <SpecSection id="approval" title={'Approval card'} lead={'The thing to approve sits inline; the decision beside it. After Approve, one line with Undo for 10 seconds.'}>
      <ApprovalCard id="kit-story" media={<Paper />} kind={'Story'} title={'The Kite — Episode 4'} provenance={'Story Development handed it over · 12 min ago'} ask={'Approve the story to start storyboarding.'}
        onApprove={() => wait(900)} onRequestChanges={() => wait(600)} openHref="#approval" onUndo={() => undefined} />
      <ApprovalCard id="kit-frames" media={<Frames />} kind={'Storyboard'} title={'The Kite — Episode 4'} provenance={'Story Development handed it over · 12 min ago'} ask={'Approve the frames to start producing.'}
        onApprove={() => undefined} busy />
      <ApprovalCard id="kit-failed" media={<Paper />} kind={'Story'} title={'Episode 4'} ask={'Approve the story to start storyboarding.'}
        onApprove={() => undefined} failure={<ErrorNotice live={false} title={'The decision was not saved.'} why={'Nothing changed. Try again in a moment.'} details="POST /api/commands 503 (approveStory)" />} />
      <ApprovalCard id="kit-done" kind={'Story'} title={'Episode 3'} onApprove={() => undefined} approved onUndo={() => undefined} />
    </SpecSection>
  );
}

export function HeadersSpec() {
  const hero = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState('storyboard');
  // the lobby example opens scrolled past its hero, so the header is seen in its shown state
  useEffect(() => { if (box.current && hero.current) box.current.scrollTop = hero.current.offsetHeight + 24; }, []);
  const more = <MenuButton label={'More'} iconOnly variant="quiet" size="sm"><MenuItem>Edit</MenuItem><MenuItem>Duplicate</MenuItem></MenuButton>;
  return (
    <SpecSection id="headers" title={'Headers'} lead={'The page header has fixed places. The compact header appears once the hero has scrolled away, or stays, in the cutting room.'}>
      <div className="kit-spec-sample">
        <PageHeader titleAs="h2" className="!mb-0" back={{ href: '#headers', label: 'Characters' }} eyebrow={'Cast & world'} title={'Characters'} count={7} subtitle={'Everyone who can be cast, each with one image and one voice.'}
          primary={<Button variant="primary" icon={<IconPlus />}>New character</Button>} secondary={<Button>Select</Button>} more={<MenuButton label={'More'} iconOnly variant="quiet"><MenuItem>Edit</MenuItem></MenuButton>} />
      </div>
      <SpecRow label={`CompactHeader · ${'lobby'}`}>
        <div ref={box} className="kit-spec-scrollbox" tabIndex={0} aria-label={'A scrolling example'}>
          <CompactHeader mode="lobby" watch={hero} scrollRoot={box} contained back={{ href: '#headers', label: 'Back to Shows' }} title={'The Last Sip'}
            status={<StateWord tone="waiting">Waiting for you</StateWord>} primary={<Button size="sm" variant="primary">Continue: Storyboard</Button>} more={more} />
          <div ref={hero}><Slot ratio="21/9">Hero (media kit)</Slot></div>
          <p className="mt-4 text-muted">Scroll this box up: the compact header leaves when the hero comes back, and returns when the hero goes.</p>
          <TextBars lines={3} className="mt-6" />
          <TextBars lines={3} className="mt-6" />
          <TextBars lines={3} className="mt-6 pb-40" />
        </div>
      </SpecRow>
      <SpecRow label={`CompactHeader · ${'cutting room'}`}>
        <div className="kit-spec-scrollbox kit-spec-cutting" data-room="cutting" data-density="compact" tabIndex={0} aria-label={'A scrolling example'}>
          <CompactHeader mode="cutting" contained back={{ href: '#headers', label: 'Back to Shows' }} title={'Episode 3'} status={<StateWord tone="running">Running</StateWord>}
            tabs={<TabBar tabs={[{ id: 'story', label: 'Story' }, { id: 'storyboard', label: 'Storyboard' }, { id: 'produce', label: 'Produce' }]} current={tab} onSelect={setTab} ariaLabel={'Episode workspace'} />}
            save={<SaveWord state="saved" />} primary={<Button size="sm" variant="primary">Continue: Storyboard</Button>} more={more} />
          <div className="mt-4 grid gap-4"><TextBars lines={3} /><TextBars lines={3} /><TextBars lines={3} className="pb-24" /></div>
        </div>
      </SpecRow>
    </SpecSection>
  );
}

export function CreationSpec() {
  const methods = useMethodOptions();
  const [method, setMethod] = useState<CreationMethod>('auto');
  const [brief, setBrief] = useState('');
  const [len, setLen] = useState('6');
  const [look, setLook] = useState<Style | null>('CARTOON');
  const [lookAuto, setLookAuto] = useState<Style | null>(null);
  return (
    <SpecSection id="creation" title={'Creation flow'} lead={'One layout for every new thing: the method, the one essential input, the settings in one line, and the time it takes.'}>
      <div>
        <CreationShell
          titleAs="h2" back={{ href: '#creation', label: 'Back to The Last Sip · Season 2' }} cancel={{ href: '#creation' }}
          title={'New episode'} slate={<p className="slate">For The Last Sip · Season 2 · Cartoon · Arabic (Iraqi)</p>}
          method={{ value: method, onChange: setMethod, options: methods }}
          preview={<Slot ratio="16/9">{brief ? <span className="t-card-lg text-muted" dir="auto">{brief}</span> : 'Title card (media kit)'}</Slot>}
          estimate={'About a minute.'} primary={<Button variant="primary">{method === 'auto' ? 'Propose' : 'Create'}</Button>}
          moreControl={<Segmented label={'Length'} value={len} onChange={setLen} options={[{ value: '3', label: '3 min' }, { value: '6', label: '6 min' }, { value: '10', label: '10 min' }]} />}
        >
          <Field label={'What happens in this episode?'} optional><Textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={'A line is enough.'} /></Field>
          <SettingsSummary className="mt-4" items={['For The Last Sip · Season 2', 'Cartoon', 'Arabic (Iraqi Baghdadi)']}>
            <Segmented label={'Length'} value={len} onChange={setLen} options={[{ value: '3', label: '3 min' }, { value: '6', label: '6 min' }]} />
          </SettingsSummary>
        </CreationShell>
      </div>
      <SpecRow label="PicturePicker (StylePicker)">
        <div className="kit-spec-wide">
          <StylePicker value={look} onChange={setLook} />
          <StylePicker value={lookAuto} onChange={setLookAuto} auto="Studio decides" label="Style, with Studio decides" />
        </div>
      </SpecRow>
      <SpecRow label="StageSteps">
        <div className="kit-spec-wide kit-spec-grid-2">
          <StageSteps label="Development stages" stages={[
            { id: 'research', label: 'Research', who: 'Story Research', state: 'done', note: '6 sources', time: '0:42' },
            { id: 'concepts', label: 'Concepts', who: 'Story Development', state: 'done', time: '1:10' },
            { id: 'outline', label: 'Outline', who: 'Story Development', state: 'running', note: 'Writing beat 4 of 7', time: '0:31' },
            { id: 'review', label: 'Review', who: 'Story Review', state: 'waiting' },
            { id: 'audience', label: 'Audience check', who: 'Audience Experience', state: 'skipped', time: 'Skipped' },
            { id: 'polish', label: 'Polish', who: 'Story Development', state: 'failed', note: 'The engine returned nothing usable', time: 'Stopped' },
          ]} />
          <StageStepsSkeleton count={6} />
        </div>
      </SpecRow>
      <SpecRow label="DisclosureCard">
        <div className="kit-spec-wide">
          <DisclosureCard title="More control" description="Cast, locations, genre and an exact length"><Field label="Genre" optional><Textarea rows={2} /></Field></DisclosureCard>
          <DisclosureCard variant="inline" title="Preferences" description="All up to the studio" defaultOpen><p className="t-body">Style, language, length and who it is for.</p></DisclosureCard>
        </div>
      </SpecRow>
      <SpecRow label="Stepper">
        <Stepper steps={[{ id: 'identity', label: 'Identity' }, { id: 'look', label: 'Look' }, { id: 'voice', label: 'Voice' }]} current={1} />
      </SpecRow>
      <SpecRow label="ReviewActions">
        <div className="min-w-0 flex-1"><ReviewActions onCreate={() => undefined} onAnother={() => undefined} onPreferences={() => undefined} /></div>
      </SpecRow>
      <SpecRow label="MadeNotice">
        <div className="min-w-0 flex-1"><MadeNotice next={<LinkButton href="#approval" size="sm">Open the story</LinkButton>} onDismiss={() => undefined}>Episode 4 was made. Next: approve its story.</MadeNotice></div>
      </SpecRow>
    </SpecSection>
  );
}
