import { describe, expect, it } from 'vitest';
import { ACE_KEYS, ACE_VARIANTS, aceLanguage, aceStepSong, bpmFromCaption, keyFromCaption } from '@/server/workflows/music';
import { MODELS } from '@/server/workflows';
import { chooseAceVariant } from '@/worker/handlers/music';

describe('ACE-Step workflow inputs', () => {
  it('reads tempo and key from the caption', () => {
    expect(bpmFromCaption('Melancholic ballad (68 BPM) with cello')).toBe(68);
    expect(bpmFromCaption('fast')).toBeUndefined();
    expect(bpmFromCaption('9 bpm')).toBeUndefined();
    expect(keyFromCaption('a waltz in D minor')).toBe('D minor');
    expect(keyFromCaption('bright pop, F# major chorus')).toBe('F# major');
    expect(keyFromCaption('no key given')).toBeUndefined();
  });
  it('maps studio languages to the node codes', () => {
    expect(aceLanguage('EN')).toBe('en');
    expect(aceLanguage('ar')).toBe('ar');
    expect(aceLanguage('xx')).toBe('unknown');
    expect(aceLanguage(undefined)).toBe('unknown');
  });
  it('never sends a value the encoder refuses', () => {
    for (const caption of ['Melancholic ballad (68 BPM)', 'upbeat dance pop', 'quiet lullaby in Eb minor', '']) {
      const g = aceStepSong({ caption, lyrics: '[verse]\nla', seconds: 90, language: 'EN' });
      const inputs = g['4'].inputs as Record<string, unknown>;
      expect(inputs.bpm).toBeGreaterThanOrEqual(10);
      expect(inputs.bpm).toBeLessThanOrEqual(300);
      expect(inputs.timesignature).toBe('4');
      expect(ACE_KEYS).toContain(inputs.keyscale);
      expect(inputs.language).toBe('en');
    }
    expect((aceStepSong({ caption: 'x', lyrics: 'y', seconds: 30, bpm: 5 })['4'].inputs as Record<string, unknown>).bpm).not.toBe(5);
  });
  it('XL-SFT with the 5Hz LM 4B is the default, at the official template settings; turbo is the draft', () => {
    const sft = aceStepSong({ caption: 'pop', lyrics: '[verse]\nla', seconds: 45 });
    expect((sft['1'].inputs as Record<string, unknown>).unet_name).toBe('acestep_v1.5_xl_sft_bf16.safetensors');
    expect(sft['2'].inputs).toMatchObject({ clip_name1: 'qwen_0.6b_ace15.safetensors', clip_name2: 'qwen_4b_ace15.safetensors', type: 'ace' });
    expect(sft['7'].inputs).toMatchObject({ steps: 50, cfg: 7, sampler_name: 'euler', scheduler: 'simple' });
    expect(sft['10'].inputs).toMatchObject({ shift: 3 });
    expect(sft['4'].inputs).toMatchObject({ cfg_scale: 2, temperature: 0.85, top_p: 1, generate_audio_codes: true });
    const turbo = aceStepSong({ caption: 'pop', lyrics: 'la', seconds: 45, variant: 'xl-turbo' });
    expect((turbo['1'].inputs as Record<string, unknown>).unet_name).toBe('acestep_v1.5_xl_turbo_bf16.safetensors');
    expect(turbo['7'].inputs).toMatchObject({ steps: 8, cfg: 1 });
  });
});

describe('chooseAceVariant', () => {
  it('the variant table names the same files as MODELS', () => {
    expect(ACE_VARIANTS['xl-sft']).toMatchObject({ dit: MODELS.aceDitSft, lm: MODELS.aceLm4b });
    expect(ACE_VARIANTS['xl-turbo']).toMatchObject({ dit: MODELS.aceDit, lm: MODELS.aceClip });
  });
  const dms = ['acestep_v1.5_xl_turbo_bf16.safetensors', 'acestep_v1.5_xl_sft_bf16.safetensors'];
  const tes = ['qwen_0.6b_ace15.safetensors', 'qwen_1.7b_ace15.safetensors', 'qwen_4b_ace15.safetensors'];
  it('XL-SFT when its DiT and the 4B LM are installed', () => {
    expect(chooseAceVariant(dms, tes)).toEqual({ variant: 'xl-sft' });
  });
  it('a missing SFT file is a configuration error naming the files — never a silent drop to turbo; turbo only when chosen', () => {
    expect(() => chooseAceVariant(dms.slice(0, 1), tes.slice(0, 2))).toThrow(/acestep_v1.5_xl_sft_bf16.safetensors and qwen_4b_ace15.safetensors/);
    expect(() => chooseAceVariant(dms, tes.slice(0, 2), 'xl-sft')).toThrow(/qwen_4b_ace15/);
    expect(chooseAceVariant(dms, tes, 'xl-turbo')).toEqual({ variant: 'xl-turbo' });
  });
});
