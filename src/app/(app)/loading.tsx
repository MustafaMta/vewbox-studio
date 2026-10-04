'use client';

import { usePathname } from 'next/navigation';
import { RouteSkeleton } from '@/components/shell/route-skeletons';

/** While a route's code loads: the route's own skeleton (the same one the shell draws until the studio's first
 *  snapshot arrives), so one loading picture stands from the first byte to the content; a route nobody registered
 *  gets the generic frame. No spinner; the region says once, for screen readers, what it waits for. */
export default function Loading() {
  const pathname = usePathname() ?? '/';
  return <RouteSkeleton pathname={pathname} />;
}
