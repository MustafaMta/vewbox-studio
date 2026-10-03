import { describe, expect, it } from 'vitest';
import { formatFilters, parseFilters, tabNavigation, withSearch } from '@/components/shell/url-state';

/** docs/DESIGN-SYSTEM-V4.md §7.4: one filter parameter, tidy search strings, push into the workspace and replace
 *  inside it. Package F4. */

describe('filters in one parameter', () => {
  it('parses facets, repeated facets and nothing', () => {
    expect(parseFilters('style:CARTOON,lang:AR,lang:EN')).toEqual({ style: ['CARTOON'], lang: ['AR', 'EN'] });
    expect(parseFilters(null)).toEqual({});
    expect(parseFilters('style:,:AR,junk,lang:AR,lang:AR')).toEqual({ lang: ['AR'] });
  });
  it('formats back, and leaves the address when nothing is filtered', () => {
    expect(formatFilters({ style: ['CARTOON'], lang: ['AR', 'EN'] })).toBe('style:CARTOON,lang:AR,lang:EN');
    expect(formatFilters({ style: [] })).toBeNull();
    const f = 'identity:DRAFT,style:ANIME';
    expect(formatFilters(parseFilters(f))).toBe(f);
  });
});

describe('withSearch', () => {
  it('sets, changes and removes parameters', () => {
    expect(withSearch('?tab=story&season=s1', { tab: 'produce' })).toBe('?tab=produce&season=s1');
    expect(withSearch('tab=story', { tab: null })).toBe('');
    expect(withSearch(new URLSearchParams('a=1'), { f: 'lang:AR', a: '' })).toBe('?f=lang%3AAR');
  });
});

describe('tab navigation', () => {
  const workspace = (t: string) => ['story', 'cast', 'storyboard', 'produce', 'final'].includes(t);
  it('pushes into the workspace and out of it, replaces inside it', () => {
    expect(tabNavigation('overview', 'storyboard', workspace)).toBe('push');
    expect(tabNavigation(null, 'story', workspace)).toBe('push');
    expect(tabNavigation('storyboard', 'produce', workspace)).toBe('replace');
    expect(tabNavigation('produce', 'overview', workspace)).toBe('push');
  });
});
