import { redirect } from 'next/navigation';
import { firstParam, projectsTarget } from '@/components/shell/redirects';

/** /projects listed shows, shorts and music videos together. Since v4 the three catalogues are the navigation's
 *  "Productions" group and the Shows catalogue is the home (docs/DESIGN-SYSTEM-V4.md §7.1, §7.2). */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  redirect(projectsTarget(firstParam(sp.tab)));
}
