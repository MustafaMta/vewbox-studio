# Design research: a premium, cinematic redesign (October 2026)

Status: research input for the product redesign · written 2026-10-03 · product design research
Reads with: `docs/DESIGN-SYSTEM-V3.md` (the current system), `docs/research/PRODUCT-DESIGN.md`,
`docs/research/UX-STRATEGY.md`, `docs/CONTRACTS-IDENTITY-PACK.md` (one character = one canonical front full-body image
plus one voice).

Scope: principles, interactions and page patterns. No branding, artwork, logos, palettes, copy or exact layouts from
any reference may be copied. Every "transferable principle" below is our own translation for Vewbox.

## How this was researched

- **Rendered pages.** Public pages were rendered in a Chromium browser pane at 1440×900, logged out, from this machine
  (Iraq region). Region effects were:
  - Netflix served `/iq-en/`.
  - Apple TV and Apple Music showed a country banner, which was dismissed with ×. The country was not changed.
  - Disney+ redirected to its Iraq onboarding wall.
- **Fetched sources.** WebFetch and WebSearch were used for articles, documentation and server-rendered pages.
  - Apple's HIG HTML renders client-side, so it was read through the JSON data endpoints
    (`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`).
  - Material 3 pages were rendered in the browser.
- **Cookies.** Non-essential cookies were rejected where a reject option existed (Disney+). Where the only option was
  "Got it" (Awwwards), nothing was accepted.
- **Local inputs.**
  - `PRODUCT-DESIGN.md`, `UX-STRATEGY.md` and `DESIGN-SYSTEM-V3.md` (all 1,194 lines).
  - `docs/evidence/v3-*.png` and `cast-*.png`.
  - Code: `globals.css`, `nav.tsx`, `StoryboardTab.tsx`, `VideoPlayer.tsx`, `screening/page.tsx`, `proxy.ts`.
  - The running app at http://localhost:4200, read only. Pages viewed: `/shows`, `/shorts`, `/music-videos`,
    `/locations`, `/screening`, `/settings`. These were viewed live because no evidence captures exist for them. On
    2026-10-03 the studio held 5 characters and no shows, shorts or music videos.
- **Not accessible:**
  - Disney+ title pages (sign-up wall).
  - Mobbin: "403 FORBIDDEN · This request was blocked", in both the browser and fetch.
  - Behance: project images did not load in the browser, and fetch returned 403.
  - Godly: godly.website now redirects to recent.design, whose app-screenshot section answered "Can't see anything".
  - IMDb by fetch (403). It was read in the browser instead.
  - Adobe HelpX (403).
  - Every logged-in streaming UI and player.
  - The YouTube Music player. It was not opened because it autoplays audio on this machine.

---

## 0. The decisions on one page

1. **Three contexts, three surface recipes.**
   - *Browse*: art leads, with an ambient tint from the artwork in the hero only.
   - *Edit*: the canvas leads, on an achromatic surround in compact density.
   - *Screen*: lights down; only the film and its transport remain.

   Sources: Spectrum 2 background layers; grading-room practice.
2. **Shape is identity.** Each content type has one artwork ratio and one hero type, so the nine pages cannot read as
   copies:

   | Content | Artwork ratio | Hero type |
   |---|---|---|
   | Shows | 16:9 key art | backdrop |
   | Shorts | 2:3 poster plus 16:9 cut | diptych |
   | Music Videos | 1:1 sleeve plus 16:9 video | sleeve header |
   | Characters | 2:3 full-body figure, plus a 1:1 face circle | figure |
   | Locations | 16:9 plate (2.39:1 hero crop) | plate |
   | Studio Company | no art | constellation |
   | Screening Room | native ratio | theatre |
3. **The character ratio changes.** v3's 4:5 portrait becomes the contract's 2:3 full-body figure. A stored face crop
   feeds cast rows, pickers and lyric chips.
4. **Media components come first.** v3 specifies furniture well, but it has no hero, rail, episode card, poster or
   sleeve tile, theatre player, sticky compact header, metadata line or cast row. Add them.
5. **The ivory primary, the warm neutrals and the four-job accent stay.**
   - The warm neutrals are validated by Linear's 2026 move to warmer greys.
   - The ivory primary is validated by the light pill buttons on Apple TV and YouTube Music.
   - Push restraint further: tone instead of 1 px borders, a dimmed sidebar, and no glass chips on content.
6. **Artwork may tint the page only in a browse hero,** and only with clamped chroma. The tint never appears behind a
   viewer under review, never in the Studio Company page, and never on chrome.
7. **Light-backed generated images must not glare.** Darken them slightly when presenting them (Apple HIG). Separately,
   test a mid-grey backdrop in the canonical prompt.
8. **Two type voices.**
   - The interface voice stays (Inter and IBM Plex Sans Arabic).
   - A *title voice* is used for content names in heroes only, chosen by a bilingual pairing spike (§2.3).
   - A hero scale of 64/64 is added.
9. **Correct v3's RTL media rule.** Seek bars, waveforms, timelines and transport stay LTR in Arabic. Job progress
   still mirrors. Source: Material 3 bidirectionality.
10. **Editing ergonomics.**
    - Panels are docked and resizable, and can collapse to a focus mode (Figma UI3 reverted floating panels).
    - The inspector is contextual (as in Premiere's Properties panel).
    - Precision geometry (≤ 2 px radius) for clips and takes.
    - Versions can be compared A/B.
11. **Every page gets its own signature and its own empty state.** Today `/shows`, `/shorts`, `/music-videos` and
    `/locations` are the same template, and each hint repeats its lead word for word. The Screening Room returns to
    the navigation.
12. **The WCAG 2.2 AA work is specific:**
    - `scroll-padding` for every sticky bar (2.4.11).
    - Pointer alternatives for every drag (2.5.7).
    - 24 px minimum targets (2.5.8).
    - One Help location (3.2.6).
    - Carry inputs across creation methods (3.3.7).
    - Distinct page titles. Every route is titled "Vewbox Studio" today (2.4.2).
    - Single-key shortcuts scoped to the focused player (2.1.4).
    - Two-colour focus rings on imagery.

---

## 1. References

Each entry gives: what it does, why it works, and the transferable principle. Dates are when the page was read; an
article's own date is given where it has one.

### 1.1 Netflix: public title page
Read 2026-10-03 · https://www.netflix.com/title/80057281 (served as `/iq-en/title/80057281`), logged out, rendered.
Not accessible: the member browse UI, the title modal and the player.

**What it does**
- **Section nav.** A floating, centred pill navigation stays visible while scrolling: "Trailers · Episodes · More to
  Watch · Plans".
- **Hero.**
  - A rounded inset frame autoplays a muted trailer.
  - Pause, mute, fullscreen and subtitle buttons sit at the bottom end, and are always visible.
  - The title treatment and one call to action sit on the darkened start side.
- **Metadata block.**
  - One metadata line reads "2025 · 5 Seasons · 16+ · Sci-Fi".
  - A two-line synopsis follows, then "Starring:" with three names and "Creators:".
- **Trailers rail.** 16:9 stills with a play glyph and a duration chip. A kind label ("TRAILER") sits above each title.
- **Episodes.**
  - A season dropdown sits inline beside the "Episodes" heading.
  - A horizontal rail of 16:9 cards follows. Each card has a duration chip on the image, a numbered title
    ("1. Chapter One: …") and a three- to four-line synopsis.
  - An arrow button advances the rail.
- **More Details.** Three columns:
  - availability, genres and mood tags ("This show is …")
  - audio and subtitles
  - the cast list
- **Recommendations.** Rows of 2:3 posters.
- **Ambient colour.** The whole page sits on a warm wash taken from the title's art, fading to near-black.

**Why it works**
- One scroll answers three questions in order: what is it, is it for me, how do I start.
- The metadata reads as a single line.
- Rails keep the page short.
- The art-derived wash makes each title feel bespoke with no per-title design work.

**Transferable principle**
- Use an anchor nav on long detail pages.
- Attach the season picker to its heading.
- Episode card anatomy: still, then a numbered title, then a short synopsis, then the duration.
- Any moving preview has visible controls (WCAG 2.2.2).
- Artwork tints only the browse hero.
- Do not copy the translucent glassy episode cards; v3 rightly bans them.

### 1.2 Disney+: title pages (secondary sources only)
Tried 2026-10-03. `disneyplus.com/browse/entity-…` redirected to the Iraq onboarding wall ("New Originals,
blockbusters and series" plus Sign Up). The en-gb URL fetched server-side returned the same landing page.

**Secondary sources**
- 9to5Mac, 2025-10-02, on the announced redesign:
  - a top navigation bar with "For You" as home
  - "cinematic-style poster artwork"
  - content badges ("Season Finale", "New Series", "New Movie")
  - "Video playback within the Hero carousel"
- AlternativeTo, 2026-09-11: the redesigned app shipped with "a modernized homepage and a new top navigation bar". It
  gives no further detail.
- PRODUCT-DESIGN.md (read 2026-10-02) recorded the title-page tabs Suggested · Extras · Details · Episodes.

**Why it works.** State words beside the art ("New Series") tell a returning viewer what changed. Tabs keep bonus
material out of the episode list.

**Transferable principle (low confidence; not observed directly)**
- State tags in plain words *under* artwork: "Cut ready", "Needs your approval", "New take". Never badges painted on
  the art.
- Extras become **Deliverables** (trailer, stills, vertical cut) inside a production, as PRODUCT-DESIGN proposed.

### 1.3 Apple TV: show page
Read 2026-10-03 · https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx, rendered, plus a server
fetch.

**What it does**
- **Hero.**
  - Full-bleed key art at roughly 85 % of viewport height, which then plays a trailer in place.
  - The bottom-start text block, in order:
    - a large plain title
    - the kind line "TV Show · Thriller · Mystery" with a rating chip
    - a two-line synopsis with "MORE"
    - a metadata row: year · runtime · age rating · technical badges (4K, Dolby Vision, Dolby Atmos, CC, SDH, AD)
    - one light pill call to action and a circular "+"
  - "Starring" names sit at the bottom end.
- **Below the hero, on a flat neutral dark grey:**
  - "Season 1 ⌄" as a heading that is also a picker.
  - A 16:9 episode rail. Text sits inside each card's bottom scrim: "EPISODE 1", the title, a two-line synopsis, the
    duration and a "…" menu.
  - Trailers and Bonus Content rails (16:9).
  - Related (2:3 posters).
  - Cast & Crew: circular portraits with the actor's name and the character's name.
  - How to Watch.
  - About (cards).
  - Information: Released, Rated, Content Advisories, Region of Origin.
  - Languages: original audio, audio tracks, subtitles.
  - Accessibility: CC and AD, each defined in a sentence.

**Why it works**
- Extreme scale contrast: one huge title, everything else small.
- The art is uninterrupted.
- A single light-coloured primary.
- Technical capability is summarised in a row of small text badges.
- Reference information comes last, as definition lists. Accessibility features are named and explained.

**Transferable principle**
- The ivory primary in v3 is the right call.
- Deliverable specs as small text tags, e.g. "16:9 · 1080p · Arabic subtitles · −14 LUFS".
- Cast as **circular face crops** with the *character* name.
- "Season N ⌄" as the season picker.
- An Information section at the end of every detail page.

### 1.4 IMDb: title page
Read 2026-10-03 · https://www.imdb.com/title/tt11280740/ in the browser (WebFetch was refused with 403).

**What it does**
- **Hero band (dark).**
  - The title, then "TV Series · 2022– · TV-MA · 50m".
  - Three media slots side by side: a 2:3 poster, a 16:9 trailer player, and count tiles ("24 VIDEOS", "99+ PHOTOS").
  - Genre chips and a synopsis.
  - "Creator" and "Stars" rows.
  - A status callout ("SEASON 3 PREMIERE 2027").
  - Top utility links: "Episode guide 25 ›" at the start; "Cast & crew · User reviews · Trivia · FAQ · All topics" at
    the end.
- **Body.** It switches to a dense light reference layout.
  - Episodes: season tabs S1/S2, an episode strip E1…E9, and a featured episode card with its date, rating and
    synopsis.
  - Then Videos and Photos.
  - **Top Cast**: a two-column grid. Each entry has a circle photo, the actor, the character, and "20 episodes •
    2022–2027".

**Why it works**
- It is reference density with navigation aids: counts on every link, an "All topics" jump menu, and an episode
  guide.
- Per-person appearance counts and year ranges answer "how central is this person?"

**Transferable principle**
- Cast rows say "in 6 episodes · S1–S2".
- Section headings carry counts.
- A **diptych hero** fits a single film: identity image, then main player, then counts of other media. It is used for
  Shorts (§3.2).

### 1.5 Spotify: album and artist pages (open.spotify.com)
Read 2026-10-03.
- Album: https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv
- Artist: https://open.spotify.com/artist/0k17h0D3J5VfsdmQ1iZtE9

Both were rendered logged out.

**What it does**
- **Layout.** Three regions: library (start), main (centre), now-playing (end, collapsible).
- **Album header.**
  - A 1:1 cover.
  - The kind ("Album"), then a very large bold title.
  - An artist avatar and name · year · "10 songs, 42 min 52 sec".
  - The header is tinted with a colour from the cover, fading into the dark body.
- **Action row.** A large play disc, shuffle, add and more. A "List" view toggle sits at the end.
- **Track table.**
  - Columns: # (it becomes a play button on hover), Title with the artist beneath, and duration under a clock icon.
  - On scroll, a compact sticky bar with the play disc and title appears.
  - "More by" follows as 1:1 sleeves with years.
- **Artist page.**
  - A full-bleed image with a huge overlaid name and the monthly listener count.
  - Play, shuffle, a "Follow" pill and more.
  - A "Popular" list with play counts.

**Why it works**
- One unmistakable play target.
- Totals in the header line.
- A table carries density with almost no chrome.
- The sticky compact header keeps the primary reachable.
- Art colour individualises each page.

**Transferable principle**
- The Music Video header and its **Sections table** (§3.3).
- A sticky compact header on every hero page.
- Row numbers that become play buttons on hover or focus.
- Do not copy the green, or the rounded panels on a black background. v3's sidebar on the ground is calmer.

### 1.6 Apple Music: album and music-video pages
Read 2026-10-03.
- Album: https://music.apple.com/us/album/the-dark-side-of-the-moon/1065973699
- Music video: https://music.apple.com/us/music-video/money/1509336177

**What it does**
- **Album.**
  - The cover; the title with an explicit marker; the artist as an accent-coloured link; "Rock · 1973".
  - Editorial notes with "MORE", and a light "Preview" pill.
  - The track list marks popular tracks with **a tiny dot**.
  - The list ends with a footer: release date, "10 songs, 42 minutes", copyright.
  - Then the "Other Versions", "Music Videos" (16:9) and "More to Hear" shelves.
  - A floating transport pill sits at the bottom.
- **Music video.**
  - A 16:9 frame with the title, artist and "ROCK · 2014".
  - "More By" and "You Might Also Like" as 16:9 tiles.
  - Before images load, tiles show a **flat dominant-colour block**. Behance's search grid does the same.

**Why it works**
- Totals close the list.
- State is a dot, not a number.
- Audio (1:1) and video (16:9) are different shelves, so their shapes tell them apart.
- Dominant-colour placeholders make loading calm and stop layout jumps.

**Transferable principle**
- Music Videos carry both shapes: a 1:1 sleeve for the song and 16:9 for the video.
- A totals footer.
- Dominant-colour image placeholders across the app.
- Quiet dot markers for minor state.

### 1.7 YouTube Music
- Search read 2026-10-03: https://music.youtube.com/search?q=pink+floyd+money
- Now Playing: 9to5Google, Abner Li, 2025-12-20, https://9to5google.com/2025/12/20/youtube-music-2025-now-playing-redesign/
- The player itself was not opened.

**What it does**
- **Search.**
  - Filter chips: Videos, Songs, Artists, Albums, Profiles, Episodes and more.
  - A top-result card shows a thumbnail, "Video • artist • 42M views", a light Play pill and an outline Save pill.
  - Rows lead with their kind ("Song • …", "Video • …").
- **Now Playing (article).**
  - A Song/Video switcher with icons.
  - The bottom tabs collapse into one "Up Next", named after the album or playlist.
  - Lyrics moved into the carousel; related content sits behind the title.
  - The progress bar "loses the playhead" and "becomes thicker" while scrubbing.

**Why it works.** One track is one object with two renderings. Kind-first labels make mixed lists scannable.

**Transferable principle**
- The Music Video page gets a **Song ⇄ Video switch** on one shared transport, and switching keeps the playhead. This
  extends UX-STRATEGY's shared transport.
- Kind-first labels in mixed lists (Files, search, the command palette).
- Keep a visible thumb for keyboard focus even if pointer scrubbing thickens the track.

### 1.8 Adobe: Spectrum 2 and Premiere Pro 25
Read 2026-10-03. Sources:
- Spectrum background layers, rendered: https://spectrum.adobe.com/foundations/color/background-layers
- "Introducing Spectrum 2": https://adobe.design/ideas/introducing-spectrum-2
- Photutorial on Premiere Pro's UI, 2025-01-28:
  https://photutorial.com/the-new-premiere-pro-ui-has-users-divided-is-adobes-friendly-design-going-too-far

Adobe HelpX "What's new" returned 403.

**What it does**

*Spectrum 2 separates editing contexts from browsing contexts.*

| Context | Layer | Role |
|---|---|---|
| Editing | Layer 2 | "the color of the canvas"; also usable for the app frame |
| Editing | Layer 1 | the app frame in professional apps "which require additional depth differentiation" |
| Editing | Pasteboard | a dedicated layer; in the dark theme it is the darkest (gray-25) |
| Editing | Elevated (drop shadow) | floating toolbars, panels and popovers, "used sparingly" |
| Browsing | Base (gray-25) | the background, "to draw attention to the primary content" |
| Browsing | Layer 2 | groups related content |

*Spectrum 2 more broadly* moves to rounder forms, stronger contrast (the old greys felt "washed out"), and "dynamic
contrast and brightness" controls.

*Premiere Pro 25* gained a context-aware **Properties panel**, which was "more universally welcomed". Its rounded clip
corners and low-contrast pastel clip colours were criticised by editors: "You can't see the cuts between clips."

**Why it works.** Surface layering follows the job of the page. In an editing tool, precision outranks friendliness.

**Transferable principle**
- Vewbox needs **two surface recipes** (browse and edit; §2.1).
- A contextual inspector.
- Square-ish geometry and high-contrast boundaries for anything frame-accurate.
- A user contrast and brightness preference.

### 1.9 DaVinci Resolve: Edit and Cut pages
Read 2026-10-03:
- https://www.blackmagicdesign.com/products/davinciresolve/edit
- https://www.blackmagicdesign.com/products/davinciresolve/cut

**What it does**
- **Edit page.**
  - The media pool at the top left, source and timeline viewers, the inspector at the top right, the timeline below.
  - A smart trim tool "automatically switches between ripple, roll, slip and slide based on the location of the mouse
    pointer".
  - An edit overlay offers edit types on drop.
  - Timelines can be stacked or tabbed; bins and smart bins organise media.
- **Cut page.** It is a reduced, faster workspace over the same project.
  - "no annoying horizontal and vertical scroll bars"
  - the UI "automatically scales and reconfigures itself"
  - a **dual timeline**: the whole programme above and a magnified working area below

**Why it works**
- The page order encodes the workflow.
- A reduced workspace and a full workspace over one dataset serve both quick and deep sessions.
- The dual-scale timeline removes constant zooming.

**Transferable principle**
- Production workspace tabs in pipeline order (already in UX-STRATEGY).
- A *Review* surface (the Screening Room) and a *Produce* surface over the same production.
- A dual-scale strip for episodes longer than about 5 minutes.
- No nested scrollbars in edit surfaces.

### 1.10 Figma: UI3
Read 2026-10-03 · "Our approach to designing UI3", 2024-10-01, https://www.figma.com/blog/our-approach-to-designing-ui3/

**What it does**
- Floating panels shipped in the beta, then were reverted: "the nail in the coffin was learning that they slowed
  people down". Panels became fixed but resizable.
- "Minimize UI" replaced the blunt Hide UI.
- Toolbars float at the bottom.
- Labels were rewritten so that "all labels provide the full context".
- Some icon-only controls reverted to a checkbox or an inline dropdown because they were slower.

**Why it works.** Long-session tools optimise for speed and predictability over novelty.

**Transferable principle**
- Docked, resizable panels, plus a **focus mode** in edit contexts.
- Floating elements only for transient tools.
- Full-context labels over icon-only controls.

### 1.11 Linear: 2026 refresh
Read 2026-10-03:
- "Behind the latest design refresh", Charlie Aufmann and Maxime Heckel, 2026-03-12:
  https://linear.app/now/behind-the-latest-design-refresh
- Changelog: https://linear.app/changelog/2026-03-12-ui-refresh

**What it does**
- The navigation sidebar is "slightly dimmer, allowing the main content area to stand out".
- Tabs were compacted.
- Icons were redrawn, resized and reduced in number.
- Borders were softened: "Structure should be felt not seen".
- The palette moved from a cool blue-ish grey to "warmer grays".
- Headers and view controls are consistent across all object types.
- The ethos: "Don't compete for attention you haven't earned."

**Why it works.** Density is kept, and noise is removed through restraint, not through emptiness.

**Transferable principle**
- This confirms v3's warm neutrals.
- Go further: dim the sidebar one step, replace panel borders with tone, and fix header action positions on every
  page.

### 1.12 Awwwards: Film & TV category
Read 2026-10-03 · https://www.awwwards.com/websites/film-tv/ (2,144 entries).

**Examples read**
- **Tamás Olajos, AI Filmmaker.** Nominee 2026-08-28.
  - https://www.awwwards.com/sites/tamas-olajos-ai-filmmaker · live site https://tamasolajos.com/
  - Built with Three.js and WebGL. On load it shows black, then a full-screen colour-mosaic transition.
- **In Development Studios.** Nominee 2026-09-15; design score 8.13.
  - https://www.awwwards.com/sites/in-development-studios
  - Tagged Minimal and Clean; has light and dark modes.
- **Jealous Films.** Nominee 2026-09-19.
  - https://www.awwwards.com/sites/jealous-films
  - Custom video players, side-swipe navigation and infinite scroll.

**Why it works (for them).** These are portfolios. Spectacle *is* the product.

**Transferable principle**
- Use this only on presentation surfaces: the Screening Room's "Now screening" and the Show hero. Those get large
  type and a custom, quiet player.
- Not for the tool: no WebGL transitions, no scroll-jacking, no infinite scroll in editing.

### 1.13 Godly, Mobbin, Behance, Dribbble
Read 2026-10-03.

**Godly.** godly.website redirects to https://recent.design ("Recent · Design Inspiration"). Its app-screenshot path
answered "Can't see anything". No usable entries.

**Mobbin.** Search surfaced indexed screens: "Runway Web Homepage" (https://mobbin.com/explore/screens/b7284f78-ccb0-446d-ab37-d6ad61f5c888)
and "Spotify Web Fullscreen Player" (https://mobbin.com/explore/screens/efef0633-0ba7-47c1-bdfe-f2f9e5359982). Both
returned "403 FORBIDDEN". Not used.

**Behance** (search "streaming platform ui", past month,
https://www.behance.net/search/projects/streaming%20platform%20ui?sort=recommended&time=month). Current titles:
- "Lumière — Mood-Based Movie Streaming Platform": https://www.behance.net/gallery/255416125/Lumiere-Mood-Based-Movie-Streaming-Platform
- "LUMEO: Streaming Platform UI/UX & Brand Identity": https://www.behance.net/gallery/247626227/LUMEO-Streaming-Platform-UIUX-Brand-Identity
- "ChaiShots — OTT Platform Redesign": https://www.behance.net/gallery/255466417/ChaiShots-OTT-Platform-Redesign
- "AI-Powered Streaming | Short Drama Platform UI/UX": https://www.behance.net/gallery/255423935/AI-Powered-Streaming-Short-Drama-Platform-UIUX
- "Animore — Anime Streaming Platform": https://www.behance.net/gallery/255686849/Animore-Anime-Streaming-Platform

Project images never loaded and fetch was refused (403). Only the grid behaviour was observed: a flat dominant-colour
block per project before its cover arrives.

**Dribbble** (search "video editor dark ui", https://dribbble.com/search/video-editor-dark-ui):
- **"Dark Mode Video Editor UI", Sana Javanshir.** https://dribbble.com/shots/26272194-Dark-Mode-Video-Editor-UI
  - A neutral near-black UI with **one** teal accent. The accent is used only for the primary action, selection and
    the playhead.
  - A media bin with duration chips.
  - A viewer with a minimal transport.
  - A slider inspector.
  - A *labelled* tool row (Cursor, Crop, Trim, Cut, Speed, Mirror, Volume, Delete) above a filmstrip timeline with a
    waveform.
- **"AI Video Editor Platform UI Design", Nixtio.** https://dribbble.com/shots/26280112-AI-Video-Editor-Platform-UI-Design
  - Three panes: project clips, viewer, and inspector tabs (Video · Animation · Tracking). Collaborator avatars and
    Export sit at the top end.
  - It is wrapped in a blurred gradient backdrop with purple cursor tags. That is the decorative part the directive
    excludes.
- Many other results are mobile "premium dark" concepts that lean on glow and glass.

**Why the restrained one works.** One accent with three jobs, labelled tools, and the media brighter than anything
else.

**Transferable principle**
- The professional look comes from restraint plus labelled tools.
- Gallery "premium" usually means glow, which is the opposite of what the producer asked for.

### 1.14 Apple Human Interface Guidelines
Read 2026-10-03 through the JSON data endpoints. Pages: Dark Mode, Materials, Motion, Playing video, Typography (URLs
in Sources).

**What it says**
- **Dark Mode.**
  - "The base colors are dimmer, making background interfaces appear to recede, and the elevated colors are
    brighter".
  - Minimum contrast 4.5:1; "strive for a contrast ratio of 7:1, especially in small text".
  - For images with white backgrounds: "consider slightly darkening the image to prevent the background from glowing
    in the surrounding Dark Mode context".
  - A permanently dark appearance is acceptable "for an app that supports immersive media viewing".
- **Materials.**
  - Liquid Glass "forms a distinct functional layer for controls and navigation".
  - "Don't use Liquid Glass in the content layer."
  - "Use Liquid Glass effects sparingly."
  - Use the clear variant only over visually rich media, with "a dark dimming layer of 35% opacity" if the content is
    bright.
- **Motion.**
  - "Add motion purposefully".
  - "Let people cancel motion".
  - "generally avoid adding motion to UI interactions that occur frequently".
  - "Make motion optional."
- **Playing video.**
  - Use the system player, or "reference the behavior and interface of the system video player".
  - Display "at its original aspect ratio" with letterboxing or pillarboxing; no embedded padding.
  - "avoid large, distracting overlays".
  - Avoid mixing audio between sources.
- **Typography.**
  - On macOS the default size is 13 pt and the minimum is 10 pt.
  - "avoid light font weights".
  - "Minimize the number of typefaces".

**Transferable principle**
- Dark-only is legitimate for Vewbox.
- Elevation is shown by lighter tone.
- Darken white-backed images (§2.4).
- Glass is allowed only for a floating transport over video, never on content chips.
- Video is shown at its native ratio.
- No light weights.
- No motion on frequent interactions.

### 1.15 Material Design 3
Read 2026-10-03, rendered. Pages: Color roles, Easing and duration, Breakpoints, Bidirectionality & RTL (URLs in
Sources).

**What it says**
- **Colour roles.**
  - Roles come in "on-X" pairs with an accessible 3:1 minimum.
  - Five surface containers (lowest → highest).
  - "surface for a background area and surface container for a navigation area", with the same mapping across
    breakpoints.
  - Contrast is user-adjustable.
- **Motion.**
  - M3 Expressive moves components to springs. The easing tokens remain for transitions:

    | Token | Value |
    |---|---|
    | standard | `cubic-bezier(0.2,0,0,1)` |
    | emphasized decelerate | `(0.05,0.7,0.1,1)` |
    | emphasized accelerate | `(0.3,0,0.8,0.15)` |
    | short durations | 50–200 ms |
    | medium durations | 250–400 ms |
    | long durations | 450–600 ms |
    | extra-long durations | 700–1000 ms, for ambient motion only |
- **Breakpoints.**

  | Breakpoint | Width |
  |---|---|
  | compact | < 600 |
  | medium | 600–839 |
  | expanded | 840–1199 |
  | large | 1200–1599 |
  | extra-large | ≥ 1600 |

  - Panes go from 1 to 2 to 3 as width grows.
  - "Additional space doesn't just mean making the same thing bigger".
  - "Don't use two panes in medium layouts with high information density".
- **Bidirectionality.**
  - Mirror back and forward icons, the navigation rail (to the right in RTL), and list-detail and supporting-pane
    layouts.
  - "Linear progress indicators should move from right to left for most RTL languages".
  - **"Media controls for video or audio players are always LTR"**.
  - Clocks and circular progress are not mirrored.

**Transferable principle**
- Pane counts per breakpoint (§2.5).
- Enter and exit easing asymmetry (§2.6).
- **The RTL media rule, which corrects v3 §11** (§4.3).

### 1.16 WCAG 2.2
Read 2026-10-03:
- "What's New in WCAG 2.2" (page updated 2023-10-05)
- Understanding documents for 2.4.11, 2.4.13, 2.5.7, 2.5.8 and 3.3.8

URLs are in Sources. The checklist is in §5.

**What changed versus 2.1 that matters here**

*New criteria:*

| SC | Name | Level | Requirement |
|---|---|---|---|
| 2.4.11 | Focus Not Obscured (Minimum) | AA | A focused component "is not entirely hidden due to author-created content"; sticky headers and footers, non-modal dialogs and banners are the usual failures. |
| 2.4.12 | Focus Not Obscured (Enhanced) | AAA | The focused component is fully visible. |
| 2.4.13 | Focus Appearance | AAA | The indicator area is ≥ "a 2 CSS pixel thick perimeter", with ≥ 3:1 between focused and unfocused pixels; inset indicators must be thicker. |
| 2.5.7 | Dragging Movements | AA | A single-pointer alternative is required; "keyboard equivalence … does not automatically meet this success criterion". |
| 2.5.8 | Target Size (Minimum) | AA | 24×24 CSS px, or spacing such that 24 px circles do not intersect; a slider counts as one target. |
| 3.2.6 | Consistent Help | A | Help sits in the same relative place on every page. |
| 3.3.7 | Redundant Entry | A | Do not ask for the same information twice in one session. |
| 3.3.8 | Accessible Authentication (Minimum) | AA | No cognitive test unless a mechanism (password managers, paste) or an alternative exists. |
| 3.3.9 | Accessible Authentication (Enhanced) | AAA | Not even object recognition. |

*Removed:* 4.1.1 Parsing is obsolete.

### 1.17 Supplementary: viewing environment and dark mode
- **Grading environment.** ProVideo Coalition, Steve Hullfish, 2013-06-07,
  https://www.provideocoalition.com/the-color-grading-environment-and-ideal-lume-bias-lights/, plus search summaries
  of SMPTE RP 166 and ITU-R BT.2035.
  - The surround should be neutral and D65, at about 10 % of reference white.
  - A coloured surround biases judgement. In the article's example, a colourist in a warm-toned suite graded skin
    "overly warm".
  - **Principle:** no art tint and no warm-tinted chrome directly around a viewer used for review.
- **NN/g, "Dark Mode vs. Light Mode", Raluca Budiu, 2020-02-02,** https://www.nngroup.com/articles/dark-mode/.
  - Light mode wins on acuity and proofreading, more so with small text.
  - Dark mode helps some low-vision users.
  - "allow users to switch".
  - **Principle:** in a dark-only tool used for long sessions, keep small text large enough and at high contrast. Body
    text is 14 px and ≥ 7:1 (v3's body is 13.6:1). Offer a "More contrast" preference. A light reading surface for
    the script and Bible editors is a possible later option.

---

## 2. Cross-cutting principles for a cinematic dark creative tool

### 2.1 Three contexts, three surface recipes

| Context | Pages | What leads | Surfaces | Density | Art tint | Autoplay |
|---|---|---|---|---|---|---|
| **Browse** | Shows, Shorts, Music Videos, Characters and Locations (catalogues and detail pages), the Studio Company, the Screening programme | the artwork | page `--bg`; groups by tone (`--surface`); overlays `--raised-2` plus shadow | comfortable | **hero only** | muted, opt-in, with visible pause |
| **Edit** | production workspace tabs (Story, Storyboard, Produce, Final cut), shot pages, voice building | the canvas (frame, board, waveform) | pasteboard `--canvas` (achromatic); app frame `--ink-900`; floating tools elevated | compact | **never** | never |
| **Screen** | Screening Room theatre, any full-screen player | the film | surround `#000`; chrome fades while playing | — | **never** | on request only |

Mapping (after Spectrum 2):
- The browse base is the darkest warm neutral.
- In edit, the canvas sits on an *achromatic* pasteboard, and the app frame is one step lighter so the canvas reads as
  a recess.
- Elevated surfaces are lighter, never glowing (Apple HIG: elevated = brighter).

### 2.2 Colour

- **Chrome.** Keep v3's warm ladder (hue ≈ 40°, chroma ≤ 0.012). Linear's 2026 refresh made the same move.
- **Achromatic viewer tokens (new):**
  - `--canvas: #0b0b0b` (chroma 0) behind every frame under review.
  - `--surround: #000` for the theatre.
  - Nothing warm or tinted within the viewer's immediate surround (grading-room practice, §1.17).
- **Art ambience (new; Netflix, Spotify and Apple Music do this for browsing).**
  - **Extraction.** At ingest, compute one dominant colour per hero artwork from a 16×16 downscale, ignoring
    near-white and near-black. Store it on the asset.
  - **Clamping.** Convert to OKLCH and clamp: `L = 0.20`, `C = min(C, 0.045)`, `H` kept.
  - **Use.** Only as the hero backdrop wash, from the clamped colour at the top to `--bg` by 420 px (it replaces v3's
    neutral "hero backdrop fade"). Text on top must still pass 4.5:1. It does at L 0.20 with `--fg`.
  - **Forbidden:** edit and screen contexts, Studio Company, chrome, buttons, borders.
- **Image placeholders (new).** The same stored colour, at `L 0.24`, fills the frame until the image decodes. This
  replaces the grey skeleton for pictures with a known asset (Apple Music, Behance).
- **Accent.** Iris keeps v3's four jobs.
  - Violet is the cliché colour of 2024–26 AI tools. That is a further reason to keep it to marks only.
  - The **sidebar app tile is a saturated violet gradient**, and it is the most saturated object on every page.
    Replace it in-product with a monochrome ivory glyph on `--raised-2`. Keep the colour mark for the favicon,
    loading splash and onboarding.
- **Status colours.** As v3: semantic only.
- **User preference.** Contrast: *Standard / More*. More is also triggered by `prefers-contrast: more`. It raises
  `--fg-muted` to `--ink-200`, `--fg-faint` to `--ink-300`, and `--line-field` one step. This follows Spectrum's
  "dynamic contrast" and M3's contrast levels.

### 2.3 Typography

- **Two voices.**
  - The **interface voice** is v3's Inter (optical sizing) and IBM Plex Sans Arabic. It covers all UI.
  - A **title voice** is used *only* for content names in heroes, the Screening Room and typographic placeholders:
    show, short, music video, character and location names.
  - This answers "visually distinctive" without touching UI legibility.
- **Choosing the title voice: a spike.** Render the Show hero and the Character profile in EN and AR with three
  pairings, then choose from the screenshots:

  | Pairing | Faces | Notes |
  |---|---|---|
  | A | **Thmanyah Serif Display** for Arabic and Latin | A bilingual family; announced as free for commercial use in websites and apps. Its licence page could not be fetched (404 and 522), and it is said to forbid modifying the files, which may include WOFF2 subsetting. Confirm before bundling. |
  | B | a Latin display serif with an `opsz` axis (e.g. Fraunces or Newsreader, OFL), paired with a Naskh display (Amiri or Noto Naskh Arabic, OFL) | Licences not verified in this session. |
  | C | no new font: Inter Display and Plex Arabic 700 at hero scale only | Distinctiveness from scale alone, as Apple TV does. |

  v3's objection to serifs ("a Latin serif title over a sans Arabic title would split the two interfaces") is met by
  A and B, because both scripts change register together.
- **Hero tier (new):**
  - Latin 64/64, weight 500, −0.03em; phone 40/44.
  - Arabic 52/72, weight 600; phone 34/50.
  - v3's display-xl (40) remains for page titles that have no art.
- **Metadata line (new component).** One line, `--fg-muted`, 13/20, dot separators.
  - Order: kind · date or year · count · runtime · style · language · **status last** (dot plus word).
  - Example: "Show · 2026 · 2 seasons · 14 episodes · Cartoon · Arabic (Iraqi) · ● Waiting for you".
- **Numbers.**
  - Durations: "49 min" for runtime; "3:42" for track and cut length.
  - Timecodes: `00:01:12:08` in `.mono .num`, always LTR.
- **Rules kept from v3:**
  - no uppercase or tracking for hierarchy
  - Arabic never below 13 px
  - no light weights (Apple HIG)
  - lead 64ch; prose 68ch

### 2.4 Imagery

- **Ratios carry identity** (this replaces v3 §7's list):

  | Object | Browse tile | Hero / detail | Small uses |
  |---|---|---|---|
  | Show | key art 16:9 | 16:9; **21:9 crop** at ≥ 1280 via focal point | episode still 16:9 |
  | Short | poster 2:3 | poster 2:3 plus cut 16:9 (diptych) | shot frames at the production aspect |
  | Music video | sleeve 1:1 | sleeve 1:1 plus video 16:9, or 9:16 for vertical cuts | — |
  | Character | **full-body 2:3** (contract v2) | full-body 2:3, sticky | **face circle 1:1** from a stored `faceBox` |
  | Location | plate 16:9 | plate **2.39:1** crop | view stills 16:9 |
  | Screening | cut still 16:9 or native | native ratio, letterboxed | — |
- **Focal point per image.** Store `{x, y}` and a `faceBox` once, at approval, so that 21:9, 2.39:1 and circle crops
  are deterministic. No generation is involved.
- **Text on art** appears only in a hero title block over the scrim. This is v3's permitted gradient, mirrored in RTL
  so the scrim comes from the start side. Catalogue tiles carry text *below* the art (v3 rule kept).
- **Light-backed generated images.** The canonical character images are on near-white backgrounds (`cast-*.png`), and
  in a dark grid they glare.
  - **Now:** apply a presentation treatment. At ingest, flag images whose border pixels average luminance above 0.8,
    and present them at `filter: brightness(0.9)` inside a `--media` frame (Apple HIG: "slightly darkening the
    image").
  - **Next:** pipeline experiment. The contract already asks for a "plain neutral background". Test a mid-grey
    seamless backdrop (about sRGB #5c5c5c) in the canonical prompt across Cartoon, Anime and Realistic, and check that
    identity consistency in video generation is unchanged before adopting it.
- **Coherence.** All tiles in one grid share one backdrop treatment, so the grid reads as a casting book, not a
  collage.
- **Honest placeholders (v3 kept), upgraded.** Placeholders become *typographic posters*: the content name set in the
  title voice on `--input`, in the content's own ratio.

### 2.5 Density, panes and layout

- **Comfortable (browse):**
  - controls 40
  - rows 48–56
  - body 14/22
  - sections 48
  - rails gap 24 (16 on phone)
- **Compact (edit; `data-density="compact"` on the workspace root):**
  - controls 32 (44 on coarse pointers)
  - rows 32–36
  - body 13/20
  - section gap 24
  - inspector labels 12/16
- **Panes** (M3 breakpoints):

  | Breakpoint | Panes |
  |---|---|
  | compact < 600 | 1 |
  | medium 600–839 | 1 (2 only for low-density settings) |
  | expanded 840–1199 | 2 |
  | large 1200–1599 | 2, or 3 in edit |
  | extra-large ≥ 1600 | 3 |
- **Widths.**
  - Browse heroes and rails may run full-bleed past v3's 1280 column.
  - Text keeps v3's measures.
  - Edit workspaces use the full width.
- **Header positions are fixed on every page** (Linear 2026): back link → metadata line → title → lead; actions at the
  end of the title row; `More` always last.

### 2.6 Motion

- **Keep v3's tokens and loop policy.** Add enter/exit asymmetry (M3 and HIG):
  - Enter: `--t` or `--t-slow` with `--ease` (decelerate).
  - Exit: `--t-fast` to `--t` with `--ease-in` (accelerate). Exits are always shorter than entries.
- **No motion on frequent interactions** (HIG):
  - Switching tabs inside a workspace is instant.
  - Selection in lists is instant.
  - Menus fade in at 120 ms.
- **Continuity.** Tile → hero uses a shared-element transition (View Transitions API) of the artwork, 320 ms. It is off
  under reduced motion.
- **Hero preview** (Netflix and Apple TV autoplay; Vewbox is quieter):
  - Show a still by default.
  - Where a cut exists, a muted inline preview may start after 2 s on the page. It plays once (≤ 15 s), then rests on
    the still.
  - The pause control is always visible (2.2.2).
  - Never with sound. Never in edit or screen contexts.
  - Off under reduced motion and behind a Settings toggle.
- **Banned:** parallax, scroll-jacking, WebGL page transitions (the Awwwards idiom), and blur or scale on lyric lines.

### 2.7 Navigation

- **Sidebar.**
  - 240 px on the ground, as v3 specifies, with **items one step dimmer** than today (Linear 2026).
  - In edit contexts it collapses to a 64 px icon rail, toggled with Ctrl/⌘+\.
  - Groups:

    | Group | Items |
    |---|---|
    | Productions | Shows · Shorts · Music Videos |
    | Cast & world | Characters · Locations · Files |
    | Studio | Studio Company · Production (with a *needs-you* count) · **Screening Room** |
    | Footer | Settings · Help & shortcuts · connection state |

  - The Screening Room is in the directive but orphaned today; `nav.tsx` has no entry for it.
- **Sticky compact header (new; Spotify).** When a hero leaves the viewport, a 48 px bar appears: back · title ·
  status · the page's primary action.
- **In-page navigation.**
  - Tabs for workspaces.
  - An **anchor nav** for one-page profiles (Character: Voice · Personality · Productions · Notes), as Netflix's
    floating section nav does.
  - Breadcrumbs for deep paths (Show › S1 › E3 › Shot 12). The middle collapses on phones.
- **Command palette (Ctrl/⌘K).** Jump to any show, episode, character or location. Run "New character", "Open
  Production" and "Approve …".
- **Shortcut sheet (`?`).** In the same footer location on every page (3.2.6).

### 2.8 Editing ergonomics

- **Workspace anatomy at ≥ 1200:**
  ```
  ┌ compact header: ‹ The Kite · Short   [Story|Cast & World|Storyboard|Produce|Final cut]   Saved ·  ⌘K  [Export] ┐
  │ shot list (docked, 280, resizable) │ viewer on --canvas, native ratio │ inspector (320, contextual)          │
  │                                    │ transport: J K L · I O · ‹ › frame │                                      │
  ├──────────────────────────────── filmstrip / dual-scale strip for > 5 min ───────────────────────────────────┤
  ```
- **Contextual inspector** (Premiere 25 Properties panel). Its content follows the selection: shot, take, line or
  character. Multi-select edits shared fields. Advanced settings sit behind disclosure (v3 rule).
- **Docked, resizable panels** (Figma UI3). Each panel has collapse and expand buttons and a "Reset layout" menu item
  (2.5.7). **Focus mode** (F) collapses everything except the canvas.
- **Precision geometry.** Clips, takes in comparison strips and frame thumbnails in strips use radius ≤ 2 px, a 1 px
  gap, and boundaries ≥ 3:1. Selected = a 2 px ivory outline, never an accent fill. The playhead is a 1 px ivory line
  with an accent handle. (Editors' complaint about Premiere 25: "You can't see the cuts between clips.")
- **Keyboard.**
  - Space plays and pauses; J/K/L shuttle; I/O mark in and out; ←/→ step one frame; Shift+←/→ jump 1 s.
  - N adds a note at the playhead; 1 and 2 switch A/B.
  - All single-key shortcuts are **active only while the player or strip has focus** (2.1.4).
- **Versions are first-class.** Takes, images, voice builds and cuts form stacks (v1…vN). Compare is A/B on the same
  timeline with the playhead kept (v3 voice compare, generalised).
- **Long-session comfort.**
  - No ivory fill larger than a button next to the viewer. The edit context's primary lives in the header or the
    inspector.
  - Autosave is always visible ("Saved").
  - Undo for every non-generative action, with "Undone" feedback.
  - No modal dialogs for frequent actions.
  - No `window.prompt` or `window.confirm`. The latter is still used for shot delete in `StoryboardTab.tsx`.

### 2.9 Empty, loading and error states

- **Empty.**
  - Purpose-built per page (§3). Each composition is in the page's own shape: a typographic sleeve, poster, figure or
    plate.
  - **Lint rule: the hint may not repeat the lead.** Today it does on `/shows`, `/shorts`, `/music-videos` and
    `/locations`.
  - In-section empties stay as one sentence plus one action (v3).
- **Loading.**
  - Ratio-true frames with dominant-colour placeholders.
  - Skeleton shimmer only until a job reports a phase, then words (v3).
  - Rails reserve their height, so there is no layout shift.
- **Errors.**
  - v3's notice anatomy, kept: what happened → why → what is kept → one recovery.
  - Add a **media failure state** in players: the poster stays, with an inline message, *Try again* and *Open the
    file*.
  - Add a **server-unreachable bar** at the top of the content. The last-known state stays, dimmed and labelled
    "Last known · 2 min ago", as on the v3 company page.
- **Partial states are honest.** For example: "Episode 4 · cut missing · 18 of 20 shots chosen".

### 2.10 RTL (Arabic)

v3 §11 is kept, with these changes and additions.

- **Media stays LTR (correction).** Seek bars, waveforms, filmstrips, timelines, timecodes and the transport group stay
  LTR in Arabic. Wrap them in `dir="ltr"` and give the group an Arabic `aria-label`. ←/→ always mean back and forward
  in media time. Source: Material 3, "Media controls for video or audio players are always LTR".
- **Job progress bars mirror.** They fill from the right.
- **Mirror:**
  - rails: they start at the right; prev and next swap
  - the hero text block and its scrim origin
  - the sticky compact header
  - list-detail and supporting panes
  - the sidebar side
  - breadcrumbs and back chevrons
- **Never mirror:** artwork (faces, sets, any text in art), play and skip glyphs, clocks, circular progress, the
  company orbit's *drawing* (v3 mirrors x, which is correct for the reading order of departments).
- **Lyrics.** Each line is `dir="auto"` and aligned to its own script's start, so Arabic lyrics stay right-aligned
  inside the English UI. The singer chip sits at the line start.
- **Titles in the title voice** follow §2.3. Episode labels read "الحلقة 3" (Western digits, as in v3).
- **Language of parts.** `dir="auto"` does not set `lang`. Arabic names inside the English UI (and the reverse) need
  `lang="ar"` or `lang="en"` for correct pronunciation (3.1.2).

---

## 3. Page-type patterns

### 3.0 One system, nine signatures

| Page | Context | Identity object | Hero | Signature (only this page has it) | One primary |
|---|---|---|---|---|---|
| Shows | browse → edit | key art 16:9 | full-bleed backdrop | **Season ⌄ + episode rail/list with stage lines** | Continue S1 · E3 |
| Shorts | browse → edit | poster 2:3 + cut 16:9 | **diptych** (poster beside player) | **film strip of every shot frame** under the player | Continue / Play cut |
| Music Videos | browse → edit | sleeve 1:1 + video 16:9 | sleeve header with art tint | **Song ⇄ Video switch + sections table + synced lyrics** | Play |
| Characters | browse | full-body 2:3 + face circle | standing **figure**, sticky | **voice reel audible in the header** | Approve (only when Draft) |
| Locations | browse | plate 16:9 / 2.39:1 | plate | **lighting switch** that crossfades the master plate | Use in a production |
| Studio Company | overview | none (monograms) | constellation | **live handoff diagram** | Start a production |
| Production | operations | items awaiting you | "Needs you" queue | **approval cards with the content inline** | Approve |
| Screening Room | screen | the cut, native ratio | theatre | **lights down + timecoded notes** | Play |
| Settings | utility | none | none | health rows; deliberately the plainest page | — |

### 3.1 Shows

**Catalogue `/shows`**
- **Continue strip** (only when something is in progress; UX-STRATEGY's Home): up to 3 cards, each a 16:9 still
  with a stage line. For example: "S1 · E3 · Storyboard · 12 of 20 shots framed".
- **Grid of 16:9 key-art tiles.**
  - 3-up at 1440, min 22rem.
  - Title 16/22, weight 600, below the art.
  - Meta line: "2 seasons · 14 episodes · Cartoon · ● 1 waiting for you".
  - Hover and focus lighten the frame one step; the scale is ≤ 1.02.
- **Empty.** A 16:9 typographic poster reading "Your first show" in the title voice. Beneath it, three numbered steps
  (*Premise · Cast · Episode 1*) and **Start a show**. It never repeats the lead.

**Show page `/shows/[id]`**
```
[full-bleed key art, 21:9 crop ≥1280 (16:9 below), art-tint wash → --bg; scrim from the start-bottom]
  Show · 2026 · 2 seasons · 14 episodes · Cartoon · Arabic (Iraqi)          ← metadata line
  Title in the title voice (64/64)
  Logline, one or two lines, max 64ch.
  [ Continue S1 · E3 ]  [ ▶ Latest cut ]  [ ⋯ ]                              ← one ivory primary
  ● Waiting for you: approve the story of E4 ›                               ← status strip, only when true
────────────────────────────────────────────────────────────────────────────
 Episodes 14   Cast 9   World   Bible   Settings                           ← sticky tabs (UX-STRATEGY §C)
 Season 1 ⌄                                                    [▦ | ☰]
 ┌16:9──────┐ ┌16:9──────┐ ┌16:9──────┐ ┌16:9──────┐  ›
 │     49 min│ │          │ │          │ │          │
 Episode 1     Episode 2 …
 Title 15/20 600
 Synopsis, 2 lines, muted
 ● Final cut · approved     ● Produce · 14/20 shots
```
- **Episode card.**
  - The still is the chosen take frame or the first shot. A duration chip sits on a solid scrim (no blur).
  - Below the still: the label "Episode 3" (sentence case), the title, a two-line synopsis and the stage line.
  - An unwritten episode shows a typographic placeholder with a large number.
  - List view (☰) shows a row: number · 160 px still · title · synopsis · duration · stage strip.
- **Season picker.** It is the heading ("Season 1 ⌄"). It defaults to the most recently touched season
  (PRODUCT-DESIGN §1).
- **Cast tab.**
  - 88 px face circles, the character name, the role and "in 6 episodes · S1–S2" (IMDb).
  - A voice play disc appears on hover and focus, and is always shown on touch.
  - Groups: leads, supporting, featured.
- **Information** (end of Overview, after Apple TV): Created · Style · Language and dialect · Aspect · Deliverables as
  text tags.
- **Production controls.**
  - No generation buttons on the show page.
  - The hero's primary is "Continue <next step>", derived from the pipeline. This is the single progress model in
    UX-STRATEGY A4.
  - Generation happens in the episode workspace (§2.8).
- **Phone.**
  - The art is 16:9 on top, with the text block *below* it, not overlaid.
  - The primary is full width.
  - Tabs scroll.
  - Episodes default to list view.

### 3.2 Shorts

- **Catalogue.**
  - 2:3 poster tiles, 5-up at 1440 (min 13rem).
  - The poster is generated key art, or a typographic poster.
  - Meta below: runtime · stage.
- **Detail: diptych hero** (after IMDb's hero slots).
  ```
  Short · 2026 · 6 min · Cartoon · Arabic (Iraqi)
  Title (title voice)
  ┌ poster 2:3 ┐ ┌ cut player 16:9 (or animatic / storyboard reel) ─────────────────┐
  │   240 w    │ │                                                                   │
  └────────────┘ └───────────────────────────────────────────────────────────────────┘
                 ▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣  ← film strip: every shot's frame at the production aspect; click = seek / open shot
  Logline · [ Continue: Produce ] [ ▶ Play cut ] [ ⋯ ]
  Overview · Story · Cast & World · Storyboard · Produce · Final cut   (UX-STRATEGY §C)
  ```
- **Before a cut exists** the player slot shows the storyboard reel, or the frames grid with "No cut yet · 12 of 20
  frames".
- **Signature: the film strip.** One film reads as a sequence of frames, whereas Shows read as a sequence of
  episodes.
- **Empty catalogue.** One 2:3 typographic poster, "Your first short", with *Describe it* and *Write it*.
- **Phone.** The player comes first, then the poster at 96 px beside the title, then the strip scrolling
  horizontally.

### 3.3 Music Videos

- **Catalogue.**
  - 1:1 sleeves, 6-up.
  - Title and performer names below.
  - A play disc for the song preview appears on hover and focus.
  - Meta: "3:42 · 24 shots".
- **Detail** (after Spotify, Apple Music and YouTube Music):
  ```
  [art-tint wash from the sleeve, fades to --bg by 420 px]
  ┌ sleeve 1:1 ┐  Music video · 2026 · 3:42 · 24 shots
  │   280      │  Title (title voice)
  │            │  (◯) Amina  (◯) Samir · Arabic (Iraqi)        ← 28 px face circles = performers
  └────────────┘  [ ▶ ]  [ Song | Video ]   [ Continue: Storyboard ]  [ ⋯ ]
  Sections · Lyrics · Performers · Visual story · Storyboard · Produce · Final cut
   #   Section    Singer    Shots        Time
   1   Intro      —         ▪▪▪ 3/3      0:12        ← # becomes ▶ on hover/focus (seeks there)
   2   Verse 1    Amina     ▪▪▫ 2/3      0:34
   …
   3:42 · 8 sections · 24 shots · song v3 · −14 LUFS                ← totals footer (Apple Music)
  ```
- **Song ⇄ Video** (YouTube Music).
  - One transport. Switching keeps the playhead.
  - *Song* shows the sleeve and synced lyrics.
  - *Video* shows the cut or the animatic. It is disabled, with the reason as text ("No cut yet"), until one exists.
- **Lyrics** (Apple Music focus logic, minus the blur).
  - The active line is at full weight; the others are `--fg-muted`.
  - The singer face chip sits at the line start.
  - Click a line to seek.
  - In edit, the singer is assigned per line through a menu, not by drag (2.5.7).
- **Sticky compact player bar** once the header scrolls out: play · title · time · Song | Video.
- **Empty.** A 1:1 typographic sleeve, "Untitled song", with "A music video starts with its song" and *Write the
  song* / *Upload a song*.
- **Phone.**
  - The sleeve is full width up to 320 px, then the title block, then the action row.
  - The sections table drops the Shots column into the row's second line.

### 3.4 Characters

- **Directory.**
  - 2:3 full-body tiles (the contract's canonical image), 6-up at 1440 (min 12.5rem), with one backdrop treatment.
  - Name 15/20, weight 600. Role on one line.
  - Meta: status (*Draft / Approved / Locked · 2 videos*) · voice (*Voice / No voice*) · language.
  - **Controls.** Today there are 6 always-visible bordered dropdowns, a sort and a view toggle. Change them to:
    - search
    - one **Filter** button, opening a popover with Style · Production · Language · Status · Usage, with active
      filters shown as chips
    - sort
    - view toggle

    This removes the strongest admin-table signal on the page.
  - Optional grouping by production ("In The Kite") as rails.
- **Profile** (one page, per contract §4):
  ```
  ‹ Characters
  ┌──────────────┐  Cartoon · Arabic (Iraqi Baghdadi) · 9 · ● Draft — awaiting your approval   [Approve] [Edit ▾] [⋯]
  │              │  Amina                           ← title voice
  │  canonical   │  أمينة                            ← lang="ar", .text-sm muted
  │  full body   │  Nine years old, flies the red kite her brother left behind.
  │  2:3         │  ▶ ▁▂▅▇▅▂ 0:04  "شلونك؟ …"  Iraqi dialect voice · Intelligible (measured)
  │  sticky ≥1024│  ── Voice · Personality · Productions · Notes ──      ← anchor nav
  └──────────────┘  sections…   (secondary material collapsed at the end)
  ```
  - **The figure is sticky** at ≥ 1024 and scrolls with the page below that.
  - **The voice reel sits in the header** (Spotlight's voice reel, as v3 §9.6 proposes).
  - **Lock.**
    - It is shown once, as status in the metadata line, plus the slim bar inside the voice panel (v3).
    - On phones today the lock text sits *above* the name (`cast-profile-locked-ar-phone.png`). Move it after the
      name.
  - **"The look, in words" shows only filled facts.** Today five of seven rows read "—", which looks like a form. If
    facts are missing, show one sentence: "Only the hair and wardrobe are written down. *Describe the rest*".
  - **Primary.** *Approve* is the ivory primary only while Draft. Otherwise there is no primary, rather than a fake
    one.
- **Signature:** a standing figure you can hear.
- **Phone.**
  - The figure is full width, max 60vh.
  - Then the name, the voice reel and the anchor nav as a scrolling chip row.

### 3.5 Locations

- **Catalogue.**
  - 16:9 plates, 2-up at 1280 and 3-up at ≥ 1600. They are deliberately big, like a scouting board.
  - Meta: name · "Day · Dusk · Night" · "in 3 productions".
- **Location page.**
  - **Hero.** The master plate at a 2.39:1 crop (focal point), full content width.
  - **Lighting switch** under the plate: a segmented control (Day · Dusk · Night · …) that crossfades the plate in
    480 ms, or instantly under reduced motion.
  - **Views.** A filmstrip of 16:9 stills in a fixed order (Wide · Reverse · Detail · …). A missing view is an
    outlined frame with *Draw* (v3's "visible gap" rule).
  - **Description** (prose) and **continuity facts** (period, weather, key props) as a definition list. Only filled
    facts are shown.
  - **Used in.** Rows: 16:9 thumbnail, production, scenes.
  - **Production controls.** A quiet toolbar under the plate: *Redraw plate* (unlocked only) · *Add lighting* · *Add a
    view*. The lock language matches Characters.
- **Empty.** A 2.39:1 typographic frame, "A place for your story", with *Describe it* / *From a photo*.
- **Phone.** The plate is 16:9 and full width, the lighting switch scrolls, and views form a horizontal strip.

### 3.6 Studio Company

Keep v3 §9.1: the orchestrator constellation, real handoffs only, the inspector, roving focus, the list view and the
phone spine. The rendered result (`v3-studio-en-desktop.png`) is the strongest page in the app.

Changes:
- **Remove the bordered, rounded stage panel.** The orbit sits on a borderless `--sunken` band that runs to the content
  edges, so the diagram no longer looks like a card on a page ("structure felt not seen").
- **Inspector with nothing in production.** Hide the three "0" rows and use one sentence: "Nothing in production".
  "How the company works" becomes a 4-step ordered list instead of a 5-sentence paragraph.
- **Recent handoffs** become a timeline list with monograms, and the edge state as words.
- **No artwork and no art tint here,** ever. It is the one page about *people*, not pictures.

### 3.7 Production: the control room

Today (`v3-production-en-desktop.png`) the page is five stacked text sections. It includes a reliability table of
em-dashes and "0 of 0 first runs", which is still a dashboard tell.

```
Production
3 waiting for you · 2 in production · Image engine drawing "Layla", 2 queued
Needs you 3                                                  ← cards, 2-up ≥1280
┌ the thing to approve, inline ──────────┐  Story of "The Kite" — Episode 4
│ script excerpt / 16:9 cut / 2:3 figure  │  Story Development handed it over · 12 min ago
└─────────────────────────────────────────┘  [ Approve ] [ Request changes ] [ Open ]
On the floor                                                  ← one row per production in flight
 The Kite · Short   ▰▰▰▰▰▱▱▱  Produce · shot 7 of 20 · drawing · 4 min      [Open]
Engine room                                                   ← one line, words + dots
 Images ● Ready · Video ● Busy (1) · Voice ● Ready · Story ● Ready
Activity   [ All | Running | Failed ]                         ← compact density table
▸ Reliability                                                  ← disclosed; appears only after ≥ 1 run
```
- **Signature: the content to approve is on the card.** UX-STRATEGY A11 found it only inside the tab.
- *Request changes* opens an inline note, not `window.prompt`. It keeps its text if the card closes (3.3.7).
- **Empty.** "Nothing in production." *Start a production*. Then the 8-stage pipeline drawn once as a labelled strip
  ("How a production moves"). No zeros, no table.

### 3.8 Screening Room

- **It returns to the primary navigation** (§2.7).
- **"Now screening" theatre.**
  - The latest cut fills the content width at its native ratio. A 9:16 cut is centred with achromatic pillars.
  - The surround is `#000`. There is no art tint.
  - **Lights down:** while playing, after 2 s idle, the sidebar and header fade to 15 % opacity. They return on
    pointer move or keyboard focus, and focus stays visible. Under reduced motion the change is instant.
- **Under the theatre.**
  - A metadata line: "Short · 6:12 · cut v4 · 2 days ago · ● Approved".
  - Actions: *Download ▾* (a deliverables list: format · resolution · subtitles · size), *Open in production*,
    *Compare with v3*.
- **Notes** (Frame.io, per PRODUCT-DESIGN §8).
  - Timecoded notes appear as ticks on the seek bar.
  - N adds a note at the playhead when the player has focus.
  - The notes list sits beside the theatre at ≥ 1440, otherwise below it.
- **Programme.**
  - Every cut as 16:9 cards, filtered by Shows · Shorts · Music videos.
  - Each card: runtime chip, title, kind, version, date, and the SAMPLE mark (kept).
- **Captions** are on by default when the cut has subtitles (1.2.2). The player already supports `<track>`, a captions
  toggle, frame steps and fullscreen (`VideoPlayer.tsx`).
- **Empty.** A dark 16:9 frame: "Nothing to screen yet. A cut appears here when Post-Production assembles it." *Open
  Production*.

### 3.9 Settings

- **Implement v3 §9.8, which has not landed yet.** On 2026-10-03 the page was still a centred column, and engine rows
  still read "local MiniMax H3 in ComfyUI 0.38.1 on cuda:0 NVIDIA GeForce RTX 5090 : cudaMallocAsync".
- **Layout.** Start-aligned. At ≥ 1024, two panes:
  - a sticky local nav: Interface · New projects · Engines · Models · Access · Sample data
  - content at a 720 px measure
- **Interface section:**
  - language
  - reduce motion (exists)
  - contrast (Standard / More)
  - editing density (Comfortable / Compact)
  - header previews (on / off)
  - keyboard shortcuts (on / off, 2.1.4)
- **Engines and Models.**
  - Each row: plain name, then a dot plus a state word, then one capability line ("Draws characters and
    locations").
  - The raw string, path and hash sit behind *Details* in `.mono .break-all`.
- **Danger zone** at the end, with confirm dialogs.

### 3.10 Production controls placement: the rule across pages

- **Browse pages** (Show, Short, Music Video and Location detail) have exactly **one** production entry: the hero
  primary "Continue <next step>". A status strip appears only when something waits for the producer.
- **Generation, redraw and approval** happen in edit contexts (the workspace or the Production page), next to the
  content they change. They never sit in a hero.
- **Character and Location** keep their few contextual actions (*Approve*, *Redraw*, *Add lighting*) in a quiet
  toolbar under the image. They are disabled with a visible reason when locked.

---

## 4. Verdict on design system v3

### 4.1 Keep (validated by this research)

| # | v3 decision | Validated by |
|---|---|---|
| 1 | Warm, low-chroma neutral ladder; measured contrast table (§3.2, §3.4) | Linear 2026 "warmer grays"; HIG 4.5:1 and 7:1 targets (v3's body text is 13.6:1) |
| 2 | **Ivory primary**, one per region | Apple TV's light pill CTA; YouTube Music's light Play pill |
| 3 | One accent with four jobs; semantic-only status colours | Dribbble "Dark Mode Video Editor" (one accent for selection and playhead); M3 role discipline |
| 4 | No glows or halos; only two gradients | HIG Materials ("sparingly"); the directive |
| 5 | No uppercase or tracking hierarchy; bilingual sizes; tabular numerals | HIG ("avoid light weights", minimise typefaces); RTL needs |
| 6 | Honest placeholders; notice anatomy; real job phases; no fake percentages | NN/g progress indicators (UX-STRATEGY) |
| 7 | Company constellation with inspector, roving focus, list view, throttled `aria-live` | It renders well (`v3-studio-en-desktop.png`); it is the app's most distinctive page |
| 8 | Motion tokens; loops only for live work; reduced-motion mode | HIG Motion; M3 durations (v3's 120/200/320/480 sit inside M3's short and medium bands) |
| 9 | 2 px focus ring at 2 px offset | Meets 2.4.13 (AAA) on the ground: iris 8.3:1 |
| 10 | `--line-field` ≥ 3:1 for control boundaries | WCAG 1.4.11 |
| 11 | Voice identity panel with A/B compare | Generalise it to every version stack (§2.8) |

### 4.2 What is generic, and why the result still reads "well-made SaaS" rather than "cinematic"

1. **Furniture first, media absent.** v3 specifies buttons, fields, segmented controls, tabs, notices and dialogs in
   detail. It specifies no hero, rail, tiles by ratio, episode card, track or section row, cast face row, theatre or
   compact player, sticky compact header or metadata line. `.hero-backdrop` exists in CSS, but not in the spec. As a
   result, Studio, Production, Department, Settings and the empty catalogues are all text on near-black with one
   rhythm.
2. **One template for every catalogue.** `/shows`, `/shorts`, `/music-videos` and `/locations` render the same page:
   PageHeader, then "No X yet.", then a hint that **repeats the lead word for word**, then "+ Add X". This is exactly
   the "copies" the directive rules out. The D1 fix reached Characters only.
3. **Bordered panels by default.** A 1 px `--line` border with a 12 px radius is used for the company stage, the
   inspector, the creation panel, the voice panel and the settings groups. That is the commonest dark-dashboard
   signature (Linear: "Structure should be felt not seen").
4. **Anonymous type.** Inter at 14 px with medium-weight 30 px titles is competent, but nothing typographic says film.
5. **The saturated violet gradient app tile** is the loudest object on every screen.
6. **Glass on content.** `backdrop-filter` is used in `.badge-glass`, `.mark`, `.play-on-art` and the storyboard card
   tools. This contradicts HIG "Don't use Liquid Glass in the content layer", costs GPU on a machine that is also
   generating, and is one of the effects the directive excludes.
7. **One density** for browsing and for editing.

### 4.3 Change (concrete)

| # | v3 now | Change to | Why |
|---|---|---|---|
| C1 | §7 and §6: character and reference views at 4:5, `object-position 50% 18%` | Character = **2:3 full-body** (contract v2). Add a **1:1 face circle** from a stored `faceBox` for cast rows, pickers and lyric chips. Retire 4:5. | The contract supersedes; the directory already renders full bodies |
| C2 | §11 mirrors "the seek fill and ←/→ seeking"; §6 audio player seek "mirrored in RTL" | Seek, waveform, timeline, timecode and transport **stay LTR** (`dir="ltr"` group with an Arabic label). Job progress bars mirror. | Material 3 Bidirectionality |
| C3 | §5: one 1280 column; detail pages always 8 + 4 | Pane rules per M3 breakpoint (§2.5). Browse heroes and rails may go full-bleed. Edit uses the full width. | M3 Breakpoints; streaming heroes |
| C4 | §6 `.panel` = `--surface` plus a 1 px `--line` border | **Tone only** by default. Borders only on controls (`--line-field`), overlays (`--shadow-3`) and selected tiles. The company stage is a borderless `--sunken` band. | Linear 2026; Spectrum layers |
| C5 | Blurred chips: `.badge-glass`, `.mark`, `.play-on-art` | Solid `rgba(7,7,6,.78)` chips, no blur. Translucency only for a floating transport over video. | HIG Materials |
| C6 | §3.2: warm ladder for every surface | Add an achromatic `--canvas` (#0b0b0b) and `--surround` (#000) for viewers. Warm stays for chrome. | Grading-room surround |
| C7 | §3.3: the "hero backdrop fade" gradient is neutral | The hero fade takes the clamped **art tint** (§2.2), in browse only. Add `--art-placeholder` for loading. | Netflix, Spotify, Apple Music; calmer loading |
| C8 | §4: "One family per script: no serif display" | A **title voice** for content names only, chosen by the §2.3 spike (A / B / C). Add the hero tier 64/64 (Latin) and 52/72 (Arabic). | "Visually distinctive"; Apple TV scale contrast |
| C9 | §5: a single density | `data-density="comfortable \| compact"`, with compact as the default in edit contexts (§2.5) | Long editing sessions; Resolve, Figma |
| C10 | §6 focus: "white on pictures and video" | A **two-colour ring** (2 px ivory inside, 2 px #000 outside) on any control over imagery. A white ring alone fails 3:1 on the near-white character backdrops. | WCAG 2.4.13 Understanding ("two-color focus indicator") |
| C11 | `--r-media 8` everywhere | Keep 8 for browse imagery. Use **≤ 2 px** for clips, strip frames and compare takes in edit. | Premiere 25 feedback |
| C12 | §6 nav: sidebar text `--fg-muted` | One step dimmer for idle items (`--fg-faint` icons, muted text at 90 % opacity). The current item stays `--fg`. Collapse to a 64 px rail in edit. | Linear 2026; Figma "Minimize UI" |
| C13 | Brand tile in the sidebar | A monochrome ivory glyph in-product. The colour mark only for the favicon and splash. | Accent restraint |
| C14 | §6 Empty: generic sentence | Page-specific compositions (§3) plus the lint rule "the hint must not repeat the lead" | The observed copies |
| C15 | §9.8 Settings (unimplemented) | Ship it as §3.9 specifies | Still centred, with raw strings, on 2026-10-03 |

### 4.4 Add (missing from v3)

1. **Hero component, 6 variants:** backdrop (Show), diptych (Short), sleeve (Music Video), figure (Character), plate
   (Location), theatre (Screening). Each needs focal-point crops, the scrim rule, the phone stacking rule (text below
   art) and the RTL mirror.
2. **Tiles by ratio:**
   - `KeyArtTile` 16:9
   - `PosterTile` 2:3
   - `SleeveTile` 1:1
   - `FigureTile` 2:3
   - `PlateTile` 16:9
   - `EpisodeCard`
   - `SectionRow` (the track row)
   - `CastFace` (circle, with name, role and "in N episodes")
3. **Rail.**
   - Visible prev and next buttons (2.5.7, carousels).
   - `scroll-snap`.
   - A partly visible next item instead of an edge-fade gradient.
   - ←/→ moves within the focused rail; Tab leaves it.
   - Mirrored in RTL.
   - Height reserved while loading.
4. **Metadata line** component with a fixed order (§2.3).
5. **Sticky compact header,** triggered by an `IntersectionObserver` on the hero.
6. **Player family.**
   - `TheatrePlayer`, `InlinePlayer`, `CompactPlayerBar`, `CompareAB`, `SongVideoSwitch`.
   - One keyboard map and note ticks.
   - Native-ratio letterboxing on `--canvas` or `--surround`.
   - Captions on by default when present.
7. **Edit-context kit.**
   - A contextual `Inspector`.
   - Docked resizable panels with collapse buttons and "Reset layout".
   - Focus mode.
   - A filmstrip and dual-scale strip.
   - `VersionStack`.
8. **Command palette** (Ctrl/⌘K), the **shortcut sheet** (`?`) and one **Help** location (sidebar footer).
9. **Anchor nav** for one-page profiles.
10. **Art ambience and placeholder pipeline:** extract once at ingest; store `dominant`, `focal` and `faceBox` on the
    asset.
11. **Presentation of light-backed images** (`lightBackdrop` flag → brightness 0.9) and the backdrop experiment
    (§2.4).
12. **Preferences:** Contrast (Standard / More, plus `prefers-contrast`), Density, Header previews, Single-key
    shortcuts.
13. **Document titles per route:** "Amina · Characters · Vewbox Studio". Today every route is "Vewbox Studio" (2.4.2).
14. **Capture coverage.** Extend `scripts/capture-evidence.mjs` to Shows, Shorts, Music Videos, Locations and the
    Screening Room, with seeded content (EN/AR × desktop/phone). Today there is no evidence for these pages at all.

---

## 5. WCAG 2.2 requirements checklist (target: AA; AAA where noted as a goal)

Status is as observed on 2026-10-03, from code and rendered pages:
- **OK**: meets the criterion.
- **Risk**: not verified, or likely to fail.
- **Fail**: observed failing.
- **New**: applies to a component this document proposes.

### 5.1 New in 2.2

| SC | Level | Where it bites in Vewbox | Requirement for the redesign | Status |
|---|---|---|---|---|
| 2.4.11 Focus Not Obscured (Minimum) | AA | Sticky mobile bar (56); sticky tabs; sticky form footer (56); proposed sticky compact header (48) and compact player bar; toasts; drawers and the inspector | Set `html { scroll-padding-block-start: <sum of sticky top bars>; scroll-padding-block-end: <bottom bars + 16px> }`, updated per breakpoint. Toasts must never cover the focused element (end-bottom placement; move up when a bottom bar exists). Non-modal drawers must not cover the focus origin. | **Risk.** Only inputs have `scroll-margin-block-end: 72px`; no `scroll-padding` exists in `globals.css`. |
| 2.4.12 Focus Not Obscured (Enhanced) | AAA goal | Same | Fully visible: the same rules with margin | Goal |
| 2.4.13 Focus Appearance | AAA goal | Every control; controls over images and video | 2 px solid ring at 2 px offset, ≥ 3:1 change (iris on the ground is 8.3:1). Two-colour ring over imagery (C10). Field focus = accent border + 1 px inset at the outer edge, which meets the area rule. | OK on the ground; **Risk** over light images |
| 2.5.7 Dragging Movements | AA | Storyboard shot reorder; seek bars and waveforms; resizable panels (new); future timeline trims; file drop zones; lyric singer assignment | Every drag has a single-pointer alternative: Move up/down (exists in the shot menu); click-to-seek on tracks and waveforms; collapse/expand buttons and "Reset layout" for panels; numeric nudge buttons for trims; *Browse* beside every drop zone (exists); assignment by menu. A keyboard alternative alone is not enough. | Reorder **OK** (`StoryboardTab.tsx` menu); panels and trims **New** |
| 2.5.8 Target Size (Minimum) | AA | Icon buttons, chips with ×, rail arrows, lyric singer chips, card tools, player buttons | ≥ 24×24 CSS px, or the 24 px spacing test. Existing `.btn-xs` and icon buttons are 28 px; `.vbtn` is 2.25rem, about 31.5 px on the 14 px root; coarse pointers grow to 36–48. Keep v3's goal of ≥ 40 on desktop and ≥ 44 on touch. Slider = one target. | **OK** for current kit; check chips and new rails |
| 3.2.6 Consistent Help | A | "How this department works", the shortcut sheet, any docs link | Put "Help & shortcuts" at the same place on every page (sidebar footer; the same position in the mobile menu). Page-specific explanations may stay in place in addition. | **New** |
| 3.3.7 Redundant Entry | A | Character creation methods; "Write it myself" after an Auto failure; retry notes; *Request changes*; production settings; voice preview lines | Carry the brief, name and settings across methods and retries. Keep inputs after a failure (UX-STRATEGY D1.4). Prefill the previous "What changed?" note. Remember the preview line per character. Default For / Style / Language from context. | Partial (v3 defaults exist) |
| 3.3.8 Accessible Authentication (Minimum) | AA | `STUDIO_PASSWORD` (HTTP Basic, `src/proxy.ts`) | The browser's own dialog is a user-agent control, and paste and password managers work there. If a custom sign-in page is ever built: `autocomplete="username"` and `"current-password"`, allow paste, a show-password toggle, no CAPTCHA or puzzle. | **OK** today |
| 3.3.9 Accessible Authentication (Enhanced) | AAA goal | Same | No object or image recognition steps | OK |
| 4.1.1 Parsing | removed | — | No action. Keep ARIA valid, since 4.1.2 still applies. | — |

### 5.2 Carried from 2.0 and 2.1: the ones this product stresses

| SC | Level | Requirement in Vewbox | Status |
|---|---|---|---|
| 1.1.1 Non-text content | A | Generated images get alt text built from the identity line ("Amina, full body: olive T-shirt, denim dungarees…"). Art tint and scrims are `aria-hidden`. | Risk; verify alt sources |
| 1.2.1 Audio-only | A | Every voice sample shows its spoken line as text (the "Heard" transcript, or the line). | Mostly OK (line shown in the voice panel) |
| 1.2.2 Captions (prerecorded) | A | Screening Room and workspace players load the cut's subtitle track as `<track>`, on by default when present. | Player supports it; wiring is **Risk** |
| 1.3.1 Info and relationships | A | Activity, reliability and section lists are real tables or lists, with headings per section. | Risk |
| 1.4.1 Use of colour | A | State = dot plus word (v3); edges also use dash patterns and marks (v3). | OK |
| 1.4.2 Audio control | A | Nothing plays sound automatically; header previews are muted. | OK; **New** previews must comply |
| 1.4.3 Contrast (minimum) | AA | The v3 table, plus text over art tint and scrims at ≥ 4.5:1, measured on the *lightest* art (white character backdrops). | OK on chrome; **Risk** on art |
| 1.4.10 Reflow | AA | Usable at 320 CSS px: company spine (v3), tables restack, rails scroll, no two-axis scrolling except media strips. | Risk |
| 1.4.11 Non-text contrast | AA | Field boundaries (v3), clip boundaries, waveform played vs unplayed, selected tiles, edges, focus: all ≥ 3:1. | OK for v3 tokens; **New** for edit kit |
| 1.4.12 Text spacing | AA | No fixed-height text boxes (chips, metadata). Arabic line heights per v3. | Risk |
| 1.4.13 Content on hover or focus | AA | Hover-revealed play and More on tiles also appear on focus, persist, and dismiss with Esc. Always visible on touch (v3). | Partial |
| 2.1.1 Keyboard / 2.1.2 No keyboard trap | A | Roving focus in the stage, rails, tabs and segmented controls; Esc leaves fullscreen, dialogs and focus mode. | OK in v3 spec; verify new parts |
| 2.1.4 Character key shortcuts | A | J/K/L, N, 1/2, F and `?` are active only while the relevant component has focus, or can be turned off in Settings. | **New** |
| 2.2.1 Timing adjustable | A | Toasts with an action (Undo) stay ≥ 10 s and do not vanish while hovered or focused; the same action is also available elsewhere. | Risk |
| 2.2.2 Pause, stop, hide | A | Header previews longer than 5 s show a pause control; breathing live dots stop with Reduce motion; the travelling handoff light runs once in 1.2 s (fine). | OK; **New** previews |
| 2.3.1 Three flashes | A | The UI never flashes. Optional: QA checks generated cuts for flashing before export (a photosensitivity check on deliverables). | Suggestion |
| 2.4.2 Page titled | A | A distinct `<title>` per route. | **Fail.** `/shows`, `/music-videos`, `/locations`, `/settings` and others are all titled "Vewbox Studio" |
| 2.4.3 Focus order / 2.4.7 Focus visible | A / AA | DOM order matches visual order in mirrored layouts; the ring is never removed (v3). | OK |
| 2.5.3 Label in name | A | Visible labels are contained in accessible names ("Approve", not "Confirm stage"). | Risk |
| 3.1.2 Language of parts | AA | `lang="ar"` or `lang="en"` on names and content in the other language (`dir="auto"` is not enough). | **Risk** |
| 3.2.3 / 3.2.4 Consistent navigation and identification | AA | The same sidebar order everywhere; the same action names on every page (e.g. always "Approve", never "Accept"). | OK |
| 3.3.1 / 3.3.3 Error identification and suggestion | A / AA | v3 notice anatomy; field errors linked with `aria-describedby`; coded recovery actions. | OK in spec |
| 4.1.2 Name, role, value | A | Icon-only buttons have translated names; tiles expose the selected state; the Song / Video switch is a radiogroup. | Partial |
| 4.1.3 Status messages | AA | Job phases, handoffs and "Saved" through polite live regions, throttled (v3). Toasts are `role=status`. | OK in spec |

**Verification for each page in the redesign:**
- axe-core in `scripts/capture-evidence.mjs`
- a keyboard-only pass, including RTL
- 320 px reflow
- a 200 % zoom pass
- a screen-reader pass (NVDA on Windows) for the company stage, the players and character creation
- a contrast spot-check of text on the lightest and darkest artwork

---

## Sources

All read 2026-10-03 unless marked. Article dates are in brackets.

**Streaming and media**
1. Netflix title page: https://www.netflix.com/title/80057281 (served as https://www.netflix.com/iq-en/title/80057281)
2. Disney+ entity page (sign-up wall): https://www.disneyplus.com/browse/entity-2e6ee01d-5be2-4451-81a3-db3d061ef4dc
3. 9to5Mac, Disney+ redesign [2025-10-02]: https://9to5mac.com/2025/10/02/disney-reveals-app-redesign-coming-soon-to-ios-and-tvos/
4. AlternativeTo, Disney+ redesigned app [2026-09-11]: https://alternativeto.net/news/2026/9/disney-unveils-redesigned-app-with-modern-homepage/
5. Apple TV, Severance: https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx
6. IMDb, Severance: https://www.imdb.com/title/tt11280740/

**Music**
7. Spotify album: https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv
8. Spotify artist: https://open.spotify.com/artist/0k17h0D3J5VfsdmQ1iZtE9
9. Apple Music album: https://music.apple.com/us/album/the-dark-side-of-the-moon/1065973699
10. Apple Music music video: https://music.apple.com/us/music-video/money/1509336177
11. YouTube Music search: https://music.youtube.com/search?q=pink+floyd+money
12. 9to5Google, YouTube Music Now Playing, Abner Li [2025-12-20]: https://9to5google.com/2025/12/20/youtube-music-2025-now-playing-redesign/

**Professional tools**
13. Adobe Spectrum, Background layers: https://spectrum.adobe.com/foundations/color/background-layers
14. Adobe, Introducing Spectrum 2: https://adobe.design/ideas/introducing-spectrum-2
15. Photutorial, Premiere Pro UI reception [2025-01-28]: https://photutorial.com/the-new-premiere-pro-ui-has-users-divided-is-adobes-friendly-design-going-too-far
16. DaVinci Resolve Edit page: https://www.blackmagicdesign.com/products/davinciresolve/edit
17. DaVinci Resolve Cut page: https://www.blackmagicdesign.com/products/davinciresolve/cut
18. Figma, Our approach to designing UI3 [2024-10-01]: https://www.figma.com/blog/our-approach-to-designing-ui3/
19. Linear, Behind the latest design refresh [2026-03-12]: https://linear.app/now/behind-the-latest-design-refresh
20. Linear changelog, UI refresh [2026-03-12]: https://linear.app/changelog/2026-03-12-ui-refresh

**Galleries**
21. Awwwards Film & TV: https://www.awwwards.com/websites/film-tv/
22. Awwwards, Tamás Olajos [nominee 2026-08-28]: https://www.awwwards.com/sites/tamas-olajos-ai-filmmaker
23. Awwwards, In Development Studios [nominee 2026-09-15]: https://www.awwwards.com/sites/in-development-studios
24. Awwwards, Jealous Films [nominee 2026-09-19]: https://www.awwwards.com/sites/jealous-films
25. Recent.design (godly.website redirect): https://recent.design/?ref=godly
26. Behance search, streaming platform UI (past month): https://www.behance.net/search/projects/streaming%20platform%20ui?sort=recommended&time=month
27. Dribbble, Sana Javanshir, "Dark Mode Video Editor UI": https://dribbble.com/shots/26272194-Dark-Mode-Video-Editor-UI
28. Dribbble, Nixtio, "AI Video Editor Platform UI Design": https://dribbble.com/shots/26280112-AI-Video-Editor-Platform-UI-Design

**Guidelines**
29. Apple HIG, Dark Mode: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/dark-mode.json (page: https://developer.apple.com/design/human-interface-guidelines/dark-mode)
30. Apple HIG, Materials: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/materials.json
31. Apple HIG, Motion: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/motion.json
32. Apple HIG, Playing video: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/playing-video.json
33. Apple HIG, Typography: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/typography.json
34. Material 3, Color roles: https://m3.material.io/styles/color/roles
35. Material 3, Easing and duration: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
36. Material 3, Breakpoints: https://m3.material.io/foundations/layout/breakpoints/overview
37. Material 3, Bidirectionality & RTL: https://m3.material.io/foundations/layout/bidirectionality-rtl

**WCAG 2.2**
38. What's New in WCAG 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
39. Understanding 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
40. Understanding 2.4.11 Focus Not Obscured (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
41. Understanding 2.4.13 Focus Appearance: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
42. Understanding 2.5.7 Dragging Movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
43. Understanding 3.3.8 Accessible Authentication (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html

**Supplementary**
44. ProVideo Coalition, The color grading environment, Steve Hullfish [2013-06-07]: https://www.provideocoalition.com/the-color-grading-environment-and-ideal-lume-bias-lights/
45. NN/g, Dark Mode vs. Light Mode, Raluca Budiu [2020-02-02]: https://www.nngroup.com/articles/dark-mode/
46. Thmanyah font announcement (search result only; page returned 404): https://ask.thmanyah.com/hc/en-001/articles/45993930027281-Thmanyah-Font-for-Everyone

**Tried and not usable:**
- Mobbin screens (403).
- Behance project pages: images did not load; fetch returned 403.
- TechRadar and Tom's Guide Disney+ articles: content truncated.
- Adobe HelpX Premiere "What's new" (403).
- Netflix Studios calibration guidelines: a redirect chain to a partner portal; not followed.
