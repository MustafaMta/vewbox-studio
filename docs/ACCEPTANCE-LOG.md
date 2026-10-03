# Acceptance log — real runs through the browser (directive of 2026-10-03, Wave D)

Every entry is a real run on the shared stack (dev server :4200, worker, ComfyUI, TTS services) driven through the
browser, with the evidence it produced. Defects found are listed with their fix status.

## A1 — Cartoon character, Auto ("Describe them"), English — 2026-10-03

- Brief: "A retired lighthouse keeper in his seventies who now repairs old radios in a seaside workshop; kind,
  stubborn, always wears a navy wool cap and a yellow raincoat over a striped sweater." Name: Elias Moore. Cartoon,
  English. Character `char-56c47abc59`.
- Chain: DESIGN_CHARACTER completed → CHARACTER_APPEARANCE **failed** (ComfyUI "Failed to find C compiler": the
  ComfyUI container recreated from main ran an image older than its Dockerfile, without gcc — root-caused; image
  rebuild started; gcc present in the running container) → retried from the creation page ("Try again") → canonical
  image drawn (v1) → reviewed: CG cartoon render, front full body head to boots, clean background, matches the brief
  (navy cap with red button, yellow raincoat, striped sweater) → **approved through the profile** (Approved · Version 1).
- Voice: AUTOMATIC from the profile ("Make the voice") → designed EN voice (VoxCPM2, 3 candidates, previews through
  IndexTTS) → identity pinned, labelled "Studio-designed synthetic voice — not a real person"; proof "Hello. My name is
  Elias Moore, and this is my voice." measured 100 % words heard, loudness OK; played in the profile player (5.9 s,
  audio element playing). Listening: none yet — naturalness not claimed.
- Preview: "Did you see the 1987 storm, Clara? Thirty-two ships came home that night." → heard "Did you see the 1987
  storm, Clara? 32 ships came home that night." (correct speech); CER 0.14 only because "Thirty-two" was written "32";
  −19.1 LUFS, TP −2.18 dBTP, 0 clipped, seed-to-line similarity 0.80.

## A2 — Anime character, Manual ("Write the sheet"), English — 2026-10-03

- Sheet: Hana Mori, woman, teen band (16), "A seventeen-year-old courier who races messages across a rain-soaked
  harbour city on her bicycle"; look written by the producer incl. an asymmetric detail ("a single teal streak on her
  left side", "a courier bag strapped across her right shoulder"); voice high/quick; Anime; "Create and draw".
  Character `char-9b904cf79c`. Chain: design → image (102.8 s total) → voice skipped ("no voice requested").
- v1 `gen-4e66ceb421` (framing check ok): head to feet, neutral grey, wardrobe as written (yellow rain jacket, grey
  hoodie, black cargo shorts + knee pads, red high-tops, bag strap over her right shoulder) ✓. Misses: teal streak on
  her RIGHT ✗ (known ~2/3 one-sided reliability); style reads as Western comic illustration more than clean cel anime
  (partial); Casting added a scar, freckles, a phoenix tattoo and "Mori Express" logos (from the designed wardrobe text;
  the image followed the sheet); a star logo on the sneakers resembles a real brand mark ✗.
- **Redraw** through the profile ("Redraw image") → v2 `gen-862c1580b5` DRAFT version 2; v1 retiered RAW (never shown) ✓.
  v2: same character, same misses (streak on her right; comic-like style) — consistent, so the style gap is the
  pipeline's, not a seed's. Fed to the FLUX vs Qwen comparison (anime style fidelity).

## A3 — Realistic character, Auto, Arabic (Iraqi Baghdadi) — 2026-10-03

- Brief (Arabic): «صاحب مقهى شعبي في شارع المتنبي ببغداد، بالستينات من عمره، هادئ وحكيم ويحب يحچي قصص الزمن
  القديم، يلبس دشداشة رمادية وسترة صوف بنية ونظارات طبية». Name أبو سلام. Realistic. `char-bc112248bf`.
- v1 `gen-ae45fc676a`: photographic studio portrait, head to feet ✓, glasses ✓ — but **no dishdasha, no cardigan**:
  the design model wrote the garment as «deshdaша» (two Cyrillic letters) and the identity line dropped the whole
  wardrobe field → **D12** root-caused and fixed (`bbfa91f`: stray-alphabet words transliterated; only a field with a
  word wholly in another script is reported). Full beard drawn where the design says a moustache (prompt adherence).
- **Redraw** after the fix → v2 `gen-655c17f72b`: grey-blue robe with an embroidered hem, terracotta cardigan frayed
  at the elbows, patterned trousers, leather slippers — the designed wardrobe ✓; the robe reads tunic-length rather
  than an ankle-length Iraqi dishdasha (cultural accuracy partial); beard still full. **Approved** (Version 2).
- Voice: AUTOMATIC for an Iraqi character without a recording → the panel says «Iraqi voices are cloned from a real
  Iraqi recording: record or upload 5–12 seconds of the voice» and offers the recording path with the required
  consent choice ("This is my voice" / "I have the speaker's permission") — no designed voice passed off as Iraqi ✓.
  A real Iraqi voice needs an authorised Iraqi recording (the producer's own, or decisions V3/V4).

## A4 — Image Reference ("From a picture"), Cartoon, English — 2026-10-03

- Reference: the approved Realistic image of A3 (`gen-655c17f72b`), put into the page's file input (same path as a
  drop). Checked at upload: "size and sharpness checked; the face is not checked (no face detector is installed)" —
  review finding 2 verified in the browser. Keep: face, hair and wardrobe. Name Salam. `char-1cc31bc31d`.
- Chain: design (look left to the picture) → vision description → identity line «stylized 3D animated character, a man
  aged about 60-70; … long wavy grey hair, top knot; brown eyes; light brown skin; full grey beard and mustache; glasses
  (thin metal frame); wearing brown cardigan, grey tunic, black red dots pants; brown leather shoes» (accurate to the
  picture) → canonical image `gen-efaaf6632b`, framing check ok.
- Result: strong likeness to the reference (top knot, glasses, beard, cardigan, embroidered tunic, dotted trousers,
  slippers), full body ✓. Style: a CG render, but only mildly stylised — closer to photoreal 3D than A1's cartoon
  (partial style fidelity, see D10/FLUX comparison).

## A5 — "Design a voice" (three candidates, choose one), English — 2026-10-03

- On Hana Mori (A2): "Design a voice" → the description written from the profile («A woman of about 16, a high voice,
  quick delivery, bright and playful, with a metallic edge from shouting over rain, speaking English.») → "Design three
  voices" → VOICE_DESIGN completed → three candidates in the panel, each labelled "Studio-designed synthetic voice — not a
  real person" with its measured intelligibility (97 %, 100 %, 100 % of words heard) and a real player.
- Candidate 2 played (8.8 s file, the audio element playing) → "Choose this voice" → VOICE_BUILD (DESIGN mode, 21.5 s):
  proof heard back "Hello, my name is Hana Mori, and this is my voice." CER 0 / coverage 1 / PASS; ranking recorded
  (gates passed first, then mean seed-to-line similarity, then CER).

## A6 — Persistence across a full restart — 2026-10-03

- Before: Elias Moore APPROVED/DESIGNED voice · Hana Mori DRAFT/DESIGNED voice · Salam DRAFT/no voice · أبو سلام
  APPROVED/no voice. Stopped the dev server and the worker, restarted the Postgres container (healthy at 03:00:49Z),
  restarted both cold.
- After: identical rows in the database; the directory lists the same four with the same states; Elias's profile shows
  "Approved · Version 1" and his voice plays (audio element playing). ✓

## A7 — Image Reference after the pipeline follow-up, Cartoon, English — 2026-10-03

- Same reference as A4 (`gen-655c17f72b`, a full-body photographic studio image), uploaded through the page's file
  input; name Najm, no role, "Face, hair and wardrobe". `char-e71e80cde4`.
- D15 verified: the picture was read before the design ("Najm — reading the reference picture"); the design gave
  Male · 65, role "Retired librarian and amateur astronomer" (A4 had "a young, curious explorer", 16).
- v1 (FLUX.2 klein 4B, framing ok, 4 s): strong likeness, but a **photograph**, not a Cartoon → **D18**, root-caused
  (a full-body photo in the canonical framing + "exactly as in the picture" + a thin Cartoon medium), fixed and
  measured on the GPU (`docs/evidence/image-v2/d18`).
- Redraw without a new picture → **D19** found first (the dialog promised "from the written look", which is empty for
  a picture-made character); fixed; the redraw note reads "drawn again from the earlier reference picture
  (up-684a0b8479)". v2: stylized CG render, same face, beard, glasses, top knot, cardigan, tunic with its border,
  dotted trousers, shoes — **approved** (Version 2).
- Voice: Automatic → designed EN voice, proof "Hello, my name is Najm, and this is my voice." heard verbatim (CER 0,
  coverage 1), ACTIVE; labelled synthetic; nobody has listened yet (naturalness not claimed).

## A8 — Short "The Static Sky" through the browser (in progress) — 2026-10-03

- New Short → Auto Idea with a one-line idea, Cartoon, English, 1:00, cast Elias Moore + Najm. The research-driven
  pipeline ran for real (142 s): GDELT and Wikipedia queried; TikTok, Instagram (and the other keyed platforms)
  reported NOT_CONFIGURED with the reason; 15 dated sources recorded; audience, three concepts, draft, two reviews, one
  revision. Proposal `proposal-b7fcab3684`, production `short-28bdb3342b`.
- The proposal tied Elias (72) to his wife's loss in **1947** (introduced by a reviewer's note, kept by the revision,
  never re-read) → **D20**; corrected by hand to 1987 in the premise, scene purposes, hook, ending, beats and the
  location (which needed D23's fields to reach), then the script and an 8-shot plan (61 s, 6 dialogue lines).

### Defects found in A1

| # | Defect | Status |
|---|---|---|
| D1 | Creation page showed a job removed by the cleanup as "in progress" (stale sessionStorage) | fixed `076ac32` |
| D2 | Cast profile image panel was sticky and taller than the viewport: Approve/Redraw unreachable on short screens | fixed `ee223a6` |
| D3 | The C-compiler failure was classified as transient and retried 3× unchanged before failing (it is an environment fault, not transient) | fixed `fa60bde` (ComfyUI ENVIRONMENT kind, non-retryable, fix-the-container message; test) |
| D4 | Creation page after a reload shows "Drawing the image: failed" although the retried drawing succeeded and the image is approved (step state taken from the first failed child; retries are in-memory only) | fixed `d455e2c` (a later job of the step's kind for the same character supersedes; tests); verified live: the run now reads "Approved — the character is ready" |
| D5 | `/characters/new?start=sheet` does not start a new creation while a finished run is remembered; only "Open profile" is offered | fixed `d455e2c`; verified live: the sheet form opens |
| D6 | Profile "Who" row shows "Human" (species) instead of sex · age when the design step fills species | fixed `17bedc5` (`nonHumanSpecies`; design stores none for people; tests) |
| D7 | Voice panel copy: "No voice yet. Record or upload…" contradicts the Automatic option; the Automatic help still says "(… personality)" though personality is no longer used | fixed `2255c1a` |
| D8 | English voice check does not normalise numbers ("Thirty-two" vs "32") → false CER | fixed `d8d5897` (digits spelled as words on both sides; near misses stay close; tests incl. the real preview line) |
| D9 | "Write the sheet" voice step says "The voice itself is built from a recording on the profile" — ignores the automatic and design ways | fixed `e6dd46d` (both creation hints name the designed and the recorded way; Iraqi needs an Iraqi recording) |
| D10 | Anime style fidelity: two draws of an Anime character came out comic-illustrative rather than cel anime | improved `f9ecfde` (style named "Japanese TV anime" with eyes/line/shading spelled out: Qwen text courier 2/2 western → 2/2 anime by eye; klein photo→anime 4/4 → 1/4 western); to re-verify in the next browser run |
| D11 | Casting's design invents brand-like logos/text on clothing ("Mori Express", a star sneaker mark resembling a real brand) | fixed `cd648f8` (design skill 2.1.0 rule; negative prompt) — to re-verify on the next design |
| D12 | A garment word with stray Cyrillic letters ("deshdaша") dropped the WHOLE wardrobe from the identity line | fixed `bbfa91f`; verified in a real redraw (v2 shows the designed wardrobe) |
| D14 | The voice description written from the profile says "A woman of about 16" for a teenager (the panel's builder ignores age bands; the image's identity line already uses "teenage girl") | fixed `2d4f236` (noun follows the age band; test) |
| D15 | Image Reference: with no role given, the design step invented "A young, curious explorer … floating islands" for a picture of a man of 60–70 — the non-visual design does not see the picture's description | fixed `3cbaf73` (picture read before the design; the design is held to its apparent age, sex and visible clothing; a contradicting role becomes "to be decided by the producer"); unit-tested — to verify in the next browser run |
| D13 | Realistic prompt adherence: a "thick, gray mustache" drawn as a full beard (2/2 draws); an Iraqi dishdasha drawn tunic-length | partial `1d7cd4c` (facial hair stated exactly; robes given their cut): on the GPU the robe went from mid-thigh to mid-calf (not yet ankle); the full beard persists — a model limitation (docs/evidence/image-v2/d13) |
| D17 | Creation Ready card: "No voice yet — add a recording on the profile" (only the recording way) | fixed `9207f4a` |
| D18 | Image Reference: a full-body photo redrawn as Cartoon stayed a photograph (klein copied it) | fixed `57ef7b1` (Cartoon medium names its traits; a stylized redraw asks for a new rendering; GPU: 14/14 whole figure, Cartoon 8/8 stylized, Realistic unchanged, no invented glasses); verified in the browser (A7 v2) |
| D19 | Redraw of a picture-made character without a new picture drew from the empty written look | fixed `a9854db` (reuses the earlier picture; the dialog says so); verified in the browser (A7) |
| D20 | Auto Idea: a character tied to a year before they were born (Elias, 72, and "his wife vanished in 1947"); the one revision is never re-read | fixed `4d266c1` (birth years and a timeline rule for the writers; a code check on the Story Editor's review and on the final draft, whose findings travel with the proposal as `openIssues`); unit-tested — the proposal review UI must show `openIssues` (P1a) |
| D21 | Proposal review: the structure (scenes), hook and ending are read-only although the page says "everything is editable" | open — P1a (the review is rebuilt with the creation flows) |
| D22 | Proposal → project: scenes created with no location although the proposal had one place, and time of day MORNING for a night story | open — to fix in the proposal acceptance (`acceptProposal`) |
| D23 | The scene "purpose" (read by the script writer and the shot planner) and the Auto Idea hook/ending (fixed intent in every later prompt) were not visible or editable: a producer's correction left the old facts in force | fixed `3a8edef` (Story tab fields); verified in the browser (A8) |
| D16 | Image Reference engine changed | `7d78b24`: FLUX.2 klein 4B (Apache-2.0) after a 48-redraw confirmation (whole figure 48/48, no invented attributes, ≈4 s against ≈105 s); Qwen-Image-Edit stays as rollback (`CANONICAL_REFERENCE_ENGINE=qwen`); to verify in the next browser run |
