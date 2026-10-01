# Test results — 2026-09-26 (the restored interface, third refinement)

All runs against the frontend-only prototype on this machine (macOS, Node 22, pnpm 10, Chromium via Playwright 1.63).
No database, no API, no network beyond `localhost` and Google Fonts. Numbers are from the last complete run after the
players, controls, Auto Idea and cast-directory refinements.

## Typecheck and build

- `pnpm typecheck` — clean (strict, `noUnusedLocals`, `noUnusedParameters`).
- `pnpm build` — compiled; the production build is what the screenshots in `docs/screenshots` were taken from
  (`pnpm exec next start -p 4210`, launch entry `studio-prod`), so no development overlay appears in them.

## Unit (Vitest) — 24 passed, 0 failed

`tests/unit/actions.test.ts`: fixture integrity (fixture version 4: recorded usage, Um Hassan with an unknown history, Nour's studio voice); show and
episode numbering and inheritance; duplication; stage steps; shot numbering, moves, drag reorder; take selection;
character deletion cascade; settings merge; the empty studio; local file records. New in this round: the continuity
rule (usage from takes, cast alone is not usage, unknown counts as used; appearance fields dropped for a used
character while profile and voice pass; pending reference refused when locked; a new take records usage and removing
it keeps the record, marked; protected pictures cannot be deleted) and Auto Idea (works with no preferences;
explicit preferences win; an episode reuses the show's style, language, cast and places and proposes a newcomer;
accepting creates only what was kept).

## Browser (Playwright) — 54 passed, 0 failed (28.8 s)

Three spec files. Every test starts from the untouched sample data, fails on any console error, and fails on any
network request to a host other than `localhost` (fonts and `blob:` URLs excepted). Existing behaviour checks were kept; where the
layout changed, locators were updated (exact button names, the voice radiogroup, the Manual Brief entry) and the
assertions still read the persisted state.

- `studio.spec.ts` — 20: navigation through shows, seasons (the season list), episodes, tabs and the shot editor;
  creation through the wizard; editing and persistence; character voice; playback of a sample take and of the song
  through the one player; generation buttons that say the backend is not connected; sample content identified; the
  studio reset; Arabic; the phone shell.
- `empty-studio.spec.ts` — 5: every library's empty state and action; a show → season 1 → episode 1 with a character
  and a location created inline; a short with a scene and a shot; a music video with a written song and a new
  singer; a character and a location from their empty libraries.
- `media-and-cast.spec.ts` — 10 (new): the song player's provisional then real duration, lyric seeking, the compact
  player in step; volume and mute on the shared audio, remembered across a reload; one sound at a time (a voice
  replaces a voice, a video pauses the song); the video player's seek, mute, fullscreen, no captions button without
  captions, letterboxing, and the placeholder for a shot without a take; an unreadable file reported, and an
  ungenerated studio voice that cannot be selected; the cast directory's usage and production filters; a used
  character's disabled regeneration, read-only look fields, editable profile and usage records; an unknown history
  locked; an unused character's reference uploaded, replaced, kept across a reload, and removed; a voice recording
  uploaded for a used character.
- Creation tests (in `studio.spec.ts`) now cover Auto Idea with no input (the persisted project records it started
  from a sample proposal), Auto Idea with a style, a character and a place as constraints, an Auto Idea episode that
  inherits the show's cast and places, Manual Brief with only a title and with only a description, and a music video
  whose song is optional.
- `interactions.spec.ts` — 16: duplicate and delete; the character library's search and order; the music library's
  play buttons through one audio element; the asset library's filters and dialog; drag reorder; takes and frames;
  dialogs and Escape; keyboard; a file kept in the browser across a reload; a deleted file's uses.

## Verified by hand in the browser

- Music playback: the 48-second sample song loads (`readyState` 4, duration 48), the seek bar reads `0:02 / 0:48`
  while playing, a lyric section's play button jumps to its start (25.9 s into the chorus), and the compact player
  follows with the same time. Before this round the bar read `0:00 / 0:00` until the file had loaded; it now shows
  the song's known length at once.
- A season added from the show page survives a reload; the sidebar notes that the sample data has been changed;
  Settings → Reset sample data returns it to untouched.
- Phone: the menu sheet opens from the top bar and closes on navigation.
- The published states were each looked at: the song and compact players, voice previews and the video player at
  1440/768/390 in English and Arabic; the Auto Idea review on desktop, phone and an Arabic episode; the locked,
  unknown and unused characters; the locked edit dialog. Issues found this way and fixed: a seek bar squeezed at
  768, English lines left-aligned in Arabic, a portrait artefact, clipped proposed-cast thumbnails, an overflowing
  voice row on cards.

## Visual evidence

`BASE_URL=http://localhost:4210 pnpm shots -- --rtl --out var/design/r6/shots` and `tools/capture-states.mts` (English and Arabic, 1440/768/390) captured every page at four widths
in English and Arabic plus the empty studio, and 70 click-through states, all from the production build;
`node tools/publish-shots.mjs var/design/r6/shots var/design/r6/states` copied 57 of them into `docs/screenshots`, which
[WALKTHROUGH.md](WALKTHROUGH.md) walks through. `pnpm exec tsx tools/contact-sheet.mts` renders contact sheets of the
sample artwork.

## Not covered

- Nothing is generated, so no test asserts on generated output; the generation buttons are tested for their message.
- The sample sounds are synthetic tones; the waveform is decoded from them for real.
