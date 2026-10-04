'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { useToast } from '@/components/ui/toast';
import { useStartJob } from '@/components/ui/jobs';
import { Button, Field, Input, Segmented, Textarea } from '@/components/ui/kit';
import { Frame } from '@/components/media';
import { IconGenerate } from '@/components/ui/icons';
import { PageHead } from '@/components/character/parts';
import { LocationForm, STYLE_WORDS } from './LocationForm';

type Method = 'auto' | 'manual';
const HINT: Record<Method, string> = {
  auto: 'One line about the place; the studio draws the master plate and the views from it.',
  manual: 'Name, kind, what stands where and how it is lit; draw the plates now or later.',
};

/** A NEW LOCATION (v5 §8.13 "New…") — Auto: one line about the place (and a name, or the first words of the line),
 *  interior or exterior and the style; the record is created with the store's `addLocation` command and the plates
 *  are drawn by the existing LOCATION_PLATES job. Manual: the location form, with "Create and draw plates". Both land
 *  on the new location's page. A live 2.39:1 plate, set in type, previews the name. */
export function LocationCreate() {
  const router = useRouter();
  const sp = useSearchParams();
  const { state, act } = useStudio();
  const toast = useToast();
  const { start: startJob } = useStartJob();
  const [method, setMethod] = useState<Method>(sp.get('start') === 'manual' ? 'manual' : 'auto');
  const [line, setLine] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'INTERIOR' | 'EXTERIOR'>('INTERIOR');
  const [style, setStyle] = useState<Style>(state.settings.defaults.style);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const derived = name.trim() || line.trim().split(/[.,;:—–\n]/)[0].trim().slice(0, 48);
  const lineError = touched && line.trim().length < 3 ? 'Describe the place in a few words.' : null;

  const land = async (id: string, draw: boolean) => {
    if (draw) await startJob('LOCATION_PLATES', { locationId: id }, { quiet: true });
    router.push(`/locations/${encodeURIComponent(id)}`);
  };
  const auto = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (line.trim().length < 3) return;
    setBusy(true);
    try {
      const r = act('addLocation', { name: derived, kind, style, description: line.trim(), landmarks: [], props: [], lighting: ['MORNING', 'NIGHT'] });
      toast.ok(`${derived} was created.`);
      await land(r.location.id, true);
    } catch (err) { toast.bad((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="pc-page pc-create">
      <PageHead back={{ href: '/locations', label: 'Locations' }} title="New location" description="A place your productions are filmed in. The studio draws its plates; you can redraw them any time." />
      <div className="pc-methods">
        <Segmented label="How to start" value={method} onChange={setMethod} options={[{ value: 'auto' as Method, label: 'Auto' }, { value: 'manual' as Method, label: 'Manual' }]} />
        <p className="t-body pc-empty-line">{HINT[method]}</p>
      </div>
      <div className="pc-create-body" data-plate>
        <div className="card pc-create-card" key={method}>
          {method === 'auto' ? (
            <form className="char-form" onSubmit={(e) => void auto(e)} aria-busy={busy || undefined} noValidate>
              <Field label="What is the place?" hint={`${line.length} / 600`} error={lineError} help={lineError ? undefined : 'The light, the materials, what you see from the camera.'}>
                <Textarea className="input-lg" value={line} onChange={(e) => setLine(e.target.value)} rows={3} maxLength={600} placeholder="A cluttered seaside repair workshop at night, full of old valve radios" autoFocus />
              </Field>
              <Field label="Name" optional help={derived && !name.trim() ? `Without a name it is called “${derived}”.` : 'Leave it empty to use the first words of the line.'}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" /></Field>
              <div className="pc-choices">
                <div><p className="label">Kind</p><Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'INTERIOR' as const, label: 'Interior' }, { value: 'EXTERIOR' as const, label: 'Exterior' }]} /></div>
                <div><p className="label">Style</p><Segmented label="Style" value={style} onChange={setStyle} options={(Object.keys(STYLE_WORDS) as Style[]).map((s) => ({ value: s, label: STYLE_WORDS[s] }))} /></div>
              </div>
              <div className="creation-foot">
                <span className="t-meta">Morning and night plates take a few minutes.</span>
                <span className="char-form-acts"><Button variant="quiet" onClick={() => router.push('/locations')}>Cancel</Button><Button type="submit" variant="primary" icon={<IconGenerate />} loading={busy}>Create and draw plates</Button></span>
              </div>
            </form>
          ) : (
            <LocationForm withDraw defaultStyle={style} onSaved={(id, draw) => void land(id, Boolean(draw))} onCancel={() => router.push('/locations')} />
          )}
        </div>
        {method === 'auto' && <aside className="pc-create-preview" aria-label="Preview">
          <div className="pc-preview">
            <Frame ratio="2.39/1" alt="" title={derived || 'Untitled place'} titleState="notDrawn" decorative className="pc-preview-frame" />
            <span className="t-meta">{kind === 'INTERIOR' ? 'Interior' : 'Exterior'} · {STYLE_WORDS[style]}</span>
            <p className="t-meta pc-preview-note">The plates are drawn here, then you choose the master.</p>
          </div>
        </aside>}
      </div>
    </div>
  );
}
