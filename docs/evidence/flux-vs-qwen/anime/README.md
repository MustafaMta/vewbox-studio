# D10 — "Anime" drawn as a western cartoon: what measurably changes it (2026-10-03)

The FLUX-vs-Qwen A/B found photo → Anime redraws coming out as a western flat cartoon in both engines (8/8), and
Qwen's text courier as a western comic (2/2). Straight through ComfyUI (no studio job, empty queue, voice / ASR /
design services unloaded). Driver `run.ts`; every prompt, seed, framing and verdict in `results.json`; sheets
`sheet-reference-<upload>.jpg` (W0 s0, s1 | W1 s0, s1) and `sheet-text-<character>.jpg` (W0 s0, s1 | W1 | W2).

## Wordings

- **W0** — shipping: "2D anime character design, cel-shaded illustration with clean line art and flat colours" (Qwen
  lead) / "a 2D anime character (cel-shaded …)" (klein noun); identity line "2D anime character, …".
- **W1** — "Japanese anime" named with what makes it anime: "Japanese anime character design, drawn like a modern
  Japanese TV anime: large expressive anime eyes with highlights, small simple nose and mouth, thin clean line art, cel
  shading with hard-edged two-tone shadows, flat colours"; identity line "Japanese anime character, …".
- **W2** — W1 plus "western cartoon, American comic book, heavy ink outlines, vector flat illustration" in Qwen's
  negative (cfg 4; klein has no negative).

## The measure

Qwen3.5-4B's verdict ("japanese anime | western cartoon | american comic book | …", with the eye and shading cues), first
calibrated on pictures whose style the A/B reviewer had judged: it called the 5 anime pictures anime (5/5) and the 3
photo → anime flat-cartoon redraws "western cartoon … cartoon dot or oval eyes" (3/3), but it also called the A/B's
western-comic courier "japanese anime" (2/2). So it measures the flat-cartoon failure of the reference redraws, not
the comic look of the text draws; those I judged by eye.

## Results

| Case | W0 (shipping) | W1 | W2 |
|---|---|---|---|
| klein, photo bust → Anime (ix3), 2 seeds | western cartoon 2/2 | western 1/2, anime 1/2 | — |
| klein, photo head shot → Anime (ic5), 2 seeds | western cartoon 2/2 | **anime 2/2** (larger eyes with highlights, softer face construction) | — |
| klein, full-length photo → Anime (ic3), 2 seeds | anime 2/2 | anime 2/2 | — |
| Qwen text, courier (a2), 2 seeds — by eye | **western comic 2/2** (heavy outlines, adult comic proportions) | **anime 2/2** | anime 2/2; s1's spiky hair reads like a famous franchise hero |
| Qwen text, student (a1), 2 seeds — by eye / verdict | clean anime 2/2 | clean anime 2/2 | clean anime 2/2 |

Photo → Anime with klein: western 4/4 → 1/4 (verdict), no change where it was already anime; Qwen text: the courier
from western comic to anime (2/2 → 0/2 western by eye), the student unchanged. Framing ok in all 24 pictures; likeness
and wardrobe as before (the same beard, balding head, vest; the same curls and t-shirt).

**Shipped:** W1 for both modes (`STYLE_MEDIUM.ANIME` lead, noun and identity word; `KLEIN_MEDIUM.ANIME`). **Not
shipped:** W2 — the extra negative added nothing over W1 and one draw drifted toward a recognisable franchise look.
**Still open:** a bust photo of a bearded, balding man (ix3) stays western in 1 of 2 klein redraws: the photo's adult
realism and the identity line (beard, balding, safety vest) pull away from anime construction; samples are small (3
uploads, 2 characters, 2 seeds). Not measured: whether the word "Japanese" pulls a non-Japanese character's features
toward East Asian ones — the four photo redraws kept their faces (beard, curls, skin tone), but an Arabic-world
Anime character drawn from text should be looked at on the next acceptance run.
