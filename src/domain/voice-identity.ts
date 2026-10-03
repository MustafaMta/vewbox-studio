import type { Asset, Character, DialectStatus, Settings, StudioState, VoiceDesignCandidate, VoiceDesignMeasure, VoiceIdentity, VoiceListeningRecord, VoiceSample } from './types';
import type { Dialect, Language } from './vocabulary';
import { isCloneSource, voiceLock } from './rules';

/** VOICE IDENTITY V2 — the pure rules of docs/CONTRACTS-VOICE-IDENTITY-V2.md (origins and consent, the automatic
 *  plan, the design description and its refusal, the candidate gates and ranking, Rule V-DESIGN at the clone boundary,
 *  listening records). Shared by the reducers (src/domain/actions.ts), the enqueue preflight and the voice handlers;
 *  no I/O here — the worker hashes the file and hands the hash in. */

export const DESIGN_LABEL = 'Studio-designed synthetic voice — not a real person';
/** The refusal for an Iraqi automatic voice without an Iraqi recording (contract §2, word for word). */
export const IRAQI_NEEDS_RECORDING = 'Iraqi voices are cloned from a real Iraqi recording — record or upload 5–12 seconds of the voice.';
export const MSA_ACCENT_PENDING = 'Arabic accent not yet listener-verified';
export const IRAQI_DIALECT_PENDING = 'Iraqi dialect not yet verified by a native listener';
export const NATURALNESS_PENDING = 'naturalness not yet judged by a listener';
export const CONSENT_STATEMENTS = ['MY_VOICE', 'SPEAKER_PERMISSION'] as const;
export type ConsentStatement = (typeof CONSENT_STATEMENTS)[number];

/** The candidate gates (contract §2). Loudness and true peak are the upload gates of src/server/media/voice-check.ts
 *  (REFERENCE_RULES: −30…−10 LUFS, a true peak above 0 dBTP is clipping; a test holds them equal); a designed seed is
 *  a clone reference only if the line engine hears all of it, so ≤ 11.5 s (Habibi clips references over 12 s). */
export const DESIGN_GATES = { cer: { EN: 0.1, AR: 0.15 } as Record<Language, number>, maxSeconds: 11.5, lufs: { min: -30, max: -10 }, maxTruePeakDbtp: 0, maxClippedSamples: 0 } as const;
/** How many candidates a design makes (the service's maximum). */
export const DESIGN_CANDIDATES = 3;

/** The calibration sentence every candidate speaks, per language: short enough to stay under 11.5 s (measured: the
 *  English one 6.6–9.6 s; the Arabic one of the first evaluation ran 10–15 s, so this one is shorter). */
export const CALIBRATION_TEXT: Record<Language, string> = {
  EN: 'The harbour lights came on one by one as the evening ferry pulled away from the quay. Nobody said a word. Will you still be here when it comes back?',
  AR: 'أضاءت أنوار الميناء واحدًا تلو الآخر، ولم ينطق أحد بكلمة. هل ستبقى هنا حين تعود؟',
};

/** What a candidate is heard saying THROUGH THE LINE ENGINE (the clone hop the film will use): two preview sentences
 *  for English and MSA (ranked by ECAPA); for the Iraqi experiment the four probe lines of the Iraqi A/B
 *  (docs/evidence/voice-design/iraqi-ab/REPORT.md: screening on these, by letter coverage then CER, was the only thing
 *  that measurably separated designed seeds — the seed's wording and description did not). */
export const PREVIEW_SENTENCES = {
  EN: ['I told you the ferry would be late again, so we wait by the lights until it comes.', 'Where were you last night? Nobody could find you anywhere.'],
  MSA: ['قلت لك إن العبّارة ستتأخر مرة أخرى، فلننتظر قرب الأضواء حتى تصل.', 'أين كنت ليلة أمس؟ لم يستطع أحد أن يجدك.'],
  IRAQI: ['شكو ماكو؟ هسه وصلت من الشغل.', 'گلتلك ماكو وقت، لازم نطلع هسه.', 'الچاي حار هواية، انطيني شوية مي بارد.', 'باچر الصبح نگعد وياكم بالگهوة.'],
} as const;

/** How a design's candidates are ranked: EN/MSA by speaker similarity through the line engine (contract §2); the Iraqi
 *  experiment by the probe lines' letter coverage, then CER (the Iraqi A/B's measured recipe). */
export type DesignRanking = 'SIMILARITY' | 'PROBE_LETTERS';
export const rankingFor = (c: { language: Language; dialect?: Dialect }): DesignRanking => (isIraqi(c) ? 'PROBE_LETTERS' : 'SIMILARITY');

export const isIraqi = (c: { language: Language; dialect?: Dialect }) => c.language === 'AR' && c.dialect === 'IRAQI_BAGHDADI';

/** The experiment switch (Settings → `voice.allowDesignedIraqi`, default off). */
export const designedIraqiOn = (settings: Pick<Settings, 'voice'> | undefined): boolean => settings?.voice?.allowDesignedIraqi === true;

export function previewSentencesFor(c: { language: Language; dialect?: Dialect }): readonly string[] {
  return c.language === 'EN' ? PREVIEW_SENTENCES.EN : isIraqi(c) ? PREVIEW_SENTENCES.IRAQI : PREVIEW_SENTENCES.MSA;
}

// ------------------------------------------------------------------------------------------- recordings, consent

/** A recording's file as a clone source: real audio in the library, not a bundled sample, not engine output. */
export const usableRecordingAsset = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'AUDIO' && !a.sample && !a.unavailable && a.origin !== 'GENERATED');

export const isConsentStatement = (x: unknown): x is ConsentStatement => typeof x === 'string' && (CONSENT_STATEMENTS as readonly string[]).includes(x);

/** An upload with the producer's consent statement: the only real-person recording a new build clones from. */
export const isConsentedUpload = (s: Pick<VoiceSample, 'source' | 'assetId' | 'consent'>) => isCloneSource(s) && isConsentStatement(s.consent?.statement);

/** A recording an Iraqi voice may be cloned from: Arabic (not heard or marked as English) and not marked as another
 *  dialect. Whether it is authentically Iraqi is a listener's call; this only keeps an English or an MSA-marked clip out. */
export const iraqiRecording = (s: Pick<VoiceSample, 'language' | 'dialect' | 'provenance'>) => s.language !== 'EN' && s.provenance?.validation?.speech.language !== 'EN' && (!s.dialect || s.dialect === 'IRAQI_BAGHDADI');

// ----------------------------------------------------------------------------------------- the automatic plan

export type AutomaticVoicePlan =
  | { kind: 'UPLOAD'; sampleId: string; label: string }
  | { kind: 'DESIGN'; experiment: boolean }
  | { kind: 'REFUSE'; code: 'MISSING_REFERENCE' | 'CONSENT_REQUIRED'; message: string; sampleId?: string };

/** AUTOMATIC (contract §2), one click and the creation flow's voice step. A consented recording of the character in
 *  its language is the voice (the producer gave it); an upload without a consent statement is never cloned silently
 *  (CONSENT_REQUIRED names it); otherwise English and MSA are DESIGNED from the profile, and an Iraqi voice is refused
 *  with the contract's sentence — unless the `allowDesignedIraqi` experiment is on. A voice locked by its chosen
 *  recording alone is held to that recording (finding 8). Pure. */
export function automaticVoicePlan(c: Character, assets: Asset[], settings?: Pick<Settings, 'voice'>): AutomaticVoicePlan {
  const iraqi = isIraqi(c);
  const byId = (id?: string) => (id ? assets.find((a) => a.id === id) : undefined);
  const fits = (s: VoiceSample) => isCloneSource(s) && usableRecordingAsset(byId(s.assetId)) && (!iraqi || iraqiRecording(s));
  const consentMessage = (s: VoiceSample) => `“${s.label}” was uploaded without a consent statement; confirm that it is your voice or that the speaker gave permission (confirmVoiceConsent), or remove it — a voice is cloned only from a consented recording`;
  if (voiceLock(c).locked && !c.voice.identity) {
    const chosen = c.voice.samples.find((s) => s.id === c.voice.selectedSampleId);
    if (!chosen || !fits(chosen)) return { kind: 'REFUSE', code: 'MISSING_REFERENCE', message: `${c.name} has spoken in a video with the chosen recording, and that recording cannot be cloned from (it is not an upload${iraqi ? ' in Arabic' : ''})` };
    if (!isConsentedUpload(chosen)) return { kind: 'REFUSE', code: 'CONSENT_REQUIRED', message: consentMessage(chosen), sampleId: chosen.id };
    return { kind: 'UPLOAD', sampleId: chosen.id, label: chosen.label };
  }
  const order = [c.voice.identity?.referenceSampleId, c.voice.selectedSampleId, ...c.voice.samples.map((s) => s.id)].filter((x, i, all): x is string => Boolean(x) && all.indexOf(x) === i);
  const recordings = order.map((id) => c.voice.samples.find((s) => s.id === id)).filter((s): s is VoiceSample => Boolean(s && fits(s)));
  const consented = recordings.find(isConsentedUpload);
  if (consented) return { kind: 'UPLOAD', sampleId: consented.id, label: consented.label };
  if (recordings.length) return { kind: 'REFUSE', code: 'CONSENT_REQUIRED', message: consentMessage(recordings[0]), sampleId: recordings[0].id };
  if (iraqi) return designedIraqiOn(settings) ? { kind: 'DESIGN', experiment: true } : { kind: 'REFUSE', code: 'MISSING_REFERENCE', message: IRAQI_NEEDS_RECORDING };
  return { kind: 'DESIGN', experiment: false };
}

// ------------------------------------------------------------------------------------------- the description

const ATTRIBUTE_MAX = 60;

/** Rule V-DESIGN §4, the service's deny-list mirrored (docker/tts-design/app.py IMPERSONATION): a description says
 *  what a voice is like, never whose voice it is. JS `\b` is ASCII-only, so the Arabic words are bounded by letters. */
const IMPERSONATION: RegExp[] = [
  /\bsound(?:s|ing)?\s+(?:just\s+|exactly\s+)?like\b/i,
  /\b(?:the\s+)?voice\s+of\b/i,
  /\bimitat\w*|\bimpersonat\w*|\bmimic\w*|\bclon(?:e|ed|ing)\b|\bdeepfake\w*/i,
  /\bin\s+the\s+style\s+of\b/i,
  /يشبه\s+صوت|مثل\s+صوت|صوت\s+مثل|(?<!\p{L})[وب]?تقليد(?!\p{L})|(?<!\p{L})[يت]?قلّ?د(?!\p{L})/u,
];

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Why a description is refused (before any GPU work), or null: empty, too long, a resemblance asked for, or the name
 *  of anyone in the studio's cast (a description describes attributes, not people). Real people's names have no list
 *  here; the service's deny-list and this check are what runs. */
export function descriptionProblem(description: string, names: readonly string[] = []): string | null {
  const d = description.replace(/\s+/g, ' ').trim();
  if (!d) return 'the description is empty; describe the voice: sex, age, pitch, pace, timbre, accent, mood, recording quality';
  if (d.length > 300) return `the description is ${d.length} characters long; at most 300`;
  for (const rx of IMPERSONATION) { const m = rx.exec(d); if (m) return `“${m[0]}” asks for a resemblance to someone; describe attributes only (sex, age, pitch, pace, timbre, accent, mood)`; }
  for (const raw of names) {
    const n = raw.trim();
    if (n.length < 3) continue;
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(n)}(?![\\p{L}\\p{N}])`, 'iu').test(d)) return `it names “${n}”; a description says what a voice is like, never whose voice it is`;
  }
  return null;
}

/** The names a description must not contain: every character's name and Arabic name. */
export const castNames = (s: Pick<StudioState, 'characters'>): string[] => s.characters.flatMap((c) => [c.name, c.nameAr ?? '']).filter(Boolean);

/** The profile's free-text timbre as description words: Latin letters only, whole comma-separated attributes up to 60
 *  characters, dropped entirely when it asks for a resemblance. */
function timbreWords(raw: string | undefined): string {
  const t = (raw ?? '').toLowerCase().replace(/[^a-z\s,'-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || IMPERSONATION.some((rx) => rx.test(t))) return '';
  let out = '';
  for (const part of t.split(',').map((x) => x.trim()).filter(Boolean)) {
    const next = out ? `${out}, ${part}` : part;
    if (next.length > ATTRIBUTE_MAX) break;
    out = next;
  }
  return out;
}

/** THE AUTOMATIC DESCRIPTION — deterministic, from the profile only (sex, age, pitch, pace, timbre, the language's
 *  accent), no LLM (contract §2: none unless it measurably improves results). The personality text is left out: it
 *  is free prose that can name people. Example: "A husky, resonant, low female voice, about 31, speaking formal Modern
 *  Standard Arabic at a steady, measured pace, close-microphone studio recording". */
export function describeVoiceFromProfile(c: Pick<Character, 'sex' | 'ageYears' | 'language' | 'voice'>): string {
  const age = Math.max(1, Math.round(c.ageYears));
  const kid = c.sex === 'MALE' ? 'boy' : 'girl';
  const who = age < 13 ? `young ${kid}'s voice` : age < 18 ? `teenage ${kid}'s voice` : `${c.sex === 'MALE' ? 'male' : 'female'} voice`;
  const pitch = c.voice.pitch === 'LOW' ? 'low' : c.voice.pitch === 'HIGH' ? 'high' : 'mid-pitched';
  const pace = c.voice.pace === 'SLOW' ? 'a slow, unhurried pace' : c.voice.pace === 'QUICK' ? 'a quick, lively pace' : 'a steady, measured pace';
  const speech = c.language === 'AR' ? 'speaking formal Modern Standard Arabic' : 'speaking English';
  return `A ${timbreWords(c.voice.timbre) || 'clear'}, ${pitch} ${who}, about ${age}, ${speech} at ${pace}, close-microphone studio recording`;
}

// --------------------------------------------------------------------------------------- candidates and ranking

/** The contract's gates on one candidate (its 24 kHz reference): CER ≤ 0.10 (EN) / ≤ 0.15 (AR), loudness and true
 *  peak within the reference gates, 0 clipped samples, ≤ 11.5 s. Anything unmeasured fails: nothing passes on trust. */
export function candidateGate(m: VoiceDesignMeasure, language: Language): { ok: boolean; reasons: string[] } {
  const G = DESIGN_GATES;
  const reasons: string[] = [];
  const finite = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);
  if (!(m.durationSeconds <= G.maxSeconds)) reasons.push(`${m.durationSeconds.toFixed(2)} s is over ${G.maxSeconds} s: the line engine would not hear all of it`);
  if (!finite(m.cer)) reasons.push('CER unmeasured (transcription unavailable)');
  else if (m.cer > G.cer[language]) reasons.push(`CER ${m.cer.toFixed(3)} > ${G.cer[language]}`);
  if (!finite(m.lufs)) reasons.push('loudness unmeasured');
  else if (m.lufs < G.lufs.min || m.lufs > G.lufs.max) reasons.push(`loudness ${m.lufs.toFixed(1)} LUFS outside ${G.lufs.min}…${G.lufs.max}`);
  if (!finite(m.truePeakDbtp)) reasons.push('true peak unmeasured');
  else if (m.truePeakDbtp > G.maxTruePeakDbtp) reasons.push(`true peak ${m.truePeakDbtp.toFixed(2)} dBTP > ${G.maxTruePeakDbtp}`);
  if (m.clippedSamples === undefined) reasons.push('clipping unmeasured');
  else if (m.clippedSamples > G.maxClippedSamples) reasons.push(`${m.clippedSamples} clipped samples`);
  return { ok: reasons.length === 0, reasons };
}

/** Whether a candidate can be a clone reference at all (heard whole, no clipped samples) — what the DESIGN mode needs
 *  of the producer's choice; the CER and level gates make the automatic choice. */
export const cloneEligible = (c: Pick<VoiceDesignCandidate, 'durationSeconds' | 'measured'>) => c.durationSeconds <= DESIGN_GATES.maxSeconds && (c.measured.clippedSamples ?? 0) === 0;

/** The order AUTOMATIC picks from (and DESIGN recommends). SIMILARITY (EN, MSA): gates passed first, then the mean
 *  ECAPA(seed, line-engine rendering) over the preview sentences, then the seed's CER, then the index. PROBE_LETTERS
 *  (the Iraqi experiment): gates passed first, then the probe lines' mean letter coverage, then their mean CER. Candidates
 *  that cannot be a reference are left out; the pick is the first ranked candidate that passed its gates. */
export function rankDesignCandidates(cands: readonly VoiceDesignCandidate[], by: DesignRanking = 'SIMILARITY'): { ranking: number[]; rankedBy: string; pick?: number } {
  const gateFirst = (a: VoiceDesignCandidate, b: VoiceDesignCandidate) => Number(b.gate.ok) - Number(a.gate.ok);
  const tail = (a: VoiceDesignCandidate, b: VoiceDesignCandidate) => ((a.measured.cer ?? 9) - (b.measured.cer ?? 9)) || a.index - b.index;
  let rankedBy: string;
  let order: (a: VoiceDesignCandidate, b: VoiceDesignCandidate) => number;
  if (by === 'PROBE_LETTERS') {
    const any = cands.some((c) => c.letterCoverageMean !== undefined);
    order = (a, b) => gateFirst(a, b) || ((b.letterCoverageMean ?? -1) - (a.letterCoverageMean ?? -1)) || ((a.cerMean ?? 9) - (b.cerMean ?? 9)) || tail(a, b);
    rankedBy = any ? 'gates passed first, then the Iraqi probe lines’ mean letter coverage (spaces ignored), then their mean CER (Iraqi A/B screening)' : 'gates passed first, then CER (the probe lines could not be heard back)';
  } else {
    const any = cands.some((c) => c.similarityMean !== undefined);
    order = (a, b) => gateFirst(a, b) || ((b.similarityMean ?? -2) - (a.similarityMean ?? -2)) || tail(a, b);
    rankedBy = any ? 'gates passed first, then mean ECAPA(seed, line-engine rendering) over the preview sentences, then CER' : 'gates passed first, then CER (speaker similarity unavailable)';
  }
  const sorted = [...cands].filter(cloneEligible).sort(order);
  const pick = sorted.find((c) => c.gate.ok)?.index;
  return { ranking: sorted.map((c) => c.index), rankedBy, ...(pick !== undefined ? { pick } : {}) };
}

// ------------------------------------------------------------------------------------- Rule V-DESIGN (boundary)

/** RULE V-DESIGN at the clone boundary (research §2.3 rule 2c): a designed file may be cloned from only when it is a
 *  candidate of a design record on this character AND the sha256 of the file as found now equals the record's (and the
 *  asset's, and the pinned identity's); its provenance tag, when it names a design, must name the same one; and the
 *  line engine must hear all of it (≤ 11.5 s). Returns why not, or null. Pure: the caller hashes the file. */
export function designedSeedProblem(c: Pick<Character, 'name' | 'voice'>, f: { designId?: string; assetId: string; fileSha256: string; assetSha256?: string; pinnedSha256?: string; tagDesignId?: string | null }): string | null {
  const short = (x?: string) => (x ? `${x.slice(0, 12)}…` : 'none');
  if (!f.designId) return 'no design record is named';
  const rec = c.voice.designs?.find((d) => d.id === f.designId);
  if (!rec) return `${c.name} has no design record ${f.designId}`;
  const cand = rec.candidates.find((x) => x.assetId === f.assetId);
  if (!cand) return `the file is not a candidate of design ${rec.id}`;
  if (cand.sha256 !== f.fileSha256) return `the file's sha256 (${short(f.fileSha256)}) does not match design ${rec.id} candidate ${cand.index} (${short(cand.sha256)})`;
  if (f.assetSha256 && f.assetSha256 !== cand.sha256) return `the asset record's sha256 (${short(f.assetSha256)}) does not match the design record (${short(cand.sha256)})`;
  if (f.pinnedSha256 && f.pinnedSha256 !== cand.sha256) return `the identity pins another seed (${short(f.pinnedSha256)})`;
  if (f.tagDesignId && f.tagDesignId !== rec.id) return `the file's provenance tag names design ${f.tagDesignId}, not ${rec.id}`;
  if (cand.durationSeconds > DESIGN_GATES.maxSeconds) return `candidate ${cand.index} is ${cand.durationSeconds.toFixed(2)} s; a clone reference is at most ${DESIGN_GATES.maxSeconds} s`;
  return null;
}

/** The design id a provenance tag names (`… designId=vd-…; …`), or null. */
export const tagDesignId = (tag: string | null | undefined): string | null => (tag ? /designId=([A-Za-z0-9_-]{1,64})/.exec(tag)?.[1] ?? null : null);

// ----------------------------------------------------------------------------------------- dialect, listening

/** A new identity's dialect status: English has none; any Arabic voice waits for a listener. */
export const initialDialectStatus = (language: Language): DialectStatus => (language === 'AR' ? 'UNVERIFIED' : 'NOT_APPLICABLE');

/** Append a listener's record; `dialectAuthentic` (Arabic only) is the ONLY way dialectStatus becomes
 *  LISTENER_APPROVED or LISTENER_REJECTED. The latest record that answers the question decides. */
export function withListening(identity: VoiceIdentity, rec: { natural: number; dialectAuthentic?: boolean; note?: string }, at: string): VoiceIdentity {
  const record: VoiceListeningRecord = { by: 'PRODUCER', natural: rec.natural, ...(rec.dialectAuthentic !== undefined ? { dialectAuthentic: rec.dialectAuthentic } : {}), ...(rec.note?.trim() ? { note: rec.note.trim() } : {}), at };
  const dialectStatus: DialectStatus | undefined = rec.dialectAuthentic === undefined ? identity.dialectStatus : rec.dialectAuthentic ? 'LISTENER_APPROVED' : 'LISTENER_REJECTED';
  return { ...identity, listening: [...(identity.listening ?? []), record], ...(dialectStatus ? { dialectStatus } : {}) };
}

/** The words a voice carries wherever it is shown (contract §1, §4): its origin, and what no measurement can claim. */
export function voiceLabels(i: Pick<VoiceIdentity, 'origin' | 'language' | 'dialect' | 'dialectStatus' | 'listening'>): string[] {
  const out: string[] = [];
  if (i.origin === 'DESIGNED') out.push(DESIGN_LABEL);
  if (i.language === 'AR' && i.dialectStatus !== 'LISTENER_APPROVED') out.push(i.dialect === 'IRAQI_BAGHDADI' ? IRAQI_DIALECT_PENDING : MSA_ACCENT_PENDING);
  if (!i.listening?.length) out.push(NATURALNESS_PENDING);
  return out;
}
