# Design QA of the integrated website — 2026-10-04

Independent Design QA Director · judged against docs/design/VISUAL-STANDARD-V5.1.md (v5.1), docs/design/PAGE-ENGINEERING-BRIEF.md
and the producer's reference (Krea's app home, captured with a desktop Chrome user agent:
`docs/evidence/design-qa-integrated/krea-1440.png`, `krea-1920.png`, measurements in `krea-1440.json`).

**Setup.** Own dev server on :4261 (worktree branch `worktree-agent-a6534e5fca8d451ac`, main's `.env.local`, `DATABASE_URL`
pointed at `vewbox_qa`, a `pg_dump | psql` copy of `vewbox`; `LIBRARY_ROOT` main's). Live data: the short *The Static Sky*
(2 scenes, 8 shots, 15 takes, 3 cuts), 5 characters (two drafts, one named أبو سلام), 1 location. Shows and music videos were
captured on the `states` fixture (the browser's own reads answered from `scripts/v4-fixture.ts`; no write ever left the page
except one Screening Room note, sent to the copy database). Nothing was POSTed to :4200; no job was started.

**Method.** `scripts/qa-integrated.mjs` (committed) opens every page at 1440×900, 1920×1080 and 390×844 on a throttled
network (CDP 1.5 Mbps / 150 ms), screenshots the first loading picture and the loaded page (`<page>-<w>-skeleton.png`,
`-first.png`, full page `<page>-<w>.png`, and a side-by-side + 50 % overlay `-skeleton-vs-loaded.png`), records the
sequence of loading pictures and every layout shift after first paint (CLS), and measures: the shared start edge, equal
heights in rows, the font family of every visible text node, text under 12 px, uppercase, horizontal overflow, broken or
unavailable pictures, WCAG AA contrast of every text node on its computed ground, the radius family, borders and shadows on
cards, outlined buttons, Arabic glyphs outside content containers, names on their frame's start edge, progress bars, the
first 40 Tab stops with their focus ring (desktop), and every control's hit area at 390. Results: `report-1440.json`,
`report-390.json`, `report-1920.json`. Interactions: `interactions.json` + `ix-*.png`. Everything in
`docs/evidence/design-qa-integrated/`.

**Caveats, stated plainly.** The session restarted twice and the dev server's `.next` cache was corrupted once; the
measurement pass at 390 and 1920 was interrupted and only partly re-run before the producer's stop. 1440 is measured for
every page except Files and Kit (the pass was still running at the stop; their captures land in the folder if it
finishes); 390 is measured for Home, Shows (live and fixture), Season, Episode, Shorts and the Short page; 1920 is measured for Home, Shows, Show, Season, Episode and captured plainly (no
measurement) for the rest. Pages marked "not verified" below were captured but not looked at at that width. Script-side
errors ("never ready" rows in the JSON reports, the first interactions run's keyboard failures that did not reproduce in
`var/qa-scratch/debug-ix.mjs`) are **not** listed as defects.

---

## 1. Verdict per page

| Page | 1440 | 1920 | 390 | Verdict | Notes |
|---|---|---|---|---|---|
| Home `/` | measured | measured | measured | **pass with notes** | the strongest page; three loading pictures on a slow load (M3), tool-card lines truncated (m6), hero 4:3 instead of 4:5 on phone (m9) |
| Shows `/shows` (live, empty) | measured | measured | measured | pass with notes | explanatory "How a show is made" card in an empty page (m10) |
| Shows `/shows` (fixture) | measured | measured | measured | pass with notes | card width 357 vs Home 288 (M6); no Shows/Shorts/Music Videos control on phone (M4) |
| Show `/shows/last-sip` | measured | measured | captured | pass with notes | title column at x 432 is on no column line (p3); meta truncation on cast tiles |
| Season | measured | measured | measured | **pass** | |
| Episode lobby | measured | measured | measured | **pass** | |
| Shorts `/shorts` | measured | captured | measured | pass with notes | poster 208 vs Home 184 vs Screening 264 (M6) |
| Short `/shorts/short-28bdb3342b` | measured | captured | measured | **pass with notes** | the best detail page: docked transport, scene strip, real downloads; at 390 the loading sequence is five pictures (M3) and 26 controls are under 44 px (M7) |
| Music videos (live, empty) | measured | captured | not verified | pass with notes | numbered explanatory steps in an empty page (m10) |
| Music videos (fixture) | measured | captured | not verified | pass with notes | M6 |
| Music video `/music-videos/river-lights` | measured | captured | not verified | pass with notes | title at x 688 on no column line (p3); Arabic lyrics correct |
| Characters `/characters` | measured | captured | not verified | pass with notes | figure 208 vs Home 168 (M6); search box shown under the six-item rule (p6) |
| Character (English) `char-56c47abc59` | measured | captured | not verified | **fail** | shot labels drawn over faces (M5) |
| Character (Arabic) `char-bc112248bf` | measured | captured | not verified | **pass** | أبو سلام isolates LTR on the start edge; the Arabic logline right-aligns as a paragraph (allowed, §4.4) |
| Character (draft) `char-9b904cf79c` | measured | captured | not verified | pass | "Waiting for your approval" uses the dot, not tungsten text (checked by computed colour) |
| Characters / new (Auto, Manual, From a picture) | measured | captured | not verified | **fail** | generic shell skeleton, CLS 0.16 / 0.16 (M1) |
| Locations `/locations` | measured | captured | not verified | pass with notes | plate 357 wide (M6) |
| Location `loc-cde19129ca` | measured | captured | not verified | pass with notes | Landmarks/Props cards 329 vs 339 high in one row (m4) |
| Locations / new | measured | captured | not verified | pass with notes | generic shell skeleton (M1), CLS 0 because the form is short |
| Create `/new` | measured | captured | not verified | **pass** | |
| New short (auto, manual), New show, New music video | measured | captured | not verified | **pass** | validation works ("Give the short a title or one line about it."), paused notice honest |
| Workspace `/shorts/…/production` | measured | captured | not verified | **fail** | skeleton does not match the page, CLS 0.063 (M2); "Checking whether the studio can take new work…" beside "Done" (m7); empty band under Story (p4) |
| Shot `/shorts/…/shots/shot-24bf719d21` | measured | captured | not verified | pass with notes | CLS 0.0034 (takes disc), "Ending frame" tab disabled without a reason (p7) |
| Screening Room `?p=` | measured | captured | not verified | pass with notes | "· current" 4.42:1 (m5); notes composer writes correctly |
| Screening Room lobby | measured | captured | not verified | pass | |
| Studio Company | measured | captured | not verified | pass with notes | "Idle" 4.42:1 at 12 px (m5) |
| Department (Casting) | measured | captured | not verified | pass with notes | tool descriptions cut to one line hide what the tool does (m6) |
| Agent (Casting Director) | measured | captured | not verified | pass | |
| Production, `#engine-room` | measured | captured | not verified | pass with notes | history chips appear late (CLS 0.016, p5); the anchor scrolls correctly (#engine-room top 58 px) |
| Settings | measured | captured | not verified | **pass** | every check green at 1440 (`settings-1440.png`); honest "Saved — the studio does not use this choice yet" lines |
| Files `/assets` | captured | captured | not verified | not verified | |
| Kit `/kit` | captured | captured | not verified | not verified | |

What passed everywhere it was measured (34 pages at 1440, 6 at 390, 6 at 1920): Geist / Geist Mono on every text node
(system sans only inside Arabic content); no text under 12 px; no uppercase; no horizontal overflow; no broken or
"unavailable" picture after the scroll; every computed radius in the family; no card with a border or shadow; no outlined
button; no Arabic glyph outside a content container; a visible focus ring on every one of the first 40 Tab stops on every
desktop page (the sidebar's inset ring, the page's offset ring), no hidden stop; tungsten only on badges, dots and the
needs-you count (checked by computed colour on Home, Production, Characters, the draft character, the Screening Room).

---

## 2. Defects, ranked

No blocker: nothing is broken, invented or unreachable on desktop. The majors are the things that make the site not yet
feel like one finished application.

### Major

**M1 · `/characters/new` (Auto, Manual, From a picture) and `/locations/new` — the generic shell skeleton, then a layout
shift of 0.16.** 1440. The route is not in `src/components/shell/route-skeletons.tsx`, so the shell draws
`ShellSkeleton` (title bars and a 4-column tile grid) and the two-column form replaces it. Evidence:
`annotated-M1-characters-new-generic-skeleton-1440.png`, `character-new-auto-1440-skeleton-vs-loaded.png`; report-1440:
`skeleton.generic=true`, CLS **0.1637** (auto), **0.1566** (from a picture), nodes `pc-create-body`, `char-form-acts`.
Breaks: brief §2 "Skeletons match the content exactly … Export `<Page>Skeleton` and register it"; v5.1 §5.22, §6.5 (zero
layout shift). Fix: export `CreateCharacterSkeleton` (the mode segmented, the notice slot, the form card at its real width
and the figure title card) and `CreateLocationSkeleton` from their packages and add both to `ROUTE_SKELETONS`.

**M2 · Workspace `/shorts/[id]/production` — the skeleton is a tile grid; the page is decision cards and text; CLS 0.063.**
1440. `annotated-M2-workspace-skeleton-mismatch-1440.png`, `workspace-1440-skeleton-vs-loaded.png`; report-1440 CLS
**0.0627**, shifting nodes `ws-sec ×3` at 49.3 s. Breaks v5.1 §5.22 ("shapes mirror the final layout exactly"), brief §2.
Fix: `ProductionWorkspaceSkeleton` must draw what the map draws first: the status line, the "Waiting for you" row of two
decision cards (16:9 + body), the "On the floor" head and one text line, the Story head + two prose lines, then the
breakdown table rows — not a grid of tiles.

**M3 · Every lazy route — three loading pictures on a slow network.** 390 (and by construction every width). The
server-rendered page carries the page's own skeleton; when React hydrates, the `dynamic()` skeleton chunk is not on the
client yet, so `ShellSkeleton` is drawn for ~5 s, then the page skeleton again, then content. Measured on Home at 390:
`shell@819 › page@1127 › shell@40676 › content@41105`; on Shorts at 390: `shell@17205 › page@17512 › shell@57128 ›
content@58521`; on the Short page at 390 five pictures: `shell@1134 › page@1135 › shell@41468 › page@41715 ›
content@55680` (report-390 `sequence`); trace `skeleton-sequence-home-390.txt`;
`annotated-M3-loading-sequence-390.png`. Breaks v5.1 §6.1 ("the main area shows the page's skeleton … then crossfades to
content") and §6.5 (zero layout shift; the skeletons differ in height). Fix: do not lazy-load skeletons — import the
`<Page>Skeleton` components statically in `route-skeletons.tsx` (they are a few hundred bytes of markup each), or
preload the chunk for the current route in the boot script so the fallback never renders.

**M4 · Phone navigation — Shorts and Music Videos cannot be reached from the bars.** 390. `nav-model.ts` and `PhoneNav.tsx`
promise that Productions opens Shows "which carries Shows | Shorts | Music Videos at its top"; `ShowsCatalogue.tsx` draws
no such control (interactions.json "390: Productions tab → /shows": no radiogroup/tab found; `annotated-M4-phone-productions-no-segmented-390.png`,
`ix-phone-productions-shows-390.png`). On a phone the only way to Shorts or Music Videos is a Home shelf's "All" link or
the palette. Breaks v5.1 §5.2 ("Productions opens /shows with a segmented control Shows | Shorts | Music Videos") and the
producer's "every control reachable". Fix: render a `Segmented` (Shows · Shorts · Music Videos, linking) under the page
head of the three catalogues below 1024 px, as the nav model documents.

**M5 · Character page, "Appears in › Shots" — labels drawn over faces.** 1440 (`/characters/char-56c47abc59`). The shot
tiles print "Shot 1.3 · The Static Sky" at the bottom-start over the still; in shots 1.3, 1.4 and 2.2 that is where the
figure's face is. `annotated-M5-shot-labels-over-faces-1440.png` (crop of `character-en-1440.png` at y 2180–2620).
Breaks v5.1 §5.5 ("Never over a face (use the end corner when the face is at the start)") and the producer's "text over
faces". Fix: use the media tile anatomy (name and meta under the frame) for the shot grid, or at least one 22 px chip
placed by `presentation.faceBox` (end corner when the face is at the start).

**M6 · Card sizes differ from page to page.** 1440. The same object has a different size on every page: poster **184×276**
on Home, **208×312** on Shorts, **264×396** in the Screening Room; figure **168×361** on Home, **208×433** on Characters;
16:9 **288×162** on Home, **357×201** on Shows and Locations (measured in `var/qa-scratch/debug-colors.mjs`, visible in
`annotated-M6a-home-poster-184-1440.png` vs `annotated-M6b-shorts-poster-208-1440.png`). The Shelf fixes widths per
kind; the catalogues use `repeat(auto-fill, minmax(…, 1fr))` grids (`media.css` `.grid-shows 19rem`, `.grid-posters
10.5rem`, `.grid-portraits 12.5rem`), so cards stretch to fill the row. Krea's reference keeps one card size (288×192, 30
of 40 cards in `krea-1440.json`). Breaks the producer's "small consistent cards", brief §1 "Match [Home's] card
proportions on every page". Fix: give the catalogues the Shelf's widths (`repeat(auto-fill, 184px)` for posters, 168 for
figures, 288 for 16:9, 216 for sleeves) with `justify-content: start`, and the Screening Room lobby the same poster width.

**M7 · Phone — buttons and links are 40 px or less on a coarse pointer.** 390. report-390 `targets`: `.btn` md 40 high
("Open the film" 176×40, "Screen it" 174×40, "New show" 118×40, "New episode" 139×40, the split chevron "More ways to
start a show" **32×40**), `.btn-sm` "Review" 86×**32**, section links "All" 35×**32**, season chips 91×**32**, the back link
`a.page-back` 358×**24**, top-bar icon buttons 40×40; on the Short page 26 controls under 44 px (the download buttons,
the scene-strip chips, the section links). `tokens.css` sets `--control-h: 44px` under `(pointer: coarse)`, but
`.btn`, `.chip`, `.shead-link` and `.page-back` do not read it. `annotated-M7-phone-buttons-40px-390.png`. Breaks v5.1 §5
("Coarse pointers: every control ≥ 44 × 44"), §5.3, §5.13 ("44 coarse"). Fix: `min-block-size: var(--control-h)` on
`.btn` and `.chip`; `min-block-size: 44px` on `.shead-link`, `.page-back` and `.phone-action` under `(pointer: coarse)`
(keep the visual size with transparent padding where the design wants 32).

### Minor

**m1 · Shows / Music videos live (empty) — an explanatory card where the standard wants title, one sentence and the
actions.** 1440/390. `shows-live-1440.png`: a "How a show is made" three-step card beside the start card;
`music-videos-live-1440.png`: three numbered steps under two start cards. v5.1 §5.23 "Empty page: the page title, one
sentence, and the action cards. No illustration"; the producer's "decorative empty sections". Fix: drop the steps (the
Create page already explains Auto/Manual) or fold one sentence of it into the start card's line.

**m2 · Home 390 — the marquee is 4:3, not the 4:5 face-anchored crop.** `home.css` line 61 `aspect-ratio: 4 / 3`; v5.1 §7.1
"Phones use a 4:5 crop computed from the face … 358 × 448". The head is intact in the current frame (`home-390.png`) but
the rule is not implemented, so another frame will crop. Fix: `aspect-ratio: 4 / 5` and `object-position` from
`portraitFocal.x`.

**m3 · Workspace — "Checking whether the studio can take new work…" beside "Done: every shot has a selected take".**
1440, `workspace-1440.png` under the Breakdown review. The disabled "Produce every shot" carries a reason, but the line
under it reads as a check that never finishes on a finished film. Producer: "anything that pretends". Fix: on a COMPLETE
production show no gate line at all; while a gate check is in flight show it for at most one round-trip, then the
answer.

**m4 · Location page — the Landmarks and Props cards in one row are 329 and 339 px high.** 1440, report-1440 `rows`
`section.pc-section.loc-cols 329/339`; `location-1440.png`. v5.1 §8.4 "every card in a row has the same top and height".
Fix: `align-items: stretch` on `.loc-cols` and `block-size: 100%` on the two cards.

**m5 · Two AA contrast misses on text-3 over surface-3.** `/screening?p=` "· current" in the cut segmented: **4.42:1** at
13 px (`span.theatre-latest`); `/studio` orchestrator "Idle": **4.42:1** at 12 px (`span.co-orch-state`). v5.1 §3.1 says
text-3 is "never on s3". Fix: text-2 on those two spans.

**m6 · Truncation that hides meaning.** Home tool cards at 1440 and 390: "9 departments · 35 ag…", "Seasons that share
on…" (`tool-card-line` is `white-space: nowrap; text-overflow: ellipsis`, kit.css 813); Department page: all ten tool
descriptions cut mid-sentence ("Qwen-Image-Edit-2511 with up to three re…"). Fix: shorten the tool-card lines to fit
232 px ("9 departments, 35 agents" → "35 agents in 9 departments" still overflows: write "9 departments" and put the
agents in the title tooltip), and give `cp-row-meta` two clamped lines.

**m7 · Production — the history filter chips appear after the list (CLS 0.016).** 1440, report-1440 shifts `cp-section,
chip ×3` at 50.3 s. Under the 0.02 line but visible. Fix: reserve the chip row's 32 px in the skeleton and in the loaded
state before the counts arrive.

**m8 · Character pages — a disabled "Saved" button stands where a status word belongs.** `character-en-1440.png` under
Notes for the writers (report: `disabledNoReason: button.btn.btn-secondary "Saved"`). v5.1 §5.3 pairs disabled with a
reason; the producer's "a button that does nothing". Fix: show the status indicator "Saved" (§5.12) and only a "Save"
button while the text is dirty.

**m9 · Characters — the search field shows for five characters.** `CastDirectory.tsx` line 84 renders `CatalogueBar`
regardless of `FILTER_FROM`; v5.1 §5.15 "Shown only when a catalogue has more than six items". `characters-1440.png`.
Fix: gate the bar with the same `large` flag as the filters.

### Polish

**p1 · Detail-page titles beside their art sit on no column line.** Show title at x 432 (poster 112 + 32), Music video
title at x 688, Character name at x 733 (report heads). v5.1 §3.5 "every heading … starts on the content start edge or a
column line" (lines at 288 + n·93.3). Fix: size the art column to whole columns (e.g. 3 columns + gutter → text at 568).

**p2 · Workspace — an empty band (~130 px) between the Story meta and "Breakdown review".** `workspace-1440.png` y
≈ 970–1100. Fix: find the collapsed/empty section and remove its margin when it has nothing to show.

**p3 · Shot page — the "Ending frame" tab is disabled with no reason** (report `disabledNoReason`). Fix: `aria-describedby`
"No ending frame was drawn for this take" and the tooltip.

**p4 · Home featured card at 390 — the thumbnail strip reflows after the card (CLS 0.0036, `feat-thumbs`).** Reserve the
4-up row's aspect in the skeleton.

**p5 · Seek bar hit area 24 px at 390** (`Seek 80×24`, interactions.json). v5.1 §5.24 allows 24; the producer's 44 rule
does not. Fix: `padding-block` to 44 with the 4 px track centred.

**p6 · The Screening Room's "Play" under the notes pane timed out once in the interactions run** (`/screening?p: Play
puts the lights down`: `locator.click: Timeout 30000ms`). In `debug-ix.mjs` the button was 36×36, visible, enabled, and
`/shorts/[id]`'s identical transport played. Not reproduced; listed so the fix of M2/M3 is re-checked here.

---

## Re-verification 2026-10-05

**Scope (as instructed, nothing else):** the pages behind M1–M7 and the minors — Home, Shorts, Short, Music videos
(fixture), Music video, Characters, Character EN, characters/new ×3, locations/new, Location, Workspace, Shot, Screening
Room (film and lobby), Production, Studio — plus the never-verified Files and Kit, at **1440 and 390**; plus
`--interactions` (44 steps, including the phone bar and the Screening Room Play). Branch merged with main at `5ef00cc`
(includes 4d875e1); script from main (the touch-emulation fix after full-page captures), plus two timeout changes of mine
in the interactions runner (route compile time; `waitForURL` after Enter in the palette).
Evidence: `docs/evidence/design-qa-integrated/re-2026-10-05/` (`report-1440.json`, `report-390.json`,
`interactions.json`, captures as before).

**Server note.** The dev server's `.next` cache broke three times under load (`UNKNOWN: open …\chunks\app\layout.js`,
health 500). The first nine 1440 pages and the first three 390 pages were measured on the **dev** server; the rest on a
**production build of the same commit** (`next build --webpack`, `next start -p 4261`, same copy database). Loading times
in the reports are therefore not comparable with 2026-10-04 (production pages load in 3–7 s instead of 40–60 s), but every
CLS, skeleton-sequence, size and contrast number is. M3 is confirmed fixed on the dev server too (below).

### Before → after

| Item | Page · width | Before (2026-10-04) | After (2026-10-05) | Status |
|---|---|---|---|---|
| **M1** generic skeleton, CLS | characters/new auto · 1440 | generic shell skeleton, CLS **0.1637** | own skeleton (`generic=false`), sequence `page›content`, CLS **0** | **fixed** |
| | characters/new picture · 1440 | generic, CLS **0.1566** | own skeleton, CLS **0** | fixed |
| | characters/new manual, locations/new · 1440 | generic, CLS 0 | own skeleton, CLS 0 | fixed |
| **M2** workspace skeleton | workspace · 1440 | tile-grid skeleton, CLS **0.0627** | `page›content`, CLS **0.0008**; skeleton shape matches the map | **fixed** |
| **M3** three to five loading pictures | Home · 390 | `shell›page›shell›content` | `page›content` (dev server, CLS 0.0002) | **fixed** |
| | Shorts · 390 / Short · 390 | `shell›page›shell›content` / five pictures | `page›content` both (dev) | fixed |
| | all 19 other re-run pages, both widths | — | `page›content` on every one except Kit | fixed |
| **M4** phone: Shorts / Music Videos unreachable | /shows · 390 | no segmented control | Productions → `/shows` with **Shows · Shorts · Music Videos**; More sheet also lists them (item height 44) | **fixed** |
| **M5** labels over faces | Character EN · 1440 | "Shot 1.3 · The Static Sky" over the still | name and meta under each 16:9 still (`re-2026-10-05/character-en-1440.png`) | **fixed** |
| **M6** card sizes per page | 1440 | poster 184 / 208 / 264; figure 168 / 208; 16:9 288 / 357 | poster **184** (Home, Shorts, Screening); figure **168** (Home, Characters); 16:9 **288** (Home, Locations) | **fixed** (Shows grid not measurable live: no shows) |
| **M7** phone targets < 44 | Home · 390 | 9 (buttons 40, Review 32, "All" 35×32, …) | **0** | **fixed** for buttons, chips, section links, back links, bars, transport (seek 80×**44**) |
| | residual controls · 390 | — | still under 44: characters/new "Change" **47×20**; workspace pipeline links ("Story: the approved script", "2 scenes", …) **×32**, final-cut strip shot links **34–39×64**, "Screen" **46×20**, studio-line "Resume in the Studio Company" **49×18** (also on Shot); Shot "Mark in"/"Mark out" **40×44**, a **13×13** checkbox; Screening note timecode "Jump to 0:00" **41×20**; Production/Files `cp-link` "Najm" **35×46** | **still open** (text links and inline controls) |
| m1 empty-page explainers | Shows / Music videos live | step cards | not in the re-run scope | not verified |
| m2 phone hero 4:3 | Home · 390 | 358×269 (4:3) | **358×448 (4:5)**, head intact | fixed |
| m3 "Checking whether…" beside "Done" | workspace · 1440 | present | "Intake is paused; new work waits." | fixed |
| m4 unequal row | Location · 1440 | Landmarks/Props **329/339** | equal (no unequal row) | fixed |
| m5 contrast text-3 on s3 | Screening "· current"; Studio "Idle" | **4.42:1** each | no AA miss on either page | fixed |
| m6 truncation | Home tool cards | "9 departments · 35 ag…" | no truncation on Home (1440, 390) | fixed (Department page not in scope) |
| m7 late chips | Production · 1440 | CLS **0.0164** | CLS **0** | fixed |
| m8 disabled "Saved" button | Character EN · 1440, 390 | disabled `.btn` "Saved", no reason | unchanged | **still open** |
| m9 search under six items | Characters · 1440 | search shown for 5 | search still shown for 5 (interactions) | **still open** |
| p1 titles off the column lines | Music video · 1440; Character EN | heads at x 688 / 733 | 688 / 1035 / 288; 733 | still open (polish) |
| p2 empty band under Story | workspace · 1440 | ~130 px empty | holds "You approved the story · Request changes" | fixed |
| p3 "Ending frame" disabled, no reason | Shot · 1440 | no reason | no reason | still open (polish) |
| p4 featured thumbs reflow | Home · 390 | CLS 0.0036 | CLS 0.0002 | fixed |
| p5 seek hit area | Short · 390 | 80×24 | 80×**44** | fixed |
| p6 Screening Play | interactions | one timeout | Play → lights down, Pause → restored; 44/44 steps pass | fixed (not reproduced) |
| **N1 (new, blocker)** | **locations/new · 390** | never measured at 390 | the form is laid out in a **~26 px column**: one letter per line, textarea **30×120**, name field **26×44**, the actions cut off (`re-2026-10-05/location-new-390.png`). Cause: `cast.css:144` `.pc-create-body[data-plate] { grid-template-columns: minmax(0, 720px) 300px }` outranks the phone rule `cast.css:173` `.pc-create-body { grid-template-columns: minmax(0, 1fr) }`, so the 300 px track for the hidden preview stays. | **new** |
| N2 (new, polish) | Kit · 1440, 390 | never measured | generic shell skeleton (`shell›content`), not registered in `route-skeletons.tsx`; Kit is the internal specimen page | new |

Script artefacts, not defects: "names on the frame edge" on Workspace and Production (the decision cards' 16 px body
padding, by design §5.7), "one start edge" on Workspace and Shot (the cutting room's own outline column, x 80), and Studio's
"equal heights" (`co-grid` holds the company diagram and the orchestrator panel, not a row of like cards).

**Fix for N1:** add `.pc-create-body[data-plate]` to the `@media (max-width: 1023px)` rule at `cast.css:173`
(`.pc-create-body, .pc-create-body[data-plate] { grid-template-columns: minmax(0, 1fr); }`).
**Fix for the M7 residue:** give `.link-quiet`, `.ws-textlink`, `.ws-studioline-link`, `.theatre-note-tc`, `.cp-link`
and the workspace pipeline/strip links `min-block-size: 44px; min-inline-size: 44px` under `(pointer: coarse)` with
transparent padding; `.btn-quiet` icon buttons in the shot transport to 44 wide; the shot's checkbox inside a 44 px label.

### Final verdict per page (re-verified pages only)

| Page | 1440 | 390 | Verdict |
|---|---|---|---|
| Home | all checks ✓ | all checks ✓ | **pass** |
| Shorts, Short | ✓ | ✓ | **pass** |
| Music videos (fixture) | ✓ | ✓ | **pass** |
| Music video | title off the column line (p1) | ✓ | pass with notes |
| Characters | ✓ | ✓ | pass with notes (m9) |
| Character EN | ✓ | ✓ | pass with notes (m8, p1) |
| characters/new manual | ✓ | ✓ | **pass** |
| characters/new auto, from a picture | ✓ | "Change" 47×20 | pass with notes |
| **locations/new** | ✓ | **N1: form 26 px wide** | **fail** |
| Location | ✓ | ✓ | **pass** |
| Workspace | ✓ (CLS 0.0008) | 12 controls < 44 | pass with notes |
| Shot | ✓ | 4 controls < 44; p3 | pass with notes |
| Screening Room (film) | ✓ | note timecode 41×20 | pass with notes |
| Screening Room lobby | ✓ | ✓ | **pass** |
| Production | ✓ | "Najm" link 35 wide | pass with notes |
| Studio | ✓ | ✓ | **pass** |
| Files (first verification) | ✓ | "Najm" link 39 wide | pass with notes |
| Kit (first verification) | generic skeleton (N2) | generic skeleton (N2) | pass with notes |

---

## 3. The ten things that most keep the site from Krea's level, in order

1. The loading experience: three different skeleton pictures on a slow load (M3), a generic grid where a form arrives
   (M1), a workspace skeleton that is not the workspace (M2). Krea's app draws one placeholder set and fills it.
2. One card size per object across the site (M6). Krea: 288×192 everywhere; here every catalogue stretches its cards.
3. Phone navigation is incomplete (M4) and its controls are 24–40 px (M7); Krea's mobile app has one tab bar that reaches
   everything.
4. Labels drawn over art (M5): the reference never prints over a picture; captions live under it.
5. Empty pages that explain instead of start (m1): the reference's empty states are one line and one button.
6. Lines that pretend to be in flight or to be a button (m3, m8).
7. Truncated words that cut meaning (m6): the reference writes to the width.
8. Column discipline on detail pages (p1): titles should land on the grid like everything else.
9. Small contrast and height slips (m4, m5, m7).
10. The marquee crop rule on phones (m2).

## 4. Where Vewbox is at the reference's level, and where it is not yet

At the reference's level: the chrome. The neutral ladder (page #101010 — the same value Krea paints), the quiet
charcoal cards without borders, one type family with tight titles, the compact sidebar with a collapse that keeps the
column still, a command palette with focus return, dialogs and menus that close on Esc and return focus, and the
Short page — hero, docked transport, scene strip, honest downloads and credits — read like one premium product. Fonts,
floors, radii, focus rings and the English-only rule hold on every page measured; Arabic names and lyrics render
correctly inside the English grid. The loaded pages at 1440 are, frame for frame, close to the reference's calm.

Not yet: the moments between pages. Krea's home arrives as one picture and fills; Vewbox's arrives as three (M3) and on
four routes as the wrong one (M1, M2). Krea holds one card size across its home; Vewbox changes it on every catalogue (M6).
Krea's mobile view reaches every tool from one bar with 44 px targets; Vewbox's phone cannot reach two of its three
catalogues (M4) and its buttons are 40 px (M7). Fix the four majors on loading and sizing and the site will feel like one
application; the rest is polish.
