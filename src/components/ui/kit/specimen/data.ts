/** SPECIMEN CONTENT for the /kit media, players and cutting-room sections (dev only). The media are the bundled files
 *  in public/sample; the names, roles and lines below are the sample studio's own. The one piece of Arabic is content
 *  (River Lights' chorus, as written), which shows how film content in another script renders inside the English
 *  interface. This is not the sample fixture (src/domain/sample.ts stays server- and test-only,
 *  tests/unit/sample-fixture.test.ts): nothing here is product content or a record. */

const S = (p: string) => `/sample/${p}`;

export const SHOWS = [
  { id: 'last-sip', title: 'The Last Sip', logline: 'A Baghdad café where nobody pays and everybody stays.', art: S('covers/last-sip.svg'), poster: S('covers/last-sip-poster.svg') },
  { id: 'paper-kites', title: 'Paper Kites', logline: 'Three children, one roof, a summer of small wars.', art: S('covers/paper-kites.svg'), poster: S('covers/paper-kites-poster.svg') },
  { id: 'night-tray', title: 'Night Tray', logline: 'A night nurse carries a tray down a corridor that will not end.', art: null, poster: null },
];

export const SHORTS = [
  { id: 'paper-boats', title: 'Paper Boats', poster: S('covers/paper-boats-poster.svg'), runtime: 2 },
  { id: 'night-tray', title: 'Night Tray', poster: S('covers/night-tray-poster.svg'), runtime: 1 },
  { id: 's1e1', title: 'The Opening Hour', poster: S('covers/last-sip-s1e1-poster.svg'), runtime: 5 },
  { id: 's1e2', title: 'The Debt', poster: S('covers/last-sip-s1e2-poster.svg'), runtime: 5 },
  { id: 'untitled', title: 'Your first short', poster: null, runtime: 0 },
];

export const SONGS = [
  { id: 'river-lights', title: 'River Lights', sleeve: S('covers/river-lights-square.svg'), audio: S('audio/river-lights-sample.m4a'), duration: 48, performers: 'Nour' },
  { id: 'rooftop-radio', title: 'Rooftop Radio', sleeve: S('covers/rooftop-radio-square.svg'), audio: S('audio/uploaded-track-sample.m4a'), duration: 36, performers: 'Layla & Karim' },
  { id: 'untitled-song', title: 'Untitled song', sleeve: null, audio: null, duration: 0, performers: null },
];

export const PEOPLE = [
  { id: 'abu-samir', name: 'Abu Samir', role: 'Café owner, sixty, unhurried', src: S('characters/abu-samir.svg'), voice: S('audio/voice-low-sample.m4a') },
  { id: 'layla', name: 'Layla', role: 'His niece, runs the counter', src: S('characters/layla.svg'), voice: S('audio/voice-bright-sample.m4a') },
  { id: 'karim', name: 'Karim', role: 'Regular customer, aspiring poet', src: S('characters/karim.svg'), voice: S('audio/voice-soft-sample.m4a') },
  { id: 'hana', name: 'Hana', role: 'Night nurse', src: S('characters/hana-full-body.svg'), voice: null },
  { id: 'nour', name: 'Nour', role: 'Singer', src: S('characters/nour.svg'), voice: S('audio/voice-warm-sample.m4a') },
  { id: 'um-hassan', name: 'Um Hassan', role: 'Baker across the alley', src: null, voice: null },
];

export const PLACES = [
  { id: 'cafe', name: 'Abu Samir’s Café', plate: S('locations/cafe.svg'), night: S('locations/cafe-night.svg'), view: S('locations/cafe-view-2.svg') },
  { id: 'riverbank', name: 'Tigris Riverbank', plate: S('locations/riverbank.svg'), night: S('locations/riverbank-night.svg'), view: S('locations/riverbank-view-2.svg') },
  { id: 'rooftop', name: 'Karim’s Rooftop', plate: S('locations/rooftop.svg'), night: S('locations/rooftop-night.svg'), view: S('locations/rooftop-view-2.svg') },
];

/** The Opening Hour: seven shots, their opening frames, their takes and the assembled cut (12 s). */
export const EPISODE = {
  title: 'The Opening Hour',
  synopsis: 'Layla opens the café an hour early and discovers who actually comes at that hour.',
  cut: S('takes/assembled-cut-sample.mp4'),
  still: S('covers/last-sip-s1e1.svg'),
  shots: [
    { id: 's1', n: 1, frame: S('frames/frame-01-a.svg'), take: S('takes/take-02.mp4'), d: 5, purpose: 'Establish the alley at dawn' },
    { id: 's2', n: 2, frame: S('frames/frame-02-a.svg'), take: S('takes/take-03.mp4'), d: 4, purpose: 'The discovery', line: 'You could sleep at home like a normal person.' },
    { id: 's3', n: 3, frame: S('frames/frame-03-a.svg'), take: S('takes/take-05.mp4'), d: 3, purpose: 'Karim’s answer', line: 'Home has no tea.' },
    { id: 's4', n: 4, frame: S('frames/frame-04-a.svg'), take: S('takes/take-06.mp4'), d: 6, purpose: 'The café wakes' },
    { id: 's5', n: 5, frame: S('frames/frame-05-a.svg'), take: S('takes/take-07.mp4'), d: 4, purpose: 'Abu Samir in the doorway', line: 'Who died?' },
    { id: 's6', n: 6, frame: null, take: null, d: 3, purpose: 'The stranger pays' },
    { id: 's7', n: 7, frame: S('frames/frame-07-a.svg'), take: S('takes/take-09.mp4'), d: 5, purpose: 'The refusal' },
  ],
};

/** River Lights: its sections and lines (the verse in English, the chorus in Arabic, as written). */
export const RIVER_LIGHTS = {
  sections: [
    { id: 'sec1', name: 'Intro', singer: null, done: 1, total: 1, from: 0, to: 8 },
    { id: 'sec2', name: 'Verse', singer: 'nour', done: 1, total: 2, from: 8, to: 24 },
    { id: 'sec3', name: 'Chorus', singer: 'nour', done: 0, total: 1, from: 24, to: 40 },
    { id: 'sec4', name: 'Outro', singer: null, done: 0, total: 0, from: 40, to: 48 },
  ],
  lines: [
    { id: 'l1', section: 'sec2', text: 'The river keeps the lights it borrows,', lang: 'en', from: 8, to: 16 },
    { id: 'l2', section: 'sec2', text: 'returns them one by one at dawn.', lang: 'en', from: 16, to: 24 },
    { id: 'l3', section: 'sec3', text: 'ابقَ حتى يذهب آخرها', lang: 'ar', from: 24, to: 32 },
    { id: 'l4', section: 'sec3', text: 'ابقَ حتى يُظلم النهر', lang: 'ar', from: 32, to: 40 },
  ],
};
