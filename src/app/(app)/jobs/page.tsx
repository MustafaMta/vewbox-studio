import { redirect } from 'next/navigation';
import { firstParam, jobsTarget } from '@/components/shell/redirects';

/** /jobs was the activity list. It lives in Production's history now (src/components/production/ControlRoom.tsx):
 *  the old address lands there, keeping an open job (`?job=`). */
export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  redirect(jobsTarget(firstParam(sp.job)));
}