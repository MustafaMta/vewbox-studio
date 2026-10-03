/** URL STATE (docs/DESIGN-SYSTEM-V4.md §7.4) — the shared rules for what lives in the address, so every catalogue
 *  and workspace writes it the same way and Back, Forward and shared links restore it. Pure; tests/unit/f4-url-state.
 *
 *  - Tabs, the season, Song/Video mode, filters, sort and view are search parameters.
 *  - All active filters travel in one parameter: `?f=style:CARTOON,lang:AR` (a facet may repeat: `lang:AR,lang:EN`).
 *  - Opening a workspace tab pushes (Back returns to the lobby); switching between workspace tabs replaces (Back
 *    leaves the workspace). `useUrlState` (useUrlState.ts) applies this with the router. */

export type Filters = Record<string, string[]>;

/** `style:CARTOON,lang:AR,lang:EN` → { style: ['CARTOON'], lang: ['AR', 'EN'] }. Malformed pieces are dropped. */
export function parseFilters(f: string | null | undefined): Filters {
  const out: Filters = {};
  for (const piece of (f ?? '').split(',')) {
    const i = piece.indexOf(':');
    if (i <= 0 || i === piece.length - 1) continue;
    const facet = piece.slice(0, i).trim(); const value = piece.slice(i + 1).trim();
    if (!facet || !value) continue;
    const list = (out[facet] ??= []);
    if (!list.includes(value)) list.push(value);
  }
  return out;
}

/** The other way; null when nothing is filtered (so the parameter leaves the address). Facets keep their order. */
export function formatFilters(f: Filters): string | null {
  const parts = Object.entries(f).flatMap(([facet, values]) => values.filter(Boolean).map((v) => `${facet}:${v}`));
  return parts.length ? parts.join(',') : null;
}

/** Add, change or (with null/undefined/'') remove search parameters; returns `?…` or '' — for a Link href or the router. */
export function withSearch(current: string | URLSearchParams, patch: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams(typeof current === 'string' ? current.replace(/^\?/, '') : current.toString());
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '') sp.delete(k); else sp.set(k, v); }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** How to move between two tabs of one page: push when entering (or leaving) the workspace, replace between two
 *  workspace tabs. `workspace` says which tab ids are workspace tabs (Story, Storyboard, Produce, Final cut…). */
export function tabNavigation(from: string | null | undefined, to: string | null | undefined, workspace: (tab: string) => boolean): 'push' | 'replace' {
  return from && to && workspace(from) && workspace(to) ? 'replace' : 'push';
}
