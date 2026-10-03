import type { Settings } from './types';

/** The settings a new studio starts with (new projects in the cartoon style, Iraqi Arabic, 16:9; the interface is
 *  English-only and has no language setting). Shared by the server's seed and the browser's first, empty state before the snapshot arrives. */
export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, defaults: { style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9' } };
