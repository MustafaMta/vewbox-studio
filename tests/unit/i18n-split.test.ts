import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES, KEYS, t } from '@/lib/i18n';

/** docs/DESIGN-SYSTEM-V4.md §8.2 rule 3 (package F0): the dictionary is split into one file per package and merged
 *  by src/lib/i18n.ts. tests/fixtures/i18n-v3-snapshot.json is the dictionary as it was before the split, written
 *  from the old module's own `t()` (1,260 keys, English and Arabic). */

const snapshot = JSON.parse(fs.readFileSync(path.join('tests', 'fixtures', 'i18n-v3-snapshot.json'), 'utf8')) as Record<string, [string, string]>;
const PREFIX: Record<string, string | null> = { common: null, kit: 'kit', media: 'media', shell: 'shell', shows: 'shows', film: 'film', music: 'music', cast: 'cast', studio: 'studio' };

/** Keys whose copy was deliberately rewritten after the split, each with its reason. A change to any other key of the
 *  old dictionary fails, so copy only changes on purpose. (Deleting old keys is package Q1's job: it adds a REMOVED
 *  list here.) */
const REVISED: Record<string, string> = {
  'char.create.voiceNoneHint': 'D9: voices are also designed from the description, not only cloned from a recording',
  'char.form.voiceHint': 'D9: the same',
  'char.create.noVoiceYet': 'D17: the Ready card named only the recording way',
};

describe('the split dictionary', () => {
  it('keeps every key of the old dictionary with the same English and the same Arabic, except deliberate revisions', () => {
    const changed = Object.entries(snapshot).filter(([k, [en, ar]]) => !(KEYS as string[]).includes(k) || t('en', k as never) !== en || t('ar', k as never) !== ar).map(([k]) => k);
    expect(Object.keys(snapshot)).toHaveLength(1260);
    expect(changed.filter((k) => !(k in REVISED))).toEqual([]);
  });

  it('lists as revised only keys that exist and really changed', () => {
    for (const k of Object.keys(REVISED)) {
      expect(k in snapshot, `${k} is not an old key`).toBe(true);
      expect((KEYS as string[]).includes(k), `${k} was deleted, not revised`).toBe(true);
      const [en, ar] = snapshot[k]!;
      expect(t('en', k as never) !== en || t('ar', k as never) !== ar, `${k} is listed as revised but is unchanged`).toBe(true);
    }
  });

  it('adds nothing but new package keys under the package prefix (none at the split: the two are equal key for key)', () => {
    const added: string[] = [];
    for (const [pkg, dict] of Object.entries(DICTIONARIES)) {
      for (const k of Object.keys(dict)) {
        if (k in snapshot) continue;
        added.push(k);
        const pre = PREFIX[pkg];
        expect(pre, `${k} is new in the shared file: new keys go into the owning package's file`).not.toBeNull();
        expect(k.startsWith(`${pre}.`), `${k} is in ${pkg}.ts but does not use the "${pre}." prefix`).toBe(true);
      }
    }
    expect(KEYS.length).toBe(Object.keys(snapshot).length + added.length);
  });

  it('defines no key in two files (a spread would silently keep the last)', () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const [pkg, dict] of Object.entries(DICTIONARIES)) for (const k of Object.keys(dict)) { if (seen.has(k)) twice.push(`${k}: ${seen.get(k)} and ${pkg}`); seen.set(k, pkg); }
    expect(twice).toEqual([]);
    expect(seen.size).toBe(KEYS.length);
  });

  it('has an English and an Arabic string for every key', () => {
    const empty = KEYS.filter((k) => !t('en', k).trim() || !t('ar', k).trim());
    expect(empty).toEqual([]);
  });
});
