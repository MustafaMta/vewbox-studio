import { redirect } from 'next/navigation';
import { firstParam, libraryTarget } from '@/components/shell/redirects';

/** /library was one area with Characters, Locations and Files as tabs. Since v4 each is its own place in the
 *  navigation's "Cast & world" group (docs/DESIGN-SYSTEM-V4.md §7.1, §7.2): the old address lands on the tab's page. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  redirect(libraryTarget(firstParam(sp.tab)));
}
