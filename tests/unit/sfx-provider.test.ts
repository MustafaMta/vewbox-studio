import { describe, expect, it } from 'vitest';
import { sfxHeaders } from '@/server/providers/sfx';
import { GPU_FAMILIES } from '@/server/gpu/lease';
import { engines, enginesToUnload } from '@/server/gpu/unloaders';
import { parseHoldArgs } from '@/server/gpu/hold-args';

describe('MOSS-SoundEffect provider', () => {
  it('reads the service headers; an answer without a duration is a provider error', () => {
    const h = new Headers({ 'x-duration': '8.000', 'x-sample-rate': '24000', 'x-ms': '41000', 'x-model': 'OpenMOSS-Team/MOSS-SoundEffect', 'x-engine-version': 'moss-soundeffect@1cc77ff', 'x-seed': '7', 'x-peak-vram-mb': '19800' });
    expect(sfxHeaders(h)).toEqual({ seconds: 8, sampleRate: 24000, ms: 41000, model: 'OpenMOSS-Team/MOSS-SoundEffect', engineVersion: 'moss-soundeffect@1cc77ff', seed: 7, peakVramMb: 19800 });
    expect(sfxHeaders(new Headers({ 'x-duration': '2', 'x-peak-vram-mb': '' })).peakVramMb).toBeNull();
    expect(() => sfxHeaders(new Headers({}))).toThrow(/without a duration/);
  });
  it('SFX is its own GPU family: taking the card for it unloads the voices and ComfyUI; gpu-hold accepts it', () => {
    expect(GPU_FAMILIES).toContain('SFX');
    const list = engines();
    expect(list.map((e) => e.name)).toContain('sfx');
    const off = enginesToUnload('TTS', 'SFX', list).map((e) => e.name);
    expect(off).toEqual(expect.arrayContaining(['comfyui', 'tts', 'asr']));
    expect(off).not.toContain('sfx');
    expect(enginesToUnload('SFX', 'VIDEO', list).map((e) => e.name)).toContain('sfx');
    expect(parseHoldArgs(['SFX', '20000', '--', 'x'])).toMatchObject({ family: 'SFX', priority: 'background' });
  });
});
