'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStudio } from '@/studio/store';
import { primaryImageOf } from '@/domain/identity';
import { DESIGN_LABEL, languageLabel, sameLanguage, spokenLanguages } from '@/domain/voice-identity';
import type { Asset, Character, SpokenLanguage, VoiceLanguageProfile, VoiceSample } from '@/domain/types';
import { VOICE_ENGINES } from '@/server/providers/voice-engines';
import { Field, Select, Textarea } from '@/components/ui/kit/Field';
import { Button } from '@/components/ui/kit/Button';
import { Badge, type Tone } from '@/components/ui/kit/Status';
import { useToast } from '@/components/ui/toast';

/** ONE PERFORMER'S VOICE (Phase 1): the character's figure, what it performs, the languages it speaks, its one voice
 *  identity (origin, reference, revision) and — per language — the engine, the lines it spoke, what the transcriber
 *  heard, and the producer's listening record. Machine numbers are shown small and secondary; nothing here decides. */

const engineLabel = (id?: string) => (id && (VOICE_ENGINES as Record<string, { label: string }>)[id]?.label) || id || '—';
const KIND: Record<Character['kind'], string> = { ACTOR: 'Actor', SINGER: 'Singer', ACTOR_SINGER: 'Actor + Singer' };
const STATUS: Record<VoiceLanguageProfile['status'], { tone: Tone; words: string }> = {
  PRIMARY: { tone: 'info', words: 'Its own language' },
  REVIEW: { tone: 'warn', words: 'Waiting for your listening' },
  LISTENER_APPROVED: { tone: 'ok', words: 'You approved it' },
  LISTENER_REJECTED: { tone: 'bad', words: 'You rejected it' },
};
type Check = { status?: string; cer?: number; coverage?: number; heard?: string; asr?: string };

export function PerformerVoice({ c, detail = false }: { c: Character; detail?: boolean }) {
  const { state } = useStudio();
  const asset = (id?: string): Asset | undefined => (id ? state.assets.find((a) => a.id === id) : undefined);
  const id = c.voice.identity;
  const figure = asset(primaryImageOf(c));
  const languages = spokenLanguages(c);
  const profileOf = (l: SpokenLanguage) => id?.languageProfiles?.find((p) => sameLanguage(p, l));
  const linesOf = (l: SpokenLanguage) => c.voice.samples.filter((s) => s.source === 'GENERATED' && s.assetId && s.language === l.language && (l.language !== 'AR' || (s.dialect ?? c.dialect) === l.dialect || (!s.dialect && sameLanguage(l, c))));
  return (
    <article className="paper card-pad" style={{ display: 'grid', gap: 16 }} aria-labelledby={`pv-${c.id}`}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {figure && !figure.unavailable
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={figure.thumb?.src ?? figure.src} alt={`${c.name}, canonical image`} style={{ width: detail ? 180 : 96, aspectRatio: '928 / 1664', objectFit: 'cover', borderRadius: 8, background: 'var(--surface-2)' }} />
          : <div className="well" style={{ width: detail ? 180 : 96, aspectRatio: '928 / 1664', display: 'grid', placeItems: 'center' }}><span className="t-meta">No image yet</span></div>}
        <div style={{ display: 'grid', gap: 6, minWidth: 0, flex: 1 }}>
          <h3 id={`pv-${c.id}`} className="t-title" style={{ margin: 0 }}><Link href={`/characters/${c.id}`}>{c.name}</Link></h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge>{c.style.charAt(0) + c.style.slice(1).toLowerCase()}</Badge>
            <Badge tone="accent">{KIND[c.kind]}</Badge>
            {languages.map((l) => <Badge key={`${l.language}${l.dialect ?? ''}`} tone="teal">{languageLabel(l)}</Badge>)}
          </div>
          {id ? (
            <dl className="t-meta" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 12px', margin: 0 }}>
              <dt>Voice</dt><dd style={{ margin: 0 }}>{id.origin === 'DESIGNED' ? DESIGN_LABEL : id.origin === 'UPLOAD_CONSENTED' ? 'Cloned from a consented recording' : id.origin === 'HOSTED' ? 'Hosted voice' : 'Legacy voice'} · revision {id.revision}</dd>
              <dt>Reference</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{id.designId ? `design ${id.designId}` : id.referenceSampleId ?? '—'}{id.seedSha256 ? ` · sha256 ${id.seedSha256.slice(0, 16)}…` : ''}</dd>
              <dt>Speaks with</dt><dd style={{ margin: 0 }}>{(id.languageProfiles ?? [{ language: id.language, dialect: id.dialect, engine: id.model, status: 'PRIMARY' as const }]).map((p) => `${languageLabel(p)}: ${engineLabel(p.engine)}${p.comparisonEngines?.length ? ` (compared once with ${p.comparisonEngines.map(engineLabel).join(', ')})` : ''}`).join(' · ')}</dd>
              {id.engineVersion && <><dt>Checkpoint</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{id.engineVersion}</dd></>}
            </dl>
          ) : <p className="t-meta">No voice yet.</p>}
        </div>
      </header>
      {id && languages.map((l) => {
        const p = profileOf(l);
        const st = p ? STATUS[p.status] : undefined;
        const lines = linesOf(l);
        return (
          <section key={`${l.language}${l.dialect ?? ''}`} style={{ display: 'grid', gap: 8 }} aria-label={`${c.name} in ${languageLabel(l)}`}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h4 className="t-label" style={{ margin: 0 }}>{languageLabel(l)}</h4>
              {st && <Badge tone={st.tone}>{st.words}</Badge>}
              {!p && <Badge tone="warn">No profile — build the voice again</Badge>}
            </div>
            {p?.notes?.length ? <ul className="t-meta" style={{ margin: 0 }}>{p.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
            {lines.length === 0 ? <p className="t-meta">No lines spoken yet.</p> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {lines.map((s) => <Line key={s.id} s={s} a={asset(s.assetId)} rtl={l.language === 'AR'} />)}
              </ul>
            )}
            {p && p.status !== 'PRIMARY' ? <Listen c={c} l={l} other /> : sameLanguage(l, { language: id.language, dialect: id.dialect }) ? <Listen c={c} l={l} /> : null}
          </section>
        );
      })}
    </article>
  );
}

function Line({ s, a, rtl }: { s: VoiceSample; a?: Asset; rtl: boolean }) {
  const check = (a?.provenance as { check?: Check | null } | undefined)?.check;
  const tone: Tone = check?.status === 'PASS' ? 'ok' : check?.status === 'FAIL' ? 'bad' : 'warn';
  return (
    <li className="well card-pad" style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge tone={s.role === 'COMPARISON' ? 'gold' : 'neutral'}>{engineLabel(s.engine)}{s.role === 'COMPARISON' ? ' · comparison' : ''}</Badge>
        {s.label.startsWith('Proof') && <Badge>Proof line</Badge>}
        <span className="t-body" dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'ar' : 'en'} style={{ unicodeBidi: 'isolate' }}>{s.text}</span>
      </div>
      {a && !a.unavailable ? <audio controls preload="none" src={a.src} style={{ width: '100%' }} aria-label={`Listen: ${s.text ?? s.label}`} /> : <span className="t-meta">The recording is not available.</span>}
      {check ? (
        <div className="t-meta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <Badge tone={tone}>{check.status === 'PASS' ? 'Heard as written' : check.status === 'FAIL' ? 'Heard differently' : 'Check by ear'}</Badge>
          <span dir="auto" style={{ unicodeBidi: 'isolate' }}>Transcriber heard: “{check.heard}”</span>
          {check.cer !== undefined && <span>CER {(check.cer * 100).toFixed(0)} %</span>}
        </div>
      ) : <span className="t-meta">Not heard back by the transcriber.</span>}
    </li>
  );
}

/** The producer's listening record for one language: naturalness, and — for Arabic — whether the dialect is
 *  authentic; for another language of the voice, whether it is the same person as its own language. */
function Listen({ c, l, other = false }: { c: Character; l: SpokenLanguage; other?: boolean }) {
  const { act } = useStudio();
  const toast = useToast();
  const [natural, setNatural] = useState('');
  const [dialect, setDialect] = useState('');
  const [same, setSame] = useState('');
  const [note, setNote] = useState('');
  const base = `pl-${c.id}-${l.language}${l.dialect ?? ''}`;
  const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  const records = (c.voice.identity?.listening ?? []).filter((r) => (r.language ? sameLanguage({ language: r.language, dialect: r.dialect }, l) : !other));
  const last = records[records.length - 1];
  const save = () => {
    try {
      act('recordVoiceListening', c.id, { natural: Number(natural), ...(l.language === 'AR' && dialect ? { dialectAuthentic: dialect === 'yes' } : {}), ...(other && same ? { samePerson: same === 'yes' } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(other ? { language: l.language, ...(l.dialect ? { dialect: l.dialect } : {}) } : {}) });
      setNatural(''); setDialect(''); setSame(''); setNote('');
      toast.ok(`Your listening of ${c.name} in ${languageLabel(l)} is saved.`);
    } catch (e) { toast.bad((e as Error).message); }
  };
  return (
    <details className="t-meta">
      <summary>{last ? `You listened ${records.length} ${records.length === 1 ? 'time' : 'times'} — naturalness ${last.natural}/5${last.dialectAuthentic !== undefined ? `, dialect ${last.dialectAuthentic ? 'authentic' : 'not authentic'}` : ''}${last.samePerson !== undefined ? `, ${last.samePerson ? 'same person' : 'not the same person'}` : ''}` : 'Record your listening'}</summary>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
        <Field label="Natural (1–5)" htmlFor={`${base}-n`}><Select id={`${base}-n`} value={natural} onChange={(e) => setNatural(e.target.value)} placeholder="Choose" options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))} /></Field>
        {l.language === 'AR' && <Field label="Authentic dialect?" htmlFor={`${base}-d`}><Select id={`${base}-d`} value={dialect} onChange={(e) => setDialect(e.target.value)} placeholder="Choose" options={yesNo} /></Field>}
        {other && <Field label={`Same person as in ${languageLabel({ language: c.voice.identity!.language, dialect: c.voice.identity!.dialect })}?`} htmlFor={`${base}-s`}><Select id={`${base}-s`} value={same} onChange={(e) => setSame(e.target.value)} placeholder="Choose" options={yesNo} /></Field>}
        <Field label="Note" htmlFor={`${base}-note`} optional><Textarea id={`${base}-note`} rows={1} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button size="sm" variant="primary" disabled={!natural} onClick={save}>Save listening</Button>
      </div>
    </details>
  );
}
