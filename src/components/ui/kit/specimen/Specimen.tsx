'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '../../locale';
import { Button, LinkButton } from '../Button';
import { Segmented } from '../Choice';
import { useMediaQuery } from '../layout';
import { MenuButton, MenuItem } from '../Overlay';
import { PageHeader } from '../PageHeader';
import { AnchorNav } from '../Tabs';
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
  const T = useT();
  const [contrast, setContrast] = useContrastOverride();
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const osMore = useMediaQuery('(prefers-contrast: more)');
  const effective = contrast === 'more' || (contrast === 'system' && osMore) ? T('kit.spec.contrast.more') : T('kit.spec.contrast.standard');
  // the page names itself until the shell's title table has a /kit entry (F4, src/components/shell/titles.ts)
  const docTitle = `${T('kit.page.title')} · ${T('app.name')}`;
  useEffect(() => { document.title = docTitle; }, [docTitle]);
  const sections = [
    ['preferences', T('kit.spec.sec.preferences')], ['buttons', T('kit.spec.sec.buttons')], ['status', T('kit.spec.sec.status')], ['navigation', T('kit.spec.sec.navigation')],
    ['forms', T('kit.spec.sec.forms')], ['choices', T('kit.spec.sec.choices')], ['overlays', T('kit.spec.sec.overlays')], ['states', T('kit.spec.sec.states')],
    ['approval', T('kit.spec.sec.approval')], ['headers', T('kit.spec.sec.headers')], ['creation', T('kit.spec.sec.creation')],
  ] as const;
  return (
    <div className="kit-spec" data-density={density === 'compact' ? 'compact' : undefined}>
      <PageHeader
        back={{ href: '/shows', label: T('nav.shows') }}
        eyebrow={T('kit.spec.eyebrow')}
        title={T('kit.page.title')}
        count={sections.length}
        subtitle={T('kit.spec.lead')}
        primary={<LinkButton href="#buttons" variant="primary">{T('kit.spec.start')}</LinkButton>}
        secondary={<Button onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')} aria-pressed={density === 'compact'}>{T('kit.spec.density.compact')}</Button>}
        more={<MenuButton label={T('nav.more')} iconOnly variant="quiet"><MenuItem onClick={() => setContrast('more')}>{T('kit.spec.pal.contrast')}</MenuItem><MenuItem onClick={() => setContrast('system')}>{T('kit.spec.contrast.system')}</MenuItem></MenuButton>}
      />
      <AnchorNav items={sections.map(([id, label]) => ({ id, label }))} />

      <SpecSection id="preferences" title={T('kit.spec.sec.preferences')} lead={T('kit.spec.preferences.lead')}>
        <div className="kit-spec-prefs">
          <div className="flex flex-col items-start gap-2">
            <span className="label">{T('kit.spec.contrast')}</span>
            <Segmented label={T('kit.spec.contrast')} value={contrast} onChange={setContrast} options={[
              { value: 'system', label: T('kit.spec.contrast.system') }, { value: 'standard', label: T('kit.spec.contrast.standard') }, { value: 'more', label: T('kit.spec.contrast.more') },
            ]} />
            <p className="help" role="status">{osMore ? T('kit.spec.contrast.osOn') : T('kit.spec.contrast.osOff')} {T.f('kit.spec.contrast.now', { value: effective })}</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="label">{T('kit.spec.density')}</span>
            <Segmented label={T('kit.spec.density')} value={density} onChange={setDensity} options={[{ value: 'comfortable', label: T('kit.spec.density.comfortable') }, { value: 'compact', label: T('kit.spec.density.compact') }]} />
            <p className="help">{T('kit.spec.density.hint')}</p>
          </div>
        </div>
        <div className="kit-spec-pair">
          <DensitySample label={T('kit.spec.density.comfortable')} />
          <DensitySample label={T('kit.spec.density.compact')} compact />
        </div>
        <div className="kit-spec-pair">
          {/* the page as it is now (the switch above, or the system), beside a sample that is always More */}
          <ContrastSample label={T.f('kit.spec.contrast.now', { value: effective })} />
          <ContrastSample label={T('kit.spec.contrast.more')} more />
        </div>
      </SpecSection>

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
  const T = useT();
  return (
    <div className="kit-spec-sample" data-density={compact ? 'compact' : 'comfortable'}>
      <p className="caption">{label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary">{T('btn.save')}</Button>
        <Button>{T('btn.edit')}</Button>
        <Button size="sm">{T('btn.duplicate')}</Button>
      </div>
      <input className="input mt-3" aria-label={`${T('label.title')} (${label})`} defaultValue={T('kit.spec.ph.title')} dir="auto" />
      <p className="mt-3 text-body">{T('kit.spec.density.body')}</p>
    </div>
  );
}

/** The text and boundary roles under each contrast setting, side by side. The "More" sample sets the same roles
 *  F1's html[data-contrast='more'] rule sets (tokens.css), on this sample only. */
function ContrastSample({ label, more }: { label: string; more?: boolean }) {
  const T = useT();
  return (
    <div className={more ? 'kit-spec-sample kit-spec-more' : 'kit-spec-sample'}>
      <p className="caption">{label}</p>
      <p className="mt-3 text-fg">{T('kit.spec.contrast.fg')}</p>
      <p className="text-muted">{T('kit.spec.contrast.muted')}</p>
      <p className="text-faint">{T('kit.spec.contrast.faint')}</p>
      <input className="input mt-3" aria-label={`${T('label.title')} (${label})`} placeholder={T('kit.spec.ph.title')} dir="auto" />
    </div>
  );
}
