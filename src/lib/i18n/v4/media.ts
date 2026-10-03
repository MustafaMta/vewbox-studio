/** MEDIA STRINGS — owned by F3 (media kit and players).
 *  docs/DESIGN-SYSTEM-V4.md §8.2 rule 3: the dictionary is one file per package, merged by src/lib/i18n.ts. The keys
 *  below were moved here from src/lib/i18n.ts unchanged (tests/unit/i18n-split.test.ts proves every key and both
 *  languages survived). New keys go here only, under the `media.` prefix. Deleting old keys is Q1's job. */
export const media = {
  // players
  'player.audio': ['Audio', 'صوت'],
  'player.video': ['Video', 'فيديو'],
  'player.song': ['Song', 'الأغنية'],
  'player.volume': ['Volume', 'مستوى الصوت'],
  'player.mute': ['Mute', 'كتم الصوت'],
  'player.unmute': ['Unmute', 'إلغاء الكتم'],
  'player.replay': ['Replay', 'إعادة من البداية'],
  'player.loading': ['Loading the file…', 'جارٍ تحميل الملف…'],
  'player.captions': ['Captions', 'الترجمة'],
  'player.fullscreen': ['Fullscreen', 'ملء الشاشة'],
  'player.exitFullscreen': ['Exit fullscreen', 'الخروج من ملء الشاشة'],
  'player.prevFrame': ['Previous frame', 'الإطار السابق'],
  'player.nextFrame': ['Next frame', 'الإطار التالي'],
  'player.videoFailed': ['This clip can’t be played', 'لا يمكن تشغيل هذا المقطع'],
  'player.videoFailed.hint': ['The file is missing or in a format this browser does not play.', 'الملف مفقود أو بصيغة لا يشغّلها هذا المتصفح.'],
  'player.noTake.hint': ['A take appears here once one exists. Generate one from the shot, or upload a clip.', 'تظهر اللقطة هنا حين توجد. ولّد واحدة من اللقطة أو ارفع مقطعاً.'],
} as const satisfies Record<string, readonly [string, string]>;
