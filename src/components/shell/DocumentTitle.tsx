'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { documentTitle } from './titles';
import { useOrgNames } from './org-names';
import { useShellMaybe } from './context';

/** THE PAGE'S TITLE (docs/DESIGN-SYSTEM-V4.md §5.1 DocumentTitle, §7.3; fixes V4-11, WCAG 2.4.2) — named from the
 *  route and the studio's records in the interface language, rendered once by the shell so no page has to remember
 *  it. Production carries the number of decisions waiting in front ("(3) Production · …"), only when it is known.
 *
 *  It sets `document.title`, which rewrites the one <title> in <head>: the root layout's static "Vewbox Studio",
 *  which stands until the page is named. Two forms were tried first and left the head with several titles
 *  (scripts/v4-titles.mjs counts them): a React 19 <title> element (the root metadata title plus two copies of the
 *  hoisted one), and a metadata title (the router re-inserts it ahead of the page's own on every navigation). */
export function DocumentTitle() {
  const pathname = usePathname() ?? '/';
  const search = useSearchParams();
  const { state } = useStudio();
  const T = useT();
  const shell = useShellMaybe();
  const org = useOrgNames(pathname.startsWith('/studio/'));
  const waiting = shell?.decisions.complete ? shell.decisions.count : 0;
  const title = documentTitle({ pathname, search, state, locale: T.locale, org, waiting });
  useEffect(() => { document.title = title; }, [title]);
  return null;
}
