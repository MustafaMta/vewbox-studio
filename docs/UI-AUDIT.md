# The interface, looked at — 2026-09-26

Baseline captures of every major page at 1440, 1024, 768 and 390 px, and in Arabic, were taken against the studio as
it stood before the redesign. Those captures were deleted with the rest of the old runtime output on 2026-09-26 at the
producer's instruction; the defects they showed are recorded below, page by page, and the redesigned pages are captured
in `docs/screenshots/` (after) by `tools/shots.ts`. The interface is not called premium anywhere in this document
because it has rounded cards or a warm palette; it is judged on whether a producer can do the work in it.

## What is wrong everywhere

1. **Everything is a card, and cards nest.** The stage rail is a card; the storyboard header is a card above a grid
   of cards; each shot on the production tab is a card holding two frame panels that are themselves bordered boxes.
   Borders and shadows are doing the work that spacing and typography should do, and the eye has nothing to rest on.
2. **Equal emphasis on everything.** A shot page gives the same weight to the intended frame, the evaluation table,
   the shot spec, the dialogue line and the JSON. Nothing says "this is the thing".
3. **Badges as decoration.** "gates pass", "Test selection", "Composed", "Draft", "unframed", the engine badge, the
   auto badge, a job count badge — five to eight per card. Status that cannot be acted on is noise.
4. **Metadata dominates media.** On the production tab a 768×1344 frame is drawn at about 210 px wide beside a
   caption, a badge row, a disclosure, another disclosure, three buttons and a text input. The picture is the smallest
   thing about the picture.
5. **Long explanatory sentences under headings.** "Each shot needs an approved starting frame; a shot with people
   that runs over 4 s also needs an approved ending frame. An EXTEND shot starts on the previous approved take's
   actual last frame." — on every visit, above the fold, in the same weight as content.
6. **Symbol-font icons.** ⌂ ▤ ▭ ♪ ☺ ⌖ ▦ ≡ ✓ ⚙ render at different sizes and weights, and "☺" for Characters reads as
   a joke.
7. **The bilingual title runs together.** "The Last Sipآخر رشفة" — the Arabic is glued to the English with no
   separation, on every production and character page.
8. **No page has a single obvious primary action.** The storyboard toolbar carries two primary buttons ("Break the
   script into shots" and "Add shot") beside a secondary one; the home page has three "New ·" buttons of which one is
   primary for no reason.
9. **The test-mode banner is permanent and loud.** A full-width amber bar with two sentences sits above every page.
   The fact matters; the page-wide shout does not.
10. **Dialogs are the same width regardless of content.** The shot editor opens in a 56 rem modal and scrolls
    inside it; the delete confirm is a small card; both use the same header pattern.

## Page by page

### Home (`/`)
- Two large host/engine cards take the top third and repeat information that belongs on Settings and on a
  production's Overview: four `.safetensors` filenames in monospace are the most prominent text on the studio's
  front door.
- "Needs you · 71" counts 70 failed jobs from a cancelled coverage run alongside 50 frames — a red tile that a
  producer cannot act on from here.
- Production cards have no thumbnail, so three productions look identical; the stage badge and the stage hint below
  say the same thing twice.

### Storyboard (`?tab=storyboard`)
- **There are no pictures on the storyboard.** The short has thirteen composed frames and the board shows seven text
  cards. A storyboard without images is a script table.
- Shot cards repeat the framing, camera, duration and "Begins · Cut" as four labelled rows each — a dl on every card.
- The scene header, the storyboard header card and the stage rail each state "1 scene · 7 shots".
- Continuity between shots (which shot EXTENDs which) is a badge in a row, not a relationship you can see.

### Production (`?tab=production`)
- Seven identical tall blocks, each with two ~210 px frames, five buttons, two inputs and two disclosures. The page
  is 4,000 px tall for seven shots and the only decision on it — approve a frame — is a small green button under a
  caption.
- The blocked-engine notice quotes four model filenames in a sentence; that belongs behind a disclosure with a
  production-language line in front of it ("Video is blocked: the MiniMax H3 weights are not installed on the render
  host. Frames can still be composed and approved.").
- The instruction input for the next composition is shown for every frame slot on every shot, empty, all the time.

### Shot page (`/shots/:id`)
- The two frames — the reason the page exists — are the smallest elements on it.
- The H1 is the shot's purpose sentence in 2 rem type: "Establish Kian's panic and the immediate problem: the the last
  glass is missing from the tea set." A title is a name, not a paragraph.
- The whole spec is an always-open form with ~25 fields at equal weight; the dialogue exists twice (a panel and a
  fieldset inside the spec); the blocking rows have an empty first column (a text input with no visible value).
- "← back to production" is a text link at the very bottom of a 2,600 px page.

### Review (`/review`)
- 65 frames as a wall of 50 near-identical tiles with a "Note" input on each, then 21 references, then an export
  with a black video player. There is no way to work through them: no selection, no keyboard, no "next", no grouping
  by shot, no way to compare a first frame with its last.
- Approve / Reject / Note are repeated 71 times.

### Character (`/characters/:id`)
- The reference gallery is a single narrow column: three 3:4 pictures stacked, each with a caption block as tall as
  the picture is wide. The right column holds a spec form (collapsed), two notes textareas and a "Manage" card.
- "Test selection" and "gates ✓" on every picture; "1024×1328 · edited from an approved picture" as a caption.
- Voices: a full audio player, a transcript disclosure, an evidence disclosure and Reject inside a bordered card
  inside a bordered card.

### Creation wizard (`/shorts/new`)
- Six steps for a short; Auto Idea vs Manual Brief is a radio card, then a Notice paragraph about TikTok research
  order appears under it. Format and Dialogue & music are separate steps with two fields each.
- Step pills are fine; the "Review & create" table is a two-column dl with hairline rows.

### Queue, Assets, Settings
- The queue lists 100 rows of "Compose the first frame" with a Technical disclosure each; the filter is a row of
  badge-shaped tabs.
- Assets is a grid of squares of mixed kinds with kind labels; the import dialog lists archive paths in monospace.
- Settings is a form and a table; the render-host table is the clearest thing in the studio.

### Phone (390 px)
- The sidebar becomes a five-slot bottom bar with the same symbol icons; the production page's eight tabs scroll
  horizontally with no affordance; shot cards stack to a 4,000+ px page; the wizard's step pills wrap to three rows.

### Arabic
- The whole shell mirrors correctly. Mixed-direction titles ("The Last Sip · آخر رشفة") depend on `dir=auto` per
  span and mostly hold; monospace shot labels (`s1/01`) and file paths are forced LTR, correctly. The type is IBM Plex
  Sans Arabic beside Inter; the two have different x-heights and the Arabic reads smaller at the same size.

## What is right, and stays

- Light and dark follow the system through one token set; logical properties mean RTL costs nothing.
- Every control has an accessible name; `<dialog>` is native; focus rings exist.
- Server actions with toasts; a live refresh that (since D20) does not eat unsaved work.
- The information architecture — Shows → Seasons → Episodes, Shorts, Music Videos, Characters, Locations, Assets,
  Queue, Review, Settings — is right and is not being changed.

## What the redesign has to change, in order

1. One design system: neutral surfaces, one accent, real icons, one type scale for both scripts, four radii, three
   elevations, one focus style, tokens for every spacing and size.
2. A shell that separates the studio's areas from a production's stages, with a compact permanent header and a
   production sub-navigation that carries the breadcrumb, the stage, and the next action.
3. Media first: frames and takes at a size that lets you judge composition; metadata behind a single "Details"
   disclosure; one status per thing, in words.
4. A storyboard with pictures, in order, with duration and continuity visible.
5. A review desk that is a queue you work through, not a wall.
6. Then everything else on the same system, page by page, and the phone and Arabic captures redone.
