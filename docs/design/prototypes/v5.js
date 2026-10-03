// Vewbox v5 prototypes — the shared shell: icon sprite, the top bar and the phone tab bar, and the language switch.
//   ?lang=ar  → <html lang="ar" dir="rtl">; every element with data-ar gets that text, data-ar-html that markup,
//              data-ar-label / data-ar-ph its aria-label / placeholder. English is the markup itself.
// The shell is written once here so that every page carries the same navigation (one system).
(() => {
  const AR = new URLSearchParams(location.search).get('lang') === 'ar';
  const html = document.documentElement;
  if (AR) { html.lang = 'ar'; html.dir = 'rtl'; }

  // ── icons: 20 px grid, 1.6 stroke. Play, pause, skip and clocks never mirror; chevrons and arrows do (.i-flip) ──
  const I = {
    play: '<path class="i-fill" d="M7 4.5v11l9-5.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 4.5v11M13 4.5v11" stroke-width="2.2"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    search: '<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2 17 17"/>',
    down: '<path d="m5.5 8 4.5 4.5L14.5 8"/>',
    right: '<path d="m8 5.5 4.5 4.5L8 14.5"/>',
    left: '<path d="M12 5.5 7.5 10l4.5 4.5"/>',
    back: '<path d="M16 10H4.5M9 5.5 4.5 10 9 14.5"/>',
    more: '<circle cx="5" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"/>',
    close: '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>',
    check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
    gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
    filter: '<path d="M3.5 6h13M6 10h8M8.5 14h3"/>',
    grid: '<rect x="3.5" y="3.5" width="5" height="5" rx="1"/><rect x="11.5" y="3.5" width="5" height="5" rx="1"/><rect x="3.5" y="11.5" width="5" height="5" rx="1"/><rect x="11.5" y="11.5" width="5" height="5" rx="1"/>',
    list: '<path d="M7 5.5h9.5M7 10h9.5M7 14.5h9.5"/><circle cx="3.8" cy="5.5" r=".9" fill="currentColor" stroke="none"/><circle cx="3.8" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="3.8" cy="14.5" r=".9" fill="currentColor" stroke="none"/>',
    cc: '<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M8.6 8.4a2 2 0 1 0 0 3.2M14.1 8.4a2 2 0 1 0 0 3.2"/>',
    vol: '<path d="M3.5 8v4h3l4 3.5v-11L6.5 8z"/><path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.3 6.3 0 0 1 0 9"/>',
    full: '<path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4"/>',
    download: '<path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12"/>',
    upload: '<path d="M10 13V4M6 7.5l4-4 4 4M4 16.5h12"/>',
    edit: '<path d="M12.5 4.5l3 3L7 16H4v-3z"/>',
    redo: '<path d="M15.5 9.5a5.5 5.5 0 1 1-1.6-3.9M16 3.5v3.5h-3.5"/>',
    mic: '<rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M5 10a5 5 0 0 0 10 0M10 15v2.5"/>',
    wave: '<path d="M3 10h1.5M6 7v6M9 4.5v11M12 7.5v5M15 6v8M17.5 10H17"/>',
    film: '<rect x="3.5" y="4.5" width="13" height="11" rx="1"/><path d="M3.5 8h13M3.5 12h13M7 4.5v11M13 4.5v11"/>',
    split: '<rect x="2.5" y="4.5" width="15" height="11" rx="1"/><path d="M10 4.5v11"/>',
    eye: '<path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>',
    note: '<path d="M4.5 3.5h11v9l-4 4h-7z"/><path d="M11.5 16.5v-4h4"/>',
    alert: '<path d="M10 3.5 17.5 16.5h-15z"/><path d="M10 8.5v3.5M10 14.2v.1"/>',
    auto: '<path d="M10 3v3M10 14v3M3 10h3M14 10h3M5.2 5.2l2.1 2.1M12.7 12.7l2.1 2.1M5.2 14.8l2.1-2.1M12.7 7.3l2.1-2.1"/>',
    pen: '<path d="M4 16l1-4 8-8 3 3-8 8z"/><path d="M11.5 5.5l3 3"/>',
    stop: '<rect x="5.5" y="5.5" width="9" height="9" rx="1.2"/>',
    skipb: '<path d="M6 4.5v11"/><path class="i-fill" d="M15.5 4.5v11L8 10z" fill="currentColor" stroke="none"/>',
    skipf: '<path d="M14 4.5v11"/><path class="i-fill" d="M4.5 4.5v11L12 10z" fill="currentColor" stroke="none"/>',
    frameb: '<path d="M12.5 5.5 8 10l4.5 4.5M7 5.5v9"/>',
    framef: '<path d="M7.5 5.5 12 10l-4.5 4.5M13 5.5v9"/>',
    // the navigation glyphs are the content shapes themselves: 16:9 key art, 2:3 poster, 1:1 sleeve, the standing
    // figure, and the company's constellation
    n_shows: '<rect x="2.5" y="5" width="15" height="9.5" rx="1.2"/><path d="M6.5 17h7"/>',
    n_shorts: '<rect x="5.5" y="2.5" width="9" height="15" rx="1.2"/><path d="M8 13.5h4"/>',
    n_music: '<rect x="3" y="3" width="14" height="14" rx="1.2"/><circle cx="10" cy="10" r="3.2"/><circle cx="10" cy="10" r=".6" fill="currentColor"/>',
    n_cast: '<circle cx="10" cy="4.8" r="2.2"/><path d="M7.2 17.5V12l-1-0.5V8.8c0-.8.7-1.5 1.5-1.5h4.6c.8 0 1.5.7 1.5 1.5v2.7l-1 .5v5.5"/>',
    n_studio: '<circle cx="10" cy="10" r="2.6"/><circle cx="10" cy="2.9" r="1.3"/><circle cx="16.2" cy="13.6" r="1.3"/><circle cx="3.8" cy="13.6" r="1.3"/><path d="M10 4.2v3.2M14.9 12.9l-2.6-1.6M5.1 12.9l2.6-1.6"/>',
    n_home: '<path d="M3.5 9 10 3.5 16.5 9v7.5h-13z"/>',
    menu: '<path d="M3.5 6.5h13M3.5 13.5h13"/>',
    plate: '<rect x="2.5" y="6" width="15" height="8" rx="1"/>',
    screen: '<rect x="2.5" y="3.5" width="15" height="10" rx="1"/><path class="i-fill" d="M8.5 6.3v4.4L12.3 8.5z" fill="currentColor" stroke="none"/><path d="M6.5 16.5h7"/>',
    prod: '<path d="M3.5 16.5V9.5M8 16.5v-11M12.5 16.5V12M17 16.5V7"/>',
  };
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(I).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 20 20">${v}</symbol>`).join('')}</svg>`;
  document.body.insertAdjacentHTML('afterbegin', sprite);
  window.ic = (k, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${k}"/></svg>`;

  // the brand: Vewbox = view box. The glyph is a viewfinder — four frame corners around the picture's centre.
  const BRAND = `<svg viewBox="0 0 26 26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><path d="M2.5 8V3.5H7M19 3.5h4.5V8M23.5 18v4.5H19M7 22.5H2.5V18"/><circle cx="13" cy="13" r="3.2" fill="currentColor" stroke="none"/></svg><b>Vewbox</b>`;

  // ── the top bar and the phone tab bar ──────────────────────────────────────────────────────────────────────────
  const page = document.body.dataset.page || '';
  const over = document.body.dataset.bar === 'over';
  const t = (en, ar) => (AR ? ar : en);
  const cur = (p) => (p === page ? ' aria-current="page"' : '');
  const primary = [['home', 'Home', 'الرئيسية', 'n_home'], ['shows', 'Shows', 'المسلسلات', 'n_shows'], ['shorts', 'Shorts', 'الأفلام القصيرة', 'n_shorts'], ['music', 'Music Videos', 'الفيديوهات الموسيقية', 'n_music'], ['characters', 'Characters', 'الشخصيات', 'n_cast'], ['studio', 'Studio Company', 'شركة الاستوديو', 'n_studio']];
  const phoneLabel = { shows: ['Shows', 'مسلسلات'], shorts: ['Shorts', 'أفلام قصيرة'], music: ['Music', 'موسيقى'], characters: ['Characters', 'الشخصيات'], studio: ['Studio', 'الاستوديو'] };
  const topbar = `
  <a class="skip" href="#main">${t('Skip to content', 'انتقل إلى المحتوى')}</a>
  <header class="topbar${over ? ' topbar--over' : ''}" role="banner"><div class="wrap">
    <a class="brand" href="home.html${AR ? '?lang=ar' : ''}" aria-label="${t('Vewbox Studio — home', 'استوديو فيوبوكس — الرئيسية')}">${BRAND}</a>
    <nav class="nav" aria-label="${t('Studio', 'الاستوديو')}">${primary.map(([k, en, ar]) => `<a href="#"${cur(k)}>${t(en, ar)}</a>`).join('')}</nav>
    <div class="util">
      <a class="sec" href="#"${cur('locations')}>${t('Locations', 'المواقع')}</a>
      <a class="sec" href="#"${cur('production')}>${t('Production', 'الإنتاج')} <span class="needs" aria-label="${t('4 decisions waiting', '4 قرارات تنتظرك')}">4</span></a>
      <a class="sec" href="#"${cur('screening')}>${t('Screening Room', 'غرفة العرض')}</a>
      <a class="sec" href="#"${cur('settings')}>${t('Settings', 'الإعدادات')}</a>
      <span class="sep" aria-hidden="true"></span>
      <button class="searchbtn" type="button">${ic('search', 'i-sm')}<span>${t('Search the studio', 'ابحث في الاستوديو')}</span><span class="kbd">Ctrl K</span></button>

    </div>
    <div class="mob-actions">
      <button class="ibtn" type="button" aria-label="${t('Search the studio', 'ابحث في الاستوديو')}">${ic('search')}</button>
    </div>
  </div></header>`;
  // phone: five places at most — Home · Productions (Shows / Shorts / Music Videos as a segmented header) ·
  // Characters · Studio · More (Locations, Production with its count, Screening Room, Settings)
  const prodPages = ['shows', 'shorts', 'music'];
  const tabs = [['home', 'Home', 'الرئيسية', 'n_home'], ['productions', 'Productions', 'الإنتاجات', 'film'], ['characters', 'Characters', 'الشخصيات', 'n_cast'], ['studio', 'Studio', 'الاستوديو', 'n_studio'], ['more', 'More', 'المزيد', 'menu']];
  const tabCur = (k) => (k === page || (k === 'productions' && prodPages.includes(page)) || (k === 'more' && ['locations', 'production', 'screening', 'settings'].includes(page)) ? ' aria-current="page"' : '');
  const tabbar = `<nav class="tabbar" aria-label="${t('Studio', 'الاستوديو')}">${tabs.map(([k, en, ar, icon]) => `<a href="#"${tabCur(k)} style="position:relative">${ic(icon, 'i-lg')}<span>${t(en, ar)}</span>${k === 'more' ? `<span class="needs" style="position:absolute;inset-block-start:4px;inset-inline-start:calc(50% + 6px)" aria-label="${t('4 decisions waiting', '4 قرارات تنتظرك')}">4</span>` : ''}</a>`).join('')}</nav>`;
  // the Productions segmented header on phones (Shows / Shorts / Music Videos)
  const prodSeg = prodPages.includes(page) && document.body.dataset.catalogue !== undefined ? `<div class="wrap only-small prodseg"><div class="seg" role="tablist" aria-label="${t('Productions', 'الإنتاجات')}">${primary.filter(([k]) => prodPages.includes(k)).map(([k, en, ar]) => `<a role="tab" href="#" aria-selected="${k === page}">${t(en, ar)}</a>`).join('')}</div></div>` : '';
  if (!document.body.dataset.noshell) {
    document.body.insertAdjacentHTML('afterbegin', topbar + prodSeg);
    document.body.insertAdjacentHTML('beforeend', tabbar);
    document.body.classList.add('has-tabbar');
  }

  // ── icons written as <i data-i="name"> in the pages ────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-i]').forEach((el) => { el.outerHTML = ic(el.dataset.i, el.className || ''); });

  // ── the language switch ────────────────────────────────────────────────────────────────────────────────────────
  if (AR) {
    document.querySelectorAll('[data-ar]').forEach((el) => { el.textContent = el.dataset.ar; });
    document.querySelectorAll('[data-ar-html]').forEach((el) => { el.innerHTML = el.dataset.arHtml; });
    document.querySelectorAll('[data-ar-label]').forEach((el) => el.setAttribute('aria-label', el.dataset.arLabel));
    document.querySelectorAll('[data-ar-ph]').forEach((el) => el.setAttribute('placeholder', el.dataset.arPh));
    document.querySelectorAll('[data-ar-src]').forEach((el) => el.setAttribute('src', el.dataset.arSrc));
    document.querySelectorAll('[data-ar-alt]').forEach((el) => el.setAttribute('alt', el.dataset.arAlt));
    document.querySelectorAll('[data-ar-href]').forEach((el) => el.setAttribute('href', el.dataset.arHref));
  }
  // ── numerals (DESIGN-SYSTEM-V5 §9.4, QA B2) ────────────────────────────────────────────────────────────────────
  // One rule, by the kind of number, not by the font:
  //   readouts and identifiers — timecodes, clock times, durations written m:ss, shot / take / cut / version / scene /
  //   episode numbers, resolutions, frame rates, file sizes, format names — are ALWAYS Western digits, in Plex Mono,
  //   LTR-isolated (so "1344×768" can never read "768×1344");
  //   counts and dates in prose and slates are Arabic-Indic in the Arabic interface when the Numerals setting is on
  //   (default for the Iraqi dialect) and are set in the sans (Plex Mono has no Arabic-Indic digits).
  // The product does this in formatNumber(value, context); the prototype applies the same rule to text nodes.
  // ?digits=western shows the setting off.
  if (AR) {
    const ARABIC_DIGITS = new URLSearchParams(location.search).get('digits') !== 'western';
    const skip = (n) => n.parentElement?.closest('.ro, .tc, .num-ltr, .transport, .ctl, .tport, .time, .strip, .sstrip, .tl, .rtakes, .wave, .kbd, .on-art-chip, .id, [data-latin-digits], [lang="en"], script, style, svg');
    // readout/identifier runs inside Arabic text: identifiers after their noun, n.n ids and m:ss, W×H, NNNp, fps,
    // sizes, Latin-letter codes (MP4, H.264, B2)
    const KEEP = /((?:اللقطة|المصوَّرة|المصورة|المونتاج|الإصدار|المشهد|الحلقة|الموسم|اللقطات|بالإصدار)\s)?(\d+(?:[.:]\d+)+|\d+\s?×\s?\d+|\d+p\b|\d+\s?fps|\d+(?:\.\d+)?\s?(?:MB|KB|GB|م\.ب)|[A-Za-z]+[\d.]*\d[A-Za-z\d.\-]*)|((?:اللقطة|المصوَّرة|المصورة|المونتاج|الإصدار|المشهد|الحلقة|الموسم|بالإصدار)\s)(\d+)/g;
    const map = '٠١٢٣٤٥٦٧٨٩';
    const nodes = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (/\d/.test(n.nodeValue) && !skip(n)) nodes.push(n);
    for (const n of nodes) {
      const text = n.nodeValue; const frag = document.createDocumentFragment(); let last = 0; let m;
      const plain = (s) => (ARABIC_DIGITS ? s.replace(/\d/g, (d) => map[d]) : s);
      KEEP.lastIndex = 0;
      while ((m = KEEP.exec(text))) {
        const noun = m[1] ?? m[3] ?? ''; const num = m[2] ?? m[4];
        const start = m.index + noun.length;
        frag.append(plain(text.slice(last, start)));
        const span = document.createElement('span'); span.className = 'num-ltr'; span.textContent = num; frag.append(span);
        last = start + num.length;
      }
      if (last === 0) { n.nodeValue = plain(text); continue; }
      frag.append(plain(text.slice(last)));
      n.replaceWith(frag);
    }
  }
  document.title = AR && document.body.dataset.titleAr ? document.body.dataset.titleAr : document.title;

  // the viewport height, frozen at load: prototypes size by var(--vh) instead of vh, so a full-page capture (which
  // grows the viewport to the document's height) cannot enlarge vh-sized pictures and widen the page (QA §7.1)
  document.documentElement.style.setProperty('--vh', `${window.innerHeight / 100}px`);

  // waveform helper: <div class="wave" data-bars="64" data-played="0.4" data-seed="3"> — never more bars than fit
  // (2 px bar + 2 px gap), so a narrow column gets fewer bars instead of clipping (QA minor 5)
  document.querySelectorAll('.wave[data-bars]').forEach((w) => {
    const n = Math.max(16, Math.min(+w.dataset.bars, Math.floor((w.clientWidth || 9999) / 4))); const p = +(w.dataset.played || 0); let s = +(w.dataset.seed || 1);
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    w.innerHTML = Array.from({ length: n }, (_, i) => { const env = 0.35 + 0.65 * Math.sin(Math.PI * (i + 0.5) / n) ** 0.6; const h = Math.max(12, Math.round((0.25 + rnd() * 0.75) * env * 100)); return `<i class="${i / n < p ? 'p' : ''}" style="block-size:${h}%"></i>`; }).join('');
  });
})();
