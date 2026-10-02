'use client';

import { useState, type ReactNode } from 'react';
import type { Asset } from '@/domain/types';
import { SEXES, type Sex } from '@/domain/vocabulary';
import { api, type ImageReferenceValidation } from '@/studio/api';
import { useStudio } from '@/studio/store';
import { isStudioError } from '@/domain/errors';
import { useT } from '@/components/ui/locale';
import { Button, Details, Dropzone, Field, Input, Notice, Segmented, Textarea } from '@/components/ui/kit';
import { ImagePreview } from '@/components/ui/preview';
import { IconImageAdd, IconWand } from '@/components/ui/icons';
import { AGE_BANDS, type AgeBand } from '../sheetModel';
import { checkImageDims, checkImageFile, measureImage, refusalReasons, type ImageRefusal } from './preflight';
import { fmtBytes } from '@/lib/format';
import { Footer } from './DescribeStart';

export interface PictureValues { asset?: Asset; validation?: ImageReferenceValidation; measured?: { width: number; height: number; bytes: number; name: string }; name: string; role: string; keep: 'FACE' | 'FACE_HAIR_WARDROBE'; note: string; /** who the picture shows, as the producer says it (never preselected) */ sex?: Sex; band?: AgeBand; /** keep FACE: the hair and clothes the producer writes instead of the picture's (empty: the picture's) */ hair?: string; wardrobe?: string }

/** FROM A PICTURE (DESIGN-SYSTEM-V3 §9.5, E7) — the drop target IS a 4:5 frame, so the producer sees the shape that
 *  will be drawn from. The picture is checked in the browser before anything is uploaded (PNG, JPEG or WebP, at most
 *  20 MB, at least 512 px on the short side; SVG and GIF are refused with a sentence), then measured again by the
 *  server. Beside it: name, role, what to keep, what should change. The picture guides the look; the studio draws the
 *  canonical image from it. */
export function PictureStart({ value, onChange, onSubmit, busy, disabledReason, onCancel, settings }: { value: PictureValues; onChange: (v: PictureValues) => void; onSubmit: () => void; busy?: boolean; disabledReason?: string | null; onCancel: () => void; settings: ReactNode }) {
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
    <form className="panel space-y-6 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(); }} aria-busy={busy || uploading || undefined} noValidate>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="max-w-[15rem]">
          {value.asset ? (
            <ImagePreview src={value.asset.src} alt={T('char.ref.yours')} fileName={value.measured?.name ?? value.asset.label} width={value.measured?.width ?? value.asset.width} height={value.measured?.height ?? value.asset.height} bytes={value.measured?.bytes ?? value.asset.bytes} onReplace={(f) => void choose(f)} onRemove={remove} busy={uploading} />
          ) : (
            <Dropzone className="[&>label]:aspect-[4/5] [&>label]:px-4" label={T('cast.picture.drop')} hint={T('cast.picture.browse')} accept="image/png,image/jpeg,image/webp" icon={<IconImageAdd />} busy={uploading} onFile={(f) => void choose(f)} error={refusal ? refusalText(refusal.reason, refusal.detail) : serverError} />
          )}
          {value.asset && refusal && <p role="alert" className="help text-bad">{refusalText(refusal.reason, refusal.detail)}</p>}
          {value.asset && serverError && <p role="alert" className="help text-bad">{serverError}</p>}
          <p className="help">{T('cast.picture.rules')}</p>
          {value.validation && (
            <div className="mt-3">
              {value.validation.ok
                ? <p className="status status-ok whitespace-normal">{T('char.create.img.checked')}{typeof value.validation.faces === 'number' ? ` · ${value.validation.faces === 1 ? T('char.create.img.oneFace') : `${value.validation.faces} ${T('char.create.img.faces')}`}` : ` · ${T('char.create.img.noFaceCheck')}`}</p>
                : <Notice tone="bad" title={T('char.create.img.refused')}><ul className="list-disc ps-4">{refusalReasons(value.validation.reasons).map((r) => <li key={r} dir="auto">{T.dyn(`char.create.img.reason.${r}`, r)}</li>)}</ul></Notice>}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={T('label.name')} hint={T('wizard.optional')}><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} /></Field>
            <Field label={T('label.role')} hint={T('wizard.optional')}><Input value={value.role} onChange={(e) => set({ role: e.target.value })} maxLength={200} placeholder={T('char.form.rolePh')} /></Field>
          </div>
          <div>
            <p className="label">{T('char.create.keep')}</p>
            <Segmented label={T('char.create.keep')} value={value.keep} onChange={(v) => set({ keep: v })} options={[{ value: 'FACE' as const, label: T('char.create.keepFace') }, { value: 'FACE_HAIR_WARDROBE' as const, label: T('char.create.keepAll') }]} />
            <p className="help">{T('char.create.keepHint')}</p>
          </div>
          <Field label={T('cast.picture.change')} hint={T('wizard.optional')} help={T('char.create.keepChangeHelp')}><Textarea value={value.note} onChange={(e) => set({ note: e.target.value })} rows={2} maxLength={600} /></Field>
          {settings}
          <Details summary={T('cast.new.moreControl')}>
            <div className="space-y-5">
              <p className="help !mt-0">{T('char.create.pictureLookHint')}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-4">
                <div><p className="label">{T('label.sex')}</p><Segmented label={T('label.sex')} value={value.sex ?? 'ANY'} onChange={(v) => set({ sex: v === 'ANY' ? undefined : (v as Sex) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...SEXES.map((x) => ({ value: x as string, label: x === 'FEMALE' ? T('cast.new.woman') : T('cast.new.man') }))]} /></div>
                <div><p className="label">{T('label.age')}</p><Segmented label={T('label.age')} value={value.band ?? 'ANY'} onChange={(v) => set({ band: v === 'ANY' ? undefined : (v as AgeBand) })} options={[{ value: 'ANY', label: T('auto.decide') }, ...AGE_BANDS.map((b) => ({ value: b as string, label: T.dyn(`char.form.age.${b}`) }))]} /></div>
              </div>
              {value.keep === 'FACE' && (
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label={T('label.hair')} hint={T('wizard.optional')}><Input value={value.hair ?? ''} onChange={(e) => set({ hair: e.target.value })} maxLength={200} placeholder={T('char.look.fromReference')} /></Field>
                  <Field label={T('label.wardrobe')} hint={T('wizard.optional')}><Input value={value.wardrobe ?? ''} onChange={(e) => set({ wardrobe: e.target.value })} maxLength={300} placeholder={T('char.look.fromReference')} /></Field>
                  <p className="help !mt-0 md:col-span-2">{T('char.create.keepFaceChangeHint')}</p>
                </div>
              )}
            </div>
          </Details>
        </div>
      </div>
      <Footer reason={disabledReason} estimate={!value.asset ? T('char.create.needPicture') : T('cast.new.estimate')} onCancel={onCancel} primary={<Button type="submit" variant="primary" icon={<IconWand />} loading={busy} disabled={!canSubmit}>{T('char.create.designFromPicture')}</Button>} />
    </form>
  );
}
