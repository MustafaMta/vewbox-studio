'use client';

import type { ComponentType } from 'react';
import { ShellSkeleton } from './ShellSkeleton';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { ProductionWorkspaceSkeleton, ShotWorkspaceSkeleton } from '@/components/workspace/WorkspaceSkeleton';
import { EpisodeSkeleton, SeasonSkeleton, ShowSkeleton, ShowsSkeleton } from '@/components/show/skeletons';
import { ShortSkeleton, ShortsSkeleton } from '@/components/film/skeletons';
import { MusicVideoSkeleton, MusicVideosSkeleton } from '@/components/music/skeletons';
import { ScreeningSkeleton } from '@/components/screening/ScreeningSkeleton';
import { CreateFlowSkeleton, CreateHubSkeleton } from '@/components/wizard/skeletons';
import { AgentSkeleton, DepartmentSkeleton, StudioCompanySkeleton } from '@/components/studio/skeletons';
import { ControlRoomSkeleton } from '@/components/production/skeletons';
import { SettingsSkeleton } from '@/components/settings/SettingsSkeleton';
import { FilesSkeleton } from '@/components/files/FilesSkeleton';
import { CharacterSkeleton, CharactersSkeleton } from '@/components/character/skeletons';
import { LocationSkeleton, LocationsSkeleton } from '@/components/location/skeletons';
import { CreateCharacterSkeleton } from '@/components/character/create/CreateCharacterSkeleton';
import { CreateLocationSkeleton } from '@/components/location/LocationCreateSkeleton';

/** ROUTE SKELETONS — what the main area shows while the studio's first snapshot is on its way (the shell renders a
 *  page only once the store is ready), and what `app/(app)/loading.tsx` shows while a route's code loads. The standard
 *  for every page (VISUAL-STANDARD-V5.1 §5.22, §6.1): a page whose layout differs from the generic one exports a
 *  `<Name>Skeleton` from a small module of its own that mirrors its final layout exactly (same ratios, line heights and
 *  gaps; built from the kit's Skeleton parts), and adds one line here. The shell picks the first entry whose path
 *  matches; a route nobody registered gets the generic ShellSkeleton. The same component is the page's own fallback
 *  while its per-page data loads.
 *
 *  The skeletons are imported statically (they are small: kit parts and class names), so a registered route draws its
 *  own skeleton synchronously — identical on the server and at hydration, with no generic picture in between. The
 *  Design QA of 2026-10-04 (M3) measured the lazy version on a slow network: the server's page skeleton, the generic
 *  one at hydration while the chunk loaded, the page skeleton again, then the content — four pictures for one load. */

type Entry = { match: (pathname: string) => boolean; Skeleton: ComponentType };

export const ROUTE_SKELETONS: Entry[] = [
  // Home (P-Home)
  { match: (p) => p === '/', Skeleton: HomeSkeleton },
  // the production workspace (P-Work)
  { match: (p) => /^\/(shorts|music-videos|shows\/[^/]+\/seasons\/[^/]+\/episodes)\/[^/]+\/production\/?$/.test(p), Skeleton: ProductionWorkspaceSkeleton },
  { match: (p) => /^\/(shorts|music-videos|shows\/[^/]+\/seasons\/[^/]+\/episodes)\/[^/]+\/shots\/[^/]+\/?$/.test(p), Skeleton: ShotWorkspaceSkeleton },
  // Shows (P-Shows): the catalogue, a show, a season, an episode's lobby (after the workspace routes above)
  { match: (p) => p === '/shows', Skeleton: ShowsSkeleton },
  { match: (p) => /^\/shows\/[^/]+$/.test(p), Skeleton: ShowSkeleton },
  { match: (p) => /^\/shows\/[^/]+\/seasons\/[^/]+$/.test(p), Skeleton: SeasonSkeleton },
  { match: (p) => /^\/shows\/[^/]+\/seasons\/[^/]+\/episodes\/[^/]+$/.test(p), Skeleton: EpisodeSkeleton },
  // Shorts (P-Film) and Music videos (P-Music): the catalogues and the title pages
  { match: (p) => p === '/shorts', Skeleton: ShortsSkeleton },
  { match: (p) => /^\/shorts\/[^/]+$/.test(p), Skeleton: ShortSkeleton },
  { match: (p) => p === '/music-videos', Skeleton: MusicVideosSkeleton },
  { match: (p) => /^\/music-videos\/[^/]+$/.test(p), Skeleton: MusicVideoSkeleton },
  // Screening Room (P-Theatre)
  { match: (p) => p === '/screening', Skeleton: ScreeningSkeleton },
  // Create (P-Create)
  { match: (p) => p === '/new', Skeleton: CreateHubSkeleton },
  { match: (p) => /^\/new\/(show|season|episode|short|music-video)$/.test(p), Skeleton: CreateFlowSkeleton },
  // Studio Company and the control pages (P-Studio)
  { match: (p) => p === '/studio', Skeleton: StudioCompanySkeleton },
  { match: (p) => p.startsWith('/studio/departments/'), Skeleton: DepartmentSkeleton },
  { match: (p) => p.startsWith('/studio/agents/'), Skeleton: AgentSkeleton },
  { match: (p) => p === '/production', Skeleton: ControlRoomSkeleton },
  { match: (p) => p === '/settings', Skeleton: SettingsSkeleton },
  { match: (p) => p === '/assets', Skeleton: FilesSkeleton },
  // Characters and Locations (P-Cast): "new" is its own page (its skeleton reads `?start=` for its mode), and the
  // [id] patterns exclude it
  { match: (p) => p === '/characters/new', Skeleton: CreateCharacterSkeleton },
  { match: (p) => p === '/locations/new', Skeleton: CreateLocationSkeleton },
  { match: (p) => p === '/characters', Skeleton: CharactersSkeleton },
  { match: (p) => /^\/characters\/(?!new$)[^/]+$/.test(p), Skeleton: CharacterSkeleton },
  { match: (p) => p === '/locations', Skeleton: LocationsSkeleton },
  { match: (p) => /^\/locations\/(?!new$)[^/]+$/.test(p), Skeleton: LocationSkeleton },
];

/** The skeleton registered for a path, or the generic one for a route nobody registered. */
export function routeSkeletonFor(pathname: string): ComponentType {
  return ROUTE_SKELETONS.find((e) => e.match(pathname))?.Skeleton ?? GenericSkeleton;
}
function GenericSkeleton() { return <ShellSkeleton label="Opening the studio…" />; }

export function RouteSkeleton({ pathname }: { pathname: string }) {
  const S = routeSkeletonFor(pathname);
  return <S />;
}
