'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Character, VideoUsage } from '@/domain/types';
import { CHARACTER_REF_ROLES, type CharacterRefRole } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetById, assignmentsOf, productionHref } from '@/studio/selectors';
import { appearanceLock, type AppearanceLock } from '@/domain/rules';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useTab } from '@/lib/hooks';
import { Button, ConfirmDelete, Dropzone, Field, KV, Modal, Notice, Select, Status, TabBar, Textarea, Thumb } from '@/components/ui/kit';
import { Art, Block, Dots, Empty, Hero } from '@/components/ui/cinema';
import { JobButton, useStartJob } from '@/components/ui/jobs';
import { VoicePreview } from '@/components/players/Controls';
import { StageStatus } from '@/components/library/ProductionTile';
import { CharacterForm } from './CharacterForm';
import { IconArrowRight, IconCheck, IconDelete, IconEdit, IconGenerate, IconImageAdd, IconShield, IconUpload, IconVoice } from '@/components/ui/icons';
import { dialectLabel, fmtAgo, words } from '@/lib/format';

const TABS = ['appearance', 'voice', 'profile', 'used'] as const;
const VIEW_ROLES: CharacterRefRole[] = ['FACE', 'FRONT', 'THREE_QUARTER', 'SIDE', 'BACK', 'FULL_BODY'];

/** ONE CHARACTER — a portrait-led header and four tabs: Appearance · Voice · Profile · Used In. The appearance is
 *  protected once the character has been in a video (see src/demo/rules.ts); the voice and the written profile
 *  stay editable. */
export function CharacterPage({ c }: { c: Character }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [tab] = useTab(TABS, 'appearance');
  const portrait = assetById(state, c.portraitAssetId);
  const lock = appearanceLock(c);
  const { shows, productions } = assignmentsOf(state, c.id);
  const inVideos = new Set(lock.videos.map((v) => v.productionId)).size;
  return (
    <>
      <Hero art={<Art src={portrait?.src} ratio="portrait" title={c.name} sample={portrait?.sample} unavailable={portrait?.unavailable} />}
        eyebrow={<>{T.dyn(`style.${c.style}`)} · {c.species ? words(c.species) : `${c.ageYears} · ${c.sex === 'FEMALE' ? T('label.female') : T('label.male')}`}</>} title={c.name} titleAr={c.nameAr}
        description={c.role} meta={<><UsageStatus lock={lock} /><span className="text-ink-500" aria-hidden>·</span><Dots items={[`${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`, c.voice.selectedSampleId ? T('lib.voiceSelected') : T('lib.noVoice')]} /></>}
        actions={<>
          <Modal title={`${T('btn.edit')}: ${c.name}`} size="lg" trigger={(open) => <Button variant="primary" icon={<IconEdit />} onClick={open}>{T('char.editProfile')}</Button>}>{(close) => <CharacterForm initial={c} onSaved={close} onCancel={close} />}</Modal>
          <ConfirmDelete title={c.name} onDelete={() => { act('deleteCharacter', c.id); toast.ok(T('toast.deleted')); router.push('/characters'); }} variant="ghost" icon={<IconDelete />}>{T('char.deleteConfirm')}</ConfirmDelete>
        </>}
        back={{ href: '/characters', label: T('nav.characters') }} compact />

      <TabBar ariaLabel={c.name} current={tab} hrefFor={(id) => `/characters/${c.id}?tab=${id}`} className="mb-8" tabs={[{ id: 'appearance', label: T('tab.appearance'), count: c.refs.length }, { id: 'voice', label: T('tab.voice'), count: c.voice.samples.length }, { id: 'profile', label: T('tab.profile') }, { id: 'used', label: T('tab.usedIn'), count: inVideos || undefined }]} />

      <div role="tabpanel" className="fade-in" key={tab}>
        {tab === 'appearance' && <Appearance c={c} lock={lock} />}
        {tab === 'voice' && <VoiceTab c={c} />}
        {tab === 'profile' && <Profile c={c} />}
        {tab === 'used' && <UsedIn c={c} lock={lock} shows={shows.map((s) => s.id)} productions={productions.map((p) => p.id)} />}
      </div>
    </>
  );
}

/** Used / unused / unknown, in one status line. */
export function UsageStatus({ lock }: { lock: AppearanceLock }) {
  const T = useT();
  if (!lock.locked) return <Status tone="neutral">{T('char.usage.unused')}</Status>;
  if (lock.reason === 'UNKNOWN') return <Status tone="warn">{T('char.usage.unknown')}</Status>;
  const n = new Set(lock.videos.map((v) => v.productionId)).size;
  return <Status tone="accent">{T('char.usage.used')} · {n} {T(n === 1 ? 'char.usage.video' : 'char.usage.videos')}</Status>;
}

/** The continuity notice, with the records that caused it. */
function LockNotice({ c, lock }: { c: Character; lock: AppearanceLock }) {
  const T = useT();
  if (!lock.locked) return null;
  return (
    <div role="note" id="appearance-lock" className="card flex gap-4 border-violet-500/40 bg-primary/[0.05] p-4 sm:p-5">
      <span aria-hidden className="grid size-10 flex-none place-items-center rounded-xl bg-accent-soft text-violet-300 [&>svg]:size-5"><IconShield /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-fg">{lock.reason === 'USED' ? T('char.lock.used') : T('char.lock.unknown')}</p>
        <p className="mt-1 text-[13px] text-muted">{T('char.lock.hint')}</p>
        {lock.videos.length > 0 && (
          <ul className="mt-3 space-y-1 text-[12.5px]">
            {lock.videos.slice(0, 3).map((v) => <li key={`${v.shotId}-${v.takeId}`} className="flex flex-wrap items-center gap-x-2 text-body"><span className="font-medium text-fg" dir="auto">{v.productionTitle}</span><span className="text-faint">{T('label.shot')} {v.shotLabel} · {v.takeLabel}</span>{v.status === 'TAKE_REMOVED' && <span className="badge">{T('char.usage.takeRemoved')}</span>}</li>)}
          </ul>
        )}
        <Link href={`/characters/${c.id}?tab=used`} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-violet-300 hover:underline">{T('char.lock.seeUsage')}<IconArrowRight aria-hidden className="size-3.5 rtl:rotate-180" /></Link>
      </div>
    </div>
  );
}

/** APPEARANCE — the portrait, the reference views, and, for a character never in a video, the way to generate or
 *  regenerate the look from a reference picture. The reference you upload and the appearance it would produce are
 *  shown side by side and never confused. */
function Appearance({ c, lock }: { c: Character; lock: AppearanceLock }) {
  const T = useT();
  const { state, act, addFile, removeAsset } = useStudio();
  const toast = useToast();
  const [role, setRole] = useState<CharacterRefRole>('FRONT');
  const [busy, setBusy] = useState<'ref' | 'view' | null>(null);
  const portrait = assetById(state, c.portraitAssetId);
  const pending = assetById(state, c.pendingReference?.assetId);
  const hasAppearance = Boolean(c.portraitAssetId);

  const addReference = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.bad(T('char.ref.notImage')); return; }
    setBusy('ref');
    const previous = c.pendingReference?.assetId;
    const r = await addFile(file, { label: `${c.name} — ${T('char.ref.label')}`, tags: ['character', 'reference upload'] });
    setBusy(null);
    if (!r.ok) { toast.bad(r.error); return; }
    act('setPendingReference', c.id, r.asset.id);
    if (previous) await removeAsset(previous);
    toast.ok(previous ? T('char.ref.replaced') : T('char.ref.added'));
  };
  const removeReference = async () => { const id = c.pendingReference?.assetId; act('setPendingReference', c.id, undefined); if (id) await removeAsset(id); toast.ok(T('char.ref.removed')); };
  const addView = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.bad(T('char.ref.notImage')); return; }
    setBusy('view');
    const r = await addFile(file, { label: `${c.name} — ${words(role)}`, tags: ['character', 'reference'] });
    setBusy(null);
    if (!r.ok) { toast.bad(r.error); return; }
    act('updateCharacter', c.id, { refs: [...c.refs, { id: `ref-${r.asset.id}`, role, assetId: r.asset.id }], portraitAssetId: c.portraitAssetId ?? r.asset.id });
    toast.ok(T('media.added'));
  };
  const views = c.refs.filter((r) => VIEW_ROLES.includes(r.role));
  const outfits = c.refs.filter((r) => !VIEW_ROLES.includes(r.role));
  const gallery = (refs: Character['refs']) => (
    <ul className="grid-portraits">
      {refs.map((r) => {
        const a = assetById(state, r.assetId);
        return (
          <li key={r.id} className="poster-card group relative">
            <Art src={a?.src} ratio="portrait" title={words(r.role)} sample={a?.sample} unavailable={a?.unavailable}>
              {!lock.locked && <span className="card-tools absolute bottom-2 end-2 flex gap-1">
                {c.portraitAssetId !== r.assetId && <button type="button" className="btn btn-secondary btn-xs" onClick={() => act('updateCharacter', c.id, { portraitAssetId: r.assetId })}><IconCheck />{T('char.setPortrait')}</button>}
                <button type="button" className="btn btn-secondary btn-xs btn-icon" aria-label={`${T('btn.remove')} ${words(r.role)}`} onClick={() => act('updateCharacter', c.id, { refs: c.refs.filter((x) => x.id !== r.id) })}><IconDelete /></button>
              </span>}
            </Art>
            <p className="poster-title text-sm">{words(r.role)}</p>
            {c.portraitAssetId === r.assetId && <p className="poster-meta"><span className="text-accent">{T('label.portrait')}</span></p>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-10">
      <LockNotice c={c} lock={lock} />

      <section aria-labelledby="look-h" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <h2 id="look-h" className="section-title mb-3">{T('char.appearance')}</h2>
          <div className="max-w-sm"><Art src={portrait?.src} alt={`${c.name}`} ratio="portrait" title={hasAppearance ? c.name : T('char.noAppearance')} sample={portrait?.sample} unavailable={portrait?.unavailable} /></div>
          <p className="mt-2 text-[12px] text-faint">{hasAppearance ? (portrait?.sample ? T('char.appearance.sample') : portrait?.origin === 'UPLOAD' ? T('char.appearance.uploaded') : T('char.appearance.current')) : T('char.noAppearance.hint')}</p>
        </div>
        <div className="card p-5">
          <h2 className="section-title">{hasAppearance ? T('char.regenerate.title') : T('char.generate.title')}</h2>
          <p className="mt-1 text-[13px] text-muted">{lock.locked ? T('char.lock.short') : T('char.generate.lead')}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start">
            <div>
              <p className="kicker mb-2">{T('char.ref.yours')}</p>
              {pending && !lock.locked ? (
                <div>
                  <Thumb src={pending.src} alt={T('char.ref.yours')} ratio="aspect-[4/5]" contain unavailable={pending.unavailable} className="rounded-lg border border-line" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="btn btn-secondary btn-sm cursor-pointer"><IconUpload aria-hidden />{T('char.ref.replace')}<input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addReference(f); e.target.value = ''; }} /></label>
                    <Button size="sm" variant="quiet" icon={<IconDelete />} onClick={() => void removeReference()}>{T('btn.remove')}</Button>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-faint">{T('char.ref.kept')}</p>
                </div>
              ) : <Dropzone label={T('char.ref.upload')} hint={lock.locked ? T('char.lock.short') : T('char.ref.uploadHint')} accept="image/*" icon={<IconImageAdd />} disabled={lock.locked} busy={busy === 'ref'} onFile={(f) => void addReference(f)} />}
            </div>
            <IconArrowRight aria-hidden className="mx-auto mt-24 hidden size-5 text-ink-500 sm:block rtl:rotate-180" />
            <div>
              <p className="kicker mb-2">{T('char.ref.result')}</p>
              <div className="media media-empty aspect-[4/5] flex-col gap-1 rounded-lg p-4 text-center text-[12.5px]"><IconGenerate aria-hidden className="size-5" /><span>{T('char.ref.resultHint')}</span></div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-4">
            {lock.locked
              ? <Button variant="primary" icon={<IconGenerate />} disabled aria-describedby="appearance-lock">{hasAppearance ? T('char.regenerate') : T('char.generate')}</Button>
              : <><JobButton type="CHARACTER_APPEARANCE" payload={{ characterId: c.id }} target={{ characterId: c.id }} variant="primary" icon={<IconGenerate />}>{hasAppearance ? (pending ? T('char.regenerateFromRef') : T('char.regenerate')) : (pending ? T('char.generateFromRef') : T('char.generate'))}</JobButton>
                {hasAppearance && <JobButton type="CHARACTER_REFS" payload={{ characterId: c.id }} target={{ characterId: c.id }} variant="secondary" icon={<IconImageAdd />}>{T('gen.refs')}</JobButton>}</>}
          </div>
        </div>
      </section>

      <Block title={T('label.references')} count={views.length} description={T('char.appearanceLead')}
        actions={!lock.locked && <div className="flex flex-wrap items-center gap-2"><Select aria-label={T('char.viewKind')} value={role} onChange={(e) => setRole(e.target.value as CharacterRefRole)} options={CHARACTER_REF_ROLES.map((r) => ({ value: r, label: words(r) }))} className="w-auto" /><label className="btn btn-secondary btn-sm cursor-pointer" aria-busy={busy === 'view' || undefined}><IconUpload aria-hidden />{T('char.addView')}<input type="file" accept="image/*" className="sr-only" aria-label={T('char.addView')} onChange={(e) => { const f = e.target.files?.[0]; if (f) void addView(f); e.target.value = ''; }} /></label></div>}>
        {views.length ? gallery(views) : <Empty compact title={T('empty.references')} hint={T('char.appearanceLead')} />}
      </Block>
      {outfits.length > 0 && <Block title={T('char.outfits')} count={outfits.length}>{gallery(outfits)}</Block>}
    </div>
  );
}

/** VOICE — the chosen voice first, then every voice line with its source: a sample, a recording you uploaded, or a
 *  studio voice that will exist once generation is connected. Choosing a voice never touches the appearance. */
function VoiceTab({ c }: { c: Character }) {
  const T = useT();
  const { state, act, addFile } = useStudio();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const portrait = assetById(state, c.portraitAssetId)?.src;
  const lang = `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`;
  const detail = `${lang} · ${words(c.voice.pitch)} · ${words(c.voice.pace)}`;
  const trackFor = (sm: Character['voice']['samples'][number]) => { const a = assetById(state, sm.assetId); return a && !a.unavailable && a.src ? { id: `voice-${c.id}-${sm.id}`, src: a.src, title: `${c.name} — ${sm.label}`, subtitle: lang, artworkSrc: portrait, duration: a.durationSeconds } : null; };
  const unavailable = (sm: Character['voice']['samples'][number]) => (sm.source === 'GENERATED' && !sm.assetId ? T('voice.notGenerated') : T('media.unavailable'));
  const selected = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
  const upload = async (file: File) => {
    if (!file.type.startsWith('audio/')) { toast.bad(T('voice.notAudio')); return; }
    setBusy(true);
    const r = await addFile(file, { label: `${c.name} — ${file.name}`, tags: ['voice', 'recording'] });
    setBusy(false);
    if (!r.ok) { toast.bad(r.error); return; }
    act('addVoiceRecording', c.id, r.asset.id, file.name.replace(/\.[a-z0-9]+$/i, ''));
    toast.ok(T('voice.added'));
  };
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <section aria-labelledby="voice-now">
          <h2 id="voice-now" className="section-title mb-3">{T('char.voiceIdentity')}</h2>
          {selected ? <VoicePreview track={trackFor(selected)} name={selected.label} detail={detail} source={selected.source} portraitSrc={portrait ?? ''} selected unavailableText={unavailable(selected)} />
            : <Empty compact title={T('lib.noVoice')} hint={T('char.voiceLead')} />}
        </section>
        <Block title={T('voice.all')} count={c.voice.samples.length} description={T('char.voiceLead')} actions={<div className="flex flex-wrap items-center gap-2"><JobButton type="VOICE_BUILD" payload={{ characterId: c.id }} target={{ characterId: c.id }} size="sm" icon={<IconGenerate />}>{T('gen.voiceBuild')}</JobButton><VoicePreviewButton c={c} /></div>}>
          {c.voice.samples.length === 0 ? <Empty compact title={T('char.noSamples')} /> : (
            <ul className="space-y-2" role="radiogroup" aria-label={T('tab.voice')}>
              {c.voice.samples.map((sm) => {
                const on = c.voice.selectedSampleId === sm.id;
                const track = trackFor(sm);
                return (
                  <li key={sm.id}>
                    <VoicePreview track={track} name={sm.label} detail={lang} source={sm.source} selected={on} unavailableText={unavailable(sm)}
                      action={<button type="button" role="radio" aria-checked={on} disabled={!track && !on} onClick={() => { act('selectVoiceSample', c.id, on ? undefined : sm.id); if (!on) toast.ok(T('char.selectedVoice')); }} aria-label={`${T('btn.select')} ${sm.label}`} className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}>{on ? <><IconCheck />{T('btn.selected')}</> : T('btn.select')}</button>} />
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
        <Dropzone label={T('voice.upload')} hint={T('voice.uploadHint')} accept="audio/*" icon={<IconVoice />} busy={busy} onFile={(f) => void upload(f)} />
      </div>
      <aside><Block title={T('label.voiceNotes')}><KV rows={[[T('label.pitch'), words(c.voice.pitch)], [T('label.pace'), words(c.voice.pace)], [T('label.timbre'), c.voice.timbre || '—'], [T('label.voiceNotes'), c.voice.notes || '—'], [T('label.language'), lang]]} /></Block><p className="text-[12px] text-faint">{T('voice.lockNote')}</p></aside>
    </div>
  );
}

/** Speak one line in the character's voice: a small form that starts a VOICE_PREVIEW job. */
function VoicePreviewButton({ c }: { c: Character }) {
  const T = useT();
  const { start, busy } = useStartJob();
  const [text, setText] = useState(c.language === 'AR' ? (c.dialect === 'IRAQI_BAGHDADI' ? 'شلونك؟ اني هنا من زمان، وين چنت؟' : 'مرحباً، أنا هنا منذ وقت طويل، أين كنت؟') : 'Hello. I have been here a while — where were you?');
  return (
    <Modal title={T('gen.voicePreview')} trigger={(open) => <Button size="sm" icon={<IconVoice />} onClick={open}>{T('gen.voicePreview')}</Button>}>
      {(close) => (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void start('VOICE_PREVIEW', { characterId: c.id, text }).then((j) => { if (j) close(); }); }}>
          <Field label={T('gen.voicePreview.text')}><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{T('btn.cancel')}</Button><Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>{T('gen.voicePreview')}</Button></div>
        </form>
      )}
    </Modal>
  );
}

/** PROFILE — who they are, their traits, and the creative notes, which save in place. */
function Profile({ c }: { c: Character }) {
  const T = useT();
  const { act } = useStudio();
  const toast = useToast();
  const [notes, setNotes] = useState(c.notes ?? '');
  const dirty = notes !== (c.notes ?? '');
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-8">
        <Block title={T('char.description')}>
          <p className="text-[15px] font-medium text-fg" dir="auto">{c.role || '—'}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-body" dir="auto">{c.personality || '—'}</p>
        </Block>
        <Block title={T('char.traits')}>
          {c.distinguishing.length ? <ul className="flex flex-wrap gap-2">{c.distinguishing.map((x) => <li key={x} className="badge" dir="auto">{x}</li>)}</ul> : <p className="text-sm text-faint">—</p>}
          <div className="mt-5"><KV rows={[[T('label.build'), c.build || '—'], [T('label.face'), c.face || '—'], [T('label.hair'), c.hair || '—'], [T('label.eyes'), c.eyes || '—'], [T('label.skin'), c.skin || '—'], [T('label.wardrobe'), c.wardrobe || '—']]} /></div>
        </Block>
      </div>
      <form className="card h-fit space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); act('updateCharacter', c.id, { notes }); toast.ok(T('toast.saved')); }}>
        <Field label={T('char.notes')} help={T('char.notes.hint')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} /></Field>
        <div className="flex items-center justify-end gap-3">{dirty && <Status tone="warn">{T('shot.unsaved')}</Status>}<Button type="submit" variant="primary" disabled={!dirty}>{dirty ? T('btn.save') : T('btn.saved')}</Button></div>
        <KV rows={[[T('label.role'), c.role || '—'], [T('label.language'), `${c.language}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`], [T('label.style'), T.dyn(`style.${c.style}`)], [T('label.age'), c.ageYears], ...(c.species ? [[T('label.species'), c.species] as [string, string]] : [])]} />
      </form>
    </div>
  );
}

/** USED IN — the videos the character has actually been in (from the usage records), then where they are cast but
 *  not yet filmed. An unknown history says so and is never read as "unused". */
function UsedIn({ c, lock, shows, productions }: { c: Character; lock: AppearanceLock; shows: string[]; productions: string[] }) {
  const T = useT();
  const { state } = useStudio();
  const byProduction = new Map<string, VideoUsage[]>();
  for (const v of lock.videos) byProduction.set(v.productionId, [...(byProduction.get(v.productionId) ?? []), v]);
  const filmed = new Set(byProduction.keys());
  const assigned = state.productions.filter((p) => productions.includes(p.id) && !filmed.has(p.id));
  const assignedShows = state.shows.filter((s) => shows.includes(s.id));
  return (
    <div className="space-y-10">
      {lock.reason === 'UNKNOWN' && <Notice tone="warn" title={T('char.usage.unknown')}>{T('char.lock.unknown')} {T('char.lock.hint')}</Notice>}
      <Block title={T('char.usedIn.videos')} count={byProduction.size} description={T('char.usedIn.videosHint')}>
        {byProduction.size === 0 ? <Empty compact title={lock.reason === 'UNKNOWN' ? T('char.usage.unknown') : T('char.usedIn.none')} hint={lock.reason === 'UNKNOWN' ? undefined : T('char.usedIn.noneHint')} /> : (
          <ul className="space-y-3">
            {[...byProduction.entries()].map(([pid, rows]) => {
              const p = state.productions.find((x) => x.id === pid);
              const a = assetById(state, p?.coverAssetId);
              return (
                <li key={pid} className="card flex gap-4 p-4">
                  <div className="w-28 flex-none sm:w-36"><Thumb src={a?.src} alt="" ratio="aspect-video" className="rounded-md" empty="—" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">{p ? <Link href={productionHref(p)} className="text-[15px] font-semibold text-fg hover:underline" dir="auto">{rows[0].productionTitle}</Link> : <span className="text-[15px] font-semibold text-fg" dir="auto">{rows[0].productionTitle} <span className="badge ms-1">{T('char.usedIn.deleted')}</span></span>}{p && <StageStatus p={p} />}</div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">{rows.map((v) => <li key={`${v.shotId}-${v.takeId}`} className={`badge ${v.status === 'TAKE_REMOVED' ? '' : 'badge-accent'}`}>{T('label.shot')} {v.shotLabel} · {v.takeLabel}{v.status === 'TAKE_REMOVED' ? ` · ${T('char.usage.takeRemoved')}` : ''}</li>)}</ul>
                    <p className="mt-2 text-[11.5px] text-faint">{T('char.usedIn.first')} {fmtAgo(rows.map((r) => r.recordedAt).sort()[0], T.locale)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Block>
      <Block title={T('char.usedIn.assigned')} count={assigned.length + assignedShows.length} description={T('char.usedIn.assignedHint')}>
        {assigned.length + assignedShows.length === 0 ? <p className="text-sm text-faint">—</p> : (
          <ul className="grid-posters">
            {assignedShows.map((s) => { const a = assetById(state, s.posterAssetId) ?? assetById(state, s.coverAssetId); return <li key={s.id}><Link href={`/shows/${s.id}`} className="poster-link block"><Art src={a?.src} ratio="poster" title={s.title} /><p className="poster-title" dir="auto">{s.title}</p><p className="poster-meta"><span>{T('kind.SHOW')}</span></p></Link></li>; })}
            {assigned.map((p) => { const a = assetById(state, p.posterAssetId) ?? assetById(state, p.coverAssetId); return <li key={p.id}><Link href={productionHref(p)} className="poster-link block"><Art src={a?.src} ratio={p.kind === 'MUSIC_VIDEO' ? 'square' : 'poster'} title={p.title} /><p className="poster-title" dir="auto">{p.title}</p><p className="poster-meta"><span>{T.dyn(`kind.${p.kind}`)}</span></p></Link></li>; })}
          </ul>
        )}
      </Block>
      {/* keep a quiet link back to the whole cast */}
      <p className="text-[12px] text-faint">{c.name} · <Link href="/characters" className="hover:text-fg">{T('nav.characters')}</Link></p>
    </div>
  );
}

