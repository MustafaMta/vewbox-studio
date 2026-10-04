'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Production } from '@/domain/types';
import { ASPECTS, DIALECTS, LANGUAGES, STYLES } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { useToast } from '@/components/ui/toast';
import { Button, ConfirmDelete, Field, Input, Modal, PanelCard, SectionHead, Select, Textarea } from '@/components/ui/kit';
import { IconDelete, IconDuplicate, IconEdit } from '@/components/ui/icons';
import { aspectLabel, dialectLabel, fmtAgo, fmtSeconds } from '@/lib/format';
import { vocab, workspaceHref } from './model';

/** ABOUT THIS PRODUCTION — the facts the whole production shares (style, language, aspect, target length), with the
 *  three things done to the production itself: edit its details, duplicate it, delete it (asked in a dialog). The end
 *  of the map. */
export function ProductionDetails({ p }: { p: Production }) {
  const { act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const back = p.kind === 'SHORT' ? '/shorts' : p.kind === 'MUSIC_VIDEO' ? '/music-videos' : `/shows/${p.showId}`;
  return (
    <section className="ws-sec" aria-labelledby="ws-about-h" id="about">
      <SectionHead id="ws-about-h" title="About this production" action={<span className="ws-actions">
        <EditDetails p={p} />
        <Button size="sm" icon={<IconDuplicate aria-hidden />} onClick={() => { const r = act('duplicateProduction', p.id); toast.ok('Duplicated.'); if (r.production) router.push(workspaceHref(r.production)); }}>Duplicate</Button>
        <ConfirmDelete title={p.title} onDelete={() => { act('deleteProduction', p.id); toast.ok('Deleted.'); router.push(back); }} variant="ghost" icon={<IconDelete aria-hidden />} />
      </span>} />
      <PanelCard columns={4} facts={[
        { label: 'Visual style', value: vocab(p.style) },
        { label: 'Language', value: p.language === 'AR' ? 'Arabic' : 'English', sub: p.language === 'AR' && p.dialect ? dialectLabel(p.dialect) : undefined },
        { label: 'Aspect', value: aspectLabel(p.aspect) },
        { label: 'Target length', value: fmtSeconds(p.targetSeconds), sub: `Created ${fmtAgo(p.createdAt)}` },
      ]} />
    </section>
  );
}

function EditDetails({ p }: { p: Production }) {
  const { act } = useStudio(); const toast = useToast();
  const [d, setD] = useState({ title: p.title, titleAr: p.titleAr ?? '', logline: p.logline, style: p.style, language: p.language, dialect: p.dialect ?? 'IRAQI_BAGHDADI', aspect: p.aspect, targetSeconds: p.targetSeconds, artist: p.artist ?? '', genre: p.genre ?? '' });
  const set = (x: Partial<typeof d>) => setD((y) => ({ ...y, ...x }));
  return (
    <Modal title="Details" trigger={(open) => <Button size="sm" icon={<IconEdit aria-hidden />} onClick={open}>Edit details</Button>}>
      {(close) => (
        <form className="ws-form" onSubmit={(e) => { e.preventDefault(); if (!d.title.trim()) return; act('updateProduction', p.id, { ...d, titleAr: d.titleAr || undefined, dialect: d.language === 'AR' ? d.dialect : undefined, targetSeconds: Number(d.targetSeconds) || p.targetSeconds, artist: d.artist || undefined, genre: d.genre || undefined }); toast.ok('Saved.'); close(); }}>
          <div className="ws-form-grid">
            <Field label="Title" required><Input value={d.title} onChange={(e) => set({ title: e.target.value })} required /></Field>
            <Field label="Arabic title"><Input value={d.titleAr} dir="rtl" lang="ar" onChange={(e) => set({ titleAr: e.target.value })} /></Field>
            {p.kind === 'MUSIC_VIDEO' && <Field label="Artist"><Input value={d.artist} onChange={(e) => set({ artist: e.target.value })} /></Field>}
            <Field label="Genre"><Input value={d.genre} onChange={(e) => set({ genre: e.target.value })} /></Field>
          </div>
          <Field label="Logline"><Textarea value={d.logline} onChange={(e) => set({ logline: e.target.value })} rows={2} dir="auto" /></Field>
          <div className="ws-form-grid">
            <Field label="Visual style"><Select value={d.style} onChange={(e) => set({ style: e.target.value as typeof d.style })} options={STYLES.map((s) => ({ value: s, label: vocab(s) }))} /></Field>
            <Field label="Aspect"><Select value={d.aspect} onChange={(e) => set({ aspect: e.target.value as typeof d.aspect })} options={ASPECTS.map((a) => ({ value: a, label: aspectLabel(a) }))} /></Field>
            <Field label="Language"><Select value={d.language} onChange={(e) => set({ language: e.target.value as typeof d.language })} options={LANGUAGES.map((l) => ({ value: l, label: l === 'EN' ? 'English' : 'Arabic' }))} /></Field>
            {d.language === 'AR' && <Field label="Dialect"><Select value={d.dialect} onChange={(e) => set({ dialect: e.target.value as typeof d.dialect })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x) }))} /></Field>}
            <Field label="Target (seconds)"><Input type="number" min={5} max={3600} value={d.targetSeconds} onChange={(e) => set({ targetSeconds: Number(e.target.value) })} /></Field>
          </div>
          <div className="ws-form-foot"><Button variant="quiet" onClick={close}>Cancel</Button><Button type="submit" variant="primary">Save</Button></div>
        </form>
      )}
    </Modal>
  );
}
