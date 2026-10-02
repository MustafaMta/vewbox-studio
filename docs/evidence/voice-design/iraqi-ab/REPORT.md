# Iraqi path A/B: designed Arabic seeds → Habibi IRQ (2026-10-03)

Script: `scripts/iraqi-ab.ts`. Records: `results.json` (Habibi seed 7), `results-h8.json` (Habibi seed 8, same seeds).
Run and written by the voice-design engineer; saved here by the architect from the engineer's report.

> **Measurement cannot establish dialect authenticity.** These numbers are what Whisper large-v3 wrote, compared with
> what was intended: intelligibility and spelling, not dialect, accent, naturalness or how چ/گ were pronounced. Real
> Iraqi speech scores worse on ASR than Habibi's synthetic Iraqi (Habibi paper). Nothing here is an Iraqi claim; native
> Baghdadi listeners decide (VOICE-IDENTITY-V2 §5.2).

## Setup
- Arm a: seed text in MSA, description "… speaking formal Modern Standard Arabic …".
- Arm b: seed text in Baghdadi wording with Iraqi spelling («شلونك؟ اليوم الجو حار هواية، خلي نروح للسوگ باچر الصبح ونشتري خضرة، وبعدين نرجع للبيت.»), description "… colloquial Iraqi Arabic with a Baghdadi accent …".
  Arm b changes both the text and the description, so their separate effects cannot be told apart.
- Voices: female 35, male 40; 2 designed seeds each, ≤ 11.5 s (male seed 5001 rejected at 12.0 s).
- Habibi IRQ: reference text = the seed's own sentence; defaults (nfe 32, cfg 2.0, sway −1); Habibi seeds 7 and 8.
- Test lines: L1 «شكو ماكو؟ هسه وصلت من الشغل.» · L2 «گلتلك ماكو وقت، لازم نطلع هسه.» · L3 «الچاي حار هواية، انطيني شوية مي بارد.» · L4 «باچر الصبح نگعد وياكم بالگهوة.»
- Control: Habibi's bundled `assets/IRQ.wav` (a real speaker, consent unknown); outputs not committed.
- ASR: faster-whisper large-v3, language forced to ar.
- Metrics: studio `normalizeIraqi` → `charErrorRate`, `scriptCoverage`, `verdict` (pass at coverage ≥ 0.85 and CER ≤ 0.15);
  spacing-insensitive `src/server/media/arabic-align.ts`: letter coverage and letter error over the same fold with spaces
  removed, plus a word diff (VARIANT = spelled differently but equal after the fold, not an error).

## Results, both Habibi seeds pooled
| Group | Lines | CER | Studio coverage | Letter coverage | PASS/REVIEW/FAIL | Target words heard | Real subs+dels | Spacing-only | ECAPA seed→line |
|---|---|---|---|---|---|---|---|---|---|
| a: MSA seed | 32 | 0.052 | 0.750 | 0.961 | 12/12/8 | 69/104 | 36 | 6 | 0.718 |
| b: Iraqi seed | 32 | 0.056 | 0.757 | 0.948 | 12/9/11 | 72/104 | 37 | 1 | 0.736 |
| b / female | 16 | 0.066 | 0.703 | 0.944 | 4/4/8 | 32/52 | 24 | 0 | 0.736 |
| b / male | 16 | 0.046 | 0.811 | 0.952 | 8/5/3 | 40/52 | 13 | 1 | 0.736 |
| control (real Iraqi clip) | 8 | 0.033 | 0.818 | 0.972 | 5/1/2 | 19/26 | 7 | 1 | 0.727 |

The recipe difference flips between passes (Habibi seed 7: a 0.050 / 0.757 vs b 0.064 / 0.735; seed 8: a 0.054 / 0.744
vs b 0.049 / 0.779). Per seed (8 lines each) CER ranges 0.016–0.077. Best: `seeds/iraqi-male-c1-s5002-24k.wav` — CER
0.016, coverage 0.914, 6/2/0, 22/26 target words, the same in both passes and better than the control. Worst:
`iraqi-male-c2`, CER 0.077.

Target words (MSA seed / Iraqi seed / control):
- Heard every time or almost: شكو 8/8/2, ماكو 8/8/2, وياكم 8/8/2, هواية 7/8/2, انطيني 8/7/2, L1 هسه 8/7/2.
- L2 هسه 7/6/2 («هس», «هسي», «حسه»). L2 گلتلك 6/5/2, plus «قلت لك» ×5 counted as heard (spacing only).
- **L3 الچاي 0/0/0** (written «الفاي» ×13, «الزاي», «الداي», «السايح»).
- **L4 باچر 0/0/0** (written «باسر» ×5, «باهر» ×3, «باشر» ×3, «بائر» ×2 …).
- L4 نگعد 1/4/1 (written «نقاعد» ×8). L4 بالگهوة 0/3/0 (written «بالغهوة» ×15; «بالقهوة» ×3, all from the Iraqi male seeds).

How VoxCPM2 spoke the Iraqi seed text: «باچر» came back «باكرا», «باتشار», «باتر», «باشر»; «شلونك» came back «هونك» and
«شونك» in 2 of 4. The MSA seeds read back with CER ≤ 0.012.

## What improved, what did not
- **Not improved:** the Baghdadi seed text plus Baghdadi description, on every measure — inside the seed-to-seed noise,
  direction flips between passes. The Iraqi female seeds were the worst group (8/16 FAIL).
- **Not improved:** چ. It never came back as چ, ج or تش in 0 of 36 tries, including with the real Iraqi control clip, so
  the designed reference is not the cause. Measurement cannot tell whether Habibi says /tʃ/ and Whisper mis-spells it,
  or Habibi does not say it. Whisper can write it: one VoxCPM2 seed came back «باتشار».
- **Open question:** گ→غ in «بالگهوة» (15/18). Whisper often writes غ for /g/, but غ is also a real Iraqi sound /ɣ/;
  the studio fold keeps them apart, rightly, so a listener has to say which was spoken.
- **Improved (measurement only):** 6 of 72 lines were REVIEW only because «گلتلك» was written «قلت لك» (letter coverage
  1.000). All other differences are real letter changes. A spacing-aware coverage would pass those 6.

## Recipe that measures best
Screening, not the seed text: design 3 candidates; keep seeds ≤ 11.5 s; speak the 4 probe lines through Habibi with
the seed's sentence as reference text; rank by letter coverage, then CER. The top seed held its rank across both Habibi
passes; the recipe averages did not. Iraqi wording costs nothing measurable, so use it if listeners prefer it. With
4 lines × 2 Habibi seeds × 8 seeds and an ASR that is not dialect-tuned, this is a shortlist for listeners, not a
choice.

## Listening set (blind, loudness-matched, headphones)
`listen-sheet.csv`: 56 items, fixed random order; the facilitator hides the `file` column (names reveal the recipe).
Scales: dialect 1–5, naturalness 1–5, same voice as seed 1–5, "چ said as /tʃ/?", "گ said as /g/?", flagged words.
- Priority 1, 24 items (≈ 10 min): the 8 seeds `seeds/*.wav` (does the seed itself sound Baghdadi or MSA?); L3 and L4
  of every seed: `renders/{msa,iraqi}-{female,male}-c{1,2}-L3.wav` and `-L4.wav`.
- Priority 2: L1 and L2 of every seed (`renders/…-L1/L2.wav`); the Habibi seed 8 replicate (`renders-h8/…-L3/L4.wav`).
- One voice only: `seeds/iraqi-male-c1-s5002-24k.wav` and its lines, against `seeds/msa-female-c1-s4001-24k.wav`.

Pass condition (§5.2): at least 3 native Baghdadi raters, dialect median ≥ 4 on ≥ 80 % of lines, and no target word
flagged by 2 or more raters. Until then: "Iraqi dialect not yet verified by a native listener".

## Files
`seeds/` (8 × 24 kHz), `renders/` (32, Habibi seed 7), `renders-h8/` (32, Habibi seed 8), `results.json`,
`results-h8.json`, `listen-sheet.csv`. Not committed: 48 kHz originals and rejected candidates
(`var/iraqi-ab/candidates/`), control outputs (`var/iraqi-ab/anchor/`).
