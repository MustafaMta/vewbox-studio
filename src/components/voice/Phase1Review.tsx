'use client';

import { Fragment, useEffect, useState } from 'react';
import { useStudio } from '@/studio/store';
import { PageHead } from '@/components/character/parts';
import { Badge } from '@/components/ui/kit/Status';
import { Notice, SectionEmpty } from '@/components/ui/kit/States';
import type { Character } from '@/domain/types';
import { PerformerVoice } from './PerformerVoice';

/** PHASE 1 REVIEW PACKAGE (the producer's order, 2026-10-09): per character the canonical image, the sheet, the style,
 *  Actor + Singer, the languages, the English and Iraqi lines with their engine, exact checkpoint and reference hash,
 *  whether every artifact is its first creative attempt, and — small and secondary — what the machine measured. The
 *  producer's ears and eyes decide; PHASE_1 waits for them. */

interface Evidence {
  character: 'A' | 'B' | 'C'; generatedAt: string;
  identity: { id: string };
  creativeAttempts: Array<{ type: string; job: string; status: string; attempts: number; key: string | null }>;
  crossLanguage: { note: string; ecapa: Record<string, number | undefined>; medianPitchHz: Record<string, number | undefined>; pitchShiftSemitones: Record<string, number | undefined> };
  lines: Array<{ line: string; engine?: string; phonology?: { verdict: string; flags?: string[] }; qwenAsr?: { heard?: string; cer?: number } }>;
}

const SHEET: Array<[keyof Character, string]> = [['role', 'Role'], ['sex', 'Sex'], ['ageYears', 'Age'], ['build', 'Build'], ['face', 'Face'], ['hair', 'Hair'], ['skin', 'Skin'], ['eyes', 'Eyes'], ['wardrobe', 'Wardrobe'], ['distinguishing', 'Distinguishing'], ['personality', 'Personality']];
const ECAPA_LABEL: Record<string, string> = { englishToEnglish: 'English ↔ English (baseline)', englishToIraqiHabibi: 'English ↔ Iraqi (Habibi)', englishToIraqiMoss: 'English ↔ Iraqi (MOSS)', iraqiHabibiToIraqiMoss: 'Iraqi Habibi ↔ Iraqi MOSS' };

export function Phase1Review() {
  const { state } = useStudio();
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  useEffect(() => { void fetch('/api/phase1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { evidence: [] })).then((j: { evidence: Evidence[] }) => setEvidence(j.evidence ?? [])).catch(() => setEvidence([])); }, []);
  const cs = state.characters;
  return (
    <div className="pc-page">
      <PageHead title="Phase 1 review" description="The three performers — their canonical image, sheet and one voice in English and Iraqi Arabic — for your eyes and ears. Nothing after Phase 1 starts until you accept it." back={{ href: '/characters/voices', label: 'Voice Studio' }} />
      <Notice tone="info">PHASE 1 is waiting for your acceptance. Singing, locations, story, storyboard and video wait for it. The machine numbers below are supporting evidence only; your listening decides naturalness, dialect and whether the Iraqi voice is the same person.</Notice>
      {cs.length === 0 ? <SectionEmpty>No characters yet.</SectionEmpty> : (
        <div style={{ display: 'grid', gap: 24, marginTop: 16 }}>
          {cs.map((c) => {
            const ev = evidence.find((e) => e.identity.id === c.id);
            return (
              <section key={c.id} style={{ display: 'grid', gap: 12 }} aria-label={`${c.name} — review`}>
                <h2 className="t-heading" style={{ margin: 0 }}>{ev ? `Character ${ev.character} — ` : ''}{c.name}</h2>
                <PerformerVoice c={c} detail />
                <details className="paper card-pad">
                  <summary className="t-label">The sheet (the image is the authority: the sheet describes the picture)</summary>
                  <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', marginTop: 8 }}>
                    {SHEET.map(([k, label]) => { const v = c[k]; const text = Array.isArray(v) ? (v.length ? v.join('; ') : '—') : String(v ?? '—'); return <Fragment key={k}><dt className="t-meta">{label}</dt><dd style={{ margin: 0 }}>{text}</dd></Fragment>; })}
                    <dt className="t-meta">Singing</dt><dd style={{ margin: 0 }}>{c.singing ? `${c.singing.voiceType?.toLowerCase().replace('_', '-') ?? 'voice type open'} · ${c.singing.styles.join(', ') || 'styles open'} · sings in ${c.singing.languages.join(', ')} (capability stored; no song is made in Phase 1)` : '—'}</dd>
                    {c.notes && <><dt className="t-meta">Notes</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.notes}</dd></>}
                  </dl>
                </details>
                {ev && (
                  <details className="paper card-pad">
                    <summary className="t-label">First creative attempt and machine evidence (supporting only)</summary>
                    <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
                      <div>
                        <div className="t-meta">Every creative job for this character, and how many times it ran</div>
                        <ul className="t-meta" style={{ margin: 0 }}>{ev.creativeAttempts.map((j) => <li key={j.job}>{j.type} — {j.status.toLowerCase()}{j.attempts > 1 ? ` (${j.attempts} attempts: infrastructure retries, same seed)` : ''}{j.key?.endsWith(':2') ? ' · explicit regeneration after a fixed root cause' : ''}</li>)}</ul>
                      </div>
                      <div>
                        <div className="t-meta">{ev.crossLanguage.note}</div>
                        <table className="table t-meta"><tbody>
                          {Object.entries(ev.crossLanguage.ecapa).map(([k, v]) => <tr key={k}><th scope="row">{ECAPA_LABEL[k] ?? k}</th><td>{v ?? '—'}</td></tr>)}
                          <tr><th scope="row">Median pitch (Hz): English · Iraqi Habibi · Iraqi MOSS</th><td>{[ev.crossLanguage.medianPitchHz.english, ev.crossLanguage.medianPitchHz.iraqiHabibi, ev.crossLanguage.medianPitchHz.iraqiMoss].map((x) => x ?? '—').join(' · ')}</td></tr>
                          <tr><th scope="row">Pitch shift English → Iraqi (semitones): Habibi · MOSS</th><td>{[ev.crossLanguage.pitchShiftSemitones.iraqiHabibi, ev.crossLanguage.pitchShiftSemitones.iraqiMoss].map((x) => x ?? '—').join(' · ')}</td></tr>
                        </tbody></table>
                      </div>
                      {ev.lines.some((l) => l.phonology?.flags?.length) && (
                        <div>
                          <div className="t-meta">Iraqi pronunciation flags (phoneme gate; a listener decides)</div>
                          <ul className="t-meta" style={{ margin: 0 }}>{ev.lines.filter((l) => l.phonology?.flags?.length).map((l) => <li key={`${l.line}-${l.engine}`} dir="auto"><Badge>{l.engine}</Badge> {l.line}: {l.phonology!.flags!.join(' · ')}</li>)}</ul>
                        </div>
                      )}
                      <div className="t-meta">Measured {new Date(ev.generatedAt).toLocaleString('en-GB')}</div>
                    </div>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
