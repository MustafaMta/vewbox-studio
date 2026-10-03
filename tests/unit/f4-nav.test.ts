import { describe, expect, it } from 'vitest';
import { HOME, NAV_GROUPS, NAV_ITEMS, areaKey, currentItem, isActive } from '@/components/shell/nav-model';
import { jobsTarget, libraryTarget, projectsTarget } from '@/components/shell/redirects';
import { T } from '@/lib/copy';

/** docs/DESIGN-SYSTEM-V4.md §7.1 (primary navigation) and §7.2 (routes and redirects), package F4. */

describe('the primary navigation (§7.1)', () => {
  it('has the three groups in order, with the Screening Room back in Studio (V4-04)', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['productions', 'castWorld', 'studio']);
    expect(NAV_GROUPS.map((g) => g.items.map((i) => i.href))).toEqual([
      ['/shows', '/shorts', '/music-videos'],
      ['/characters', '/locations', '/assets'],
      ['/studio', '/production', '/screening'],
    ]);
    expect(NAV_ITEMS.at(-1)?.href).toBe('/settings');
  });

  it('names every item and group', () => {
    for (const k of [...NAV_GROUPS.map((g) => g.label), ...NAV_ITEMS.map((i) => i.key)]) expect(T(k)).toBeTruthy();
    expect(T('screening.title')).toBe('Screening Room');
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
    expect(isActive('/showsx', '/shows')).toBe(false);
    expect(currentItem('/kit')).toBeUndefined();
  });

  it('names the area for the phone bar', () => {
    expect(areaKey('/music-videos/river-lights')).toBe('nav.musicVideos');
    expect(areaKey('/screening')).toBe('screening.title');
    expect(areaKey('/new')).toBe('nav.new');
    expect(areaKey('/kit')).toBeNull();
  });

  it('goes home to Shows', () => { expect(HOME).toBe('/shows'); });
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
