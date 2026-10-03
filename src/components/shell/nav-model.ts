import type { Key } from '@/lib/copy';

/** THE STUDIO'S NAVIGATION, as data (docs/DESIGN-SYSTEM-V4.md §7.1) — three groups and a footer, in the same order in
 *  the sidebar, the rail and the phone's menu sheet (WCAG 3.2.3). Pure, so the order, the areas and the current item
 *  are unit-tested (tests/unit/f4-nav.test.ts); the components map the icon names to icons. */

export type NavIcon = 'shows' | 'shorts' | 'musicVideos' | 'characters' | 'locations' | 'files' | 'company' | 'production' | 'screening' | 'settings';
export interface NavItem {
  href: string;
  key: Key;
  icon: NavIcon;
  /** other routes that belong to this area (the creation flows, the old addresses that redirect here) */
  also?: string[];
  /** the needs-you count is shown on this item */
  needsYou?: boolean;
}
export interface NavGroup { id: 'productions' | 'castWorld' | 'studio'; label: Key; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'productions', label: 'shell.group.productions', items: [
    { href: '/shows', key: 'nav.shows', icon: 'shows', also: ['/new/show', '/new/season', '/new/episode', '/projects'] },
    { href: '/shorts', key: 'nav.shorts', icon: 'shorts', also: ['/new/short'] },
    { href: '/music-videos', key: 'nav.musicVideos', icon: 'musicVideos', also: ['/new/music-video'] },
  ] },
  { id: 'castWorld', label: 'shell.group.castWorld', items: [
    { href: '/characters', key: 'nav.characters', icon: 'characters', also: ['/library'] },
    { href: '/locations', key: 'nav.locations', icon: 'locations' },
    { href: '/assets', key: 'nav.files', icon: 'files' },
  ] },
  { id: 'studio', label: 'nav.studioArea', items: [
    { href: '/studio', key: 'nav.company', icon: 'company' },
    { href: '/production', key: 'nav.production', icon: 'production', also: ['/jobs'], needsYou: true },
    { href: '/screening', key: 'screening.title', icon: 'screening' },
  ] },
];

/** The footer's one link (Help, SaveState, the connection and Collapse are controls, not places). */
export const SETTINGS_ITEM: NavItem = { href: '/settings', key: 'nav.settings', icon: 'settings' };

/** Every place in navigation order, the footer's Settings last. */
export const NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

/** The home: the brand glyph goes here, and `/` redirects here (§7.1, §7.2). */
export const HOME = '/shows';

const hit = (pathname: string, h: string) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`));
export function isActive(pathname: string, href: string, also: string[] = []): boolean {
  return hit(pathname, href) || also.some((a) => hit(pathname, a));
}

/** The navigation item the page belongs to, if any. */
export function currentItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => isActive(pathname, n.href, n.also));
}

/** The name of the area the page belongs to — what the phone's top bar says, so the producer stays oriented. */
export function areaKey(pathname: string): Key | null {
  const item = currentItem(pathname);
  if (item) return item.key;
  if (hit(pathname, '/new')) return 'nav.new';
  return null;
}
