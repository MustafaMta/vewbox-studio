'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { Character, VideoUsage } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, assignmentsOf, productionHref } from '@/studio/selectors';
import { appearanceLock, voiceLock, type AppearanceLock } from '@/domain/rules';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useTab } from '@/lib/hooks';
import { Button, ConfirmDelete, Field, KV, Modal, Notice, Status, TabBar, Textarea, Thumb } from '@/components/ui/kit';
import { Art, Block, Dots, Empty, Hero } from '@/components/ui/cinema';
import { StageStatus } from '@/components/library/ProductionTile';
import { CharacterForm } from './CharacterForm';
import { AppearanceTab } from './AppearanceTab';
import { VoiceTab, engineName } from './VoiceTab';
import { createResultOf, type VoiceIdentityV2 } from './contract';
import { IconClose, IconDelete, IconEdit, IconShield, IconVoice } from '@/components/ui/icons';
import { dialectLabel, fmtAgo, words } from '@/lib/format';

const TABS = ['appearance', 'voice', 'profile', 'used'] as const;

/** ONE CHARACTER — a portrait-led header that says the usage and lock state in words, and four tabs: Appearance ·
 *  Voice · Profile · Used In. The appearance and the voice are preserved once the character has been in a video
 *  (src/domain/rules.ts); the written profile stays editable. Opened from the creation page it carries a one-time
 *  "just created" banner naming what was made and what is still missing. */
export function CharacterPage({ c }: { c: Character }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [tab] = useTab(TABS, 'appearance');
  const portrait = assetById(state, c.portraitAssetId);
  const lock = appearanceLock(c);
  const vlock = voiceLock(c);
  const { shows, productions } = assignmentsOf(state, c.id);
  const inVideos = new Set(lock.videos.map((v) => v.productionId)).size;
  const identity = c.voice.identity as VoiceIdentityV2 | undefined;
  const voiceWords = identity ? `${T('lib.voice')}: ${engineName(identity, T)}` : c.voice.selectedSampleId ? T('lib.voiceSelected') : T('lib.noVoice');
  return (
    <>
      <Hero art={<Art src={portrait?.src} ratio="portrait" title={c.name} sample={portrait?.sample} unavailable={portrait?.unavailable} top />}
        eyebrow={<>{T.dyn(`style.${c.style}`)} · {c.species ? words(c.species) : `${c.ageYears} · ${c.sex === 'FEMALE' ? T('label.female') : T('label.male')}`}</>} title={c.name} titleAr={c.nameAr}
        description={c.role}
        meta={<><UsageStatus lock={lock} /><span className="text-ink-500" aria-hidden>·</span><Dots items={[`${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`, voiceWords]} />{lock.locked && <span className="inline-flex items-center gap-1.5 text-violet-300" title={lock.reason === 'USED' ? T('char.lock.used') : T('char.lock.unknown')}><IconShield aria-hidden className="size-3.5" />{vlock.locked ? T('char.lock.lookAndVoice') : T('char.lock.look')}</span>}</>}
        actions={<>
          <Modal title={`${T('btn.edit')}: ${c.name}`} size="lg" trigger={(open) => <Button variant="primary" icon={<IconEdit />} onClick={open}>{T('char.editProfile')}</Button>}>{(close) => <CharacterForm initial={c} onSaved={close} onCancel={close} />}</Modal>
          <Link href={`/characters/${c.id}?tab=voice`} className="btn btn-secondary"><IconVoice aria-hidden />{identity || c.voice.selectedSampleId ? T('char.hearVoice') : T('char.addVoice')}</Link>
          <ConfirmDelete title={c.name} onDelete={() => { act('deleteCharacter', c.id); toast.ok(T('toast.deleted')); router.push('/characters'); }} variant="ghost" icon={<IconDelete />}>{T('char.deleteConfirm')}</ConfirmDelete>
        </>}
        back={{ href: '/characters', label: T('nav.characters') }} />

      <JustCreated c={c} />

      <TabBar ariaLabel={c.name} current={tab} hrefFor={(id) => `/characters/${c.id}?tab=${id}`} className="mb-8" sticky tabs={[{ id: 'appearance', label: T('tab.appearance'), count: c.refs.length }, { id: 'voice', label: T('tab.voice'), count: c.voice.samples.length }, { id: 'profile', label: T('tab.profile') }, { id: 'used', label: T('tab.usedIn'), count: inVideos || undefined }]} />

      <div role="tabpanel" className="fade-in" key={tab}>
        {tab === 'appearance' && <AppearanceTab c={c} lock={lock} />}
        {tab === 'voice' && <VoiceTab c={c} />}
        {tab === 'profile' && <Profile c={c} />}
        {tab === 'used' && <UsedIn c={c} lock={lock} shows={shows.map((s) => s.id)} productions={productions.map((p) => p.id)} />}
      </div>
    </>
  );
}

/** Used / unused / history not on record, in one status line. */
export function UsageStatus({ lock }: { lock: AppearanceLock }) {
  const T = useT();
  if (!lock.locked) return <Status tone="neutral">{T('char.usage.unused')}</Status>;
  if (lock.reason === 'UNKNOWN') return <Status tone="warn" title={T('char.usage.unknown.hint')}>{T('char.usage.unknown')}</Status>;
  const n = new Set(lock.videos.map((v) => v.productionId)).size;
  return <Status tone="accent">{T('char.usage.used')} · {n} {T(n === 1 ? 'char.usage.video' : 'char.usage.videos')}</Status>;
}

/** The one-time banner after creation (`?created=<jobId>`): what the chain made, as badges, and the next steps
 *  as chips for what is still missing. Dismissing it drops the parameter. */
function JustCreated({ c }: { c: Character }) {
  const T = useT();
  const { jobs } = useStudio();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const jobId = sp.get('created');
  if (!jobId) return null;
  const job = jobs.find((j) => j.id === jobId);
  const result = createResultOf(job);
  const identity = c.voice.identity as VoiceIdentityV2 | undefined;
  const made = [
    { key: 'char.created.sheet' as const, ok: true },
    { key: 'char.created.portrait' as const, ok: Boolean(c.portraitAssetId) },
    { key: 'char.created.views' as const, ok: c.refs.length > 1, n: c.refs.length },
    { key: 'char.created.voice' as const, ok: Boolean(identity), verified: identity?.proof && identity.status !== 'REVIEW' },
  ];
  const next: Array<{ label: string; href: string }> = [];
  if (!c.portraitAssetId) next.push({ label: T('char.created.drawPortrait'), href: `/characters/${c.id}?tab=appearance` });
  else if (c.refs.length <= 1) next.push({ label: T('char.created.drawViews'), href: `/characters/${c.id}?tab=appearance` });
  if (!identity) next.push({ label: T('char.created.addVoice'), href: `/characters/${c.id}?tab=voice` });
  const dismiss = () => { const q = new URLSearchParams(sp.toString()); q.delete('created'); router.replace(`${pathname}${q.size ? `?${q}` : ''}`, { scroll: false }); };
  return (
    <Notice tone="ok" className="mb-6" title={T('char.created.title')} action={<span className="flex flex-wrap items-center gap-2">{next.map((n) => <Link key={n.href + n.label} href={n.href} className="btn btn-secondary btn-sm">{n.label}</Link>)}<Button size="sm" variant="quiet" icon={<IconClose />} onClick={dismiss}>{T('btn.close')}</Button></span>}>
      <span className="flex flex-wrap items-center gap-1.5">
        {made.map((m) => <span key={m.key} className={`badge ${m.ok ? 'badge-ok' : ''}`}>{T(m.key)}{m.n && m.ok ? ` · ${m.n}` : ''}{m.key === 'char.created.voice' && m.ok ? ` · ${m.verified ? T('voice.identity.verified') : T('voice.identity.review')}` : ''}{!m.ok ? ` · ${T('jp.skipped')}` : ''}</span>)}
        {result?.steps.filter((s) => s.status === 'failed').map((s) => <span key={s.step} className="badge badge-bad">{T.dyn(`char.create.step.${s.step}`)} · {T('jp.failed')}</span>)}
      </span>
    </Notice>
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
          <p className="prose-copy mt-2" dir="auto">{c.personality || '—'}</p>
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
      {lock.reason === 'UNKNOWN' && <Notice tone="warn" title={T('char.usage.unknown')}>{T('char.usage.unknown.hint')} {T('char.lock.hint')}</Notice>}
      <Block title={T('char.usedIn.videos')} count={byProduction.size} description={T('char.usedIn.videosHint')}>
        {byProduction.size === 0 ? <Empty compact title={lock.reason === 'UNKNOWN' ? T('char.usage.unknown') : T('char.usedIn.none')} hint={lock.reason === 'UNKNOWN' ? T('char.usage.unknown.hint') : T('char.usedIn.noneHint')} /> : (
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
      <p className="text-[12px] text-faint">{c.name} · <Link href="/characters" className="hover:text-fg">{T('nav.characters')}</Link></p>
    </div>
  );
}
