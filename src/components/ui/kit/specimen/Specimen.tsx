'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, LinkButton } from '../Button';
import { Segmented } from '../Choice';
import { useMediaQuery } from '../layout';
import { MenuButton, MenuItem } from '../Overlay';
import { PageHeader } from '../PageHeader';
import { AnchorNav } from '../Tabs';
import { CardsSpec } from './cards';
import { ButtonsSpec, ChoicesSpec, NavigationSpec, StatusSpec } from './controls';
import { FormsSpec } from './forms';
import { OverlaysSpec } from './overlays';
import { ApprovalSpec, CreationSpec, HeadersSpec, StatesSpec } from './pages';
import { SpecSection } from './parts';

/** THE /kit SPECIMEN (docs/DESIGN-SYSTEM-V4.md §8.5 F2; dev only): every kit component in every state, the
 *  More-contrast and compact-density demonstrations F1 left to this page, then F3's media sections. */

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

export function KitSpecimen({ media }: { media?: ReactNode }) {
  const [contrast, setContrast] = useContrastOverride();
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const osMore = useMediaQuery('(prefers-contrast: more)');
  const effective = contrast === 'more' || (contrast === 'system' && osMore) ? 'More' : 'Standard';
  // the page names itself until the shell's title table has a /kit entry (F4, src/components/shell/titles.ts)
  const docTitle = `${'Interface kit'} · ${'Vewbox Studio'}`;
  useEffect(() => { document.title = docTitle; }, [docTitle]);
  const sections = [
    ['preferences', 'Contrast and density'], ['cards', 'Cards and shelves'], ['buttons', 'Buttons'], ['status', 'Status'], ['navigation', 'In-page navigation'],
    ['forms', 'Forms'], ['choices', 'Choices'], ['overlays', 'Overlays'], ['states', 'Empty, loading, error and partial'],
    ['approval', 'Approval card'], ['headers', 'Headers'], ['creation', 'Creation flow'],
  ] as const;
  return (
    <div className="kit-spec" data-density={density === 'compact' ? 'compact' : undefined}>
      <PageHeader
        back={{ href: '/shows', label: 'Shows' }}
        eyebrow={'Development only · not in production builds'}
        title={'Interface kit'}
        count={sections.length}
        subtitle={'Every part of the interface kit in every state: at rest, hovered, focused, disabled, loading, failed and selected.'}
        primary={<LinkButton href="#buttons" variant="primary">Start with the buttons</LinkButton>}
        secondary={<Button onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} aria-pressed={density === 'compact'}>Compact</Button>}
        more={<MenuButton label={'More'} iconOnly variant="quiet"><MenuItem onClick={() => setContrast('more')}>Contrast: More</MenuItem><MenuItem onClick={() => setContrast('system')}>As the system</MenuItem></MenuButton>}
      />
      <AnchorNav items={sections.map(([id, label]) => ({ id, label }))} />

      <SpecSection id="preferences" title={'Contrast and density'} lead={'More contrast raises muted and faint text and every boundary one step. Compact density is the cutting room’s default.'}>
        <div className="kit-spec-prefs">
          <div className="flex flex-col items-start gap-2">
            <span className="label">Contrast</span>
            <Segmented label={'Contrast'} value={contrast} onChange={setContrast} options={[
              { value: 'system', label: 'As the system' }, { value: 'standard', label: 'Standard' }, { value: 'more', label: 'More' },
            ]} />
            <p className="help" role="status">{osMore ? 'This browser asks for more contrast.' : 'This browser does not ask for more contrast.'} {`In effect: ${effective}.`}</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="label">Density</span>
            <Segmented label={'Density'} value={density} onChange={setDensity} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
            <p className="help">Compact: 32 px controls and 13/20 text (Arabic 14/22). On touch, controls stay 44 px.</p>
          </div>
        </div>
        <div className="kit-spec-pair">
          <DensitySample label={'Comfortable'} />
          <DensitySample label={'Compact'} compact />
        </div>
        <div className="kit-spec-pair">
          {/* the page as it is now (the switch above, or the system), beside a sample that is always More */}
          <ContrastSample label={`In effect: ${effective}.`} />
          <ContrastSample label={'More'} more />
        </div>
      </SpecSection>

      <CardsSpec />
      <ButtonsSpec />
      <StatusSpec />
      <NavigationSpec />
      <FormsSpec />
      <ChoicesSpec />
      <OverlaysSpec />
      <StatesSpec />
      <ApprovalSpec />
      <HeadersSpec />
      <CreationSpec />
      {media}
    </div>
  );
}

/** The same controls at both densities, side by side. */
function DensitySample({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div className="kit-spec-sample" data-density={compact ? 'compact' : 'comfortable'}>
      <p className="caption">{label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary">Save</Button>
        <Button>Edit</Button>
        <Button size="sm">Duplicate</Button>
      </div>
      <input className="input mt-3" aria-label={`${'Title'} (${label})`} defaultValue={'The Kite'} dir="auto" />
      <p className="mt-3 text-body">The same words, the same controls, a tighter rhythm.</p>
    </div>
  );
}

/** The text and boundary roles under each contrast setting, side by side. The "More" sample sets the same roles
 *  F1's html[data-contrast='more'] rule sets (tokens.css), on this sample only. */
function ContrastSample({ label, more }: { label: string; more?: boolean }) {
  return (
    <div className={more ? 'kit-spec-sample kit-spec-more' : 'kit-spec-sample'}>
      <p className="caption">{label}</p>
      <p className="mt-3 text-fg">Titles and the work: ivory.</p>
      <p className="text-muted">Muted text: leads and secondary lines.</p>
      <p className="text-faint">Faint text: hints and timestamps.</p>
      <input className="input mt-3" aria-label={`${'Title'} (${label})`} placeholder={'The Kite'} dir="auto" />
    </div>
  );
}
