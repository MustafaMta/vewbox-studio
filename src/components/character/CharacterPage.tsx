'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Character, Production } from '@/domain/types';
import { nonHumanSpecies } from '@/domain/identity';
import { useJobsFor, useStudio } from '@/studio/store';
import { artVars } from '@/studio/presentation';
import { assetById, assignmentsOf, productionHref, shotHref, shotLabel } from '@/studio/selectors';
import { posterOf } from '@/studio/selectors/poster';
import { useToast } from '@/components/ui/toast';
import { Button, MenuButton, MenuItem, MenuSeparator, Notice, Skeleton, SkeletonRegion, StateWord, Textarea, useConfirm } from '@/components/ui/kit';
import { IconClose, IconDelete, IconEdit } from '@/components/ui/icons';
import { Frame } from '@/components/media/Frame';
import { words } from '@/lib/format';
import { identityStatus, imageJobs } from './identity';
import { createResultOf } from './contract';
import { lookFieldText, lookFromReference } from './look';
import { IdentityBlock } from './ImagePanel';
import { VoiceSection, VoiceSummary } from './VoiceSection';
import { SecondaryMaterial } from './SecondaryMaterial';
import { DetailsDialog, LookDialog, STYLE_WORD, languageWords } from './EditDialogs';
import { MediaTile, PosterCard } from '@/components/media';
import { BackLink, CastSection, figureOf, nameLang, usable } from './parts';

/** Old links named a tab or a section; the profile is one page, so they land on the matching section. */
const LEGACY: Record<string, string> = { voice: 'voice', used: 'appears', usage: 'appears', productions: 'appears', appearance: 'figure', sides: 'figure', image: 'figure', profile: 'about', overview: 'about' };

/** ONE CHARACTER (docs/DESIGN-SYSTEM-V5.md §8.8 on the v5.1 standard) — a standing figure you can hear. The ONE
 *  canonical front full-body figure at 928:1664 on its own field, never cropped, sticky beside the words from 1024 px;
 *  beside it the slate, the name, the role, the figure's state (draft · approved · locked) with Approve / Redraw, and
 *  the one voice as an audio row. Then About (who they are and the look, only the facts that are written), Voice (how
 *  it was checked, the ways to make or replace it, how it should sound), Appears in (the productions as posters, the
 *  shots as frames), Notes for the writers, and More pictures. Details stay editable after filming; the look and the
 *  voice are held. No model internals. */
export function CharacterPage({ c }: { c: Character }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const confirm = useConfirm();
  const s = identityStatus(c);
  const locked = s.kind === 'LOCKED';
  const jobs = useJobsFor({ characterId: c.id, type: 'CHARACTER_APPEARANCE' });
  const { running } = imageJobs(c, jobs);
  const figure = figureOf(state, c);
  const lang = nameLang(c.name);
  const [details, setDetails] = useState(false);
  const [look, setLook] = useState(false);
  const target = sp.get('tab') ?? (typeof window !== 'undefined' ? window.location.hash.slice(1) : '');
  useEffect(() => { const id = target ? LEGACY[target] ?? target : undefined; if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' }); }, [target]);
  const species = nonHumanSpecies(c.species);
  const slate = [STYLE_WORD[c.style], languageWords(c), species ? words(species) : null, c.ageYears ? `${c.ageYears} years old` : null].filter(Boolean) as string[];

  const remove = async () => {
    const ok = await confirm({ title: `Delete ${c.name}?`, body: 'They are removed from every cast list. Finished shots and cuts keep their pictures and sound.', confirmLabel: `Delete ${c.name}`, tone: 'danger' });
    if (!ok) return;
    try { act('deleteCharacter', c.id); toast.ok(`${c.name} was deleted.`); router.push('/characters'); } catch (e) { toast.bad((e as Error).message); }
  };

  return (
    <article className="pc-page" aria-labelledby="char-name">
      <JustCreated c={c} />
      <div className="char">
        <div className="char-figure" id="figure">
          <Frame asset={figure} ratio="928/1664" fit="contain" radius="hero" alt={`${c.name}, full length, from the front`} art={artVars(figure)} title={c.name} titleLang={lang} titleState="noImage"
            state={running ? 'drawing' : undefined} phase={running ? (running.progress?.message || 'Drawing the figure') : undefined} judge={s.kind === 'DRAFT'} priority className="char-figure-frame" />
        </div>
        <div className="char-main">
          <BackLink href="/characters" label="Characters" />
          <p className="t-meta char-slate">{slate.map((x) => <span key={x}>{x}</span>)}</p>
          <h1 id="char-name" className="t-hero char-name" title={c.name}><bdi lang={lang}>{c.name}</bdi></h1>
          {c.nameAr && <p className="t-body char-alt"><bdi lang="ar">{c.nameAr}</bdi></p>}
          <p className="t-lead char-role" dir="auto">{c.role || 'No description yet.'}</p>
          <IdentityBlock c={c} s={s} extra={<>
            <Button variant="secondary" icon={<IconEdit />} onClick={() => setDetails(true)}>Edit details</Button>
            <MenuButton label={`More for ${c.name}`} iconOnly variant="secondary" align="end">
              <MenuItem icon={<IconEdit aria-hidden />} onClick={() => setLook(true)} disabled={locked} description={locked ? 'Held: the character has been filmed' : 'Style, age and how they look, in words'}>Edit the look</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<IconDelete aria-hidden />} tone="danger" onClick={() => void remove()}>Delete {c.name}</MenuItem>
            </MenuButton>
          </>} />
          <VoiceSummary c={c} />

          <About c={c} />
          <VoiceSection c={c} />
          <AppearsIn c={c} />
          <Notes c={c} />
          <SecondaryMaterial c={c} locked={locked} />
        </div>
      </div>
      <DetailsDialog c={c} open={details} onClose={() => setDetails(false)} />
      <LookDialog c={c} open={look} onClose={() => setLook(false)} />
    </article>
  );
}

/** Who they are: the personality as prose, the distinguishing traits, then the look in words — only the facts that
 *  are written (a look drawn from a reference picture says so). */
function About({ c }: { c: Character }) {
  const { state } = useStudio();
  const fromPicture = lookFromReference(c, state.assets);
  const look = (v: string) => lookFieldText(v, fromPicture, 'From the reference picture');
  const species = nonHumanSpecies(c.species);
  const looks = [['Build', c.build], ['Face', c.face], ['Hair', c.hair], ['Skin', c.skin], ['Eyes', c.eyes], ['Wardrobe', c.wardrobe]] as const;
  const fromRef = fromPicture ? looks.filter(([, v]) => !(v ?? '').trim() || v.trim() === '?').map(([k]) => k) : [];
  const facts = [
    ['Who', [c.sex === 'FEMALE' ? 'Female' : 'Male', c.ageYears ? `${c.ageYears}` : null, species ? words(species) : null].filter(Boolean).join(' · ')],
    ['Build', look(c.build)], ['Face', look(c.face)], ['Hair', look(c.hair)], ['Skin', look(c.skin)], ['Eyes', look(c.eyes)], ['Wardrobe', look(c.wardrobe)], ['Distinguishing marks', c.distinguishing.join(' · ')],
  ].filter(([k, v]) => v && v !== '—' && !(fromRef.length > 1 && (fromRef as readonly string[]).includes(k)));
  if (fromRef.length > 1) facts.push([fromRef.join(', '), 'As in the reference picture']);
  return (
    <CastSection id="about" title="About">
      {c.personality ? c.personality.split(/\n{2,}/).map((p, i) => <p key={i} className="t-prose char-prose" dir="auto">{p}</p>) : <p className="t-body pc-empty-line">No personality written yet.</p>}
      <dl className="char-facts">
        {facts.map(([label, value]) => <div key={label}><dt className="t-label">{label}</dt><dd dir="auto">{value}</dd></div>)}
      </dl>
    </CastSection>
  );
}

interface Appearance { p: Production; shots: Array<{ id: string; label: string; href: string; frame?: ReturnType<typeof assetById> }> }

/** APPEARS IN — the productions as posters (key art, else the frame poster, else the title card), then every shot the
 *  character is in as a 16:9 frame (the shot's drawn opening frame) labelled with its number. An unknown video history
 *  says so and is never read as "unused". */
function AppearsIn({ c }: { c: Character }) {
  const { state } = useStudio();
  const s = identityStatus(c);
  const filmedIn = new Set((c.usage?.videos ?? []).filter((v) => v.status === 'IN_TAKE').map((v) => v.productionId));
  const list: Appearance[] = useMemo(() => {
    const { productions } = assignmentsOf(state, c.id);
    const ids = new Set([...productions.map((p) => p.id), ...filmedIn]);
    return state.productions.filter((p) => ids.has(p.id)).map((p) => ({
      p,
      shots: p.shots.filter((sh) => sh.characterIds.includes(c.id))
        .sort((a, b) => (p.scenes.find((x) => x.id === a.sceneId)?.number ?? 0) - (p.scenes.find((x) => x.id === b.sceneId)?.number ?? 0) || a.number - b.number)
        .map((sh) => { const f = assetById(state, sh.openingFrameAssetId); return { id: sh.id, label: shotLabel(p, sh), href: shotHref(p, sh.id), frame: usable(f) ? f : undefined }; }),
    }));
  }, [state, c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shows = assignmentsOf(state, c.id).shows;
  const shotCount = list.reduce((n, a) => n + a.shots.length, 0);
  const kind = (p: Production) => (p.kind === 'SHORT' ? 'Short' : p.kind === 'MUSIC_VIDEO' ? 'Music video' : 'Episode');
  return (
    <CastSection id="appears" title="Appears in" count={list.length + shows.length || undefined}>
      {s.lock.reason === 'UNKNOWN' && <Notice tone="warn" title="History not on record">The video history of this character is not on record, so the figure and voice are kept as if filmed.</Notice>}
      {list.length + shows.length === 0 ? <p className="t-body pc-empty-line">{s.lock.reason === 'UNKNOWN' ? 'No video history on record.' : 'Not cast in a production yet.'}</p> : (
        <ul className="char-posters" role="list">
          {shows.map((x) => <li key={x.id}><PosterCard href={`/shows/${x.id}`} asset={usableOr(assetById(state, x.posterAssetId ?? x.coverAssetId))} title={x.title} meta="Show" /></li>)}
          {list.map(({ p, shots }) => (
            <li key={p.id}><PosterCard href={productionHref(p)} asset={usableOr(posterOf(p, state.assets)?.asset)} title={p.title}
              meta={`${kind(p)} · ${filmedIn.has(p.id) ? (shots.length === 1 ? 'in 1 shot' : `in ${shots.length} shots`) : 'cast, not filmed yet'}`} /></li>
          ))}
        </ul>
      )}
      {shotCount > 0 && (
        <>
          <h3 className="t-title char-sub">Shots <span className="shead-count">{shotCount}</span></h3>
          {/* the media tile anatomy (§5.6): the label and the film under the frame, never printed over a face (M5) */}
          <ul className="char-frames" role="list">
            {list.flatMap(({ p, shots }) => shots.map((sh) => (
              <li key={sh.id}><MediaTile href={sh.href} asset={sh.frame} ratio="16/9" title={`Shot ${sh.label}`} meta={[p.title]} /></li>
            )))}
          </ul>
        </>
      )}
    </CastSection>
  );
}
const usableOr = (a: import('@/domain/types').Asset | null | undefined) => (usable(a) ? a : undefined);

/** Notes for the writers: metadata, saved in place, editable whatever the lock. */
function Notes({ c }: { c: Character }) {
  const { act } = useStudio();
  const toast = useToast();
  const [notes, setNotes] = useState(c.notes ?? '');
  const dirty = notes !== (c.notes ?? '');
  return (
    <CastSection id="notes" title="Notes for the writers" description="Habits, history, how to play them. Never used to draw the character.">
      <form className="char-form" onSubmit={(e) => { e.preventDefault(); try { act('updateCharacter', c.id, { notes }); toast.ok('Notes saved.'); } catch (err) { toast.bad((err as Error).message); } }}>
        <Textarea aria-label="Notes for the writers" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000} />
        <div className="char-form-acts">
          <Button type="submit" variant="secondary" size="sm" disabled={!dirty}>{dirty ? 'Save notes' : 'Saved'}</Button>
          {dirty && <StateWord tone="waiting">Unsaved changes</StateWord>}
        </div>
      </form>
    </CastSection>
  );
}

/** The one-time note after creation (`?created=<jobId>`): what the chain made, and the one thing that waits — the
 *  approval of the figure. Dismissing it drops the parameter. */
function JustCreated({ c }: { c: Character }) {
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
  const message = s.kind === 'DRAFT' ? 'Look at the figure and approve it: it becomes the character in every shot.' : s.kind === 'NONE' ? 'The figure was not drawn; draw it from here.' : 'The character is ready.';
  const step = (x: string) => (x === 'design' ? 'Writing the sheet' : x === 'image' ? 'Drawing the figure' : 'Building the voice');
  return (
    <div className="pc-notice">
      <Notice tone={s.kind === 'DRAFT' ? 'warn' : failed.length ? 'bad' : 'ok'} title={`${c.name} was created`} action={<Button size="sm" variant="quiet" icon={<IconClose />} onClick={dismiss}>Close</Button>}>
        {message}{!c.voice.identity ? ' No voice yet: make one under Voice.' : ''}
        {failed.length > 0 && <span className="pc-notice-bad">{failed.map((f) => `${step(f.step)}: ${f.reason ?? 'failed'}`).join(' · ')}</span>}
      </Notice>
    </div>
  );
}

/** The profile while the studio's first snapshot loads: the figure at 928:1664 in its column, then the slate, the name,
 *  the role, the state, the actions and the voice row at their real sizes. */
export function CharacterSkeleton() {
  return (
    <SkeletonRegion label="Opening the character…" className="pc-page pc-skeleton">
      <div className="char">
        <div className="char-figure"><Skeleton.Media ratio="928/1664" className="char-figure-frame" /></div>
        <div className="char-main">
          <span className="pc-back"><Skeleton.Line width="6rem" /></span>
          <div className="t-meta char-slate"><Skeleton.Line width="16rem" /></div>
          <div className="t-hero char-name"><Skeleton.Line size="title" width="14rem" /></div>
          <div className="t-lead char-role"><Skeleton.Line width="80%" /></div>
          <div className="char-state"><Skeleton.Line width="10rem" /></div>
          <div className="char-acts"><Skeleton.Block width={112} height={40} radius="pill" /><Skeleton.Block width={104} height={40} radius="pill" /><Skeleton.Block width={128} height={40} radius="pill" /></div>
          <div className="char-voice"><Skeleton.Block width="100%" height={64} radius="md" /></div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
