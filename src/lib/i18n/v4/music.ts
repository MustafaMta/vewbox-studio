/** MUSIC STRINGS — owned by P1c (Music videos).
 *  docs/DESIGN-SYSTEM-V4.md §8.2 rule 3: the dictionary is one file per package, merged by src/lib/i18n.ts. The keys
 *  below were moved here from src/lib/i18n.ts unchanged (tests/unit/i18n-split.test.ts proves every key and both
 *  languages survived). New keys go here only, under the `music.` prefix. Deleting old keys is Q1's job. */
export const music = {
  // songs
  'song.title': ['Song', 'الأغنية'],
  'song.generated': ['Generated song', 'أغنية مولّدة'],
  'song.notRecorded': ['Not recorded yet', 'لم تُسجَّل بعد'],
  'song.uploaded': ['Uploaded track', 'مقطوعة مرفوعة'],
  'song.sections': ['Sections', 'المقاطع'],
  'song.singers': ['Singers', 'المغنّون'],
  'song.lyrics': ['Lyrics', 'الكلمات'],
  'song.noSong': ['No song yet.', 'لا أغنية بعد.'],
  'song.replace': ['Replace song', 'استبدل الأغنية'],
  'song.playback': ['Playback', 'التشغيل'],
  // music video workspace
  'mv.lyrics.hint': ['Write the lyrics as sections. Select a section to set who sings it and when.', 'اكتب الكلمات كمقاطع. اختر مقطعاً لتحديد من يغنّيه ومتى.'],
  'mv.sectionTiming': ['Timing', 'التوقيت'],
  'mv.sectionSingers': ['Sung by', 'يغنّيه'],
  'mv.from': ['From', 'من'],
  'mv.to': ['To', 'إلى'],
  'mv.noSection': ['Select a section to see who sings it and when.', 'اختر مقطعاً لترى من يغنّيه ومتى.'],
  'mv.performers.hint': ['Who sings and how they sound. Each performer’s voice is chosen on their character page.', 'من يغنّي وكيف يبدو صوته. يُختار صوت كل مؤدٍّ في صفحة شخصيته.'],
  'mv.addPerformer': ['Add performer', 'أضف مؤدّياً'],
  'mv.lead': ['Lead', 'رئيسي'],
  'mv.sections': ['sections', 'مقاطع'],
  'mv.visual.hint': ['How the song is seen: the performer on camera, a story under the song, or both.', 'كيف تُرى الأغنية: المؤدّي أمام الكاميرا، أو قصة تحت الأغنية، أو كلاهما.'],
  'mv.concept.PERFORMANCE': ['Performance', 'أداء'],
  'mv.concept.PERFORMANCE.hint': ['The singer on camera, in the location, for the whole song.', 'المغنّي أمام الكاميرا في الموقع طوال الأغنية.'],
  'mv.concept.NARRATIVE': ['Narrative', 'سردي'],
  'mv.concept.NARRATIVE.hint': ['A story told under the song; the singer may never appear.', 'قصة تُروى تحت الأغنية؛ قد لا يظهر المغنّي.'],
  'mv.concept.MIXED': ['Mixed', 'مختلط'],
  'mv.concept.MIXED.hint': ['Performance cut with story; the chorus returns to the singer.', 'أداء مقطوع بقصة؛ اللازمة تعود إلى المغنّي.'],
  'mv.waveform': ['Waveform, from the audio file', 'شكل الموجة من الملف الصوتي'],
  'mv.noAudio': ['No audio yet. The song plays once a track exists.', 'لا صوت بعد. تُشغَّل الأغنية عند وجود مقطوعة.'],
  'mv.nowPlaying': ['Now playing', 'يُشغَّل الآن'],
  'song.noWordsYet': ['No words yet — select to write them.', 'لا كلمات بعد — اختر المقطع لكتابتها.'],
  'mv.waveformUnavailable': ['The waveform could not be drawn from this file.', 'تعذّر رسم شكل الموجة من هذا الملف.'],
} as const satisfies Record<string, readonly [string, string]>;
