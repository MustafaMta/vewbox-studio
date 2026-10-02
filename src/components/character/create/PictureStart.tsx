'use client';

import { useState } from 'react';
import type { Asset } from '@/domain/types';
import { api, type ImageReferenceValidation } from '@/studio/api';
import { useStudio } from '@/studio/store';
import { isStudioError } from '@/domain/errors';
import { useT } from '@/components/ui/locale';
import { Button, Dropzone, Field, Input, Notice, Segmented, Textarea } from '@/components/ui/kit';
import { ImagePreview } from '@/components/ui/preview';
import { IconImageAdd, IconWand } from '@/components/ui/icons';
import { IMAGE_RULES, checkImageDims, checkImageFile, measureImage, type ImageRefusal } from './preflight';
import { fmtBytes } from '@/lib/format';

export interface PictureValues { asset?: Asset; validation?: ImageReferenceValidation; measured?: { width: number; height: number; bytes: number; name: string }; name: string; role: string; keep: 'FACE' | 'FACE_HAIR_WARDROBE'; note: string }

/** FROM A PICTURE — drop the picture first (the thing in hand). It is checked in the browser before anything is
 *  uploaded: PNG, JPEG or WebP, at most 20 MB, shortest side 512 px; SVG and GIF are refused with a sentence, never
 *  ignored later. The server then measures it again (size, sharpness, one face) and the result is shown. The picture
 *  is a guide, not the appearance, until a drawing replaces it. */
export function PictureStart({ value, onChange, onSubmit, busy, disabledReason, onCancel }: { value: PictureValues; onChange: (v: PictureValues) => void; onSubmit: () => void; busy?: boolean; disabledReason?: string | null; onCancel: () => void }) {
  const T = useT();
  const { refresh } = useStudio();
  const [uploading, setUploading] = useState(false);
  const [refusal, setRefusal] = useState<{ reason: ImageRefusal; detail: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (p: Partial<PictureValues>) => onChange({ ...value, ...p });
  const refusalText = (r: ImageRefusal, detail: string) => r === 'TYPE' ? `${T('char.create.img.type')} (${detail})` : r === 'SIZE' ? `${T('char.create.img.size')} (${detail})` : `${T('char.create.img.minSide')} (${detail})`;

  const choose = async (file: File) => {
    setRefusal(null); setServerError(null);
    const typeOrSize = checkImageFile(file);
    if (typeOrSize) { setRefusal({ reason: typeOrSize, detail: typeOrSize === 'TYPE' ? (file.type || file.name.split('.').pop() || '?') : fmtBytes(file.size) }); return; }
    let dims: { width: number; height: number };
    try { dims = await measureImage(file); } catch { setRefusal({ reason: 'TYPE', detail: file.name }); return; }
    const side = checkImageDims(dims.width, dims.height);
    if (side) { setRefusal({ reason: side, detail: `${dims.width} × ${dims.height}` }); return; }
    setUploading(true);
    try {
      const r = await api.uploadReference(file, { label: `${value.name.trim() || T('char.create.picture')} — ${T('char.ref.label')}`, tags: ['character', 'reference upload'] });
      await refresh();
      set({ asset: r.asset, validation: r.validation, measured: { ...dims, bytes: file.size, name: file.name } });
    } catch (e) { setServerError(isStudioError(e) ? e.message : (e as Error).message); }
    finally { setUploading(false); }
  };
  const remove = () => set({ asset: undefined, validation: undefined, measured: undefined });
  const serverRefused = value.validation && !value.validation.ok;
  const canSubmit = Boolean(value.asset) && !serverRefused && !disabledReason;
  return (
    <form className="card space-y-5 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(); }} aria-busy={busy || uploading || undefined} noValidate>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div>
          <p className="kicker mb-2">{T('char.ref.yours')}</p>
          {value.asset ? (
            <ImagePreview src={value.asset.src} alt={T('char.ref.yours')} fileName={value.measured?.name ?? value.asset.label} width={value.measured?.width ?? value.asset.width} height={value.measured?.height ?? value.asset.height} bytes={value.measured?.bytes ?? value.asset.bytes} onReplace={(f) => void choose(f)} onRemove={remove} busy={uploading} caption={T('char.generate.lead')} />
          ) : (
            <Dropzone label={T('char.create.dropPicture')} hint={`${T('char.create.dropHint')} · ${IMAGE_RULES.minSide}px · ${fmtBytes(IMAGE_RULES.maxBytes)}`} accept="image/png,image/jpeg,image/webp" icon={<IconImageAdd />} busy={uploading} onFile={(f) => void choose(f)} error={refusal ? refusalText(refusal.reason, refusal.detail) : serverError} />
          )}
          {value.asset && refusal && <p role="alert" className="help text-bad">{refusalText(refusal.reason, refusal.detail)}</p>}
          {value.asset && serverError && <p role="alert" className="help text-bad">{serverError}</p>}
          {value.validation && (
            <div className="mt-3 text-[12px]">
              {value.validation.ok
                ? <p className="status status-ok">{T('char.create.img.checked')}{typeof value.validation.faces === 'number' ? ` · ${value.validation.faces === 1 ? T('char.create.img.oneFace') : `${value.validation.faces} ${T('char.create.img.faces')}`}` : ''}</p>
                : <Notice tone="bad" title={T('char.create.img.refused')}><ul className="list-disc ps-4">{value.validation.reasons.map((r) => <li key={r} dir="auto">{T.dyn(`char.create.img.reason.${r}`, r)}</li>)}</ul></Notice>}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={T('label.name')} hint={T('wizard.optional')}><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} /></Field>
            <Field label={T('label.role')} hint={T('wizard.optional')}><Input value={value.role} onChange={(e) => set({ role: e.target.value })} maxLength={200} placeholder={T('char.form.rolePh')} /></Field>
          </div>
          <div>
            <p className="label">{T('char.create.keep')}</p>
            <Segmented label={T('char.create.keep')} value={value.keep} onChange={(v) => set({ keep: v })} options={[{ value: 'FACE' as const, label: T('char.create.keepFace') }, { value: 'FACE_HAIR_WARDROBE' as const, label: T('char.create.keepAll') }]} />
            <p className="help">{T('char.create.keepHint')}</p>
          </div>
          <Field label={T('char.create.keepChange')} hint={T('wizard.optional')} help={T('char.create.keepChangeHelp')}><Textarea value={value.note} onChange={(e) => set({ note: e.target.value })} rows={2} maxLength={600} /></Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-4">
        {disabledReason ? <p className="me-auto text-[12.5px] text-warn" role="status">{disabledReason}</p> : !value.asset ? <p className="me-auto text-[12.5px] text-faint">{T('char.create.needPicture')}</p> : null}
        <Button variant="ghost" onClick={onCancel}>{T('btn.cancel')}</Button>
        <Button type="submit" variant="primary" icon={<IconWand />} loading={busy} disabled={!canSubmit}>{T('char.create.designFromPicture')}</Button>
      </div>
    </form>
  );
}
