'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { ShellSkeleton } from './ShellSkeleton';
import { ProductionWorkspaceSkeleton, ShotWorkspaceSkeleton } from '@/components/workspace/WorkspaceSkeleton';

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
  // the production workspace (P-Work): src/components/workspace/WorkspaceSkeleton.tsx — imported statically: these routes
  // already ship it in their loading.tsx, and a lazy copy here drew the generic shell skeleton for ~200 ms between the
  // page's own skeleton and its content on a slow line (Design QA M3)
  { match: (p) => /^\/(shorts|music-videos|shows\/[^/]+\/seasons\/[^/]+\/episodes)\/[^/]+\/production\/?$/.test(p), Skeleton: ProductionWorkspaceSkeleton },
  { match: (p) => /^\/(shorts|music-videos|shows\/[^/]+\/seasons\/[^/]+\/episodes)\/[^/]+\/shots\/[^/]+\/?$/.test(p), Skeleton: ShotWorkspaceSkeleton },
  // Shows (P-Shows): the catalogue, a show, a season, an episode's lobby (after the workspace routes above)
  { match: (p) => p === '/shows', Skeleton: lazy(() => import('@/components/show/ShowsCatalogue'), 'ShowsSkeleton') },
  { match: (p) => /^\/shows\/[^/]+$/.test(p), Skeleton: lazy(() => import('@/components/show/ShowPage'), 'ShowSkeleton') },
  { match: (p) => /^\/shows\/[^/]+\/seasons\/[^/]+$/.test(p), Skeleton: lazy(() => import('@/components/show/SeasonPage'), 'SeasonSkeleton') },
  { match: (p) => /^\/shows\/[^/]+\/seasons\/[^/]+\/episodes\/[^/]+$/.test(p), Skeleton: lazy(() => import('@/components/show/EpisodeLobby'), 'EpisodeSkeleton') },
  // Shorts (P-Film) and Music videos (P-Music): the catalogues and the title pages
  { match: (p) => p === '/shorts', Skeleton: lazy(() => import('@/components/film/ShortsCatalogue'), 'ShortsSkeleton') },
  { match: (p) => /^\/shorts\/[^/]+$/.test(p), Skeleton: lazy(() => import('@/components/film/ShortPage'), 'ShortSkeleton') },
  { match: (p) => p === '/music-videos', Skeleton: lazy(() => import('@/components/music/MusicVideos'), 'MusicVideosSkeleton') },
  { match: (p) => /^\/music-videos\/[^/]+$/.test(p), Skeleton: lazy(() => import('@/components/music/MusicVideo'), 'MusicVideoSkeleton') },
  // Screening Room (P-Theatre)
  { match: (p) => p === '/screening', Skeleton: lazy(() => import('@/components/screening/ScreeningRoom'), 'ScreeningSkeleton') },
  // Create (P-Create): src/components/wizard/CreateHub.tsx and CreateFlow.tsx
  { match: (p) => p === '/new', Skeleton: lazy(() => import('@/components/wizard/CreateHub'), 'CreateHubSkeleton') },
  { match: (p) => /^\/new\/(show|season|episode|short|music-video)$/.test(p), Skeleton: lazy(() => import('@/components/wizard/CreateFlow'), 'CreateFlowSkeleton') },
  // Studio Company and the control pages (P-Studio)
  { match: (p) => p === '/studio', Skeleton: lazy(() => import('@/components/studio/Company'), 'StudioCompanySkeleton') },
  { match: (p) => p.startsWith('/studio/departments/'), Skeleton: lazy(() => import('@/components/studio/Department'), 'DepartmentSkeleton') },
  { match: (p) => p.startsWith('/studio/agents/'), Skeleton: lazy(() => import('@/components/studio/Agent'), 'AgentSkeleton') },
  { match: (p) => p === '/production', Skeleton: lazy(() => import('@/components/production/ControlRoom'), 'ControlRoomSkeleton') },
  { match: (p) => p === '/settings', Skeleton: lazy(() => import('@/components/settings/Settings'), 'SettingsSkeleton') },
  { match: (p) => p === '/assets', Skeleton: lazy(() => import('@/components/files/Files'), 'FilesSkeleton') },
  // Characters and Locations (P-Cast): "new" is its own page, so the [id] patterns exclude it
  { match: (p) => p === '/characters', Skeleton: lazy(() => import('@/components/character/CastDirectory'), 'CharactersSkeleton') },
  { match: (p) => /^\/characters\/(?!new$)[^/]+$/.test(p), Skeleton: lazy(() => import('@/components/character/CharacterPage'), 'CharacterSkeleton') },
  { match: (p) => p === '/locations', Skeleton: lazy(() => import('@/components/location/LocationsDirectory'), 'LocationsSkeleton') },
  { match: (p) => /^\/locations\/(?!new$)[^/]+$/.test(p), Skeleton: lazy(() => import('@/components/location/LocationPage'), 'LocationSkeleton') },
];

export function RouteSkeleton({ pathname }: { pathname: string }) {
  const entry = ROUTE_SKELETONS.find((e) => e.match(pathname));
  if (!entry) return <ShellSkeleton label="Opening the studio…" />;
  const S = entry.Skeleton;
  return <S />;
}
