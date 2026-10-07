import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every manifest file lands at <folder>/<as or basename> (docker/models/fetch.py). Two files with one stored path
 *  overwrite each other on every run — MOSS-SoundEffect v2's three config.json did, and the group never verified. */
describe('the model manifest', () => {
  it('no two files are stored at the same path', () => {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docker/models/manifest.json'), 'utf8')) as { groups: Array<{ name: string; files?: Array<{ file: string; folder: string; as?: string }> }> };
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const g of m.groups) for (const f of g.files ?? []) {
      const key = `${f.folder}/${f.as ?? path.posix.basename(f.file)}`;
      const who = `${g.name}:${f.file}`;
      if (seen.has(key) && seen.get(key) !== who) clashes.push(`${key} <- ${seen.get(key)} and ${who}`);
      else seen.set(key, who);
    }
    expect(clashes).toEqual([]);
  });
});
