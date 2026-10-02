# Design system v2 — the screening room, refined

Scope: one system for Shows, Shorts, Music Videos, Characters, the Studio Company, Production and Settings. It
extends the restored September interface (DESIGN-SYSTEM.md) rather than replacing it: same ink ladder, same violet,
same fonts, same kit. Where the current implementation already matches, the word **keep** appears so nothing churns.
Research behind the page orders is in docs/research/PRODUCT-DESIGN.md.

Principles. (1) Pictures lead; chrome is hairlines and type. (2) Shape says kind: wide key art = show, 2:3 poster =
short, 1:1 sleeve = music, 4:5 portrait = character, the ring diagram = the company. (3) Three accents, three
meanings: violet = the primary action, the selected thing, orchestration; gold = a decision that waits for a person
and hierarchy (director, selected edge); teal = live work right now. Status colours are dots, words and 2–3 px rules,
never fills larger than a badge. (4) No gradients beyond the art scrim and hero fade; no glass beyond the badge on a
picture; no glow beyond the orchestrator's one halo; no decorative animation. (5) Honest states everywhere: loading,
empty, blocked, unavailable and failed are named in words with the one action that fixes them.

## 1. Typography

Inter (variable) for Latin, IBM Plex Sans Arabic (400/500/600/700) for Arabic — **keep** the fonts in layout.tsx.
Base 14px Latin, 14.5px Arabic (`html[dir=rtl]`) — **keep**. Arabic never uses uppercase or letter-spacing.

| Role | Class | Latin size/line/weight/tracking | Arabic size/line | Used for |
| --- | --- | --- | --- | --- |
| Display XL | `.display-xl` (new) | 36 / 1.1 / 600 / −0.022em; 28 on phone | 34 / 1.3 | Show hero title, music song title |
| Display | `.page-title` / `.h1` | 28 / 1.15 / 600 / −0.022em; 24 on phone | 28 / 1.35 | Page and detail titles (**keep**) |
| H2 | `.h2` / `.section-title` | 17 / 1.3 / 600 / −0.01em | 17.5 / 1.4 | Sections, dialog titles (**keep**) |
| H3 | `.h3` | 15 / 1.35 / 600 | 15.5 / 1.45 | Card titles, sub-blocks (**keep**) |
| Lead | `.lead` | 15 / 1.6 / 400, `--fg-muted` | 15.5 / 1.75 | Page purpose line |
| Body | default | 14 / 1.5 / 400, `--fg-body` | 14.5 / 1.7 | Everything |
| Prose | `.prose-copy` | 14.5 / 1.7 / 400 | 15 / 1.85 | Synopsis, personality, notes |
| Small | `.text-sm` | 13 / 1.45 | 13.5 / 1.6 | Card meta, table cells |
| Caption | `.text-xs` | 12 / 1.4, `--fg-faint` | 12.5 / 1.5 | Hints, timestamps |
| Eyebrow | `.eyebrow` | 11.5 / 1 / 600 / 0.14em uppercase, `--accent` | 12.5 / 600, plain | The kind line above every title (**keep**) |
| Kicker | `.kicker` | 11 / 1 / 600 / 0.12em uppercase, `--fg-faint` | 12 / 600, plain | Column labels inside panels (**keep**) |
| Numbers | `.num` | tabular-nums; `.mono` 13px for ids and timecodes | same | Counts, durations, queue depth |

Title on art (card scrims): 20/600 white for shows, 16/600 for shorts; the line under it 12.5 `--ink-200`.
Mixed titles use `.bi` (English then Arabic, Arabic at 0.85em, weight 500 in cards, 600 in headers) — **keep**.
Clamp rules: card titles 2 lines, synopsis in a hero 3 lines (`line-clamp-3`) with the full text on the Overview tab.

## 2. Colour tokens (globals.css `:root`)

**Keep** every existing token and value: the ink ladder `--ink-950…100`, `--violet-700…300`, `--bg`, `--surface`,
`--raised`, `--raised-2`, `--input`, `--line`, `--line-strong`, `--fg*`, `--primary`, `--primary-hover`,
`--on-primary`, `--accent`, `--accent-soft`, `--ok/--warn/--bad/--info` and their `-soft`, `--media`, `--gold`,
`--gold-soft`, `--gold-line`, `--teal`, `--teal-soft`, `--ring`, `--shadow-1..3`, `--r-1..4`, `--ease`, `--t`.

Add these (exact values):

| Token | Value | Purpose |
| --- | --- | --- |
| `--line-soft` | `rgba(40, 46, 57, 0.70)` | the 70 % hairline now written as `color-mix(...)` in ~20 places |
| `--fg-on-art` / `--fg-on-art-muted` | `#ffffff` / `#cfd4de` | text set on a picture's scrim |
| `--teal-line` | `rgba(70, 194, 180, 0.45)` | border of a live node/row (pairs with `--gold-line`) |
| `--gold-text` | `#d8bd84` | gold as small text (≥ 9:1 on ground); `--gold` stays for lines and icons |
| `--halo-violet` / `--halo-gold` / `--halo-teal` | `0 0 24px rgba(111,95,240,0.16)` / `…(201,168,106,0.14)` / `…(70,194,180,0.16)` | the one permitted halo (orchestrator ring, active node); replaces the 48–70 px glows |
| `--overlay` | `rgba(5, 6, 9, 0.72)` | dialog and drawer backdrops (already the literal value; name it) |
| `--sunken` | `#0d0f15` | the writing surface's floor and the lyric column; between ground and panel |
| `--r-pill` | `999px` | pills, transports, faces |
| `--t-fast` / `--t-slow` / `--t-media` | `90ms` / `220ms` / `500ms` | press, enter/rise, picture zoom |
| `--ease-inout` | `cubic-bezier(0.45, 0, 0.2, 1)` | crossfades and panel height changes only |
| `--sticky-top` | `0px` (`56px` below `lg`) | offset for sticky tab strips under the mobile bar |

Contrast floor: body 12:1, muted 8:1, faint 4.6:1, white on violet 4.7:1, teal/gold text on ground ≥ 8:1 — unchanged.
Per-title tint (research §10.7) is **not** adopted as a colour; a title's art may tint only the hero backdrop, and the
music page's wash is the sleeve itself blurred (§6). No light theme.

## 3. Surface hierarchy

| Level | Token | Where |
| --- | --- | --- |
| 0 ground | `--bg` #0B0D12 | the page |
| 0.5 sunken | `--sunken` #0D0F15 | lyric column, script paper floor, the org stage's bottom |
| 1 panel | `--surface` / `--raised` #12151C | sidebar, `.card`, `.panel`, the song player |
| 2 input | `--input` #171B23 | fields, a card on hover, `.paper` |
| 3 raised | `--raised-2` #1D222B | secondary buttons, active nav, menus, toasts, `.panel-raised` |
| media | `--media` #07080B | under every picture and clip |
| overlay | `--overlay` | behind dialogs/drawers, 3 px blur (**keep**) |

Rule: a panel never sits inside a panel. Inside a `.card`, structure is made with `.rows` hairlines, `.well`, or
`.kv`, not another card. Elevation only rises on hover (`--shadow-1 → --shadow-2`) and for menus/dialogs (`--shadow-3`).

## 4. Spacing, grid, breakpoints

Spacing steps (Tailwind units, nothing else): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96. Inside cards 16 (phone) / 20
(desktop). Between sections 40 (`space-y-10`), between a section title and its body 16, between hero and tabs 32.
Shell: sidebar 244 px at `lg+`, mobile bar 56 px below — **keep**. Content max 1320 px; side padding 20 / 24 / 32 at
phone / tablet / desktop — **keep**.
Breakpoints: `sm` 640, `md` 768, `lg` 1024 (sidebar appears; ring diagram appears), `xl` 1280 (two-column aside
layouts), `2xl` 1536. Grids are `auto-fill` with these minimums — **keep** the classes, retune two values:
`.grid-shows` 19rem (3-up at 1320, 2-up tablet, 1-up phone) · `.grid-posters` 10.5rem (6/4/3-up) · `.grid-albums` 12rem
(5/4/2-up) · `.grid-portraits` **12.5rem** gap 1.25rem/1rem (was 11.5; 5/3/2-up) · `.grid-wide` 18rem.
Detail pages: main column + 20–22rem aside at `lg+` (`lg:grid-cols-[minmax(0,1fr)_22rem]`), stacked below.

## 5. Components

**Buttons** (`.btn`) — **keep** heights 40 / 34 (`sm`) / 28 (`xs`) / 46 (`lg`); 34 and 28 grow to 40 / 34 on coarse
pointers; radius 12 / 10 / 8; 13px/600; one 16px icon (14 at `xs`), gap 8; padding 16 / 13 / 9. Variants **keep**:
primary (violet, 1px inner highlight), secondary (raised, strong hairline), ghost (hairline), quiet/subtle (text),
danger (red tint), ok. States: hover (one step lighter), active (1px down, `--t-fast`), disabled 45 % opacity with a
`title` reason, `loading` keeps size and swaps the icon for the spinner, `aria-pressed` tints violet. Transports
(`.transport`) 44 / 52 primary / 38 sm / 32 xs — **keep**.

**Inputs / textarea / select** — **keep**: 40 px, radius 12, 14px text, `--input` fill, hairline; hover
`--line-strong`; focus violet border + 3 px `rgba(111,95,240,.22)` ring; invalid `--bad` border and the message under
the field with `role=alert`; label 12.8px/600 above, hint 12px faint beside it. Select is native with the chevron on
the end side (mirrored in RTL) — **keep**. Add `.input-lg` 46 px / 15px for the one big brief field in creation flows.

**Tabs** (`.tabs/.tab`) — **keep** 44 px, 13.6px, 2 px violet rule, count chip. Add `.tabs-sticky`: `position: sticky;
top: var(--sticky-top); background: var(--bg); z-index: 20` so a detail page's tabs stay while its content scrolls.
Segmented control — **keep**.

**Cards per kind** (all share `--raised`, 1 px `--line-soft` border, radius 16, hover: border `--line-strong`, fill
`--input`, `--shadow-2`, picture zoom 3 % over `--t-media`):

| Kind | Art | Min width | Text | On the art |
| --- | --- | --- | --- | --- |
| ShowCard | 16:9 key art | 19rem | logline 2 lines, cast stack, style · genre, 6 px progress | title 20/600 + "N seasons · N episodes · aspect" on `.scrim` — **keep** |
| ShortCard | 2:3 poster (9:16 if vertical, no poster) | 10.5rem | nothing under | duration glass badge top-start; title 16/600, style · genre, cast stack, stage badge on `.scrim-strong` — **keep** |
| MusicVideoCard | 1:1 sleeve | 12rem | song 15/600, artist 12.5 faint, then **one** meta line (duration · treatment · aspect) as dots instead of three badges; style · stage status | round play-on-art bottom-end — **keep** |
| CharacterCard | 4:5 portrait, `object-position: top` | 12.5rem | name 14/600 (+ Arabic), role 12 faint, home 12 muted, usage status | none; the card loses its box: portrait in a `.poster` frame, text beneath (directory feel, like ArtCard); voice play button appears in `.card-tools` (always on touch) |
| LocationCard | 16:9 plate | 18rem | **keep** | — |
| Season card (new, Show › Seasons) | none; a 56 px number plate | full row | "Season N · title", arc summary 2 lines, N episodes, progress, stage status, chevron | — |
| Episode row (new, Show › Episodes) | 16:9 thumb w-20 | list | number (num), title, duration, cut version, QC badge, stage status, menu | — |

**Hero header** (`Hero`, cinema.tsx) — **keep** the component and add `layout="wide"`: no art object, the key art is
the backdrop, backdrop image opacity 0.5, fade `--bg` 20 → 55 → 100 % (**keep** gradient), content padding-top 96 /
128 / 144 (phone / sm / lg) so the words sit on the lower edge (this is what ShowWorkspace hand-builds today; move it
into Hero). `layout="object"` (default): art 112 / 160 / 176 px wide at phone / sm / lg, padding-top 40 / 64 / 80
— **keep**; `compact` 80 / 112 px for secondary pages only. Order inside: back link · eyebrow · title (+ Arabic) ·
description (3 lines) · meta dots (status first) · actions (≤ 5: one primary, secondaries, then `More`). On a phone
the description moves below the art/title row — **keep**.

**Section header** (`Section`, `Block`) — **keep**: 17px title, count in faint tabular, description 12.5 faint,
actions on the end side, 16 px to the body.

**Status / badge** — **keep** `.status` (6 px dot + phrase) and `.badge` (23 px pill, 11.5px). Add tones `gold`
(`--gold-soft` fill, `--gold-line`, `--gold-text`) and `teal`; `.status-live` keeps the 1.8 s pulse (teal dot).
Meaning table: ok = done/validated · info = running · teal = live right now (a department, a lyric line being sung)
· gold = waiting for your decision · warn = provisional/unknown · bad = failed/blocked · accent = selected/in use ·
neutral = idle.

**Notice** — **keep** info/warn/bad/ok; add `notice-gold` (decision waits: Approve / Request changes inside it) and
use the existing violet shield card for continuity locks (**keep** `LockNotice`). One icon, title 14/500, body muted,
one action row. Toasts — **keep** (raised, 16–26rem, 3 s, `role=status`).

**Modal / drawer** — **keep** native `<dialog>`: modal widths 26 / 34 / 56rem, radius 20, header 56 px with close;
drawer 30rem docked end side, add `size="lg"` 40rem for job and activity detail. Below 640 px a modal becomes a bottom
sheet: full width, top radius 20, max-height 92dvh, the action row sticky at the bottom. Escape closes; focus returns
to the trigger; the backdrop is `--overlay`.

**Dropzone** — **keep** (dashed 1.5 px `--line-strong`, radius 16, min-height 128, icon tile 36 px, label 13.5/600,
hint 12). States: idle · hover/drag-over (violet border, 7 % violet fill) · busy (spinner in the tile, `aria-busy`) ·
disabled (50 %, reason in the hint) · error (border `--bad`, message under, `role=alert`, the zone stays usable).
Add `.dropzone-row` (56 px, icon + label + hint inline) for "add another" under an existing preview.

**Image preview** (`ImagePreview`, new) — a `.media` frame at the kind's ratio (4:5 for references, 16:9 for plates,
1:1 for sleeves), `object-fit: contain` on `--media`, 1 px `--line`; a caption row under it: file name (truncate),
dimensions · size in faint, actions Replace (secondary sm) and Remove (quiet sm); the SAMPLE mark when bundled. A
pair variant shows **Your reference → Result** side by side with the arrow (what Appearance does today — **keep**).

**Audio player** — **keep** `SongPlayer` (card, 56/64 px cover, 52 px violet play, replay, 4 px seek with 13 px
thumb, elapsed/total tabular, volume inline at `xl`, popover below), `MiniPlayer` (fixed, raised, 44 px cover),
`VoicePreview` (row, 44 px round portrait, source badge, sm transport) and `Waveform` (56 px, 160 buckets, played
part violet). One shared `<audio>`, nothing autoplays — **keep**.

**Video player** — **keep** `VideoPlayer`: poster with one 56 px play disc, letterboxed on `--media` in its own
ratio, controls return on movement/focus, 44 px control bar, 36 px `.vbtn`, white seek (`.seek-light`), captions
only when present, fullscreen; `VideoPlaceholder` names the reason and offers the generating action.

**Progress / phase indicator** — `.progress` 6 px violet on raised — **keep**. Add `PhaseStrip` (production
stages): horizontal list of chips min 7.5rem, 11.5px, `--input` 60 % fill, 1 px `--line`, a 3 px rule on the start
edge in the state colour (ok / gold / bad / info), the status phrase under the name, time in faint; only the
awaiting-approval chip gets the `--gold-soft` fill. Add `JobProgress` (long jobs): a panel with a skeleton of the
result's shape on the start side and on the end side the phases as the existing `.stepper` (Queued → Preparing →
Generating → Validating → Saving), the engine's message line, elapsed `num`, a 6 px bar when percent is known, Cancel
(ghost).

**Empty state** (`Empty`) — **keep**: dashed frame, 56 px icon tile (44 compact), title 16/600 (14), hint ≤ 1
sentence, one action. **Skeleton** — **keep** shimmer (1.6 s); add per-kind skeletons that mirror the card shapes
(16:9 + 2 lines, 2:3, 1:1 + 2 lines, 4:5 + 2 lines, a 44 px row) and the hero (backdrop block + title 60 %). Under
reduced motion the shimmer stops; the block stays.

## 6. Iconography, borders, shadows, radius

Lucide via `icons.tsx` — **keep** the vocabulary and the department map (`DEPT_ICON`). Sizes 14 (badge, xs), 16
(buttons, rows), 20 (tiles, nodes), 24 (orchestrator, empty states); stroke 2 at ≤ 16, 1.75 at ≥ 20. Icons are
decorative (`aria-hidden`); the control carries the name. One icon per button; directional icons flip in RTL
(`rtl:rotate-180`); media icons (play, pause, volume) never flip.
Borders: 1 px `--line-soft` resting, `--line` for fields, `--line-strong` for menus/raised and hover. Radius: 8 small
controls and chips, 12 buttons/fields/menus, 16 cards and pictures, 20 dialogs and the org stage, pill for faces and
transports — **keep**. Shadows: `--shadow-1` resting card (+1 px inner highlight at 3 %), `--shadow-2` hover and the
org stage, `--shadow-3` menus, dialogs, mini player — **keep**. The only halos are `--halo-*` (§2).

## 7. Motion, focus, RTL

Durations: `--t-fast` 90 ms press · 140 ms colour/border · `--t` 160 ms opacity, menus, tooltips · `--t-slow` 220 ms
rise/slide of sheets, drawers, mini player · 300 ms progress width · `--t-media` 500 ms picture zoom · 400 ms the
orchestrator's state change. Easing `--ease` (out) for everything that appears; `--ease-inout` for height and
crossfade. Loops allowed: skeleton shimmer, `.status-live` dot, the org node pulse ring (2.4 s, one ring) and the
orchestrator's breathing halo (3.2 s, opacity 0.16 → 0.24 only). Everything stops under `prefers-reduced-motion`
and `html[data-motion=reduce]` — **keep** the two rules; states then show by colour alone.
Focus: 2 px `--ring` outline, offset 2, on every interactive element — **keep**; inside a card the card itself takes
the ring (`:has(a:focus-visible)`); on a picture or video the ring is white (`outline-color: #fff`); seek thumbs get
a 3 px ring. Tab order follows reading order; tab strips use ←/→ Home/End (**keep**, mirrored in RTL).
RTL: logical properties only — **keep**. Mirror: chevrons, arrows, the nav's active bar, the select chevron, the
drawer's dock side, the mini player's offset, `.org-tip` alignment. Do not mirror: play/pause, waveform direction
(audio time runs start → end in both scripts, so the seek fill runs from the inline start), numbers and timecodes
(`.num` adds `unicode-bidi: isolate`). Arabic UI: Plex Arabic, 14.5 base, no uppercase/tracking, line-height +0.15;
user text always `dir="auto"` and aligned to the page's start.

## 8. Page layouts

### 8.1 Shows catalog (`/shows`)
Regions: `PageHeader` (title, purpose line, primary **Add show**) → `LibraryBar` (search, style, genre, language,
status, sort) → `.grid-shows` of ShowCard. Above the fold at 1320: header, bar, first row of three. Tablet 2-up, phone
1-up with the bar wrapping (search full width, filters as a scrolling row). Empty: `Empty` with Add show; no matches:
`NoMatches` with clear. **Keep** as implemented; only the card hover reveal of the menu stays.

### 8.2 Show page (`/shows/[id]`)
`Hero layout="wide"` (key art backdrop; eyebrow "Show · genre · N seasons · N episodes · status"; title; synopsis 3
lines; actions: **Add episode · Season N** primary, Preview latest cut secondary, More menu) → `.tabs-sticky`:
Overview · Seasons · Episodes · Cast · Locations · **Production** · Settings. Above the fold: hero + tabs + the first
Overview row. Overview: main column = synopsis (`.prose-copy`), **Latest episode** card (16:9 thumb with play, title,
stage, cut version) and **Up next** (the next step as a primary link); aside 22rem = `FactList` (style, language,
aspect, episodes, updated) and a top-cast rail (up to 8 portrait chips 64×80, name under; → character profile).
Seasons: season cards in production order, the most recently touched one selected and expanded into its episode
rows; **Add season** sm at the end. Episodes: season `Select` + episode rows (§5 table) + a quiet footer "N
episodes · total runtime". Cast / Locations: `CanonPicker` — **keep**. Production: `notice-gold` for a stage awaiting
approval, then a `PhaseStrip` per episode, then the activity list and deliverables (masters, trailer, stills) as rows
with download. Settings — **keep**. Phone: hero 96 px top, title 24px, actions wrap, aside stacks under the main.

### 8.3 Shorts catalog (`/shorts`) and film page
Catalog: header + bar + `.grid-posters` of ShortCard — **keep**. Film page: `Hero` (poster object; eyebrow
"Short · genre"; synopsis; meta: stage status · style · language · aspect · runtime of target · shots; one primary
= next step) → tabs Overview · Story · Characters · Locations · Storyboard · Produce · Final Cut — **keep** all. Phone:
poster 112 px, meta wraps to two lines, tabs scroll. An episode uses the same page with the show's name in the
eyebrow and the back link to its season — **keep**.

### 8.4 Music Videos catalog and page
Catalog: `.grid-albums` record shelf — **keep**; MusicVideoCard loses the badge row for one dots line (§5).
Page (music first): `Hero` with the 1:1 sleeve (176 px) and the backdrop = the sleeve blurred 40 px at 0.35 opacity
(the "derived wash"; no colour extraction); eyebrow "Music Video · genre · mood"; title = song title; artist line in
`--fg`; meta: stage · style · treatment · duration · N sections; `SongPlayer` inside the hero with the next-step
primary on its end side — **keep**; `MiniPlayer` follows — **keep**. `.tabs-sticky`: Overview · Song & Lyrics ·
Performers · Visual Story · Storyboard · Produce · Final Cut — **keep** names. Overview adds the video player (latest
cut, else `VideoPlaceholder` naming the next step) above synopsis + facts. Song & Lyrics: song card + waveform
(**keep**) → section list on `--sunken`: each row = kind label, `from–to` num, singer chips (20 px portrait + name),
the words beneath in their script; the row being sung gets a 2 px teal rule on its start edge and `--fg` text,
the selected row the violet border; click seeks — **keep** behaviour. Singer assignment: in the end-side editor
(22rem) a compact `PickGrid` of performers (56 px faces, multi-select), with "same as song" as the default; the
chips update live. Performers: portrait grid of cast with role (singer / dancer / featured) — **keep** `PerformersTab`.
Final Cut = the player (**keep**) plus an **Export** block: rows master · vertical cut · lyric video · stems · manifest,
each name · format · size · status · Download, generated ones say "Produced by <department> · <model>". Phone: sleeve
112 px, player controls take their own row (**keep**), lyric editor becomes a drawer.

### 8.5 Characters directory (`/characters`)
`PageHeader` (title, count, **Add character** primary) → `LibraryBar` (search, style, where [show/production],
language, usage [unused · used], sort recent · name · most used, grid/list) → `.grid-portraits` of the boxless
CharacterCard: a wall of 4:5 portraits, name and role beneath, nothing on the picture (ArtStation-style
directory). Hover/focus: frame lightens, 3 % zoom, voice play and menu appear. List view: `ArtRow` with portrait
w-11, role, home, language, usage, voice — **keep**. Phone 2-up; tablet 3-up.

### 8.6 Character profile (`/characters/[id]`)
`Hero` **not compact**: portrait 112 / 160 / 176 px; eyebrow "style · species or age · sex"; name (+ Arabic); role
line; meta: usage status (neutral / warn unknown / accent used · N videos) · language · dialect · voice; actions:
**Edit profile** primary, Voice preview secondary, More (duplicate, delete). Tabs: Appearance · Voice · Profile · Used
in — **keep**. Appearance: `LockNotice` first when locked (**keep**), then the portrait (max 24rem) beside the
generate card with the reference → result pair (**keep**), then References (`.grid-portraits`, set-as-portrait and
remove on hover, hidden when locked) and Outfits. Voice: identity `VoicePreview`, voice lock note, all samples as a
radiogroup, upload dropzone; aside `KV` — **keep**. Profile: description + traits + `KV`; notes form — **keep**.
Used in: videos (16:9 thumb rows, shot badges) then assigned productions as posters — **keep**. Lock state is visible
in three places and never hides a control: the hero status, the shield notice, disabled buttons with
`aria-describedby` the notice. Phone: portrait 112 px, tabs scroll, two-column regions stack.

### 8.7 Character creation (`/characters/new`) — in detail
Screen 0, **Choose a way in**: `ChoiceCards size="lg"` 3-up (1-up on phone): **Auto** (Sparkles) "Describe them in a
line. Casting writes the profile and designs the look and voice." · **Manual** (PenLine) "Fill the sheet yourself.
Generate the look later." · **From a picture** (ImagePlus) "Start from a reference image; the studio matches it."
Auto is preselected. When generation is not connected, Auto and From a picture show a `warn` badge "Needs the studio
engine" and are disabled with that reason; Manual always works. A context chip ("for <show>") shows when
`?show=`/`?production=` is set. The choice is remembered in `sessionStorage`, as is the brief.
**Auto**: one `.card`: Name (optional, `dir=auto`), Brief (`.input-lg` textarea 3 rows, 2 000 max, placeholder
"A café owner in her sixties who notices everything and says little"), `Details` disclosure (style, language,
dialect, sex, age, species), footer: Cancel ghost · **Design character** primary (disabled under 2 characters).
On submit the card is replaced by `JobProgress`: 4:5 skeleton on the start side; phases Writing the profile →
Designing the look → Building the voice → Saving; the engine's message; elapsed; Cancel. On completion the panel
becomes the **result**: portrait, name, role, one `VoicePreview` row, and actions **Open profile** primary · Try
another look secondary (re-runs the look only) · Discard quiet (confirm dialog). Failure: `notice-bad` with the
engine's reason, actions **Try again** (brief kept) · Fill the sheet instead (switches to Manual with the brief placed
in Personality) · Open the job (link). Partial failure (profile saved, look failed): the record is created and opened
on Appearance with a `warn` notice "The look didn't generate. Generate it again from here."
**Manual**: `CharacterForm` — **keep** the fields; lay it out as Identity → Appearance → Voice with a sticky
**appearance preview** aside (22rem at `lg+`): a 4:5 `Art` frame that sets the written description as type (never a
fake image) and updates as fields change, under it "Generate look after saving" in faint. Voice section shows the
three selects and "Preview after saving". Create → the profile's Appearance tab with the generate card open.
**From a picture**: `Dropzone` (image/*, ≤ 25 MB, 4:5 preview) → `ImagePreview` with Replace/Remove; then Name
(optional), **Keep from the picture** checkboxes (face · hair · wardrobe · colours), style select, brief (optional);
footer Cancel · **Design from picture**. Progress uses `JobProgress` with the reference on the start side; the result
shows the pair Your reference → Appearance with **Use this look** primary · Try again · Discard. Errors: not an image
(dropzone error line + toast), too large (named limit), engine failure (as Auto's).
Shared rules: leaving with an unsaved brief asks once; Escape never discards; every button is a verb; copy is plain
and present tense, names what happens and roughly how long ("about a minute"), never promises quality, never
exclaims. Phone: choice cards stack, the aside preview moves above the form as a 96 px thumbnail row, the footer
actions are sticky.

### 8.8 Studio Company (`/studio`)
`PageHeader` → connection notice when needed → the **org stage** (**keep** the concept, structure, ring order, SVG
edges, orchestrator button, node links, tooltips, the column form below `lg`). Refinements only: stage padding 32,
`max-height` 640, the three stage gradients reduced to one 6 % violet radial + the flat ground; orchestrator ring
`--halo-violet` instead of the 48–70 px glows, breathing = halo opacity only; node hover = `--gold-line` border +
`--halo-gold`; active node = `--teal-line` + `--halo-teal` + one pulse ring; active edge = teal stroke 1.75 with no
`drop-shadow`; selected edge gold 2 px (**keep**); blocked red (**keep**). Under the stage a one-line **legend**
replacing the select hint: violet orchestration · teal live · gold waiting for you · red blocked. Then the selected
panel (`OrchestratorPanel` / `EdgeDetail` — **keep**), then Activity and Reliability two-up at `xl` — **keep**.
Department pages keep their `org-panel` and `org-director` gold rule.

### 8.9 Production (`/production`)
`PageHeader` → **Needs your decision** first (a `notice-gold` list: title, stage, Approve primary xs, Request changes
ghost; empty = one faint line) → **Pipeline**: a row per active production (kind · show · updated, title, stage
status) with its `PhaseStrip` (§5) → **Jobs**: `Segmented` filter (all · running · waiting · failed · done), rows =
type, target title, status dot, 4 px progress with the message, elapsed num, actions (Cancel / Retry / Open); a row
opens a `Drawer size="lg"` with the job's phases, error and log. Phone: the strip scrolls sideways, rows wrap.

### 8.10 Settings (`/settings`)
`max-w-3xl`; a jump row of kicker links at the top (Interface · Defaults · Engines · Models · Reliability · Data);
sections as `.card` with `.rows`: Interface (language segmented, reduce motion toggle) · Defaults for new work (style,
language, dialect, aspect) · Engines (one row per engine: name, status dot, where, model; **Check again** sm) ·
Models (registry — **keep**) · Reliability (**keep**) · Sample data (reset / start empty behind `ConfirmButton` —
**keep**). Every change saves in place with the saved toast; destructive actions are last.

## 9. Implementation list (priority order)

CSS tokens in `globals.css`:
1. Add `--line-soft`, `--fg-on-art`, `--fg-on-art-muted`, `--teal-line`, `--gold-text`, `--halo-violet/-gold/-teal`,
   `--overlay`, `--sunken`, `--r-pill`, `--t-fast`, `--t-slow`, `--t-media`, `--ease-inout`, `--sticky-top`
   (+ `@theme inline` colour aliases `--color-line-soft`, `--color-sunken`, `--color-gold-text`); replace the
   `color-mix(... --line 70% ...)` repetitions with `var(--line-soft)`.
2. Company diagram: swap the org glows for the `--halo-*` tokens; `org-breathe` animates halo opacity only; remove
   the `drop-shadow` on `.org-edge-active`; `.org-stage` to one radial + flat ground; add `.org-legend`.
3. Add `.badge-gold`, `.badge-teal`, `.status-gold`, `.status-teal`, `.notice-gold`; `.tabs-sticky`; `.input-lg`;
   `.dropzone-row`; `.display-xl`; `.phase` (strip chip with start-edge rule) ; `.sheet` (modal as bottom sheet < 640).
4. `.grid-portraits` min 12.5rem; `.num { unicode-bidi: isolate }`; white focus outline on `.poster`, `.media`, `.vplayer`.

Components to add / modify:
1. `Hero` — add `layout="wide"`; `ShowWorkspace` uses it instead of its hand-built header; `CharacterPage` drops `compact`.
2. `characters/new` — the three-way flow (§8.7): `ChoiceCards` start, `JobProgress`, result panel, picture path,
   error recovery; `CharacterForm` gains the appearance-preview aside.
3. New `JobProgress`, `PhaseStrip`, `ImagePreview` (+ pair variant), `Legend`; `Modal` bottom-sheet behaviour;
   `Drawer size="lg"`; `TabBar sticky` prop; per-kind `Skeleton`s.
4. `CharacterCard` → boxless portrait card; `MusicVideoCard` meta line; Season card and Episode row for the show page;
   Show page **Production** tab; `/production` decision list first and jobs drawer.
5. Music video: Overview video player, singer chips + assignment picker in Song & Lyrics, Export block in Final Cut.
6. Settings jump row and engine rows; Studio page legend. Everything else: **keep**.
