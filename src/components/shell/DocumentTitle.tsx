'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { documentTitle, type OrgNames } from './titles';

/** THE PAGE'S TITLE (docs/DESIGN-SYSTEM-V4.md §5.1 DocumentTitle, §7.3; fixes V4-11, WCAG 2.4.2) — named from the
 *  route and the studio's records in the interface language, rendered once by the (app) shell so no page has to
 *  remember it. Owned by F4 (added by F0).
 *
 *  It sets `document.title`, which rewrites the one <title> in <head>: the root layout's static "Vewbox Studio",
 *  which stands until the page is named. Two forms were tried first and left the head with several titles
 *  (scripts/v4-titles.mjs counts them): a React 19 <title> element (the root metadata title plus two copies of the
 *  hoisted one), and a metadata title (the router re-inserts it ahead of the page's own on every navigation). */

// department and agent names are not in the studio snapshot: read them once per session, only on those routes
let orgNames: OrgNames | null = null;
let orgLoad: Promise<OrgNames | null> | null = null;
function useOrgNames(wanted: boolean): OrgNames | null {
  const [names, setNames] = useState(orgNames);
  useEffect(() => {
    if (!wanted || orgNames) return;
    let on = true;
    orgLoad ??= fetch('/api/studio/org', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((o: OrgNames | null) => (orgNames = o ? { departments: o.departments, agents: o.agents } : null)).catch(() => null).finally(() => { orgLoad = null; });
    void orgLoad.then((o) => { if (on) setNames(o); });
    return () => { on = false; };
  }, [wanted]);
  return names;
}

export function DocumentTitle() {
  const pathname = usePathname() ?? '/';
  const search = useSearchParams();
  const { state } = useStudio();
  const T = useT();
  const org = useOrgNames(pathname.startsWith('/studio/'));
  const title = documentTitle({ pathname, search, state, locale: T.locale, org });
  useEffect(() => { document.title = title; }, [title]);
  return null;
}
