import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYS, T } from '@/lib/copy';

/** Every phase a character or voice job reports (`progress.phase`) has its `jp.<phase>` words (finding 14): the Voice
 *  tab and the creation page read `T.dyn(\`jp.${phase}\`)`, which otherwise falls back to the raw phase. The phases
 *  are read from the handlers' own source, so a new phase without words fails here. */

const source = (f: string) => fs.readFileSync(path.join('src', f), 'utf8');
const literalPhases = (text: string) => Array.from(text.matchAll(/phase: '([a-z ]+)'/g), (m) => m[1]);

describe('jp.<phase> keys', () => {
  const phases = new Set<string>([
    ...['worker/handlers/voice.ts', 'worker/handlers/images.ts', 'worker/handlers/character.ts', 'server/jobs/queue.ts'].flatMap((f) => literalPhases(source(f))),
    // CREATE_CHARACTER reports its step names as the phase (contract v2: no sheet step); the queue sets these on completion
    'design', 'appearance', 'voice', 'done', 'awaiting review',
    // DESIGN_CHARACTER (the creation's first child)
    'designing',
  ]);
  it('the scan finds the phases the review named', () => {
    for (const p of ['preparing', 'cloning', 'speaking', 'drawing', 'recording', 'design', 'recovering']) expect(phases.has(p), p).toBe(true);
  });
  it('each has its words', () => {
    const keys = new Set<string>(KEYS);
    for (const p of phases) {
      const key = `jp.${p}`;
      expect(keys.has(key), `${key} is missing from src/lib/copy.ts`).toBe(true);
      expect(T.dyn(key).trim()).not.toBe('');
    }
    expect(T.dyn('jp.cloning')).toBe('Cloning the voice');
  });
});
