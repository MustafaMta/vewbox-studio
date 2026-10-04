import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HONOURED_SETTING_KEYS, settingsHonoured } from '@/domain/settings';

/** SETTINGS THAT CHANGE NOTHING ARE SAID TO CHANGE NOTHING. The video model, its resolution and the story model are
 *  saved but no server, worker or page code reads them yet; the API says so (honoured: false) so the Settings page can
 *  tell the producer honestly. */

const read = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? read(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

describe('which settings are honoured', () => {
  it('videoModel, videoResolution and llmProvider are not; voiceProvider only with a MiniMax key; the rest are', () => {
    const without = settingsHonoured({ minimax: false });
    expect(without.honoured).toMatchObject({ videoModel: false, videoResolution: false, llmProvider: false, voiceProvider: false, reducedMotion: true, defaultStyle: true, defaultAspect: true, allowDesignedIraqi: true, researchEnabled: true });
    expect(settingsHonoured({ minimax: true }).honoured.voiceProvider).toBe(true);
    expect(Object.keys(without.notes).sort()).toEqual([...HONOURED_SETTING_KEYS].sort());
    expect(without.notes.videoModel).toMatch(/not yet in effect/);
  });

  it('the report matches the code: nothing outside the Settings page and the reducer reads the three unhonoured settings', () => {
    const readers = read('src').filter((f) => !f.includes(`${path.sep}settings${path.sep}page.tsx`) && !f.endsWith(`domain${path.sep}settings.ts`) && !f.endsWith(`domain${path.sep}commands.ts`) && !f.endsWith(`domain${path.sep}types.ts`) && !f.endsWith(`studio${path.sep}api.ts`))
      .filter((f) => /\.(videoModel|videoResolution|llmProvider)\b/.test(fs.readFileSync(f, 'utf8').replace(/caps\.videoModel|capabilities\(\)\.videoModel|\bvideoModel: env\(\)/g, '')));
    // the server's own configured model is reported by capabilities (env), not read from the settings
    expect(readers.filter((f) => /settings\.generation|generation\?\.(videoModel|videoResolution|llmProvider)/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('the snapshot and the settings route carry it', () => {
    expect(fs.readFileSync(path.join('src', 'app', 'api', 'studio', 'route.ts'), 'utf8')).toContain('settingsHonoured: settingsHonoured(');
    expect(fs.readFileSync(path.join('src', 'app', 'api', 'studio', 'settings', 'route.ts'), 'utf8')).toContain('settingsHonoured(');
  });
});
