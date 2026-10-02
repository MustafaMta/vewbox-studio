# UX strategy — journeys, information architecture, and the character-creation experience

Builds on [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) (detail-page structure, department pages) and [../DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md)
(tokens, furniture, rules). Those are not repeated; this document is about *journeys*: what a producer does, where it
breaks, and what the product should become. Findings quote the component or copy key they come from (read 2026-10-02 in
the code and at http://localhost:4200). Web observations are structural only; no branding or copy is taken.

---

## A. Journey-by-journey findings

### A1. Navigation and the front door (`nav.tsx`, `(app)/page.tsx`, `/new`, `/library`, `/projects`, `/screening`)
- **Three parallel organisations of the same things.** The sidebar has *Shows · Shorts · Music Videos · Characters · Studio
  Company* then a "Behind the scenes" group (`nav.operations`) holding *Production, Locations, Asset Library, Settings*.
  Separately `/library` is a tabbed page (Characters · Locations · Assets) reachable from nowhere, `/projects` is a fourth
  catalogue of shows+shorts+music videos, and `/screening` is orphaned. DESIGN-SYSTEM.md still describes a *Library* group.
- **Locations and files are filed under "Behind the scenes"** next to Settings, although a location is a creative asset the
  producer builds and reuses exactly like a character.
- **Home redirects to `/shows`** while DESIGN-SYSTEM.md promises "Home puts the work first (Continue working)". The only
  "continue" affordance is a small card inside a show's Overview aside (`ShowWorkspace › Overview`).
- **"New production"** (`/new`) offers show / short / music video; a character or location cannot be started from the one
  primary action, so Casting work begins from a library page instead of from the start button.

### A2. Creating a show / season / episode / short / music video (`CreateWizard.tsx`)
- Two paths side by side (Auto Idea card, then Manual brief) is right. Problems are in the ends of each path:
- **Manual show lands in the wrong place.** `Manual.create()` adds the show, then silently adds "Episode 1" with an empty cast
  and navigates to that *episode's* workspace (`productionHref(ep.production)`). The producer asked for a show and never sees
  the show page, its cast tab or its bible.
- **Technical fields in the review.** Duration is a bare number input "Duration (seconds)" 5–3600 (`Review`, `Manual › look`
  "…" custom box); aspect is a `Select` of `aspectLabel`; style previews are three abstract SVGs with no example frame.
- **Waiting is a sentence, not a state.** While AUTO_IDEA runs, the only feedback is `auto.writing` text beside the button;
  the job's `progress.phase` is never shown and the page has no cancel. On failure the notice offers "Use a written example
  instead" — a *sample* proposal (`auto.sampleBody`) that can be accepted and becomes a real project seeded with invented
  content; the sample badge is the only guard.
- **Season Auto context** (`auto.seasonContext`) is a 40-word paragraph in 12.5px faint text; it belongs in a short list.
- **Music video manual path**: `wizard.createdSong` says "Generate the recording from the Story tab" — the tab is called
  *Song & Lyrics* in `MusicWorkspace`.

### A3. The show page (`ShowWorkspace.tsx`)
- **Seasons appear three times**: as cards in Overview, as the Seasons tab (season rail + rows), and as the Episodes tab
  (same `EpisodeRow` grouped by season). Two of the three are redundant.
- **The World Bible** — the show's most important continuity document — is the last section of Overview, below cast and
  world, as five textareas (`WorldBible`). It needs its own tab.

### A4. Producing a short or episode (`FilmWorkspace.tsx`, `StoryTab`, `StoryboardTab`, `ProduceTab`, `FinalCutTab`)
- **Seven tabs, two of which are pickers.** *Characters* and *Locations* are each one `CanonPicker`; for an episode they
  mostly show cast "from the show" that cannot be unticked. One *Cast & World* tab would do.
- **Two progress models side by side.** `p.stage` + "Mark done" buttons (`markStepDone` on Story, Storyboard, Produce,
  Final Cut) and the org pipeline with human gates (`StageGate` STORY / EDIT). A producer sees "Mark done" *and* "Approve"
  and cannot tell which one the studio waits for. Export is blocked by `cutApproved`; the next-step button is driven by
  `nextStep(p)` from `p.stage`. One model must win (the pipeline).
- **Story tab**: "Develop the story" and "Write the script" sit as two equal secondary buttons with hint text only on hover
  (`title=`). The difference (concept + cast vs beats + lines) is invisible.
- **Produce tab is the most technical screen.** The header row holds "Produce every shot", "Re-record speaking shots · N",
  "Record the dialogue" with a `voiced/lines` counter, and a filter; `TakeProvenance` exposes `script-spoken`, WER,
  `workflowVersion`, request ids, "Size", "Workflow" (hard-coded English). A take is chosen by **double-click** on its
  thumbnail or a tiny "Select" link; rejected takes are dimmed to 50% with the reason inside a collapsed Details.
- **Final Cut**: labels "Format", "Resolution", "Subtitles" are hard-coded English; the Export button's *reason for being
  disabled* is only a `title` tooltip (invisible on touch); the mix plan lists `policy` strings and LUFS targets by default.
  Approval of the cut appears only once a non-sample cut exists — before that the producer does not know a gate is coming.
- **Starting any job sends the user away**: `useStartJob` toasts "Started. Progress shows in Activity" with a link to
  `/production` — the job's phase is already shown in place by `JobButton`; the toast teaches the wrong habit.

### A5. Music video (`MusicWorkspace.tsx`, `SongLyricsTab`, `PerformersTab`)
- Structure is good (player in the hero, compact player follows). *Performers* says the voice "is chosen on their character
  page" (`mv.performers.hint`) and links out; next-step copy ("Write the story") still says *story* for the Song tab.

### A6. Characters library (`characters/page.tsx`)
- The **usage** filter exposes *Usage unknown* (`usage.known === false`, a database state) to the producer; the card menu
  offers *Open · Voice · Profile · Delete* — Appearance (the first tab) is missing while Profile (the third) is present.

### A7. Creating a character today (`characters/new/page.tsx`, `CharacterForm.tsx`)
- **Auto** ("Design it for me"): a Name field and a textarea labelled with `auto.premiseLabel` = "Your idea (optional)" that
  is in fact **required** (`required`, button disabled under 2 characters). Style, language and dialect are accepted by
  `DESIGN_CHARACTER` but not offered; they are inherited silently from `?show=`/settings. Progress is one `Notice` with the
  job message ("Designing X"); **failure is a toast and `setJobId(null)`** — the error vanishes, nothing explains what to
  change, and there is no retry in place. Success `router.push`es to the profile, which opens on *Appearance* with
  "No appearance yet" (`char.noAppearance`): the producer must then press *Generate appearance*, then *Draw reference
  views*, then switch to *Voice*, scroll to the bottom to *Upload a recording*, then *Build the voice*. Five manual steps
  across two tabs after a flow that promised "Casting designs the rest: look, wardrobe, personality and voice".
- **Manual**: 22 fields on one screen (identity 7, appearance 10, voice 4 + notes). Hard-coded English placeholders
  ("Café owner, sixty, unhurried", "cat", "Gravelly, warm") and help ("Comma-separated"); `sex` defaults to FEMALE and age
  to 30 without the producer choosing; the only validation is the name. No preview of anything. Create lands on the same
  empty Appearance tab.
- **Image reference**: there is no "from a picture" way in. A reference can only be attached afterwards on the Appearance
  tab (`setPendingReference`). The client accepts any `image/*`; the worker's `usable()` silently drops SVG (and a sample
  picture) and draws **from the description instead**, with no message that the reference was ignored.

### A8. Appearance tab (`CharacterPage › Appearance`, `images.ts`)
- The result slot says "Appears here after generation; progress shows in Activity" (`char.ref.resultHint`); the running
  job's phase is shown in the *button's* place, not in the picture frame where the eye waits.
- Engine preconditions (`requireComfy`: ComfyUI unreachable, nodes missing, Qwen weights missing) are discovered only after
  the job starts and surface as a truncated 16rem error beside the button. The snapshot already carries `capabilities`
  (`comfyui`, `tts`, `asr`, `minimax`) but they are configuration strings, not live health, and are not shown here.
- A new portrait **replaces** the previous one (`setCharacterAppearance … keepExistingRefs: false`); there is no "keep the
  one I like" comparison, so regenerating is a gamble.
- Manual "Add a view" offers a `Select` of `CHARACTER_REF_ROLES` rendered by `words()` ("Three quarter") — a pipeline
  vocabulary the producer should not need.

### A9. Voice tab (`CharacterPage › VoiceTab`, `voice.ts`)
- **Order is inverted.** For a new character the first useful control — *Upload a recording* — is the last element on the
  page, under an empty samples list and a "Build the voice" button that will fail ("has no recording to build a voice from").
- **No automatic voice exists.** Every engine (IndexTTS, Habibi/Iraqi, MiniMax clone) needs a reference WAV
  (`referenceWav` returns null without a real upload; bundled sample voices are excluded). The Auto design job fills
  pitch/pace/timbre words but nothing can be heard.
- **Validation is late and partial.** The hint promises 5–30 s (`voice.uploadHint`); the client checks only `audio/*`; the
  worker takes 0.2–12.2 s of whatever arrives. Nothing measures duration, silence, clipping or language before the GPU runs.
- **Every preview becomes a sample.** `voicePreview` calls `addVoiceSample(..., false)` with the text as label, so the
  "Voices" list grows by one row per try; the proof-line check (`proof-line-wer`, `awaitingReview`) is recorded as a QA
  report but never shown on the page.
- **Engine and provider are invisible.** LOCAL_TTS vs MiniMax is a Settings value (`generation.voiceProvider`); the Iraqi
  engine is chosen from the dialect; lines with Latin words go to the bilingual engine. None of this is explained where the
  voice is built — only the long upload hint mentions Iraqi.
- `voice.lockNote` ("Like the appearance…") is shown even when no voice exists yet.

### A10. The Iraqi Arabic path
- Dialect is only reachable through *Language → Arabic → Dialect* in the form, the wizard's "More settings", and the show
  settings; nothing on the Voice tab shows which dialect the voice will speak. The default preview line is already in
  Baghdadi (good); the "needs an Arabic recording" rule lives in one long hint; the mixed-script fallback is undocumented in
  the UI. Hard-coded English placeholders/labels (A7, A4) break the Arabic interface.

### A11. Reviewing, approving, exporting (`ProduceTab`, `FinalCutTab`, `production/page.tsx`, `jobs/page.tsx`)
- Approvals live in three places (StageGate, the Production row, the orchestrator panel); the *content* to approve is only
  in the tab. Retry asks "What changed?" through `window.prompt`; the error block shows the raw `error.code`.

### A12. The lock (`CharacterPage › LockNotice`, `CharacterForm`, `rules.ts`)
- The lock is explained *after* it happens (notice at the top of Appearance, disabled form fields, voice note) and never
  *before*: nothing at "Generate video" says that this take will fix X's look and voice for good.
- `UNKNOWN` history is presented as a warning badge "Usage unknown" and locks the character — correct policy, but the words
  read as a bug, and no action is offered (there is none; a *variant* should be).

---

## B. What was observed elsewhere (structural, read on 2026-10-02)

- **ElevenLabs Voice Design** [1]: a description prompt + a preview text ("performance script") + two parameters; one press
  returns **three** candidates to audition, one is saved; a "common pitfalls" block sits beside the prompt.
- **ElevenLabs Instant Voice Clone** [2]: reference requirements stated up front (clean single speaker, no noise, consistent
  delivery, a target loudness range); steps are upload/record → name + label → consent → save → voice appears in "My
  Voices"; the clone is used from a picker everywhere afterwards.
- **ElevenLabs Voice Library** [3]: filters language → accent, category, gender, age, quality; each card has one play and
  one "+" to adopt; preview language selectable when a voice has several.
- **NN/g progressive disclosure** [4]: at most two levels; frequent options first, the rest behind a clearly labelled
  disclosure; wizards are *staged* disclosure for things everyone needs later.
- **NN/g progress indicators** [5]: >10 s wants a determinate indicator or, failing that, a phase sentence and a rough
  estimate; always a cancel; "step 3 of 5" style text.
- **DaVinci Resolve Edit / Cut** [6][7]: pages in a fixed order, each a complete workspace; the Inspector hides advanced
  controls behind disclosure triangles; the Cut page is a reduced panel set of the same project for fast assembly.
- **Spotlight profile** [8]: 3–5 photos, the first clearly the person; showreel short with the performer in the first
  scene; voice reel optional beside it; credits in tabs by category once they grow; skills/accents searchable.
- **Casting Networks profile** [9]: an *About* line with a hard character limit; media added and *arranged* (a primary
  photo); attributes with proficiency and an attached clip; up to three highlighted credits pinned at the top.
- **Suno create page** [10]: simple vs custom mode; results return as comparable cards with play/extend/replace-section.
- **Midjourney character reference** [11]: one reference image, a 0–100 weight (face only → face+hair+clothes), explicit
  statement of what is *not* preserved (fine marks, logos).
- Not readable from here (403): Runway help centre, Backstage, Adobe HelpX, docs.midjourney.com; nothing from those is cited.

---

## C. The information architecture

**Primary (always visible, in this order):** Shows · Shorts · Music Videos · Characters · Studio Company.
**Library (second group, renamed from "Behind the scenes"):** Locations · Files. Characters stays primary because casting
is a product area; the group label tells the producer that Locations/Files are the same kind of thing as Characters.
**Studio (third group):** Production (pipeline + activity) · Settings. `/library`, `/projects`, `/screening` are removed or
redirected; `Home` = Shows with a *Continue working* strip at the top (the one in Show › Overview, promoted).
**One primary action** ("New…") opens a sheet with five starts: Show, Short, Music video, **Character**, Location.
**Needs-you badge** on *Production*: count of approvals waiting + failed jobs; the Studio Company orchestrator keeps its
state and diagram as the behind-the-scenes view (concept kept as is).

| Page | Tabs (primary first) | Behind a disclosure / secondary |
|---|---|---|
| Show | Overview · Episodes (season rail; replaces Seasons + Episodes) · Cast · World · **Bible** · Settings | season edit/delete in the rail's menu |
| Short / Episode | Overview · Story · **Cast & World** · Storyboard · Produce · Final Cut | provenance, prompts, mix plan, loudness |
| Music video | Overview · Song & Lyrics · Performers · Visual Story · Storyboard · Produce · Final Cut | same; voice fix inline in Performers |
| Character | Appearance · Voice · Profile · Used In | view kinds, engine choice, QA transcripts |
| Studio Company | Diagram (kept) · Departments · Agents | runs, tool calls, reliability |
| Production | Pipeline (approvals) · Activity | job JSON, logs |

**Activity as a drawer.** Any `JobButton` opens the job's log in a right-hand drawer (PRODUCT-DESIGN §10.1) instead of the
"Progress shows in Activity" toast; the Production page remains the full list.
**One progress model.** `p.stage` becomes derived from the pipeline; "Mark done" buttons go; the next-step button and the
stage strip read the same record the StageGate reads.

---

## D. Character creation — the experience

`/characters/new` is one page with a **three-way start** (ChoiceCards, as the wizard's song step): *Describe them* (Auto),
*Write the sheet* (Manual), *From a picture* (Image reference). Above the cards, a short shared header: *For* (show /
production, prefilled from `?show=`), *Style*, *Language → Dialect*. These three decide the engines and the look and are
the only fields every path needs. Everything else is per path, two levels deep at most [4].

### D1. Auto — "Describe them"
1. **Brief** (required, ≥ 10 characters; label "Who are they?", hint "A line is enough: role, age, where they come from,
   how they carry themselves"), **Name** (optional; if given, checked against the library and a duplicate warned).
   *Preferences* (disclosure): sex, age, species, "voice should feel…".
2. **Validated before anything starts:** brief length; style/language set; the image engine reachable (a live
   `GET /api/capabilities/health` — Backend; today only config strings exist); for Arabic, a dialect chosen. A failed check
   is shown *in the form*, with the fix (link to Settings → Engines), and the button stays disabled with the reason visible
   (not a tooltip).
3. **One job chain, one stepper.** Pressing *Design* starts `DESIGN_CHARACTER` and, on success, the page itself chains
   `CHARACTER_APPEARANCE` then `CHARACTER_REFS` (Frontend, today) — or a parent `CREATE_CHARACTER` job does (Backend,
   preferred, so a reload or a second tab sees one thing). The producer sees a four-row stepper, each row naming the real
   job and its real phase, never a percentage the worker did not report:
   - *Writing the sheet* — DESIGN_CHARACTER: GENERATING "Designing ⟨name⟩" (LLM, ~20 s).
   - *Drawing the portrait* — CHARACTER_APPEARANCE: PREPARING "Checking the image engine" → GENERATING "Drawing ⟨name⟩" or
     "waiting behind N in the GPU queue" (message already emitted by `draw()`), VALIDATING "Checking the picture",
     POSTPROCESSING "Adding to the library" (Backend adds the last two phases; today only GENERATING is emitted).
   - *Reference views* — CHARACTER_REFS: GENERATING "⟨name⟩: side view · 2/5" (step/total exist).
   - *Voice* — see §E; runs only when a reference recording exists or a studio voice was chosen; otherwise the row reads
     "No voice yet — add one on the profile" and is not a failure.
   The sheet (name, role, three facts) appears under the stepper as soon as step 1 completes, then the portrait replaces
   the placeholder frame *in place* (not "progress shows in Activity"). Cancel is one button for the chain; a cancelled
   chain keeps what was finished (the record exists after step 1).
4. **Failure, per step, in place.** The step row turns red with the plain message and one recovery action, mapped from
   `StudioError.code`: `UNAVAILABLE` → "Start the image engine, then Retry"; `NOT_CONFIGURED` → "Download the model
   (Settings → Engines)"; `PROVIDER` ("returned no image") → *Retry* (with the optional "what changed" note inline, not a
   `window.prompt`); `INVALID` → the field it names is focused; LLM failure on step 1 → *Retry* and *Write it myself*
   (opens Manual with name + brief prefilled). The brief and preferences are never cleared on failure (today `setJobId(null)`
   + toast loses the state). A failed later step leaves a complete record: the page says "⟨Name⟩ exists; the portrait did
   not draw" and the profile opens with that step flagged.
5. **Handoff.** When the chain ends, the stepper collapses into a *Ready* card: portrait, name, role, three traits, the proof
   line with a play button if a voice was built, and one primary action **Open profile** (auto-opened after a short pause;
   the card stays as the page's state if the producer stays). The profile opens on Appearance with a one-time banner "Just
   created: sheet · portrait · 5 views · voice (verified)" and *Next* chips for what is missing (e.g. "Add a voice").

### D2. Manual — "Write the sheet"
Staged in three short steps with a live **sheet preview** on the right (name, eyebrow *style · age · sex*, role line, the
trait badges as typed): 1 **Identity** — name, Arabic name (only when language = AR or the interface is Arabic), role line
(one sentence; the Casting Networks "About" idea with a visible counter), sex, age (segmented: child · teen · adult · older
with an exact field behind "Exact age"), species behind *Details*. 2 **Look** — one textarea "Describe how they look"
plus *Fill the rest for me* (runs `DESIGN_CHARACTER` with the text as brief and the name fixed, and writes the structured
fields back for review) or *Details* with build · face · hair · skin · eyes · wardrobe and distinguishing marks as a chip
input (not "Comma-separated"). 3 **Voice** — pitch, pace as segmented controls, timbre as free text, performance notes
behind *Details*; an optional recording drop (validated as in §E3). **Review**: the sheet, then *Create* (record only) or
*Create and draw* (record + the appearance stepper of D1 steps 2–4). Validation before drawing is the same as D1.2.

### D3. From a picture — "Image reference"
1. **Drop the picture first** (the thing the producer has in hand). Accepted: PNG, JPEG, WebP; ≤ 20 MB; shortest side
   ≥ 512 px (read in the browser before upload); **SVG and GIF refused with a sentence** (the worker ignores SVG today).
   Shown immediately at 4:5 with "Your reference" and the standing note "a guide, not the appearance until a drawing
   replaces it" (`char.generate.lead`, kept).
2. **Identity**: name, role line, style, language/dialect; a short "Keep / change" field ("keep the face and hair; put her in
   a 1970s Baghdad café"). Reference weight is not a slider: two choices, *Keep the face only* / *Keep face, hair and
   wardrobe* (the Midjourney 0/100 distinction [11], as words), passed into the prompt suffix the handler already builds.
3. **Draw**: the D1 stepper from step 2, with the reference and the result side by side (the Appearance tab's two-frame
   layout, kept). The result frame holds the phase while drawing. **Keep or redraw**: a redraw produces a second candidate
   next to the first; the producer picks; unchosen candidates stay in the library as alternates (Backend: stop
   `keepExistingRefs: false` from discarding; add `chooseAppearanceCandidate`). Reference views are drawn only from the
   chosen one.
4. Failure and handoff as D1.4–5; an ignored or unusable reference is a hard error before the job, never a silent
   fallback to text.

---

## E. The voice experience

- **E1. Automatic voice.** Introduce a **studio voice bank**: a small set of consented reference recordings per language,
  dialect, sex and age band, stored as real `AUDIO` assets (not the UI placeholders `referenceWav` rightly ignores). Auto
  creation picks the best match from the sheet's language/dialect/sex/age and runs `VOICE_BUILD`; the bank is browsable on
  the Voice tab as cards with one play and one *Use this voice* (the Voice Library pattern [3]). Until the bank exists the
  Auto path says so honestly and offers the two manual ways.
- **E2. Manual voice (Voice tab, reordered).** Top: the **Voice identity card** — either the built voice (proof line player,
  engine named in words: "Iraqi dialect engine" / "Bilingual studio engine" / "MiniMax clone", verified badge from
  `proof-line-wer`, "Heard: …" transcript behind *Details*) or an empty state with the two actions side by side: *Upload a
  recording* and *Choose a studio voice*. Below: characteristics (language · dialect read from the profile with a one-line
  note "the dialect chooses the engine"; pitch, pace, timbre, notes editable in place). *Advanced* disclosure: engine
  override (auto / IndexTTS / Habibi / MiniMax when a key exists — today a global Setting), the note that Latin words in a
  line go to the bilingual engine. **Preview a line** keeps its modal but the result lands in the identity card as *Latest
  preview* with *Keep as a sample*; previews stop being appended to the Voices list by default (Backend: `addVoiceSample`
  with a `preview: true` flag, pruned to the last three).
- **E3. Reference voice — validation before the GPU.** Format: WAV, MP3, M4A, OGG (listed under the dropzone). Duration
  measured in the browser from `<audio>` metadata: < 2 s refused, 2–5 s warned ("short; the voice may wander"), 5–30 s ok,
  > 30 s accepted with "the first 12 seconds after a short lead-in are used" (what `referenceWav` does). After upload,
  `MEDIA_PROBE` is extended to report silence ratio, clipping and integrated loudness (Backend, S) and the row shows
  *Quiet* / *Clipped* / *Mostly silence* badges with the fix. Language check: the worker already transcribes the reference
  with `language: 'auto'` for Habibi; expose the detected language and warn "This recording sounds English; an Iraqi voice
  needs an Arabic recording" before *Build* (Backend, M). Build then shows PREPARING "Reference recording for ⟨name⟩" →
  GENERATING "Cloning with MiniMax" or "Speaking a proof line" → **VALIDATING "Listening back"** (new phase around
  `verifyLine`) → done with the verified / needs-a-listen result on the card (the `awaitingReview` flag, finally visible).
- **E4. Iraqi Arabic.** When dialect = Iraqi Baghdadi: the upload hint shrinks to "Arabic recording, 5–30 s"; the identity
  card names the engine; the default preview line stays Baghdadi; the Arabic name is asked for in Identity because the
  proof line uses `nameAr`.

---

## F. Communicating the lock

1. **Before it happens.** On a shot's *Generate video* / *Produce every shot* when the shot contains an unused character:
   an inline line under the button, "This take will fix the look and voice of ⟨names⟩ for continuity", with a link to each
   profile; shown once per production per character (dismissable), never a modal.
2. **At the moment.** The take's row and the character's Used In entry record it (exists).
3. **After.** Keep the Hero status (`UsageStatus`), move `LockNotice` from the top of Appearance to a slim bar *inside* the
   generate card next to the disabled controls so the portrait is not pushed down; disabled controls keep
   `aria-describedby` (exists). Voice lock shows only when a voice identity exists (today's rule) and on the identity card.
4. **Words.** "Usage unknown" → "History not on record — preserved as if used", with one sentence why. Offer the sanctioned
   way out everywhere the lock is shown: **Create a variant** (duplicates the sheet as a new, unused character with
   "variant of ⟨name⟩" in its notes; Backend S). The rule itself (docs/CHARACTER-CONTINUITY.md) does not change.

---

## G. Prioritised changes (S ≤ 1 day · M 2–4 days · L > 1 week)

| # | Change | Effort | Owner |
|---|---|---|---|
| 1 | Character creation page: three-way start, shared header, stepper with real phases, in-place failures with coded recovery actions, Ready card and profile banner (D1–D3) | L | Frontend (+ Designer for the stepper and Ready card) |
| 2 | Parent `CREATE_CHARACTER` job chaining design → appearance → refs → voice; emit PREPARING/VALIDATING/POSTPROCESSING in image and voice handlers; `error.code → copy` table | M | Backend |
| 3 | Pre-flight health endpoint (ComfyUI nodes/weights, TTS, ASR, MiniMax key) and its use before every GPU button | M | Backend (endpoint) · Frontend (gating) |
| 4 | Reference-image validation in the browser (type, size, min side; refuse SVG/GIF) and a hard error for an unusable reference instead of a silent text fallback | S | Frontend · Backend (error) |
| 5 | Voice tab reorder: identity card first, two empty-state actions, characteristics, advanced disclosure (E2) | M | Frontend · Designer |
| 6 | Recording validation: browser duration, probe badges, detected-language warning; VALIDATING phase around `verifyLine`; show `proof-line-wer` result | M | Backend · Frontend |
| 7 | Studio voice bank (consented clips per language/dialect/sex/age) + *Use this voice* cards; Auto voice selection | L | Backend · Designer (bank curation) |
| 8 | Appearance candidates: keep alternates on redraw, choose one, views from the chosen | M | Backend · Frontend |
| 9 | Previews not appended to the sample list; "Keep as a sample" | S | Backend · Frontend |
| 10 | Lock pre-warning on Generate video / Produce every shot; notice placement; "Usage unknown" wording; *Create a variant* | M | Frontend · Backend (variant command) |
| 11 | Nav: Library group (Locations, Files), Studio group (Production, Settings), New… sheet with five starts, needs-you badge; retire `/library`, `/projects`, `/screening`; Home = Shows + Continue strip | M | Frontend |
| 12 | Manual show creation lands on the show page (no auto "Episode 1"), or creates it and lands on the show with the episode offered | S | Frontend |
| 13 | Show page: merge Seasons + Episodes, Bible as a tab | M | Frontend |
| 14 | Film workspace: Cast & World one tab; pipeline as the single progress model (remove Mark done, derive `p.stage`) | M | Frontend · Backend (stage derivation) |
| 15 | Produce tab: one-click take choice (radio card), rejection reason visible on the thumbnail, provenance/WER/workflow behind *Advanced*; Final Cut: disabled-reason text under the Export button, i18n for Format/Resolution/Subtitles/Size/Workflow | M | Frontend · Designer |
| 16 | Replace "Started. Progress shows in Activity" toast with an in-place phase and an Activity drawer; retry note inline instead of `window.prompt` | M | Frontend |
| 17 | Copy pass: hard-coded placeholders/help to i18n; "Your idea (optional)" on a required field; duration in words (1 min · 3 min · custom) not seconds; Auto-season context as a three-item list | S | Frontend · Designer (copy) |
| 18 | Characters library: usage filter → Unused / In videos only; card menu Open · Appearance · Voice · Delete | S | Frontend |

Recommended order: 4, 17, 12, 18 (cheap, visible) → 2, 3, 1 (the creation experience) → 5, 6, 9, 8 → 10 → 11, 13, 14, 15, 16 → 7.

---

## Sources read
[1] https://elevenlabs.io/docs/product-guides/voices/voice-design
[2] https://elevenlabs.io/docs/product-guides/voices/voice-cloning/instant-voice-cloning
[3] https://elevenlabs.io/docs/product-guides/voices/voice-library
[4] https://www.nngroup.com/articles/progressive-disclosure/
[5] https://www.nngroup.com/articles/progress-indicators/
[6] https://www.blackmagicdesign.com/products/davinciresolve/edit
[7] https://www.blackmagicdesign.com/products/davinciresolve/cut
[8] https://www.spotlight.com/news-and-advice/how-to-create-your-best-spotlight-profile/
[9] https://support.castingnetworks.com/en/articles/11227969
[10] https://jackrighteous.com/en-gb/blogs/guides-using-suno-ai-music-creation/suno-ai-v4-5-plus-create-page-guide
[11] https://updates.midjourney.com/character-refs/
