/** THE INTERFACE DICTIONARY — every UI string has a key; English is the default and Arabic is complete. Components
 *  call `useT()`; strings built at runtime (`stage.${x}`) go through `T.dyn`, which falls back to readable words.
 *
 *  The strings live in one file per package (src/lib/i18n/v4/<pkg>.ts, docs/DESIGN-SYSTEM-V4.md §8.2 rule 3), so the
 *  packages that redesign the pages can add strings in parallel without touching each other's files. This module
 *  merges them and is the only API: `t`, `tt`, `Key`, `KEYS`. Each package adds keys only in its own file, under its
 *  own prefix (`shows.`, `film.`, `music.`, `cast.`, `studio.`, `kit.`, `media.`, `shell.`);
 *  tests/unit/i18n-split.test.ts fails on a key defined in two files and on a v3 key that changed or went missing. */
import { common } from './i18n/v4/common';
import { kit } from './i18n/v4/kit';
import { media } from './i18n/v4/media';
import { shell } from './i18n/v4/shell';
import { shows } from './i18n/v4/shows';
import { film } from './i18n/v4/film';
import { music } from './i18n/v4/music';
import { cast } from './i18n/v4/cast';
import { studio } from './i18n/v4/studio';

export type Locale = 'en' | 'ar';

/** Every per-package dictionary, by package (the prefix its new keys use). */
export const DICTIONARIES = { common, kit, media, shell, shows, film, music, cast, studio } as const;

const D = { ...common, ...kit, ...media, ...shell, ...shows, ...film, ...music, ...cast, ...studio } as const satisfies Record<string, readonly [string, string]>;

export type Key = keyof typeof D;

export function t(locale: Locale, key: Key): string {
  const pair = D[key];
  return locale === 'ar' ? pair[1] : pair[0];
}

/** Fallback-tolerant lookup for dynamic keys such as `stage.${x}`: unknown keys become readable words. */
export function tt(locale: Locale, key: string, fallback?: string): string {
  const pair = (D as Record<string, readonly [string, string]>)[key];
  if (!pair) return fallback ?? key.split('.').pop()!.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return locale === 'ar' ? pair[1] : pair[0];
}

export const KEYS = Object.keys(D) as Key[];
