import type { Asset, Character, Location, Production, Season, Shot, Show, StudioState } from '@/domain/types';
import { STATE_VERSION } from './version';
import { DEFAULT_SETTINGS } from './settings';

/** THE SAMPLE STUDIO — A TEST FIXTURE, not product content: one show with two seasons and three episodes, one short,
 *  one music video, six characters, four locations, all media synthetic and marked "sample". Titles and places are
 *  invented. (Its characters still model the pre-v2 identity: a portrait and reference views, no canonical image.)
 *
 *  Who reaches it: unit tests import `seed()`; the browser and API tests load it into a running studio with
 *  POST /api/studio/reset {"kind":"sample"}, which the server accepts only when started with STUDIO_SAMPLE_FIXTURE=1
 *  (playwright.config.ts sets it on the server it starts); `SEED_KIND=sample` seeds it on a first start. A live
 *  studio starts empty and offers no way back to it. Data only; nothing outside src/server and tests imports it
 *  (tests/unit/sample-fixture.test.ts). */

const T0 = '2026-09-01T09:00:00.000Z';
const day = (n: number, h = 10) => new Date(Date.UTC(2026, 8, n, h)).toISOString();

// ---------------------------------------------------------------------------------------------------------- assets

function img(id: string, src: string, label: string, w: number, h: number, tags: string[] = []): Asset {
  return { id, kind: 'IMAGE', src: `/sample/${src}`, label, width: w, height: h, tags, sample: true, origin: 'SAMPLE', mimeType: 'image/svg+xml', createdAt: T0 };
}
function vid(id: string, src: string, poster: string, label: string, secs: number, w = 1280, h = 720, tags: string[] = []): Asset {
  return { id, kind: 'VIDEO', src: `/sample/${src}`, poster: `/sample/${poster}`, label, width: w, height: h, durationSeconds: secs, tags, sample: true, origin: 'SAMPLE', mimeType: 'video/mp4', createdAt: T0 };
}
function aud(id: string, src: string, label: string, secs: number, tags: string[] = []): Asset {
  return { id, kind: 'AUDIO', src: `/sample/${src}`, label, durationSeconds: secs, tags, sample: true, origin: 'SAMPLE', mimeType: 'audio/mp4', createdAt: T0 };
}

const CHAR_IDS = ['abu-samir', 'layla', 'karim', 'hana', 'the-cat', 'nour', 'um-hassan'] as const;
const CHAR_NAMES: Record<(typeof CHAR_IDS)[number], string> = { 'abu-samir': 'Abu Samir', layla: 'Layla', karim: 'Karim', hana: 'Hana', 'the-cat': 'Basbousa', nour: 'Nour', 'um-hassan': 'Um Hassan' };
const LOC_IDS = ['cafe', 'alley', 'rooftop', 'riverbank'] as const;
const LOC_NAMES: Record<(typeof LOC_IDS)[number], string> = { cafe: 'Abu Samir’s Café', alley: 'Al-Mutanabbi Alley', rooftop: 'Karim’s Rooftop', riverbank: 'Tigris Riverbank' };

export const ASSETS: Asset[] = [
  img('cover-last-sip', 'covers/last-sip.svg', 'The Last Sip — show cover', 1280, 720, ['cover', 'show']),
  img('cover-s1e1', 'covers/last-sip-s1e1.svg', 'The Opening Hour — cover', 1280, 720, ['cover', 'episode']),
  img('cover-s1e2', 'covers/last-sip-s1e2.svg', 'The Debt — cover', 1280, 720, ['cover', 'episode']),
  img('cover-s2e1', 'covers/last-sip-s2e1.svg', 'New Management — cover', 1280, 720, ['cover', 'episode']),
  img('cover-night-tray', 'covers/night-tray-vertical.svg', 'Night Tray — cover', 720, 1280, ['cover', 'short']),
  img('cover-river-lights', 'covers/river-lights.svg', 'River Lights — cover', 1280, 720, ['cover', 'music video']),
  img('cover-paper-kites', 'covers/paper-kites.svg', 'Paper Kites — show cover', 1280, 720, ['cover', 'show']),
  img('cover-paper-boats', 'covers/paper-boats.svg', 'Paper Boats — cover', 1280, 720, ['cover', 'short']),
  img('cover-rooftop-radio', 'covers/rooftop-radio.svg', 'Rooftop Radio — cover', 1280, 720, ['cover', 'music video']),
  ...([['last-sip', 'The Last Sip'], ['paper-kites', 'Paper Kites'], ['night-tray', 'Night Tray'], ['paper-boats', 'Paper Boats'], ['last-sip-s1e1', 'The Opening Hour'], ['last-sip-s1e2', 'The Debt'], ['last-sip-s2e1', 'New Management']] as Array<[string, string]>).map(([id, t]) => img(`poster-${id}`, `covers/${id}-poster.svg`, `${t} — poster`, 800, 1200, ['poster'])),
  img('square-river-lights', 'covers/river-lights-square.svg', 'River Lights — cover art', 1000, 1000, ['cover art', 'music video']),
  img('square-rooftop-radio', 'covers/rooftop-radio-square.svg', 'Rooftop Radio — cover art', 1000, 1000, ['cover art', 'music video']),
  ...CHAR_IDS.flatMap((c) => [
    img(`portrait-${c}`, `characters/${c}.svg`, `${CHAR_NAMES[c]} — portrait`, 768, 960, ['character', 'portrait']),
    img(`ref-${c}-front`, `characters/${c}-front.svg`, `${CHAR_NAMES[c]} — front`, 768, 960, ['character', 'reference']),
    img(`ref-${c}-three-quarter`, `characters/${c}-three-quarter.svg`, `${CHAR_NAMES[c]} — three-quarter`, 768, 960, ['character', 'reference']),
    img(`ref-${c}-side`, `characters/${c}-side.svg`, `${CHAR_NAMES[c]} — side`, 768, 960, ['character', 'reference']),
    img(`ref-${c}-full-body`, `characters/${c}-full-body.svg`, `${CHAR_NAMES[c]} — full body`, 768, 960, ['character', 'reference']),
    img(`ref-${c}-expression`, `characters/${c}-expression.svg`, `${CHAR_NAMES[c]} — expression`, 768, 960, ['character', 'reference']),
  ]),
  ...LOC_IDS.flatMap((l) => [
    img(`loc-${l}`, `locations/${l}.svg`, `${LOC_NAMES[l]} — master plate`, 1280, 720, ['location', 'master']),
    img(`loc-${l}-view-2`, `locations/${l}-view-2.svg`, `${LOC_NAMES[l]} — second view`, 1280, 720, ['location', 'view']),
    img(`loc-${l}-night`, `locations/${l}-night.svg`, `${LOC_NAMES[l]} — night`, 1280, 720, ['location', 'state']),
  ]),
  ...Array.from({ length: 17 }, (_, i) => i + 1).flatMap((n) => {
    const k = String(n).padStart(2, '0');
    return [img(`frame-${k}-a`, `frames/frame-${k}-a.svg`, `Shot ${n} — opening frame`, 1280, 720, ['frame', 'opening']), img(`frame-${k}-b`, `frames/frame-${k}-b.svg`, `Shot ${n} — ending frame`, 1280, 720, ['frame', 'ending'])];
  }),
  ...[1, 2, 3, 4].map((n) => img(`vframe-${n}-a`, `frames/vertical-${n}-a.svg`, `Shot ${n} — opening frame (9:16)`, 720, 1280, ['frame', 'opening'])),
  ...Array.from({ length: 9 }, (_, i) => i + 1).map((n) => { const k = String(n).padStart(2, '0'); return vid(`take-${k}`, `takes/take-${k}.mp4`, `frames/frame-${k}-a.svg`, `Take ${n}`, 4 + (n % 3), 1280, 720, ['take']); }),
  vid('take-vertical-01', 'takes/take-vertical-01.mp4', 'frames/vertical-1-a.svg', 'Take (9:16)', 5, 720, 1280, ['take']),
  vid('cut-s1e1', 'takes/assembled-cut-sample.mp4', 'covers/last-sip-s1e1.svg', 'The Opening Hour — assembled cut', 12, 1280, 720, ['cut']),
  aud('song-river-lights', 'audio/river-lights-sample.m4a', 'River Lights — example song', 48, ['song']),
  aud('song-uploaded', 'audio/uploaded-track-sample.m4a', 'Uploaded track (example)', 36, ['song', 'upload']),
  aud('voice-low', 'audio/voice-low-sample.m4a', 'Voice — low', 3, ['voice']),
  aud('voice-mid', 'audio/voice-mid-sample.m4a', 'Voice — mid', 3, ['voice']),
  aud('voice-high', 'audio/voice-high-sample.m4a', 'Voice — high', 3, ['voice']),
  aud('voice-warm', 'audio/voice-warm-sample.m4a', 'Voice — warm', 3, ['voice']),
  aud('voice-bright', 'audio/voice-bright-sample.m4a', 'Voice — bright', 3, ['voice']),
  aud('voice-soft', 'audio/voice-soft-sample.m4a', 'Voice — soft', 3, ['voice']),
];

// ------------------------------------------------------------------------------------------------------ characters

const refs = (c: string) => (['FRONT', 'THREE_QUARTER', 'SIDE', 'FULL_BODY', 'EXPRESSION'] as const).map((role) => ({ id: `${c}-${role.toLowerCase()}`, role, assetId: `ref-${c}-${role.toLowerCase().replace('_', '-')}` }));
const voice = (pitch: 'LOW' | 'MID' | 'HIGH', pace: 'SLOW' | 'MEASURED' | 'QUICK', timbre: string, notes: string, samples: string[], selected?: string) => ({
  pitch, pace, timbre, notes, samples: samples.map((s) => ({ id: `v-${s}`, label: `${s[0].toUpperCase()}${s.slice(1)} (sample)`, assetId: `voice-${s}`, source: 'SAMPLE' as const })), selectedSampleId: selected ? `v-${selected}` : undefined,
});

export const CHARACTERS: Character[] = [
  {
    id: 'abu-samir', name: 'Abu Samir', nameAr: 'أبو سمير', role: 'Café owner, sixty, unhurried', kind: 'ACTOR', style: 'CARTOON', sex: 'MALE', ageYears: 61, build: 'Heavy-set, round shoulders', face: 'Broad face, deep laugh lines, a grey moustache that hides his mouth when he is thinking', hair: 'Grey, thin, combed back', skin: 'Olive, sun-worn', eyes: 'Dark brown, heavy lids', distinguishing: ['Worry beads never leave his left hand', 'Reading glasses pushed up on his forehead'], wardrobe: 'White dishdasha under a brown waistcoat; leather sandals', personality: 'Patient to a fault, generous with tea and stingy with praise. Speaks slowly and lands the last word.', language: 'AR', dialect: 'IRAQI_BAGHDADI',
    voice: voice('LOW', 'SLOW', 'Gravelly, warm', 'Long pauses; drops the ends of sentences', ['low', 'warm'], 'low'), refs: refs('abu-samir'), portraitAssetId: 'portrait-abu-samir', createdAt: day(1), updatedAt: day(20),
  },
  {
    id: 'layla', name: 'Layla', nameAr: 'ليلى', role: 'His niece, runs the counter', kind: 'ACTOR', style: 'CARTOON', sex: 'FEMALE', ageYears: 26, build: 'Slight, quick', face: 'Sharp chin, expressive brows, a small scar over the left eyebrow', hair: 'Black, tied back with a green scarf', skin: 'Light olive', eyes: 'Hazel', distinguishing: ['Green scarf', 'Pen behind her ear'], wardrobe: 'Denim apron over a striped shirt; trainers', personality: 'Fast, funny, always three steps ahead of her uncle and two steps behind her own plans.', language: 'AR', dialect: 'IRAQI_BAGHDADI',
    voice: voice('MID', 'QUICK', 'Bright, clipped', 'Speeds up when she is right', ['mid', 'bright'], 'bright'), refs: refs('layla'), portraitAssetId: 'portrait-layla', createdAt: day(1), updatedAt: day(21),
  },
  {
    id: 'karim', name: 'Karim', nameAr: 'كريم', role: 'Regular customer, aspiring poet', kind: 'ACTOR', style: 'CARTOON', sex: 'MALE', ageYears: 34, build: 'Tall, thin', face: 'Long face, stubble, hopeful eyes', hair: 'Dark curls', skin: 'Brown', eyes: 'Dark brown', distinguishing: ['A notebook with a broken spine', 'Odd socks'], wardrobe: 'Corduroy jacket over a t-shirt, whatever the weather', personality: 'Romantic, unlucky, sincere. Owes Abu Samir for eleven teas.', language: 'AR', dialect: 'IRAQI_BAGHDADI',
    voice: voice('MID', 'MEASURED', 'Soft, slightly nasal', 'Recites; means it', ['mid', 'soft'], 'soft'), refs: refs('karim'), portraitAssetId: 'portrait-karim', createdAt: day(2), updatedAt: day(18),
  },
  {
    id: 'hana', name: 'Hana', nameAr: 'هناء', role: 'Night nurse', kind: 'ACTOR', style: 'ANIME', sex: 'FEMALE', ageYears: 29, build: 'Average, tired shoulders', face: 'Round face, dark circles she does not hide', hair: 'Short black bob', skin: 'Pale', eyes: 'Dark grey', distinguishing: ['A watch on the inside of her wrist'], wardrobe: 'Teal scrubs, a grey cardigan, a lanyard', personality: 'Kind in the way of someone who has decided to be. Notices everything, says a tenth of it.', language: 'EN',
    voice: voice('MID', 'SLOW', 'Even, low-energy', 'Never raises her voice', ['mid', 'warm'], 'warm'), refs: refs('hana'), portraitAssetId: 'portrait-hana', createdAt: day(5), updatedAt: day(22),
  },
  {
    id: 'the-cat', name: 'Basbousa', nameAr: 'بسبوسة', role: 'The café cat', kind: 'ACTOR', style: 'CARTOON', sex: 'FEMALE', species: 'cat', ageYears: 4, build: 'Plump', face: 'Flat, unimpressed', hair: 'Orange tabby', skin: '—', eyes: 'Green', distinguishing: ['A torn left ear'], wardrobe: 'A red collar with no tag', personality: 'Owns the café. Tolerates the humans.', language: 'AR',
    voice: voice('HIGH', 'SLOW', 'A single meow', 'No lines; reacts', [], undefined), refs: refs('the-cat'), portraitAssetId: 'portrait-the-cat', createdAt: day(3), updatedAt: day(3),
  },
  {
    id: 'nour', name: 'Nour', nameAr: 'نور', role: 'Singer', kind: 'SINGER', singing: { voiceType: 'ALTO', styles: ['pop', 'ballad'], languages: ['AR'] }, style: 'REALISTIC', sex: 'FEMALE', ageYears: 31, build: 'Athletic', face: 'Strong jaw, wide mouth, calm gaze', hair: 'Long dark hair, usually loose', skin: 'Medium brown', eyes: 'Dark brown', distinguishing: ['A silver ring on her thumb'], wardrobe: 'Long black coat over a white shirt; boots', personality: 'Still on the outside, all motion within. Sings like she is telling you a secret.', language: 'AR', dialect: 'MSA',
    voice: { ...voice('LOW', 'MEASURED', 'Husky, resonant', 'Singing voice: low alto, breathy on the verses, open on the chorus', ['low', 'warm', 'soft'], 'warm'), samples: [...voice('LOW', 'MEASURED', '', '', ['low', 'warm', 'soft']).samples, { id: 'v-nour-studio', label: 'Studio voice (not generated yet)', source: 'GENERATED' as const }] }, refs: refs('nour'), portraitAssetId: 'portrait-nour', createdAt: day(8), updatedAt: day(23),
  },
  {
    id: 'um-hassan', name: 'Um Hassan', nameAr: 'أم حسن', role: 'Baker across the alley', kind: 'ACTOR', style: 'CARTOON', sex: 'FEMALE', ageYears: 58, build: 'Sturdy, flour on her sleeves', face: 'Round, deep-set smiling eyes', hair: 'Covered by a plum headscarf', skin: 'Olive', eyes: 'Dark brown', distinguishing: ['Plum headscarf', 'A wooden bread paddle'], wardrobe: 'Plum headscarf, grey dress, white apron', personality: 'Knows everyone’s business by the bread they buy. Imported from an earlier character library; her video history was not kept.', language: 'AR', dialect: 'IRAQI_BAGHDADI',
    voice: voice('LOW', 'MEASURED', 'Warm, amused', 'Laughs before the punchline', ['warm'], 'warm'), refs: refs('um-hassan'), portraitAssetId: 'portrait-um-hassan', usage: { known: false, videos: [] }, createdAt: day(4), updatedAt: day(4),
  },
];

// ------------------------------------------------------------------------------------------------------- locations

export const LOCATIONS: Location[] = [
  { id: 'cafe', name: 'Abu Samir’s Café', nameAr: 'قهوة أبو سمير', kind: 'INTERIOR', style: 'CARTOON', description: 'A narrow Baghdad café: a long counter on the left, six small tables, a ceiling fan that has never been fast, a window onto the alley at the far end. Tea glasses everywhere.', lighting: ['MORNING', 'AFTERNOON', 'NIGHT'], landmarks: ['Counter with brass samovar — left, near', 'Window to the alley — centre, far', 'Framed portrait of a footballer — right wall, mid', 'Ceiling fan — top, centre'], props: ['Brass samovar', 'Tea glasses on saucers', 'A ledger notebook', 'Worry beads', 'Backgammon board'], refs: [{ id: 'cafe-master', role: 'MASTER', assetId: 'loc-cafe', label: 'Master plate' }, { id: 'cafe-view-2', role: 'VIEW', assetId: 'loc-cafe-view-2', label: 'From the counter' }, { id: 'cafe-night', role: 'STATE', assetId: 'loc-cafe-night', label: 'Night, closed' }], masterAssetId: 'loc-cafe', createdAt: day(1), updatedAt: day(19) },
  { id: 'alley', name: 'Al-Mutanabbi Alley', nameAr: 'زقاق المتنبي', kind: 'EXTERIOR', style: 'CARTOON', description: 'A book-market alley: stalls of second-hand books under canvas awnings, a strip of hard sky above, the café door at the end.', lighting: ['MORNING', 'GOLDEN_HOUR', 'DUSK'], landmarks: ['Book stalls — both sides, near to far', 'Café door — centre, far', 'Awning shadow — top'], props: ['Stacks of second-hand books', 'Canvas awnings', 'A bicycle against the wall'], refs: [{ id: 'alley-master', role: 'MASTER', assetId: 'loc-alley', label: 'Master plate' }, { id: 'alley-view-2', role: 'VIEW', assetId: 'loc-alley-view-2', label: 'Looking back' }, { id: 'alley-night', role: 'STATE', assetId: 'loc-alley-night', label: 'Night' }], masterAssetId: 'loc-alley', createdAt: day(2), updatedAt: day(2) },
  { id: 'rooftop', name: 'Karim’s Rooftop', nameAr: 'سطح كريم', kind: 'EXTERIOR', style: 'CARTOON', description: 'A flat roof with a water tank, a plastic chair, a line of washing, and the whole city below.', lighting: ['GOLDEN_HOUR', 'DUSK', 'NIGHT'], landmarks: ['Water tank — right, near', 'Plastic chair — centre, mid', 'City skyline — far'], props: ['Plastic chair', 'Washing line', 'A transistor radio'], refs: [{ id: 'rooftop-master', role: 'MASTER', assetId: 'loc-rooftop', label: 'Master plate' }, { id: 'rooftop-view-2', role: 'VIEW', assetId: 'loc-rooftop-view-2', label: 'Towards the tank' }, { id: 'rooftop-night', role: 'STATE', assetId: 'loc-rooftop-night', label: 'Night' }], masterAssetId: 'loc-rooftop', createdAt: day(4), updatedAt: day(4) },
  { id: 'riverbank', name: 'Tigris Riverbank', nameAr: 'ضفة دجلة', kind: 'EXTERIOR', style: 'REALISTIC', description: 'A stone embankment at dusk, string lights along the promenade, boats moored below, the far bank a line of windows.', lighting: ['GOLDEN_HOUR', 'DUSK', 'NIGHT'], landmarks: ['String lights — top, near to far', 'Moored boats — left, mid', 'Far bank — far'], props: ['String lights', 'Iron railing', 'Moored wooden boats'], refs: [{ id: 'river-master', role: 'MASTER', assetId: 'loc-riverbank', label: 'Master plate' }, { id: 'river-view-2', role: 'VIEW', assetId: 'loc-riverbank-view-2', label: 'From the water' }, { id: 'river-night', role: 'STATE', assetId: 'loc-riverbank-night', label: 'Night' }], masterAssetId: 'loc-riverbank', createdAt: day(8), updatedAt: day(8) },
];

// ----------------------------------------------------------------------------------------------------------- shows

export const SHOWS: Show[] = [
  { id: 'last-sip', title: 'The Last Sip', titleAr: 'آخر رشفة', logline: 'A Baghdad café where nobody pays and everybody stays.', genre: 'Comedy', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9', synopsis: 'Abu Samir has run the same café for forty years and has never once let a customer pay. His niece Layla arrives with a ledger, a plan and no patience. Between them: a poet who owes eleven teas, a cat who owns the counter, and a neighbourhood that would rather nothing changed.', coverAssetId: 'cover-last-sip', posterAssetId: 'poster-last-sip', castIds: ['abu-samir', 'layla', 'karim', 'the-cat'], locationIds: ['cafe', 'alley', 'rooftop'], createdAt: day(1), updatedAt: day(24) },
  { id: 'paper-kites', title: 'Paper Kites', titleAr: 'طيارات ورق', logline: 'Three children, one roof, a summer of small wars.', genre: 'Family drama', style: 'ANIME', language: 'AR', dialect: 'LEVANTINE', aspect: 'WIDE_16_9', synopsis: '', coverAssetId: 'cover-paper-kites', posterAssetId: 'poster-paper-kites', castIds: [], locationIds: ['rooftop'], createdAt: day(12), updatedAt: day(12) },
];

export const SEASONS: Season[] = [
  { id: 'last-sip-s1', showId: 'last-sip', number: 1, title: 'Opening Hours', arc: 'Abu Samir refuses to modernise; Layla modernises anyway; the café nearly closes and does not.', createdAt: day(1) },
  { id: 'last-sip-s2', showId: 'last-sip', number: 2, title: 'Under New Management', arc: 'Layla runs the café. Abu Samir becomes a customer and is worse at it than Karim.', createdAt: day(14) },
  { id: 'paper-kites-s1', showId: 'paper-kites', number: 1, title: 'Season 1', arc: '', createdAt: day(12) },
];

// ----------------------------------------------------------------------------------------------------------- shots

/** Take ids are global in the database, so each shot's takes are renamed `{shotId}-t{n}` here. */
function shot(id: string, sceneId: string, number: number, s: Partial<Shot> & Pick<Shot, 'purpose' | 'action' | 'framing' | 'characterIds' | 'durationSeconds'>): Shot {
  const given = s.takes ?? [];
  const takes = given.map((t, i) => ({ ...t, id: `${id}-t${i + 1}` }));
  const selectedTakeId = s.selectedTakeId ? takes[given.findIndex((t) => t.id === s.selectedTakeId)]?.id : undefined;
  return { id, sceneId, number, cameraMove: 'STATIC', dialogue: [], transition: 'CUT', ...s, takes, selectedTakeId };
}
const take = (n: number, note?: string): Shot['takes'][number] => ({ id: `t-${String(n).padStart(2, '0')}`, label: `Take ${n}`, assetId: `take-${String(n).padStart(2, '0')}`, createdAt: day(20, 8 + n), note, status: 'READY', provider: 'SAMPLE' });

// ----------------------------------------------------------------------------------------------------- productions

export const PRODUCTIONS: Production[] = [
  {
    id: 's1e1', kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s1', episodeNumber: 1, title: 'The Opening Hour', titleAr: 'ساعة الافتتاح', logline: 'Layla opens the café an hour early and discovers who actually comes at that hour.', synopsis: 'Layla wants morning trade. Abu Samir says there is no such thing. At seven she unlocks the door to find Karim asleep against it, the cat inside already, and a stranger who wants — impossibly — to pay. By the end of the hour nothing has changed except that everyone knows it could.', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9', targetSeconds: 300, stage: 'FINAL_CUT',
    brief: { mode: 'MANUAL', text: 'Pilot. Layla opens an hour early; Abu Samir predicts nobody; Karim is asleep on the step; a stranger tries to pay and is refused.' }, castIds: ['abu-samir', 'layla', 'karim', 'the-cat'], locationIds: ['cafe', 'alley'], coverAssetId: 'cover-s1e1', posterAssetId: 'poster-last-sip-s1e1', cutAssetId: 'cut-s1e1', createdAt: day(1), updatedAt: day(24, 16),
    scenes: [
      { id: 's1e1-sc1', number: 1, title: 'Before the door', locationId: 'alley', timeOfDay: 'DAWN', characterIds: ['layla', 'karim'], beats: [
        { id: 'b1', action: 'Layla walks the empty alley with the keys; the stalls are still shuttered.', lines: [] },
        { id: 'b2', action: 'She finds Karim asleep against the café door.', lines: [{ id: 'l1', characterId: 'layla', text: 'You could sleep at home like a normal person.', textAr: 'تكدر تنام ببيتك مثل الناس.' }, { id: 'l2', characterId: 'karim', text: 'Home has no tea.', textAr: 'البيت ما بي چاي.' }] },
      ] },
      { id: 's1e1-sc2', number: 2, title: 'The first hour', locationId: 'cafe', timeOfDay: 'MORNING', characterIds: ['layla', 'abu-samir', 'karim', 'the-cat'], beats: [
        { id: 'b3', action: 'Layla lights the samovar. Basbousa is already on the counter.', lines: [] },
        { id: 'b4', action: 'Abu Samir arrives, sees the lights on, and stops in the doorway.', lines: [{ id: 'l3', characterId: 'abu-samir', text: 'Who died?', textAr: 'منو مات؟' }, { id: 'l4', characterId: 'layla', text: 'The old hours.', textAr: 'الدوام القديم.' }] },
        { id: 'b5', action: 'A stranger enters, orders tea, and puts money on the counter. Silence.', lines: [{ id: 'l5', characterId: 'abu-samir', text: 'Put that away. We do not do that here.', textAr: 'شيل هذا. هنا ما نسوي هيچ.' }] },
      ] },
    ],
    shots: [
      shot('s1e1-1', 's1e1-sc1', 1, { purpose: 'Establish the alley at dawn', action: 'Layla walks towards camera down the shuttered alley, keys in hand.', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 5, characterIds: ['layla'], openingFrameAssetId: 'frame-01-a', endingFrameAssetId: 'frame-01-b', takes: [take(1, 'Walk is right; light a touch flat.'), take(2, 'Chosen — the awnings read.')], selectedTakeId: 't-02' }),
      shot('s1e1-2', 's1e1-sc1', 2, { purpose: 'The discovery', action: 'Layla stops. Karim is asleep against the door, notebook on his chest.', framing: 'MEDIUM', cameraMove: 'PUSH_IN', durationSeconds: 4, characterIds: ['layla', 'karim'], dialogue: [{ id: 'd1', characterId: 'layla', text: 'You could sleep at home like a normal person.', textAr: 'تكدر تنام ببيتك مثل الناس.' }], openingFrameAssetId: 'frame-02-a', endingFrameAssetId: 'frame-02-b', takes: [take(3)], selectedTakeId: 't-03' }),
      shot('s1e1-3', 's1e1-sc1', 3, { purpose: 'Karim’s answer', action: 'Karim opens one eye.', framing: 'CLOSE_UP', durationSeconds: 3, characterIds: ['karim'], dialogue: [{ id: 'd2', characterId: 'karim', text: 'Home has no tea.', textAr: 'البيت ما بي چاي.' }], openingFrameAssetId: 'frame-03-a', takes: [take(4, 'Eye opens too early.'), take(5)], selectedTakeId: 't-05' }),
      shot('s1e1-4', 's1e1-sc2', 1, { purpose: 'The café wakes', action: 'Layla lights the samovar; Basbousa watches from the counter.', framing: 'MEDIUM_WIDE', cameraMove: 'PAN_RIGHT', durationSeconds: 6, characterIds: ['layla', 'the-cat'], openingFrameAssetId: 'frame-04-a', endingFrameAssetId: 'frame-04-b', takes: [take(6)], selectedTakeId: 't-06' }),
      shot('s1e1-5', 's1e1-sc2', 2, { purpose: 'Abu Samir in the doorway', action: 'Abu Samir stops in the door, backlit by the alley.', framing: 'WIDE', durationSeconds: 4, characterIds: ['abu-samir'], dialogue: [{ id: 'd3', characterId: 'abu-samir', text: 'Who died?', textAr: 'منو مات؟' }], openingFrameAssetId: 'frame-05-a', takes: [take(7)], selectedTakeId: 't-07' }),
      shot('s1e1-6', 's1e1-sc2', 3, { purpose: 'The stranger pays', action: 'A hand puts a note on the counter. Everyone looks.', framing: 'INSERT', durationSeconds: 3, characterIds: [], openingFrameAssetId: 'frame-06-a', takes: [take(8)], selectedTakeId: 't-08' }),
      shot('s1e1-7', 's1e1-sc2', 4, { purpose: 'The refusal', action: 'Abu Samir slides the note back without looking at it.', framing: 'MEDIUM_CLOSE_UP', durationSeconds: 5, characterIds: ['abu-samir'], dialogue: [{ id: 'd4', characterId: 'abu-samir', text: 'Put that away. We do not do that here.', textAr: 'شيل هذا. هنا ما نسوي هيچ.' }], openingFrameAssetId: 'frame-07-a', endingFrameAssetId: 'frame-07-b', takes: [take(9)], selectedTakeId: 't-09' }),
    ],
  },
  {
    id: 's1e2', kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s1', episodeNumber: 2, title: 'The Debt', titleAr: 'الدين', logline: 'Karim’s eleven teas come due — in poetry.', synopsis: 'Layla starts a ledger. Karim, first on it, offers to settle in verse. Abu Samir, who has never accepted money, cannot decide whether a poem counts.', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9', targetSeconds: 300, stage: 'PRODUCE',
    brief: { mode: 'MANUAL', text: 'Layla starts a ledger; Karim owes eleven teas and offers a poem per tea.' }, castIds: ['abu-samir', 'layla', 'karim'], locationIds: ['cafe', 'rooftop'], coverAssetId: 'cover-s1e2', posterAssetId: 'poster-last-sip-s1e2', createdAt: day(6), updatedAt: day(23, 11),
    scenes: [
      { id: 's1e2-sc1', number: 1, title: 'The ledger', locationId: 'cafe', timeOfDay: 'AFTERNOON', characterIds: ['layla', 'karim', 'abu-samir'], beats: [{ id: 'b1', action: 'Layla opens a new notebook and writes KARIM at the top.', lines: [{ id: 'l1', characterId: 'karim', text: 'That is a lot of ink for one name.', textAr: 'هذا حبر كثير لاسم واحد.' }] }] },
      { id: 's1e2-sc2', number: 2, title: 'Rooftop rehearsal', locationId: 'rooftop', timeOfDay: 'GOLDEN_HOUR', characterIds: ['karim'], beats: [{ id: 'b2', action: 'Karim rehearses a poem to the water tank.', lines: [] }] },
    ],
    shots: [
      shot('s1e2-1', 's1e2-sc1', 1, { purpose: 'The ledger opens', action: 'Close on the notebook; KARIM is written in capitals.', framing: 'INSERT', durationSeconds: 3, characterIds: [], openingFrameAssetId: 'frame-08-a', takes: [take(1)], selectedTakeId: 't-01' }),
      shot('s1e2-2', 's1e2-sc1', 2, { purpose: 'Karim reacts', action: 'Karim leans over the counter to read it upside down.', framing: 'MEDIUM', durationSeconds: 4, characterIds: ['karim', 'layla'], dialogue: [{ id: 'd1', characterId: 'karim', text: 'That is a lot of ink for one name.', textAr: 'هذا حبر كثير لاسم واحد.' }], openingFrameAssetId: 'frame-09-a', endingFrameAssetId: 'frame-09-b', takes: [take(2), take(3)] }),
      shot('s1e2-3', 's1e2-sc1', 3, { purpose: 'Abu Samir weighs it', action: 'Abu Samir turns the beads, watching.', framing: 'MEDIUM_CLOSE_UP', durationSeconds: 4, characterIds: ['abu-samir'], openingFrameAssetId: 'frame-10-a', takes: [] }),
      shot('s1e2-4', 's1e2-sc2', 1, { purpose: 'The rehearsal', action: 'Karim, arms wide, recites to the tank as the sun drops.', framing: 'WIDE', cameraMove: 'CRANE_UP', durationSeconds: 7, characterIds: ['karim'], openingFrameAssetId: 'frame-11-a', takes: [] }),
      shot('s1e2-5', 's1e2-sc2', 2, { purpose: 'The city listens', action: 'Over Karim’s shoulder to the skyline.', framing: 'OVER_THE_SHOULDER', durationSeconds: 5, characterIds: ['karim'], takes: [] }),
    ],
  },
  {
    id: 's2e1', kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s2', episodeNumber: 1, title: 'New Management', titleAr: 'إدارة جديدة', logline: 'Layla’s first day in charge; Abu Samir’s first day as a customer.', synopsis: '', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9', targetSeconds: 300, stage: 'STORY',
    brief: { mode: 'AUTO_IDEA', ideaTitle: 'The regular who becomes the owner’s worst customer', text: 'Example idea: a role reversal in a familiar place. Abu Samir sits where Karim sits and discovers what his café is like from the other side of the counter.' }, castIds: ['abu-samir', 'layla', 'karim', 'the-cat'], locationIds: ['cafe'], coverAssetId: 'cover-s2e1', posterAssetId: 'poster-last-sip-s2e1', createdAt: day(14), updatedAt: day(22, 9),
    scenes: [], shots: [],
  },
  {
    id: 'night-tray', kind: 'SHORT', title: 'Night Tray', titleAr: 'صينية الليل', logline: 'A night nurse carries a tray down a corridor that will not end.', synopsis: 'Three a.m. Hana carries a tray to room 12. The corridor is longer than it was. Doors she does not remember. When she arrives, the room is her own, and someone has left her tea.', style: 'ANIME', language: 'EN', aspect: 'VERTICAL_9_16', targetSeconds: 60, stage: 'STORYBOARD',
    brief: { mode: 'MANUAL', text: 'A night nurse, a tray, a corridor that gets longer. Quiet, uncanny, kind at the end.' }, castIds: ['hana'], locationIds: [], coverAssetId: 'cover-night-tray', posterAssetId: 'poster-night-tray', createdAt: day(5), updatedAt: day(21, 20),
    scenes: [
      { id: 'nt-sc1', number: 1, title: 'The corridor', timeOfDay: 'NIGHT', characterIds: ['hana'], beats: [{ id: 'b1', action: 'Hana lifts a tray from the station and starts down the corridor.', lines: [] }, { id: 'b2', action: 'The corridor stretches; the numbers on the doors stop making sense.', lines: [{ id: 'l1', characterId: 'hana', text: 'Twelve. Twelve. Where is twelve.' }] }, { id: 'b3', action: 'She reaches a door and pushes it open: her own flat, a cup of tea on the table.', lines: [] }] },
    ],
    shots: [
      shot('nt-1', 'nt-sc1', 1, { purpose: 'Lift the tray', action: 'Hana lifts the tray; the station clock reads 3:02.', framing: 'MEDIUM', durationSeconds: 4, characterIds: ['hana'], openingFrameAssetId: 'vframe-1-a', takes: [{ id: 'nt-t1', label: 'Take 1', assetId: 'take-vertical-01', createdAt: day(21), status: 'READY', provider: 'SAMPLE' }], selectedTakeId: 'nt-t1' }),
      shot('nt-2', 'nt-sc1', 2, { purpose: 'The walk', action: 'Following Hana down the corridor; doors pass, too many.', framing: 'MEDIUM_WIDE', cameraMove: 'FOLLOW', durationSeconds: 8, characterIds: ['hana'], openingFrameAssetId: 'vframe-2-a', takes: [] }),
      shot('nt-3', 'nt-sc1', 3, { purpose: 'Lost', action: 'Hana stops. Looks at a door number that is not a number.', framing: 'CLOSE_UP', durationSeconds: 4, characterIds: ['hana'], dialogue: [{ id: 'd1', characterId: 'hana', text: 'Twelve. Twelve. Where is twelve.' }], openingFrameAssetId: 'vframe-3-a', takes: [] }),
      shot('nt-4', 'nt-sc1', 4, { purpose: 'Home', action: 'The door opens onto her own kitchen; tea steaming on the table.', framing: 'WIDE', cameraMove: 'PUSH_IN', durationSeconds: 6, characterIds: ['hana'], openingFrameAssetId: 'vframe-4-a', takes: [] }),
    ],
  },
  {
    id: 'river-lights', kind: 'MUSIC_VIDEO', title: 'River Lights', titleAr: 'أضواء النهر', logline: 'Nour sings to a city from the bank of its river.', synopsis: 'A performance at dusk on the embankment, cut with the string lights coming on one by one.', style: 'REALISTIC', language: 'AR', dialect: 'MSA', aspect: 'WIDE_16_9', targetSeconds: 120, stage: 'CAST_AND_WORLD',
    brief: { mode: 'MANUAL', text: 'A dusk performance on the Tigris embankment. Nour alone; the lights come on with the chorus.' }, castIds: ['nour'], locationIds: ['riverbank'], coverAssetId: 'cover-river-lights', posterAssetId: 'square-river-lights', artist: 'Nour', concept: 'PERFORMANCE', genre: 'Ballad', mood: 'Dusk, warm, unhurried', createdAt: day(8), updatedAt: day(23, 18),
    song: { id: 'song-rl', title: 'River Lights', source: 'GENERATED_EXAMPLE', assetId: 'song-river-lights', durationSeconds: 48, caption: 'Slow, warm, a low alto over piano and strings; dusk on a river; the chorus opens up.', singerIds: ['nour'], sections: [
      { id: 'sec1', kind: 'INTRO', text: '', singerIds: [], from: 0, to: 8 },
      { id: 'sec2', kind: 'VERSE', text: 'The river keeps the lights it borrows,\nreturns them one by one at dawn.', textAr: 'النهر يحفظ الأضواء التي يستعيرها\nويردّها واحداً واحداً مع الفجر', singerIds: ['nour'], from: 8, to: 24 },
      { id: 'sec3', kind: 'CHORUS', text: 'Stay till the last one’s gone,\nstay till the river’s dark.', textAr: 'ابقَ حتى يذهب آخرها\nابقَ حتى يُظلم النهر', singerIds: ['nour'], from: 24, to: 40 },
      { id: 'sec4', kind: 'OUTRO', text: '', singerIds: [], from: 40, to: 48 },
    ] },
    scenes: [{ id: 'rl-sc1', number: 1, title: 'The embankment', locationId: 'riverbank', timeOfDay: 'DUSK', characterIds: ['nour'], beats: [{ id: 'b1', action: 'Nour stands at the rail as the lights come on behind her.', lines: [] }] }],
    shots: [
      shot('rl-1', 'rl-sc1', 1, { purpose: 'Intro — the river alone', action: 'Boats and water; a single string light flickers on.', framing: 'EXTREME_WIDE', cameraMove: 'PUSH_IN', durationSeconds: 8, characterIds: [], songWindow: { from: 0, to: 8 }, openingFrameAssetId: 'frame-12-a', takes: [] }),
      shot('rl-2', 'rl-sc1', 2, { purpose: 'Verse — Nour at the rail', action: 'Nour sings the verse to the water, barely moving.', framing: 'MEDIUM_CLOSE_UP', durationSeconds: 8, characterIds: ['nour'], songWindow: { from: 8, to: 16 }, openingFrameAssetId: 'frame-13-a', takes: [] }),
      shot('rl-3', 'rl-sc1', 3, { purpose: 'Chorus — the lights', action: 'Pull back as every light along the bank comes on.', framing: 'WIDE', cameraMove: 'PULL_BACK', durationSeconds: 8, characterIds: ['nour'], songWindow: { from: 24, to: 32 }, openingFrameAssetId: 'frame-14-a', takes: [] }),
    ],
  },
];

const MORE: Production[] = [
  {
    id: 'paper-boats', kind: 'SHORT', title: 'Paper Boats', titleAr: 'قوارب ورقية', logline: 'Two brothers race paper boats down a gutter after the first rain in a year.', synopsis: 'The rain comes at four. By half past, the street is a river and the brothers are at the kerb with a week of homework folded into boats. The younger one’s boat wins; the older one says it does not count. It counts.', style: 'REALISTIC', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 90, stage: 'STORYBOARD',
    brief: { mode: 'MANUAL', text: 'Two brothers, first rain, paper boats in the gutter. Ninety seconds, no dialogue.' }, castIds: [], locationIds: ['alley'], coverAssetId: 'cover-paper-boats', posterAssetId: 'poster-paper-boats', createdAt: day(16), updatedAt: day(22, 14),
    scenes: [{ id: 'pb-sc1', number: 1, title: 'The kerb', locationId: 'alley', timeOfDay: 'AFTERNOON', characterIds: [], beats: [{ id: 'b1', action: 'Rain on the awnings; the gutter fills; two boats set off.', lines: [] }] }],
    shots: [
      shot('pb-1', 'pb-sc1', 1, { purpose: 'The rain arrives', action: 'Awnings darken; the first drops hit the books.', framing: 'WIDE', durationSeconds: 5, characterIds: [], openingFrameAssetId: 'frame-15-a', endingFrameAssetId: 'frame-15-b', takes: [take(1)], selectedTakeId: 't-01' }),
      shot('pb-2', 'pb-sc1', 2, { purpose: 'Two boats set off', action: 'Insert: two paper boats dropped into the running gutter.', framing: 'INSERT', cameraMove: 'FOLLOW', durationSeconds: 6, characterIds: [], openingFrameAssetId: 'frame-16-a', takes: [] }),
      shot('pb-3', 'pb-sc1', 3, { purpose: 'The finish', action: 'The smaller boat reaches the drain first.', framing: 'CLOSE_UP', durationSeconds: 4, characterIds: [], openingFrameAssetId: 'frame-17-a', takes: [] }),
    ],
  },
  {
    id: 'rooftop-radio', kind: 'MUSIC_VIDEO', title: 'Rooftop Radio', titleAr: 'راديو السطح', logline: 'An up-tempo track about a city that talks to itself across the roofs at night.', synopsis: 'Layla and Karim on the rooftop with a transistor radio, the city answering back window by window.', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9', targetSeconds: 36, stage: 'STORY',
    brief: { mode: 'AUTO_IDEA', ideaTitle: 'Rooftop Radio', text: 'Example idea: an up-tempo track about a city that talks to itself across the roofs at night.' }, castIds: ['layla', 'karim'], locationIds: ['rooftop'], coverAssetId: 'cover-rooftop-radio', posterAssetId: 'square-rooftop-radio', artist: 'Layla & Karim', concept: 'NARRATIVE', genre: 'Pop', mood: 'Night, up-tempo, bright', createdAt: day(18), updatedAt: day(23, 21),
    song: { id: 'song-rr', title: 'Rooftop Radio', source: 'UPLOADED', assetId: 'song-uploaded', durationSeconds: 36, caption: '', singerIds: ['layla', 'karim'], sections: [
      { id: 'rr1', kind: 'INTRO', text: '', singerIds: [], from: 0, to: 6 },
      { id: 'rr2', kind: 'VERSE', text: 'Turn the dial, the city’s talking,\nevery window has a song.', textAr: 'أدِر المؤشّر، المدينة تتكلّم\nكل شبّاك عنده أغنية', singerIds: ['layla'], from: 6, to: 18 },
      { id: 'rr3', kind: 'CHORUS', text: 'Rooftop radio, keep us up all night.', textAr: 'راديو السطح، خلّينا صاحين طول الليل', singerIds: ['layla', 'karim'], from: 18, to: 30 },
      { id: 'rr4', kind: 'OUTRO', text: '', singerIds: [], from: 30, to: 36 },
    ] },
    scenes: [], shots: [],
  },
];
PRODUCTIONS.push(...MORE);


/** Usage as a backend would have recorded it when each sample take was made: every character in a shot that has a
 *  take has been in a video. Um Hassan keeps her `known: false` — her history is unknown, so she counts as used. */
function withRecordedUsage(characters: Character[], productions: Production[]): Character[] {
  return characters.map((c) => {
    if (c.usage && !c.usage.known) return c;
    const videos = productions.flatMap((p) => p.shots.flatMap((sh) => (sh.characterIds.includes(c.id) ? sh.takes.map((t) => ({
      productionId: p.id, productionTitle: p.title, shotId: sh.id, shotLabel: `${p.scenes.find((sc) => sc.id === sh.sceneId)?.number ?? '?'}.${sh.number}`, takeId: t.id, takeLabel: t.label, recordedAt: t.createdAt, status: 'IN_TAKE' as const,
    })) : [])));
    return { ...c, usage: { known: true, videos } };
  });
}

/** A fresh copy of the sample studio. */
export function seed(): StudioState {
  return structuredClone({ version: STATE_VERSION, shows: SHOWS, seasons: SEASONS, productions: PRODUCTIONS, characters: withRecordedUsage(CHARACTERS, PRODUCTIONS), locations: LOCATIONS, assets: ASSETS, settings: DEFAULT_SETTINGS });
}

