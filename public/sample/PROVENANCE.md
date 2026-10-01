# Sample media — provenance

Everything in this folder was made by `tools/sample-media.mjs` in this repository, from nothing:

- **Pictures** (`covers/`, `characters/`, `locations/`, `frames/`) are SVG illustrations drawn by that script: the
  café, the book alley, the rooftop, the riverbank, the hospital corridor and the kites roof as scenes, with the
  studio's sample characters in them; each character's portrait and reference views are built from the written
  profile in `src/demo/fixtures.ts` (Basbousa is a cat). Each picture carries a small **SAMPLE** tag in a lower corner.
- **Clips** (`takes/`) are ffmpeg colour fields with a drifting shape and a quiet tone.
- **Sounds** (`audio/`) are ffmpeg sine tones: a four-chord loop as the example song, a two-tone loop as the
  uploaded track, short tones at speaking pitches as voice samples.

No photograph, recording, licensed asset, stock image or model output is used or referenced. None of this is
production output of the studio, and the interface never presents it as such: it is labelled sample content wherever
it is chosen. Regenerate with `pnpm sample-media -- --pictures` (pictures only) or `pnpm sample-media` (with ffmpeg on
the path, also clips and sounds).
