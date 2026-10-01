# What this prototype does not do

This is the studio's interface with nothing behind it. It is meant to be used — every control works — but the work
it represents is not performed. Stated plainly, so nobody mistakes a sample for a result.

## Sample content is not production output

Every bundled picture, clip and sound in `public/sample/` was made by `tools/sample-media.mjs`: SVG illustrations of
the studio's own scenes and characters (the café, the alley, the rooftop, the riverbank, the corridor; each portrait
from its written profile), ffmpeg colour-field clips with a soft tone, chord and tone audio. Provenance is recorded in
`public/sample/PROVENANCE.md`. They carry a
small SAMPLE tag drawn into the picture's lower corner, and the word "Sample" wherever they are chosen. None of them is a photograph, a recording,
or the output of any model, and none came from the earlier production pipeline.

## Not connected

- **No writing.** Synopses, scripts, beats and lines are typed by you. "Write the script", "Plan the shots" and
  similar buttons open a dialog that says generation is not connected.
- **No pictures.** Character reference views, location plates and frames are the sample compositions. "Prepare
  frames" / "Create front view" say so. You can add your own picture files (below).
- **No video.** Every take is one of ten sample clips. Choosing a take is real and saved; nothing is rendered.
  "Generate video" / "Another take" say so.
- **No voices or songs.** Voice samples are short tones at speaking pitches; the example song is four chords.
  Choosing a voice sample is real and saved. "Generate Song" saves the caption and lyrics with the project and says the
  recording comes later. "Upload Song" accepts a real audio file (kept as below) or, when the sample data is present,
  the labelled sample track.
- **No export.** Export settings are chosen in the Final Cut tab; "Export" says the backend is not connected. The
  assembled cut shown for the sample episode is a sample clip.
- **No research or writing for Auto Idea.** *Create an idea for me* needs no input and honours the optional
  preferences, but the review it opens holds a **labelled sample proposal** from `src/demo/proposals.ts` (written
  templates, shaped by the preferences and, for an episode, by the show's cast and world). Nothing is researched or
  generated; the project records that it started from a sample proposal. The request and proposal types
  (`AutoIdeaRequest`, `IdeaProposal`) are what a backend would receive and return.
- **No appearance generation.** Generate / Regenerate appearance explain that generation is not connected. The
  reference upload they would use is real: uploaded, previewed, replaced, removed and kept in this browser. The
  continuity rule (docs/CHARACTER-CONTINUITY.md) is enforced in the interface and the shared state actions.
- **Voice.** Uploading a recording works (kept in this browser). A "studio voice" (the labelled example on Nour)
  has no audio until voice generation is connected.
- **No users, sign-in, sharing or sync.** State is per browser profile. Two browsers see two studios.

## How state works

- The studio starts from `src/demo/fixtures.ts`. Your changes are written to `localStorage` under
  `vewbox.studio.v1` (debounced, flushed on unload) and read back on the next visit.
- **Settings → Sample data → Reset sample data** discards the browser copy (records and files) and returns to the
  fixtures. **Start with an empty studio** removes everything, including the samples, and keeps your settings.
- The fixture version (`STATE_VERSION`, now 2 after the redesign added posters, square covers, props and music
  metadata) guards the saved copy: a saved state from an older shape is ignored and the samples load instead.

## Files you add

Files you add (a reference picture, a location view, a song, anything in the Asset Library) are kept in this
browser's **IndexedDB**, keyed by asset id, and are recorded as assets marked "Kept in this browser". On every visit
the files are read back and given a fresh URL; they survive reloads and restarts of the browser.

What this means, and what the interface says:

- Nothing is uploaded anywhere. The file exists only in this browser profile on this machine.
- Browser storage is local and can be cleared — by you (site data), by the browser (storage pressure, private
  windows), or by using another browser. A record whose file is gone is shown as **"File not available in this
  browser"** with the reason, never as a broken image.
- If the browser refuses the write (storage full, storage blocked), the file is not recorded and a message says why.
- Deleting a file from the Asset Library removes its record and every use of it: a reference view, a portrait, a
  frame, a take, a song's track.
- Resetting or emptying the studio clears the stored files as well as the records.

This is one honest no-server design; a server-backed studio would store the bytes on the server and keep the same
records. The interface is written so that swap changes `src/demo/media.ts` and `store.tsx`, not the pages.

## Known rough edges

- Drag-to-reorder on the storyboard uses native HTML drag events; on touch devices use the card menu (Move up /
  Move down), which is always visible there.
- The in-app "unsaved changes" guard intercepts link clicks with a confirm; the browser's own prompt covers close and
  reload.
- Interface strings are complete in English and Arabic; the export panel's technical labels (formats, loudness) are
  shown in Latin script in both languages by design.
- There is one palette (midnight ink, ivory-white text, one violet accent); there is no light theme.

## Where the backend would plug in

`src/demo/store.tsx` is the only place that knows where state comes from and goes to; `src/demo/media.ts` is the
only place that knows where file bytes live. `src/demo/actions.ts` is the list of every change the interface can
make. A real backend replaces the store's `load`/`save` and the media store's `put`/`get` with requests, and either
keeps the actions as optimistic reducers or maps each to an endpoint. The `LaterButton` component
(`src/components/ui/later.tsx`) marks every place a generation would start. No page imports fixtures directly.
