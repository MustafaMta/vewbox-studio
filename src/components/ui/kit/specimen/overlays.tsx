'use client';

import { useState } from 'react';
import { T } from '@/lib/copy';
import { useToast } from '../../toast';
import { IconAuto, IconClose, IconDelete, IconDuplicate, IconEdit, IconManual, IconMore, IconPlus } from '../../icons';
import { Button } from '../Button';
import { Field, Input } from '../Field';
import { Dialog, Drawer, MenuButton, MenuItem, MenuSeparator, Popover, useAsk, useConfirm } from '../Overlay';
import { StateWord } from '../Status';
import { Cell, SpecRow, SpecSection, Still } from './parts';

export function OverlaysSpec() {
  const toast = useToast();
  const confirm = useConfirm();
  const ask = useAsk();
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <SpecSection id="overlays" title={'Overlays'} lead={'Esc closes the innermost layer and focus goes back to what opened it. No blur, no glow.'}>
      <SpecRow label={'Try them'}>
        <Button onClick={() => setDialog(true)}>Open a dialog</Button>
        <Button variant="danger" icon={<IconDelete />} onClick={async () => { const ok = await confirm({ title: `Delete “${'The Kite'}”?`, body: 'Its seasons, episodes and shots go with it.', keep: 'Its characters and locations stay in the studio.' }); if (ok) toast.ok('Deleted.'); }}>Delete a show…</Button>
        <Button onClick={async () => setAnswer(await ask({ title: 'Reject Take 2?', label: 'Why? The next take avoids it.', confirmLabel: 'Reject' }))}>Reject a take…</Button>
        <Button onClick={() => setDrawer(true)}>Open the activity drawer</Button>
        {answer !== null && <p className="caption basis-full" role="status">{`The answer: ${answer || '—'}`}</p>}
      </SpecRow>
      <SpecRow label="Popover · MenuButton">
        <Popover label={'Filter'} title={'Filter'}>
          {(close) => (
            <div className="flex w-[16rem] flex-col gap-3 p-3">
              <p className="text-sm text-body">A popover holds a few controls and closes on Esc or a click outside.</p>
              <Button size="sm" onClick={close}>Done</Button>
            </div>
          )}
        </Popover>
        <MenuButton label={'More'} iconOnly variant="quiet">
          <MenuItem icon={<IconEdit />} description={'Title, logline and style'}>Edit</MenuItem>
          <MenuItem icon={<IconDuplicate />}>Duplicate</MenuItem>
          <MenuItem disabled description={'No cut yet'}>Export</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<IconDelete />} tone="danger">Delete</MenuItem>
        </MenuButton>
        <MenuButton label={'New show'} icon={<IconPlus />} caret variant="secondary" align="start">
          <MenuItem icon={<IconAuto />} description={'Let the studio propose — you review it before anything is made'}>Let the studio propose</MenuItem>
          <MenuItem icon={<IconManual />} description={'Start from a title; every other field has a default'}>Write it yourself</MenuItem>
        </MenuButton>
      </SpecRow>
      <SpecRow label="Toast">
        <Button onClick={() => toast.ok('Saved.')}>Show a toast</Button>
        <Button onClick={() => toast.push({ tone: 'info', text: 'Moved to the archive.', action: { label: 'Undo', onClick: () => toast.ok('Back where it was.') } })}>Show a toast with Undo</Button>
        <Button onClick={() => toast.bad('The take was not saved. Your changes are still here.')}>Show an error toast</Button>
      </SpecRow>
      <SpecRow label={'Drawn open'}>
        <Cell state="Menu">
          <Still caption={'A menu: an item with a description, hovered, focused, disabled, and the one that removes.'}>
            <div className="menu menu-still">
              <span className="menu-item menu-item-2"><IconEdit /><span className="menu-item-text"><span>Edit</span><span className="menu-item-desc">Title, logline and style</span></span></span>
              <span className="menu-item is-hover"><IconDuplicate />Duplicate</span>
              <span className="menu-item is-focus"><IconMore />More</span>
              <span className="menu-item is-disabled">Export</span>
              <div className="menu-sep" />
              <span className="menu-item" data-tone="danger"><IconDelete />Delete</span>
            </div>
          </Still>
        </Cell>
        <Cell state="Toast" wide>
          <Still caption={'A toast with Undo stays at least 10 seconds, longer while hovered or focused.'}>
            <div className="toast toast-v4 toast-still">
              <span className="state-dot" data-tone="running" />
              <div className="min-w-0 flex-1"><p>Moved to the archive.</p><span className="mt-1 flex gap-3"><span className="toast-action">Undo</span></span></div>
              <span className="btn btn-quiet btn-xs btn-icon"><IconClose /></span>
            </div>
          </Still>
        </Cell>
        <Cell state="Dialog" wide>
          <Still caption={'A confirm: the title names the object; the one filled red button deletes.'}>
            <div className="dialog-still dialog-sm">
              <div className="dialog-head"><span className="h2 min-w-0 flex-1">{`Delete “${'The Kite'}”?`}</span><span className="btn btn-quiet btn-sm btn-icon"><IconClose /></span></div>
              <div className="dialog-body"><p className="text-body">Its seasons, episodes and shots go with it.</p><p className="mt-2 text-muted">Its characters and locations stay in the studio.</p></div>
              <div className="dialog-foot"><span className="btn btn-quiet">Cancel</span><span className="btn btn-danger-solid">Delete</span></div>
            </div>
          </Still>
        </Cell>
      </SpecRow>

      <Dialog open={dialog} onClose={() => setDialog(false)} title={'Rename the show'} description={'The new title shows everywhere the show appears.'}
        footer={<><Button variant="quiet" onClick={() => setDialog(false)}>Cancel</Button><Button variant="primary" onClick={() => { setDialog(false); toast.ok('Saved.'); }}>Save</Button></>}>
        <Field label={'Title'} help={'Shown on the key art and in the catalogue.'}><Input defaultValue={'The Kite'} /></Field>
        <Field label={'Logline'} optional className="mt-5"><Input /></Field>
      </Dialog>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={'Activity'}>
        <ol className="rows">
          {[['running', 'kit.spec.drawer.l1'], ['done', 'kit.spec.drawer.l2'], ['failed', 'kit.spec.drawer.l3']].map(([tone, k]) => (
            <li key={k} className="row"><StateWord tone={tone as 'running' | 'done' | 'failed'}>{T(k as 'kit.spec.drawer.l1')}</StateWord></li>
          ))}
        </ol>
      </Drawer>
    </SpecSection>
  );
}
