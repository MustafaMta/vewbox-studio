/** SHELL STRINGS — owned by F4 (shell and navigation).
 *  docs/DESIGN-SYSTEM-V4.md §8.2 rule 3: the dictionary is one file per package, merged by src/lib/i18n.ts. The keys
 *  below were moved here from src/lib/i18n.ts unchanged (tests/unit/i18n-split.test.ts proves every key and both
 *  languages survived). New keys go here only, under the `shell.` prefix. Deleting old keys is Q1's job. */
export const shell = {
  // navigation
  'nav.shows': ['Shows', 'المسلسلات'],
  'nav.shorts': ['Shorts', 'الأفلام القصيرة'],
  'nav.musicVideos': ['Music Videos', 'الفيديوهات الموسيقية'],
  'nav.characters': ['Characters', 'الشخصيات'],
  'nav.locations': ['Locations', 'المواقع'],
  'nav.assets': ['Asset Library', 'مكتبة الأصول'],
  'nav.settings': ['Settings', 'الإعدادات'],
  'nav.more': ['More', 'المزيد'],
  'nav.areas': ['Studio areas', 'أقسام الاستوديو'],
  'app.name': ['Vewbox Studio', 'استوديو فيوبوكس'],

  // home
  'home.continue': ['Continue working', 'واصل العمل'],
  'home.startFirst': ['Start your first production.', 'ابدأ إنتاجك الأول.'],
  // the restored shell
  'nav.newProduction': ['New production', 'إنتاج جديد'],
  'nav.openMenu': ['Open menu', 'افتح القائمة'],
  'nav.closeMenu': ['Close menu', 'أغلق القائمة'],
  'nav.skip': ['Skip to content', 'انتقل إلى المحتوى'],
  'app.tagline': ['Film production', 'إنتاج سينمائي'],
  'home.inProduction': ['In production', 'قيد الإنتاج'],
  'home.startNew': ['Start something new', 'ابدأ شيئاً جديداً'],
  'home.viewAll': ['View all', 'عرض الكل'],
  'app.saved': ['Saved on the studio server', 'محفوظ على خادم الاستوديو'],
  'app.saving': ['Saving…', 'جارٍ الحفظ…'],
  'app.unsaved': ['Not saved yet — retrying', 'لم يُحفظ بعد — نعيد المحاولة'],

  // the six areas and the studio organisation
  'nav.studioArea': ['Studio', 'الاستوديو'],
  'nav.company': ['Studio Company', 'شركة الاستوديو'],
  'nav.libraryArea': ['Library', 'المكتبة'],
  'nav.production': ['Production', 'الإنتاج'],
  'projects.title': ['Projects', 'المشاريع'],
  'projects.lead': ['Every show, short and music video the studio is making or has made.', 'كل مسلسل وفيلم قصير وفيديو موسيقي يصنعه الاستوديو أو صنعه.'],
  'library.title': ['Library', 'المكتبة'],
  // navigation and the production page
  'nav.new': ['New…', 'جديد…'],
  'nav.files': ['Files', 'الملفات'],
} as const satisfies Record<string, readonly [string, string]>;
