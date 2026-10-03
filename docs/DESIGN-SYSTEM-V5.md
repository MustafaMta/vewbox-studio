# Design system v5: Viewfinder

Status: the visual identity, the design system and the page compositions for the complete redesign · written
2026-10-03 · creative direction, UI/UX and design-system engineering (one point of view).
Supersedes `docs/DESIGN-SYSTEM-V4.md` for identity, typography, colour, composition, navigation, page specs and the
page work packages. v4 stays the reference for the engineering foundations kept in §11 (the CSS/i18n split, the kit's
behaviour and accessibility, the players, the shell mechanics, RTL rules for media, the lint, captures and titles).

Inputs read for this document:
- `docs/research/DESIGN-RESEARCH-2026-10.md` (the first study) and `docs/DESIGN-SYSTEM-V4.md` ("Lights Down").
- `docs/research/REDESIGN-RESEARCH-2026-10-03.md` (live browsing: A24, Framer, Apple TV, Spotify, IMDb, IMG Models,
  Linear, Frame.io; the home page and navigation priorities). Integrated in §0.3.
- `docs/research/REDESIGN-RESEARCH-AI-FILMMAKING-2026-10-03.md` (Runway, Luma, Higgsfield, Krea, Pika, Firefly,
  ComfyUI, LTX Studio, Frame.io, storyboarding and editing tools). Integrated in §0.3.
- `docs/research/REDESIGN-AUDIT-2026-10-03.md` (the site as it renders today; 15 ranked problems, the "must be true"
  list and the keep list). Every page spec in §8 names the problems it answers; the full map is §12.
- `docs/REDESIGN-2026-10-03.md`, the code under `src/app/styles/*`, `src/components/{ui/kit,media,players,edit,shell}`,
  and the studio's real data in the database copy `vewbox_audit` (read only).

The prototypes that make this document visible are in `docs/design/prototypes/` (one shared stylesheet `v5.css`, the
workspace sheet `ws.css`, the shell and language switch `v5.js`, and one HTML file per page). Their renders are in
`docs/evidence/redesign-proto/<page>-<lang>-<width>.png` at 1440 and 390, English and Arabic (§13).

---

## 0. The direction on one page

### 0.1 The identity in one paragraph

Vewbox is a *view box*: a viewfinder. **Viewfinder** is the identity: everything the studio makes is seen through a
frame, and the interface is the instrument around it. The surround is carbon black and nearly neutral, so the
pictures carry all the colour. The work is set like cinema: films, shows, songs and people are named in a
contemporary display serif (Newsreader, with Markazi Text in Arabic) at main-title scale, tightly set, on
square-cornered pictures. Everything the producer operates is set in one precise grotesk family that was drawn for
both scripts together (IBM Plex Sans and IBM Plex Sans Arabic), and every number of the production (timecode,
duration, shot and take, counts) reads like a camera readout in IBM Plex Mono. Light is ivory paper and there is one
light per region. The only hue the chrome owns is *tungsten*, a warm lamp colour that means one thing: this is
waiting for you. The brand mark is the viewfinder itself: four frame corners around the picture's centre. Corners
are also how an unmade thing appears: an empty frame, waiting to be filled, set in its own shape.

### 0.2 The twelve decisions

1. **One studio, three experiences, one identity.** The *entertainment* pages (Home, Shows, Shorts, Music Videos,
   Characters) present finished and in-progress work like a premium streaming service, film collection, music
   platform and casting directory. The *workspace* (production map, shot workspace) is professional creative
   software. The *company* (Studio Company) is the virtual studio drawn from real execution. They share one type
   system, one colour system, one set of components and the same three rooms (lobby, cutting room, theatre, kept
   from v4), so they read as one product (§1).
2. **Type is the identity, set the way the best references set it.** A display serif for names and page titles only
   (main-title scale, line height 0.92–1.0, tracking −0.02 to −0.034em, weight 500), one grotesk family for the
   interface in both scripts, a mono for numbers (§3). This replaces v4's Inter + Plex Arabic + "title voice spike",
   which shipped as Inter at a display size and read as generic.
3. **The work is the colour.** A near-neutral carbon ladder (chroma ≤ 0.004) replaces v4's warm ladder; ivory paper
   for light; **no brand accent** in the chrome. Violet (v4's iris) is retired completely. Tungsten marks decisions
   waiting for the producer, and nothing else; green and coral are semantic only (§2).
4. **Square pictures, no boxes.** Media radius 2 px (A24: 0; Spotify: 4). Structure comes from typographic rules
   (a hairline above each section head), tone and space, never from bordered cards (§4).
5. **A real front door.** `/` is **Home**: the latest film to screen or the next step to continue, the decisions
   waiting with the thing to decide on, recent work in its own shapes, the cast line-up, and three title cards to
   start something. Never an empty catalogue when the studio holds work; never KPI tiles or zeros (§8.1; audit 2).
6. **Navigation is the work, then the studio.** A top bar: Home · Shows · Shorts · Music Videos · Characters ·
   Studio Company as primary; Locations · Production (with the one needs-you count) · Screening Room · Settings
   smaller and dimmer; search with Ctrl/⌘K. The 240 px sidebar goes; full-bleed art gets the width. Phones get their
   own five-place bottom bar (§7; audit 15).
7. **Every production has art and plays in one click.** When no key art or poster was drawn, the studio composes a
   *frame poster* from the chosen key frame and the title in the display serif (deterministic, no generation), then a
   title card in the content's own shape (§5.9; audit 1).
8. **Shape is identity (kept from v4) and the figure is never cropped.** Shows 16:9, Shorts 2:3 poster beside a 16:9
   cut, Music Videos 1:1 sleeve, Characters 928:1664 full length on their own grey, Locations 16:9 / 2.39:1 (§5.8;
   audit 8).
9. **Credits are a page section.** Every production lists who made it, as type: characters, and the Studio Company's
   departments with what each made, linked to the company (§5.15). This is the bridge between the entertainment pages
   and the virtual studio.
10. **The workspace shows the hierarchy.** Story → scenes → shots → takes → final cut is the left outline on every
    workspace page, a breakdown review gates filming, and the shot is the session: one dominant preview, takes side
    by side with one verb, closed vocabularies for framing and camera, references chosen by name, continuation as one
    action, progress as phased words with Cancel from the first second, generation settings behind disclosure, never a
    node graph (§8.10, §8.11; audit 7).
11. **Arabic is designed, not mirrored.** A first-class Arabic type scale (Markazi Text titles, Plex Sans Arabic
    interface), content in its own language with its own direction and correct punctuation (`unicode-bidi:
    plaintext`), time and media always LTR, Arabic-Indic digits as a setting (default on for the Iraqi dialect;
    timecodes and media data keep Western digits), art-directed RTL heroes so a face is never under the text (§9;
    audit 10).
12. **No engine in the product voice, one count everywhere.** Model names, file names, hashes, raw exceptions and
    metrics live behind one *Details* per object. The needs-you count is one number, listed identically in the bar,
    on Home, in Production and in the Studio Company (§6.7; audit 4, 5).

### 0.3 What changed because of the two studies and the audit

The direction began before the live studies landed. Their arrival changed these things (each is visible in the
prototypes):

| Source | What it said | What changed in v5 |
|---|---|---|
| Live-browsing study, decision 1 | Identity comes from setting: tight titles (0.92–1.0, −0.03 to −0.04em), few sizes, square images; a 120 px index size | Display sizes tightened (marquee 108/100 −0.032em; hero 80/76 −0.028em; page 64/62 −0.024em); media radius 4 → 2 px; `.t-index` 120/112 added for typographic catalogue lists (§3.3) |
| Study, decision 2 | Credits as a page section, linked to the company | Credits on Show, Short, Music video and the Screening Room programme note (§5.15) |
| Study, decisions 3 and 4 | Home is a real page (Continue, Needs you, Recent, Cast, one New); Home is primary; Locations · Production · Screening Room · Settings smaller; Files leaves the navigation; New belongs on Home and Ctrl/⌘K | Home added to the primary nav; "New" removed from the top bar and placed once on Home (plus each catalogue's own primary); Settings became a text item in the secondary group; Home restructured (the hero *is* Continue; zero counts removed; three title cards replace empty shelves) |
| Study, decision 5 | Music Videos are songs first: lyrics straight after the header, videos as a separate 16:9 shelf, the catalogue a discography | The music page order became header → transport → lyrics → sections → performers → videos shelf → credits (§8.6) |
| Study, decision 6 | The directory is a line-up: identical frames, ~30 px gaps, name only, filters in one panel | Characters shows the name only (status only when it needs the producer), 30 px gutters, a single Filters panel, an Index view (§8.7) |
| Study, decision 7 | The organisation drawn from code: 8 departments on a ring in pipeline order around the Orchestrator, 9 real relations, the producer outside at two gates, states in words | Studio Company redrawn exactly so, with the Cast & World pair bracketed and handoff counts on the lines (§8.9) |
| Study, decisions 8, 9 | Agents offer 2–4 options side by side; takes tagged Good take / Rejected; Screening Room with version picker, synchronised compare, timecode notes, visible controls | Takes row with *Use this take* and judgement words; version picker "Cut 3 of 3"; Compare; note grammar (§8.11, §8.12) |
| Study, decision 10 | Phones get their own portrait hero image | Home and Show heroes art-directed to 4:5 on phones (§5.4) |
| Study, decision 12 | No small-caps or uppercase labels | Uppercase readouts removed ("15 TAKES" → "15 takes"); the label register is muted colour and mono numbers (§3.5) |
| Study, decision 14 + coordinator | Arabic-Indic digits as a setting, default on for the Iraqi dialect | Implemented in the prototypes' Arabic renders; the digit rule and its exceptions in §9.4 |
| AI-filmmaking study, 1–10 | Outline of scenes containing shots; one dominant preview; references as named chips; closed vocabularies with drawn previews; Continue from shot N; candidates side by side with one verb; phased progress with Cancel at once; specific recovery; judgement on the card; the shot is the session (Attempts) | The workspace became two pages (production map and shot workspace) built on these rules (§8.10, §8.11); the breakdown review gate and Draft / Final added |
| AI-filmmaking study, 11 | Screening Room in Frame.io's grammar: timecode, range and pinned notes, drawings, status labels, `[` `]`, *Send to shot* | Pinned note with *Send to shot*, note composer with C / I O / pin / `[` `]`, notes ticks on the seek bar (§8.12) |
| AI-filmmaking study, 12 | The company shows only what ran; Active runs with Cancel | "Running now" section from the run record; no synthetic motion (§8.9) |
| Audit, problems 1–15 and "must be true" | (see §12) | Every page spec names the problems it answers; vocabulary fixes (Characters/Locations instead of Cast/World in tabs; no "Takes" for voice tries; no "Files" in navigation); one needs-you count (4) everywhere in the prototypes; generation actions secondary on finished work |

---

## 1. Identity

### 1.1 Viewfinder

| Element | What it is | Where it appears |
|---|---|---|
| **The frame** | Pictures are always ratio-true and square-cornered (2 px). The chrome sits outside them like a viewfinder's black surround. | Every tile, hero, player and strip |
| **The corners** | Four 14 px frame corners at a frame's inside edge, in `--carbon-8`. They mean *a frame waiting to be filled*. | The brand glyph; title cards (anything without art); the empty states; the "New character" casting calls |
| **The main title** | Content names and page titles in Newsreader / Markazi Text at cinematic scale, tight. | Heroes, page titles, tile names, credits, the logline as a programme note |
| **The readout** | Numbers of the production in Plex Mono, LTR, tabular. | Timecodes, durations in slates, shot and take numbers, counts in section heads, resolutions |
| **The light** | Ivory paper `#F3EFE8`: the one primary per region, titles, the playhead, the selection outline, the focus ring. | One filled button per region at most |
| **Tungsten** | `#E3AA5B`, a warm lamp: *this waits for you*. | Needs-you counts, "Waiting for your approval", the decisions rule on Home, the note pin in the theatre |

### 1.2 Principles, each with a screenshot test

1. **The work is the colour.** In a squint test the brightest and most colourful region is a picture, or the single
   ivory primary. Never a panel, an icon tile or a badge.
2. **Names are main titles; everything else is the instrument.** Only content names and page titles use the serif.
   A button, tab, label, number or sentence in the serif is a defect.
3. **Rules, not boxes.** No bordered cards. A section starts with a hairline rule and its head; groups are tone
   (`--surface`) without a border. Borders exist only on fields (≥ 3:1) and overlays.
4. **One light per region.** At most one ivory filled button per page region; everything else is secondary
   (translucent paper), quiet (text) or danger (coral, only inside a confirmation).
5. **Tungsten only for decisions.** If tungsten appears on something the producer does not need to decide, it is a
   defect.
6. **Shape is identity.** From the silhouette of the art alone you can tell the content type (§5.8).
7. **The unmade is a title card.** Anything without art is set as type, in its own shape, inside frame corners. Never
   a grey box, a stock icon, a gradient or a silhouette.
8. **State lives under the picture, in words.** The slate under the art carries status last. Nothing is painted on art
   except the duration/readout chip and the play disc, both solid.
9. **Content keeps its language; the interface changes.** An English title stays English (and LTR, and Newsreader) in
   the Arabic interface; an Arabic name stays Arabic in the English interface.
10. **Time runs left to right.** Transports, seek bars, waveforms, film strips, timelines and timecodes are LTR in both
    languages.
11. **Nothing technical in the main view.** Engine, model, file, hash, seed and raw error live behind *Details*.
12. **Motion is a cut, not a flourish** (v4, kept): frequent actions are instant; continuity motion is short and
    optional; nothing loops unless something is live; no auto-advancing hero.

### 1.3 Refusals (each is a review blocker)

- Glow, halos, coloured shadows, inner highlights, `drop-shadow` on SVG, neon.
- Gradients other than the four allowed: the hero **scrim** under text on art, the **art wash** behind a lobby hero
  (clamped colour from the art, §2.4), the **top scrim** under the transparent top bar on a hero, and the **frame
  poster** scrim (§5.9).
- `backdrop-filter` anywhere except the theatre transport over video.
- Bordered cards, boxes inside boxes, KPI tiles, statistic cards, donut charts, zero counters, dashed empty boxes.
- Violet anywhere in the product (the colour of every AI tool of 2024–26).
- Uppercase or letter-spaced labels as hierarchy; small caps; positive tracking.
- A serif on a control; a serif in a table cell that is not a name.
- Engine or model names, file paths, hashes, raw exceptions, error rates in the product voice.
- A hero that advances by itself; autoplay with sound; parallax; scroll-jacking; WebGL transitions.
- A node graph, slots or links in the creator's path; a chat box as the home.
- `window.confirm` / `window.prompt`.

### 1.4 The brand

- **Glyph:** four frame corners (stroke 1.8 on a 26 px box, square caps) around a 3.2 px-radius filled dot, in ivory.
  It is drawn as SVG and inherits `currentColor`; it is never on a coloured tile.
- **Wordmark:** "Vewbox" in Newsreader 600, 22 px, −0.01em. The logotype stays Latin in the Arabic interface; its
  accessible name is "استوديو فيوبوكس — الرئيسية".
- **Favicon:** the glyph in ivory on `#0A0A09`. The violet gradient mark is retired everywhere (v4 kept it for the
  favicon; v5 does not).

---

## 2. Colour

### 2.1 Tokens (exact; `src/app/styles/tokens.css`)

```css
:root {
  color-scheme: dark;
  /* carbon: the surround (hue ≈ 75°, chroma ≤ 0.004) */
  --carbon-0:  #000000;  /* theatre surround; letterbox */
  --carbon-1:  #060606;  /* media floor; sunken stage */
  --carbon-2:  #0A0A09;  /* page */
  --carbon-3:  #111110;  /* tone group (no border); docked panels */
  --carbon-4:  #181817;  /* field fill; hover; workspace frame */
  --carbon-5:  #20201E;  /* raised: menus, popovers, selected segment */
  --carbon-6:  #2A2A28;  /* hairline (decorative) */
  --carbon-7:  #3A3936;  /* strong hairline; overlay edge */
  --carbon-8:  #72706A;  /* control boundary (≥ 3:1) */
  --carbon-9:  #8F8B84;  /* faint text */
  --carbon-10: #ADA9A1;  /* muted text */
  --carbon-11: #D8D4CC;  /* body text */
  --paper:     #F3EFE8;  /* light: titles, the primary, playhead, selection, focus */
  --paper-hi:  #FFFFFF;  /* primary hover */
  --gray-canvas: #0B0B0B; --gray-clip: #262626; --gray-edge: #8A8A8A;   /* achromatic review surfaces (v4) */
  --tungsten: #E3AA5B; --tungsten-soft: rgb(227 170 91 / .14); --tungsten-line: rgb(227 170 91 / .45);
  --ok: #7FCB9C;  --ok-soft: rgb(127 203 156 / .12);
  --bad: #F0826F; --bad-soft: rgb(240 130 111 / .12);

  /* roles */
  --page: var(--carbon-2); --sunken: var(--carbon-1); --media: var(--carbon-1);
  --surface: var(--carbon-3); --field: var(--carbon-4); --raised: var(--carbon-5);
  --line-soft: #1C1C1A; --line: var(--carbon-6); --line-strong: var(--carbon-7); --line-field: var(--carbon-8);
  --fg: var(--paper); --fg-body: var(--carbon-11); --fg-muted: var(--carbon-10); --fg-faint: var(--carbon-9);
  --fg-disabled: #5E5C57; --on-paper: var(--carbon-2);
  --chip-on-art: rgb(6 6 6 / .80);
  --scrim-b:   linear-gradient(0deg,  rgb(10 10 9 / .96) 0%, rgb(10 10 9 / .86) 28%, rgb(10 10 9 / .35) 58%, rgb(10 10 9 / 0) 78%);
  --scrim-s:   linear-gradient(90deg, rgb(10 10 9 / .92) 0%, rgb(10 10 9 / .78) 30%, rgb(10 10 9 / 0) 62%);   /* 270deg in RTL */
  --scrim-top: linear-gradient(180deg, rgb(10 10 9 / .70) 0%, rgb(10 10 9 / 0) 100%);
  --art: var(--page);    /* set inline by the hero that owns it: oklch(0.22–0.25 min(C,0.05) H) */
}
```

Legacy names (`--bg`, `--ink-*`, `--iris-*`, `--accent`, `--primary`, …) resolve to these values through aliases in
the token sheet until Q2 removes them (§11.2). `--accent` maps to `--paper` (focus and selection are light, not hue);
every `--iris-*`/`--violet-*` maps to `--paper` or `--fg-muted` so that nothing violet survives.

### 2.2 Contrast (measured, WCAG 2.x relative luminance; script in §13.2)

| Pair | Ratio | Needs |
|---|---|---|
| `--fg` on page / surface / field / raised / canvas / black | 17.28 / 16.48 / 15.50 / 14.24 / 17.17 / 18.32 | 4.5 |
| `--fg-body` on page / raised | 13.40 / 11.04 | 4.5 (HIG goal 7) |
| `--fg-muted` on page / raised | 8.46 / 6.97 | 4.5 |
| `--fg-faint` on page / surface / field / raised | 5.84 / 5.57 / 5.24 / 4.81 | 4.5 |
| `--line-field` on page / field / raised | 3.61 / 3.24 / 2.98 → fields never sit on `--raised` | 3 (1.4.11) |
| tungsten on page / raised; on tungsten-soft over page | 9.59 / 7.90; 7.78 | 4.5 |
| ok / bad on page | 10.30 / 7.67 | 4.5 |
| ink on paper (the primary button) | 17.28 | 4.5 |
| `--fg` / body / muted over `--scrim` at 0.85 on pure-white art | 11.69 / 9.07 / 5.72 | 4.5 |
| `--fg` on `--chip-on-art` over pure white | 10.23 | 4.5 |
| Focus ring: paper inner on page / black outer on white art | 17.28 / 21.0 | 3 (2.4.13) |

### 2.3 Where colour may appear

| Colour | Allowed | Forbidden |
|---|---|---|
| Paper (light) | One filled primary per region; titles; the playhead; the 2 px selection outline; the focus ring; the play disc; selected filter chip; the running dot | Panels, large fills next to a viewer, decoration |
| Tungsten | Needs-you counts; "Waiting for your approval"; the Needs-you section rule; the pin of a note in the theatre; the 2 px start bar of a row that waits | Anything that is not a decision for the producer |
| Ok / bad | Status dots and words; field errors; refusal marks on handoffs; the destructive confirm button (bad) | Decoration, tags, skills |
| Art colour | `--art` wash behind a lobby hero (§2.4); `--art-ph` image placeholder; `--art-edge` field behind a figure | Chrome, text, tiles, buttons |
| Annotation pink `#FF6FAE` | Prototype annotations only (`.annot`) | The product, always |

### 2.4 Art wash, placeholders and figure fields (kept from v4 §2.4, values updated)

- `--art` = the hero art's dominant colour clamped to `oklch(0.22–0.25, min(C, 0.05), H)`, painted from the top of a
  lobby hero to `--page` by 560 px (360–420 px on phones). Allowed only on the Short, Show, Music video and Location
  heroes. Never on the Character profile (a picture under approval), the company, Production, the workspace or the
  theatre.
- `--art-ph` = the same hue at L 0.24 fills every frame until its image decodes.
- `--art-edge` = the mean colour of a figure's border strip; it fills the space around a figure shown at its native
  ratio, so there are never black pillars (audit 8). Measured for the studio's figures: Elias `#838488`, Hana
  `#839493`, Abu Salam `#808478`, Salam `#A3A5A2`, Najm `#6C6F6C`.
- Data: B1's `assets.presentation` (`dominant`, `edge`, `focal`, `faceBox`, plus **new** `portraitFocal` for the phone
  hero crop, §5.4) already exists in the schema; the presentation backfill computes the new field.

---

## 3. Typography

### 3.1 Families (all SIL Open Font License; self-hosted through `next/font/google`, no font service at runtime)

| Voice | Latin | Arabic | Why |
|---|---|---|---|
| **Title** (content names, page titles, credits values, loglines as programme notes) | **Newsreader** (Production Type; `opsz` 6–72, `wght` 200–800, italics) | **Markazi Text** (Borna Izadpanah, Florian Runge, Fiona Ross; `wght` 400–700; Arabic + Latin) | Newsreader's display optical size gives real contrast at 64–120 px and reads as a contemporary, literary film title, not as UI. Markazi is a contemporary Naskh with moderate contrast drawn under Fiona Ross; it changes register together with Newsreader (both serif, both calligraphic stress, both compact). The pairing won the rendered spike (`docs/design/prototypes/spike/type-spike.html`, eight pairings over the studio's own art). |
| **Interface** (everything the producer operates and reads) | **IBM Plex Sans** (variable `wdth` 85–100, `wght` 100–700) | **IBM Plex Sans Arabic** (100–700; already bundled) | One superfamily drawn for both scripts by the same team (Bold Monday with Khajag Apelian and Wael Morcos for Arabic), so the two scripts share stroke, weight and rhythm in a mixed line. Plex's engineered details read as professional creative software. Replaces Inter, whose ubiquity made the product anonymous (audit 14; spike `spike/ui-spike.html`). |
| **Readout** (numbers) | **IBM Plex Mono** (400, 500) | — (Arabic-Indic digits fall back to Plex Sans Arabic, §9.4) | Same superfamily; tabular; always LTR. |

Licence notes: Newsreader and Markazi Text OFL (google/fonts `ofl/newsreader`, `ofl/markazitext`); IBM Plex OFL with
Reserved Font Name "Plex": never rename or subset ourselves; use the Google-distributed builds that `next/font`
fetches at build time. Thmanyah remains unlicensed for bundling (both studies). The research's other candidates
(Instrument Sans + Noto Sans Arabic condensed; Kufam / Noto Kufi + Inter Tight) were rendered in the spike; the
condensed pairing read as a poster but made Arabic names cramped at 34 px, and the Kufi pairing made long Iraqi names
look stylised. Inter + Plex Arabic (v4) remains the fallback stack if the web fonts fail.

### 3.2 Rules

- The serif sets names and page titles only (§1.2 principle 2). Section heads (`h2`), tabs, buttons, labels, table
  cells and body copy are Plex.
- Weights: serif 500 (Latin), 600 (Arabic); interface 400 / 500 / 600; never below 400.
- No uppercase, no small caps, no positive tracking, in either script. Negative tracking on Latin display only; Arabic
  tracking is always 0. Arabic is never italic (the italic logline style becomes upright in Arabic).
- Arabic sizes are matched optically, not by a smaller fixed rule (study §4.4): display Arabic is 90–95 % of the Latin
  size with 1.25–1.38 line height; interface Arabic is +1 px with taller lines.
- Wrapping: titles `text-wrap: balance`, prose `pretty`; hero titles clamp at 3 lines, tile titles at 2.
- Measures: lead 64ch, prose 66ch, logline-as-note 34–44ch.

### 3.3 Scale (px; Latin / Arabic; phone values below 640 px)

| Class | Latin ≥ 1280 | Latin 640–1279 | Latin phone | Arabic ≥ 1280 | Arabic 640–1279 | Arabic phone | Use |
|---|---|---|---|---|---|---|---|
| `.t-index` | 120 / 112, −0.034em | 76 / 72 | 46 / 46 | 108 / 136 | 70 / 92 | 46 / 64 | Typographic catalogue lists (Index view) |
| `.t-marquee` | 108 / 100, −0.032em | 76 / 72, −0.028 | 46 / 46, −0.02 | 96 / 120 | 70 / 92 | 46 / 64 | Home Continue hero, Show and Short titles, Music video song title |
| `.t-hero` | 80 / 76, −0.028em | 60 / 58 | 40 / 42 | 72 / 96 | 58 / 78 | 42 / 58 | Character name, Screening Room title, feature banners |
| `.t-page` | 64 / 62, −0.024em | 52 / 52 | 38 / 40 | 60 / 80 | 52 / 70 | 40 / 56 | Page titles (Shows, Characters, Studio Company…) |
| `.t-card-lg` | 26 / 30 | 26 / 30 | 26 / 30 | 28 / 40 | 28 / 40 | 28 / 40 | Title cards in 16:9; the Home sentence |
| `.t-card` | 21 / 26 (tiles in a 3-up wall: 25 / 30) | same | same | 23 / 32 | same | same | Tile names, episode titles, shot titles |
| `.t-card-sm` | 18 / 22 | same | same | 20 / 28 | same | same | Small tiles, figures, decision cards |
| credits value | 24–28 / 28–32, −0.016em | same | same | 25–28 / 36–40 | same | same | Credits and programme notes |
| `.h2` (Plex 600) | 20 / 28 | same | same | 20 / 32 | same | same | Section heads, dialog titles |
| `.h3` (Plex 600) | 16 / 24 | same | same | 16 / 26 | same | same | Row and panel titles |
| `.lead` | 19 / 30 | 17 / 27 | 17 / 27 | 20 / 34 | 18 / 30 | 18 / 30 | The one purpose line; hero loglines |
| `.prose` | 16 / 27, 66ch | same | same | 17 / 30 | same | same | Personality, synopsis, script |
| body | 15 / 24 | same | same | 15 / 26 | same | same | Everything else |
| body (cutting room) | 13.5 / 20 | same | same | 14 / 22 | same | same | Workspace pages (compact density) |
| `.small` | 13 / 20 | same | same | 14 / 22 | same | same | Meta lines, rows |
| `.caption` (500) | 12 / 16 | same | same | 13 / 20 | same | same | Labels above values, hints |
| `.slate` | 13 / 20 (tiles 12.5) | same | same | 14 / 22 | same | same | The metadata line (§3.4) |
| `.ro` (mono) | 12 / 16; `.ro-md` 13 / 20; `.ro-lg` 15 / 20 | same | same | same (Latin digits) | same | same | Readouts |
| lyric | 26 / 38 (active 600) | same | 21 / 30 | 30 / 46 | same | 24 / 38 | The lyric view |

### 3.4 The slate (kept from v4 §3.4)

One line of facts in a fixed order, separated by `·` in `--fg-disabled` (`aria-hidden`): **kind · year · count ·
runtime · style · language · status (last)**. Numbers in the readout face. Missing facts are dropped, never "—".
Durations come from the cut, never the plan (audit 5: 1:01 vs 0:56).

### 3.5 Labels without capitals

The premium references (A24, Apple TV, IMG, Linear) all use small uppercase labels; v5 does not, because Arabic has no
case. The label register is: 12–13 px, weight 500, `--fg-faint`, sentence case; numbers inside a label in the mono.

---

## 4. Layout, space, shape, elevation, motion

### 4.1 Breakpoints, shell and panes

| Class | Width | Shell | Lobby panes | Workspace panes | Acceptance |
|---|---|---|---|---|---|
| Phone | < 640 | top bar 56 + bottom bar 64 | 1 | 1; outline as a shot switcher; inspector below the preview | **390** |
| Large phone | 640–767 | same | 1 | 1 | — |
| Tablet | 768–1023 | top bar 64 + bottom bar | 1–2 | 1 + inspector below | 834 |
| Laptop | 1024–1279 | top bar 64 (secondary links fold into the search/menu) | 2 | outline 240 · canvas · inspector 320 | — |
| Desktop | 1280–1799 | top bar 64, all links | 2–3 | outline 280 · canvas · inspector 360 | **1440** |
| Wide | ≥ 1800 | top bar, margins 80 | 3; heroes full bleed | same | 1920 |

### 4.2 Grid, container, margins

- Container: `max-inline-size: calc(1600px + 2 × margin)`, centred; heroes and the theatre are full bleed.
- Margins (`--margin`): 16 / 24 (≥ 640) / 40 (≥ 1024) / 56 (≥ 1280) / 80 (≥ 1800).
- Gutters (`--gutter`): 16 / 24 (≥ 640).
- 12 columns on desktop, 8 on tablet, 4 on phone. Catalogue grids use deterministic column counts (v4 §4.3), with
  the new values: Shows 3 · 2 · 1; Characters 5 · 3 · 2 (gap 30 / 24 / 16); Shorts posters 5 · 3 · 2; Music sleeves
  5 · 3 · 2.
- Section rhythm (`--section`): 64 phone, 80 (≥ 1024), 96 (≥ 1280); a section head's rule sits 14 px above its text.

### 4.3 Spacing (4-grid)

4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 (`--s1`…`--s10`). Nothing else. The 14 px root of v4 stays (rem-based
Tailwind spacing is unchanged); all type and spacing tokens are px.

### 4.4 Radii

| Token | px | Use |
|---|---|---|
| `--r-0` | 0 | Full-bleed heroes, theatre, workspace canvas, docked panels |
| `--r-xs` / `--r-sm` / `--r-media` | 2 | Every picture, frame, strip, take, title card, poster, sleeve |
| `--r-md` | 8 | Fields, menus, tone groups, notices, inspector cards |
| `--r-lg` | 12 | Dialogs, sheets, the now-playing bar |
| `--r-pill` | 999 | Buttons, chips, segmented controls, faces, play discs |

### 4.5 Elevation

Tone first: page → surface → field → raised. Shadows only on overlays: `--shadow-overlay: 0 24px 64px -16px rgb(0 0 0
/ .85), 0 0 0 1px var(--line-strong)` (menus, dialogs, drawers, toasts, the pinned note); `--shadow-float: 0 16px 40px
-16px rgb(0 0 0 / .8), 0 0 0 1px var(--line-strong)` (now-playing bar). Posters and sleeves in heroes may carry
`0 30–40px 60–80px -24px rgb(0 0 0 / .9)` (a contact shadow on a black page, not a glow).

### 4.6 Density

Comfortable in the lobby (controls 44, rows 48–56, body 15/24); compact in the cutting room (controls 34, rows 36–44,
body 13.5/20; Arabic never below 13); coarse pointers ≥ 44. Minimum target 24 × 24 (WCAG 2.5.8).

### 4.7 Motion (v4 §4.8 kept; additions)

Tokens: `--t-fast` 120 · `--t` 200 · `--t-slow` 320 · `--t-media` 480 ms; `--ease` (0.16,1,0.3,1) enter,
`--ease-in` (0.3,0,0.8,0.15) exit (exits shorter), `--ease-std` (0.2,0,0,1). Choreography as v4, plus:
- top bar over a hero: transparent with the top scrim; solid `rgb(10 10 9 / .97)` once the hero leaves (fade `--t`);
- tile hover: the picture scales to 1.02 in `--t-media`, the name gains a 1 px underline; nothing glows;
- theatre lights-down after 2 s idle while playing (v4); the note pin and composer stay visible on focus;
- reduced motion: no scale, no crossfade, no lights-down fade; the running dot is static (its word carries it).

---

## 5. Components

Every component has: rest · hover · focus (2 px paper ring + 2 px black outer, on and off art) · active ·
disabled-with-reason · loading · error where it applies. The specimen page `docs/design/prototypes/system.html`
shows them in their states (render: `system-{en,ar}-{1440,390}.png`).

### 5.1 Navigation (shell)

**Top bar** (64; phone 56; sticky; `rgb(10 10 9 / .97)` with a `--line-soft` bottom hairline; transparent with
`--scrim-top` over a hero):

```
[⌜•⌟ Vewbox]   Home  Shows  Shorts  Music Videos  Characters  Studio Company      Locations  Production ④  Screening Room  Settings │ [⌕ Search the studio  Ctrl K]
               ─────                                                              13 px, faint; current = paper
14 px 500 muted; current = paper + 2 px paper underline on the bar's bottom edge
```

- One needs-you count (tungsten, mono) on Production, the same number as Home, Production and the Studio Company
  (audit 5). Status (saved, connected) appears in the shell only when abnormal (a ServerBar, v4 §5.1).
- 1024–1279: secondary links fold into the search sheet; Ctrl/⌘K palette carries thumbnails in each object's shape
  (audit §3.1).
- **Phone bottom bar** (64 + safe area): Home · Productions · Characters · Studio · More (study §3.0). *Productions*
  opens a segmented header Shows | Shorts | Music Videos at the top of those catalogues. *More* holds Locations,
  Production (with the count, which also badges the More tab), Screening Room, Settings, Help. Icons are the content
  shapes (a 16:9 frame, a 2:3 poster, a sleeve, a standing figure, the company ring).
- RTL: the bar mirrors; the brand moves to the right; underline and counts follow.
- Help & shortcuts: one place (the footer and the More sheet; `?` opens the sheet) (WCAG 3.2.6).

### 5.2 Headers

- **Page header** (art-less pages): page title in `.t-page` with its count in the readout (`Characters 5`), the lead
  in muted 19/30, actions at the end of the title row: one primary (e.g. *New character* as a split button with its
  Auto/Manual menu), secondaries, *More* last. Phone: actions under the lead, primary full width.
- **Section head** ("rules, not boxes"): a 1 px `--line` rule, then `h2` + count (mono, faint) at the start and one
  quiet link or note at the end. The Needs-you head uses `--tungsten-line` and a tungsten count.
- **Workspace bar** (56, sticky under the top bar): back · 22×33 poster thumb · title (serif 18) + kind line ·
  the stage pipeline as pills (✓ done in ok; current outlined) · Saved · *Screen it* (secondary).

### 5.3 Buttons

| Variant | Spec | Use |
|---|---|---|
| Primary | Pill 44 (sm 34, lg 52), paper fill, ink text, 14/15 px 500; hover white; focus ring | One per region |
| Split primary | Primary with a 1 px divider and a chevron that opens the Auto/Manual menu | *New show*, *New character* |
| Secondary | `rgb(243 239 232 / .10)` fill, paper text; hover .16 | Everything that is not the one primary |
| Quiet | Text only, muted; hover paper + .06 fill | Cancel, Download in lists |
| Danger | Coral fill, ink text | Only the confirm inside a ConfirmDialog |
| Disabled | `.05` fill, `--fg-disabled` text, `aria-disabled`, **reason written beside it** | e.g. *Redraw* on a locked character |
| Loading | Keeps width; running dot + "Approving…"; `aria-busy` | |
| Icon button | 40 (sm 32) circle, muted; *solid* variant for More; *on-art* on `--chip-on-art` | |
| Play disc | Paper circle 36 / 56 / 72 with a filled triangle; *on-art* variant | The music hero's primary; tiles; voice rows |

Generation actions are secondary unless the work is missing (audit 7): *New take* on a shot that has a selected take
is secondary; *Draw the image* on a character with no image is the primary.

### 5.4 Heroes

| Hero | Page | Composition | Phone |
|---|---|---|---|
| **Marquee** | Home (Continue) | Full-bleed still from the cut (focal crop), top bar over it, bottom-start text: kicker line ("Continue · the final cut is ready"), slate, `.t-marquee` title, lead, primary verb + secondary; readout block at the bottom end | Separate portrait crop (4:5, `portraitFocal`) with text below the art |
| **Backdrop + poster** | Show | Full-bleed key art 700 high; poster 2:3 (232 w) overlapping the hero bottom at the start; beside it slate, title, lead, *Continue Episode N: stage* (primary), *Watch Episode N*, More; tungsten strip when a decision waits; muted preview control at the top end | Portrait crop, no poster, text below, primary full width |
| **Diptych** | Short | Wash from the art; crumb; slate; `.t-marquee` title; frame poster 3 cols beside the player 9 cols; the film strip under the player with scene labels; actions row with deliverable readout at the end | Player first (edge to edge), title, strip, actions |
| **Sleeve** | Music video | Wash from the sleeve; sleeve 1:1 380 with contact shadow; kind line, song title `.t-marquee`, performers as 32 px faces + names, slate; transport row: 72 px paper play disc (the region's primary), Song | Video switch, seek, *Continue: stage*, More | Sleeve ≤ 320, then text, then the transport |
| **Figure** | Character | The canonical figure at 928:1664 on its `--art-edge` field, sticky at ≥ 1024 (5 of 12 cols); no tint; text column beside | Figure full length on its field (≤ 64vh), never cropped |
| **Theatre** | Screening Room | Black; the cut at native ratio, 2/3 width at ≥ 1280 with the review pane beside; transport always visible | Player edge to edge |

Art direction in RTL: when the subject sits where the RTL text block goes, the hero uses its alternative frame
(stored `rtlFrameAssetId`, **new**, chosen once by the producer or defaulting to the next frame whose focal point is
on the opposite side). The prototype's Home uses shot 1.1 in Arabic for this reason.

### 5.5 Tiles

Anatomy: frame (ratio, 2 px) → 14 px → name (serif) with an optional *More* button **outside the art** → slate (status
last). One link wraps frame and text; the menu is a sibling. Hover: picture scale 1.02, name underline. Focus: the
two-colour ring around the frame. Loading: `--art-ph` frame + two text bars, shimmer ≤ 1 s. Selected (in pickers):
2 px paper outline + check chip.

| Tile | Ratio | Name | Slate |
|---|---|---|---|
| Key art (Show) | 16:9 | `.t-card` 25/30 | genre · language · seasons · episodes, status at the end of the second line |
| Poster (Short) | 2:3 (frame poster when none) | `.t-card-sm` | runtime (from the cut) · status |
| Sleeve (Music video) | 1:1 | `.t-card-sm` + performers 13 px | duration · sections · status; play disc on hover/focus/touch |
| Figure (Character) | 928:1664 on `--art-edge` | `.t-card` 26/30, **name only** | only "Needs approval" (tungsten) when true; voice disc on hover/focus/touch |
| Plate (Location) | 16:9 (2.39:1 in heroes) | `.t-card-sm` | lighting states · used in N productions |
| Still (episode, cut) | 16:9 | label + `.t-card` | synopsis 2 lines; stage meter + words |
| Decision card (Home) | 16:9 (figures contained on their field) | `.t-card-sm` | kind line in tungsten; one sentence; one secondary action |
| Contact-sheet tile (Home, Recent) | the object's own shape at one height (248) | `.t-card-sm` | kind · what happened last |

### 5.6 Rails, contact sheet, strips

- **Rail** (v4 §5.6 kept): first tile on the column start, the next partly visible, prev/next buttons, roving focus,
  mirrored in RTL, *See all*.
- **Contact sheet** (new): mixed shapes at one height in one row (Home's *Pick up where you left off*).
- **Film strip** (v4 kept, values): lobby 64 tall with scene labels under it, proportional widths from shot durations;
  2 px current outline; mono shot numbers on a solid chip; always LTR.

### 5.7 Faces

Circles 22 / 26 / 28 / 32 / 72 / 112 cropped from the figure's `faceBox`, on the figure's `--art-edge`; initials when
there is no image. Used in cast rows, performers, lyric lines, reference chips, dialogue lines.

### 5.8 Shapes (shape is identity)

| Object | Catalogue | Hero | Small |
|---|---|---|---|
| Show | 16:9 key art | 16:9 backdrop (21:9 crop ≥ 1280) + 2:3 poster | episode still 16:9 |
| Short | 2:3 poster | 2:3 poster + 16:9 cut | shot frames at the production aspect |
| Music video | 1:1 sleeve | 1:1 sleeve | 16:9 video shelf |
| Character | 928:1664 figure | figure | face circle |
| Location | 16:9 plate | 2.39:1 plate | 16:9 view stills |

### 5.9 Title card and frame poster

- **Title card**: `--surface` fill, 2 px radius, four 14 px corners in `--carbon-8` inset 14 px, the state at the top
  start in the readout ("Not made yet", "No key art yet", "Drawing key art…" with the running dot), the name at the
  bottom start in the serif (muted). Episodes add a large faint number at the top end.
- **Frame poster** (new; audit 1): a 2:3 focal crop of the production's chosen key frame (default: the last shot's
  selected take's opening frame; the producer can choose another), a bottom scrim, and the title in the serif at
  the bottom start with a small readout line ("Frame poster · shot 2.4"). It is a presentation, stored as a
  derivative image at display sizes; no model is involved.

### 5.10 Inputs, search, filters

- **Field** 44, `--field` fill, 1 px `--line-field` border, 8 px radius; focus: paper border + 1 px inset; invalid:
  coral border + message with an icon linked by `aria-describedby`; hint 13/20 faint; never on `--raised`.
- **Search** pill 44, `--field`, magnifier, a `/` or `Ctrl K` key hint; focus ring.
- **Filters** (one deliberate step): status chips (All · In production · Waiting for you · Finished, with counts) and
  one *Filters* button that opens a panel (drawer on desktop, sheet on phone) of segmented facets; active facets show
  as removable chips. Filters appear only when there are more than six items (audit 13 and §3.2).
- **Segmented** 36 in a `--field` track; selected = `--raised` + 1 px strong edge; disabled options carry their reason
  ("Vertical (no cut yet)").
- **Tabs** 52 high, 15 px 500 muted; selected paper with a 2 px paper underline; counts in the mono; sticky in
  lobby detail pages; switching is instant.

### 5.11 Upload

The drop target is the target frame (928:1664 for a reference picture, 1:1 for a sleeve, 4:1 for audio), dashed
`--carbon-8`, with *Browse* always present (2.5.7); drag-over = paper border + `.05` fill; once chosen it becomes the
preview with *Replace* / *Remove*; refusals under the frame with `role="alert"` in plain words ("This file is a video,
not audio").

### 5.12 Image previews (states)

Loading (`--art-ph`, the picture's own colour) · drawing (the phase inside the frame on a solid chip with the running
dot: "Drawing frame 13 of 20") · missing (title card) · composed (frame poster) · failed (the last good picture dimmed,
"This clip didn't load.", *Try again*).

### 5.13 Players

- **Inline / diptych player** (lobby): black, 8 px radius, centre play disc 72, a bottom transport over a 0.82 scrim:
  play, time "0:30 / 0:56" (mono), seek 4 px (paper on 25 % white, 13 px thumb), captions, volume, fullscreen.
- **Theatre transport**: the only blur in the product (`rgb(0 0 0 / .55)` + 12 px blur; solid under
  `prefers-reduced-transparency`), always visible while paused or focused; shot marks on the seek bar; note ticks in
  tungsten; captions and audio language as a readout.
- **Canvas player** (workspace): achromatic canvas, docked transport under the frame (frame back, play, frame forward,
  timecode `00:00:03:12 / 00:00:07:07`, audio, compare, J K L · ← → · I O hint).
- **Now-playing bar** (music): 72 high, 12 px radius, `--raised` + float shadow, inset from the margins; sleeve 48,
  title (serif) + performers · section, Song | Video, play 36, seek, time, close. Sets `--bottom-bars`.
- **Voice reel**: 56 play disc, 96-bar waveform (played paper, unplayed `--carbon-8`, 3.6:1), the line in italic serif,
  the voice's origin label in words ("Studio-designed synthetic voice — not a real person") and the duration.
- All transports and seek bars are `dir="ltr"` with translated labels; single-key shortcuts only while the player has
  focus (v4).

### 5.14 Audio (music)

**Lyric view**: section labels as captions; lines 26/38 serif; active line paper 600, upcoming faint, past
`--carbon-8`; the singer's 28 px face at the line's own start; each line `dir` by its script (an Arabic line is
right-aligned inside the English UI and the reverse); click to seek; auto-scroll keeps the active line at 35 %.
**Sections table**: a real table, 48 rows: # (becomes a wave/play on the current row), section, sung by (face + name),
shots (6 px pips), time (mono, end-aligned); totals footer "3:42 · 8 sections · 20 shots · song version 2".

### 5.15 Credits (new)

A definition list in A24's grammar: a 13 px faint label ("Written by", "Characters", "Filmed by"), the department name
as a serif value (24–28 px) linking to the department, and a 13 px muted line saying what it made, from real records
("15 takes for 8 shots", "all 8 shots passed"). Four columns at 1440 (three on the Show page), one on phones. Cast
credits list characters with their voice and appearance ("4 lines · designed voice", "in 6 episodes · S1–S2").

### 5.16 Status

- **State word**: 7 px dot + phrase 13/20 500. Idle (faint dot, muted text) · running (paper dot with a 3 px halo of
  18 % paper — not a glow, a static ring — and paper text; the dot breathes 1 → .35 → 1 over 2 s unless reduced
  motion) · waiting (tungsten) · done/approved (ok) · failed/refused (coral) · locked (lock icon, muted).
- **Stage meter**: 6 segments 14 × 3 (done muted, current paper, waiting tungsten), `aria-hidden` beside the words.
- **Progress bar**: 3 px paper on `--line`, only when the engine reports a real fraction; job progress mirrors in RTL.
- **Needs badge**: tungsten pill 18 high with a mono count.
- **Judgement words** (takes): *Selected* (paper pill with a check), *Good take* (ok soft), *Rejected · reason* (coral
  soft), *QA passed* (outlined). No stars.

### 5.17 Overlays and feedback

- **Menu / popover**: `--raised`, 8 px radius, overlay shadow, 6 px padding; items 14/20 with a 12.5/18 faint
  description (used for Auto/Manual: "Let the studio propose — one line is enough; you review everything before it is
  made" / "Write it yourself — a title or a line; everything else has a default").
- **Dialog**: 440 / 560 / 880; `--surface`, 12 px radius; title `h2`; Cancel (quiet) then the confirm; destructive
  confirm in coral and named ("Delete Salam"); one sentence of consequence and what is kept. Below 640 it is a bottom
  sheet. Replaces every `window.confirm`/`prompt` (audit 11).
- **Drawer**: end side (mirrored), 380–480, `--surface`, overlay shadow; the Filters panel and the activity detail.
- **Toast**: `--raised`, `role="status"`, 4 s or ≥ 10 s with an action (Undo), pauses on hover/focus, never the only
  report of an error.
- **Notice**: `--surface` with a 2 px start bar (tungsten for waiting, coral for failure), title + one sentence + one
  recovery + *Details* (the raw engine text in mono, LTR). Example from the studio's own failed job: "Drawing Elias's
  image stopped — the image engine stopped with an internal error three times. The approved image is kept as it was.
  [Try again] [Open the engine room] ▸ Details" (audit 4).

### 5.18 Loading, empty, error

- **Loading**: ratio-true frames in `--art-ph`, text bars, shimmer ≤ 1 s; rails reserve height; per-page data (audit
  12), so a page never waits for the whole studio.
- **Empty (page)**: title cards in the page's own shape + one sentence that never repeats the lead + one primary + at
  most one alternative (audit 13). **Empty (section)**: one muted sentence + one secondary action.
- **Error (page)**: what was missing, in words, and a link to its catalogue ("This show isn't in the studio · Back to
  Shows") (audit §3.18).
- **Server unreachable**: the v4 ServerBar, last-known data dimmed and labelled.

### 5.19 Workspace kit (cutting room)

Outline (scenes containing shots with state marks: ● selected take · ◐ running · ○ no take · coral failed; scene rows
show selected/total; Story at the top; Final cut at the bottom; `[` `]` move between shots) · canvas · inspector of
disclosure sections (§8.11) · film strip / timeline · picks (closed vocabularies with drawn 44 × 26 previews) ·
reference chips (face or plate thumbnail + name + a voice-ready dot) · frame slots (opening / ending) · exclusion lines
("With both an opening and an ending frame, no other reference pictures can be added") · status row (phases in words,
elapsed, expectation from history, Cancel from the first second) · takes row (2–4 at the shot's aspect, *Use this
take*, judgement words, *Compare two*) · Attempts list (newest first, including cancelled and failed, *Reuse
settings*) · docked panels with collapse buttons (v4 DockLayout kept).

---

## 6. Content and voice

### 6.1 Vocabulary (one word per thing; audit 15)

| Thing | Word (EN / AR) | Never |
|---|---|---|
| A series | Show / مسلسل | Project |
| A single film | Short (short film) / فيلم قصير | Video |
| A song and its video | Music video / فيديو موسيقي; the song / الأغنية | Track |
| A person in the cast | Character / شخصية | Cast member (in navigation), avatar |
| A place | Location / موقع | World (in tabs; *Cast & World* is only the pipeline stage name) |
| An attempt at a shot | Take / مصوَّرة | — (voice tries are "lines" or "voice samples", never takes) |
| The assembled film | Cut / مونتاج; versions "Cut 3 of 3" | Export (an export is a file of a cut) |
| What waits for the producer | Decision; "Needs you" / بانتظار قرارك | Job, task, alert |
| The company's units | Department / قسم; Agent / وكيل (always labelled as an agent) | Team, bot, human names |

### 6.2 Voice

Plain, specific, past tense for what happened ("Drew Hana Mori again — her feet were cut off in the first"), present
tense for state ("Waiting for your approval"), the verb on the button. No exclamation marks, no "AI", no model names,
no percentages that are not real.

### 6.3 Numbers and dates

Durations "0:56", "7 min", "2 min 50 s"; timecodes `00:00:03:12` (mono, LTR); dates "3 Oct, 09:29"; Arabic "3 تشرين
الأول، 09:29" (Iraqi month names) with digits per §9.4.

### 6.7 One source of truth for decisions

`decisions` (one selector, F4's `shell/decisions.ts` extended) lists every item waiting: character images in Draft,
story and edit gates, lines awaiting review (D28), production passes parked for review. The top-bar count, the tab
title "(4) Production", Home's *Needs you*, the Production page and the Studio Company's gates all read it. In the
studio today it is **4**: Hana Mori's image, Salam's image, two dialogue lines to hear again, the first production pass
of The Static Sky. The prototypes show 4 everywhere.

---

## 7. Navigation and information architecture

### 7.1 Primary and secondary

| Tier | Items | Notes |
|---|---|---|
| Primary | Home · Shows · Shorts · Music Videos · Characters · Studio Company | The work first, the company last |
| Secondary | Locations · Production (needs-you count) · Screening Room · Settings | 13 px, faint; one step quieter |
| Global | Search the studio (Ctrl/⌘K) · Help & shortcuts (`?`) | Search shows thumbnails in each object's shape |
| Not in navigation | Files (reached from Characters, Locations and the palette); New (on Home and each catalogue) | Study §3.0; coordinator decision |

### 7.2 Routes (changes from v4 §7.2)

| Route | Room | Change |
|---|---|---|
| `/` | lobby | **Home** (was a redirect to `/shows`) |
| `/shorts/[id]` | lobby | Diptych title page; the workspace is `/shorts/[id]/production` (map) and `/shorts/[id]/shots/[shotId]` (shot) |
| `/shows/[id]/seasons/[s]/episodes/[p]/production`, `/music-videos/[id]/production` | cutting | The same production map for episodes and music videos |
| `/production` | lobby (no tint) | The control room: decisions with the media first, then what runs now, then history behind a filter (audit §3.14) |
| `/studio/engine-room` | lobby | **new**: engines, models, reliability and failure classes for the engineer (moved out of Production and Settings; audit 4) |
| `/assets` | lobby | Files, grouped by owner, in their own shapes |
| everything else | | as v4 §7.2 |

Titles per route stay as v4 §7.3 (already shipped). The Production tab title carries the decisions count.

### 7.3 Object graph

Show ↔ episodes ↔ characters ↔ locations; production ↔ credits ↔ departments ↔ runs; character ↔ productions (as
posters) ↔ shots (as frames); screening note → shot (*Send to shot*) → the take it produced.

---

## 8. Page compositions

Each page: wireframe at 1440 (text), signature, what makes it premium, states, phone, RTL, audit problems answered,
prototype. Real data is the studio's own (`vewbox_audit`); placeholder content is marked in the prototype with a pink
dashed annotation that is never part of the product.

### 8.1 Home `/` — prototype `home.html`

```
[top bar over the art]
┌ marquee: a still from the latest cut (full bleed, 84vh) ───────────────────────────────────────────────────────────┐
│ ── Continue · the final cut is ready                                                                                │
│ Short film · 2026 · 0:56 · Cartoon · Sci-fi · English · ● Finished · exported                                      │
│ The Static Sky                                   (t-marquee)                     2 scenes · 8 shots · subtitles    │
│ logline (lead, 52ch)                                                             Cut 3 · 1920×1080 · 00:00:56:00   │
│ [ ▶ Screen it ]  [ Open the film ]                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
Four decisions wait for you; nothing is being filmed right now.            (t-card-lg)          [ + New ▾ ]
━━ Needs you 4 (tungsten rule) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ All decisions in Production ›
[figure on its grey] [figure on its grey] [still 1.3]           [take 2.3·4]       ← 4-up decision cards
Character image · v2   Character image · v1   Dialogue · …      Production review
Hana Mori              Salam                  Two lines to hear  The first production pass
one sentence           one sentence           one sentence       one sentence
[Review and approve]   [Review and approve]   [Listen]           [Review]
── Pick up where you left off ─────────────────────────────┐ ┌ The studio now ───────────────┐
[16:9 still][figure][2.39 plate][figure]  ← one height      │ │ ● Paused · why · nothing lost │
kind · name · what happened last                           │ │ company 9 · 35 · engines      │
                                                            │ │ last two handoffs · Open ›    │
── Characters 5 ─────────────────────────────────────────── The casting directory ›
[fig][fig][fig][fig][fig][⌜ New character ⌟]   names in the serif; status only when it waits
── Start something new ──────────────────────────────────── The studio drafts; you approve.
[⌜ 16:9 Your first show ⌟]   [⌜ 2:3 Your next film ⌟]   [⌜ 1:1 Your first song ⌟]   one line under each
```

- **Signature**: the marquee *is* Continue (the next step of the most recent production as a picture with a verb);
  the four decisions with the thing to decide on, inline.
- **Premium**: one huge title on real art; one ivory button on the page; everything below is set by rules and type,
  no cards; recent work as a contact sheet in its real shapes.
- **States**: *empty studio* → no marquee; the sentence becomes "Your studio is ready." with the three title cards
  as the first section and "Meet your studio" linking to the Studio Company; never zeros (study §3.1). *Nothing
  finished but work in progress* → the marquee shows the in-progress production's latest frame with *Continue
  Storyboard*. *No decisions* → the Needs-you section is omitted. *Loading* → marquee frame in `--art-ph`, text bars.
  *Server down* → ServerBar; last-known content dimmed.
- **Phone**: the marquee uses the portrait crop (4:5) with the title under the art; decisions become a rail (80 %
  cards); the contact sheet scrolls; characters 2-up; start cards stacked. Bottom bar: Home current.
- **RTL**: art-directed alternative frame (shot 1.1, subject on the left); the English logline keeps its language and
  direction, aligned to the right edge; the decisions rail starts at the right.
- **Audit**: 1 (the film is the hero and plays in one click), 2 (a front door), 5 (one count: 4), 13 (title cards,
  no repetition), 15 (the work first).

### 8.2 Shows catalogue `/shows` — prototype `shows.html` (placeholder shows, annotated)

```
Shows 6                                                                      [ + New show ▾ ]  ← Auto / Manual
Series with seasons and episodes that share one cast and one world.
┌ feature 21:8: the show to continue ─────────────────────────────────────────────────────────────────────────────┐
│ ● Continue · 1 decision waiting   Show · Season 1 · Episode 3 · Storyboard                                       │
│ Lighthouse Hours (t-hero)     one line                                  12 of 20 frames drawn ▬▬▬▭▭▭              │
│ [ Continue Episode 3: Storyboard ]  [ Open the show ]                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
[⌕ Search shows, episodes and cast  /]  (All 6)(In production 3)(● Waiting for you 1)(Finished 1)   [Genre: Drama ×][Language ▾][Recently updated ▾]
[16:9][16:9][16:9]      name (serif 25) · genre · language · seasons · episodes ……… status
[16:9][⌜title card⌟][⌜drawing key art…⌟]
```

- **Signature**: a key-art wall, three across, with one feature to continue.
- **Premium**: big 16:9 art, names as titles, filters as quiet chips; no bordered selects.
- **States**: empty → one 16:9 title card "Your first show" (8 cols) + "Seasons and episodes that share one cast and
  one world. A line is enough to start." is *not* used because it repeats the lead; the empty sentence is "One line is
  enough: the studio proposes a premise, a cast and Season 1." + *Let the studio propose* / *Write it yourself*.
  Filters hidden until more than six shows. Index view (`.t-index`, 120 px names, art on hover and focus) when more
  than eight.
- **Phone**: segmented Productions header; feature as art then text; search full width; chips scroll; one column.
- **RTL**: the grid and chips start at the right; Arabic names in Markazi inside the English UI and the reverse.
- **Audit**: 3, 13, §3.2.

### 8.3 Show page `/shows/[id]` — prototype `show.html` (placeholder show, annotated)

```
[backdrop key art, 700 high, top bar over it; muted preview control at the top end]
[poster 2:3]  Show · 2026 · 2 seasons · 14 episodes · Drama · English
 232 w        Lighthouse Hours (t-marquee)
              lead (50ch)
              [ Continue Episode 3: Storyboard ]  [ ▶ Watch Episode 2 ]  (⋯)
              ● Waiting for you: approve the story of Episode 4 ›
Genre · Language · Style · Episode length · Aspect · Created          ← one row of definitions under a rule
Episodes 14 · Characters 4 · Locations 1 · Story bible · Production ① · Settings      ← sticky tabs
(Season 1 6)(Season 2 8)(+ New season)                         [☰|▦]  [+ New episode ▾] → Auto / Manual menu
01  [16:9 still 288]  Episode 1 · The Signal · synopsis 2 lines              ● Finished · 7:12 · 18 shots
02  …
03  [still]           The Radio Answers                                       ● Storyboard · 12 of 20 frames ▬▬▬▭▭▭
04  [⌜title card 4⌟]  The Mariner · "Story Development has written…"          ● Waiting for your approval [Read the story]
05  [⌜title card 5⌟]  Untitled · the line from the season plan               ○ Story
── Characters 4 ── 112 px faces · name (serif) · role · voice · "in 6 episodes · S1–S2"
── Credits ── Written by · Characters by · Places by · Storyboard and shot plan · Voices and sound · Filmed and cut by
```

- **Signature**: numbered episode rows with stills and stage words; the season as a chip row; credits as type.
- **Production controls**: the hero has exactly one production entry (*Continue …*, derived from the pipeline);
  *New season* and *New episode* (Auto / Manual menus) sit with the episodes; approvals appear as the tungsten row and
  the strip; generation happens in the workspace. Bible and Settings are tabs, out of the lobby (audit §3.3).
- **States**: no seasons → a 16:9 title card "Season 1" + *New season ▾*; season without episodes → title card
  "Episode 1" + *New episode ▾*; loading → hero frame in `--art-ph`; not found → "This show isn't in the studio ·
  Back to Shows".
- **Phone**: portrait crop, no poster, text below, *Continue* full width; tabs scroll; rows become 128 px stills +
  title + 2-line synopsis + state.
- **RTL**: scrims from the right; the text block on the right; numbers stay in the readout; rails start at the right.
- **Audit**: 3, 7 (no generation in the hero), 11 (Delete behind More), 13, 15 (Characters / Locations vocabulary).

### 8.4 Shorts catalogue `/shorts` (spec; the Short page is the prototype)

Posters 2:3, five across at 1440 (three at 834, two at 390); each a frame poster when no poster was drawn; slate:
runtime from the cut · status; a finished film shows a play disc on hover, focus and touch that opens the Screening
Room at its cut (one click; audit 1). Empty: one 2:3 title card "Your first short" + "One film: a line is enough to
start." + *Let the studio propose* / *Write it yourself*.

### 8.5 Short `/shorts/[id]` — prototype `short.html` (real: The Static Sky)

```
[wash from the frame's dominant colour, fades to the page by 560 px]
‹ Shorts
Short film · 2026 · 0:56 · Cartoon · Sci-fi drama · English · ● Finished
The Static Sky (t-marquee)
[frame poster 2:3 · shot 2.4]  [player 16:9 at 0:30, centre play, transport]
                               [1.1][1.2][1.3][1.4][2.1][2.2][2.3][2.4]   ← proportional strip
                               Scene 1 · The Broken Signal        Scene 2 · Static Echoes
[ ▶ Watch in the Screening Room ] [ Open production ] (⋯)         1080p · MP4 · 56 MB · English subtitles  ↓ Download
Overview · Story · Cast & World · Storyboard 8 · Produce 15 · Final cut
Logline    (serif 30/40, offset to the second column, A24's grammar)
── Scenes 2 ──                                                     8 shots · 15 takes · 6 lines
1  Scene 1 · Night · Elias's Workshop / The Broken Signal / [4 frames] / "Obsolescence…" — Elias Moore …
2  …
── Characters and location ── [Elias figure][Najm figure][Elias's Workshop plate, large]
── Credits ── 8 departments, each with what it made (from the handoffs and takes)
── Production record ── Story 06:36 · Cast & World 07:21 · Storyboard 08:38 · Produce 09:26 · Final cut 09:29 · Exported 09:33
```

- **Signature**: the poster beside the cut with every shot under it, then the programme note.
- **No seasons or episodes**; creation, review and editing live behind *Open production* (the map) and the tabs.
- **States**: no cut → the player slot shows the storyboard reel ("Storyboard reel · not a cut") or the frames grid
  ("No frames yet · 0 of 8"); no frames → a 16:9 title card with the logline; no art at all → 2:3 title card. Failed
  cut → the poster stays with "The cut didn't load" + *Try again*.
- **Phone**: player edge to edge first, no poster, strip below, actions full width, tabs scroll, scenes stacked.
- **RTL**: the English title, logline, scene titles and quotes keep English with correct punctuation (`<bdi lang=en>`);
  the strip and transport stay LTR.
- **Audit**: 1 (art, play in one click), 3 (no KPI tiles, no Edit/Duplicate/Delete furniture), 5 (0:56 from the cut
  everywhere), 6 (no overflow at 390), 10, 14.

### 8.6 Music video `/music-videos/[id]` — prototype `music-video.html` (placeholder song, annotated)

```
[wash from the sleeve]
‹ Music Videos
[sleeve 1:1 380]  Music video · single
                  Frequencies (t-marquee)
                  (◯) Elias Moore  (◯) Najm  featuring (◯) أبو سلام
                  2026 · 3:42 · 8 sections · Folk ballad · English and Arabic · ● Storyboard
                  (‖ 72)  [ Song | Video ]  1:12 ━━━━━━━○──────── 3:42   [ Continue: Storyboard ]  (⋯)
── Lyrics (7 cols, synced) ──────────────────────────┐ ── Sections 8 (5 cols) ─────────────────────
Verse 1   (◯) Every frequency remembers a name,      │ #  Section  Sung by     Shots  Time
Chorus    (◯) Turn the dial, turn the dial slow —  ← │ ≋  Chorus   (◯) Najm    ▪▫▫    0:58
Bridge          يا بحر، رجّعلي الصوت (◯)  ← right-aligned│ …  totals: 3:42 · 8 sections · 20 shots · song v2
── Performers 3 ── 72 faces · "sings 4 of 8 sections · designed voice" · ▶ hear the voice; tungsten "needs a voice"
── Videos 3 ── 16:9 shelf: the music video (storyboard reel · not a cut) · Vertical cut 9:16 (title card) · Lyric video
── Credits ── Words · Music and singing · Storyboard · Timing checked by        Made in Vewbox Studio · 2026
[now-playing bar: sleeve · Frequencies · Elias Moore, Najm · Chorus · Song|Video · ‖ · seek · 1:12 / 3:42 · ×]
```

- **Signature**: the song first: one play disc, Song ⇄ Video on one transport, lyrics straight after the header with
  each singer's face, sections as a track list; videos as a separate 16:9 shelf. Shares no hero with Shows or Shorts.
- **States**: no song → the 1:1 title card "Untitled song" + "A music video starts with its song" + *Write the song*
  (Auto) / *Upload a song* (Manual, a 4:1 audio drop target); song but no video → Video disabled with its reason
  ("No cut yet") and the reel; performer without a voice → tungsten line.
- **Phone**: sleeve ≤ 320, text, transport on two rows; lyrics full width; the Shots column folds; the now-playing bar
  sits above the bottom bar.
- **RTL**: lyric lines keep their own direction; the transport and seek stay LTR; the play glyph never mirrors.
- **Audit**: 3, 13, §3.7 (song and video on one transport; faces on lyric lines).

### 8.7 Characters `/characters` — prototype `characters.html` (real: 5 characters)

```
Characters 5                                                     [ + New character ▾ ] ← Describe / Write the sheet / From a picture
Your studio's cast: one image and one voice each, across every production.
[⌕ Search the cast] (⚟ Filters) (Needs approval first ×)                          [ Line-up | Index ]
[figure][figure][figure][figure][figure]    ← 928:1664, identical frames, 30 px gaps, feet on one floor
Hana Mori   Salam   Elias Moore   Najm   أبو سلام      ← name only (serif 26)
● Needs approval   ● Needs approval                    ← only when it needs the producer
── Cast someone new ── [⌜Auto⌟ Describe them] [⌜Manual⌟ Write the sheet] [⌜Picture⌟ From a picture]  + the rule in one sentence
```

- **Signature**: the casting line-up. **Premium**: big, identical figures with nothing on them; names as titles.
- **States**: empty → the three casting calls as 928:1664 title cards across the page (the shape teaches the
  canonical frame); a character with no image → a figure-shaped title card with the name; drawing → the phase in the
  frame; draft → "Needs approval" + Approve from the tile's menu (ApprovalCard logic, v4).
- **Phone**: two across, search full width, Filters and the view on one row; play discs always visible.
- **RTL**: the line-up starts at the right; Latin names keep Newsreader; figures are never mirrored.
- **Audit**: 8 (no pillars: the frame takes the figure's own grey), 13, §3.8 (filters only when the cast is large).

### 8.8 Character profile `/characters/[id]` — prototype `character.html` (real: Elias Moore)

```
[figure 928:1664 on its grey, sticky]   ‹ Characters
                                         Character · Cartoon · English · 72 years old
                                         Elias Moore (t-hero)
                                         Retired lighthouse keeper and radio repairman.  (serif italic role)
                                         ┌ ● Approved · version 1 on 3 Oct, 01:42 │ 🔒 Identity locked · filmed in The Static Sky ┐
                                         (▶) ▁▂▅▇▅▂ "Static's just a story waiting to be told." · designed voice — not a real person · 0:04
                                         [ Edit details ▾ ] [ Redraw ] (⋯)  Redrawing is closed after filming. Duplicate him as a variant…
                                         About · Voice · Appears in 1 · Notes        ← sticky anchor nav
                                         Personality (prose) · the look in words (only filled facts, 2 columns, regular weight)
                                         Voice: pitch · pace · timbre; his lines on film (play · quote · shot · duration)
                                         Appears in: frame poster + shots as frames (1.2 · 1.4 · 2.2 · 2.4)
                                         Notes for the writers · never used to draw him
```

- **Signature**: a standing figure you can hear. **Built around the canonical image**: one image, one voice; no raw
  generation files or model parameters (the engine and seed live behind *Details* in Edit ▾ › Technical details).
- **States** (identity, v4 table kept): no image (title card + *Draw the image* primary) · drawing (phase in the frame
  + Cancel) · draft (tungsten "Waiting for your approval" + *Approve* primary, true pixels) · approved · locked (as
  shown). Voice states: no voice ("No voice yet" + *Give him a voice ▾* Design / Record with consent) · designing
  ("Designing three candidate voices" with Cancel) · ready.
- **Auto / Manual creation** (`/characters/new`): three methods as casting calls; a live 928:1664 typographic preview;
  inputs carry across methods; the reason a step cannot run sits next to its button; the flow ends on this page with
  "Waiting for your approval".
- **Phone**: the figure full length on its field (≤ 64vh), never cropped; then the name and the voice; anchor nav as a
  chip row.
- **RTL**: the figure on the right; English facts keep English with correct punctuation and start at the right edge.
- **Audit**: 4 (no error rates or engine names), 8 (no pillars, no torso crops), 14, 15 ("lines", not "takes").

### 8.9 Studio Company `/studio` — prototype `studio.html` (real: departments, agents, skills, handoffs)

```
Studio Company (t-page)
Nine departments and thirty-five agents. Lines are drawn only where work is handed over, with the count on each.
┌ ● The studio is paused · you paused intake on 3 Oct at 11:39 · four decisions wait · nothing lost   [▶ Resume the studio] ┐
┌ sunken stage ─────────────────────────────────────────────┐ ┌ inspector: the selected department ──────────────┐
│        (You · approve the story)                           │ │ CA  Department 2 of 8 · Cast & World stage       │
│                 ST Story Development                       │ │     Casting & Character Design                   │
│ (You · approve the cut)       ╭─ CA ●tungsten  ⌒ pair       │ │ responsibility (one sentence)                    │
│      PO ↘                ( Studio Orchestrator )   WB      │ │ Director and agents (each labelled "agent")      │
│   QA 3↑          Executive Office · paused · 4 decisions   │ │ Verified skills (tags) · Tools (in words)        │
│      8↑  VP ←13·1✕── SM ←1── PP ←3                         │ │ Current assignments (figures + tungsten words)   │
│ 9 relations from the org model; dashed = no handoff yet    │ │ Recent work (times, past tense)                  │
└────────────────────────────────────────────────────────────┘ │ Open the department ›                          │
── Running now ── Nothing is running: the studio is paused. (rows when running: by what it makes · phase · time · Cancel)
── Recent handoffs ── 09:29 Post-Production → Executive Office · the cut, for approval · ● validated …  07:30 · ● refused · redone
```

- **Signature**: the live company from the run record: the ring in pipeline order (clockwise from the top in both
  languages, like a clock), the Orchestrator at the centre, the producer outside at the two gates, counts on the lines,
  states in words.
- **A department reveals** its director, agents (always labelled as agents, no faces, no human names), responsibility,
  tools (in words), verified skills, current assignments, recent activity, all from the database; *Open the
  department* leads to its page (v3/v4 department page kept, with telemetry behind Details).
- **Premium**: one drawing on a sunken stage, typographic, no icons-on-discs-on-cards, no glow or particles; the
  numbers are real handoffs.
- **States**: nothing has run → the ring drawn once with dashed relations and "Nothing has run yet. A production
  passes through these departments in this order."; running → spokes from the Orchestrator to the working department
  and a "Running now" row with Cancel; a refusal → a coral ✕ count on its line and a coral row in Recent handoffs.
- **Phone**: the spine: the Orchestrator card, then the departments in pipeline order with the relations as words
  ("→ Video: 13, one refused"), then the inspector of the selected one, then the lists.
- **RTL**: the drawing is not mirrored (pipeline order runs like a clock); labels are Arabic; the inspector moves to
  the left.
- **Audit**: 4 (no telemetry in the main view), 5 (4 decisions, the same count), 15 (the company is secondary in the
  navigation; agents labelled).

### 8.10 Production workspace: the production map `/shorts/[id]/production` — prototype `production.html` (real)

```
[workspace bar: ‹ · poster · The Static Sky / Short film · production workspace · (Map) ✓Story ✓Cast & World ✓Storyboard ✓Produce ✓Final cut · Saved · Screen it]
● The studio is paused. You can edit and choose; new takes wait until you resume it.        Resume in the Studio Company
┌ Outline (280) ────────────────┐ ● Finished: every shot has a selected take, and cut 3 was exported on 3 Oct at 09:33.
│ ✓ Script · approved · 6 lines │ [Story ✓ The script][Scenes ✓ 2 scenes][Shots ✓ 8 shots][Takes ✓ 15 takes][Final cut ✓ Cut 3]
│ ● 1 · The Broken Signal  4/4  │ ── Story ── logline (serif) · You approved the story 06:36 · three concepts, one chosen
│   1.1 [▭] Wide · static     ● │ ── Breakdown review ── table: scene · shots · planned · opening frames · cast · ready
│   …                           │    Total 8 · 61 s of 60 · 8/8 · 2/2 · Ready   [Produce every shot] (disabled: done)
│ ● 2 · Static Echoes      4/4  │ ── Scenes and shots ── per scene: 4 shot cards (frame · framing · move · length · purpose · take pips)
│   2.3 [▭] Two-shot · truck  ● │ ── Final cut ── proportional timeline of the selected takes; Cut 3 / 2 / 1 with Compare
│ ▤ Final cut · cut 3 · exported│
│ [ ] previous and next shot    │
└───────────────────────────────┘
```

- **Signature**: the hierarchy you move through: story → scenes → shots → takes → final cut, as the outline and as
  the five-step flow, with the breakdown review as the gate before filming (LTX).
- **No raw model parameters, job ids or logs** in this view; progress, review, cancellation and recovery are words.
- **States**: in progress → the flow's current step outlined, the gate showing what is missing ("Opening frames 6/8 ·
  Hana Mori's image needs approval") and *Produce every shot* enabled only when ready; running → the shot cards show
  "◐ Filming · 1 min 40 s" with Cancel; failed → coral mark in the outline and a failure card on the shot.
- **Phone**: one column; the outline becomes a shot switcher; the flow is 2 × 3.
- **RTL**: outline on the right; strips and timeline LTR.
- **Audit**: 3, 4, 7 (no generation buttons on finished work; one gated *Produce every shot*), 15.

### 8.11 Shot workspace `/shorts/[id]/shots/[shotId]` — prototype `shot.html` (real: shot 2.3)

```
[workspace bar] [paused line]
Outline │ Take 4 · selected · passed the picture and speech checks          1344 × 768 · 24 fps · 7.3 s │ Scene 2 · Static Echoes · night
        │ ┌ the selected take, native ratio, ≥ 60 % of the pane, on the achromatic canvas ┐          │ Shot 2.3 (serif) · Two-shot · truck right · 7 s
        │ └──────────────────────────────────────────────────────────────────────────────┘          │ [ Draft · faster | Final ]
        │   K  ▶  K   00:00:03:12 / 00:00:07:07   🔊  ◫      J K L · ← → · I O                         │ [ + New take ]  [ ⇤ Continue from shot 2.2 ]
        │ Queued — Preparing references — Filming — Checking     Nothing filming now · takes here took ~3 min │ G · waits in the queue while paused
        │ Takes 4 · one selected                                                     ◫ Compare two     │ ▾ Camera & framing (open)
        │ [take 1][take 2][take 3][take 4 ✓]  QA passed · Use this take · Selected · Good take          │   Framing: [Wide][Medium][Two-shot ✓][Close-up] (drawn)
        │ Attempts · newest first                                                                     │   Camera: [Static][Push in][Truck right ✓][Tilt up] (drawn)
        │ 09:26 Take 4 · 2 min 50 s · passed · you selected it          Reuse settings                │   Length [5 s|7 s|10 s] · Into the shot [Cut|Continues]
        │ … 08:05 Cancelled · before it started · nothing was lost                                    │ ▾ Cast & references: (◯ Elias ●)(◯ Najm ●)(▭ Elias's Workshop · night)(+ From the cast)
        │ [film strip of the 8 shots]                                                                 │   Opening frame [frame] · Ending frame (optional) [+]; exclusion line
        │                                                                                             │ ▾ Action & dialogue: what happens (prose); the line with the speaker's face
        │                                                                                             │ ▸ Generation settings  final · new seed · 1344×768
        │                                                                                             │ ▸ Details · take 4's provenance
```

- **Signature**: the shot is the session: one dominant preview, the takes under it side by side with one verb, the
  attempts as its history; the inspector in disclosure sections with the common ones open.
- **Requirements met** (producer and AI-filmmaking study): prominent preview; character selection (named chips from
  the production's cast, with voice state); location selection (the scene's plate chip with its lighting); reference
  image selection (opening and ending frame slots, with exclusions stated in place); shot description (*What
  happens*, dialogue with the speaker); camera and action controls (closed vocabularies with drawn previews; length
  and how the shot joins); generation settings behind disclosure; clear status (phases in words, elapsed, expectation
  from this production's history, Cancel from the first second); generated takes; approval (*Use this take*, *Good
  take*, *Rejected · reason*) and regeneration (*New take*, *Reuse settings*); continuation (*Continue from shot 2.2*
  sets the opening frame from 2.2's tail and records the relation). Never a node editor or engine internals.
- **States**: no take yet → the opening frame (or a title card of the shot's purpose) in the canvas and *New take* as
  the primary; running → the status row live ("● Filming · 1 min 40 s · last take took 2 min 50 s · Cancel") and a
  placeholder card in the takes row at the shot's aspect; failed → a failure card in Attempts: the class in plain words
  ("The engine ran out of memory"), what is kept ("your settings and references are kept"), one recovery (*Try again
  with a new seed*), *Show report* for the engine text; paused (today) → the paused line and "waits in the queue".
- **Phone**: a shot switcher bar (Scene 2 · Shot 2.3 ▾, ‹ ›), the preview edge to edge, the transport, the status,
  the takes as a rail, the attempts, then the inspector sections as an accordion.
- **RTL**: outline on the right, inspector on the left; takes mirror (they are not time); transport, timecode and
  strip LTR; units translated ("7 ث").
- **Audit**: 4, 6, 7 (picture-first, takes in one click, frames removable via the slot's × , Save never next to
  Delete: Delete shot lives in the outline's row menu), 8 (references in their own shapes), 14 (13.5 px minimum).

### 8.12 Screening Room `/screening` — prototype `screening.html` (real: The Static Sky, cut 3)

```
[black page; top bar on black]
┌ the cut, native ratio, 2/3 width ────────────────────────────┐ ┌ review pane (1/3) ───────────────────────┐
│                                   (1)── pinned note: 00:00:51:04 │ │ Shots 8 · Notes 1 · Subtitles 2 · Export   │
│                                   "The portrait should flicker…" │ │ 1.1 · take 1 · the only take   ● Approved  │
│                                   [Send to shot 2.4] [Resolve]   │ │ 2.3 · take 4 of 4 (open):                  │
│ ▶ ⏮ ⏭ 0:51 / 0:56 ━━━━━━━━━━━━━━━━━━━━━━━━━━━●┊  CC EN 🔊 ◫ ⛶  │ │   [1][2][3][4✓]  Use take 3 in this cut ·  │
└──────────────────────────────────────────────────────────────┘ │   Send back with a note                    │
0:51 Add a note at 0:51…           C note · I O range · pin on the frame · [ ] prev / next shot │ ● Cut 3 approved · exported           │
[1.1][1.2][1.3][1.4][2.1][2.2][2.3][2.4✓]                                                     └────────────────────────────────────────────┘
Now screening
The Static Sky (t-hero)  [Cut 3 of 3 ▾]              [↓ Download ▾] [Open production] [◫ Compare with cut 2]
Short film · 0:56 · Cut 3 · 3 Oct, 09:29 · English and Arabic subtitles
Written by … · Storyboard … · Filmed by … · Characters … · Voices … · Cut by …     Logline (serif)
── Deliverables ── The film · MP4 · 1080p · 56 s · English subtitles burned in · 56.3 MB · ↓ / Subtitles · SRT · VTT … / Poster
```

- **Signature**: lights down, the film first; review available beside it without dominating.
- **Shot review, take selection, approval, rejection**: the Shots tab lists each shot with its take and state;
  opening one shows its takes side by side with *Use take N in this cut* (re-assembles a new cut version) and *Send
  back with a note* (rejection with a reason). **Timeline**: the proportional shot strip and the seek bar's shot marks.
  **Audio**: the volume and the A/B audio switch in Compare. **Subtitles**: CC with the language as a readout; the
  Subtitles tab lists tracks. **Export**: the Export tab and the Deliverables list.
- **Notes** (Frame.io grammar): timecode (C), range (I/O), a pin on the frame, drawings (P), `[` `]` between shots,
  *Send to shot* turning a note into a regeneration brief that pre-fills the shot's *What happens*. Notes need the
  backend record B2 (§11.4); the prototype's note is annotated as an example.
- **States**: no cut → a black 16:9 frame "Nothing to screen yet. A cut appears here when Post-Production assembles
  it." + *Open Production*; several cuts → the picker; compare → two players linked, one transport, an audio switch.
- **Phone**: the player edge to edge; transport always visible; the composer as one line; the review pane below; the
  programme note stacked.
- **RTL**: the page mirrors; the player, transport and strip stay LTR; timecodes Western digits.
- **Audit**: 1 (the film large, one click from everywhere), 4 (deliverables in words: "MP4 · 1080p", not
  "mp4-h264"), 10.

### 8.13 The other pages (specs only)

- **Locations** (`/locations`, `/locations/[id]`): the scouting board of big plates (2 across at 1440); the location
  page with the 2.39:1 plate hero, the lighting switch crossfading the plate, views as 16:9 stills, used-in as stills,
  destructive actions behind More (audit §3.11). The location page today is the closest page to the target; it keeps
  its art-led header.
- **Production control room** (`/production`): decisions first, each with the media to decide on (figure, script
  excerpt, the lines with a player, the cut); then "On the floor" (what runs now, with Cancel); history behind a
  filtered *Activity* view; reliability and failure classes move to `/studio/engine-room` (audit §3.14).
- **Settings**: Interface (language, numerals, reduce motion, contrast, density, previews, single-key shortcuts),
  New work defaults, Access, Studio data, each in plain words; engines and models on the engine-room page; destructive
  resets out of the producer's settings (audit §3.16).
- **Files** (`/assets`): grouped by owner (production, character, location), each in its own shape, audio as
  waveforms, subtitles as text, thumbnails at display size (audit §3.12).
- **New…**: the five shapes as title cards (Show 16:9 · Short 2:3 · Music video 1:1 · Character 928:1664 · Location
  2.39:1); creation pages with Auto (the studio proposes 2–4 candidates side by side, each *Use this*) and Manual (a
  title or a line); progress as past-tense lines naming departments; "The studio drafts; you approve."; every flow
  lands on the new object's page (study §3.11; audit §3.17).

---

## 9. Arabic and RTL

### 9.1 Type

Markazi Text for Arabic titles (600; 1.25–1.38 line height; never tracked, never italic), Plex Sans Arabic for the
interface (+1 px, taller lines), Arabic never below 13 px, Arabic sizes matched optically (§3.3).

### 9.2 Direction

- The interface mirrors: bars, nav order, text blocks, scrims (270°), rails, chevrons and back arrows (`.i-flip`),
  the outline and inspector panes, the anchor nav.
- **Never mirrored**: pictures, faces, plates, the company drawing, play/pause/skip glyphs, clocks, transports, seek
  bars, waveforms, film strips, timelines, timecodes (`dir="ltr"` groups with translated labels).
- **Content in the other script** keeps its own direction with correct punctuation: `unicode-bidi: plaintext` on every
  element with `lang` different from the page, `<bdi lang="en">` around quotes and mixed runs, aligned to the page's
  start edge. English titles keep Newsreader and its metrics inside the Arabic page.
- **Content stays in its language**: a production without an Arabic title shows its English title (with `lang="en"`);
  the interface around it is Arabic. The studio translates content only when the producer asks.
- **Art direction**: RTL heroes use the alternative frame when the subject would sit under the text (§5.4).

### 9.3 Language of parts

`lang="ar"` / `lang="en"` on every name, title, quote and line in the other language (WCAG 3.1.2).

### 9.4 Numerals (decision of 2026-10-03)

Arabic-Indic digits (٠–٩) are a setting under Interface › Numerals, **on by default when the studio's dialect is
Iraqi**. They apply to counts, dates, durations in slates and prose. **Western digits always** in timecodes, the
transport, shot and take numbers on art (`.on-art-chip`), film strips, resolutions, ids, file data and keyboard keys.
Implementation: a formatting function in `src/lib/format.ts` (owned by DS) with a `latinDigits` context for media
components; the prototypes implement the rule in `v5.js` (`?digits=western` shows the other setting).

---

## 10. Accessibility (WCAG 2.2 AA; AAA where noted)

Kept from v4 §8.4 and research §5: focus ring 2 px paper + 2 px black (AAA 2.4.13), never obscured by sticky bars
(`scroll-padding` from the bar sum), 24 px minimum targets (44 on touch), pointer alternatives for every drag (strip
reordering by menu, seek by click, panel collapse buttons), single-key shortcuts scoped to the focused player, one
Help location, redundant entry avoided (creation inputs carried across methods), distinct page titles, captions on by
default, the hero preview muted with a visible pause, no auto-advancing carousels, status messages through polite
live regions, states as words beside every colour, `prefers-reduced-motion` and `prefers-contrast: more` honoured
(contrast More raises muted → body and faint → muted).

---

## 11. What changes from v4, and the implementation plan

### 11.1 Decision on v4

| v4 part | Verdict | Why |
|---|---|---|
| F0 CSS split (`src/app/styles/*`), i18n split (`src/lib/i18n/v4/*`), titles, capture and lint scripts | **Keep** | Sound engineering; enables parallel packages |
| F1 tokens: names, rooms (`data-room`), density, contrast, scroll-padding, `@property --art`, the wash | **Keep the mechanics, replace the values** | The warm ladder and iris made v4 read as "another dark app"; v5 changes values, not names (aliases) |
| F1 type: Inter + Plex Arabic, title voice = Inter opsz 32 | **Replace** | Anonymous (audit 14); v5 families in §3 |
| F2 interface kit (`ui/kit/*`): behaviour, keyboard, ARIA, Dialog, ConfirmDialog, Menu, Toast, Tabs, Segmented, Field, CatalogueBar, ApprovalCard, States, CreationShell | **Keep behaviour, restyle** | Built and tested; never used by pages (audit 9) |
| F3 media kit, players, cutting-room kit | **Keep behaviour and anatomy, restyle; add** frame poster, contact sheet, picks, reference chips, frame slots, status row, attempts, credits, pinned notes | The anatomy matches v5; the identity changes |
| F4 shell: Sidebar, NavRail, MobileBar | **Replace** with TopBar + BottomBar (+ the More sheet) | The sidebar is the dashboard signature and takes 240 px from the art; the IA changes (§7) |
| F4 command palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar, Room | **Keep** (palette gains shape thumbnails) | |
| v4 RTL media rule, contrast measurement, motion tokens, refusals | **Keep** | |
| v4 page specs (§6) | **Superseded** by §8 | |
| Violet brand mark and iris accent | **Remove** | |

### 11.2 Packages and order

```
DS  Design system v5 (tokens values, fonts, type, kit restyle, media additions, shell) ──┐
                                                                                         ├─► P-Home  Home, New…, empty studio
B2  Notes record (cut_notes) and presentation additions (portraitFocal, rtlFrame) ───────┤   P-Shows Shows, Show, Season, Episode lobby
                                                                                         │   P-Film  Shorts, Short, frame poster
                                                                                         │   P-Music Music videos, Music video
                                                                                         │   P-Cast  Characters, Character, creation, Locations
                                                                                         │   P-Work  Production map, Shot workspace, Final cut (all kinds)
                                                                                         │   P-Theatre Screening Room
                                                                                         │   P-Studio Studio Company, Production control room, engine room, Settings, Files
                                                                                         └─► Q2 Consolidation (remove v3/v4 legacy, aliases, unused keys, sidebar)
```

- **DS lands first** (in two merges: tokens + fonts + type within two days so pages can start; then the kit restyle
  and the media additions). Page packages run in parallel once DS-1 has merged; each uses the DS components and asks
  DS for changes (DS turns requests around in a day).
- **B2** is backend and optional for pages: without notes the Screening Room hides the Notes tab and the composer
  (never a fake panel); without `portraitFocal`/`rtlFrame` heroes fall back to the centred crop and the same frame.

| Package | People | Estimate | Starts after |
|---|---|---|---|
| DS-1 tokens, fonts, type, base | 1 | 2 d | — |
| DS-2 kit restyle, media and workspace additions, TopBar/BottomBar, specimen `/kit` | 2 | 5 d | DS-1 |
| B2 notes + presentation fields | 1 (backend) | 2 d | — |
| P-Home | 1 | 3 d | DS-1 (DS-2 for tiles) |
| P-Shows | 1 | 4 d | DS-2 |
| P-Film | 1 | 3 d | DS-2 |
| P-Music | 1 | 4 d | DS-2 |
| P-Cast | 2 | 5 d | DS-2 |
| P-Work | 2 | 7 d | DS-2 |
| P-Theatre | 1 | 3 d | DS-2 (B2 for notes) |
| P-Studio | 2 | 5 d | DS-2 |
| Q2 | 1 | 2 d | all |

### 11.3 Rules that keep parallel work conflict-free (v4 §8.2–8.4, reused)

1. **Exclusive file ownership** (§11.4). A file not listed is read-only; change requests go to the owner.
2. **CSS**: only DS writes `tokens.css`, `type.css`, `base.css`, `kit.css`, `media.css`, `players.css`, `edit.css`,
   `shell.css`; each page package writes only its own sheet under `src/app/styles/pages/<pkg>.css`. No colours, radii
   or durations in components (lint).
3. **Strings**: each package adds keys only in `src/lib/i18n/v5/<pkg>.ts` under its prefix (`home.*`, `shows.*`,
   `film.*`, `music.*`, `cast.*`, `work.*`, `theatre.*`, `studio.*`, `ds.*`); a unit test fails on duplicates; Q2 deletes
   dead keys. Every visible string has both languages (no English inside Arabic; audit 10).
4. **Icons**: DS owns `icons.tsx`; packages add icons in `src/components/ui/icons/<pkg>.ts`.
5. **Selectors**: new selectors in `src/studio/selectors/<pkg>.ts`; `decisions` is DS-owned (one source of truth).
6. **Legacy shims** stay until Q2 so pages migrate one at a time.
7. **No browser dialogs**: each package removes `window.confirm`/`prompt` in its files (useConfirm, inline notes).
8. **Branches** `v5/<pkg>`; merge order DS-1 → DS-2/B2 → pages → Q2.

### 11.4 File ownership

| Package | Owns (exclusive) |
|---|---|
| **DS** | `src/app/styles/{tokens,base,type,kit,media,players,edit,shell}.css`; `src/app/fonts.ts` and `src/app/fonts/*`; `src/components/ui/kit/**`, `ui/icons.tsx`, `src/components/media/**` (+ new `media/FramePoster.tsx`, `media/ContactSheet.tsx`, `media/Credits.tsx`), `src/components/players/**`, `src/components/edit/**` (+ new `edit/{Outline,Picks,RefChips,FrameSlots,StatusRow,Attempts,TakesRow}.tsx`), `src/components/shell/**` (TopBar, BottomBar, MoreSheet replace Sidebar, NavRail, MobileBar; `shell/decisions.ts`), `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/lib/format.ts` (numerals), `src/app/(app)/kit/**`, `src/lib/i18n/v5/ds.ts`, `scripts/v5-lint.mjs` (v4 lint + v5 refusals: violet, serif on controls, uppercase, unbalanced `lang`) |
| **B2** | `src/server/db/schema.ts` (`cut_notes`; `assets.presentation.portraitFocal/rtlFrameAssetId`), migration, `src/server/notes/*`, `src/app/api/notes/*`, `scripts/presentation-backfill.ts` |
| **P-Home** | `src/app/(app)/page.tsx` (Home), `src/components/home/**`, `src/app/(app)/new/**`, `src/components/wizard/**`, `src/app/styles/pages/home.css`, `src/lib/i18n/v5/home.ts` |
| **P-Shows** | `src/app/(app)/shows/**` except episode workspace routes, `src/components/show/**`, `library/ShowCard.tsx`, `styles/pages/shows.css`, `i18n/v5/shows.ts` |
| **P-Film** | `src/app/(app)/shorts/page.tsx`, `src/app/(app)/shorts/[id]/page.tsx`, `src/components/film/**` (title page), `library/ShortCard.tsx`, `styles/pages/film.css`, `i18n/v5/film.ts` |
| **P-Music** | `src/app/(app)/music-videos/page.tsx`, `src/app/(app)/music-videos/[id]/page.tsx`, `src/components/music/**`, `library/MusicVideoCard.tsx`, `styles/pages/music.css`, `i18n/v5/music.ts` |
| **P-Cast** | `src/app/(app)/{characters,locations}/**`, `src/components/{character,location}/**`, `library/LocationCard.tsx`, `styles/pages/cast.css`, `i18n/v5/cast.ts` |
| **P-Work** | every `…/production` and `…/shots/[shotId]` route (shorts, episodes, music videos), `src/components/workspace/**`, `styles/pages/workspace.css` (from the prototype's `ws.css`), `i18n/v5/work.ts` |
| **P-Theatre** | `src/app/(app)/screening/**`, `src/components/screening/**`, `styles/pages/theatre.css`, `i18n/v5/theatre.ts` |
| **P-Studio** | `src/app/(app)/{studio,production,jobs,settings,assets}/**`, `src/components/{studio,production,settings,files}/**`, `styles/studio.css`, `styles/pages/control.css`, `i18n/v5/studio.ts` |
| **Q2** | deletions across all of the above once merged: Sidebar/NavRail/MobileBar, v3 `Hero`/`Art`/`Thumb`/`Modal`/`Empty`/`Block`/`Card`/`KV`/`ConfirmDelete`, `cinema.tsx`/`legacy.tsx` shims, token aliases (`--ink-*`, `--iris-*`, `--violet-*`, `--accent*`), unused i18n keys; `docs/IMPLEMENTATION-CHECKLIST.md` |

### 11.5 Acceptance gate (every package; v4 §8.4 kept and extended)

1. `pnpm exec tsc --noEmit` and `pnpm exec vitest run` pass.
2. `node scripts/v5-lint.mjs <owned paths>` passes (v4 rules + no violet, no serif on controls, no uppercase, every
   other-script string tagged with `lang`, no engine names in strings).
3. Captures with `scripts/capture-evidence.mjs` at **1440, 1920, 834 and 390 × EN and AR**, fixtures *sample*,
   *empty* and *states*, compared side by side with the page's prototype render in `docs/evidence/redesign-proto/`.
   No horizontal overflow at any width (the capture fails if `scrollWidth > width`, as `render.mjs` does).
4. axe-core: 0 serious or critical; a keyboard-only pass in EN and AR; 320 px reflow; 200 % zoom; one page under
   reduced motion and under More contrast.
5. Titles: `node scripts/v4-titles.mjs` distinct in EN and AR.
6. Performance (audit 12): per-page data (no whole-studio snapshot on first paint), thumbnails at display size
   (≤ 2× device pixels; figures ≤ 120 KB, stills ≤ 160 KB), route JS budget recorded before/after.
7. The independent Design QA review signs off each page against its §8 spec and the prototype.

### 11.6 Backend follow-ups

| # | Need | Used by |
|---|---|---|
| B2 | `cut_notes` (cut version, timecode, range, pin x/y, drawing asset, text, author, status, `sentToShotId`, `producedTakeId`) | Screening Room notes, *Send to shot* |
| B3 | Cut version history (exists as assets; expose as versions) | "Cut 3 of 3", Compare |
| B5 | Take judgement (`takes.rating`: good / rejected + reason) | Takes row, Attempts |
| B6 | Quality tier in `takes.params.quality` (draft / final) | Draft / Final |
| B7 | Presentation: `portraitFocal`, `rtlFrameAssetId`, derived frame poster and thumbnails at display sizes | Heroes, posters, performance |
| B8 | `decisions` server selector (one count) including lines awaiting review and parked production passes | The shell, Home, Production, Studio |
| B9 | Phase events per run (`Queued · Preparing references · Filming · Checking`) and median `generationMs` per production | Status row |

---

## 12. The audit's fifteen problems, answered

| # | Problem | Answer (section · prototype) |
|---|---|---|
| 1 | The finished film is invisible | Frame poster (§5.9); Home marquee plays it (§8.1); Short diptych with the cut and strip (§8.5); theatre (§8.12) · `home`, `short`, `screening` |
| 2 | No front door | Home (§8.1) · `home` |
| 3 | One admin template | Purpose-built heroes per type (§5.4) and page signatures (§8); rooms live; no KPI tiles · all pages |
| 4 | Engine internals shown | *Details* per object; engine room page; notice anatomy (§5.17, §7.2) · `system` (error notice), `shot` (Details) |
| 5 | Status contradicts itself | One `decisions` source (§6.7); durations from the cut (§3.4) · 4 everywhere; 0:56 everywhere |
| 6 | Phone/tablet overflow | Phone-first layouts, strips scroll inside themselves; capture fails on overflow (§11.5) · all `-390` renders (0 overflow) |
| 7 | The cutting room is forms and buttons | Production map + shot workspace (§8.10, §8.11) · `production`, `shot` |
| 8 | Wrong shapes | Shape table (§5.8), `--art-edge` fields, no torso crops · `characters`, `character` |
| 9 | Parts never wired | Page packages must build from DS components; Q2 removes legacy (§11) |
| 10 | Arabic mirrored English | §9 · every `-ar-` render |
| 11 | No action hierarchy | One light per region; Delete behind More; ConfirmDialog (§5.3, §5.17) · `system` |
| 12 | Heavy loading | Per-page data, display-size thumbnails (§5.18, §11.5) |
| 13 | Empty states repeat | Title cards + non-repeating sentences (§5.18) · `home` (Start something new), `system` |
| 14 | Flat typography | §3 · every render |
| 15 | IA is the org chart | §7 nav tiers; vocabulary (§6.1) · top bar in every render |

The audit's keep list is kept: the location page's art-led header, the storyboard frames as cards (now the shot cards
of the production map), the Song & Lyrics waveform (the lyric view and sections table), the command palette, the
Studio Company constellation as a secondary view (redrawn), document titles per route, the "no fake progress" stance,
and a dark, calm palette (now near-neutral rather than warm).

---

## 13. Prototypes and evidence

### 13.1 Files

| Page | Prototype | Content |
|---|---|---|
| Design system specimen | `docs/design/prototypes/system.html` | tokens and every component in its states |
| Home | `home.html` | real |
| Shows catalogue | `shows.html` | placeholder shows (annotated); studio artwork |
| Show page | `show.html` | placeholder show (annotated); studio artwork |
| Short page | `short.html` | real (The Static Sky) |
| Music video page | `music-video.html` | placeholder song (annotated); studio artwork |
| Characters directory | `characters.html` | real (5 characters) |
| Character profile | `character.html` | real (Elias Moore) |
| Studio Company | `studio.html` | real (departments, agents, skills, handoffs) |
| Production workspace (map) | `production.html` | real (The Static Sky) |
| Shot workspace | `shot.html` | real (shot 2.3, its four takes and the cancelled attempt) |
| Screening Room | `screening.html` | real (cut 3); the note is an annotated example (needs B2) |
| Shared | `v5.css` (system), `ws.css` (workspace), `v5.js` (shell, icons, language and numerals), `render.mjs` | |
| Type spikes | `spike/type-spike.html`, `spike/ui-spike.html` | the pairings compared |
| Media | `media/*.jpg` | the studio's own canonical figures, workshop plates, shot frames, take posters and cut frames, re-encoded as JPEG from `var/library` (3 MB) |

Open any file in a browser; append `?lang=ar` for Arabic and `?lang=ar&digits=western` for Western digits. Fonts load
from Google Fonts in the prototypes (the product self-hosts them).

### 13.2 Renders

`node docs/design/prototypes/render.mjs` (headless Chromium through `@playwright/test`) writes
`docs/evidence/redesign-proto/<page>-<lang>-<width>.png` for every page × {en, ar} × {1440, 390} (full page; fixed
bars placed at the end of the document; touch emulated below 768) and fails loudly on horizontal overflow. The
contrast table in §2.2 was measured with the script recorded in the session (WCAG relative luminance; alpha
compositing for scrims and chips); DS-1 commits it as `scripts/v5-contrast.mjs`.
