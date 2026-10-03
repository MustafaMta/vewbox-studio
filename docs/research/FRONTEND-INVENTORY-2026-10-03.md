# Frontend inventory before the simplification (redesign phase 5, 2026-10-03)

Read-only audit of `src/components`, `src/app`, `src/app/styles`, `src/lib/i18n` and `package.json` at main `914f6a5`
(worktree `agent-acd38be195cb4b0dd`; no application code changed). It names what each component is, who uses it, which
generation it belongs to (v3 pages, v4 kit F2, v4 media F3, shell F4) and the verdict `docs/DESIGN-SYSTEM-V5.md` §11
implies. The removals are **not** executed here: the page packages (DS, P-Home … P-Studio) replace the pages first, and
Q2 executes `docs/research/frontend-removal-plan.json` once they have landed. The measured baseline is in
`docs/research/FRONTEND-MEASUREMENTS-2026-10-03.md`.

## 1. Method (re-runnable; scripts in `docs/research/frontend-audit-2026-10-03/`)

| Question | How it was answered |
|---|---|
| Which routes reach a component | `graph.mjs`: the TypeScript compiler (`ts.resolveModuleName` over every static import, `export … from`, literal `import()` and `import('…')` types) builds the module graph of `src/`, `tests/`, `scripts/`, `tools/`; reachability from every Next entry (`page/layout/error/loading/not-found/route`), `src/proxy.ts`, `src/instrumentation.ts`, `src/worker/index.ts`, `src/server/db/cli.ts`. A layout's reach counts for every route under it |
| Unreferenced exports | the same script: TS LanguageService `findReferences` on every export of `src/components`, `src/studio`, `src/lib`, `src/app`, `src/domain`, counted per production / specimen / test file (the method of `docs/AUDIT-CODEBASE.md`) |
| Generations and verdicts | the file ownership and decisions of `DESIGN-SYSTEM-V5.md` §11.1 / §11.4 and the headers the files carry ("v3 PARTS KEPT UNTIL Q1", "LEGACY SHIM", "TEMPORARY") |
| CSS classes | `css.mjs`: every `.class` in a selector prelude of `src/app/styles/**` (comments stripped, nesting respected) against (a) a word-boundary search of `src/**/*.ts(x)`, (b) template prefixes such as `` `badge-${tone}` ``, and (c) the union of class names found in the DOM of 40 rendered pages (20 URLs × 1440 and 390, `dom-classes.json` from `measure.mjs`). Token aliases: every `--name:` definition against every `var(--name)` use and every Tailwind utility (`text-ink-500`, `bg-accent`) in source. Conflicts: the same single-class selector declaring the same property in two sheets |
| Dependencies | the graph's external specifiers per file (`package.json` names), plus `tests/`, `scripts/`, configs for devDependencies |
| i18n | `i18n.mjs`, the G1 method: a key is used when it appears as a string literal in `src/` (outside the dictionary), or matches a dynamic family `` `prefix.${…}` ``, `'prefix.' + x`, `` `prefix.${…}.tail` ``, or `T.dyn(\`prefix.${…}\`)`; keys used only by `tests/` or only by the specimen pages are listed apart |
| Forms, dialogs, progress, errors | `rg` over `src/` for `<form`/`onSubmit`, `window.confirm|prompt`, `toast.bad|setError|.catch(() => …)`, `role="progressbar"|percent|setInterval`, read in context |

Counts: 179 files under `src/components` (179 incl. 8 icon lists), 34 page routes in the build, 785 CSS classes in 14 sheets,
1896 dictionary keys, 10 dependencies + 12 devDependencies, 299 entries in the removal plan.

## 2. The picture in five lines

1. **The product still renders on v3.** No product route reaches `media/**` (heroes, tiles, rails, Frame, TitleCard), `edit/**` (timeline, reel, dock, compare), `players/{Theatre,Canvas,Preview}Player`, `players/music/*` or the kit's `Dialog`, `ConfirmDialog`, `Drawer`, `CatalogueBar`, `ApprovalCard`, `CreationShell`, `PageEmpty`, `ShapedDropzone`, `FormFooter`, `CompactHeader`. They are reached only from `/kit` and `/kit-media`. The pages are carried by `ui/cinema.tsx` (Hero ×4, Art ×11, Empty ×12), `ui/kit/legacy.tsx` (Modal ×11, Thumb ×8, Details ×14, ConfirmDelete ×4, ConfirmButton ×3) and `library/*Card`.
2. **Every job is done twice** (§4): two confirm dialogs (three with `window.confirm`), two modals, two menus, two heroes, two card families, two empty-state systems, two catalogue bars, two compact headers, three `useMediaQuery`, three re-exports of `useRootVarContribution`, two breadcrumb trails, two dropzones, two choice pickers, two voice players, two progress bars. The survivor is the v4 part in every case but one (`Details`).
3. **The shell's rooms are dead state**: nothing renders `<Room>`, so `data-room` is always `lobby`; the cutting-room rail, density, the theatre lights, the focus-mode shortcut and the theatre tint can never happen (§11).
4. **One store, one object, 71 importers**: every consumer re-renders on any change; the 562 KB snapshot is read three times per page load in development (twice in production) and re-read in full after every event from another client; the shell polls the pipeline on every page every 30 s.
5. **CSS and strings are already mostly clean** (F0's split worked): 7 unused classes of 785, 17 unused keys of 1896. The waste is elsewhere: 28 token aliases (`--ink-*`, `--iris-*`, `--violet-*`, `--accent*`) still carry the palette through 15 files, 32 property-level conflicts between `kit.css`/`shell.css`/`media.css`, and 315 keys that exist only for the specimen pages yet ship to every route in the 241 KB shared chunk.

## 3. Components

### 3.1 By directory

| Directory | Files | KB | Reached by product routes | Specimens only | Unreachable |
|---|---|---|---|---|---|
| `src/components/character` | 22 | 212 | 22 | 0 | 0 |
| `src/components/edit` | 12 | 53 | 0 | 11 | 1 |
| `src/components/library` | 9 | 28 | 8 | 0 | 1 |
| `src/components/location` | 2 | 15 | 2 | 0 | 0 |
| `src/components/media` | 23 | 103 | 0 | 22 | 1 |
| `src/components/players` | 22 | 91 | 11 | 10 | 1 |
| `src/components/shell` | 24 | 88 | 21 | 0 | 3 |
| `src/components/show` | 1 | 26 | 1 | 0 | 0 |
| `src/components/studio` | 6 | 58 | 6 | 0 | 0 |
| `src/components/ui` | 43 | 231 | 37 | 6 | 0 |
| `src/components/wizard` | 1 | 46 | 1 | 0 | 0 |
| `src/components/workspace` | 14 | 112 | 14 | 0 | 0 |

"Reached by product routes" counts files on the static import graph of at least one page other than `/kit` and `/kit-media`.
Layout-reached files (shell, kit barrel, icons, locale, store) count as reached by every route.

### 3.2 Every file

Routes are the pages whose static import graph contains the file (`EP` = the episode route, `/shot` = `/shots/[shotId]`);
"product importers" excludes the specimen files. The verdict follows §11.1 (keep / restyle / replace / delete) and the
"after" column names the package whose landing makes the deletion safe (Q2 = the consolidation package, after all pages).

| File | KB | Gen. | Used by routes | Product importers | Verdict (§11) | After |
|---|---|---|---|---|---|---|
| `character/CastCard.tsx` | 4.5 | v3 | /characters | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/CharacterForm.tsx` | 14.8 | v3 | /music-videos /music-videos/:id /new/:kind /shorts/:id /shows/:id EP | 2 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/CharacterImage.tsx` | 3.6 | v3 | /characters/new /characters /characters/:id | 6 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/CharacterPage.tsx` | 12.8 | v3 | /characters/:id | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/ConsentChoice.tsx` | 4.0 | v3 | /characters/new /characters/:id | 2 (+1 test) | replace (character profile, creation, voice); delete after | P-Cast |
| `character/EditDialogs.tsx` | 10.5 | v3 | /characters/:id | 2 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/ImagePanel.tsx` | 10.1 | v3 | /characters/:id | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/SecondaryMaterial.tsx` | 4.0 | v3 | /characters/:id | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/VoicePlayer.tsx` | 7.8 | v3 | /characters/new /characters/:id | 2 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/VoiceSection.tsx` | 33.7 | v3 | /characters/:id | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/contract.ts` | 13.2 | v3 logic | every route (root layout) | 10 (+3 test) | keep the logic (no JSX); move under src/studio or src/domain | P-Cast |
| `character/create/CreateCharacter.tsx` | 22.5 | v3 | /characters/new | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/create/CreationProgress.tsx` | 5.8 | v3 | /characters/new | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/create/DescribeStart.tsx` | 8.2 | v3 | /characters/new | 3 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/create/PictureStart.tsx` | 9.1 | v3 | /characters/new | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/create/ReadyCard.tsx` | 3.7 | v3 | /characters/new | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/create/SharedHeader.tsx` | 3.6 | v3 | /characters/new | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/create/SheetStart.tsx` | 10.4 | v3 | /characters/new | 1 | replace (character profile, creation, voice); delete after | P-Cast |
| `character/create/preflight.ts` | 11.1 | v3 logic | /characters/new /characters/:id | 6 (+3 test) | keep the logic (no JSX) | P-Cast |
| `character/identity.ts` | 13.6 | v3 logic | every route (app shell) | 10 (+1 test) | keep the logic (no JSX); move under src/studio or src/domain | P-Cast |
| `character/look.ts` | 1.7 | v3 logic | /characters/:id /music-videos /music-videos/:id /new/:kind /shorts/:id /shows/:id EP | 2 (+1 test) | keep the logic (no JSX); move under src/studio or src/domain | P-Cast |
| `character/sheetModel.ts` | 3.5 | v3 logic | /characters/new /characters/:id | 5 (+1 test) | keep the logic (no JSX); move under src/studio or src/domain | P-Cast |
| `edit/CompareAB.tsx` | 6.7 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/DockLayout.tsx` | 11.1 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/DualScaleStrip.tsx` | 3.8 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/FilmStrip.tsx` | 3.8 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/FocusMode.tsx` | 2.2 | v4-media | specimens only (/kit, /kit-media) | 2 | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/Inspector.tsx` | 2.2 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/StoryboardReel.tsx` | 6.0 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/Timeline.tsx` | 11.1 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/ToolRow.tsx` | 1.9 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/VersionStack.tsx` | 3.2 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; P-Work adopts (0 product users today) | DS-2 / P-Work |
| `edit/index.ts` | 0.8 | v4-media | none | 0 | barrel with 0 importers: delete or make it the import path | Q2 |
| `edit/useMediaQuery.ts` | 0.5 | v4-media | specimens only (/kit, /kit-media) | 3 | delete: third copy of useMediaQuery | DS-2 |
| `library/CanonPicker.tsx` | 6.6 | v3 | /music-videos /music-videos/:id /shorts/:id /shows/:id EP | 4 | replace by reference chips (RefChips) and picks | P-Work |
| `library/Cards.tsx` | 0.7 | v3 barrel | none | 0 | delete (0 importers) | Q2 |
| `library/Library.tsx` | 4.6 | v3 | /characters /locations/new /locations /music-videos /shorts /shows | 6 | delete: LibraryBar/NoMatches/useView; CatalogueBar is built and unused | Q2 (after P-Shows, P-Film, P-Music, P-Cast) |
| `library/LocationCard.tsx` | 1.9 | v3 | /locations | 2 | replace by PlateTile; delete after | P-Cast |
| `library/MusicVideoCard.tsx` | 4.1 | v3 | /music-videos | 2 | replace by SleeveTile; delete after | P-Music |
| `library/ProductionTile.tsx` | 3.3 | v3 | /characters/:id /locations /locations/:id /music-videos /music-videos/:id /production /shorts /shorts/:id /shows /shows/:id EP | 11 | replace: StageStatus → StateWord, ProductionMenu → tile menu with ConfirmDialog | Q2 (after P-Shows, P-Film, P-Music) |
| `library/ShortCard.tsx` | 2.4 | v3 | /shorts | 2 | replace by PosterTile / frame poster; delete after | P-Film |
| `library/ShowCard.tsx` | 3.2 | v3 | /shows /shows/:id | 3 | replace by KeyArtTile; delete after | P-Shows |
| `library/StartCard.tsx` | 1.7 | v3 | /new | 2 | replace by Home "Start something new"; delete after | P-Home |
| `location/LocationForm.tsx` | 4.1 | v3 | /locations/new /locations/:id /music-videos /music-videos/:id /new/:kind /shorts/:id /shows/:id EP | 4 | replace; delete after | P-Cast |
| `location/LocationPage.tsx` | 10.9 | v3 | /locations/:id | 1 | replace; delete after | P-Cast |
| `media/CastRow.tsx` | 3.9 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/CompactHeader.tsx` | 3.7 | v4-media | specimens only (/kit, /kit-media) | 1 | keep (survivor of the two CompactHeaders); restyle | DS-2 |
| `media/Episodes.tsx` | 7.1 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/FaceCircle.tsx` | 2.0 | v4-media | specimens only (/kit, /kit-media) | 4 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/Frame.tsx` | 4.5 | v4-media | specimens only (/kit, /kit-media) | 4 (+1 test) | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/Rail.tsx` | 5.5 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/Slate.tsx` | 1.5 | v4-media | specimens only (/kit, /kit-media) | 4 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/Specimens.tsx` | 1.5 | v4-media | specimens only (/kit, /kit-media) | 0 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/StageMeter.tsx` | 1.1 | v4-media | specimens only (/kit, /kit-media) | 2 (+1 test) | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/TitleCard.tsx` | 3.0 | v4-media | specimens only (/kit, /kit-media) | 3 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/art.ts` | 4.8 | v4-media | specimens only (/kit, /kit-media) | 11 (+1 test) | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/hero/HeroText.tsx` | 3.2 | v4-media | specimens only (/kit, /kit-media) | 2 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/hero/Heroes.tsx` | 9.7 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/hero/index.ts` | 0.2 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/index.ts` | 1.0 | v4-media | none | 0 | barrel with 0 importers: delete or make it the import path | Q2 |
| `media/specimens/EditSection.tsx` | 7.7 | v4-media | specimens only (/kit, /kit-media) | 0 | keep (specimen sections of `/kit`) | DS-2 |
| `media/specimens/MediaSection.tsx` | 18.9 | v4-media | specimens only (/kit, /kit-media) | 0 | keep (specimen sections of `/kit`) | DS-2 |
| `media/specimens/PlayersSection.tsx` | 5.7 | v4-media | specimens only (/kit, /kit-media) | 0 | keep (specimen sections of `/kit`) | DS-2 |
| `media/specimens/data.ts` | 7.6 | v4-media | specimens only (/kit, /kit-media) | 0 | keep (specimen sections of `/kit`) | DS-2 |
| `media/specimens/ui.tsx` | 1.0 | v4-media | specimens only (/kit, /kit-media) | 0 | keep (specimen sections of `/kit`) | DS-2 |
| `media/tiles/TileShell.tsx` | 5.3 | v4-media | specimens only (/kit, /kit-media) | 2 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/tiles/Tiles.tsx` | 4.5 | v4-media | specimens only (/kit, /kit-media) | 1 | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `media/tiles/index.ts` | 0.2 | v4-media | specimens only (/kit, /kit-media) | 2 (+1 test) | keep anatomy, restyle; pages must adopt (0 product users today) | DS-2 |
| `players/CanvasPlayer.tsx` | 6.0 | v4-media | specimens only (/kit, /kit-media) | 0 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/Controls.tsx` | 7.7 | v4-media | /assets /music-videos /music-videos/:id /music-videos/:id/shot /new/:kind /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot + specimens | 10 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/InlinePlayer.tsx` | 5.0 | v4-media | /assets /music-videos /music-videos/:id /music-videos/:id/shot /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot + specimens | 3 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/PlayDisc.tsx` | 1.5 | v4-media | specimens only (/kit, /kit-media) | 5 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/PlayerBar.tsx` | 3.3 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/PlayerCore.tsx` | 10.9 | v4-media | /assets /music-videos /music-videos/:id /music-videos/:id/shot /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot + specimens | 7 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/PlayerProvider.tsx` | 10.0 | v4-media | every route (root layout) | 15 (+2 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/PreviewPlayer.tsx` | 3.7 | v4-media | specimens only (/kit, /kit-media) | 1 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/TheatrePlayer.tsx` | 5.5 | v4-media | specimens only (/kit, /kit-media) | 0 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/VideoPlayer.tsx` | 1.7 | v3 shim | /assets /music-videos /music-videos/:id /music-videos/:id/shot /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot | 6 | delete: `VideoPlayer` = InlinePlayer; move VideoPlaceholder beside InlinePlayer | Q2 |
| `players/Waveform.tsx` | 5.9 | v4-media | /characters/new /characters/:id /music-videos /music-videos/:id /shorts/:id EP + specimens | 5 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/coordinator.ts` | 1.6 | v4-media | every route (root layout) | 5 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/music/LyricView.tsx` | 7.3 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/music/SectionsTable.tsx` | 4.7 | v4-media | specimens only (/kit, /kit-media) | 1 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/music/SongTransport.tsx` | 5.3 | v4-media | specimens only (/kit, /kit-media) | 1 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/music/VoicePreview.tsx` | 2.1 | v4-media | specimens only (/kit, /kit-media) | 1 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/music/index.ts` | 0.4 | v4-media | none | 0 | barrel with 0 importers: delete or make it the import path | Q2 |
| `players/prefs.ts` | 1.8 | v4-media | /assets /music-videos /music-videos/:id /music-videos/:id/shot /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot + specimens | 6 | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/rootVars.ts` | 0.3 | v4 shim | specimens only (/kit, /kit-media) | 2 | delete (re-export of kit/layout) | Q2 |
| `players/sync.ts` | 1.5 | v4-media | /assets /music-videos /music-videos/:id /music-videos/:id/shot /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot + specimens | 4 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/time.ts` | 1.2 | v4-media | /assets /characters/new /characters/:id /music-videos /music-videos/:id /music-videos/:id/shot /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot + specimens | 10 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `players/useShortcutScope.ts` | 3.3 | v4-media | /assets /music-videos /music-videos/:id /music-videos/:id/shot /screening /shorts/:id /shorts/:id/shot /shows/:id EP EP/shot + specimens | 7 (+1 test) | keep behaviour, restyle (§11.1 F3) | DS-2 |
| `shell/CommandPalette.tsx` | 7.8 | shell | every route (app shell) | 1 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/DocumentTitle.tsx` | 1.6 | shell | every route (app shell) | 1 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/MobileBar.tsx` | 2.2 | shell | every route (app shell) | 1 | replace by TopBar + BottomBar + MoreSheet; delete after | DS-2 |
| `shell/Room.tsx` | 1.9 | shell | none | 0 | keep, but wire it: no page renders <Room>, so `data-room` is always lobby | P-Work / P-Theatre |
| `shell/SaveState.tsx` | 2.7 | shell | every route (app shell) | 1 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/ServerBar.tsx` | 2.9 | shell | every route (app shell) | 1 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/Shell.tsx` | 7.8 | shell | every route (app shell) | 1 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/ShellDialog.tsx` | 3.9 | shell | every route (app shell) | 3 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/ShortcutSheet.tsx` | 2.5 | shell | every route (app shell) | 1 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/Sidebar.tsx` | 8.0 | shell | every route (app shell) | 3 | replace by TopBar + BottomBar + MoreSheet; delete after | DS-2 |
| `shell/brand-mark.ts` | 1.5 | shell | every route (root layout) | 1 | replace: violet favicon (producer sign-off pending) | DS-1 |
| `shell/context.tsx` | 2.1 | shell | every route (app shell) | 6 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/decisions.ts` | 2.7 | shell | every route (app shell) | 3 (+2 test) | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/nav-model.ts` | 3.1 | shell | every route (app shell) | 6 (+1 test) | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/org-names.ts` | 1.1 | shell | every route (app shell) | 2 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/palette-registry.ts` | 1.6 | shell | every route (app shell) | 1 | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/palette.ts` | 12.2 | shell | every route (app shell) | 2 (+1 test) | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/preferences.ts` | 4.9 | shell | every route (root layout) | 4 (+1 test) | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/redirects.ts` | 1.1 | shell | /jobs /library /production /projects | 3 (+1 test) | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/root-vars.ts` | 0.3 | shell shim | every route (app shell) | 2 | delete (re-export of kit/layout) | Q2 |
| `shell/shortcuts.ts` | 5.6 | shell | every route (app shell) | 3 (+1 test) | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/titles.ts` | 7.0 | shell | every route (app shell) | 2 (+2 test) | keep (§11.1 F4: palette, ShortcutSheet, DocumentTitle, SaveState, ServerBar) | — |
| `shell/url-state.ts` | 2.6 | shell | none | 1 (+1 test) | keep only if the page packages adopt it (0 users today; unit-tested) | Q2 |
| `shell/useUrlState.ts` | 1.3 | shell | none | 0 | keep only if the page packages adopt it (0 users today; unit-tested) | Q2 |
| `show/ShowWorkspace.tsx` | 25.8 | v3 | /shows/:id | 1 | replace (Show page; episode workspace moves to P-Work); delete after | P-Shows |
| `studio/Approve.tsx` | 2.3 | v3 | /music-videos /music-videos/:id /music-videos/:id/shot /shorts/:id /shorts/:id/shot EP EP/shot | 2 | restyle / replace (Studio Company, control room); keep studio/company.ts logic | P-Studio |
| `studio/Company.tsx` | 24.7 | v3 | /studio/departments/:id /studio | 3 | restyle / replace (Studio Company, control room); keep studio/company.ts logic | P-Studio |
| `studio/CompanyInspector.tsx` | 15.5 | v3 | /studio/departments/:id /studio | 2 | restyle / replace (Studio Company, control room); keep studio/company.ts logic | P-Studio |
| `studio/internals.tsx` | 7.4 | v3 | /studio/agents/:id /studio/departments/:id | 2 | restyle / replace (Studio Company, control room); keep studio/company.ts logic | P-Studio |
| `studio/org.tsx` | 2.5 | v3 | /studio/departments/:id | 1 | restyle / replace (Studio Company, control room); keep studio/company.ts logic | P-Studio |
| `studio/people.tsx` | 5.8 | v3 | /production /studio/agents/:id /studio/departments/:id /studio | 6 | restyle / replace (Studio Company, control room); keep studio/company.ts logic | P-Studio |
| `ui/brand.tsx` | 1.4 | v3 | every route (app shell) | 2 | replace: violet mark removed (§11.1); VewboxGlyph/VewboxLogo have no users | DS-1 |
| `ui/cinema.tsx` | 7.7 | v3 | /assets /characters/new /characters /characters/:id /jobs /locations /locations/:id /music-videos /music-videos/:id /new/:kind /production /screening /shorts /shorts/:id /shows /shows/:id EP | 23 | delete: Hero, Art, ArtRow, Empty, Block, Dots after every page package | Q2 |
| `ui/icons.tsx` | 2.8 | v4-kit | every route (root layout) | 99 | keep (DS owns icons) | — |
| `ui/icons/cast.ts` | 0.3 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/icons/film.ts` | 0.3 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/icons/kit.ts` | 0.4 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/icons/media.ts` | 0.6 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/icons/music.ts` | 0.3 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/icons/shell.ts` | 0.5 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/icons/shows.ts` | 0.3 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/icons/studio.ts` | 0.3 | v4-kit | every route (root layout) | 1 | keep (DS owns icons) | — |
| `ui/jobs.tsx` | 7.4 | v3 | every route (app shell) | 14 | keep behaviour (start/retry/sync errors), restyle; JobButton gives way to the status row | P-Work |
| `ui/kit.tsx` | 2.4 | v4-kit | every route (app shell) | 98 (+1 test) | keep (barrel); drop the `legacy` re-export | Q2 |
| `ui/kit/ApprovalCard.tsx` | 7.2 | v4-kit | every route (app shell) | 1 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/Button.tsx` | 2.5 | v4-kit | every route (root layout) | 9 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/CatalogueBar.tsx` | 8.7 | v4-kit | every route (app shell) | 2 (+1 test) | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/Choice.tsx` | 6.9 | v4-kit | every route (app shell) | 3 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/CompactHeader.tsx` | 4.0 | v4-kit | every route (app shell) | 1 | delete: duplicate of media/CompactHeader (both unused by pages) | DS-2 |
| `ui/kit/Creation.tsx` | 8.4 | v4-kit | every route (app shell) | 1 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/Field.tsx` | 17.0 | v4-kit | every route (app shell) | 2 (+1 test) | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/Overlay.tsx` | 26.9 | v4-kit | every route (root layout) | 5 (+1 test) | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/PageHeader.tsx` | 4.9 | v4-kit | every route (app shell) | 2 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/Recorder.tsx` | 6.3 | v4-kit | every route (app shell) | 1 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/States.tsx` | 6.3 | v4-kit | every route (app shell) | 3 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/Status.tsx` | 6.2 | v4-kit | every route (app shell) | 6 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/Tabs.tsx` | 7.8 | v4-kit | every route (app shell) | 1 (+1 test) | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/cls.ts` | 0.2 | v4-kit | every route (root layout) | 15 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/focus.ts` | 5.7 | v4-kit | every route (root layout) | 4 (+1 test) | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/layout.ts` | 2.0 | v4-kit | every route (app shell) | 6 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/legacy.tsx` | 9.9 | v3 | every route (app shell) | 1 | delete: Card, Details, KV, ConfirmButton, ConfirmDelete, Modal, Thumb, PickGrid, AddTile | Q2 |
| `ui/kit/session.ts` | 1.9 | v4-kit | every route (app shell) | 3 | keep behaviour, restyle (§11.1 F2) | DS-2 |
| `ui/kit/specimen/Specimen.tsx` | 7.0 | v4-kit | specimens only (/kit, /kit-media) | 0 | keep (DS specimen `/kit`; restyle with the kit) | DS-2 |
| `ui/kit/specimen/controls.tsx` | 11.3 | v4-kit | specimens only (/kit, /kit-media) | 0 | keep (DS specimen `/kit`; restyle with the kit) | DS-2 |
| `ui/kit/specimen/forms.tsx` | 7.3 | v4-kit | specimens only (/kit, /kit-media) | 0 | keep (DS specimen `/kit`; restyle with the kit) | DS-2 |
| `ui/kit/specimen/overlays.tsx` | 8.9 | v4-kit | specimens only (/kit, /kit-media) | 0 | keep (DS specimen `/kit`; restyle with the kit) | DS-2 |
| `ui/kit/specimen/pages.tsx` | 10.5 | v4-kit | specimens only (/kit, /kit-media) | 0 | keep (DS specimen `/kit`; restyle with the kit) | DS-2 |
| `ui/kit/specimen/parts.tsx` | 2.1 | v4-kit | specimens only (/kit, /kit-media) | 0 | keep (DS specimen `/kit`; restyle with the kit) | DS-2 |
| `ui/locale.tsx` | 3.2 | v3 | every route (root layout) | 122 | keep | — |
| `ui/nav.tsx` | 1.3 | v3 shim | /characters/new /locations/new /music-videos/:id/shot /shorts/:id/shot EP/shot | 3 | delete (re-export shim + v3 Crumbs) | Q2 |
| `ui/page.tsx` | 0.4 | v3 shim | 20 routes | 21 (+1 test) | delete (re-export shim; callers import `@/components/ui/kit`) | Q2 |
| `ui/preview.tsx` | 2.7 | v3 | /characters/new /characters/:id | 2 | replace by the kit image-preview states (§5.12) | P-Cast |
| `ui/progress.tsx` | 14.2 | v3→v4 | every route (app shell) | 5 (+2 test) | keep (error copy, phase rows, recovery); restyle | DS-2 |
| `ui/toast.tsx` | 4.4 | v4-kit | every route (root layout) | 32 (+1 test) | keep (kit Toast) | — |
| `wizard/CreateWizard.tsx` | 46.4 | v3 | /music-videos /music-videos/:id /new/:kind /shorts/:id EP | 2 | replace by New… on Home; delete after | P-Home |
| `workspace/FilmWorkspace.tsx` | 5.4 | v3 | /music-videos/:id /shorts/:id EP | 1 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/MusicWorkspace.tsx` | 6.1 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 2 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/ReplaceSong.tsx` | 4.3 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 1 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/ShotEditor.tsx` | 14.6 | v3 | /music-videos/:id/shot /shorts/:id/shot EP/shot | 3 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/ShotForm.tsx` | 6.5 | v3 | /music-videos /music-videos/:id /music-videos/:id/shot /shorts/:id /shorts/:id/shot EP EP/shot | 2 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/Workspace.tsx` | 0.4 | v3 | /music-videos/:id /shorts/:id EP | 3 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/FinalCutTab.tsx` | 11.4 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 2 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/OverviewTab.tsx` | 9.5 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 2 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/PerformersTab.tsx` | 3.9 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 1 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/ProduceTab.tsx` | 11.7 | v3 | /music-videos /music-videos/:id /music-videos/:id/shot /shorts/:id /shorts/:id/shot EP EP/shot | 3 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/SongLyricsTab.tsx` | 10.9 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 1 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/StoryTab.tsx` | 12.3 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 2 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/StoryboardTab.tsx` | 10.1 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 2 | replace by the production map and the shot workspace; delete after | P-Work |
| `workspace/tabs/VisualStoryTab.tsx` | 5.4 | v3 | /music-videos /music-videos/:id /shorts/:id EP | 1 | replace by the production map and the shot workspace; delete after | P-Work |

### 3.3 Exports nobody references (171)

LanguageService `findReferences` over `src/components`, `src/studio`, `src/lib` (specimen files excluded as consumers); Next
route exports (`default`, `dynamic`, `GET`…) are not counted. "Used inside its file" means the symbol is live but the
`export` widens the API for nothing (`noUnusedLocals` would flag it once the keyword goes).

| File | Export | Kind | Tests | Used inside its file | Action |
|---|---|---|---|---|---|
| `components/character/CharacterForm.tsx` | `CreateMode`@27 | type | — | yes | drop `export` |
| `components/character/ConsentChoice.tsx` | `recordingNeedingConsent`@17 | function | 1 | yes | drop `export` |
| `components/character/contract.ts` | `normaliseStep`@23 | function | 1 | yes | drop `export` |
| `components/character/contract.ts` | `CreateStepOutcome`@33 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `CreateResultView`@36 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `VoiceBuildPayload`@40 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `VoiceReferenceValidation`@46 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `createCharacterKey`@62 | value | 1 | yes | drop `export` |
| `components/character/contract.ts` | `DialectStatus`@96 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `VoiceEvaluation`@97 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `VoiceIdentityExtras`@99 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `DesignCandidate`@113 | type | — | yes | drop `export` |
| `components/character/contract.ts` | `DesignResult`@114 | type | — | yes | drop `export` |
| `components/character/create/preflight.ts` | `BRIEF_MIN`@11 | value | — | yes | drop `export` |
| `components/character/create/preflight.ts` | `IMAGE_RULES`@24 | value | — | yes | drop `export` |
| `components/character/create/preflight.ts` | `EngineNeed`@91 | type | — | yes | drop `export` |
| `components/character/create/preflight.ts` | `StepState`@103 | type | — | yes | drop `export` |
| `components/character/identity.ts` | `IdentityKind`@19 | type | — | yes | drop `export` |
| `components/character/identity.ts` | `Material`@94 | type | — | yes | drop `export` |
| `components/character/identity.ts` | `UsageGroup`@133 | type | — | yes | drop `export` |
| `components/character/ImagePanel.tsx` | `RedrawDialog`@96 | function | — | yes | drop `export` |
| `components/character/look.ts` | `LOOK_KEYS`@8 | value | — | no | delete |
| `components/character/VoiceSection.tsx` | `engineName`@29 | function | — | yes | drop `export` |
| `components/library/Library.tsx` | `View`@15 | type | — | yes | drop `export` |
| `components/players/CanvasPlayer.tsx` | `Marks`@20 | type | — | yes | drop `export` |
| `components/players/InlinePlayer.tsx` | `InlinePlayerProps`@21 | type | — | yes | drop `export` |
| `components/players/PlayerCore.tsx` | `CoreOptions`@18 | type | — | yes | drop `export` |
| `components/players/PlayerCore.tsx` | `PlayerCore`@106 | type | — | yes | drop `export` |
| `components/players/PlayerProvider.tsx` | `PlayerStatus`@17 | type | — | yes | drop `export` |
| `components/players/prefs.ts` | `isRtl`@37 | value | — | no | delete |
| `components/players/sync.ts` | `createSyncBus`@9 | function | 1 | no | delete with its test |
| `components/players/sync.ts` | `handOff`@21 | function | 1 | no | delete with its test |
| `components/players/time.ts` | `runtime`@18 | function | — | no | delete |
| `components/players/time.ts` | `clockRange`@24 | value | — | no | delete |
| `components/players/useShortcutScope.ts` | `keyName`@21 | function | 1 | yes | drop `export` |
| `components/players/useShortcutScope.ts` | `isTextField`@32 | function | — | yes | drop `export` |
| `components/players/useShortcutScope.ts` | `ShortcutHandler`@16 | type | — | yes | drop `export` |
| `components/players/Waveform.tsx` | `barsOf`@45 | function | 1 | yes | drop `export` |
| `components/shell/brand-mark.ts` | `BRAND_MARK_SVG`@7 | value | — | yes | drop `export` |
| `components/shell/context.tsx` | `useStickyExtra`@43 | function | — | no | delete |
| `components/shell/context.tsx` | `useBottomBars`@47 | function | — | no | delete |
| `components/shell/palette-registry.ts` | `usePaletteEntries`@23 | function | — | no | delete |
| `components/shell/palette.ts` | `fold`@132 | function | 1 | yes | drop `export` |
| `components/shell/palette.ts` | `PaletteAction`@19 | type | — | yes | drop `export` |
| `components/shell/palette.ts` | `PaletteInput`@46 | type | 1 | yes | drop `export` |
| `components/shell/preferences.ts` | `parsePrefs`@33 | function | 1 | yes | drop `export` |
| `components/shell/preferences.ts` | `prefAttributes`@50 | function | 1 | yes | drop `export` |
| `components/shell/preferences.ts` | `Contrast`@17 | type | — | yes | drop `export` |
| `components/shell/preferences.ts` | `UiPrefs`@19 | type | — | yes | drop `export` |
| `components/shell/preferences.ts` | `PREFS_KEY`@30 | value | — | yes | drop `export` |
| `components/shell/preferences.ts` | `singleKeysOn`@101 | value | — | no | delete |
| `components/shell/Room.tsx` | `Room`@17 | function | — | no | delete |
| `components/shell/Room.tsx` | `useRoom`@31 | function | — | no | delete |
| `components/shell/ServerBar.tsx` | `LastKnown`@44 | function | — | no | delete |
| `components/shell/Shell.tsx` | `SERVER_GRACE_MS`@32 | value | — | yes | drop `export` |
| `components/shell/ShellDialog.tsx` | `ShellDialogProps`@16 | type | — | yes | drop `export` |
| `components/shell/shortcuts.ts` | `isTextField`@22 | function | 1 | yes | drop `export` |
| `components/shell/shortcuts.ts` | `inShortcutScope`@34 | function | — | yes | drop `export` |
| `components/shell/shortcuts.ts` | `ShortcutCommand`@13 | type | — | yes | drop `export` |
| `components/shell/shortcuts.ts` | `ShortcutRow`@61 | type | — | yes | drop `export` |
| `components/shell/shortcuts.ts` | `ShortcutScope`@62 | type | — | yes | drop `export` |
| `components/shell/Sidebar.tsx` | `BrandLink`@97 | function | — | yes | drop `export` |
| `components/shell/Sidebar.tsx` | `NAV_ICONS`@26 | value | — | yes | drop `export` |
| `components/shell/titles.ts` | `titleParts`@25 | function | — | yes | drop `export` |
| `components/shell/titles.ts` | `TitleInput`@13 | type | — | yes | drop `export` |
| `components/shell/url-state.ts` | `parseFilters`@12 | function | 1 | no | delete with its test |
| `components/shell/url-state.ts` | `formatFilters`@26 | function | 1 | no | delete with its test |
| `components/shell/url-state.ts` | `tabNavigation`@41 | function | 1 | no | delete with its test |
| `components/shell/url-state.ts` | `Filters`@9 | type | — | yes | drop `export` |
| `components/shell/useUrlState.ts` | `useUrlState`@15 | function | — | no | delete |
| `components/show/ShowWorkspace.tsx` | `EpisodeRow`@227 | function | — | yes | drop `export` |
| `components/show/ShowWorkspace.tsx` | `AddSeason`@286 | function | — | yes | drop `export` |
| `components/studio/Company.tsx` | `useRtl`@36 | function | — | yes | drop `export` |
| `components/studio/Company.tsx` | `nodeStateLine`@46 | function | — | yes | drop `export` |
| `components/studio/Company.tsx` | `TeamDots`@249 | function | — | yes | drop `export` |
| `components/studio/internals.tsx` | `ContractFields`@41 | function | — | yes | drop `export` |
| `components/studio/people.tsx` | `agentState`@25 | function | — | yes | drop `export` |
| `components/studio/people.tsx` | `initials`@16 | value | — | yes | drop `export` |
| `components/ui/brand.tsx` | `VewboxGlyph`@8 | function | — | yes | drop `export` |
| `components/ui/brand.tsx` | `VewboxLogo`@23 | function | — | no | delete |
| `components/ui/icons/kit.ts` | `IconSortBy`@4 | value | — | no | delete |
| `components/ui/icons/shell.ts` | `IconEnter`@11 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconHome`@6 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconQueue`@7 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconReview`@7 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconChevronUp`@8 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconLink`@12 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconView`@12 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconPerson`@12 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconSpinner`@13 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconBlocked`@13 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconTimer`@15 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconStatus`@15 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconAttention`@15 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconLight`@15 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconFilm`@16 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconSwap`@16 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconDisc`@16 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconAgent`@17 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconPipeline`@17 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconActivity`@17 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconSkill`@17 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconTool`@17 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconReliability`@17 | value | — | no | delete |
| `components/ui/icons.tsx` | `IconDot`@17 | value | — | no | delete |
| `components/ui/kit/ApprovalCard.tsx` | `InlineNote`@20 | function | — | yes | drop `export` |
| `components/ui/kit/Choice.tsx` | `ChoiceOption`@12 | type | — | yes | drop `export` |
| `components/ui/kit/Field.tsx` | `addChips`@130 | function | 1 | yes | drop `export` |
| `components/ui/kit/Field.tsx` | `needsErrorSummary`@87 | value | 1 | yes | drop `export` |
| `components/ui/kit/Field.tsx` | `DropRatio`@169 | type | — | yes | drop `export` |
| `components/ui/kit/Field.tsx` | `SaveState`@261 | type | — | yes | drop `export` |
| `components/ui/kit/focus.ts` | `tabStops`@56 | function | 1 | yes | drop `export` |
| `components/ui/kit/focus.ts` | `RovingStep`@12 | type | — | yes | drop `export` |
| `components/ui/kit/Overlay.tsx` | `ConfirmDialog`@135 | function | — | yes | drop `export` |
| `components/ui/kit/Overlay.tsx` | `matchEntries`@370 | function | 1 | yes | drop `export` |
| `components/ui/kit/Overlay.tsx` | `DialogProps`@40 | type | — | yes | drop `export` |
| `components/ui/kit/Overlay.tsx` | `ConfirmOptions`@110 | type | — | yes | drop `export` |
| `components/ui/kit/Overlay.tsx` | `AskOptions`@123 | type | — | yes | drop `export` |
| `components/ui/kit/Overlay.tsx` | `ShortcutScope`@443 | type | — | yes | drop `export` |
| `components/ui/kit/Recorder.tsx` | `ConsentStatement`@15 | type | — | yes | drop `export` |
| `components/ui/kit/Status.tsx` | `StateTone`@15 | type | — | yes | drop `export` |
| `components/ui/kit/Status.tsx` | `Identity`@35 | type | — | yes | drop `export` |
| `components/ui/kit/Tabs.tsx` | `sectionInView`@60 | function | 1 | yes | drop `export` |
| `components/ui/kit/Tabs.tsx` | `TabItem`@14 | type | — | yes | drop `export` |
| `components/ui/progress.tsx` | `phaseRows`@113 | function | — | yes | drop `export` |
| `components/ui/progress.tsx` | `useElapsed`@126 | function | — | yes | drop `export` |
| `components/ui/progress.tsx` | `Phase`@19 | type | — | yes | drop `export` |
| `components/ui/progress.tsx` | `ErrorCopy`@42 | type | 2 | yes | drop `export` |
| `components/ui/progress.tsx` | `ErrorEntry`@45 | type | — | yes | drop `export` |
| `components/ui/progress.tsx` | `ERROR_COPY`@49 | value | 2 | yes | drop `export` |
| `components/ui/progress.tsx` | `KNOWN`@67 | value | 1 | no | delete with its test |
| `components/ui/progress.tsx` | `RowState`@99 | type | — | yes | drop `export` |
| `components/ui/progress.tsx` | `fmtElapsed`@136 | value | — | yes | drop `export` |
| `components/ui/toast.tsx` | `toastDuration`@20 | function | 1 | yes | drop `export` |
| `components/ui/toast.tsx` | `Toast`@15 | type | — | yes | drop `export` |
| `components/wizard/CreateWizard.tsx` | `StylePreview`@483 | function | — | yes | drop `export` |
| `components/wizard/CreateWizard.tsx` | `AspectBox`@489 | function | — | yes | drop `export` |
| `components/workspace/FilmWorkspace.tsx` | `FILM_TABS`@26 | value | — | yes | drop `export` |
| `components/workspace/MusicWorkspace.tsx` | `MUSIC_TABS`@29 | value | — | yes | drop `export` |
| `components/workspace/tabs/StoryboardTab.tsx` | `AddShot`@112 | function | — | yes | drop `export` |
| `lib/i18n.ts` | `DICTIONARIES`@22 | value | 1 | no | delete with its test |
| `lib/i18n.ts` | `KEYS`@40 | value | 7 | no | delete with its test |
| `studio/api.ts` | `EngineHealth`@12 | type | — | yes | drop `export` |
| `studio/api.ts` | `SnapshotResponse`@16 | type | — | yes | drop `export` |
| `studio/api.ts` | `JobWarning`@19 | type | — | yes | drop `export` |
| `studio/api.ts` | `BatchResponse`@22 | type | — | yes | drop `export` |
| `studio/company.ts` | `stageOwners`@86 | function | — | yes | drop `export` |
| `studio/company.ts` | `OrchestratorState`@15 | type | — | yes | drop `export` |
| `studio/company.ts` | `EdgeState`@17 | type | — | yes | drop `export` |
| `studio/company.ts` | `RUNNING_STATUSES`@20 | value | — | yes | drop `export` |
| `studio/company.ts` | `RECENT_MS`@22 | value | — | yes | drop `export` |
| `studio/company.ts` | `Placement`@29 | type | — | yes | drop `export` |
| `studio/company.ts` | `InFlight`@83 | type | — | yes | drop `export` |
| `studio/org.ts` | `schemaType`@108 | function | — | yes | drop `export` |
| `studio/org.ts` | `LiveJob`@19 | type | — | yes | drop `export` |
| `studio/org.ts` | `ProductionPosition`@20 | type | — | yes | drop `export` |
| `studio/org.ts` | `FailureRow`@22 | type | — | yes | drop `export` |
| `studio/org.ts` | `AgentResponse`@23 | type | — | yes | drop `export` |
| `studio/org.ts` | `StageStatusRow`@24 | type | — | yes | drop `export` |
| `studio/org.ts` | `QaReportRow`@26 | type | — | yes | drop `export` |
| `studio/org.ts` | `ApprovalRow`@27 | type | — | yes | drop `export` |
| `studio/org.ts` | `ProductionPipelineResponse`@28 | type | — | yes | drop `export` |
| `studio/org.ts` | `DepartmentResponse`@55 | type | — | yes | drop `export` |
| `studio/org.ts` | `loc`@72 | value | — | yes | drop `export` |
| `studio/org.ts` | `JsonSchema`@98 | type | — | yes | drop `export` |
| `studio/presentation.ts` | `artVars`@25 | function | 1 | no | delete with its test |
| `studio/presentation.ts` | `ART_WASH_L`@9 | value | — | yes | drop `export` |
| `studio/presentation.ts` | `ART_PLACEHOLDER_L`@10 | value | — | yes | drop `export` |
| `studio/presentation.ts` | `ART_CHROMA_MAX`@11 | value | 1 | yes | drop `export` |
| `studio/selectors.ts` | `STAGE_ORDER`@77 | value | — | yes | drop `export` |
| `studio/store.tsx` | `AddFileResult`@21 | type | — | yes | drop `export` |

Reachable from no entry at all (module graph): `components/edit/index.ts`, `components/media/index.ts`,
`components/players/music/index.ts`, `components/library/Cards.tsx` (barrels no page imports — pages import the files),
`components/shell/Room.tsx`, `components/shell/url-state.ts` + `useUrlState.ts` (F4 parts no page adopted; unit-tested).

## 4. Duplicates — the same job done twice (survivor named)

| Job | Used by the product today | Built and waiting | Survivor | Note |
|---|---|---|---|---|
| Confirm a destructive action | `kit/legacy.tsx` `ConfirmButton` (3: `create/ReadyCard`, `ShotEditor`, `settings/page`), `ConfirmDelete` (4: `CharacterPage`, `LocationPage`, `OverviewTab`, `ShowWorkspace`), an inline `<dialog>` in `library/ProductionTile.tsx:42-51`, and `window.confirm` at 7 sites (§13) | `kit/Overlay.tsx` `ConfirmDialog` (0) / `useConfirm` (2: `ui/jobs.tsx`, `lib/hooks.ts`) | **`useConfirm` / `ConfirmDialog`** | §11.3 rule 7; each page package removes its own `window.confirm` |
| A form in a modal | `legacy.tsx` `Modal` (11 files) | `kit/Overlay.tsx` `Dialog` (0), `Drawer` (0), `useAsk` (0) | **`Dialog`** (`Drawer` for the inspector) | `Modal` becomes a bottom sheet below 640 px — `Dialog` keeps that |
| Overflow menu | `Overlay.tsx` v3 `Menu` (8 files) | `MenuButton` (kit, 2 internal) | **`MenuButton`** | same `MenuItem`/`MenuLink` children, so the swap is mechanical |
| The picture in its frame | `cinema.tsx` `Art` (11), `legacy.tsx` `Thumb` (8), `character/CharacterImage.tsx` (6), `ui/preview.tsx` `ImagePreview` (2) | `media/Frame.tsx` + `TitleCard` (0 product) | **`Frame`** (TitleCard when there is no picture) | `Art` already draws the title as type when there is no art; `Frame` does it in the design's shapes |
| Hero / page banner | `cinema.tsx` `Hero` (4: `LocationPage`, `ShowWorkspace`, `FilmWorkspace`, `MusicWorkspace`) | `media/hero/Heroes.tsx` Backdrop/Diptych/Sleeve/Figure/Plate/Theatre (0) | **`media/hero`** | §5.4 |
| Catalogue cards | `library/ShowCard` (16:9 + fake progress bar), `ShortCard` (2:3), `MusicVideoCard`, `LocationCard`, `character/CastCard`, `StartCard` | `media/tiles/Tiles.tsx` KeyArt/Poster/Sleeve/Figure/Plate/Still (0) | **tiles** (Figure for cast, Plate for places, Still for cuts) | §5.5; the cards each embed their own menu and status |
| Empty state | `cinema.tsx` `Empty` (12 files), `library/Library.tsx` `NoMatches` (5) | `kit/States.tsx` `PageEmpty`, `SectionEmpty` (0) | **kit States** | §5.18 |
| Catalogue toolbar (search, sort, filters, view) | `library/Library.tsx` `LibraryBar` (5 catalogues) + `useView` (localStorage) | `kit/CatalogueBar.tsx` (0 pages; `Library.tsx` even re-exports it) | **`CatalogueBar`** | the URL state (`?f=`) is implemented and tested, unused |
| Compact (scrolled) header | — | `ui/kit/CompactHeader.tsx` (0) and `media/CompactHeader.tsx` (0, with `CompactThumb` shapes) | **`media/CompactHeader`** | the audit's duplicate; delete the kit copy in DS-2 |
| Page header | `kit/PageHeader.tsx` through the shim `ui/page.tsx` (16 pages) | — | **`kit/PageHeader`** imported directly | delete the shim in Q2 |
| Breadcrumbs | `ui/nav.tsx` `Crumbs` (3) | `kit/Tabs.tsx` `Crumbs` (0) | **kit `Crumbs`** | |
| Dropzone | `kit/Field.tsx` v3 `Dropzone` (5) | `ShapedDropzone` (0) | **`ShapedDropzone`** | §5.11 (the drop target in the object's shape) |
| Choice picker | `kit/Choice.tsx` v3 `ChoiceCards` (3) | `ChoiceTiles` (1, inside `Creation.tsx`) | **`ChoiceTiles`** | §5.10 pickers with drawings |
| Status word | `kit/Status.tsx` v3 `Status` (27 files), `Badge` (4) | `StateWord` (2) | **`StateWord`** | §5.16: words, not pills |
| Media query hook | `components/edit/useMediaQuery.ts` (CompareAB, DockLayout), `ui/kit/layout.ts` `useMediaQuery` (Field, CompactHeader), `shell/Shell.tsx:35` local `useMedia` (`useSyncExternalStore`) | | **one hook in `kit/layout.ts`** (take the `useSyncExternalStore` body from Shell: no first-render flash) | |
| Root CSS-variable contributions | `ui/kit/layout.ts` `useRootVarContribution`, re-exported by `players/rootVars.ts` and `shell/root-vars.ts` | | **import from `kit/layout`** | delete both shims |
| Video player | `players/VideoPlayer.tsx` shim (`VideoPlayer` = `InlinePlayer`; 6 files) | `InlinePlayer` (direct: 0 pages), `TheatrePlayer` (0), `CanvasPlayer` (0), `PreviewPlayer` (hero only) | **`InlinePlayer` / `TheatrePlayer` (Screening Room) / `CanvasPlayer` (shot workspace)** | delete the shim; keep `VideoPlaceholder` beside `InlinePlayer` |
| Voice clip player | `character/VoicePlayer.tsx` (2: `ReadyCard`, `VoiceSection`) with its own canvas waveform and seek slider | `players/music/VoicePreview.tsx` (0) + `players/Waveform.tsx` + `PlayDisc` | **`VoicePreview` + `Waveform`** | one PlayerProvider track model already shared |
| Audio player | `players/Controls.tsx` `AudioPlayer` (3), `SongPlayer`/`MiniPlayer` (MusicWorkspace) | `players/music/SongTransport.tsx` + `PlayerBar.tsx` (0) | **`SongTransport` + `PlayerBar`** (§5.14) | |
| Progress bar | `kit/Status.tsx` `ProgressBar` fed a stage fraction (`library/ShowCard.tsx:14,24,40`, `ShowWorkspace`), `ui/progress.tsx:170` bar fed a real percent, `media/StageMeter.tsx` (decorative by its own comment, 0 product) | | **the `progress.tsx` bar, only with a reported percent**; stage as words | the ShowCard bar is fake progress (§9) |
| Disclosure | `legacy.tsx` `Details` (14 files) | — | **keep `Details`**, move it out of `legacy.tsx` into the kit | the one v3 part with no v4 twin |
| Clock formatter | `players/Controls.tsx:121` `fmtClock` and `players/PlayerProvider.tsx:7` `fmtClock` (both exported, 12 references each) | | one, in `players/time.ts` | |
| Draft persistence | `lib/hooks.ts` `useDraft` (3), `kit/session.ts` `useSessionDraft` (re-exported by hooks) | | **`kit/session`** | |
| Tab/URL state | `lib/hooks.ts` `useTab` (4 workspaces) | `shell/useUrlState.ts` + `url-state.ts` (0; tested) | **`useUrlState`** | |
| Activity list | `(app)/jobs/page.tsx` default export rendered inside `/production` (`production/page.tsx:84`) and redirecting at `/jobs` | | **one component in the control room**; `/jobs` a plain redirect | P-Studio |

## 5. Routes

Build (`next build --webpack`): 34 page routes (28 under `(app)`, plus `/_not-found`, `/_global-error`, redirects), 29 API
routes, the proxy. **Every page route is a client component** (`'use client'` on every page or its first component), so the
HTML carries the shell skeleton only. Verdicts from §7.2 / §11.4:

| Route | Today | v5 verdict | Package |
|---|---|---|---|
| `/` | `redirect('/shows')` (`(app)/page.tsx`) | **Home** (Continue, Needs you, Recent, Characters, Start something new) | P-Home |
| `/new`, `/new/[kind]` | StartCards; `CreateWizard` (46 KB, 7 components, 18 `setError`) | New… on Home; the wizard rebuilt on `CreationShell` | P-Home |
| `/shows`, `/shows/[id]` | catalogue (`LibraryBar`, `ShowCard`); `ShowWorkspace` (26 KB, tabs incl. seasons/edit forms) | keep; rebuilt | P-Shows |
| `/shows/[id]/seasons/[seasonId]` | a page with no UI (reach = 1 file): redirects to the show's tab | fold into the redirect table (`shell/redirects.ts`) or drop the folder | P-Shows |
| `/shows/[id]/seasons/[seasonId]/episodes/[productionId]` | `FilmWorkspace` (tabs: story, storyboard, produce, final) | episode lobby page; the workspace moves to `…/production` (new) | P-Shows + P-Work |
| `…/episodes/[productionId]/shots/[shotId]` | `ShotEditor` | shot workspace | P-Work |
| `/shorts`, `/shorts/[id]` | catalogue; `FilmWorkspace` | catalogue + diptych title page; `/shorts/[id]/production` (new) is the map | P-Film + P-Work |
| `/shorts/[id]/shots/[shotId]` | `ShotEditor` (3 browser dialogs) | shot workspace | P-Work |
| `/music-videos`, `/music-videos/[id]` | catalogue (`MusicVideoCard` renders `MusicWorkspace` → every music route carries the whole workspace graph, 114 modules); `MusicWorkspace` | catalogue + song-first page; `/music-videos/[id]/production` (new) | P-Music + P-Work |
| `/music-videos/[id]/shots/[shotId]` | `ShotEditor` | shot workspace | P-Work |
| `/characters`, `/characters/new`, `/characters/[id]` | `CastCard`/`ArtRow`; `CreateCharacter` (22 KB + 5 start files); `CharacterPage` + `VoiceSection` (34 KB) | line-up directory, profile, creation | P-Cast |
| `/locations`, `/locations/new`, `/locations/[id]` | `LocationCard`; `LocationForm`; `LocationPage` (`Hero`) | rebuilt | P-Cast |
| `/studio`, `/studio/departments/[id]`, `/studio/agents/[id]` | `Company` (25 KB map) + `CompanyInspector` (16 KB); department 16 KB page; agent 12 KB page | Studio Company from real runs; **new `/studio/engine-room`** (engines, models, reliability, failure classes — moved out of Production and Settings) | P-Studio |
| `/production` | decisions + pipeline strips + reliability table + the `/jobs` Activity component | the control room (decisions with media first, then running, history behind a filter) | P-Studio |
| `/jobs` | a page that redirects when its pathname is `/jobs` and otherwise renders Activity (`jobs/page.tsx:24-29`) | **plain redirect** (`jobsTarget`) | P-Studio |
| `/settings` | interface, defaults, engines (`/api/status`), registry + metrics panels, data | Settings without the engine room | P-Studio |
| `/assets` | Files grid of originals (73 files, 36.8 MB on load) | Files grouped by owner in their shapes; out of the navigation | P-Studio |
| `/screening` | list of cuts with `VideoPlayer` | Frame.io-style Screening Room (`TheatrePlayer`, notes with B2) | P-Theatre |
| `/library`, `/projects` | server redirects (`shell/redirects.ts`) | keep (old addresses, 0.5 KB each) | — |
| `/kit` | DS specimen; 404 in production | keep (DS-2 restyles it) | DS |
| `/kit-media` | **TEMPORARY** by its own header ("Delete this folder" once `/kit` merged — it has); compiled into the production build (1,074 KB first-load) | **delete** | DS-2 |
| `(app)/error.tsx`, `not-found.tsx`, `loading.tsx` | kit-based | keep, restyle | DS |

Dead or odd today: `/kit-media`; `/jobs` as a page; the season route with no page; `/music-videos` (the catalogue) importing
the whole `MusicWorkspace` through `MusicVideoCard` (the catalogue's first-load JS equals the workspace's: 1,118 KB).

## 6. CSS (`src/app/styles/*`, 14 sheets, 221 KB source → 207 KB built, 38 KB gzip, on every route)

### 6.1 Unused classes (7 of 785; not in source, not in any of the 40 rendered pages)

| Class | Defined at | Note |
|---|---|---|
| `.sr-only-focusable` | src/app/styles/base.css:41 | not in source, not in any rendered page |
| `.animate-fade` | src/app/styles/kit.css:285 | not in source, not in any rendered page |
| `.bleed` | src/app/styles/media.css:11 | not in source, not in any rendered page |
| `.spec-dock-head` | src/app/styles/media.css:385 | not in source, not in any rendered page |
| `.grid-tiles` | src/app/styles/media.css:415 | not in source, not in any rendered page |
| `.vcontrols` | src/app/styles/players.css:52 | not in source, not in any rendered page |
| `.org-legend` | src/app/styles/studio.css:6, src/app/styles/studio.css:10, src/app/styles/studio.css:11 | not in source, not in any rendered page |

Classes that exist only behind a template prefix in source (`` `badge-${tone}` ``) — kept, with whether a rendered page produced them:

| Class | Template prefix seen in source | Rendered in a page |
|---|---|---|
| `.btn-danger` | `btn-` | no |
| `.btn-ok` | `btn-` | no |
| `.badge-warn` | `badge-` | no |
| `.badge-gold` | `badge-` | no |
| `.badge-err` | `badge-` | no |
| `.badge-teal` | `badge-` | no |
| `.status-accent` | `status-` | no |
| `.status-teal` | `status-` | no |
| `.status-gold` | `status-` | no |
| `.drawer-lg` | `drawer-` | no |
| `.notice-info` | `notice-` | no |
| `.notice-gold` | `notice-` | no |
| `.notice-ok` | `notice-` | no |
| `.skeleton-wide` | `skeleton-` | no |
| `.skeleton-poster` | `skeleton-` | no |
| `.skeleton-square` | `skeleton-` | no |
| `.skeleton-portrait` | `skeleton-` | no |
| `.skeleton-row` | `skeleton-` | no |
| `.skeleton-hero` | `skeleton-` | no |
| `.dialog-md` | `dialog-` | no |
| `.dialog-lg` | `dialog-` | no |

The sheets are otherwise tight: `type.css` 71/71 classes used, `edit.css` 142/142 (through the specimens), `shell.css` 217/217.
104 tokens are defined and never read with `var()` — 95 of them are the `@theme inline` bridge (`--color-*`, `--radius-*`,
`--text-*`) that exists for Tailwind utilities, plus `--fg-on-art(-muted)` (v3 names), `--halo-violet/gold/teal`, `--t-idle`,
`--bleed-max`, `--space-9`, `--ivory`, `--ivory-hover`, `--on-ivory`, `--gold-line`, `--teal-line` (tokens.css:61, 99, 108, 125,
141-144): DS-1 decides which of these v5 keeps.

### 6.2 Token aliases still referenced (Q2 deletes them; DS-1 replaces the values first)

| Token | Defined | `var()` uses | Files |
|---|---|---|---|
| `--ink-1000` | src/app/styles/tokens.css:16 | 2 | app/styles/tokens.css |
| `--ink-975` | src/app/styles/tokens.css:17 | 2 | app/styles/tokens.css |
| `--ink-950` | src/app/styles/tokens.css:18 | 5 | app/styles/media.css, app/styles/tokens.css |
| `--ink-900` | src/app/styles/tokens.css:19 | 4 | app/styles/tokens.css |
| `--ink-850` | src/app/styles/tokens.css:20 | 4 | app/styles/tokens.css, components/media/specimens/MediaSection.tsx |
| `--ink-800` | src/app/styles/tokens.css:21 | 2 | app/styles/tokens.css |
| `--ink-700` | src/app/styles/tokens.css:22 | 15 | app/styles/base.css, app/styles/kit.css, app/styles/media.css, app/styles/players.css, app/styles/tokens.css |
| `--ink-600` | src/app/styles/tokens.css:23 | 6 | app/styles/base.css, app/styles/kit.css, app/styles/tokens.css |
| `--ink-550` | src/app/styles/tokens.css:24 | 6 | app/styles/players.css, app/styles/studio.css, app/styles/tokens.css |
| `--ink-500` | src/app/styles/tokens.css:25 | 8 | app/styles/kit.css, app/styles/media.css, app/styles/tokens.css |
| `--ink-400` | src/app/styles/tokens.css:26 | 5 | app/styles/kit.css, app/styles/tokens.css |
| `--ink-350` | src/app/styles/tokens.css:27 | 2 | app/styles/tokens.css |
| `--ink-300` | src/app/styles/tokens.css:28 | 5 | app/styles/kit.css, app/styles/tokens.css |
| `--ink-200` | src/app/styles/tokens.css:29 | 8 | app/styles/kit.css, app/styles/tokens.css |
| `--ink-100` | src/app/styles/tokens.css:30 | 5 | app/styles/tokens.css |
| `--iris-600` | src/app/styles/tokens.css:39 | 3 | app/styles/tokens.css |
| `--iris-500` | src/app/styles/tokens.css:39 | 3 | app/styles/tokens.css |
| `--iris-400` | src/app/styles/tokens.css:39 | 4 | app/styles/tokens.css |
| `--iris-300` | src/app/styles/tokens.css:39 | 2 | app/styles/tokens.css |
| `--violet-700` | src/app/styles/tokens.css:40 | 1 | app/styles/tokens.css |
| `--violet-600` | src/app/styles/tokens.css:40 | 1 | app/styles/tokens.css |
| `--violet-500` | src/app/styles/tokens.css:40 | 1 | app/styles/tokens.css |
| `--violet-400` | src/app/styles/tokens.css:41 | 1 | app/styles/tokens.css |
| `--violet-300` | src/app/styles/tokens.css:41 | 1 | app/styles/tokens.css |
| `--accent` | src/app/styles/tokens.css:65 | 62 | app/styles/base.css, app/styles/edit.css, app/styles/kit.css, app/styles/media.css, app/styles/players.css, app/styles/shell.css, app/styles/studio.css, app/styles/tokens.css, components/character/VoicePlayer.tsx, components/studio/Company.tsx, components/ui/kit/legacy.tsx |
| `--accent-strong` | src/app/styles/tokens.css:66 | 9 | app/styles/kit.css, app/styles/tokens.css |
| `--accent-soft` | src/app/styles/tokens.css:67 | 4 | app/styles/kit.css, app/styles/tokens.css |
| `--accent-line` | src/app/styles/tokens.css:68 | 2 | app/styles/kit.css, app/styles/tokens.css |

In components (Tailwind utilities on the `@theme` bridge, 57 occurrences): `text-ink-500` (`CastCard:55`, `LocationCard:27`,
`StartCard:22`, `SharedHeader:28-29`, `cinema.tsx:80`, `ShowWorkspace:245`, `studio/departments/[id]/page.tsx:58-60`),
`text-ink-200` (`ShowCard:34`, `ShortCard:32`), `text-ink-600` (`StartCard:14`), `text-ink-550`/`bg-ink-600`
(`departments/[id]/page.tsx:199`), `bg-ink-300` (`kit/Field.tsx:78`); `border-violet-500`/`text-violet-300`
(`SongLyricsTab.tsx:74,77`), `text-violet-300` (`CreateWizard.tsx:91`); `bg-accent`/`border-accent`/`text-accent(-text)`/
`bg-accent-soft`/`*-accent-strong` in 17 files (`StoryTab`, `StoryboardTab`, `ProduceTab`, `FinalCutTab`, `ShotEditor`,
`LocationPage`, `CharacterImage`, `CreateWizard`, `VoicePlayer`, `StartCard`, `Library`, `jobs/page`, `studio/org`,
`CompanyInspector`, `Company`, `kit/Field`, `kit/legacy`); `var(--accent)` inline in `VoicePlayer.tsx:39`, `Company.tsx:277`,
`legacy.tsx:130`; `var(--ink-850)` in `media/specimens/MediaSection.tsx:58,174`; the favicon colour in `app/layout.tsx:19`.
Violet reaches the product through `--accent: var(--iris-400)` (tokens.css:65) in 62 `var()` uses across every sheet.

### 6.3 Conflicting rules (same single-class selector, same property, two sheets; the later import wins)

| Selector | Declared in | Properties in conflict |
|---|---|---|
| `.palette-field` | src/app/styles/kit.css:419 and src/app/styles/shell.css:170 | display, align-items, gap, block-size, padding-inline, border-block-end |
| `.palette-list` | src/app/styles/kit.css:424 and src/app/styles/shell.css:176 | max-block-size, overflow-y, padding |
| `.palette-option` | src/app/styles/kit.css:427 and src/app/styles/shell.css:180 and src/app/styles/shell.css:192 | display, align-items, gap, min-block-size, border-radius, color, cursor |
| `.palette-empty` | src/app/styles/kit.css:431 and src/app/styles/shell.css:188 | padding, color |
| `.frame-phase` | src/app/styles/kit.css:463 and src/app/styles/media.css:52 | position, inset-inline-start, inset-block-end, display, align-items, gap, padding, border-radius, background, color, font-size, line-height |
| `.hero` | src/app/styles/media.css:421 and src/app/styles/tokens.css:165 | position, isolation |

Import order (`globals.css`): tokens, base, type, kit, players, media, edit, shell, studio, pages. So `shell.css` overrides
`kit.css`'s command palette (`.palette-field`, `.palette-list`, `.palette-option`, `.palette-empty` — two complete palette
stylings; the kit's one is dead weight), `media.css` overrides `kit.css`'s `.frame-phase` (13 properties restated), and
`media.css:422` restates `.hero { position; isolation }` that `tokens.css:167` already sets (the `--art` transition is lost
if an author later edits only one).

Tokens read with `var()` but defined nowhere in `src/app/styles` (set inline by components or missing):

| Token | Uses | Where |
|---|---|---|
| `--dock-h` | 1 | app/styles/edit.css |
| `--sticky-header` | 2 | app/styles/kit.css |
| `--tile-min` | 1 | app/styles/kit.css |
| `--tile-r` | 3 | app/styles/media.css |
| `--server-bar-h` | 3 | app/styles/shell.css |
| `--dlg-w` | 1 | app/styles/shell.css |
| `--c` | 1 | app/styles/studio.css |
| `--from` | 1 | app/styles/studio.css |
| `--to` | 1 | app/styles/studio.css |
| `--orch` | 2 | app/styles/studio.css |
| `--font-inter` | 5 | app/styles/tokens.css |
| `--font-plex-arabic` | 5 | app/styles/tokens.css |
| `--w` | 1 | components/ui/kit/legacy.tsx |

`--tile-r`, `--w`, `--server-bar-h`, `--dock-h`, `--c/--from/--to/--orch` are written inline by components (fine);
`--sticky-header` (kit.css, 2 uses) and `--tile-min` (kit.css, 1 use) have no writer; `--dlg-w` (shell.css) and
`--font-inter`/`--font-plex-arabic` come from `next/font` on `<html>`.

## 7. Dependencies (every one is imported; none is removable at package level)

| Package | Imported by | Note |
|---|---|---|
| `next` | 84 files | |
| `react`, `react-dom` | 144 files | |
| `zod` | 15 files: `domain/commands.ts`, `domain/jobs.ts`, `server/env.ts`, 8 server files, 3 API routes | **ships to the browser** (`domain/commands.ts` validates command arguments client-side): chunk `1545-…js`, 89 KB raw / 25 KB gzip on every route |
| `drizzle-orm` | 25 server files | server only |
| `postgres` | `server/db/client.ts`, `server/events.ts` | server only |
| `pino` | `server/log.ts` | `pino-pretty` loaded by name (`LOG_PRETTY=1`), also in `serverExternalPackages` |
| `file-type` | `server/media.ts` | |
| `lucide-react` | `ui/icons.tsx` + `ui/icons/{cast,film,kit,media,music,shell,shows,studio}.ts` | tree-shaken per icon; 23 icon exports have no users (§3.3) |
| `tsx` (dependency) | worker runtime (`package.json` `worker`, `docker/worker.Dockerfile`) | |
| devDependencies | `@playwright/test` (e2e, `measure.mjs`), `@axe-core/playwright` (`tests/e2e/v4/f4-shell.spec.ts`, `scripts/capture-evidence.mjs`), `vitest` (4 configs), `drizzle-kit` (`drizzle.config.ts`), `tailwindcss` + `@tailwindcss/postcss` + `postcss` (`postcss.config.mjs`), `typescript`, `@types/*` | all in use |

Candidates for the bundle rather than the manifest: zod in the client (a `zod/mini` schema set for `COMMAND_ARG_SCHEMAS`, or
server-only validation), and the dictionary (241 KB chunk `3525-…js` carries EN + AR of all 1,896 keys, the store, the domain
reducers and the preferences to every route — see the measurements).

## 8. Repeated form implementations

The kit has a form anatomy (`Field`, `Input`, `Textarea`, `Select`, `ErrorSummary`, `FormFooter`, `SaveWord`), and the pages use
its fields but none of its form parts: `ErrorSummary`, `FormFooter`, `SaveWord`, `SettingsSummary`, `ChipInput` have 0 users.
Each form keeps its own `error` state, its own footer and its own save feedback:

| Object | Forms (file:line of `<form`) | Fields | Own error state |
|---|---|---|---|
| Character | `character/CharacterForm.tsx:77` (create + edit, 35 kit fields); `character/EditDialogs.tsx:54, 92, 132` (three dialogs re-editing the same fields: identity, look, voice profile); `character/CharacterPage.tsx:160` (notes); `character/ImagePanel.tsx:83` (redraw brief); `create/DescribeStart.tsx:40`, `create/PictureStart.tsx:54`, `create/SheetStart.tsx:36` (three starts; 28 fields in SheetStart), `create/CreateCharacter.tsx:240, 242` | 5 places edit character data | `CharacterForm` `setError` ×2 (:62, :82); `ImagePanel` ×6 (:113-125) |
| Location | `location/LocationForm.tsx:28` (new) **and** `location/LocationPage.tsx:136` (edit — a second form, 1 raw `<input>`) | 14 + 3 | `LocationForm` ×2 (:22, :30) |
| Shot | `workspace/ShotForm.tsx` (25 fields; used by `ShotEditor` and by `StoryboardTab.tsx:118` `AddShot`) | | none (saves on blur) |
| Scene | `workspace/tabs/StoryTab.tsx:87` | 25 | none |
| Production details | `workspace/tabs/OverviewTab.tsx:79` | 20 | none |
| Show, season | `show/ShowWorkspace.tsx:259` (edit show), `:297` (`AddSeason`) | 24 | none |
| New production (wizard) | `wizard/CreateWizard.tsx:279` (manual brief) + the Auto Idea start, preferences, review, season (58 kit fields, 2 raw inputs, 7 components) | | **18 `setError` calls** (:171-384) and one `toast.bad` |
| Voice | `character/VoiceSection.tsx:164` (speak a line), `:185` (design brief); recorder form | 5 + 1 raw | `setError` ×2 (:430, :437), `toast.bad` ×4 |
| Retry with a note | `ui/jobs.tsx:92` | 1 raw | `setError` ×2 |
| Song replacement, lyrics | `workspace/ReplaceSong.tsx` (1 raw), `workspace/tabs/SongLyricsTab.tsx` (11 fields) | | `toast.bad` |
| Kit (unused by pages) | `kit/ApprovalCard.tsx:36, 117` (approval note), `kit/Overlay.tsx:197` (`useAsk`), `kit/legacy.tsx:63` (`ConfirmDelete` typed title) | | `ApprovalCard` `setError` ×4 |

Raw `<input>/<textarea>/<select>` outside the kit: `VoiceSection` 1, `LocationPage` 1, `ShotEditor` 1, `ReplaceSong` 1,
`CreateWizard` 2, `assets/page` 1, `players/music/LyricView` 3 (editable lyrics), `CommandPalette` 1 (its own field).

## 9. Decorative controls, fake progress, fabricated activity

| Where | What | Verdict |
|---|---|---|
| `library/ShowCard.tsx:14, 24, 40` (+ `show/ShowWorkspace.tsx`) | `ProgressBar` fed `stageIndex / (STAGES.length - 1)` averaged over episodes — a stage rank drawn as a percentage | **fake progress**; stage as a word (§5.16); P-Shows |
| `workspace/tabs/FinalCutTab.tsx:57-61` | three "sound" lanes drawn from shot metadata (dialogue present / song exists / scene count), not from audio; "Sound: n/m voice chosen" reads the legacy `voice.selectedSampleId` | **fabricated view**; P-Work replaces with the real timeline (`edit/Timeline`) or nothing |
| `workspace/tabs/FinalCutTab.tsx:43` | header runtime = sum of planned shot durations (1:01) while the cut asset says 0:56 | two durations for one film; show the cut's |
| `library/ShortCard.tsx:27, 31` | the title drawn twice when there is no art (poster text + overlay) | audit §7; P-Film |
| `media/StageMeter.tsx` (`media/Episodes.tsx:17, 46, 66`) | a segmented meter the file itself calls decorative ("the words carry the state") | unused by pages; DS-2 drops it or keeps it as pure ornament behind the words |
| `media/tiles/Tiles.tsx:45-58` | `PlateTile` crossfades lighting states on hover, 1 s each (`setInterval`) | unused; motion on hover — keep only if §4.7 allows |
| `character/CharacterImage.tsx:45-50` | `FramePhase` pulsing live dot while a job runs | honest (bound to a running job) |
| `ui/jobs.tsx:52`, `ui/progress.tsx:148-170` | percent shown only when the worker reports one; phase rows from real status | honest |
| `app/(app)/settings/page.tsx:44, 56` | `…` as the only loading state of the registry and metrics panels; on failure `setReg(null)` leaves `…` forever | not a fake, but a missing state (§5.18) |
| `app/(app)/production/page.tsx:82` | `skeleton h-40` while reliability loads; `useReliability` errors ignored | missing error state |
| `wizard/CreateWizard.tsx:483-491` | `StylePreview` SVG drawings and `AspectBox` glyph | decorative by design (§5.10 "pickers with drawings"); keep the idea, DS owns the drawings |
| `shell/Shell.tsx:122-127`, `(app)/loading.tsx` | skeleton shapes while the snapshot loads | honest (and the only thing the HTML ever shows) |
| Studio Company | edges only from recorded handoffs; "Has not run yet" for idle agents (`studio/company.ts`) | verified honest in `AUDIT-CODEBASE.md` D; no fabricated activity found |

Decorative *controls* (controls that do nothing): none found — every `onChange` writes a setting, a draft or a job payload.
Settings' export selects in `FinalCutTab.tsx:71-73` feed the `EXPORT` payload. The nearest case is the sidebar "Collapse"
(`Ctrl+\`) in the cutting room, which can never engage (§11).

## 10. Inconsistent error handling (file:line)

Three channels, chosen per file, plus silent paths:

- **Toast** (`toast.bad`, 31 call sites in 20 files): `assets/page.tsx:30,43`, `production/page.tsx:38`, `CharacterPage.tsx:78,160`,
  `ConsentChoice.tsx:44,53`, `EditDialogs.tsx:26`, `ImagePanel.tsx:39`, `VoiceSection.tsx:143,183,253,404`,
  `create/CreateCharacter.tsx:205-211`, `LocationPage.tsx:91`, `ReplaceSong.tsx:26`, `ShotEditor.tsx:34`, `ProduceTab.tsx:47`,
  `studio/Approve.tsx:22`, `studio/CompanyInspector.tsx:64`, `ui/jobs.tsx:33,110`, `CreateWizard.tsx:353` (both toast and inline).
- **Inline `error` state** (own markup each time): `CreateWizard.tsx` 18×, `ImagePanel.tsx` 6×, `players/PlayerProvider.tsx` 6×,
  `kit/ApprovalCard.tsx` 4×, `CharacterForm.tsx:62,82`, `LocationForm.tsx:22,30`, `VoiceSection.tsx:430,437`, `ui/jobs.tsx:85-86`.
- **Kit notice**: `ErrorNotice` used by `ui/progress.tsx` and `ApprovalCard` only; `FailureNotice` (`progress.tsx:185`) by
  `ImagePanel`, `VoiceSection`; `Notice tone="bad"` ad hoc elsewhere.
- **Swallowed**: `CreateWizard.tsx:75` `.catch(() => {})`; `jobs/page.tsx:92` `.catch(() => {})` (job events never load → empty log);
  `settings/page.tsx:31-32` `.catch(() => setReg(null))` / `setMet(null)` (no message, `…` stays); `settings/page.tsx:35,90`
  `.catch(() => undefined)` / `setStatus(null)` ("Offline" for every failure); `kit/Recorder.tsx:43`; `studio/store.tsx:117`
  `loadJobs` ("shown by connected flag" — it is not: `connected` only tracks the stream and the last batch).
- **Live data**: `useLive` returns `error`, read by `studio/page.tsx:25` and `departments/[id]/page.tsx:32`, ignored by
  `production/page.tsx:31-33`, `shell/Shell.tsx:67`, `studio/Approve.tsx:16,34`, `agents/[id]/page.tsx:26` (read, shown as text).
- **Two error shapes**: `studio/api.ts:24-33` throws `StudioError` with the server's code and message; `studio/org.ts:31-35`
  throws `Error("/api/…: 500")`, so org failures can never map to `ERROR_COPY` (`ui/progress.tsx:49`) and show a URL.
- **Destructive confirmations**: browser `confirm()`/`prompt()` at 8 sites (§13) beside `ConfirmDelete` (typed title),
  `ConfirmButton` and `ProductionTile`'s own `<dialog>` — four confirmation behaviours for one kind of action.

## 11. Dead UI state

| State | Where | Why dead |
|---|---|---|
| Rooms (`lobby`/`cutting`/`theatre`) | `shell/context.tsx`, `shell/Shell.tsx:49-51, 71-73, 107`, `tokens.css:171-175` | `shell/Room.tsx` has **0 users** (module graph), so `setRoom` is never called: `data-room` is always `lobby`, `data-density` never set, the cutting-room rail rule and `prefs.nav.cutting` unreachable, the theatre tint and canvas rules never apply |
| Lights down | `Shell.tsx:50-51, 113`, `TheatrePlayer` → `useRoom().setLightsDown` | the TheatrePlayer is not on any page |
| Focus-mode shortcut | `Shell.tsx:93-98` | returns unless `room === 'cutting'`; `edit/FocusMode.tsx` has no page user |
| Page → shell contracts | `usePaletteEntries` (`palette-registry.ts:23`), `useStickyExtra`/`useBottomBars` (`context.tsx:43,47`), `<LastKnown />` (`ServerBar.tsx:44`), `useUrlState` | documented as "how pages talk to the shell" (`Shell.tsx:28-29`); no page does (`usePageEntries` is used by the palette itself only) |
| Catalogue view preference | `library/Library.tsx:54-59` `useView` → `localStorage['vewbox.view.*']` | one caller (`/characters`); the kit `CatalogueBar` keeps view in the URL |
| Connection shown twice | `settings/page.tsx:113` `connected` status row; `shell/SaveState.tsx` `ConnectionState` in the sidebar | the same flag in two places with different words |
| Kit save state | `kit/Field.tsx:261-263` `SaveState` type + `SaveWord` | 0 users; the shell has its own `studio/save-state.ts` + `shell/SaveState.tsx` |
| `KNOWN` error table | `ui/progress.tsx:67` | exported, 0 production references (the copy comes from `ERROR_COPY`) |

## 12. i18n (1896 keys in `src/lib/i18n/v4/*`; the earlier 288 deletions hold)

Unused after the v4 merges (17; no literal, no dynamic family, no test):

| Family | Keys (file:line) |
|---|---|
| misc | `misc.goHome (common.ts:195)` |
| player | `player.videoFailed (media.ts:21)`, `player.videoFailed.hint (media.ts:22)` |
| media.alt | `media.alt.frame (media.ts:40)` |
| media.episode | `media.episode.open (media.ts:60)` |
| media.player | `media.player.note (media.ts:90)` |
| media.focus | `media.focus.leave (media.ts:173)` |
| media.spec | `media.spec.loading (media.ts:211)`, `media.spec.light.view (media.ts:279)` |
| home | `home.startFirst (shell.ts:20)`, `home.startNew (shell.ts:28)`, `home.viewAll (shell.ts:29)` |
| nav | `nav.newProduction (shell.ts:22)`, `nav.closeMenu (shell.ts:24)`, `nav.libraryArea (shell.ts:37)` |
| app | `app.tagline (shell.ts:26)` |
| projects | `projects.lead (shell.ts:40)` |

Used only by tests: `app.saved`, `app.saving`, `app.unsaved` (`SaveState` reads `shell.save.*`). 115 keys are reached only
through dynamic families (`stage.*`, `kind.*`, `style.*`, `pipeline.*`, `jp.*`, `registry.status.*`, `voice.refuse.*`, …) — all
complete for their enumerations (G3 holds).

Keys that exist only for the specimen pages (315; they ship to every route because the dictionary is one object):

| Prefix | Keys used only by the specimen pages |
|---|---|
| `kit.spec.*` | 198 |
| `media.spec.*` | 97 |
| `media.alt.*` | 6 |
| `kit.palette.*` | 5 |
| `kit.shortcuts.*` | 2 |
| `media.hero.*` | 2 |
| `style.CARTOON.*` | 1 |
| `style.ANIME.*` | 1 |
| `style.REALISTIC.*` | 1 |
| `jp.drawing.*` | 1 |
| `media.mode.*` | 1 |

Q2 should either move the `kit.spec.*` / `media.spec.*` families into a dictionary the specimen imports on its own, or accept
the 7 KB gzip they cost everywhere. `tests/unit/i18n-split.test.ts` guards the v3 keys ("a v3 key that changed or went
missing" fails) — it must be updated in the same commit as any deletion.

## 13. Browser dialogs remaining (`window.confirm` / `window.prompt`; §11.3 rule 7)

| Site | Action | Owner |
|---|---|---|
| `src/app/(app)/characters/page.tsx:47` | delete a character | P-Cast |
| `src/app/(app)/shows/page.tsx:45` | delete a show | P-Shows |
| `src/components/show/ShowWorkspace.tsx:199` | delete a season | P-Shows |
| `src/components/workspace/tabs/StoryTab.tsx:113` | delete a scene | P-Work |
| `src/components/workspace/tabs/StoryboardTab.tsx:105` | delete a shot | P-Work |
| `src/components/workspace/ShotEditor.tsx:79` | delete a shot | P-Work |
| `src/components/workspace/ShotEditor.tsx:109` | **`window.prompt`** for a rejection reason | P-Work (inline note, `useAsk`) |
| `src/components/workspace/ShotEditor.tsx:110` | remove a take | P-Work |

`lib/hooks.ts:53` (`useUnsavedGuard`) already uses the kit `useConfirm`; `ProductionTile.tsx` uses its own `<dialog>`.

## 14. State management (summary; measured in the companion document)

- One React context value (`studio/store.tsx:241`) with 20 members; **71 files import the store, 113 `useStudio()` calls**;
  there are no selectors or memoised slices, so every consumer re-renders on any change of `state`, `jobs`, `saving`,
  `stream`, `version`, `activityTick` or `lastError`.
- First paint waits for the full snapshot (`Shell.tsx:122` gates on `ready`); the snapshot is the whole studio
  (`GET /api/studio`, 562 KB uncompressed on the audit copy) — read on mount, again on the event stream's `hello`
  (`scheduleRefresh(0)`, `store.tsx:170`), and once more by React strict mode in development: **3 reads per load in dev,
  2 in production**. Jobs: `GET /api/jobs?limit=300` twice per load for the same reason.
- Every `studio` event from another client triggers a full snapshot re-read (150 ms debounce) and a whole-state `setState`;
  own events only bump the version. Job events merge in place (H4 fixed). `activity` events increment `activityTick`, which
  re-renders every store consumer and refetches every mounted `useLive` (the shell's pipeline poll on every page, plus
  `useOrg`/`useReliability`/`useDepartment`/`useAgent` where mounted); `useLive` also refetches every 30 s regardless.
- Settings fetches `/api/registry`, `/api/metrics?hours=168` and `/api/status` on mount outside the store, with no error state.

## 15. The removal plan

`docs/research/frontend-removal-plan.json` (299 entries: `file`, `symbol` (`*` = the whole file), `kind`, `reason`,
`after` (the package whose merge makes it safe), `replacement`). It is generated from the verdict table of §3 by
`frontend-audit-2026-10-03/assemble.mjs`, so the table and the plan cannot disagree. Order of execution: DS-1 (brand mark, violet
and iris aliases), DS-2 (`/kit-media`, `kit/CompactHeader`, `edit/useMediaQuery`, Sidebar/MobileBar once TopBar lands),
each page package (its own files and `window.confirm` sites), Q2 (`cinema.tsx`, `legacy.tsx`, the shims and barrels, the
remaining aliases, the unreferenced exports, the i18n keys, `Library.tsx`, `ProductionTile.tsx`).

Top candidates by weight and certainty: `/kit-media` (dead route in the production build), `ui/kit/legacy.tsx` + `ui/cinema.tsx`
(17.6 KB of v3 UI with v4 twins for every part), `library/Library.tsx` (`CatalogueBar` exists), `shell/Sidebar.tsx` +
`MobileBar.tsx` (replaced by design), the three `useMediaQuery` and the three `useRootVarContribution` paths, the 28 palette
aliases, the specimen-only dictionary (315 keys), zod in the client bundle, and the eight browser dialogs.
