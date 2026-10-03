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
| D9 | "Write the sheet" voice step says "The voice itself is built from a recording on the profile" — ignores the automatic and design ways | open |
| D10 | Anime style fidelity: two draws of an Anime character came out comic-illustrative rather than cel anime | open — FLUX vs Qwen A/B and prompt review |
| D11 | Casting's design invents brand-like logos/text on clothing ("Mori Express", a star sneaker mark resembling a real brand) | open — design prompt: no logos, lettering or brand marks unless the producer asks |
