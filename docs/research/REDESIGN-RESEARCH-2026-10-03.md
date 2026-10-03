# Redesign research: references, page patterns and a bilingual type direction (2026-10-03)

Status: research input for the redesign phase (`docs/REDESIGN-2026-10-03.md`) · written 2026-10-03 · product research.
Extends and corrects `docs/research/DESIGN-RESEARCH-2026-10.md` (called "the earlier study" below). Reads with
`docs/DESIGN-SYSTEM-V4.md` §0–§1 ("Lights Down"), §3 (typography) and §7.1 (navigation).

Scope: principles, measurements and page patterns for an original Vewbox design. No layout, logo, artwork, palette or
copy from any reference may be reused. Every "learn" line below is our translation for Vewbox; every "do not copy"
line names what stays with its owner.

---

## How this was researched

- **Date.** Everything was looked at on **2026-10-03**. Article and page dates are given where the source shows one.
- **Browser.** The built-in Chromium pane, in a tab of my own, logged out, from this machine (Iraq region).
  - Viewport emulated at **1440×900**. The page content is 1425 px wide because of a 15 px scrollbar, so
    "full-bleed" below means 1425 px.
  - Phone checks at **390×844**.
- **How measurements were taken.** In the page, through the pane's JavaScript console:
  - `getComputedStyle()` for font family, size, line height, weight, letter spacing, text transform and colour;
  - `getBoundingClientRect()` for x, y, width and height;
  - for timing, the computed opacity of the hero titles was polled every 100 ms for 13 s.

  Values are CSS px at that viewport. Nothing is estimated from a screenshot unless it says "(from the screenshot)".
- **Fetched sources.** WebFetch and WebSearch for documentation, standards, articles, and the Google Fonts
  `METADATA.pb` files on GitHub (licence, designers, subsets, axes). A WebSearch *summary* is labelled as such.
- **Labels used in this document.**
  - **Seen**: observed or measured in the page.
  - **Read**: taken from a fetched document.
  - **Inference**: my conclusion, not a fact about the source.
- **Consent and interaction.**
  - Non-essential cookies were rejected where a reject button existed (Disney+, IMG Models).
  - Spotify and Framer offer no reject option, so their banners were left untouched and nothing was accepted.
  - A24's newsletter pop-up was closed with its × button. Nothing was typed or submitted anywhere.
  - The only clicks other than navigation:
    - close buttons and "Reject All"
    - A24's menu toggle
    - a territory option in IMG Models' directory filter (a filter, no personal data)
    - the device-quality button on one gallery site (no data)
  - No sign-in, no account, no terms accepted.
- **Copyright.** Screenshots were viewed in the session only and none was saved to the repository. No artwork, logo or
  layout is reproduced here: only descriptions, measurements and UI label names.
- **Local inputs (read only).**
  - The earlier study, v4 §0–§1, §3 and §7.1, and the redesign phase record.
  - `src/components/shell/nav-model.ts` (today's navigation).
  - `src/server/org/model.ts`: `PIPELINE`, `DEPARTMENTS`, `ORG_VERSION = 11`.
  - The running app was **not** opened, because this assignment forbids touching it.
- **Not accessible today:**
  - Disney+ title and article pages: the Iraq onboarding wall again.
  - Mobbin: "403 FORBIDDEN · This request was blocked" for both `/discover/apps/web/latest` and `/pricing`. Its library
    needs an account in any case. I did not sign in.
  - Behance project images: only flat colour blocks rendered.
  - Lyrics on Spotify (sign-in needed) and Apple Music (subscription needed).
  - Apple TV's home page: a sign-up modal.
  - Every logged-in product UI: Linear, Figma, the Framer editor, Frame.io.
  - These pages failed to load:
    - the Frame.io V4 blog article (504)
    - Tom's Guide on Disney+ (truncated)
    - WhatsOnDisneyPlus (429)
    - Thmanyah's licence page (522)
    - Figma's UI3 help article (404)

---

## 0. The conclusions on one page

Fifteen decisions for the creative director. Each one names its evidence.

1. **Typography is the identity, and it comes from the setting, not the face.**
   - A24 builds an unmistakable identity from one grotesk family in essentially three sizes: 74, 38 and 15 px. The
     large sizes are set at line height 0.92 and tracking −0.04em, weight 500, on images with no corner radius.
   - Linear (64/15) and Framer (54/14) use the same contrast band.
   - **Decision:**
     - Keep v4's 64 px hero, but set Latin titles tighter: line height 0.92–1.0, tracking −0.03 to −0.04em, weight
       500–560.
     - Add a 120 px *index* size for typographic catalogue lists.
     - Get distinctiveness from scale, spacing and editing, never from ornament.

   Evidence: §1.1, §1.9, §1.11, §2.1.
2. **People are set as type: credits are a page section.**
   - A24 sets directors and cast at 38 px under a 15 px label.
   - IMDb's full credits group people by department, with a count and a year range per person ("11 episodes •
     2022–2025").
   - **Decision.** Every production gets a **Credits** section:
     - *Cast* lists characters with "in 6 episodes".
     - *Crew* lists the Studio Company's departments and agents with what each made ("Pre-Production · 20 frames").
   - Credits are the bridge between production pages and the organisation page.

   Evidence: §1.1, §1.5, §3.7.
3. **A Home exists, and it is about work, not statistics.**
   - Today `/` redirects to `/shows` (`nav-model.ts`, `HOME = '/shows'`).
   - Figma's home is Recents. Notion's Home is recents plus upcoming items plus agents. Disney+ "For You" is continue
     watching plus new.
   - **Decision.** Home has:
     - **Continue**: the next step of each production, shown as stills with a verb.
     - **Needs you**: decisions, each with the content inline.
     - **Recent**: productions in their own shapes.
     - **Cast**: a line-up strip.
     - one **New** entry.
   - Empty, Home shows three title cards in the three production shapes. Never KPI tiles or zeros.

   Evidence: §1.10, §1.14, §3.1.
4. **Navigation: five primary destinations and four secondary ones, plus Home.**
   - Primary: Shows · Shorts · Music Videos · Characters · Studio Company.
   - Secondary, set smaller and dimmer: Locations · Production (with its needs-you count) · Screening Room · Settings.
   - Today's three equal groups (`nav-model.ts`) go.
   - Few primary items, each a real destination, is what A24 (7 menu items), Framer (5 views) and YouTube Music (3) do.

   Evidence: §1.1, §1.8, §1.11, §3.0.
5. **Music Videos are songs first.**
   - Spotify has a page per *song*. Its header carries the kind ("Song"), the title, and a slate: artist · album ·
     year · duration. **Lyrics** follow the header directly, then the artist, then more music.
   - Apple Music and YouTube Music keep videos as *one shelf* inside an artist's music, in 16:9 (YouTube Music: albums
     144×144, videos 256×144).
   - **Decision:**
     - The catalogue is a discography: sleeves and track rows, not a poster wall.
     - The page starts from the song: sleeve, performers, lyrics, sections.
     - The video is one rendering of that song (Song ⇄ Video).

   Evidence: §1.6–§1.8, §3.4.
6. **The casting directory is a line-up with names only.**
   - IMG Models shows identical 3:4 frames (244×328), 30 px gutters, 5 per row, and *only the name* under each.
     Filtering is a separate, deliberate step.
   - Apple TV's person page: a portrait circle, the name, one paragraph, and shelves of the person's work.
   - **Decision.** Identical 928:1664 figures on one backdrop with the name only beneath. A status appears only when it
     needs the producer. Filters live in one sheet whose state is kept in the URL.

   Evidence: §1.2, §1.15, §3.5.
7. **The organisation is drawn from data, without decoration.**
   - Dribbble's top results for "AI agents org chart" are glowing KPI dashboards with donut charts. That is the failure
     mode.
   - Linear's Agent Interaction Guidelines say:
     - an agent always identifies itself as an agent
     - it shows its state: thinking, waiting for input, executing or finished
     - it stops when asked
     - a human stays accountable
   - **Decision:**
     - The Studio Orchestrator sits at the centre, with the eight departments on a ring in pipeline order.
     - Edges come only from `PIPELINE` handoffs and cross-stage dependencies: nine real relations (§3.7).
     - The producer sits outside the ring at the two human gates.
     - State is shown in words. No glow and no particles.

   Evidence: §1.9, §1.16, §3.7.
8. **Agents present choices side by side; the producer chooses.**
   - Framer's homepage shows an agent laying out several layout explorations next to each other, with its progress as
     short log lines in a side panel.
   - DaVinci Resolve 21 adds take tags (Good Take / Rejected) and star ratings to the media pool.
   - **Decision:**
     - Creation flows and takes show 2–4 candidates in a row, each with one "Use this" action.
     - Takes carry the words *Good take* and *Rejected*. No stars.

   Evidence: §1.11, §1.13, §3.8, §3.11.
9. **Review means versions plus notes anchored to time.**
   - Frame.io stacks versions under one item and compares two versions side by side with synchronised playback. A note
     can be left on either version, and the audio can be switched between them.
   - Netflix keeps player controls visible over its inset hero.
   - **Decision:** the Screening Room has a version picker in the title row, synchronised A/B compare, notes anchored to
     timecode, and an always-visible transport.

   Evidence: §1.3, §1.12, §3.9.
10. **Art-direct per breakpoint; do not only crop.**
    - A24 serves the same film hero as a 16×9 still on desktop and as a separate 8×10 asset on a phone ("…Running
      8x10", rendered 676×845 at 390 px).
    - **Decision:** store a portrait crop (focal point plus a 4:5 or 9:16 frame) for every hero still. Phone heroes use
      it instead of a squeezed 16:9.

    Evidence: §1.1.
11. **Small cards, big art, a visible next item.**
    - Apple TV's episode rail: 253×195 cards, a 22 px gap and 40 px page margins, five full cards plus part of a sixth.
    - Posters are 149×223 and cast circles 117 px.
    - **Decision:** keep v4's rail, and use these values as the measured baseline (§2.3).

    Evidence: §1.2.
12. **Do not copy the one habit every premium reference shares: small uppercase labels.**
    - A24, IMG Models, Velour, Apple TV ("EPISODE 1" at 10 px) and Linear's mono eyebrow all use small capitals.
    - Arabic has no case. Apple's RTL guidance notes that Arabic reads smaller than Latin set in capitals at the same
      size.
    - **Decision.** Keep v3/v4's "no uppercase hierarchy". The label register comes from a mono for numbers and from
      muted colour.

    Evidence: §1.1, §1.17, §4.4.
13. **Pair the display voice with a mono for numbers.**
    - A24 pairs NB International with NB International Mono, which it uses for years.
    - Linear pairs Inter with Berkeley Mono, and Velour pairs its display face with a mono.
    - Framer loads Input Mono and JetBrains Mono beside Inter.
    - **Decision.** **IBM Plex Mono** (OFL), from the same superfamily as the bundled Plex Sans Arabic, for timecodes,
      durations, years and counts in slates. It is always LTR and never sets Arabic text.

    Evidence: §2.2, §4.3.
14. **The title-voice spike gets two new candidates and one new question.**
    - New candidates:
      - a **condensed "poster" pairing**: Instrument Sans (`wdth` 75–100) with Noto Sans Arabic (`wdth` 62.5–100), both
        OFL
      - a **Kufi pairing**: Kufam, or Noto Kufi Arabic with Inter Tight, all OFL
    - Both sit beside v4's T0–T3. T0 (Inter Display with Plex Arabic) remains the fallback.
    - Thmanyah is still unverified.
    - New question: **Arabic numerals.** W3C's Arabic layout requirements list Arabic-Indic digits as the norm in
      Eastern Arab regions, Iraq included. v4 uses Western digits everywhere. The producer should decide.

    Evidence: §1.17, §4.
15. **No hero advances by itself without a pause control.**
    - A24's home hero changes film about every 4.3 s (measured), and no pause control was found. That is a WCAG 2.2.2
      risk.
    - **Decision:**
      - Vewbox heroes never auto-advance.
      - If Home ever rotates a spotlight, it gets a visible pause.
      - Header previews keep v4's rules: muted, play once, with a visible pause.

    Evidence: §1.1, §1.17.

---

## 1. References

Each entry gives: what was looked at, what it does (seen or read, measured where possible), what to learn, and what
not to copy.

### 1.1 A24 (new; studied closely)

**Looked at**
- Pages:
  - https://a24films.com/ (home)
  - https://a24films.com/films (index)
  - https://a24films.com/films/marty-supreme (film)
  - https://a24films.com/television
  - https://a24films.com/television/beef (series)
- The film page again at 390×844.

**Seen: the identity in numbers**
- **Fonts.** One family, "NB International Web", loaded in weights 400, 500 and 700, plus "NB International Mono Web"
  400. A second family (akzidenz-grotesk) is declared but was not loaded on the pages visited.
- **Body text.** 15/25, letter spacing −0.075 px, black on a white page. Only heroes and film modules are dark.
- **Three sizes do almost everything:**

  | Size | Setting | Used for |
  |---|---|---|
  | 74 px | line height 68.08 (0.92), weight 500, letter spacing −2.96 px (−0.04em) | hero titles, home module titles, menu items, group headings ("Upcoming" is weight 400) |
  | 38 px | 38/38, weight 500, −1.14 px (−0.03em) | tile titles and credit *values* |
  | 15 px | weight 400 | body and labels; labels are uppercase, +0.075 px, grey #888 |

- **Years** follow the title as a mono superscript at 15 px (`<sup><time>2026</time></sup>`).
- **Images** have a computed `border-radius` of 0 everywhere measured.
- **Page titles** are distinct: "Films | A24", "Marty Supreme | A24", "Beef: S2 | A24".

**Seen: the home page (1440)**
- **Hero.** 900 px tall, the full viewport.
  - Five upcoming films stand in the 74 px voice at the bottom start (x 42), each followed by its mono year. Each title
    links to its film page.
  - Behind the list is a still of the current film.
  - **The current film changes by itself.** The index changed at 0.9 s, 5.1 s and 9.5 s, a period of about 4.3 s. The
    current title is shown at opacity 0.6 and the others at 1.
  - None of the page's buttons is a pause control. Their labels or class names were close-newsletter, close,
    burger mobile-nav-toggle, Close, Back, Filter, Clear, Apply, Cancel, Save, Reject All and Allow All. The last
    eight belong to the hidden cookie-preference dialog.
- **Then a stack of modules**, exactly 120 px apart (measured from consecutive y positions), inside a 1232 px column
  that starts at x 97.
  - **Shop and podcast modules** alternate the image between the two sides. Their 437 px text column reads: kind label
    (15 px uppercase) → title at 74 px → a text link ("SHOP NOW", 21 px, weight 500, uppercase) after a long arrow.
  - **Film modules** are full-bleed, 1437×720, with "WATCH NOW" and the title at 74 px over the still.
- The home page is 12,293 px tall. It reads like a magazine: one object per module, one title, one verb.

**Seen: the films index**
- **"Upcoming".**
  - Three columns of 427 px with 30 px gutters and 42 px outer margins.
  - Tiles mix shapes: 8×10 portraits (427×534) and 16:9 stills.
  - Under each tile: a status word ("COMING SOON", 15 px uppercase, #888), then the title at 38 px.
  - **On hover**, the image darkens and credits appear on it: "RELEASE DATE", "WRITTEN AND DIRECTED BY", "STARRING"
    (13 px uppercase, white at 54 %), each with its value.
- **"All Films".**
  - Sorting is two text labels, "NEWEST" and "A-Z".
  - Then a grid of the same tiles.
  - Then a **typographic index**: each title at **120/110.4, weight 500, −4.8 px (−0.04em)**, with its year in mono.
    Hovering a title shows a faint still of that film behind the list.

**Seen: the film page (Marty Supreme)**
- **Hero.** A 16:9 still, full-bleed (rendered 1425×801, visible to 677 px), with a thin outline play triangle at the
  centre and the title at 74 px at the bottom start.
- **Credits** on white, in a grid of three 431 px columns. Each credit is a label (15 px uppercase, #888) over a value
  (38/38, weight 500): DIRECTED BY · YEAR · WRITTEN BY · STARRING. The cast names fill three columns. A bordered
  "WATCH NOW ⌄" box ends the first row and opens a list of providers.
- **One hairline rule.** Then the synopsis at **27/35.9 in a 678 px column that starts at the second credit column**
  (x 497), a deliberate offset.
- **The rest.** The one-sheet poster (333×520) in the same column, then Share, then "RELATED PRODUCTS" (1:1, 422 px,
  three per row).
- **Total height 3,226 px.** No ratings, no reviews and no recommendation rails.

**Seen: television**
- The same template as films.
- **Seasons are separate pages** ("Beef: S2"). The site has no episode lists.
- On index tiles, the network replaces the status word: "PEACOCK", "PRIME VIDEO", "CHANNEL 4".

**Seen: the menu**
- The top start reads "MENU / FILMS", a breadcrumb.
- The menu opens a 500 px panel listing Films · Television · Docs · Shop · Membership · Notes · App, set at the 74 px
  size.

**Seen: the phone (390×844, film page)**
- The hero image is a **different asset**: its alt text is "Marty Supreme Running 8x10", rendered 676×845, instead of
  the desktop 16×9.
- Title 48/44.16, with the year below it at 13 px.
- Credit values 24/24. Synopsis 22/35 in 354 px.

**Learn**
- An identity made from **setting and editing**:
  - one family
  - three sizes
  - tight display tracking
  - zero radii
  - large fixed spacing (120 px)
  - one object per block
- **People are first-class type.** A credit value is 2.5× the body size.
- **The film page is short.** It answers what it is, who made it, what it is about and how to watch, and then stops.
- **The synopsis offset**, which starts on the second column, gives editorial rhythm with no decoration.
- **A typographic index** offers titles at display size as an alternative to a grid.
- **Status is a word next to the title**, never a badge on the art.
- **Art direction per breakpoint**: a separate portrait asset for phones.

**Do not copy**
- **The faces.** NB International is a commercial family (Neubau), and no Arabic companion was observed.
- **The uppercase labels.** They have no Arabic equivalent (§4.4).
- **The white ground.** Vewbox is dark.
- **The self-advancing hero with no pause control** (WCAG 2.2.2, §1.17).
- **Credits shown only on hover.** WCAG 1.4.13 needs focus parity, and touch has no hover.
- **The merchandise modules.**
- **The newsletter interstitial.** It reappeared on each page load in this session.
- *Inference:* marking the *current* film by dimming it to 0.6 is ambiguous, because dimming usually means "inactive".

### 1.2 Apple TV (re-measured; one correction to the earlier study)

**Looked at**
- Show: https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx
- Person: https://tv.apple.com/us/person/britt-lower/umc.cpc.e4ifmwyy5vk6akf0ugttqqow

**Seen**
- **Ground and text.**
  - The ground is #1f1f1f, rgb(31,31,31).
  - Text is white at 92 %, 70 % and 64 % alpha.
  - Type is the system stack: -apple-system, SF Pro.
- **The title is an image.** The hero shows the show's title treatment as a 216×36 picture (alt "Severance") at
  x 40. The `<h1>` (52/64, weight 700) is visually hidden, rendered at 1×1 px. **This corrects the earlier study**, which
  described "a large plain title" (§5.3).
- **Hero.** The key art is 1425×802, about 89 % of the viewport height.
- **Primary pill.** 40 px tall, radius 40, 15/600, dark text on a light fill.
- **Section headings** are only 17/22, weight 700: "Season 1 ⌄", "Trailers ›", "Bonus Content ›", "Related ›",
  "Cast & Crew ›", "How to Watch", "About", "Information", "Languages", "Accessibility".
- **Episode rail.**
  - Cards are 253×195 links with radius 14, and the image fills the card.
  - Text sits in a bottom scrim: "EPISODE 1" (10 px, weight 500, uppercase, white at 70 %), the title, a two-line
    synopsis, the runtime and a "…" menu.
  - Cards step 273 px, so the gap is 22 px. Five full cards are visible plus part of a sixth, inside a 40 px page
    margin.
- **Other shelves.**
  - Trailer images 251×163.
  - Related posters 149×223 (2:3).
  - **Cast circles 117 px**, with the actor's name at 13 px and the character's at 12 px and 64 %.
- **Scrolling.** The page scrolls an inner container (`.scrollable-page`); the document itself stays at viewport
  height.
- **The person page.**
  - A header band tinted by the portrait.
  - A **170 px circle**, the name at 34/40, weight 700, and **one paragraph** of biography.
  - Then shelves of the person's work: "Movies", "Shows" and "Guest Appearances", with 149×223 posters.
  - While loading, the posters were flat colour blocks.

**Learn**
- **The art is huge and the interface type is small** (10–17 px). The scale contrast is between art and text, not
  between two text sizes.
- **Reference information comes last** as definition lists (Information, Languages, Accessibility).
- **A person page** is a portrait, a name, one paragraph and that person's work in its own shapes. This is the model
  for the character profile's "Appears in".

**Do not copy**
- **10 px uppercase labels on images.** They are too small for long sessions and use case.
- **Logo images as titles.** Vewbox titles are generated text, often Arabic, so a text title voice is right.
- **The page-in-a-scroller pattern.** *Inference:* it makes `scroll-padding`, find-in-page and keyboard scrolling harder
  to get right.
- **Region and sign-up modals.**

### 1.3 Netflix (re-measured)

**Looked at.** https://www.netflix.com/title/80057281, which redirects to `/iq-en/`.

**Seen**
- **The hero is an inset frame**, 1329×619 at (48, 129), not a full-bleed image.
- **Sections.** Headings are 32 px, weight 700, Netflix Sans, on a 152 px side margin: Trailers, Episodes, More Details,
  You Might Also Like, Trending Now.
- **Trailer cards** are 327×184 with radius 8.
- The page is 3,967 px tall.
- Player controls stay visible on the hero (as the earlier study recorded).

**Learn**
- An inset hero on a dark ground keeps the player readable as an object.
- The content column is narrower than the hero.
- One heading size throughout.

**Do not copy.** The red, the sign-up form in the hero, and the glassy episode cards.

### 1.4 Disney+ (still behind a wall)

**Tried**
- The entity page https://www.disneyplus.com/en-us/browse/entity-2e6ee01d-5be2-4451-81a3-db3d061ef4dc redirects to
  `apps.disneyplus.com/iq/onboarding`. Non-essential cookies were rejected there.
- The article https://www.disneyplus.com/explore/articles/disney-plus-app-redesign-new-features redirects (302) to the
  Iraq landing page.

**Secondary sources (a WebSearch summary; low confidence; not observed)**
- A top bar with tabs per subscription: For You · Disney+ · Hulu · ESPN.
- "For You" is the home, with continue watching.
- Video in the hero carousel.
- Word badges such as "Season Finale" and "New Series".
- A Live hub in the sidebar.

**Learn.** As in the earlier study: the home is *continue* plus *new*, and state is shown as words.

### 1.5 IMDb: full credits and the person page (new pages)

**Looked at**
- https://www.imdb.com/title/tt11280740/fullcredits/
- https://www.imdb.com/name/nm0004395/

**Seen: full credits**
- Grouped by department (Directors, Writers, Cast…), with a "Jump to" menu.
- Each row: the name (16/600, a link), the role ("directed by", "created by"), and "11 episodes • 2022–2025" at the end
  (14 px, black at 54 %).
- Rows are 22 px tall. Department headings are 22/600 with a vertical accent bar.

**Seen: the person page**
- It **reuses the title page's hero grammar**: a portrait (2:3), a video clip, and count tiles (99+ videos, 99+ photos).
- Then a roles line ("Actor · Producer · Director"), the biography and "Born".

**Learn**
- *Credits by department, with what and how much each person contributed*, is the model for "who in the studio worked
  on this".
- A person and a title share one hero grammar.

**Do not copy.** The density, the yellow, the ads and the light body.

### 1.6 Spotify (album measured; track page new)

**Looked at**
- Album: https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv
- Track: https://open.spotify.com/track/0vFOzaXqZHahrZp6enQwQb

**Seen: the album page**
- The cover is 232×232 with radius 4.
- The title is **48 px, weight 800**, in "SpotifyMixUITitle".
- Track rows are **56 px**:
  - the number at 16 px, #b3b3b3
  - the title at 16 px, white
  - the artist at 14 px, #b3b3b3
  - the duration at 14 px
- Panels sit on #121212. The library column is 331 px.

**Seen: the font stack**
- Every text uses the same stack: SpotifyMixUI → **CircularSp-Arab** → CircularSp-Hebr → -Cyrl → -Grek → -Deva →
  Helvetica Neue…
- That is a per-script companion family inside the brand's own stack.

**Seen: the track page**
- In order:
  1. the kind "Song", the title, and a slate: "Pink Floyd • The Dark Side of the Moon • 1973 • 6:20 • 677,317,606"
  2. play, add and more
  3. **Lyrics**. Logged out it reads "Sign in to see lyrics and listen to the full track".
  4. the artist row, with a circle
  5. "Recommended · Based on this song"
  6. "Popular Tracks by…"
  7. Popular Releases
  8. "From the album", with the release date and the ℗ line
- The page title is "Money - song and lyrics by Pink Floyd | Spotify".

**Learn**
- A song has its own page.
- **Lyrics are the first section after the header.**
- Rights and credits close the page.
- One font stack holds a dedicated Arabic companion.

**Do not copy.** The green, the rounded panel islands, and play counts. Vewbox has no vanity metrics.

### 1.7 Apple Music (album measured; artist page new)

**Looked at**
- Album: https://music.apple.com/us/album/the-dark-side-of-the-moon/1065973699
- Artist: https://music.apple.com/us/artist/pink-floyd/487143

**Seen: the album page**
- The cover is 270×270 with radius 10.
- The title is only **26/30, weight 700**.
- Section headings are 17/22, weight 700.
- Track rows are **46 px**.
- The ground is #1f1f1f. Content starts at x 300 after the sidebar.

**Seen: the artist page**
- **Hero.** A wide image, 1165×584 (about 2:1), which showed as a flat blue block before it loaded. The `<h1>` (42/50,
  weight 700) is visually hidden.
- **The first row pairs "Latest Release" with "Top Songs".**
- Then the shelves: Essential Albums, Albums, **Music Videos**, Artist Playlists, Singles & EPs, Live Albums,
  Compilations, More To Hear, Similar Artists.

**Learn**
- Music videos are one shelf inside the music world.
- The first row pairs *the newest thing* with *the songs*.
- A modest title works when the cover is large.

**Do not copy.** The red and pink accents, and the glass mini-player.

### 1.8 YouTube Music (artist page new)

**Looked at.** https://music.youtube.com/channel/UCO6LS_5W7vqG9mALDNzSFug, reached from
https://music.youtube.com/search?q=pink+floyd. The player was not opened. The page's `<video>` element stayed paused.

**Seen**
- **Hero.** A full-bleed photo, the name at 34/40.8, weight 700, in "YouTube Sans", an audience count, a biography with
  MORE, and pills for Shuffle · Mix · Subscribe.
- **"Top songs".** A table with rows about 49 px apart: title · artist · plays · album.
- **Shelves by shape:**

  | Shelves | Tile |
  |---|---|
  | Albums; Singles & EPs | 144×144 |
  | Videos; Live performances | **256×144** |

- The font stack includes "Noto Naskh Arabic UI".

**Learn.** The same split as Spotify and Apple Music: audio is 1:1 and video is 16:9, on separate shelves.

**Do not copy.** Audience counts and the red.

### 1.9 Linear (measured; agents)

**Looked at**
- https://linear.app/ (rendered)
- https://linear.app/docs/agents-in-linear
- https://linear.app/developers/aig (Agent Interaction Guidelines; neither docs page shows a date)

**Seen**
- **Ground** #08090a.
- **Type.** Inter Variable at **fractional weights 510 and 590**, with Berkeley Mono.

  | Role | Setting |
  |---|---|
  | H1 | 64/64, weight 510, −1.408 px (−0.022em) |
  | H2 | 48/48, weight 510 |
  | Body | 15/24, −0.165 px |
  | Muted text | rgb(138,143,152) |
  | Eyebrow | Berkeley Mono, 12 px, uppercase |

- **The homepage's product image:**
  - a sidebar: Inbox, My issues, Reviews; Workspace (Initiatives, Projects); Favorites
  - one issue whose **Activity timeline mixes agent and human events**, such as an issue created via Slack on someone's
    behalf, or labels added by "Triage Intelligence"
  - a properties column at the end

**Read**
- **Delegation.** Assigning an issue to an agent *delegates* it; the human stays the primary assignee and owner. Views
  can be filtered by delegate.
- **The Agent Interaction Guidelines** set six principles (paraphrased):
  1. an agent always discloses that it is an agent
  2. it works through the platform's existing patterns
  3. it acknowledges immediately and unobtrusively
  4. it shows its internal state (thinking, waiting for input, executing, finished) and lets people inspect its
     reasoning
  5. it stops when asked
  6. it cannot be accountable; a human keeps final responsibility

**Learn**
- **Fractional weights** tune how heavy light text looks on dark.
- **Agents and humans share one activity timeline.**
- **Ownership stays with the producer.** This is the vocabulary for the Studio Company and for every approval.

**Do not copy.** The blue-grey palette and the marketing gradients.

### 1.10 Figma (follow-ups to UI3)

**Read**
- *Hide or minimize the UI*: https://help.figma.com/hc/en-us/articles/41414918021271-Hide-or-minimize-the-UI (WebSearch
  summary).
- *Guide to the file browser*: https://help.figma.com/hc/en-us/articles/14381406380183-Guide-to-the-file-browser.

**What they say**
- **Minimize UI** (Ctrl/⌘+Shift+\\). Selecting an object brings back the properties sidebar, while the navigation and
  left sidebar stay minimised.
- **Hide UI** is Ctrl/⌘+\\.
- **Actions** is a type-to-run menu.
- **The file browser's Recents** holds files you opened plus files recently shared with you. Drafts are private. Search
  results are grouped by kind of resource.

**Learn**
- A minimised workspace in which **only the inspector returns on selection** is exactly the cutting room's focus mode.
- **Recents** is the core of a creative tool's home.

### 1.11 Framer (new)

**Looked at**
- https://www.framer.com/ (rendered)
- https://www.framer.com/academy/lessons/framer-interface (the page says published 2026-10-02)

**Seen**
- **Ground** #000.
- **Type.**
  - The H1 is 54/54, weight 500, −2.16 px (−0.04em), in "GT Walsheim Medium".
  - The interface is Inter Variable at 14 px, with white at 80 % for the navigation.
  - Input Mono and JetBrains Mono are loaded.
- **The hero demo is a chat input with a saturated blue glow.**
- **Further down:**
  - "Agents that work alongside you, not instead of you".
  - The canvas shows **several labelled layout explorations side by side**.
  - An agent panel at the end shows its progress as short lines: "Thinking…", "Created a design plan", "Placing layout
    variations side by side".
  - The CMS view has a collections tree, a table with image thumbnails and an agent panel.

**Read (the Academy lesson)**
- **Four regions:**
  - a toolbar: insert, project name, active branch, preview, publish
  - a left sidebar that switches between Pages, Layers and Assets
  - a right sidebar whose contents follow the selection
  - the canvas
- **Five views:** Canvas · CMS · Localization · Analytics · Settings.
- Finish in preview before publishing. Branches let you review changes before they reach the main project.

**Learn**
1. An agent's output arrives as **variations laid out side by side** for a human to choose from.
2. **Agent progress is a few past-tense lines**, not a spinner.
3. A small number of top-level views.
4. Preview before publish.

**Do not copy**
- **The glowing input.** It is the exact effect the producer rejected.
- **GT Walsheim.** Commercial, with no Arabic.
- **A chat box as the home page.**

### 1.12 Adobe: Frame.io versions and compare

**Read**
- *Version Stacking and Comparison Mode (Legacy)*:
  https://support.frame.io/en/articles/4431-version-stacking-and-comparison-mode-legacy (article dated 2026-04-06).
- WebSearch summaries of the V4 player article (https://blog.frame.io/2024/05/28/frame-io-v4-features-player-and-commenting/,
  which returned 504 when fetched) and of https://help.frame.io/en/articles/9084073-frame-io-v4-legacy-feature-comparison.

**What they say**
- **Versions stack under one thumbnail.** Opening the stack opens the newest version, and a version selector sits at the
  top.
- **Compare** shows two versions side by side with synchronised playback, audio comparison, comments on either version,
  and zoom. Only matching media types can stack.
- **V4** (summary) adds:
  - anchored comments
  - comment attachments
  - frame-accurate seeking on hover
  - a small player that stays open while you browse

**Learn**
- A version is a property of one object.
- Compare is synchronised.
- Notes belong to a moment, and can belong to a place in the frame.

### 1.13 DaVinci Resolve 21

**Read.** https://www.blackmagicdesign.com/products/davinciresolve/whatsnew (the page names version 21). New in 21:
- **IntelliScript** assembles timelines by matching script text to transcribed audio.
- **AI IntelliSearch** finds people and content.
- **The media pool** gains star ratings and tags (Good Take, Untagged, Rejected), albums and a LightBox view.
- **Keyframe and curve editors** can adjust Fusion effects directly.

**Learn**
- Script-to-timeline assembly is the professional form of Vewbox's pipeline.
- *Good take* and *Rejected* are the industry's take-triage words.

### 1.14 References for a Home page

- **Notion Home** (https://www.notion.com/help/home-and-my-tasks):
  - Home moved from a full page into the sidebar.
  - Its sections include upcoming events, recents, favourites, agents, teamspaces and shared pages.
  - Each section can be resized, moved or hidden.
- **Figma Recents** (§1.10).
- **Disney+ For You** (§1.4; secondary).
- **Apple TV's logged-out home** is marketing behind a sign-up modal, so it is not usable as a reference.

**Learn**
- A creative tool's home is: what I was doing, what is waiting for me, and how to start something.
- Customisation is optional.

### 1.15 IMG Models: a premium casting directory (new)

**Looked at**
- https://imgmodels.com/
- https://imgmodels.com/directory/?view=grid&sort=az&gender=any&category=any&selectedTerritory=any

**Seen**
- **The directory opens with a full-screen typographic chooser** over the grid:
  - Select territory: London · Los Angeles · Milan · New York · Paris · Sydney
  - Select category: Model · Development · Talent
  - Select gender: Women · Men · All
  - then **Go**
- **The grid** has 5 columns of **244×328 (3:4) portraits with 30 px gaps**. 30 tiles were loaded.
- **Under each portrait, only the name**: 18 px, weight 600, uppercase, "Lay Grotesk".
- **The URL keeps** the view, sort and filters.

**Learn**
- Identical frames with a name only make a *line-up*, not a gallery.
- Filtering is a deliberate step.
- The view state lives in the URL.

**Do not copy**
- The uppercase names.
- *Inference:* a chooser that blocks the grid on every visit is tiring for someone who returns daily.

### 1.16 Galleries

**Awwwards, Film & TV** (https://www.awwwards.com/websites/film-tv/), newest entries:
- **Velour Productions** (https://www.awwwards.com/sites/velour-productions): nominee 2026-09-18, design score 9.27;
  built with Next.js, Sanity and GSAP; by the agency ZAK.
- **Peryton Film** (https://www.awwwards.com/sites/peryton-film): nominee 2026-09-18; WebGL, GSAP, Lenis smooth scroll,
  Webflow.

**velourproductions.com (seen)**
- A custom condensed "Velour Display", weight 900, uppercase, at **252/181 px**.
- "Velour Mono" for labels at **10.26 px** uppercase, and for body text at 16/20.8, weight 300.
- Photos float around the headline.
- **Learn:** the display-plus-mono pairing.
- **Do not copy:** 10 px labels, smooth-scroll hijacking and WebGL in a tool.

**Godly, now recent.design** (https://recent.design/?ref=godly; it rendered today, unlike the earlier session)
- A Design feed with filters: All, Web, Interface, Branding, Product, Typography, Motion, Illustration, 3D, Editorial,
  Print, Packaging. Its posts link to X.
- A Websites list. Its first entry, "Nothing to Watch" (https://nothing-to-watch.port80.ch/), is a WebGL film
  experience that first asks for your device class ("Potato / Mid-range / High-end").
- The Interface feed is mostly mobile screens and saturated gradients.
- **Learn:** honest performance tiering before a heavy experience. Little else applies.

**Mobbin.** 403 at the edge ("This request was blocked"). The library needs an account in any case. Not signed in;
nothing used.

**Behance** (search "film production studio website", most appreciated, this year,
https://www.behance.net/search/projects/film%20production%20studio%20website?sort=appreciations&time=year)
- Only flat dominant-colour blocks rendered.
- The results were branding projects.
- Not used.

**Dribbble**
- "ai agents org chart" (https://dribbble.com/search/ai-agents-org-chart). The first results:
  - "AI Org Chart Dashboard UI - Human and AI Workforce Management"
    (https://dribbble.com/shots/27640148-AI-Org-Chart-Dashboard-UI-Human-and-AI-Workforce-Management)
  - "AI Agents Dashboard compliance platform…" (https://dribbble.com/shots/27666802-AI-Agents-Dashboard-compliance-platform-dashboard-charts-map)
  - "AI Agent Activity Dashboard" (https://dribbble.com/shots/26451143-AI-Agent-Activity-Dashboard)

  All are dark dashboards with donut charts, KPI tiles and glowing gradients.
- "casting agency talent directory" (https://dribbble.com/search/casting-agency-talent-directory): model-agency
  WordPress templates, red and orange gradients, cut-out models.
- **Learn:** these are the failure modes for the Studio Company and the casting directory.

### 1.17 Standards (additions to the earlier study)

**Apple HIG, Right to left** (https://developer.apple.com/tutorials/data/design/human-interface-guidelines/right-to-left.json;
page https://developer.apple.com/design/human-interface-guidelines/right-to-left). Paraphrased:
- **Alignment.**
  - Align a paragraph by its own language, not by the interface direction.
  - Keep one alignment within a list.
- **Numbers.**
  - Never reverse the digits within a number.
  - Reverse the *order* of numerals that show progress.
- **What flips.** Controls that show progress from one end to the other, and navigation in a fixed order.
- **What does not flip.**
  - Controls that refer to a real direction.
  - Clocks.
  - Photographs and artwork.
- **Size balance.** Arabic and Hebrew look smaller than Latin set in capitals at the same size; Apple suggests about
  2 pt larger.

**Material 3, Type scale and tokens** (https://m3.material.io/styles/typography/type-scale-tokens, rendered)
- A *brand* typeface for the large styles (Display, Headline) and a *plain* typeface for Body and Label.
- **Language height.** Arabic belongs to the "Medium, about 7 % taller" category; Nastaliq is about 100 % taller.
  Ignoring language height overlaps text.
- The scale is a Major Second on a base of 14 (the page text was truncated after this).

**Material 3, Editorial treatments** (https://m3.material.io/styles/typography/editorial-treatments)
- Type-led showcase moments.
- Guard rails:
  - use tokens
  - do not mix clashing treatments
  - do not use editorial treatments for labels or plain information
- Dark mode can make the same text look heavier; a negative *grade* counteracts it.

**Material 3, Canonical layouts** (https://m3.material.io/foundations/layout/canonical-examples/overview)
- Feed, list-detail, and supporting pane, in which the primary pane takes about two-thirds.
- Layering panes for focused tasks such as responding to comments.

**WCAG 2.2**
- **2.2.2 Pause, Stop, Hide (A)** (https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html):
  - Moving content that starts automatically, lasts more than 5 s and sits beside other content needs a pause, stop or
    hide mechanism.
  - Content that updates itself needs a pause, stop, hide or frequency control.
- **1.4.8 Visual Presentation (AAA)** (https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html):
  - lines of at most 80 characters
  - no justified text
  - line spacing at least 1.5
  - paragraph spacing at least 1.5 × line spacing
  - text resizable to 200 % without horizontal scrolling

**W3C, Text Layout Requirements for the Arabic Script (alreq)** (https://www.w3.org/TR/alreq/; Group Draft Note,
2 October 2025)
- **Stretching.** Arabic text is stretched non-uniformly (kashida, tatweel). This is *not* letter-spacing.
- **Vertical extent.** Arabic ascenders and descenders reach much further than Latin ones, and several diacritics can
  stack on one letter.
- **Numerals.**

  | Digits | Regions |
  |---|---|
  | European digits | the western Arab region (Morocco, Algeria) |
  | **Arabic-Indic digits** | the **eastern Arab region (Egypt, Saudi Arabia, Iraq)** |
  | Eastern Arabic-Indic digits | Iran and Afghanistan |

- **Style.** Naskh became the basis of most text types.

---

## 2. What makes the best references feel premium (measured, cross-cutting)

### 2.1 Type contrast

| Reference (page) | Largest text | Body / UI text | Ratio | Display tracking | Display line height |
|---|---|---|---|---|---|
| A24 (film page) | 74 | 15 | 4.9 | −0.04em | 0.92 |
| A24 (films index) | 120 | 15 | 8.0 | −0.04em | 0.92 |
| Linear (home) | 64 | 15 | 4.3 | −0.022em | 1.0 |
| Framer (home) | 54 | 14 | 3.9 | −0.04em | 1.0 |
| Spotify (album) | 48 | 16 | 3.0 | normal | normal |
| Apple Music (album) | 26 | 17 (section headings; row text not measured) | about 1.5 | normal | 1.15 |
| Apple TV (show) | title is an image; headings 17 | 13–15 | — | — | — |
| Velour (Awwwards) | 252 | 16 | 15.8 | normal | 0.72 |
| *Vewbox v4 `.t-hero`* | *64* | *14* | *4.6* | *−0.03em* | *1.0* |

*Inference:* v4's hero sits inside the premium band of 4–5×. A24's 0.92 line height and −0.04em tracking are tighter
than v4's 64/64 at −0.03em, and that tightness does much of the "editorial" work.

### 2.2 Traits the premium references share (seen)

1. **One family, plus a mono.**
   - A24: NB International + Mono.
   - Linear: Inter + Berkeley Mono.
   - Framer: Inter + Input/JetBrains Mono, with GT Walsheim for display.
   - Velour: Display + Mono.
2. **Hierarchy by size and colour.** Display weights are moderate: A24 500, Linear 510, Framer 500. Spotify's 800 is
   the exception.
3. **Few sizes.** A24 has three.
4. **Art has small or no radii, and never a border.**

   | Reference | Radius |
   |---|---|
   | A24 | 0 |
   | Spotify cover | 4 |
   | Netflix trailer | 8 |
   | Apple Music cover | 10 |
   | Apple TV episode card | 14 |

   No border was measured on any artwork.
5. **Muted text by alpha or grey, never by hue.**

   | Reference | Muted text |
   |---|---|
   | Apple TV | white at 92/70/64 % |
   | Spotify | #b3b3b3 |
   | Linear | rgb(138,143,152) |
   | A24 | #888 |

6. **Nothing is painted on art except the title** (A24) or a bottom scrim with text (Apple TV). No badge clutter.
7. **Short pages.** A24's film page is 3,226 px and Netflix's title page 3,967 px.
8. **Fixed, large spacing steps.**
   - A24: 120 px between modules.
   - Apple TV: 40 px margins and 22 px gaps.
   - IMG: 30 px gaps.
   - A24 index: 30 px gutters and 42 px margins.

### 2.3 Measured baselines for v4's media components

| Component | Measured reference | v4 today | Note |
|---|---|---|---|
| 16:9 card in a rail | Apple TV 253 w, gap 22, margin 40, one partial card visible; Netflix 327×184 | `Rail` | Keep the visible partial card |
| 2:3 poster | Apple TV 149×223, gap about 21 | `PosterTile` | — |
| Cast circle | Apple TV 117 (shelf), 170 (person page) | `FaceCircle` | Name 13 px, role 12 px is too small for Vewbox; use v4's `.tile-title` and `.caption` |
| Track row | Spotify 56, Apple Music 46, YouTube Music about 49 | `SectionRow` | 48–56 in comfortable density |
| Sleeve in a header | Spotify 232 (radius 4), Apple Music 270 (radius 10) | `SleeveHero` 280 | — |
| Directory figure | IMG 244×328 (3:4), 5 per row, gap 30 | `FigureTile` 928:1664 | Keep the native ratio; use the 30 px gap and name only |
| Credits value | A24 38/38 under a 15 px label | — (new) | §3.2 |

### 2.4 Failure modes observed

| Failure mode | Seen on |
|---|---|
| Glow on an input or a card | Framer's hero; the Dribbble agent dashboards |
| KPI tiles and donut charts for agents | Dribbble "AI agents org chart" |
| A hero that advances by itself with no pause | A24 |
| Information only on hover | A24 tile credits |
| Tiny uppercase labels | Apple TV at 10 px; Velour at 10.26 px; IMG names |
| Vanity counts | Spotify plays; YouTube Music audience |
| Walls and interstitials | Disney+, Apple TV home, A24's newsletter pop-up |

---

## 3. Vewbox page types: patterns and failure modes

v4 §6 holds the page specifications. This section adds what today's research changes or adds. Each page lists **the
patterns that make the best references feel premium** and **the failure modes to avoid**.

### 3.0 Navigation priorities (new)

**Today.** `nav-model.ts` has three equal groups and a footer:
- Productions: Shows · Shorts · Music Videos
- Cast & world: Characters · Locations · Files
- Studio: Studio Company · Production · Screening Room
- Footer: Settings

`HOME = '/shows'`.

**The directive.**
- Primary: Shows, Shorts, Music Videos, Characters, Studio Company.
- Secondary: Locations, Production, Screening Room, Settings.

**Proposal**

```
[glyph] Home                      ← the glyph is Home; Home is also the first item
Shows
Shorts
Music Videos
Characters
Studio Company
                                  ← space, not a rule
Locations                         ← secondary: 13 px, --fg-muted, 16 px icons, tighter rows
Production  3                     ← keeps the needs-you count (it is also on Home)
Screening Room
Settings
Footer: Help & shortcuts · connection · collapse
```

- **Why few primary items** (seen):
  - A24's whole menu is 7 items at display size.
  - Framer has 5 views; YouTube Music's sidebar has 3.
  - Linear separates personal items from the Workspace section.
- **Production keeps its count,** and the same count appears on Home. Demoting it does not hide decisions.
- **Files is in neither list.**
  - Proposal: remove it from the sidebar but keep the route.
  - Reach it from a "Files" view inside Characters and Locations, and from the command palette.
  - Needs the producer's confirmation.
- **Phone.** A bottom bar holds five places at most. *Inference:* Home · Productions (a segmented Shows / Shorts / Music
  Videos) · Characters · Studio · More (the secondary four). This keeps all five primaries one tap away, and the order
  stays the same as the sidebar (WCAG 3.2.3).
- **Failure modes to avoid:**
  - group labels that repeat the item names
  - a "New" item competing with destinations (New belongs on Home and in Ctrl/⌘K)
  - badges on every item
  - icons with no labels in the expanded sidebar

### 3.1 Home (new)

**Patterns that feel premium**
- **Continue as pictures with a verb.** The streaming services' continue rows; Disney+ "For You".
- **Recents.** Figma, Notion.
- **What is waiting, with the thing inline.** Linear's Inbox; the earlier study's approval card.
- **One object per block with one verb.** The A24 home.
- **"Newest thing" beside "the list".** Apple Music's first artist row.

**Proposal**

```
Home                                                          [ New ▾ ]   ← one entry: Show · Short · Music video · Character · Location
Two decisions wait for you.                                                ← one sentence, only when true
Continue                                                                   ← 1–3 large 16:9 stills, one per production in flight
┌ still ──────────────────────┐  The Static Sky · Short
│                             │  Final cut ready · 56 s           [ Screen it ]   ← the next step as the verb
└─────────────────────────────┘
Needs you  2                                                               ← approval rows with the content inline
Recent                                                                     ← mixed shapes in one row: 16:9 · 2:3 · 1:1
Cast                                                                       ← a line-up strip of figures + "New character"
The studio  · 2 departments working · Video is drawing shot 7 of 20 ›      ← one line, links to Studio Company
```

- **Empty Home.** Three title cards in the three production shapes: 16:9 "Your first show", 2:3 "Your first short",
  1:1 "Your first song". Plus one line, "Meet your studio", linking to the Studio Company. No zeros and no "0 jobs".
- **Partial Home.** A section with nothing in it is omitted, not shown empty.
- **Failure modes:**
  - KPI tiles ("12 jobs · 3 characters")
  - an activity feed as the main content
  - a greeting hero with nothing to act on
  - a rotating carousel (§0 decision 15)
  - repeating the sidebar as cards ("Shows → Open")
  - a chat box as the home (Framer's hero)

### 3.2 Shows and the show page

**Patterns that feel premium**
- **Apple TV:**
  - huge art with small interface type
  - "Season 1 ⌄" as a heading that is also the picker
  - an episode rail with a visible next card
  - cast circles with the character's name
  - Information as definition lists at the end
- **A24:**
  - credits set as type
  - a short page
  - the synopsis offset onto the second column
  - a separate portrait asset on phones
- **Netflix:** an anchor navigation on a long page.
- **IMDb:** credits by department with "in N episodes".

**Additions to v4 §6.1–§6.3**
- **Credits** after Episodes and Cast (decision 2).
  - Cast: character, voice, "in 6 episodes · S1".
  - Crew: department, agent, what it made, such as "Story Development · Head of Story · wrote 6 episodes".
  - Each crew line links to the department page.
- **An "Index" view** for the Shows catalogue beside the grid: titles in the title voice at 120 px (Latin) in a list,
  with the key art shown on hover *and on focus* (A24's index, made accessible). Useful once there are more than about
  8 shows.
- **The phone hero** uses the stored portrait crop (decision 10).

**Failure modes**
- glass episode cards
- ratings or vanity counts
- recommendation rails (A24 shows they are unnecessary)
- trailers that autoplay with sound
- logo images as titles
- 10 px uppercase episode labels
- production buttons in the hero (v4 §3.10 already forbids them)

### 3.3 Shorts and the short page

**Patterns that feel premium**
- **A24's film page is the closest analogue to a single film:**
  - a still and the title
  - a credits grid
  - the synopsis in an offset column
  - the one-sheet poster
  - and then it ends
- **IMDb's diptych:** poster, player and counts.

**Additions to v4 §6.4–§6.5**
- The diptych hero stays.
- Under the film strip, a **credits grid** in three columns: Written by · Directed by (the agent or the producer) ·
  Cast.
- Then the logline offset to the second column.
- **The 2:3 poster** is also listed as a deliverable (download), as A24 places its one-sheet on the page.

**Failure modes**
- reusing the show template (no seasons for a single film)
- a long page of rails
- generation controls in the hero

### 3.4 Music Videos and the music-video page (music first)

**Patterns that feel premium**
- **Spotify's track page:**
  - kind, title, then a slate (artist · album · year · duration)
  - play
  - **Lyrics immediately after the header**
  - the artist
  - more music
  - credits and rights at the end
- **Apple Music's artist page:** "Latest Release" next to "Top Songs"; music videos as one shelf.
- **YouTube Music:** a Song/Video switch; videos on a separate 16:9 shelf from 1:1 albums.

**Proposal (refines v4 §6.7–§6.8)**
- **The catalogue is a discography.**
  - 1:1 sleeves in the grid.
  - The list view is track rows: # · title · performers (face chips) · duration · state, 48–56 px tall.
  - The number becomes play on hover *and on focus*, and play is always visible on touch.
- **Page order:**
  1. **The header.** The sleeve, the kind ("Music video"), the title, and a slate: performers · year · 3:42 · 8
     sections.
  2. **Play**, with **Song ⇄ Video**.
  3. **Lyrics**, synchronised, with the singer's face at the start of each line.
  4. **Performers**, as circles with their voices.
  5. **Sections**, as a table with a totals footer.
  6. **Videos**, a 16:9 shelf: the cut, a vertical cut, a lyric video if one exists.
  7. **Credits**: written by, composed by, sung by, edited by, each with its department.
  8. A rights line: "Made in Vewbox Studio · 2026".
- **The song plays on its own** before any video exists. The video is one rendering of the song.

**Failure modes**
- a poster wall
- a 16:9 hero for a song
- movie metadata (seasons, episodes) on a song
- lyrics hidden behind a tab
- a video-first page where the song cannot be played alone
- play counts

### 3.5 Characters and the profile (a premium casting directory)

**Patterns that feel premium**
- **IMG Models:**
  - identical frames on one rhythm (30 px)
  - the name only
  - filtering as a step
  - view state in the URL
- **Apple TV's person page:** a circle, the name, one paragraph, and the person's work in its own shapes.
- **IMDb's person page:** the same hero grammar as a title page.
- **A24:** people at a large type size.

**Additions to v4 §6.9–§6.10**
- **Directory.**
  - A line-up of 928:1664 figures on one backdrop, feet on one baseline (v4).
  - Under each figure, only the **name in the title voice**, with the other-language name as a quiet second line when it
    exists.
  - A status appears only when it needs the producer: "Needs approval".
  - The voice play disc appears on hover and focus, and is always visible on touch.
  - Filters live in **one sheet**, with their state in the URL.
- **An "Index" view.** Names in a list at display size, with the figure shown on focus or hover. Good once there are
  more than about 20 characters.
- **Profile.**
  - The figure, the name, one paragraph, and the voice reel (v4).
  - Then **"Appears in"**: shelves in each production's own shape (16:9 shows, 2:3 shorts, 1:1 songs), each with the
    role ("Lead · 6 lines").

**Failure modes**
- a row of bordered dropdowns (v4 finding V4-09)
- cut-out figures on gradients (Dribbble casting templates)
- measurement tables or star ratings
- crops that cut the feet
- uppercase names

### 3.6 Locations

**Patterns that feel premium**
- A24's full-bleed film modules: one still, one title, one verb.
- Apple Music's wide (about 2:1) artist hero.
- A scouting board of big plates.

**Additions to v4 §6.12**
- A stored portrait crop for the phone hero (decision 10).
- **"Appears in"**, as on the character profile.
- Being secondary in the navigation does not make the page smaller: plates stay big.

**Failure modes**
- small tiles
- weather and time-of-day icons in place of the actual lit plates
- map widgets
- a location card that looks like a character card

### 3.7 Studio Company: the organisation visualisation

**The real structure** (`src/server/org/model.ts`, `ORG_VERSION = 11`)
- **Nine departments.** The **Executive Office** holds the Executive Producer and the Production Coordinator, which is
  the deterministic orchestrator: it runs a production through its jobs. The other eight:
  - Story Development
  - Casting & Character Design
  - World Building & Art Direction
  - Pre-Production
  - Sound & Music
  - Video Production
  - Quality Assurance
  - Post-Production
- **One shared stage.** The *Cast & world* stage belongs to Casting in `PIPELINE`, and World Building lists the same
  stage in `DEPARTMENTS`. The drawing should treat the two departments as **one adjacent pair**, and edges attach to the
  pair.
- **The real relations between stages,** from `handsTo` plus cross-stage `dependsOn` (nine):

  | # | Relation | Source in the code |
  |---|---|---|
  | 1 | Story → Cast & world | `handsTo` and `dependsOn` |
  | 2 | Story (Script) → Pre-Production | `handsTo` |
  | 3 | Cast & world → Pre-Production | `handsTo`; the Storyboard depends on Cast & world |
  | 4 | Pre-Production (Shot plan) → Sound | `handsTo` |
  | 5 | Cast & world → Sound (voices) | Audio preparation depends on Cast & world |
  | 6 | Sound → Video | `handsTo` |
  | 7 | Pre-Production (Storyboard, Shot plan) → Video | Video depends on both |
  | 8 | Video → QA | `handsTo` |
  | 9 | QA → Post | `handsTo` |

- **Human gates:** Story approval and Edit approval.

**Patterns that feel premium**
- **Linear's guidelines**, as concrete rules:
  - an agent is labelled as an agent
  - its state is shown (thinking, waiting for input, working, finished)
  - its reasoning can be inspected
  - it stops when asked
  - a human is accountable
- **Linear's single activity timeline** for humans and agents.
- **IMDb's credits by department.**
- **The v3/v4 constellation,** which the earlier audit found to be the app's strongest page.

**Proposal**

```
                         Story Development
          Post-Production                  Casting & Character Design
   Quality Assurance        ( Studio Orchestrator )        World Building & Art Direction
          Video Production                 Pre-Production
                          Sound & Music
   The producer: outside the ring, at the Story gate and the Edit gate
```

- **The ring is in pipeline order,** clockwise from the top: Story → [Casting, World] → Pre-Production → Sound →
  Video → QA → Post.
  - Six of the nine relations (1, 3, 4, 6, 8, 9) become arcs between neighbours.
  - Only three chords cross the ring: Story → Pre-Production (the script), Cast & world → Sound (voices), and
    Pre-Production → Video (frames and the shot plan).
  - Fewer crossings make the drawing readable without decoration. (The diagram above is schematic; it does not show the
    pair bracket.)
- **Spokes** from the Orchestrator to a department appear only while a job is being dispatched or run. At rest, the ring
  shows only the handoffs.
- **A department node** is a monogram, the name and one state line in words: *Idle*, *Working on "The Static Sky" ·
  shot 7 of 20*, *Waiting for you*, *Handed to Video · 2 min ago*. Nodes never show faces or human names, so an agent
  cannot be mistaken for a person.
- **The producer's two gates** are drawn as the only places a human decides, with the count waiting at each.
- **"Pause the studio"** (job intake already supports pausing) sits on this page.
- **Credits link both ways:** department → the productions it worked on → back.

**Failure modes**
- KPI tiles, donut charts, glowing nodes and particle edges (Dribbble)
- every department connected to every other
- continuous animation along edges (v3 allows one travelling light per handoff, once)
- human avatars for agents
- model names in the product voice
- a bordered card around the diagram (v4 already removes it)

### 3.8 The production workspace (the cutting room)

**Patterns that feel premium**
- **Figma:** a minimised UI in which only the inspector returns on selection.
- **Framer:**
  - the right sidebar follows the selection
  - preview before publish
  - agent variations side by side
  - progress as log lines
- **Resolve 21:**
  - script-to-timeline assembly
  - take triage with Good Take / Rejected
- **Linear:** one activity list for agents and humans, with properties at the end.
- **Frame.io:** version stacks.

**Additions to v4 §6.6**
- **Takes.**
  - 2–4 candidates side by side at the shot's aspect, each with **Use this take**.
  - The tags are *Good take* and *Rejected*. No stars.
- **Activity per shot.** Agent and producer events in one list, with the agent's state in words. Each agent event opens
  "Why" (inspect the reasoning; Linear's principle 4).
- **The script drives the cut.** Selecting a script line selects its shot, and the reverse (an IntelliScript
  analogue).
- **Shortcuts follow Figma's habits:**
  - Ctrl/⌘+Shift+\\ minimises the panels; the inspector returns on selection.
  - Ctrl/⌘+\\ hides the interface.
  - v4's Ctrl/⌘+\\ collapses the sidebar. *Inference:* map Ctrl/⌘+\\ to collapse the sidebar and Ctrl/⌘+Shift+\\ to
    minimise, so people who know Figma are not surprised.

**Failure modes**
- a chat-first workspace with a glowing prompt
- toolbars of unlabelled icons
- modal dialogs for frequent actions
- floating panels
- a single result with no alternative
- fake percentages

### 3.9 The Screening Room

**Patterns that feel premium**
- **Netflix:** visible controls on an inset player.
- **Apple HIG, Playing video** (earlier study): native ratio, no large overlays.
- **Frame.io:** a version picker at the top; synchronised compare; notes on either version and on a moment.
- **A24:** a short programme note made of title, credits grid and logline.
- **M3:** a supporting pane takes about one-third.

**Additions to v4 §6.15**
- **Programme note** under the theatre, in A24's grammar: title in the title voice; credits in three columns; logline
  offset to the second column. No rails.
- **Version picker** in the title row ("Cut 4 ⌄").
- **Compare** is synchronised, with an audio switch between A and B.
- **Notes.**
  - Anchored to timecode, and optionally to a point in the frame (Frame.io's anchored comments).
  - In a supporting pane of about one-third at 1440 or wider, below the theatre otherwise.

**Failure modes**
- autoplay with sound
- overlays on the picture
- a tinted surround
- notes in a modal
- a programme page that looks like a store page (A24's merchandise blocks)

### 3.10 Settings

**Patterns that feel premium**
- **Apple TV:** Information, Languages and Accessibility as plain definition lists. No cards.
- **Framer:** Settings as one of five views.
- **Notion:** Home sections can be reordered and hidden.

**Additions to v4 §6.16**
- **Numerals (Arabic interface): Western / Arabic-Indic.** Decision 14; §4.5.
- **Home sections:** show or hide, and order. Optional.

**Failure modes**
- raw engine strings (V4-07)
- a centred column
- one card per setting
- settings hidden behind icons

### 3.11 Creation flows

**Patterns that feel premium**
- **Framer:** progress as past-tense lines; variations side by side.
- **IMG Models:** the first choice is a large typographic step.
- **Figma:** creation starts from Recents.
- **Linear:** delegation leaves ownership with the human.

**Proposal (refines v4 §5.19 and §6.17)**
- **New…** opens a chooser of five *title cards*, each in its object's shape: Show 16:9, Short 2:3, Music video 1:1,
  Character 928:1664, Location 2.39:1.
- **While the studio drafts,** progress is a short list of past-tense lines: "Wrote three premises", "Drew four
  figures". Each line names its department.
- **Results arrive as 2–4 candidates side by side,** each with **Use this**. Everything stays editable afterwards.
- **One ownership line** under the action: "The studio drafts; you approve."

**Failure modes**
- a chat box as the only entry
- a spinner with no words
- one result with no choice
- an eight-step form wizard
- percentages that are not real
- generic violet "AI" iconography (V4-15)

---

## 4. Typography: a cinematic-editorial voice with a first-class Arabic companion

### 4.1 What the references use (seen)

| Reference | Display | Interface | Mono | Arabic |
|---|---|---|---|---|
| A24 | NB International Web 500 | NB International Web 400 | NB International Mono Web (years) | none observed |
| Linear | Inter Variable 510 | Inter Variable 400 | Berkeley Mono (eyebrows) | none observed |
| Framer | GT Walsheim Medium | Inter Variable | Input Mono, JetBrains Mono | none observed |
| Spotify | SpotifyMixUITitle 800 | SpotifyMixUI | — | **CircularSp-Arab in the same stack** |
| YouTube Music | YouTube Sans 700 | Roboto | — | Noto Naskh Arabic UI in the stack |
| Apple TV / Music | system (SF Pro) | system | — | system |
| IMG Models | Lay Grotesk 600 | — | — | — |
| Velour | Velour Display 900 (custom) | Velour Mono | Velour Mono | — |

Two patterns stand out:
1. **A grotesk display family with a mono companion.**
2. **Per-script companions declared inside one font stack** (Spotify). This is how a brand keeps one voice across Arabic
   and Latin without forcing one font to do both.

### 4.2 Requirements derived for Vewbox's title voice

1. **Arabic and Latin change register together** (v4 §3.2).
2. **Arabic metrics.**
   - About 7 % taller line heights at minimum (M3); in practice more for display, given the vertical extent alreq
     describes.
   - Room for stacked diacritics.
   - **No letter-spacing in Arabic** (alreq).
3. **No case.** Hierarchy comes from size, weight and colour (HIG RTL).
4. **Licence.** OFL, or a verified commercial licence. Self-hosted WOFF2, no font service (v4).
5. **It reads as a film title** at 48–120 px, and not as UI.
6. **Weight on dark.** Light text on dark looks heavier (M3). Fractional weights (Linear's 510 and 590) are available on
   variable fonts. Stay at 400 or above (HIG).

### 4.3 Candidate pairings (licences verified from Google Fonts `METADATA.pb` on 2026-10-03 unless marked)

**P0. Editorial grotesk (v4's T0, re-argued).**
- *Latin:* **Inter**, Rasmus Andersson, OFL, `opsz` 14–32 and `wght` 100–900. Bundled.
- *Arabic:* **IBM Plex Sans Arabic**, by Mike Abbink, Bold Monday, Khajag Apelian and Wael Morcos; OFL; weights 100–700.
  Bundled.
- *Character:* the A24 route. Distinctive through setting: 0.92 line height, −0.04em, weight 500–560, zero radius, large
  spacing.
- *Risk and checks:* Inter is everywhere, so the setting must carry the identity. Plex Arabic at 600/700 has the right
  weight at 52–64 px.

**P1. Condensed "poster" (new).**
- *Latin:* **Instrument Sans**, by Rodrigo Fuenzalida and Jordan Egstad; OFL; `wdth` 75–100, `wght` 400–700; Latin only.
- *Arabic:* **Noto Sans Arabic**, Google; OFL; **`wdth` 62.5–100**, `wght` 100–900.
- *Character:* condensed titles in *both* scripts give a film-poster register (compare Velour's condensed display). Both
  faces have a width axis, so register changes together. A condensed width is rare among open-licence Arabic families.
- *Risk and checks:*
  - Is condensed Arabic legible at 34–52 px, with harakat?
  - Noto's drawing is neutral, so the setting must carry it.
  - Two families from two foundries: check that they match.

**P2. Kufi editorial (new).**
- **Kufam** (Original Type, Wael Morcos, Artur Schmal; OFL; `wght` 400–900; Arabic and Latin in one family), *or*
  **Noto Kufi Arabic** (Google; OFL; `wght` 100–900) with **Inter Tight** (Rasmus Andersson; OFL; `wght` 100–900).
- *Character:* Kufi's geometry matches a grotesk, and reads as contemporary Arab editorial.
- *Risk and checks:* long names may read as stylised; test with Iraqi names and with diacritics. Kufam's Latin may not
  match Inter's.

**P3. Bilingual serif (v4's T1 and T2).**
- **Markazi Text** (Borna Izadpanah, Florian Runge, Fiona Ross; OFL; `wght` 400–700; Arabic and Latin), *or*
  **Newsreader** (Production Type; OFL; `opsz` 6–72, `wght` 200–800) with **Amiri** (Khaled Hosny, Sebastian Kosch; OFL;
  400 and 700 with italics) or **Noto Naskh Arabic** (OFL; `wght` 400–700).
- *Character:* a literary register.
- *Risk and checks:* as v4 §3.2. Markazi is a text design. Amiri needs a tall line height.

**P4. Commercial bilingual (if there is a budget; licence not verified).**
- **Lyon Display** with **Lyon Arabic Display**: Commercial Type; Arabic by Khajag Apelian and Wael Morcos, Latin by Kai
  Bernau; released July 2020 (WebSearch summary of AIGA Eye on Design, It's Nice That and Fontstand).
- **Graphik** with **Graphik Arabic**: Commercial Type, by Wael Morcos and Khajag Apelian, in nine weights.
- *Character:* a pairing designed as one system, and the most "premium editorial" option.
- *Risk and checks:* a paid web licence. Confirm self-hosting terms and the cost. The Arabic designers are the same as
  Plex Arabic's, so the interface and titles would stay related.

**P5. Thmanyah Serif Display / Sans (v4's T3).**
- *Licence: still not verified.* A WebSearch summary of Thmanyah's help-centre article says use in websites and apps is
  allowed. It also says modifying, renaming, redistributing, uploading for download, or making the files available to
  others is not allowed.
- The licence page itself failed (522). The download is gated by email.
- *Character:* the most distinctive bilingual display.
- *Risk and checks:* a self-hosted WOFF2 can be fetched by anyone, and converting the file may count as modifying it.
  Do not bundle without written confirmation.

**Considered and not recommended**

| Family (OFL unless noted) | Why not |
|---|---|
| **Alexandria** (Mohamed Gaber, Julieta Ulanovsky; `wght` 100–900; Arabic and Latin) | One bilingual family, but *Inference:* its geometric Latin reads generic at display sizes |
| **Readex Pro** (`HEXP`, `wght` 160–700) | Built for readability, not display |
| **El Messiri** (400–700), **Reem Kufi** (400–700) | Display Arabic with narrow weight ranges |
| **Zain** (Boutros; 200–900; Arabic and Latin) | Too new to judge; worth one look in the spike |
| **Fraunces** (`opsz` 9–144, `SOFT`, `WONK`) | Expressive and quirky, with no Arabic counterpart |
| **Instrument Serif** (400 and italic only) | Elegant, but one weight and Latin only |

**Mono for numbers (all pairings).** **IBM Plex Mono**: Mike Abbink, Bold Monday; OFL; 100–700 with italics; Latin
and Cyrillic. It is from the same superfamily as Plex Sans Arabic. Use it for timecodes, durations, years and counts in
slates. Always LTR.

**Spike order.** P0 as the baseline, then P1, P2 and P3. Add P4 only if the producer approves a budget. Use v4 §3.2's
protocol, with two added criteria:
1. A **120 px index test**: does a list of ten titles read like A24's index, or like UI?
2. **Condensed Arabic legibility** with full diacritics, at 34 px on a phone.

### 4.4 Setting rules learned (both scripts)

- **Latin display.**
  - Line height 0.92–1.0, tracking −0.03 to −0.04em, weight 500–560 (A24 500, Linear 510).
  - The year follows the title in mono, as A24 does, with `lang` and `dir` set on the parts.
- **Arabic display.**
  - Line height of at least 1.35. v4's 52/72 is 1.38.
  - Tracking 0. Never stretch for fit in the interface; alreq's stretching is a justification tool, not a style.
- **Size balance (a correction to check).** v4 and the earlier study set the Arabic hero **smaller** than the Latin one
  (52 against 64). Apple's RTL guidance points the other way: Arabic reads smaller at an equal size. The spike should
  match the two scripts *optically* (body height and visual weight), not by a fixed rule. Start at 58–60 px for Arabic
  against 64 Latin and measure.
- **Labels.** No uppercase and no tracking. Small labels use `--fg-muted` at 13 px (14 in Arabic). Numerals in labels
  use the mono. This replaces the small-capitals register that A24, IMG and Apple TV rely on.
- **Measure.** At most 80 characters (WCAG 1.4.8 AAA). v4's 64ch lead and 68ch prose already comply. Arabic prose is
  never justified in the interface.

### 4.5 Arabic numerals: a decision for the producer

- **Fact.** alreq (2025-10-02) lists Arabic-Indic digits (٠–٩) as used in the eastern Arab region, naming Iraq.
- **Today.** v4 §3.1 keeps Western digits in both locales.
- **Options:**

  | Option | What it means |
  |---|---|
  | **A** (v4 today) | Western digits everywhere. Simplest, and consistent with LTR media and timecodes. |
  | **B** | Arabic-Indic digits in Arabic prose, slates and counts. Western digits in timecodes, transport, ids and file data (which stay LTR). |
  | **C** | B as a setting under Interface, with A as the default. |

- **Recommendation: C.** It respects regional practice without risking the cutting room. Apple's rule applies either
  way: never reverse the digits within a number.

---

## 5. The earlier study: what it got right, what it missed, what was wrong

### 5.1 Right, and confirmed by today's measurements

| Earlier decision | Confirmed by |
|---|---|
| Shape is identity | All three music services split 1:1 audio from 16:9 video (YouTube Music 144×144 vs 256×144). Apple TV separates 16:9 episodes, 2:3 posters and 117 px circles. |
| Ivory pill primary | Apple TV's pill: 40 px tall, radius 40, 15/600. |
| Dominant-colour placeholders | Seen again on Apple TV person posters, Apple Music's artist hero and Behance. |
| Rails with a visible partial next item | Apple TV shows five cards plus part of a sixth. |
| Reference information last, as definition lists | Apple TV's About / Information / Languages / Accessibility. |
| No glass, no glow | Framer's glowing input and the Dribbble agent dashboards show the alternative. |
| Distinct page titles | Every reference has them: "Marty Supreme \| A24"; "Money - song and lyrics by Pink Floyd \| Spotify". |
| Media components before furniture; three rooms; title cards; RTL media LTR (with the caveat in §5.3) | — |

### 5.2 Missed

1. **A24 and Framer** were not studied: A24 for editorial identity and credits, Framer for agent variations and
   progress lines.
2. **A Home page.** The study kept "Home = Shows + Continue strip". The directive now asks for a real Home (§3.1).
3. **Navigation priorities** (5 primary, 4 secondary) (§3.0).
4. **Crew credits by department.** This is the bridge between productions and the Studio Company (§3.2, §3.7).
5. **Agent transparency.** Linear's Agent Interaction Guidelines, and delegation that keeps ownership with the human
   (§1.9, §3.7).
6. **Variations side by side** as the format for agent output (§1.11, §3.11).
7. **Casting-directory references.** IMG Models' line-up, Apple TV's person page, IMDb's person page (§1.15, §3.5).
8. **Art direction per breakpoint.** A24's separate 8×10 phone asset (§1.1).
9. **Typography.**
   - The display-plus-mono pattern.
   - Per-script companions in one stack (Spotify).
   - Width-axis condensed pairings.
   - The Kufi option.
   - Commercial bilingual families.
   - M3's language-height rule (Arabic about 7 % taller).
   - M3's guard rails for editorial treatments.
10. **Arabic numerals.** alreq names Iraq among regions using Arabic-Indic digits. The study kept Western digits
    without discussing it (§4.5).
11. **WCAG 2.2.2 for heroes that advance by themselves.** Only header previews were covered.
12. **Music.** A song has its own page, and lyrics are the first section after the header (Spotify's track page).
13. **Take triage vocabulary** (Resolve 21) and **synchronised version compare** (Frame.io).

### 5.3 Wrong, or in need of correction

1. **Apple TV's title.** The study described "a large plain title" and built "extreme scale contrast: one huge title"
   on it. Measured today, the hero title is an **image** (216×36), and the `<h1>` is visually hidden. Apple TV's contrast
   is *art against small interface type* (headings 17 px, labels 10–13 px). The 64 px text hero is better supported by
   **A24** (74 px text titles; 120 px in its index) and **Spotify** (48/800).
2. **The character ratio** of 2:3. v4 has already corrected it to the canonical 928:1664 (V4-02).
3. **The Arabic hero smaller than the Latin one** (52/72 against 64/64). Apple's RTL guidance says Arabic looks smaller
   at an equal size and suggests going *up*. Match the scripts optically in the spike (§4.4).
4. **RTL media.** The study cited only Material 3 ("media controls are always LTR"). Apple's RTL page says to flip
   controls that show progress, and does not single out media. The standards differ.
   - Keeping seek bars, waveforms and timelines LTR remains defensible for time-anchored editing, where timecodes are LTR
     and both languages share one timeline.
   - Record it as a **choice** and test the Screening Room's seek bar with Arabic-speaking viewers.
5. **"Godly: no usable entries".** Today recent.design rendered. Its content is still of little use for this product
   (§1.16).
6. **Disney+** is still unobserved. Its section stays secondary and low confidence. No change.

---

## Sources

All looked at on 2026-10-03. A date in brackets is the source's own date where it shows one. "(summary)" means a
WebSearch result summary, not the page itself.

**Entertainment**
1. A24 home: https://a24films.com/
2. A24 films index: https://a24films.com/films
3. A24 film page: https://a24films.com/films/marty-supreme (also at 390×844)
4. A24 television: https://a24films.com/television · series page https://a24films.com/television/beef
5. Apple TV show: https://tv.apple.com/us/show/severance/umc.cmc.1srk2goyh2q2zdxcx605w8vtx
6. Apple TV person: https://tv.apple.com/us/person/britt-lower/umc.cpc.e4ifmwyy5vk6akf0ugttqqow
7. Apple TV home (sign-up modal): https://tv.apple.com/us
8. Netflix title: https://www.netflix.com/title/80057281 (served as /iq-en/)
9. Disney+ entity (wall): https://www.disneyplus.com/en-us/browse/entity-2e6ee01d-5be2-4451-81a3-db3d061ef4dc
10. Disney+ article (redirected): https://www.disneyplus.com/explore/articles/disney-plus-app-redesign-new-features
11. Tom's Guide, Disney+ redesign (summary): https://www.tomsguide.com/entertainment/disney-plus/disney-plus-gets-a-major-redesign-heres-whats-changing
12. IMDb full credits: https://www.imdb.com/title/tt11280740/fullcredits/
13. IMDb person: https://www.imdb.com/name/nm0004395/

**Music**
14. Spotify album: https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv
15. Spotify track: https://open.spotify.com/track/0vFOzaXqZHahrZp6enQwQb
16. Apple Music album: https://music.apple.com/us/album/the-dark-side-of-the-moon/1065973699
17. Apple Music artist: https://music.apple.com/us/artist/pink-floyd/487143
18. YouTube Music search: https://music.youtube.com/search?q=pink+floyd · artist https://music.youtube.com/channel/UCO6LS_5W7vqG9mALDNzSFug

**Creative tools**
19. Linear home: https://linear.app/
20. Linear, Agents in Linear: https://linear.app/docs/agents-in-linear
21. Linear, Agent Interaction Guidelines: https://linear.app/developers/aig
22. Figma, Hide or minimize the UI (summary): https://help.figma.com/hc/en-us/articles/41414918021271-Hide-or-minimize-the-UI
23. Figma, Guide to the file browser: https://help.figma.com/hc/en-us/articles/14381406380183-Guide-to-the-file-browser
24. Framer home: https://www.framer.com/
25. Framer Academy, Framer interface [2026-10-02]: https://www.framer.com/academy/lessons/framer-interface
26. Frame.io, Version stacking and comparison (legacy) [2026-04-06]: https://support.frame.io/en/articles/4431-version-stacking-and-comparison-mode-legacy
27. Frame.io V4 player and commenting (summary; fetch 504) [2024-05-28]: https://blog.frame.io/2024/05/28/frame-io-v4-features-player-and-commenting/
28. Frame.io V4 vs legacy (summary): https://help.frame.io/en/articles/9084073-frame-io-v4-legacy-feature-comparison
29. DaVinci Resolve 21, What's new: https://www.blackmagicdesign.com/products/davinciresolve/whatsnew
30. Notion, Home: https://www.notion.com/help/home-and-my-tasks

**Directories and galleries**
31. IMG Models: https://imgmodels.com/ · directory https://imgmodels.com/directory/?view=grid&sort=az&gender=any&category=any&selectedTerritory=any
32. Awwwards Film & TV: https://www.awwwards.com/websites/film-tv/
33. Awwwards, Velour Productions [nominee 2026-09-18]: https://www.awwwards.com/sites/velour-productions · live https://velourproductions.com/
34. Awwwards, Peryton Film [nominee 2026-09-18]: https://www.awwwards.com/sites/peryton-film
35. recent.design (Godly redirect): https://recent.design/?ref=godly · https://recent.design/websites
36. Nothing to Watch: https://nothing-to-watch.port80.ch/
37. Mobbin (403): https://mobbin.com/discover/apps/web/latest · https://mobbin.com/pricing
38. Behance search: https://www.behance.net/search/projects/film%20production%20studio%20website?sort=appreciations&time=year
39. Dribbble, ai agents org chart: https://dribbble.com/search/ai-agents-org-chart
40. Dribbble, casting agency talent directory: https://dribbble.com/search/casting-agency-talent-directory

**Standards**
41. Apple HIG, Right to left: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/right-to-left.json
42. Material 3, Type scale and tokens: https://m3.material.io/styles/typography/type-scale-tokens
43. Material 3, Editorial treatments: https://m3.material.io/styles/typography/editorial-treatments
44. Material 3, Canonical layout examples: https://m3.material.io/foundations/layout/canonical-examples/overview
45. WCAG 2.2, Understanding 2.2.2 Pause, Stop, Hide: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
46. WCAG 2.2, Understanding 1.4.8 Visual Presentation: https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html
47. W3C, Text Layout Requirements for the Arabic Script [Group Draft Note, 2025-10-02]: https://www.w3.org/TR/alreq/

**Type (Google Fonts metadata, `https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/METADATA.pb`)**
48. Families: inter · intertight · instrumentsans · instrumentserif · ibmplexsansarabic · ibmplexmono ·
    notosansarabic · notokufiarabic · notonaskharabic · kufam · markazitext · amiri · newsreader · fraunces ·
    alexandria · readexpro · elmessiri · reemkufi · zain
49. Thmanyah font for everyone (summary; licence page 522): https://ask.thmanyah.com/hc/en-001/articles/45993930027281-Thmanyah-Font-for-Everyone
50. Lyon Arabic and Graphik Arabic (summary): https://eyeondesign.aiga.org/one-design-two-flavors-lyon-arabic-brings-a-new-slant-to-traditional-characters/ ·
    https://fontstand.com/fonts/lyon-arabic-display · https://fontstand.com/fonts/graphik-arabic

**Local (read only)**
51. `docs/research/DESIGN-RESEARCH-2026-10.md`, `docs/DESIGN-SYSTEM-V4.md` §0–§1, §3, §7.1, `docs/REDESIGN-2026-10-03.md`
52. `src/components/shell/nav-model.ts` (navigation today; `HOME = '/shows'`)
53. `src/server/org/model.ts` (`PIPELINE`, `DEPARTMENTS`, `ORG_VERSION = 11`)
