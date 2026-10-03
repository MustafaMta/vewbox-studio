# Design system v4: Lights Down

Status: direction and specification for the full product redesign · written 2026-10-03 · product design.
Supersedes `docs/DESIGN-SYSTEM-V3.md` where the two differ. v3 stays the reference for three things v4 keeps
unchanged: the measured warm token ladder (§3.2–3.4 there), the Studio Company constellation (§9.1–9.3 there) and
the voice identity panel (§9.7 there).

Inputs read for this document:
- `docs/research/DESIGN-RESEARCH-2026-10.md`: its 12 decisions and its verdict on v3.
- `docs/DESIGN-SYSTEM-V3.md`, `docs/research/PRODUCT-DESIGN.md` and `docs/research/UX-STRATEGY.md`.
- `docs/CONTRACTS-IDENTITY-PACK.md` (v2: one canonical front full-body image) and `docs/CONTRACTS-VOICE-IDENTITY-V2.md`.
- `docs/AUDIT-CODEBASE.md`, sections D (misleading UI) and F (oversized modules).
- The code under `src/app/(app)/**`, `src/components/**`, `src/app/globals.css` and `src/app/layout.tsx`.
- 64 captures of the running app taken today: `docs/evidence/v4-audit-*.png` (index in §9).

---

## 0. The direction on one page

The producer asked for "a complete product redesign, not a CSS refresh". It should be premium, cinematic, minimal,
elegant and distinctive, and comfortable for long editing sessions. Every major page is to be purpose-built, and
all of them are to read as one system. Glow, glass, excessive gradients and generic admin dashboards are out.

**Lights Down** is the answer in one sentence: *the house dims so the work is lit.* The chrome is a warm, dark,
quiet room. The only light in it is the work (key art, posters, figures, footage) plus one ivory "projected"
light for the single next action. A small iris tally light shows that something is running.

The ten decisions:

1. **Three rooms, three surface recipes.**
   - *Lobby* is for browsing: catalogues and title pages. The art leads, and the hero alone may take a clamped tint
     from its artwork.
   - *Cutting room* is for editing: workspaces. The surround is achromatic, density is compact and geometry is
     precise.
   - *Theatre* is for screening: black, with only the film and its transport.

   The room is set on the page root (`data-room`) and drives the tokens (§2.3).
2. **Shape is identity, measured from the real assets.**

   | Content | Artwork shape |
   |---|---|
   | Shows | 16:9 key art |
   | Shorts | 2:3 poster beside a 16:9 cut |
   | Music Videos | 1:1 sleeve |
   | Characters | the full-length figure at its native **928:1664 (about 9:16)** |
   | Locations | plate with a 2.39:1 hero crop |
   | Screening | the cut's native ratio |

   The research proposed 2:3 for figures. The canonical frame is in fact 928×1664
   (`CANONICAL_FRAME`, `src/server/workflows/canonical-image.ts:130`), and a 2:3 frame produces the black bars seen
   today (V4-02).
3. **One route, two rooms, for every production.** The Overview of a Short, an Episode or a Music Video is a lobby
   with a hero. Opening any workspace tab (Story, Cast & World, Storyboard, Produce, Final cut) turns the same page
   into a cutting room: the hero folds into a 48 px slate header, the tint goes, and density becomes compact.
4. **Media components come before furniture.** The kit adds:
   - six heroes and seven tiles by ratio
   - the rail, the episode card, the cast row and the slate (metadata line)
   - the title card (a typographic placeholder)
   - the player family: inline, preview, theatre, compare, film strip and compact bar
   - the music transport and the lyric view
   - precision waveform and timeline parts

   Furniture (buttons, fields, dialogs) keeps v3's specification with corrections.
5. **Every page has one signature and its own empty state.** The empty state is a title card in the page's own
   shape and never repeats the lead (§6). The four identical catalogue templates go (V4-01).
6. **Kept from v3:**
   - the warm ladder and its contrast proof
   - the ivory primary, one per region
   - iris with four jobs
   - semantic status colours
   - no uppercase or tracking
   - honest placeholders and the notice anatomy
   - the motion tokens
   - the constellation and the voice panel
7. **Changed from v3:**
   - tone instead of borders on panels
   - no glass on content (the only blur is the theatre transport)
   - the sidebar one step dimmer, with a monochrome brand glyph
   - seek bars, waveforms, timelines and timecodes stay LTR in Arabic
   - two densities
   - a two-colour focus ring on imagery
   - 2 px precision radius in the cutting room
8. **Two type voices.** Inter and IBM Plex Sans Arabic stay for the interface. A *title voice*
   (`--font-title`) is used for content names only.
   - It ships today as Inter's display optical size (the bundled file exposes `opsz` 14–32, measured) with Plex
     Arabic 700.
   - A one-day spike then chooses between Markazi Text (OFL, bilingual), Newsreader with Amiri (both OFL), and
     Thmanyah Serif Display (licence to be confirmed) (§3.2).
9. **Navigation:**
   - The Screening Room returns to the sidebar.
   - Tablets get an 80 px rail.
   - Ctrl/⌘K opens a command palette.
   - Help & shortcuts sit in one place.
   - Every route gets its own `<title>` (V4-11).
   - `/library`, `/projects` and `/jobs` redirect.
10. **Delivery in parallel packages.**
    - First F0, a one-off enabling refactor: split the CSS and the i18n, and add fixture captures.
    - Then the foundation: F1 tokens, F2 kit, F3 media and players, F4 shell, plus B1 (backend presentation
      metadata).
    - Then the page groups:
      - P1 catalogue and detail pages, as P1a Shows, P1b Shorts and the cutting room, and P1c Music Videos
      - P2 Characters and Locations
      - P3 Studio Company, Production, Screening Room and Settings
    - Each package has exclusive file ownership and screenshot acceptance at 1440, 834 and 390 in EN and AR (§8).

### 0.1 What the product looks like today (captured 2026-10-03)

Pages were captured with `node scripts/capture-evidence.mjs --prefix v4-audit`:
- 18 routes at 1440 in EN and in AR
- 14 routes at 390 in EN and in AR

The studio held one character (Elias Moore, approved, with a voice job running) and no show, short, music video or
location.

Severity follows v3: **S1** blocks a task or fails WCAG AA; **S2** is off-direction or wrong; **S3** is polish.

| # | Finding | Sev | Evidence (`docs/evidence/`) |
|---|---|---|---|
| V4-01 | `/shows`, `/shorts`, `/music-videos` and `/locations` are the same page: a title, "No X yet." and a hint that repeats the lead word for word, then "+ Add X". | S2 | `v4-audit-shows-en-1440.png`, `v4-audit-music-videos-en-390.png`, `v4-audit-locations-en-1440.png` |
| V4-02 | The canonical figure is 928×1664 (≈ 9:16), but the profile frame and the directory tile are wider. The mid-grey studio backdrop therefore sits between two black pillars: on the profile the image is 350 px wide in a 420 px frame. | S2 | `v4-audit-characters-char-56c47abc59-en-1440.png`, `v4-audit-characters-en-1440.png`, `v4-audit-characters-ar-390.png` |
| V4-03 | On `/new`, the character start card crops the full-length figure into a torso strip (16:8). The other four cards show a grey icon on a gradient. | S3 | `v4-audit-new-en-1440.png` |
| V4-04 | The Screening Room has no navigation entry. | S2 | the sidebar in every capture |
| V4-05 | `/new` (`max-w-5xl`) and `/new/show` (`max-w-3xl`) are centred while every other page is start-aligned, so content jumps sideways (v3 finding E9, still open). | S3 | `v4-audit-new-en-1440.png`, `v4-audit-new-show-en-1440.png` |
| V4-06 | **Production shows raw engine exceptions in the main column:** "ComfyUI CLIPTextEncode #7 failed: RuntimeError: Failed to find C compiler…". It appears 3× under Failure classes and again in Activity. The empty copy points to "Projects", which is not in the navigation. | S2 | `v4-audit-production-en-1440.png` |
| V4-07 | **Settings is still the pre-v3 page:**<br>- raw model file names<br>- a workflow-hash paragraph<br>- a "Sample data" section that claims the studio starts with samples (AUDIT D2)<br>- a second Reliability table<br>- a centred column | S2 | `v4-audit-settings-en-1440.png` |
| V4-08 | The violet-gradient app tile is the most saturated object on every page. | S3 | all |
| V4-09 | **The characters directory carries the strongest admin-table signal in the app:**<br>- five bordered selects, a sort and a view toggle take two rows at 1440 and three on a phone<br>- on touch, the tile's "…" menu sits on the figure's boots | S2 | `v4-audit-characters-en-1440.png`, `v4-audit-characters-ar-390.png` |
| V4-10 | **Character profile:**<br>- the running voice job shows engine names ("VoxCPM2, from a description only"), in English inside the Arabic UI<br>- "Edit details" floats at the far end of the name row and wraps under the name on a phone<br>- the look facts are bold, right-aligned 13 px paragraphs, a heavy read | S2 | `…char-56c47abc59-en-1440.png`, `…-ar-1440.png`, `…-en-390.png` |
| V4-11 | **Every route is titled "Vewbox Studio" (WCAG 2.4.2 fails).** Only `src/app/layout.tsx` declares metadata; no `(app)` page renders a `<title>`. | S1 | code |
| V4-12 | "Saved on the studio server" shows whenever the first snapshot has loaded, including while writes are pending or failing (AUDIT D1). | S2 | the sidebar footer |
| V4-13 | The Studio Company constellation renders as intended in EN, AR and on a phone. **Keep it.** Only the bordered stage card changes. | — | `v4-audit-studio-en-1440.png`, `…-ar-1440.png`, `…-en-390.png` |
| V4-14 | The department page renders as v3 §9.2 intended. **Keep it.** | — | `v4-audit-studio-departments-CASTING-en-1440.png` |
| V4-15 | The creation wizard marks Auto Idea with a violet icon tile. "Your idea (optional)" is fine here, but the same label is wrong on character creation (UX-STRATEGY A7). | S3 | `v4-audit-new-show-en-1440.png`, `v4-audit-new-show-ar-390.png` |
| V4-16 | **Not capturable today:**<br>- the Show, Short, Music Video and Location detail pages<br>- the cutting-room tabs and the players<br><br>These specs come from the code and the research. Acceptance (§8) requires captures with the sample fixture studio. | — | — |

---

## 1. Visual identity

### 1.1 The idea

Before a film starts, the house lights go down. The room does not vanish; it recedes, warm and dark, until the only
light is the picture. Vewbox works the same way:

- **The house** is the chrome: a warm near-black (hue ≈ 40°, chroma ≤ 0.012) that never competes.
- **The projection** is ivory light, `#f3eee6`. It sets titles and the single next action, and it is the playhead
  that runs across footage. There is one ivory primary per region, and nothing else is that bright except the work.
- **The tally** is a small iris (`#a99ff5`), like the tally light on a camera that is live. It marks focus,
  selection, live work and link hover. Nothing else.
- **The work** is art, figures and footage. It is always the brightest and most colourful thing on screen.

The studio moves between three rooms, and each page declares which room it is:

| Room | What it is for | How it looks |
|---|---|---|
| **Lobby** | Choosing and presenting: catalogues, title pages, profiles | Generous, art-led, comfortable density. A hero may take a clamped tint from its own art. |
| **Cutting room** | Making and judging: Story, Storyboard, Produce, Final cut, shot pages | Achromatic canvas behind every frame, compact density, docked panels, 2 px precision geometry, no tint, no autoplay |
| **Theatre** | Watching: the Screening Room and full-screen players | Black surround; the chrome fades while the film plays |

### 1.2 Principles

Each principle has a test that a screenshot reviewer can apply.

1. **The work is the light.** In a squint test, the brightest region is the artwork, the footage or the one ivory
   primary. Never a panel, an icon tile or a badge.
2. **Shape is identity.** From the silhouette alone you can tell which content type a page belongs to (§0, decision
   2). No two content types share a hero.
3. **The room decides the surface.** Lobby, cutting room and theatre use the recipes in §2.3. Tint appears only in a
   lobby hero.
4. **One ivory, one tally.** At most one ivory primary per region. Iris appears only as a mark of 2 px or less, a
   dot, a ring or a progress fill.
5. **State lives under the picture, in words.**
   - Every picture is followed by a *slate*: kind · facts · status, last (§3.4).
   - Nothing is painted on art except the duration chip and the play disc, both on a solid chip.
6. **The unmade is a title card.**
   - Anything without art is set as type, in the title voice, in its own shape.
   - An empty studio looks like a cinema lobby before the posters arrive. It never looks like a grey box.
7. **Two scripts, one change of voice.** The interface voice is one family per script. The title voice changes
   register in Arabic and Latin together. Neither script uses uppercase or tracking for hierarchy.
8. **Motion is a cut, not a flourish.**
   - Frequent actions are instant.
   - Continuity motion (tile → hero, hero → slate header) is short and optional.
   - Nothing loops unless something is live.
9. **Precision where time is measured.** Frames, clips, takes, waveforms and timecodes use 2 px corners, 1 px gaps,
   boundaries of at least 3:1, and LTR in both languages.
10. **Nothing is only on hover.**
    - Every hover-revealed control also appears on focus and is always visible on touch.
    - Every drag has a pointer alternative and a keyboard path (WCAG 2.5.7, 1.4.13).

### 1.3 The vocabulary (used in code names and in this document)

| Term | Means | Code name |
|---|---|---|
| House | Chrome surfaces: sidebar, page ground, panels | `--bg`, `--surface`, … |
| Lobby / Cutting room / Theatre | The three rooms | `data-room="lobby\|cutting\|theatre"` |
| Projection | The ivory light | `--primary`, `.btn-primary`, playhead |
| Tally | The iris accent | `--accent`, `.tally` (the live dot) |
| Slate | The one-line metadata under a title or tile | `<Slate>` |
| Title card | The typographic placeholder in a content's own shape | `<TitleCard>` |
| Figure | A character's canonical full-length image | `<FigureTile>`, `<FigureHero>` |
| Sleeve | A music video's 1:1 song artwork | `<SleeveTile>`, `<SleeveHero>` |
| Plate | A location's master image | `<PlateTile>`, `<PlateHero>` |
| Still | A 16:9 frame that stands for an episode, a cut or a trailer | `<StillCard>` |
| Wash | The clamped art tint behind a lobby hero | `--art`, `--art-wash` |

### 1.4 What is distinctive about Vewbox

The references are consumer catalogues and professional editors. Vewbox is both at once, about work that is still
being made, in two scripts. That is where its identity comes from.

| Reference | What it does | What Vewbox takes | What is Vewbox's own |
|---|---|---|---|
| Netflix title page | Art-derived wash over the whole page; autoplaying trailer; red brand | The wash, *only* in the lobby hero, clamped to L 0.20 | Work-in-progress states in words under the art ("Storyboard · 12 of 20 frames"); no autoplay with sound, ever |
| Apple TV | Very large plain title over full-bleed art; light pill CTA | Scale contrast; ivory primary | A *bilingual* title voice in which Arabic and Latin change register together; the slate line |
| Spotify / Apple Music | 1:1 cover header, one big play target, track table with totals | The sleeve header and sections table for music | The Song ⇄ Video switch over one shared transport, and a lyric view with each singer's face on their lines |
| IMDb | Poster + trailer + counts in one band | The diptych for a single film | A film strip of every shot frame under the cut |
| DaVinci Resolve / Premiere | Grey, dense, docked panels, inspector | Docked panels, contextual inspector, precision geometry | Warm house around an achromatic canvas; the same page is lobby *and* cutting room |
| Linear 2026 | Warm greys, dimmer sidebar, borders felt not seen | All three | The constellation: a company you can watch working |

**Signature moves that no reference has:**
1. **The title card.** Unmade shows, shorts, songs, characters and places appear as typographic posters in their own
   shape and in the title voice. A new studio's catalogue already looks deliberate.
2. **The lobby that becomes a cutting room.** Pressing *Continue: Storyboard* folds the hero into a 48 px slate
   header and darkens the surround to neutral, on the same URL.
3. **The casting line-up.** Every character stands full length in the same 928:1664 frame on the same grey
   backdrop. Feet share a baseline and heads share an eye line, so the directory reads as a line-up, not a collage.
4. **The tally.** A single small iris light anywhere in the product means "the studio is working on this right now".
5. **The constellation.** The Studio Company, kept from v3.

### 1.5 What Lights Down refuses

These are refused anywhere, and each is a review blocker:
- **Glass on content:** `backdrop-filter` on chips, badges, cards or tiles. The theatre transport is the only
  exception (§5.12).
- **Light effects:** glow, halos, coloured shadows, inner highlights, `drop-shadow` on SVG.
- **Gradients beyond the two that are allowed:**
  - the **scrim** under text on art
  - the **art wash** behind a lobby hero

  Remove `TrackCover`'s radial colour field, `StartCard`'s `bg-gradient-to-br`, `VideoPlaceholder`'s violet radial
  and `.hero-plain`.
- **Shouting typography:** uppercase or letter-spacing as hierarchy, for example the uppercase artist line in
  `TrackCover`.
- **Dashboard furniture:** KPI tiles, zero-value counters, dashed empty boxes, boxes inside boxes.
- **Media behaviour:**
  - autoplay with sound
  - parallax, scroll-jacking, WebGL page transitions or infinite scroll
  - motion on tab switches or list selection
- **Unlabelled edit tools:** icon-only toolbars in the cutting room. Transport glyphs are the exception, and they
  carry names.
- **Engine internals in the product voice:** model names, file paths, hashes and raw exceptions. They belong behind
  *Details*, in `.mono`.
- **Browser dialogs:** `window.confirm` and `window.prompt`. There are 11 call sites in 9 files today (`grep`
  2026-10-03). `backdrop-filter`, `backdrop-blur`, `bg-gradient-to-*` and `radial-gradient` occur 14 times in 6
  files.

---

## 2. Tokens

### 2.1 `:root` (exact; lives in `src/app/styles/tokens.css` after F0)

Rules for the token sheet:
- Every v3 name keeps resolving. New names are marked `(new)`, and changed values say what they were.
- Tailwind utilities come from `@theme inline` (§2.2).
- Runtime values (`--art`, `--art-ph`, `--art-edge`) are set inline on the element that owns them, never on `:root`
  by script. Amendment (F2, 2026-10-03): `--sticky-extra` and `--bottom-bars` are the exception, because
  `scroll-padding` on `html` can only read them there. They are written on `<html>` as the sum of the contributions of
  whatever is shown (AnchorNav, CompactHeader, FormFooter, PlayerBar, ServerBar), through the kit's
  `useRootVarContribution`, never by a component directly.

```css
:root {
  color-scheme: dark;

  /* ── the house: v3's warm ladder, unchanged (hue ≈ 40°, chroma ≤ 0.012) ─────────────────────────── */
  --ink-1000: #070706;  /* media floor under browse pictures */
  --ink-975:  #090908;  /* sunken band (the company stage) */
  --ink-950:  #0d0c0b;  /* lobby ground */
  --ink-900:  #141312;  /* group tone; cutting-room frame and docked panels; dialogs */
  --ink-850:  #1a1917;  /* field fill; row and tile hover */
  --ink-800:  #22201e;  /* raised: menus, popovers, toasts, selected segment, nav current */
  --ink-700:  #2e2b28;  /* hairline (decorative only) */
  --ink-600:  #4a4640;  /* strong hairline; overlay edge */
  --ink-550:  #736c63;  /* control boundary, idle edge, unplayed waveform: ≥ 3:1 (§2.6) */
  --ink-500:  #625d55;  /* disabled text; dot separators */
  --ink-400:  #8f877b;  /* faint text */
  --ink-350:  #a39b8e;  /* (new) idle navigation text: one step under muted (Linear 2026) */
  --ink-300:  #ada597;  /* muted text */
  --ink-200:  #ddd6cb;  /* body text */
  --ink-100:  #f3eee6;  /* ivory: titles, the primary, the playhead */

  /* ── the screen: achromatic neutrals for anything judged by eye (new) ──────────────────────────── */
  --gray-1000: #000000; /* theatre surround */
  --gray-960:  #0b0b0b; /* cutting-room canvas (pasteboard) */
  --gray-850:  #262626; /* clip, take, strip-frame fill */
  --gray-500:  #8a8a8a; /* clip boundary, frame ticks */

  /* ── the tally: the one accent (unchanged) ─────────────────────────────────────────────────────── */
  --iris-600: #6c5fe0; --iris-500: #8b7ff0; --iris-400: #a99ff5; --iris-300: #cbc4fa;
  --violet-700: var(--iris-600); --violet-600: var(--iris-600); --violet-500: var(--iris-500);
  --violet-400: var(--iris-400); --violet-300: var(--iris-300);            /* legacy aliases, removed in Q1 */

  /* ── roles: surfaces ───────────────────────────────────────────────────────────────────────────── */
  --bg: var(--ink-950);  --sunken: var(--ink-975);  --media: var(--ink-1000);
  --surface: var(--ink-900);  --raised: var(--ink-900);  --raised-2: var(--ink-800);  --input: var(--ink-850);
  --frame: var(--ink-900);          /* (new) cutting room: the page and its docked panels */
  --canvas: var(--gray-960);        /* (new) cutting room: behind every frame under review */
  --surround: var(--gray-1000);     /* (new) theatre */
  --clip: var(--gray-850);          /* (new) precision objects: clips, takes, strip frames */
  --clip-edge: var(--gray-500);     /* (new) their boundary, 5.7:1 on --canvas */
  --page: var(--bg);                /* (new) the current room's ground; set by [data-room] (§2.3) */

  /* ── roles: lines ─────────────────────────────────────────────────────────────────────────────── */
  --line-soft: #211f1d;  --line: var(--ink-700);  --line-strong: var(--ink-600);  --line-field: var(--ink-550);

  /* ── roles: text ──────────────────────────────────────────────────────────────────────────────── */
  --fg: var(--ink-100);  --fg-body: var(--ink-200);  --fg-muted: var(--ink-300);  --fg-faint: var(--ink-400);
  --fg-nav: var(--ink-350);         /* (new) */
  --fg-disabled: var(--ink-500);
  --on-art: #ffffff;  --on-art-muted: var(--ink-200);
  --fg-on-art: var(--on-art);  --fg-on-art-muted: var(--on-art-muted);     /* v3 names */

  /* ── roles: action ────────────────────────────────────────────────────────────────────────────── */
  --primary: var(--ink-100);  --primary-hover: #ffffff;  --primary-active: #e4ded3;  --on-primary: var(--ink-950);
  --accent: var(--iris-400);        /* the tally: focus, selection marks, live work, link hover */
  --accent-strong: var(--iris-500); /* progress fill; checked radio and checkbox */
  --accent-soft: rgb(169 159 245 / 0.12);   /* selected list row tint only */
  --accent-line: rgb(169 159 245 / 0.50);
  --ring: var(--iris-400);
  --ring-art-inner: var(--ink-100); /* (new) two-colour ring on imagery: 2 px ivory inside … */
  --ring-art-outer: var(--gray-1000);/* (new) … 2 px black outside */
  --select-precise: var(--ink-100); /* (new) selected clip, take or frame: a 2 px ivory outline, never a fill */

  /* ── roles: status (semantic only; unchanged) ─────────────────────────────────────────────────── */
  --ok: #62c995;   --ok-soft: rgb(98 201 149 / 0.12);
  --warn: #e2b55f; --warn-soft: rgb(226 181 95 / 0.12);
  --bad: #f07f74;  --bad-soft: rgb(240 127 116 / 0.12);
  --info: var(--accent); --info-soft: var(--accent-soft);
  --gold: var(--warn); --gold-soft: var(--warn-soft); --gold-text: var(--warn);   /* legacy aliases, removed in Q1 */
  --teal: var(--accent); --teal-soft: var(--accent-soft);
  --edge: var(--ink-550); --edge-lit: var(--accent); --edge-wait: var(--warn); --edge-bad: var(--bad);

  /* ── art (runtime, per element; neutral defaults) (new) ───────────────────────────────────────── */
  --art: var(--page);               /* clamped dominant colour of the hero art: oklch(0.20 min(C,0.045) H) */
  --art-ph: var(--input);           /* image placeholder: oklch(0.24 min(C,0.045) H) */
  --art-edge: var(--media);         /* letterbox fill = the image's own border colour */
  --wash-end: 420px;                /* the wash reaches --page this far below the hero top */
  /* the wash ("--art-wash" in this document) is painted by .hero::before (below), not declared here: a custom
     property that references --art resolves where it is declared, so one on :root would never see the hero's --art */
  --chip-on-art: rgb(7 7 6 / 0.78); /* duration chip, play disc ground, selected check: solid, never blurred */
  --scrim-bottom: linear-gradient(0deg, rgb(13 12 11 / 0.92) 0%, rgb(13 12 11 / 0.86) 30%, rgb(13 12 11 / 0) 72%);
  --scrim-start: linear-gradient(90deg, rgb(13 12 11 / 0.92) 0%, rgb(13 12 11 / 0.86) 36%, rgb(13 12 11 / 0) 66%);

  /* ── elevation: tone first, shadow only for overlays (§4.6) ───────────────────────────────────── */
  --overlay: rgb(5 5 4 / 0.74);
  --shadow-1: none; --shadow-2: none;
  --shadow-3: 0 24px 64px -16px rgb(0 0 0 / 0.80), 0 0 0 1px var(--line-strong);      /* menus, dialogs, sheets, toasts */
  --shadow-float: 0 12px 32px -12px rgb(0 0 0 / 0.75), 0 0 0 1px var(--line-strong);  /* (new) player bar, floating tool row */
  --halo-violet: none; --halo-gold: none; --halo-teal: none;                          /* removed in Q1 */

  /* ── shape ────────────────────────────────────────────────────────────────────────────────────── */
  --r-precise: 2px;                 /* (new) clips, takes, strip frames, timeline selections */
  --r-1: 6px; --r-2: 8px; --r-3: 12px; --r-4: 16px; --r-media: 8px; --r-pill: 999px;

  /* ── motion (§4.8) ────────────────────────────────────────────────────────────────────────────── */
  --t-fast: 120ms; --t: 200ms; --t-slow: 320ms; --t-media: 480ms; --t-travel: 1200ms;
  --t-exit-fast: 90ms; --t-exit: 150ms; --t-exit-slow: 200ms;       /* (new) exits always shorter than entries */
  --t-lights: 600ms; --t-idle: 2000ms;                               /* (new) theatre lights-down fade; idle delay */
  --ease: cubic-bezier(0.16, 1, 0.3, 1);                             /* enter: decelerate */
  --ease-in: cubic-bezier(0.3, 0, 0.8, 0.15);                        /* exit: accelerate (was 0.7,0,0.84,0) */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);                       /* (new) in-place state changes */
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);                      /* crossfades, travel */

  /* ── type (§3) ────────────────────────────────────────────────────────────────────────────────── */
  --font-ui: var(--font-inter, 'Inter'), var(--font-plex-arabic, 'IBM Plex Sans Arabic'), ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
  --font-title-latin: var(--font-inter, 'Inter');                    /* swapped by the title spike (§3.2) */
  --font-title-arabic: var(--font-plex-arabic, 'IBM Plex Sans Arabic');
  --font-title: var(--font-title-latin), var(--font-title-arabic), var(--font-ui);
  --title-weight: 600; --title-weight-ar: 700; --title-tracking: -0.03em;
  --font-mono: ui-monospace, 'Cascadia Mono', SFMono-Regular, Menlo, Consolas, monospace;

  /* ── layout (§4) ──────────────────────────────────────────────────────────────────────────────── */
  --sidebar-w: 240px; --rail-w: 80px; --mobilebar-h: 56px;
  --compact-h: 48px; --tabs-h: 44px; --playerbar-h: 64px;
  --content-max: 1280px; --bleed-max: 1680px;
  --measure-lead: 64ch; --measure-prose: 68ch; --measure-form: 720px;
  --gutter: 16px; --section: 40px; --rail-gap: 16px;
  --sticky-top: var(--mobilebar-h); /* the bar that is always on top at this width */
  --sticky-extra: 0px;              /* set by a page while its compact header and/or sticky tabs are stuck */
  --bottom-bars: 0px;               /* set by a page while a player bar or sticky form footer is shown */

  /* ── density (§4.7) ───────────────────────────────────────────────────────────────────────────── */
  --control-h: 40px; --control-h-sm: 32px; --row-h: 48px; --body-fs: 14px; --body-lh: 22px; --gap-section: var(--section);

  /* ── layers ───────────────────────────────────────────────────────────────────────────────────── */
  --z-raised: 10; --z-sticky: 20; --z-compact: 30; --z-playerbar: 35; --z-nav: 40; --z-overlay: 50; --z-toast: 60; --z-skip: 70;
}
@media (min-width: 640px)  { :root { --gutter: 24px; --rail-gap: 24px; } }
@media (min-width: 768px)  { :root { --sticky-top: 0px; } }                    /* rail beside, no top bar */
@media (min-width: 1024px) { :root { --gutter: 40px; --section: 48px; } }
@media (max-width: 639px)  { :root { --wash-end: 280px; } }
@media (pointer: coarse)   { :root { --control-h-sm: 40px; } }

/* density: the cutting room defaults to compact (Settings › Interface can choose comfortable) */
[data-density='compact'] { --control-h: 32px; --control-h-sm: 28px; --row-h: 36px; --body-fs: 13px; --body-lh: 20px; --gap-section: 24px; }
@media (pointer: coarse) { [data-density='compact'] { --control-h: 44px; --control-h-sm: 40px; } }
html[dir='rtl'] [data-density='compact'] { --body-fs: 14px; --body-lh: 22px; }  /* Arabic never below 13 */

/* more contrast: Settings › Interface › Contrast, or the OS (Spectrum "dynamic contrast", M3 contrast levels) */
html[data-contrast='more'] { --fg-muted: var(--ink-200); --fg-faint: var(--ink-300); --fg-nav: var(--ink-200); --line-field: var(--ink-400); --line: var(--ink-600); --line-soft: var(--ink-700); }
@media (prefers-contrast: more) { html:not([data-contrast='standard']) { --fg-muted: var(--ink-200); --fg-faint: var(--ink-300); --fg-nav: var(--ink-200); --line-field: var(--ink-400); --line: var(--ink-600); --line-soft: var(--ink-700); } }

/* sticky bars never hide the focused element (WCAG 2.4.11) */
html { scroll-padding-block-start: calc(var(--sticky-top) + var(--sticky-extra) + 16px); scroll-padding-block-end: calc(var(--bottom-bars) + 16px); }

/* the art colour may animate when a hero changes (season switch); instant under reduced motion */
@property --art { syntax: '<color>'; inherits: true; initial-value: #0d0c0b; }
/* the wash is its own layer so it can run past the hero's lower edge into the page without a seam */
.hero { position: relative; isolation: isolate; transition: --art var(--t-media) var(--ease-inout); }
.hero::before { content: ''; position: absolute; inset-inline: 0; inset-block-start: 0; block-size: max(100%, var(--wash-end));
  background: linear-gradient(180deg, var(--art) 0, var(--page) var(--wash-end)); z-index: -1; pointer-events: none; }
```

### 2.2 `@theme inline` additions

Add these alongside v3's list:
- **Colours:** `--color-ink-350`, `--color-gray-1000`, `--color-gray-960`, `--color-gray-850`, `--color-gray-500`,
  `--color-frame`, `--color-canvas`, `--color-surround`, `--color-clip`, `--color-clip-edge`, `--color-nav`,
  `--color-on-art`, `--color-chip-on-art`, `--color-art-ph`.
- **Radius:** `--radius-precise`.
- **Shadow:** `--shadow-float`.
- **Fonts:** `--font-title: var(--font-title)` (utility `font-title`) and `--font-mono`.
- **Breakpoint:** `--breakpoint-3xl: 100rem` (1600 px; media-query `rem` is always 16 px, whatever the 14 px root).

Remove these from `@theme` in Q1, once no component uses them:
- `--color-elev`, `--color-surface-2`, `--color-surface-3`
- the gold and teal names
- `--color-violet-*`

### 2.3 Surface recipes: the three rooms

**How a page declares its room.** A page renders `<Room value="lobby|cutting|theatre">` (F4). F4 sets `data-room`
on the shell's content column (the parent of `<main>`), so the ground fills the column edge to edge and not just the
padded content box. The navigation keeps `--bg` in the lobby and the cutting room, and fades in the theatre (§4.8).
Nested regions may override the room: a lobby page can hold an inline player whose frame is `--media`.

```css
[data-room='lobby']   { --page: var(--bg); background: var(--page); }
[data-room='cutting'] { --page: var(--frame); background: var(--page); --art: var(--page); --wash-end: 0px; }  /* tint impossible */
[data-room='theatre'] { --page: var(--surround); background: var(--page); --art: var(--page); }
[data-room='cutting'] .viewer, [data-room='cutting'] .canvas { background: var(--canvas); }
```

| | **Lobby** (browse) | **Cutting room** (edit) | **Theatre** (screen) |
|---|---|---|---|
| Pages | Catalogues; Show page; the Overview of Short, Episode and Music video; Character profile; Location page; Studio Company, department and agent pages; Production; Settings; Files | The Story, Cast & World, Storyboard, Produce, Song & Lyrics, Performers, Visual story and Final cut tabs; shot pages | The Screening Room "Now screening" area; any player in fullscreen |
| Ground | `--bg` | `--frame` (warm `--ink-900`, one step up, so the canvas reads as a recess) | `--surround` (#000) |
| Groups | Tone `--surface`, **no border**, radius 12 | Docked panels on `--frame`, headers `--input`; separated by the canvas recess or a 1 px `--line-soft` splitter | — |
| Viewer | `--media`, radius 8 (inline) | `--canvas` (achromatic), radius 0, native ratio | `--surround`, native ratio, letterbox and pillarbox in black |
| Overlays | `--raised-2` + `--shadow-3` | Same; floating tools `--raised-2` + `--shadow-float` | Transport on `rgb(0 0 0 / .55)` + `backdrop-filter: blur(12px)`, the **only** blur in the product; solid `--chip-on-art` under `prefers-reduced-transparency` |
| Lines | Hairlines only between list rows (`--line-soft`); `--line-field` on controls | Clip edges `--clip-edge`; panel splitters `--line-soft` | None |
| Density | Comfortable | Compact (default) | — |
| Art tint | **Hero only**, clamped (§2.4) | Never | Never |
| Autoplay | Muted hero preview, opt-out, ≤ 15 s, once (§4.8) | Never | On request only |
| Ivory | One primary per region; titles | The header primary; the playhead; the selection outline. **No ivory fill larger than a button next to the viewer** | Play/pause |
| Iris | Focus, selection, live, link hover | The same, plus the playhead handle | Focus; note ticks |

**The figure exception.** The Character profile is a lobby page, but its figure is under the producer's approval.
Grading-room practice says no tinted surround around an image being judged, so the profile uses the lobby recipe with
**no tint**. The frame takes `--art-edge`, the image's own backdrop grey, so the figure sits on a seamless field.

### 2.4 Artwork tint, placeholders and image presentation

**Data (B1, server; computed once at ingest, backfilled for existing assets).** A new `assets.presentation` jsonb
column holds:

```ts
interface Presentation {
  dominant?: string;       // 'oklch(L C H)', unclamped
  edge?: string;           // mean colour of a 4 px border ring: letterbox fill and figure-frame field
  lightBackdrop?: boolean; // edge luminance > 0.8
  focal?: { x: number; y: number };                            // 0–1, default {0.5, 0.4}; set or nudged at approval
  faceBox?: { x: number; y: number; w: number; h: number };    // 0–1, figures only (§5.5 FaceCircle)
}
```

**Extraction of `dominant`:**
1. Downscale to 16×16 by area average.
2. Convert each pixel to OKLCH. Drop near-white (L > 0.92), near-black (L < 0.12) and greys (C < 0.02).
3. Bucket the rest into 24 hue buckets, weighted by chroma. Take the heaviest bucket and average it in OKLab.
4. If fewer than 8 pixels survive, store nothing. The hero is then neutral, which is correct for grey studio
   backdrops.

**Use (client).** One helper owns this: `artVars(asset)` in `src/studio/presentation.ts` (B1). It returns
`{ '--art': 'oklch(0.20 C′ H)', '--art-ph': 'oklch(0.24 C′ H)', '--art-edge': edge }`, where C′ = min(C, 0.045).

**Where the tint may appear:**
- **Allowed:** as the `--art-wash` behind a lobby hero, and only in these four heroes:
  - the Show page (from the key art)
  - the Short Overview (from the poster)
  - the Music video page (from the sleeve)
  - the Location page (from the master plate)
- **Forbidden:**
  - the Character profile (figure under approval)
  - the Studio Company, department and agent pages
  - Production, the Screening Room and Settings
  - every cutting-room tab
  - chrome, buttons, borders, tiles, text, focus rings and status colours

**Proof.** At L 0.20, C 0.045, the worst hue gives `--fg` 15.5:1, `--fg-body` 12.4:1, `--fg-muted` 7.3:1 and
`--fg-faint` 5.0:1 (§2.6). Every text role stays AA on any wash.

**Placeholders.**
- Every picture frame paints `--art-ph` (or `--input` when unknown) until the image decodes, then crossfades in
  `--t-media`. This replaces the grey shimmer for any image whose asset is known.
- A frame with no image at all is a **title card** (§5.5), never a skeleton.

**Letterboxing.**
- A picture whose ratio differs from its frame is shown with `object-fit: contain` on `--art-edge`, never on black
  bars beside a grey backdrop (V4-02).
- Video is the exception. It always letterboxes on `--media`, `--canvas` or `--surround` (Apple HIG, "Playing video").

**Light-backed images.**
- If `lightBackdrop` is true, lobby tiles and lobby heroes present the image at `filter: brightness(0.9)`.
- Never in the cutting room, the theatre or on an approval card, where the producer must judge the true pixels.
- Today's canonical prompt already asks for "plain neutral mid-grey studio background", and the Elias Moore capture
  confirms it, so the flag will rarely be set for new figures. It matters for uploaded references and legacy portraits.

**Focal crops.** `object-position: calc(focal.x * 100%) calc(focal.y * 100%)`. Crops are deterministic:
- 21:9 Show heroes at ≥ 1280
- 2.39:1 Location heroes
- the 16:9 plate tiles taken from 1344×768 (7:4) plates
- face circles

No crop is ever generated by a model.

### 2.5 Where colour may appear

| Colour | Allowed | Forbidden |
|---|---|---|
| Ivory `--primary` | One primary button per region<br>The hero play disc of a music video (it *is* that region's primary)<br>Titles<br>The playhead<br>The 2 px selection outline in the cutting room<br>The inner ring on imagery | Panels, large fills next to a viewer, icons as decoration |
| Iris `--accent` | Focus ring<br>Tab underline (2 px) and nav current marker (2 × 16 px)<br>Selected choice tile (1.5 px) and checked controls<br>Progress fill<br>The tally (live dot)<br>Lit handoff edges, the playhead handle and the seek fill in edit, note ticks<br>Link-hover underline | Eyebrows, badges, button fills, icon tiles (the Auto Idea tile, V4-15), card tints, halos, gradients, the brand glyph in-product |
| `--ok`, `--warn`, `--bad` | Status dots and words<br>The 2 px rule of a notice<br>Edge states<br>Field errors | Decoration, skills and tools, selection |
| Art colour | `--art-wash` behind four lobby heroes; `--art-ph` placeholders | Everything else |
| Brand violet (the gradient mark) | Favicon, loading splash, sign-in, onboarding | The product UI. The sidebar uses a monochrome ivory glyph on `--raised-2` (V4-08). |
| Gradients | `--scrim-bottom` and `--scrim-start` under text on art; `--art-wash` | Everything else |

### 2.6 Contrast (measured)

Measured on 2026-10-03 with the WCAG 2.x relative-luminance formula. The script is in the session scratchpad
(`contrast.mjs`): OKLCH → sRGB for the wash, and alpha compositing for chips and scrims.

| Pair | Ratio | Needs | Note |
|---|---|---|---|
| `--fg` on bg / surface / input / raised-2 / canvas | 16.92 / 16.07 / 15.21 / 14.06 / 17.04 | 4.5 | |
| `--fg-body` on bg / raised-2 / canvas | 13.55 / 11.25 / 13.64 | 4.5 (HIG goal 7) | body ≥ 7 everywhere |
| `--fg-muted` on bg / raised-2 | 8.01 / 6.65 | 4.5 | |
| `--fg-nav` (new) on bg / raised-2 | 7.11 / 5.90 | 4.5 | dimmer sidebar still AA |
| `--fg-faint` on bg / surface / input / raised-2 | 5.51 / 5.23 / 4.95 / 4.58 | 4.5 | never on anything lighter than `--raised-2` |
| iris `--accent` on bg / raised-2 / canvas | 8.34 / 6.93 / 8.40 | 3 (marks), 4.5 (text) | |
| `--ok` / `--warn` / `--bad` on surface | 9.11 / 9.73 / 7.06 | 4.5 | |
| warn text on warn-soft over surface | 7.84 | 4.5 | |
| `--on-primary` on ivory | 16.92 | 4.5 | |
| `--line-field` on bg / input / raised-2 | 3.77 / 3.39 / 3.13 | 3 (1.4.11) | |
| Unplayed waveform `--ink-550` on bg / surface | 3.77 / 3.58 | 3 | v3's `--ink-600` measured **2.09**: fails |
| Played (`--fg`) vs unplayed (`--ink-550`) | 4.49 | 3 | |
| Clip edge `--clip-edge` on canvas / vs clip fill | 5.70 / 4.16 | 3 | |
| Selected outline ivory vs clip fill | 12.43 | 3 | |
| Playhead ivory on canvas | 17.04 | 3 | |
| Two-colour ring: black outer vs white art / ivory inner vs black | 21.0 / 18.18 | 3 (2.4.13) | One of the two rings always passes. Iris alone on white art is 2.34, which fails. |
| Chip `--chip-on-art` (78 % `#070706`) over pure white art: white text / ivory text | 10.78 / 9.33 | 4.5 | the worst case is white art; over grey art it is 15.5 |
| Hero text over `--scrim-*` at 0.86 coverage on pure-white art: fg / body / muted | 11.73 / 9.39 / 5.55 | 4.5 | **Rule:** the hero text block sits where the scrim is ≥ 0.86. On art, use `--fg`/`--fg-body`, never `--fg-faint`. |
| Same at 0.72 coverage: muted | 3.30 | — | fails, so the scrim stops are fixed at 0.92/0.86 |
| Wash at L 0.20, C 0.045, worst hue: fg / body / muted / faint | 15.49 / 12.40 / 7.33 / 5.04 | 4.5 | |
| Placeholder L 0.24, worst hue: fg / faint | 14.03 / 4.57 | 4.5 | title-card text uses `--fg-faint` or brighter |
| More contrast: faint→muted on raised-2 / muted→body on raised-2 / field→ink-400 on input | 6.65 / 11.25 / 4.95 | — | |
| Disabled text on raised-2 | 2.49 | exempt | Disabled controls always carry their reason as text beside them |

---

## 3. Typography

### 3.1 Faces

| Voice | Latin | Arabic | Status (checked 2026-10-03) |
|---|---|---|---|
| **Interface** (all UI) | Inter variable, bundled as `src/app/fonts/InterVariable.woff2`. The file's `fvar` table was measured: **`opsz` 14–32**, **`wght` 100–900**. | IBM Plex Sans Arabic 400/500/600/700, bundled as TTF | Both licences ship beside the files (`LICENSE-Inter.txt`, `LICENSE-IBMPlexSansArabic.txt`), both OFL. Already in use. |
| **Title**, default (ships in F1) | Inter at `font-variation-settings: 'opsz' 32` (Inter Display's optical size), weight 600, −0.03em | Plex Sans Arabic 700, tracking 0 | Verified: no new file |
| **Title**, chosen by the spike (§3.2) | one of T1–T3 | the same family, or its pair | see §3.2 |
| **Mono** | system mono stack (`--font-mono`) | — (numbers and ids are Latin in both locales) | — |

Rules carried from v3: one interface family per script; no light weights (below 400); no uppercase or tracking as
hierarchy; Western digits in both locales; Arabic never below 13 px; Arabic line heights about 15–20 % taller.

Font files are served from this origin only (no font service). Do not subset or rename the OFL files ourselves:
IBM Plex declares a Reserved Font Name (`LICENSE-IBMPlexSansArabic.txt`, line 1: "with Reserved Font Name 'Plex'").
Use upstream WOFF2 builds where they exist; F1 checks this.

### 3.2 The title voice: candidates and the spike

**What it is for.** The title voice sets **content names only**: show, short, music video, song, character and
location names in heroes, title cards and the theatre's "Now screening". It never sets UI labels, buttons, headings
of sections, tabs, numbers or body copy. Everything reads `var(--font-title)`, so the choice is one token change.

| # | Faces | Licence (verified 2026-10-03 unless noted) | Character | Must be verified before shipping |
|---|---|---|---|---|
| T0 (ships now) | Inter opsz 32 + Plex Sans Arabic 700 | Bundled, OFL | Distinctive by scale only, as Apple TV is | Nothing. This is the fallback if the spike finds nothing better. |
| **T1** (spike first) | **Markazi Text**: one family. Arabic by Borna Izadpanah, Latin by Florian Runge, under the design direction of Fiona Ross. Variable `wght` 400–700; subsets Arabic, Latin, Latin Ext. | **OFL.** `OFL.txt` and `METADATA.pb` (license OFL) in `google/fonts/ofl/markazitext`. | Naskh-inspired, moderate contrast, compact. The two scripts were designed together, so they change register as one. | It is a *text* design. At 48–64 px, check that it looks crafted and not bookish. Check its Latin x-height against Inter in the same hero, and diacritic clearance at 52/72. Measure the WOFF2 size (budget ≤ 160 KB). |
| T2 | **Newsreader** (Latin; variable `opsz` 6–72 and `wght`) with **Amiri** (Arabic; 400 and 700) | **OFL**, both (`google/fonts/ofl/newsreader`, `…/amiri`) | Newsreader's display optical size gives real contrast at 64 px. Amiri is classical Naskh. | Two designers: check that the pair reads as one register. Amiri has no 600, so use 700 at hero sizes and 400 in title cards. Amiri's tall ascenders need line height ≥ 1.5 (Arabic hero 52/80). |
| T3 | **Thmanyah Serif Display** (bilingual) | **Not verified.** Thmanyah's help-centre article says the font is free for personal and commercial use, "including websites and apps". It also says the font may not be modified, renamed, redistributed, uploaded or hosted for download. The download is email-gated, and the licence page itself could not be read (404 in the research session; search summary only). | The most distinctive option: a display serif drawn for both scripts | Written confirmation of two points: that self-hosting the WOFF2 inside a web app counts as "use in a website/app" and not "hosting it for download"; and that converting or subsetting the font is not "modification". It is not bundled until both are confirmed. |

**Spike protocol.** One designer and the F1 engineer, one day.
1. Override `--font-title-latin` and `--font-title-arabic` per candidate in a local stylesheet.
2. Capture four screens in each candidate at 1440 and 390, EN and AR:
   - the Show hero
   - the Character profile header
   - the Music video sleeve header
   - the Shows catalogue with title cards
3. Choose by these criteria, in order:
   1. Arabic diacritics clear at hero size.
   2. Both scripts read as one register.
   3. Titles never look like buttons or UI.
   4. File size.
   5. Licence verified.

The recommended order is T1, then T2, then T3, and T3 only after its licence is confirmed. Record the decision as an
amendment to this section.

### 3.3 Scale

Sizes are px; Latin and Arabic are listed side by side.

| Class | Latin size / line / weight / tracking | Phone (Latin) | Arabic | Phone (Arabic) | Face | Use |
|---|---|---|---|---|---|---|
| `.t-hero` | 64 / 64 / `--title-weight` / −0.03em | 40 / 44 | 52 / 72 / `--title-weight-ar` | 34 / 50 | title | Show and Short heroes; theatre "Now screening" |
| `.t-hero-sm` | 48 / 52 / title / −0.025em | 34 / 38 | 40 / 60 | 30 / 46 | title | Music video (song title), Character name, Location name |
| `.t-card-lg` | 24 / 28 / title / −0.02em | 20 / 24 | 22 / 34 | 19 / 30 | title | Title card in a 16:9 tile ≥ 320 px wide; empty-state cards |
| `.t-card` | 18 / 22 / title / −0.015em | 16 / 20 | 17 / 28 | 15 / 24 | title | Title card in poster, sleeve, figure and still tiles |
| `.display-xl` | 40 / 44 / 500 / −0.025em | 30 / 34 | 36 / 52 / 600 | 28 / 42 | UI (opsz auto) | Page titles with no art: Studio Company |
| `.page-title` | 30 / 36 / 500 / −0.02em | 26 / 32 | 28 / 42 / 600 | 24 / 38 | UI | All other art-less page titles |
| `.h2` | 20 / 28 / 600 / −0.01em | 18 / 26 | 19 / 30 / 600 | 18 / 28 | UI | Sections, dialog titles, the inspector title, rail headings |
| `.h3` | 16 / 22 / 600 | same | 16 / 26 / 600 | same | UI | Row and node names; card titles in panels |
| `.tile-title` | 15 / 20 / 600 (key-art tiles 16 / 22) | same | 15 / 24 / 600 | same | UI | Names under tiles |
| `.lead` | 16 / 26 / 400, muted, 64ch | 15 / 24 | 16 / 28 | same | UI | The one purpose line; hero loglines |
| body | 14 / 22 / 400, body | same | 15 / 26 | same | UI | Everything |
| body (compact) | 13 / 20 | same | 14 / 22 | same | UI | The cutting room |
| `.prose-copy` | 15 / 26, 68ch | same | 16 / 30 | same | UI | Synopses, personality, bible |
| `.lyric` | 20 / 32 / 400; active 600 | 17 / 28 | 22 / 38 | 19 / 32 | UI | The lyric view (§5.13) |
| `.slate` | 13 / 20 / 400, muted (on art: on-art-muted) | same | 14 / 22 | same | UI | Metadata lines (§3.4) |
| `.text-sm` | 13 / 20 | same | 14 / 22 | same | UI | Meta, rows |
| `.caption` | 12 / 16 / 500, faint | same | 13 / 20 | same | UI | Hints, timestamps, the "Episode 3" label |
| `.label` | 13 / 18 / 500, body | same | 14 / 20 | same | UI | Field labels |
| `.eyebrow` | 12 / 16 / 500, muted, sentence case | same | 13 / 20 | same | UI | Kind line on art-less pages; never on heroes, where the slate is used |
| `.tc` | 12.5 / 18, tabular, `dir="ltr"` | same | same (Latin) | same | mono | Timecodes `00:01:12:08`, ids inside *Details* |

Further rules:
- **Wrapping and clamping.** Titles use `text-wrap: balance` and prose uses `text-wrap: pretty`. Hero titles clamp at
  3 lines, tile titles at 2. Names never break mid-word (`overflow-wrap: break-word`, as v3).
- **One language per title.** A second-language name is a quiet line under the title: `.text-sm` muted, with its
  own `lang` and `dir`. It is never inside the same heading.
- **The title voice in RTL.** It uses `--title-weight-ar` and tracking 0. Never apply negative tracking to Arabic.

### 3.4 The slate (metadata line)

A slate is one line of facts, in a fixed order, separated by `·` in `--ink-500` (`aria-hidden`):

> **kind · year · count · runtime · style · language · status**

Status always comes last, as a dot plus a word. Missing facts are dropped; there is never a "—". On desktop a slate
is one line; on a phone it may wrap, but never mid-item. In Arabic the logical order is the same, so it reads from
the right.

| Context | Example (EN) |
|---|---|
| Show hero | Show · 2026 · 2 seasons · 14 episodes · Cartoon · Arabic (Iraqi) · ● Waiting for you |
| Show tile | 2 seasons · 14 episodes · Cartoon · ● 1 waiting for you |
| Episode card | Episode 3 · 6 min · ● Storyboard · 12 of 20 frames |
| Short hero | Short · 2026 · 6 min · Anime · Arabic (Iraqi) · ● Producing · shot 7 of 20 |
| Music video hero | Music video · 2026 · 3:42 · 8 sections · 24 shots · ● Final cut ready |
| Character profile | Character · Cartoon · English · ● Draft — awaiting your approval |
| Character tile | ● Approved · Voice · English |
| Location hero | Location · Interior · Cartoon · Day · Dusk · Night · In 3 productions |
| Cut (screening) | Short · 6:12 · Cut 4 · 2 days ago · ● Approved |

Sizes: hero 13/20 (`--on-art-muted` on scrim, `--fg-muted` off art), tile 12/16 faint, compact header 12/16 muted.
The status item uses `<StateWord>` (§5.10).

### 3.5 Numbers, time and mixed scripts

**Durations and time:**
- Runtimes are "49 min" or "6 min". Under a minute they are "45 s".
- Track and cut lengths are "3:42".
- Timecodes are `00:01:12:08` in `.tc`, always LTR.
- Elapsed job time is "2 min 10 s".

**Counts and labels:**
- Use the existing plural helper in `T`: 2 forms in English and the 6 CLDR forms in Arabic (AUDIT G3).
- Episode labels: "Episode 3" and "الحلقة 3"; "Season 1 · Episode 3" and "الموسم 1 · الحلقة 3". "S1 · E3" is
  allowed only in EN compact contexts.

**Language of parts (3.1.2):**
- Content of unknown language gets `dir="auto"` and `lang` when it is known: names have `lang="ar"` if `nameAr`.
- Mixed lines are isolated (`<bdi>` or `unicode-bidi: isolate`).
- Brand and engine names never appear in user-facing copy (§1.5).

---

## 4. Layout, spacing, shape, elevation, motion

### 4.1 Breakpoints and the shell

v4 keeps the Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536) and adds `3xl` 1600. The
shell and pane rules follow the Material 3 classes, mapped onto those breakpoints.

| Class | Width | Shell | Lobby panes | Cutting-room panes | Acceptance width |
|---|---|---|---|---|---|
| Phone | < 640 | Top bar 56 + menu sheet | 1 | 1. The inspector is a bottom sheet; shot list and canvas switch by tabs. | **390** |
| Large phone | 640–767 | Top bar 56 + sheet | 1 | 1 | — |
| Tablet | 768–1023 | **80 px navigation rail** (icon over label) | 1 (2 only for low-density list-detail, e.g. the Settings section nav) | 1 + the inspector as an end drawer (M3: "Don't use two panes in medium layouts with high information density") | **834** |
| Desktop | 1024–1279 | 240 px sidebar; in the cutting room it auto-collapses to the 80 px rail | 1–2 | 2: canvas + inspector; the shot list is a drawer | — |
| Wide | 1280–1599 | 240 sidebar (rail in the cutting room; Ctrl/⌘ \\ toggles) | 2 (main 8 + aside 4) | 3: shot list 280 · canvas · inspector 320 | **1440** |
| Ultra | ≥ 1600 | 240 sidebar | 2; heroes and rails bleed up to 1680 | 3 | — |

Content widths at the three acceptance widths are used in every grid table below:

| Width | Content width | Arithmetic |
|---|---|---|
| 1440 | **1120 px** | 1440 − 240 − 2 × 40 |
| 834 | **706 px** | 834 − 80 − 2 × 24 |
| 390 | **358 px** | 390 − 2 × 16 |

### 4.2 Grid, column and bleed

- **Column.** Start-aligned, max `--content-max` (1280), padded by `--gutter`.
  - There are no centred pages (fixes V4-05).
  - Forms limit their own measure (`--measure-form`, 720) inside the start-aligned column.
- **Grid.**

  | Breakpoint | Columns | Gutter |
  |---|---|---|
  | Desktop | 12 | 24 |
  | Tablet | 8 | 24 |
  | Phone | 4 | 16 |

  Detail pages put the main column on 8 and the aside on 4 at ≥ 1280, and stack below that.
- **Bleed.**
  - Heroes and rails use `.bleed`: `margin-inline: calc(-1 * var(--gutter))`, extended to the viewport end edge,
    capped at `--bleed-max`.
  - Text inside a bleed realigns to the column start (`padding-inline: var(--gutter)`).
  - A rail's first tile aligns with the column start, and the rail scrolls out to the viewport edge with the next
    tile partly visible.
- **The cutting room** uses the full width with no max.

### 4.3 Catalogue grids (deterministic columns)

Catalogues use `grid-template-columns: repeat(var(--cols), minmax(0, 1fr))`, with `--cols` set per breakpoint. They
do not use `auto-fill`, so column counts are predictable and screenshot acceptance is exact.

| Tile | Ratio | 1440 (content 1120) | 834 (706) | 390 (358) | Column gap / row gap |
|---|---|---|---|---|---|
| KeyArtTile (Shows) | 16:9 | 3 cols ≈ 357 w | 2 ≈ 341 | 1 = 358 | 24 / 40 (phone 16 / 32) |
| PosterTile (Shorts) | 2:3 | 5 ≈ 205 w (307 h) | 3 ≈ 219 | 2 ≈ 171 | 24 / 32 (16 / 24) |
| SleeveTile (Music videos) | 1:1 | 5 ≈ 205 | 3 ≈ 219 | 2 ≈ 171 | 24 / 32 (16 / 24) |
| FigureTile (Characters) | 928:1664 | 6 ≈ 167 w × 299 h | 4 ≈ 158 × 284 | 2 ≈ 171 × 307 | 24 / 32 (16 / 24) |
| PlateTile (Locations) | 16:9 | 2 ≈ 548 | 2 ≈ 341 | 1 = 358 | 24 / 40 (16 / 32) |
| StillCard (programme, files) | 16:9 | 3 ≈ 357 | 2 ≈ 341 | 1 | 24 / 32 |
| StillCard in a rail (episodes, extras) | 16:9 | 320 w (3.4 visible) | 280 (2.4) | list view by default | 24 (phone 16) |

### 4.4 Spacing and rhythm

Spacing steps are v3's, in px: 4, 8, 12, 16, 24, 32, 48, 64, 96. Nothing else.

| Between | Lobby | Cutting room |
|---|---|---|
| Slate → hero title | 8 | — |
| Title → second-language line | 4 | — |
| Title → lead | 12 | — |
| Lead → action row | 24 | — |
| Hero bottom → tabs | 0 (the tabs sit on the hero's lower edge) | — |
| Tabs → content | 32 | 16 |
| Section → section | `--section` (48 desktop / 40 phone) | 24 |
| Section heading → content | 16 | 12 |
| Tile art → tile title | 12 | 8 |
| Tile title → slate | 4 | 2 |
| Panel padding | 20 (phone 16) | 12 |
| Field → field | 20 | 12 |
| Dialog padding | 24 (phone 20) | — |
| List row vertical padding | 12 | 8 |

### 4.5 Radii

| Token | px | Used for |
|---|---|---|
| 0 | 0 | Full-bleed heroes, theatre player, cutting-room canvas, docked panels |
| `--r-precise` | 2 | Clips, takes in compare strips, film-strip frames, timeline selections, waveform bars (1) |
| `--r-1` | 6 | Chips, menu items, small controls, `kbd` |
| `--r-2` / `--r-media` | 8 | Buttons, fields, segmented controls, browse picture frames |
| `--r-3` | 12 | Tone groups, inline players in the lobby, approval cards, tooltips |
| `--r-4` | 16 | Dialogs, sheets (top corners), the compact player bar |
| `--r-pill` | 999 | Faces, play discs, status dots, filter chips |

### 4.6 Elevation without glow

| Level | Tone | Edge | Shadow | Examples |
|---|---|---|---|---|
| Recess | `--sunken` / `--canvas` | — | — | Company band, viewer pasteboard |
| 0 Ground | `--page` (bg / frame / surround) | — | — | The page |
| 1 Group | `--surface` | **none**: tone only (v4 change C4) | — | Inspector, forms, voice panel, approval card, player card |
| 2 Field / hover | `--input` | `--line-field` on controls only | — | Fields, row hover, tile-frame hover |
| 3 Raised | `--raised-2` | — | — | Selected segment, nav current, pressed |
| Overlay | `--raised-2` (menus, popovers, toasts) or `--surface` (dialogs, sheets, drawers) | 1 px `--line-strong` inside the shadow | `--shadow-3` | Menus, dialogs |
| Float | `--raised-2` | inside the shadow | `--shadow-float` | Compact player bar, floating tool row over the canvas |

Further rules:
- **Hover** is one step up the ladder, with no lift and no shadow.
- **Selection:**
  - In the lobby, a picked choice tile gets a 1.5 px iris border and a filled radio.
  - In the cutting room, a selected clip, take or frame gets a 2 px ivory outline.
- **Never:** coloured shadows, glows, halos, inner highlights, or blur (the theatre transport excepted).

### 4.7 Density

| Token | Comfortable (lobby, default) | Compact (cutting room, default there) | Coarse pointer |
|---|---|---|---|
| `--control-h` | 40 | 32 | 44 |
| `--control-h-sm` | 32 | 28 | 40 |
| `--row-h` | 48–56 | 32–36 | ≥ 44 |
| Body | 14 / 22 (AR 15 / 26) | 13 / 20 (AR 14 / 22) | — |
| Section gap | 48 / 40 | 24 | — |
| Inspector labels | — | 12 / 16 (AR 13 / 20) | — |

The minimum target is 24 × 24 CSS px (2.5.8). The house goal is ≥ 32 on desktop and ≥ 44 on touch.

### 4.8 Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--t-fast` | 120 ms | `--ease` | Press, colour and border changes; menus fade in |
| `--t` | 200 ms | `--ease` | Hover reveal, tooltips, tab underline, compact header in |
| `--t-slow` | 320 ms | `--ease` | Dialogs, sheets, drawers, inspector swap, tile→hero and hero→slate continuity |
| `--t-media` | 480 ms | `--ease-inout` | Picture crossfades, lighting switch, Song⇄Video frame swap, `--art` change |
| `--t-travel` | 1200 ms | `--ease-inout` | A handoff travelling its edge, once |
| `--t-exit-fast` / `--t-exit` / `--t-exit-slow` | 90 / 150 / 200 ms | `--ease-in` | Exits: always shorter than the matching entry (M3, HIG) |
| `--t-lights` / `--t-idle` | 600 / 2000 ms | `--ease-standard` | Theatre lights down after 2 s idle |

**Choreography.**

| Moment | What moves | Timing | Under reduced motion |
|---|---|---|---|
| Tab switch, list selection, segmented choice | Nothing but the underline or fill | instant / underline `--t` | instant |
| Tile hover | Frame tone one step up; picture scale 1.02 | tone `--t-fast`; scale `--t-media` | tone only |
| Tile → detail hero | Shared-element artwork (View Transitions API; React `<ViewTransition>` where available), progressive enhancement | `--t-slow` | off |
| Lobby → cutting room (open a workspace tab) | Hero folds: the 48 px slate header slides in from the top; the poster/sleeve thumbnail is the shared element; the tint fades to neutral | `--t-slow`; tint `--t-media` | instant |
| Sticky compact header appears/leaves on scroll | Fade + 8 px translate | in `--t`, out `--t-exit-fast` | fade only |
| Menu / popover | Fade + 4 px rise | in `--t-fast`, out `--t-exit-fast` | fade |
| Dialog | Fade + scale 0.98 → 1 | in `--t-slow`, out `--t-exit` | fade 120 ms |
| Sheet (phone) / drawer | Slide from the bottom / end edge | in `--t-slow`, out `--t-exit-slow` | fade |
| Image arrival | Crossfade from `--art-ph` | `--t-media` | instant |
| Location lighting switch | Crossfade between plates | `--t-media` | instant |
| Theatre lights down | Sidebar + header opacity → 0.15 after 2 s idle while playing; back on pointer move or focus | `--t-lights` / back `--t-fast` | instant |
| Lyric active line | Weight and colour only; the list scrolls to keep the line at 35 % | `--t-fast`; scroll `--t-slow` | instant scroll |
| Handoff | One light travels the edge | `--t-travel` | edge lights without travel |
| Live work (the tally) | Opacity 1 → 0.35 → 1 | 2 s loop | static dot; the word "Running" carries it |
| Toast | 8 px rise + fade | in `--t`, out `--t-exit` | fade |

**The hero preview** (lobby only; Show page and Short Overview):
- It starts as a still. If a cut exists, a muted inline preview starts after 2 s on the page, plays once (≤ 15 s)
  and rests on the still.
- A Pause button is visible from the moment it starts (2.2.2).
- It never plays with sound. *Watch with sound* opens the player.
- It is off under reduced motion, `saveData`, or Settings › Interface › Hero previews: Off.

**Banned:** parallax, scroll-jacking, WebGL transitions, blur or scale on lyric lines, motion on tab switches, and
spring overshoot.

### 4.9 Interface preferences

All of these live in Settings › Interface. They are stored in the existing `vewbox.ui` localStorage key, extended,
and applied by the boot script in `src/app/layout.tsx` before first paint.

| Preference | Values (default first) | Mechanism |
|---|---|---|
| Language | English / العربية | `lang`, `dir` (exists) |
| Reduce motion | Off / On (also the OS) | `data-motion="reduce"` (exists) |
| Contrast | Standard / More (also the OS) | `data-contrast` |
| Cutting-room density | Compact / Comfortable | `data-density` on the workspace root |
| Hero previews | On / Off | read by `PreviewPlayer` |
| Single-key shortcuts | On / Off | read by the shortcut scope (2.1.4); shortcuts are always scoped to the focused player or strip |

---

## 5. Component library

**Where things live after the foundation packages.** v3 components keep their exports through re-export shims until
Q1 deletes them.

| Group | Files | Owner |
|---|---|---|
| Interface kit | `src/components/ui/kit/*.tsx`<br>`ui/kit.tsx` becomes a re-export barrel | F2 |
| Media kit | `src/components/media/*.tsx`: Frame, TitleCard, tiles, Rail, Slate, FaceCircle, CastRow, heroes, CompactHeader, StageMeter | F3 |
| Players and music | `src/components/players/*.tsx` | F3 |
| Cutting-room kit | `src/components/edit/*.tsx`: DockLayout, Panel, Splitter, Inspector, FocusMode, VersionStack | F3 |
| Shell | `src/components/shell/*.tsx`: Sidebar, NavRail, MobileBar, CommandPalette, ShortcutSheet, SaveState, ServerBar, DocumentTitle, Room | F4 |

### 5.1 Shell

**Sidebar** (≥ 1024 in the lobby; 240 px on `--page`, with an end hairline `--line-soft`):

```
┌──────────────────────────┐
│ [◩] Vewbox Studio         │  brand row 56: 32 px tile on --raised-2, monochrome ivory glyph 18 px; wordmark 15/20 600
│ [ + New…               ] │  secondary button, full width (the page's own primary is the only ivory on screen)
│                          │
│ Productions              │  group label 12/16 600 --fg-faint, sentence case
│  ▸ Shows                 │  item 36, 14/20 500 --fg-nav, icon 18 stroke 1.5 --fg-faint
│    Shorts                │
│    Music Videos          │
│ Cast & world             │
│    Characters            │
│    Locations             │
│    Files                 │
│ Studio                   │
│    Studio Company        │
│    Production       ● 3  │  needs-you count: a --warn dot + num, only when > 0
│    Screening Room        │  back in the navigation (V4-04)
│ ──────────────────────── │
│ ⚙ Settings               │
│ ? Help & shortcuts       │  one Help location on every page (3.2.6)
│ ● Saved                  │  SaveState: Saved / Saving… / Not saved — retrying (fixes V4-12)
│ ● Connected · 1 running  │  links to Production › Engine room
│ ⇤ Collapse  Ctrl+\       │
└──────────────────────────┘
```

- **Current item:** `--fg` text, `--raised-2` fill, a 2 × 16 px iris marker on the start edge, and the icon in `--fg`.
- **Hover:** `--input` fill and `--fg` text.
- **Keyboard:** Tab walks the items in order. The skip link "Skip to content" is the first focusable element.
- **RTL:** the sidebar sits on the right and the marker moves to the inline-start edge, which is on the right.

**NavRail** (80 px; tablet 768–1023, and the cutting room at any desktop width):
- Item 56 tall: an icon of 20 px above a label at 12/16 (AR 13/18). Labels may run to two lines and are never
  dropped.
- Current item: a `--raised-2` pill 56 × 32 behind the icon, with the label at weight 600.
- New… becomes a 48 × 48 secondary icon button labelled "New…". Help, SaveState and the connection state collapse to
  icons that keep their accessible names and have visible tooltips on focus.
- Ctrl/⌘ \\ expands the rail to the 240 sidebar.

**MobileBar** (< 768; 56 px, sticky, `--page`, bottom hairline):
- Contents:
  - the brand glyph, which goes Home
  - the **current area's name**, 15/20 600, so the user stays oriented
  - New… (+) and the menu
- The menu sheet runs full height. It holds the same groups, then the footer: Help, SaveState and connection.

**ServerBar** (new):
- When the event stream drops, a 40 px `--warn` line sits at the top of the content: "Can't reach the studio
  server. Showing what was there 2 min ago." with *Try now*.
- Data stays on screen, dimmed to 0.7, with a "Last known" label in sections that are live.
- It sets `--sticky-extra` while it is shown.

**DocumentTitle** (new): renders React 19's `<title>`, which is hoisted to `<head>`, from route data as
"Object · Area · Vewbox Studio" (§7.3). Every page component renders one (fixes V4-11).

### 5.2 Headers

**PageHeader** (art-less pages; v3, with fixed positions):
- Order:
  1. back link (13/18 muted, with a mirrored chevron)
  2. eyebrow or slate
  3. title (`.page-title` or `.display-xl`), followed by a count where the page is a collection
  4. lead (≤ 64ch)
- Actions sit at the end of the title row, in this order: primary, then up to two secondaries, then *More* (always
  last). On a phone they wrap under the lead, and the primary goes full width.
- Nothing sits behind it: no band, no gradient.

**CompactHeader** (new; sticky slate header, 48 px):
- **Lobby behaviour.** It appears when the hero's sentinel leaves the viewport (`IntersectionObserver`,
  `rootMargin: -48px 0 0 0`) and leaves when the hero returns. Stuck at `top: var(--sticky-top)`. While shown it sets
  `--sticky-extra: 48px`, or 92 px when the tabs stick under it.
- **Cutting-room behaviour.** Permanent. At ≥ 1280 the workspace tabs move *into* it, centred. Below 1280 they sit
  under it as a second 44 px sticky row.
- Ground: `--page` at 96 % opacity, with a bottom hairline `--line-soft`. No blur.
- Anatomy, from the inline start:
  - back (an icon button labelled "Back to Shows")
  - a 32 px-tall thumbnail in the content's own shape:

    | Content | Thumbnail |
    |---|---|
    | Show (key art) | 57 × 32 |
    | Short (poster) | 21 × 32 |
    | Music video (sleeve) | 32 × 32 |
    | Character (figure) | 18 × 32 |
    | Location (plate) | 57 × 32 |

  - the title, 15/20 600 in the UI voice
  - status (a StateWord)
  - *[cutting room]* the tabs
  - a spacer
  - *[cutting room]* SaveState ("Saved")
  - the page primary (`btn-sm`)
  - *More*
- RTL mirrors it.

### 5.3 Heroes (F3, `src/components/media/hero/*`)

**Rules every hero shares:**
- The hero is a lobby element. Its root gets `artVars(asset)` (§2.4), and the wash paints from the top of the hero
  into `--page`.
- **Layers, bottom to top:**
  1. wash
  2. picture (focal `object-position`, `--art-ph` while loading)
  3. `--scrim-bottom` + `--scrim-start` (mirrored in RTL by swapping to `270deg`); only where text sits on the
     picture
  4. text block
  5. controls
- **Text block:** at the inline start, max 640 px.
  - Order:
    1. Slate
    2. title (title voice)
    3. second-language line
    4. lead (2 lines, then a *More* disclosure)
    5. action row: one ivory primary, ≤ 2 secondaries, *More*
    6. status strip, only when something waits for the producer: "● Waiting for you: approve the story of Episode 4 ›"
  - On a picture the text uses `--fg`, `--on-art-muted` and `--fg-body` only.
- **Phone:** the picture is shown at its ratio first, with nothing over it. The text block follows on `--page`, the
  primary goes full width, and the wash continues behind.
- **Reduced motion:** no preview video.
- **A11y:**
  - The picture has `alt` built from data, e.g. "Key art for The Kite".
  - The wash and scrims are `aria-hidden`.
  - The title is the page's `h1`.

| Hero | Used on | Composition (≥ 1280) | Tablet 834 | Phone 390 |
|---|---|---|---|---|
| **BackdropHero** | Show page | Full-bleed key art (`coverAssetId`), 21:9 focal crop, height `clamp(420px, 62vh, 640px)`; text bottom-start over the scrims; optional PreviewPlayer replaces the still after 2 s | 16:9 art, height ≈ 400; text overlaid bottom-start | 16:9 art full width, text below |
| **DiptychHero** | Short Overview; Episode Overview (no poster: the still alone at 8 cols) | Slate and title above. Below them: the poster 2:3 at 240 px wide (`posterAssetId` or a TitleCard), then a gap of 24, then the **player slot** at 16:9 filling the rest (the cut, or StoryboardReel, or the frame grid; §5.12). The film strip runs under the player. No full-bleed image: the player is the picture. Wash from the poster. | Poster 160 beside the player; strip below | Player first (full width); then poster 96 px beside the title; then the strip as a horizontal scroller |
| **SleeveHero** | Music video page | Sleeve 1:1 at 280 px; beside it the slate, title (`.t-hero-sm`), performers row (28 px FaceCircles with names), then the **SongTransport** (§5.13) with the 56 px ivory play disc as the hero's primary, the Song ⇄ Video switch and *Continue: …* as a secondary. Wash from the sleeve. | Sleeve 220 | Sleeve full width up to 320, then the text and the transport |
| **FigureHero** | Character profile | The figure frame at 928:1664 on `--art-edge`, 40 % of the content width (max 440 px); **sticky** at `top: 24px` when the viewport is ≥ 820 px tall (actions are *not* under the image, so they are never hidden; this fixes the reason the code gave up sticky). Beside it: slate, name, second-language name, description, the **voice reel** (§5.13 VoicePreview), the action row, the AnchorNav. **No tint.** | Figure 300 wide beside the text column | Figure full width, max height 70vh, then the text |
| **PlateHero** | Location page | The master plate at a **2.39:1** focal crop, at full content width, radius 8, with **nothing over it** (a scouting plate stays clean). The lighting switch sits under the plate (§6.12), then the slate, title and actions. Wash from the plate. | Plate 2.39:1 full width | Plate at 16:9; lighting switch scrolls |
| **TheatreHero** | Screening Room | The cut at its native ratio on `--surround`, max height 76vh (9:16 cuts centred with black pillars). Slate, title (`.t-hero`) and actions *under* it. Notes beside it at ≥ 1440. | The same; notes below | The same; title below |

### 5.4 Picture frame and title card (F3, `media/Frame.tsx`, `media/TitleCard.tsx`)

**Frame.** Draws one picture in one ratio, and every tile and hero uses it.

```ts
<Frame
  asset
  ratio="16/9" | "2/3" | "1/1" | "928/1664" | "2.39/1"
  fit="cover" | "contain"        // contain letterboxes on --art-edge
  focal
  alt
  priority
  state="ready" | "drawing" | "missing" | "unavailable"
/>
```

- The frame is `--art-ph` until the image decodes, then crossfades in `--t-media`. Radius `--r-media`.
- `state="drawing"` shows the job's phase *inside* the frame: a 12/16 phrase on `--chip-on-art` at the bottom start,
  with a tally dot.

**TitleCard.** The typographic placeholder in the content's shape:
- The content name in the title voice (`.t-card` or `.t-card-lg`), set at the frame's lower start with a 16 px
  inset (12 on small tiles), in `--fg-muted`, on `--input`.
- At the top start, the state in 12/16 faint: "Not drawn yet", "Drawing…" (with the tally), "No key art yet" or
  "Unavailable".
- For episodes, a large episode number (title voice, 64 px, `--ink-700`) sits at the top end. It is decorative
  (`aria-hidden`); the "Episode 3" label under the frame carries the number.
- It never shows a silhouette, a gradient, a stock picture or an icon tile.

### 5.5 Tiles (F3, `media/tiles/*`)

**Anatomy shared by every tile:**

```
┌ Frame (ratio) ───────────────┐
│                      [0:42]  │ ← only on stills: the duration chip, solid --chip-on-art, 12/16, bottom-end
│                        (▶)   │ ← only on sleeves and voice-bearing figures: the 40 px play disc, on hover, focus and touch
└──────────────────────────────┘
Title, 2 lines max                        [⋯]  ← More menu: OUTSIDE the art, at the end of the title row (fixes V4-09)
slate · status last
```

- **Link and menu.** One link wraps the frame, the title and the slate. The menu button is a sibling element, never
  nested inside the link.
- **Hover:** the frame gets a 1 px inset `--line-strong` and the picture scales to 1.02. The title turns `--fg`.
- **Focus:** the two-colour ring (2 px `--ring-art-inner` inside 2 px `--ring-art-outer`) around the frame, plus a
  title underline.
- **Selected** (in pickers): a 2 px ivory outline, plus a 24 px check on `--chip-on-art` at the top end.
- **Loading:** a ratio-true frame with `--art-ph` and two text bars, with no shimmer after 1 s.

| Tile | Ratio | Title | Slate | Extra |
|---|---|---|---|---|
| **KeyArtTile** (Show) | 16:9 | 16/22 600 | "2 seasons · 14 episodes · Cartoon · ● 1 waiting for you" | Hover reveals a 2-line logline under the slate (it is also always in the accessible name) |
| **PosterTile** (Short) | 2:3 | 15/20 600 | "6 min · ● Producing 7/20" | — |
| **SleeveTile** (Music video) | 1:1 | 15/20 600, with the performers' names on a second line (13/20 muted) | "3:42 · 24 shots · ● Storyboard" | The play disc previews the song via the shared audio player, with Play/Pause state and an accessible name ("Play Rooftop Radio") |
| **FigureTile** (Character) | 928:1664, frame on `--art-edge` | 15/20 600 | role on one line (13/20 muted); slate "● Approved · Voice · English" | The voice disc (40 px) plays the identity sample when a voice exists. Lock: a 14 px shield in the slate, "Locked · in 2 videos". |
| **PlateTile** (Location) | 16:9 focal crop of the 7:4 plate | 15/20 600 | "Interior · Day · Dusk · Night · in 3 productions" | Hover crossfades through the lighting states (1 s each); not under reduced motion |
| **StillCard** | 16:9 | Kind label above the title, 12/16 faint ("Episode 3", "Cut 4", "Trailer") | Synopsis 2 lines (13/20 muted); slate | Duration chip |

**FaceCircle** (F3, `media/FaceCircle.tsx`):
- Sizes 24, 28, 40, 56 and 88. The crop comes from `presentation.faceBox` (or the top 18 % of the figure's
  `framing.box`, which is already stored in the asset's provenance, as a fallback).
- With no picture, it shows initials (40 % of the size, weight 600, `--fg-muted`) on `--input`.
- Ring states: 2 px iris while speaking or singing now; a 1.5 px `--fg` ring for the director in the company.

### 5.6 Rail (F3, `media/Rail.tsx`)

```
Episodes 14     Season 1 ⌄                                          [‹] [›]   See all
┌16:9────┐ ┌16:9────┐ ┌16:9────┐ ┌16:9──     ← first tile on the column start; the last visible tile is partial
```

- **Heading row:** `.h2` + a count (num, faint) + optional controls (the season picker) + prev/next (32 px quiet icon
  buttons, disabled at the ends) + *See all* (quiet link). The heading's `id` labels the list.
- **Scrolling:** `scroll-snap-type: x proximity`, `scroll-padding-inline: var(--gutter)`. No edge-fade gradient: the
  partial tile is the cue.
- **Keyboard:** one Tab stop per rail (roving `tabindex` on the tiles). ←/→ move between tiles (mirrored in RTL);
  Home and End go to the ends; Tab leaves the rail.
- **Pointer:** the prev/next buttons and *See all* make drag-scrolling optional (2.5.7).
- **RTL:** the rail starts at the right, and prev and next swap.
- **Loading:** height is reserved with ratio-true frames.
- **Reflow (1.4.10):** every rail has a *See all* vertical grid.

### 5.7 Episodes (F3 primitives; composed in P1a)

**EpisodeCard** (rail and grid):
- A StillCard whose frame is the chosen take's first frame or the first shot's opening frame. When there is neither,
  it is a TitleCard with the episode number.
- Kind label "Episode 3", the title, 2 lines of synopsis, then the slate with a **StageMeter**: 6 segments of 16 × 3
  px with a 2 px gap, one per stage:

  | Segment | Colour |
  |---|---|
  | Done | `--fg-muted` |
  | Current, running | `--accent` |
  | Current, waiting for you | `--warn` |
  | Current, otherwise | `--fg` |
  | Upcoming | `--line-strong` |

  The meter is `aria-hidden`; the words carry the state.

**EpisodeRow** (list view, the phone default; 104 px tall):
- Anatomy: number (24, num) · still 160 × 90 (phone 112 × 63) · title + one line of synopsis + slate · runtime ·
  chevron.
- The number becomes a ▶ button on hover and focus when a cut exists ("Play Episode 3").

**SeasonPicker:**
- The section heading itself is the button: "Season 1 ⌄" (`h2`).
- It opens a listbox menu: each season with its episode count, a divider, then "New season" → (Let the studio
  propose · Write it yourself).
- It defaults to the most recently touched season (PRODUCT-DESIGN §1), and the choice is kept in the URL
  (`?season=`).

### 5.8 Cast (F3, `media/CastRow.tsx`)

**CastGrid** (Show › Cast, the Short Overview, Music video › Performers):
- Each cell: an 88 px FaceCircle (phone 64), the name 14/20 600, the role 13/20 muted on one line, and an
  appearance line 12/16 faint ("in 6 episodes · S1–S2", or "sings 3 of 8 sections").
- A 28 px voice play disc overlaps the circle at the bottom end. It shows on hover and focus and always on touch.
- Groups: *Leads* and *Supporting*, only when the data distinguishes them (it does not today; then one group is
  ordered by appearances).
- Grid: 6 columns at 1440, 4 at 834, 2 at 390.

**CastRow** (inline, in heroes and slates): 28 px faces with names, wrapping. "+3" opens the Cast tab.

### 5.9 Slate (F3, `media/Slate.tsx`)

`<Slate items={[…]} status={<StateWord …/>} size="hero" | "tile" | "header" />` renders §3.4.

- Items are `<span>`s and the separators are `aria-hidden`.
- On art it switches to `--on-art-muted`.
- It never truncates mid-item. Overflowing items wrap; in a tile, the slate clamps at 2 lines.

### 5.10 Status (F2, `ui/kit/Status.tsx`)

| Component | Anatomy | Notes |
|---|---|---|
| **StateWord** | 6 px dot + phrase, 12/16 500 (AR 13/20) | Tones as in v3:<br>idle: faint dot, muted text<br>running: iris dot breathing (the tally), muted text<br>done: ok dot<br>waiting: warn dot and warn text<br>failed: bad dot and bad text |
| **StatusStrip** | A 40 px line under hero actions: warn dot, the sentence, a `›` link | Only when something waits for the producer. It is a link to the decision. |
| **IdentityState** (characters) | StateWord with words fixed by the contract:<br>"Draft — awaiting your approval" (warn)<br>"Approved" (ok)<br>"Locked · in 2 videos" (muted text, a 14 px shield)<br>"No image yet" (faint) | One style everywhere: tile, profile slate, pickers, cast rows |
| **Production stage words** | STORY "Story" · CAST_AND_WORLD "Cast & world" · STORYBOARD "Storyboard" · PRODUCE "Producing" · FINAL_CUT "Final cut" · COMPLETE "Finished" | Followed by a pipeline sub-state when it is true: "Waiting for you", "Running · drawing shot 7 of 20", "Refused by QA" |
| **Badge** | Pill 22, neutral | Counts and the SAMPLE mark only |
| **FilterChip** | Pill 32, `--raised-2`, label + × (24 × 24 target) | Active filters under the catalogue bar; × removes; "Clear all" at the end |
| **StageMeter** | §5.7 | Decorative twin of the words |
| **ProgressBar** | 4 px, `--accent-strong` on `--raised-2` | Only when the worker reports a percent. It mirrors in RTL (job progress is not media). |

### 5.11 In-page navigation (F2, `ui/kit/Tabs.tsx`)

**TabBar** (v3, kept):
- 44 px, 14/20 500 muted. The selected tab is `--fg` 600 with a 2 px iris underline. Counts are faint `num`, never
  a chip.
- Sticky under the CompactHeader. ←/→, Home and End move between tabs, mirrored in RTL.
- Switching is **instant**: no fade-in on the tabpanel. `.fade-in` on the tabpanels goes.

**AnchorNav** (one-page profiles: Character, Location; §6):
- A sticky row of in-page links, 40 px, 13/20, styled like tabs. Scrollspy sets `aria-current="true"` on the section
  in view.
- On a phone it becomes a horizontally scrolling chip row.
- Jumps respect `scroll-padding`.

**Crumbs:**
- Deep paths: Show › Season 1 › Episode 3 › Shot 12. On a phone the middle collapses into a "…" menu.
- `aria-label` is translated (v3 fix kept).

**CatalogueBar** (replaces `LibraryBar` + the select rows; F2):

```
[🔍 Search the cast…                ]  [ Filter (2) ▾ ]   Sort: Recent ▾   [▦ | ☰]
 Cartoon ×   Arabic ×   Clear all
```

- One Filter popover holds every facet as segmented controls or check lists. Active facets appear as FilterChips.
- Search is 40 tall, `min(100%, 28rem)`. On a phone, search goes full width, then Filter · Sort · View on one row.
- This removes the strongest admin-table signal (V4-09).

### 5.12 Video player family (F3, `src/components/players/*`)

One core, `PlayerCore`, which is today's `VideoPlayer` logic extracted: sync bus, frame step, captions, fullscreen and
the playback coordinator. Five shells sit on top of it.

| Shell | Room | Frame | Controls | Notes |
|---|---|---|---|---|
| **InlinePlayer** | Lobby | `--media`, radius 12, native ratio, max height 70vh | Overlay bar on a `--scrim-bottom`-style gradient. Hidden 2.5 s after the last movement *while playing*; always shown while paused or focused. | Hero preview slots, the Overview cut, approval cards |
| **PreviewPlayer** | Lobby hero | Fills the hero picture layer | Pause/Play and "Watch with sound" only (both visible from the start) | Muted, once, ≤ 15 s, after 2 s; rests on the still (§4.8) |
| **CanvasPlayer** | Cutting room | `--canvas`, radius 0, native ratio, letterboxed | A **docked** transport bar *under* the frame (not over it): ‹ frame · play · frame ›, J/K/L, in/out marks, timecode `.tc`, zoom-to-fit | No auto-hide: the editor needs the controls |
| **TheatrePlayer** | Theatre | `--surround`, native ratio | Overlay transport on blur glass (the one allowed, §2.3), with note ticks on the seek bar | Lights down after 2 s idle |
| **CompareAB** | Cutting room / approval | Two sources on one timeline. ≥ 1280: side by side with linked transport. Below that: one frame with an A/B toggle (keys 1 and 2). | Labels "A · Take 2 (chosen)" / "B · Take 3"; *Choose A*, *Choose B* | Switching keeps the playhead; both are normalised for loudness by the engine |

**Shared transport rules:**
- **Always LTR.** The transport group is `dir="ltr"` with a translated `aria-label`. ←/→ always mean back and forward
  in media time.
- **Seek track.**
  - 4 px, 6 px while scrubbing. The 13 px thumb is always visible on focus.
  - The played part is `--fg` on `rgb(255 255 255 / .28)` over video; in the cutting room it is `--accent` on
    `--ink-700`.
  - Click or tap to seek is the pointer alternative to scrubbing.
- **Buttons** are 36 px (`vbtn`) over video, ≥ 24 px targets, with translated names.
- **Time** shows as "1:12 / 6:12" in mono. The cutting room shows a timecode.
- **Captions** are on by default when the cut has a subtitle track (1.2.2).
- **Keyboard map.** Active only while the player has focus (2.1.4) and only if single-key shortcuts are on; `?` shows
  the sheet.

  | Key | Action |
  |---|---|
  | Space / K | Play or pause |
  | J / L | −5 s / +5 s |
  | ← / → | One frame |
  | Shift + ← / → | 1 s |
  | Home / End | Start / end |
  | M | Mute |
  | C | Captions |
  | F | Fullscreen |
  | I / O | Mark in / out (cutting room) |
  | N | Add a note at the playhead (theatre, cutting room) |
  | 1 / 2 | A / B (compare) |

- **Media failure.** The poster stays. On `--chip-on-art`: "This clip didn't load." with *Try again* and *Open the
  file*. Never a broken frame.
- **One sound at a time** (exists: `claimPlayback`).

**FilmStrip:**
- Every shot's frame at the production aspect, in shot order.
- Lobby: 72 px tall, gap 4, radius 8.
- Cutting room: 64 px tall, gap 1, `--r-precise`, on `--canvas`.
- The current shot gets a 2 px ivory outline. A missing frame is an outlined `--line-field` frame with the shot
  number in `.tc`.
- Click: in the lobby it seeks the cut, or opens the shot when there is no cut. In the cutting room it selects.
- Keyboard: roving ←/→, and **always LTR**, because it is time.

**DualScaleStrip** (programmes over 5 min):
- An overview strip (24 px) of the whole programme with a viewport window, above the magnified FilmStrip or Timeline.
- The window can be moved by dragging, by clicking to centre, and with the ‹ › buttons (2.5.7).

**StoryboardReel** (new, client-only):
- Plays the storyboard frames for each shot's duration, with the recorded dialogue when it exists, as an honest
  stand-in for a cut. It is labelled on the frame "Storyboard reel · not a cut".
- It is used in the DiptychHero and SleeveHero (Video mode) before a cut exists.

**PlayerBar** (the compact player; replaces `MiniPlayer`):
- Fixed at the bottom; 64 px, radius 16, `--raised-2` + `--shadow-float`.
- Inset 12 px from the content edges, so it never covers the sidebar or rail.
- Anatomy: 40 px thumbnail in shape · title + subtitle · play 40 · seek · time · *[music]* Song | Video · close.
- While shown it sets `--bottom-bars: 76px`, so toasts and focus stay above it (2.4.11).

### 5.13 Music (F3, `src/components/players/music/*`)

**SongTransport** (in SleeveHero):

```
(▶)  [ Song | Video ]   0:42 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3:42   🔊   [ Continue: Storyboard › ]
56 px ivory disc (the hero primary)   radiogroup; Video disabled with reason "No cut yet"        secondary
```

**SongVideoSwitch:**
- A radiogroup over **one** shared transport. *Song* shows the sleeve and the lyric view below the hero. *Video*
  swaps the stage below the hero for the InlinePlayer (or the StoryboardReel).
- **Switching keeps the playhead.** The video and the song share the sync bus (exists: `createSyncBus`).
- Video is disabled with the reason as text until a cut or storyboard exists.

**SectionsTable** (Music video Overview, and Song & Lyrics in edit):

```
 #   Section      Singer                 Shots          Time
 1   Intro        —                      ▪▪▪  3 of 3    0:00–0:12
 2   Verse 1      (◯) Amina               ▪▪▫  2 of 3    0:12–0:46     ← the row being sung: title 600 --fg, the tally replaces #
 …
 3:42 · 8 sections · 24 shots · song version 3                          ← totals footer (Apple Music)
```

- A real `<table>`. Rows are 48 px (compact 36).
- `#` becomes a ▶ button ("Play from Verse 1") on hover and focus.
- Shot pips are 6 px squares with a 2 px gap: done is `--fg-muted`, missing is `--line-strong`. The text "2 of 3" is
  the accessible content.
- Phone: the Shots column folds into the row's second line.

**LyricView:**
- A column at max 40ch, using `.lyric`.
- Line styles:

  | Line | Style |
  |---|---|
  | Active | `--fg` 600 |
  | Upcoming | `--fg-muted` 400 |
  | Past | `--fg-faint` |

  No blur, no scale.
- Section labels ("Chorus") sit between groups as 12/16 captions.
- Each line is `dir="auto"` with `lang`, so Arabic lyrics stay right-aligned inside the English UI. The singer's
  24 px FaceCircle sits at the line's own start (`margin-inline-end: 12px`).
- Clicking a line seeks. As a listbox: ↑/↓ moves, Enter seeks.
- Auto-scroll keeps the active line at 35 % from the top. If the user scrolled in the last 3 s, it stops and shows a
  "Back to the playhead" chip.
- **Edit mode** (Song & Lyrics tab):
  - Lines become editable.
  - The singer is assigned per line through a menu (never by drag, 2.5.7).
  - Timing has ±0.1 s nudge buttons plus a numeric field.

**VoicePreview / voice reel** (Character profile header, cast rows):
- A 32 px ivory disc, the name of the voice in words, a 64-bar mini waveform (LTR), the time, and the line spoken,
  in its own language.
- No engine names (V4-10). "Studio-designed synthetic voice" and "Recording — kitchen take 2" come from the voice
  identity contract's origin labels.

**Waveform** (F3; kept and corrected):
- 120 bars (64 on a phone), each 2 px wide with a 1 px gap and a 1 px radius.
- Played bars are `--fg`. Unplayed bars are **`--ink-550`** (3.77:1; v3's `--ink-600` measured 2.09:1).
- Playhead: a 1 px ivory line and an 8 px iris handle.
- Click or tap seeks. Keyboard behaves as a slider. **Always LTR.**
- In edit, section boundaries show as 1 px `--line-strong` ticks with labels above.

### 5.14 Timeline (F3, `edit/Timeline.tsx`; cutting room only)

**Ruler.** Timecode ticks in `.tc` 12 px faint. Click on the ruler to seek.

**Tracks.**

| Track | Contents |
|---|---|
| Picture | Clips: `--clip` fill, 1 px `--clip-edge`, `--r-precise`, 1 px gaps. The label inside is the shot number (`.tc`), plus the shot's purpose on hover and focus. |
| Dialogue | Line blocks: `--clip` with a `--line-strong` edge |
| Music | A waveform |

**Selection and playhead.**
- A selected clip has a 2 px ivory outline. Multi-select uses Shift for a range and Ctrl/⌘ to toggle.
- The playhead is a 1 px ivory line through all tracks, with an iris handle on the ruler.

**Trim and zoom.**
- Trim handles are 8 px at the clip edges, shown on hover and focus.
- Pointer alternatives are *−1 frame / +1 frame* nudge buttons and a numeric in/out field in the inspector (2.5.7).
- Zoom: −/+ buttons, Ctrl+wheel, and *Fit*.
- No nested scrollbars: the timeline scrolls only horizontally.

**Direction.** Always LTR, in both languages.

### 5.15 Approval card (F2 shell, F3 media slots; `ui/kit/ApprovalCard.tsx`)

```
┌ group (--surface, radius 12, padding 20) ───────────────────────────────────────────────────────────┐
│ ┌ the thing to approve, inline ─────────────┐  Story · The Kite — Episode 4                          │
│ │ script excerpt on "paper" (--input, prose) │  Story Development handed it over · 12 min ago         │
│ │ or the 16:9 cut (InlinePlayer)            │  Approve the story to start storyboarding.            │
│ │ or the figure (928:1664, 240 h)           │                                                        │
│ │ or a 3 × 2 storyboard frame grid          │  [ Approve ]  [ Request changes ]  [ Open ]            │
│ └───────────────────────────────────────────┘                                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Layout.** At ≥ 1280: content 7 columns and decision 5. Below that, they stack.
- **Approve** is this card's ivory primary. The card is a region, so a queue of cards has one primary per card.
- **Request changes** opens an inline "What should change?" field inside the card.
  - It never uses `window.prompt`.
  - The text is kept in sessionStorage per decision (3.3.7).
  - Its submit button is *Send back*.
- **After Approve,** the card collapses to a single line, "Approved · Undo", for 10 s (2.2.1: the toast also stays
  while hovered or focused). Then it moves to *Recent decisions*.
- **Busy:** Approve shows `loading`, keeps its width, and the card is `aria-busy`.
- **Failure:** the notice anatomy appears inside the card.
- **The figure** is shown *without* the light-backdrop brightness filter, so the producer judges the true pixels.

### 5.16 Empty, loading, error and partial states (F2, `ui/kit/States.tsx`)

**Page empty** is composed by the page (§6):
- It is a **title card in the page's shape** + one sentence + one primary + at most two alternatives.
- **Lint rule** (F2 adds it as a unit test over `src/lib/i18n`): no `empty.*.hint` may equal its page's lead, and no
  page may render the lead twice.

**Section empty:** one sentence in `--fg-muted` at the section's start, plus one action (secondary). No dashed box,
no icon tile.

**Loading:**
- Ratio-true frames with `--art-ph` and text bars. The shimmer runs only until the job reports a phase, and stops
  after 1 s anyway.
- Rails reserve their height, so there is no layout shift.
- No spinner appears without a sentence.

**Error notice** (v3 anatomy):
- Contents, in order:
  1. what happened
  2. why, in plain words
  3. what is kept
  4. one recovery action, then alternatives
  5. *Details*
- **Engine exceptions.** The title comes from `useErrorCopy(code)` and the failure class (`fail.*`, 17 classes
  translated). The raw exception string appears **only** inside *Details*, in `.tc .break-all`. This fixes V4-06.

**Media failure:** §5.12.

**Partial states are honest:** "Episode 4 · cut missing · 18 of 20 shots chosen".

**SAMPLE:** a neutral badge on bundled media, kept.

### 5.17 Overlays (F2, `ui/kit/Overlay.tsx`)

| Component | Spec |
|---|---|
| **Dialog** | Widths 400 / 560 / 880. `--surface`, radius 16, `--shadow-3`, `--overlay` behind with no blur. Header 56: title `.h2` + close. Footer end-aligned: Cancel (quiet), then the confirm. Below 640 px it becomes a bottom sheet (full width, top radius 16, max 92dvh, sticky footer). Esc closes; focus returns to the trigger; the first field takes focus. |
| **ConfirmDialog** | Replaces `window.confirm` everywhere (11 call sites). The title names the object ("Delete 'The Kite'?"), then one sentence of consequence and what is kept. The destructive confirm is the one filled `--bad` button in the system. |
| **Drawer** | Docks to the end side (mirrored in RTL), 480 or 640 wide; full width on a phone. Used for activity logs from a JobButton and for the inspector at tablet width. |
| **Popover / Menu** | `--raised-2`, radius 8, `--shadow-3`, padding 4. Items 36 (compact 32), 14/20, with a 16 px icon. *MenuButton* items may carry a 12/16 faint description line (used for Auto/Manual: "Let the studio propose — you review it before anything is made"). |
| **Toast** | Bottom end, above `--bottom-bars`. `role="status"`. 4 s, or ≥ 10 s when it carries an action (Undo); pauses while hovered or focused. Never the only place an error is reported. |
| **CommandPalette** (F4) | Ctrl/⌘K. A 640 px dialog at 15vh with a 48 px input. Results grouped *Go to · Create · Decide*, with kind-first labels ("Show · The Kite", "Character · Amina", "Approve · Story of E4"). ↑/↓ and Enter; Esc closes; recent items when empty. |
| **ShortcutSheet** (F4) | `?` when focus is not in a text field. A dialog listing shortcuts by scope (Global · Player · Storyboard · Timeline), with the on/off preference. |

### 5.18 Forms (F2, `ui/kit/Field.tsx` and others)

v3's field spec is kept: 40 px fields, `--line-field`, focus as an iris border plus a 1 px inset, no glow,
invalid in `--bad`, messages linked by `aria-describedby`, "optional" at the end of the label row. These parts are
added:

| Part | Spec |
|---|---|
| **ChoiceTiles** | The method choice. 2-up or 3-up at ≥ 768 (min 14rem); stacked 64 px rows below that (icon 20, title 15/20 600, a one-line hint, the radio at the end). Selected: 1.5 px iris border and a filled radio. A radiogroup with arrow keys. |
| **SettingsSummary** | One line: "For The Kite · Cartoon · Arabic (Iraqi Baghdadi) · Change". *Change* discloses the controls inline. Intent comes before configuration. |
| **Segmented** | v3. Used for every short closed set (age band, pitch, lighting, Song ⇄ Video). |
| **ChipInput** | Traits and distinguishing marks: Enter or comma adds; each chip has × (a 24 px target); Backspace in the empty field removes the last chip. |
| **Shaped Dropzone** | The drop target *is* the target frame: 928:1664 for "From a picture", 1:1 for a sleeve upload, 16:9 for a plate photo, 4:1 for audio. *Browse* is always present (2.5.7). Once a file is chosen it becomes the preview with *Replace* and *Remove*. Refusals show under the frame with `role="alert"`. |
| **Recorder** | MediaRecorder. Record is a 48 px button (ivory while it is the section's primary), with a live level meter (LTR), a timer and a required consent checkbox ("This is my voice" / "I have the speaker's permission", from the voice contract). |
| **Validation** | On blur and on submit. With more than 3 errors, a summary at the top with links to the fields. |
| **Autosave** | Long-form editors (Bible, Story, notes) autosave. *SaveState* in the CompactHeader or form footer reads "Saved", "Saving…" or "Not saved — retrying". |
| **Sticky form footer** | On a phone: 56 px, `--page` with a top hairline. It sets `--bottom-bars: 56px`, and fields use `scroll-margin-block-end: 72px` (v3). |
| **Carry-over** (3.3.7) | Creation drafts are kept in sessionStorage per kind and context (`new:show`, `new:episode:<season>`, `new:character`), and are carried across methods (Auto ⇄ Manual) and after failures. |

### 5.19 Creation flows (F2 shell; composed by P1a, P2)

**CreationShell** (one layout for every "new" page: show, season, episode, short, music video, character, location):

```
‹ Back to The Last Sip · Season 2                                                         [ Cancel ]
New episode                                                                              ← .page-title
For The Last Sip · Season 2 · Cartoon · Arabic (Iraqi)                                   ← slate
How do you want to start?
( ● Let the studio propose ─────────────── )  ( ○ Write it yourself ──────────────────── )   ← ChoiceTiles
    A line is enough. You review everything        A title or a line; every other field
    before anything is made.                       has a sensible default.
┌ group ──────────────────────────────────────────────────────┐   ┌ preview (≥ 1280, 4 cols) ───────┐
│ the one essential input (brief / title)                      │   │ the title card in the content's  │
│ SettingsSummary · Change                                     │   │ shape, updated live as you type │
│ ▸ More control                                               │   └──────────────────────────────────┘
│ ──────────────────────────────────────────────────────────── │
│ About a minute.                        [ Cancel ] [ Propose ] │   ← time estimate before the actions
└──────────────────────────────────────────────────────────────┘
```

**The three states of a flow:**
1. **Form.** The method's essential input. *More control* is disclosed (≤ 2 levels; ≤ 6 visible fields per step).
2. **Working.** `JobProgress` (v3's stepper rows with real phases) replaces the group's content, and the preview frame
   shows the phase *inside* it. One *Cancel* stops the chain. A cancelled chain keeps what was finished.
3. **Review** (Auto only). The proposal as an editable sheet. Actions: *Create* (primary), *Another idea*
   (secondary), *Change preferences* (quiet). Nothing is created until *Create*.

**Landing.** Every flow lands on the **object's own page**, never a child: a new show lands on the Show page, not
Episode 1 (fixes UX-STRATEGY A2). A one-time notice there names what was made and the next step.

**Stepper** (Manual, multi-step): "① Identity ─ ② Look ─ ③ Voice". The current step is iris, done steps are ok.
On a phone it reads "Step 2 of 3 · Look".

### 5.20 Cutting-room kit (F3, `src/components/edit/*`)

| Part | Spec |
|---|---|
| **DockLayout** | CSS grid: `[list 280] [canvas 1fr] [inspector 320]` at ≥ 1280. Below that, panels become drawers (§4.1). Panels have a 40 px header (title 13/18 600 + a collapse button). Splitters are 8 px hit areas showing a 1 px `--line-soft` line, `role="separator"` with `aria-valuenow`; ←/→ move 16 px and Enter collapses. Widths persist per workspace in localStorage. *More › Reset layout* restores them (2.5.7). |
| **Inspector** | Contextual: its header names the selection (kind + name), and its sections follow the selection (shot, take, line, character, section). Advanced material sits behind *Details*. With several items selected it shows the shared fields, with "Mixed" placeholders. |
| **FocusMode** | F, or the header button. Collapses the list, the inspector and the nav rail, and the CompactHeader shrinks to 40 px. Esc exits. Announced via `aria-live`. |
| **VersionStack** | Take, image, voice and cut versions as 28 px chips "v1 … v5". Current = 2 px ivory outline. Picking two opens CompareAB. |
| **ToolRow** | Floating at the canvas bottom (`--shadow-float`), **labelled** tools (icon + word), 32 px. Transient tools only. |
| **Panels never nest scrollbars.** | The list and the inspector scroll vertically; the canvas never scrolls. |

---

## 6. Page specs

Wireframes are drawn at 1440 unless marked. Content widths are 1120 at 1440, 706 at 834 and 358 at 390 (§4.1).
`[ Primary ]` marks the ivory button. Every page renders a `DocumentTitle` (§7.3).

### 6.0 One system, distinct pages

| Page | Room | Identity object | Hero | Signature (only this page has it) | Primary |
|---|---|---|---|---|---|
| Shows | Lobby | Key art 16:9 | — (catalogue) | **The Continue strip over a wall of wide key art** | New show ▾ |
| Show | Lobby | Key art 16:9 (21:9 crop) | Backdrop | **Season ⌄ heading + episode cards with stage meters; the show's production board** | Continue S1 · E3: … |
| Episode | Lobby → cutting room | Still 16:9 | Still (diptych without poster) | Inherits the show; the film strip | Continue: … |
| Shorts | Lobby | Poster 2:3 | — | **A poster wall** | New short ▾ |
| Short | Lobby → cutting room | Poster 2:3 + cut 16:9 | Diptych | **The film strip of every shot under the player** | Continue: … |
| Music Videos | Lobby | Sleeve 1:1 | — | **Sleeves you can play from the wall** | New music video ▾ |
| Music video | Lobby → cutting room | Sleeve 1:1 + video | Sleeve | **Song ⇄ Video switch, sections table, synced lyrics** | ▶ (the play disc) |
| Characters | Lobby | Figure 928:1664 | — | **The casting line-up; drafts waiting for approval first** | New character ▾ |
| Character | Lobby (no tint) | Figure | Figure, sticky | **A standing figure you can hear** | Approve (Draft only) |
| Locations | Lobby | Plate 16:9 | — | **A scouting board of big plates** | New location ▾ |
| Location | Lobby | Plate 2.39:1 | Plate | **The lighting switch crossfading the plate** | Use in a production ▾ |
| Studio Company | Lobby (no art, no tint) | Monograms | Constellation | **The live handoff diagram** | Start a production |
| Production | Lobby (no tint) | Items awaiting you | — | **Approval cards with the content inline** | Approve (per card) |
| Screening Room | Theatre | The cut, native | Theatre | **Lights down + programme** | ▶ |
| Settings | Lobby (plainest) | — | — | Plain rows with health in words | — |
| New… | Lobby | All five shapes | — | **The shapes of Vewbox side by side** | — |

**The cutting room** is shared by the Short, Episode and Music video workspaces and by shot pages (§6.6).

### 6.1 Shows catalogue `/shows`

**Purpose:** find a series and pick up work. **Signature:** Continue strip + the key-art wall.

```
Shows  3                                                                         [ New show ▾ ]
Series with seasons and episodes that share one cast and one world.                 ├ Let the studio propose
                                                                                    └ Write it yourself
Continue                                                          ← only when something is in progress; max 3
┌ StillCard 16:9 ───────┐ ┌──────────────────────┐ ┌──────────────────────┐
The Last Sip · Season 1 · Episode 3                                 ← kind label
The Radio Answers
● Storyboard · 12 of 20 frames                                      ← the whole card links to the episode at its next tab

[🔍 Search shows               ]  [ Filter ▾ ]   Sort: Recent ▾
┌ KeyArtTile 16:9 ──────────┐ ┌ KeyArtTile ───────────────┐ ┌ KeyArtTile ───────────────┐   ← 3 cols
│                           │ │                           │ │  No key art yet           │   ← TitleCard
│                           │ │                           │ │  Night Tray (title voice) │
└───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
The Last Sip                [⋯]   Paper Kites            [⋯]   Night Tray             [⋯]
2 seasons · 14 episodes · Cartoon · ● 1 waiting for you
```

**Empty.** The lead is not repeated: the sentence and the title card do the work.

```
Shows
Series with seasons and episodes that share one cast and one world.

┌ TitleCard 16:9, 8 cols (≈ 740 × 416) ─────────────────────┐   How a show comes together
│ Not made yet                                               │   1  A premise: one line, or let the studio propose it
│                                                            │   2  A cast and a world every episode shares
│                                                            │   3  Season 1, episode by episode
│ Your first show                                            │
└────────────────────────────────────────────────────────────┘   [ Let the studio propose ]  [ Write it yourself ]
```

- **Tablet (834):** 2 columns. Continue shows 2 cards and a partial third (a rail). The empty title card spans 8
  columns, with the steps below it.
- **Phone (390):** 1 column. *New show* sits under the lead at full width. The Continue strip is a rail of 280 px
  cards.
- **Filter facets:** Style · Language · Status (In production · Finished · Waiting for you) · Genre (when there are
  more than 2).
- **Card menu:** Open · Edit details · Delete (ConfirmDialog).
- **RTL:** the grid and the Continue rail start at the right.
- **Files:** `src/app/(app)/shows/page.tsx`, `src/components/library/ShowCard.tsx` (after F0 splits `Cards.tsx`).

### 6.2 Show page `/shows/[id]`

**Purpose:** present the series and run its production. **Signature:** the Season ⌄ heading and the episode cards
with stage meters, plus the show's production board.

```
┌ BackdropHero: full-bleed key art, 21:9 focal crop, wash from the art, scrims bottom + start ────────────────────────┐
│                                                                                                                      │
│  Show · 2026 · 2 seasons · 14 episodes · Cartoon · Arabic (Iraqi)                                                    │
│  The Last Sip                                                                     ← .t-hero, title voice             │
│  آخر رشفة                                                                          ← lang="ar", .text-sm              │
│  A café owner in Baghdad keeps a radio that only plays tomorrow's news. More       ← lead, 2 lines                   │
│  [ Continue S1 · E3: Storyboard ]  [ ▶ Play latest cut ]  [ ⋯ ]                     ← ⋯: New episode ▸ · New season ▸ │
│  ● Waiting for you: approve the story of Episode 4 ›                                     · Edit details · Delete     │
│                                                                                   (‖) Pause preview  ← only while previewing
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
━ Episodes 14 · Cast 9 · World 4 · Bible · Production · Settings ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← sticky under the CompactHeader

Season 1 ⌄  6 episodes                                            [▦ | ☰]   [ New episode ▾ ]
┌16:9──────┐ ┌16:9──────┐ ┌16:9──────┐ ┌16:9──────┐                ← EpisodeCards, 4 cols in grid view
│     7 min│ │     6 min│ │ 3        │ │ 4        │                ← TitleCard with the number for unwritten episodes
Episode 1     Episode 2     Episode 3     Episode 4
The Signal    Static        The Radio…    Untitled
2-line synopsis …
▮▮▮▮▮▮ Finished  ▮▮▮▯▯▯ Storyboard 12/20   ▮▯▯▯▯▯ ● Waiting for you

Watch                                                                       [‹] [›]
┌ StillCard: Cut · Episode 1 · 7:12 ┐ ┌ Cut · Episode 2 ┐ …      ← latest cut of each episode; a trailer when one exists
About this show                                                  ← definition list, 2 columns
 Created 2 Oct 2026 · Style Cartoon · Language Arabic (Iraqi Baghdadi) · Aspect 16:9 · Episode length about 7 min
 Deliverables  16:9 · 1080p · Arabic subtitles                    ← text tags
```

**Tabs** (UX-STRATEGY §C, adjusted): Seasons and Episodes merge into **Episodes**, and the Bible gets its own tab.

| Tab | Content |
|---|---|
| **Episodes** (default) | Season picker, episode cards or rows, *Watch* rail, *About this show* |
| **Cast** | CastGrid (88 px faces, "in 6 episodes · S1–S2"). *Add from the cast* opens a picker drawer of FigureTiles (multi-select, the selected check, Done). *New character for this show* links to `/characters/new?show=<id>`. |
| **World** | PlateTiles, 3 columns. *Add a place* uses a picker drawer; *New location* links to the creation page. |
| **Bible** | Five sections on one 720 px measure: World rules · Relationships · Timeline · Open storylines · Art direction. Each is a line list edited in place and autosaved ("Saved"). |
| **Production** | The show's production board (below) |
| **Settings** | Edit details (the v3 field spec, 720 measure), artwork (§ below), danger zone |

**Production tab: the board.**

```
Needs you 1                                       ← ApprovalCards for this show only
Board                       Story  Cast&world  Storyboard  Produce  Final cut  Finished
 S1 · E1  The Signal          ●        ●          ●          ●         ●         ●      Finished · 7:12        [Open]
 S1 · E2  Static              ●        ●          ◐          ○         ○         ○      Storyboard · 12 of 20  [Open]
 S1 · E3  The Radio Answers   ◆        ○          ○          ○         ○         ○      Waiting for you        [Approve]
Deliverables                                       ← exports per episode: format · resolution · subtitles · size · Download
```

- The board is a `<table>`. Each cell holds the state as words for screen readers, with the dot `aria-hidden`.
- Dot meanings: ● done (`--fg-muted`), ◐ running (iris tally), ◆ waiting (`--warn`), ○ upcoming (outline
  `--line-field`).
- Phone: the board becomes one card per episode, each with a StageMeter and the words.

**Production controls.** The show page has exactly one production entry in the hero: *Continue*, derived from the
pipeline, the single progress model (UX-STRATEGY A4). Everything else sits next to what it changes:
- *New episode ▾* and *New season ▾* in the Episodes tab, each as a MenuButton with "Let the studio propose" and
  "Write it yourself" (§6.17)
- approvals in the Production tab and the status strip
- generation in the episode's cutting room

**Artwork (Settings tab).**
- *Key art* (16:9) and *Poster* (2:3) each have a shaped Dropzone with *Replace* and *Remove*. A *Draw key art*
  button appears only when such a job exists. There is none today: flag it to the backend, and never show a
  disabled fake.
- *Adjust crop* opens a dialog showing the 21:9 and 16:9 crops over the art. The frame is moved by dragging, by the
  ‹ › ˄ ˅ buttons or by the arrow keys (2.5.7), and it writes `presentation.focal`.

**States:**
- **No seasons:** the Episodes tab shows a 16:9 TitleCard "Season 1", the sentence "Plan the first season: the
  studio can propose its episodes, or you can write them.", and *New season ▾*.
- **Season without episodes:** a single TitleCard "Episode 1" and *New episode ▾*.
- **Loading:** a neutral hero skeleton (text bars) and 4 ratio frames.
- **Not found:** "This show isn't in the studio." with a *Back to Shows* link.

**Responsive and RTL:**
- **Tablet:** the hero is 16:9 at ≈ 400 px tall with text overlaid. The episode grid has 2 columns; *Watch* is a rail.
- **Phone:**
  - The art is 16:9, with the text below it. *Continue* is full width; *Play* and *⋯* sit on the next row.
  - Tabs scroll. Episodes default to list view (EpisodeRow). The season picker is a full-width button.
- **RTL:** the scrim runs from the right and the text block sits on the right. Rails start at the right. The season
  menu opens aligned to the inline end.

**Routes:** `/shows/[id]/seasons/[seasonId]` redirects to `/shows/[id]?season=<seasonId>` (it is a lens, not a page).

**Files:**
- `src/components/show/*`, split from `ShowWorkspace.tsx` into ShowPage, EpisodesTab, CastTab, WorldTab, BibleTab,
  ProductionTab, SettingsTab and SeasonPicker
- `src/app/(app)/shows/**`

### 6.3 Episode `/shows/[id]/seasons/[s]/episodes/[p]` and shots

**Overview (lobby, no tint; the show owns the colour):**

```
‹ The Last Sip · Season 1                                         ← Crumbs collapse on a phone
┌ player 16:9 (8 cols): cut ▸ storyboard reel ▸ frame grid ─────┐  Episode 3 · 7 min · ● Storyboard · 12 of 20 frames
│                                                               │  The Radio Answers         ← .t-hero-sm
│                                                               │  Synopsis, 3 lines. More
└───────────────────────────────────────────────────────────────┘  [ Continue: Storyboard ] [ ⋯ ]
▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣  film strip
━ Overview · Story · Cast & World · Storyboard · Produce · Final cut ━━━━━━━━━━━━
In this episode   (◯) Abu Samir  (◯) Hana  (◯) Layla · Café · Rooftop
Next              Storyboard: 8 frames left to draw. The studio draws them when you press Continue.
About             Target 7 min · 16:9 · Arabic (Iraqi) · subtitles Arabic
```

Opening a workspace tab enters the cutting room (§6.6). Shot pages
(`…/shots/[shotId]`, `/shorts/[id]/shots/[shotId]`, `/music-videos/[id]/shots/[shotId]`) are cutting-room pages:
- the CanvasPlayer on the selected take
- the takes as a VersionStack with CompareAB
- the inspector with the shot's fields (purpose, action, framing, camera, duration, dialogue, prompt behind *Details*)
- Crumbs: Show › S1 › E3 › Shot 12

### 6.4 Shorts catalogue `/shorts`

**Signature:** the poster wall.

```
Shorts  8                                                                         [ New short ▾ ]
Single films, from an idea to a finished cut.
[🔍 Search shorts ]  [ Filter ▾ ]   Sort: Recent ▾
┌2:3──┐ ┌2:3──┐ ┌2:3──┐ ┌2:3──┐ ┌2:3──┐             ← 5 cols ≈ 205 × 307
│     │ │     │ │     │ │ Not │ │     │
│     │ │     │ │     │ │drawn│ │     │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘
Paper Boats [⋯]  …
6 min · ● Producing 7/20
```

- A vertical (9:16) short keeps the 2:3 poster when it has one. With no poster, it uses its 9:16 cover inside the
  2:3 frame (contain on `--art-edge`).
- **Empty:** one 2:3 TitleCard "Your first short" (4 cols), the sentence "One film: a line is enough to start.", and
  *Let the studio propose* / *Write it yourself*.
- **Tablet** 3 columns; **phone** 2 columns. Glass badges on posters go: the duration moves into the slate (§1.5).
- **Files:** `src/app/(app)/shorts/page.tsx`, `src/components/library/ShortCard.tsx`.

### 6.5 Short `/shorts/[id]`

**Signature:** the poster beside the player, with every shot's frame in a strip underneath.

```
‹ Shorts
Short · 2026 · 6 min · Anime · Arabic (Iraqi) · ● Producing · shot 7 of 20
Paper Boats                                                            ← .t-hero
قوارب ورق
┌ poster 2:3 ┐  ┌ player slot 16:9 ───────────────────────────────────────────────────┐
│   240 w    │  │ cut (InlinePlayer)  ▸  else StoryboardReel ("Storyboard reel · not a  │
│            │  │ cut")  ▸  else frame grid "No frames yet · 0 of 20"                   │
└────────────┘  └──────────────────────────────────────────────────────────────────────┘
                ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣   ← FilmStrip: click seeks the cut, or opens the shot when there is no cut
Two children float paper boats down the Tigris to a grandmother who never writes back.     ← lead
[ Continue: Produce ]  [ ▶ Play cut ]  [ ⋯ ]
━ Overview · Story · Cast & World · Storyboard · Produce · Final cut ━━━━━━━━━━━━━━━━
Overview tab:
 Story                                   (prose, 68ch)       │ About (aside, 4 cols)
 Cast   (◯)(◯)(◯) CastGrid compact       Places  ▭ ▭ ▭       │ Style · Language · Aspect · Target length · Created
 Deliverables  1080p MP4 · Arabic subtitles · 84 MB  [Download]   (exports, when there are any)
```

- **Preview:** the player slot *is* the preview. The muted hero preview does not apply on this page, because the cut
  is right there.
- **Phone:** the player comes first, at full width. Then the poster at 96 px beside the slate and title, then the
  strip (horizontal scroll), then the actions (Continue at full width).
- **Tablet:** poster 160 beside the player.
- **RTL:** the poster sits on the right. The strip and the player stay LTR inside.
- **Files:** `src/components/workspace/FilmWorkspace.tsx` → `film/FilmPage.tsx` + `film/FilmOverview.tsx`;
  `src/app/(app)/shorts/**`.

### 6.6 The cutting room (Short, Episode and Music video workspace tabs)

Opening any workspace tab switches the page's `<Room>` to `cutting` and sets `data-density="compact"` on the
workspace root (unless Settings chose Comfortable). The hero folds into the CompactHeader with the tabs inside it
(§4.8), the sidebar collapses to the NavRail, and the art tint goes. Returning to Overview reverses all three.

```
┌ CompactHeader 48: ‹ [poster] Paper Boats · ● Producing   [Overview|Story|Cast & World|Storyboard|Produce|Final cut]   Saved   [ Produce shot 7 ] ⋯ ┐
├ Shots (280, docked) ─────┬ canvas (--canvas, native ratio) ───────────────────────────┬ Inspector (320) ─────────────────┤
│ 1 ▣ Wide · river   ●     │                                                              │ Shot 7 · Close-up · 3.5 s        │
│ 2 ▣ Close · Hana   ●     │                    [ the selected take ]                     │ Purpose ……                       │
│ …                         │                                                              │ Takes  [v1] [v2] [v3]  Compare   │
│ 7 ▣ Close · boat   ◐     │ ‹ │ ▶ │ › · J K L · I O · 00:00:03:12 / 00:00:03:12 · Fit    │ ▸ Details (prompt, references)   │
├───────────────────────────┴──────────────────────────────────────────────────────────────┴──────────────────────────────────┤
│ ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣  film strip (64 px, 1 px gaps)    — on Final cut: the Timeline (§5.14); > 5 min: DualScaleStrip │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Tab | Canvas | List | Inspector | Header primary | Notes |
|---|---|---|---|---|---|
| **Story** | The writing surface: "paper" (`--input`), prose 15/26 at a 720 measure, scenes as headed blocks | Scenes | The scene's facts: place, time of day, characters, purpose, entry/exit | *Write the script* or *Develop the story*. The difference is said in a 1-line description under each in the ⋯ menu, never only in a tooltip (UX A4). | The story approval gate is a compact ApprovalCard pinned at the top of the canvas while waiting |
| **Cast & World** | Two sections of selectable FigureTiles and PlateTiles; items from the show show "From the show" and cannot be removed here | — | The selected character's or place's summary | *Done* | Replaces the two picker tabs (UX A4) |
| **Storyboard** | The board on `--canvas`: frames at the production aspect, `--r-precise`, 12 gap; shot number `.tc`, purpose on 1 line, duration | Scenes | Shot fields | *Draw missing frames* | Reorder: drag, *Move earlier / later* in the menu, Alt+←/→ (2.5.7). Deleting uses ConfirmDialog (no `window.confirm`). Lock pre-warning line (UX F1). |
| **Produce** | CanvasPlayer on the selected take; CompareAB for two takes | Shots with take state | Takes as **radio cards** (one click chooses; fixes the double-click); a rejected take shows its reason as text under its thumbnail; provenance behind *Details* | *Produce every shot* / *Produce shot 7* | "This take will fix the look and voice of Hana and Layla" shows once per character (UX F1) |
| **Final cut** | CanvasPlayer + Timeline | — | Mix, subtitles, export (Format · Resolution · Subtitles, translated) | *Export* (disabled with its reason as text under it, not a tooltip) | The cut approval gate is a compact ApprovalCard |
| **Song & Lyrics** (music) | LyricView in edit mode over the Waveform | Sections | The section: kind, singers (menu), timing nudges | *Write the song* / *Replace the song* | — |
| **Performers / Visual story** (music) | CastGrid with "sings N of 8"; the treatment as ChoiceTiles | — | — | — | — |

- **Tablet:** the canvas is full width. The list is a start drawer and the inspector an end drawer, each opened from
  a labelled header button.
- **Phone:** one pane. A segmented control at the top switches *Shots · Frame · Details*, and the inspector is a
  bottom sheet.
- **Focus mode (F):** everything except the canvas collapses.
- **RTL:**
  - The list panel docks on the right and the inspector on the left.
  - The canvas, transport, strip and timeline stay LTR.
- **Files:** `src/components/workspace/**` (P1b), except the music tabs (P1c).

### 6.7 Music Videos catalogue `/music-videos`

**Signature:** sleeves you can play from the wall. Playing one brings up the PlayerBar.

```
Music Videos  5                                                                   [ New music video ▾ ]
Songs, and the videos made for them.
[🔍 Search ]  [ Filter ▾ ]  Sort: Recent ▾
┌1:1───┐ ┌1:1───┐ ┌1:1───┐ ┌1:1───┐ ┌1:1───┐                   ← 5 cols ≈ 205
│      │ │      │ │      │ │Untit-│ │      │
│   (▶)│ │   (▶)│ │   (▶)│ │led   │ │   (▶)│                   ← play disc on hover, focus and touch; only when a song exists
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘
Rooftop Radio [⋯]
Amina & Samir                                                   ← performers, 13/20 muted
3:42 · 24 shots · ● Storyboard
                                    ┌ PlayerBar (fixed bottom, when playing) ──────────────────────────┐
                                    │ [sleeve] Rooftop Radio · Amina & Samir  (‖)  ━━━━━━━━  1:12 / 3:42  ✕ │
```

- **Empty:** a 1:1 TitleCard "Untitled song" (3 cols) with the sentence "Start with the song: let the studio write
  it, or bring one you have." Actions: *Write the song* (Auto) and *Upload a song* (Manual).
- **Facet filter:** Treatment (Performance · Narrative · Mixed) · Language · Status.
- **Tablet** 3 columns; **phone** 2 columns. The play disc is always visible on touch.
- **Files:** `src/app/(app)/music-videos/page.tsx`, `src/components/library/MusicVideoCard.tsx` (`TrackCover` is
  removed; TitleCard replaces it).

### 6.8 Music video `/music-videos/[id]`

**Purpose:** music first, then the film. This is not the Shows interface reused: there is no backdrop and no episode
grid, the transport comes first, and it has a table of sections.

```
┌ wash from the sleeve (fades to --bg by 420 px) ─────────────────────────────────────────────────────────────────┐
‹ Music Videos
┌ sleeve 280 ┐  Music video · 2026 · 3:42 · 8 sections · 24 shots · Pop · ● Storyboard
│            │  Rooftop Radio                                        ← .t-hero-sm (title voice)
│            │  (◯) Amina  (◯) Samir · Arabic (Iraqi)                 ← performers: 28 px faces
└────────────┘  (▶)  [ Song | Video ]  0:42 ━━━━━━━━━━━━━━━━━━━━━ 3:42  🔊   [ Continue: Storyboard ]  [ ⋯ ]
━ Overview · Song & Lyrics · Performers · Visual story · Storyboard · Produce · Final cut ━━━━━━━━━━━━━━━
Overview, Song mode:
┌ Sections (7 cols) ─────────────────────────────────────┐  ┌ Lyrics (5 cols, LyricView, synced) ─────────┐
│ #  Section   Singer      Shots       Time               │  │ Chorus                                       │
│ 1  Intro     —           ▪▪▪ 3/3     0:00–0:12          │  │ (◯) يا راديو السطح، غنّي لنا       ← active  │
│ ● 2 Verse 1  (◯) Amina    ▪▪▫ 2/3     0:12–0:46          │  │ (◯) The city sleeps below us        ← muted  │
│ …                                                        │  │ …                                            │
│ 3:42 · 8 sections · 24 shots · song version 3            │  └──────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────┘
Overview, Video mode: the stage below the hero becomes the InlinePlayer (16:9, or 9:16 centred) + FilmStrip; at ≥ 1280
the LyricView stays beside it as live captions. With no cut: the StoryboardReel, labelled.
Performers (CastGrid: "sings 3 of 8 sections")  ·  Visual story (treatment + mood)  ·  About (Genre · Mood · BPM · Source)
```

- **PlayerBar:** appears when the hero transport scrolls out (it replaces `MiniPlayer`), and carries Song | Video.
- **Phone:**
  - The sleeve is full width up to 320, then the slate and title, then the transport: the play disc and the switch on
    one row, the seek bar on the next.
  - Tabs scroll. The sections table puts shots on the second line. Lyrics follow the table at full width.
- **Tablet:** sleeve 220; sections and lyrics stacked.
- **RTL:**
  - The sleeve sits on the right and the scrim and wash do not move.
  - The transport, seek bar and waveform stay LTR, and the play glyph is never mirrored.
  - Arabic lyric lines align right and English lines align left, each to its own start, inside either UI.
- **Files:** `src/components/workspace/MusicWorkspace.tsx` → `music/MusicPage.tsx`, `music/MusicOverview.tsx`; music
  tabs; `src/app/(app)/music-videos/**`.

### 6.9 Characters directory `/characters`

**Signature:** the casting line-up. Every figure stands in the same 928:1664 frame on its own grey field, with feet
on one baseline. Drafts waiting for approval come first.

```
Characters  12                                                       [ New character ▾ ]  ← Describe them · Write the sheet · From a picture
Your studio's cast: one image and one voice each, across every production.
[🔍 Search the cast…          ]  [ Filter (1) ▾ ]   Sort: Recent ▾   [▦ | ☰]
 Approved ×  Clear all
Waiting for your approval  2                                        ← only when drafts exist
┌fig┐ ┌fig┐
Layla Hassan            [⋯]
Café owner
● Draft — awaiting your approval
[ Approve ]  [ Open ]                                               ← secondary buttons; approving from the line-up is allowed
All characters
┌fig─┐ ┌fig─┐ ┌fig─┐ ┌fig─┐ ┌fig─┐ ┌fig─┐                              ← 6 cols ≈ 167 × 299
│    │ │    │ │    │ │Nour│ │    │ │    │                              ← TitleCard: no image yet; the name in the title voice, no initials or silhouettes
│    │ │    │ │    │ │    │ │    │ │    │
└────┘ └────┘ └────┘ └────┘ └────┘ └────┘
Elias Moore      [⋯]
Retired lighthouse keeper
● Approved · No voice · English
```

- **Approve from the line-up.** It uses the same ApprovalCard logic in compact form. A failed check opens the
  override dialog asking for the reason (contract §3).
- **Filter facets:** Identity (Draft · Approved · Locked · No image) · Voice (Has voice · No voice) · Style ·
  Language · In production (show or short) · Usage (Unused · In videos; "unknown" is not offered, UX A6).
- **Group by:** None / Production. Grouping by production shows one rail per show or short.
- **List view:** rows with a 40 px FaceCircle · name + role · where they are cast · language · identity · voice ·
  menu.
- **Card menu:** Open · Voice · Duplicate as variant · Delete. Delete is disabled with its reason when the character
  is locked.
- **Empty (the casting call):** three 928:1664 TitleCards in a row, each 2 columns wide: "Describe them", "Write the
  sheet" and "From a picture". Each has a one-line hint under it ("A line is enough", "You fill it in", "Start from
  a reference") and opens `/characters/new?start=…`. The shape teaches the canonical frame.
- **Tablet:** 4 columns. **Phone:** 2 columns.
  - Search goes full width, with Filter · Sort · View on one row.
  - The menu sits beside the name, never on the boots (V4-09).
- **RTL:** the line-up starts at the right. Figures are never mirrored.
- **Files:** `src/app/(app)/characters/page.tsx`, `src/components/character/CastCard.tsx` → FigureTile composition.

### 6.10 Character profile `/characters/[id]`

**Purpose:** a premium cast profile around one canonical image and one voice (contract v2 §4). **Signature:** a
standing figure you can hear.

```
‹ Characters
┌ FigureHero 928:1664 ────────┐   Character · Cartoon · English · ● Approved · Version 1 · 3 Oct 2026
│ on --art-edge (its own grey) │   Elias Moore                                        ← .t-hero-sm (title voice)
│ no black bars (V4-02)        │   إلياس مور                                           ← lang="ar"
│ sticky top 24 (viewport ≥ 820)│   Retired lighthouse keeper and radio repairman.     ← lead
│                              │   (▶) ▁▂▅▇▅▂▁▂▅ 0:04  "Every frequency has a story."   Studio-designed synthetic voice
│                              │   [ Edit ▾ ]  [ Redraw ]  [ ⋯ ]                       ← Approved: no ivory primary
│                              │   ── About · Look · Voice · Productions · Notes ──    ← AnchorNav (sticky)
│                              │   About        personality (prose); traits as a quiet list
│                              │   Look         the look, in words: only filled facts, a 2-col definition list
│                              │                (term 13/20 faint, value 14/22 body, regular weight, start-aligned)
│                              │   Voice        the voice identity panel (v3 §9.7 + voice contract v2)
│                              │   Productions  usage rows (16:9 thumb · title · shots · first used · image version)
│                              │   Notes        autosaved
└──────────────────────────────┘   ▸ Secondary material (collapsed)                     Delete character (quiet)
```

| Identity state | Slate status | Action row | Figure frame |
|---|---|---|---|
| **No image** | ● No image yet (faint) | `[ Draw the image ]` (primary), Edit ▾ | TitleCard with the name |
| **Drawing** | ● Drawing (tally) | Cancel (quiet) | The phase inside the frame ("Drawing Elias · 2nd in the GPU queue") |
| **Draft** | ● Draft — awaiting your approval (warn) | `[ Approve ]` (primary), Redraw, Edit ▾ | Draft figure, true pixels (no brightness filter) |
| **Approved** | ● Approved | Edit ▾, Redraw, ⋯ | — |
| **Locked** | 🛡 Locked · in 2 videos | Edit ▾ (details only), ⋯ › Duplicate as variant; Redraw disabled with the sentence "Elias has been in 2 videos, so his look is kept. Duplicate him as a variant to change it." | — |

- **Edit ▾** offers Details · Look · Voice characteristics. Each opens a dialog of ≤ 6 fields (exists:
  `EditDialogs.tsx`).
- **⋯** offers Duplicate as variant · Adjust face crop · Delete.
- **The lock is said once**, in the slate, with the slim bar inside the Voice panel (v3).
- **Voice panel:** the voice contract's origin labels; measured numbers behind *Check details*; "I listened"
  recording. No engine or model name in the visible copy; running jobs say "Designing three candidate voices" (fixes
  V4-10).
- **Phone:**
  - The figure is full width, max 70vh, on its grey field.
  - Then the slate, name, voice reel and action row (Approve full width when Draft).
  - Then the AnchorNav as a sticky chip row, and the sections.
- **Tablet:** the figure is 300 wide beside the text, and sticky.
- **RTL:**
  - The figure sits on the right.
  - English content inside the Arabic UI keeps `dir="auto"` and starts at the right edge (v3 rule kept).
  - The waveform stays LTR.
- **Files:** `src/components/character/CharacterPage.tsx` and its sections, `ImagePanel.tsx` (→ FigureHero
  composition) and `VoiceSection.tsx`. The F7 split (`character/voice/*`) is part of P2.

### 6.11 Character creation `/characters/new`

This is v3 §9.5 in the CreationShell, with these changes:
- The preview frame and the "From a picture" drop target are **928:1664**, not 4:5.
- The chain is *design → image → voice* (contract). The Ready card shows the figure, the name, the role, the voice
  row if one was made, and **`[ Approve the image ]`** (primary), *Open profile* (secondary) and *Draw again*
  (quiet). It ends in the state "awaiting your approval".
- Methods: *Describe them* · *Write the sheet* (Identity · Look · Voice stepper) · *From a picture*.
- No preselected identity facts (v3 E5).
- Inputs carry across methods (3.3.7).
- **Phone:** the method tiles become 64 px rows, and the footer is a sticky bar that never covers the focused field.

### 6.12 Locations `/locations`, `/locations/[id]`, `/locations/new`

**Catalogue signature:** a scouting board of big plates (2 columns at 1440 and at 834; 1 on a phone).

- Slate: "Interior · Day · Dusk · Night · in 3 productions".
- On hover (not under reduced motion) the plate crossfades through its lighting states.
- **Empty:** a 2.39:1 TitleCard "A place for your story" with the sentence "Describe a place, or start from a
  photo." Actions: *Describe it* · *From a photo*.

**Location page.** One page with an AnchorNav, like a character: both are library assets. Its signature is the
lighting switch.

```
‹ Locations
┌ PlateHero: master plate, 2.39:1 focal crop, full content width, nothing over it ─────────────────────────────┐
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
[ Day | Golden hour | Dusk | Night ]  + Add lighting        Redraw plate · Add a view       ← quiet toolbar under the plate
Location · Interior · Cartoon · in 3 productions
Abu Samir's Café                                            ← .t-hero-sm
مقهى أبو سمير
A narrow café off Al-Mutanabbi Street; the radio sits above the tea urn.
[ Use in a production ▾ ]  [ Edit ▾ ]  [ ⋯ ]
── About · Views · Props · Used in ──
Views   ▭ Master  ▭ Wide  ▭ Reverse  ⬚ Detail (Draw)      ← 16:9 stills in a fixed order; a missing view is an outlined frame with Draw
About   description (prose) + continuity facts (period, weather, key props): only filled facts
Used in rows: 16:9 thumbnail · production · scenes
```

- The lighting switch crossfades the plate in `--t-media`, or instantly under reduced motion. Only states that exist
  are offered.
- *Use in a production ▾* lists shows and shorts and adds the place to the chosen one.
- **Creation:** the CreationShell with *Describe it* (Auto) and *From a photo* (reference with a 16:9 shaped
  dropzone). Fields: name, interior/exterior, description, lighting states as chips.
- **Phone:** the plate is 16:9, the switch scrolls horizontally, and views are a horizontal strip.
- **RTL:** the toolbar and switch mirror; the plate is never mirrored.
- **Files:** `src/components/location/*`, `src/app/(app)/locations/**`.

### 6.13 Studio Company `/studio`, departments and agents

**Keep v3 §9.1–9.3 as built** (V4-13, V4-14). Changes:

1. **The stage loses its card.** The orbit sits on a borderless `--sunken` band that runs to the content edges
   (`.bleed`, no radius, no border). "Structure felt not seen".
2. **Inspector with nothing in production.** No three "0" rows: one sentence, "Nothing in production." *How the
   company works* becomes a 4-step ordered list:
   1. Story writes it.
   2. Casting and World Building give it faces and places.
   3. Pre-production, Sound and Video make it.
   4. QA checks and Post-production cuts.

   "You approve the story and the cut" closes the list as a sentence.
3. **Recent handoffs** become a timeline list: monogram 28 · "Story → Casting" · the edge state in words ·
   production · time.
4. **No art and no tint here, ever.** The page title stays `.display-xl` in the UI voice: this page is about people,
   not pictures.
5. **Phone and tablet:** the spine and the stacked inspector stay as v3 specifies.
6. **Department and agent pages:** v3 §9.2–9.3 are kept. Add `DocumentTitle`, and keep technical details behind
   *How this department works*. An agent's running-job line uses words, never model names.

**Files:** `src/components/studio/*`, `src/app/(app)/studio/**`, `src/app/styles/studio.css` (the `co-*` rules, moved
by F0).

### 6.14 Production `/production`: the control room

**Signature:** the content to approve is on the card.

```
Production
3 waiting for you · 2 in production · Images busy: drawing "Layla", 2 queued           ← one sentence, live
Needs you  3
┌ ApprovalCard: Story · The Last Sip — Episode 4 ──────────────────────────────────────────────────┐
│ [script excerpt on paper]           Story Development handed it over · 12 min ago                │
│                                     Approve the story to start storyboarding.                    │
│                                     [ Approve ]  [ Request changes ]  [ Open ]                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
┌ ApprovalCard: Image · Layla Hassan ── figure 240 h ── [ Approve ] [ Redraw ] [ Open ] ───────────┐
On the floor  2
 [57×32] The Last Sip · S1 · E3   Episode   ▮▮▮▯▯▯  Storyboard · drawing frame 13 of 20 · 4 min      [ Open ]
 [21×32] Paper Boats              Short     ▮▮▮▮▯▯  Producing · shot 7 of 20 · 12 min                [ Open ]
Engine room
 Images ● Busy (1 running, 2 queued) · Video ● Ready · Voices ● Ready · Story ● Ready · Music ● Ready   Settings › Engines
Activity                                                     [ All | Running 1 | Failed 1 ]
 state      job (in words)              for              when        took     actions               ← compact table, 36 rows
 ● Failed   Draw the character image    Elias Moore      60 min ago  —        Retry · Details ▸
            The image engine stopped 3 times with an engine error.       ← plain words; the raw exception only in Details
▸ Reliability · last 7 days                                  ← disclosed, and present only after ≥ 1 run
```

- **Character image approvals** join the queue alongside the pipeline gates (STORY, EDIT). A draft canonical image
  is a decision waiting for the producer.
- **Request changes** works as in §5.15, inline and with the text kept.
- **Empty:**
  - "Nothing in production." with *New…*.
  - Then the pipeline drawn once as a labelled strip: "How a production moves: Story → Cast & world → Storyboard →
    Produce → Final cut". The two human gates are marked "You approve".
  - No zeros, no table.
- **Copy fix:** "from Projects" goes (V4-06).
- **Phone:** each ApprovalCard stacks its content over the decision. *On the floor* rows wrap to two lines. Activity
  becomes a list.
- **Routes:** `/jobs` redirects to `/production#activity`.
- **Files:** `src/app/(app)/production/page.tsx` (split into `components/production/*`), `src/app/(app)/jobs/page.tsx`
  (becomes `components/production/Activity.tsx`).

### 6.15 Screening Room `/screening`

**Signature:** lights down. The page is the theatre (`data-room="theatre"`).

```
Now screening                                                       ← 13/20 faint, the only label above the film
┌ TheatrePlayer, native ratio, max 76vh, on #000 ─────────────────────────────┐   ┌ Notes (≥ 1440, 320) ──────┐
│                                                                            │   │ 00:01:12  The boat sinks │
│                                                                            │   │   too early. — you, 2 d   │
└────────────────────────────────────────────────────────────────────────────┘   └───────────────────────────┘
Short · 6:12 · Cut 4 · 2 days ago · ● Approved
Paper Boats                                                         ← .t-hero
[ Download ▾ ]  [ Open in production ]  [ ⋯ ]                        ← Download: format · resolution · subtitles · size
Programme                       [ All | Shows | Shorts | Music videos ]
┌ StillCard ┐ ┌ StillCard ┐ ┌ StillCard ┐                           ← 3 cols; kind label, runtime chip, slate, SAMPLE badge
```

- **Lights down.** While playing, after 2 s idle, the sidebar and everything above the player fade to 0.15. They
  return on pointer movement or focus, and focus is always visible. The change is instant under reduced motion.
- **Selection.** `?cut=<productionId>` selects what plays. The default is the newest cut.
- **Captions** are on by default when present.
- **Notes need the backend** (a timecoded `cut_notes` record, B2, phase 2). Until it exists, the notes panel and `N`
  are absent: never a fake panel.
- **Compare with the previous cut** appears only when a cut version history exists. Today there is one `cutAssetId`
  per production.
- **Empty:** a dark 16:9 frame on `#000` with "Nothing to screen yet. A cut appears here when Post-Production
  assembles it." and *Open Production*.
- **Phone:** the player is full width, with the title below. The programme is 1 column.
- **RTL:** the page mirrors, but the player and its transport stay LTR.
- **Files:** `src/app/(app)/screening/page.tsx` → `components/screening/*`.

### 6.16 Settings `/settings`

The deliberately plainest page. It implements v3 §9.8 and research §3.9 (V4-07).

```
Settings
The interface, defaults for new work, the engines, and the studio's data.
┌ sections (sticky, 200) ┐  Interface
│ Interface              │   Language                [ English | العربية ]
│ New work               │   Reduce motion           (toggle)        Also follows your system setting.
│ Engines                │   Contrast                [ Standard | More ]
│ Models                 │   Cutting-room density    [ Compact | Comfortable ]
│ Access                 │   Hero previews           (toggle)
│ Studio data            │   Single-key shortcuts    (toggle)        Only while a player or strip has focus.
└────────────────────────┘  New work       Style · Aspect · Language · Dialect (segmented and select controls)
                            Engines        Images — draws characters, places and frames          ● Ready     ▸ Details
                                           Video — films each shot                                ● Busy (1)  ▸ Details
                                           Voices · Transcription · Story · Music …
                                           (Details: the engine string, device and version in .tc .break-all)
                            Models         grouped by capability; plain name · size · licence · ● Present
                                           (Details: file path and hash, .tc .break-all)
                            Access         Password protection: On (set on the server).
                            Studio data    This studio started empty on 2 Oct 2026 and holds 1 character.
                                           Danger zone: Start with an empty studio… (ConfirmDialog that names what is deleted)
```

- **Removed:**
  - the "Sample data" reset (AUDIT C4/D2; the reset stays behind an environment flag for e2e)
  - the Reliability block (it lives in Production)
  - the paragraph of workflow hashes (it moves into Models › Details as a table)
- **Phone and tablet:** the sections nav becomes a horizontal chip row of jump links at the top.
- **Files:** `src/app/(app)/settings/page.tsx` → `components/settings/*`.

### 6.17 New… and the production creation flows

**`/new`: the shapes of Vewbox.** A start-aligned page (fixes V4-05). Each start is a TitleCard in its content's own
shape, so the five shapes of the system sit side by side.

```
New…
Choose what to make. Each one starts with a line, or with the studio's proposal.
Productions                                                       ← row heights equal (240 at 1440)
┌ 16:9 ──────────────────┐ ┌ 2:3 ──┐ ┌ 1:1 ──────┐
│ A show                 │ │A short│ │ A music   │
│                        │ │       │ │ video     │
└────────────────────────┘ └───────┘ └───────────┘
Seasons and episodes       One film   Starts with
sharing a cast and world              its song
Cast & world
┌ 928:1664 ┐ ┌ 2.39:1 ──────────────────────────────┐
│ A        │ │ A place                               │
│ character│ │                                       │
└──────────┘ └───────────────────────────────────────┘
```

- Each card opens its creation page.
- **Tablet and phone:** a list of 72 px rows, each with a 48 px-tall miniature of the shape, the name and the line.
- The figure crop of the old start card (V4-03) is gone.

**Creation pages** (`/new/show`, `/new/season?show=`, `/new/episode?show=&season=`, `/new/short`,
`/new/music-video`) all use the CreationShell (§5.19) with two methods:
- **Let the studio propose (Auto).** An AUTO_IDEA job, then the Review, then Create.
- **Write it yourself (Manual).** A brief, then optional steps.

| Kind | Auto: essential | Auto: More control | Manual: required | Manual: optional steps | Review shows | Lands on |
|---|---|---|---|---|---|---|
| Show | a line (optional) | Style · Language / dialect · Episode length (1 · 3 · 7 · 12 min · custom) · Episodes in Season 1 · Mood · Cast and places to include | a title **or** a line | Look (style, aspect) · People (cast, places) | Concept, title (+ Arabic), logline, synopsis, the Season 1 episode list (each title and line editable), cast (existing matches + new), places | The Show page, Episodes tab, Season 1 (never Episode 1, fixes UX A2) |
| Season | a line (the show is the context, shown as a 3-item list, UX A2) | Number of episodes · Arc | a title or an arc | — | Arc and episode list | The Show page at that season |
| Episode | a line | Length · Which of the show's cast | a title or a line | — | Title, logline, scene outline, cast | The Episode Overview |
| Short | a line | Style · Language · Length · Mood · Cast · Places | a title or a line | Look · People | Concept, title, logline, synopsis, cast, places | The Short Overview |
| Music video | **The song first:** let the studio write it (genre, mood, language, singers) | Treatment (Performance · Narrative · Mixed) · Length | upload a song **or** paste lyrics | Treatment · Performers | Song (lyrics in sections, singers), treatment, performers | The Music video page, Song mode |

- **Durations are words with a custom option,** never "Duration (seconds) 5–3600" (UX A2).
- **Example proposals are labelled.** When the story engine is unreachable, the fallback example is labelled "An
  example proposal, written in advance". A real proposal is never called a sample (AUDIT D3).
- **Waiting:** the progress stepper with the job's real phase, and *Cancel*.
- **Failure:** the notice keeps the brief and offers *Try again* · *Write it yourself* (carrying the brief over) ·
  *Use the example*.
- **Files:** `src/components/wizard/CreateWizard.tsx` → `wizard/{CreateFlow, AutoStart, Preferences, ProposalReview,
  ManualBrief, ManualSeason, SongStart}.tsx` (AUDIT F4); `src/app/(app)/new/**`.

### 6.18 Files `/assets`

A lobby page with CatalogueBar facets:
- Kind: Images · Video · Audio · Documents
- Tier: Canonical · Secondary · Raw (Raw is hidden unless chosen)
- Used / Unused

The grid holds frames in each file's own ratio, on 1:1 cells with `contain` on `--art-edge`. Labels are kind-first:
"Image · Elias Moore — canonical image". A row view is available. The detail opens as a Drawer (preview, provenance
behind *Details*, *Download*, *Delete* with ConfirmDialog).

---

## 7. Navigation and information architecture

### 7.1 Primary navigation

| Group | Items | Notes |
|---|---|---|
| Productions | Shows · Shorts · Music Videos | Home (`/`) redirects to Shows, which carries the Continue strip |
| Cast & world | Characters · Locations · Files | All three are library assets used across productions (UX-STRATEGY §C, research §2.7) |
| Studio | Studio Company · Production (needs-you count) · **Screening Room** | The Screening Room returns (V4-04) |
| Footer | Settings · Help & shortcuts · SaveState · connection · Collapse | Help sits in the same place on every page (3.2.6) |
| Above the groups | New… | Secondary; opens `/new`. Ctrl/⌘K → "New …" does the same. |

- The brand glyph links to `/shows`, the home. The current layout links it to `/studio`.
- The order is identical in the sidebar, the NavRail and the mobile sheet (3.2.3).

### 7.2 Routes, rooms and owners

| Route | Room | Default view | Owner |
|---|---|---|---|
| `/` | — | redirect `/shows` | F4 |
| `/shows` | lobby | grid | P1a |
| `/shows/[id]` (`?tab=episodes\|cast\|world\|bible\|production\|settings`, `?season=`) | lobby | Episodes, latest-touched season | P1a |
| `/shows/[id]/seasons/[seasonId]` | — | redirect `/shows/[id]?season=` | P1a |
| `/shows/[id]/seasons/[s]/episodes/[p]` (`?tab=overview\|story\|cast\|storyboard\|produce\|final`) | lobby → cutting | Overview | P1b |
| `…/episodes/[p]/shots/[shotId]` | cutting | — | P1b |
| `/shorts`, `/shorts/[id]`, `/shorts/[id]/shots/[shotId]` | lobby / lobby → cutting / cutting | grid / Overview | P1b |
| `/music-videos`, `/music-videos/[id]` (`?mode=song\|video`), `/music-videos/[id]/shots/[shotId]` | lobby / lobby → cutting / cutting | grid / Overview, Song | P1c |
| `/characters`, `/characters/new` (`?start=describe\|sheet\|picture&show=`), `/characters/[id]` | lobby | grid / Describe / profile | P2 |
| `/locations`, `/locations/new`, `/locations/[id]` | lobby | grid / Describe / page | P2 |
| `/assets` (Files) | lobby | grid | P3 |
| `/studio`, `/studio/departments/[id]`, `/studio/agents/[id]` | lobby (no tint) | diagram | P3 |
| `/production` (`#needs-you`, `#activity`) | lobby (no tint) | — | P3 |
| `/jobs` | — | redirect `/production#activity` | P3 |
| `/screening` (`?cut=`, `?kind=`) | theatre | the newest cut | P3 |
| `/settings` (`#interface`, `#new-work`, `#engines`, `#models`, `#access`, `#data`) | lobby | — | P3 |
| `/new`, `/new/[kind]` (`?show=&season=&proposal=`) | lobby | — | P1a |
| `/library` | — | redirect `/characters` | F4 |
| `/projects` | — | redirect `/shows` | F4 |

### 7.3 Page titles (fixes V4-11, WCAG 2.4.2)

The pattern is `<object> · <area> · Vewbox Studio`. A tab other than the default prefixes it. Names follow the UI
language: in Arabic, use `titleAr` or `nameAr` when the record has one.

| Route | English | Arabic |
|---|---|---|
| `/shows` | Shows · Vewbox Studio | المسلسلات · استوديو فيوبوكس |
| `/shows/[id]` | The Last Sip · Shows · Vewbox Studio | آخر رشفة · المسلسلات · استوديو فيوبوكس |
| `/shows/[id]?tab=cast` | Cast · The Last Sip · Shows · … | الشخصيات · آخر رشفة · المسلسلات · … |
| episode | Episode 3: The Radio Answers · The Last Sip · … | الحلقة 3: … · آخر رشفة · … |
| episode, Storyboard tab | Storyboard · Episode 3 · The Last Sip · … | القصة المصوّرة · الحلقة 3 · … |
| shot | Shot 12 · Episode 3 · The Last Sip · … | اللقطة 12 · الحلقة 3 · … |
| `/shorts`, `/shorts/[id]` | Shorts · …; Paper Boats · Shorts · … | الأفلام القصيرة · …; قوارب ورق · الأفلام القصيرة · … |
| `/music-videos`, `/music-videos/[id]` | Music Videos · …; Rooftop Radio · Music Videos · … | الفيديوهات الموسيقية · … |
| `/characters`, `/characters/new`, `/characters/[id]` | Characters · …; New character · Characters · …; Elias Moore · Characters · … | الشخصيات · …; شخصية جديدة · الشخصيات · …; إلياس مور · الشخصيات · … |
| `/locations`, `/locations/[id]` | Locations · …; Abu Samir's Café · Locations · … | المواقع · …; مقهى أبو سمير · المواقع · … |
| `/assets` | Files · … | الملفات · … |
| `/studio`, department, agent | Studio Company · …; Casting & Character Design · Studio Company · …; Casting Director · Casting & Character Design · … | شركة الاستوديو · … |
| `/production` | Production · … (with "(3) " in front while 3 decisions wait) | الإنتاج · … |
| `/screening` | Screening Room · …; Paper Boats · Screening Room · … | غرفة العرض · … |
| `/settings` | Settings · … | الإعدادات · … |
| `/new`, `/new/[kind]` | New… · …; New show · … | جديد… · …; مسلسل جديد · … (existing `wizard.new*` keys) |

Translations of tab and area names reuse the existing keys (`nav.*`, `tab.*`, `kind.*`, `screening.title`). New
strings go into the owning package's i18n file.

### 7.4 URL state and history

- Tabs, the season, Song/Video mode, filters, sort and view are URL search parameters. Back and forward restore
  them, and links can be shared.
- Filters are `?f=style:CARTOON,lang:AR`, so one parameter carries all active filters.
- Proposal reviews keep `?proposal=`, which exists today.
- Opening a workspace tab uses `router.push`, so Back returns to the lobby. Switching between workspace tabs uses
  `router.replace`, so Back leaves the workspace.

### 7.5 Global shortcuts

These never fire while focus is in a text field.

| Keys | Action |
|---|---|
| Ctrl/⌘ K | Command palette |
| ? | Shortcut sheet |
| Ctrl/⌘ \\ | Collapse or expand the navigation |
| F | Focus mode (cutting room, when focus is in the workspace) |
| Esc | Closes the innermost layer and returns focus |

Single-key media shortcuts are scoped to the focused player or strip (§5.12) and can be turned off (§4.9).

### 7.6 Command palette content

| Group | Entries |
|---|---|
| Go to | Every show, episode, short, music video, character, location and department. Results use kind-first labels and match Arabic and English names. |
| Create | New show, season (in the current show), episode, short, music video, character and location, each with *Let the studio propose* or *Write it yourself* |
| Decide | Every waiting approval ("Approve · Story of E4"). It opens the card; it does not approve blind. |
| Settings | "Contrast: More", "Reduce motion", "Language: العربية" |

### 7.7 The object graph (cross-links every page must offer)

| From | To |
|---|---|
| Show | its episodes, cast and places |
| Episode | its show and season, and the cast and places used in it |
| Character | every production it is cast in or was filmed in, and its voice samples |
| Location | every production and scene it is used in |
| Production | its stage in the Studio Company (the edge or department that holds it) and its waiting decisions in Production |
| Screening programme card | the production's Final cut tab |

---

## 8. Implementation plan

### 8.1 Packages and order

```
F0 Enablement ──► F1 Tokens ──┬─► F2 Interface kit ──┐
        │                     ├─► F3 Media + players ─┼─► P1a Shows + creation ──┐
        │                     └─► F4 Shell + nav ─────┤   P1b Shorts + cutting ───┼─► Q1 Consolidation
        └──────► B1 Presentation metadata (backend) ──┤   P1c Music videos ───────┤
                                                      ├─► P2 Characters + Locations
                                                      └─► P3 Studio · Production · Screening · Settings · Files
T  Title-voice spike (designer + F1 engineer, 1 day, any time after F1)
```

- **F1 merges in two steps.** It lands the tokens in the first 1–2 days so F2–F4 can start, then lands the type
  classes.
- **Pages start once their dependencies have merged:**
  - Every page group needs F2, F3 and F4.
  - P1c needs P1b's cutting-room shell (`film/Cutting.tsx`) only for its last three tabs. It starts with its
    catalogue and lobby.
- **B1 is optional for pages.** Without presentation data, heroes render neutral, which is a correct fallback. Pages
  never block on it.

| Package | People | Estimate | Starts after |
|---|---|---|---|
| F0 Enablement | 1 | 1.5 d | — |
| F1 Tokens and base | 1 | 2 d | F0 |
| F2 Interface kit | 2 | 5 d | F1 tokens |
| F3 Media kit and players | 2 | 6 d | F1 tokens |
| F4 Shell and navigation | 1 | 3 d | F1 tokens |
| B1 Presentation metadata | 1 (backend) | 2 d | F0 |
| P1a Shows, episodes' parent, creation flows | 1–2 | 6 d | F2, F3, F4 |
| P1b Shorts and the cutting room | 2 | 8 d | F2, F3, F4 |
| P1c Music videos | 1 | 5 d | F2, F3, F4 (tabs: P1b's shell) |
| P2 Characters and Locations | 2 | 7 d | F2, F3, F4 |
| P3 Studio Company, Production, Screening Room, Settings, Files | 2 | 6 d | F2, F3, F4 |
| Q1 Consolidation | 1 | 2 d | all |
| T Title spike | designer + 1 | 1 d | F1 |

### 8.2 Rules that keep parallel work conflict-free

1. **Exclusive ownership.** Every file listed in §8.3 has exactly one owner package. A file not listed is
   read-only for everyone. Change requests go to its owner as a short issue, and owners turn them around within a
   day.
2. **CSS.** F0 splits `globals.css` into `src/app/styles/*.css`, imported in order by `globals.css`.
   - Only F1 writes `tokens.css`.
   - Each package writes only its own sheet.
   - Components never hard-code colours, radii or durations; `scripts/v4-lint.mjs` enforces this.
3. **Strings.** F0 changes `src/lib/i18n.ts` to merge per-package files (`src/lib/i18n/v4/<pkg>.ts`, each typed
   `Record<string, readonly [string, string]>`). Each package adds keys only in its own file, under its own prefix
   (`shows.*`, `film.*`, `music.*`, `cast.*`, `studio.*`, `kit.*`, `media.*`, `shell.*`). A unit test fails on
   duplicate keys. Deleting old keys is Q1's job.
4. **Icons.** `icons.tsx` (owned by F2) re-exports `src/components/ui/icons/<pkg>.ts`, and each package adds icons
   only to its own file.
5. **Selectors and domain.**
   - New selectors go in `src/studio/selectors/<pkg>.ts`. `src/studio/selectors.ts` is read-only.
   - Only B1 may touch `src/domain/types.ts`, and only for `Asset.presentation`.
6. **Legacy shims.** F2 and F3 keep every old export (`Hero`, `Art`, `ArtCard`, `ArtRow`, `Card`, `MiniPlayer`, …)
   working through re-exports until Q1, so pages can migrate one at a time.
7. **Browser dialogs.** Each page package removes the `window.confirm` and `window.prompt` calls in its own files,
   using F2's `useConfirm()` and the inline note.
8. **Branches.** Branches are named `v4/<pkg>`. Merge order is F0 → F1 → F2/F3/F4/B1 → pages → Q1. No package edits
   another package's branch.

### 8.3 File ownership

| Package | Owns (exclusive) |
|---|---|
| **F0** | `src/app/globals.css` (the split itself, then hands each sheet to its owner)<br>`src/lib/i18n.ts` (the merge change only)<br>`src/components/library/Cards.tsx` (the split into `ShowCard`, `ShortCard`, `MusicVideoCard`, `LocationCard` and `StartCard` files)<br>`scripts/capture-evidence.mjs`<br>new `scripts/v4-fixture.ts`, `scripts/v4-lint.mjs`, `scripts/v4-titles.mjs`, `scripts/v4-contrast.mjs` (from this document's measurement) |
| **F1** | `src/app/styles/{tokens,base,type}.css`, new `src/app/fonts.ts` (font loading moved out of `layout.tsx` by F0), `src/app/fonts/*` |
| **F2** | `src/components/ui/kit.tsx` + new `ui/kit/*`<br>`ui/page.tsx`, `ui/progress.tsx`, `ui/jobs.tsx`, `ui/toast.tsx`, `ui/preview.tsx`, `ui/icons.tsx`<br>`src/components/library/Library.tsx` (→ CatalogueBar)<br>`src/lib/format.ts`, `src/lib/hooks.ts`<br>`src/app/styles/kit.css`<br>new `src/app/(app)/kit/page.tsx` (dev-only specimen; F3 adds sections through `components/media/Specimens.tsx`, which it owns)<br>`src/lib/i18n/v4/kit.ts` |
| **F3** | `src/components/ui/cinema.tsx` (shims), `src/components/library/ProductionTile.tsx`<br>new `src/components/media/**`, `src/components/edit/**`, all of `src/components/players/**`<br>`src/app/styles/{media,players,edit}.css`, `src/lib/i18n/v4/media.ts` |
| **F4** | `src/app/layout.tsx`, new `src/app/boot.ts`<br>`src/app/(app)/{layout,page,error,loading,not-found}.tsx`, `src/app/(app)/library/page.tsx`, `src/app/(app)/projects/page.tsx`<br>`src/components/ui/{nav,brand,locale}.tsx`, new `src/components/shell/**`<br>`src/studio/store.tsx` (only exposing `saving` and `unsaved` for SaveState, AUDIT D1)<br>`src/app/styles/shell.css`, `src/lib/i18n/v4/shell.ts` |
| **B1** | `src/domain/types.ts` (`Asset.presentation`), `src/server/db/schema.ts` (`assets.presentation`), migration `0008_asset_presentation`<br>new `src/server/media/presentation.ts`, the asset-ingest call site in `src/server/media.ts`<br>the `MEDIA_PROBE` producer (AUDIT C9)<br>new `scripts/presentation-backfill.ts`, new `src/studio/presentation.ts` (`artVars`) |
| **P1a** | `src/app/(app)/shows/page.tsx`, `src/app/(app)/shows/[id]/page.tsx`, `src/app/(app)/shows/[id]/seasons/[seasonId]/page.tsx`<br>`src/app/(app)/new/**`<br>`src/components/show/**`, `src/components/wizard/**`<br>`library/ShowCard.tsx`, `library/StartCard.tsx`<br>`src/app/styles/pages/shows.css`, `src/lib/i18n/v4/shows.ts` |
| **P1b** | `src/app/(app)/shows/[id]/seasons/[seasonId]/episodes/**`, `src/app/(app)/shorts/**`<br>`src/components/workspace/{Workspace,FilmWorkspace,ShotEditor,ShotForm}.tsx`<br>`workspace/tabs/{OverviewTab,StoryTab,StoryboardTab,ProduceTab,FinalCutTab,CastTab}.tsx`<br>new `src/components/film/**`<br>`library/ShortCard.tsx`, `library/CanonPicker.tsx`<br>`src/app/styles/pages/film.css`, `src/lib/i18n/v4/film.ts` |
| **P1c** | `src/app/(app)/music-videos/**`<br>`src/components/workspace/{MusicWorkspace,ReplaceSong}.tsx`, `workspace/tabs/{SongLyricsTab,PerformersTab,VisualStoryTab}.tsx`<br>new `src/components/music/**`, `library/MusicVideoCard.tsx`<br>`src/app/styles/pages/music.css`, `src/lib/i18n/v4/music.ts` |
| **P2** | `src/app/(app)/characters/**`, `src/app/(app)/locations/**`<br>`src/components/character/**` (including the AUDIT F7 split of `VoiceSection.tsx` into `character/voice/*`), `src/components/location/**`<br>`library/LocationCard.tsx`<br>`src/app/styles/pages/cast.css`, `src/lib/i18n/v4/cast.ts` |
| **P3** | `src/app/(app)/{studio,production,jobs,screening,settings,assets}/**`<br>`src/components/studio/**`, new `src/components/{production,screening,settings,files}/**`<br>`src/app/styles/studio.css`, `src/app/styles/pages/control.css`, `src/lib/i18n/v4/studio.ts` |
| **Q1** | Deletions across all of the above, once their owners have merged: shims, aliases, legacy classes (`.card`, `.badge-glass`, `.mark`, `.play-on-art` blur, `.hero-plain`, `.scrim-strong`, `TrackCover`), unused i18n keys (AUDIT G1). Updates `docs/IMPLEMENTATION-CHECKLIST.md`. |

### 8.4 The acceptance gate every package passes

1. **Build and tests.** `pnpm exec tsc --noEmit` and `pnpm exec vitest run` pass.
2. **Lint.** `node scripts/v4-lint.mjs <owned paths>` passes. It rejects:
   - `backdrop-filter` or `backdrop-blur` outside `players/TheatrePlayer`
   - `window.confirm` and `window.prompt`
   - `bg-gradient-*` and `radial-gradient`
   - `uppercase`, `tracking-[` and positive `letter-spacing`
   - raw hex or `rgb()` colours in components
   - physical `left`/`right` in components (logical properties only)
   - engine and model names in user-facing strings: a deny-list of ComfyUI, Qwen, VoxCPM, MiniMax, IndexTTS,
     Habibi, safetensors, cuda
3. **Screenshots.** Run `node scripts/capture-evidence.mjs --set <pkg> --fixture sample` and `--fixture empty`, plus
   `--fixture states` where listed. Each run covers **1440, 834 and 390 × EN and AR**, and the files go to
   `docs/evidence/v4-<pkg>-<page>-<state>-<lang>-<width>.png`.
   - The reviewer checks them against the page's wireframe, its signature and §1.2's tests.
   - Fixtures answer `/api/studio` and `/api/studio/org/*` from JSON in the browser only. **Nothing is written to the
     shared studio.**
4. **Accessibility:**
   - axe-core through Playwright: 0 serious or critical issues. This needs the devDependency `@axe-core/playwright`,
     to be approved in F0.
   - A keyboard-only pass in EN and AR, its steps listed in the PR.
   - Reflow at 320 px: no page-level horizontal scroll; rails and strips are allowed.
   - A 200 % zoom pass.
   - One page each under reduced motion and under More contrast.
5. **Titles.** `node scripts/v4-titles.mjs` shows every owned route with a distinct `document.title` in EN and AR.
6. **No regressions elsewhere.** The package's PR includes the before/after capture of `/shows` and
   `/characters/[id]` at 1440 EN, as a smoke check of shared parts.

### 8.5 Package specifics

**F0 · Enablement** (mechanical; no visual change)
- **Deliverables:**
  - the CSS split, the i18n merge, the Cards split, the fonts and boot moved into their own modules, and the
    per-package icon files
  - capture-evidence: `--device phone|tablet|desktop` (390×844 touch · 834×1112 touch · 1440×900), `--fixture
    sample|empty|states|<path>` (built by `scripts/v4-fixture.ts` from `src/domain/sample` plus a "states" variant
    with a draft character, a locked character, a production awaiting STORY approval, a running job and a failed
    job), `--set <pkg>` (the page list of each package), and `--axe`
  - `v4-lint`, `v4-titles` and `v4-contrast`
- **Acceptance:**
  - The 18 routes captured before and after at 1440 EN show no visible difference.
  - The fixture captures of `/shows` show the sample shows.
  - `v4-contrast` reproduces §2.6.

**F1 · Tokens and base**
- **Deliverables:**
  - §2.1 exactly
  - §2.2 theme additions
  - §2.3 room selectors, density, contrast and scroll-padding
  - §3.3 type classes, with `--font-title` at T0
  - `@property --art`
- **Acceptance:**
  - `v4-contrast` passes every row of §2.6.
  - Captures of 6 existing routes in EN and AR at 1440 and 390 show only the intended changes: the dimmer nav and the
    new title tokens. No layout shift.
  - `prefers-contrast: more` and `data-density="compact"` are demonstrated on the specimen page (the F2 route).

**F2 · Interface kit**
- **Deliverables:** §5.2 PageHeader, §5.10, §5.11, §5.15 (shell), §5.16, §5.17 (including CommandPalette and
  ShortcutSheet as shells for F4), §5.18 and §5.19, plus `useConfirm()` and the AUDIT D6 error-copy entries (§8.7).
- **Acceptance:**
  - The specimen page `/kit` shows every component in every state (rest, hover, focus, disabled, loading, error,
    selected), captured at 3 widths × EN/AR.
  - Keyboard tests (vitest + Testing Library): roving focus in Tabs, Segmented and ChoiceTiles; Dialog focus trap and
    return; Menu Esc; the Toast stays while focused.
  - The empty-hint lint test exists and fails on today's four duplicates (V4-01). Page packages turn it green.

**F3 · Media kit and players**
- **Deliverables:** §5.3–5.9, §5.12–5.14 and §5.20, including StoryboardReel, PlayerBar, LyricView, SectionsTable,
  SongTransport/Switch, Timeline, FilmStrip, DualScaleStrip, CompareAB and `useShortcutScope`.
- **Acceptance:**
  - The `/kit#media` and `/kit#players` sections, filled with `public/sample` media, are captured at 3 widths × EN/AR.
  - In AR, every transport, seek bar, waveform, strip and timeline has `dir="ltr"`. A test asserts this, and an AR
    screenshot shows the play glyph unmirrored.
  - Reduced motion: PreviewPlayer never starts (test).
  - Every drag has a button alternative (a checklist in the PR).
  - Waveform contrast is per §2.6.
  - PlayerBar sets `--bottom-bars`, and a focused element below it scrolls clear (test).
  - Without presentation data, every hero renders neutral (test).

**F4 · Shell and navigation**
- **Deliverables:** §5.1, §7 (routes, redirects, titles infrastructure, palette, shortcuts, help), the `<Room>`
  component (§2.3), SaveState with real pending and failed states, ServerBar, and the preference boot (contrast,
  density, previews, keys).
- **Acceptance:**
  - Captures at 1440 (sidebar), 834 (rail), 390 (bar + open menu) and Ctrl/⌘K open, in EN and AR.
  - Navigating `/library`, `/projects` and `/jobs` lands on the redirect targets.
  - SaveState shows "Saving…" while a command is in flight (test with a delayed route).
  - The Screening Room is in the navigation.
  - The brand glyph is monochrome; the violet mark remains only as the favicon.

**B1 · Presentation metadata**
- **Deliverables:** §2.4 data, the extraction on ingest, the backfill script and `artVars`.
- **Acceptance:**
  - Unit tests:
    - a grey-backdrop figure yields no `dominant` and an `edge` ≈ its grey
    - a saturated key art yields a hue
    - the clamp keeps L and C
    - `lightBackdrop` is set for white borders
  - The backfill is idempotent.
  - The migration applies cleanly on a copy of the dev database.

**P1a · Shows, creation flows**
- **Scope:** §6.1, §6.2, §6.17.
- **States to capture:**
  - `/shows`: sample, empty
  - `/shows/<id>`: each of the 6 tabs; no-seasons; preview paused
  - `/new`
  - `/new/show`: start (Auto selected), Manual step 1, Review (fixture proposal)
  - `/new/season`, `/new/episode`
- **Checks:**
  - The hero has one ivory primary; the Production tab board is a table.
  - Manual show creation lands on the Show page (an e2e test with a mocked command).
  - The empty hint is not the lead.
  - The season redirect works.
  - The 21:9 crop follows the focal point.

**P1b · Shorts and the cutting room**
- **Scope:** §6.3–6.6.
- **States to capture:**
  - `/shorts`: sample, empty
  - `/shorts/<id>`: Overview with a cut, with a storyboard only, and with nothing
  - each workspace tab
  - the episode Overview
  - a shot page
  - the cutting room at 834 (drawers) and 390 (segmented panes)
- **Checks:**
  - The room switch: `data-room="cutting"`, compact density and no tint on workspace tabs.
  - A take is chosen with one click.
  - No `window.confirm` in the owned files.
  - Export's disabled reason is text.
  - The lock pre-warning shows once.
  - No nested scrollbars.

**P1c · Music videos**
- **Scope:** §6.7, §6.8.
- **States to capture:** `/music-videos` (sample, empty); `/music-videos/<id>` in Song mode, Video mode (cut) and
  Video disabled (no cut); the Song & Lyrics tab in edit; the PlayerBar visible after scrolling.
- **Checks:**
  - Song⇄Video keeps the playhead (test on the sync bus).
  - Lyric lines align to their own script in both UIs.
  - Singer assignment works without drag.
  - The page shares no hero component with Shows.

**P2 · Characters and Locations**
- **Scope:** §6.9–6.12.
- **States to capture:**
  - `/characters`: sample, empty, states (drafts first)
  - `/characters/<id>`: no image, drawing, draft, approved, locked, no voice
  - `/characters/new`: the three methods and the Ready card
  - `/locations`: sample, empty
  - `/locations/<id>`: with two lighting states, the switch mid-crossfade off under reduced motion
  - `/locations/new`
- **Checks:**
  - No black bars around figures (V4-02).
  - The menu is not on the art (V4-09).
  - No engine names (V4-10).
  - The lock is said once.
  - The figure stays sticky without hiding its actions at 1440×900.
  - Approve from the line-up opens the override dialog on a failed check.

**P3 · Studio Company, Production, Screening Room, Settings, Files**
- **Scope:** §6.13–6.16, §6.18.
- **States to capture:**
  - `/studio`, a department and an agent (from the live org)
  - `/production`: states (approvals, on the floor, a failed job), empty
  - `/screening`: sample, empty, lights down mid-play
  - `/settings`: each section
  - `/assets`
- **Checks:**
  - No raw exception text outside *Details* (V4-06).
  - The stage band has no border.
  - Settings has no Sample-data reset and no model file names outside *Details* (V4-07).
  - Theatre lights down return on focus.
  - The Screening notes panel is absent until B2 exists.

**Q1 · Consolidation**
- **Deliverables:**
  - delete the shims and legacy CSS listed in §8.3
  - delete the unused i18n keys (AUDIT G1)
  - run the whole capture matrix: every package's set, EN/AR × 1440/834/390, sample and empty
  - record the evidence index in `docs/IMPLEMENTATION-CHECKLIST.md`
- **Acceptance:** `v4-lint` passes on all of `src/`, and every capture matches its page spec.

**T · Title-voice spike.** §3.2. The output is an amendment to §3.2 and, if T1 or T2 wins, F1 adds the files and
the licences.

### 8.6 Backend follow-ups these specs reference (not in the frontend packages)

| # | Need | Used by |
|---|---|---|
| B2 | Timecoded cut notes (`cut_notes`: production, cut version, timecode, text, author) | Screening Room notes, ticks on the seek bar, `N` |
| B3 | Cut version history (keep previous `cutAssetId`s) | *Compare with the previous cut* |
| B4 | A TRAILER deliverable kind | The Show page *Watch* rail |
| B5 | Lead and supporting roles on show cast | CastGrid groups |
| B6 | A key-art drawing job | The *Draw key art* action on the Show and Short Settings |
| B7 | Image approvals in the org pipeline queue (draft canonical images as decisions) | Production's Needs-you queue. Until then the page derives them from `identityStatus`. |

### 8.7 Where the codebase audit's UI findings land

| AUDIT finding | Fixed by | How |
|---|---|---|
| D1 "Saved on the studio server" always shown | F4 | SaveState reads pending, in-flight and failed writes from the store (§5.1) |
| D2 Settings "Sample data" copy and reset | P3 | "Studio data" states the real seed kind; the reset leaves the UI (§6.16) |
| D3 Real proposals labelled "a sample proposal" | P1a | Two keys chosen by `brief.fromSampleProposal`; examples labelled as examples (§6.17) |
| D4 "once it is connected" copy | P1a | The example-review copy is rewritten with the creation flow |
| D5 Agent texts describe the old four-view sheet | Backend (org model, `ORG_VERSION` bump) | Out of frontend scope; P3 renders whatever the model says, without engine names |
| D6 `CONSENT_REQUIRED` and `ASSET_PROTECTED` fall back to a generic Retry | F2 | `KNOWN` in `ui/progress.tsx` gains both entries and is typed `Record<StudioErrorCode, …>` |
| F1 `i18n.ts` 1,643 lines | F0 (per-package files) + Q1 (dead keys) | §8.2 rule 3 |
| F4 `CreateWizard.tsx` 493 lines | P1a | Split into `wizard/{CreateFlow, AutoStart, Preferences, ProposalReview, ManualBrief, ManualSeason, SongStart}` |
| F7 `VoiceSection.tsx` 462 lines | P2 | Split into `character/voice/*` |
| Also large: `ShowWorkspace.tsx`, `ui/kit.tsx`, `studio/Company.tsx` | P1a, F2, P3 | `show/*` tabs; `ui/kit/*`; Company stays one module unless P3 touches its geometry |

---

## 9. Evidence and sources

### 9.1 Captures taken for this document (2026-10-03)

The prefix is `docs/evidence/v4-audit-`. Every page below was captured in English and Arabic at 1440 and 390 unless
marked:
- `shows`, `shorts`, `music-videos`
- `characters`, `characters-char-56c47abc59`, `characters-new`
- `locations`, `locations-new` (1440 only)
- `studio`, `studio-departments-CASTING`, `studio-agents-casting-director` (1440 only)
- `production`, `screening`, `settings`
- `new`, `new-show`
- `assets`, `jobs` (1440 only)

The suffixes are `-en-1440`, `-ar-1440`, `-en-390` and `-ar-390`. The command was
`node scripts/capture-evidence.mjs --prefix v4-audit --width <w> --lang <l> --suffix -<l>-<w> <paths…>`.

The studio held one approved character with a voice job running, and no shows, shorts, music videos or locations
(V4-16).

### 9.2 Facts measured for this document

- **Canonical figure frame:** 928×1664. `CANONICAL_FRAME` in `src/server/workflows/canonical-image.ts:130`, and the
  asset `gen-4b28ba8fe5` (`width 928`, `height 1664`). The prompt asks for a "plain neutral mid-grey studio
  background".
- **Location plates:** 1344×768. `src/worker/handlers/images.ts:407`.
- **Inter variable axes:** `opsz` 14–32 and `wght` 100–900, read from the `fvar` table of
  `src/app/fonts/InterVariable.woff2`.
- **Contrast:** every pair in §2.6, computed by the session's `contrast.mjs`. F0 commits it as
  `scripts/v4-contrast.mjs`.
- **Call sites:** `window.confirm` and `window.prompt` at 11 sites in 9 files. Blur and gradient utilities at 14 sites
  in 6 files.

### 9.3 Sources

- The research behind every reference in §1.4: `docs/research/DESIGN-RESEARCH-2026-10.md`, sources 1–46 (read
  2026-10-03).
- Font licences, read 2026-10-03:
  - Markazi Text: `https://github.com/google/fonts/tree/main/ofl/markazitext` (OFL.txt; METADATA.pb: license OFL,
    designers Borna Izadpanah, Florian Runge, Fiona Ross; axis wght 400–700; subsets Arabic, Latin, Latin Ext;
    DESCRIPTION.en_us.html)
  - Newsreader: `https://github.com/google/fonts/tree/main/ofl/newsreader` (OFL.txt; `Newsreader[opsz,wght].ttf`)
  - Amiri: `https://github.com/google/fonts/tree/main/ofl/amiri` (OFL.txt; Regular, Bold, Italic, BoldItalic)
  - Thmanyah: `https://ask.thmanyah.com/hc/en-001/articles/45993930027281-Thmanyah-Font-for-Everyone`. This is a
    search summary only: it allows commercial use in websites and apps, and forbids modifying, renaming,
    redistributing or "hosting it for download". The licence page itself was not read.
- WCAG 2.2 and Material 3 bidirectionality are cited through the research document (§1.15, §1.16, §5 there).

