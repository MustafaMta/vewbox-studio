'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../../toast';
import { IconBad, IconDelete, IconEdit, IconInfo, IconOk, IconPlus, IconRetry } from '../../icons';
import { Button } from '../Button';
import { ShapeGlyph, ToolCard } from '../Cards';
import { JobDot, JobRunning, Progress, Skeleton, SkeletonRegion } from '../Loading';
import { EmptyState, ErrorNotice, ErrorState, LoadingLine, Notice, PartialLine, SampleBadge } from '../States';
import { Tooltip } from '../Tooltip';
import { Cell, SpecRow, SpecSection } from './parts';

/** /kit — TOOLTIP, TOAST, PROGRESS, SKELETONS, EMPTY AND ERROR STATES, NOTICES. */

export function FeedbackSpec() {
  const toast = useToast();
  const [elapsed, setElapsed] = useState(42);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }, []);
  return (
    <SpecSection id="feedback" title="Tooltip, toast and progress" lead="A tooltip waits 400 ms and never carries the only copy of anything; a toast confirms a change in one line; progress shows only real fractions.">
      <SpecRow label="Tooltip">
        <Cell state="Hover or focus (400 ms)">
          <span className="kit-spec-inline">
            <Tooltip content="Edit"><button type="button" className="btn btn-quiet btn-icon" aria-label="Edit" data-testid="tip-edit"><IconEdit aria-hidden /></button></Tooltip>
            <Tooltip content="Duplicate"><button type="button" className="btn btn-quiet btn-icon" aria-label="Duplicate"><IconPlus aria-hidden /></button></Tooltip>
            <Tooltip content="Delete · asks first" side="bottom"><button type="button" className="btn btn-quiet btn-icon" aria-label="Delete"><IconDelete aria-hidden /></button></Tooltip>
          </span>
        </Cell>
        <Cell state="Drawn"><span className="tooltip kit-spec-tip-still" role="presentation">Production · 4 waiting</span></Cell>
      </SpecRow>
      <SpecRow label="Toast">
        <Button onClick={() => toast.ok('Saved')} data-testid="toast-ok">Saved</Button>
        <Button onClick={() => toast.info('Archived “The Kite”', { label: 'Undo', onClick: () => toast.ok('Restored') })} data-testid="toast-undo">With Undo</Button>
        <Button onClick={() => toast.bad('The export failed. Nothing was changed.')} data-testid="toast-bad">An error</Button>
        <Button variant="quiet" onClick={() => { for (const n of [1, 2, 3, 4]) toast.ok(`Saved draft ${n}`); }} data-testid="toast-four">Four at once (three stay)</Button>
      </SpecRow>
      <SpecRow label="Toast · drawn">
        <div className="kit-spec-stills">
          <div className="toast" data-tone="ok" role="presentation"><IconOk className="toast-icon" aria-hidden /><span className="toast-text">Saved</span></div>
          <div className="toast" data-tone="info" role="presentation"><IconInfo className="toast-icon" aria-hidden /><span className="toast-text">Archived “The Kite”</span><span className="btn btn-quiet btn-sm toast-act">Undo</span></div>
          <div className="toast" data-tone="bad" role="presentation"><IconBad className="toast-icon" aria-hidden /><span className="toast-text">The export failed. Nothing was changed.</span></div>
        </div>
      </SpecRow>
      <SpecRow label="Progress">
        <Cell state="Determinate" wide><Progress value={0.25} label="Drawing the frames" phase="Drawing frame 2 of 8" count="2 of 8" /></Cell>
        <Cell state="Indeterminate" wide><Progress label="Waiting for the engine" phase="Waiting for the engine" /></Cell>
        <Cell state="Bar only" wide><Progress value={0.7} label="Export" /></Cell>
      </SpecRow>
      <SpecRow label="A job running">
        <Cell state="With Cancel" wide><JobRunning phase="Drawing frame 13 of 20" elapsed={elapsed} onCancel={() => setCancelling(true)} cancelling={cancelling} /></Cell>
        <Cell state="JobDot"><JobDot>Rendering shot 2.3</JobDot></Cell>
        <Cell state="Waiting"><JobDot tone="waiting">Waiting for you</JobDot></Cell>
        <Cell state="LoadingLine" wide><LoadingLine>Loading the studio…</LoadingLine></Cell>
      </SpecRow>
      <SpecRow label="Skeleton parts">
        <SkeletonRegion label="Loading the specimens…" className="kit-spec-sk">
          <span className="kit-spec-sk-row"><Skeleton.Line size="title" width="10rem" /><Skeleton.Line width="16rem" /></span>
          <span className="kit-spec-sk-row"><Skeleton.Block width={128} height={40} radius="pill" /><Skeleton.Block width={96} height={32} radius="pill" /></span>
          <span className="kit-spec-sk-row"><span style={{ inlineSize: 220 }}><Skeleton.Tile ratio="16/9" /></span><span style={{ inlineSize: 120 }}><Skeleton.Tile ratio="2/3" lines={1} /></span></span>
        </SkeletonRegion>
      </SpecRow>
    </SpecSection>
  );
}

export function StatesSpec() {
  return (
    <SpecSection id="states" title="Empty and error states, notices" lead="An empty section keeps its head and says one sentence with one action; an empty page offers start cards; an error page names what is missing and the way back.">
      <SpecRow label="EmptyState · section">
        <EmptyState action={<Button size="sm">Choose locations</Button>}>No locations are chosen for this episode yet.</EmptyState>
      </SpecRow>
      <SpecRow label="EmptyState · page" stack>
        <EmptyState kind="page" title="Your studio is ready." cards={<>
          <ToolCard href="/kit#states" shape="show" title="New show" line="Seasons that share one cast" />
          <ToolCard href="/kit#states" shape="short" title="New short" line="One film from one line" />
          <ToolCard href="/kit#states" shape="music" title="New music video" line="It starts with its song" />
          <ToolCard href="/kit#states" icon={<ShapeGlyph shape="character" />} title="New character" line="One image, one voice" />
        </>}>Write one line. The studio drafts the story, the cast and the shots, and you approve each step.</EmptyState>
      </SpecRow>
      <SpecRow label="ErrorState · page" stack>
        <ErrorState kind="page" title="This show isn’t in the studio" back={{ href: '/shows', label: 'Back to Shows' }}>It may have been deleted, or the link is from another studio.</ErrorState>
      </SpecRow>
      <SpecRow label="ErrorState · section">
        <div className="kit-spec-wide">
          <ErrorState title="The decisions could not be loaded." action={<Button size="sm" icon={<IconRetry />}>Try again</Button>} details="GET /api/studio 503 (Service Unavailable)">The studio did not answer. Nothing was changed.</ErrorState>
        </div>
      </SpecRow>
      <SpecRow label="Notice">
        <div className="kit-spec-wide kit-spec-grid-2">
          <Notice tone="info" title="Drafts are kept for this session.">Close the tab and they are gone.</Notice>
          <Notice tone="wait" title="The story waits for your approval." action={<Button size="sm">Review the story</Button>}>Storyboarding starts once you approve it.</Notice>
          <Notice tone="ok" title="Episode 3 is ready to screen." />
          <ErrorNotice live={false} title="The engine returned nothing usable." why="It ran, but what came back did not pass the checks." kept="The earlier takes are kept."
            action={<Button size="sm" icon={<IconRetry />}>Try again</Button>} details="RuntimeError: out of memory while sampling (step 14 of 30)" />
        </div>
      </SpecRow>
      <SpecRow label="PartialLine · Sample">
        <PartialLine items={['Episode 4', 'cut missing', '18 of 20 shots chosen']} />
        <SampleBadge />
      </SpecRow>
    </SpecSection>
  );
}
