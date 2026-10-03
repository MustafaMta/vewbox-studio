# Page engineering brief (binding for every frontend engineer)

The producer's visual reference is **Krea's app home** (https://www.krea.ai, signed-in-style app view: compact left
sidebar, near-black page, charcoal cards, small consistent cards, refined type, wide rounded media, clean shelves).
Vewbox translates its principles with its own branding and filmmaking features; nothing of Krea's UI, logo or artwork
is copied. The website is **English-only**; film content (Iraqi Arabic names, dialogue, lyrics) renders correctly.

## 1. The reference implementation
- **Home** (`src/components/home/**`, `src/app/styles/pages/home.css`) is the approved visual standard. Match its
  container, spacing, type sizes, card proportions, shelf behaviour and loading quality on every page.
- **Tokens and components**: `docs/design/VISUAL-STANDARD-V5.1.md` (binding; where it disagrees with
  `docs/DESIGN-SYSTEM-V5.md`, v5.1 wins) and the live tokens in `src/app/styles/tokens.css`
  (page `#101010`, cards `--surface-1 #1F1F1F`, hover `--surface-2`, one radius family 6/10/14/20/pill, Geist + Geist
  Mono, content max 1360 + `--pad`).
- **Shared components**: `src/components/ui/kit/**`, `src/components/media/**` (Frame loads the display thumbnail,
  fades on decode, retries once), `src/components/players/**`, `/kit` specimen. Use them. Do not build a local styling
  system: a page sheet composes layout with tokens only (no raw colours, radii, durations or font sizes; no new
  button/card/badge styles). Missing or wrong shared component → a precise change request to the coordinator, a
  temporary page-local wrapper you delete once it lands.

## 2. Page rules
- One centred container (the shell's `.shell-main`); every heading, card, image, caption and button on the same start
  edge or a column line. Section gap `--section-gap`. Section head: `.t-section` title, optional `.t-body` description,
  one quiet link and/or prev/next buttons at the end.
- Cards: actionable things are `.card` (surface-1, radius 14, no border); media tiles have no box; media with words
  over it use the poster scrim. Equal heights in a row; names one line with ellipsis; descriptions clamp to a fixed
  number of lines.
- Each product area has its own experience (Shows streaming-style key art and show pages; Shorts cinematic posters and
  film pages; Music Videos sleeves, performers, lyrics and playback; Characters a casting directory with the one
  canonical full-body figure and one voice; Production a filmmaking workspace). Never one generic template.
- Empty states: the section head stays; a start card in the content's own shape, or one sentence + one action. Never
  an invented item.
- **Skeletons match the content exactly** (same classes size them; posters as posters, figures as figures, shelves
  with their real card sizes, workspace panels at their real dimensions). Export `<Page>Skeleton` and register it in
  `src/components/shell/route-skeletons.tsx`. Zero layout shift; no full-page spinners; reduced motion respected.
- Content names in grids: `<span class="name"><bdi lang="ar">…</bdi></span>` on the start edge; multi-line content
  `dir="auto"` paragraphs.
- Copy inline in plain English; remove `T()`/copy keys from files you rewrite and delete unused keys from
  `src/lib/copy.ts` (`tests/unit/english-copy.test.ts`).

## 3. Data and safety
- Real data only (store, selectors, APIs). Never fabricate content, counts, trends or progress. Keep every existing
  workflow working (forms, commands, uploads, jobs, players).
- Populated layouts the live studio lacks: `scripts/capture-evidence.mjs --fixture states|sample` (answers the
  browser's own reads; never writes). Never insert fixture data into a database.
- Generation stays paused during the frontend phase: never start a job or POST to the live studio on :4200; never run
  the old `tests/e2e` suites against the `vewbox` database.
- Own dev server: `npx next dev --webpack -p <PORT>` in your worktree, main's `.env.local` copied in, `DATABASE_URL`
  pointed at your own copy (`CREATE DATABASE <db> TEMPLATE vewbox`, or pg_dump | psql), `LIBRARY_ROOT` as main's,
  `node_modules` junctioned to the main checkout's.

## 4. Acceptance (each page, before reporting)
- `npx tsc --noEmit`, `npx vitest run` green on every commit; `git merge main` before the final report.
- Full-resolution captures at **1440, 1920 and 390**, looked at by you; fix what is visibly wrong and capture again.
- A Playwright measurement in the style of `scripts/home-acceptance.mjs` for your pages (throttled load, CLS, shared
  start edge, equal heights, Geist only, no text under 12 px, no horizontal overflow, no frame marked unavailable).
- A Playwright spec `tests/e2e/v5/<pkg>.spec.ts` against your own port for the main interactions (navigation, tabs,
  filters, detail pages, dialogs and forms with writes routed/mocked, playback controls, visible focus, empty and
  loading states).
- Final report under 350 words: commits, pages finished, what was removed, capture paths, measurements, e2e results,
  change requests, anything not verified and why.
