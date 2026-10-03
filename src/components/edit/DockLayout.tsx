'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls, Menu, MenuItem, Segmented } from '@/components/ui/kit';
import { IconChevronLeft, IconChevronRight, IconClose, IconReplay } from '@/components/ui/icons';
import { useShortcutScope } from '@/components/players/useShortcutScope';
import { useFocusMode } from './FocusMode';
import { useMediaQuery } from './useMediaQuery';

/** THE DOCK LAYOUT (docs/DESIGN-SYSTEM-V4.md §4.1, §5.20, §6.6) — the cutting room's panes:
 *    ≥ 1280   [list 280] | [canvas 1fr] | [inspector 320], two splitters
 *    1024–1279  canvas | inspector; the list is a start drawer
 *    768–1023   the canvas alone; the list is a start drawer and the inspector an end drawer, opened from labelled buttons
 *    < 768      one pane; a segmented control switches List · Canvas · Details
 *  Panels have a 40 px header (title 13/18 600 and a collapse button) and scroll vertically; the canvas never scrolls
 *  (no nested scrollbars). Splitters are 8 px hit areas showing a 1 px line, `role="separator"` with their width as
 *  value: drag, or ←/→ 16 px (mirrored in Arabic) and Enter to collapse; *More › Reset layout* restores the defaults
 *  (2.5.7). Widths persist per workspace in this browser. Focus mode (F) collapses both panels. In Arabic the list
 *  docks on the right and the inspector on the left. The footer (film strip or timeline) spans the full width. */

export interface DockPanel { title: string; content: ReactNode }
interface Layout { list: number; inspector: number; listCollapsed: boolean; inspectorCollapsed: boolean }
const DEFAULT: Layout = { list: 280, inspector: 320, listCollapsed: false, inspectorCollapsed: false };
const BOUNDS = { list: [200, 480], inspector: [260, 520] } as const;
const keyOf = (id: string) => `vewbox.dock.${id}`;
function load(id: string): Layout { try { return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(keyOf(id)) ?? '{}') as Partial<Layout>) }; } catch { return DEFAULT; } }
function save(id: string, l: Layout) { try { localStorage.setItem(keyOf(id), JSON.stringify(l)); } catch { /* a convenience only */ } }
const clampW = (k: 'list' | 'inspector', w: number) => Math.round(Math.max(BOUNDS[k][0], Math.min(BOUNDS[k][1], w)));

/** A docked panel: the 40 px header and a vertically scrolling body. */
export function Panel({ title, onCollapse, actions, children, className, collapseLabel }: { title: string; onCollapse?: () => void; actions?: ReactNode; children: ReactNode; className?: string; collapseLabel?: string }) {
  const id = useId();
  return (
    <section className={cls('dock-panel', className)} aria-labelledby={`${id}-h`}>
      <header className="dock-panel-head">
        <h2 id={`${id}-h`} className="dock-panel-title">{title}</h2>
        {actions}
        {onCollapse && <button type="button" className="ebtn ebtn-icon" aria-label={collapseLabel ?? T.f('media.dock.collapse', { panel: title })} onClick={onCollapse}><IconChevronLeft aria-hidden className="dock-collapse-glyph" /></button>}
      </header>
      <div className="dock-panel-body">{children}</div>
    </section>
  );
}

function Splitter({ panel, title, width, onWidth, onToggle }: { panel: 'list' | 'inspector'; title: string; width: number; onWidth: (w: number) => void; onToggle: () => void }) {
  const drag = useRef<{ x: number; w: number; rtl: boolean } | null>(null);
  // the separator grows its panel when it moves away from it: toward the inline end for the list, the start for the inspector
  const grow = (e: { currentTarget: Element }) => { const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'; return (panel === 'list') !== rtl ? 1 : -1; };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const g = grow(e);
    if (e.key === 'ArrowRight') { e.preventDefault(); onWidth(clampW(panel, width + 16 * g)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onWidth(clampW(panel, width - 16 * g)); }
    else if (e.key === 'Home') { e.preventDefault(); onWidth(BOUNDS[panel][0]); }
    else if (e.key === 'End') { e.preventDefault(); onWidth(BOUNDS[panel][1]); }
    else if (e.key === 'Enter') { e.preventDefault(); onToggle(); }
  };
  return (
    <div className="dock-split" role="separator" aria-orientation="vertical" tabIndex={0} aria-label={T.f('media.dock.resize', { panel: title })}
      aria-valuenow={width} aria-valuemin={BOUNDS[panel][0]} aria-valuemax={BOUNDS[panel][1]} onKeyDown={onKey}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, w: width, rtl: getComputedStyle(e.currentTarget).direction === 'rtl' }; }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; const g = (panel === 'list') !== d.rtl ? 1 : -1; onWidth(clampW(panel, d.w + dx * g)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
  );
}

function Drawer({ side, title, open, onClose, children }: { side: 'start' | 'end'; title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); else if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} className="dock-drawer" data-side={side} aria-label={title} onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dock-drawer-inner">
        <header className="dock-panel-head">
          <h2 className="dock-panel-title">{title}</h2>
          <button type="button" className="ebtn ebtn-icon" aria-label={T.f('media.dock.close', { panel: title })} onClick={onClose}><IconClose aria-hidden /></button>
        </header>
        <div className="dock-panel-body">{open && children}</div>
      </div>
    </dialog>
  );
}

export function DockLayout({ id, list, canvas, canvasTitle, inspector, footer, tools, className }: { id: string; list?: DockPanel; canvas: ReactNode; canvasTitle: string; inspector?: DockPanel; footer?: ReactNode; /** the workspace's own controls in the layout bar (the focus-mode button) */ tools?: ReactNode; className?: string }) {
  const focus = useFocusMode();
  const three = useMediaQuery('(min-width: 1280px)');
  const two = useMediaQuery('(min-width: 1024px)');
  const tablet = useMediaQuery('(min-width: 768px)');
  const mode = three ? 'three' : two ? 'two' : tablet ? 'drawers' : 'single';
  const [l, setL] = useState<Layout>(DEFAULT);
  const [drawer, setDrawer] = useState<'list' | 'inspector' | null>(null);
  const [pane, setPane] = useState<'list' | 'canvas' | 'inspector'>('canvas');
  useEffect(() => { setL(load(id)); }, [id]);
  const update = useCallback((patch: Partial<Layout>) => setL((x) => { const n = { ...x, ...patch }; save(id, n); return n; }), [id]);
  const reset = () => { setL(DEFAULT); save(id, DEFAULT); };
  const keys = useShortcutScope({ f: focus.toggle }, { scope: 'workspace' });

  const listOn = Boolean(list) && !focus.on && (mode === 'three');
  const inspOn = Boolean(inspector) && !focus.on && (mode === 'three' || mode === 'two');
  const cols: string[] = [];
  if (listOn) cols.push(l.listCollapsed ? '40px' : `${l.list}px`, '8px');
  cols.push('minmax(0, 1fr)');
  if (inspOn) cols.push('8px', l.inspectorCollapsed ? '40px' : `${l.inspector}px`);

  const collapsedRail = (k: 'list' | 'inspector', p: DockPanel) => (
    <div className="dock-rail"><button type="button" className="ebtn ebtn-icon" aria-label={T.f('media.dock.expand', { panel: p.title })} onClick={() => update(k === 'list' ? { listCollapsed: false } : { inspectorCollapsed: false })}>{k === 'list' ? <IconChevronRight aria-hidden className="rtl:rotate-180" /> : <IconChevronLeft aria-hidden className="rtl:rotate-180" />}</button></div>
  );

  return (
    <div className={cls('dock', className)} data-mode={mode} data-focus-mode={focus.on ? 'on' : 'off'} onKeyDown={keys}>
      <div className="dock-bar">
        {mode === 'single' ? (
          <Segmented<typeof pane> value={pane} onChange={setPane} label={T('media.dock.panes')} className="dock-panes"
            options={([list && ['list', list.title], ['canvas', canvasTitle], inspector && ['inspector', inspector.title]].filter(Boolean) as Array<[typeof pane, string]>).map(([value, label]) => ({ value, label }))} />
        ) : (
          <>
            {list && (mode === 'two' || mode === 'drawers') && !focus.on && <button type="button" className="ebtn" onClick={() => setDrawer('list')}><IconChevronRight aria-hidden className="rtl:rotate-180" />{T.f('media.dock.open', { panel: list.title })}</button>}
            {inspector && mode === 'drawers' && !focus.on && <button type="button" className="ebtn" onClick={() => setDrawer('inspector')}>{T.f('media.dock.open', { panel: inspector.title })}<IconChevronLeft aria-hidden className="rtl:rotate-180" /></button>}
          </>
        )}
        <span className="prow-spacer" />
        {tools}
        {(mode === 'three' || mode === 'two') && (
          <Menu label={`${T('media.dock.layout')}: ${T('nav.more')}`}>
            <MenuItem icon={<IconReplay />} onClick={reset}>{T('media.dock.reset')}</MenuItem>
          </Menu>
        )}
      </div>
      <div className="dock-grid" style={{ gridTemplateColumns: mode === 'single' ? '1fr' : cols.join(' ') }}>
        {mode === 'single' ? (
          <div className="dock-single">
            {pane === 'list' && list && <Panel title={list.title}>{list.content}</Panel>}
            {pane === 'canvas' && <div className="dock-canvas canvas">{canvas}</div>}
            {pane === 'inspector' && inspector && <Panel title={inspector.title}>{inspector.content}</Panel>}
          </div>
        ) : (
          <>
            {listOn && list && (l.listCollapsed ? collapsedRail('list', list) : <Panel title={list.title} onCollapse={() => update({ listCollapsed: true })}>{list.content}</Panel>)}
            {listOn && list && <Splitter panel="list" title={list.title} width={l.list} onWidth={(w) => update({ list: w, listCollapsed: false })} onToggle={() => update({ listCollapsed: !l.listCollapsed })} />}
            <div className="dock-canvas canvas">{canvas}</div>
            {inspOn && inspector && <Splitter panel="inspector" title={inspector.title} width={l.inspector} onWidth={(w) => update({ inspector: w, inspectorCollapsed: false })} onToggle={() => update({ inspectorCollapsed: !l.inspectorCollapsed })} />}
            {inspOn && inspector && (l.inspectorCollapsed ? collapsedRail('inspector', inspector) : <Panel title={inspector.title} className="dock-inspector" onCollapse={() => update({ inspectorCollapsed: true })}>{inspector.content}</Panel>)}
          </>
        )}
      </div>
      {footer && <div className="dock-footer">{footer}</div>}
      {list && <Drawer side="start" title={list.title} open={drawer === 'list'} onClose={() => setDrawer(null)}>{list.content}</Drawer>}
      {inspector && <Drawer side="end" title={inspector.title} open={drawer === 'inspector'} onClose={() => setDrawer(null)}>{inspector.content}</Drawer>}
    </div>
  );
}
