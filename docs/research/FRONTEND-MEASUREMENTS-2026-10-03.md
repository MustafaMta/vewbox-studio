# Frontend measurements — the baseline to beat (redesign phase 5, 2026-10-03)

Measured at main `914f6a5` in worktree `agent-acd38be195cb4b0dd` against a private server on port 4233 (`next dev --webpack`)
pointed at the database copy `vewbox_inv` (1 production — the Short *The Static Sky*, 8 shots, 15 takes; 5 characters;
1 location; 145 assets: 57 images 50 MB, 19 videos 270 MB, 53 audio 20 MB) and the real library (`var/library`, read only).
Headless Playwright (Chromium 1243) with a CDP session per page; no application code changed. Everything below can be
re-run with the scripts in `docs/research/frontend-audit-2026-10-03/`; the companion inventory is
`docs/research/FRONTEND-INVENTORY-2026-10-03.md`.

## 1. How to re-run

```
# 0. a worktree with node_modules junctioned, .env/.env.local copied, DATABASE_URL → vewbox_inv, LIBRARY_ROOT absolute
pnpm exec next build --webpack                                            # 1. the production bundle (≈ 30 s)
node docs/research/frontend-audit-2026-10-03/bundle2.mjs . out/bundle.json   # 2. first-load JS per route from the manifests
pnpm exec next dev --webpack -p 4233                                      # 3. the dev server (use http://localhost, see §7)
node docs/research/frontend-audit-2026-10-03/measure.mjs . http://localhost:4233 out/measure   # 4. 20 pages × 1440/390
pnpm exec next start -p 4234                                              # 5. optional: the same pages on the production build
node docs/research/frontend-audit-2026-10-03/measure.mjs . http://localhost:4234 out/prod home,shows,short,shot,character,studio,production,screening,characters,assets
node docs/research/frontend-audit-2026-10-03/mtables.mjs out out/tables.txt  # 6. the markdown tables of this document
```

`measure.mjs` warms every URL once (so the dev compiler and the media cache do not count), then loads it in a fresh
context, waits for the shell skeleton to go (`.shell-skeleton` removed = first snapshot applied), for network idle and
3 s more, and records: every request's decoded bytes by kind (CDP `Network.*`), the snapshot and job-list fetches, every
`<img>`'s natural and displayed size matched to its bytes, every `<video>`, FCP / LCP / CLS / long tasks from buffered
`PerformanceObserver`s injected before navigation, the navigation timing, DOM size, horizontal overflow, console
errors, and the set of class names in the DOM (feeds the CSS check). Afterwards it watches 65 s of idle traffic on
`/shows` and `/production` and performs six sidebar navigations from `/shows` recording what each one fetches. One sample
per page (not a median): treat ± 20 % on the timings as noise; the byte counts are exact.

## 2. Bundle (production build, webpack, BUILD_ID `Vva0mnRcaBQPD7l83Ci0D`)

`next build --webpack` compiles in 11.4 s, TypeScript in 8.9 s. Next 16 prints no sizes; `bundle2.mjs` sums
`rootMainFiles` (build-manifest) plus every client chunk each route's `page_client-reference-manifest.js` references
(error/loading/not-found boundary chunks excluded; they add ≈ 15 KB raw to every route).

| Route | JS files | First-load JS raw KB | gzip KB | CSS raw / gzip KB |
|---|---|---|---|---|
| `/shows/[id]/seasons/[seasonId]/episodes/[productionId]/shots/[shotId]` | 28 | 1157 | 351 | 208 / 38 |
| `/shorts/[id]/shots/[shotId]` | 25 | 1155 | 350 | 208 / 38 |
| `/shows/[id]/seasons/[seasonId]/episodes/[productionId]` | 26 | 1140 | 345 | 208 / 38 |
| `/shorts/[id]` | 23 | 1138 | 344 | 208 / 38 |
| `/music-videos/[id]/shots/[shotId]` | 24 | 1136 | 344 | 208 / 38 |
| `/music-videos` | 21 | 1118 | 338 | 208 / 38 |
| `/music-videos/[id]` | 22 | 1118 | 338 | 208 / 38 |
| `/kit` | 18 | 1115 | 333 | 208 / 38 |
| `/kit-media` | 18 | 1074 | 324 | 208 / 38 |
| `/characters/new` | 17 | 1031 | 317 | 208 / 38 |
| `/new/[kind]` | 19 | 1025 | 311 | 208 / 38 |
| `/shows/[id]` | 20 | 997 | 306 | 208 / 38 |
| `/shows/[id]/seasons/[seasonId]` | 21 | 997 | 306 | 208 / 38 |
| `/characters/[id]` | 17 | 989 | 305 | 208 / 38 |
| `/studio/agents/[id]` | 17 | 984 | 300 | 208 / 38 |
| `/studio/departments/[id]` | 17 | 984 | 300 | 208 / 38 |
| `/studio` | 16 | 984 | 300 | 208 / 38 |
| `/assets` | 17 | 976 | 299 | 208 / 38 |
| `/characters` | 15 | 972 | 298 | 208 / 38 |
| `/screening` | 17 | 972 | 297 | 208 / 38 |
| `/locations/new` | 16 | 970 | 296 | 208 / 38 |
| `/production` | 15 | 958 | 293 | 208 / 38 |
| `/shows` | 16 | 956 | 292 | 208 / 38 |
| `/shorts` | 15 | 954 | 291 | 208 / 38 |
| `/locations` | 15 | 953 | 290 | 208 / 38 |
| `/locations/[id]` | 16 | 953 | 290 | 208 / 38 |
| `/settings` | 14 | 947 | 288 | 208 / 38 |
| `/jobs` | 15 | 944 | 288 | 208 / 38 |
| `/new` | 14 | 941 | 287 | 208 / 38 |
| `/library` | 13 | 928 | 282 | 208 / 38 |
| `/` | 13 | 928 | 282 | 208 / 38 |
| `/projects` | 13 | 928 | 282 | 208 / 38 |
| `/_global-error` | 13 | 928 | 282 | 208 / 38 |
| `/_not-found` | 13 | 928 | 282 | 208 / 38 |

- **Floor 928 KB raw / 282 KB gzip** for a route with no code of its own (`/`, `/library`, `/projects`, `_not-found`); the
  framework (React, the app router, webpack runtime, `main-app`) is 436 KB raw / 128 KB gzip of it; the application's
  share of the floor is 492 KB raw / 154 KB gzip — the dictionary + store chunk (241 KB), zod (89 KB), the `(app)` layout
  with the shell (53 KB), shell + kit (50 KB), icons/locale/misc.
- **Route-specific JS above the floor**: shot pages +227 KB, the Short/episode pages +210 KB, the music catalogue and page
  +190 KB (the catalogue imports the whole workspace through `MusicVideoCard`), character creation +103 KB, `/new/[kind]`
  +97 KB, Show +69 KB, Character +61 KB, Studio pages +56 KB, Files +48 KB, Characters/Screening +44 KB, Production +30 KB,
  Shows +28 KB, Shorts +26 KB, Settings +19 KB, `/jobs` +16 KB, `/new` +13 KB.
- The specimen routes are in the production build (`/kit` 1,115 KB, `/kit-media` 1,074 KB; their shared chunk is 112 KB)
  although both answer 404 in production.
- CSS: one 207 KB sheet (38 KB gzip) on every route (all 14 source sheets); fonts in `static/media`: 1,291 KB (Inter variable
  woff2 344 KB; IBM Plex Sans Arabic as four TTFs, 230–241 KB each — the Arabic interface loads up to 946 KB of TTF where a
  variable woff2 would be one file).
- The numbers agree with the UX audit's §6.1 (taken on `0ed7abe`) within 2 KB per route: nothing has moved since.

Largest chunks and who loads them:

| Chunk | Routes using it | raw KB | gzip KB | Contents (string probe) |
|---|---|---|---|---|
| `3525-8e1a389f4dd2d524.js` | 34 | 241 | 74 | EN+AR dictionary, store, domain reducers/commands, preferences |
| `6074-ca6a04cfca98197d.js` | 34 | 236 | 65 | React DOM (framework, root) |
| `80ab6b4e-7b78b320a3f93676.js` | 34 | 196 | 62 | Next app router runtime (root) |
| `4065-82c26bf67d46fbc3.js` | 2 | 112 | 31 | specimen pages (/kit, /kit-media) |
| `1545-24427be30dc3b403.js` | 34 | 89 | 25 | zod |
| `9327-bf959e6a10d13b5f.js` | 7 | 65 | 17 | workspace tabs (7 routes) |
| `app/(app)/layout-74e7b8e4933814c3.js` | 34 | 53 | 18 |  |
| `8641-9b781c6a4ec61b2f.js` | 34 | 50 | 15 | shell + kit (every route) |
| `3980-55fb86e22f78def2.js` | 3 | 45 | 14 | wizard (3 routes) |
| `3036-677872c88383bf4b.js` | 8 | 44 | 12 | character/create (8 routes) |
| `app/(app)/kit/page-e81184851bbfc116.js` | 1 | 43 | 10 |  |
| `app/(app)/characters/new/page-6d94d7dcb676d10e.js` | 1 | 41 | 12 |  |
| `7337-2a1f389ee29c4895.js` | 7 | 25 | 8 |  |
| `app/(app)/characters/page-1398e2c98b8288b0.js` | 3 | 24 | 8 |  |
| `9596-c87cb4f1ec9abe57.js` | 3 | 21 | 8 |  |

framework (rootMainFiles): 4 files, 436 KB raw / 128 KB gzip; shared by every route: 13 files, 928 KB raw / 282 KB gzip; static output: 112 JS files 2361 KB, CSS 208 KB, fonts 1291 KB.

## 3. Per-page network on a real load (dev server, `vewbox_inv`, English, 20 URLs × 2 viewports)

Columns: requests and decoded bytes of the whole load (the dev server does not compress and serves unminified chunks, so
"JS KB" here is development weight — the production equivalent is the route's first-load JS in §2); `/api/studio` count ×
size; `/api/jobs?limit=300` count × size; organisation API bytes (`/api/studio/org*`, count); media files and MB
(`/api/media/*`, images + video + audio); `<img>` elements with media; ms from navigation start until the skeleton is gone;
FCP, LCP (ms and element), CLS; console errors/warnings.

**1440 px** (DPR 1)

| Page | Requests | Total KB | JS KB | CSS KB | Fonts KB | `/api/studio` | `/api/jobs` | Org API KB | Media files / MB | Images | Ready ms | FCP ms | LCP ms | LCP element | CLS | Console |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| home `/` | 22 | 40398 | 37795 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 640 | 108 | 1036 | P.page-lead.lead | 0.000 | 0 |
| shows `/shows` | 20 | 40388 | 37795 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 654 | 104 | 660 | P.page-lead.lead | 0.000 | 0 |
| shorts `/shorts` | 22 | 44080 | 37777 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 2 / 3.6 | 2 | 776 | 200 | 788 | P.page-lead.lead | 0.000 | 0 |
| short `/shorts/short-28bdb3342b` | 29 | 54500 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 9 / 11.9 | 12 | 726 | 104 | 744 | P.mt-2.max-w-3xl | 0.000 | 0 |
| short-storyboard `/shorts/short-28bdb3342b?tab=storyboard` | 28 | 51674 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 8 / 9.1 | 20 | 750 | 104 | 776 | P.mt-2.max-w-3xl | 0.000 | 0 |
| short-produce `/shorts/short-28bdb3342b?tab=produce` | 54 | 55431 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 386 (3) | 32 / 12.4 | 36 | 955 | 212 | 980 | P.mt-2.max-w-3xl | 0.010 | 0 |
| short-final `/shorts/short-28bdb3342b?tab=final` | 32 | 43680 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 386 (3) | 10 / 0.9 | 20 | 757 | 108 | 828 | VIDEO.pvideo http://localhost:4233/api/media/gen | 0.004 | 0 |
| shot `/shorts/short-28bdb3342b/shots/shot-24bf719d21` | 25 | 46041 | 38414 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 5 / 4.9 | 4 | 689 | 112 | 736 | VIDEO.pvideo http://localhost:4233/api/media/gen | 0.000 | 0 |
| characters `/characters` | 25 | 48772 | 37967 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 5 / 8.0 | 5 | 665 | 100 | 752 | IMG.absolute.inset-0 http://localhost:4233/api/m | 0.000 | 0 |
| character `/characters/char-56c47abc59` | 25 | 44415 | 38725 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 5 / 3.0 | 1 | 679 | 116 | 720 | IMG.absolute.inset-0 http://localhost:4233/api/m | 0.000 | 0 |
| character-new `/characters/new` | 22 | 41216 | 38621 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 784 | 244 | 796 | P.page-lead.lead | 0.000 | 0 |
| locations `/locations` | 21 | 41762 | 37758 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 1 / 1.4 | 1 | 662 | 92 | 724 | IMG.h-full.w-full http://localhost:4233/api/medi | 0.000 | 0 |
| location `/locations/loc-cde19129ca` | 21 | 41995 | 37990 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 1 / 1.4 | 3 | 677 | 116 | 756 | IMG http://localhost:4233/api/media/gen-816d6af2 | 0.000 | 0 |
| studio `/studio` | 21 | 40913 | 38064 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 258 (2) | 0 / 0.0 | 0 | 826 | 200 | 1084 | P.mt-1.text-sm | 0.000 | 0 |
| production `/production` | 23 | 40887 | 38035 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 260 (4) | 0 / 0.0 | 0 | 805 | 200 | 824 | P.page-lead.lead | 0.043 | 0 |
| screening `/screening` | 22 | 41143 | 37945 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 2 / 0.6 | 0 | 736 | 96 | 800 | VIDEO.pvideo http://localhost:4233/api/media/gen | 0.000 | 0 |
| assets `/assets` | 53 | 78270 | 37990 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 33 / 36.8 | 92 | 726 | 100 | 824 | IMG http://localhost:4233/api/media/gen-4b28ba8f | 0.000 | 0 |
| settings `/settings` | 26 | 40370 | 37689 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 1150 | 476 | 1172 | P.page-lead.lead | 0.019 | 0 |
| new `/new` | 22 | 42765 | 36864 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 2 / 3.2 | 2 | 672 | 96 | 776 | IMG.h-full.w-full http://localhost:4233/api/medi | 0.000 | 0 |
| music-videos `/music-videos` | 20 | 42381 | 39788 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 647 | 104 | 652 | H1.page-header-title.page-title | 0.000 | 0 |

**390 px** (DPR 2, mobile emulation)

| Page | Requests | Total KB | JS KB | CSS KB | Fonts KB | `/api/studio` | `/api/jobs` | Org API KB | Media files / MB | Images | Ready ms | FCP ms | LCP ms | LCP element | CLS | Console |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| home `/` | 22 | 40398 | 37795 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 939 | 192 | 1332 | P.page-lead.lead | 0.000 | 0 |
| shows `/shows` | 20 | 40388 | 37795 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 660 | 84 | 668 | P.page-lead.lead | 0.000 | 0 |
| shorts `/shorts` | 22 | 44080 | 37777 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 2 / 3.6 | 2 | 643 | 92 | 652 | P.page-lead.lead | 0.000 | 0 |
| short `/shorts/short-28bdb3342b` | 29 | 54500 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 9 / 11.9 | 12 | 813 | 80 | 960 | IMG.absolute.inset-0 http://localhost:4233/api/m | 0.000 | 0 |
| short-storyboard `/shorts/short-28bdb3342b?tab=storyboard` | 28 | 51674 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 8 / 9.1 | 20 | 804 | 84 | 824 | P.mt-3.text-[13.5px] | 0.000 | 0 |
| short-produce `/shorts/short-28bdb3342b?tab=produce` | 47 | 52497 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 386 (3) | 25 / 9.5 | 36 | 954 | 232 | 980 | P.mt-3.text-[13.5px] | 0.011 | 0 |
| short-final `/shorts/short-28bdb3342b?tab=final` | 32 | 44320 | 39760 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 386 (3) | 10 / 1.5 | 20 | 838 | 92 | 868 | P.mt-3.text-[13.5px] | 0.000 | 0 |
| shot `/shorts/short-28bdb3342b/shots/shot-24bf719d21` | 25 | 45913 | 38414 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 5 / 4.8 | 4 | 777 | 92 | 824 | VIDEO.pvideo http://localhost:4233/api/media/gen | 0.000 | 0 |
| characters `/characters` | 25 | 48772 | 37967 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 5 / 8.0 | 5 | 682 | 88 | 772 | IMG.absolute.inset-0 http://localhost:4233/api/m | 0.000 | 0 |
| character `/characters/char-56c47abc59` | 25 | 44415 | 38725 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 5 / 3.0 | 1 | 694 | 100 | 764 | IMG.absolute.inset-0 http://localhost:4233/api/m | 0.000 | 0 |
| character-new `/characters/new` | 22 | 41216 | 38621 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 763 | 184 | 780 | P.page-lead.lead | 0.000 | 0 |
| locations `/locations` | 21 | 41762 | 37758 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 1 / 1.4 | 1 | 659 | 80 | 736 | IMG.h-full.w-full http://localhost:4233/api/medi | 0.000 | 0 |
| location `/locations/loc-cde19129ca` | 21 | 41995 | 37990 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 1 / 1.4 | 3 | 775 | 92 | 884 | IMG http://localhost:4233/api/media/gen-816d6af2 | 0.000 | 0 |
| studio `/studio` | 21 | 40913 | 38064 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 258 (2) | 0 / 0.0 | 0 | 1084 | 472 | 1328 | P.mt-1.text-sm | 0.000 | 0 |
| production `/production` | 23 | 40887 | 38035 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 260 (4) | 0 / 0.0 | 0 | 809 | 180 | 832 | P.page-lead.lead | 0.034 | 0 |
| screening `/screening` | 22 | 41655 | 37945 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 2 / 1.1 | 0 | 664 | 76 | 700 | VIDEO.pvideo http://localhost:4233/api/media/gen | 0.000 | 0 |
| assets `/assets` | 28 | 54217 | 37990 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 8 / 13.3 | 92 | 691 | 80 | 784 | IMG http://localhost:4233/api/media/gen-4b28ba8f | 0.000 | 0 |
| settings `/settings` | 26 | 40370 | 37689 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 761 | 192 | 784 | P.page-lead.lead | 0.000 | 0 |
| new `/new` | 22 | 42765 | 36864 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 2 / 3.2 | 2 | 653 | 76 | 664 | P.page-lead.lead | 0.000 | 0 |
| music-videos `/music-videos` | 20 | 42381 | 39788 | 279 | 344 | 3 × 562 KB | 3 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 660 | 84 | 668 | H1.page-header-title.page-title | 0.000 | 0 |

What the table says:

- **The snapshot is read three times per load, 562 KB each, on every page** (1.65 MB of JSON before anything specific to the
  page): once by the store's mount effect, once on the event stream's `hello` (`scheduleRefresh(0)`), once more by React
  strict mode in development. In production it is twice (1.1 MB). The job list (84 KB, 300 rows) follows the same pattern.
  The whole studio is 562 KB with **one** production; it grows with every production, take and asset.
- **Readiness is 640–1,150 ms** in development (FCP 76–476 ms is the skeleton; LCP 650–1,330 ms is the first real paint after
  the snapshot). The two slowest are Settings (1,150 ms: three more fetches on mount, `/api/registry` 393 ms TTFB) and
  Studio Company at 390 (1,084 ms: `/api/studio/org` 257 KB).
- **Images are the weight**: the Short overview fetches 12.1 MB of PNG for twelve `<img>` (two of them 1.8–1.9 MB figures
  drawn at 84 × 106 px), the Characters page 8.2 MB for five tiles, the Shorts catalogue 3.7 MB for two **21 × 37 px** face
  circles, Files 37.7 MB for a thumbnail grid (33 originals in view at 1440). See §4.
- **Fonts**: 344 KB (Inter variable woff2) on every English page; CSS 279 KB in dev (207 KB built).
- **Organisation API**: `/api/studio/org` is 257 KB (Studio Company, Production); the shell's pipeline poll is 1 KB on every
  page; Production fetches the pipeline twice (the shell and the page both `useLive` the same URL).
- **CLS** is clean (≤ 0.011) everywhere except Production (0.043 / 0.034: the decisions and pipeline `SECTION`s appear when
  the org data lands at ≈ 1.1 s) and Settings at 1440 (0.019: the registry section). The audit's 0.107 at 390 was with
  the sample studio; the live copy shifts less because it has one production.
- **Console**: 0 errors or warnings on all 40 loads (the audit's "state update on an unmounted component" warning on the
  Short at 390 did not reproduce here).
- **No horizontal overflow** at 390 on any of the 20 pages (`scrollWidth ≤ 390`); the audit's phone findings are about
  content fit inside the viewport, not page overflow.

Status 206 entries in the raw data (`short-produce`, `short-final`, `shot`, `screening`) are the `<video preload="metadata">`
range streams the media element aborts once it has the header; they are not failures. Every one of those players has
`readyState 4` after load: the first segment of each video is fetched on the Produce tab for **eight players at once**
(1.6 MB at 1440, 2.3 MB at 390).

## 4. Images and media against what is displayed

Every library PNG is served as the original (`/api/media/{id}`, no resize variants; the audit's finding holds):
character figures are 928 × 1664 px, 1.7–2.0 MB each. The factor is natural width over displayed device pixels
(CSS px × DPR); the design's budget (§11.5 item 6) is ≤ 2× with figures ≤ 120 KB and stills ≤ 160 KB.

Top rows by bytes (full data in `measure/pages.json`):

| Page @ vp | Image (asset) | Natural px | Displayed CSS px | Bytes | Natural / displayed device px |
|---|---|---|---|---|---|
| characters@1440 | `gen-655c17f72b` | 928×1664 | 173×261 | 2002 KB | 5.4× |
| assets@1440 | `gen-655c17f72b` | 928×1664 | 176×235 (off-screen) | 2002 KB | 5.3× |
| assets@1440 | `up-8401b14b07` | 928×1664 | 176×235 (off-screen) | 2002 KB | 5.3× |
| assets@1440 | `up-684a0b8479` | 928×1664 | 176×235 (off-screen) | 2002 KB | 5.3× |
| characters@390 | `gen-655c17f72b` | 928×1664 | 170×256 | 2002 KB | 2.7× |
| assets@390 | `gen-655c17f72b` | 928×1664 | 172×229 (off-screen) | 2002 KB | 2.7× |
| assets@390 | `up-8401b14b07` | 928×1664 | 172×229 (off-screen) | 2002 KB | 2.7× |
| assets@1440 | `gen-ae45fc676a` | 928×1664 | 176×235 (off-screen) | 1933 KB | 5.3× |
| assets@390 | `gen-ae45fc676a` | 928×1664 | 172×229 (off-screen) | 1933 KB | 2.7× |
| shorts@1440 | `gen-4b28ba8fe5` | 928×1664 | 21×37 | 1896 KB | 44.2× |
| short@1440 | `gen-4b28ba8fe5` | 928×1664 | 84×106 | 1896 KB | 11× |
| short@1440 | `gen-4b28ba8fe5` | 928×1664 | 0×0 (off-screen) | 1896 KB | null× |
| characters@1440 | `gen-4b28ba8fe5` | 928×1664 | 173×261 | 1896 KB | 5.4× |
| character@1440 | `gen-4b28ba8fe5` | 928×1664 | 418×628 | 1896 KB | 2.2× |
| assets@1440 | `gen-4b28ba8fe5` | 928×1664 | 176×235 | 1896 KB | 5.3× |
| new@1440 | `gen-4b28ba8fe5` | 928×1664 | 287×144 | 1896 KB | 3.2× |
| shorts@390 | `gen-4b28ba8fe5` | 928×1664 | 21×37 | 1896 KB | 22.1× |
| short@390 | `gen-4b28ba8fe5` | 928×1664 | 289×361 | 1896 KB | 1.6× |
| short@390 | `gen-4b28ba8fe5` | 928×1664 | 0×0 (off-screen) | 1896 KB | null× |
| characters@390 | `gen-4b28ba8fe5` | 928×1664 | 170×256 (off-screen) | 1896 KB | 2.7× |
| character@390 | `gen-4b28ba8fe5` | 928×1664 | 334×502 | 1896 KB | 1.4× |
| assets@390 | `gen-4b28ba8fe5` | 928×1664 | 172×229 | 1896 KB | 2.7× |
| new@390 | `gen-4b28ba8fe5` | 928×1664 | 356×178 (off-screen) | 1896 KB | 1.3× |
| assets@1440 | `gen-7d2bd77c15` | 928×1664 | 176×235 (off-screen) | 1832 KB | 5.3× |
| shorts@1440 | `gen-f90820998a` | 928×1664 | 21×37 | 1813 KB | 44.2× |
| short@1440 | `gen-f90820998a` | 928×1664 | 84×106 | 1813 KB | 11× |
| short@1440 | `gen-f90820998a` | 928×1664 | 0×0 (off-screen) | 1813 KB | null× |
| shot@1440 | `gen-f90820998a` | 928×1664 | 70×88 | 1813 KB | 13.3× |
| characters@1440 | `gen-f90820998a` | 928×1664 | 173×261 | 1813 KB | 5.4× |
| assets@1440 | `gen-f90820998a` | 928×1664 | 176×235 (off-screen) | 1813 KB | 5.3× |
| shorts@390 | `gen-f90820998a` | 928×1664 | 21×37 | 1813 KB | 22.1× |
| short@390 | `gen-f90820998a` | 928×1664 | 289×361 | 1813 KB | 1.6× |
| short@390 | `gen-f90820998a` | 928×1664 | 0×0 (off-screen) | 1813 KB | null× |
| shot@390 | `gen-f90820998a` | 928×1664 | 70×88 (off-screen) | 1813 KB | 6.6× |
| characters@390 | `gen-f90820998a` | 928×1664 | 170×256 | 1813 KB | 2.7× |
| characters@1440 | `gen-862c1580b5` | 928×1664 | 173×261 | 1697 KB | 5.4× |
| assets@1440 | `gen-862c1580b5` | 928×1664 | 176×235 | 1697 KB | 5.3× |
| characters@390 | `gen-862c1580b5` | 928×1664 | 170×256 | 1697 KB | 2.7× |
| assets@390 | `gen-862c1580b5` | 928×1664 | 172×229 (off-screen) | 1697 KB | 2.7× |
| assets@1440 | `gen-9f9409532f` | 928×1664 | 176×235 | 1691 KB | 5.3× |

Per page: bytes fetched for `<img>` against the device pixels actually shown:

| Page @ vp | `<img>` with media | Image bytes KB | Displayed px (sum) | Natural px (sum) | Pixels fetched / pixels shown | Largest factor |
|---|---|---|---|---|---|---|
| shorts@1440 | 2 | 3710 | 0.00 MP | 3.1 MP | 1987× | 44.2× |
| short@1440 | 12 | 17267 | 0.14 MP | 14.4 MP | 106× | 11× |
| short-storyboard@1440 | 14 | 16345 | 0.20 MP | 14.5 MP | 71× | 6.4× |
| short-produce@1440 | 30 | 18086 | 0.09 MP | 19.0 MP | 212× | 16× |
| short-final@1440 | 8 | 336 | 0.09 MP | 1.9 MP | 21× | 4.6× |
| shot@1440 | 4 | 4520 | 0.04 MP | 3.8 MP | 98× | 13.3× |
| characters@1440 | 5 | 8212 | 0.23 MP | 7.7 MP | 34× | 5.4× |
| character@1440 | 1 | 1896 | 0.26 MP | 1.5 MP | 6× | 2.2× |
| locations@1440 | 1 | 1411 | 0.04 MP | 1.0 MP | 26× | 5× |
| location@1440 | 3 | 4234 | 0.77 MP | 3.1 MP | 4× | 8.8× |
| assets@1440 | 40 | 37980 | 0.96 MP | 35.7 MP | 37× | 7.6× |
| new@1440 | 2 | 3308 | 0.08 MP | 2.6 MP | 31× | 4.7× |
| shorts@390 | 2 | 3710 | 0.01 MP | 3.1 MP | 497× | 22.1× |
| short@390 | 12 | 17267 | 1.52 MP | 14.4 MP | 9× | 4.9× |
| short-storyboard@390 | 14 | 16345 | 2.31 MP | 14.5 MP | 6× | 1.9× |
| short-produce@390 | 23 | 14511 | 0.25 MP | 15.0 MP | 59× | 8× |
| short-final@390 | 8 | 336 | 0.23 MP | 1.9 MP | 8× | 2.9× |
| shot@390 | 4 | 4520 | 0.14 MP | 3.8 MP | 27× | 6.6× |
| characters@390 | 5 | 8212 | 0.87 MP | 7.7 MP | 9× | 2.7× |
| character@390 | 1 | 1896 | 0.67 MP | 1.5 MP | 2× | 1.4× |
| locations@390 | 1 | 1411 | 0.28 MP | 1.0 MP | 4× | 1.9× |
| location@390 | 3 | 4234 | 0.85 MP | 3.1 MP | 4× | 7× |
| assets@390 | 8 | 13634 | 1.26 MP | 12.4 MP | 10× | 2.7× |
| new@390 | 2 | 3308 | 0.51 MP | 2.6 MP | 5× | 1.9× |

Video elements (all `preload="metadata"`, none autoplaying):

| Page @ vp | `<video>` | preload | readyState | Displayed | Source |
|---|---|---|---|---|---|
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-e5a4a94dfd` + poster |
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-54fe3a58b3` + poster |
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-d0adf9d727` + poster |
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-3f19d06ef4` + poster |
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-6e2b105150` + poster |
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-5da19fb2b7` + poster |
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-23d7231ef8` + poster |
| short-produce@1440 |  | metadata | 4 | 392×221 | `gen-cc48a8b114` + poster |
| short-final@1440 |  | metadata | 4 | 812×457 | `gen-4293ab5b09` + poster |
| shot@1440 |  | metadata | 4 | 617×347 | `gen-e5a4a94dfd` + poster |
| screening@1440 |  | metadata | 4 | 544×306 | `gen-4293ab5b09` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-e5a4a94dfd` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-54fe3a58b3` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-d0adf9d727` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-3f19d06ef4` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-6e2b105150` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-5da19fb2b7` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-23d7231ef8` + poster |
| short-produce@390 |  | metadata | 4 | 328×185 | `gen-cc48a8b114` + poster |
| short-final@390 |  | metadata | 4 | 945×532 | `gen-4293ab5b09` + poster |
| shot@390 |  | metadata | 4 | 358×201 | `gen-e5a4a94dfd` + poster |
| screening@390 |  | metadata | 4 | 356×200 | `gen-4293ab5b09` + poster |

Audio: the character profile mounts four `<audio>` sources (1.2 MB) for the voice samples before anyone presses play.

## 5. Paint, largest paint, layout shift

Development server, one sample each (the dev chunks are unminified; the order between pages is more reliable than the
absolute values). Shifts above 0.005:

| Page @ vp | CLS | Shifts > 0.005 (t ms: value, source) |
|---|---|---|
| short-produce@1440 | 0.010 | 1213: 0.0099 OL.space-y-4+DIV.flex |
| production@1440 | 0.043 | 1119: 0.0435 SECTION. |
| settings@1440 | 0.019 | 1246: 0.0186 SECTION. |
| short-produce@390 | 0.011 | 1202: 0.0114 DIV.flex+OL.space-y-4 |
| production@390 | 0.034 | 1134: 0.0337 SECTION. |

Production build (`next start -p 4234`, same database and browser, compressed responses) for the pages the directive
names — the honest "before" for FCP/LCP:

**1440 px** (DPR 1)

| Page | Requests | Total KB | JS KB | CSS KB | Fonts KB | `/api/studio` | `/api/jobs` | Org API KB | Media files / MB | Images | Ready ms | FCP ms | LCP ms | LCP element | CLS | Console |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| home `/` | 81 | 3417 | 1427 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 193 | 88 | 232 | P.page-lead.lead | 0.000 | 0 |
| shows `/shows` | 78 | 3408 | 1427 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 194 | 92 | 200 | P.page-lead.lead | 0.000 | 0 |
| short `/shorts/short-28bdb3342b` | 105 | 15589 | 1431 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 9 / 11.9 | 12 | 211 | 68 | 232 | P.mt-2.max-w-3xl | 0.000 | 0 |
| shot `/shorts/short-28bdb3342b/shots/shot-24bf719d21` | 92 | 8983 | 1445 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 5 / 5.4 | 4 | 190 | 68 | 224 | VIDEO.pvideo http://localhost:4234/api/media/gen | 0.000 | 0 |
| characters `/characters` | 94 | 11699 | 1485 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 5 / 8.0 | 5 | 183 | 64 | 232 | IMG.absolute.inset-0 http://localhost:4234/api/m | 0.000 | 0 |
| character `/characters/char-56c47abc59` | 81 | 5973 | 1498 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 3 / 2.4 | 1 | 184 | 64 | 220 | IMG.absolute.inset-0 http://localhost:4234/api/m | 0.000 | 0 |
| studio `/studio` | 81 | 3730 | 1485 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 258 (2) | 0 / 0.0 | 0 | 186 | 68 | 420 | P.mt-1.text-sm | 0.000 | 0 |
| production `/production` | 83 | 3670 | 1427 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 260 (4) | 0 / 0.0 | 0 | 199 | 96 | 220 | P.page-lead.lead | 0.043 | 0 |
| screening `/screening` | 81 | 4525 | 1427 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 2 / 1.1 | 0 | 184 | 64 | 212 | VIDEO.pvideo http://localhost:4234/api/media/gen | 0.000 | 0 |
| assets `/assets` | 109 | 41092 | 1427 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 33 / 36.8 | 92 | 201 | 68 | 292 | IMG http://localhost:4234/api/media/gen-4b28ba8f | 0.000 | 0 |

**390 px** (DPR 2, mobile emulation)

| Page | Requests | Total KB | JS KB | CSS KB | Fonts KB | `/api/studio` | `/api/jobs` | Org API KB | Media files / MB | Images | Ready ms | FCP ms | LCP ms | LCP element | CLS | Console |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| home `/` | 36 | 2879 | 985 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 174 | 48 | 200 | P.page-lead.lead | 0.000 | 0 |
| shows `/shows` | 36 | 2880 | 985 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 0 / 0.0 | 0 | 176 | 76 | 180 | P.page-lead.lead | 0.000 | 0 |
| short `/shorts/short-28bdb3342b` | 75 | 15284 | 1200 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 9 / 11.9 | 12 | 185 | 52 | 332 | IMG.absolute.inset-0 http://localhost:4234/api/m | 0.000 | 0 |
| shot `/shorts/short-28bdb3342b/shots/shot-24bf719d21` | 53 | 7637 | 1077 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 5 / 4.5 | 4 | 212 | 52 | 244 | VIDEO.pvideo http://localhost:4234/api/media/gen | 0.000 | 0 |
| characters `/characters` | 53 | 11214 | 1088 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 5 / 8.0 | 5 | 171 | 48 | 248 | IMG.absolute.inset-0 http://localhost:4234/api/m | 0.000 | 0 |
| character `/characters/char-56c47abc59` | 43 | 5500 | 1102 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 3 / 2.4 | 1 | 184 | 52 | 212 | IMG.absolute.inset-0 http://localhost:4234/api/m | 0.000 | 0 |
| studio `/studio` | 51 | 3291 | 1120 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 258 (2) | 0 / 0.0 | 0 | 169 | 52 | 384 | P.mt-1.text-sm | 0.000 | 0 |
| production `/production` | 39 | 3167 | 1015 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 260 (4) | 0 / 0.0 | 0 | 176 | 76 | 196 | P.page-lead.lead | 0.000 | 0 |
| screening `/screening` | 43 | 4106 | 1030 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 2 / 1.2 | 0 | 165 | 48 | 188 | VIDEO.pvideo http://localhost:4234/api/media/gen | 0.000 | 0 |
| assets `/assets` | 46 | 16561 | 1034 | 208 | 344 | 2 × 562 KB | 2 × 84 KB | 1 (1) | 8 / 13.3 | 92 | 178 | 76 | 276 | IMG http://localhost:4234/api/media/gen-4b28ba8f | 0.000 | 0 |

Reading the production run:

- **Ready in 165–212 ms, LCP 180–420 ms** on a warm local server: the app itself is fast once the snapshot arrives; the
  baseline to beat is the *amount* of work on the critical path (562 KB × 2 of JSON, 985 KB–1.5 MB of JS, the originals as
  thumbnails), not a slow renderer. Studio Company is the slowest LCP (420 / 384 ms) because its first real paint waits for
  `/api/studio/org` (257 KB) after the snapshot.
- **Desktop prefetches the whole studio**: at 1440 every page load fetches 44–46 JS files (1,427–1,498 KB decoded) and
  22–41 RSC payloads (105–138 KB) against 20–30 files (985–1,200 KB) and 4–26 fetches at 390. The difference is the
  sidebar: its `<Link>`s are in the viewport on desktop, so Next prefetches the route tree and chunks of all 13 navigation
  targets on first load; at 390 they sit in the closed MobileBar sheet. The TopBar of v5 will have the same effect unless its
  links use `prefetch={false}` or the router's hover prefetch.
- CSS is 208 KB (two files) and the font 344 KB on every page in production too; media bytes are identical to the dev run.
- CLS 0.043 on Production reproduces in production (the decisions/pipeline sections arrive after the paint).

## 6. Route loading (client-side navigation) and idle traffic

Six sidebar clicks from `/shows` after the app was loaded (dev server; each page chunk is a 4.4–4.8 MB unminified dev
file — in production the same navigation loads the route-specific chunks of §2, 13–227 KB):

| From → to (sidebar click) | ms to network idle | Requests | KB | By kind |
|---|---|---|---|---|
| → `/shorts` | 2112 | 6 | 4502 | fetch 1/6 KB, font 1/28 KB, js 1/4469 KB, media-image 2/0 KB, image 1/0 KB |
| → `/characters` | 30038 | 9 | 4671 | fetch 3/6 KB, js 5/4664 KB, api-org 1/1 KB |
| → `/production` | 77 | 9 | 5573 | fetch 3/30 KB, js 1/4726 KB, css 2/558 KB, api-org 3/259 KB |
| → `/studio` | 1147 | 3 | 5017 | fetch 1/6 KB, js 1/4755 KB, api-org 1/257 KB |
| → `/screening` | 1547 | 4 | 5375 | fetch 1/6 KB, js 1/4636 KB, media-image 1/93 KB, media-video 1/640 KB |
| → `/settings` | 1032 | 8 | 4386 | fetch 1/6 KB, js 1/4380 KB, api-other 6/0 KB |

(The 30 s on `/characters` is the network-idle timeout, not the page: the five figure PNGs kept the connection busy.)
What each navigation fetches besides JS is the point: Production pulls `/api/studio/org` (257 KB), the pipeline and
reliability at once; Studio pulls the org again; Screening starts a video range stream; Settings fires six fetches.

Idle, after the page has settled:

- `/shows`, 65 s idle after load: 2 API requests — /api/studio/org/pipeline @27.4s, /api/studio/org/pipeline @57.4s
- `/production`, 65 s idle after load: 8 API requests — /api/studio/org/pipeline @27.3s, /api/studio/org @27.4s, /api/studio/org/pipeline @27.4s, /api/studio/org/reliability?hours=168 @27.4s, /api/studio/org/pipeline @57.2s, /api/studio/org @57.4s, /api/studio/org/pipeline @57.4s, /api/studio/org/reliability?hours=168 @57.4s

So every page polls the pipeline every 30 s (`shell/Shell.tsx:67` → `useLive`), and Production repeats pipeline ×2 + org +
reliability: ≈ 520 KB per minute while a producer reads a page that is not changing. An `activity` event adds a refetch of
every mounted `useLive` on top.

## 7. State management (measured picture)

| Fact | Value |
|---|---|
| Store shape | one React context value with 20 members (`src/studio/store.tsx:241`); `useMemo` on all of them, so any change of `state`, `jobs`, `saving`, `connected`, `stream`, `version`, `activityTick` or `lastError` creates a new value |
| Subscribers | 71 files import the store, 113 `useStudio()` call sites; no selector or slice API — every subscriber re-renders on every value change |
| First paint | the shell renders a skeleton until `ready` (`Shell.tsx:122`); `ready` flips after the first `GET /api/studio` (562 KB JSON) is parsed and applied — the HTML never carries content |
| Snapshot reads per load | 3 in development (mount, `hello`, strict mode), 2 in production (mount, `hello`); 562 KB each on `vewbox_inv` |
| Job list per load | 2–3 × `GET /api/jobs?limit=300` (84 KB) |
| On a `studio` event from another tab/worker | `scheduleRefresh(150 ms)` → full snapshot re-read (562 KB) → `setState(whole)` → all 71 subscribers render; the Shell also recomputes `waitingDecisions` |
| On a `job` event | merged in place (`applyJobEvent`), no reload — unless the event has no row, then `GET /api/jobs?limit=300` again |
| On an `activity` event | `activityTick + 1` → every subscriber renders; every mounted `useLive` refetches after 150 ms (the shell's pipeline on every page; org 257 KB + reliability on Production/Studio) |
| Timers | `useLive` refetch every 30 s per hook instance; `ServerBar` tick every 30 s; `useElapsed` 1 s while a job runs; `VoiceSection` recorder 1 s |
| Writes | optimistic: `runCommand` locally, batched to `POST /api/commands` after 120 ms; a hash mismatch forces a full snapshot re-read |
| Outside the store | Settings fetches `/api/registry`, `/api/metrics?hours=168`, `/api/status` on mount (6 fetches incl. strict mode, 87 KB) with no loading or error state |

## 8. Responsive behaviour (what the loads showed at 390)

- No page overflows horizontally (`document.documentElement.scrollWidth ≤ 390` on all 20).
- The same JS, CSS, fonts and API payloads are fetched at 390 as at 1440 — nothing is deferred for the phone; the images are
  the same originals (the device-pixel factor drops only because DPR 2 doubles the target).
- DOM size is identical at both widths (e.g. Files 3,239 nodes / 299 buttons, Produce 1,828 / 121, Storyboard 1,362 / 81):
  the phone receives the desktop tree with CSS hiding parts of it.
- The 390 shell is the MobileBar; `data-nav` and the room never change (see the inventory §11).

## 9. The targets this baseline is measured against (from `DESIGN-SYSTEM-V5.md` §11.5 item 6 and §12)

| Measure | Today (this document) | Target |
|---|---|---|
| First-load JS, floor | 928 KB raw / 282 KB gzip | recorded before/after per package; the shared dictionary/store chunk (241 KB raw) and zod (89 KB) are the first candidates |
| First-load JS, heaviest route | 1,157 KB / 351 KB (episode shot page) | idem |
| Data before first paint | the whole studio, 562 KB × 2–3 | per-page data (no whole-studio snapshot on first paint) |
| Snapshot fetches per load | 2 (prod) / 3 (dev) | 1 or none |
| Image bytes, Characters | 8.2 MB for 5 tiles; 5.4× device pixels | thumbnails at display size, ≤ 2×; figures ≤ 120 KB |
| Image bytes, Short overview | 12.1 MB for 12 `<img>`; up to 11× | idem; stills ≤ 160 KB |
| Image bytes, Shorts catalogue | 3.7 MB for two 21 × 37 px faces (44×) | ≤ 2× |
| Image bytes, Files | 37.7 MB (33 originals) | idem |
| LCP (dev) | 650–1,330 ms | lower after the snapshot leaves the critical path; see §5 production numbers |
| CLS | ≤ 0.011 except Production 0.043 and Settings 0.019 | ≤ 0.01 everywhere (reserve the decisions/pipeline area) |
| Idle traffic | pipeline every 30 s on every page; 520 KB/min on Production | event-driven only |
| CSS | 207 KB / 38 KB gzip on every route, 14 sheets | one sheet per package loaded by its pages (§11.3), aliases gone |

## 10. Caveats

- Development server by directive (the production run in §5 is the exception): dev chunks inflate "JS KB" and the
  timings; the byte counts of data, media and fonts are exact and identical in production except for compression
  (`next start` gzips JSON and JS; the dev server does not).
- Requests must go to `http://localhost:4233`, not `127.0.0.1`: Next 16 blocks `/_next/*` dev resources from an origin not
  in `allowedDevOrigins`, and the page then waits on the skeleton for ever (the first run of this audit did exactly that).
- One Short in the database: the snapshot, the org payload and the per-page image counts scale with content; the shapes of
  the findings (×3 snapshot, originals as thumbnails, polling) do not.
- English interface only; the Arabic TTF fonts (946 KB) were not loaded in these runs.
- Viewports 1440 × 900 (DPR 1) and 390 × 844 (DPR 2, touch, mobile UA); the audit's 834 and 1920 captures cover layout, not
  payload, and payload does not change with width here.
