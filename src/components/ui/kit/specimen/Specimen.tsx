'use client';

import { useEffect, useRef, useState } from 'react';
import { Segmented } from '../Choice';
import { useMediaQuery } from '../layout';
import { AnchorNav } from '../Tabs';
import { CardsSpec } from './cards';
import { ButtonsSpec, ChoicesSpec, NavigationSpec, StatusSpec } from './controls';
import { EditSpec } from './edit';
import { FeedbackSpec, StatesSpec } from './feedback';
import { FormsSpec, SearchSpec } from './forms';
import { MediaSpec } from './media';
import { OverlaysSpec } from './overlays';
import { ApprovalSpec, CreationSpec, HeadersSpec } from './pages';
import { PlayersSpec } from './players';
import { SpecSection } from './parts';

/** THE /kit SPECIMEN (development only) — the single reference for every engineer: every shared component in every
 *  state at its real size, on the tokens of docs/design/VISUAL-STANDARD-V5.1.md, with the approved Home as the visual
 *  reference. Sections: foundations · cards and shelves · buttons · status · navigation · forms · search and filters ·
 *  choices · overlays · feedback · states · media · players · cutting room · approval · headers · creation flow. */

type Contrast = 'system' | 'standard' | 'more';

function useContrastOverride(): [Contrast, (c: Contrast) => void] {
  const [c, setC] = useState<Contrast>('system');
  useEffect(() => {
    const html = document.documentElement;
    const before = html.getAttribute('data-contrast');
    if (c === 'system') html.removeAttribute('data-contrast'); else html.setAttribute('data-contrast', c);
    return () => { if (before === null) html.removeAttribute('data-contrast'); else html.setAttribute('data-contrast', before); };
  }, [c]);
  return [c, setC];
}

const SECTIONS = [
  ['foundations', 'Foundations'], ['cards', 'Cards and shelves'], ['buttons', 'Buttons'], ['status', 'Status'], ['navigation', 'Navigation'],
  ['forms', 'Forms'], ['search', 'Search and filters'], ['choices', 'Choices'], ['overlays', 'Overlays'], ['feedback', 'Feedback'],
  ['states', 'Empty and error'], ['media', 'Media'], ['players', 'Players'], ['edit', 'Cutting room'], ['approval', 'Approval'],
  ['headers', 'Headers'], ['creation', 'Creation flow'],
] as const;

export function KitSpecimen() {
  const root = useRef<HTMLDivElement>(null);
  const [contrast, setContrast] = useContrastOverride();
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const osMore = useMediaQuery('(prefers-contrast: more)');
  useEffect(() => { document.title = 'Interface kit · Vewbox Studio'; }, []);
  // a specimen page is captured whole (a full-page screenshot never scrolls lazy pictures into view): load them all
  useEffect(() => {
    const el = root.current; if (!el) return;
    const eager = () => el.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
    eager();
    const mo = new MutationObserver(eager); mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return (
    <div ref={root} className="kit-spec" data-density={density === 'compact' ? 'compact' : undefined}>
      <header className="kit-spec-head">
        <h1 className="t-page">Interface kit</h1>
        <p className="t-lead">Every shared component in every state, at its real size. Pages compose these and add nothing of their own; a missing part is a request to the design system.</p>
        <div className="kit-spec-prefs">
          <Segmented label="Contrast" value={contrast} onChange={setContrast} options={[{ value: 'system', label: osMore ? 'System (more)' : 'System' }, { value: 'standard', label: 'Standard' }, { value: 'more', label: 'More contrast' }]} />
          <Segmented label="Density" value={density} onChange={setDensity} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </div>
      </header>
      <AnchorNav items={SECTIONS.map(([id, label]) => ({ id, label }))} />
      <Foundations />
      <CardsSpec />
      <ButtonsSpec />
      <StatusSpec />
      <NavigationSpec />
      <FormsSpec />
      <SearchSpec />
      <ChoicesSpec />
      <OverlaysSpec />
      <FeedbackSpec />
      <StatesSpec />
      <MediaSpec />
      <PlayersSpec />
      <EditSpec />
      <ApprovalSpec />
      <HeadersSpec />
      <CreationSpec />
    </div>
  );
}

const SURFACES = [['--bg-nav', 'Sidebar, bars'], ['--bg-page', 'Page'], ['--surface-1', 'Cards, fields'], ['--surface-2', 'Hover, menus, chips'], ['--surface-3', 'Hover on surface-2'], ['--primary', 'The one primary']] as const;
const TEXT = [['--text-1', 'Titles, primary text'], ['--text-2', 'Secondary text'], ['--text-3', 'Meta, labels'], ['--text-disabled', 'Disabled (with a reason)']] as const;
const STATE = [['--wait', 'Waiting for you (dot, count, badge)'], ['--ok', 'Done'], ['--bad', 'Failed']] as const;
const TYPE = [['t-display', 'Display 56/60'], ['t-hero', 'Hero 40/44'], ['t-page', 'Page 32/40'], ['t-section', 'Section 22/28'], ['t-title', 'Title 16/22'], ['t-card', 'Card 15/20'], ['t-lead', 'Lead 16/24'], ['t-body', 'Body 14/20'], ['t-meta', 'Meta 13/18'], ['t-label', 'Label 12/16'], ['t-ro', 'Readout 0:56 · 1920×1080']] as const;
const RADII = [['--r-xs', '6'], ['--r-sm', '10'], ['--r-md', '14'], ['--r-lg', '20'], ['--r-pill', 'pill']] as const;

function Foundations() {
  return (
    <SpecSection id="foundations" title="Foundations" lead="A neutral charcoal ladder where the only colour is the work; one sans (Geist) with its mono for readouts; one radius family; space, not lines.">
      <div className="kit-spec-swatches">
        {[...SURFACES, ...TEXT, ...STATE].map(([v, use]) => (
          <div key={v} className="kit-spec-swatch"><span className="kit-spec-chip" style={{ background: `var(${v})` }} /><span className="t-label">{v}</span><span className="t-meta">{use}</span></div>
        ))}
      </div>
      <div className="kit-spec-type">
        {TYPE.map(([c, name]) => <p key={c} className={c}>{name}</p>)}
      </div>
      <div className="kit-spec-radii">
        {RADII.map(([v, px]) => <span key={v} className="kit-spec-radius" style={{ borderRadius: `var(${v})` }}><span className="t-label">{px}</span></span>)}
      </div>
    </SpecSection>
  );
}
