# Vewbox Studio: UX audit for the redesign (2026-10-03)

Status: the audit the redesign builds on. Written by the UX audit agent, 2026-10-03, on branch
`worktree-agent-adb4d6043f58d4b10`. No application code was changed.

What was audited: the website as it renders today (F0–F4 and B1 merged, page packages never built) on three data
states:

- **live**: a private copy of the real studio (`vewbox_audit`): 5 characters with canonical images and voices, the
  completed Short *The Static Sky* (8 shots, chosen takes, assembled cut, a 1080p export), one location with plates.
  Job intake was paused, so nothing could start.
- **sample**: `scripts/v4-fixture.ts sample` (two shows, two shorts, two music videos, seven characters, four places),
  answered in the browser only.
- **empty**: the fixture with nothing in it; **states**: the sample plus a draft, a locked character, a STORY gate, a
  running and a failed job.

How: headless Chromium through `scripts/lib/capture.mjs` (`prepare()` answers every write in the browser, so no capture
could change a record), a dev server on :4231 (`next dev --webpack`), widths 1440 · 1920 · 390 · 834, English and
Arabic. A `next build --webpack` in the worktree gave the route weights. Captures:
`docs/evidence/redesign-audit/<page>-<state>-<lang>-<width>.png`, plus `journey-*.png` for interactions (palette, menu,
loading, server down, expanded details, focus, hover). Every claim below names its capture or its file.

Severity follows v3/v4: **S1** blocks a task or fails WCAG AA · **S2** off-direction or wrong · **S3** polish.

---

## 0. The verdict

The producer is right, and the reason is not the colour palette. Today's Vewbox is an **engineering console for an
AI pipeline, wearing a dark theme**. Every page is the same admin template (title, bordered panels, KPI tiles, filter
selects, key-value tables, Edit · Duplicate · Delete), and the one thing a film studio must make beautiful, the
**films, faces and places it has made**, is hidden, cropped, thumbnailed into grey boxes or buried under engine
telemetry. The v4 design system defined the right answer ("the work is the light", three rooms, shape is identity),
and F0–F4 built most of its parts, but **no product page uses them**: the media kit, heroes, tiles, rail, film strip,
storyboard reel, timeline, compare, theatre player, dialogs and the catalogue bar exist only on the `/kit` specimen
page. What the producer sees is v3 page code inside the new sidebar.

The 15 most damaging problems, ranked by how much they cost the "premium filmmaking platform" impression:

| # | Problem | Where (evidence) | Sev |
|---|---|---|---|
| 1 | **The finished film is invisible.** The studio's only completed Short has no poster or key art anywhere. The Shorts catalogue shows a near-black tile whose fallback title is clipped behind two face circles; the Short's hero is a 150 × 85 grey box saying "The Static Sky"; the overview has no play button (the cut is two clicks away on *Final Cut*); the Screening Room shows it as one half-width card. 8 strong frames and a 56 s cut exist and none of them is used as art. | `shorts-live-en-1440`, `short-live-en-1440`, `journey-short-fold-en-1920`, `screening-live-en-1440` | S2 |
| 2 | **No front door.** `/` redirects to `/shows`, which says "No shows yet." to a studio holding a finished film, five characters and a location. Nothing says what was made, what is in progress or what needs the producer. | `home-live-en-1440`, `src/app/(app)/page.tsx`, `src/components/shell/nav-model.ts` (`HOME = '/shows'`) | S2 |
| 3 | **One admin template for every kind of work.** Short, Episode and Music Video overviews are the same page: KPI tiles (Scenes · Shots · Frames · Takes), the synopsis twice, a key-value table, Edit · Duplicate · Delete in the aside. Catalogues are a title + 4–6 bordered selects + a grid. The v4 "rooms" are not live: **no page renders `<Room>`**, so the cutting room's density and the theatre never appear. | `short-live-en-1440`, `music-video-sample-en-1440`, `episode-sample-en-1440`, `characters-live-en-1440`; `grep "<Room"` = 0 | S2 |
| 4 | **The engine room is shown to the producer.** Raw exceptions ("ComfyUI CLIPTextEncode #7 failed: RuntimeError: Failed to find C compiler…") four times on Production (even in an empty studio); Settings lists 51 model files (`diffusion_models/…safetensors`), every workflow hash, GPU, p50/p95 timings; Final Cut says "native MiniMax sound", "(MiniMax H3, speech checked)"; the voice panel shows character/word error rates and "indextts · IndexTTS-2.5"; agent pages read "durable child jobs with idempotency keys". | `production-live-en-1440`, `settings-live-en-1440`, `short-final-live-en-1440`, `journey-character-voice-en-1440`, `agent-live-en-1440` | S2 |
| 5 | **Status contradicts itself.** The sidebar says *Production • 2* and the tab title "(2) Production"; the page says "Nothing waits for you right now" (the 2 are draft character images the page never lists). Two jobs sit "Awaiting review" in a 70-row log (D28). Studio Company says "Waiting for you 0". The runtime reads 1:01 in the header, 0:56 in the player and 56 s in the export; Final Cut says "Sound: 0/2 voice chosen" under a cut with recorded dialogue. | `production-live-en-1440`, `studio-live-en-1440`, `short-final-live-en-1440`, `character-live-en-1440`; `src/components/shell/decisions.ts` vs `src/app/(app)/production/page.tsx` | S1 |
| 6 | **The phone and tablet layouts break.** The Short overview is **923–988 px wide on a 390 px phone** and 1249 px on an 834 px tablet (the storyboard strip blows out its grid track); Final Cut 961 px / 1273 px; the shot page 496 px; the Episode and Music Video overviews too (20 captures, §2.7). The producer has to pan sideways; the player, the take strip and "Another take" are cut off. | `short-live-en-390`, `short-live-ar-390`, `short-final-live-en-390`, `short-live-en-834`, `short-final-live-en-834`, `journey-shot-mobile-en-390` | S1 |
| 7 | **The cutting room is a stack of forms and generation buttons.** Story is three levels of bordered boxes with clipped textareas; Produce is eight identical panels with 96 px frames, takes chosen by double-click or an 11 px "Select" link, and **16 generation buttons on a finished film**; the shot page's sticky save bar covers its own frames; there is no timeline; Final Cut's Dialogue/Music/Ambience lanes are decorative bars, not audio. | `short-story-live-en-1440`, `short-produce-live-en-1440`, `shot-live-en-1440`, `short-final-live-en-1440` | S2 |
| 8 | **Figures and frames are in the wrong shape.** Character tiles and the profile pillar-box the 928 × 1664 figure between black bars (object-fit contain, 0.558 in 0.666 boxes, V4-02 still open); the Short's cast tiles crop at the knees (4:5); `/new` shows a **headless torso**; the shot page crops a 16:9 plate into 4:5; Files crops everything square. | `characters-live-en-1440`, `character-live-en-1440`, `short-characters-live-en-1440`, `new-live-en-1440`, `shot-live-en-1440`, `assets-live-en-1440` | S2 |
| 9 | **The v4 parts were built and never wired.** Zero product consumers for F3's heroes, tiles, Rail, TitleCard, FilmStrip, StoryboardReel, Timeline, CompareAB, DockLayout, Inspector, TheatrePlayer, PlayerBar, LyricView, SectionsTable and for F2's Dialog, ConfirmDialog, CatalogueBar, ApprovalCard, CreationShell, PageEmpty, SectionEmpty, LoadingFrame. Pages still import v3 `Hero`, `Art`, `Thumb`, `Modal`, `Empty`, `Block`, `Card`, `KV`, `ConfirmDelete` (§7). | `src/components/ui/cinema.tsx`, `src/components/ui/kit/legacy.tsx` usage counts in §7 | S2 |
| 10 | **Arabic is mirrored English.** Content stays English and right-aligned; "Sci-Fi Drama", "16:9 · TV and cinema", "EN", "1080p mp4-h264" inside Arabic; bidi soup such as "Take 1 · 2.1 لقطة —"; the storyboard runs right-to-left (v4 says time stays LTR); "→" arrows and the hard-coded "←" do not mirror; Format / Resolution / Subtitles / Size / Workflow are English-only labels. | `short-live-ar-1440`, `character-live-ar-1440`, `short-final-live-ar-1440` | S2 |
| 11 | **Destructive and generative actions have no hierarchy.** Delete beside Save on the shot bar; Delete as a peer of Edit in every aside and hero; "Start with an empty studio" in Settings; `window.confirm`/`window.prompt` in 8 places; "Remove" that removes a dialogue line when the producer meant a frame (D31); "Replan the shots", "Prepare frames", "Another take", "Assemble the cut", "Record the dialogue", "Speak it" sit next to navigation with the same weight. | `shot-live-en-1440`, `location-live-en-1440`, `settings-live-en-1440`, `short-storyboard-live-en-1440` | S2 |
| 12 | **Heavy, all-or-nothing loading.** Every page is client-rendered and waits for the **whole studio snapshot (575 KB JSON) fetched twice per load** (mount + stream hello) and again on changes, behind the same 3-box skeleton for every page (under load the first paint took over 10 s in the captures). Every route ships ≥ 943 KB JS (286 KB gzip) including a 241 KB bilingual dictionary. Pictures are the original 1.3–2 MB PNGs used as 24–96 px thumbnails: Characters 8 MB for 5 tiles, the Short overview 12 MB, Files 50 MB. | `journey-loading-en-1440`, `journey-server-down-en-1440`, §6 | S2 |
| 13 | **Empty states repeat themselves.** Shows, Shorts and Music Videos empty = title, subtitle, then "No X yet." and a hint that repeats the subtitle word for word, then "+ Add X" (V4-01 still open). Music Videos, the producer's next format, is a blank black page with two sentences. | `shows-live-en-1440`, `music-videos-live-en-1440`, `shows-empty-en-1440` | S2 |
| 14 | **Flat typography, no title voice.** Everything is Inter 12–16 px semibold; titles of films look like form labels; the cutting room is dominated by 11–12 px text (54 nodes under 12 px on Produce, 389 on Files); look facts are bold 13 px right-aligned paragraphs; the Short's synopsis appears above every tab. | `short-produce-live-en-1440`, `character-live-en-1440`, metrics §6 | S2 |
| 15 | **The information architecture is the org chart.** Three nav groups give the AI company (Studio Company, departments, agents) as much weight as the films; Production mixes approvals, a pipeline board, a reliability table, failure classes and a 70-row job log in one 5,700 px page. Vocabulary collides: "Takes" means both voice tries and video takes; nav "Files" opens "Asset Library"; "Cast" vs "Characters", "World" vs "Locations"; the empty Production copy points to "Projects", which does not exist. | `production-live-en-1440`, `studio-live-en-1440`, `assets-live-en-1440`, `character-live-en-1440` | S2 |

What is worth keeping: the location page's art-led header (`location-live-en-1440`), the storyboard frames as cards
(`short-storyboard-live-en-1440`), the Song & Lyrics tab with its real waveform (`music-video-song-sample-en-1440`),
the command palette (`journey-palette-search-en-1440`), the Studio Company constellation as a *secondary* view
(`studio-live-en-1440`), document titles per route (V4-11 is fixed: `Elias Moore · Characters · Vewbox Studio`), the
honest "no fake progress" stance of the job rows, and the warm token ladder.

**What must be true of the redesign, in one list:**

1. A **studio home** that opens on the work: what was finished (playable), what is in progress (with its next step),
   what needs a decision. Never an empty catalogue when the studio is not empty.
2. **Every production has art.** Derive it when none was drawn: the best frame of the chosen takes, the cut's poster
   frame, then a title card in the content's own shape. A completed film is playable from its tile, its title page
   and the Screening Room in one click.
3. **Distinct, purpose-built pages per content type** (show, short, music video, character, location), built from the
   F3 media kit. No KPI tiles, no Edit/Duplicate/Delete as page furniture, no boxes inside boxes.
4. **The cutting room is a real editor**: picture-first, timeline, take choice in one click, frames removable, no
   generation buttons on finished work unless asked for, Save never next to Delete.
5. **No engine internals in the product voice.** Model names, file names, hashes, error rates, raw exceptions and
   metrics live behind one *Technical details* disclosure per object, or in a separate engineering page.
6. **One source of truth for "needs you"**, the same count in the sidebar, the title, the palette, the page and the
   Studio Company. Lines awaiting review (D28) are decisions.
7. **Shape is identity everywhere**: figures at 928:1664 with no pillars, plates at 16:9/2.39:1, frames at the
   production's aspect, never cropped to an unrelated ratio.
8. **Phone and tablet without horizontal panning**; strips scroll inside themselves.
9. **Arabic designed, not mirrored**: translated metadata, bidi-isolated mixed runs, time and media LTR, arrows that
   mirror, Arabic content where it exists, Arabic type scale.
10. **Fast first paint**: per-page data, server-rendered shells, thumbnails at display size, no full-studio refetch.

---

## 1. Method and evidence

| Item | Value |
|---|---|
| Server | `next dev --webpack -p 4231` from the worktree; DB `vewbox_audit`; `LIBRARY_ROOT` → the real library (read-only) |
| Driver | `scripts/lib/capture.mjs` `prepare()`/`ready()` (writes answered in-browser; fixtures answered in-browser), a fast-retry wrapper for dev-server hot-reload hiccups, a post-capture check that the page did not fall back to the skeleton |
| Matrix | live: 34 routes × {1440, 390, 1920} × {en, ar}; 10 routes × 834 × {en, ar}; sample: 40 routes × {1440, 390} × {en, ar}; empty: 11 routes × {1440, 390} × {en, ar}; states: 4 journeys; 64 journey captures. 488 PNGs, 136 MB |
| Metrics per capture | document title, page height, time to ready, LCP, CLS and the shifting nodes, API requests over 800 ms or 200 KB, media count/bytes, images whose box ratio differs from the picture by > 8 %, text under 12 px, engine names and raw IDs in the main text |
| Build | `next build --webpack` (TypeScript passes, 61 routes); per-route JS from the client reference manifests |

Not capturable: the proposal review (D21) needs a generated proposal, and generation was paused; it is assessed from
`src/components/wizard/CreateWizard.tsx`. The capture naming groups files by page: `short-*` are the Short's tabs,
`journey-*` the interactions. Dev-only noise (a webpack hot-update parse error, "Invalid or unexpected token", that
reloads the page once on first visit of a route) is a dev-server artefact and is not counted as a product defect.

---

## 2. Cross-cutting findings

### 2.1 The work is not the light

- **Art fallbacks fail exactly where art exists.** `ShortCard`, `FilmWorkspace` and `ScreeningPage` look only at
  `posterAssetId`/`coverAssetId`. The Static Sky has neither, so the catalogue tile, the hero and the poster slot are
  empty, while 8 opening frames, 14 take posters and a cut poster sit in the same record
  (`src/components/library/ShortCard.tsx:18-27`, `src/components/workspace/FilmWorkspace.tsx:41-48`).
- **The fallback is broken too:** the tile draws the title as `poster-text` *and* as the overlaid `h3`, so the poster
  text ("…tatic Sky") shows through behind the cast faces (`shorts-live-en-1440`).
- **The best picture on the Short is a 56-second cut, and the overview cannot play it.** It is shown only on the 7th
  tab; the hero's only action on a complete film is gone (`p.stage !== 'COMPLETE' &&`), so "Review the cut" moves to a
  small button under the KPI tiles.
- **The location page proves the direction works** (`location-live-en-1440`): art-led backdrop, large plate. It is the
  only page that looks like a film product, and only because the location happens to have a master plate.

### 2.2 One template, dashboard furniture

- KPI tiles: `OverviewTab.tsx:35-38` (Scenes/Shots/Frames/Takes as bordered `panel` links), the show page's "Overall
  progress 47 %" card, the Production reliability table, the department's "47 runs · 98 % first time · median 76 s".
- Boxes inside boxes: Story (panel → scene card → beat card → textarea), Produce (panel per shot), Final Cut aside
  (Card → list of `bg-input` rows), voice panel (bordered card with divided rows).
- Every title page ends with an admin aside: a KV table, then Edit · Duplicate · Delete (`short-live-en-1440`,
  `music-video-sample-en-1440`, `episode-sample-en-1440`); the location hero's ivory primary is **Edit**, with Delete
  beside it (`location-live-en-1440`).
- Catalogues: a full-width search plus 2–5 bordered selects plus sort plus a view toggle, for 1–5 items
  (`characters-live-en-1440`: two rows of filters for five characters).

### 2.3 Engine internals in the product voice

| Where | What the producer reads | Source |
|---|---|---|
| Production | "ComfyUI CLIPTextEncode #7 failed: RuntimeError: Failed to find C compiler. Please specify via CC environment variable or set triton.knobs.build.impl." ×3 under *Failure classes*, again in red in Activity | `production-live-en-1440`, `journey-production-failed-job-en-1440` |
| Production | Reliability: first-attempt success, retry rate, QA rejections, "Per accepted shot 72 s · 1.00 attempts each" | `src/app/(app)/production/page.tsx:81-83` |
| Settings | Engines (Video (MiniMax), Images (ComfyUI), "Local GPU", "ComfyUI unreachable"); Models: 51 rows of `diffusion_models/…safetensors`, licences, GB; a paragraph of `name@sha` workflow versions; Reliability: per job type completed/failed/attempts/p50; Timings `cut.render_ms n=3 · p50 30.9 s · p95 …`; "add MINIMAX_API_KEY to the server's .env" | `settings-live-en-1440`, `src/app/(app)/settings/page.tsx:22-74` |
| Final Cut | "Sound in this cut": 8 rows "generated video audio · 1.2 / the take speaks its lines (MiniMax H3, speech checked)"; LUFS/dBTP under Advanced | `short-final-live-en-1440`, `FinalCutTab.tsx:92-115` |
| Produce / shot | "How it was made": model, request id, cost, `Size`, `Workflow`, raw QA check names and thresholds, the full prompt | `journey-produce-provenance-en-1440`, `ProduceTab.tsx:112-123` |
| Character voice | "Character error rate 0 % · Word error rate 0 % · Model indextts · IndexTTS-2.5 · revision 1"; "The language and dialect choose the engine; Latin words in an Arabic line go to the bilingual engine." | `journey-character-voice-en-1440` |
| Character creation | "An engine this start needs is not reachable — Images (ComfyUI): ComfyUI unreachable", again in the footer | `characters-new-live-en-1440` |
| Files | asset names "Hana Mori — designed voice 1, preview 2 (indextts)", "48 kHz reference" | `assets-live-en-1440` |
| Agents | "durable child jobs with idempotency keys … failed with its class" | `agent-live-en-1440` |
| Jobs | job detail: provider task id, `Job` id, `JSON.stringify(job.result)` in a `<pre>`, event data JSON | `src/app/(app)/jobs/page.tsx:97-107` |

The engine and model names come from the server (status details, registry rows, mix policies, voice identities, error
messages), so a client deny-list will not catch them: the redesign needs a presentation layer that maps them to
producer words and keeps the raw text behind *Technical details*.

### 2.4 Typography and hierarchy

- One family, one weight range: titles of films (`display-xl` Inter) look like section titles; there is no title voice
  in use (v4 §3.2 spike never ran).
- Small text dominates work surfaces: elements under 12 px per page at 1440 EN: Produce 54, Storyboard 31, Character 22,
  Shot 10, Files 389.
- Run-on metadata: Elias' *Productions* row is one paragraph of 16 "Shot 2.1 · Take 1 — Shot 1.4 · Take 1 — …"
  (`character-live-en-1440`); storyboard cards "Medium close up · Pull back · · Elias Moore" with orphan separators.
- Copy written for engineers: "Listened · nobody has listened yet — naturalness is not claimed", "Waveform, from the
  audio file", "Drag shots to reorder within a scene.", "Use a written example instead".
- Pluralisation: "1 lines" on every storyboard card.

### 2.5 Layout and space

- **1920**: the column stops at ≈1600 px and the remaining 320 px is an empty band of a different shade; content is
  start-aligned so the page looks unfinished (`journey-short-fold-en-1920`, `*-live-en-1920`).
- **Dead columns**: the character profile's left column ends after the image (≈ 640 px) and is empty for the next
  1,500 px (`character-live-en-1440`); the Short's Characters tab is two 128 px tiles in a 1,120 px page
  (`short-characters-live-en-1440`); catalogues fill a third of the width with 1–2 items.
- **Centred vs start-aligned**: `/new` (max-w-5xl, centred), `/new/show` (max-w-3xl, centred), `/settings` (max-w-3xl,
  centred) jump sideways against every other page (V4-05 still open).
- **The hero repeats on every tab**: the full synopsis (8 lines) sits above Story, Characters, Storyboard, Produce and
  Final Cut, pushing the work below 430 px; on Overview the same synopsis appears again as a section.

### 2.6 Empty, loading, error and server-down states

| State | Today | Evidence |
|---|---|---|
| Empty catalogue | Title, subtitle, "No X yet." + the subtitle again + one button; nothing in the content's shape | `shows-live-en-1440`, `music-videos-live-en-1440`, `*-empty-en-1440` |
| Loading | The same skeleton (title bar, lead bar, three wide boxes) for every route, profile or film; "Opening the studio…" in the sidebar footer; nothing renders until the whole snapshot arrives | `journey-loading-en-1440`, `src/components/shell/Shell.tsx:122-128` |
| Event stream down | Works: after 3 s an amber ServerBar ("Can't reach the studio server. Showing what was there a moment ago. · Try now") and the last-known page, dimmed. Two flaws: the whole page is dimmed although it is readable, and the footer still says "Saved" beside "Not connected" | `journey-server-down-en-1440`, `journey-server-down-ar-1440` |
| Missing item | "Not here · This page does not exist, or the item was deleted. · Go to Shows" (from a Short URL) | `journey-missing-en-1440` |
| Failed job | Raw exception in red + Retry (which re-runs on the same broken engine) | `journey-production-failed-job-en-1440` |
| Empty Characters | The only empty state with intent: "Start your first character" over three portrait-shaped frames (Describe them · Write the sheet · From a picture). The frames are blank grey boxes with the label at the bottom, so the idea reads as missing images | `characters-empty-en-1440` |
| Empty New… | Five cards of grey icons on gradients | `new-empty-en-1440` |
| Section empties | One muted sentence (`Empty` from `ui/cinema.tsx`); the kit's `PageEmpty`/`SectionEmpty` are unused | §7 |

### 2.7 Phone and tablet

- Page-level horizontal overflow (full-page capture wider than the viewport), 20 captures:

  | Page | 390 EN / AR | 834 EN / AR |
  |---|---|---|
  | Short overview (live) | 923 / 988 | 1249 / — |
  | Short Final Cut (live) | 961 / 1029 | 1273 / 1357 |
  | Shot page (live) | 496 / 530 | — |
  | Episode overview / Final Cut (sample) | 923, 842 / 988, 901 | — |
  | Short overview / Final Cut (sample) | 623, 485 / 665, 519 | — |
  | Music video overview (sample) | 472 / 504 | — |

  The cause is a filmstrip/sequence list with
  fixed-width items inside a CSS grid track without `min-width: 0` (`OverviewTab.tsx:32,48`, `FinalCutTab.tsx:34,44`).
- The shot page at 390: player, volume and the take strip are cut at the right edge; "Upload a clip / Another take"
  half off-screen (`journey-shot-mobile-en-390`).
- The Short hero at 390: a 64 px grey title box, then 11 lines of synopsis before the tabs (`journey-short-fold-en-390`).
- Characters at 390: filters scroll sideways ("Language" cut), the tile's play disc and "…" menu sit on the figure's
  boots (V4-09 still open) (`characters-live-en-390`).
- The 80 px rail at 834 works, but its labels wrap ("Music / Videos", "Studio / Company", "Screening / Room") and the
  footer items are unlabeled dots (`short-final-live-en-834`).
- The mobile menu sheet is clean (`journey-mobile-menu-en-390`).

### 2.8 Arabic and RTL

- The chrome mirrors correctly (sidebar on the right, tabs right-to-left, the play glyph unmirrored), so the shell is
  sound. The pages are not designed for Arabic:
  - English content right-aligned: synopsis, look facts, scene text, notes (`short-live-ar-1440`,
    `character-live-ar-1440`).
  - Untranslated metadata: genre ("Sci-Fi Drama"), aspect ("16:9 · TV and cinema"), language code "EN", export
    strings "1080p mp4-h264", Final Cut field labels (hard-coded `Field label="Format" / "Resolution" / "Subtitles"`,
    `FinalCutTab.tsx:71-73`; "Size", "Workflow" `ProduceTab.tsx:117`).
  - Bidi soup: "Take 1 · لقطة 2.1 — Take 1 · لقطة 1.4 — …" (`character-live-ar-1440`).
  - Time runs RTL: the storyboard strip and sequence start at the right edge, the first card truncated
    ("/ the radio's reaction an…"), contrary to v4 §0 decision 7 (`short-live-ar-1440`).
  - Arrows: "Open →" and "→" in links do not mirror; ShotEditor's "← Back to storyboard" is a literal glyph
    (`ShotEditor.tsx:146`).
  - Typography: Arabic body is rendered at the Latin sizes; small Arabic captions (11–12 px) become hard to read.

### 2.9 Contrast, focus, accessibility

- Focus is visible (a 2 px iris outline), but sixteen Tab presses from page load are still inside the sidebar (they
  land on *Collapse*, `journey-focus-en-1440`): a keyboard producer crosses the whole navigation on every page unless
  they find the skip link.
- Low-contrast text on art: the location back link and eyebrow over the backdrop; muted 11–12 px captions on
  `#141210` panels; the disabled "Saved" button and the grey "Design character" button read as broken.
- Hidden-only interactions: take selection by double-click (`ProduceTab.tsx:94`), "…" tile menus that appear on hover
  on desktop.
- `window.confirm`/`window.prompt` (8 call sites) are not styled, not translated in their buttons, and break the
  focus model (§7).
- Structure: KPI links wrap `dt`/`dd` inside `<a>` inside `<dl>` (`OverviewTab.tsx:35-38`); hidden dialogs leave
  headings such as "Delete 'The Static Sky'?" in the heading outline of the Shorts page.

### 2.10 Consistency and vocabulary

| Concept | Names used | Where |
|---|---|---|
| A film's people | Characters (tab), Cast (heading), Performers (music video), References (shot) | short tabs, show tabs, shot page |
| Places | Locations, World, Visual Story | short tabs, show tabs, music video |
| Voice tries vs video takes | both "Takes" | `character-live-en-1440` vs `short-produce-live-en-1440` |
| Files | nav "Files", page "Asset Library" | `assets-live-en-1440` |
| Activity | `/jobs` → Production "Activity", agent "Recent runs", department "Work" | production, agent, department |
| Projects | "Start a show… from Projects" (no such place) | `production-live-en-1440` |
| Status words | "Complete", "chosen", "Selected take: Take 1", "Approved by producer", "Assembled cut", "Checks passed" | across the Short |

### 2.11 Performance

See §6 for the numbers. In short: every page is a client component behind `Shell`'s `ready` gate; the store fetches
`/api/studio` (575 KB, 145 assets with provenance) on mount and again on the stream's `hello`
(`src/studio/store.tsx:163,170`), and again after external changes; `/api/jobs?limit=300` (84 KB) likewise. Media
are served at original size with `Cache-Control: private, max-age=3600` and no resized variants
(`src/app/api/media/[id]/route.ts:42`). Layout shifts are small except Production (CLS 0.043 live, 0.072 sample: the
reliability section and pipeline cards arrive after the page).

---

## 3. Pages

Each page: **Now** (captures), **Wrong** (element and reason), **Must be true**.

### 3.1 The shell (sidebar, rail, mobile bar, palette, shortcuts)

**Now:** every capture; `journey-palette-en-1440`, `journey-palette-search-en-1440`, `journey-shortcuts-en-1440`,
`journey-mobile-menu-en-390`, `*-live-en-834` (rail).

**Wrong:**
- The sidebar gives three equal groups; the AI company (Studio Company · Production · Screening Room) has the same
  weight as the films. The footer spends four rows on status ("Saved", "Connected", Help, Collapse) for things that
  are rarely true or rarely needed.
- The needs-you badge counts draft character images, but the place it links to does not list them (problem 5).
- The palette is text only; productions and characters have pictures and the palette shows none. Its "Go to" list is
  the right idea.
- The rail at 834 wraps labels on two lines and shows the footer as bare dots.
- The brand mark is a monochrome circle-V in a dark tile, the most generic object on the page.

**Must be true:** a home item; productions first, cast & world second, the studio's machinery third and quieter; one
needs-you count that the target page lists identically; status in the shell only when it is abnormal; the palette
shows thumbnails in the content's shape; rail labels fit one line.

### 3.2 Home and the Shows catalogue

**Now:** `home-live-en-1440`, `shows-live-en-1440`, `shows-live-ar-1440`, `shows-live-en-390`,
`shows-sample-en-1440`, `shows-empty-en-1440`.

**Wrong:**
- `/` = `/shows`; the empty Shows page is the first thing the producer sees (problem 2).
- Empty state = the subtitle twice + "Add Show" (V4-01).
- With data, show cards draw key art on top and a text block below with a progress bar and empty face circles while
  loading; five filter selects for two shows (`shows-sample-en-1440`).

**Must be true:** a home that is not a catalogue; a Shows catalogue that is art-led (16:9 key art), with an empty
state set as title cards in the show's shape; filters appear only when there are enough shows to need them.

### 3.3 Show, season and episode (sample)

**Now:** `show-sample-en-1440`, `show-seasons-sample-en-1440`, `show-episodes-sample-en-1440`,
`show-cast-sample-en-1440`, `show-world-sample-en-1440`, `show-settings-sample-en-1440`, `season-sample-en-1440`,
`episode-sample-en-1440`, `episode-storyboard-sample-en-1440`, `episode-produce-sample-en-1440`,
`episode-final-sample-en-1440`, `episode-shot-sample-en-1440`, `journey-show-fold-en-1440`, AR and 390 variants.

**Wrong:**
- The show hero's primary action is **"Add Episode · Season 2"**, an admin action, not *Watch* or *Continue*.
- "Overall progress 47 %" KPI card; "Style & format" KV card.
- The Overview ends in a *World Bible* of five empty textareas: a form inside a title page.
- Episode = the Short's FilmWorkspace with a show eyebrow: same KPI tiles, same aside, same overflow at 390
  (`episode-sample-en-390` is 923 px wide).
- The season route redirects to the show's Seasons tab, so "season" has no page of its own.

**Must be true:** a show page with key art, seasons and episodes as stills in order, the cast as a line-up and a
single *Continue* (the next episode step); bible and settings out of the lobby.

### 3.4 Shorts catalogue

**Now:** `shorts-live-en-1440`, `shorts-live-ar-1440`, `shorts-live-en-390`, `shorts-live-en-1920`,
`shorts-sample-en-1440`, `shorts-empty-en-1440`, `journey-hover-tile-en-1440`.

**Wrong:**
- The completed Short is a black tile; the title appears twice and the faint copy is clipped behind 24 px face
  circles that each load a 1.8 MB PNG.
- The duration chip says 1:01 while the cut is 0:56.
- "Complete" is drawn as a glass badge on the art (`badge-glass`, refused by v4 §1.5).
- Three filter controls for one film.

**Must be true:** posters always exist (problem 1); duration from the cut; status under the art (slate), not on it;
one-click play for finished films.

### 3.5 Short: Overview and tabs

**Now:** `short-live-{en,ar}-{1440,1920,390}`, `short-live-en-834`, `journey-short-fold-{en,ar}-{1440,390,1920}`;
tabs `short-story-*`, `short-characters-*`, `short-locations-*`, `short-storyboard-*`, `short-produce-*`,
`short-final-*`; `journey-final-advanced-en-1440`; sample `short-sample-*`, `short-storyboard-sample-*`,
`short-final-sample-*`; states `journey-states-short-gate-en-1440`.

**Overview — wrong:**
- Hero without art (a grey "The Static Sky" box), synopsis in full, a dot-separated slate with "EN" and "1:01 of 1:00".
- KPI tiles; "Review the cut" as a small ivory button under them; the synopsis again as a section; a dashed rail line
  under the storyboard strip (decoration); an aside with KV + Edit · Duplicate · Delete.
- At 390 and 834 the page overflows horizontally (problem 6).

**Story — wrong:** a form: logline input, synopsis textarea, "Develop the story" and "Write the script" (generation)
next to "Add Scene"; each scene is a bordered card holding a bordered beat card holding a textarea with clipped text
(fixed rows, text cut mid-line); "The brief" side panel with clipped textareas; the script is never shown as a script.
D23's purpose fields are there, but read like database fields.

**Characters / Locations — wrong:** two 128 px tiles and a lot of black; figures cropped to 4:5 at the knees; the
hero above repeats the synopsis.

**Storyboard — wrong:** the best part of the product, but: "1 lines", orphan "·" separators, lower-case "chosen"
status, 4 columns that leave the right third empty at 1440, "Replan the shots" (regenerates the plan of a finished film)
as a peer of "Add Shot", "Drag shots to reorder within a scene." with no visible handle or keyboard path.

**Produce — wrong:** eight identical bordered rows, each a 448 px player, two 96 px frame thumbnails (two empty for
2.3/2.4 while loading), 96 px take thumbnails selected by double-click or an 11 px "Select" link, "Prepare frames" and
"Another take" on every row (16 generation buttons on a complete film), "How it was made" with model/request/cost;
the header line "6/6 lines recorded" while two lines wait for review (D28). CLS 0.010–0.033 as rows settle.

**Final Cut — wrong:** the cut player is good, but: a sequence strip that runs off the column; three coloured lanes
(Dialogue / Music / Ambience) that are **drawn from shot metadata, not from audio** (ambience is green wherever a
scene exists; `FinalCutTab.tsx:57-61`), i.e. a fake mix view; "Sound: 0/2 voice chosen"; an Export card whose
subtitle field says "—" while the existing export has "Subtitles en"; "MP4 · H.264" vs "MP4-H264" vs "mp4-h264";
the Export button is ivory although the film is exported, and its disabled reason lives in a `title` tooltip; the
approval is a floating "Approved by producer · Request changes" line; the mix plan exposes engine names.

**Must be true:** an art-led title page that plays the film; the five work tabs in a cutting room (compact, achromatic,
a docked picture, a timeline built from the real cut and mix, takes compared side by side and chosen in one click,
frames removable (D31)); generation offered only where work is missing or when asked; the gate and export as one
clear end-of-pipeline panel; no overflow at any width.

### 3.6 Shot page

**Now:** `shot-live-{en,ar}-{1440,390,1920}`, `shot-live-en-834`, `journey-shot-fold-en-1440`,
`journey-shot-take-en-1440`, `journey-shot-scrolled-en-1440`, `journey-shot-mobile-en-390`,
`journey-shot-mobile-scrolled-en-390`, `episode-shot-sample-en-1440`, `music-video-shot-sample-en-1440`.

**Wrong:**
- The sticky save bar (backdrop-blur, refused by v4) sits over the frames row and the provenance panel at 1440 × 900;
  a trash icon sits next to Save.
- Under every take: a "Notes" input that saves on every keystroke, and "Reject · Remove" as 11 px grey text; Reject
  opens `window.prompt` and defaults to the English "rejected by the producer" (`ShotEditor.tsx:107-110`).
- No way to remove a frame (D31); the action placeholder quotes the old sample studio ("Layla walks towards camera
  down the shuttered alley…", D34, `ShotForm.tsx:28`).
- The location reference is the 16:9 plate cropped to 4:5 (`ShotEditor.tsx:138`).
- At 390 the player and the take strip are clipped.

**Must be true:** the shot as an editor panel inside the cutting room: picture, takes side by side with a one-click
choose and a named reject, frames with remove, the shot's text fields compact, Save away from Delete, references in
their own shapes.

### 3.7 Music Videos (empty live, sample)

**Now:** `music-videos-live-{en,ar}-{1440,390,1920}`, `music-videos-empty-en-1440`, `music-videos-sample-en-1440`,
`music-video-sample-en-1440`, `music-video-song-sample-en-1440`, `music-video-performers-sample-en-1440`,
`music-video-visual-sample-en-1440`, `music-video-storyboard-sample-en-1440`, `music-video-final-sample-en-1440`,
`music-video-nosong-sample-en-1440`, `journey-music-video-fold-en-1440`.

**Wrong:**
- Empty: two sentences and a button on a black page; nothing about songs, sleeves or what a music video here is.
- With data the page is the Short page plus a player bar: the same KPI tiles, the same aside; **two identical ivory
  "Choose takes" primaries** (bar and overview); "Mark this step done: Cast & World" as a bare link.
- Song & Lyrics is the strongest work surface (real waveform, sections with times), but the sections are listed twice
  (aside + cards), timecodes are written "8s — 24s" in mono, and "Waveform, from the audio file" explains the code.

**Must be true:** an empty state that sells the format (1:1 sleeve title cards, "start from a song"); a sleeve-led
music page that shares no hero with Shorts; song and video on one transport; lyric lines with their singer's face.

### 3.8 Characters directory

**Now:** `characters-live-{en,ar}-{1440,390,1920}`, `characters-live-en-834`, `characters-sample-en-1440`,
`characters-empty-en-1440`, `journey-focus-en-1440`, `journey-hover-tile-en-1440`.

**Wrong:**
- Black pillars around every figure (contain, V4-02).
- Five filters, a sort and a view toggle in two rows for five people (V4-09).
- Three of five characters are the same old man in a brown cardigan (a data problem the UI cannot help with, but the
  tile's one-line role "A young, curious explorer…" under an old man shows the mismatch without saying so).
- Arabic names in an English list truncate on the wrong side ("…صاحب مقهى").
- On touch, the play disc and "…" menu sit on the figure's feet.

**Must be true:** the casting line-up (v4 signature 3): figures at 928:1664 on their own grey, feet on one baseline;
state under the figure in words; filters only when the cast is large.

### 3.9 Character profile and voice

**Now:** `character-live-{en,ar}-{1440,390,1920}`, `character-live-en-834`, `character-arname-live-*`,
`journey-character-fold-en-1440`, `journey-character-voice-{en,ar}-1440`, `character-sample-en-1440`,
`character-layla-sample-en-1440`, `journey-states-character-draft-en-1440`,
`journey-states-character-locked-en-1440`.

**Wrong:**
- The figure in a black-pillared frame; the left column is empty below it for 1,500 px.
- "Edit details" floats far from the name; the look facts are bold 13 px right-aligned lines (V4-10).
- Voice identity: measurement jargon (CER, WER, coverage, model), "nobody has listened yet — naturalness is not
  claimed", "Speak it" (a generation) as the panel's main control; a second "Takes" list for voice tries.
- *Productions*: a grey "—" thumbnail (the Short has no cover) and a 4-line run-on of 16 shot/take pairs; the lock
  note says "used in 1 video" where "video" means the production.
- Creative notes is a raw textarea with a "Saved" button; "Delete character" at the end of the page.
- States collide (states fixture, Layla with a draft image and two filmed takes,
  `journey-states-character-draft-en-1440`): the figure says "Locked: used in 2 videos" and offers no Approve for the
  draft; the voice panel says "This character has spoken in a video, so the voice is kept as it is" and directly below
  opens "Create the voice" with Automatic / Design / Your recording, a consent choice, Record and "Build the voice".

**Must be true:** a cast profile: the figure full length without pillars, name in the title voice, who they are in
prose, the voice as a single player with a plain verdict, the films they are in as posters with the shots as frames;
measurements behind *Technical details*.

### 3.10 Character creation

**Now:** `characters-new-live-*`, `characters-new-describe-live-*`, `characters-new-sheet-live-*`,
`characters-new-picture-live-*`, `journey-create-describe-{en,ar}-1440`, `journey-create-sheet-{en,ar}-390`.

**Wrong:**
- The three method cards are a good start, but the page is a generic form card; no preview of what a figure will look
  like, no sense of casting.
- Engine names in the unreachable notice and again in the footer (paused intake made this visible; the copy is wrong
  in any case).
- "For the library · Cartoon · العربية (Iraqi — Baghdadi) · Change": an Arabic script fragment inside the English line.
- The submit is a grey disabled "Design character" with the reason far away on the left.

**Must be true:** the creation flow as a casting session: method, a live typographic preview in the figure's
928:1664 shape, the reason a step cannot run next to the button, no engine names.

### 3.11 Locations

**Now:** `locations-live-*`, `location-live-{en,ar}-{1440,390,1920}`, `location-live-en-834`,
`locations-new-live-*`, `location-sample-en-1440`, `locations-sample-en-1440`, `locations-empty-en-1440`.

**Wrong:**
- The page closest to the target, but: the same plate three times (backdrop, small poster, large plate), the
  description twice, "2 views" (camera views, read as page views), the plate at 16:9 instead of the 2.39:1 hero crop,
  Edit as the ivory primary and Delete beside it in the hero.
- The list page is one tile in a wide grid.

**Must be true:** plate-led page, lighting states as a switch, landmarks with their crops, used-in as stills;
destructive actions behind More.

### 3.12 Files (`/assets`)

**Now:** `assets-live-{en,ar}-{1440,390,1920}`, `assets-sample-en-1440`, `assets-empty-en-1440`.

**Wrong:** 145 files in one undifferentiated square grid, 6,083 px tall at 1440 (15,884 px at 390); audio as grey "♪"
squares; subtitle files as broken-image icons; clips as black squares; engine names in file names; 50 MB of
originals loaded for the grid; title "Asset Library" vs nav "Files".

**Must be true:** files grouped by what they belong to (production, character, place), in their own shapes, with
audio as waveforms and subtitles as text; thumbnails, not originals.

### 3.13 Studio Company, department, agent

**Now:** `studio-live-{en,ar}-{1440,390,1920}`, `studio-live-en-834`, `department-live-*`, `agent-live-*`,
`journey-studio-agent-{en,ar}-1440`, `studio-sample-en-1440`.

**Wrong:**
- The constellation reads well, but its icons are grey on grey, the arrows tangle, and the side card's "Waiting for
  you 0 · In production 0 · Blocked 0" contradicts the sidebar's 2.
- "Recent handoffs: Post-Production → — Export" (an arrow to a dash).
- Department: "47 runs · 98 % first time · median 76 s · 3 failures" as the subtitle; monogram avatars (CD, CC, VC).
- Agent: engineering prose, ten runs named only by job type ("Design a character" ×5, which character?).
- With the sample fixture the handoff list shows the raw id `short-28bdb3342b` (an id fallback in
  `CompanyInspector.tsx:193`).

**Must be true:** the company as a secondary, explanatory view; runs named by what they made; telemetry behind
details; the same needs-you count as everywhere.

### 3.14 Production (and `/jobs`)

**Now:** `production-live-{en,ar}-{1440,390,1920}`, `production-live-en-834`, `journey-production-fold-*`,
`journey-production-activity-*`, `journey-production-failed-job-*`, `production-sample-en-1440`,
`production-empty-en-1440`, `journey-states-production-en-1440`, `jobs-live-*` (redirect to the same page).

**Wrong:**
- 5,737 px of five different things: decisions, a pipeline board, a reliability table, failure classes with raw
  exceptions, and the whole job log (`JobsPage` imported and rendered inside, `production/page.tsx:17,84`).
- The failure classes come from the server whatever the studio holds: even the **empty** fixture's Production page
  shows the raw ComfyUI exception (`production-empty-en-1440`).
- "Nothing waits for you right now" while the badge says 2 and two jobs are "Awaiting review" (D28).
- "How a production moves: Nothing in production. Start a show… from Projects." while the Short is complete (it
  filters `stage !== 'COMPLETE'`) and Projects does not exist.
- With a real gate (states fixture, `journey-states-production-en-1440`) the decision is a gold text notice
  "Paper Boats · Story — Awaiting your approval · Approve · Request changes · Open": the producer is asked to approve a
  story without seeing a word of it. Below, each production is a row of ten bordered stage boxes with truncated labels
  ("Audio prepa…", "Video gener…", "Quality assu…"), and an episode whose stage is *Final Cut* shows all ten stages as
  "Waiting".
- The log names jobs by type only ("Design a character", "Create a character") with no subject for half the rows.
- CLS 0.043 (live) / 0.072 (sample) as the reliability and pipeline sections arrive.

**Must be true:** a control room whose first screen is the decisions (images to approve, gates, lines to review) with
the media to decide on, then what is running now with real progress, then history in a separate, filterable view;
reliability and failure classes on an engineering page.

### 3.15 Screening Room

**Now:** `screening-live-{en,ar}-{1440,390,1920}`, `screening-live-en-834`, `screening-sample-en-1440`,
`screening-empty-en-1440`.

**Wrong:** one 545 px card in a two-column grid on a lit page; the poster frame is an arbitrary mid-film frame;
"1080p mp4-h264 · Subtitles en · 56.3 MB"; "Assembled cut" status; nothing theatrical. The theatre room and
`TheatrePlayer` exist and are not used.

**Must be true:** a theatre: black, the film large, title and runtime as a slate, lights down while playing, exports
as a quiet list.

### 3.16 Settings

**Now:** `settings-live-{en,ar}-{1440,390,1920}`, `journey-settings-fold-{en,ar}-1440`, `settings-empty-en-1440`.

**Wrong:** the pre-v3 page (V4-07 still open): a centred 768 px column, 4,886 px tall; engines, 51 model files,
workflow hashes, two reliability tables, timings; "Start with an empty studio" (a destructive reset) as an ordinary
secondary button.

**Must be true:** interface, defaults and the studio's data in plain words; the engine room on its own page for the
engineer; destructive resets out of the producer's settings.

### 3.17 New… and the creation wizards

**Now:** `new-live-*`, `new-show-live-*`, `new-short-live-*`, `new-music-video-live-*`, `new-sample-en-1440`,
`new-season-sample-en-1440`, `new-episode-sample-en-1440`, `new-music-video-sample-en-1440`.

**Wrong:**
- `/new`: three grey icons on gradients (refused by v4) and a headless torso crop of Elias for "Add Character";
  centred, with a "‹ Shows" back link.
- `/new/show`: a centred form card; "Your idea (optional)", "Nothing is required.", "Use a written example instead";
  violet icon tile.
- The proposal review (not capturable): structure, hook and ending are read-only although the page says everything is
  editable (D21, `CreateWizard.tsx:199-202`), and the proposal's `openIssues` are not shown (D20 follow-up).

**Must be true:** creation as a short, art-led flow that ends on the new production's page; every part of a proposal
editable; open issues shown.

### 3.18 Not found and errors

**Now:** `journey-missing-{en,ar}-1440`.

**Wrong:** generic copy, always "Go to Shows" whatever was missing; errors elsewhere are raw `(e as Error).message` in a
toast.

**Must be true:** say what was missing and offer its catalogue; one error vocabulary (§7).

---

## 4. Journeys

### J1 Open the studio and find a production

1. `/` → `/shows`: "No shows yet." The producer has to know the film is under *Shorts*. **Confusing.**
2. *Shorts*: a dark tile with a clipped title. **Ugly.**
3. Open it: no art, synopsis, KPI tiles; the film cannot be played here. **Two more clicks** (Final Cut tab, play).
4. Ctrl/⌘K works and finds "Short · The Static Sky" by typing (`journey-palette-short-en-1440`); it is the fastest
   way and has no pictures.

### J2 Create a character (not submitted)

1. *New…* → `/new`: a headless torso card. **Ugly.**
2. *Add Character* → three methods; *Describe them* is preselected; the engine notice with "ComfyUI" sits between the
   methods and the form. **Technical.**
3. Typing a description works; *More control* opens a long form; the footer repeats the engine notice; the main button
   is grey (`journey-create-describe-en-1440`). On a phone the sheet is a long single column
   (`journey-create-sheet-en-390`).

### J3 Open a character and its voice

1. *Characters*: two rows of filters, pillar-boxed figures.
2. *Elias Moore*: the figure with black pillars; bold right-aligned look facts. **Cluttered.**
3. Voice: a player with a truncated quote, then measurements and "Check details" with CER/WER/model
   (`journey-character-voice-en-1440`). **Technical.** "Speak it" generates; a second "Takes" list for voice tries.
   **Inconsistent.**

### J4 Open a Short, its tabs, a shot, a take, the final cut and export

1. Overview → Story: a form of nested boxes. **Cluttered.**
2. Storyboard: good frames; "1 lines". **Polish.**
3. Produce: eight rows, generation buttons everywhere; the take is chosen by double-click. **Confusing.** "How it was
   made" (`journey-produce-provenance-en-1440`, collapsed under the first row) exposes model, request id, cost and the
   full prompt when opened (`ProduceTab.tsx:112-123`).
4. A shot: the sticky bar covers the frames; clicking Take 1 previews it (`journey-shot-take-en-1440`); "Reject ·
   Remove" are 11 px grey; Reject opens a browser prompt. **Confusing, unsafe.**
5. Final Cut: the cut plays; sound lanes are decorative; "Sound: 0/2 voice chosen"; export panel inconsistent with the
   existing export; "Advanced" shows LUFS (`journey-final-advanced-en-1440`). **Inconsistent, technical.**

### J5 Music Videos (empty)

`/music-videos`: two sentences and one button on a black page (`music-videos-live-en-1440`). It does not say what a
music video is here, what it needs (a song), or show what one looks like. **Weak.**

### J6 Shows (empty and sample)

Empty: same template as J5. Sample: the show page leads with "Add Episode · Season 2" and ends in five empty bible
textareas; the episode is the Short page again (`journey-show-fold-en-1440`, `episode-sample-en-1440`).

### J7 Studio Company → department → agent

The constellation is readable; clicking a department node opens an inspector (`journey-studio-agent-en-1440`); the
department and agent pages are telemetry and engineering prose. **Technical.** Its "Waiting for you 0" contradicts the
sidebar. **Inconsistent.**

### J8 Production

The first fold: "Nothing waits for you", "Nothing in production … from Projects", then Reliability
(`journey-production-fold-en-1440`); scrolling: failure classes with raw exceptions, then 70 job rows
(`journey-production-activity-en-1440`). **Contradictory, technical.**

### J9 Screening Room

One small card, an arbitrary poster frame, format strings. **Not a screening room.**

### J10 Settings

First fold: language and motion, defaults, then *Engines* with engine names and GPU (`journey-settings-fold-en-1440`).
**Technical.**

### J11 Command palette and shortcuts

The palette opens on Ctrl/⌘K with recent items and pages, matches Arabic names with letter folding, groups Go to /
Create / Decide / Settings (`journey-palette-*`). The shortcut sheet opens on `?` (`journey-shortcuts-en-1440`).
**Good**; add pictures and the decisions D28 needs. In Arabic, typing «السماء» finds nothing because the Short has no
Arabic title (`journey-palette-short-ar-1440`): productions without a translated title are unreachable by Arabic
search.

### J12 Arabic throughout

The shell mirrors cleanly; pages carry English content and metadata right-aligned, mixed-script runs, RTL time strips
and unmirrored arrows (§2.8; `*-ar-*` captures). On a phone the Short overflows by 600 px (`short-live-ar-390`).

---

## 5. The UI defects from the Short's acceptance run

| # | Defect | Seen today | Must be true |
|---|---|---|---|
| D21 | Proposal structure, hook and ending read-only | `CreateWizard.tsx:199-202` renders `proposal.structure` as static `<li>`; hook/ending are not rendered | every part editable; `openIssues` shown |
| D26 | Dialogue recordings labelled by shot number without the scene | Files: "The Static Sky 4 — Elias Moore: …" twice (`assets-live-en-1440`) | `scene.shot` labels everywhere |
| D28 | Flagged lines invisible to the producer | Produce: "6/6 lines recorded"; Production: "Nothing waits for you" while *Record the dialogue* is "Awaiting review" (`production-live-en-1440`) | lines awaiting review are decisions with Keep / Record again, on Produce and in the needs-you queue |
| D31 | No frame removal; "Remove" ambiguous | shot page: frames have no remove; takes have "Reject · Remove"; dialogue rows have a bare trash icon (`shot-live-en-1440`) | remove on frames; every destructive control named by what it removes |
| D34 | Old sample placeholder | `ShotForm.tsx:28` "Layla walks towards camera down the shuttered alley, keys in hand." | placeholders from the production, or none |

---

## 6. Measurements

### 6.1 Route weights (production build, webpack)

Framework (`rootMainFiles`): 4 files, 436 KB raw / 128 KB gzip. First-load JS per route (framework + the route's
client chunks):

| Route | Chunks | Raw KB | Gzip KB |
|---|---|---|---|
| Shot (episode) | 31 | 1,173 | 355 |
| Shot (short) | 28 | 1,171 | 354 |
| Episode | 29 | 1,155 | 349 |
| Short | 26 | 1,153 | 348 |
| Music video / Music Videos | 25 / 24 | 1,133 | 342 |
| Character creation | 20 | 1,046 | 321 |
| New show/short/music video | 22 | 1,040 | 315 |
| Show / Season | 23–24 | 1,012 | 310 |
| Character | 20 | 1,004 | 309 |
| Studio / department / agent | 19–20 | 999 | 304 |
| Files, Characters, Screening, Locations new | 18–20 | 985–991 | 300–303 |
| Production, Shows, Shorts, Locations | 18–19 | 968–973 | 294–297 |
| Settings, Jobs, New | 17–18 | 957–962 | 291–292 |
| Floor (`/`, `/library`, `/projects`, not-found) | 16 | 943 | 286 |

- The floor is high because the layout ships the whole shell, store and dictionary to every route: the shared i18n
  chunk is 241 KB raw and carries both languages (≈ 6,000 Arabic words); zod (89 KB) ships to the client.
- Every page is a client component; the HTML carries no content (`(app)/layout.tsx` → `Shell` gates on `ready`).
- The build also compiles `/kit` and `/kit-media` (dev specimen routes that answer 404 in production) and warns that
  `/api/status` and `/api/characters/[id]/voice-reference` trace files under `%TEMP%\vewbox\…`.

### 6.2 Data and media per page load (dev server, live studio, 1440 EN)

| Page | Media files | Media MB | Note |
|---|---|---|---|
| Files | 73 | 50.4 | originals for a thumbnail grid |
| Short overview | 9 | 11.9 | frames and two 1.8 MB figures for 128 px tiles |
| Produce | 32 | 10.8 | |
| Storyboard | 8 | 9.1 | 1.1 MB PNG per 212 px card |
| Characters | 5 | 8.0 | 1.3–2 MB PNG per tile |
| Shot | 10 | 7.3 | |
| Shorts | 2 | 3.6 | two face circles of 24 px |
| New… | 2 | 3.2 | for two 288 × 144 crops |

- `/api/studio`: 575 KB, uncompressed by the dev server, fetched 2× per load by design (+1 from React strict mode in
  dev); 562–575 KB each time. `/api/jobs?limit=300`: 84 KB, 2× per load.
- Slow requests seen repeatedly (dev, under capture load): `/api/studio` 1.8–2.8 s on a cold route,
  `/api/studio/org/pipeline` 2.1–3.6 s, first media requests 1.3–2.1 s.
- Library media: 38 PNGs average 1.33 MB (max 2.0 MB), 19 MP4s average 14.5 MB (max 63 MB); no resized variants.

### 6.3 Layout shift and readiness

- CLS > 0.01 only on Production (0.034–0.045 live, up to **0.107** with the sample at 390: `SECTION` / pipeline
  `LI.card` shift when the reliability and pipeline data arrive), Produce (0.010–0.066, the toolbar row reflows),
  Settings (0.016–0.020: the registry and metrics sections). Every other route stays under 0.005.
- LCP on the dev server: 0.8–8.3 s at 1440 (dev bundles; relative order matters more than the values): Settings 8.3 s,
  Final Cut 7.7 s, Files 6.5 s, Agent 5.4 s, Location 5.7 s.
- React warning on the Short at 390: "Can't perform a React state update on a component that hasn't mounted yet"
  (a side effect in render), 5 occurrences across captures.

### 6.4 Titles

Every route has its own `document.title` in both languages (V4-11 fixed), e.g. `Final Cut · The Static Sky · Shorts ·
Vewbox Studio` / `المونتاج النهائي · The Static Sky · الأفلام القصيرة · استوديو فيوبوكس`. Two issues: Production's
title carries the count, "(2) Production", which the page then contradicts; a title in a second script
(`The Static Sky` inside an Arabic title) is not isolated.

---

## 7. Frontend code smells

**v3 page code still carries the product** (usage outside the specimens, `src/**/*.tsx`):

| v3 part | Files using it |
|---|---|
| `Hero` (`ui/cinema.tsx`) | 4: `location/LocationPage.tsx`, `show/ShowWorkspace.tsx`, `workspace/FilmWorkspace.tsx`, `workspace/MusicWorkspace.tsx` |
| `Art` | 11, incl. `CharacterPage.tsx`, `CanonPicker.tsx`, `CreateWizard.tsx`, `OverviewTab.tsx` |
| `Empty` (cinema) | 12, incl. every catalogue, `production`, `screening`, `jobs`, `assets` |
| `Modal` (`kit/legacy.tsx`) | 11 |
| `Thumb` | 8 |
| `Details` / `KV` | 14 / 5 |
| `ConfirmDelete` / `ConfirmButton` | 4 / 3 |
| `Menu` (v3) | 8 |
| `Dropzone` / `ChoiceCards` / `PickGrid` / `AddTile` | 5 / 3 / 2 / 2 |
| `LibraryBar` (`library/Library.tsx`) | 5 catalogues, while `kit/CatalogueBar.tsx` has 0 users |

**Built and unused** (0 product consumers): `components/media/hero/*` (except via specimens),
`media/tiles/*`, `media/Rail.tsx`, `media/CastRow.tsx`, `media/Episodes.tsx`, `media/TitleCard.tsx` (only inside
`Frame`), `edit/{FilmStrip,DualScaleStrip,StoryboardReel,Timeline,CompareAB,DockLayout,Inspector,FocusMode,
VersionStack}.tsx`, `players/{TheatrePlayer,PlayerBar,PreviewPlayer (hero only)}.tsx`, `players/music/{LyricView,
SectionsTable,SongTransport}.tsx`, `ui/kit/{ApprovalCard,Creation,CompactHeader}.tsx`, `kit/States.tsx`'s
`PageEmpty`/`SectionEmpty`/`LoadingFrame`, `kit/Overlay.tsx`'s `Dialog`/`ConfirmDialog`/`useConfirm` (one user:
`ui/jobs.tsx`), `shell/Room.tsx` (`<Room>` never rendered, so `data-room` is always `lobby`).

**Duplicates:**
- `ui/kit/CompactHeader.tsx` and `media/CompactHeader.tsx` (both unused).
- `useMediaQuery` three times: `edit/useMediaQuery.ts`, `ui/kit/layout.ts`, a local `useMedia` in `shell/Shell.tsx`.
- `useRootVarContribution` re-exported from three places (`players/rootVars.ts`, `shell/root-vars.ts`,
  `ui/kit/layout.ts`).
- Empty states in two systems (`ui/cinema.tsx` `Empty` vs `kit/States.tsx`).
- Shims kept: `ui/page.tsx`, `ui/nav.tsx` (re-exports), `library/Cards.tsx` (barrel), `players/VideoPlayer.tsx`
  (`VideoPlayer` = `InlinePlayer`).

**Dead or odd routes:**
- `src/app/(app)/kit-media/` is marked TEMPORARY ("delete this folder" once `/kit` merged; `/kit` merged).
- `/jobs` is a page whose default export is also rendered inside `/production` and redirects only when its pathname is
  `/jobs` (`src/app/(app)/jobs/page.tsx:24-29`, `production/page.tsx:17,84`).
- `/library`, `/projects` are redirects (fine), but the Production empty copy still names "Projects".
- The season route has no page of its own (redirects to the show tab).

**Browser dialogs** (`window.confirm` / `window.prompt`), 8 call sites:
`src/app/(app)/characters/page.tsx:47`, `src/app/(app)/shows/page.tsx:45`, `src/components/workspace/tabs/StoryTab.tsx:113`,
`src/components/workspace/tabs/StoryboardTab.tsx:105`, `src/components/workspace/ShotEditor.tsx:79,109,110`,
`src/components/show/ShowWorkspace.tsx:199`.

**Fake or misleading views:**
- Final Cut sound lanes drawn from shot metadata, not audio (`FinalCutTab.tsx:57-61`); "Sound: 0/2 voice chosen" reads
  the legacy `voice.selectedSampleId` (`FinalCutTab.tsx:61`).
- Durations: the header uses the sum of planned shot durations (1:01), the cut asset says 0:56.
- `ShortCard` draws the title twice when there is no art (`ShortCard.tsx:27,31`).

**Inconsistent errors and copy:**
- Errors: raw `toast.bad((e as Error).message)` in `CharacterPage.tsx`, `ProduceTab.tsx:47`, `production/page.tsx:38`
  and others; `ui/progress.tsx` maps known codes; `kit/States.tsx` `ErrorNotice` unused by pages; `SyncErrors` in the
  shell; `(app)/error.tsx` with a `Details` dump.
- Hard-coded English in components: `FinalCutTab.tsx:71-73` (Format, Resolution, Subtitles), `ProduceTab.tsx:117`
  (Size, Workflow), `ShotEditor.tsx:109` ("rejected by the producer"), `ShotForm.tsx:28` (D34 placeholder),
  `ui/cinema.tsx:37` ("Sample").
- Server strings shown verbatim: engine status details, registry rows, mix `policy`, job `error.message`, agent
  descriptions (`components/studio/internals.tsx` only rewrites CONSTANT_CASE).

**Refused styles still in use:** `backdrop-blur` on the shot save bar (`ShotEditor.tsx:145`), `badge-glass` on
production tiles (`ShortCard.tsx:29,35`), gradients on `StartCard` icons (`/new`), `.scrim-strong`.

**Data flow:**
- The whole studio is one client store: a 575 KB snapshot fetched on mount and on every stream `hello`
  (`src/studio/store.tsx:163,170`), re-fetched after external changes; every page waits for it
  (`shell/Shell.tsx:122`).
- No image variants: `/api/media/[id]` streams the original (`src/app/api/media/[id]/route.ts`), so 24 px avatars load
  1.8 MB PNGs.
- Take notes write a command on every keystroke (`ShotEditor.tsx:107`).
- `production/page.tsx` filters out complete productions, so a studio whose only film is finished reads "Nothing in
  production".
- Needs-you logic lives in `shell/decisions.ts`; the Production page computes its own list from the pipeline only.

**Layout bugs with a code cause:**
- Horizontal overflow at 390/834: fixed-width strip items (`w-40 sm:w-52`, `w-32 sm:w-40`) inside grid tracks without
  `min-w-0` (`OverviewTab.tsx:32,48`, `FinalCutTab.tsx:34,44`).
- Character figures switch to `object-contain` whenever the picture is narrower than the frame, which the 928:1664
  figure always is (V4-02) (`character/CharacterImage.tsx:20-32`); the frame ratio comes from the callers.
- Shot references crop plates to `aspect-[4/5]` (`ShotEditor.tsx:138`).
- The sticky save bar is `sticky bottom-4` over content (`ShotEditor.tsx:145`).
