import { describe, expect, it } from 'vitest';
import { HOME, MORE_ITEMS, NAV_GROUPS, NAV_ITEMS, PHONE_TABS, PRODUCTION_ITEMS, areaLabel, currentItem, currentTab, isActive } from '@/components/shell/nav-model';
import { jobsTarget, libraryTarget, projectsTarget } from '@/components/shell/redirects';

/** docs/design/VISUAL-STANDARD-V5.1.md §5.1, §5.2: one sidebar and the phone's bottom bar, from one list (nav-model.ts). */

describe('the primary navigation (v5.1 sidebar)', () => {
  it('has the primary places, then the Workspace group, Settings last', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['primary', 'workspace']);
    expect(NAV_GROUPS.map((g) => g.items.map((i) => i.href))).toEqual([
      ['/', '/shows', '/shorts', '/music-videos', '/characters', '/studio'],
      ['/locations', '/production', '/screening', '/assets'],
    ]);
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([null, 'Workspace']);
    expect(NAV_ITEMS.at(-1)?.href).toBe('/settings');
  });

  it('names every item in English', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Shows', 'Shorts', 'Music Videos', 'Characters', 'Studio Company', 'Locations', 'Production', 'Screening Room', 'Files', 'Settings']);
  });

  it('carries the needs-you count on Production only', () => {
    expect(NAV_ITEMS.filter((i) => i.needsYou).map((i) => i.href)).toEqual(['/production']);
  });

  it('marks the area a page belongs to, deep pages and creation flows included', () => {
    expect(currentItem('/shows/last-sip/seasons/s1/episodes/e1')?.href).toBe('/shows');
    expect(currentItem('/new/short')?.href).toBe('/shorts');
    expect(currentItem('/characters/new')?.href).toBe('/characters');
    expect(currentItem('/studio/departments/CASTING')?.href).toBe('/studio');
    expect(currentItem('/settings')?.href).toBe('/settings');
    expect(currentItem('/')?.href).toBe('/');
    expect(isActive('/shows', '/')).toBe(false);
    expect(isActive('/showsx', '/shows')).toBe(false);
    expect(currentItem('/kit')).toBeUndefined();
  });

  it('names the area for the phone bar', () => {
    expect(areaLabel('/music-videos/river-lights')).toBe('Music Videos');
    expect(areaLabel('/screening')).toBe('Screening Room');
    expect(areaLabel('/new')).toBe('New');
    expect(areaLabel('/kit')).toBeNull();
  });

  it('goes home to Home', () => { expect(HOME).toBe('/'); });
});

describe('the phone navigation (bottom bar)', () => {
  it('has five tabs: Home · Productions · Characters · Studio · More', () => {
    expect(PHONE_TABS.map((t) => t.label)).toEqual(['Home', 'Productions', 'Characters', 'Studio', 'More']);
    expect(PRODUCTION_ITEMS.map((i) => i.label)).toEqual(['Shows', 'Shorts', 'Music Videos']);
    expect(MORE_ITEMS.map((i) => i.label)).toEqual(['Locations', 'Production', 'Screening Room', 'Files', 'Settings']);
  });
  it('reaches every place of the sidebar', () => {
    const reached = new Set(PHONE_TABS.flatMap((t) => ('item' in t ? [t.item.href, ...(t.also ?? []).map((i) => i.href)] : t.items.map((i) => i.href))));
    expect(NAV_ITEMS.map((i) => i.href).filter((h) => !reached.has(h))).toEqual([]);
  });
  it('marks the tab a page belongs to', () => {
    expect(currentTab('/shorts/abc')).toBe('productions');
    expect(currentTab('/music-videos')).toBe('productions');
    expect(currentTab('/production')).toBe('more');
    expect(currentTab('/studio/agents/x')).toBe('studio');
    expect(currentTab('/')).toBe('home');
  });
});
describe('the old addresses land on their targets (§7.2)', () => {
  it('/library → Characters, or the tab it named', () => {
    expect(libraryTarget(undefined)).toBe('/characters');
    expect(libraryTarget('characters')).toBe('/characters');
    expect(libraryTarget('locations')).toBe('/locations');
    expect(libraryTarget('assets')).toBe('/assets');
  });
  it('/projects → Shows, or the tab it named', () => {
    expect(projectsTarget(null)).toBe('/shows');
    expect(projectsTarget('shorts')).toBe('/shorts');
    expect(projectsTarget('music')).toBe('/music-videos');
  });
  it('/jobs → Production’s activity, keeping an open job', () => {
    expect(jobsTarget(null)).toBe('/production#activity');
    expect(jobsTarget('job 1')).toBe('/production?job=job%201#activity');
  });
});
