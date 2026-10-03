'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Character } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, assignmentsOf, productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { Button, ConfirmDelete, Field, Notice, Status, Textarea, Thumb } from '@/components/ui/kit';
import { Art } from '@/components/ui/cinema';
import { FactList } from '@/components/ui/page';
import { StageStatus } from '@/components/library/ProductionTile';
import { IconChevronLeft, IconClose, IconDelete } from '@/components/ui/icons';
import { dialectLabel, fmtDate, words } from '@/lib/format';
import { identityStatus, usageGroups } from './identity';
import { createResultOf } from './contract';
import { lookFieldText, lookFromReference } from './look';
import { ImagePanel } from './ImagePanel';
import { VoiceSection } from './VoiceSection';
import { SecondaryMaterial } from './SecondaryMaterial';
import { DetailsDialog, LookDialog } from './EditDialogs';

/** Old links named a tab; the profile is one page now, so they land on the matching section. */
const LEGACY_TAB: Record<string, string> = { voice: 'voice', used: 'productions', usage: 'productions', appearance: 'image', sides: 'image', profile: 'about', overview: 'about' };

/** ONE CHARACTER — a premium cast profile built around one image (docs/CONTRACTS-IDENTITY-PACK.md v2 §4,
 *  DESIGN-SYSTEM-V3 §9.6): the canonical front full-body image as the hero with its state said once beneath it
 *  (Draft — awaiting your approval · Approved · Locked: used in N videos) and the quiet actions that apply (Approve,
 *  Redraw, Draw); beside it who they are — name, Arabic name, short description, personality, language and dialect;
 *  then the voice identity with a real player, the productions they are in, the creative notes, and, collapsed at the
 *  end, any secondary material. No tabs. Details stay editable after a video; the look and the voice are held. */
export function CharacterPage({ c }: { c: Character }) {
  const T = useT();
  const { act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const s = identityStatus(c);
  const locked = s.kind === 'LOCKED';
  const lang = `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`;
  const legacy = sp.get('tab');
  useEffect(() => { const id = legacy ? LEGACY_TAB[legacy] : undefined; if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' }); }, [legacy]);

  return (
    <article className="pb-8" aria-labelledby="char-name">
      <Link href="/characters" className="mb-6 inline-flex items-center gap-1 rounded-[var(--r-1)] text-[13px] font-medium text-muted transition-colors hover:text-fg"><IconChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />{T('nav.characters')}</Link>
      <JustCreated c={c} />
      <div className="grid gap-8 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
        <div id="image" className="max-w-[18rem] scroll-mt-24 md:max-w-none md:self-start lg:sticky lg:top-8"><ImagePanel c={c} s={s} /></div>

        <div className="min-w-0 space-y-12">
          <header id="about" className="scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0 flex-1 basis-72">
                <p className="eyebrow mb-2">{T.dyn(`style.${c.style}`)} · {lang}</p>
                <h1 id="char-name" className="display-xl" dir="auto">{c.name}</h1>
                {c.nameAr && <p className="mt-1 text-sm text-muted"><bdi dir="rtl" lang="ar">{c.nameAr}</bdi></p>}
              </div>
              <div className="flex flex-none items-center gap-1.5"><DetailsDialog c={c} /></div>
            </div>
            <p className="lead mt-4" dir="auto">{c.role || T('cast.profile.noDescription')}</p>
            {c.personality && <p className="prose-copy mt-4" dir="auto">{c.personality}</p>}
            {c.distinguishing.length > 0 && <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted" aria-label={T('char.traits')}>{c.distinguishing.map((x) => <li key={x} dir="auto">{x}</li>)}</ul>}
          </header>

          <Look c={c} locked={locked} />
          <VoiceSection c={c} />
          <Productions c={c} />
          <Notes c={c} />
          <SecondaryMaterial c={c} locked={locked} />
          <div className="border-t border-line-soft pt-6">
            <ConfirmDelete title={c.name} label={T('cast.profile.delete')} onDelete={() => { try { act('deleteCharacter', c.id); toast.ok(T('toast.deleted')); router.push('/characters'); } catch (e) { toast.bad((e as Error).message); } }} variant="ghost" icon={<IconDelete />}>{T('char.deleteConfirm')}</ConfirmDelete>
          </div>
        </div>
      </div>
    </article>
  );
}

/** The written look and the facts that go with it, read-only, with Edit look while the look may still change. */
function Look({ c, locked }: { c: Character; locked: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const fromPicture = lookFromReference(c, state.assets);
  const look = (v: string) => lookFieldText(v, fromPicture, T('char.look.fromReference'));
  const who = c.species ? words(c.species) : `${c.sex === 'FEMALE' ? T('label.female') : T('label.male')} · ${c.ageYears}`;
  return (
    <section aria-labelledby="look-h">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="look-h" className="section-title">{T('cast.profile.look')}</h2><LookDialog c={c} locked={locked} describedBy="identity-lock" /></div>
      <div><FactList items={[{ label: T('cast.profile.who'), value: who }, { label: T('label.build'), value: look(c.build) }, { label: T('label.face'), value: look(c.face) }, { label: T('label.hair'), value: look(c.hair) }, { label: T('label.skin'), value: look(c.skin) }, { label: T('label.eyes'), value: look(c.eyes) }, { label: T('label.wardrobe'), value: look(c.wardrobe) }]} /></div>
    </section>
  );
}

/** PRODUCTIONS — the videos the character has actually been in (from the usage records, with the image version
 *  each take was made with when recorded), then where they are cast but not filmed yet. An unknown history says so
 *  and is never read as "unused". */
function Productions({ c }: { c: Character }) {
  const T = useT();
  const { state } = useStudio();
  const s = identityStatus(c);
  const groups = usageGroups(c, state.productions);
  const filmed = new Set(groups.map((g) => g.productionId));
  const { shows, productions } = assignmentsOf(state, c.id);
  const cast = [...shows.map((x) => ({ id: `s-${x.id}`, href: `/shows/${x.id}`, title: x.title, kind: T('kind.SHOW'), art: assetById(state, x.posterAssetId ?? x.coverAssetId) })), ...productions.filter((p) => !filmed.has(p.id) && !p.showId).map((p) => ({ id: p.id, href: productionHref(p), title: p.title, kind: T.dyn(`kind.${p.kind}`), art: assetById(state, p.posterAssetId ?? p.coverAssetId) }))];
  return (
    <section id="productions" aria-labelledby="prod-h" className="scroll-mt-24">
      <h2 id="prod-h" className="section-title mb-4">{T('cast.prod.title')}{groups.length > 0 && <span className="num ms-2 text-[13px] font-medium text-faint">{groups.length}</span>}</h2>
      {s.lock.reason === 'UNKNOWN' && <Notice tone="warn" className="mb-4" title={T('char.usage.unknown')}>{T('char.usage.unknown.hint')}</Notice>}
      {groups.length === 0 ? <p className="text-[14px] text-muted">{s.lock.reason === 'UNKNOWN' ? T('cast.prod.unknown') : T('cast.prod.none')}</p> : (
        <ul className="rows">
          {groups.map((g) => {
            const art = assetById(state, g.production?.coverAssetId);
            return (
              <li key={g.productionId} className="row items-start gap-4">
                <div className="w-28 flex-none sm:w-36"><Thumb src={art?.src} alt="" ratio="aspect-video" empty="—" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {g.production ? <Link href={productionHref(g.production)} className="text-[15px] font-semibold text-fg underline-offset-2 hover:underline" dir="auto">{g.title}</Link> : <span className="text-[15px] font-semibold text-fg" dir="auto">{g.title} <span className="text-[13px] font-normal text-faint">· {T('char.usedIn.deleted')}</span></span>}
                    {g.production && <StageStatus p={g.production} />}
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-muted">{g.rows.map((r) => `${T('label.shot')} ${r.shotLabel} · ${r.takeLabel}${r.status === 'TAKE_REMOVED' ? ` (${T('char.usage.takeRemoved')})` : ''}`).join(' — ')}</p>
                  <p className="mt-0.5 text-xs text-faint">{T('char.usedIn.first')} {fmtDate(g.firstAt, T.locale)} · {g.imageVersions.length ? `${T('cast.prod.imageVersion')} ${g.imageVersions.join(', ')}` : T('cast.prod.versionUnknown')}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {cast.length > 0 && (
        <div className="mt-8">
          <h3 className="h3">{T('cast.prod.cast')}</h3>
          <p className="mt-1 text-[13px] text-faint">{T('char.usedIn.assignedHint')}</p>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-4">
            {cast.map((x) => <li key={x.id}><Link href={x.href} className="poster-link block"><Art src={x.art?.src} ratio="poster" title={x.title} /><p className="mt-2 line-clamp-2 text-[13px] font-medium leading-5 text-fg" dir="auto">{x.title}</p><p className="text-xs text-faint">{x.kind}</p></Link></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Creative notes for the writers: metadata, saved in place, editable whatever the lock. */
function Notes({ c }: { c: Character }) {
  const T = useT();
  const { act } = useStudio();
  const toast = useToast();
  const [notes, setNotes] = useState(c.notes ?? '');
  const dirty = notes !== (c.notes ?? '');
  return (
    <section aria-labelledby="notes-h">
      <h2 id="notes-h" className="section-title mb-3">{T('char.notes')}</h2>
      <form className="max-w-2xl space-y-3" onSubmit={(e) => { e.preventDefault(); try { act('updateCharacter', c.id, { notes }); toast.ok(T('toast.saved')); } catch (err) { toast.bad((err as Error).message); } }}>
        <Field label={<span className="sr-only">{T('char.notes')}</span>} help={T('char.notes.hint')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000} /></Field>
        <div className="flex items-center gap-3">{dirty && <Status tone="warn">{T('shot.unsaved')}</Status>}<Button type="submit" variant="secondary" size="sm" disabled={!dirty}>{dirty ? T('btn.save') : T('btn.saved')}</Button></div>
      </form>
    </section>
  );
}

/** The one-time note after creation (`?created=<jobId>`): what the chain made, and the one thing that waits — the
 *  approval of the image. Dismissing it drops the parameter. */
function JustCreated({ c }: { c: Character }) {
  const T = useT();
  const { jobs } = useStudio();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const jobId = sp.get('created');
  if (!jobId) return null;
  const result = createResultOf(jobs.find((j) => j.id === jobId));
  const s = identityStatus(c);
  const failed = result?.steps.filter((x) => x.status === 'failed') ?? [];
  const dismiss = () => { const q = new URLSearchParams(sp.toString()); q.delete('created'); router.replace(`${pathname}${q.size ? `?${q}` : ''}`, { scroll: false }); };
  const message = s.kind === 'DRAFT' ? T('cast.created.approve') : s.kind === 'NONE' ? T('cast.created.noImage') : T('cast.created.done');
  return (
    <Notice tone={s.kind === 'DRAFT' ? 'warn' : failed.length ? 'bad' : 'ok'} className="mb-8" title={T('char.created.title')} action={<Button size="sm" variant="quiet" icon={<IconClose />} onClick={dismiss}>{T('btn.close')}</Button>}>
      {message}{!c.voice.identity ? ` ${T('cast.created.noVoice')}` : ''}
      {failed.length > 0 && <span className="mt-1 block text-bad">{failed.map((f) => `${T.dyn(`cast.step.${f.step}`)}: ${f.reason ?? T('jp.failed')}`).join(' · ')}</span>}
    </Notice>
  );
}
