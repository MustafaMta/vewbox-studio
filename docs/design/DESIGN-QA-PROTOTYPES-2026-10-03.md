# Design QA of the v5 "Viewfinder" prototypes (2026-10-03)

Status: independent review of `docs/DESIGN-SYSTEM-V5.md` and `docs/design/prototypes/*.html` before any frontend
implementation. Written by the Independent Design QA Agent, who took no part in the design. Nothing in the
prototypes, the spec, `src/` or the database was changed. Evidence: 96 full-page renders and 96 fold (viewport)
renders in `docs/evidence/redesign-qa/<page>-<lang>-<width>[-fold].png` (12 pages × EN/AR × 1440/1920/834/390), 19
zoomed crops in `docs/evidence/redesign-qa/crops/`, and the measurement tables in §7, all taken with headless
Chromium through Playwright (`@playwright/test` 1.63, viewport 1440×900 / 1920×1080 / 834×1112 / 390×844, touch and
mobile emulation below 1024, reduced motion, Google Fonts loaded). The measured values are from the DOM and from the
rendered pixels (sharp), not from the spec's tables.

Inputs read: the v5 spec; the 12 prototypes with `v5.css`, `ws.css`, `v5.js`, `render.mjs`; the redesign record
(`docs/REDESIGN-2026-10-03.md`); the audit (`docs/research/REDESIGN-AUDIT-2026-10-03.md`, 15 problems and the "must be
true" list); both research studies (conclusions, §3 and §4 of the first, §0 and §3 of the AI-filmmaking study).

---

## 0. Verdict

> **Re-check of the revision (merge `82beb5e`): approved with listed follow-ups — see §10.** Three follow-ups
> (F1 focus clipped/hidden, F2 the other-script rule's specificity, F3 the strip affordance) are DS-1 entry conditions;
> the rest are page-level.

Round 1: **Approve with required changes.** The direction is right and the prototypes are, as a whole, premium, cinematic
and coherent: one typographic identity (Newsreader / Markazi Text titles over IBM Plex) carries the entertainment
pages, the cutting room and the Studio Company; the chrome is near-neutral and the pictures do carry the colour;
there are no KPI dashboards, no neon, no glow, no gradients beyond the four allowed, no node graph, no engine names in
the product voice; the needs-you count is 4 everywhere; Arabic is a designed interface, not a mirror. The producer
can read story → scenes → shots → takes → final cut on the production map and in the outline, generate, compare,
choose, continue and recover on the shot page, and the Screening Room puts the film first. Nothing requires rework
of the identity or of a page's composition.

It is not ready to hand to the page packages as it stands, because three defects are **systemic** (they live in the
design-system sheet and the spec, and every page would inherit them) and must land in DS-1 first:

1. **The focus indicator is invisible on paper-filled controls and suppressed on selected states** (§2 B1). The one
   ivory primary per region, the exact control a keyboard user reaches for, shows no focus ring; selected segments,
   pickers, pipeline pills and the selected outline row override the ring with their own box-shadow.
2. **The numerals and bidi rules contradict each other and corrupt data in Arabic** (§2 B2). "1344×768" renders as
   "768×1344", "1280 × 720" as "720 × 1280"; readouts that the spec says keep Latin digits are converted to
   Arabic-Indic digits in a mono font that has none, so the readout voice falls back to Plex Sans Arabic; shot numbers
   appear as "٢.٣" and "2.3" on the same screen.
3. **The type floor and the touch targets break the spec's own rules on every page** (§2 B3). 10–11.5 px text in
   fifteen product components (the spec's smallest class is 12 px; the shot page's own note says 13.5 px minimum),
   and on phones and tablets the controls are 30–36 px high where §4.6 promises ≥ 44 px for coarse pointers.

Beside these, 17 majors (§3) need fixing in the affected pages before or during their packages; none changes the
design's shape. The three things the coordinator asked me to rule on are in §1.

**Scores** (per page, out of 10; see §5 for the table): Home 8 · Shows 7 · Show 8 · Short 8 · Music video 8 ·
Characters 7 · Character 8 (EN) / 6 (AR) · Studio Company 7 · Production map 7 · Shot workspace 7 · Screening Room 7 ·
System sheet 7. Identity and coherence across the three experiences: 8.

---

## 1. The three rulings asked for

### (a) Faces under text or controls (Home hero and elsewhere)

**Home: faces are clear at every width in English and at 1440/1920/834 in Arabic.** Measured geometry of the hero
text and buttons against the rendered art (`crops/crop-home-en-390-hero.png`, the `-fold.png` renders; the full list
is §7.8):

| Render | Title / lead / buttons (x,y w×h) | Where the face is | Clear? |
|---|---|---|---|
| home-en-1440 (1440×900) | title @56,412 804×100 · lead @56,530 593×90 · *Screen it* @56,648 143×52 | Elias at x≈1000–1180, y≈120–430; the portrait at x≈1240–1360, y≈40–220 | yes, ≥ 190 px gap |
| home-en-1920 | title @160,436 804×100 · *Screen it* @160,672 | Elias x≈1300–1520, y≈250–450 | yes |
| home-en-834 | title @24,473 565×72 · lead @24,563 530×81 | Elias x≈590–740, y≈290–460 | yes; the lead ends at x=554, 36 px from his collar |
| home-en-390 (portrait crop) | kicker @60,338 · title @16,434 · *Screen it* @16,634 | Elias x≈240–350, y≈190–300 | yes; the kicker line sits under his chin, not his face |
| home-ar-1440 / 1920 / 834 (shot 1.1) | title right-aligned @610–1384 · lead @760,518 | Najm at x≈150–480, y≈80–330 | yes |
| home-ar-390 | — | **no subject in frame** (see M1) | n/a |

The "slate close to the face" impression at 1440 comes from the slate's `Finished · exported` ending at x≈710 while
Elias's shoulder begins at x≈960; it is a 250 px gap, and the 62 % side scrim keeps the text zone dark. Rule: pass.

**Where faces *are* under controls:**
- **Short page and Screening Room player: the centre play disc sits on Elias's face** at every width
  (`crops/crop-short-player-disc-on-face-1440.png`, `-390.png`): the cut's 0:30 frame has the subject at the
  optical centre, and `.player .center-play` puts the 72 px disc exactly there. The Short's player is the page's
  largest picture, so this is the most visible defect on an otherwise excellent page → **M2**.
- **Characters line-up on touch**: the 44 px voice disc sits on Hana's shoe (`crops/crop-characters-390-disc-on-feet.png`)
  → **M7**, the audit's V4-09 reproduced.
- **Screening Room pinned note** (an annotated B2 example) covers the top of Elias's cap at 1440 and the portraits in
  Arabic; acceptable for a transient note, but the note anchor should default to the side away from the frame's focal
  box → minor.

### (b) The "Needs you" cards on the phone Home

**Deliberate strip, not clipping, but with a weak affordance.** `.decisions` becomes a horizontal rail below 640 px:
`grid-auto-flow: column; grid-auto-columns: 80%; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width:
none`. Measured at 390: the rail is 390 px wide for 1,226 px of content (4 cards of 286 px + 16 px gaps); card 1 is
fully visible, card 2 peeks 72 px (`crops/crop-home-en-390-needs-you-strip.png`). The peek is the only cue: there is no
scrollbar (hidden by design), no prev/next, no page dots, no "4 decisions · swipe" line, and the peeking card's text is
cut mid-word ("Characte…", "Review an…"). The spec (§8.1 Phone) calls for exactly this rail, and the pattern matches
Apple TV's rails, so it is not a defect of intent; it is a defect of signalling on the one screen a producer opens
first on a phone. Required: keep the rail, add a small indicator in the section head ("1 of 4" in the mono, or four
dots) and make the peek intentional (mask the peeking card's text with a 24 px fade or show only its frame). The same
applies to the other seven rails that hide content with no affordance at 390 (§7.5): the Short's tabs show 3 of 6
and the scene strips 2 of 4, the takes row shows 1 of 4.

### (c) English paragraphs in the Arabic character profile

**Direction is right, alignment is wrong, and the spec's §9.2 rule is the cause.** Measured on
`character-ar-1440` (`crops/crop-character-ar-1440-english-look-table.png`): every `dd[lang=en]` and `p.prose[lang=en]`
computes `direction: rtl` on the box, `unicode-bidi: plaintext` (so the paragraph resolves to LTR from its first
strong character and reads correctly, left to right), and `text-align: right` from the rule
`html[dir=rtl] :is(p, div, …, dd)[lang=en] { text-align: right }`. The result is LTR text set ragged-left: the
Wardrobe value's three lines start at x=66, 56 and 591 (§7.7) while all end at x=629; the Personality paragraph's two
lines start at x=130 and x=674. One-line values ("Warm hazel") sit correctly against their Arabic label. The same
right-aligned LTR blocks occur on every page: the Home lead (5 lines at 390), the loglines on Short, Production map and
Screening Room (3–4 lines), the role line, "What happens" in the shot inspector. Readability suffers in proportion to
line count: the eye returns to a different x for each line.

Ruling: **English-only blocks of two or more lines must be set LTR *and* left-aligned inside an isolated block**;
single-line runs may keep the page's start alignment (that is what §9.2 meant by "aligned to the page's start
edge", and it is right for names and one-liners). Concretely: `html[dir=rtl] :is(p, dd, div.ta, blockquote)[lang=en]
{ direction: ltr; text-align: left; unicode-bidi: isolate }` with the existing measure cap, and for a definition list
whose values are English (the look table, the voice facts) flip the whole list to LTR so the Arabic labels stay beside
the values rather than across the column from a left-aligned value. The same root cause splits "Hana Mori" from its
tungsten status line in the Studio inspector's assignments (`crops/crop-studio-ar-1440-assignments.png`): a `b[lang=en]`
block is not in the `:is(…)` list, resolves LTR and left-aligns while its sibling line right-aligns. Amend §9.2 and
§8.8 "RTL" accordingly → **M8**.

---

## 2. Blockers (fix in DS-1 before any page package starts)

### B1 · Focus is invisible on paper-filled controls and suppressed on selected states — all pages, EN/AR, all widths

- `:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px #000 }` (v5.css §2). On a
  **paper-filled control** (`.btn-primary`, `.chip.on`, `.play`, `.node.sel`, the selected `.word.sel`) the inner
  paper ring merges with the fill (paper on paper = **1.00:1**) and the outer black ring sits on the near-black page
  (**1.07:1** on `#0A0A09`, 1.00:1 in the theatre). Net effect: *Screen it*, *Approve*, *New show*, *New character*,
  the play discs and the selected filter chip show no focus. The system sheet draws the intended state (a third paper
  ring, `box-shadow: … 0 0 0 6px var(--paper)` on the "Approve (focus)" specimen) but the stylesheet never implements
  it.
- **State shadows beat the focus ring.** `.seg [aria-checked=true]`, `.pick[aria-checked=true]`, `.pipe a[aria-current]`,
  `.ol-shot.sel`, `.rtakes .t.chosen`, `.rchip.add`, `.input.focus` all set `box-shadow` with higher specificity than
  `:focus-visible`, so a focused selected segment, framing pick, pipeline stage or outline row keeps its 1 px
  `line-strong` edge (1.54–1.72:1) and shows no ring. Measured list in §7.6 (16 selectors).
- Why it matters: WCAG 2.4.7 (A) on the most important controls; the spec promises an AAA-grade ring (§10).
- Required: implement focus with `outline: 2px solid var(--paper); outline-offset: 2px` plus a `box-shadow: 0 0 0 2px
  var(--page)` gap, never with the same property the states use; on paper-filled controls use an inset ink ring
  (`inset 0 0 0 2px var(--on-paper)`) plus the outer paper ring, as the specimen already draws; add a lint rule: no
  component may set `box-shadow` on a focusable element without a `:focus-visible` override.

### B2 · Numerals and bidi: contradictory rules, corrupted data in Arabic — AR, all widths

- **Reversed numbers.** `1344×768` in the shot inspector's "Generation settings" summary renders **"768×1344"**
  (`crops/crop-shot-ar-1440-resolution-bidi.png`); `1280 × 720` in the Screening Room deliverables renders
  **"720 × 1280"** (`crops/crop-screening-ar-1440-poster-size-bidi.png`). v5.js keeps Western digits for "×"
  patterns but leaves them un-isolated in an RTL paragraph, so the bidi algorithm swaps the two numbers. Any
  resolution, ratio, range or file size written as prose will do the same in the product.
- **Readouts converted against the spec.** §3.3 says `.ro` (the mono readout) is "same (Latin digits)" in Arabic;
  §9.4 says durations in slates use Arabic-Indic; v5.js converts every `.ro` that is not also `.tc`. Result: 60
  readout instances carry Arabic-Indic digits (§7.7), and because IBM Plex Mono has no Arabic-Indic glyphs they fall
  back to Plex Sans Arabic, so the "camera readout" voice (§1.1) does not exist in the Arabic interface: `٠:٥٦`,
  `٢٠٢٦`, `٠٩:٢٩`, `١.٢ · ٠:٠٤`, `٥٦.٣ MB`, `٤ files` are set in the interface sans.
- **Shot numbers in two systems on one screen.** The outline reads `١.١ … ٢.٤` (`.ol-shot .no`), the shot cards' chips
  `١.١` (`.scard .n`), the final-cut timeline `١.١` (`.tl b`), while the film strip under them reads `1.1 … 2.4`
  (`.strip .sf .n`, kept) (`crops/crop-shot-ar-1440-outline-digits.png`). Take numbers in the Screening Room's
  take row are `١ ٢ ٣ ٤` while the strip above is Western. §9.4 names "shot and take numbers on art" as Western;
  identifiers must be one system everywhere or the producer cannot match a note to a shot.
- Required: one `formatNumber(value, context)` in `src/lib/format.ts` with explicit contexts (count, date, duration,
  readout, identifier, file data) instead of a text-node walker; identifiers (shot, take, cut, version numbers) and
  readouts always Western and always in the mono; every compound numeric run (`W×H`, `a:b`, `n / m`, timecodes,
  sizes) wrapped in a `dir="ltr"` isolate; resolve §3.3 vs §9.4 in the spec (recommended: Arabic-Indic for counts and
  dates in prose and slates *only when set in the sans*; the mono never carries Arabic-Indic digits).

### B3 · Type floor and touch targets contradict the spec on every page — all pages

- **Text under 12 px in the product** (unique components, §7.2): `.strip .sf .n`, `.sstrip b`, `.tl b`, `.rtakes .t b`
  (10 px shot/take chips on art); `.fposter .fp-k` (10 px kicker, the frame poster's only label); `.gate .you` (10 px);
  `.tabbar .needs` (10 px) and `.needs` (11 px); `.kbd` (11 px); `.on-art-chip` (11 px); `.tcard .tc-state` (11 px: "No
  key art yet", "Not made yet", "New character"); `.chip .n` (11 px); `.tport .hint` and `.tport .tc` at 390 (11 px
  timecode); `.rchip .v` (11 px); `.ol-shot .no`, `.word`, `.lab`, `.pick`, `.insp .agent em` (11.5 px). Counts per
  render: shot-en-1440 **42** elements under 12 px and 50 more between 12 and 13 px out of 171 (54 % of the shot page's
  text is under 13 px); production-en-1440 28 + 51; screening 22 + 23; short 20 + 13. The spec's smallest class is
  12 px (§3.3), §4.6 says "Arabic never below 13", and §8.11 claims the shot page answers audit 14 with a "13.5 px
  minimum". The audit's problem 14 was precisely "the cutting room is dominated by 11–12 px text".
- **Touch targets** at 390 and 834 (coarse pointer, `hover: none` confirmed in the emulation): `.seg button` 30 px
  (Line-up/Index, Song/Video, Draft/Final, 5 s/7 s/10 s, Cut/Continues); `.ibtn-sm` 32 px (every transport button,
  prev/next shot, the workspace back arrow, the now-playing close); `.btn-sm` 34 px (*Use this take*, *New take*,
  *Continue from shot 2.2*, *Review and approve*, *Read the story*, *New episode*, *Screen it*, *Resume the studio*);
  `.play-sm` 36 px; section-head links and `.textlink` 20–26 px; `.reuse` 20 px; the paused-line link 20 px; the
  frame-slot remove button 26 px. §4.6: "coarse pointers ≥ 44". On desktop, `.util a.sec`, `.shead .link`, `.reuse`
  and *Compare* are 20–22 px high (WCAG 2.5.8 wants 24 px for standalone targets; inline sentence links are exempt,
  these are not inline).
- Required: raise the floor in the tokens (Latin ≥ 12 px, Arabic ≥ 13 px, including chips on art: 10 → 12 px with a
  26 px chip), replace the 11.5 px workspace register with 12.5/13 px, and add `@media (pointer: coarse)` rules in
  `kit.css`: `.btn-sm`, `.seg button`, `.ibtn-sm`, `.play-sm`, `.chip` ≥ 44 px (visual size may stay smaller with a
  transparent hit area via `::after`), text links with 12 px vertical padding. Update §4.6 and §8.11 to say what is
  actually built.

---

## 3. Majors (fix in the page's package; none changes the composition)

| # | Page · viewport · language | What is wrong (measured) | Why it matters | Required change |
|---|---|---|---|---|
| M1 | Home · 390 · AR | The art-directed RTL frame (shot 1.1) is cropped to 4:5 with `object-position: 70% 50%`, which puts Najm, the subject, outside the frame: the hero shows a bench and a lamp (`crops/crop-home-ar-390-hero-no-subject.png`). | The spec's whole argument for `portraitFocal` and `rtlFrameAssetId` (§5.4, study decision 10) is that a phone hero shows the subject. The first Arabic phone screen shows an empty room. | `portraitFocal` per asset and per frame; for shot 1.1 the focal is at ≈ 22 % x; the prototype should set `object-position: 22% 50%` in the RTL phone rule; the backfill must compute `portraitFocal` from `faceBox`, never default to the landscape focal. |
| M2 | Short, Screening Room, system sheet · all widths · EN/AR | The 72 px centre play disc covers the subject's face in the cut's 0:30 frame (Short, `crops/crop-short-player-disc-on-face-1440.png`, `-390.png`); the system sheet's mini player repeats it. | "Faces never under text or controls" (§5.4) and "nothing is painted on art except the duration chip and the play disc" rely on the disc not landing on a face; the Short's player is the page's largest picture. | Choose the poster frame by `faceBox` (the frame poster logic already exists) or place the disc at the bottom start inside the transport zone; when a transport is visible, drop the centre disc entirely (the transport's play is enough, as the Screening Room already does). |
| M3 | Shows · all widths | Two placeholder key-art tiles are full-length figures cropped into 16:9 (`object-position: 50% 16%`): Abu Salam is cut at the forehead, Hana at the crown (`crops/crop-shows-wall-cropped-heads-1440.png`). | Audit problem 8 ("figures in the wrong shape, torso crops") reproduced in the direction's own prototype; a reviewer of the Shows page sees exactly what the redesign promised to remove. | Placeholders must obey the shape rule: key art from plates or frames, never from figures; when key art is generated from a figure, the `faceBox` must lie inside the crop with ≥ 8 % headroom. |
| M4 | Production map · all widths · EN/AR | The five-step "flow" is five equal boxes, each with a label, a 22 px serif number and a detail line: `The script · 2 scenes · 8 shots · 15 takes · Cut 3` (`crops/crop-production-en-1440-flow-tiles.png`). | §1.3 refuses "KPI tiles, statistic cards"; the audit's problem 3 named "KPI tiles (Scenes · Shots · Frames · Takes)" on the Short overview. The serif softens it, but the composition is a statistic strip. | Set the flow as one typographic line under a hairline (`Story ✓ The script → Scenes 2 → Shots 8 → Takes 15 → Final cut 3`, 15 px, numbers in the mono), or drop it: the outline on the left already carries the hierarchy. |
| M5 | Shot workspace · all widths · EN/AR | Under each take card the readout is the generation time (`2:59`, `7:11`, `2:36`, `2:50`), in the slot and format where a clip's runtime is expected; the clip is 7.3 s (`crops/crop-shot-en-1440-takes-durations.png`). | A producer comparing takes reads "Take 2 · 7:11" as a seven-minute clip. The Attempts list below already says "7 min 11 s". | Show the take's length (`7.3 s`) in the readout; if the time to make it belongs on the card, write it in words ("made in 7 min 11 s", 12.5 px muted). |
| M6 | Screening Room · 1440, 390 · EN/AR | The caption "She never left." sits at `inset-block-end: 92px`; at 1440 its lower half is behind the transport's blurred band (`crops/crop-screening-caption-under-transport-1440.png`); at 390 (`inset-block-end: 70px`, transport 70 px) it is not visible at all (`crops/crop-screening-player-390.png`). At 1920 it clears by a few pixels. | Captions are on by default (§10); a theatre that hides its own subtitles under its controls fails the one thing the player must do. | Reserve the transport's height in the caption's inset (`calc(var(--transport-h) + 16px)`), move captions up while the transport is shown, and hide them only under the lights-down state. |
| M7 | Characters · 390, 834 · EN/AR | On touch the `.vp` voice disc is always visible at `inset-block-end: 60px; inset-inline-end: 12px` inside the frame and lands on the figure's feet (`crops/crop-characters-390-disc-on-feet.png`). | V4-09 from the audit, reproduced; §5.5 puts controls "outside the art" and §1.2 principle 8 forbids painting on art beyond the chip and the play disc *when it does not cover the figure*. | Move the voice disc to the name row (36 px disc after the name, 44 px hit area), or put it at the frame's top end where the field is empty. |
| M8 | Character, Home, Short, Production, Screening, Shot, Studio · all widths · AR | Multi-line English blocks right-aligned (ragged left): look values of 2–4 lines, personality (2–3 lines), role (2 lines), loglines (3–6 lines), Home lead (5 lines at 390), "What happens" (2 lines); `b[lang=en]` blocks left-align and split from their Arabic sibling lines (Studio assignments). Geometry in §7.7. | Ruling (c): readability drops with each line; the spec's "aligned to the page's start edge" was written for one-line runs. | Amend §9.2: runs of one line keep the start edge; blocks of ≥ 2 lines are `dir=ltr; text-align:left; unicode-bidi:isolate`; definition lists with English values flip to LTR as a whole; include `b, span.block, dt, td, li` in the rule so sibling lines align the same way. |
| M9 | Home, Show · 1440–1920 · EN/AR | Over a hero, the top bar is transparent with `--scrim-top` (70 % → 0 over 100 % height). Pixel-measured contrast of the 13 px faint secondary links: show-ar-1920 "الإنتاج" **median 3.30:1**, "المواقع" 3.39:1; show-ar-1440 4.47:1 (needs 4.5). The wordmark's worst-case pixels reach 2.2:1 over the window (median 17). | 13 px text that fails 4.5:1 in the top bar on the two art-led pages; the measurement at 1920 is with the real art, not a white test card. | On `.topbar--over` set the secondary links to `--fg-body` and deepen the top scrim to 0.85 over the first 120 px; keep the measured check in `scripts/v5-contrast.mjs` on the real heroes. |
| M10 | Studio Company · all widths · EN/AR | "Running now" says "Nothing is running" and then lists two rows of historical totals ("Video Production · 15 takes · median 3 min 6 s", "5 characters drawn · 3 voices designed") under that heading. The Casting & Character Design label sits ≈ 90 px above its node, outside the ring, detached (`crops/crop-studio-en-1440-ca-label.png`). The "Nothing is running" paragraph runs 868 px wide at 13 px (≈ 110 characters per line; 1,140 px / ≈ 145 at 1920). | Honesty and hierarchy: the only numbers on the company page are presented under a live heading while nothing runs (the study's decision 12: no illustrative numbers, nothing synthetic); a detached label breaks the drawing's one rule (label by its node). | Rename the totals "On record · The Static Sky" and move them under the handoffs or into the inspector; place every label within 12 px of its node, `max-inline-size: 150px`; cap the paragraph at 66ch. |
| M11 | Production map · 390 · EN/AR | The workspace bar is a fixed 56 px with `.ttl` wrapping to three lines ("Short film · production / workspace"); the title "The Static Sky" is pushed up under the top bar and clipped (`crops/crop-production-390-wsbar-clipped.png`). The paused line wraps to 3 lines (77–83 px). | The production's name is not readable on the phone's workspace entry. | Truncate the kind line to one line (`text-overflow: ellipsis`), or let the bar grow (`min-block-size: 56px`); shorten the paused line on phones ("Paused · new takes wait" + link). |
| M12 | Studio Company · 834 · EN (and AR label) | Horizontal overflow: `document.scrollWidth` **855 px** on an 834 px viewport; the "World Building & Art Direction" label (`left: 88% + 120px`) extends past the stage (`crops/crop-studio-834-overflow.png`); in AR the mirrored label also sits beyond the viewport edge (right 854). | §11.5 fails any capture with overflow; audit problem 6. | Clamp labels inside the ring box (`inset-inline-end` for end-side labels, `max-inline-size`), or use the spine below 1024 instead of 768. |
| M13 | Shows, Show, System, Screening · all widths | Contrast failures on flat backgrounds (computed, §7.3): `.chip.on .n` count 11 px faint on paper **2.96:1**; the Screening Room's "Use take 3 in this cut" label **4.24:1** because `.rshot span { color: var(--fg-faint) }` cascades into the button; menu description on the highlighted item 4.00:1 (12.5 px); the past lyric lines 4.00:1 (26 px, passes as large text). | Small text under 4.5:1 inside the kit's own components. | Count on a paper chip = `rgb(10 10 9 / .7)` (≥ 7:1); scope row text rules to `.rshot > div > span`; menu descriptions `--fg-muted` on the highlight. |
| M14 | Home, Short, Screening · all · EN/AR | "English and Arabic subtitles" appears in the Home credit, the Screening slate and the deliverables ("Subtitles · SRT · VTT · English · Arabic · 4 files"); the audit's record of the export says "Subtitles en" and the deliverables table itself says the film has "English subtitles, burned in". A "Poster · 1280 × 720 · JPEG" deliverable is listed as downloadable although the frame poster is a proposal (§5.9) and no such asset exists. | Honesty (§7 of the brief): facts presented as real on a page labelled "real: The Static Sky, cut 3" without an annotation. | Either annotate as placeholder like the shows and the song, or show only what the record holds (English subtitles; no poster file until B7 produces it). |
| M15 | Home · 390 · EN/AR | Ruling (b): the Needs-you rail hides 3 of 4 decisions with a 72 px peek as the only cue; no indicator, text cut mid-word. | The first phone screen's most important section looks cut off to a producer who does not already know it scrolls. | "1 of 4" in the section head or dots; fade the peeking card; consider two full-width stacked cards plus "2 more" on phones. |
| M16 | Studio Company · 1440–1920 · EN/AR | Under "Verified skills" the tags are `line-strong` outlined pills (1.72:1 boundary) and the `.insp .agent em` role pills are 11.5 px; the drawing's `pair` bracket and the ⌒ legend glyph are 2.25:1 on the stage. | Legibility of the one page that explains the company; 1.4.11 for the pills' only boundary. | Tags as `--surface` tone on `--raised` or `carbon-8` borders (3.6:1); role pills 12.5 px; bracket colour `carbon-8`. |
| M17 | Short, Show, Home · 390 | Rails and tab rows hide content with no affordance (`scrollbar-width: none`, no nav): Short tabs show 3 of 6, Show tabs 3 of 6, scene strips 2 of 4, Short actions `.toolbar .end` 2 of 3 chips, takes row 1 of 4 (§7.5). | §5.6 promises "the next partly visible" plus prev/next and roving focus; the tabs row offers neither a peek fade nor an indicator, so "Produce 15" and "Final cut" are undiscoverable on a phone. | Keep the native scrollbar on touch (thin) or add an end fade and a scroll indicator; for tabs on phones use a 2-row wrap or a segmented "More" item. |

---

## 4. Minors and nits

**Minors**
1. Disabled controls: `--fg-disabled` (#5E5C57) on the disabled fill is **2.73:1** ("Redraw", "Produce every shot"),
   2.66:1 on a disabled segment option. WCAG exempts disabled controls, but the spec's pattern writes the reason
   beside a label the producer must still read. Raise to ≥ 3:1 (#7A7872).
2. Interactive chips, tags and the `.kbd` keys use `line-strong` (#3A3936) borders: 1.72:1 on the page, 1.54:1 on
   fields. They are identified by their text, so 1.4.11 is arguable; use `carbon-8` (3.6–4.0:1) on anything
   interactive to remove the argument.
3. `.tcard .tc-num` (the large episode numeral) is 1.31:1 — decorative and `aria-hidden`; fine, but at 48 px it reads
   as a broken glyph on some panels. Consider `--line-strong`.
4. Measures: episode synopsis 74 characters per line at 1440 (`.ep p`, 539 px at 14.5 px); the Studio pause
   paragraph ≈ 75; Home's "studio now" fine; the prose and leads are 60–67ch (good).
5. The character voice waveform (96 bars, 2 px min + 2 px gap = 382 px) overflows its 300 px column at 390 and is
   clipped by `overflow: hidden`; generate bars from the available width.
6. Production record (Short): "Story 06:36 · Cast & World 07:21 …" reads as durations; write "at 06:36" or add the
   date to each cell.
7. Show page: the open *New episode* menu (a prototype state) covers Episode 1's status column at every width.
8. Shot page at 390: ≈ 170 px of empty canvas between Attempts and the inspector (`.room`'s `min-block-size:
   calc(100vh - …)` applied to a one-column layout).
9. Screening Room: the pinned note's default anchor overlaps the frame's focal area; "Use take 3 in this cut" names a
   take no radio has selected; the note example is annotated — good.
10. Music video: the warm wash (`oklch(0.25 0.045 62)`) reads slightly muddy over 620 px; the Short's blue wash is
    cleaner. Consider L 0.22 and 480 px.
11. Studio Company AR: `b[lang=en]` names split from their status lines (covered by M8).
12. Secondary buttons have no boundary (1.23:1 fill vs page); acceptable (identified by fill and text) but the hover
    delta (.10 → .16) is 1.1:1; make hover .20.
13. The `.footer` "Help & shortcuts" link and `?` key are 24 px high; fine on desktop, 44 px on touch per B3.
14. `.marquee` height `min(84vh, 780px)`: at 1920×1080 the hero is 780 px with 300 px of near-empty dark art on the
    left; consider `min(84vh, 860px)` at ≥ 1800.

**Nits**
- Bottom bar labels are 11 px (`.tabbar a`), 12 px in Arabic; 12 px in both would match the floor.
- The brand wordmark is Newsreader 600 while §1.4 says 600 and §3.2 says the serif weight is 500/600 — consistent, but
  the wordmark over a hero at 390 measured a worst-case 2.17:1 on bright window pixels (median 17); the top scrim fix
  in M9 covers it.
- `html[dir=rtl] .role { font-style: normal }` is right (no Arabic italic) but the English role line in the Arabic page
  is also upright; it should keep its italic (it is English content).
- `.annot`/`.annot-tag` pink is used correctly and only in prototypes; the Shows wall tags "placeholder" sit in the
  title row and push the serif names — fine for a prototype.
- The Short page's `.castwide .place .frame` plate is `block-size: calc(100% - 64px)` with `object-fit: cover`,
  i.e. an undefined aspect that depends on the figures' height (≈ 2.1:1 at 1440, 1.8:1 at 1920). Use `r-239` or
  `r-16x9` so the shape rule holds.

---

## 5. Per-page scores

Scale 1–10 against the brief's seven questions; "Premium" covers question 1, "Craft" questions 2–3, "Arabic" question
4, "Use" question 5, "Brief" questions 6–7.

| Page | Premium | Craft | Arabic | Use | Brief | Score | Decisive findings |
|---|---|---|---|---|---|---|---|
| Home | 9 | 8 | 7 | 8 | 8 | **8** | M1 (AR phone hero), M15 (rail cue), M9 (bar over art); otherwise the strongest page: one title on real art, decisions with the thing to decide, recent work in real shapes |
| Shows | 7 | 7 | 8 | 8 | 6 | **7** | M3 (cropped heads in placeholder art), M13 (chip count), M17 (chips/tabs rails); the feature and the wall are right |
| Show | 8 | 8 | 8 | 8 | 8 | **8** | M9; numbered rows with stills and stage words are exactly the brief; credits set as type; menu covers EP1 status (minor) |
| Short | 9 | 7 | 8 | 8 | 8 | **8** | M2 (disc on face), M14 (subtitles claim), M17 (tabs 3 of 6 at 390); the diptych, strip and programme note are the best composition in the set |
| Music video | 8 | 8 | 8 | 8 | 8 | **8** | Song-first order works; lyric lines by script are correct in both UIs; wash slightly muddy; now-playing bar well placed above the tab bar |
| Characters | 8 | 6 | 8 | 8 | 7 | **7** | M7 (disc on feet — V4-09 again); line-up itself is right (identical frames, names only, status only when waiting) |
| Character (EN / AR) | 8 | 8 | 5 | 9 | 8 | **8 / 6** | One image, one voice, lock state and reason written beside *Redraw*: the directive answered. AR: M8 (ragged-left English blocks), B2 (readouts) |
| Studio Company | 8 | 6 | 7 | 7 | 7 | **7** | M10 (totals under "Running now"; detached label), M12 (overflow at 834), M16; the ring is typographic and honest, the spine on phones is good |
| Production map | 7 | 6 | 7 | 8 | 6 | **7** | M4 (statistic strip), M11 (bar clipped at 390), B2/B3 density; the gate table, scene boards and the version list are right |
| Shot workspace | 8 | 6 | 7 | 8 | 8 | **7** | M5 (take readouts), B3 (54 % of text under 13 px), B1 (focus on picks/segments); otherwise the brief's shot workspace in full: preview, chips, pickers with drawings, Continue from shot N, phased status, Attempts, Draft/Final, Details folded |
| Screening Room | 8 | 6 | 7 | 8 | 7 | **7** | M6 (caption under transport), M14 (deliverables), B2 (reversed poster size in AR); player first, review beside, programme note under — the theatre works |
| System sheet | — | 7 | 8 | — | 7 | **7** | Shows the intended focus ring the CSS does not ship (B1); 46 elements under 12 px; otherwise a complete specimen |
| **Identity across the three experiences** | | | | | | **8** | Same type, colour, components and rooms in the lobby, the cutting room and the company; the workspace reads as the same product at a different density |

---

## 6. The audit's fifteen problems and the two directives, as the prototypes answer them

| # | Problem | Answered? | Shortfall |
|---|---|---|---|
| 1 | Finished film invisible | Yes: Home marquee, frame poster, Short diptych, theatre | The disc on the face (M2) |
| 2 | No front door | Yes | AR phone hero (M1), rail cue (M15) |
| 3 | One admin template | Yes: five distinct heroes, pages signatures | The production map's statistic strip (M4) |
| 4 | Engine internals | Yes: Details folded, words for phases and failures | — |
| 5 | Status contradicts itself | Yes: 4 everywhere (bar, badge, Home, Studio, tab title); 0:56 everywhere | "Running now" totals (M10) |
| 6 | Phone/tablet overflow | Mostly: 95 of 96 renders have no document overflow | Studio at 834 (M12); wsbar clipping at 390 (M11) |
| 7 | Cutting room is forms | Yes: map + shot workspace; generation secondary on finished work | Take readouts (M5); density (B3) |
| 8 | Wrong shapes | Mostly: figures on their own grey, no pillars, plates 16:9/2.39 | Placeholder key art crops heads (M3); the Short's location plate has no fixed ratio (nit) |
| 9 | Parts never wired | Addressed by the packaging rules (not testable in prototypes) | — |
| 10 | Arabic mirrored English | Largely yes: nav mirrored, content keeps its language, media LTR, Markazi titles, Arabic-Indic setting | Digits/bidi (B2), English blocks (M8) |
| 11 | No action hierarchy | Yes: one light per region, Delete behind More, ConfirmDialog | Focus (B1) |
| 12 | Heavy loading | Spec-level promises only | — |
| 13 | Empty states repeat | Yes: title cards in shape, non-repeating sentences | — |
| 14 | Flat typography | Yes at title scale; no at the small end | 10–11.5 px register (B3) |
| 15 | IA is the org chart | Yes: work first, company last, vocabulary fixed | — |

Directives: **one character = one canonical image + one voice** — yes (profile, line-up copy, lock state, voice
reel with origin). **No node editor** — yes; Generation settings and Details are folded disclosures. **Studio Company
from real execution** — yes, with M10's mislabelled totals. **Three experiences in one identity** — yes.

Primary action singular per region: yes on every lobby page; on the finished shot the inspector shows two equal
secondaries (*New take*, *Continue from shot 2.2*) and no primary, which §5.3 intends. Destructive actions: none in
the main view; *Delete shot* in the outline's row menu is specified, not drawn — the prototype should show the row
menu once. Recovery: the failure notice (system sheet) names the class, what is kept and one recovery — right.

---

## 7. Measurements

Method: `qa-measure.mjs` (headless Chromium; computed styles, bounding boxes, `document.fonts`, scroll geometry) and
pixel sampling of the full-page PNGs (sharp) for text that sits on art, scrims or gradients. Contrast is WCAG 2.x
relative luminance with alpha compositing. "Worst" for text on art is the ratio against the 95th-percentile brightest
background pixel inside the text's box; "median" against the median background pixel. Fonts loaded in every render:
IBM Plex Mono 400/500, IBM Plex Sans 300–700 (variable), Newsreader 400–700 (variable), Markazi Text 400–700, and in
Arabic IBM Plex Sans Arabic 400/500/600. Serif on controls: none found.

### 7.1 Overflow and widths

| Check | Result |
|---|---|
| `scrollWidth > viewport` | **1 of 96**: studio-en-834 = 855 px. All others equal the viewport. (The existing `character-*-390.png` renders in `redesign-proto/` are 1,189 px wide because the figure is sized in `vh` and the full-page capture enlarges the viewport; at the real 390×844 viewport the page is 390 px wide — a capture artefact, not a product defect, but `render.mjs` should set the viewport height to the document height before measuring.) |
| Elements beyond the viewport, not in a strip | studio-ar-834 `.lbl.r` right 854; face `img` and waveform bars inside `overflow: hidden` parents (not visible); otherwise none |
| 1920 | `.wrap` caps at 1,760 px; heroes full bleed; workspace outline 280 / inspector 360 with the canvas growing (preview ≤ 980 px); theatre 2fr/1fr. No stretched text columns beyond 730 px except studio's paragraph (M10) |
| Document heights (1440 EN) | home 3,302 · shows 1,871 · show 2,960 · short 3,479 · music 2,474 · characters 1,361 · character 2,391 · studio 2,197 · production 2,036 · shot 1,425 · screening 1,396 · system 5,519 |
| Fixed bars at 390 | top bar 56 (sticky; absolute over heroes), tab bar 64 fixed at 780–844, now-playing bar 64 at 708–772 above the tab bar; workspace bar sticky at 56–112; body padding-bottom = tab bar height |

### 7.2 Text under 12 px (product components; prototype annotations excluded)

| Size | Component | Where |
|---|---|---|
| 10 px | `.strip .sf .n`, `.sstrip b`, `.tl b`, `.rtakes .t b` shot/take chips on art | short, character, shot, production, screening |
| 10 px | `.fposter .fp-k` ("Frame poster · shot 2.4") | short, character |
| 10 px | `.gate .you` ("You") | studio |
| 10 px | `.tabbar .needs` (the More badge) | all pages at 390/834 |
| 11 px | `.needs` (top bar, tabs), `.kbd`, `.chip .n`, `.on-art-chip`, `.tcard .tc-state`, `.handoff .mono`, `.pin`, `.rchip .v`, `.tport .hint`, `.tport .tc` at 390 | all |
| 11.5 px | `.ol-shot .no`, `.word`, `.lab`, `.pick span`, `.insp .agent em`, `.typeline .k` | shot, production, studio, system |
| 12–12.9 px | `.caption`, `.ro`, `.slate` in tiles (12.5), `.menu .mi span` (12.5), `.ol-shot .s`, `.scard .s`, `.tk .meta`, `.q`, `.excl`, `.flow .k/.s`, `.facts dt`, `.ep .lbl`, `.lyrics .sec`, `.sections th/td.n/td.t`, `.kindl` | all |

Counts (elements under 12 px / 12–12.9 px / total text elements): home-en-1440 12/16/113 · shows 16/2/85 · show
10/26/137 · short 20/13/126 · music 7/34/134 · characters 6/0/45 · character 7/11/84 · studio 9/38/142 · production
28/51/171 · shot 42/50/171 · screening 22/23/113 · system 46/33/222. Arabic renders have fewer (the `+1 px` rule
lifts most captions to 13 px).

### 7.3 Contrast — tokens and flat backgrounds (computed)

Pairs that pass (match the spec's §2.2 within rounding): paper on page 17.28 · body on page 13.40 · muted on page
8.46 / surface 8.07 / field 7.59 / raised 6.97 · faint on page 5.84 / surface 5.57 / field 5.24 / raised 4.81 / canvas
5.81 · tungsten on page 9.59 · ok 10.30 · bad 7.67 · ink on paper 17.28 · paper on secondary fill 14.07 · line-field
(carbon-8) on page 4.00 / field 3.59 / raised 3.30 · paper on chip-on-art over white 10.23 · faint `.kbd` on field 5.24.

Pairs that fail or are borderline:

| Pair | Ratio | Needs | Where |
|---|---|---|---|
| `--fg-disabled` #5E5C57 on page / on disabled fill | 2.97 / **2.73** | 4.5 (exempt when disabled) | Redraw, Produce every shot, disabled segment (2.66) |
| `.chip.on .n` faint on paper | **2.96** | 4.5 | shows "All 6", system |
| `.rshot span` cascade into button label | **4.24** | 4.5 | screening "Use take 3 in this cut" |
| menu description faint on highlighted item | **4.00** | 4.5 | show, system |
| carbon-8 past lyric lines on page | 4.00 | 3 (26 px large) | music (passes as large text) |
| `.tcard .tc-num` carbon-6 on surface | 1.31 | decorative | show episodes 4, 5 |
| line-strong borders (chip, tag, kbd, seg edge, verpick) on page / field / black | **1.72 / 1.54 / 1.82** | 3 (1.4.11 if the border is the identifier) | all |
| line (carbon-6) rules, pips; line-soft | 1.38; 1.16 | decorative | all |
| secondary button fill vs page; field vs page; seg selected vs track | 1.23; 1.11; 1.09 | 3 (if boundary needed) | all |
| meter segments line-strong | 1.72 | aria-hidden with words | shows, show, system |
| studio ring ellipse / pair bracket / node on sunken | 1.21 / 2.25 / 1.24 | 3 for the bracket (carries meaning) | studio |
| focus ring: paper on paper; black outer on page | **1.00; 1.07** | 3 | every paper-filled control (B1) |
| seek track white .25 over black | 2.03 | 3 | players (the played bar and thumb are 9.05) |

### 7.4 Contrast — text on art, scrims and washes (pixel-measured)

| Render | Element | Median | Worst | Note |
|---|---|---|---|---|
| show-ar-1920 | `.util a.sec` "الإنتاج" 13 px faint over the hero top scrim | **3.30** | 3.87 | fails 4.5 (M9) |
| show-ar-1920 / 1440 | `.util a.sec` "المواقع" / "الإنتاج" | 3.39 / 3.44 | 3.99 / 4.47 | fails |
| home/show 1440–390 | wordmark "Vewbox" 22 px over the top scrim | 14–17 | 2.17–2.40 | worst pixels are the window; median fine |
| short 1440/1920 | hero slate 14 px muted over the blue wash | 11.8 | 2.95–3.6 | wash is flat; the "worst" pixels are neighbouring glyph anti-aliasing; passes |
| short 1440 | transport time 12 px on the player gradient | 13.5 | 2.60 | passes on the median; the gradient is 0.82 black |
| music 1440 | transport times 12 px on the warm wash | 12.9 | 2.43 | passes on the median |
| music 1440 | slate "Storyboard" 13 px on the wash | 7.96 | 2.55 | passes |
| music all | past lyric lines 26 px carbon-8 on the wash | 4.00 | 4.00 | large text, passes 3:1 |
| home 1440 | marquee slate/kicker/lead on the scrim | ≥ 5.4 | ≥ 2.2 | medians 5.4–17; the slate's "Cartoon" at 5.4 is the lowest |
| short/music 390–834 | secondary buttons ("Open production", "Continue: Storyboard") | 13–14 | 1.9–3.0 | the box includes the translucent fill's edge pixels; label on fill is 14.07 computed |

Reading: on flat washes the median is the truth and everything passes; on photographic heroes the top bar's faint
13 px links are the one real failure, and the wordmark's worst case says the top scrim is too light where the art is
bright.

### 7.5 Horizontal strips at 390 (visible / total content, children fully visible)

home `.decisions` 390 / 1,226 px, 1 of 4 · home `.contact` 390 / 1,129, 1 of 4 · short `nav.tabs` 358 / 560, 3 of 6
· short scene `.strip` 358 / 492, 2 of 4 (×2) · show `nav.tabs` 358 / 629, 3 of 6 · shows `.chips` 390 / 470, 3 of 4 ·
shows `.end` 390 / 467, 2 of 3 · shot `.tk-row` 366 / 979, 1 of 4 · character `.strip` 248 / 428, 2 of 4 · music
`.rail.videos` 390 / 945, 1 of 3. All have `scrollbar-width: none`, none has prev/next; only `.decisions` and `.rail`
snap.

### 7.6 Focus

`:focus-visible` = `box-shadow: 0 0 0 2px paper, 0 0 0 4px #000`. Focusable elements whose own `box-shadow` wins:
`.seg button[aria-checked=true]` (characters, music ×2, shot ×3, show, system ×2), `.pipe a[aria-current]`
(production, shot), `.pick[aria-checked=true]` (shot), `.ol-shot.sel` (shot), `.rtakes .t.chosen` (screening),
`.rchip.add` (shot), `.input.focus` (system), `.btn-primary` specimen (system). Paper-filled controls with an
invisible ring: `.btn-primary` (every page), `.chip.on`, `.play`, `.play-sm`, `.play-lg`, `.word.sel`, `.node.sel`.

### 7.7 Arabic

- Fonts: Latin titles inside the Arabic pages render in Newsreader at the Latin metrics (104/76/21/18 px measured);
  Arabic titles in Markazi Text 600 (96/72/60/28/23/20 px); interface in Plex Sans Arabic; the readouts in Plex Mono
  except where Arabic-Indic digits force the fallback (B2).
- Western digits left outside the keep list (by design or omission): "1080p" ×5 (home, production ×2, short ×2,
  screening), "1280 × 720", "1344×768", "MP٤" (the "4" in MP4 was converted — a format name), "B٢" in an annotation.
- Arabic-Indic digits inside `.ro` readouts: 60 instances (home 2, short 8, show 5, music 2, character 5, production
  5, shot 11, screening 6, studio 9, system 4) — see B2.
- Arabic-Indic digits inside timecodes/transports: none (the `.tc`/`.transport` keep works).
- English blocks (direction / text-align / lines / first-line start → last-line start, x in px): character 1440 role
  rtl/right 2 lines 449 → 687; personality 2 lines 130 → 674; look Face 2 lines 95 → 555; look Wardrobe 3 lines 66 →
  591 (all end at 629/793); home-ar-390 lead ltr/right 5 lines 36 → 244; short logline 4 lines 527 → 566; screening
  logline 4 lines 70 → 277; production logline 3 lines; shot "What happens" 2 lines 40 → 74. Music lyric lines
  `dir=ltr` left-aligned (651 → 693) — correct.
- Mirroring verified: top bar order and brand position, tabs, crumbs and chevrons (`.i-flip`), outline/inspector
  panes, rails start at the right, scrims at 270°, the Studio ring unmirrored by design, transports/seek
  bars/strips/timecodes LTR, play glyphs unmirrored. The Short's production record runs right to left (a text list,
  acceptable); the shows feature meter is unmirrored (fine, it is a readout).
- Arabic type: Markazi at 96/120 for the marquee and 60/80 for page titles reads at optical parity with Newsreader;
  the 20 px `.t-card-sm` Arabic names in the line-up are a touch small beside 18 px Newsreader (Markazi's x-height is
  low) — consider 22 px.

### 7.8 Home hero geometry (ruling a)

EN 1440×900: kicker @100,338 180×24 · slate @56–374,380 · title @56,412 804×100 · lead @56,530 593×90 · *Screen it*
@56,648 143×52 · *Open the film* @211,648 149×52 · credit @1108,659–700. EN 1920: title @160,436; buttons @160,672.
EN 834: title @24,473 565×72; lead @24,563 530×81; buttons @24,672. EN 390: title @16,434 329×46; lead @16,498
358×108; buttons @16,634 and @16,698 (full width). AR 1440: title @610,400 774×100 (right edge 1384); lead @760,518
624×102; buttons @1177,648 and @1034,648; credit @56,658–700. AR 390: title @45,438; lead @16,504 358×150; buttons
@16,682 and @16,746. Face positions were read from the renders and crops listed in §1(a).

### 7.9 Touch targets (coarse pointer, 390 and 834), unique components under 44 px

20–26 px: `.shead .link`, `.textlink`, `.reuse`, `.paused-line a`, `.crumb`, `.strip-needs`, `.footer a` · 26 px: the
frame-slot remove button · 28–33 px: credits links · 30 px: `.seg button` (14 instances) · 32 px: `.ibtn-sm` (24
instances: transports, prev/next shot, back, close) · 34 px: `.btn-sm` and `.chip` (38 instances) · 36 px: `.play-sm`
(9) · 40 px: `.ibtn`, `.verpick` · 42–43 px: `.rtakes .t`, menu items · tabs 52 px high but 21–42 px wide (spacing
≥ 28 px, acceptable). Desktop under 24 px: `.util a.sec` 20–22 px, `.shead .link` 20 px, `.reuse` 20 px, *Compare* 20
px, search `input` 21 px inside a 44 px label (fine).

### 7.10 Measures (characters per line, 1440; ch ≈ 0.5 em approximation)

home lead 62 · shows lead 61 / feature lead 66 · show lead 60, episode synopsis **74** · short logline 38 · characters
lead 67, rule copy 51 · character prose 79 (= the CSS 66ch cap; ≈ 72 real characters) · studio lead 77, pause 88,
"Nothing is running" **134** (175 at 1920), inspector 57 · production state line 74, logline 49 · system lead 77,
notices 75.

---

## 8. What to change in the spec itself (so the packages build the fixed thing)

1. §2.2 / §13.2: add the failing pairs above (disabled text, selected-chip count, line-strong boundaries, focus on
   paper) and the on-art measurement of the top bar over real heroes.
2. §3.3: state the floors (12 px Latin, 13 px Arabic, 12 px for chips on art) and remove the 10–11.5 px sizes from
   the kit; §8.11: delete "13.5 px minimum" or make it true.
3. §4.6: add the coarse-pointer rule as CSS, not prose.
4. §5.3 / §5.10 / §5.19: specify focus for every state (selected segment, pick, pipeline pill, outline row, chosen
   take) and for paper-filled controls.
5. §5.4: the portrait crop comes from `portraitFocal`; the RTL alternative frame has its own; no fallback to the
   landscape focal.
6. §5.5: the figure tile's voice disc is outside the art; §5.13: no centre play disc when a transport is visible, or
   a face-aware poster frame.
7. §9.2: the one-line / multi-line rule for other-script content (ruling c); §9.4 + §3.3: one numerals rule, mono never
   carries Arabic-Indic digits, identifiers and compound numbers isolated LTR.
8. §8.10: replace the five-cell flow with a line.
9. §8.1 phone: the rail indicator; §5.6: an affordance rule for every strip on touch.
10. §8.12: captions clear the transport; §8.9: "Running now" holds only runs.

---

## 9. Files

- This document: `docs/design/DESIGN-QA-PROTOTYPES-2026-10-03.md`.
- Renders: `docs/evidence/redesign-qa/<page>-<lang>-<width>.png` (full page, fixed bars at the end as in
  `render.mjs`) and `<page>-<lang>-<width>-fold.png` (the first viewport with the fixed bars in place); 192 files,
  the studio's own artwork only.
- Crops: `docs/evidence/redesign-qa/crops/crop-*.png` (19), named by finding.
- The harness and the aggregation scripts were run from the session scratchpad and are not part of the repository;
  their method is described in §7 and can be reproduced from `render.mjs` plus the measurements listed.

---

## 10. Re-check of the revision (merge `82beb5e`, 2026-10-03)

The Creative Director's revision (spec §14 "QA response", revised `v5.css`, `ws.css`, `v5.js` and all twelve pages, a
new `measure.mjs`, a width-true `render.mjs`) was re-checked with my own method, not theirs. Their `measure.mjs` reads
the computed `outline` style of each Tab stop and measures targets by bounding box; it cannot see a ring that is
clipped by an overflow container or hidden under a fixed bar, and it does not test the visual order of numbers. My
harness therefore adds: (1) a keyboard pass with a **pixel test of every focus ring** — the region around each Tab stop
is captured focused and unfocused, and the ring band 2–6 px outside the box is checked on all four sides for a light
ring and its contrast against the ground it replaced; (2) a 7 × 7 hit-test grid inside every focused box to find
stops **hidden under sticky or fixed bars** (WCAG 2.4.11); (3) **hit-tested touch targets** (a transparent `::after`
counts, a covered centre does not); (4) the **visual order of numeric pairs** in Arabic (`W×H`, `a / b`, ranges) from
text-range geometry; (5) English-block line geometry in Arabic; plus the round-1 checks (overflow, type floors, flat
and on-art contrast, strips, clipping). Matrix: 12 pages × EN/AR × 1440/1920/834/390 = 96 states; focus pass at 1440
and 390 (48 states, 1,754 Tab stops; 1,444 on the 11 product pages). Evidence: `docs/evidence/redesign-qa/recheck/`
(96 full-page renders, 48 phone/tablet folds, 198 focus crops in `focus/`, 14 crops in `crops/`).

### 10.0 Verdict

**Approved with listed follow-ups.** The revision fixes what the round-1 review asked for: 15 of 17 majors are fixed
and verified at the widths and languages where they were found, B2 and B3 are fixed, and the identity is intact —
nothing was cheapened to pass a check. The work does not need another design round.

It is not "approved" without conditions, because the focus fix (B1) is only partly effective in the rendered pages and
three of the follow-ups live in the shared sheet, not in a page. Those three (**F1–F3** below) are small, fully
specified CSS changes; they must land **inside DS-1** and be proven by DS-1's acceptance gate (a pixel focus test like
this one, zero clipped rings, zero stops hidden under a bar) before page packages build on the kit. Everything else is
page-level or a spec wording change and can be taken by the owning package.

**DS-1 entry conditions (must be in the DS-1 merge):**

- **F1 Focus is clipped and hidden** (B1 residual). 1,225 of 1,444 product-page Tab stops (84.8 %) show a complete ring
  at ≥ 3:1 (lowest ring-vs-ground 7.42:1) — a real improvement, and no state shadow suppresses a ring any more. The
  rest fail in three systemic ways:
  - **80 stops: the ring's top and bottom are cut off** by the container's `overflow-x: auto` (a scroll container
    clips on both axes): the tabs on Show, Short, Character (anchor nav) and the Screening Room's review tabs at
    ≥ 640 px, the Home contact sheet, the music-video rail, the Shows chip rows at 390. What remains is two vertical
    bars (`recheck/focus/show-en-1440-stop18-focused.png`, `home-en-1440-stop22`, `shows-en-390-stop10`).
  - **30 stops are entirely hidden** under the fixed bottom tab bar (and 19 more partly hidden, mostly by the
    music video's now-playing bar), all at 390: Short tabs Overview/Story/Cast & World/Storyboard, the shot page's
    four camera-move picks, Show's "Add from Characters" and credits, the Character anchor tabs, Screening's
    "Cut 3 · latest" picker, Song/Video, "Help & shortcuts" (`short-en-390-stop12-focused.png`). This fails WCAG 2.4.11
    (AA). `v5.css` sets `scroll-padding-block-start` only; §10 of the spec promises "never obscured by sticky bars".
  - **79 stops lose one side**: workspace outline rows (left edge at x = 0 is off-screen, right edge painted over by
    the canvas column — `shot-en-1440-stop24-focused.png` shows two horizontal lines only), the 72–78 px tall
    crumbs (ring collides with the slate below), segmented options (the neighbour paints over the shared side), rail
    items at the faded end. A focused `.scrolls` strip shows no ring at all (the new `mask-image` clips its outline).

  Required: `@media (max-width: 1023px) { html { scroll-padding-block-end: calc(var(--tabbar-h) + 16px) } }` plus the
  now-playing bar's height where it is shown; inside scroll containers and full-bleed panel rows draw the ring
  inset (`.tabs :focus-visible, .rail :focus-visible, .contact :focus-visible, .chips :focus-visible,
  .ol-shot:focus-visible, .seg :focus-visible { outline-offset: -2px }` — the gap then sits inside the control) or
  give the container `padding-block: 6px` so a 4 px offset ring fits; put the mask of `.scrolls` on a wrapper, not on
  the focusable scroller; make DS-1's acceptance include a pixel focus test (ring on all visible sides, not hidden).
- **F2 The other-script rule loses on specificity** (M8 residual). `html[dir=rtl] :is(div, …, span.block, a.block)[lang=en]
  { text-align: right }` has the specificity of `span.block` (0,1,1) and beats the block rule
  `:is(p, dd, blockquote, .ta, .prose, .lead, .logline, .role, .quote, .block)[lang=en] { text-align: left }`
  (0,1,0) for any **div** block. Measured: the shot inspector's "What happens" (`div.ta[lang=en]`) is LTR but
  right-aligned, lines starting at x = 105, 42, 280 (`recheck/crops/rc-shot-ar-1440-what-happens.png`). Required: make
  the block rule the more specific one (e.g. `:where()` on the run rule, or list the block classes with `div` in the
  block rule), since the product will copy this rule verbatim.
- **F3 The strip affordance is overridden** (M17 residual). The "thin visible scrollbar" of `.scrolls` loses to
  later rules: computed `scrollbar-width: none` on 6 of 8 phone strips (`.strip`'s own rule comes later in `v5.css`;
  `home.html` and `shows.html` reset it in page styles). The end fade survives, so Home and Music are acceptable;
  the **Shows chip rows at 390 have neither fade nor scrollbar** and still hide "Finished 1" and "Recently updated"
  (`.toolbar .chips` sets `scrollbar-width: none` after the `thin` it was meant to get). Required: one strip rule with
  the affordance that pages cannot silently undo (order it last or raise specificity), and `.scrolls` on every strip.

### 10.1 Status of every round-1 item

| # | Item | Status | Re-check evidence (where found → where verified) |
|---|---|---|---|
| B1 | Focus invisible on paper controls; suppressed by states | **Partly fixed** | Ring now an outline: on the primary, play discs, the selected chip and every selected state the ring shows with a dark gap (ring vs the gap beside it: median 17.3:1, lowest 4.3:1 on a selected segment). Residuals in F1: 80 clipped, 30 hidden, 79 one-sided of 1,444 stops |
| B2 | Numerals/bidi: reversed W×H, Arabic-Indic in mono, ids two ways | **Fixed** (minor residuals R1–R3) | 0 reversed numeric pairs (geometry test, all AR states); "1344×768" and resolutions read correctly (`recheck/shot-ar-1440.png`); 0 Arabic-Indic digits in a mono face; 0 shot ids in Arabic-Indic; outline, cards, strips and headings all read "2.3" |
| B3 | Text under 12 px; targets under 44 px on touch | **Fixed** (minor residual R4) | 0 text nodes under 12 px (Latin) / 13 px (Arabic) in 96 states; 0 under 13.5 / 14 px in the workspace main content; on coarse pointers every control hit-tests at ≥ 44 × 44 except tabs (spacing exception, as the spec now states) and items scrolled out of their rail |
| M1 | AR phone hero lost its subject | **Fixed** | Najm (face, glasses, the radio) fills the 4:5 crop (`recheck/home-ar-390-fold.png`); the kicker sits on the radio, not the face |
| M2 | Centre play disc on the face | **Fixed** | No centre disc while a transport is shown (Short at all widths; `recheck/short-en-1440.png`); the transport's play is the paper disc |
| M3 | Placeholder key art crops heads | **Fixed** | Both figure tiles show the whole head with headroom (`recheck/shows-en-1440.png`) |
| M4 | Production map statistic strip | **Fixed** | One typographic line of links under a hairline (`recheck/production-en-1440.png`) |
| M5 | Take readout showed generation time | **Fixed** | "7.3 s" readout; "made in 7 min 11 s" in words (`recheck/shot-en-1440.png`) |
| M6 | Caption under the theatre transport | **Fixed** | Transport docked below the frame; "She never left." fully clear at 1440, 1920 and 390 (`recheck/screening-en-1440.png`, `screening-en-390-fold.png`) |
| M7 | Voice disc on the figure's feet | **Fixed**, new issue N1 | Disc in the name row at all widths; but see N1 (nested interactive) and F1 (Hana's disc focused under the tab bar at 390, 71 % hidden) |
| M8 | English blocks right-aligned in Arabic | **Partly fixed** (F2) | Character profile, loglines, leads, role, notes: LTR, left-aligned, every line starting at the same x (e.g. look values all start at x = 220 at 1440, x = 16 at 390); the look list flipped as a whole. Residual: `div` blocks (F2) and the voice quote at 390 (a `div.quote` without `lang`, 2 lines starting at x = 29 and 224) |
| M9 | Top bar faint links over heroes | **Fixed** | 13 px secondary links over the real hero art: median 12.1–13.5:1 on Home and Show, EN/AR, 1440/1920 (was 3.30) |
| M10 | "Running now" held totals; detached label | **Fixed** | Totals moved to "On record · The Static Sky"; every ring label 6–10 px from its node; the paragraph capped at 66ch |
| M11 | Workspace bar title clipped at 390 | **Fixed** | Title on one line, kind line ellipsised; paused line shortened (`recheck/crops/rc-production-en-390-wsbar.png`) |
| M12 | Studio overflow at 834 | **Fixed** | `scrollWidth` = 834 (the spine is used below 1024; the ring drawing is not shown on tablets — a fair trade) |
| M13 | Small-text contrast failures | **Fixed** | Selected-chip count, review button label and menu descriptions no longer under 4.5:1; remaining flat "failures" are the disabled labels (4.32:1, exempt and now readable) and the decorative episode numeral |
| M14 | Facts presented as real | **Partly fixed** | Home, Short slate and Screening slate now say "English subtitles, burned in"; the poster deliverable is gone; *Good take* and *Draft / Final* carry "proposal · B5 / B6". Residuals: the Screening Room still lists "Subtitles · SRT · VTT · English · Arabic · 4 files" and a "Subtitles 2" tab — every subtitle file in the library is English text (four carry a right-to-left mark, none contains Arabic); and see N4 |
| M15 | Phone Needs-you rail without a cue | **Fixed** | "1 of 4 · swipe" with dots and an end fade (`recheck/crops/rc-home-en-390-needs-you-cue.png`) |
| M16 | Studio tags/pills low boundary | **Fixed** | `carbon-8` boundaries, role pills 12.5 / 13 px; the bracket replaced by a legend line |
| M17 | Strips/tabs hide content without affordance | **Partly fixed** (F3) | Tabs wrap to two 44 px rows on phones (`rc-show-en-390-tabs-wrap.png`); strips fade; the Shows chip rows still hide items with no cue |

Round-1 minors: 1 disabled text **fixed** (4.32:1); 2 interactive boundaries **fixed**; 3 episode numeral
**unchanged** (decorative, 1.64:1, acceptable); 4 measures **fixed** (synopsis 58ch, running paragraph 66ch); 5
waveform **fixed** (no bar beyond its column at 390); 6 production record **fixed** ("at 06:36"); 7 *New episode*
menu **not fixed** — it still covers Episode 1's state column at 1440 (`rc-show-en-1440-episodes-menu.png`;
acceptable as a demonstration of the open menu, but the page should not ship a menu open by default); 8 shot page empty
canvas at 390 **fixed**; 9 screening note **fixed** (opens away from the face, "Use another take…"); 10 music wash
**fixed**; 11 Studio AR split names **fixed**; 12 secondary hover **fixed**; 13 footer links on touch **fixed** (44 px);
14 marquee at ≥ 1800 **fixed** (860 px).

### 10.2 New problems introduced or uncovered by the revision

| # | Severity | Page · width · lang | What | Required |
|---|---|---|---|---|
| F1–F3 | major (DS-1) | shared sheet | See §10.0 | See §10.0 |
| N1 | minor | Characters · all · EN/AR | The voice disc is `<span role="button" tabindex="0">` **inside** the tile's `<a>`: interactive content nested in a link (invalid HTML; a screen reader announces a button inside a link; Enter on the disc can follow the link) | Make the tile two siblings: the link (frame + name) and the disc button after it, positioned in the name row |
| N2 | minor | Shot · 390 · EN/AR | The phone transport hides Audio and Compare (`.opt { display: none }`). Compare survives in the takes header; the audio toggle disappears — "advanced controls may move, never disappear" | Move Audio into the shot switcher row or a More menu on phones |
| N3 | minor | Shot, Show, Home, Screening, Studio, Character · AR | Numerals residuals: **R1** decimal durations are classed as identifiers by the `n.n` pattern, so the same screen reads "٧ ث" (length setting) and "7.3 ث" / "4.2 ث" (take length, recorded line); **R2** a range split across systems: "الموسم 1–٢" (Show cast caption); **R3** a date and its time in two systems: "٣ تشرين الأول، 09:29" (Studio pause line, Screening slate, Home handoffs, Character approval) | In `formatNumber`, decide by kind, not by pattern: a duration is a duration whatever its decimals; a range takes one system for both ends; a date-time in prose follows the date's system (clock times stay Western only in readout columns). State the date-time case in §9.4 |
| N4 | minor | Shot, Short, Screening · all · EN/AR | Backend status overtook the annotations: B2 (notes, Send to shot), B5 (take judgement), B6 (quality tier recorded) and B7 (the key-frame poster, 512×768 from shot 2.4's selected take) were merged in `16f017b`, yet the prototypes still say "needs B2" / "proposal · B5 / B6 / B7". Conversely the record says B6 has **no draft path** on this machine, so a selectable "Draft · faster" option would be a false control in the product | Update the annotations; spec §8.11: *Draft* shown disabled with its reason ("No draft engine on this studio") until a draft path exists |
| N5 | minor | Production, Shot · 1440/1920 | Standalone workspace links are 20–22 px high ("Open the script", "Screen it in the Screening Room", "Compare", "Resume", "Reuse settings") against §4.6's "standalone links get 24 px of height" (WCAG 2.5.8 passes by spacing) | `min-block-size: 24px` on `.shead .link`, `.textlink`, `.reuse`, `.paused-line a` for fine pointers |
| N6 | nit | Production, Shot · 1440 | The 13.5 px workspace floor truncates four outline descriptions ("Najm enters the work…") | Allow two lines in the outline's description, or a `title`/tooltip |
| N7 | nit | Short · 1440/1920 | The location plate at 16:9 now spans the remaining columns and is taller than the two figures beside it; the row's bottoms no longer align | Cap the plate's width (or use 2.39:1) so its height matches the figures |
| N8 | nit | Studio · 1440 | The faint ring ellipse runs through "Idle · script handed over 06:50" under Story Development | Give labels a `--sunken` text background or nudge the label |
| N9 | nit | Shot · 390 | The selected take (Take 4) is the last card of the takes rail, off-screen on arrival | Scroll the selected take into view, or order selected first on phones |

### 10.3 The §9.2 amendment and the honesty annotations

- **§9.2** now states the rule I asked for (runs and one-line items at the start edge; blocks of two or more lines in
  their own direction and alignment, isolated; English-valued definition lists flip as a whole; English italic kept).
  The wording is right. The implementation in `v5.css` has the specificity defect of F2; fix the CSS, not the text.
  The rendered result on the character profile is what ruling (c) asked for (`recheck/character-ar-1440.png`).
- **§9.4** is now one table by kind of number with "the mono never carries Arabic-Indic digits"; the rendered pages
  obey it. Add the three cases of N3 (decimal durations, ranges, date-times) so `formatNumber` does not inherit the
  prototype's pattern-matching.
- **Honesty.** Placeholder shows, the placeholder song and the example note remain clearly annotated; the subtitle and
  poster claims on Home and in the Short were corrected. Two items remain (M14 residual, N4): the Arabic subtitle
  claim in the Screening Room, and annotations that understate what the backend now provides.

### 10.4 Whole-page review at 1440, 1920, 834 and 390, EN and AR

Every page was looked at full-page at all four widths in both languages (renders in `recheck/`). No page overflows
(`scrollWidth` equals the device width in all 96 states; every PNG is exactly the device width). No page lost its
composition to the fixes. Observed beyond the items above: the Studio Company shows the spine instead of the ring at
834 — the tablet loses the page's signature drawing but gains a readable list (acceptable); the music-video
now-playing bar sits above the phone tab bar and covers the performers row at the fold (by design; its focus effect is
in F1); the Short's frame poster now carries a pink "proposal · B7" tag inside the art (prototype-only, see N4).

### 10.5 Scores after the revision

| Page | Round 1 | Re-check | Why it moved |
|---|---|---|---|
| Home | 8 | **9** | AR phone hero shows its subject; rail cue; honest credit line |
| Shows | 7 | **8** | Faces whole; chip rows on phones still need the F3 cue |
| Show | 8 | **8** | Tabs wrap on phones; tab rings clipped (F1) |
| Short | 8 | **9** | Disc off the face, record readable, 0 overflow; plate/figure balance nit |
| Music video | 8 | **8** | Wash cleaner; rail and now-playing focus issues (F1) |
| Characters | 7 | **8** | Disc in the name row; N1 to fix |
| Character (EN / AR) | 8 / 6 | **8 / 8** | English blocks set as English in the Arabic page |
| Studio Company | 7 | **8** | Honest "Running now", labels at their nodes, no overflow |
| Production map | 7 | **8** | Flow as a line, bar fixed at 390, workspace floor met |
| Shot workspace | 7 | **8** | Takes read as clips, floor met, resolution order right; F1/F2 residuals |
| Screening Room | 7 | **8** | Captions clear; Arabic subtitle claim to correct |
| System sheet | 7 | **8** | Focus specimens on every surface; floor met |
| Identity across the three experiences | 8 | **8** | Unchanged and intact |

### 10.6 Measurements (re-check)

| Check | Result (96 states unless stated) |
|---|---|
| Document overflow | 0 (`scrollWidth` = viewport in every state) |
| Text under 12 px Latin / 13 px Arabic | 0 |
| Workspace main content under 13.5 / 14 px | 0 (production, shot; 16 states) |
| Flat-background text under 4.5:1 (3:1 large) | only disabled labels (4.32:1, exempt) and the decorative episode numeral (1.64:1) |
| Text on art, median under 4.5:1 | only the past lyric lines (4.00:1 at 21–26 px, passes as large text) |
| Top-bar secondary links over hero art | median 12.1–13.5:1 (Home, Show; EN/AR; 1440/1920) |
| Arabic: mono text with Arabic-Indic digits / shot ids in Arabic-Indic / reversed numeric pairs | 0 / 0 / 0 |
| Arabic: elements mixing digit systems | 47 unique — all by the §9.4 rule (identifier or readout beside a count), except the N3 cases |
| Coarse-pointer targets under 44 × 44 (hit-tested) | 0 real; tabs 21–41 px wide (spacing exception); items scrolled out of a rail |
| Fine-pointer standalone links under 24 px high | 5 kinds of link in the workspace, 20–22 px (N5) |
| Focus: product-page Tab stops (1440 + 390, EN + AR) | 1,444 · complete ring at ≥ 3:1: 1,225 (84.8 %) · top/bottom clipped: 80 · one side missing: 79 · fully hidden under a bar: 30 (all at 390) · partly hidden: 19 · lowest ring-vs-ground 7.42:1 |
| Studio label-to-node distance | 6–10 px for all eight departments |

