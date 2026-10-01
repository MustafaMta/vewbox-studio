# The interface, walked through

Captured from the production build on 2026-09-26 by `BASE_URL=http://localhost:4210 pnpm shots -- --rtl`, sample
data unless a caption says "empty". Every picture, clip and sound in these screens is sample content drawn by
`tools/sample-media.mjs` (see `public/sample/PROVENANCE.md`) and carries a small SAMPLE tag; nothing is output of the
studio.
The design is the studio's restored September interface, refined; the system is described in
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) and what it borrows from in [DESIGN-REFERENCES.md](DESIGN-REFERENCES.md).

## The shell

A fixed sidebar in the panel colour: the Vewbox mark, **New production** in violet, then Home · Productions (Shows,
Shorts, Music Videos) · Library (Characters, Locations, Asset Library) · Studio (Settings). At the foot, *Generation
not connected* and whether the sample data has been changed in this browser. On a phone the sidebar becomes a top
bar with a + for New production and a menu button that opens the same links as a sheet.

## Home

![Home](screenshots/home-1440.png)

What you were working on comes first — each row with its picture, its stage and its next step — then three compact
ways to start (a show, a short, a music video), then a few of the newest shows, shorts and music videos in their own
shapes, each section with *View all*. On a phone the three start tiles sit in one row under the work.

<img src="screenshots/home-390.png" width="300" alt="Home, phone"> <img src="screenshots/empty-home-1440.png" width="520" alt="Home, empty studio">

## Shows — a cinematic series

![Shows](screenshots/shows-1440.png)

Wide key art with the title, *seasons · episodes · aspect* on the picture's lower edge; beneath it the premise, the
cast, the style and a progress bar. One action: **Add Show**. A search and a sort appear once the library grows.

![Show — Overview](screenshots/show-overview-1440.png)

A show opens into one page: its key art bleeds to the edges and fades into the ground, with the eyebrow, the title
and its Arabic title, the synopsis and **Add Episode** on the lower edge. Five tabs beneath — **Overview · Seasons ·
Characters · Locations · Settings** — and the banner never leaves. Overview lists the seasons as cards with their
progress, then the shared cast as portraits and the world as plates with room to breathe; beside them the show's
overall progress with the episode to pick up next, and its style and format. The one **Add Episode** button, in the
banner, always names the season it adds to.

![Show — Seasons](screenshots/show-seasons-1440.png)

Seasons keeps the season list on the side (the selected one in violet, **Add Season** beneath) and the chosen
season's episodes as rows: thumbnail, number, title, length, stage. The season's heading names it and counts its
episodes, so the destination of Add Episode is never in doubt. The URL carries the tab and the season, so a
reload and the back button both behave. A season with no episodes says so and offers **Add Episode**.

<img src="screenshots/show-seasons-390.png" width="300" alt="Show seasons, phone"> <img src="screenshots/show-settings-1440.png" width="520" alt="Show settings">

## Shorts — a film library

![Shorts](screenshots/shorts-1440.png)

Posters, with the length as a glass badge on the art and the title, style, cast and stage along the lower edge.

![Short — Overview](screenshots/short-overview-1440.png)

A short opens a film workspace under the same banner: **Overview · Story · Characters · Locations · Storyboard ·
Produce · Final Cut**. Every tab stays mounted, so a half-written synopsis survives a look at the storyboard.

![Short — Storyboard](screenshots/short-storyboard-1440.png)

The storyboard is a visual sequence grouped by scene: the frame first, the shot's spec as one line, drag to reorder
within a scene. A shot opens its own editor: takes and frames on one side, *What happens* on the other, advanced
choices behind a disclosure, unsaved changes guarded.

![Shot editor](screenshots/shot-editor-1440.png)

## Music Videos — a record shelf

![Music videos](screenshots/music-videos-1440.png)

Square sleeves with a round play button on the art; the song and the artist beneath, then the length, the treatment
and the aspect as badges. Every play button drives the one shared player.

![Music video — Song & Lyrics](screenshots/music-video-song-1440.png)

A music video opens a music workspace: the sleeve, the song and the artist in the banner with a transport and a seek
bar, a compact player that follows once the header scrolls away, and **Overview · Song & Lyrics · Performers · Visual
Story · Storyboard · Produce · Final Cut**. Song & Lyrics opens with the song as a card — title, source, length, the
brief, the waveform decoded from the real file — then the lyrics as sections that read as one group each: the
section's name, its time range and who sings it on one line, the words beneath in their own script (Arabic lyrics
right-to-left inside the English interface, with the English beneath where it exists). The section being sung lights
up; each has its own play button. The seek bar shows the song's length before the file has loaded.

<img src="screenshots/music-video-overview-1440.png" width="420" alt="Music video overview"> <img src="screenshots/music-video-performers-1440.png" width="420" alt="Music video performers">

## Characters — a casting wall

![Characters](screenshots/characters-1440.png)

Portraits with the name, *role · style* and badges for the show and the voice. Every library has the same toolbar
in the same place: search, a style filter, its own filter (voice here; stage for shorts; interior/exterior for
locations) and the sort.

![Character — Appearance](screenshots/character-appearance-1440.png)

A character has **Appearance · Voice · Profile · Used In**: reference views from every side (upload your own, or
the *Create* button that says generation is not connected), one chosen voice among sample lines, the profile as
facts, and every production they appear in.

<img src="screenshots/character-voice-1440.png" width="420" alt="Character voice"> <img src="screenshots/character-used-1440.png" width="420" alt="Character used in">

## Locations — wide plates

![Locations](screenshots/locations-1440.png)

![Location — Overview](screenshots/location-overview-1440.png)

A location has **Overview · Views · Lighting & Variations · Props · Used In**: the master plate, the landmarks, the
camera views, the times of day it is seen in and its states, the props that stand in it.

## Asset Library and Settings

<img src="screenshots/assets-1440.png" width="420" alt="Asset library"> <img src="screenshots/settings-1440.png" width="420" alt="Settings">

Every picture, clip and sound by kind, searchable, opening in a dialog; files you add are kept in this browser.
Settings: the interface language and motion, defaults for new projects, the note that generation is not connected,
and the sample data (reset, or start empty).

## Creating

<img src="screenshots/wizard-show-1440.png" width="420" alt="New show wizard"> <img src="screenshots/wizard-music-video-1440.png" width="420" alt="New music video wizard">

**New production** offers a show, a short or a music video. Each is a short wizard: the idea (**I want inspiration**
with written example ideas, or **I have an idea**), the look and format (Cartoon · Anime · Realistic, language and
Iraqi Arabic dialect, duration, aspect; more behind *More settings*), the people and places (pick, or create a
character or location inline), a review, one button. A music video begins with its song.

## Arabic

![Home, Arabic](screenshots/ar-home-1440.png)

The same stylesheet mirrored: the sidebar on the right, the active bar on the leading edge, IBM Plex Sans Arabic,
every string translated, mixed titles English then Arabic.

<img src="screenshots/ar-show-seasons-1440.png" width="420" alt="Show seasons, Arabic"> <img src="screenshots/ar-music-video-song-1440.png" width="420" alt="Music video song, Arabic">

## Tablet and phone

<img src="screenshots/home-1024.png" width="420" alt="Home, tablet"> <img src="screenshots/show-overview-768.png" width="320" alt="Show, small tablet">

Cards reflow by their own minimum widths; the show's aside drops beneath the seasons; tab bars scroll sideways; the
season list becomes a row.

## Players (third refinement)

![Song player and lyrics](screenshots/state-song-playing-1440.png)

One sound at a time: songs, voice lines and files share one audio source, and a video starting pauses it. The song
player has the cover, song and performer, replay, the transport, a seek bar with elapsed and total time, and volume.
The record's length shows as provisional (`~0:48`) until the file's own metadata arrives. Lyric sections read as one
group each (section, time range, singer, words in their own script, English beneath) and each seeks the song; the
live one lights up. The compact player follows once the full one scrolls away, from the same state.

<img src="screenshots/state-song-mini-player-1440.png" width="420" alt="Compact player"> <img src="screenshots/state-song-playing-390.png" width="220" alt="Song player, phone">

<img src="screenshots/state-video-paused-1440.png" width="420" alt="Video player"> <img src="screenshots/state-video-no-take-1440.png" width="420" alt="No take yet">

The video player: a poster with one play button; controls that return on movement, touch or focus; frame steps,
seek, time, volume, fullscreen; captions only when a clip has them; the clip letterboxed in its own aspect. A shot
with no take shows the frame dimmed behind a placeholder that says why.

## Auto Idea and Manual Brief

![Auto Idea review](screenshots/state-auto-review-1440.png)

*Create an idea for me* needs nothing. Optional preferences are collapsed and each starts at "Studio decides".
The review shows the concept, structure, cast and places together, editable; nothing is created until *Create
Project*. Until automatic writing is connected, the review is a labelled sample proposal.

<img src="screenshots/state-auto-preferences-1440.png" width="420" alt="Optional preferences"> <img src="screenshots/state-auto-episode-1440.png" width="420" alt="An episode inherits the show's world">

For an episode, the show's style, language, returning cast and places are the context, and a newcomer is proposed as
new and optional. Manual Brief needs only a title or a short description.

## The cast directory and the continuity rule

![Characters](screenshots/state-characters-1440.png)

Each card shows the portrait, name, role, style, where the character belongs, whether they have been in a video
(*Used in videos*, *Unused*, *Usage unknown*) and a voice play button. Filters cover style, production and usage.

![A used character](screenshots/state-character-locked-1440.png)

A character who has been in a video keeps their appearance. The notice lists the takes, and Regenerate and the
reference upload are disabled. The edit form shows the look fields read-only; the voice and the profile still edit.
An unknown history counts as used. See [CHARACTER-CONTINUITY.md](CHARACTER-CONTINUITY.md).

<img src="screenshots/state-character-pending-ref-1440.png" width="420" alt="Unused character with a pending reference"> <img src="screenshots/state-character-used-in-1440.png" width="420" alt="Used In">

An unused character takes a reference picture, shown beside the appearance it would produce. It can be replaced or
removed and is kept across reloads. Used In lists the actual takes, separate from casting alone.

<img src="screenshots/state-character-voice-playing-1440.png" width="420" alt="Voice"> <img src="screenshots/state-ar-character-locked-1440.png" width="420" alt="Arabic">
