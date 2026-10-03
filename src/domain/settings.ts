import type { Settings } from './types';

/** The settings a new studio starts with (the interface in English; new projects in the cartoon style, Iraqi Arabic,
 *  16:9). Shared by the server's seed and the browser's first, empty state before the snapshot arrives. */
export const DEFAULT_SETTINGS: Settings = { uiLanguage: 'en', reducedMotion: false, defaults: { style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9' } };
