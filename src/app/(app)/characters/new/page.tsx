'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStudio } from '@/studio/store';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Crumbs } from '@/components/ui/nav';
import { LibraryHeader } from '@/components/library/Library';
import { CharacterForm } from '@/components/character/CharacterForm';
import { Button, Field, Input, Notice, Textarea } from '@/components/ui/kit';
import { IconAuto, IconManual } from '@/components/ui/icons';
import { useStartJob } from '@/components/ui/jobs';
import { isTerminalStatus } from '@/domain/jobs';

/** A NEW CHARACTER — two ways in: Casting designs it from a line (a DESIGN_CHARACTER job; the record opens when it
 *  exists), or the full form by hand. `?production=` / `?show=` puts the character into that world. */
export default function NewCharacterPage() {
  const T = useT();
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const { jobs } = useStudio();
  const { start, busy } = useStartJob();
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [brief, setBrief] = useState(''); const [name, setName] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const job = jobId ? jobs.find((j) => j.id === jobId) : undefined;
  useEffect(() => {
    if (!job || !isTerminalStatus(job.status)) return;
    if (job.status === 'COMPLETED' && job.result?.characterId) { toast.ok(T('toast.created')); router.push(`/characters/${job.result.characterId as string}`); }
    else if (job.status === 'FAILED') { toast.bad(job.error?.message ?? T('gen.failed')); setJobId(null); }
  }, [job, router, toast, T]);
  const design = async () => {
    const j = await start('DESIGN_CHARACTER', { brief: brief.trim(), name: name.trim() || undefined, productionId: sp.get('production') ?? undefined, showId: sp.get('show') ?? undefined }, { quiet: true });
    if (j) setJobId(j.id);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <Crumbs items={[{ href: '/characters', label: T('nav.characters') }, { label: T('lib.addCharacter') }]} />
      <LibraryHeader title={T('lib.addCharacter')} />
      <div className="mb-6 flex gap-2" role="tablist" aria-label={T('lib.addCharacter')}>
        <button type="button" role="tab" aria-selected={mode === 'auto'} className={`btn btn-sm ${mode === 'auto' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('auto')}><IconAuto aria-hidden />{T('char.autoDesign')}</button>
        <button type="button" role="tab" aria-selected={mode === 'manual'} className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('manual')}><IconManual aria-hidden />{T('manual.title')}</button>
      </div>
      {mode === 'auto' ? (
        <form className="card space-y-4 p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); if (brief.trim().length >= 2) void design(); }}>
          <p className="text-[13.5px] text-muted">{T('char.autoDesign.hint')}</p>
          <Field label={T('label.name')} hint={T('wizard.optional')}><Input value={name} onChange={(e) => setName(e.target.value)} dir="auto" /></Field>
          <Field label={T('auto.premiseLabel')}><Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} maxLength={2000} dir="auto" required /></Field>
          {job && !isTerminalStatus(job.status) && <Notice tone="info">{job.progress?.message ?? T('char.designing')}</Notice>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => router.push('/characters')}>{T('btn.cancel')}</Button><Button type="submit" variant="primary" icon={<IconAuto />} loading={busy || Boolean(job && !isTerminalStatus(job.status))} disabled={brief.trim().length < 2}>{T('char.autoDesign')}</Button></div>
        </form>
      ) : (
        <CharacterForm onSaved={(id) => router.push(`/characters/${id}`)} onCancel={() => router.push('/characters')} />
      )}
    </div>
  );
}
