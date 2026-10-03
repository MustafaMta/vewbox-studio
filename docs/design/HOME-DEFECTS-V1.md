# Home defects v1

Source renders: `docs/evidence/home-v1/home-home-{1440,1920,390}.png` (Home on main, real studio data).
Annotated: `docs/evidence/visual-review/home-1440-annotated.png` (boxes 1–22) and `home-390-annotated.png` (P1–P12).
Every fix references `docs/design/VISUAL-STANDARD-V5.1.md` (§ numbers below are that file's). Coordinates are CSS px
in the render. Severity: **B** blocker (the producer's rejection is about it), **M** major, **m** minor.

## Shell and global

| # | Sev | Where | What is wrong | Fix |
|---|---|---|---|---|
| 1 | B | Shell, all widths (box 1, P1) | The v4 sidebar (bordered "New…" button, "Productions / Cast & world / Studio" labels, always-on "Saved" and "Connected" rows, "Collapse Ctrl+\" row) and the v4 phone bar (outlined `+` square, hamburger) still render; no phone bottom bar. | Replace with the v5.1 sidebar (§5.1: 240/64, brand row, search, two groups, footer with the studio state) and the phone top + bottom bars (§5.2). Saved/Connected appear only when abnormal. |
| 2 | B | Type, whole page | Three title voices on one page: Newsreader 108 (marquee), Newsreader 26 (intro sentence), Newsreader 18 (card and character names), Plex Sans 600 (section heads, "Cast someone new", "A show"). The 18 px serif reads soft beside 13 px sans meta. | Geist + Geist Mono only (§4.1); roles per §4.2 (`.t-display`, `.t-section`, `.t-card`, `.t-meta`). Remove Newsreader and Plex from `fonts.ts`. |
| 3 | B | Buttons, all (box 7, 14; P4) | `.btn` draws 8 px rounded rectangles (`--r-2`); every secondary is a transparent box with a 1 px `--line-field` outline; primary 48 high next to sizes 34–44 elsewhere. Reads as form controls. | Pills, filled, md 40 (§5.3): primary `#F5F5F4`/`#0A0A0A`, secondary `#242424`, on cards `#2E2E2E`. Delete every outline style from `kit.css`. |
| 4 | M | Surfaces, whole page | Page `#0A0A09` with groups `#111110` (1.06:1) and title cards `#181817`: everything reads as one flat black; the only lighter block is the studio card, so system info gets the most visual weight. | Token ladder §3.1: sidebar `#050505`, page `#101010`, cards `#1A1A1A`, hover/selected `#242424`, `#2E2E2E`. Cards only for actionable groups (§5.7–5.9). |
| 5 | M | Rhythm, whole page (1440 height 2991) | Section gaps vary: marquee → intro 48, intro → Needs you 40, Needs you → Pick up 96, Pick up → Characters ~110, Characters → Start 96; head → content 20. Page is 18 % longer than its content needs. | Section gap 56 desktop / 40 phone, head 32 high + 16 to content (§3.5). Target page height 2543 at 1440 (§7.7). |
| 6 | M | Radii, whole page | Media 2 px, title cards 2 px, chips 2 px, studio card 8 px, buttons 8 px: the 2 px corners read as unfinished crops at this scale. | One family: tiles and cards 14, marquee 20, chips on art 6, buttons pill (§3.2). |

## Marquee (1440: y 0–756; 1920: y 0–755; 390: y 56–800)

| # | Sev | Where | What is wrong | Fix |
|---|---|---|---|---|
| 7 | B | Picture top, box 2 (1440 x 660–960, y 0–135; same at 1920) | `object-position: 40% 35%` on a 756 px-high box crops the top of the frame: Elias's hair bun is cut by the top edge (the source already has no headroom). | Crop rule §7.1: face in the top 20 % → anchor `0%` vertically; here `object-position: 41% 0%`; at 1440 the picture is shown uncropped at 1120 × 630. |
| 8 | B | Title over subject, box 3 (1440 x 296–975, y 412–518) | "The Static Sky" at 108 px is set across the radio, Elias's gloved hand and cardigan; the title fights the picture and the picture loses its subject. | Nothing over the picture; words under it in columns 1–8 (§7.1). Title `.t-display` 56/60. |
| 9 | M | Start band (1440 x 240–480, full height) | The start 24 % of the hero is a flat black band made by the start gradient over a picture shifted to the end 76 %; the art ends in a smear, not an edge. | Inset rounded frame at full content width, no scrims (§7.1, §3.1 gradients). |
| 10 | M | Readout block, box 5 (1440 x 1110–1395, y 652–705) | "2 scenes · 8 shots · English subtitles, burned in / 1920×1080 · 00:00:56:00" sits on the lit desk at 13 px; technical information on the art, competing with the title. | Remove from Home (§7.1); it lives on the film page. |
| 11 | M | Meta above the title, box 6 | Three stacked lines before the title: a rule + "The final cut is ready", the slate, and "● Finished · exported" joined to the slate with a `·`. Redundant and visually noisy. | One meta row: status badge "Finished" + slate (§7.1). |
| 12 | M | Hero buttons, box 7 | "Screen it" (paper, 8 px corners) beside an outlined "Open the film"; buttons sit at the start under the lead, 28 px below it, unrelated to any column. | Action row in columns 9–12, end-aligned, bottom-aligned with the logline: secondary "Open the film", primary "▶ Screen it", md 40, 8 px gap (§7.1). |
| 13 | M | Resolution at 1920 / 2000 | The 1280×720 frame is upscaled to ~1376 px wide at 1920 (and would be 1680 at 2000): soft. | Picture box per §7.1 table; backend follow-up: a 1920-wide frame from the 1920×1080 cut. |
| 14 | B | Phone picture, P2 (390 y 56–428) | The phone uses a different source (the poster pick) cropped 4:5 at `50% 40%`: it shows the window and a sliver of a character at the right edge; the film's subject is not in frame. | Same wide frame, 4:5, `object-position: 34% 0%` from `portraitFocal` (§7.1); Elias whole and centred; radius 14; 12 px under the top bar. |
| 15 | M | Phone text over picture, P3 (y 400–480) | `margin-block-start: -150px` pulls the kicker and slate over the desk with a gradient; the slate wraps so line 2 begins with an orphan "·" before "● Finished · exported". | Words below the picture (§7.1 phone); separator attached to the preceding fact (§4.3). |
| 16 | M | Phone buttons, P4 (y 686–794) | Two full-width stacked 44 px buttons (paper, then outlined) = 108 px of buttons. | One row, two equal pills, 44 high: secondary then primary (§7.1). |

## Intro and Needs you (1440 y 760–1290)

| # | Sev | Where | What is wrong | Fix |
|---|---|---|---|---|
| 17 | M | Intro sentence + New, box 8 (1440 y 800–858; P5) | "Four decisions wait for you; the studio is paused." in 26 px serif repeats the Needs-you count and the studio card's "Paused"; the outlined "+ New ▾" floats at the far end, duplicating the sidebar's New. On phones the pair costs 150 px. | Remove both (§7). The count lives in the Needs-you head and the sidebar badge; New lives in the sidebar/top bar and section 5. |
| 18 | M | Needs-you head (1440 y 890–915) | Count "4" in faint grey; the head has 20 px to the cards and no relation to the section's accent. Phone (P6): the head wraps to two lines ("Needs you 4 · 1 of 4 · swipe ••••" / "All decisions in Production ›"). | Section head §5.4: count in `--wait`; link "All decisions"; phone keeps one row with "1 of 4" between. |
| 19 | B | Decision media, box 11 (1440 x 296–831, y 940–1085; P7) | Character images are contained in 16:9 on their grey `--art-edge`: the figure fills ~27 % of the width, so the first two cards read as grey slabs next to two full-bleed scene stills. | Decision card media §5.7: portrait crop from `faceBox` (face centre at 38 % of the visible height; fallback `50% 8%`). |
| 20 | M | Kind lines, box 12 (y 1096–1120) | Every card's kind line is tungsten text plus a tungsten dot: 8 amber marks in one row; amber becomes decoration. | Kind line `.t-label` text-3; only the 6 px dot is `--wait` (§5.7, §3.1). |
| 21 | M | Card names, box 13 (y 1122–1145) | Headings in 18 px serif ("Hana Mori", "Two lines to hear again") under 12.5 px sans kind lines and above 14 px sans text. | `.t-card` Geist 15/20 500, 1 line (§4.2). |
| 22 | B | Card structure, box 14 (y 1228–1272) | The cards have no container: four loose columns of image + text; descriptions are 2 or 3 lines, so the four buttons hang at different distances from their text; button widths vary (Review and approve / Listen / Review) and they look like outlined labels. | Level-1 card, one link, 16 px body padding, description exactly 2 lines reserved, the verb as a secondary-on-card sm pill at the bottom; equal heights 315 at 1440 (§5.7). |
| 23 | m | Chips on media ("1.3 · 2.2", "15 takes") | 2 px radius, sans for a readout. | Chip §5.5: 22 high, radius 6, Geist Mono for "1.3 · 2.2". |
| 24 | M | Phone rail, P7 | Cards 80 % wide (286) with the next card's grey figure slab peeking; no visible end alignment. | Cards 280 wide, gap 12, snap start, rail bleeds to the viewport edge with 16 px padding (§7.2, §3.5). |

## Pick up where you left off + the studio card (1440 y 1360–1890)

| # | Sev | Where | What is wrong | Fix |
|---|---|---|---|---|
| 25 | B | Contact sheet, box 16 (1440 x 763–975, y 1405–1745) | Mixed shapes at one height (16:9 442 wide, figure 138, 2.39 plate 593) in a column shortened by the studio card: the plate is cut at the column edge mid-word ("Elias's", "2 plates"), the scrollbar is hidden, nothing says it scrolls. At 1920 the row ends ragged 35 px short of the studio card. | Four equal 16:9 recent tiles, 3 columns each, no studio card beside them (§7.3, §5.6). Characters portrait-cropped; plates `cover`. |
| 26 | B | Grey slabs, box 16 Najm; box 17 Elias, Abu Salam, Najm (1440 y 2035–2330) | Figures that had not decoded render as flat `--art-edge` grey rectangles indistinguishable from a finished grey backdrop; there is no fade and no pulse. (At 1920, lower on the page, they loaded.) | Placeholder = `--art-ph` from the picture's dominant colour, else `--surface-1` + pulse; `--art-edge` only behind a decoded figure; 240 ms fade after decode (§5.5). QA captures scroll to the end and wait for images (§5.5). |
| 27 | B | Studio card, box 18 (1440 x 1027–1390, y 1360–1892; P9 390 y 1876–2406) | The heaviest object on Home: a 360 × 530 lit panel of system rows ("Picture and video Offline", "Voices Offline", "68 jobs done · 1 failed", two "PP" initial avatars with handoff sentences) at the same level as the creative work; on phones a full screen of it before the characters. | State → sidebar footer item (§5.1); details → one 100 px panel at the end of Home with four facts (§7.6). Delete initials avatars and job tallies. |
| 28 | m | Section head "Pick up where you left off" | Head has no end item while every other head has one; 20 px to content. | §5.4: title only is allowed; 16 px to content. |

## Characters (1440 y 1990–2400)

| # | Sev | Where | What is wrong | Fix |
|---|---|---|---|---|
| 29 | B | Arabic name, box 19 (1440 x 777–832, y 2333–2361; P10) | "أبو سلام" is right-aligned in its column (block with `dir="auto"`) while every other name starts on the tile's left edge; it is drawn in the serif stack's Arabic fallback (Times New Roman), a different face. | `.name` block LTR, `text-align: left`, the content in `<bdi lang="ar">` (§4.4); Geist's stack falls back to the system Arabic sans. |
| 30 | M | "Cast someone new", box 20 (1440 x 1227–1390, y 2035–2400; P11) | An empty dark 928:1664 slab with "One image, one voice" in serif at its foot, then a bold sans title and two lines of copy below: different type and caption height from the five tiles; no visible affordance. | The New-character tile §7.4: same frame, centred 40 px plus circle + "New character", empty caption row. |
| 31 | m | Character states | Every tile carries a state line ("Locked · in 1 film" ×2, "Approved"); only Hana and Salam need the producer. | Name only; "Needs approval" badge only when waiting (§5.6). |
| 32 | m | Line-up at 1920 | 6 columns stretch figures to 233 × 420; the row dominates the second screen. | 8 columns at content ≥ 1600 (186 × 333) (§7.4). |
| 33 | M | Phone line-up (390 y 2600–3620) | 2-up grid, 3 rows × ~330 px = 1,000 px for five characters. | Rail of 136 px tiles (§7.4). |

## Start something new (1440 y 2500–2945)

| # | Sev | Where | What is wrong | Fix |
|---|---|---|---|---|
| 34 | B | Start cards, box 22 (1440 x 296–1392, y 2548–2942; P12 390 y 3835–5110) | Three empty title-card slabs (16:9 537 × 302, 2:3 201 × 302, 1:1 302 × 302 at 1440; on phones 358 × 201, 358 × 537 and 358 × 358 stacked = 1,100 px of empty surface). The state label repeats the caption ("A show" inside, "A show" below). | Four action cards, 112 high, 3 columns each; phone 2 × 2 at 104 (§5.8, §7.5). |
| 35 | M | Title sizes in the slabs | "Your first show" 26 px, "Your next film" 13 px (container query in the narrow 2:3 card), "Your first song" 21 px: three sizes in one row. | Gone with fix 34; title cards are ≤ 20 px and one size per row (§5.11). |
| 36 | M | Card tops at 1920 | `align-items: end` on cards of different heights: the 2:3 card's top sits 23 px below its neighbours and its caption starts lower; baselines ragged. | Equal-height action cards (§5.8). |
| 37 | m | Captions | "Seasons and episodes that share one cast and one / world." leaves an orphan word at 42ch. | One-line descriptions with ellipsis on action cards (§5.8); `text-wrap: pretty` elsewhere (§4.3). |
| 38 | m | Head note, phone | "The studio drafts; you approve." wraps to its own right-aligned line under the title. | Description under the title, start-aligned (§5.4, §7.5). |

## Loading and states (not visible in a finished render, seen in code)

| # | Sev | Where | What is wrong | Fix |
|---|---|---|---|---|
| 39 | M | `media.css` `.frame` | Placeholder is `--art-ph` defaulting to `--input`, and contain-fit frames show `--art-edge` before load (see 26); the image fades over 480 ms with an ease-in-out. | §5.5: `--art-ph` per asset, 240 ms `--ease-out` after decode. |
| 40 | M | Home while loading | No Home skeleton: sections pop in as `useLive` data arrives (the studio card's values show "…"). | Skeletons matching §7 (marquee frame + three text bars; 4 card skeletons per row) after 150 ms; crossfade 240 ms; zero layout shift (§5.22, §6). |
| 41 | m | Marquee `onError` | If the wide frame fails, the marquee swaps to the poster at a different ratio, shifting the page. | Keep the 16:9 box; show the failed state of §5.5 inside it. |

## Top 10 (fix order)

1 (shell), 7 + 8 + 14 (marquee crop and words), 2 (type), 3 (buttons), 22 + 19 (decision cards), 27 (studio card),
34 (start slabs), 25 (contact sheet), 26 (grey slabs and loading), 29 (Arabic name alignment).
