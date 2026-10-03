# Character image V2 — the canonical character image: GPU evidence (2026-10-03)

Run and written by the image engineer; saved here by the architect from the engineer's report. Drawn straight through
ComfyUI 0.38.1 on the RTX 5090 with the shipping builders. Every picture was looked at. Before each run the voice and
ASR services were unloaded (`POST /unload` on :8020/:8021/:8030; the card went from 22.8 GB to 1.2–3.1 GB used).
Contact sheets are in `canonical/` and `superseded/`; the PNG originals are in `var/image-v2/`. To re-run:
`pnpm exec tsx tools/canonical-image-gpu.ts --phases text,reference,style`.

## §1 Round 1 (superseded: portrait, sheet, views, expressions; `superseded/round1-*.jpg`)
- Portrait medium: cartoon CG ✓, realistic photo ✓, anime rendered rather than flat.
- Portrait framing failed in all styles: a full-length figure (cartoon), a bust on legs in 3/3 candidates (anime), a
  high-angle full-length shot (realistic).
- The 3 candidates per prompt were near-identical, so an automatic pick had nothing to choose between.
- Face crop: 3/3 kept the chin. 3-view sheets: 3/3 correct; anime turned knee socks into tights.
- Camera LoRA three-quarter view: true in cartoon and realistic, a near-profile in anime, direction flipped between runs.
- Expressions: joy and surprise 3/3; anger failed in cartoon and anime; realistic expressions came out as high-angle
  full-length shots.

## §2 From text — arms L0 = fast 8-step, L1 = L0 + a sentence on the character's own left/right, Q1 = quality mode (30 steps, cfg 4) + that sentence; seeds s and s+1
- Timing: L0/L1 6.0–6.3 s warm (23.8 s cold); Q1 41.8–42.2 s. Card total 29.5–31.7 GB.
- c1 kite-maker (cartoon): CG ✓, whole figure ✓, all clothing tokens ✓, watch on the correct side 6/6, red elbow patch
  on the wrong side 6/6. Q1 cleaner, fuller beard.
- c2 girl (cartoon): bracelet 6/6 ✓, torn knee 6/6 ✓; red laces wrong in L0 s1 and L1 s1; L0 s0 undone strap and
  folded bib; Q1 all correct.
- a1 student (anime): L0/L1 semi-3D ✗; hair clip wrong side in L0 s0 only; bag 6/6 ✓; Q1 clean cel-shaded anime.
- a2 courier (anime): L0/L1 painted, not anime ✗; star patch on the chest in L1 s0, otherwise ✓; scar wrong side 6/6;
  Q1 clean anime.
- r1 pharmacist (realistic): photographic 6/6; watch ✓ 6/6; badge wrong side 6/6; Q1 shows the greying hair.
- r2 mechanic (realistic): photographic 6/6; name patch ✓ 6/6; rag wrong side 6/6; studs in both ears; Q1 s0 shows the
  backdrop's top edge.
- Totals: style right — cartoon 12/12, realistic 12/12, anime 4/12 (Q1 4/4). Whole figure 36/36. One-sided details
  L0 15/24, L1 15/24, Q1 16/24.

## §3 Image Reference — generated stand-in uploads (not real people), each redrawn with and without its face crop
- Read (face box + description): 18–19.5 s engine. Redraw: 67 s warm, ≈ 120 s after the vision model (reload).
- IR1 head-shot photo → cartoon: description gave 30–40 (actual ≈ 45), missed the greying hair, added a mole. Both
  redraws CG, whole figure, glasses and coat ✓; extra mole dots ✗.
- IR2 bust photo → realistic: description gave light skin (actually medium brown) and called the coveralls a denim
  shirt. With the face crop: strong likeness but three-quarter length (framing failed). Without: whole figure ✓,
  weaker likeness.
- IR3 anime → anime: both clean anime ✓; star patch turned yellow ✗; the version without the face crop got a
  sticker-like white outline ✗.

## §4 Checks
- Framing check (`src/server/media/figure-check.ts`): 36/36 good pictures pass, 12/12 cropped controls fail (rules
  tuned on this set); caught the one real failure among the 6 unseen redraws.
- Vision-model style and full-body check — **rejected**: medium right 38/56 (16/18 photographs called "3d_render",
  both old photographic cartoons passed); full body right 43/56 (all 12 cropped controls called whole).

## §5 Known limitations
- One-sided details land correctly about 2 times in 3.
- Picture descriptions sometimes get age, skin tone and left/right wrong.
- Realistic quality mode sometimes shows the backdrop's edge.
- The old sheet graph's face crop in secondary material assumes a head-and-shoulders portrait.
