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
    <SpecSection id="overlays" title={T('kit.spec.sec.overlays')} lead={T('kit.spec.overlays.lead')}>
      <SpecRow label={T('kit.spec.try')}>
        <Button onClick={() => setDialog(true)}>{T('kit.spec.open.dialog')}</Button>
        <Button variant="danger" icon={<IconDelete />} onClick={async () => { const ok = await confirm({ title: T.f('kit.spec.confirm.title', { name: T('kit.spec.ph.title') }), body: T('kit.spec.confirm.body'), keep: T('kit.spec.confirm.keep') }); if (ok) toast.ok(T('toast.deleted')); }}>{T('kit.spec.open.confirm')}</Button>
        <Button onClick={async () => setAnswer(await ask({ title: T('kit.spec.ask.title'), label: T('kit.spec.ask.label'), confirmLabel: T('kit.spec.ask.confirm') }))}>{T('kit.spec.open.ask')}</Button>
        <Button onClick={() => setDrawer(true)}>{T('kit.spec.open.drawer')}</Button>
        {answer !== null && <p className="caption basis-full" role="status">{T.f('kit.spec.ask.answer', { text: answer || '—' })}</p>}
      </SpecRow>
      <SpecRow label="Popover · MenuButton">
        <Popover label={T('kit.spec.popover')} title={T('kit.spec.popover')}>
          {(close) => (
            <div className="flex w-[16rem] flex-col gap-3 p-3">
              <p className="text-sm text-body">{T('kit.spec.popoverBody')}</p>
              <Button size="sm" onClick={close}>{T('btn.done')}</Button>
            </div>
          )}
        </Popover>
        <MenuButton label={T('nav.more')} iconOnly variant="quiet">
          <MenuItem icon={<IconEdit />} description={T('kit.spec.menu.editHint')}>{T('btn.edit')}</MenuItem>
          <MenuItem icon={<IconDuplicate />}>{T('btn.duplicate')}</MenuItem>
          <MenuItem disabled description={T('kit.spec.noCut')}>{T('kit.spec.menu.export')}</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<IconDelete />} tone="danger">{T('btn.delete')}</MenuItem>
        </MenuButton>
        <MenuButton label={T('kit.spec.pal.newShow')} icon={<IconPlus />} caret variant="secondary" align="start">
          <MenuItem icon={<IconAuto />} description={T('kit.spec.menu.autoHint')}>{T('kit.create.auto')}</MenuItem>
          <MenuItem icon={<IconManual />} description={T('kit.spec.menu.manualHint')}>{T('kit.create.manual')}</MenuItem>
        </MenuButton>
      </SpecRow>
      <SpecRow label="Toast">
        <Button onClick={() => toast.ok(T('toast.saved'))}>{T('kit.spec.toast.ok')}</Button>
        <Button onClick={() => toast.push({ tone: 'info', text: T('kit.spec.toast.archived'), action: { label: T('kit.undo'), onClick: () => toast.ok(T('kit.spec.toast.restored')) } })}>{T('kit.spec.toast.undo')}</Button>
        <Button onClick={() => toast.bad(T('kit.spec.toast.error'))}>{T('kit.spec.toast.bad')}</Button>
      </SpecRow>
      <SpecRow label={T('kit.spec.static')}>
        <Cell state="Menu">
          <Still caption={T('kit.spec.static.menu')}>
            <div className="menu menu-still">
              <span className="menu-item menu-item-2"><IconEdit /><span className="menu-item-text"><span>{T('btn.edit')}</span><span className="menu-item-desc">{T('kit.spec.menu.editHint')}</span></span></span>
              <span className="menu-item is-hover"><IconDuplicate />{T('btn.duplicate')}</span>
              <span className="menu-item is-focus"><IconMore />{T('nav.more')}</span>
              <span className="menu-item is-disabled">{T('kit.spec.menu.export')}</span>
              <div className="menu-sep" />
              <span className="menu-item" data-tone="danger"><IconDelete />{T('btn.delete')}</span>
            </div>
          </Still>
        </Cell>
        <Cell state="Toast" wide>
          <Still caption={T('kit.spec.static.toast')}>
            <div className="toast toast-v4 toast-still">
              <span className="state-dot" data-tone="running" />
              <div className="min-w-0 flex-1"><p>{T('kit.spec.toast.archived')}</p><span className="mt-1 flex gap-3"><span className="toast-action">{T('kit.undo')}</span></span></div>
              <span className="btn btn-quiet btn-xs btn-icon"><IconClose /></span>
            </div>
          </Still>
        </Cell>
        <Cell state="Dialog" wide>
          <Still caption={T('kit.spec.static.dialog')}>
            <div className="dialog-still dialog-sm">
              <div className="dialog-head"><span className="h2 min-w-0 flex-1">{T.f('kit.spec.confirm.title', { name: T('kit.spec.ph.title') })}</span><span className="btn btn-quiet btn-sm btn-icon"><IconClose /></span></div>
              <div className="dialog-body"><p className="text-body">{T('kit.spec.confirm.body')}</p><p className="mt-2 text-muted">{T('kit.spec.confirm.keep')}</p></div>
              <div className="dialog-foot"><span className="btn btn-quiet">{T('btn.cancel')}</span><span className="btn btn-danger-solid">{T('btn.delete')}</span></div>
            </div>
          </Still>
        </Cell>
      </SpecRow>

      <Dialog open={dialog} onClose={() => setDialog(false)} title={T('kit.spec.dlg.title')} description={T('kit.spec.dlg.desc')}
        footer={<><Button variant="quiet" onClick={() => setDialog(false)}>{T('btn.cancel')}</Button><Button variant="primary" onClick={() => { setDialog(false); toast.ok(T('toast.saved')); }}>{T('btn.save')}</Button></>}>
        <Field label={T('label.title')} help={T('kit.spec.help.title')}><Input defaultValue={T('kit.spec.ph.title')} /></Field>
        <Field label={T('label.logline')} optional className="mt-5"><Input /></Field>
      </Dialog>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={T('kit.spec.drawer.title')}>
        <ol className="rows">
          {[['running', 'kit.spec.drawer.l1'], ['done', 'kit.spec.drawer.l2'], ['failed', 'kit.spec.drawer.l3']].map(([tone, k]) => (
            <li key={k} className="row"><StateWord tone={tone as 'running' | 'done' | 'failed'}>{T(k as 'kit.spec.drawer.l1')}</StateWord></li>
          ))}
        </ol>
      </Drawer>
    </SpecSection>
  );
}
