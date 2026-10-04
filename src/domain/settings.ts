import type { Settings } from './types';

/** The settings a new studio starts with (new projects in the cartoon style, Iraqi Arabic, 16:9; the interface is
 *  English-only and has no language setting). Shared by the server's seed and the browser's first, empty state before the snapshot arrives. */
export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, defaults: { style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9' } };

/** WHICH SETTINGS TAKE EFFECT TODAY, said honestly (the Settings page shows a choice that is saved but not yet used as
 *  such). Every key is a setting the page offers; `honoured: false` means nothing in the server, the worker or the
 *  pages reads it yet — the model phase will connect the generation choices. `voiceProvider` is honoured only where a
 *  MiniMax key is configured (without one every voice is local). Pure; served by GET /api/studio/settings and beside the
 *  snapshot (GET /api/studio `settingsHonoured`). */
export const HONOURED_SETTING_KEYS = ['reducedMotion', 'defaultStyle', 'defaultLanguage', 'defaultDialect', 'defaultAspect', 'videoModel', 'videoResolution', 'llmProvider', 'voiceProvider', 'allowDesignedIraqi', 'researchEnabled', 'researchCacheHours'] as const;
export type HonouredSettingKey = (typeof HONOURED_SETTING_KEYS)[number];
export interface SettingsHonoured { honoured: Record<HonouredSettingKey, boolean>; notes: Record<HonouredSettingKey, string> }

export function settingsHonoured(env: { minimax: boolean }): SettingsHonoured {
  const notes: Record<HonouredSettingKey, string> = {
    reducedMotion: 'The interface reduces its motion.',
    defaultStyle: 'New projects and characters start in this style.',
    defaultLanguage: 'New projects and characters start in this language.',
    defaultDialect: 'Arabic projects and characters start in this dialect.',
    defaultAspect: 'New projects start in this aspect ratio.',
    videoModel: 'Saved, not yet in effect: the video model is set by the server configuration.',
    videoResolution: 'Saved, not yet in effect: the video resolution is set by the server configuration.',
    llmProvider: 'Saved, not yet in effect: the story model is set by the server configuration.',
    voiceProvider: env.minimax ? 'Voices use this provider (MiniMax for a consented upload).' : 'Not in effect: no MiniMax key is configured, so every voice is made locally.',
    allowDesignedIraqi: 'Iraqi voices may be designed without a recording (the experiment).',
    researchEnabled: 'Auto Idea researches public trends when this is on.',
    researchCacheHours: 'Research results are reused for this long.',
  };
  const honoured = Object.fromEntries(HONOURED_SETTING_KEYS.map((k) => [k, true])) as Record<HonouredSettingKey, boolean>;
  honoured.videoModel = false; honoured.videoResolution = false; honoured.llmProvider = false; honoured.voiceProvider = env.minimax;
  return { honoured, notes };
}