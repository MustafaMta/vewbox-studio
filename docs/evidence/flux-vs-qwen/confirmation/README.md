# FLUX.2 [klein] 4B for Image Reference — confirmation before the default flips (2026-10-03)

The acceptance gate of docs/research/FLUX-VS-QWEN.md §6.7, run with the **shipping builders** (the code the handler
runs: `referenceReadGraph` → `identityLineFromDescription` → `kleinReferenceCanonical` + `kleinReferencePrompt`; for
comparison `qwenReferenceCanonical` + `referenceCanonicalPrompt`). Straight through ComfyUI, not through the shared
worker: no studio job active, ComfyUI queue empty, the voice / ASR / voice-design services unloaded first.

Driver `run.ts` (phases prep, read, klein, qwen, sheets); results `results.json` (every reading, identity line,
prompt, seed, time, framing); `sface.json` (identity metric); sheets `sheet-<upload>.jpg` (upload | klein with the face
crop s0, s1 | klein upload only s0, s1 | Qwen-Edit with the face crop s0 for the six new uploads). PNG originals:
`D:/volexar-studio/volexar-studio/var/flux-vs-qwen/confirmation/` (gitignored).

## Set

12 uploads, all generated stand-ins (no real people): the six of the A/B (head shot, two busts, waist-up, anime drawing)
and six drawn here with Qwen-Image-2512 — a head-scarf head shot (ic1), a waist-up man with a moustache and glasses
(ic2), a full-length teenager (ic3), a 3D CG cartoon girl (ic4, a drawing input), a curly head shot with a short beard
(ic5), a bust with red glasses (ic6). Targets: Realistic 4, Cartoon 4, Anime 4. Each upload was read once (MediaPipe +
Qwen3.5-4B, as the worker reads it) and redrawn by klein with the face crop (the handler's first attempt) and without it
(its retry), seeds 970007 and 970008: **48 klein redraws**. Qwen-Edit redrew the six new uploads once (face crop, s0).

During the first pass the readings showed three builder faults that a literal reader like klein would act on, fixed
in `identityLineFromDescription` before the pass recorded here (the first pass is kept in
`results-run1-earlier-lines.json`): "accessories: glasses none" (an accessory entry that was the field's answer), "a
woman aged about child", "a man aged about 10-19" (now "a girl", "a teenage boy aged about 10-19"), and "no facial hair"
said of women.

## Gates (§6.7) and results

| Gate | klein 4B (48 redraws) | Met |
|---|---|---|
| whole figure ≥ 95 % by the framing check | **48/48** (also 48/48 by eye) | yes |
| zero invented attributes | **0** — no glasses on any of the 8 uploads without them (32 redraws) (the A/B's failure with the old prompt), no beard on ic2 (moustache + stubble, kept as such) | yes |
| realistic SFace ≥ 0.6 on every whole-figure redraw | **16/16**, 0.611–0.830 (ir2 0.748–0.804, ix1 0.656–0.785, ic1 0.611–0.752, ic6 0.803–0.830) | yes (see the metric note) |
| eye likeness ≥ Qwen's mean | **3.88** (per upload below) vs Qwen 3.50 in the A/B and 3.67 on the six new uploads here | yes |
| no medium errors | Realistic 16/16 photographs, Cartoon 16/16 CG renders; **Anime: 8/16 clean anime** (ir3, ic3), **8/16 a western flat cartoon** (ix3, ic5 — photo head shot / bust → Anime) | partial: the known D10 style issue, the same in both engines (A/B: 8/8) — investigated in `../anime/` |

Speed: klein 4.3 s engine with the face crop (11.8 s cold, ≈ 3.9 s warm), 2.6 s without; Qwen-Edit 105 s.
Qwen-Edit on the six new uploads: whole figure 5/6 by the framing check (ic5, a head shot, came back waist-up, as in
the A/B where Edit-2511 kept the upload's crop in 7/16 bust/waist redraws).

Per upload (my look at every picture at full resolution; likeness 1–5 from the faces):

| Upload → target | klein (4 redraws) | likeness | Qwen-Edit (face, s0) |
|---|---|---|---|
| ir1 photo head shot → Cartoon | 4/4 whole, CG cartoon; glasses, ponytail, mole, lab coat, maroon shirt kept | 3.5 | (A/B) |
| ir2 photo bust → Realistic | 4/4 whole, the same man (beard, curls, denim shirt with its badge); no glasses | 4 | (A/B) |
| ir3 anime drawing → Anime | 4/4 whole, the same character (scratches, star patch on the sleeve, yellow sneakers) | 4.5 | (A/B) |
| ix1 photo bust → Realistic | 4/4 whole, the same old man (flat cap, blazer, cream sweater); trousers completed brown or navy | 4 | (A/B) |
| ix2 photo waist-up → Cartoon | 4/4 whole, red curls, freckles, gold hoops, cable sweater | 3.5 | (A/B) |
| ix3 photo bust → Anime | 4/4 whole, beard and balding head kept; **western flat cartoon, not anime** | 3.5 | (A/B: same) |
| ic1 head-scarf head shot → Realistic | 4/4 whole, scarf, thin round glasses, cream top; s0 with the face has a grey panel at the waist (garment artefact) | 4 | whole, likeness 4; barefoot |
| ic2 moustache + glasses, waist-up → Cartoon | 4/4 whole, moustache only, round black glasses, navy cardigan | 4 | whole, toy-like big head, 3.5 |
| ic3 full-length teen → Anime | 4/4 whole, clean anime; hoodie a darker red than the photo | 3.5 | whole, close to the photo (flat semi-real), 4, medium partial |
| ic4 CG girl → Cartoon | 4/4 whole, curly pigtails, freckles, yellow hooded jacket, striped shirt | 4 | whole, rounder new face, 3 |
| ic5 curly head shot → Anime | 4/4 whole, curls and beard kept; **western flat cartoon**; legs completed as shorts in 2/4 | 3.5 | **not whole** (waist-up), 3.5 |
| ic6 grey bob, red glasses → Realistic | 4/4 whole, red rectangular glasses, turtleneck | 4.5 | whole, 4 |

**Metric note.** The A/B's identity script needs OpenCV and a scratch library volume that no longer exists; `sface.py`
computes the same SFace cosine (YuNet 2023mar box + 5 landmarks → similarity alignment to the 112×112 template →
SFace 2021dec) with onnxruntime + numpy in the studio's own ASR image (nothing downloaded or installed). On three A/B
pairs it read 0.735 / 0.656 / 0.326 where OpenCV gave 0.717 / 0.624 / 0.264 — about 0.02–0.06 higher — so the lowest
realistic value here (ic1 upload only, s1: 0.611) may sit just under 0.6 on the A/B's scale; every other realistic
redraw is ≥ 0.656. Stylised targets are advisory (SFace on a cartoon face): ic4 CG → Cartoon 0.77–0.92, ic2 0.53–0.79.

## Decision

The gates are met, except the photo → Anime style, which is not an engine difference (Qwen-Edit drew the same western
flat cartoon in the A/B). **The default for Image Reference is FLUX.2 [klein] 4B** (`referenceEngine` in
src/worker/handlers/images.ts); Qwen-Image-Edit-2511 stays for one release behind `CANONICAL_REFERENCE_ENGINE=qwen`,
and is used automatically, with the reason in the check notes, when klein's weights or nodes are not in ComfyUI.
