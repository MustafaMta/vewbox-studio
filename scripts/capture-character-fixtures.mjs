// TEST-ONLY evidence tool: screenshots of the character pages in POPULATED states (draft, approved, locked, drawing,
// legacy portrait, no image) without touching the database. Nothing here runs in the app: the headless browser
// answers the studio's own requests from a fixture —
//   GET /api/studio        → the real snapshot plus fixture characters, assets and productions (and the UI language)
//   GET /api/jobs[/id]     → fixture jobs (a drawing in progress)
//   GET /api/media/fx-*    → placeholder pictures cropped from docs/evidence (earlier generations) and a test clip
//   POST/PUT/DELETE /api/* → answered locally (commands "accepted", everything else refused), never sent
//
//   node scripts/capture-character-fixtures.mjs [--base http://localhost:4212] [--out docs/evidence] [--width 1440]
//        [--lang en|ar] [--suffix -en-desktop] [scenario ...]
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i === -1) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const base = opt('base', 'http://localhost:4212');
const out = opt('out', 'docs/evidence');
const width = Number(opt('width', '1440'));
const lang = opt('lang', 'en');
const suffix = opt('suffix', '');
const isPhone = width < 768;
const EV = 'docs/evidence';
const now = new Date('2026-10-03T09:00:00.000Z').getTime();
const ago = (h) => new Date(now - h * 3600_000).toISOString();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: isPhone ? 844 : 900 }, colorScheme: 'dark', ...(isPhone ? { isMobile: true, hasTouch: true } : {}) });

// ---- placeholder pictures: crops of earlier generations, made in the browser's canvas -----------------------------
const dataUrl = async (file) => `data:image/png;base64,${(await fs.readFile(path.join(EV, file))).toString('base64')}`;
await page.goto('about:blank');
const crop = (src, x, y, w, h, flip = false) => page.evaluate(async ([s, x, y, w, h, flip]) => {
  const img = new Image(); img.src = s; await img.decode();
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(img, x, y, w, h, 0, 0, w, h);
  return c.toDataURL('image/png').split(',')[1];
}, [src, x, y, w, h, flip]);
const samirSheet = await dataUrl('kite-samir-reference-sheet.png');
const aminaSheet = await dataUrl('kite-amina-reference-sheet.png');
const samirFull = await dataUrl('kite-samir-portrait.png');
const frame = await dataUrl('kite-frame-1-1.png');
const plates = await dataUrl('kite-rooftop-plates.png');
const media = {
  'fx-samir': Buffer.from(samirFull.split(',')[1], 'base64'),
  'fx-amina': Buffer.from(await crop(aminaSheet, 320, 0, 320, 400), 'base64'),
  'fx-rana': Buffer.from(await crop(aminaSheet, 1280, 0, 226, 400), 'base64'),
  'fx-abu-portrait': Buffer.from(await crop(samirSheet, 1280, 0, 226, 400), 'base64'),
  'fx-amina-expr-1': Buffer.from(await crop(aminaSheet, 1506, 0, 160, 200), 'base64'),
  'fx-amina-expr-2': Buffer.from(await crop(aminaSheet, 1666, 200, 160, 200), 'base64'),
  'fx-amina-side': Buffer.from(await crop(aminaSheet, 960, 0, 320, 400), 'base64'),
  'fx-cover-1': Buffer.from(frame.split(',')[1], 'base64'),
  'fx-cover-2': Buffer.from(await crop(plates, 0, 0, 640, 360), 'base64'),
  'fx-proof': await fs.readFile('tests/fixtures/speech-en.wav'),
};

// ---- the fixture studio ------------------------------------------------------------------------------------------
const asset = (id, p = {}) => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: ['fixture'], sample: false, origin: 'GENERATED', createdAt: ago(48), ...p });
const assets = [
  asset('fx-samir', { width: 1024, height: 1280, tier: 'CANONICAL' }), asset('fx-amina', { width: 320, height: 400, tier: 'CANONICAL' }), asset('fx-rana', { width: 226, height: 400, tier: 'CANONICAL' }),
  asset('fx-abu-portrait', { width: 226, height: 400 }), asset('fx-amina-expr-1', { tier: 'SECONDARY' }), asset('fx-amina-expr-2', { tier: 'SECONDARY' }), asset('fx-amina-side'),
  asset('fx-cover-1'), asset('fx-cover-2'),
  { ...asset('fx-proof'), kind: 'AUDIO', durationSeconds: 4.1, label: 'proof line' },
];
const voice = (p = {}) => ({ pitch: 'MID', pace: 'MEASURED', timbre: '', notes: '', samples: [], ...p });
const identity = (lang, model, text, v2 = {}) => ({ ...v2, provider: 'LOCAL_TTS', model, mode: 'REFERENCE', language: lang, referenceSampleId: 'fx-rec', params: { speed: 1, emotionAlpha: 0.6 }, proof: { sampleId: 'fx-proof-s', assetId: 'fx-proof', text, heard: text, coverage: 1, cer: 0.02, wer: 0 }, status: 'ACTIVE', revision: 2, createdAt: ago(30), jobId: 'fx-voice-job' });
const proofSamples = (text) => [{ id: 'fx-rec', label: 'kitchen-take-2', assetId: 'fx-proof', source: 'UPLOADED', text, durationSeconds: 4.1 }, { id: 'fx-proof-s', label: 'Proof line', assetId: 'fx-proof', source: 'GENERATED', text }];
const base0 = { build: '', face: '', hair: '', skin: '', eyes: '', distinguishing: [], wardrobe: '', personality: '', refs: [], createdAt: ago(72), updatedAt: ago(1) };
const usage = (n) => ({ known: true, videos: Array.from({ length: n }, (_, i) => ({ productionId: `fx-p${i}`, productionTitle: ['The Kite', 'Rooftops'][i], shotId: `s${i}`, shotLabel: `1.${i + 1}`, takeId: `t${i}`, takeLabel: 'Take 2', recordedAt: ago(20 - i * 5), status: 'IN_TAKE', canonicalImageVersion: 2 })) });
const characters = [
  { ...base0, id: 'fx-samir', name: 'Samir Hassan', nameAr: 'سمير حسن', role: 'Kite seller on the Baghdad rooftops, sixty-six and unhurried', style: 'CARTOON', sex: 'MALE', ageYears: 66, language: 'EN',
    personality: 'Patient, wry, notices the wind before anyone else. Speaks in short sentences and lets silences do the work.', build: 'Wiry, slightly stooped', face: 'Deep lines, a white moustache', hair: 'Short white hair', skin: 'Weathered olive', eyes: 'Warm brown', wardrobe: 'Patchwork quilted jacket, faded jeans, leather sandals, a magnifying glass on a cord', distinguishing: ['magnifying glass on a cord', 'bow-legged stance'],
    canonicalImage: { assetId: 'fx-samir', status: 'DRAFT', version: 1, generatedAt: ago(2), engine: 'Qwen-Image', check: { ok: true } },
    voice: voice({ pitch: 'LOW', pace: 'SLOW', timbre: 'Gravelly, warm', samples: proofSamples('I have been here a while — where were you?'), selectedSampleId: 'fx-rec', identity: identity('EN', 'indextts', 'I have been here a while — where were you?', { origin: 'DESIGNED', designId: 'fx-design', evaluation: { cer: 0.02, coverage: 0.98, lufs: -20.4, clipped: 0, measuredAt: ago(30) }, listening: [] }) }), usage: { known: true, videos: [] } },
  { ...base0, id: 'fx-amina', name: 'Amina', nameAr: 'أمينة', role: 'Nine years old, flies the red kite her brother left behind', style: 'CARTOON', sex: 'FEMALE', ageYears: 9, language: 'AR', dialect: 'IRAQI_BAGHDADI',
    personality: 'Stubborn and brave; frowns when she is about to cry.', hair: 'Two long black braids', wardrobe: 'Olive T-shirt, denim dungarees, red string around both wrists, white sneakers',
    canonicalImage: { assetId: 'fx-amina', status: 'APPROVED', version: 2, generatedAt: ago(40), approvedAt: ago(39), check: { ok: true } },
    refs: [{ id: 'r1', role: 'EXPRESSION', assetId: 'fx-amina-expr-1' }, { id: 'r2', role: 'EXPRESSION', assetId: 'fx-amina-expr-2' }, { id: 'r3', role: 'SIDE', assetId: 'fx-amina-side' }],
    voice: voice({ pitch: 'HIGH', pace: 'QUICK', samples: proofSamples('شلونك؟ اني هنا من زمان، وين چنت؟'), selectedSampleId: 'fx-rec', identity: identity('AR', 'habibi-iraqi', 'شلونك؟ اني هنا من زمان، وين چنت؟', { origin: 'UPLOAD_CONSENTED', consent: { statement: 'SPEAKER_PERMISSION', by: 'PRODUCER', at: ago(31) }, dialectStatus: 'LISTENER_APPROVED', evaluation: { coverage: 0.95, lufs: -21, clipped: 0 }, listening: [{ by: 'PRODUCER', natural: 4, dialectAuthentic: true, at: ago(29) }] }) }), usage: usage(2) },
  { ...base0, id: 'fx-rana', name: 'Rana Khalil', role: 'Radio host who reads the night news', style: 'CARTOON', sex: 'FEMALE', ageYears: 34, language: 'EN',
    canonicalImage: { assetId: 'fx-rana', status: 'DRAFT', version: 3, generatedAt: ago(3), check: { ok: false, notes: ['the feet touch the bottom edge of the frame'] } }, voice: voice(), usage: { known: true, videos: [] } },
  { ...base0, id: 'fx-abu', name: 'Abu Samir', role: 'The café owner across the street', style: 'CARTOON', sex: 'MALE', ageYears: 70, language: 'AR', dialect: 'IRAQI_BAGHDADI', portraitAssetId: 'fx-abu-portrait', voice: voice(), usage: { known: true, videos: [] } },
  { ...base0, id: 'fx-noor', name: 'Noor', role: 'A singer nobody has heard yet', style: 'ANIME', sex: 'FEMALE', ageYears: 24, language: 'EN', voice: voice(), usage: { known: true, videos: [] } },
];
const production = (id, title, cover) => ({ id, kind: 'SHORT', title, logline: '', synopsis: '', style: 'CARTOON', language: 'AR', dialect: 'IRAQI_BAGHDADI', aspect: 'WIDE_16_9', targetSeconds: 60, stage: 'PRODUCE', brief: { mode: 'MANUAL', text: '' }, castIds: ['fx-amina', 'fx-samir'], locationIds: [], scenes: [], shots: [], coverAssetId: cover, createdAt: ago(60), updatedAt: ago(5) });
const productions = [production('fx-p0', 'The Kite', 'fx-cover-1'), production('fx-p1', 'Rooftops', 'fx-cover-2')];
const jobs = [{ id: 'fx-draw', type: 'CHARACTER_APPEARANCE', status: 'GENERATING', priority: 0, payload: { characterId: 'fx-abu' }, attempts: 1, maxAttempts: 2, cancelRequested: false, characterId: 'fx-abu', progress: { phase: 'GENERATING', message: 'Drawing Abu Samir · full length' }, createdAt: ago(0.05), updatedAt: ago(0.01), startedAt: ago(0.04) }];

await page.addInitScript((l) => { try { localStorage.setItem('vewbox.ui', JSON.stringify({ locale: l, motion: true })); } catch { /* fine */ } }, lang);
await page.route('**/api/**', async (route) => {
  const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
  if (req.method() !== 'GET') {
    if (p === '/api/commands') return route.fulfill({ json: { ok: true, version: 1, hash: 'fixture', results: [] } });
    return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'fixture: writes are not sent' } } });
  }
  if (p === '/api/studio') {
    const res = await route.fetch(); const body = await res.json();
    body.state.settings.uiLanguage = lang;
    body.state.characters = [...characters, ...body.state.characters];
    body.state.assets = [...assets, ...body.state.assets];
    body.state.productions = [...productions, ...body.state.productions];
    return route.fulfill({ response: res, json: body });
  }
  if (p === '/api/jobs') return route.fulfill({ json: { jobs } });
  if (p.startsWith('/api/jobs/')) { const j = jobs.find((x) => x.id === p.split('/')[3]); return j ? route.fulfill({ json: { job: j, events: [] } }) : route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'fixture' } } }); }
  if (p.startsWith('/api/media/fx-')) { const id = p.split('/').pop(); const b = media[id]; return b ? route.fulfill({ body: b, contentType: id === 'fx-proof' ? 'audio/wav' : 'image/png' }) : route.fulfill({ status: 404, body: '' }); }
  return route.continue();
});

// ---- scenarios ---------------------------------------------------------------------------------------------------
const ready = async () => { await page.waitForFunction(() => document.querySelector('main h1') && !/Reconnecting/.test(document.body.innerText), null, { timeout: 90_000 }); await page.waitForTimeout(1800); };
const click = async (name) => { const b = page.getByRole('button', { name }).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(400); };
const scenarios = {
  directory: { path: '/characters' },
  'profile-draft': { path: '/characters/fx-samir' },
  'profile-locked': { path: '/characters/fx-amina', after: async () => { await page.locator('section[aria-label] details summary').last().click().catch(() => {}); await page.waitForTimeout(300); } },
  'profile-check': { path: '/characters/fx-rana', after: async () => { await click(lang === 'ar' ? /اعتمد الصورة/ : /Approve image/); } },
  'profile-drawing': { path: '/characters/fx-abu' },
  'profile-none': { path: '/characters/fx-noor' },
  'new-describe': { path: '/characters/new?start=describe', after: async () => { await click(lang === 'ar' ? /^غيّر$/ : /^Change$/); } },
  'new-sheet': { path: '/characters/new?start=sheet' },
  'new-picture': { path: '/characters/new?start=picture' },
};
const wanted = args.length ? args : Object.keys(scenarios);
await fs.mkdir(out, { recursive: true });
for (const name of wanted) {
  const s = scenarios[name]; if (!s) { console.log(`unknown scenario ${name}`); continue; }
  await page.goto(`${base}${s.path}`, { waitUntil: 'domcontentloaded' });
  await ready();
  if (s.after) await s.after();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const file = path.join(out, `cast-${name}${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true });
  // FX_EVAL="expression" prints a value from the page after each scenario (debugging a layout)
  if (process.env.FX_EVAL) console.log('  eval:', JSON.stringify(await page.evaluate(process.env.FX_EVAL)));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${s.path} → ${file}${overflow > 0 ? `  (horizontal overflow ${overflow}px)` : ''}`);
}
await browser.close();
