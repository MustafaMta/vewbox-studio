import { describe, expect, it } from 'vitest';
import { buildEntries, emptyView, fold, pushRecent, search, type PaletteInput } from '@/components/shell/palette';
import { waitingDecisions } from '@/components/shell/decisions';
import { buildFixture } from '../../scripts/v4-fixture';

/** docs/DESIGN-SYSTEM-V4.md §5.17 and §7.6: the command palette's groups, kind-first labels, matching a record's name
 *  in either script (a show's Arabic title is content), recent items, and Decide entries that open the card and never
 *  approve. Package F4. The interface is English-only (docs/DESIGN-SYSTEM-V5.md §9). */

const input = (more: Partial<PaletteInput> = {}): PaletteInput => {
  const f = buildFixture('states');
  // a draft picture the producer can approve (the fixture's own draft, Layla, was filmed, so her look is locked)
  const nour = f.state.characters.find((c) => c.id === 'nour')!;
  nour.canonicalImage = { assetId: 'ref-nour-full-body', status: 'DRAFT', version: 1, generatedAt: '2026-10-03T08:00:00.000Z', check: { ok: true } };
  return {
    state: f.state,
    decisions: waitingDecisions(f.state, f.pipeline.productions, f.jobs).items,
    departments: [{ id: 'CASTING', name: 'Casting & Character Design' }],
    prefs: { contrastMore: false, reducedMotion: false, singleKeys: true }, ...more,
  };
};
const label = (e: { kind: string; name: string }) => `${e.kind} · ${e.name}`;

describe('fold', () => {
  it('ignores case, Latin accents, Arabic diacritics, tatweel and letter variants', () => {
    expect(fold('Abu Samir’s Café')).toBe('abu samirs cafe');
    expect(fold('مَقْهَى')).toBe(fold('مقهي'));
    expect(fold('أحمد')).toBe(fold('احمد'));
    expect(fold('إلياس')).toBe(fold('الياس'));
    expect(fold('آخر رشفة')).toBe(fold('اخر رشفه'));
    expect(fold('قـــصة')).toBe(fold('قصه'));
  });
});

describe('the entries (§7.6)', () => {
  const en = buildEntries(input());
  it('come in the groups Go to · Create · Decide · Settings, in that order', () => {
    const order = [...new Set(en.map((e) => e.group))];
    expect(order).toEqual(['goto', 'create', 'decide', 'settings']);
  });
  it('label every thing kind first', () => {
    expect(en.map(label)).toContain('Show · The Last Sip');
    expect(en.map(label)).toContain('Character · Layla');
    expect(en.map(label)).toContain('Page · Screening Room');
    expect(en.map(label)).toContain('Department · Casting & Character Design');
    expect(en.filter((e) => e.id.startsWith('episode:')).every((e) => e.kind === 'Episode' && e.detail?.includes('The Last Sip'))).toBe(true);
  });
  it('go to every show, episode, short, music video, character, location and department', () => {
    const f = buildFixture('states');
    for (const s of f.state.shows) expect(en.some((e) => e.id === `show:${s.id}`)).toBe(true);
    for (const p of f.state.productions) expect(en.some((e) => e.id.endsWith(`:${p.id}`) && e.group === 'goto')).toBe(true);
    for (const c of f.state.characters) expect(en.some((e) => e.id === `character:${c.id}`)).toBe(true);
    for (const l of f.state.locations) expect(en.some((e) => e.id === `location:${l.id}`)).toBe(true);
  });
  it('create each production with its method, and a season only inside a show', () => {
    const create = en.filter((e) => e.group === 'create');
    expect(create.map(label)).toEqual(expect.arrayContaining(['New show · Let the studio propose', 'New show · Write it yourself', 'New short · Write it yourself', 'New music video · Let the studio propose', 'New location · Describe the place']));
    expect(create.find((e) => e.id === 'new:show:auto')?.action).toEqual({ type: 'go', href: '/new/show?method=auto' });
    expect(create.some((e) => e.id.startsWith('new:season'))).toBe(false);
    const inShow = buildEntries(input({ currentShowId: 'last-sip' })).filter((e) => e.group === 'create');
    expect(inShow.find((e) => e.id === 'new:season:last-sip:manual')?.action).toEqual({ type: 'go', href: '/new/season?show=last-sip&method=manual' });
  });
  it('decide: every waiting approval opens its card — none approves', () => {
    const decide = en.filter((e) => e.group === 'decide');
    expect(decide.map(label)).toEqual(['Approve · Story of Paper Boats', 'Approve · Picture of Nour']);
    expect(decide.map((e) => e.action)).toEqual([{ type: 'go', href: '/production#needs-you' }, { type: 'go', href: '/characters/nour' }]);
  });
  it('settings: contrast, motion, single keys, the sheet — no language setting', () => {
    expect(en.filter((e) => e.group === 'settings').map((e) => e.name)).toEqual(['Contrast: More', 'Reduce motion: On', 'Single-key shortcuts: Off', 'Help & shortcuts']);
    const flipped = buildEntries(input({ prefs: { contrastMore: true, reducedMotion: true, singleKeys: false } })).filter((e) => e.group === 'settings');
    expect(flipped.map((e) => e.action)).toEqual([{ type: 'contrast', value: 'standard' }, { type: 'motion', value: false }, { type: 'keys', value: true }, { type: 'sheet' }]);
    expect(en.some((e) => /language|arabic/i.test(`${e.name} ${e.words ?? ''}`))).toBe(false);
  });
});

describe('search', () => {
  const en = buildEntries(input());
  it('matches a record by its name and by its Arabic title (content)', () => {
    expect(search(en, 'رشفة').map((e) => e.id)).toContain('show:last-sip');
    expect(search(en, 'last sip').map((e) => e.id)).toContain('show:last-sip');
    expect(search(en, 'cafe')[0].id).toBe('location:cafe');
  });
  it('keeps the group order and puts the best match of each group first', () => {
    const r = search(en, 'new sh');
    expect(r[0].id).toMatch(/^new:show:/);
    const groups = r.map((e) => e.group);
    expect(groups).toEqual([...groups].sort((a, b) => ['goto', 'create', 'decide', 'settings'].indexOf(a) - ['goto', 'create', 'decide', 'settings'].indexOf(b)));
  });
  it('needs every word, and finds nothing for nonsense', () => {
    expect(search(en, 'paper boats approve').map((e) => e.id)).toEqual(['decide:stage:paper-boats:STORY']);
    expect(search(en, 'zzqx')).toEqual([]);
    expect(search(en, '   ')).toEqual([]);
  });
});

describe('before anything is typed', () => {
  const en = buildEntries(input());
  it('shows the recent items first, then what waits, then the pages', () => {
    const v = emptyView(en, ['character:karim', 'gone:item', 'show:last-sip']);
    expect(v.recent.map((e) => e.id)).toEqual(['character:karim', 'show:last-sip']);
    expect(v.rest[0].group).toBe('decide');
    expect(v.rest.filter((e) => e.group === 'goto').every((e) => e.id.startsWith('page:'))).toBe(true);
  });
  it('remembers at most six, newest first, and never a setting', () => {
    let r: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'b']) r = pushRecent(r, id);
    expect(r).toEqual(['b', 'g', 'f', 'e', 'd', 'c']);
    expect(pushRecent(r, 'setting:contrast')).toBe(r);
  });
});
