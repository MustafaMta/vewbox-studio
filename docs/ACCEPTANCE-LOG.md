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

### Defects found in A1

| # | Defect | Status |
|---|---|---|
| D1 | Creation page showed a job removed by the cleanup as "in progress" (stale sessionStorage) | fixed `076ac32` |
| D2 | Cast profile image panel was sticky and taller than the viewport: Approve/Redraw unreachable on short screens | fixed `ee223a6` |
| D3 | The C-compiler failure was classified as transient and retried 3× unchanged before failing (it is an environment fault, not transient) | open — classify "Failed to find C compiler" / missing toolchain as INFRASTRUCTURE-non-retryable with a precise message |
| D4 | Creation page after a reload shows "Drawing the image: failed" although the retried drawing succeeded and the image is approved (step state taken from the first failed child; retries are in-memory only) | open |
| D5 | `/characters/new?start=sheet` does not start a new creation while a finished run is remembered; only "Open profile" is offered | open |
| D6 | Profile "Who" row shows "Human" (species) instead of sex · age when the design step fills species | open |
| D7 | Voice panel copy: "No voice yet. Record or upload…" contradicts the Automatic option; the Automatic help still says "(… personality)" though personality is no longer used | open |
| D8 | English voice check does not normalise numbers ("Thirty-two" vs "32") → false CER | open |
