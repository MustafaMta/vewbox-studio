#!/usr/bin/env node
/** Copies a chosen subset of `pnpm shots -- --rtl` output into docs/screenshots with flat names:
 *  en/<name>-<w>.png → <name>-<w>.png · ar/<name>-1440.png → ar-<name>-1440.png · empty/<name>-<w>.png → empty-<name>-<w>.png
 *  and, from tools/capture-states.mts output, the states that need clicks first.
 *  Usage: node tools/publish-shots.mjs [var/design/after] [var/design/states] */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? 'var/design/after';
const STATES = process.argv[3];
const OUT = 'docs/screenshots';
const EN = [['home', [1440, 390, 1024]], ['shows', [1440]], ['show-overview', [1440, 768]], ['show-seasons', [1440, 390]], ['show-settings', [1440]], ['shorts', [1440]], ['short-overview', [1440]], ['short-storyboard', [1440]], ['shot-editor', [1440]],
  ['music-videos', [1440]], ['music-video-overview', [1440]], ['music-video-song', [1440]], ['music-video-performers', [1440]], ['characters', [1440]], ['character-appearance', [1440]], ['character-voice', [1440]], ['character-used', [1440]],
  ['locations', [1440]], ['location-overview', [1440]], ['assets', [1440]], ['settings', [1440]], ['wizard-show', [1440]], ['wizard-music-video', [1440]]];
const AR = ['home', 'show-seasons', 'music-video-song', 'characters'];
const EMPTY = [['home', [1440, 390]], ['shows', [1440]]];

if (existsSync(OUT)) for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
mkdirSync(OUT, { recursive: true });
let n = 0;
const copy = (from, to) => { if (!existsSync(from)) { console.warn(`missing ${from}`); return; } copyFileSync(from, join(OUT, to)); n++; };
for (const [name, widths] of EN) for (const w of widths) copy(join(SRC, 'en', `${name}-${w}.png`), `${name}-${w}.png`);
for (const name of AR) copy(join(SRC, 'ar', `${name}-1440.png`), `ar-${name}-1440.png`);
for (const [name, widths] of EMPTY) for (const w of widths) copy(join(SRC, 'empty', `${name}-${w}.png`), `empty-${name}-${w}.png`);
const STATE_SET = ['auto-review-1440', 'auto-preferences-1440', 'auto-episode-1440', 'auto-review-390', 'manual-brief-1440', 'character-pending-ref-1440', 'character-locked-1440', 'character-unknown-1440', 'character-voice-playing-1440', 'character-voice-playing-390', 'character-used-in-1440', 'character-edit-locked-1440', 'song-playing-1440', 'song-playing-390', 'song-mini-player-1440', 'video-paused-1440', 'video-no-take-1440', 'final-cut-1440', 'characters-1440', 'characters-390', 'ar-character-locked-1440', 'ar-auto-episode-390', 'ar-song-playing-768'];
if (STATES) for (const name of STATE_SET) copy(join(STATES, `${name}.png`), `state-${name}.png`);
console.log(`${n} screenshots published to ${OUT}`);
