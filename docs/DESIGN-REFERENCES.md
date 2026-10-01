# Design references

What was looked at, and what was taken from each. Nothing is copied; the interface is original. The starting point
is the studio's own earlier interface (Git `7c36381`, 19–23 September 2026), chosen by the producer over the two
later redesigns after a side-by-side comparison; see [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Looked at on 2026-09-26, while refining the restored interface

Browsed in the desktop app's browser on the day; observations only, no assets taken.

| Reference | What it does well | What we adopt | What we leave |
| --- | --- | --- | --- |
| **Letterboxd** — a film page (`letterboxd.com/film/…`) | A wide still bleeding to the page edges and fading into the dark ground; the poster and the title sit on its lower edge; the tagline in small caps; facts as one quiet line | The banner header on every detail page (show, film, music video, character, location): art fading into the ground, title on the lower edge, one line of facts, one action | The social layer, ratings, the density of the sidebar |
| **Apple TV** — a show page (`tv.apple.com/…/show/…`) | Full-bleed key art; title, then *kind · genre · genre* as dots; one primary button; the synopsis truncated with *more* | The eyebrow as dots (*Show · Comedy*), one violet primary action, the synopsis kept to three lines in the banner | The purchase flow, the country banner, the hero that fills the whole viewport (ours is capped so the work is visible) |
| **ArtStation** — a channel page (`artstation.com/channels/character_design`) | Portrait-led tiles edge to edge, titles only on hover, chips for channels, the picture as the only decoration | The Characters library as a wall of 4:5 portraits with the name and one line beneath, nothing on the picture | Infinite scroll, the trending filter bar, the dark-on-dark chrome |
| **Bandcamp** — Discover (`bandcamp.com/discover`) | Square sleeves in a strict grid; *title* then *by artist* in two lines; the sleeve is the object | The Music Videos library as a record shelf: square sleeves, title and artist beneath, a play button on the sleeve | The genre tabs and the shop |

## Looked at earlier (web search, 2026-09-26) and still reflected

| Reference | What we keep from it |
| --- | --- |
| Spotify web player — album page and bottom bar | One coordinated audio source; a compact player that follows once the music header scrolls away; the play button on the art |
| StudioBinder — storyboards and shot lists | The storyboard as a visual sequence grouped by scene, frame first, the shot's spec as one line beneath |
| Genius — lyric pages | Song & Lyrics as a readable lyric column with section labels; selecting a section reveals its singers and timing |
| Frame.io — review player | The Final Cut tab is the player; controls minimal and precise; frame stepping in the shot editor |

## What the system becomes

- **Palette:** midnight ink (`#0B0D12` ground, `#12151C` panels, `#171B23` inputs), ivory-white text `#F3F2EE`,
  one violet accent `#6F5FF0` for the primary action and the selected thing, status colours for dots and badges only.
- **Type:** Inter throughout, tight tracking on titles; IBM Plex Sans Arabic for the Arabic interface.
- **Shape:** wide key art for shows, posters for shorts, square sleeves for music, portraits for characters, wide
  plates for locations; 16px radius on cards and pictures, hairline borders, one hover.
- **Organisation:** a grouped sidebar (Productions · Library · Studio) with one primary action; a page header with one
  action on every library page; a banner header and a row of tabs on every detail page; advanced options behind
  disclosures.
