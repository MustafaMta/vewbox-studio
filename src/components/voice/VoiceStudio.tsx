'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/studio/store';
import { PageHead, nameLang } from '@/components/character/parts';
import { TabBar, TabPanel } from '@/components/ui/kit/Tabs';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/kit/Field';
import { Button } from '@/components/ui/kit/Button';
import { Badge, StateWord, type StateTone } from '@/components/ui/kit/Status';
import { Notice, SectionEmpty } from '@/components/ui/kit/States';
import { useToast } from '@/components/ui/toast';
import { prepareLineText } from '@/server/providers/iraqi-text';
import { VOICE_ENGINES, type LocalTtsEngine } from '@/server/providers/voice-engines';
import { EVAL_VOICE_ENGINES } from '@/server/providers/voice-eval-engines';
import type { PronunciationEntry } from '@/domain/pronunciation';
import type { Character } from '@/domain/types';
import type { Job } from '@/domain/jobs';

/** THE VOICE STUDIO (docs/VOICE-ENGINE.md): the studio's voices in one place — each character's voice and how it was
 *  judged, the dialogue editor (what an engine will hear for a line), the pronunciation dictionary and its native
 *  review, the blind voice comparison with native-listener grading, and the voice work running now. Lives under
 *  Characters (/characters/voices). Nothing here invents a score: every rating is a person's. */

const TABS = [
  { id: 'voices', label: 'Character voices' },
  { id: 'dialogue', label: 'Dialogue editor' },
  { id: 'pronunciation', label: 'Pronunciations' },
  { id: 'compare', label: 'Voice comparison' },
  { id: 'monitor', label: 'Generation monitor' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const isArabic = (s: string) => /[؀-ۿ]/.test(s);
const engineLabel = (id?: string) => (id && (VOICE_ENGINES as Record<string, { label: string }>)[id]?.label) || (id && (EVAL_VOICE_ENGINES as Record<string, { label: string }>)[id]?.label) || id || '—';

export function VoiceStudio() {
  const [tab, setTab] = useState<TabId>('voices');
  return (
    <div className="pc-page">
      <PageHead title="Voice Studio" description="Every character's voice, what the engines hear, the pronunciations a native speaker approved, and how the voices compare to a listener." back={{ href: '/characters', label: 'Characters' }} />
      <TabBar tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} current={tab} onSelect={(id) => setTab(id as TabId)} ariaLabel="Voice Studio" idBase="vs" />
      <TabPanel idBase="vs" id="voices" current={tab}><CharacterVoices /></TabPanel>
      <TabPanel idBase="vs" id="dialogue" current={tab}><DialogueEditor /></TabPanel>
      <TabPanel idBase="vs" id="pronunciation" current={tab}><Pronunciations /></TabPanel>
      <TabPanel idBase="vs" id="compare" current={tab}><VoiceComparison /></TabPanel>
      <TabPanel idBase="vs" id="monitor" current={tab}><GenerationMonitor /></TabPanel>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ character voices

function voiceState(c: Character): { tone: StateTone; words: string } {
  const id = c.voice?.identity;
  if (!id) return { tone: 'idle', words: 'No voice yet' };
  if (id.status === 'ACTIVE') return { tone: 'done', words: 'Voice ready' };
  if (id.status === 'REVIEW') return { tone: 'waiting', words: 'Needs listening' };
  return { tone: 'idle', words: String(id.status ?? 'Draft').toLowerCase() };
}

function CharacterVoices() {
  const { state } = useStudio();
  const cs = state.characters;
  if (!cs.length) return <SectionEmpty>No characters yet. A character's voice is made on its page.</SectionEmpty>;
  return (
    <div className="paper card-pad" style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr><th scope="col">Character</th><th scope="col">Language</th><th scope="col">Engine</th><th scope="col">State</th><th scope="col">Dialect</th><th scope="col">Listened</th></tr></thead>
        <tbody>
          {cs.map((c) => {
            const id = c.voice?.identity; const s = voiceState(c);
            const listened = id?.listening?.length ?? 0;
            return (
              <tr key={c.id}>
                <td><Link href={`/characters/${c.id}#voice`}>{c.name}</Link></td>
                <td>{c.language}{c.dialect === 'IRAQI_BAGHDADI' ? ' · Iraqi (Baghdadi)' : ''}</td>
                <td>{id?.provider === 'MINIMAX' ? 'MiniMax (hosted)' : engineLabel(id?.model)}</td>
                <td><StateWord tone={s.tone}>{s.words}</StateWord></td>
                <td>{c.dialect === 'IRAQI_BAGHDADI' ? <Badge tone={id?.dialectStatus === 'LISTENER_APPROVED' ? 'ok' : id?.dialectStatus === 'LISTENER_REJECTED' ? 'bad' : 'warn'}>{id?.dialectStatus === 'LISTENER_APPROVED' ? 'A listener approved it' : id?.dialectStatus === 'LISTENER_REJECTED' ? 'A listener rejected it' : 'Not judged by a listener'}</Badge> : '—'}</td>
                <td>{listened ? `${listened} ${listened === 1 ? 'time' : 'times'}` : 'Not yet'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ dialogue editor

const ENGINE_OPTIONS = [
  ...Object.values(VOICE_ENGINES).map((e) => ({ value: e.id, label: e.label })),
  ...Object.values(EVAL_VOICE_ENGINES).map((e) => ({ value: e.id, label: `${e.label} — not for production` })),
];

function DialogueEditor() {
  const { state } = useStudio();
  const [text, setText] = useState('');
  const [lang, setLang] = useState<'AR' | 'EN'>('AR');
  const [iraqi, setIraqi] = useState(true);
  const [engine, setEngine] = useState<string>('habibi');
  const prepared = useMemo(() => (text.trim() ? prepareLineText(text, { engine: engine as LocalTtsEngine, language: lang, dialect: lang === 'AR' && iraqi ? 'IRAQI_BAGHDADI' : undefined, pronunciations: state.settings.voice?.pronunciations }) : null), [text, lang, iraqi, engine, state.settings.voice?.pronunciations]);
  const speaks = (VOICE_ENGINES as Record<string, { languages: readonly string[] }>)[engine]?.languages ?? (EVAL_VOICE_ENGINES as Record<string, { languages: readonly string[] }>)[engine]?.languages ?? [];
  return (
    <div className="paper card-pad" style={{ display: 'grid', gap: 16 }}>
      <p className="t-body">Write a line as the script has it. This shows what the engine will hear: numbers spelled the Baghdadi way, marks it would drop removed, and the pronunciations a native speaker approved. The script itself is never changed.</p>
      <Field label="The line" htmlFor="vs-line"><Textarea id="vs-line" dir="auto" lang={nameLang(text) ?? 'en'} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="شلونك حبيبي، وينك من الصبح؟" /></Field>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Field label="Language" htmlFor="vs-lang"><Select id="vs-lang" value={lang} onChange={(e) => setLang(e.target.value as 'AR' | 'EN')} options={[{ value: 'AR', label: 'Arabic' }, { value: 'EN', label: 'English' }]} /></Field>
        <Field label="Engine" htmlFor="vs-engine"><Select id="vs-engine" value={engine} onChange={(e) => setEngine(e.target.value)} options={ENGINE_OPTIONS} /></Field>
        {lang === 'AR' && <Checkbox label="Iraqi (Baghdadi)" checked={iraqi} onChange={(e) => setIraqi(e.target.checked)} />}
      </div>
      {!speaks.includes(lang) && <Notice tone="warn">{engineLabel(engine)} does not speak {lang === 'AR' ? 'Arabic' : 'English'}.</Notice>}
      {prepared && (
        <div className="well card-pad" style={{ display: 'grid', gap: 8 }}>
          <div className="t-label">What the engine hears</div>
          <p className="t-lead" dir="auto" lang={lang === 'AR' ? 'ar' : 'en'} style={{ unicodeBidi: 'isolate' }}>{prepared.text}</p>
          {prepared.changes.length ? <ul className="t-meta">{prepared.changes.map((c) => <li key={c} dir="auto">{c}</li>)}</ul> : <p className="t-meta">Nothing changes: the engine hears the line as written.</p>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ pronunciations

function Pronunciations() {
  const { state, act } = useStudio();
  const toast = useToast();
  const list: PronunciationEntry[] = state.settings.voice?.pronunciations ?? [];
  const [word, setWord] = useState(''); const [say, setSay] = useState(''); const [note, setNote] = useState('');
  const [reviewer, setReviewer] = useState(''); const [native, setNative] = useState(false);
  const propose = () => {
    try { act('proposePronunciation', { word, say, language: isArabic(word) ? 'AR' : 'EN', ...(isArabic(word) ? { dialect: 'IRAQI_BAGHDADI' as const } : {}), ...(note.trim() ? { note } : {}), proposedBy: 'producer' }); setWord(''); setSay(''); setNote(''); toast.ok('Proposed. It is spoken once a native speaker approves it.'); }
    catch (e) { toast.bad((e as Error).message); }
  };
  const review = (id: string, verdict: 'APPROVED' | 'REJECTED') => {
    try { act('reviewPronunciation', id, { by: reviewer, native, verdict }); toast.ok(verdict === 'APPROVED' ? (native ? 'Approved: the engines now hear it.' : 'Recorded. Only a native speaker’s approval makes it spoken.') : 'Rejected.'); }
    catch (e) { toast.bad((e as Error).message); }
  };
  const tone = (s: PronunciationEntry['status']) => (s === 'APPROVED' ? 'ok' : s === 'REJECTED' ? 'bad' : 'warn') as 'ok' | 'bad' | 'warn';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="paper card-pad" style={{ display: 'grid', gap: 12 }}>
        <p className="t-body">Propose how an engine should say a word. A proposal is not spoken until a native speaker of that dialect approves it.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <Field label="Word as written" htmlFor="pr-word"><Input id="pr-word" dir="auto" value={word} onChange={(e) => setWord(e.target.value)} placeholder="باچر" /></Field>
          <Field label="How the engine should hear it" htmlFor="pr-say"><Input id="pr-say" dir="auto" value={say} onChange={(e) => setSay(e.target.value)} placeholder="باچِر" /></Field>
          <Field label="Note" optional htmlFor="pr-note"><Input id="pr-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button variant="primary" onClick={propose} disabled={!word.trim() || !say.trim()}>Propose</Button>
        </div>
      </div>
      <div className="paper card-pad" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <Field label="Reviewer" htmlFor="pr-reviewer"><Input id="pr-reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Your name" /></Field>
          <Checkbox label="I am a native speaker of this dialect" checked={native} onChange={(e) => setNative(e.target.checked)} />
        </div>
        {list.length === 0 ? <SectionEmpty>No pronunciations yet.</SectionEmpty> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th scope="col">Word</th><th scope="col">Heard as</th><th scope="col">State</th><th scope="col">Reviews</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td dir="auto" lang={e.language === 'AR' ? 'ar' : 'en'}>{e.word}</td>
                    <td dir="auto" lang={e.language === 'AR' ? 'ar' : 'en'}>{e.say}</td>
                    <td><Badge tone={tone(e.status)}>{e.status === 'APPROVED' ? 'Spoken' : e.status === 'REJECTED' ? 'Rejected' : 'Waiting for a native speaker'}</Badge></td>
                    <td className="t-meta">{e.reviews.length ? e.reviews.map((r) => `${r.by}${r.native ? ' (native)' : ''}: ${r.verdict.toLowerCase()}`).join('; ') : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {e.status === 'PROPOSED' && <Button size="xs" variant="secondary" disabled={!reviewer.trim()} onClick={() => review(e.id, 'APPROVED')}>Approve</Button>}{' '}
                      {e.status !== 'REJECTED' && <Button size="xs" variant="quiet" disabled={!reviewer.trim()} onClick={() => review(e.id, 'REJECTED')}>Reject</Button>}{' '}
                      <Button size="xs" variant="quiet" onClick={() => act('removePronunciation', e.id)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ comparison

interface CompareView {
  ready: boolean; why?: string; labOnly?: boolean;
  tests?: Array<{ id: string; language: 'AR' | 'EN'; intent: string; text: string; clips: Array<{ letter: string; src: string }>; reference?: string; failed: number }>;
  graded?: Array<{ by: string; native: boolean; at: string; ratings: number }>;
  results?: Array<{ arm: string; engine: string; acting: string; ratings: number; listeners: Record<string, number | null>; nativeListeners: Record<string, number | null>; machine: { attempted: number; failed: Array<{ test: string; error?: string }>; rtf: number | null; cer: number | null; peakVramMb: number | null }; licence: string | null }> | null;
}
const SCALES = [['natural', 'Natural'], ['baghdadi', 'Baghdadi'], ['emotion', 'Emotion fits'], ['pronunciation', 'Pronunciation'], ['same_voice', 'Same voice']] as const;

function VoiceComparison() {
  const toast = useToast();
  const [view, setView] = useState<CompareView | null>(null);
  const [by, setBy] = useState(''); const [native, setNative] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Record<string, number | string>>>({});
  const [busy, setBusy] = useState(false);
  const load = () => fetch('/api/voice-eval', { cache: 'no-store' }).then((r) => r.json()).then(setView).catch(() => setView({ ready: false, why: 'The comparison could not be read.' }));
  useEffect(() => { void load(); }, []);
  if (!view) return <p className="t-meta">Loading the comparison…</p>;
  if (!view.ready) return <SectionEmpty>{view.why}</SectionEmpty>;
  const set = (key: string, k: string, v: string) => setRatings((r) => ({ ...r, [key]: { ...(r[key] ?? {}), [k]: k === 'note' ? v : Number(v) } }));
  const submit = async () => {
    setBusy(true);
    try {
      const rs = Object.entries(ratings).map(([key, v]) => { const [test, letter] = key.split(':'); const out: Record<string, unknown> = { test, letter }; for (const [k, x] of Object.entries(v)) if (x !== '' && !(typeof x === 'number' && Number.isNaN(x))) out[k] = x; return out; });
      const r = await fetch('/api/voice-eval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ by, native, ratings: rs }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Not stored');
      toast.ok('Your ratings are stored.'); setRatings({}); void load();
    } catch (e) { toast.bad((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {view.labOnly && <Notice tone="warn" title="Lab test">The Arabic clips copy the voice of an upstream demo recording used without the speaker's permission. They are for this comparison only, never for a film.</Notice>}
      <p className="t-body">Blind: each line's versions are labelled A, B, C in a random order, and the engines are named only after someone has rated. Rate what you hear from 1 (poor) to 5 (as a native speaker would say it). Leave a scale empty when it does not apply.</p>
      {view.tests!.map((t) => (
        <section key={t.id} className="paper card-pad" style={{ display: 'grid', gap: 10 }} aria-labelledby={`vc-${t.id}`}>
          <p id={`vc-${t.id}`} className="t-lead" dir={t.language === 'AR' ? 'rtl' : 'ltr'} lang={t.language === 'AR' ? 'ar' : 'en'} style={{ unicodeBidi: 'isolate' }}>{t.text}</p>
          <p className="t-meta">Intended delivery: {t.intent}{t.failed ? ` · ${t.failed} engine ${t.failed === 1 ? 'attempt' : 'attempts'} failed and ${t.failed === 1 ? 'is' : 'are'} not shown` : ''}</p>
          {t.reference && <div className="t-meta">Reference voice <audio controls preload="none" src={t.reference} style={{ verticalAlign: 'middle', maxInlineSize: '100%' }} /></div>}
          {t.clips.map((c) => {
            const key = `${t.id}:${c.letter}`;
            return (
              <div key={c.letter} className="well card-pad" style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><strong>{c.letter}</strong><audio controls preload="none" src={c.src} style={{ maxInlineSize: '100%' }} /></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {SCALES.filter(([k]) => k !== 'baghdadi' || t.language === 'AR').map(([k, label]) => (
                    <Field key={k} label={label} htmlFor={`${key}-${k}`}><Select id={`${key}-${k}`} value={String(ratings[key]?.[k] ?? '')} onChange={(e) => set(key, k, e.target.value)} options={[{ value: '', label: '—' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))]} /></Field>
                  ))}
                </div>
                <Field label="What you heard" optional htmlFor={`${key}-note`}><Input id={`${key}-note`} dir="auto" value={String(ratings[key]?.note ?? '')} onChange={(e) => set(key, 'note', e.target.value)} placeholder="Words said wrong, robotic parts…" /></Field>
              </div>
            );
          })}
        </section>
      ))}
      <div className="paper card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <Field label="Listener" htmlFor="vc-by"><Input id="vc-by" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Your name" /></Field>
        <Checkbox label="I am a native Baghdadi speaker" checked={native} onChange={(e) => setNative(e.target.checked)} />
        <Button variant="primary" loading={busy} disabled={!by.trim() || !Object.keys(ratings).length} onClick={submit}>Store my ratings</Button>
      </div>
      {view.graded?.length ? (
        <div className="paper card-pad" style={{ display: 'grid', gap: 12 }}>
          <div className="t-section">Results so far</div>
          <p className="t-meta">Rated by {view.graded.map((g) => `${g.by}${g.native ? ' (native)' : ''}`).join(', ')}. Averages are the listeners' own ratings; the machine's numbers are supporting evidence only.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th scope="col">Engine</th>{SCALES.map(([k, l]) => <th key={k} scope="col">{l}</th>)}<th scope="col">Native: natural</th><th scope="col">Speed (RTF)</th><th scope="col">Errors (CER)</th><th scope="col">Licence</th></tr></thead>
              <tbody>
                {view.results!.map((r) => (
                  <tr key={r.arm}>
                    <td>{engineLabel(r.engine)} <span className="t-meta">({r.acting})</span></td>
                    {SCALES.map(([k]) => <td key={k}>{r.listeners[k] ?? '—'}</td>)}
                    <td>{r.nativeListeners.natural ?? '—'}</td>
                    <td>{r.machine.rtf ?? '—'}</td>
                    <td>{r.machine.cer ?? '—'}</td>
                    <td className="t-meta">{r.licence ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ monitor

const VOICE_JOBS = new Set(['DIALOGUE_AUDIO', 'VOICE_BUILD', 'VOICE_DESIGN']);
const jobTone = (j: Job): StateTone => (j.status === 'FAILED' ? 'failed' : j.status === 'COMPLETED' ? 'done' : j.status === 'QUEUED' ? 'waiting' : j.status === 'CANCELLED' ? 'idle' : 'running');
const JOB_WORDS: Record<string, string> = { DIALOGUE_AUDIO: 'Dialogue lines', VOICE_BUILD: 'Voice build', VOICE_DESIGN: 'Voice design' };

function GenerationMonitor() {
  const { jobs, state } = useStudio();
  const voice = jobs.filter((j) => VOICE_JOBS.has(j.type)).slice(0, 40);
  if (!voice.length) return <SectionEmpty>No voice work yet.</SectionEmpty>;
  const who = (j: Job) => state.characters.find((c) => c.id === j.characterId)?.name ?? state.productions.find((p) => p.id === j.productionId)?.title ?? '—';
  return (
    <div className="paper card-pad" style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr><th scope="col">Work</th><th scope="col">For</th><th scope="col">State</th><th scope="col">Progress</th><th scope="col">Started</th></tr></thead>
        <tbody>
          {voice.map((j) => (
            <tr key={j.id}>
              <td>{JOB_WORDS[j.type] ?? j.type}</td>
              <td>{who(j)}</td>
              <td><StateWord tone={jobTone(j)}>{String(j.status).toLowerCase().replace(/_/g, ' ')}</StateWord></td>
              <td className="t-meta">{j.error?.message ?? (j.progress as { message?: string } | undefined)?.message ?? '—'}</td>
              <td className="t-meta">{new Date(j.startedAt ?? j.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
