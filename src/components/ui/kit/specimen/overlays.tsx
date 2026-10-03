'use client';

import { useState } from 'react';
import { useToast } from '../../toast';
import { IconAuto, IconClose, IconDelete, IconDuplicate, IconEdit, IconManual, IconPlus } from '../../icons';
import { Button } from '../Button';
import { Field, Input } from '../Field';
import { Dialog, Drawer, MenuButton, MenuItem, MenuLink, MenuSeparator, Popover, Sheet, useAsk, useConfirm } from '../Overlay';
import { StateWord } from '../Status';
import { Cell, SpecRow, SpecSection, Still } from './parts';

/** /kit — DIALOGS, DRAWERS, SHEETS, MENUS AND POPOVERS (§5.16, §5.17): live, and drawn open with every state. */
export function OverlaysSpec() {
  const toast = useToast();
  const confirm = useConfirm();
  const ask = useAsk();
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sort, setSort] = useState('recent');
  return (
    <SpecSection id="overlays" title="Dialogs, drawers, sheets and menus" lead="One modal surface: radius 20, the close button at the top end, Esc and the overlay close it, focus stays inside and goes back to the opener. Below 640 px a dialog or drawer is a bottom sheet.">
      <SpecRow label="Open one">
        <Button onClick={() => setDialog(true)} data-testid="open-dialog">Dialog</Button>
        <Button variant="danger" icon={<IconDelete />} onClick={async () => { if (await confirm({ title: 'Delete “The Kite”?', body: 'Its seasons, episodes and cuts go with it.', keep: 'The characters and locations are kept.' })) toast.ok('Deleted'); }}>Confirm</Button>
        <Button onClick={async () => setAnswer(await ask({ title: 'Reject this take?', label: 'Why is this take rejected?', confirmLabel: 'Reject' }))}>Ask</Button>
        <Button onClick={() => setDrawer(true)} data-testid="open-drawer">Drawer</Button>
        <Button onClick={() => setSheet(true)} data-testid="open-sheet">Sheet</Button>
        {answer !== null && <p className="kit-spec-state" role="status">Answer: {answer || '—'}</p>}
      </SpecRow>
      <SpecRow label="Menu (dropdown)">
        <MenuButton label="More" iconOnly variant="quiet">
          <MenuItem icon={<IconEdit />} description="Change the title, the logline and the style">Edit</MenuItem>
          <MenuItem icon={<IconDuplicate />}>Duplicate</MenuItem>
          <MenuLink href="#overlays">Open the film</MenuLink>
          <MenuItem disabled description="No cut yet">Export</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<IconDelete />} tone="danger">Delete</MenuItem>
        </MenuButton>
        <MenuButton label="New show" icon={<IconPlus />} caret variant="secondary" align="start">
          <MenuItem icon={<IconAuto />} description="A line is enough; you review it before anything is made">Let the studio propose</MenuItem>
          <MenuItem icon={<IconManual />} description="Every other field has a sensible default">Write it yourself</MenuItem>
        </MenuButton>
        <MenuButton label={`Sort: ${sort === 'recent' ? 'Recently updated' : 'Title'}`} caret variant="quiet">
          <MenuItem checked={sort === 'recent'} onClick={() => setSort('recent')}>Recently updated</MenuItem>
          <MenuItem checked={sort === 'title'} onClick={() => setSort('title')}>Title</MenuItem>
        </MenuButton>
        <Popover label="Popover" title="A popover">
          {(close) => (
            <div className="kit-spec-pop">
              <p className="t-body">A non-modal panel under its button. Esc closes it.</p>
              <Button size="sm" onClick={close}>Done</Button>
            </div>
          )}
        </Popover>
      </SpecRow>
      <SpecRow label="Drawn open">
        <Cell state="Menu: rest · hover · keyboard · disabled · danger">
          <Still caption="Items 36 high, radius 10; the keyboard's item is the hover tone with the ring">
            <div className="menu kit-spec-menu-still">
              <span className="menu-item menu-item-2"><IconEdit /><span className="menu-item-text"><span>Edit</span><span className="menu-item-desc">Change the title, the logline and the style</span></span></span>
              <span className="menu-item is-hover"><IconDuplicate /><span className="menu-item-label">Duplicate</span></span>
              <span className="menu-item is-hover is-focus"><IconPlus /><span className="menu-item-label">New season</span></span>
              <span className="menu-item is-disabled"><span className="menu-item-label">Export</span></span>
              <div className="menu-sep" />
              <span className="menu-item" data-tone="danger"><IconDelete /><span className="menu-item-label">Delete</span></span>
            </div>
          </Still>
        </Cell>
        <Cell state="Dialog (440)" wide>
          <Still caption="Title 16/22, the body 8 below, the footer 24 below; quiet Cancel, then the confirm">
            <div className="dlg dialog dialog-sm kit-spec-dialog-still">
              <div className="dialog-frame">
                <header className="dialog-head"><h2 className="t-title dialog-title">Delete “The Kite”?</h2><span className="btn btn-quiet btn-icon btn-sm dialog-close"><IconClose /></span></header>
                <div className="dialog-body"><p className="t-body confirm-body">Its seasons, episodes and cuts go with it.</p><p className="t-body confirm-keep">The characters and locations are kept.</p></div>
                <footer className="dialog-foot"><span className="btn btn-quiet">Cancel</span><span className="btn btn-danger-solid">Delete</span></footer>
              </div>
            </div>
          </Still>
        </Cell>
      </SpecRow>

      <Dialog open={dialog} onClose={() => setDialog(false)} title="Rename the show" description="The new title shows on the key art and in the catalogue."
        footer={<><Button variant="quiet" onClick={() => setDialog(false)} data-testid="dialog-cancel">Cancel</Button><Button variant="primary" onClick={() => { setDialog(false); toast.ok('Saved'); }} data-testid="dialog-save">Save</Button></>}>
        <Field label="Title" help="Shown on the key art and in the catalogue."><Input defaultValue="The Kite" data-testid="dialog-title" /></Field>
        <Field label="Logline" optional><Input /></Field>
      </Dialog>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Activity" footer={<Button onClick={() => setDrawer(false)}>Close</Button>}>
        <ol className="rows">
          <li className="row"><StateWord tone="running">Drawing shot 7 of 20</StateWord></li>
          <li className="row"><StateWord tone="done">The story was approved</StateWord></li>
          <li className="row"><StateWord tone="failed">A take failed: out of memory</StateWord></li>
        </ol>
      </Drawer>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="More">
        <nav aria-label="More" className="kit-spec-sheet-list">
          <a className="menu-item" href="#overlays">Locations</a>
          <a className="menu-item" href="#overlays">Production</a>
          <a className="menu-item" href="#overlays">Screening Room</a>
          <a className="menu-item" href="#overlays">Settings</a>
        </nav>
      </Sheet>
    </SpecSection>
  );
}
