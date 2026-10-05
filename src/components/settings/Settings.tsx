'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { ASPECTS, DIALECTS, LANGUAGES, STYLES } from '@/domain/vocabulary';
import { RESEARCH_PLATFORMS, type ResearchPlatform } from '@/domain/development';
import type { ResearchSettings, Settings as StudioSettings } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { useLive } from '@/studio/org';
import { SaveWord, Segmented, Select, StateWord, Toggle } from '@/components/ui/kit';
import { PageHead, Section } from '@/components/studio/parts';
import { SettingsSkeleton } from './SettingsSkeleton';
import { aspectLabel, dialectLabel } from '@/lib/format';
import type { HonouredSettingKey, SettingsHonoured } from '@/domain/settings';
import { MINIMAX_H3_LOCAL, type ContinuationChoice } from '@/domain/video-capability';
import { REANCHOR } from '@/domain/production-context';
import { designedIraqiAllowed } from '@/components/character/contract';

/** SETTINGS (docs/DESIGN-SYSTEM-V5.md §8.13) — how the studio makes new work, in plain words: the engines it runs on
 *  (said, not offered: the server configures them; MiniMax H3 on this machine is the only video engine); continuity
 *  (the guide a continuous shot starts from, its sound, re-anchoring); voices (the designed-Iraqi experiment); trend
 *  research and its sources; the motion preference; the defaults for new work. Every change goes through the studio's own `updateSettings` command and the head says
 *  whether it is saved. An engine the server cannot reach is offered disabled, with the reason beside it. There is no
 *  interface language: the website is English-only. Engines, models and reliability live in Production's engine room. */

interface Sources { enabled: boolean; cacheHours: number | null; sources: Array<{ platform: ResearchPlatform; status: 'READY' | 'NOT_CONFIGURED' | 'UNSUPPORTED' | 'DISABLED'; detail: string; ttlHours: number }> }

const PLATFORM_NAME: Record<ResearchPlatform, string> = { TIKTOK: 'TikTok', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', YOUTUBE: 'YouTube', NEWS: 'News', WIKIPEDIA: 'Wikipedia' };
const STYLE_NAME: Record<string, string> = { CARTOON: 'Cartoon', ANIME: 'Anime', REALISTIC: 'Realistic' };
const CACHE = [1, 6, 12, 24, 48, 72, 168];

export function SettingsPage() {
  const { state, act, saving, capabilities: caps, ready } = useStudio();
  const { data: sources, error: sourcesError } = useLive<Sources>('/api/research/sources');
  // the research rows carry each source's own words: wait for them (or their failure) so nothing moves when they come
  // which saved settings take effect today (src/domain/settings.ts): a choice nothing reads yet says so under it
  const { data: honour, error: honourError } = useLive<SettingsHonoured>('/api/studio/settings');
  const off = (k: HonouredSettingKey) => honour?.honoured[k] === false;
  if (!ready || (!sources && !sourcesError) || (!honour && !honourError)) return <SettingsSkeleton />;
  const s = state.settings;
  const gen = s.generation ?? {};
  const research: ResearchSettings = s.research ?? { enabled: true };
  const set = (patch: Partial<StudioSettings>) => act('updateSettings', patch);
  const setGen = (patch: NonNullable<StudioSettings['generation']>) => set({ generation: { ...gen, ...patch } });
  const setResearch = (patch: Partial<ResearchSettings>) => set({ research: { ...research, ...patch } });
  // the studio's continuation choice, inside the local engine's capability (src/domain/video-capability.ts); a key set
  // back to its default is removed (the generation patch replaces `continuation` whole)
  const g = MINIMAX_H3_LOCAL.guides!;
  const cont: ContinuationChoice = gen.continuation ?? {};
  const setCont = (patch: Record<string, unknown>) => { const next = { ...cont, ...patch } as Record<string, unknown>; for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; setGen({ continuation: next as ContinuationChoice }); };
  const storyNow = caps?.llm === 'openai-compatible' ? 'a local model' : caps?.llm === 'anthropic' ? 'Anthropic' : caps?.llm === 'minimax' ? 'MiniMax' : 'no engine';
  return (
    <div className="cp settings">
      <PageHead title="Settings" lead="How the studio makes new work. Each change is saved as you make it." end={<SaveWord state={saving} className="st-save" />} />

      {/* the engines are the server's configuration, not a choice made here: the studio films with MiniMax H3 on this
          machine only (no hosted video engine), so a model or resolution picker would change nothing — they are said,
          not offered (final directive §21: no control without an implementation) */}
      <Section id="generation" title="Engines" description="What makes new work. These are set where the studio is installed; the engine room shows whether each one is running.">
        <div className="card st-panel">
          <InfoRow label="Video" hint="Films every take. The only video engine." value={`MiniMax H3, on this machine${caps?.videoResolution ? ` · ${caps.videoResolution}` : ''}`} />
          <InfoRow label="Story" hint="Writes ideas, stories, scripts and shot plans." value={storyNow === 'no engine' ? 'No story engine is configured' : storyNow === 'a local model' ? 'A model on this machine' : `${storyNow}, hosted`} />
          {caps?.minimax ? (
            <SettingRow label="Voice engine" hint="Speaks new voices and dialogue." unused={off('voiceProvider')}>
              {() => <Segmented label="Voice engine" value={gen.voiceProvider ?? 'LOCAL_TTS'} onChange={(v) => setGen({ voiceProvider: v })} options={[{ value: 'LOCAL_TTS', label: 'On this machine' }, { value: 'MINIMAX', label: 'MiniMax, hosted' }]} />}
            </SettingRow>
          ) : <InfoRow label="Voices" hint="Speaks new voices and dialogue." value="On this machine" />}
          <div className="st-row"><span className="st-row-words"><span className="st-label">Is each engine running?</span><span className="t-meta">Services, the GPU and the queue.</span></span><Link href="/production#engine-room" className="btn btn-secondary btn-sm">Open the engine room</Link></div>
        </div>
      </Section>

      <Section id="continuity" title="Continuity" description="How a continuous shot carries on from the shot before it. A shot can choose its own on its page.">
        <div className="card st-panel">
          <SettingRow label="Guide from the shot before" hint={`The frames of the shot before that a continuous take starts from. Longer carries more motion and leaves less new picture. MiniMax H3 keeps ${g.continuationChoices.join(', ')} frames; it uses ${g.defaultContinuationFrames} unless you choose.`}>
            {() => <Segmented label="Guide from the shot before" value={cont.guideFrames && g.continuationChoices.includes(cont.guideFrames) ? String(cont.guideFrames) : ''} onChange={(v) => setCont({ guideFrames: v ? Number(v) : undefined })} options={[{ value: '', label: `Engine (${g.defaultContinuationFrames})` }, ...g.continuationChoices.map((n) => ({ value: String(n), label: `${n} frames` }))]} />}
          </SettingRow>
          <SettingRow label="Sound of the guide" hint="Whether a continuous take hears the end of the shot before. Automatic leaves it out when the shot before speaks and the new one has no lines.">
            {() => <Segmented label="Sound of the guide" value={cont.guideAudio ?? 'AUTO'} onChange={(v) => setCont({ guideAudio: v === 'AUTO' ? undefined : v })} options={[{ value: 'AUTO', label: 'Automatic' }, { value: 'ON', label: 'Always' }, { value: 'OFF', label: 'Never' }]} />}
          </SettingRow>
          <SettingRow label="Re-anchor after" hint="After this many continuous shots in a row, the next one leans on the characters’ canonical images (the shortest guide) so faces do not drift along the chain.">
            {(id) => <Select id={id} value={String(cont.reanchorAfter ?? REANCHOR.after)} onChange={(e) => setCont({ reanchorAfter: Number(e.target.value) === REANCHOR.after ? undefined : Number(e.target.value) })} options={[2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: String(n), label: `${n} shots${n === REANCHOR.after ? ' (default)' : ''}` }))} />}
          </SettingRow>
        </div>
      </Section>

      <Section id="voices" title="Voices" description="How characters get their voices.">
        <div className="card st-panel">
          <div className="st-row st-row-toggle">
            <Toggle label={<>Design Iraqi voices without a recording <StateWord tone="waiting" className="st-src">Experiment</StateWord></>} checked={designedIraqiAllowed(s)} onChange={(v) => set({ voice: { ...(s.voice ?? {}), allowDesignedIraqi: v } })}
              help="Off (recommended): an Iraqi character needs a real recording of an Iraqi speaker, 5–12 seconds, before it can speak. On: the studio may design an Arabic voice and speak it with the Iraqi engine. Such a voice is marked unverified and waits for a native listener’s review; it never counts as an authentic Baghdadi voice. Voices made while it was on stay marked." />
            {off('allowDesignedIraqi') && <span className="t-meta st-unused">Saved — the studio does not use this choice yet.</span>}
          </div>
        </div>
      </Section>

      <Section id="research" title="Research" description="Before it proposes an idea, the studio can look at what people watch now. Credentials stay on the server.">
        <div className="card st-panel">
          <div className="st-row st-row-toggle"><Toggle label="Research trends for new ideas" help="Off: ideas come from your line and the studio’s own knowledge only." checked={research.enabled !== false} onChange={(v) => setResearch({ enabled: v })} />{off('researchEnabled') && <span className="t-meta st-unused">Saved — the studio does not use this choice yet.</span>}</div>
          {RESEARCH_PLATFORMS.map((p) => {
            const src = sources?.sources.find((x) => x.platform === p);
            const on = research.platforms?.[p] !== false;
            const unsupported = src?.status === 'UNSUPPORTED';
            return (
              <div key={p} className="st-row st-row-toggle" data-off={research.enabled === false || undefined}>
                <Toggle label={<>{PLATFORM_NAME[p]} {src ? <StateWord tone={src.status === 'READY' ? 'done' : 'idle'} className="st-src">{src.status === 'READY' ? 'Ready' : src.status === 'NOT_CONFIGURED' ? 'Needs access on the server' : src.status === 'UNSUPPORTED' ? 'No public access' : 'Off'}</StateWord> : null}</>}
                  help={src?.detail} checked={on && !unsupported} disabled={research.enabled === false || unsupported}
                  onChange={(v) => setResearch({ platforms: { ...(research.platforms ?? {}), [p]: v } })} />
              </div>
            );
          })}
          <SettingRow label="Reuse results for" hint="How long a source’s answer is kept before it is asked again." unused={off('researchCacheHours')}>
            {(id) => <Select id={id} value={research.cacheHours ? String(research.cacheHours) : ''} disabled={research.enabled === false} onChange={(e) => setResearch({ cacheHours: e.target.value ? Number(e.target.value) : undefined })}
              options={[{ value: '', label: 'Each source’s default' }, ...CACHE.map((h) => ({ value: String(h), label: h < 24 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${h / 24} ${h === 24 ? 'day' : 'days'}` }))]} />}
          </SettingRow>
        </div>
      </Section>

      <Section id="motion" title="Motion">
        <div className="card st-panel">
          <div className="st-row st-row-toggle"><Toggle label="Reduce motion" help="No zooms, slides or pulses; pictures still fade in, quickly." checked={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />{off('reducedMotion') && <span className="t-meta st-unused">Saved — the studio does not use this choice yet.</span>}</div>
        </div>
      </Section>

      <Section id="defaults" title="New work" description="What a new show, short or music video starts with; each one can change it.">
        <div className="card st-panel">
          <SettingRow label="Style" unused={off('defaultStyle')}>{(id) => <Select id={id} value={s.defaults.style} onChange={(e) => set({ defaults: { ...s.defaults, style: e.target.value as typeof s.defaults.style } })} options={STYLES.map((x) => ({ value: x, label: STYLE_NAME[x] ?? x }))} />}</SettingRow>
          <SettingRow label="Frame" unused={off('defaultAspect')}>{(id) => <Select id={id} value={s.defaults.aspect} onChange={(e) => set({ defaults: { ...s.defaults, aspect: e.target.value as typeof s.defaults.aspect } })} options={ASPECTS.map((x) => ({ value: x, label: aspectLabel(x) }))} />}</SettingRow>
          <SettingRow label="Dialogue language" hint="The language the characters speak in the film." unused={off('defaultLanguage')}>{(id) => <Select id={id} value={s.defaults.language} onChange={(e) => set({ defaults: { ...s.defaults, language: e.target.value as typeof s.defaults.language } })} options={LANGUAGES.map((x) => ({ value: x, label: x === 'EN' ? 'English' : 'Arabic' }))} />}</SettingRow>
          <SettingRow label="Arabic dialect" unused={off('defaultDialect')}>{(id) => <Select id={id} value={s.defaults.dialect} onChange={(e) => set({ defaults: { ...s.defaults, dialect: e.target.value as typeof s.defaults.dialect } })} options={DIALECTS.map((x) => ({ value: x, label: dialectLabel(x) }))} />}</SettingRow>
        </div>
      </Section>

      <Section id="elsewhere" title="Elsewhere">
        <div className="card st-panel">
          <div className="st-row"><span className="st-row-words"><span className="st-label">Engines, models and reliability</span><span className="t-meta">What the studio runs on and how it ran.</span></span><Link href="/production#engine-room" className="btn btn-secondary btn-sm">Open the engine room</Link></div>
          <div className="st-row"><span className="st-row-words"><span className="st-label">The studio holds</span><span className="t-meta">{state.productions.length} {state.productions.length === 1 ? 'production' : 'productions'} · {state.characters.length} {state.characters.length === 1 ? 'character' : 'characters'} · {state.locations.length} {state.locations.length === 1 ? 'location' : 'locations'} · {state.assets.length} files</span></span><Link href="/assets" className="btn btn-secondary btn-sm">Open Files</Link></div>
        </div>
      </Section>
    </div>
  );
}

/** One setting: its label and one line of help on the start, the control on the end (stacked on phones). */
function SettingRow({ label, hint, unused, children }: { label: ReactNode; hint?: ReactNode; /** saved, but nothing reads it yet */ unused?: boolean; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="st-row">
      <span className="st-row-words"><label htmlFor={id} className="st-label">{label}</label>{hint && <span className="t-meta">{hint}</span>}{unused && <span className="t-meta st-unused">Saved — the studio does not use this choice yet.</span>}</span>
      <span className="st-control">{children(id)}</span>
    </div>
  );
}

/** A fact, not a choice: its label and help on the start, the value on the end (stacked on phones). */
function InfoRow({ label, hint, value }: { label: ReactNode; hint?: ReactNode; value: ReactNode }) {
  return (
    <div className="st-row">
      <span className="st-row-words"><span className="st-label">{label}</span>{hint && <span className="t-meta">{hint}</span>}</span>
      <span className="st-control st-value">{value}</span>
    </div>
  );
}

/** The page's skeleton lives in ./SettingsSkeleton (drawn synchronously by the shell); re-exported for the page. */
export { SettingsSkeleton };
