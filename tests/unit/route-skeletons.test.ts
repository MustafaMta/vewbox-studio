import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// the skeletons read only the path (CreateFlowSkeleton picks the preview's ratio from it)
vi.mock('next/navigation', () => ({ usePathname: () => '/new/short', useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() }));

import { ROUTE_SKELETONS, RouteSkeleton, routeSkeletonFor } from '@/components/shell/route-skeletons';

/** ROUTE SKELETONS (Design QA 2026-10-04, M3): a registered route draws its own skeleton synchronously — the same
 *  markup on the server and at hydration, never the generic frame in between — so a slow network shows one loading
 *  picture and then the content. */

const SAMPLE: Array<[string, string]> = [
  ['/', 'home-skeleton'],
  ['/shorts/short-1/production', 'ws-skeleton'],
  ['/shorts/short-1/shots/shot-1', 'ws-skeleton'],
  ['/shows/show-1/seasons/s1/episodes/ep-1/production', 'ws-skeleton'],
  ['/shows', 'shows-skeleton'],
  ['/shows/show-1', 'show-page'],
  ['/shows/show-1/seasons/s1', 'season-page'],
  ['/shows/show-1/seasons/s1/episodes/ep-1', 'episode-page'],
  ['/shorts', 'shorts-skeleton'],
  ['/shorts/short-1', 'film-skeleton'],
  ['/music-videos', 'mv-sk'],
  ['/music-videos/mv-1', 'mv-page'],
  ['/screening', 'theatre-skeleton'],
  ['/new', 'create-hub'],
  ['/new/short', 'create-skeleton'],
  ['/studio', 'company'],
  ['/studio/departments/CASTING', 'dept'],
  ['/studio/agents/casting-director', 'agent'],
  ['/production', 'control'],
  ['/settings', 'settings'],
  ['/assets', 'files'],
  ['/characters', 'pc-skeleton'],
  ['/characters/char-1', 'char-figure'],
  ['/locations', 'pc-plates'],
  ['/locations/loc-1', 'loc-hero'],
  ['/kit', 'kit-skeleton'],
];

describe('route skeletons', () => {
  it('are imported statically: no next/dynamic, no loading fallback, every entry a plain component', () => {
    const src = fs.readFileSync('src/components/shell/route-skeletons.tsx', 'utf8');
    expect(src).not.toMatch(/next\/dynamic|loading:\s*\(\)/);
    for (const e of ROUTE_SKELETONS) expect(typeof e.Skeleton).toBe('function');
  });

  it('every registered route renders its own skeleton on the server, never the generic frame', () => {
    for (const [path, mark] of SAMPLE) {
      const html = renderToStaticMarkup(h(RouteSkeleton, { pathname: path }));
      expect(html, path).toContain(mark);
      expect(html, path).not.toContain('shell-skeleton');
      expect(html, path).toMatch(/aria-busy="true"/);
    }
  });

  it('a route nobody registered gets the generic frame; "new" pages draw their own creation frame, not an [id] page', () => {
    expect(renderToStaticMarkup(h(RouteSkeleton, { pathname: '/somewhere-else' }))).toContain('shell-skeleton');
    for (const p of ['/characters/new', '/locations/new']) {
      const html = renderToStaticMarkup(h(RouteSkeleton, { pathname: p }));
      expect(html, p).toContain('pc-create');
      expect(html, p).not.toContain('shell-skeleton');
      expect(html, p).not.toMatch(/char-figure|loc-hero/);
    }
    expect(routeSkeletonFor('/shorts')).toBe(routeSkeletonFor('/shorts'));
  });

  it('the (app) loading boundary draws the same route skeleton', () => {
    const src = fs.readFileSync('src/app/(app)/loading.tsx', 'utf8');
    expect(src).toMatch(/RouteSkeleton/);
    expect(src).not.toMatch(/ShellSkeleton/);
  });
});
