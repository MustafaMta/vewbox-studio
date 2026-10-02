import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { addVoiceSample, selectVoiceSample, setVoiceIdentity, acceptProposal, removeVoiceSample } from '@/domain/actions';
import { voiceLock } from '@/domain/rules';
import { sampleProposal } from '@/domain/proposals';
import type { Character, StudioState } from '@/domain/types';

/** The voice rule: a character who has spoken in a video keeps the voice; one who has not can still be given one. */

const base = (): StudioState => seed();
const used = (s: StudioState): Character => s.characters.find((c) => c.usage?.known && c.usage.videos.length > 0 && c.voice.selectedSampleId)!;
const unused = (s: StudioState): Character => s.characters.find((c) => c.usage?.known && c.usage.videos.length === 0)!;

describe('voice lock', () => {
  it('a used character with a chosen voice is locked; an unused one is not', () => {
    const s = base();
    expect(voiceLock(used(s)).locked).toBe(true);
    expect(voiceLock(unused(s)).locked).toBe(false);
  });
  it('refuses to change the chosen recording, rebuild the identity or remove the chosen sample of a used character', () => {
    const s = base(); const c = used(s);
    const other = c.voice.samples.find((x) => x.id !== c.voice.selectedSampleId && x.assetId);
    if (other) expect(() => selectVoiceSample(s, c.id, other.id)).toThrow(/voice is preserved/);
    expect(() => addVoiceSample(s, c.id, { label: 'new', assetId: 'up-x', source: 'UPLOADED' }, true)).toThrow(/VOICE|preserved/);
    expect(() => removeVoiceSample(s, c.id, c.voice.selectedSampleId!)).toThrow(/preserved/);
    const withIdentity: StudioState = { ...s, characters: s.characters.map((x) => (x.id === c.id ? { ...x, voice: { ...x.voice, identity: { provider: 'LOCAL_TTS', model: 'indextts', revision: 1, language: 'EN', createdAt: '2026-01-01T00:00:00Z' } } } : x)) };
    expect(() => setVoiceIdentity(withIdentity, c.id, { provider: 'LOCAL_TTS', model: 'habibi', language: 'EN' })).toThrow(/preserved/);
    // listening lines can still be added, just not chosen
    expect(addVoiceSample(s, c.id, { label: 'preview', assetId: 'up-y', source: 'GENERATED' }).sample.id).toBeTruthy();
  });
  it('a used character without any voice can still be given one (no continuity to break)', () => {
    const s = base(); const c = used(s);
    const voiceless: StudioState = { ...s, characters: s.characters.map((x) => (x.id === c.id ? { ...x, voice: { ...x.voice, samples: [], selectedSampleId: undefined, identity: undefined } } : x)) };
    const r = addVoiceSample(voiceless, c.id, { label: 'first', assetId: 'up-z', source: 'UPLOADED' }, true);
    expect(r.state.characters.find((x) => x.id === c.id)!.voice.selectedSampleId).toBe(r.sample.id);
    expect(() => setVoiceIdentity(r.state, c.id, { provider: 'LOCAL_TTS', model: 'indextts', language: 'EN' })).not.toThrow();
  });
});

describe('accepting a SEASON proposal', () => {
  it('adds the next season with its arc, its first episode, and grows the show cast by the newcomers kept', () => {
    const s = base();
    const show = s.shows[0];
    const before = s.seasons.filter((x) => x.showId === show.id).length;
    const proposal = sampleProposal(s, { kind: 'SEASON', showId: show.id, preferences: {} });
    const keepCast = proposal.cast.map((c) => c.key);
    const r = acceptProposal(s, { kind: 'SEASON', showId: show.id, aspect: show.aspect, proposal, keepCast, keepLocations: proposal.locations.map((l) => l.key), preferences: {} });
    const seasons = r.state.seasons.filter((x) => x.showId === show.id);
    expect(seasons).toHaveLength(before + 1);
    const season = seasons[seasons.length - 1];
    expect(season.number).toBe(before + 1);
    expect(season.title).toBe(proposal.title);
    expect(season.arc).toBe(proposal.premise);
    expect(r.production.kind).toBe('EPISODE');
    expect(r.production.seasonId).toBe(season.id);
    expect(r.production.episodeNumber).toBe(1);
    expect(r.production.language).toBe(show.language);
    const grown = r.state.shows.find((x) => x.id === show.id)!;
    expect(grown.castIds.length).toBeGreaterThanOrEqual(show.castIds.length);
  });
});
