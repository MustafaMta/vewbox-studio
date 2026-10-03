/** OLD ADDRESSES (docs/DESIGN-SYSTEM-V4.md §7.2) — where the pre-v4 areas land now. Pure; the route files call these
 *  and tests/unit/f4-nav.test.ts checks them.
 *    /library  (Characters · Locations · Files as tabs)  → /characters, or the tab's own page
 *    /projects (shows, shorts and music videos together) → /shows, or the tab's own catalogue
 *    /jobs     (the activity list)                       → /production#activity, keeping an open job */

export function libraryTarget(tab: string | null | undefined): string {
  return tab === 'locations' ? '/locations' : tab === 'assets' ? '/assets' : '/characters';
}

export function projectsTarget(tab: string | null | undefined): string {
  return tab === 'shorts' ? '/shorts' : tab === 'music' ? '/music-videos' : '/shows';
}

export function jobsTarget(job: string | null | undefined): string {
  return job ? `/production?job=${encodeURIComponent(job)}#activity` : '/production#activity';
}

/** The first value of a search parameter as Next hands it to a page. */
export const firstParam = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
