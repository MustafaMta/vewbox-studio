'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { ShellSkeleton } from './ShellSkeleton';

/** ROUTE SKELETONS — what the main area shows while the studio's first snapshot is on its way (the shell renders a
 *  page only once the store is ready). The standard for every page (VISUAL-STANDARD-V5.1 §5.22, §6.1): a page whose
 *  layout differs from the generic one exports a `<Name>Skeleton` from its own package that mirrors its final layout
 *  exactly (same ratios, line heights and gaps; built from the kit's Skeleton parts), and adds one line here. The
 *  shell picks the first entry whose path matches; everything else gets the generic ShellSkeleton. The same
 *  component should be the page's own fallback while its per-page data loads, and its route's `loading.tsx`.
 *
 *  Skeletons are loaded on demand (next/dynamic), so the shell does not carry every page's code; while one loads, the
 *  generic skeleton stands in. A package that has not exported its skeleton yet falls back to the generic one. */

type Entry = { match: (pathname: string) => boolean; Skeleton: ComponentType };

const pick = (m: unknown, name: string): ComponentType => ((m as Record<string, ComponentType | undefined>)[name] ?? ShellSkeleton);
const lazy = (load: () => Promise<unknown>, name: string): ComponentType =>
  dynamic(() => load().then((m) => pick(m, name)), { loading: () => <ShellSkeleton /> });

export const ROUTE_SKELETONS: Entry[] = [
  // Home (P-Home): src/components/home/Home.tsx exports HomeSkeleton
  { match: (p) => p === '/', Skeleton: lazy(() => import('@/components/home/Home'), 'HomeSkeleton') },
  // Create (P-Create): src/components/wizard/CreateHub.tsx and CreateFlow.tsx
  { match: (p) => p === '/new', Skeleton: lazy(() => import('@/components/wizard/CreateHub'), 'CreateHubSkeleton') },
  { match: (p) => /^\/new\/(show|season|episode|short|music-video)$/.test(p), Skeleton: lazy(() => import('@/components/wizard/CreateFlow'), 'CreateFlowSkeleton') },
];

export function RouteSkeleton({ pathname }: { pathname: string }) {
  const entry = ROUTE_SKELETONS.find((e) => e.match(pathname));
  if (!entry) return <ShellSkeleton label="Opening the studio…" />;
  const S = entry.Skeleton;
  return <S />;
}
