'use client';

import { useState, type ReactNode } from 'react';
import type { Asset } from '@/domain/types';
import { DIALECTS, PACES, PERFORMER_KINDS, PITCHES, SEXES, STYLES, VOICE_TYPES, sings, type Dialect, type Language, type PerformerKind, type Sex, type VoiceType } from '@/domain/vocabulary';
import { api, type ImageReferenceValidation } from '@/studio/api';
import { useStudio } from '@/studio/store';
import { isStudioError } from '@/domain/errors';
import { Button, Dropzone, Field, Input, Segmented, Select, SettingsSummary, ShapedDropzone, Textarea } from '@/components/ui/kit';
import { IconAuto, IconGenerate, IconVoice, IconWand } from '@/components/ui/icons';
import { Frame } from '@/components/media/Frame';
import { dialectLabel, fmtBytes, fmtSeconds } from '@/lib/format';
import { AGE_BANDS, sheetAge, type AgeBand, type SheetValues } from '../sheetModel';
import { BAND_WORD, PACE_WORD, PITCH_WORD, STYLE_WORD } from '../EditDialogs';
import { nameLang } from '../parts';
import { AUDIO_RULES, BRIEF_MAX, checkAudioDuration, checkAudioFile, checkBrief, checkImageDims, checkImageFile, measureAudio, measureImage, refusalReasons, type DescribeVoiceMode, type ImageRefusal } from './preflight';

/** THE THREE WAYS IN (docs/DESIGN-SYSTEM-V5.md §8.8 "Auto / Manual creation"; v5.1 forms) — each the one essential
 *  input first, sensible defaults, the rest disclosed on demand, validation said next to the field, and the footer's
 *  reason when the primary cannot run. They hand their values to CreateCharacter, which submits through the existing
 *  CREATE_CHARACTER job. No model internals.
 *
 *    AutoStart     one line about them (or a name) → the studio drafts the sheet, the figure and, with a recording,
 *                  the voice
 *    ManualStart   a minimal brief: name, role, style, language; the look, personality and voice on demand
 *    PictureStart  a reference picture (checked in the browser, then by the server), what to keep, what changes */

/** What the character speaks (the producer's creation options, 2026-10-09): English, Arabic (Iraqi by default), or
 *  BOTH — one voice identity either way; for BOTH it carries an English and an Arabic profile of the same voice. */
export type Speaks = 'EN' | 'AR' | 'BOTH';
/** Who they are cast as (master plan §3): what they perform, and — for a singer — the singing range and styles.
 *  `language` is the primary (English for BOTH); `speaks` says whether Arabic is spoken too. */
export interface HeaderValues { forId: string; style: (typeof STYLES)[number]; language: Language; dialect: Dialect; speaks?: Speaks; kind: PerformerKind; voiceType?: VoiceType; singingStyles?: string }

export const KIND_WORD: Record<PerformerKind, string> = { ACTOR: 'Actor', SINGER: 'Singer', ACTOR_SINGER: 'Actor + Singer' };
export const VOICE_TYPE_WORD: Record<VoiceType, string> = { SOPRANO: 'Soprano', MEZZO_SOPRANO: 'Mezzo-soprano', ALTO: 'Alto', TENOR: 'Tenor', BARITONE: 'Baritone', BASS: 'Bass' };

export const speaksOf = (h: Pick<HeaderValues, 'language' | 'speaks'>): Speaks => h.speaks ?? h.language;
/** Every language the character speaks, the primary first — what CREATE_CHARACTER's `languages` carries. */
export function spokenLanguagesOf(h: Pick<HeaderValues, 'language' | 'dialect' | 'speaks'>): Array<{ language: Language; dialect?: Dialect }> {
  const s = speaksOf(h);
  if (s === 'EN') return [{ language: 'EN' }];
  if (s === 'AR') return [{ language: 'AR', dialect: h.dialect }];
  return [{ language: 'EN' }, { language: 'AR', dialect: h.dialect }];
}
export const arabicWord = (dialect: Dialect) => (dialect === 'IRAQI_BAGHDADI' ? 'Iraqi Arabic' : `Arabic (${dialectLabel(dialect)})`);
/** "English", "Iraqi Arabic" or "English + Iraqi Arabic". */
export const speaksWord = (h: Pick<HeaderValues, 'language' | 'dialect' | 'speaks'>) => spokenLanguagesOf(h).map((l) => (l.language === 'EN' ? 'English' : arabicWord(l.dialect ?? h.dialect))).join(' + ');

/** The performer fields of the profile a creation submits: the kind always; a singing profile for a kind that sings
 *  (its styles from the comma-separated line, the languages from the spoken ones — the reducer keeps them in step). */
export function performerProfile(h: HeaderValues): { kind: PerformerKind; singing?: { voiceType?: VoiceType; styles: string[]; languages: Language[] } } {
  if (!sings(h.kind)) return { kind: h.kind };
  const styles = (h.singingStyles ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6).map((s) => s.slice(0, 40));
  return { kind: h.kind, singing: { ...(h.voiceType ? { voiceType: h.voiceType } : {}), styles, languages: spokenLanguagesOf(h).map((l) => l.language) } };
}
/** Nothing is preselected: sex, age band and species stay unset ("Studio decides") until the producer chooses. */
export interface DescribeValues { name: string; brief: string; sex?: Sex; band?: AgeBand; ageYears?: number; species?: string; voiceMode: DescribeVoiceMode }
/** The recording chosen in the form (a File cannot be remembered across a reload; the choice can). */
export interface DescribeRecording { file: File; seconds: number | null }
export interface PictureValues { asset?: Asset; validation?: ImageReferenceValidation; measured?: { width: number; height: number; bytes: number; name: string }; name: string; role: string; keep: 'FACE' | 'FACE_HAIR_WARDROBE'; note: string; sex?: Sex; band?: AgeBand; hair?: string; wardrobe?: string }

const sexOptions = [{ value: 'ANY', label: 'Studio decides' }, ...SEXES.map((x) => ({ value: x as string, label: x === 'FEMALE' ? 'Woman' : 'Man' }))];
const bandOptions = [{ value: 'ANY', label: 'Studio decides' }, ...AGE_BANDS.map((b) => ({ value: b as string, label: BAND_WORD[b] }))];

/** The footer of a form: the reason the primary cannot run (or a short estimate) at the start, the actions at the end. */
function Foot({ note, warn, onCancel, primary, secondary }: { note?: ReactNode; warn?: boolean; onCancel: () => void; primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="creation-foot">
      <span className="t-meta" role={warn ? 'status' : undefined} data-warn={warn || undefined}>{note}</span>
      <span className="char-form-acts"><Button variant="quiet" onClick={onCancel}>Cancel</Button>{secondary}{primary}</span>
    </div>
  );
}

/** For whom, the style and the language, said as one line; "Change" opens the controls in place. */
export function Settings({ value, onChange }: { value: HeaderValues; onChange: (v: HeaderValues) => void }) {
  const { state } = useStudio();
  const set = (p: Partial<HeaderValues>) => onChange({ ...value, ...p });
  const homes = [...state.shows.map((s) => ({ value: `show:${s.id}`, label: s.title })), ...state.productions.filter((p) => !p.showId).map((p) => ({ value: `p:${p.id}`, label: p.title }))];
  const home = homes.find((h) => h.value === value.forId);
  return (
    <SettingsSummary items={[home ? `For ${home.label}` : 'For the library', KIND_WORD[value.kind], STYLE_WORD[value.style], speaksWord(value)]}>
      <div className="char-form char-voice">
        <Field label="Who it is for" optional><Select value={value.forId} onChange={(e) => set({ forId: e.target.value })} placeholder="The library (no show yet)" options={homes} /></Field>
        <StyleLanguage value={value} onChange={onChange} />
      </div>
    </SettingsSummary>
  );
}

function StyleLanguage({ value, onChange }: { value: HeaderValues; onChange: (v: HeaderValues) => void }) {
  const set = (p: Partial<HeaderValues>) => onChange({ ...value, ...p });
  return (
    <>
    <div className="pc-choices">
      <div><p className="label">Performs</p><Segmented label="Performs" value={value.kind} onChange={(v) => set({ kind: v })} options={PERFORMER_KINDS.map((k) => ({ value: k, label: KIND_WORD[k] }))} /></div>
      <div><p className="label">Style</p><Segmented label="Style" value={value.style} onChange={(v) => set({ style: v })} options={STYLES.map((s) => ({ value: s, label: STYLE_WORD[s] }))} /></div>
      {/* one voice identity either way; BOTH gives it an English and an Arabic profile of the same voice */}
      <div><p className="label">Language</p><Segmented label="Language" value={speaksOf(value)} onChange={(v: Speaks) => set({ speaks: v, language: v === 'AR' ? 'AR' : 'EN' })} options={[{ value: 'EN' as Speaks, label: 'English' }, { value: 'AR' as Speaks, label: arabicWord(value.dialect) }, { value: 'BOTH' as Speaks, label: 'Both' }]} /></div>
      {speaksOf(value) !== 'EN' && <Field label="Dialect"><Select value={value.dialect} onChange={(e) => set({ dialect: e.target.value as Dialect })} options={DIALECTS.map((d) => ({ value: d, label: dialectLabel(d) }))} /></Field>}
    </div>
    {/* a singer's own facts, on their own row (they belong to the singing voice, not to the look) */}
    {sings(value.kind) && (
      <div className="pc-choices">
        <Field label="Singing voice" optional help="The range they sing in; the song engine is matched to it."><Select aria-label="Singing voice" value={value.voiceType ?? ''} onChange={(e) => set({ voiceType: (e.target.value || undefined) as VoiceType | undefined })} placeholder="Studio decides" options={VOICE_TYPES.map((t) => ({ value: t, label: VOICE_TYPE_WORD[t] }))} /></Field>
        <Field label="Singing styles" optional help="A few words, separated by commas: ballad, folk, pop."><Input value={value.singingStyles ?? ''} onChange={(e) => set({ singingStyles: e.target.value })} maxLength={200} autoComplete="off" /></Field>
      </div>
    )}
    </>
  );
}

// ------------------------------------------------------------------------------------------------------- Auto

export function AutoStart({ value, onChange, recording, onRecording, onSubmit, busy, disabledReason, onCancel, header, onHeader }: { value: DescribeValues; onChange: (v: DescribeValues) => void; recording: DescribeRecording | null; onRecording: (r: DescribeRecording | null) => void; onSubmit: () => void; busy?: boolean; disabledReason?: string | null; onCancel: () => void; header: HeaderValues; onHeader: (v: HeaderValues) => void }) {
  const [touched, setTouched] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const set = (p: Partial<DescribeValues>) => onChange({ ...value, ...p });
  const brief = checkBrief(value.brief, value.name);
  const briefError = !brief.ok && touched ? (brief.reason === 'LONG' ? `Shorter, please: ${BRIEF_MAX.toLocaleString('en')} characters at most.` : 'Write a line about them, or at least a name.') : null;
  const needsRecording = value.voiceMode === 'RECORDING' && !recording;
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTouched(true); if (!brief.ok || disabledReason || needsRecording) return; onSubmit(); };
  const chooseRecording = async (file: File) => {
    setAudioError(null);
    if (checkAudioFile(file)) { setAudioError('Choose an audio file.'); onRecording(null); return; }
    const seconds = await measureAudio(file);
    if (seconds !== null && checkAudioDuration(seconds) === 'TOO_SHORT') { setAudioError('Too short: at least 3 seconds of speech.'); onRecording(null); return; }
    onRecording({ file, seconds });
  };
  return (
    <form className="char-form" onSubmit={submit} aria-busy={busy || undefined} noValidate>
      <Field label="Who are they?" hint={`${value.brief.length} / ${BRIEF_MAX}`} help={briefError ? undefined : 'One line is enough: role, age, where they come from, how they carry themselves.'} error={briefError}>
        <Textarea className="input-lg" value={value.brief} onChange={(e) => set({ brief: e.target.value })} rows={3} maxLength={BRIEF_MAX + 50} placeholder="A café owner in her sixties who notices everything and says little" autoFocus />
      </Field>
      <Field label="Name" optional help="Leave it empty and the studio names them."><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoComplete="off" /></Field>
      <Settings value={header} onChange={onHeader} />
      {/* ONE voice identity per character (the producer's options, 2026-10-09): an original fictional voice by default */}
      <div>
        <p className="label">Voice</p>
        <Segmented label="Voice" value={value.voiceMode} onChange={(v) => set({ voiceMode: v })} options={[{ value: 'ORIGINAL' as DescribeVoiceMode, label: 'Create an original fictional voice' }, { value: 'RECORDING' as DescribeVoiceMode, label: 'Clone an approved reference recording' }, { value: 'NONE' as DescribeVoiceMode, label: 'Later' }]} />
        <p className="help">{value.voiceMode === 'ORIGINAL' ? `One voice identity, designed by the studio — a synthetic voice, nobody cloned — speaking ${speaksWord(header)}.` : value.voiceMode === 'RECORDING' ? '3 to 30 seconds of a voice you have permission to use, in the character’s language. It is checked as soon as the character exists, and the one voice identity is cloned from it.' : 'No voice yet; make it later on the profile.'}</p>
        {value.voiceMode === 'RECORDING' && (
          <div className="char-voice">
            <Dropzone label={recording ? recording.file.name : 'Upload a recording'} hint={`${AUDIO_RULES.minSeconds} to ${AUDIO_RULES.maxSeconds} seconds · checked once the character exists`} accept="audio/*" icon={<IconVoice />} onFile={(f) => void chooseRecording(f)} error={audioError ?? (touched && needsRecording ? 'Choose a recording, or create an original voice.' : null)} row />
            {recording && !audioError && <p className="help" role="status">{recording.seconds === null ? 'The length could not be read here; the studio measures it.' : `${fmtSeconds(Math.round(recording.seconds * 10) / 10)} · ${checkAudioDuration(recording.seconds) === 'OK' ? 'length fine' : 'over 30 seconds; a window is used'}`}</p>}
          </div>
        )}
      </div>
      <details className="details creation-more" open={Boolean(value.sex || value.band || value.species) || undefined}>
        <summary>More control</summary>
        <div className="char-form char-voice">
          <div className="pc-choices">
            <div><p className="label">Sex</p><Segmented label="Sex" value={value.sex ?? 'ANY'} onChange={(v) => set({ sex: v === 'ANY' ? undefined : (v as Sex) })} options={sexOptions} /></div>
            <div><p className="label">Age</p><Segmented label="Age" value={value.band ?? 'ANY'} onChange={(v) => set({ band: v === 'ANY' ? undefined : (v as AgeBand), ageYears: undefined })} options={bandOptions} /></div>
          </div>
          <Field label="Species" optional help="Leave it empty for a person."><Input value={value.species ?? ''} onChange={(e) => set({ species: e.target.value || undefined })} /></Field>
        </div>
      </details>
      <Foot note={disabledReason ?? (value.voiceMode === 'NONE' ? 'About a minute: the sheet, then the figure.' : 'A few minutes: the sheet, the figure, then the voice.')} warn={Boolean(disabledReason)} onCancel={onCancel}
        primary={<Button type="submit" variant="primary" icon={<IconAuto />} loading={busy} disabled={Boolean(disabledReason)} aria-describedby={disabledReason ? undefined : undefined}>Draft the character</Button>} />
    </form>
  );
}

// ------------------------------------------------------------------------------------------------------- Manual

export function ManualStart({ value, onChange, onCreate, busy, drawDisabledReason, onCancel, header, onHeader }: { value: SheetValues; onChange: (v: SheetValues) => void; onCreate: (draw: boolean) => void; busy?: boolean; drawDisabledReason?: string | null; onCancel: () => void; header: HeaderValues; onHeader: (v: HeaderValues) => void }) {
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<SheetValues>) => onChange({ ...value, ...p });
  const nameError = touched && !value.name.trim() ? 'Give them a name.' : null;
  const create = (draw: boolean) => { setTouched(true); if (!value.name.trim()) { document.getElementById('manual-name')?.focus(); return; } if (draw && drawDisabledReason) return; onCreate(draw); };
  const open = Boolean(value.personality || value.look || value.sex || value.band || value.pitch || value.pace || value.timbre || value.nameAr);
  return (
    <form className="char-form" onSubmit={(e) => { e.preventDefault(); create(true); }} aria-busy={busy || undefined} noValidate>
      <div className="pc-pair">
        <Field label="Name" error={nameError}><Input id="manual-name" value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoComplete="off" autoFocus /></Field>
        <Field label="Role" optional hint={`${value.role.length} / 200`}><Input value={value.role} onChange={(e) => set({ role: e.target.value })} maxLength={200} placeholder="Café owner, sixty, unhurried" /></Field>
      </div>
      <StyleLanguage value={header} onChange={onHeader} />
      <details className="details creation-more" open={open || undefined}>
        <summary>More details</summary>
        <div className="char-form char-voice">
          <p className="help">Every field is optional: what you leave empty, the studio decides, and you can change it later.</p>
          {header.language === 'AR' && <Field label="Arabic name" optional help="Used by the Arabic voice."><Input value={value.nameAr} dir="rtl" lang="ar" onChange={(e) => set({ nameAr: e.target.value })} maxLength={80} /></Field>}
          <div className="pc-choices">
            <div><p className="label">Sex</p><Segmented label="Sex" value={value.sex ?? 'ANY'} onChange={(v) => set({ sex: v === 'ANY' ? undefined : (v as Sex) })} options={sexOptions} /></div>
            <div><p className="label">Age</p><Segmented label="Age" value={value.band ?? 'ANY'} onChange={(v) => set({ band: v === 'ANY' ? undefined : (v as AgeBand), exactAge: undefined })} options={bandOptions} /></div>
          </div>
          <Field label="Personality" optional help="How they think and speak."><Textarea value={value.personality} onChange={(e) => set({ personality: e.target.value })} rows={2} maxLength={400} /></Field>
          <Field label="How they look" optional help="Build, face, hair, clothes, anything that marks them."><Textarea value={value.look} onChange={(e) => set({ look: e.target.value })} rows={3} maxLength={2000} /></Field>
          <div className="pc-choices">
            <div><p className="label">Voice pitch</p><Segmented label="Voice pitch" value={value.pitch ?? 'ANY'} onChange={(v) => set({ pitch: v === 'ANY' ? undefined : (v as SheetValues['pitch']) })} options={[{ value: 'ANY', label: 'Studio decides' }, ...PITCHES.map((x) => ({ value: x as string, label: PITCH_WORD[x] }))]} /></div>
            <div><p className="label">Pace</p><Segmented label="Pace" value={value.pace ?? 'ANY'} onChange={(v) => set({ pace: v === 'ANY' ? undefined : (v as SheetValues['pace']) })} options={[{ value: 'ANY', label: 'Studio decides' }, ...PACES.map((x) => ({ value: x as string, label: PACE_WORD[x] }))]} /></div>
          </div>
          <Field label="Timbre" optional><Input value={value.timbre} onChange={(e) => set({ timbre: e.target.value })} placeholder="Gravelly, warm" maxLength={200} /></Field>
        </div>
      </details>
      <Foot note={drawDisabledReason ?? 'Drawing the figure takes about a minute.'} warn={Boolean(drawDisabledReason)} onCancel={onCancel}
        secondary={<Button variant="secondary" loading={busy} onClick={() => create(false)}>Create without drawing</Button>}
        primary={<Button type="submit" variant="primary" icon={<IconGenerate />} loading={busy} disabled={Boolean(drawDisabledReason)}>Create and draw</Button>} />
    </form>
  );
}

// ------------------------------------------------------------------------------------------------------- Picture

export function PictureStart({ value, onChange, onSubmit, busy, disabledReason, onCancel, header, onHeader }: { value: PictureValues; onChange: (v: PictureValues) => void; onSubmit: () => void; busy?: boolean; disabledReason?: string | null; onCancel: () => void; header: HeaderValues; onHeader: (v: HeaderValues) => void }) {
  const { refresh } = useStudio();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<PictureValues>) => onChange({ ...value, ...p });
  const refusalText = (r: ImageRefusal, detail: string) => r === 'TYPE' ? `Not a usable picture: PNG, JPEG or WebP only (${detail}).` : r === 'SIZE' ? `Too large: 20 MB at most (${detail}).` : `Too small: the shortest side must be at least 512 px (${detail}).`;
  const choose = async (file: File) => {
    setError(null);
    const typeOrSize = checkImageFile(file);
    if (typeOrSize) { setError(refusalText(typeOrSize, typeOrSize === 'TYPE' ? (file.type || file.name.split('.').pop() || 'unknown') : fmtBytes(file.size))); return; }
    let dims: { width: number; height: number };
    try { dims = await measureImage(file); } catch { setError(refusalText('TYPE', file.name)); return; }
    const side = checkImageDims(dims.width, dims.height);
    if (side) { setError(refusalText(side, `${dims.width} × ${dims.height}`)); return; }
    setUploading(true);
    try {
      const r = await api.uploadReference(file, { label: `${value.name.trim() || 'New character'} — reference upload`, tags: ['character', 'reference upload'] });
      await refresh();
      set({ asset: r.asset, validation: r.validation, measured: { ...dims, bytes: file.size, name: file.name } });
    } catch (e) { setError(isStudioError(e) ? e.message : (e as Error).message); }
    finally { setUploading(false); }
  };
  const serverRefused = value.validation && !value.validation.ok;
  const missing = touched && !value.asset ? 'Add a reference picture first.' : null;
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTouched(true); if (!value.asset || serverRefused || disabledReason) return; onSubmit(); };
  const v = value.validation;
  return (
    <form className="char-form" onSubmit={submit} aria-busy={busy || uploading || undefined} noValidate>
      <div className="pc-drop">
        <div>
          <ShapedDropzone ratio="928/1664" label="Drop a picture" hint="PNG, JPEG or WebP · 512 px or more" accept="image/png,image/jpeg,image/webp" onFile={(f) => void choose(f)} busy={uploading}
            file={value.asset ? { name: value.measured?.name ?? value.asset.label ?? 'Reference', src: value.asset.src, meta: value.measured ? `${value.measured.width} × ${value.measured.height}` : undefined } : null}
            onRemove={() => set({ asset: undefined, validation: undefined, measured: undefined })} error={error ?? missing} />
          {v && (v.ok
            ? <p className="help pc-drop-checked" role="status">Checked by the studio{typeof v.faces === 'number' ? ` · ${v.faces === 1 ? 'one face' : `${v.faces} faces`}` : ' · size and sharpness (the face is not checked)'}</p>
            : <p className="help pc-drop-checked" role="alert" data-bad>The studio cannot use this picture: {refusalReasons(v.reasons).join(' · ')}</p>)}
        </div>
        <div className="char-form">
          <div className="pc-pair">
            <Field label="Name" optional><Input value={value.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} autoComplete="off" /></Field>
            <Field label="Role" optional><Input value={value.role} onChange={(e) => set({ role: e.target.value })} maxLength={200} placeholder="Café owner, sixty, unhurried" /></Field>
          </div>
          <div>
            <p className="label">Keep from the picture</p>
            <Segmented label="Keep from the picture" value={value.keep} onChange={(k) => set({ keep: k })} options={[{ value: 'FACE' as const, label: 'The face only' }, { value: 'FACE_HAIR_WARDROBE' as const, label: 'Face, hair and clothes' }]} />
            <p className="help">Fine marks, logos and the background are never kept.</p>
          </div>
          <Field label="What should change?" optional help="For example: grey work trousers and black boots; a shorter beard. The figure is drawn on a plain background."><Textarea value={value.note} onChange={(e) => set({ note: e.target.value })} rows={2} maxLength={600} /></Field>
          <Settings value={header} onChange={onHeader} />
        </div>
      </div>
      <details className="details creation-more">
        <summary>More control</summary>
        <div className="char-form char-voice">
          <div className="pc-choices">
            <div><p className="label">Sex</p><Segmented label="Sex" value={value.sex ?? 'ANY'} onChange={(x) => set({ sex: x === 'ANY' ? undefined : (x as Sex) })} options={sexOptions} /></div>
            <div><p className="label">Age</p><Segmented label="Age" value={value.band ?? 'ANY'} onChange={(x) => set({ band: x === 'ANY' ? undefined : (x as AgeBand) })} options={bandOptions} /></div>
          </div>
          {value.keep === 'FACE' && (
            <div className="pc-pair">
              <Field label="New hair" optional><Input value={value.hair ?? ''} onChange={(e) => set({ hair: e.target.value })} maxLength={200} placeholder="As in the picture" /></Field>
              <Field label="New clothes" optional><Input value={value.wardrobe ?? ''} onChange={(e) => set({ wardrobe: e.target.value })} maxLength={300} placeholder="As in the picture" /></Field>
            </div>
          )}
        </div>
      </details>
      <Foot note={disabledReason ?? (!value.asset ? 'Add the picture first.' : 'About a minute: the sheet, then the figure.')} warn={Boolean(disabledReason)} onCancel={onCancel}
        primary={<Button type="submit" variant="primary" icon={<IconWand />} loading={busy} disabled={Boolean(disabledReason) || Boolean(serverRefused) || uploading}>Draw from the picture</Button>} />
    </form>
  );
}

// ------------------------------------------------------------------------------------------------------- the preview

/** The figure the studio will draw, in its own shape (928:1664) set in type until it exists: the name as written
 *  (or "Unnamed"), then the slate of what was chosen. Nothing is invented. */
export function FigurePreview({ name, role, header, sex, band, ageYears }: { name: string; role?: string; header: HeaderValues; sex?: Sex; band?: AgeBand; ageYears?: number }) {
  const n = name.trim();
  const age = sheetAge({ band, exactAge: ageYears });
  const slate = [KIND_WORD[header.kind], STYLE_WORD[header.style], speaksWord(header), sex ? (sex === 'FEMALE' ? 'Woman' : 'Man') : null, age ? `${age}` : null].filter(Boolean).join(' · ');
  return (
    <div className="pc-preview">
      <Frame ratio="928/1664" alt="" title={n || 'Unnamed'} titleLang={nameLang(n)} titleState="notDrawn" className="pc-preview-frame" decorative />
      <div className="pc-preview-words">
        {role?.trim() && <span className="t-body pc-preview-note" dir="auto">{role.trim()}</span>}
        <span className="t-meta">{slate}</span>
      </div>
      <p className="t-meta pc-preview-note">The figure is drawn here, then waits for your approval.</p>
    </div>
  );
}
