# Vewbox Studio — the interface

The filmmaking studio's interface, running on its own: a midnight ground that lets pictures lead, ivory-white text,
one violet accent, a grouped sidebar with a single **New production** action. It is the studio's September 2026
interface (Git `7c36381`), chosen by the producer over two later redesigns and brought into this frontend-only
application, then refined page by page.

There is no server behind it. Every screen works on a small set of clearly labelled sample content that lives in this
repository, and everything you change is kept in your browser. Nothing is generated, uploaded or rendered — the
buttons that would do that say so when pressed.

## Run it

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:4200>. That is the whole setup: no database, no environment file, no API keys.

| Command | What it does |
| --- | --- |
| `pnpm build` | Production build (`next build`) |
| `pnpm start` | Serve the production build on :4200 |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm test` | Unit tests for the store's actions and the fixtures (Vitest) |
| `pnpm e2e` | Browser tests against the running prototype (Playwright; starts the dev server if needed) |
| `pnpm shots -- --rtl` | Screenshots of every page at 1440/1024/768/390, English and Arabic, into `var/design/after` |
| `pnpm sample-media -- --pictures` | Regenerate the sample pictures in `public/sample` (without `--pictures` also the clips and sounds; needs ffmpeg) |
| `pnpm exec tsx tools/capture-pages.mts <base> <out> name=path…` | Full-page captures of any running build at 1440 and 390 |
| `pnpm exec tsx tools/contact-sheet.mts` | Contact sheets of the sample artwork, for reviewing it by eye |
| `pnpm exec tsx tools/capture-states.mts <base> <out> [--rtl]` | Screenshots of states that need clicks first: the Auto Idea review, a pending reference, players mid-play |
| `BASE_URL=http://localhost:4210 pnpm shots -- --rtl` | The same screenshots from a production build (`pnpm build && pnpm exec next start -p 4210`), without development overlays |

## What is here

```
src/app/            routes — every page is a client component reading the store
src/components/     ui/ (kit, page furniture, cinema objects and banner, navigation, brand, icons), library/ (cards, library bar), show/, wizard/, workspace/, character/, location/, players/
src/demo/           the sample content and the browser-side store
  fixtures.ts       the sample studio: two shows, two seasons, three episodes, two shorts, two music videos, six characters, four locations
  store.tsx         React context over the fixtures, mirrored to localStorage; reset, or start empty
  media.ts          files you add, kept in this browser's IndexedDB and resolved to session URLs
  actions.ts        every change as a pure function (state in, state out) — what the unit tests cover
  selectors.ts      reading helpers (hrefs, progress, what needs attention)
src/domain/         the types and the finite vocabularies (styles, aspects, framings…)
src/lib/            i18n (English + Arabic), formatting, small hooks
public/sample/      the bundled sample media: illustrations drawn by tools/sample-media.mjs, tagged SAMPLE (provenance in PROVENANCE.md; never production output)
tests/              unit (Vitest) and e2e (Playwright)
tools/              sample-media generator, screenshot tools
docs/               design system, references, walkthrough, limitations, removal manifest, test results, screenshots
```

Fixture data never appears inside a component: pages read the store, and the store starts from `seed()`. Replacing the
sample content with a real source means replacing `src/demo`, not the pages. Settings offers **Reset sample data** and
**Start with an empty studio**; files you add are kept in this browser only (see the limitations doc).

## Structure of the studio

Sidebar: **Home** · Productions: **Shows · Shorts · Music Videos** · Library: **Characters · Locations · Asset
Library** · Studio: **Settings**. One primary action above it: **New production**, which offers a show, a short or a
music video.

- **Home** — what you were working on, with its stage and next step; three compact ways to start; a few of the
  newest shows, shorts and music videos with *View all*.
- **Shows** — wide key art with the numbers, the cast and the progress. A show opens into one page: a banner and
  **Overview · Seasons · Characters · Locations · Settings**. Overview lists the seasons as cards, then the shared cast
  and world with room to breathe, beside the show's progress, its facts and the episode to pick up next; Seasons keeps
  a season list on the side and the episodes as rows. The one **Add Episode** button always names the season it adds
  to.
- **Shorts** — posters. A short (or an episode) opens a film workspace: **Overview · Story · Characters · Locations ·
  Storyboard · Produce · Final Cut**, every tab kept mounted so a draft survives a look elsewhere.
- **Music Videos** — square sleeves with a play button. A music video opens a music workspace with a coordinated
  player: **Overview · Song & Lyrics · Performers · Visual Story · Storyboard · Produce · Final Cut**.
- **Characters** — a cast directory: portraits with role, style, where they belong, whether they have been in a
  video, and a voice preview; search and filters for style, production and usage. A character has **Appearance ·
  Voice · Profile · Used In**. Once a character has been in a video, their appearance is preserved
  ([docs/CHARACTER-CONTINUITY.md](docs/CHARACTER-CONTINUITY.md)).
- **Locations** — wide plates. A location has **Overview · Views · Lighting & Variations · Props · Used In**.
- **Asset Library** and **Settings** — quiet supporting pages: every picture, clip and sound by kind; the interface
  language and motion, defaults for new projects, the honest note that generation is not connected, the sample data.

Creating anything starts with two choices. **Auto Idea** is one button — *Create an idea for me* — with optional,
collapsed preferences (style, language and dialect, length, mood, characters and places to include, a music video's
treatment); it opens an editable review of the concept, structure, cast and places before anything is created
(a labelled sample proposal until writing is connected). **Manual Brief** needs only a title or a short
description; look and format, people and places, and a music video's song are optional steps with defaults.

## Read next

- [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) — the interface, page by page, desktop / phone / Arabic / empty studio
- [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) — tokens, the shell, the objects, the rules
- [docs/DESIGN-REFERENCES.md](docs/DESIGN-REFERENCES.md) — what was looked at, and what was taken from each
- [docs/CHARACTER-CONTINUITY.md](docs/CHARACTER-CONTINUITY.md) — the regeneration rule, how the interface enforces it, what a backend must do
- [docs/PROTOTYPE-LIMITATIONS.md](docs/PROTOTYPE-LIMITATIONS.md) — what this prototype does not do, and where the backend would plug in
- [docs/REMOVAL-MANIFEST.md](docs/REMOVAL-MANIFEST.md) — what was removed when the project became frontend-only
- [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md) — the latest test run
- [docs/screenshots/](docs/screenshots/) — the pages, desktop, phone, Arabic and the empty studio
