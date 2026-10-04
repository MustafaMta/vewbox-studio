import { ShotWorkspaceSkeleton } from '@/components/workspace/WorkspaceSkeleton';

/** While the route loads: the workspace's own skeleton at its real panel sizes (never the generic one). */
export default function Loading() {
  return <ShotWorkspaceSkeleton />;
}
