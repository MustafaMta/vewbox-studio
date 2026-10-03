/** SPECIMEN CONTENT for the /kit media, players and cutting-room sections (dev only). The media are the bundled files
 *  in public/sample; the names, roles and lines below are the sample studio's own, written here in both languages so
 *  the specimens follow the interface language. This is not the sample fixture (src/domain/sample.ts stays server-
 *  and test-only, tests/unit/sample-fixture.test.ts): nothing here is product content or a record. */

export type L = { en: string; ar: string };
export const pick = (locale: string, l: L) => (locale === 'ar' ? l.ar : l.en);
const S = (p: string) => `/sample/${p}`;

export const SHOWS = [
  { id: 'last-sip', title: { en: 'The Last Sip', ar: 'آخر رشفة' }, logline: { en: 'A Baghdad café where nobody pays and everybody stays.', ar: 'مقهى في بغداد لا يدفع فيه أحد ويبقى فيه الجميع.' }, art: S('covers/last-sip.svg'), poster: S('covers/last-sip-poster.svg') },
  { id: 'paper-kites', title: { en: 'Paper Kites', ar: 'طيارات ورق' }, logline: { en: 'Three children, one roof, a summer of small wars.', ar: 'ثلاثة أطفال وسطح واحد وصيف من الحروب الصغيرة.' }, art: S('covers/paper-kites.svg'), poster: S('covers/paper-kites-poster.svg') },
  { id: 'night-tray', title: { en: 'Night Tray', ar: 'صينية الليل' }, logline: { en: 'A night nurse carries a tray down a corridor that will not end.', ar: 'ممرّضة ليلية تحمل صينية في ممرّ لا ينتهي.' }, art: null, poster: null },
];

export const SHORTS = [
  { id: 'paper-boats', title: { en: 'Paper Boats', ar: 'قوارب ورقية' }, poster: S('covers/paper-boats-poster.svg'), runtime: 2 },
  { id: 'night-tray', title: { en: 'Night Tray', ar: 'صينية الليل' }, poster: S('covers/night-tray-poster.svg'), runtime: 1 },
  { id: 's1e1', title: { en: 'The Opening Hour', ar: 'ساعة الافتتاح' }, poster: S('covers/last-sip-s1e1-poster.svg'), runtime: 5 },
  { id: 's1e2', title: { en: 'The Debt', ar: 'الدين' }, poster: S('covers/last-sip-s1e2-poster.svg'), runtime: 5 },
  { id: 'untitled', title: { en: 'Your first short', ar: 'فيلمك القصير الأول' }, poster: null, runtime: 0 },
];

export const SONGS = [
  { id: 'river-lights', title: { en: 'River Lights', ar: 'أضواء النهر' }, sleeve: S('covers/river-lights-square.svg'), audio: S('audio/river-lights-sample.m4a'), duration: 48, performers: { en: 'Nour', ar: 'نور' } },
  { id: 'rooftop-radio', title: { en: 'Rooftop Radio', ar: 'راديو السطح' }, sleeve: S('covers/rooftop-radio-square.svg'), audio: S('audio/uploaded-track-sample.m4a'), duration: 36, performers: { en: 'Layla & Karim', ar: 'ليلى وكريم' } },
  { id: 'untitled-song', title: { en: 'Untitled song', ar: 'أغنية بلا عنوان' }, sleeve: null, audio: null, duration: 0, performers: null },
];

export const PEOPLE = [
  { id: 'abu-samir', name: { en: 'Abu Samir', ar: 'أبو سمير' }, role: { en: 'Café owner, sixty, unhurried', ar: 'صاحب المقهى، في الستين، لا يستعجل' }, src: S('characters/abu-samir.svg'), voice: S('audio/voice-low-sample.m4a') },
  { id: 'layla', name: { en: 'Layla', ar: 'ليلى' }, role: { en: 'His niece, runs the counter', ar: 'ابنة أخيه، تدير المنضدة' }, src: S('characters/layla.svg'), voice: S('audio/voice-bright-sample.m4a') },
  { id: 'karim', name: { en: 'Karim', ar: 'كريم' }, role: { en: 'Regular customer, aspiring poet', ar: 'زبون دائم، شاعر طموح' }, src: S('characters/karim.svg'), voice: S('audio/voice-soft-sample.m4a') },
  { id: 'hana', name: { en: 'Hana', ar: 'هناء' }, role: { en: 'Night nurse', ar: 'ممرّضة ليلية' }, src: S('characters/hana-full-body.svg'), voice: null },
  { id: 'nour', name: { en: 'Nour', ar: 'نور' }, role: { en: 'Singer', ar: 'مغنّية' }, src: S('characters/nour.svg'), voice: S('audio/voice-warm-sample.m4a') },
  { id: 'um-hassan', name: { en: 'Um Hassan', ar: 'أم حسن' }, role: { en: 'Baker across the alley', ar: 'خبّازة في الزقاق المقابل' }, src: null, voice: null },
];

export const PLACES = [
  { id: 'cafe', name: { en: 'Abu Samir’s Café', ar: 'قهوة أبو سمير' }, plate: S('locations/cafe.svg'), night: S('locations/cafe-night.svg'), view: S('locations/cafe-view-2.svg') },
  { id: 'riverbank', name: { en: 'Tigris Riverbank', ar: 'ضفة دجلة' }, plate: S('locations/riverbank.svg'), night: S('locations/riverbank-night.svg'), view: S('locations/riverbank-view-2.svg') },
  { id: 'rooftop', name: { en: 'Karim’s Rooftop', ar: 'سطح كريم' }, plate: S('locations/rooftop.svg'), night: S('locations/rooftop-night.svg'), view: S('locations/rooftop-view-2.svg') },
];

/** The Opening Hour: seven shots, their opening frames, their takes and the assembled cut (12 s). */
export const EPISODE = {
  title: { en: 'The Opening Hour', ar: 'ساعة الافتتاح' },
  synopsis: { en: 'Layla opens the café an hour early and discovers who actually comes at that hour.', ar: 'تفتح ليلى المقهى قبل موعده بساعة فتكتشف من يأتي فعلاً في تلك الساعة.' },
  cut: S('takes/assembled-cut-sample.mp4'),
  still: S('covers/last-sip-s1e1.svg'),
  shots: [
    { id: 's1', n: 1, frame: S('frames/frame-01-a.svg'), take: S('takes/take-02.mp4'), d: 5, purpose: { en: 'Establish the alley at dawn', ar: 'تأسيس الزقاق عند الفجر' } },
    { id: 's2', n: 2, frame: S('frames/frame-02-a.svg'), take: S('takes/take-03.mp4'), d: 4, purpose: { en: 'The discovery', ar: 'الاكتشاف' }, line: { en: 'You could sleep at home like a normal person.', ar: 'تكدر تنام ببيتك مثل الناس.' } },
    { id: 's3', n: 3, frame: S('frames/frame-03-a.svg'), take: S('takes/take-05.mp4'), d: 3, purpose: { en: 'Karim’s answer', ar: 'جواب كريم' }, line: { en: 'Home has no tea.', ar: 'البيت ما بي چاي.' } },
    { id: 's4', n: 4, frame: S('frames/frame-04-a.svg'), take: S('takes/take-06.mp4'), d: 6, purpose: { en: 'The café wakes', ar: 'المقهى يستيقظ' } },
    { id: 's5', n: 5, frame: S('frames/frame-05-a.svg'), take: S('takes/take-07.mp4'), d: 4, purpose: { en: 'Abu Samir in the doorway', ar: 'أبو سمير عند الباب' }, line: { en: 'Who died?', ar: 'منو مات؟' } },
    { id: 's6', n: 6, frame: null, take: null, d: 3, purpose: { en: 'The stranger pays', ar: 'الغريب يدفع' } },
    { id: 's7', n: 7, frame: S('frames/frame-07-a.svg'), take: S('takes/take-09.mp4'), d: 5, purpose: { en: 'The refusal', ar: 'الرفض' } },
  ],
};

/** River Lights: its sections and lines (the verse in English, the chorus in Arabic, as written). */
export const RIVER_LIGHTS = {
  sections: [
    { id: 'sec1', name: { en: 'Intro', ar: 'المقدّمة' }, singer: null, done: 1, total: 1, from: 0, to: 8 },
    { id: 'sec2', name: { en: 'Verse', ar: 'المقطع' }, singer: 'nour', done: 1, total: 2, from: 8, to: 24 },
    { id: 'sec3', name: { en: 'Chorus', ar: 'اللازمة' }, singer: 'nour', done: 0, total: 1, from: 24, to: 40 },
    { id: 'sec4', name: { en: 'Outro', ar: 'الخاتمة' }, singer: null, done: 0, total: 0, from: 40, to: 48 },
  ],
  lines: [
    { id: 'l1', section: 'sec2', text: 'The river keeps the lights it borrows,', lang: 'en', from: 8, to: 16 },
    { id: 'l2', section: 'sec2', text: 'returns them one by one at dawn.', lang: 'en', from: 16, to: 24 },
    { id: 'l3', section: 'sec3', text: 'ابقَ حتى يذهب آخرها', lang: 'ar', from: 24, to: 32 },
    { id: 'l4', section: 'sec3', text: 'ابقَ حتى يُظلم النهر', lang: 'ar', from: 32, to: 40 },
  ],
};
