# The design system — the restored September interface, refined

The interface is the one the studio had on 19–23 September 2026 (Git `7c36381`, "the screening room"), brought
into the frontend-only app and refined: a calm midnight ground that lets pictures lead, ivory-white text, one
disciplined violet accent for the primary action and the selected thing, hairline borders, rounded panels, controls
that feel like instruments. Everything visual comes from the tokens in `src/app/globals.css`; the components there,
in `src/components/ui/kit.tsx`, `src/components/ui/page.tsx`, `src/components/ui/cinema.tsx` and
`src/components/library/Cards.tsx` are the whole vocabulary. Pages compose them. What was looked at while refining is
in [DESIGN-REFERENCES.md](DESIGN-REFERENCES.md).

## Tokens

| Group | Value | Where |
| --- | --- | --- |
| Ground `--bg` (`ink-950`) | `#0B0D12` | the page |
| Surface `--surface` / `--raised` (`ink-900`) | `#12151C` | the sidebar, cards, panels |
| Input `--input` (`ink-850`) | `#171B23` | inputs, hover on a card, the writing surface |
| Raised `--raised-2` (`ink-800`) | `#1D222B` | secondary buttons, the active nav item, hover |
| Line `--line` / `--line-strong` (`ink-700` / `ink-600`) | `#282E39` / `#38404D` | hairlines; borders that must be seen |
| Text `--fg` / `--fg-body` / `--fg-muted` / `--fg-faint` | `#F3F2EE` / `#CFD4DE` / `#A0A8B8` / `#737C8E` | titles; body; secondary; hints (4.6:1 on the ground) |
| Violet `--primary` / `--primary-hover` | `#6F5FF0` / `#5A4AE0` | primary buttons, the selected tab's rule, progress, the selected segment, the active nav bar |
| Violet `--accent` (`violet-400`) | `#9A8CFA` | eyebrows, the active nav icon, focus rings |
| Status | ok `#3FCF8E` · warn `#F0B24A` · bad `#F26D6D` · info `#5AA7F5` | dots, badges and words only |
| Media floor `--media` | `#07080B` | under every picture and clip |
| Radii | 8 · 12 · 16 · 20 | small controls 8, buttons and inputs 12, cards and posters 16, dialogs 20 |
| Elevation | `--shadow-1..3` | resting card (with a 1px inner highlight), hovered card, menus and dialogs |
| Motion | 140–160 ms, one ease-out; 500 ms for a picture's hover zoom | reduced under `prefers-reduced-motion` and Settings → Reduce motion |

Contrast: titles on the ground 17:1, body 12:1, muted 8:1, faint 4.6:1, white on violet 4.7:1. One palette, no
light theme, no glow, no glass beyond the badge that sits on a picture, no gradients beyond the scrim under a title on
art and the banner's fade into the ground.

## Type

- **Inter** for everything Latin. Page titles 28px/600 with −0.022em tracking; section titles 17px/600; body 14px;
  hints 12–12.5px; eyebrows 11.5px uppercase with 0.14em tracking in violet; kickers the same in faint grey.
- **IBM Plex Sans Arabic** for the Arabic interface (14.5px base so the two scripts sit level); no tracking or
  uppercase in Arabic.
- Mixed-direction titles: `.bi` — English then Arabic, spaced, each in its own script and direction; `dir="auto"` on
  all user text.

## The shell

A fixed 244px sidebar in the panel colour: the Vewbox aperture mark and name, **New production** in violet, then the
navigation grouped by purpose — Home · **Productions** (Shows, Shorts, Music Videos) · **Library** (Characters,
Locations, Asset Library) · **Studio** (Settings). The active item has a raised background, a violet icon and a
violet bar on its leading edge. At the foot, the one honest line: *Generation not connected*, and whether the sample
data has been changed in this browser. Below the desktop breakpoint the sidebar becomes a top bar (mark, name, a
violet + for New production, a menu button) and a sheet with the same links.

The content column is capped at 1320px with 32px side padding on desktop and 20px on a phone.

## The page furniture (`page.tsx`)

- **PageHeader** — an optional back link, an eyebrow, the title (with its Arabic title beside it), one line of purpose,
  and the primary action on the trailing side. The same on every library page.
- **Section** — a 17px title with an optional count, a description line, an action on the trailing side.
- **Stat** — a metric tile: label, a 28px number, a hint; a link when it opens a library.
- **FactList** — term / value pairs, one per line, hairlines between.
- **ProgressBar** — a 6px violet bar on a raised track.
- **CastStack** — overlapping round faces, an initial where there is no portrait.

## The objects (`Cards.tsx`, `cinema.tsx`)

Each kind of thing the studio keeps has the shape that suits it. All share one surface, one radius, one hover
(border lightens, surface lifts a step, the picture zooms 3%).

- **ShowCard** — wide key art (16:9) with the title and *seasons · episodes · aspect* set on a scrim along its lower
  edge; beneath: the premise (two lines), the cast stack and the style, a progress bar.
- **ShortCard** — a poster (2:3; 9:16 for a vertical film without a poster) with the length as a glass badge at the
  top, and the title, style, cast stack and stage along the lower edge.
- **MusicVideoCard** — a square sleeve with a round play button on the art (the one shared player); beneath: the song
  and the artist, then badges for length, treatment and aspect, then the style and the stage.
- **CharacterCard** — a 4:5 portrait; beneath: the name, *role · style*, and badges for the show and the voice.
- **LocationCard** — a wide plate; beneath: the name, *interior/exterior · style · views*, and an arrow.
- **Art** — any picture in a 16px frame; with no picture, the title set as type — never a fake image.
- **Hero** — the banner header of every detail page: the object's own picture bleeding to the edges at 55% and fading
  into the ground; on its lower edge the art, the eyebrow, the title, a synopsis, one line of facts, one action.
- **Empty** — a dashed frame with an icon tile, a title, a hint and the one action that fixes it.

## Controls (`kit.tsx`)

Buttons: `btn-primary` violet with a 1px inner highlight; `btn-secondary` raised with a strong hairline; `btn-ghost`
a hairline only; `btn-subtle` text; `btn-danger` red-tinted. Heights 40 / 34 / 28. Inputs are the input colour with a
hairline, a violet border and a soft violet ring when focused. Tabs are text with a 2px violet rule under the selected
one and a count chip; the segmented control tints its selected item violet. Badges are pills with a hairline; on a
picture they become glass. Status is a coloured dot and a phrase. Dialogs are native `<dialog>` elements at radius
20 on a raised surface; menus are native `<details>`.

## Players

- **One sound at a time.** A single shared `<audio>` element plays songs, voice lines and files; every video player
  announces when it starts (`src/components/players/coordinator.ts`) and every other source pauses. Nothing starts
  without a press.
- **Song player** (`SongPlayer`) — cover, song, performer, replay, the violet transport, a seek bar with elapsed and
  total time, volume. Below extra-large widths the controls take their own row. The **compact player** follows once
  the full one scrolls away, from the same state. Lyric sections seek the same source and the live one lights up.
- **Voice preview** (`VoicePreview`) — portrait, the voice's name, language and dialect, a source badge (*Sample*,
  *Your recording*, *Studio voice*), play/pause, seek, elapsed/total, replay, and volume behind one button.
- **Video player** — the poster with one play button; once playing, the controls return on movement, touch or
  keyboard focus and stay while paused. Play/pause, frame steps, seek, elapsed/total, volume, captions (only when the
  clip has them), fullscreen. The clip is letterboxed in its own aspect ratio, never stretched or cropped. A missing
  clip is a `VideoPlaceholder` with the reason and, where generation would fill it, the button that says so.
- **Honest states.** A record's length shows as provisional (`~0:48`) until the file's metadata replaces it; loading,
  blocked playback and unreadable files are named, never silent.
- The seek and volume sliders are one component style (`.seek`): a thin track, the played part in violet (white on
  video), a white thumb that grows on hover, a visible focus ring.

## Controls

Buttons: **primary** (violet), **secondary** (raised, hairline), **quiet** (text until hovered), **ghost**
(hairline), **danger**. Heights 40 / 34 / 28 (40 on coarse pointers for the small size); one icon at most; a
`loading` state keeps the size, shows a spinner and blocks a second press; pressed toggles tint violet. Labels are
always visible above fields; placeholders never replace them; validation sits under the field it concerns. Uploads
use one `Dropzone`: click or drop, a visible label, what it accepts, the real input underneath for the keyboard.

## Rules

- One primary action per page, in the header's trailing corner; everything else secondary or in a menu.
- Pictures carry no interface text except what the page sets on the scrim. Bundled sample pictures are illustrations
  drawn by `tools/sample-media.mjs` — one scene per production, one portrait per character from its written profile —
  and carry their own small **SAMPLE** tag in a lower corner, drawn into the file, so they are identifiable wherever
  they appear (provenance: `public/sample/PROVENANCE.md`).
- A character's appearance is preserved once they have been in a video (docs/CHARACTER-CONTINUITY.md); the
  controls that would change it are shown disabled with the reason, never hidden without explanation.
- Every library has the same toolbar in the same place: search, a style filter, its own filter where it has one, and
  the sort — whether the library holds two things or two hundred.
- Home puts the work first (Continue working), then three compact ways to start, then a few of the newest items of
  each kind with *View all*; no counters.
- Advanced choices sit behind a disclosure (`Details`, *More settings*), never in the main flow.
- Every control has a visible focus ring (2px violet); every dialog closes on Escape; every list is a real list.
- Logical properties throughout, so the Arabic interface is the same stylesheet mirrored.
