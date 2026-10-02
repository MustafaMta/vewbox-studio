# Design system v3: the screening room, re-cut

Status: proposal for implementation · written 2026-10-03 · replaces DESIGN-SYSTEM-V2.md for the Studio Company,
Characters and Voice Identity experiences, and sets the tokens every other page inherits.
Evidence: `docs/evidence/design-audit-*.png` (index in §13). Research inputs: docs/research/PRODUCT-DESIGN.md,
docs/research/UX-STRATEGY.md, and the references in §2.

## 0. The direction (the producer's words)

> One coherent design system across the Studio Company, Characters and Voice Identity experiences.
> "cinematic dark surfaces, refined typography, warm neutral text, restrained accents, consistent spacing,
> high-quality imagery and purposeful motion"
> "Avoid excessive gradients, decorative glowing cards, generic dashboard layouts and crowded forms"
> The character-creation flow simple, advanced settings available without overwhelming; responsive, keyboard
> accessible, loading states, error recovery, Arabic RTL.
> "Do not simply reproduce the existing interface with different colors"
> The Studio Company page "should feature a central Studio Orchestrator, surrounded by the production departments in
> an elegant, interactive organizational visualization".

The reference image for the company page never reached us. This spec works from its description: a dark, premium
organisational diagram with the orchestrator at the centre, departments arranged around it, and illuminated
connections that stand for real handoffs. It should read as a creative company, not an infrastructure-monitoring
dashboard.

What "not a recolour" means here. v3 changes **structure**, not just values:
- The company page becomes a constellation plus an inspector. The KPI tiles go.
- Department and agent pages lead with people and state. Internals move behind disclosure.
- Character creation asks for intent first; configuration becomes a one-line summary.
- The voice becomes a first-class identity panel with preview, compare and choose.
- The accent loses five of its nine jobs, and the primary button becomes ivory.

---

## 1. Audit of the rendered UI

Captured 2026-10-02/03 against http://localhost:4200 (studio emptied: no characters, shows or productions).
- Plain pages were captured with `node scripts/capture-evidence.mjs` (headless Chromium, full page) at 1440 and 390 px
  wide.
- Interaction states (start modes, focus, hover, open panel) were captured with a throw-away Playwright script in the
  session scratchpad.
- Arabic was captured by switching `settings.uiLanguage` to `ar` through `POST /api/commands`, then switching it back
  to `en`. The switch-back was verified with `GET /api/studio`.
- Character profile pages could not be rendered because the studio has no characters. Their findings come from the
  code (`CharacterPage`, `AppearanceTab`, `VoiceTab`) and are marked *(code)*.

Severity: **S1** blocks a task or fails WCAG AA · **S2** clearly wrong or off-direction · **S3** polish.

### 1.1 Studio Company `/studio`

| # | Problem | Kind | Sev | Evidence |
|---|---|---|---|---|
| A1 | The diagram reads as a network monitor rather than a company: <br>- dashed spokes run from all 9 nodes to the hub<br>- every node is an identical icon-in-a-circle with "N agents"<br>- the hub has a double violet ring with a halo<br>- the hub label is "STUDIO ORCHESTRATOR" in tracked uppercase<br>Nothing says *people*, *who leads* or *what moved*. | dashboard feel, glow | S2 | `design-audit-en-desktop-studio.png` |
| A2 | The connections come from the static pipeline (`org.pipeline`), not from handoffs. An empty studio shows 11 arrows although nothing has ever been handed off. Story's three outgoing curves cut through the "Casting & Character Design" and "World Building" labels. | honesty, overlap | S2 | `…-en-desktop-studio.png`, `…-en-desktop-studio-focus-node.png` |
| A3 | A focused node's tooltip is painted under the next node. The tooltip lives inside a `z-index:3` node, so the following sibling (World Building) covers its last two lines. | z-order bug | S1 | `design-audit-en-desktop-studio-focus-node.png` |
| A4 | Connections are SVG strokes with `onClick` only: you cannot reach them by keyboard or screen reader. There is no arrow-key movement between departments; Tab walks 9 links in DOM order. The hover tooltip is the only description. | keyboard | S1 | code `Orchestrator.tsx` l.103 |
| A5 | Reliability is six KPI tiles squeezed into half a column. Labels break mid-word ("First-attempt accepta / nce", "QA rejection / s", "Per accepte / d shot") because `body { overflow-wrap:anywhere }`. Values are big em-dashes. | dashboard, overflow | S2 | `…-en-desktop-studio.png` |
| A6 | Empty states are dashed boxes inside cards (a double frame). The open orchestrator panel shows four uppercase kickers, each followed by "Nothing…". | empty states | S3 | `…-en-desktop-studio-orchestrator-open.png` |
| A7 | On a phone the organisation becomes a plain list with no handoffs at all, which is the point of the page. Every responsibility is cut mid-word with an ellipsis. | phone | S2 | `design-audit-en-phone-studio.png` |
| A8 | RTL: the ring is not mirrored, because positions use physical `left: x%`, so the pipeline still runs left-to-right. Reliability hints keep the English words "takes" and "jobs". Responsibilities and directors stay in English. | RTL | S2 | `design-audit-ar-desktop-studio.png`, `design-audit-ar-phone-studio.png` |
| A9 | The purpose line is defensive and long ("…nothing here is decorative.") and is repeated in other places. | copy | S3 | `…-en-desktop-studio.png` |

### 1.2 Department `/studio/departments/CASTING`

| # | Problem | Kind | Sev | Evidence |
|---|---|---|---|---|
| B1 | A rose gradient wash sits behind the header, and the stage card carries the same gradient (`DEPT_HUES`, one hue per department). Nine decorative hues fight the one-accent rule. | gradients | S2 | `design-audit-en-desktop-studio-departments-CASTING.png` |
| B2 | The page opens with four KPI tiles that all read **0**, then four dashed "Nothing…" boxes, then "Median time: —". It is an empty dashboard 1,850 px long (2,940 px on a phone). | dashboard, empty | S2 | same; `…-en-phone-studio-departments-CASTING.png` |
| B3 | The header carries a raw model string: "qwen3:14b (Ollama) + rule set · rule set · Qwen-Image-2512 / Qwen-Image-Edit-2511 (ComfyUI) · IndexTTS 2.5 / …". | jargon in hero | S2 | same |
| B4 | Both names in the title on the English UI ("Casting & Character Design اختيار وتصميم الشخصيات"). In Arabic the English name leads. | hierarchy | S3 | same; `…-ar-desktop-studio-departments-CASTING.png` |
| B5 | The director card sits alone in a 3-column row, then a gold gradient rule. In team cards the role wraps around a "Has not run yet" status. "Executes: 2 · 4 tools · 2 skills" is shown. Skills are green "ok" pills, so a semantic colour is used as decoration. Tools are code identifiers. | density, colour | S2 | same |
| B6 | Phone: agent names are cut ("Character Continuity A…"), and the "Director" badge wraps under the name. | overflow | S3 | `…-en-phone-studio-departments-CASTING.png` |
| B7 | RTL: the English responsibility inside an RTL paragraph without `dir="auto"` puts the full stop at the line start (".appearance lock"). The stage eyebrow stays in English. | RTL bidi | S2 | `…-ar-desktop-studio-departments-CASTING.png` |

### 1.3 Agent `/studio/agents/casting-director`

| # | Problem | Kind | Sev | Evidence |
|---|---|---|---|---|
| C1 | No identity: no monogram or face, just a name. The status ("Has not run yet") floats at the far end of the header, away from the title. | hierarchy | S3 | `design-audit-en-desktop-studio-agents-casting-director.png` |
| C2 | Four KPI tiles again: 0, —, —, 0. | dashboard | S2 | same |
| C3 | Internals are shown by default: <br>- the system prompt as the main "Instructions" card<br>- the aside shows "I/O CastingInput → CastingOutput", "Limits 60 min · 3 attempt(s) · LLM", and constants `APPEARANCE_LOCKED` / `VOICE_LOCKED`<br>- tools show "v1.0.0 · NONE" | jargon | S2 | same |
| C4 | RTL: a mixed plural ("3 محاولة(s)"); the full stop jumps to the start; disclosure chevrons point up. | RTL | S2 | `…-ar-desktop-studio-agents-casting-director.png` |

### 1.4 Characters `/characters` and creation `/characters/new`

| # | Problem | Kind | Sev | Evidence |
|---|---|---|---|---|
| D1 | The empty directory is a dashed box whose hint repeats the page subtitle word for word. A casting directory has no sense of portraits, and the three ways to start are not shown. | empty state | S2 | `design-audit-en-desktop-characters.png`, `…-en-phone-characters.png` |
| E1 | Configuration comes before intent. The "For / Visual style / Language / Dialect" card is the first thing on the page; on a phone it fills the first screen before the producer has said what they want to do. | flow | S2 | `design-audit-en-desktop-characters-new.png`, `…-en-phone-characters-new.png` |
| E2 | On a phone the three choice cards are 2-up at ~170 px (`ChoiceCards` min 11rem). Text wraps one or two words per line and the third card sits alone. Arabic is worse. V2 promised 1-up. | phone overflow | S1 | `…-en-phone-characters-new.png`, `…-ar-phone-characters-new.png` |
| E3 | The selected card has a 1 px accent border plus a 2 px ring, a double outline that reads as glow. The disabled primary is 45 % violet, a muddy 1.75:1 fill. | accent, states | S3 | `…-en-desktop-characters-new-picture.png` |
| E4 | Describe: the Name field beside a 3-row brief leaves a hole. The time estimate sits *under* the buttons. Preferences ask for age as a raw number and suggest "cat" for species. | layout | S3 | `…-en-desktop-characters-new-describe-preferences.png` |
| E5 | Write the sheet: Female / Adult / Mid / Measured are preselected without the producer choosing, and the preview states "CARTOON · 30 · FEMALE" as fact. The preview is a large empty grey gradient box. The "Identity" heading touches the "Name" label. The autofocused field shows a doubled focus outline (border + 3 px ring + outline). | honesty, rhythm | S2 | `…-en-desktop-characters-new-sheet.png` |
| E6 | Phone sheet: the preview breaks "Unname / d" mid-word, and the sticky action bar covers fields while you fill them. | phone | S2 | `…-en-phone-characters-new-sheet.png` |
| E7 | From a picture: the hint "PNG, JPEG or WebP · 512px · 20.0 MB" is cryptic. The drop area is a small dashed box, not a 4:5 frame, so the producer cannot see the shape that will be drawn. | imagery | S3 | `…-en-desktop-characters-new-picture.png` |
| E8 | RTL: the "For" label renders as a lone "ل" (`char.create.for = 'لـ'`). Every `Details` chevron points **up** whether open or closed, because `html[dir=rtl] .details>summary::before{rotate(135deg)}` outranks `.details[open]` and mirrors the already-logical borders a second time. | RTL mirroring | S1 | `…-ar-desktop-characters-new-sheet.png`, `…-ar-phone-characters-new.png` |
| E9 | The page is centred (`max-w-5xl`) while every other page is start-aligned in the 1320 column, so content jumps sideways between pages. | grid | S3 | compare `…-en-desktop-characters.png` / `…-characters-new.png` |
| P1 *(code)* | The profile's "Edit profile" opens one modal with the whole 22-field `CharacterForm`, which is the crowded form the direction rules out. The lock appears in three styles: violet shield card, `badge-accent` usage, warn "usage unknown". | crowded form | S2 | `CharacterPage.tsx` l.49, `AppearanceTab.tsx` l.112 |
| V1 *(code)* | Voice: "Choose a studio voice" is a disabled button with a sentence under it. There is no compare and no candidate. The validation line shows "−18 LUFS · 7 words". Every preview becomes a sample. | voice flow | S2 | `VoiceTab.tsx` l.75, l.115 |

### 1.5 Settings `/settings`

| # | Problem | Kind | Sev | Evidence |
|---|---|---|---|---|
| F1 | Models are raw filenames ("diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors"). Workflow hashes run as one paragraph that breaks mid-word on a phone. | jargon, overflow | S2 | `design-audit-en-phone-settings.png`, `…-en-desktop-settings.png` |
| F2 | Engine rows read "local MiniMax H3 in ComfyUI 0.38.1 on cuda:0 NVIDIA GeForce RTX 5090 : cudaMallocAsync". | jargon | S3 | same |

### 1.6 Across the app

| # | Problem | Kind | Sev | Evidence |
|---|---|---|---|---|
| G1 | **The accent is everywhere.** Violet appears in:<br>- the sidebar "New…" button on every page, so each page has two violet primaries<br>- uppercase eyebrows and selected segments<br>- selected cards and badges<br>- the nav marker, the focus ring, the stage halo, links and the progress bar | accent overuse | S2 | all |
| G2 | **Contrast failures** (measured; §3.4):<br>- sidebar group labels (`--ink-500` on `--surface`) **2.47:1**, which fails AA 4.5:1<br>- field borders (`--ink-700`) **1.43:1** on the ground and **1.26:1** on the field fill, which fails WCAG 1.4.11 3:1 for control boundaries<br>- `--fg-faint` on `--raised-2` **4.26:1** for 12 px text | contrast | S1 | `globals.css` l.347, l.303 |
| G3 | Uppercase tracked labels (eyebrows, kickers, nav groups) have no Arabic form, so the two languages speak in different typographic voices. | type | S3 | EN vs AR captures |
| G4 | `body { overflow-wrap:anywhere }` breaks ordinary words mid-word wherever a column is narrow (A5, E6, F1). | overflow | S2 | — |
| G5 | The neutrals are cool blue-grey (`#0b0d12`, body `#cfd4de`). Only headings are ivory, which is not the "warm neutral text" asked for. | colour | S2 | — |
| G6 | **English inside the Arabic UI:**<br>- hard-coded strings: `Crumbs` aria-label "Breadcrumb", `Thumb` "no picture yet", reliability "takes / jobs / review / resolved", agent stats "ok · failed · all succeeded", "attempt(s)"<br>- organisation content (responsibilities, roles, descriptions) has no Arabic | i18n | S2 | AR captures |
| G7 | Two different centring systems (start-aligned 1320 column, centred 3xl/5xl). Section gaps vary between 24 and 48 px with no rule. | rhythm | S3 | all |

(The black "N" disc over the sidebar footer is the Next.js dev indicator: dev-only, not a product defect.)

---

## 2. What makes premium references feel calm

Only pages actually read are cited. The Criterion Channel (https://www.criterionchannel.com/) is geo-blocked from this
machine and is not used. Apple's HIG pages and Material's guideline pages render client-side and returned no
content, so they are not cited.

| Reference | What they do | What makes it calm | What v3 takes |
|---|---|---|---|
| Netflix, "The power of a picture" [1] | Artwork was "over 82 %" of members' focus while browsing, about 1.8 s per title. Images with complex expressions win. Images with more than 3 people lose. Small-size legibility matters. | The picture carries the decision; the chrome is silent. | Character portraits lead every directory and profile. Portrait crop rules: one person, face in the upper third, expression over pose (§7). |
| Linear UI redesign [2] | LCH colour; a theme reduced from 98 variables to **base, accent, contrast**. They "reduce visual noise" in the inverted-L chrome. Inter Display for headings, Inter for body. Alignment work "you'll feel after a few minutes". | Neutral chrome, one accent, rigorous alignment. | Few role tokens derived from one ladder. The sidebar becomes part of the ground. Display optical size for titles. One accent. |
| Frame.io V4 [3] | Media on "beautifully toned surfaces that respond to depth". Panels expand or collapse for focus. Card size, aspect ratio and shown metadata are user-set. Optimistic updates. Interactions tuned frame by frame. | Tone instead of borders; immediate feedback; panels, not pages. | Tonal surfaces with no glow. The company **inspector** panel. Immediate optimistic states on choose/lock. |
| MUBI identity by Spin [4] | A typeface (LL Riforma) used "as part of a flexible information system"; the ident was physically built and filmed. | Typography as the system; craft over effects. | Typography and spacing carry hierarchy, not boxes and colour. Metadata as quiet text lines. |
| A24 [5] | Mixed 16:9 and 8:10 imagery, generous spacing, one featured film, titles and year as plain linked headings. | Sparse, image-led, no decoration. | Generous section rhythm (48 px). Imagery at its native ratio. Titles set plainly under pictures. |
| Letterboxd film page [6] | Cast and crew as text lists with roles in quotes. Sections as text links, not heavy tabs. Whitespace, little colour. | Information without ornament. | Department team as a people list (name, role, state), not cards. Usage history as plain rows. |
| Apple TV app page [7] | Very large headlines over modest body copy. Full-bleed key art with overlaid text. Low density. | Extreme scale contrast, few elements. | A wide type-scale ratio (40 / 14) on profiles and the company page. |
| Runway [8] | Generated media in cards with generous whitespace. CTA hierarchy shown by placement more than by styling. | Media first, minimal accent. | Placement-led hierarchy. One primary per region. |
| Spotlight performer profile [9] | "The photo is the most important thing"; 3–5 photos; a voice reel; credits in tabs only once they grow. | A profile is a portrait plus a reel. | Character profile: one primary portrait, ≤ 6 reference views in a fixed order, the voice **audible in the header**, usage in its own tab. |
| Radial layout (yFiles) [10] and hierarchical edge bundling (Holten 2006) [11] | Important node at the centre; even angular spacing; curved or bundled edges cut clutter; labels placed radially outward. | Geometry does the work; edges stay out of label space. | The orbit layout. Edges bend toward the hub (bundled through the orchestrator, which coordinates every handoff). Labels sit outside the orbit (§9.1). |
| WCAG 2.1 SC 1.4.11 [12] | 3:1 for control boundaries, graphical objects and focus indicators. | — | `--line-field`, edge and focus tokens are sized to pass (§3.4). |
| MDN `prefers-reduced-motion` [13] | Scaling, panning/parallax and zoom are vestibular triggers. | — | No travel, zoom or scale under reduced motion; state is shown by colour and words (§8). |
| RTL styling guide [14] | Mirror directional arrows and breadcrumbs, not media controls. No letter-spacing in Arabic. Line-height must clear diacritics. Never mix numeral systems. | — | RTL rules in §11. |

[1] https://about.netflix.com/en/news/the-power-of-a-picture ·
[2] https://linear.app/now/how-we-redesigned-the-linear-ui ·
[3] https://blog.frame.io/2024/05/21/frame-io-v4-web-app-beta-feature-focus-new-design-smooth-navigation/ ·
[4] https://spin.co.uk/projects/mubi · [5] https://a24films.com/ · [6] https://letterboxd.com/film/past-lives/ ·
[7] https://www.apple.com/apple-tv-app/ · [8] https://runway.com/ ·
[9] https://www.spotlight.com/news-and-advice/how-to-create-your-best-spotlight-profile/ ·
[10] https://www.yfiles.com/the-yfiles-sdk/features/automatic-layouts/radial-layout ·
[11] https://research.tue.nl/nl/publications/hierarchical-edge-bundles-visualization-of-adjacency-relations-in/ (via its abstract) ·
[12] https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html ·
[13] https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion ·
[14] https://rtlstyling.com/posts/rtl-styling

---

## 3. Principles and colour

### 3.1 Principles
1. **Pictures and people lead; chrome is tone and type.** Surfaces separate by tone. Hairlines only where a list needs
   rhythm. A panel never sits inside a panel. No card exists only to hold a heading.
2. **One accent with four jobs.** Iris (a quiet violet, the brand's hue) is used only for:
   - focus
   - selection marks
   - live work (running dots, lit handoffs, progress fill)
   - inline links on hover

   It is never used for fills larger than a 2 px mark, eyebrows, headings, decorative badges, backgrounds or halos.
   The **primary button is ivory**.
3. **State comes from records, said in words.** A dot plus a phrase. Nothing lights, moves or counts unless a record
   says so. An empty thing is one honest sentence and one action, never a zero in a tile.
4. **Simple first, the rest disclosed.** Every page has one primary action. Advanced and technical material (models,
   tools, prompts, metrics, provenance) lives behind a named disclosure, at most two levels deep.
5. **Both scripts are first-class.** No uppercase or tracking as a hierarchy device: Arabic has neither, so neither
   language uses them for structure. Every user-facing string is translated. Content of unknown language is
   `dir="auto"`.
6. **Motion explains a change.** It never decorates. Loops exist only where something is live right now.

### 3.2 Colour tokens (exact `:root` for `src/app/globals.css`)

The ladder is **recoloured in place**, so every existing utility (`text-ink-500`, `bg-surface`, `border-line`…) keeps
working. Role names stay; values change; a few roles are added. The neutrals are warm and very low chroma (hue ≈ 40°,
chroma ≤ 0.012 in LCH, as in Linear's three-variable approach [2]).

```css
:root {
  /* warm neutral ladder */
  --ink-1000: #070706;  /* media floor under every picture and clip            (new) */
  --ink-975:  #090908;  /* sunken: the company stage floor, lyric column       (new) */
  --ink-950:  #0d0c0b;  /* ground                                    (was #0b0d12) */
  --ink-900:  #141312;  /* panel, inspector, dialogs' body           (was #12151c) */
  --ink-850:  #1a1917;  /* field fill, hover on a row                (was #171b23) */
  --ink-800:  #22201e;  /* menus, toasts, selected segment           (was #1d222b) */
  --ink-700:  #2e2b28;  /* hairline                                  (was #282e39) */
  --ink-600:  #4a4640;  /* strong hairline, idle node ring           (was #38404d) */
  --ink-550:  #736c63;  /* control boundary and idle edge, ≥ 3:1     (new) */
  --ink-500:  #625d55;  /* disabled text, decorative separators      (was #4d5667) */
  --ink-400:  #8f877b;  /* faint text, ≥ 4.5:1 on every surface      (was #7b849a) */
  --ink-300:  #ada597;  /* muted text                                (was #a0a8b8) */
  --ink-200:  #ddd6cb;  /* body text                                 (was #cfd4de) */
  --ink-100:  #f3eee6;  /* ivory: titles, primary fill               (was #f3f2ee) */
  /* the one accent: iris (kept from the brand's violet, lifted and softened for warm ground) */
  --iris-600: #6c5fe0; --iris-500: #8b7ff0; --iris-400: #a99ff5; --iris-300: #cbc4fa;
  --violet-700: var(--iris-600); --violet-600: var(--iris-600); --violet-500: var(--iris-500);
  --violet-400: var(--iris-400); --violet-300: var(--iris-300);           /* legacy aliases */

  /* roles: surfaces */
  --bg: var(--ink-950); --sunken: var(--ink-975); --media: var(--ink-1000);
  --surface: var(--ink-900); --raised: var(--ink-900); --raised-2: var(--ink-800); --input: var(--ink-850);
  /* roles: lines */
  --line-soft: #211f1d;              /* list separators (decorative) */
  --line: var(--ink-700);            /* panel edges */
  --line-strong: var(--ink-600);     /* menus, idle node ring */
  --line-field: var(--ink-550);      /* every input, select, segmented, checkbox, dropzone boundary (new) */
  /* roles: text */
  --fg: var(--ink-100); --fg-body: var(--ink-200); --fg-muted: var(--ink-300); --fg-faint: var(--ink-400);
  --fg-disabled: var(--ink-500);     /* (new) disabled controls only, exempt from 1.4.3 */
  /* roles: action */
  --primary: var(--ink-100); --primary-hover: #ffffff; --primary-active: #e4ded3; --on-primary: var(--ink-950);
  --accent: var(--iris-400);                         /* marks, focus, live, link hover */
  --accent-strong: var(--iris-500);                  /* progress fill, checked radio/checkbox fill (new) */
  --accent-soft: rgba(169, 159, 245, 0.12);          /* selected list row tint, never a card */
  --accent-line: rgba(169, 159, 245, 0.50);          /* (new) selected tile border at rest */
  --ring: var(--iris-400);
  /* roles: status (semantic, never decorative) */
  --ok:   #62c995; --ok-soft:   rgba(98, 201, 149, 0.12);    /* done, verified */
  --warn: #e2b55f; --warn-soft: rgba(226, 181, 95, 0.12);    /* waiting for you, provisional */
  --bad:  #f07f74; --bad-soft:  rgba(240, 127, 116, 0.12);   /* failed, refused, blocked */
  --info: var(--accent); --info-soft: var(--accent-soft);    /* running = live = the accent */
  /* v2 company accents fold into the system (aliases kept until components are migrated) */
  --gold: var(--warn); --gold-soft: var(--warn-soft); --gold-line: rgba(226, 181, 95, 0.45); --gold-text: var(--warn);
  --teal: var(--accent); --teal-soft: var(--accent-soft); --teal-line: var(--accent-line);
  /* the company diagram */
  --edge: var(--ink-550);            /* a handoff path that has been used (3.5:1 on --sunken) */
  --edge-lit: var(--accent);         /* handed off in the last 90 min / travelling now */
  --edge-wait: var(--warn);          /* handed to a person for a decision (dashed) */
  --edge-bad: var(--bad);            /* refused at the receiving end */
  /* overlays and elevation, no glow */
  --overlay: rgba(5, 5, 4, 0.74);
  --shadow-1: none; --shadow-2: none;
  --shadow-3: 0 24px 64px -16px rgba(0, 0, 0, 0.8), 0 0 0 1px var(--line-strong);
  --halo-violet: none; --halo-gold: none; --halo-teal: none;    /* retired: delete once unused */
  /* shape */
  --r-1: 6px; --r-2: 8px; --r-3: 12px; --r-4: 16px; --r-media: 8px; --r-pill: 999px;
  /* motion (§8) */
  --t-fast: 120ms; --t: 200ms; --t-slow: 320ms; --t-media: 480ms; --t-travel: 1200ms;
  --ease: cubic-bezier(0.16, 1, 0.3, 1); --ease-in: cubic-bezier(0.7, 0, 0.84, 0); --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
  /* layout */
  --sticky-top: 56px; --gutter: 16px; --section: 40px;
  color-scheme: dark;
}
@media (min-width: 640px)  { :root { --gutter: 24px; } }
@media (min-width: 1024px) { :root { --sticky-top: 0px; --gutter: 40px; --section: 48px; } }
```

`@theme inline` additions: `--color-ink-1000`, `--color-ink-975`, `--color-ink-550`, `--color-iris-300…600`,
`--color-line-field`, `--color-fg-disabled` (utility `text-disabled`), `--color-accent-strong`,
`--color-edge`, `--radius-media`. Remove `DEPT_HUES` / `deptHue` from `components/studio/org.tsx` and every
`bg-gradient-to-*` that uses them.

### 3.3 Where colour may appear

| Colour | Allowed | Forbidden |
|---|---|---|
| Ivory `--primary` | One primary button per region; the play disc of the audio player | Large panels, headings in a colour other than `--fg` |
| Iris `--accent` | Focus ring · tab underline (2 px) · nav current marker (2 px) · selected tile border (1.5 px) · checked radio/checkbox · progress fill · running dot · lit/travelling edge · link hover underline | Eyebrows, badges as decoration, button fills, card tints, halos, gradients |
| `--ok / --warn / --bad` | Status dots, status words, the 2 px rule of a notice, edge states, field error text | Skill chips, tool chips, decoration, "selected" |
| Gradients | **Two only**: the scrim under a title set on a picture, and the hero backdrop fade into `--bg` | Everything else, including department hues, the stage radial, `org-director`, `org-team-rule`, `poster-text` |

### 3.4 Contrast (measured with the WCAG 2.x formula; scratch script in the session)

| Pair | v2 | v3 | Need |
|---|---|---|---|
| fg on bg / surface / raised-2 | — | 16.9 / 16.1 / 14.1 | 4.5 |
| body on bg / raised-2 | — | 13.6 / 11.3 | 4.5 |
| muted on bg / raised-2 | — | 8.0 / 6.7 | 4.5 |
| **faint** on bg / surface / raised / raised-2 | 5.2 / 4.9 / — / **4.26** | 5.5 / 5.2 / 5.0 / **4.58** | 4.5 |
| nav group label | **2.47** (ink-500 on surface) | 5.5 (faint on bg) | 4.5 |
| **field boundary** on bg / surface / raised / raised-2 | **1.43** / — / **1.26** (on input) | 3.8 / 3.6 / 3.4 / 3.1 (`--line-field`) | 3.0 (1.4.11) |
| idle edge `--edge` on sunken | n/a | 3.6 | 3.0 |
| accent on bg / raised-2 | 6.95 (eyebrow) | 8.3 / 6.9 | 4.5 text / 3.0 marks |
| accent-strong on raised-2 (progress fill) | — | 4.9 | 3.0 |
| primary text: on-primary on ivory | white on violet 4.59 | 16.9 | 4.5 |
| focus ring (accent, offset 2 px) against bg | 6.95 | 8.3 | 3.0 |
| ok / warn / bad on surface | 9.7 (ok) | 9.1 / 9.7 / 7.1 | 4.5 |
| ok / warn / bad / accent text on its 12 % soft over surface | 7.4 (ok) | 7.4 / 7.8 / 6.0 / 6.5 | 4.5 |
| disabled text | — | 3.0 | exempt (inactive) |

Focus on the ivory primary: the ring sits 2 px *outside* the button, so it is judged against the ground (8.3:1), not
the ivory (2.0:1).

---

## 4. Typography

**Faces** (already bundled locally in `src/app/fonts`, no font service):
- **Inter variable** for Latin. Use `font-optical-sizing: auto` so display sizes get Inter Display's tighter
  optical size, as in Linear's headings [2]. Verify that the bundled `InterVariable.woff2` exposes the `opsz` axis
  (Inter ≥ 4.0). If it does not, add `InterDisplay` (OFL) for ≥ 24 px.
- **IBM Plex Sans Arabic** 400/500/600/700 for Arabic.

One family per script: no serif display. A Latin serif title over a sans Arabic title would split the two
interfaces.

**Rules:**
- No uppercase, no letter-spacing above 0 for any label.
- `.eyebrow` becomes sentence case, `--fg-muted`, 12/16, weight 500. `.kicker` exists only for Latin table column
  heads.
- Numbers use `.num` (tabular, `unicode-bidi: isolate`), Western digits in both locales.
- `body { overflow-wrap: break-word }` (was `anywhere`). Ids, file names and hashes get `.break-all` (`word-break:
  break-all`) or truncate with a title.

| Role | Class | Latin size / line / weight / tracking | Phone (Latin) | Arabic size / line / weight | Use |
|---|---|---|---|---|---|
| Display | `.display-xl` | 40 / 44 / 500 / −0.025em | 30 / 34 | 36 / 52 / 600 | Character name on the profile; "Studio Company" title |
| Page title | `.page-title` `.h1` | 30 / 36 / 500 / −0.02em | 26 / 32 | 28 / 42 / 600 | Every other page title |
| Section | `.h2` `.section-title` | 20 / 28 / 600 / −0.01em | 18 / 26 | 19 / 30 / 600 | Section heads, dialog titles, inspector title |
| Item | `.h3` | 16 / 22 / 600 / −0.005em | same | 16 / 26 / 600 | Card / row / node names |
| Lead | `.lead` | 16 / 26 / 400, `--fg-muted`, max 64ch | 15 / 24 | 16 / 28 / 400 | The one purpose line under a title |
| Body | (base) | 14 / 22 / 400, `--fg-body` | same | 15 / 26 / 400 | Everything |
| Prose | `.prose-copy` | 15 / 26 / 400, max 68ch | same | 16 / 30 | Personality, descriptions |
| Small | `.text-sm` | 13 / 20 / 400 | same | 14 / 22 | Meta, rows |
| Caption | `.text-xs` | 12 / 16 / 500, `--fg-faint` | same | 13 / 20 / 500 | Hints, timestamps (Arabic never below 13) |
| Eyebrow | `.eyebrow` | 12 / 16 / 500, `--fg-muted`, sentence case | same | 13 / 20 / 500 | Kind line above a title |
| Label | `.label` | 13 / 18 / 500, `--fg-body` | same | 14 / 20 / 500 | Field labels |
| Mono | `.mono` | 12.5 / 18, tabular | same | same (Latin face) | Ids, timecodes, tool names inside *Technical details* only |

Base size: `html { font-size: 14px }`; `html[dir=rtl] { font-size: 15px }`. Arabic line-heights run about 15–20 %
taller than Latin so that kasra and shadda clear the line [14].

Mixed titles: one language per title. The other name is a quiet second line (`.text-sm --fg-muted`, `dir="auto"`),
never side by side in the same `<h1>`. This fixes B4.

---

## 5. Spacing, grid, shape, elevation

- **Spacing steps** (px): 4, 8, 12, 16, 24, 32, 48, 64, 96. Nothing else.
  - Field to field: 20 (`gap-5`).
  - Inside a panel: 20 desktop / 16 phone.
  - Title to lead: 8. Lead to content: 32.
  - Section to section: `var(--section)` = 48 desktop / 40 phone.
  - Rows: 12 vertical padding.
- **Shell:** the sidebar is **240 px on the ground** (`--bg`, end hairline `--line`), not a raised panel. The mobile
  bar is 56 px.
- **Content:** `max-w-[1280px]`, start-aligned on every page, padding `var(--gutter)` (16 / 24 / 40). There are no
  centred `max-w-3xl/5xl` pages. Forms limit their own measure (`max-w-[720px]`) inside the start-aligned column.
  This fixes E9 and G7.
- **Grid:** 12 columns, gutter 24 (16 on a phone). Detail pages use `main 8 cols + aside 4 cols` at ≥ 1280 and stack
  below that.
- **Breakpoints:** `sm` 640 · `md` 768 (company orbit appears) · `lg` 1024 (sidebar) · `xl` 1280 (inspector beside the
  orbit; asides beside mains) · `2xl` 1536.
- **Radius:** `--r-1` 6 (chips, small controls), `--r-2` 8 (buttons, fields, segmented, media frames via
  `--r-media`), `--r-3` 12 (panels, tiles), `--r-4` 16 (dialogs, sheets, the stage). Pill only for faces, play discs
  and status dots. Smaller radii than v2 (8/12/16/20) make the interface less "app-card" and more photographic.
- **Elevation:** surfaces never cast shadows.
  - The ladder is bg → surface → input → raised-2.
  - Hover on a row or tile = one ladder step lighter, with no lift and no shadow.
  - Overlays only (menus, popovers, dialogs, sheets, toasts) take `--shadow-3`, which includes a 1 px
    `--line-strong` edge.
  - No inner highlights (`inset 0 1px 0 rgba(255,255,255,.03)` goes), no halos, no `drop-shadow` on SVG.

---

## 6. Components

All live in `src/components/ui/{kit,cinema,nav,progress,preview,page}.tsx`; class names in `globals.css`.

**Navigation (`nav.tsx`, `(app)/layout.tsx`).**
- Sidebar on `--bg`, items 36 px, 14/20, weight 500, `--fg-muted`; icons 18 px, stroke 1.5, `--fg-faint`.
- Current item: `--fg` text, `--raised-2` fill, a 2 px × 16 px `--accent` marker on the start edge, icon `--fg`
  (not accent).
- Group labels: 12/16, weight 600, `--fg-faint`, sentence case ("Library", "Studio").
- **"New…" becomes a secondary button** (transparent, `--line-field` border, `+` icon), so the page's own primary is
  the only ivory one on screen.
- Footer: connection dot and words, 12 px `--fg-faint`. Mobile bar: same items, menu as a sheet.
- `Crumbs` aria-label is translated.

**Page header (`PageHeader`).**
- Order: back link (13, `--fg-muted`, chevron mirrors) → eyebrow → title → lead → meta line (status first, dot
  separators) → actions on the end side, aligned to the title baseline on desktop and wrapping under it on a phone.
- At most one primary, two secondaries, then `More`.
- No gradient band behind it, ever.

**Buttons (`.btn`).**
- Heights: 40 (md), 32 (`sm`), 48 (`lg`). On coarse pointers `sm` grows to 40 and `xs` (28) to 36.
- Radius 8; 14/20 weight 600 (13 at `sm`); icon 16, gap 8.

| Variant | Rest | Hover | Active | Disabled |
|---|---|---|---|---|
| `primary` | `--primary` fill, `--on-primary` text | `--primary-hover` | `--primary-active`, 1 px down | `--raised-2` fill, `--fg-disabled` text, reason shown as text beside it |
| `secondary` | transparent, 1 px `--line-field`, `--fg` | `--raised-2` fill | `--input` | 1 px `--line`, `--fg-disabled` |
| `quiet` (`ghost` and `subtle` merge into it) | text `--fg-muted` | `--raised-2`, `--fg` | — | `--fg-disabled` |
| `danger` | transparent, text `--bad`, border `rgba(240,127,116,.4)` | `--bad-soft` | — | as secondary |

- The filled red button exists only inside a confirm dialog.
- `loading` keeps the width and swaps the icon for a spinner (`aria-busy`).
- `aria-pressed` uses `--raised-2` plus a `--accent` 2 px underline, not a violet fill.

**Segmented control (`.seg`).**
- Track: 1 px `--line-field`, radius 8, padding 2, transparent.
- Option: 32 px, 13/18, weight 500, `--fg-muted`.
- Selected: `--raised-2` fill, `--fg`, 1 px inset `--line-strong`. It is neutral (G1).
- Focus: ring. Arrow keys move the selection (radiogroup), mirrored in RTL.

**Form fields (`.input .select .textarea`).**
- 40 px, radius 8, fill `--input`, 1 px `--line-field`; hover border `--fg-faint`.
- **Focus:** border `--accent` plus an inset 1 px `--accent` (a 2 px edge). There is no translucent 3 px glow, so
  the doubled outline in E5 cannot happen.
- Invalid: border `--bad`, with the message under it (12/16, `--bad`, icon, `role=alert`, linked by
  `aria-describedby`).
- Label 13/18 weight 500 above. Hint 12/16 faint under. "Optional" sits as a faint word at the end side of the label
  row; required fields are unmarked because most are optional.
- `.input-lg` for the one brief field: 48 px, 16 px text; as a textarea, 4 rows.
- No raw number inputs for human concepts. Age is a segmented control (child · teen · adult · older) with "Exact
  age" disclosed.

**Panels and tiles.**
- `.panel` (was `.card`): `--surface`, 1 px `--line`, radius 12, no shadow. Use it for interactive groups (a form,
  the inspector, a player). Lists and read-only sections sit **on the ground** with `.rows` hairlines.
- `.tile` (selectable option): `--surface`, 1 px `--line`; hover `--input`; selected 1.5 px `--accent` border (no
  ring) plus a filled radio dot; focus ring outside.

**Portrait tile (`ArtCard ratio="portrait"`, `CharacterCard`).**
- Boxless. A 4:5 frame, radius `--r-media`, `--media` floor, `object-position: 50% 18%`.
- Name 15/20 weight 600 `--fg`. Role 13/20 `--fg-muted` (1 line). Meta 12/16 faint: language · voice state.
- Lock: a 14 px shield and "In N videos" in the meta, not a badge.
- Hover / focus: frame lightens (`--line-strong` 1 px inset), picture scales to 1.02 over `--t-media`, and the voice
  play disc (32 px) and `More` appear at the bottom end corner. They are always visible on touch.
- **Honest placeholder:** the frame on `--input` with the initials (32 px, weight 500, `--fg-faint`) and "No portrait
  yet" (12 px). No silhouettes, no stock faces, no gradients.

**Audio player (`VoicePreview`, `SongPlayer` keep their APIs).**
- Row anatomy, start to end:
  - play disc 40 px (`--primary` fill, `--on-primary` glyph; pause while playing)
  - name 14/20 weight 600 and detail 13/20 `--fg-muted` (one line, `dir=auto`)
  - waveform 28 px tall, 120 bars, played part `--fg`, unplayed `--ink-600`
  - time `num` 12 px faint "0:02 / 0:04"
  - source chip (Recording · Generated · Sample) as text and dot
- Keyboard: Space/Enter toggles; ←/→ seek 1 s following the fill direction (mirrored in RTL); Home/End.
- One shared `<audio>`; nothing autoplays.
- The selected sample row gets `--accent-soft` fill and a start-edge 2 px `--accent` mark.

**Progress stepper (`JobProgress`, `.jp-rows`).**
- Vertical rows. Marker 24 px:
  - upcoming: outline `--line-field`, faint number
  - current: 2 px `--accent` ring, `--accent` number, the live dot breathes
  - done: `--ok` check on `--ok-soft`
  - failed: `!` on `--bad-soft`
  - skipped: dashed outline and an en dash
- Row: label 14/20 weight 600; phase line 13/20 `--fg-muted` (the worker's own words, e.g. "Drawing Layla · 2nd in
  the GPU queue"); elapsed `num` on the end side.
- A determinate 4 px bar (`--accent-strong` on `--raised-2`) appears only when the worker reports a percent; no fake
  percentages.
- One Cancel (quiet) for the chain. A failed row expands in place into the recovery notice.

**Status (`Status`, `Badge`).**
- `Status` = 6 px dot plus a 12/16 weight 500 phrase.

| State | Dot | Text |
|---|---|---|
| idle | `--fg-faint` | `--fg-muted` |
| running / live | `--accent` (breathes) | `--fg-muted` |
| done / verified | `--ok` | `--fg-muted` |
| waiting for you / provisional | `--warn` | `--warn` |
| failed / blocked / refused | `--bad` | `--bad` |

- `Badge` (pill) is for counts and the SAMPLE mark only. Skills and tools become plain text lists inside *Technical
  details* (B5).

**Empty state (`Empty`).**
- In-section: one sentence in `--fg-muted` at the section's start edge, plus one action (secondary). No dashed box,
  no icon tile, no box inside a box.
- Page-level: a composed invitation specific to the page (the Characters three-frames invitation, §9.4; the company
  stage's own caption, §9.1). Never a zero.

**Error and recovery notice (`Notice tone="bad"`, `FailureNotice`).**
- Surface `--surface` with a 2 px start-edge rule in the tone colour (no tinted background except `bad` at
  `--bad-soft` for page-blocking errors). 16 px icon in the tone.
- Content in this order:
  1. **What happened**: title 14/20 weight 600.
  2. **Why, in plain words**: 13/20 `--fg-muted`.
  3. **What is kept**: "Your brief is kept.", 12/16 faint.
  4. Actions: one recovery (secondary, e.g. *Draw again*), then the alternatives (quiet, e.g. *Write it myself*),
     then `Details` disclosing the code and job link.
- Maps from `StudioError.code` via `useErrorCopy` (exists).
- Warnings use `--warn`; "waiting for your decision" uses `--warn` with *Approve* (secondary) and *Request changes*
  (quiet).

**Dialog and sheet (`Modal`, `ConfirmButton`, `ConfirmDelete`, `Drawer`).**
- `--surface` body, radius 16, `--shadow-3`, overlay `--overlay` with no blur. Widths 400 / 560 / 880.
- Header 56 px: title (`.h2`) plus close (quiet icon).
- Footer actions end-aligned: Cancel (quiet) then the confirm. A destructive confirm is the one filled `--bad`
  button in the system (text `--on-primary`).
- Below 640: a bottom sheet (full width, top radius 16, max 92 dvh, sticky footer).
- Escape closes; focus returns to the trigger; the first field gets focus.
- Drawers dock to the end side (mirror in RTL).

**Tabs (`TabBar`).** 44 px, 14/20 weight 500 `--fg-muted`; selected `--fg` weight 600 with a 2 px `--accent`
underline. Counts in `num` faint (no chip). Sticky under the mobile bar. ←/→ Home/End, mirrored in RTL (exists).

**Disclosure (`Details`).**
- Chevron 12 px.
- LTR: closed points right (`rotate(-45deg)` on the inline-end/block-end corner), open points down
  (`rotate(45deg)`).
- **RTL: closed `rotate(45deg)` (points left), open `rotate(-45deg)` (points down).** Write the RTL rule as
  `html[dir=rtl] .details:not([open]) > summary::before` and `html[dir=rtl] .details[open] > summary::before` so that
  `[open]` is never outranked (fixes E8).

---

## 7. Imagery

- **Ratios carry meaning** (kept from v2): character 4:5 · reference view 4:5 · key art 16:9 · poster 2:3 · sleeve
  1:1 · location plate 16:9.
- **Portrait framing:**
  - head and shoulders, one person, eyes on the upper-third line
  - `object-position: 50% 18%`
  - expression over pose, following Netflix's finding that complex expressions win and more than 3 people lose [1]
  - Generation prompts and the Appearance tab's "portrait" crop follow the same framing (Backend note).
- **Reference views** always appear in the fixed order Front · Three-quarter · Side · Back · Full body · Expression.
  A missing view is an outlined frame with the view's name and *Draw*. It is never hidden, so the gap is visible.
- **Honest placeholders:** initials or the title set as type on `--input`, plus a state word ("No portrait yet",
  "Drawing…", "Unavailable"). Never a fake image, a stock silhouette or a blurred guess. The SAMPLE mark stays on
  bundled media.
- **Media floor:** `--media` behind every picture. Letterbox (contain) where the source ratio differs. Never stretch.
- **Loading:** a 4:5 skeleton with no shimmer once a job has a phase. The phase text sits *in* the frame. The new
  picture crossfades in over `--t-media`.
- **Text on pictures:** only on a scrim (the one permitted gradient), in `--fg-on-art`. Character directory tiles
  carry no text on the picture.

---

## 8. Motion

| Token | Duration | Easing | Used for |
|---|---|---|---|
| `--t-fast` | 120 ms | `--ease` | press, colour and border changes |
| `--t` | 200 ms | `--ease` | hover reveal, menus, tooltips, tab underline |
| `--t-slow` | 320 ms | `--ease` in, `--ease-in` out | sheets, drawers, inspector content swap, the orbit's dim/raise on hover |
| `--t-media` | 480 ms | `--ease-inout` | picture crossfade, portrait replace, 1.02 zoom |
| `--t-travel` | 1200 ms | `--ease-inout` | a handoff's light travelling along its edge, once |

**Loops** (the only ones): the live dot of something running right now (opacity 1 → 0.35 → 1, 2 s), and the
skeleton shimmer before a job reports a phase (1.6 s). Gone:
- `org-pulse` (scale ring)
- `org-breathe` (halo)
- `.transport-primary:hover scale(1.03)`
- `.play-on-art:hover scale(1.08)`

**Reduced motion** (`prefers-reduced-motion: reduce` or `html[data-motion=reduce]`, both exist):
- no transforms, travel, zoom or scale [13]
- opacity changes ≤ 120 ms are allowed
- loops stop; the live dot holds full opacity and the word "Running" carries the state
- a handoff's edge switches to lit without travelling

---

## 9. Page specs

Each spec gives layout, anatomy, states, keyboard order, the phone layout, then **what changes and why**. Ids in
brackets refer to §1.

### 9.1 Studio Company `/studio`: the orchestrator constellation

**Layout ≥ 1280 (`xl`).** Header, then a 2-column region `[stage minmax(0,1fr)] [inspector 22rem]`, gap 24, then the
"Recent handoffs" section. Reliability moves to Production (see *What changes*).

```
Studio Company                                                             [ View as list ]
Who is working on what, and every handoff between the departments.

┌─ stage: --sunken, radius 16, 1px --line, aspect 4:3.1, min-h 560 ───────┐ ┌─ inspector (panel) ───────┐
│                            ○ Executive Office                           │ │ Studio Orchestrator        │
│                              Idle · 4 agents                            │ │ Idle — nothing in          │
│     Post-Production ○                         ○ Story Development      │ │ production                 │
│     Idle · 7 agents                             Idle · 5 agents         │ │ ─────────────────────────  │
│                         ╭─────────────────╮                             │ │ Waiting for you        0   │
│  Quality ○              │     Studio      │              ○ Casting &    │ │ In production          0   │
│  Assurance              │   Orchestrator  │                Character    │ │ Blocked                0   │
│  Idle · 7               │      Idle       │                Design       │ │ ─────────────────────────  │
│                         ╰─────────────────╯                Idle · 4     │ │ How the company works      │
│  Video     ○                                        ○ World Building &  │ │ Story → Casting & World →  │
│  Production                                           Art Direction     │ │ Pre-production → Sound →   │
│  Idle · 6         ○ Sound & Music     ○ Pre-Production  Idle · 6        │ │ Video → QA → Post. You      │
│                   Idle · 7            Idle · 5                          │ │ approve the story and cut. │
│                                                                         │ │ [ Start a production ]     │
│        No handoffs yet. Each handoff between departments lights its path.│ │ [ Add a character ]        │
└─────────────────────────────────────────────────────────────────────────┘ └────────────────────────────┘
   — used path    ━ handed off in the last 90 min    ┅ waiting for you    ─×─ refused       (legend, 12px faint)
```

**Geometry** (SVG `viewBox="0 0 1000 775"`, nodes positioned in the same coordinates):
- Centre O = (500, 388).
- One orbit ellipse: rx = 300, ry = 280, drawn as a 1 px `--line-soft` path. This is the only structural line; it is
  decorative and `aria-hidden`.
- Department *i* (ring order `RING`) sits at θᵢ = −90° + i·40° (clockwise in LTR):
  `x = 500 + 300·cos θ`, `y = 388 + 280·sin θ`.
- In RTL use `x' = 1000 − x`, so the pipeline runs counter-clockwise, with the reading direction.

| i | Department | θ | Label placement (outward from O) |
|---|---|---|---|
| 0 | Executive Office | −90° | above, centred |
| 1 | Story Development | −50° | above, centred |
| 2 | Casting & Character Design | −10° | beside, outer side, start-aligned away from O, max 9.5rem |
| 3 | World Building & Art Direction | 30° | beside, outer side |
| 4 | Pre-Production | 70° | below, centred |
| 5 | Sound & Music | 110° | below, centred |
| 6 | Video Production | 150° | beside, outer side |
| 7 | Quality Assurance | 190° | beside, outer side |
| 8 | Post-Production | 230° | above, centred |

Rule: `sin θ < −0.5` → above · `sin θ > 0.6` → below · otherwise beside. Labels therefore never sit inside the
orbit, where the edges run. This fixes A2.

**Edges: real handoffs only.**
- Data: `org.handoffs` grouped by `producerDepartment → receiverDepartment` (EDIT → Executive for the cut approval).
  A pair with no handoff record draws **nothing**.
- Path: a quadratic Bézier from the producer disc edge (r + 6) to the receiver disc edge. The control point is
  `C = M + 0.5·(O − M)`, where M is the chord midpoint. Every edge therefore bends toward the orchestrator, which
  coordinates every handoff: hierarchical bundling through the hub [11].
- Arrowhead: an open 6 px chevron at the receiver end.
- Hit area: a transparent 12 px stroke over each edge.

| Edge state | Source of truth | Stroke |
|---|---|---|
| used | ≥ 1 handoff ever, latest > 90 min old, VALIDATED | 1 px `--edge` |
| recent | latest VALIDATED handoff < 90 min | 1.5 px `--edge-lit` |
| travelling | a `studio_events` handoff event arrives on the stream | a 48 px light segment (`--accent` → `--fg`) travels producer → receiver in `--t-travel`, once, then the edge is *recent* |
| waiting for you | the receiving stage is AWAITING_APPROVAL (STORY / EDIT gates) | 1.5 px `--edge-wait`, dash 4 3 |
| refused | latest handoff `qualityStatus ≠ VALIDATED` | 1.5 px `--edge-bad` with a 6 px × mark at the curve midpoint |
| selected | user selection | 2 px `--fg` |
| context-dimmed | another node or edge is hovered or selected | 35 % opacity |

**Assignment lines (hub → department).** These are drawn only while a department has an open agent run
(`activeDepts`): a straight 1 px `--edge-lit` at 60 % from the orchestrator ring to the disc. When a run starts, the
light travels hub → department once. There are no permanent spokes.

**Node anatomy (department "seat").**
```
          ·  ·  ●  ·          ← team dots: one 4 px dot per agent on a 100° arc on the side facing O
        ╭──────────╮            (director 6 px); dot of an agent with an open run = --accent, live breath
        │   [ic]   │          ← disc 56 px (48 at md): fill --surface, 1 px --line-strong, icon 20 px stroke 1.5 --fg-muted
        ╰──────────╯
     Casting & Character       ← name .h3 13/18 600 --fg (2 lines max)
     Design
     Working · Character Designer   ← state line 12/16: idle "Idle · 4 agents" (--fg-muted) · working "Working · <agent>" (dot --accent)
                                       · waiting "Waiting for you" (--warn) · blocked "Refused by QA" (--bad)
```
Disc states:

| State | Disc ring | Icon |
|---|---|---|
| idle | `--line-strong` | `--fg-muted` |
| working | 1.5 px `--accent` | `--fg` |
| waiting | 1.5 px `--warn` | — |
| blocked | 1.5 px `--bad` | — |
| hover | `--fg-faint` | — (label `--fg`; this node's edges raise, the rest dim) |
| selected | a 2 px `--accent` ring 4 px outside the disc, plus `aria-pressed=true` | — |
| focus | the 2 px focus ring around disc and label together (one rounded rect) | — |

There are no halos, no pulse ring, no transform.

**Orchestrator (centre).**
- Disc 136 px (112 at md): fill `--raised-2`, 1 px `--line-strong`.
- Text: "Studio Orchestrator" 13/16 weight 600 `--fg` (sentence case). State 12/16 `--fg-muted`: "Idle", "Coordinating 2
  productions", "Waiting for you · 1", "Blocked · 1".
- **Production rings:** for each production in flight (max 3; more shows "+n" in the state line), one concentric 2 px
  ring 6 px apart outside the disc. Track `--line`; arc length = stages DONE / total from `org.positions`. The arc is
  `--fg-muted`, or `--accent` for the production with a running job.
- The orchestrator is a `button`; selecting it shows the orchestrator summary in the inspector, which is the default.

**Inspector (panel, 22rem, sticky top 24).** Content follows the selection.
- *Orchestrator* (default):
  - state sentence
  - three counted rows: Waiting for you (each with *Approve* / *Request changes*, gold logic now `--warn`), In
    production (title, stage, ring colour key), Blocked (reason, *Open*)
  - Recent decisions (5)
  - with no production: "How the company works" (3 lines) plus *Start a production* (primary) and *Add a character*
    (secondary)
- *Department*:
  - name, responsibility (1–2 lines), director
  - team (agent rows: monogram 28 px, name, role, status)
  - "Receives from / Hands to" with the edge state of each
  - current work
  - *Open department* (primary)
- *Edge*: "Story → Casting", the stages it carries, then the last 5 handoffs (status, production, checks passed,
  time, *Open production*). This is the accessible twin of every SVG edge (A4).
- Content swaps with a `--t-slow` fade. An `aria-live="polite"` line announces new handoffs ("Story handed the
  treatment to Casting"), throttled to one per 10 s.

**Interaction.**
- Click or tap a node → select (inspector). Double-click, or Enter on an already-selected node, → open its page.
  The inspector's primary does the same.
- Click an edge → select the edge.
- Escape → back to the orchestrator.
- Hover → the context dims (no tooltip). The one-line responsibility is in the state line and the inspector.
  (Fixes A3: the tooltip and its z-order go.)

**Keyboard.**
- Tab order: skip link → header actions → **stage (one tab stop)** → inspector → recent handoffs.
- Inside the stage, roving `tabindex`, starting at the orchestrator:
  - → / ↓ next department in pipeline order (← / ↑ previous; mirrored in RTL)
  - Home = orchestrator, End = Post-Production
  - Enter/Space selects; Enter on the selected node opens it
  - Escape clears
- Each node button has `aria-label` "Casting & Character Design. Working: Character Designer drawing Layla. 2
  handoffs in the last 90 minutes.", plus `aria-pressed`.
- The SVG is `aria-hidden`; the inspector lists the edges.
- *View as list* (header, remembered in `localStorage`) switches to the phone layout at any width, for preference
  and for screen readers.

**Loading / error / empty.**
- Loading: a stage-shaped skeleton (orbit outline plus 9 disc outlines, no shimmer after 1 s) and an inspector
  skeleton.
- Error: the inspector becomes a `bad` notice ("The studio server did not answer") with *Try again*. The stage keeps
  its last known state, dimmed, labelled "Last known · 2 min ago".
- Disconnected: a `warn` line above the stage.
- Empty: as drawn above: no edges, the caption inside the stage, and the inspector's how-it-works block.

**Phone (< 768): the spine.**
```
┌ Studio Orchestrator ─────────────── Idle ┐   ← panel: state, three counts, decisions waiting (Approve inline)
│ 0 waiting · 0 in production · 0 blocked  │
└──────────────────────────────────────────┘
Departments, in production order
 ○ Executive Office            Idle · 4  ›
 │                                          ← segment between consecutive seats: --line idle,
 ○ Story Development           Idle · 5  ›     --edge-lit if a handoff passed in the last 90 min
 │                                             (non-adjacent handoffs: "→ Pre-Production · 12 min" in the row meta)
 ○ Casting & Character Design  Idle · 4  ›
 …
Recent handoffs (list)
```
Rows are 64 px: disc 40 px with team dots, name (wraps to 2 lines, never truncated), state line. Tap opens the
department page. In RTL the spine sits on the right.

**Tablet (768–1279):** the orbit at full width (disc 48, orchestrator 112), with the inspector stacked below the
stage.

**What changes from today and why.**
- **Spokes and pipeline-derived arrows are removed.** Only handoffs that happened draw a line. The direction asks for
  "illuminated connections representing real handoffs" (A1, A2).
- **Glows go.** Halo, breathing ring, pulse ring and stage radial are replaced by ring weight and colour, and the only
  motion is a handoff travelling, once. This answers "decorative glowing".
- **Nodes gain people.** Team dots show who is working; the director is the larger dot. This makes a company rather
  than a cluster.
- **The click target is a selection with an inspector, not navigation.** The visualisation becomes interactive, and
  connections become reachable by keyboard and screen reader (A4).
- **Labels sit outside the orbit and the orbit mirrors in RTL** (A2, A8).
- **Reliability tiles leave this page** for `/production` › *Reliability* (a table with the same numbers and their
  counts, so no word breaks). The KPI-tile dashboard was the strongest "generic dashboard" signal (A5).
- **Copy:** the lead becomes one plain sentence; "nothing here is decorative" goes (A9).

### 9.2 Department `/studio/departments/[id]`

```
‹ Studio Company
Department · Cast & world stage                                   ← eyebrow, sentence case, --fg-muted
Casting & Character Design                                        ← .page-title (one language)
Canonical identities: appearance, reference sheets, voice; the character bible and the appearance lock.
● Idle · Director: Casting Director · 4 agents              [ Show in company ]   ← meta line, then actions

Place in the pipeline                                             ← mini orbit slice, 120 px tall, same node/edge tokens
  ○ Story Development ──▶ ◉ Casting & Character Design ──▶ ○ Pre-Production
  ○ Executive Office  ┘ (approves the story first)

Team                                                              ← people list on the ground, .rows hairlines
  (CD) Casting Director           Director · required cast, canonical identities          ● Idle      ›
  (CD) Character Designer         Appearance, proportions, wardrobe, reference sheets     ● Idle      ›
  (CC) Character Continuity       Identity stable across productions                      ● Idle      ›
  (VC) Voice Casting              Persistent voice identity                               ● Idle      ›

Work      [ Now | Delivered | Quality | Activity ]                ← one segmented filter, one list, one empty sentence
  Nothing assigned. Casting starts when a story is approved.   [ Open Production ]

▸ How this department works                                       ← disclosure, closed
    Models (plain names, then mono id) · Tools (name — what it does) · Skills (name, version, instructions ▸)
```
- Monogram: a 32 px circle on `--input`, initials 12 px weight 600 `--fg-muted`. The director's has a 1.5 px `--fg`
  ring (rank by weight, not gold).
- Figures appear only when > 0, inline in the meta line: "34 runs · 91 % first time · median 41 s".
- Phone: the pipeline slice becomes three stacked rows; team rows wrap the role under the name; nothing is cut.

**What changes and why:**
- The gradient wash goes (B1).
- The KPI tiles and four empty boxes go, replaced by one *Work* list with one empty sentence (B2).
- Models and tools move behind *How this department works* (B3, B5).
- The title shows one language (B4).
- The team becomes a people list in place of a card grid with a lone director card (B5, B6).
- Every content string is `dir="auto"` (B7).
- The new *Place in the pipeline* slice ties the department back to the constellation, so the three experiences read
  as one system.

### 9.3 Agent profile `/studio/agents/[id]`

```
‹ Casting & Character Design
 ╭────╮
 │ CD │  Casting Director                                         ● Idle · never run
 ╰────╯  Director · Casting & Character Design
 Resolves who is in a production, creates characters only when the story needs them,
 runs the creation chain as one job and guards the appearance lock.          ← .lead, 64ch

Now           Nothing assigned.                                   ← or: ● Running · Create a character · Layla · 2 min
Track record  No runs yet.                                        ← or: 34 runs · 91 % first time · median 41 s · 2 failures (›)
Recent runs   (rows: outcome dot, job in words, production, when, duration, Details ›)

▸ Technical details                                               ← closed
    Instructions (the system prompt, prose) · Model & limits · Tools · Skills · Quality checks · Input / output
```
- Monogram 56 px. Name `.page-title`. The status sits on the title's baseline row, end side (not floating, C1).
- "Track record" is a definition row, not tiles (C2).
- Technical details hold everything that was in the aside, and constants are rendered as words
  (`APPEARANCE_LOCKED` → "the appearance lock").
- Phone: single column; status under the name.

**What changes and why:** a person-first header (C1), no tiles (C2), internals disclosed (C3), translated plurals and
`dir="auto"` (C4).

### 9.4 Characters directory `/characters`

```
Characters  12                                                       [ + Add character ]
Your studio's cast: one look and one voice each, across every production.

[ Search the cast…              ]  Style ▾  Production ▾  Language ▾      Sort: Recent ▾   [▦|☰]
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          ← .grid-portraits 12.5rem min, gap 24/16
│ 4:5  │ │      │ │      │ │ LH   │ │      │ │      │             (6-up at 1280, 3-up tablet, 2-up phone)
│      │ │      │ │      │ │No    │ │      │ │      │          ← honest placeholder: initials + "No portrait yet"
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
Layla Hassan
Café owner
Arabic · voice ✓ · ⛨ In 2 videos
```
**Empty (the casting call):**
```
Characters
Your studio's cast: one look and one voice each, across every production.

Start your first character
┌──────────────┐ ┌──────────────┐ ┌──────────────┐      ← three 4:5 tiles (12.5rem), typographic, no fake faces:
│              │ │              │ │              │         title 20/26 500 set low in the frame on --input,
│ Describe     │ │ Write the    │ │ From a       │         one-line hint under the frame; each opens
│ them         │ │ sheet        │ │ picture      │         /characters/new?start=describe|sheet|picture
└──────────────┘ └──────────────┘ └──────────────┘
A line is enough  You fill it in   Start from a reference
```
- The filters stay; "Usage" offers *Unused · In videos* only (UX-STRATEGY §G18).
- On a phone, search goes full width and the filters collapse into one *Filter* button that opens a sheet.
- List view: `ArtRow` with a 44 px portrait (keep).

**What changes and why:**
- The empty state becomes the three ways in, as portrait-shaped tiles. The page teaches its own shape and removes a
  click (D1).
- Cards are boxless, with lock and voice state as words.

### 9.5 Character creation `/characters/new`: three methods, simple first

**Order:** method → the one essential input → (disclosed) more control → (summary) production settings → action.

```
Characters › New character
New character
Start the way that suits you. Nothing is drawn until you say so.

How do you want to start?                                        ← radiogroup of 3 tiles, 3-up ≥ 768, stacked rows below
┌● Describe them ─────────┐ ┌○ Write the sheet ────────┐ ┌○ From a picture ─────────┐
│ A line is enough;        │ │ You fill it in; the look │ │ The studio draws them to │
│ Casting does the rest.   │ │ is drawn when you ask.   │ │ match your reference.    │
└──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘

┌ panel ─────────────────────────────────────────────────────────┐  ┌ preview 4:5 (≥1280: aside 16rem) ┐
│ Who are they?                                         0 / 2000 │  │                                   │
│ ┌─────────────────────────────────────────────────────────────┐│  │   (type-set name / brief start    │
│ │ A café owner in her sixties who notices everything…         ││  │    on --input; "Portrait drawn    │
│ │                                                             ││  │    after you design")             │
│ └─────────────────────────────────────────────────────────────┘│  └───────────────────────────────────┘
│ Role, age, where they come from, how they carry themselves.    │
│ Name  [                         ]  optional                    │
│ For the library · Cartoon · Arabic (Iraqi Baghdadi)  [Change]  │  ← settings summary; Change discloses the 4 controls inline
│ ▸ More control                                                 │  ← sex (Studio decides·Woman·Man), age band, species, voice
│ ───────────────────────────────────────────────────────────────│
│ About a minute.                         [ Cancel ] [ Design character ] │
└────────────────────────────────────────────────────────────────┘
```

Shared rules:
- **Production settings are a summary line**, defaulted from `?show=` / `?production=` or Settings. *Change* opens
  For, Style (segmented), Language (segmented) and Dialect (shown only for Arabic) inline. This puts intent before
  configuration (E1).
- **Method tiles:**
  - ≥ 768: 3-up, min 14rem.
  - < 768: **stacked 64 px rows** (icon 20, title 15/20 weight 600, one-line hint, radio on the end side).
  - `?start=` preselects. The choice is kept in `sessionStorage` (exists).
  - This fixes E2.
- **Preflight is visible:** if an engine is down, the reason sits in the footer row in `--warn` text with *Open
  Settings › Engines*. The primary is disabled (neutral disabled style, not 45 % violet). *Write the sheet* always
  works (exists).
- **Footer:** the time estimate sits *before* the actions on the same row (E4). On a phone the footer is a sticky
  bottom bar (56 px, `--bg` with a top hairline) that never covers the focused field: add
  `scroll-margin-bottom: 72px` to fields.
- **No preselected identity facts.** Sex is "Studio decides" by default. Age is a band, unset by default. Voice pitch
  and pace are unset ("Studio decides") in the sheet. The preview shows only what the producer typed or chose (E5).

**Method 1: Describe them.** As drawn above. *More control* holds sex (segmented), age band (segmented), species
(text, no "cat" placeholder) and voice (No voice yet · From my recording later). Submit → the progress stepper
(§6) replaces the panel; the 4:5 preview becomes the result frame where the portrait lands. Then the **Ready** card:
portrait, name, role, three traits, voice row if any, *Open profile* (primary), *Draw another look* (secondary),
*Discard* (quiet, confirm dialog).

**Method 2: Write the sheet.** A 3-step stepper inside the panel, one step visible at a time:
```
 ① Identity ─── ② Look ─── ③ Voice                         ← .stepper, current in --accent, done ✓ --ok
 Identity: Name* · Arabic name (when Arabic) · Role (one sentence, counter) · Sex · Age band (Exact age ▸)
 Look: one "Describe how they look" textarea + "Fill the rest for me" (quiet) · ▸ Details (build, face, hair, skin, eyes, wardrobe, marks as chips)
 Voice: Pitch · Pace (segmented, "Studio decides" default) · Timbre (text) · ▸ Performance notes
 Footer: [Back] … [Create]  [Create and draw]                ← Create and draw is the primary on step 3; Next is primary on 1–2
```
- At most 6 visible fields per step (answers "crowded forms").
- The live preview card (aside ≥ 1280; a 72 px summary bar above the panel on smaller screens) shows only entered
  facts. Names never break mid-word (`overflow-wrap: break-word`).

**Method 3: From a picture.**
```
┌ panel ──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐  Name [            ] optional                       │
│ │  Drop a      │  Keep from the picture  [ The face | Face, hair and wardrobe ]  │
│ │  picture     │  What should change?  [ textarea 2 rows            ]  │
│ │  here  (4:5) │  e.g. "keep the face; put her in a 1970s Baghdad café" │
│ │  or Browse   │                                                     │
│ └──────────────┘                                                     │
│ PNG, JPEG or WebP · at least 512 px on the short side · up to 20 MB  │
│ Add a picture first.            [ Cancel ] [ Design from picture ]    │
└──────────────────────────────────────────────────────────────────────┘
```
- The dropzone **is** a 4:5 frame (fixes E7) and becomes the `ImagePreview` with Replace and Remove once a file is
  chosen.
- Refusals (type, size, short side, server validation reasons) show under the frame with `role=alert`; the zone
  stays usable.
- Progress shows *Your reference → Result* side by side (the `ImagePair`, kept).

**States for all three methods:**
- Busy: the button is `loading` and the panel is `aria-busy`.
- Failure per step: the stepper row turns into the recovery notice (§6) with the coded action (*Draw again* · *Write it
  myself* · *Add a reference* · *Open the job*).
- Partial success keeps the record and offers *Open profile*.
- Leaving with an unsaved brief asks once (exists).

**What changes and why:**
- Method first, settings as a summary: simple first (E1).
- Phone tiles as rows (E2).
- No doubled outlines, and a neutral disabled state (E3).
- Hint placement (E4).
- No invented defaults, plus a stepped sheet (E5, E6).
- A shaped drop target (E7).
- The RTL label and chevron fixes (E8).
- Start-aligned page (E9).

### 9.6 Character profile `/characters/[id]`

```
‹ Characters
┌───────────┐  Cartoon · 64 · Woman · Arabic (Iraqi Baghdadi)                        [ Edit ▾ ] [ ⋯ ]
│           │  Layla Hassan                                      ← .display-xl
│ portrait  │  ليلى حسن                                           ← second name, .text-sm --fg-muted, dir=auto
│ 4:5       │  A café owner who notices everything and says little.
│ 216×270   │  ⛨ In 2 videos · look and voice preserved      ▶ ▁▂▅▇▅▂▁ 0:04  Iraqi dialect voice
└───────────┘
 Appearance 6   Voice   Personality   Used in 2                 ← sticky tabs
```
- **Header:**
  - Portrait 216 px wide (160 tablet, 120 phone), not compact.
  - The **voice is audible in the header** (a compact player: 32 px disc plus a mini waveform), following
    Spotlight's "voice reel" next to the photo [9]. With no voice: "No voice yet · *Add a voice*" (quiet link to the
    Voice tab).
  - The lock appears **once** in the header as the shield and words.
  - *Edit* is a menu: Identity · Look · Personality · Voice characteristics. Each item opens a small dialog of ≤ 6
    fields (replaces the 22-field modal, P1).
  - More: Duplicate as variant · Delete.
- **Appearance tab:**
  - Current portrait (max 360 px) beside the generate panel.
  - Generate panel: *Your reference → Result* `ImagePair`, the phase inside the result frame, *Redraw portrait*
    (primary), *Draw reference views* (secondary).
  - Below: the six reference views in fixed order (§7), each with *Redraw this view* on hover/focus (always visible
    on touch).
  - Then Outfits.
  - "Description of the look" as a read-only `FactList` with *Edit look*.
- **Voice tab:** the Voice identity panel (§9.7).
- **Personality tab:** role (`.h3`), personality (`.prose-copy`), traits as text chips, notes (save in place,
  existing behaviour), facts (`FactList`).
- **Used in tab:**
  - usage history as rows on the ground: 16:9 thumbnail (w 144), production title, kind, shots/takes used (text,
    not accent badges), "first used" date, stage status
  - then "Cast but not filmed yet" as posters
  - an unknown history shows the `warn` notice "History not on record: preserved as if used" with *Duplicate as
    variant*
- **Lock state:**
  - The header (shield and words) and a slim bar *inside* the Appearance generate panel and the Voice identity panel:
    14 px shield, "Preserved: Layla has been in 2 videos. Create a variant to change her look." and *Duplicate as
    variant*.
  - Disabled controls stay visible with `aria-describedby` pointing at that bar.
  - One style: `--fg-muted` text and a `--line` panel edge. No violet card.
- Phone: the header stacks (portrait 120 px beside the name; lead and player below); tabs scroll; the generate panel
  stacks under the portrait.

**What changes and why:**
- A larger, editorial header with the voice audible: portrait plus reel, like a performer profile.
- Edit by section: no crowded form (P1).
- One lock language: accent and violet cards go (G1).
- Plain usage rows.

### 9.7 Voice identity panel (Voice tab)

```
Voice identity                                                    ● Verified          ← status, never a badge
┌ panel ───────────────────────────────────────────────────────────────────────────┐
│ ▶  "شلونك؟ اني هنا من زمان، وين چنت؟"     ▁▂▅▇▅▃▂▁▂▅▇▆▃▂   0:00 / 0:04          │
│    Iraqi dialect engine · from your recording "kitchen-take-2" · version 3        │
│    [ Preview a line ]  [ Compare ]  [ Rebuild ]                     ▸ Check details │
└──────────────────────────────────────────────────────────────────────────────────┘

Create or replace the voice
 ( ● Your recording )  ( ○ Best of your recordings )  ( ○ Studio catalogue )      ← radiogroup tiles
   Upload or record      Picks the clearest one        Needs a MiniMax key — Settings › Engines   (disabled with reason)
 ┌ 4:1 drop / record area ─────────────────────────────────────────────┐
 │ ● Record   or drop a recording · WAV, MP3, M4A, OGG · 3–30 seconds   │   ← MediaRecorder (new), dropzone (exists)
 └─────────────────────────────────────────────────────────────────────┘
 Measured 7.4 s · clear speech · Arabic                              ← plain words; LUFS/WER behind "Check details"
 Your recordings  (radio rows with the audio player; Use as reference)
 [ Build voice from "kitchen-take-2" ]                                ← primary of this section

Takes (previews, last 3, not saved as samples unless kept)
 ▶ "مرحبا، شلونكم؟"   0:03   [ Keep ]  [ Compare with current ]
```
- **Empty state:** the panel reads "No voice yet. Record or upload 3–30 seconds of them speaking. An Iraqi voice
  needs an Arabic recording." It shows the *Your recording* tile selected and the record/drop area open. Nothing
  else.
- **Automatic** ("Best of your recordings") = `VOICE_BUILD mode:'AUTOMATIC'`, which picks the best validated upload;
  the contract says there is no voice bank yet.
  - Disabled with "Add a recording first" when none exists.
  - When a studio voice bank ships (UX-STRATEGY E1), the tile's hint changes to "Matched from the studio's voices"
    and a browsable list appears under it.
- **Manual** ("Studio catalogue") = MiniMax catalogue (`mode:'MANUAL'`). Disabled with the reason when
  `minimaxConfigured` is false. That is today's state on this machine.
- **Reference** = upload or record; validated in the browser (duration) then by the server (contract codes
  `TOO_SHORT | TOO_LONG | NO_SPEECH | TOO_QUIET | CLIPPING | WRONG_LANGUAGE | BAD_FORMAT` → plain sentences, each
  with its fix).
- **Preview a line:** an inline field (not a modal) prefilled per language/dialect. *Speak* runs `VOICE_PREVIEW`; the
  take appears in *Takes* with its phase while running. Takes are not added to the sample list (Backend:
  `preview: true` flag, UX-STRATEGY §G9).
- **Compare:** an A/B strip.
  ```
  A  Current (version 3)   ▶ ▁▂▅▇▅▂   ← press 1
  B  New build (version 4) ▶ ▁▂▆▇▃▂   ← press 2
  ```
  - Same line; both normalised to −20 LUFS by the engine contract, so it is a fair listen.
  - Switching keeps the playhead.
  - *Choose A* / *Choose B* writes the identity.
  - Needs Backend: build as a candidate without replacing the identity (`VOICE_BUILD { candidate: true }`) and a
    `chooseVoiceCandidate` command. Until then, *Compare* compares the current identity with a preview take only, and
    *Rebuild* replaces after a confirm.
- **Choose:** selecting a recording as reference uses radio rows (exists). Choosing a candidate makes the identity
  card crossfade to the new version (`--t-media`), and a toast says "Voice set to version 4."
- **Lock:** once the character has spoken in a video, the slim lock bar (§9.6) sits in the identity panel. Create,
  Rebuild and Choose are disabled with `aria-describedby`; Preview and Compare stay available, and *Duplicate as
  variant* is offered.
- **Check details** (disclosure): heard transcript, coverage, CER/WER, engine, version, job link. This is the place
  for numbers (V1).
- Phone: the tiles stack as rows, the player waveform shortens to 64 bars, and the Compare strip stacks A over B.

**What changes and why:**
- The voice becomes an identity you can hear, compare and choose.
- Every way to create it is shown, with honest availability instead of a disabled button with a footnote.
- Numbers move behind *Check details* (V1).

### 9.8 Settings (audit follow-up, brief)

- Start-aligned in the 1280 column with a 720 px measure.
- Engines show a plain name and state, with the long engine string in *Details* (F2).
- Models show the human name ("MiniMax H3 video, 20 GB, local"), with the file path as `.mono .break-all` in
  *Details*. Workflow versions become a disclosed table (F1).

---

## 10. Loading, error recovery, accessibility (cross-page)

- **Loading:** shape-matched skeletons only until the first phase arrives, then words. No spinner without a sentence
  once a job has a phase. Buttons keep their size while loading.
- **Errors** follow the notice anatomy (§6): what happened, why, what is kept, one recovery. Never only a toast; never
  `window.prompt` (use the inline "What changed?" field, UX-STRATEGY §A11).
- **Keyboard:**
  - Every interactive element is reachable, in reading order.
  - Roving focus inside composite widgets (company stage, segmented controls, tabs, radio tiles, player).
  - Escape closes the innermost layer and returns focus.
  - The focus ring is 2 px `--ring` at offset 2, white on pictures and video. Never removed.
- **Targets:** ≥ 40 px desktop, ≥ 44 px on coarse pointers.
- **Screen readers:** status phrases are text, not colour. Live regions (`polite`) cover job phases and handoffs,
  throttled. Every icon-only control has a translated name.
- **Contrast:** the floors are in §3.4. Never place `--fg-faint` text on anything lighter than `--raised-2`.

## 11. RTL rules

- Logical properties only (`ms-/me-/ps-/pe-/start-/end-`, `inset-inline-*`). No physical `left/right` in components.
  The company diagram mirrors its *x* coordinates in code.
- **Mirror:** back/forward chevrons, breadcrumbs, the nav marker side, drawers' dock side, disclosure chevrons
  (§6 Disclosure), the company orbit direction, the phone spine side, tab and segmented arrow keys, the seek fill and
  ←/→ seeking.
- **Do not mirror:** play/pause/skip glyphs, the waveform's bar shapes, numbers and timecodes (`.num` isolates),
  brand mark, checkmarks [14].
- **Text:**
  - all user and organisation content is `dir="auto"` and aligned to the page start (rule exists in `globals.css`)
  - mixed-script lines are isolated (`<bdi>` or `unicode-bidi: isolate`), so punctuation stays put (fixes B7, C4)
  - no letter-spacing or uppercase anywhere
  - Arabic line-heights per §4
- **Strings:** every visible or accessible string goes through `T()`. Fix the keys found: `char.create.for` → "لمن"
  (not "لـ"); "Breadcrumb"; "no picture yet"; reliability "takes / jobs / review / resolved"; agent "ok · failed ·
  all succeeded", "attempt(s)" → pluralised per locale.
- **Organisation content** (department responsibilities, agent roles and descriptions) needs Arabic fields in
  `src/server/org/model.ts` (`responsibilityAr`, `roleAr`, `descriptionAr`; bump `ORG_VERSION`). Until they exist,
  show the English inside `dir="auto"` blocks so they lay out correctly.
- **Numerals:** Western digits in both locales, one system throughout [14].

## 12. Implementation order (frontend unless noted)

1. **Tokens** (`globals.css`):
   - the `:root` of §3.2 and the `@theme inline` additions
   - `body { overflow-wrap: break-word }`
   - delete the halo, pulse and breathe keyframes, inner highlights and `--shadow-1/2` uses
   - `.eyebrow`, `.kicker`, `.nav-group` per §4
   - `.details` RTL fix
   - `.btn-primary` ivory; `.seg` neutral selection; field focus without glow
   - `--line-field` on all controls
2. **Kit** (`kit.tsx`, `page.tsx`, `cinema.tsx`, `nav.tsx`):
   - Button variants (merge ghost and subtle into quiet)
   - `ChoiceCards` → tiles that stack as rows below 768
   - `Empty` per §6
   - `Stat` retired from studio pages
   - sidebar "New…" secondary; `Crumbs` label translated
   - main padding `var(--gutter)` and max 1280
3. **Company:**
   - rewrite `CompanyDiagram` (geometry, edges from handoffs, node anatomy, roving focus, inspector)
   - new `CompanyInspector`
   - phone spine
   - drop `DEPT_HUES`
   - move `ReliabilityPanel` to `/production` as a table
4. **Department and agent pages** per §9.2–9.3 (monograms; Technical details disclosure).
5. **Characters:**
   - directory empty state with `?start=`
   - creation order and summary header
   - sheet stepper
   - 4:5 dropzone
   - no preselected facts
6. **Character profile:**
   - header with voice player and single lock
   - Edit by section (split `CharacterForm` into four field groups)
   - plain Used-in rows
7. **Voice identity panel** (§9.7):
   - Frontend: record (MediaRecorder), inline preview, takes, compare.
   - Backend: `preview: true` takes, `candidate` builds, `chooseVoiceCandidate`.
8. **i18n:** the strings in §11 and the Arabic org fields (Backend, `ORG_VERSION` bump).

Acceptance for each step:
- Re-run `node scripts/capture-evidence.mjs` for the pages in §13 at 1440 and 390, in both languages.
- Compare against the findings table: every S1 closed, no S2 regressions.

## 13. Evidence index (`docs/evidence/`)

| Page | EN desktop | EN phone | AR desktop | AR phone |
|---|---|---|---|---|
| Studio Company | `design-audit-en-desktop-studio.png` | `design-audit-en-phone-studio.png` | `design-audit-ar-desktop-studio.png` | `design-audit-ar-phone-studio.png` |
| Studio, orchestrator open | `design-audit-en-desktop-studio-orchestrator-open.png` | `design-audit-en-phone-studio-orchestrator-open.png` | `design-audit-ar-desktop-studio-orchestrator-open.png` | `design-audit-ar-phone-studio-orchestrator-open.png` |
| Studio, keyboard focus / hover (ring only) | `design-audit-en-desktop-studio-focus-node.png`, `…-hover-node.png` | — | `design-audit-ar-desktop-studio-focus-node.png`, `…-hover-node.png` | — |
| Department (Casting) | `design-audit-en-desktop-studio-departments-CASTING.png` | `design-audit-en-phone-studio-departments-CASTING.png` | `design-audit-ar-desktop-studio-departments-CASTING.png` | `design-audit-ar-phone-studio-departments-CASTING.png` |
| Agent (Casting Director) | `design-audit-en-desktop-studio-agents-casting-director.png` | `design-audit-en-phone-studio-agents-casting-director.png` | `design-audit-ar-desktop-studio-agents-casting-director.png` | `design-audit-ar-phone-studio-agents-casting-director.png` |
| Characters (empty) | `design-audit-en-desktop-characters.png` | `design-audit-en-phone-characters.png` | `design-audit-ar-desktop-characters.png` | `design-audit-ar-phone-characters.png` |
| New character: Describe | `design-audit-en-desktop-characters-new.png` | `design-audit-en-phone-characters-new.png` | `design-audit-ar-desktop-characters-new.png` | `design-audit-ar-phone-characters-new.png` |
| Describe + Preferences open | `design-audit-en-desktop-characters-new-describe-preferences.png` | `design-audit-en-phone-characters-new-describe-preferences.png` | `design-audit-ar-desktop-characters-new-describe-preferences.png` | `design-audit-ar-phone-characters-new-describe-preferences.png` |
| Write the sheet | `design-audit-en-desktop-characters-new-sheet.png` | `design-audit-en-phone-characters-new-sheet.png` | `design-audit-ar-desktop-characters-new-sheet.png` | `design-audit-ar-phone-characters-new-sheet.png` |
| From a picture | `design-audit-en-desktop-characters-new-picture.png` | `design-audit-en-phone-characters-new-picture.png` | `design-audit-ar-desktop-characters-new-picture.png` | `design-audit-ar-phone-characters-new-picture.png` |
| Settings | `design-audit-en-desktop-settings.png` | `design-audit-en-phone-settings.png` | `design-audit-ar-desktop-settings.png` | `design-audit-ar-phone-settings.png` |

Full-page captures render sticky elements (mobile bar, sticky form footer) at the scroll position where the capture
ended. Where a sticky bar appears mid-page in a phone capture, that is an artefact of full-page capture, not a layout
bug.
