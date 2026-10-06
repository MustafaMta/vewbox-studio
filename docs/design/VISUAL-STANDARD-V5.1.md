# Visual standard v5.1: Viewfinder, dark room

Status: **binding** for the Design System Engineer, the Frontend Engineer and Design QA · 2026-10-03 · creative
direction. It revises `docs/DESIGN-SYSTEM-V5.md` (v5). **Where the two disagree, this file wins.** v5 still governs
what this file does not mention: information architecture (§7), vocabulary and voice (§6), the decision source of
truth (§6.7), accessibility rules (§10), the English-only interface (§9), the players' behaviour (§5.13) and the
workspace (§5.19, §8.10–8.12).

Inputs: the three Home renders (`docs/evidence/home-v1/`), the Home code (`src/components/home/*`,
`src/app/styles/pages/home.css`, `tokens.css`, `type.css`, `kit.css`, `media.css`), the live studio at
`http://localhost:4200/` (read only), and live captures of Krea (the producer's primary reference, measured from its
app view at 1440×900 and 2000×991), Runway, Higgsfield, Luma, Linear, Framer, Apple, Apple TV, A24, Awwwards and
Godly. No interface, branding or artwork is copied; the principles are.

Home's v1 defect list (`HOME-DEFECTS-V1.md`) was resolved when Home was approved and is archived (2026-10-06).

---

## 1. The identity in five sentences

1. Vewbox is a dark room for making films: a near-black studio where the only colour is the work — frames, posters,
   figures and plates.
2. The chrome is quiet charcoal in four tones, set in one precise contemporary grotesk (Geist), with numbers of the
   production in its mono (Geist Mono).
3. Everything sits on one grid with one radius family: content in soft-cornered frames and charcoal cards, aligned to
   the same start edge, separated by space rather than lines.
4. Light is reserved for meaning: one off-white primary per region, the selection, the focus ring; tungsten amber only
   for "waiting for your decision".
5. The brand is the viewfinder — four frame corners — used as a mark and on frames that have not been made yet, never
   as decoration.

## 2. What changes from v5, and why

| # | Change | Why (observed defect or reference principle) |
|---|---|---|
| C1 | **Navigation is a compact left sidebar** (240 expanded / 64 collapsed), not the v5 top bar. Phones keep a top bar + bottom bar. | Producer decision. Krea, Linear and every creative tool the producer admires keep the work area unobstructed; a sidebar leaves the full height to the work and makes alignment trivial (one content edge). |
| C2 | **One sans family for everything** (Geist 400/500/600) + Geist Mono for readouts. **Newsreader is retired** from the interface. IBM Plex Sans and Plex Mono are replaced. | The 18 px serif card names (Home defect 13) read soft and editorial next to 13 px sans meta; three title voices on one page (defect 27). Krea, Runway, Linear, Higgsfield, Luma and A24 all set titles in a tight grotesk; premium comes from weight, size contrast and tracking, not a serif. Geist is OFL, ships in `next/font/google` (`Geist`, `Geist_Mono`, variable `wght`), and is the closest freely licensed match to the Suisse-style neutrality of the reference. Arabic content falls back to the system sans (Segoe UI / Geeza Pro / Noto Sans Arabic), which matches a sans far better than Times New Roman Arabic did behind the serif (defect 19). |
| C3 | **Neutral charcoal ladder** (page `#101010`, sidebar `#050505`, cards `#1A1A1A`), replacing the warm carbon ladder with 12 steps. | "Everything flat black": v5 used `#0A0A09` page with `#111110` groups — 1.06:1, invisible. Krea's page `rgb(16,16,16)` with `#262626` cards gives visible depth without borders. Our cards are one step darker (`#1A1A1A`) so posters stay the brightest thing. |
| C4 | **Cards are back** — charcoal tone, radius 14, no border, no shadow — for anything that carries an action (decisions, create actions, the studio panel). Media tiles have no card box. | v5's "rules, not boxes" produced loose floating text columns (defect 14) and a page with no structure. The references group by tone. Hairline section rules are removed (none rendered anyway). |
| C5 | **One radius family: 6 · 10 · 14 · 20 · pill.** Media radius 2 px is retired. | At 1440 a 2 px corner reads as an unfinished crop, not as a choice; every reference uses 12–16 px on media and cards. Nested radii follow inner = outer − inset. |
| C6 | **Buttons are pills**, 40 high, filled: primary off-white, secondary charcoal `#242424`. No outlined buttons. | The shipped kit draws 8 px rounded rectangles with a 1 px outline (defect 7) — reads like a form, not a product. Krea/Runway/Linear: filled pills, compact. |
| C7 | **The marquee is an inset, rounded feature frame inside the content column, shown at the film's own ratio, with its words under the picture**, not over it. Phones use a 4:5 crop computed from the face. | The current full-bleed hero crops Elias's head (defect 2), puts the title over the subject (3) and the technical readout over the art (5); on phones the subject is out of frame (P2). The frame is 1280×720 and its subject sits left of centre with his head at the top edge, so any overlay or vertical crop damages it. Krea's hero: rounded frame, caption below. |
| C8 | **System information leaves the main view**: the studio state is one line in the sidebar footer and one compact panel at the end of Home. | The "studio now" card was the heaviest object on Home (defect 18) and a full phone screen (P9). |
| C9 | **Start actions are compact action cards** (112 high), not empty title-card slabs. | Three empty slabs, 1,100 px of nothing on phones (defect 22, P12). Krea's small tool cards. |
| C10 | **Tungsten is a dot and a count, never a text colour for whole lines.** | Eight tungsten marks in the first decision row (defect 12) made amber read as decoration. |
| C11 | **Content names isolate inside an LTR block and always align to the start edge.** | Arabic names right-aligned in an English grid (defect 19, P10). |
| C12 | **Loading has the picture's own colour and a 240 ms fade; skeletons pulse, never shimmer; nothing reads as a grey slab.** | Figures that had not decoded showed as flat grey rectangles identical to a real grey backdrop (defect 17). |

---

## 3. Tokens (exact; replace the `:root` values in `src/app/styles/tokens.css`)

### 3.1 Colour

```css
:root {
  color-scheme: dark;
  /* surfaces: five steps, neutral (chroma 0) */
  --bg-nav:     #050505;  /* sidebar, phone top and bottom bars */
  --bg-page:    #101010;  /* the page */
  --surface-1:  #1A1A1A;  /* cards, panels, title cards, skeletons, fields */
  --surface-2:  #242424;  /* hover on cards and nav, selected nav item, secondary button, menus, chips */
  --surface-3:  #2E2E2E;  /* hover on surface-2 items, secondary button on a card, tooltips */
  --black:      #000000;  /* media letterbox, theatre, players (a role, not a step) */

  /* lines */
  --line:         #222222;  /* dividers on the page; tab baseline */
  --line-strong:  #333333;  /* dividers inside cards; overlay edges */
  --line-control: #6E6E6C;  /* field boundary (3.72:1 on page, 3.41 on surface-1) */

  /* text: four steps */
  --text-1: #F5F5F4;  /* titles, primary text, icons when selected      17.4:1 on page */
  --text-2: #A6A6A3;  /* secondary text, descriptions, nav at rest        7.8 page · 7.1 s1 · 6.4 s2 */
  --text-3: #8E8E8B;  /* meta, labels, counts, placeholder                 5.8 page · 5.3 s1 · 4.7 s2 (never on s3) */
  --text-disabled: #5A5A58;  /* disabled labels only (exempt; always paired with a reason) */

  /* light: the one primary, selection, focus */
  --primary: #F5F5F4; --primary-hover: #FFFFFF; --primary-active: #E2E2E0; --on-primary: #0A0A0A;  /* 18.2:1 */

  /* state colours: meaning only */
  --wait: #E3AA5B;  --wait-soft: rgb(227 170 91 / .16);   /* tungsten: waiting for the producer   9.2:1 */
  --ok:   #7FCB9C;  --ok-soft:   rgb(127 203 156 / .14);  /* done, approved, ready                 9.9:1 */
  --bad:  #F0826F;  --bad-soft:  rgb(240 130 111 / .14);  /* failed, refused, destructive confirm   7.4:1 */
  /* running = --text-1 with the pulse (§6.12); there is no blue, no violet, no brand hue */

  /* on art */
  --chip-on-art: rgb(0 0 0 / .72);
  --art-ph: var(--surface-1);  /* set inline per frame from presentation.dominant: oklch(0.22–0.26, min(C, 0.04), H) */
  --art-edge: var(--surface-1);/* set inline per figure: presentation.edge (v5 §2.4 values) */
  --overlay: rgb(0 0 0 / .64); /* behind dialogs and sheets */
}
```

Rules:
- **The squint test.** The brightest, most colourful region of any screen is a picture or the one primary button.
- **Tungsten (`--wait`)** appears only as: the needs-you count (sidebar badge, section count), a 6 px dot before a
  decision's kind line, the "Needs approval" badge, the 2 px start bar of a waiting notice. Never as a text colour for
  a sentence or label line.
- **Ok / bad** appear only as status dots, status words, field errors and the destructive confirm.
- **Gradients:** exactly two remain — the **art wash** of v5 §2.4 (Show, Short, Music video and Location heroes; not
  Home) and the **frame-poster scrim** (v5 §5.9). The hero scrims, the top scrim and the start scrim of v5 are
  retired (nothing is set over a picture any more). Everything else is a flat fill. No glow, no `backdrop-filter`,
  no coloured shadow.
- Legacy aliases in `tokens.css` keep resolving: map `--page`→`--bg-page`, `--surface`→`--surface-1`,
  `--field`→`--surface-1`, `--raised`→`--surface-2`, `--fg`→`--text-1`, `--fg-body`→`--text-1`,
  `--fg-muted`→`--text-2`, `--fg-faint`→`--text-3`, `--fg-disabled`→`--text-disabled`, `--paper`→`--primary`,
  `--tungsten`→`--wait`, `--carbon-*` to the nearest new step. Pages are migrated to the new names by their owners.

### 3.2 Radii (one family)

| Token | px | Use |
|---|---|---|
| `--r-xs` | 6 | Chips on art, kbd keys, tooltips, thumbnails ≤ 48 px, skeleton text bars |
| `--r-sm` | 10 | Nav items, fields, search, menu items, segmented track, small media ≤ 120 px wide |
| `--r-md` | 14 | **Cards, media tiles, decision cards, action cards, title cards, menus, toasts, lobby players** |
| `--r-lg` | 20 | The marquee frame, dialogs, drawers, sheets, hero media on detail pages |
| `--r-pill` | 999 | Buttons, filter chips, badges, count badges, avatars/faces, play discs |
| `--r-0` | 0 | Theatre picture, workspace canvas, full-bleed backdrops |

Nesting: an element inside a padded container takes `outer − inset` (a 4 px-inset item in a 14 px menu = 10; a
2 px-inset segmented option in a 10 px track = 8). These derived values are the only other radii allowed.
Media at the top of a card is clipped by the card (`overflow: hidden`); it has no radius of its own.

### 3.3 Elevation

| Level | Fill | Edge | Shadow | Use |
|---|---|---|---|---|
| 0 | `--bg-page` | — | — | page |
| 1 | `--surface-1` | — | — | cards, panels |
| 2 | `--surface-2` | — | — | hover of level 1, selected nav item |
| Overlay | `--surface-2` | 1 px `--line-strong` | `0 12px 32px rgb(0 0 0 / .5)` | menus, popovers, toasts |
| Modal | `--surface-1` | 1 px `--line-strong` | `0 24px 64px rgb(0 0 0 / .6)` | dialogs, drawers, sheets |

Nothing else casts a shadow. Cards never have borders.

### 3.4 Spacing

4-grid, these values only: **4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 56 · 64 · 80** (`--s-4` … `--s-80`, named by
value). Component internals use 4–24; layout uses 16–80.

### 3.5 Layout grid

| Width | Navigation | Content padding (each side) | Columns | Gutter | Section gap |
|---|---|---|---|---|---|
| < 640 (phone; acceptance 390) | top bar 56 + bottom bar 64 + safe area | 16 | 4 | 12 | 40 |
| 640–1023 | top bar 56 + bottom bar 64 | 24 | 8 | 16 | 48 |
| 1024–1279 | sidebar, collapsed 64 by default | 32 | 12 | 16 | 56 |
| ≥ 1280 (acceptance 1440, 1920, 2000) | sidebar, expanded 240 by default | 40 | 12 | 16 | 56 |

- **Content column** = viewport − sidebar − 2 × padding, `max-inline-size: 1680px`, centred in the main area when
  wider. Resulting content widths: **1440 → 1120**, **1920 → 1600**, **2000 → 1680**, **390 → 358**.
  Column widths: 1120 → 78.67; 1600 → 118.67; 1680 → 125.33; 358 → 80.5.
- **Every** heading, card, image, caption and button starts on the content start edge or a column line. Nothing is
  indented inside a section except text inside cards (16 px padding).
- **Top of page:** 24 px from the top of the main area to the first element (desktop); 12 px below the phone top bar.
- **Section anatomy:** section head (32 high) → 16 → content. Sections are separated by the section gap above.
  No hairlines between sections. Bottom of page: 80 px (desktop), 24 px + bottom bar (phone).
- Rails (horizontal scrollers) bleed to the viewport edge on phones only (`margin-inline: -16px; padding-inline:
  16px; scroll-padding-inline: 16px`); on desktop nothing bleeds out of the content column.

### 3.6 Motion

| Token | Value | Use |
|---|---|---|
| `--dur-1` | 120 ms | hover and press colour changes, tooltip in |
| `--dur-2` | 180 ms | menus and popovers in, tab underline, sidebar collapse |
| `--dur-3` | 240 ms | image fade-in, dialog in, toast in, skeleton → content crossfade |
| `--dur-4` | 360 ms | media hover zoom, drawer and sheet in |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | default for state changes |
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | things appearing |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | things leaving; exits use 70 % of the entry duration |

`prefers-reduced-motion: reduce`: no transforms (no zoom, no scale, no slide), opacity transitions capped at 120 ms,
pulses and indeterminate bars static (their words carry the state). Nothing autoplays or auto-advances (v5 §1.2).

---

## 4. Typography

### 4.1 Families (`src/app/fonts.ts`)

| Voice | Family | Weights | Loading |
|---|---|---|---|
| Interface **and titles** | **Geist** | 400, 500, 600 (variable `wght`) | `Geist({ subsets: ['latin','latin-ext'], variable: '--font-geist', display: 'swap', adjustFontFallback: false })` |
| Readouts (timecode, durations in slates, shot/take/cut numbers, resolutions, counts in section heads) | **Geist Mono** | 400, 500 | `Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap', adjustFontFallback: false })` |

Two families. Newsreader, IBM Plex Sans and IBM Plex Mono are removed from `fonts.ts`.

```css
--font-ui:   var(--font-geist), 'Segoe UI', 'Geeza Pro', 'SF Arabic', 'Noto Sans Arabic', system-ui, sans-serif;
--font-mono: var(--font-geist-mono), ui-monospace, 'Cascadia Mono', Consolas, monospace;
--font-title: var(--font-ui);   /* kept as an alias so existing classes resolve */
```

`font-feature-settings: 'ss01' off; font-variant-numeric: tabular-nums` on every readout and count.
Body text uses proportional figures.

### 4.2 Scale

Desktop = ≥ 1280; mid = 640–1279; phone = < 640. Size / line-height, tracking, weight.

| Role (class) | Desktop | Mid | Phone | Tracking | Weight | Colour | Use |
|---|---|---|---|---|---|---|---|
| `.t-display` | 56/60 (≥ 1800: 64/68) | 44/48 | 34/38 | −0.03em | 600 | text-1 | Home marquee title, Short/Show/Song title |
| `.t-hero` | 40/44 | 34/40 | 28/32 | −0.025em | 600 | text-1 | Character name, Screening Room title |
| `.t-page` | 32/40 | 28/36 | 26/32 | −0.02em | 600 | text-1 | Page titles (Shows, Characters…) |
| `.t-section` (h2) | 22/28 | 20/28 | 19/24 | −0.015em | 500 | text-1 | Section heads |
| `.t-title` (h3) | 16/22 | 16/22 | 16/22 | −0.01em | 500 | text-1 | Dialog titles, panel titles |
| `.t-card` | 15/20 | 15/20 | 15/20 | −0.005em | 500 | text-1 | Card and tile names |
| `.t-lead` | 16/24 | 15/24 | 15/22 | 0 | 400 | text-2 | Loglines, the one purpose line |
| `.t-body` | 14/20 | 14/20 | 14/20 | 0 | 400 | text-2 (text-1 for primary prose) | Descriptions, body |
| `.t-prose` | 15/24, max 66ch | same | same | 0 | 400 | text-1 | Synopsis, personality, script |
| `.t-meta` | 13/18 | 13/18 | 13/18 | 0 | 400 | text-3 | Slates, meta lines, timestamps |
| `.t-label` | 12/16 | 12/16 | 12/16 | 0.01em | 500 | text-3 | Labels above values, group labels, kind lines |
| `.t-ro` (mono) | 12/16 | 12/16 | 12/16 | 0 | 400 | inherits | Readouts; `.t-ro-md` 13/18 |
| Button | md 14/20 · sm 13/18 · lg 15/20 | same | same | 0 | 500 | — | Buttons |
| Nav item | 14/20 | 14/20 | — | 0 | 400 rest · 500 selected | text-2 / text-1 | Sidebar |
| Tab | 14/20 | 14/20 | 14/20 | 0 | 500 | text-2 / text-1 | Tabs |
| Bottom-bar label | — | 12/16 | 12/16 | 0 | 500 | text-3 / text-1 | Phone bottom bar |

Floors: nothing under 12 px; inside the cutting room 13 px (v5's 13.5 becomes 13, Geist's x-height is larger).
No uppercase, no small caps, no italics in the interface.

### 4.3 Wrapping and long titles

- `.t-display`, `.t-hero`, `.t-page`: `text-wrap: balance`, max 2 lines (`-webkit-line-clamp: 2`), max 18ch for
  display; a longer title steps down one role (display → hero size) when it would take 3 lines at the role's size
  (the component measures `title.length > 28` as the rule: > 28 characters → one size down).
- `.t-card`: **1 line, ellipsis** in tiles and cards; the full name is in the link's accessible name and a `title`
  tooltip. Decision headings: 1 line.
- Descriptions in cards: **exactly 2 lines reserved** (`min-block-size: 40px` for 14/20; `-webkit-line-clamp: 2`),
  so every card in a row has the same height.
- Leads: `text-wrap: pretty`, max 64ch, clamp 2 lines on the marquee (desktop), 3 (phone).
- Slates: each fact is `white-space: nowrap`; the separator `·` belongs to the **preceding** fact
  (`span:not(:last-child)::after { content: '·'; margin-inline: 6px; color: var(--text-3) }`) so a wrapped line never
  begins with a separator.

### 4.4 Content text (names, titles, dialogue) inside the English grid

```html
<span class="t-card name"><bdi lang="ar">أبو سلام</bdi></span>   <!-- lang when known; omit when unknown -->
```
```css
.name { display: block; text-align: left; direction: ltr; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name > bdi { unicode-bidi: isolate; }   /* bdi's default dir=auto renders Arabic RTL inside the LTR line */
```
Never put `dir="auto"` on a block-level name container (that right-aligns it). Arabic glyphs render in the system
sans at the same size and weight; no Arabic web font is loaded. Multi-line content (dialogue, lyrics) uses
`<p dir="auto" class="content-para">` with `text-align: start` — a whole Arabic paragraph may align right; a name in a
grid never does.

---

## 5. Components

Every interactive component has: rest · hover · focus · active · disabled (with reason) · loading where it applies.
**Focus (all components):** `outline: 2px solid var(--text-1); outline-offset: 2px` (cards and tiles: offset 3 px;
sidebar items: offset −2 px, drawn inside). On art, add `box-shadow: 0 0 0 4px #000` under the outline. Focus never
uses colour alone, never disappears under a state (v5 §5.0 mechanism kept).
**Coarse pointers:** every control ≥ 44 × 44 (v5 §4.6 block kept with the new class names).

### 5.1 Sidebar (desktop ≥ 1024)

Expanded **240**, collapsed **64**. Full height, `position: sticky; top: 0`, `--bg-nav`, no border, no shadow.
Vertical structure, top to bottom:

| Part | Spec |
|---|---|
| Brand row | 56 high, padding-inline 16. Glyph (four corners + dot, v5 §1.4) 22 px in text-1 + "Vewbox" 15/20 600 −0.01em text-1, 10 px gap. At the end: icon button 28 (collapse; lucide `PanelLeft`, 16 px, text-3; hover surface-2 text-1). |
| Search | 8 px below. A button styled as a field: 36 high, inset 8 px (width 224), `--surface-1`, radius 10, padding 0 10; magnifier 16 text-3, "Search" 14/20 text-3, at the end a kbd chip "Ctrl K" (Geist Mono 12/16, text-3, `--surface-2`, radius 6, padding 2 6). Hover `--surface-2`. Opens the command palette. |
| Group 1 (no label) | 12 px below search. Home · Shows · Shorts · Music Videos · Characters · Studio Company |
| Group 2 "Workspace" | label 20 px above. Locations · Production (count) · Screening Room · Files |
| Spacer | `flex: 1` |
| Footer group | Studio state item · Settings · Help & shortcuts; 12 px bottom padding |

**Nav item:** 36 high, margin-inline 8 (width 224), radius 10, padding-inline 10, gap 12; icon 18 px (lucide, stroke
1.75); label 14/20.

| State | Fill | Icon | Label |
|---|---|---|---|
| Rest | none | text-3 | text-2, 400 |
| Hover | `--surface-1` | text-1 | text-1 |
| Selected (`aria-current="page"`, also for child routes) | `--surface-2` | text-1 | text-1, 500 |
| Active (pressed) | `--surface-3` | text-1 | text-1 |
| Focus | ring inside (offset −2) | — | — |

No selection bar, no accent colour. Items are 4 px apart (row pitch 40).

**Group label:** 12/16 500 text-3, padding-inline 18, 20 px above, 6 px below. Labels only for group 2 ("Workspace")
— group 1 is unlabeled, the footer is unlabeled.

**Count badge** (Production only; the one needs-you number, v5 §6.7): at the item's end, min-width 20, height 20,
padding 0 6, radius pill, `--wait-soft` fill, `--wait` text, Geist Mono 12/16 500. Hidden when 0.

**Studio state item** (footer): same anatomy, the icon replaced by a 6 px status dot centred in the 18 px icon box;
label "Studio paused" / "Making · 3 jobs" / "Studio ready" (text-2). Paused and ready: text-3 dot; making: text-1 dot
with the pulse; a failed engine: `--bad` dot + "Engine offline". Links to `/studio`. This replaces the always-on
"Saved" and "Connected" rows (shown only when abnormal, as the v4 ServerBar).

**Collapsed (64):** brand row shows the glyph only (centred) and the collapse button moves under it as the first
item; search becomes a 40 × 40 icon item; items are 40 × 40 centred (margin-inline 12), radius 10, icon only, the
label in a tooltip to the right (§5.20) after 400 ms; group label becomes a 24 px `--line-strong` divider centred
with 12 px above and below; the count becomes an 8 px `--wait` dot at the icon's top-end (offset 6/6) with the
number in the tooltip ("Production · 4 waiting"). Collapse animates width over `--dur-2`; labels fade out in 90 ms.
The choice persists (localStorage `vb.sidebar`; default expanded ≥ 1280, collapsed 1024–1279).

Keyboard: `Ctrl/⌘ \` toggles; `Ctrl/⌘ K` opens search. Landmark `<nav aria-label="Studio">`.

### 5.2 Phone and tablet navigation (< 1024)

- **Top bar:** 56 high, sticky, `--bg-nav` solid, no border. Start: glyph 22 + "Vewbox" 15/20 600. End: icon
  buttons 40 (search, then a primary-less "New" `+` quiet icon button). No hamburger: everything lives in the bottom
  bar and More.
- **Bottom bar:** 64 + `env(safe-area-inset-bottom)`, fixed, `--bg-nav`, 1 px `--line` top edge. Five equal items:
  Home · Productions · Characters · Studio · More. Item: icon 22 (stroke 1.75) above label 12/16 500, 4 px gap; rest
  text-3, selected text-1 (icon and label; no pill, no fill). More carries the needs-you count as a badge at the icon's
  top-end (18 high, min-width 18, padding 0 5, radius pill, `--wait` fill, `--on-primary` text, Geist Mono 12/18 500). More opens a bottom sheet (§5.17) listing Locations, Production (count), Screening Room, Files,
  Settings, Help, and the studio state line.
- Productions opens `/shows` with a segmented control Shows | Shorts | Music Videos at the top of those pages.

### 5.3 Buttons

| Size | Height | Padding-inline | Font | Icon | Gap |
|---|---|---|---|---|---|
| sm | 32 | 12 (10 on the icon side) | 13/18 500 | 14 | 6 |
| **md (default)** | **40** | **16 (14 on the icon side)** | **14/20 500** | **16** | **8** |
| lg | 48 | 20 | 15/20 500 | 18 | 8 |

All buttons: radius pill, no border, `white-space: nowrap`, `transition: background-color var(--dur-1) var(--ease-out)`.
Coarse pointer: min-height 44 (sm and md).

| Variant | Rest | Hover | Active | Disabled | Use |
|---|---|---|---|---|---|
| **Primary** | `--primary` fill, `--on-primary` | `--primary-hover` | `--primary-active` | `--surface-2` fill, `--text-disabled`, reason beside it | One per region |
| **Secondary** | `--surface-2`, text-1 | `--surface-3` | `#383838` | `--surface-1`, `--text-disabled` | Everything else |
| Secondary on a card (`.card .btn-secondary`) | `--surface-3` | `#383838` | `#424242` | `--surface-2`, `--text-disabled` | Inside level-1 cards |
| **Quiet** | transparent, text-2 | `--surface-2`, text-1 | `--surface-3` | text-disabled | Cancel, tertiary |
| **Icon** | 32 (sm) / 40 (md) circle, quiet or secondary fill; icon 16 / 18 | as variant | as variant | as variant | Toolbars, carousels |
| **Split** | primary or secondary; main part padding-end 12; a 1 px divider (`rgb(0 0 0 / .14)` on primary, `--line-strong` on secondary) inset 8 px top and bottom; chevron part 32 wide, chevron 14 | each part hovers alone | — | — | New show, New character |
| Danger | `--bad` fill, `--on-primary` | `#F39684` | — | — | Only the confirm in a dialog |
| Loading | keeps width; a 14 px spinner (1.5 px stroke, 700 ms linear) replaces the leading icon or sits before the label; label unchanged for the first 400 ms, then the -ing word ("Approving…"); `aria-busy="true"`; no other style change | | | | |

**No outlined buttons anywhere.** Button groups: 8 px gap; the primary is the last (end) item in a row aligned to the
end, the first item in a row aligned to the start.

### 5.4 Section head

One row, `min-block-size: 32px`, `align-items: center`, 16 px above the content.

- Start: h2 `.t-section` + optional count in Geist Mono 14/20 400 text-3 (needs-you count in `--wait`), 8 px gap,
  baseline-aligned.
- Optional description under the title: `.t-body` text-2, 4 px gap (the head grows; content still 16 below).
- End (one of): quiet link 14/20 500 text-2 + chevron 16 (hover text-1), **or** two carousel icon buttons 32
  (secondary, `ChevronLeft/Right` 16) with 8 px gap, **or** one secondary sm button. Never both a link and arrows.
- Phone: the end item stays on the same row (shorten the link to "All" / "See all" if needed; never wrap the head to
  two lines). The rail position readout "1 of 4" (12/16 text-3, Geist Mono digits) sits between title and link.

### 5.5 Media frame and image loading

`<div class="frame" style="aspect-ratio: W/H; --art-ph: …">` + `<img>`; radius `--r-md` (14) for tiles, `--r-lg` (20)
for the marquee and detail heroes, none inside a card (clipped by the card).

| State | Spec |
|---|---|
| Waiting for the image | frame filled with `--art-ph` (the picture's own dominant colour, clamped L 0.22–0.26, C ≤ 0.04). When no dominant is known: `--surface-1` + the skeleton pulse. **Never `--art-edge` grey as a placeholder** (it is a figure's backdrop, it reads as a finished grey picture). |
| Decoded | `img` opacity 0 → 1 over `--dur-3` `--ease-out`, after `img.decode()` resolves (or `onLoad`). No blur-up, no scale-in. |
| Hover (in a link) | `img` scales to 1.03 over `--dur-4` `--ease-out`, inside `overflow: hidden`. No brightness filter. |
| Failed | the frame keeps `--art-ph`; centred icon `ImageOff` 20 text-3 + "Picture unavailable" 12/16 text-3; the tile stays clickable. |
| Missing art (object exists) | the title card (§5.11). |
| Lazy loading | `loading="lazy"` with the browser default; above the first screen `loading="eager"`; the marquee `fetchpriority="high"`. Screenshots and QA captures must scroll the page to the end and wait for `document.images` to complete before capturing. |

Chips on art (duration, shot labels): bottom-start or bottom-end 8 px inset, height 22, padding 0 8, radius 6,
`--chip-on-art`, text-1 12/16 500 (Geist Mono for readouts). One chip per frame at most. Never over a face (use the
end corner when the face is at the start).

### 5.6 Media tile (catalogue and Home tiles; no card box)

Frame (ratio of the object) → 12 px → name `.t-card` (1 line) → 2 px → meta `.t-meta` (1 line, status last as a
status word §5.12). One `<a>` wraps frame and text. Hover: image zoom 1.03; name unchanged (no underline). Focus:
ring at offset 3 around the whole tile. Selected (pickers): 2 px text-1 outline at offset 3 + check badge 24 (primary
fill) top-end 8 px inset. Loading: frame skeleton + a 12 px bar at 60 % width + a 12 px bar at 40 %.

| Tile | Ratio | Name | Meta |
|---|---|---|---|
| **Production** (short, episode, cut) | 16:9 | title | "Short · Final cut · 3 Oct" |
| **Poster** (Shorts catalogue) | 2:3 | title | runtime · status |
| **Sleeve** (music video) | 1:1 | song title | performers · duration |
| **Character** | 928:1664, `object-fit: contain` on `--art-edge` | name only (§4.4) | status only when it needs the producer ("Needs approval" badge, §5.13); otherwise nothing — rows keep their height with `min-block-size: 18px` |
| **Plate** (location) | 16:9 (`cover`) | name | "Interior · 2 plates" |
| **Recent** (Home "Pick up") | 16:9 for every object (figures portrait-cropped, §8.4) | name | "Character · approved, locked" |

### 5.7 Decision card (Home "Needs you"; Production page)

A level-1 card that is **one link**.

- Box: `--surface-1`, radius 14, `overflow: hidden`. Hover: `--surface-2` + image zoom. Focus: ring offset 3.
- Media: 16:9 at the top, edge to edge. Scene stills `cover` at their focal point. **Character images are portrait-
  cropped**: `object-fit: cover; object-position: 50% Y%` where Y puts the face centre (`presentation.faceBox`) at
  38 % of the visible height (fallback `50% 8%`). The full figure is shown on the review page, not on the card.
  One chip at bottom-start (shot labels, take count).
- Body: padding 16 (top 14). Kind line `.t-label` text-3 with a 6 px `--wait` dot, 8 px gap ("Character image ·
  version 2"); 6 px; heading `.t-card` text-1, 1 line; 4 px; description `.t-body` text-2, exactly 2 lines reserved;
  16 px; the verb as a **secondary-on-card sm button** (32 high) rendered as a `<span>` inside the link
  ("Review and approve"). Button bottom edges align across the row (the body is a flex column, the button
  `margin-block-start: auto`, the card `block-size: 100%` in a grid with `align-items: stretch`).
- Height at 1440 (card 268 wide): 151 + 14 + 16 + 6 + 20 + 4 + 40 + 16 + 32 + 16 = **315**.

### 5.8 Action card (Home "Start something new"; empty-state actions)

Level-1 card, one link. Height **112** (phone 104), padding 16, radius 14, `--surface-1`; hover `--surface-2`,
active `--surface-3`. Top-start: the object's **shape glyph** 20 px text-1 (a 16:9 frame for a show, a 2:3 poster for
a short, a 1:1 sleeve for a music video, a standing figure for a character, a 2.39 strip for a location — drawn as
lucide-weight strokes with the four-corner motif). Bottom-start: title `.t-card` text-1 ("New show"), 2 px, one
line `.t-body` text-2 ellipsis ("Seasons that share one cast"). End-top: chevron 16 text-3, text-1 on hover.

### 5.9 Panel card (the studio panel; settings groups)

Level-1, radius 14, padding 20 (phone 16). Inside: a definition grid; labels `.t-label` text-3, values 14/20 text-1
(secondary values text-2); cells separated by 24 px, no lines. Title, if any, `.t-title` with 16 px below.

### 5.10 Contact sheet (retired on Home)

v5's mixed-shape strip at one height is retired on Home: uneven widths broke the grid (defect 16). Recent work uses
four equal 16:9 tiles. The contact sheet survives only in the workspace strips (v5 §5.6, values updated to radius 6).

### 5.11 Title card (an object without art)

Shape of the object, radius 14, `--surface-1`. Four viewfinder corners: 12 px arms, 1.5 px, `--line-control`,
inset 12 px. Top-start (16 inset): state `.t-label` text-3 ("No key art yet"; "Drawing key art…" with the running
dot). Bottom-start (16 inset): the name `.t-card` text-2, 2 lines max; on 16:9 cards ≥ 320 wide the name is 20/26 500.
**Never larger than 20 px, never serif, never an empty card without a name.** Not used for "start" actions (§5.8).

### 5.12 Status indicator

6 px dot + word, 13/18 500, 8 px gap. Idle: text-3 dot, text-2 word. Running: text-1 dot pulsing (opacity 1 → .35 →
1, 1.6 s ease-in-out, infinite; static under reduced motion), text-1 word. Waiting: `--wait` dot, text-1 word.
Done: `--ok` dot, text-2 word. Failed: `--bad` dot, text-1 word. Locked: lucide `Lock` 12 text-3 instead of the dot.

### 5.13 Chips and badges

- **Filter chip:** 32 high (44 coarse), padding 0 12, radius pill, `--surface-2`, text-2 13/18 500; hover
  `--surface-3` text-1; selected `--primary` fill, `--on-primary` text; count inside Geist Mono 12 text-3 (selected:
  `rgb(10 10 10 / .6)`); removable chip adds a 16 px `X` (hit area 24).
- **Status badge:** 22 high, padding 0 8, radius pill, 12/16 500. Waiting: `--wait-soft` / `--wait` ("Needs
  approval"). Ok: `--ok-soft` / `--ok`. Bad: `--bad-soft` / `--bad`. Neutral: `--surface-2` / text-2.
- **Count badge:** §5.1.
- **Kbd:** Geist Mono 12/16, padding 2 6, radius 6, `--surface-2`, text-3.

### 5.14 Tabs and segmented

- **Tabs:** 40 high (44 phone, wrapping to two rows, never scrolling), gap 24, 14/20 500; rest text-2, hover text-1,
  selected text-1 with a 2 px text-1 bar on the bottom edge (radius 1); baseline 1 px `--line` across the content
  width. Counts Geist Mono 13 text-3. Sticky under nothing on desktop (no top bar); under the 56 px top bar on phone.
- **Segmented:** track 36 high, `--surface-1`, radius 10, padding 2; option 32 high, radius 8, 13/18 500 text-2;
  selected `--surface-3` text-1; hover text-1. Disabled options text-disabled with the reason in the tooltip and in
  `aria-describedby`.

### 5.15 Search, fields, filters

- **Field:** 40 high (44 coarse), `--surface-1`, 1 px `--line-control`, radius 10, padding 0 12, 14/20 text-1,
  placeholder text-3. Hover border `#8A8A88`. Focus: border text-1 + the focus outline. Invalid: border `--bad` +
  message 13/18 `--bad` with `AlertCircle` 14 below, `aria-describedby`. Disabled: `--bg-page` fill, `--line` border,
  text-disabled. Label above: `.t-label` text-2 (not text-3), 6 px gap. Hint below 13/18 text-3. Textarea: same, padding
  10 12, min-height 96.
- **Search (palette and catalogue):** as the sidebar search for the trigger; inside the palette the input is 48 high,
  no border, 15/20, results rows 48 high with a 36 px thumbnail in the object's own shape (radius 6), hover
  `--surface-2`.
- **Filters:** a chip row (§5.13) + one secondary sm "Filters" button with a count that opens the filter drawer
  (§5.17). Shown only when a catalogue has more than six items (v5 §5.10).

### 5.16 Dropdown menu, popover

`--surface-2`, 1 px `--line-strong`, overlay shadow, radius 14, padding 4, min-width 220. Item: 36 high (44 coarse),
radius 10, padding 0 10, icon 16 text-2, label 14/20 text-1, optional description 13/18 text-2 (item grows to 52);
hover / keyboard-active `--surface-3`; disabled text-disabled; destructive label `--bad`. Separator: 1 px `--line-strong`
with 4 px margin. Opens 4 px from its trigger: opacity 0 → 1 and translateY(−4 px → 0) over `--dur-2`
`--ease-enter`; closes in 120 ms.

### 5.17 Dialog, drawer, sheet

- **Dialog:** widths 440 / 560 / 880, `--surface-1`, radius 20, 1 px `--line-strong`, modal shadow, padding 24.
  Title `.t-title` 16/22 (18/24 for 880), 8 px, body `.t-body` text-2, 24 px, footer row end-aligned: quiet Cancel
  then the confirm (primary, or danger named "Delete Salam"). Close icon button 32 quiet at top-end (16 inset).
  Overlay `--overlay`. In: overlay opacity 0 → 1 `--dur-3`; dialog opacity 0 → 1 + scale .98 → 1 `--dur-3`
  `--ease-enter`. Out: 160 ms `--ease-exit`. Focus trapped; Esc closes.
- **Drawer (desktop):** floats 8 px from the top, end and bottom viewport edges; width 400 (filters) / 480 (details);
  radius 20; same fill, edge and shadow as the dialog; header 56 (title + close), body padding 20, sticky footer 64
  with the actions. In: translateX(24 px → 0) + opacity over `--dur-4`.
- **Sheet (< 640, replaces both):** bottom, full width, top radius 20, max-height 88svh, a 36 × 4 handle (`--line-control`,
  radius pill) 8 px from the top, padding 16 + safe area.

### 5.18 Toast

Bottom-end, 24 px from the viewport edges (phone: centred, 12 px above the bottom bar); width 360 (phone: content
width); `--surface-2`, 1 px `--line-strong`, overlay shadow, radius 14, padding 12 16; status icon 16 (ok / bad /
text-2) + message 14/20 text-1 + optional quiet sm action ("Undo"). `role="status"`; 5 s, ≥ 10 s with an action;
pauses on hover and focus; stack max 3 with 8 px gaps. In: translateY(8 → 0) + opacity `--dur-3`.

### 5.19 Notice (inline)

`--surface-1`, radius 14, padding 16, a 3 px start bar inside the radius (`--wait` waiting, `--bad` failure);
title 14/20 500 text-1, one sentence text-2, one secondary sm recovery button + quiet "Details" disclosure (raw engine
text in Geist Mono 12/18 text-3 inside a `--bg-page` well, radius 10).

### 5.20 Tooltip

`--surface-3`, radius 6, padding 4 8, 12/16 500 text-1, no shadow, 1 px `--line-strong`; 6 px from the target; delay
400 ms in (0 when moving between items), 120 ms fade; never the only carrier of essential information.

### 5.21 Progress

- **Determinate:** 4 px track `--surface-3`, fill text-1, radius pill; label row above: phase words 13/18 text-1 at
  the start, Geist Mono 12 text-3 at the end ("2 of 8"). Only with a real fraction.
- **Indeterminate:** the same track with a 30 %-wide fill sliding start → end in 1.2 s linear, infinite; reduced
  motion: a static 30 % fill + the words.
- **Job running (row or card footer):** the running status indicator (§5.12) + phase words ("Drawing frame 13 of 20")
  + elapsed Geist Mono 12 text-3 ("0:42") + quiet sm "Cancel", available from the first second. On a frame: the phase
  chip bottom-start (§5.5) with the running dot.

### 5.22 Skeletons

Shapes mirror the final layout exactly (same aspect ratios, same line heights, same gaps), so swapping in the content
causes zero layout shift. Fill `--surface-1` (on a card: `--surface-2`); radii: media as the final frame, text bars
radius 6 and 12 high (titles 16 high), widths 60 % / 40 %. Pulse: opacity 1 → .55 → 1, 1.4 s ease-in-out,
infinite; static under reduced motion. Shown after 150 ms (no flash on fast loads); replaced by a 240 ms crossfade.
No shimmer gradients, no grey slabs without the pulse.

### 5.23 Empty and error states

- **Empty section:** one line `.t-body` text-2 + one secondary sm action, left-aligned, in place of the content
  (the section head stays). Never a large empty card.
- **Empty page:** the page title, one sentence, and the action cards (§5.8) for what can be made. No illustration.
- **Error page:** `.t-page` "This show isn't in the studio", one sentence, secondary "Back to Shows".
- **Error inside a section:** the notice (§5.19) at the section's width.

### 5.24 Video and audio player chrome (lobby)

- **Video player:** picture on `--black`, radius 14 (20 when it is the page's hero), the transport **docked under
  the picture** inside the same rounded box: 52 high, `--surface-1`, padding 0 12, items 8 px apart: play/pause icon
  button 36 (primary fill, `--on-primary` icon 16) · time Geist Mono 12/16 text-2 "0:30 / 0:56" · seek bar (flex 1):
  4 px track `--surface-3`, played text-1, buffered `#3A3A3A`, 12 px text-1 thumb visible on hover/focus/drag, the
  hit area 24 high · captions (`Captions` 16) · volume · fullscreen, icon buttons 32 quiet. No centre play disc over
  the picture; no scrim; captions sit on the picture's lower area as v5 §5.13. Theatre and canvas players keep v5.
- **Audio row:** 64 high, `--surface-1`, radius 14, padding 12; play button 40 (primary fill) · title 14/20 500 +
  meta 12/16 text-3 · waveform 32 high (2 px bars, 2 px gaps, played text-1, unplayed `#3A3A3A`) · time Geist Mono 12
  text-3. All transports LTR.

---

## 6. Loading and transitions

1. **Route change:** no page transition. The shell (sidebar) never re-renders; the main area shows the page's
   skeleton (§5.22) after 150 ms if data is not ready, then crossfades to content in 240 ms.
2. **Images:** `--art-ph` first, fade in after decode (§5.5). Above-the-fold images are eager; the marquee is
   preloaded (`fetchpriority="high"`).
3. **Dialog / drawer / sheet / menu / toast:** §5.16–5.18 timings; exits are 70 % of entries.
4. **Async buttons:** §5.3 loading. Navigation actions show nothing extra (the next page's skeleton is the feedback).
5. **Zero layout shift:** every frame reserves its `aspect-ratio`; text in cards reserves its clamped lines; badges
   and counts reserve `min-inline-size` and appear without moving neighbours; web fonts load with `display: swap` and
   the fallback stack's metrics are close enough (Geist ↔ Segoe UI); the sidebar width never animates on first paint
   (read the stored state before hydration via a `data-sidebar` attribute on `<html>` set in an inline script).
6. **Reduced motion:** §3.6.

---

## 7. Home composition

Order (all widths): **1 Marquee → 2 Needs you → 3 Pick up where you left off → 4 Characters → 5 Start something new
→ 6 The studio.** The v5 intro sentence ("Four decisions wait for you; the studio is paused.") and the "New" button
beside it are **removed** (they repeated the count, the studio state and the sidebar's New). States as v5 §8.1
(empty studio: no marquee; the page title "Your studio is ready." `.t-page`, one sentence, then section 5 first;
no decisions: section 2 omitted; no recent work: section 3 omitted).

### 7.1 Marquee (the latest film)

**Picture.** The production's wide frame (today `gen-1ec1231f8f`, 1280×720) inside the content column: full content
width, `aspect-ratio` 16:9, **`block-size: min(content-width × 9/16, 100svh − 240px, 760px)`**, `object-fit: cover`,
radius 20, 24 px from the top of the main area. Nothing is drawn over the picture: no title, no scrim, no readout, no
chip, no play disc.

**Crop rule (all frames):** horizontal `object-position` = `presentation.focal.x`; vertical: if the top of
`faceBox` is in the top 20 % of the frame, anchor at **0 %** (crop only from the bottom); otherwise place the face
centre at 35 % of the visible height. Never crop above a head. For this frame: `object-position: 41% 0%`.

| Width | Content | Picture | Crop of the 1280×720 source |
|---|---|---|---|
| 1440 × 900 | 1120 | **1120 × 630** (native 16:9; 660 cap not reached) | none |
| 1920 × 1080 | 1600 | **1600 × 760** | bottom 112 source px (desk drawers); head intact |
| 2000 × 991 | 1680 | **1680 × 751** | bottom 148 source px; head intact |
| 390 | 358 | **358 × 448 (4:5)**, radius 14, 12 px below the top bar | a 576-px-wide window, `object-position: 34% 0%` |

Phone crop: the phone uses **the same wide frame**, never a different poster. `portraitFocal.x` =
`(faceCentreX − w/2) / (1 − w)` with `w = (H × 4/5) / W` (here face centre 0.41, w = 0.45 → 34 %). Elias stays whole
and centred. Backend follow-up (not a blocker): store a 1920-wide frame from the 1920×1080 cut so 1920/2000 are not
upscaled 1.25–1.31×.

**Words under the picture** (desktop ≥ 1024): 24 px below the picture, a 12-column row:
- Columns 1–8: meta row (24 high): status badge (§5.13, ok: "Finished") + 12 px + slate `.t-meta` text-2 "Short film ·
  2026 · 0:56 · Cartoon · English"; 12 px; title `.t-display` (56/60 at 1440, 64/68 at 1920/2000), 1 line here;
  8 px; logline `.t-lead` text-2, max 64ch, clamp 2 lines.
- Columns 9–12: action row, `justify-content: end`, `align-self: end` (its bottom aligns with the logline's last
  baseline box): secondary md **"Open the film"**, 8 px, primary md **"▶ Screen it"** (or "Continue: storyboard" when
  unfinished; then the secondary is "Open the film").
- The kicker ("The final cut is ready") becomes the badge; the readout "1920×1080 · 00:00:56:00 · 2 scenes · 8 shots
  · English subtitles, burned in" is **removed from Home** (it lives on the film page).
- First screen at 1440 × 900: 24 + 630 + 24 + 24 + 12 + 60 + 8 + 48 = **830 px**; the Needs-you head starts at
  886 (its title just shows), signalling more below.

640–1023: picture full content width 16:9 (radius 20), words below in one column, buttons in a row under the logline.
Phone: picture 4:5; 16 px; meta row (badge + slate; the slate may wrap per §4.3); 8 px; title 34/38; 8 px; logline
15/22 clamp 3; 16 px; buttons in one row, equal widths (`flex: 1`), 44 high: secondary "Open the film" then primary
"▶ Screen it".

### 7.2 Needs you (decisions)

Head: "Needs you" + count `4` in `--wait`; end: quiet link "All decisions" + chevron (→ `/production#needs-you`).
Desktop: a 12-column grid, **4 decision cards (§5.7), 3 columns each**, gap 16, equal heights (315 at 1440; at 1920
cards are 388 wide → 218 media → 382 tall; at 2000: 408 → 229 → 393). More than 4 decisions: the 4 oldest are shown
and the link reads "All 6 decisions". 1024–1279: 2 × 2.
Phone: a rail; cards 280 wide, gap 12, `scroll-snap-type: x mandatory`, snap start, thin scrollbar hidden, end of
the rail aligned to the 16 px margin; head shows "1 of 4" between title and link.

### 7.3 Pick up where you left off

Head: title only (no link). Desktop: **4 recent tiles (§5.6, "Recent"), 3 columns each, all 16:9**, gap 16; at 1440
each 268 × 151 + 12 + 20 + 2 + 18 = 203 tall. Characters in this row are portrait-cropped like decision cards;
locations use their plate `cover`; productions their key frame. No studio panel beside it (moved to §7.6).
Phone: a rail of tiles 240 wide (135 media), gap 12, showing up to 6 items.

### 7.4 Characters

Head: "Characters" + count `5` (text-3); end: quiet link "Casting directory".
Desktop: line-up of **character tiles (§5.6)** in a grid of **6 columns at content < 1600 (1440: 173 × 311 frames)
and 8 columns at content ≥ 1600 (1920: 186 × 333; 2000: 196 × 352)**, column gap 16, row gap 24. Order: the studio's
order; then the **"Cast someone new" tile** in the same frame size: `--surface-1`, radius 14, centred 40 px circle
`--surface-2` with `Plus` 18 text-1, 12 px below it "New character" 14/20 500 text-1; hover `--surface-2` (the circle
`--surface-3`); its caption row is empty (no duplicate title below). Names left-aligned on the tile's start edge
(§4.4); only waiting characters show the "Needs approval" badge under the name.
Phone: a rail; tiles 136 wide (244 frames), gap 12; the "New character" tile last.

### 7.5 Start something new

Head: "Start something new" + description line "The studio drafts each step; you approve it." (text-2, under the
title). Desktop: **4 action cards (§5.8), 3 columns each**, 112 high: New show · New short · New music video · New
character (each links to its `/new/...` route; the split Auto/Manual choice happens on the next page). Phone: 2 × 2
grid, gap 12, 104 high.

### 7.6 The studio (secondary)

Head: "The studio"; end: quiet link "Studio Company". One **panel card (§5.9)**, full content width, a 4-column
definition grid (each 3 columns of the 12): **State** — status indicator "Paused" + "since 3 Oct, 14:39" text-2 ·
**Company** — "9 departments · 35 agents" · **Engines** — "Picture and video offline · Voices offline" · **Last
handoff** — "Post-Production · export made and validated" + "3 Oct, 12:33" text-3. Each cell: label 16, 4, value 20,
second value line 20 (text-2, may be empty). Height 100 (20 + 16 + 4 + 20 + 20 + 20). No initials avatars, no job tallies, no second handoff. Phone: 2 × 2 grid, padding 16, row gap 20.

### 7.7 Exact desktop page at 1440 × 900 (main area 1200, content x = 280 → 1400)

| Block | y (top) | Height |
|---|---|---|
| Marquee picture | 24 | 630 |
| Marquee words | 678 | 152 |
| Needs you (head 32 + 16 + cards 315) | 886 | 363 |
| Pick up (32 + 16 + 203) | 1305 | 251 |
| Characters (32 + 16 + 311 + 12 + 20 + 2 + 18) | 1612 | 411 |
| Start (head with description 28 + 4 + 20 = 52, + 16 + 112) | 2079 | 180 |
| The studio (32 + 16 + 100) | 2315 | 148 |
| Bottom padding | 2463 | 80 → page **2543** (was 2991) |

Sidebar: 0 → 240, brand row 0–56, search 64–100, group 1 from 112 (Home selected), group 2 label at 372, footer at the
bottom.

### 7.8 1920 × 1080 and 2000 × 991

Same order and rules; content 1600 / 1680 starting at x 280; marquee 1600 × 760 / 1680 × 751; marquee title 64/68;
decisions, recent and start rows stay **4-up** (wider cards, same anatomy); characters 8 columns. Nothing is centred
in a narrower container; nothing stretches beyond 1680.

### 7.9 Phone 390 × 844

Top bar 56 → 12 → marquee picture 448 → 16 → words (24 + 8 + 38–76 + 8 + 66 + 16 + 44 ≈ 230) → 40 → Needs you rail
(head 32 + 16 + card 280 × ~305) → 40 → Pick up rail (32 + 16 + ~190) → 40 → Characters rail (32 + 16 + 244 + 40) →
40 → Start 2 × 2 (head 56 + 16 + 220) → 40 → The studio (32 + 16 + ~150) → 24 → bottom bar. Page ≈ 2,550 px (was
5,260). The bottom bar shows Home selected; More carries the count 4.

---

## 8. Acceptance checks for Design QA (measurable)

1. Fonts: computed `font-family` of every visible text node starts with Geist or Geist Mono; no Newsreader, no Plex.
2. Colours: every computed background is one of the five surfaces, `--black`, `--primary`, a status-soft fill or an
   image; tungsten pixels appear only in the count, dots and badges listed in §3.1.
3. Radii: every computed `border-radius` is 0, 6, 8 (segmented option), 10, 14, 20 or ≥ 999.
4. Alignment: at 1440 every section head, card, tile and the marquee's left edge sits at x = 280 (± 0); every card
   in a row has the same top and height (± 0); button bottoms in a decision row align (± 0).
5. Marquee: no element overlaps the picture box; at 1440 the picture is 1120 × 630; at 390 the face box of the
   subject lies wholly inside the 4:5 crop with its top ≥ 0.
6. No outlined buttons (`border-width` 0 on every `.btn`); exactly one primary-filled button per region.
7. Names: every content name's left edge equals its frame's left edge (Arabic included).
8. Loading: no frame shows `--art-edge` grey without its image after `document.images` have completed; images fade
   (opacity transition 240 ms present).
9. Floors: no text under 12 px; coarse-pointer targets ≥ 44.
10. Contrast pairs of §3.1 hold (script of v5 §13.2, new values).
