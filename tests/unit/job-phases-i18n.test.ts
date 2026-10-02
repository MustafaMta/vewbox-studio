import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYS, t, tt } from '@/lib/i18n';

/** Every phase a character or voice job reports (`progress.phase`) has its `jp.<phase>` words in English AND Arabic
 *  (finding 14): the Voice tab and the creation page read `T.dyn(\`jp.${phase}\`)`, which otherwise falls back to the
 *  English key on the Arabic page. The phases are read from the handlers' own source, so a new phase without words
 *  fails here. */

const source = (f: string) => fs.readFileSync(path.join('src', f), 'utf8');
const literalPhases = (text: string) => Array.from(text.matchAll(/phase: '([a-z ]+)'/g), (m) => m[1]);

describe('jp.<phase> keys', () => {
  const phases = new Set<string>([
    ...['worker/handlers/voice.ts', 'worker/handlers/images.ts', 'worker/handlers/character.ts', 'server/jobs/queue.ts'].flatMap((f) => literalPhases(source(f))),
    // CREATE_CHARACTER reports its step names as the phase; the queue sets these on completion
    'design', 'appearance', 'sheet', 'voice', 'done', 'awaiting review',
    // DESIGN_CHARACTER (the creation's first child)
    'designing',
  ]);
  it('the scan finds the phases the review named', () => {
    for (const p of ['preparing', 'cloning', 'speaking', 'drawing', 'recording', 'design', 'recovering']) expect(phases.has(p), p).toBe(true);
  });
  it('each has words in both languages, and the Arabic is not the English', () => {
    const keys = new Set<string>(KEYS);
    for (const p of phases) {
      const key = `jp.${p}`;
      expect(keys.has(key), `${key} is missing from src/lib/i18n.ts`).toBe(true);
      expect(tt('ar', key)).not.toBe(tt('en', key));
      expect(tt('ar', key)).toMatch(/[؀-ۿ]/);
    }
    expect(t('ar', 'jp.cloning' as Parameters<typeof t>[1])).toBe('استنساخ الصوت');
  });
});
