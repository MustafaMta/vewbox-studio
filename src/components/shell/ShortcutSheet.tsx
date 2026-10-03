'use client';

import { Fragment } from 'react';
import { T } from '@/lib/copy';
import { Toggle } from '@/components/ui/kit';
import { SHORTCUT_SCOPES, type KeyName } from './shortcuts';
import { usePrefs, writePrefs } from './preferences';
import { ShellDialog } from './ShellDialog';
import { useModLabel } from './Sidebar';

/** THE SHORTCUT SHEET (docs/DESIGN-SYSTEM-V4.md §5.17, §7.5) — `?` when focus is not in a text field, or Help &
 *  shortcuts in the navigation. The shortcuts by scope (Global · Player · Storyboard · Timeline), with the on/off
 *  preference for single-key shortcuts (WCAG 2.1.4). Key combinations are written left to right. */
export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ShellDialog open={open} onClose={onClose} title={'Keyboard shortcuts'} placement="center" width={720} className="keys-dialog">
      <SheetBody />
    </ShellDialog>
  );
}

function Keys({ combo }: { combo: KeyName[] }) {
  const mod = useModLabel();
  const name = (k: KeyName) => (k === 'Mod' ? mod : k === 'Space' ? 'Space' : k === 'Click' ? 'Click' : k === 'Scroll' ? 'Scroll' : k);
  return <span className="keys-combo">{combo.map((k, i) => <Fragment key={i}>{i > 0 && <span aria-hidden>+</span>}<kbd className="kbd">{name(k)}</kbd></Fragment>)}</span>;
}

function SheetBody() {
  const prefs = usePrefs();
  const on = prefs.keys !== false;
  return (
    <div className="keys-sheet">
      <div className="keys-pref">
        <Toggle label={'Single-key shortcuts'} help={'Keys pressed without Ctrl or ⌘, such as ? and F and the player’s keys. Turn them off if they get in the way of a screen reader or voice control.'} checked={on} onChange={(v) => writePrefs({ keys: v })} />
      </div>
      <div className="keys-scopes">
        {SHORTCUT_SCOPES.map((scope) => (
          <table key={scope.id} className="keys-table">
            <caption><span className="keys-scope">{T(scope.label)}</span><span className="keys-scope-hint">{T(scope.hint)}</span></caption>
            <tbody>
              {scope.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{T(r.label)}</th>
                  <td><span dir="ltr" className="keys-alts">{r.keys.map((combo, i) => <Fragment key={i}>{i > 0 && <span className="keys-or">or</span>}<Keys combo={combo} /></Fragment>)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
