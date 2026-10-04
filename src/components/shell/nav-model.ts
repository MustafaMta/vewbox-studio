/** THE STUDIO'S NAVIGATION, as data — the one list the sidebar, the collapsed rail, the phone's bottom bar and its
 *  sheets, the command palette and the document titles read (WCAG 3.2.3: the same places in the same order
 *  everywhere). Pure, so the order, the areas and the current item are unit-tested (tests/unit/f4-nav.test.ts); the
 *  components map the icon names to icons. The interface is English-only: labels are written here, not looked up.
 *
 *  (docs/design/VISUAL-STANDARD-V5.1.md §5.1, §5.2)
 *
 *    sidebar   brand row (mark, Vewbox, collapse) · Search
 *              Home · Shows · Shorts · Music Videos · Characters · Studio Company
 *              Workspace:   Locations · Production (needs-you count) · Screening Room · Files
 *              footer:      the studio's state · Settings · Help & shortcuts
 *    phone     Home · Productions (→ Shows; Shows | Shorts | Music Videos is a switch at the top of the three
 *              catalogues: shell/ProductionsSwitch) · Characters · Studio · More
 *              More:        Productions: Shows · Shorts · Music Videos (Design QA M4: every catalogue reachable from
 *                           the bars) · Workspace: Locations · Production (count) · Screening Room · Files · Settings ·
 *                           Help & shortcuts · the state */

export type NavIcon = 'home' | 'shows' | 'shorts' | 'musicVideos' | 'characters' | 'company' | 'production' | 'screening' | 'locations' | 'files' | 'settings';
export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** other routes that belong to this area (the creation flows, the old addresses that redirect here) */
  also?: string[];
  /** the needs-you count is shown on this item */
  needsYou?: boolean;
}
export interface NavGroup { id: 'primary' | 'workspace'; /** a visible heading, or none for the first group */ label: string | null; items: NavItem[] }

const ITEM = {
  home: { href: '/', label: 'Home', icon: 'home' },
  shows: { href: '/shows', label: 'Shows', icon: 'shows', also: ['/new/show', '/new/season', '/new/episode', '/projects'] },
  shorts: { href: '/shorts', label: 'Shorts', icon: 'shorts', also: ['/new/short'] },
  musicVideos: { href: '/music-videos', label: 'Music Videos', icon: 'musicVideos', also: ['/new/music-video'] },
  characters: { href: '/characters', label: 'Characters', icon: 'characters', also: ['/library'] },
  company: { href: '/studio', label: 'Studio Company', icon: 'company' },
  production: { href: '/production', label: 'Production', icon: 'production', also: ['/jobs'], needsYou: true },
  screening: { href: '/screening', label: 'Screening Room', icon: 'screening' },
  locations: { href: '/locations', label: 'Locations', icon: 'locations' },
  files: { href: '/assets', label: 'Files', icon: 'files' },
  settings: { href: '/settings', label: 'Settings', icon: 'settings' },
} as const satisfies Record<string, NavItem>;

export const NAV_GROUPS: NavGroup[] = [
  { id: 'primary', label: null, items: [ITEM.home, ITEM.shows, ITEM.shorts, ITEM.musicVideos, ITEM.characters, ITEM.company] },
  { id: 'workspace', label: 'Workspace', items: [ITEM.locations, ITEM.production, ITEM.screening, ITEM.files] },
];

/** The footer's one link (Help, the connection, the save state and Collapse are controls, not places). */
export const SETTINGS_ITEM: NavItem = ITEM.settings;

/** Every place in navigation order, the footer's Settings last. */
export const NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

/** The home: the brand mark goes here. */
export const HOME = '/';

/** The phone and tablet (< 1024): five tabs. Productions opens Shows, which carries Shows | Shorts | Music Videos at
 *  its top, and is the current tab on all three; More opens a sheet of the places it holds. */
export type PhoneTab =
  | { id: 'home' | 'productions' | 'characters' | 'studio'; label: string; icon: NavIcon; item: NavItem; also?: NavItem[] }
  | { id: 'more'; label: string; icon: 'more'; items: NavItem[] };
export const PRODUCTION_ITEMS: NavItem[] = [ITEM.shows, ITEM.shorts, ITEM.musicVideos];
export const MORE_ITEMS: NavItem[] = [ITEM.locations, ITEM.production, ITEM.screening, ITEM.files, ITEM.settings];
export const PHONE_TABS: PhoneTab[] = [
  { id: 'home', label: 'Home', icon: 'home', item: ITEM.home },
  { id: 'productions', label: 'Productions', icon: 'shows', item: ITEM.shows, also: [ITEM.shorts, ITEM.musicVideos] },
  { id: 'characters', label: 'Characters', icon: 'characters', item: ITEM.characters },
  { id: 'studio', label: 'Studio', icon: 'company', item: ITEM.company },
  { id: 'more', label: 'More', icon: 'more', items: MORE_ITEMS },
];

const hit = (pathname: string, h: string) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`));
export function isActive(pathname: string, href: string, also: readonly string[] = []): boolean {
  return hit(pathname, href) || also.some((a) => hit(pathname, a));
}

/** The navigation item the page belongs to, if any. */
export function currentItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => isActive(pathname, n.href, n.also));
}

/** The phone tab the page belongs to, if any. */
export function currentTab(pathname: string): PhoneTab['id'] | undefined {
  for (const t of PHONE_TABS) {
    const items = 'item' in t ? [t.item, ...(t.also ?? [])] : t.items;
    if (items.some((n) => isActive(pathname, n.href, n.also))) return t.id;
  }
  return undefined;
}

/** The name of the area the page belongs to — what the phone's top bar says, so the producer stays oriented. */
export function areaLabel(pathname: string): string | null {
  const item = currentItem(pathname);
  if (item) return item.label;
  if (hit(pathname, '/new')) return 'New';
  return null;
}
