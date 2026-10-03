'use client';

import { useEffect, useState } from 'react';
import type { OrgNames } from './titles';

/** Department and agent names (they are not in the studio snapshot): read once per session from GET /api/studio/org,
 *  and only when something asks — the title of a /studio/… page, or the command palette's Go to group. */
let names: OrgNames | null = null;
let loading: Promise<OrgNames | null> | null = null;

function load(): Promise<OrgNames | null> {
  if (names) return Promise.resolve(names);
  loading ??= fetch('/api/studio/org', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((o: OrgNames | null) => (names = o ? { departments: o.departments ?? [], agents: o.agents ?? [] } : null))
    .catch(() => null)
    .finally(() => { loading = null; });
  return loading;
}

export function useOrgNames(wanted: boolean): OrgNames | null {
  const [value, setValue] = useState(names);
  useEffect(() => {
    if (!wanted) return;
    if (names) { setValue(names); return; }
    let on = true;
    void load().then((o) => { if (on) setValue(o); });
    return () => { on = false; };
  }, [wanted]);
  return value;
}
