'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/studio/store';
import { T } from '@/lib/copy';
import { IconSearch } from '@/components/ui/icons';
import { GROUP_ORDER, buildEntries, emptyView, pushRecent, search, type PaletteEntry, type PaletteGroup } from './palette';
import { usePageEntries } from './palette-registry';
import { usePrefs, writePrefs } from './preferences';
import { useOrgNames } from './org-names';
import { useShell } from './context';
import { ShellDialog } from './ShellDialog';

/** THE COMMAND PALETTE (docs/DESIGN-SYSTEM-V4.md §5.17, §7.6) — Ctrl/⌘K. A 640 px dialog at 15vh with a 48 px search
 *  field. Results come grouped Go to · Create · Decide · Settings with kind-first labels; ↑/↓ move, Enter opens, Esc
 *  closes and gives focus back. Before anything is typed it shows the recent items, what waits for a decision, and
 *  the pages. A decision opens its card; nothing is approved from here. ARIA: a combobox that owns a listbox. */

const RECENT_KEY = 'vewbox.palette.recent';
const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const writeRecent = (ids: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch { /* fine */ } };

type Section = { id: PaletteGroup | 'recent'; items: PaletteEntry[] };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ShellDialog open={open} onClose={onClose} label={T('shell.palette.title')} placement="top" width={640} className="palette-dialog">
      <PaletteBody onClose={onClose} />
    </ShellDialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { state, act } = useStudio();
  const { decisions, openShortcuts } = useShell();
  const prefs = usePrefs();
  const org = useOrgNames(true);
  const pageEntries = usePageEntries();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => { setRecent(readRecent()); input.current?.focus(); }, []);

  const seg = pathname.split('/');
  const currentShowId = seg[1] === 'shows' && seg[2] ? decodeURIComponent(seg[2]) : null;
  const systemMore = typeof matchMedia === 'function' && matchMedia('(prefers-contrast: more)').matches;
  const contrastMore = prefs.contrast === 'more' || (prefs.contrast !== 'standard' && systemMore);

  const entries = useMemo(() => {
    const built = buildEntries({
      state, decisions: decisions.items, departments: org?.departments ?? [], currentShowId,
      prefs: { contrastMore, reducedMotion: state.settings.reducedMotion, singleKeys: prefs.keys !== false },
    });
    // a page's own commands join their group
    return GROUP_ORDER.flatMap((g) => [...built.filter((e) => e.group === g), ...pageEntries.filter((e) => e.group === g)]);
  }, [state, decisions.items, org, currentShowId, contrastMore, prefs.keys, pageEntries]);

  const sections: Section[] = useMemo(() => {
    if (q.trim()) {
      const found = search(entries, q);
      return GROUP_ORDER.map((g) => ({ id: g, items: found.filter((e) => e.group === g) })).filter((s) => s.items.length);
    }
    // nothing typed: the recent items, then what waits for a decision, then the pages
    const v = emptyView(entries, recent);
    const out: Section[] = [];
    if (v.recent.length) out.push({ id: 'recent', items: v.recent });
    for (const g of ['decide', 'goto'] as const) { const items = v.rest.filter((e) => e.group === g); if (items.length) out.push({ id: g, items }); }
    return out;
  }, [entries, q, recent]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const optionId = (i: number) => `${listId}-o${i}`;

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' }); }); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (e: PaletteEntry) => {
    const next = pushRecent(recent, e.id); setRecent(next); writeRecent(next);
    const a = e.action;
    onClose();
    switch (a.type) {
      case 'go': router.push(a.href); break;
      case 'contrast': writePrefs({ contrast: a.value }); break;
      case 'keys': writePrefs({ keys: a.value }); break;
      case 'motion': act('updateSettings', { reducedMotion: a.value }); break;
      case 'sheet': openShortcuts(); break;
      case 'run': a.run(); break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (flat.length ? (i + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 8)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 8)); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); const hit = flat[active]; if (hit) run(hit); }
  };

  const label = (id: Section['id']) => T(`shell.palette.group.${id}`);
  let index = -1;
  return (
    <div className="palette">
      <div className="palette-field">
        <IconSearch aria-hidden className="palette-search-icon" />
        <input ref={input} className="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={flat.length ? optionId(active) : undefined} aria-label={T('shell.palette.label')} placeholder={T('shell.palette.placeholder')}
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} autoComplete="off" spellCheck={false} dir="auto" />
      </div>
      <div id={listId} role="listbox" aria-label={T('shell.palette.title')} className="palette-list">
        {sections.map((s) => (
          <div key={s.id} role="group" aria-labelledby={`${listId}-${s.id}`} className="palette-group">
            <div id={`${listId}-${s.id}`} role="presentation" className="palette-group-label">{label(s.id)}</div>
            {s.items.map((e) => {
              index += 1; const i = index;
              return (
                <div key={`${s.id}:${e.id}`} id={optionId(i)} role="option" aria-selected={i === active} className="palette-option"
                  onPointerMove={() => { if (i !== active) setActive(i); }} onClick={() => run(e)}>
                  <span className="palette-kind">{e.kind}</span>
                  <span className="palette-sep" aria-hidden>·</span>
                  <span className="palette-name" dir="auto">{e.name}</span>
                  {e.detail && <span className="palette-detail" dir="auto">{e.detail}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {q.trim() && !flat.length && <p className="palette-empty">{T.f('shell.palette.none', { q: q.trim() })}</p>}
      <p className="sr-only" role="status">{q.trim() ? T.p('shell.palette.count', flat.length) : ''}</p>
      <p className="palette-hint" aria-hidden>{T('shell.palette.hint')}</p>
    </div>
  );
}
