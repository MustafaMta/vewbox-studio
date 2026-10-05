# Iraqi Arabic engine comparison — prepared harness (2026-10-06)

Voice-model engineer. **Prepared, not run.** The dedicated Iraqi phase starts once the English Short, Music Video and
episode pipeline is stable (FINAL-LOCAL-DIRECTIVE §18, §28; master directive's re-sequencing). Nothing Iraqi below is
measured; the native Baghdadi listener's review is the acceptance, ASR is diagnostic only.

## 1. Why the phase matters more now

The incumbent Iraqi engine, Habibi IRQ, is Apache-2.0 per its licensor but carries a data-provenance risk (it is
initialised from F5-TTS, whose weights are CC-BY-NC because of the Emilia data; docs/MODELS.md). The producer's rule
(2026-10-06) is commercial-safe models only in the runtime. So the phase must find out whether an Apache-2.0 engine that
lists Arabic — dots.tts-soar, MOSS-TTS v1.5, VoxCPM2 — can speak Baghdadi well enough from an Iraqi reference clip.

## 2. Arms (`tests/fixtures/voice/iraqi-engine-arms.json`)

| Arm | How it runs | Licence | Role |
|---|---|---|---|
| Habibi IRQ | live `tts-habibi` :8021 | Apache-2.0 per licensor, provenance risk | incumbent |
| IndexTTS 2.5 | live `tts` :8020 | bilibili Model Use License (commercial below thresholds) | incumbent (code-switched lines today) |
| VoxCPM2 clone | `tts-bench-voxcpm2` :8040 (no build, weights on the volume) | Apache-2.0 | candidate |
| dots.tts-soar | `tts-bench-dots` :8041 (group `eval-voice-dots`) | Apache-2.0 | candidate |
| MOSS-TTS v1.5 | `tts-bench-moss` :8042 (group `eval-voice-moss`) | Apache-2.0 | candidate |
| Fish Audio S2 Pro | bench target to add (§4) | **Fish Audio Research License — non-commercial** | **research reference only**, never in runtime/config |
| MiniMax H3 native speech | ComfyUI Ref2VA renders, audio imported | MiniMax H3 Community License | the video engine's own voice, a subset of lines |

MiniMax's speech models (speech-2.x) are hosted-only: no open weights exist, so the only local MiniMax voice mechanism
is H3's native speech inside the video model (reference audio for timbre, the line in `<d>[Arabic]…</d>`).

## 3. How to run it (the same harness as the English bench, `scripts/voice-bench.ts`)

All GPU phases under `scripts/gpu-hold.ts TTS <MB>` (or `ASR` for scoring), one arm at a time, ≤ 20 min per batch.

```
RUN=docs/evidence/iraqi-engines-2026-10   MEDIA=<main checkout>/docs/evidence/iraqi-engines-2026-10/media
# 1. references: CONSENTED Iraqi recordings, 5–12 s each, ≥ 2 male + 2 female, young and old, with their transcripts
pnpm exec tsx scripts/voice-bench.ts voices --lang ar --run $RUN --media $MEDIA --voices <iraqi-voices.json>
# 2. every arm speaks the 60 lines (docs/voice/IRAQI-EVAL-SET-2026-10.md), the same prepared Baghdadi text for all
pnpm exec tsx scripts/voice-bench.ts synth --lang ar --set tests/fixtures/voice/iraqi-eval-set.json --run $RUN --media $MEDIA --engine habibi --base http://127.0.0.1:8021
#    … indextts :8020, voxcpm2 :8040, dots :8041, moss :8042, fish-s2 :8043 (research reference)
# 3. H3 native speech: render a subset with scripts/model-eval-h3.ts-style graphs, then
pnpm exec tsx scripts/voice-bench.ts import --lang ar --run $RUN --media $MEDIA --engine minimax-h3-native --dir <renders>
# 4. machine checks: dialect ASR (asr :8030, language=ar), studio Iraqi fold, MSA heuristic, ECAPA (tts-design :8022)
pnpm exec tsx scripts/voice-bench.ts score --lang ar --set tests/fixtures/voice/iraqi-eval-set.json --run $RUN --media $MEDIA --asr http://127.0.0.1:8030 --ecapa http://127.0.0.1:8022
# 5. the BLIND page for the native listener (labels A, B, C… shuffled per row; the key is written to blind-key.json only)
pnpm exec tsx scripts/voice-bench.ts review --lang ar --set tests/fixtures/voice/iraqi-eval-set.json --run $RUN --media $MEDIA
pnpm exec tsx scripts/voice-bench.ts report --lang ar --set tests/fixtures/voice/iraqi-eval-set.json --run $RUN --media $MEDIA
```

What each arm hears: the line through the studio's own Iraqi preparation (`prepareLineText`, engine `habibi`: digits →
Baghdadi number words, quotes, tatweel…), identical for every arm so differences are the engine's. A take is attempt #1;
nothing is retried.

## 4. Fish Audio S2 Pro arm (research reference) — what is still to build

`fishaudio/s2-pro@1de9996` (HF, not gated; 10.26 GB: Slow AR 4 B + Fast AR 0.4 B, RVQ codec `codec.pth`; Arabic is a
"Tier 2" language; inline free-form `[tag]` emotion control). Licence read 2026-10-06: research and non-commercial use
("evaluation and testing" is named) free; any commercial purpose needs a separate written licence. To run it as a
labelled reference: an evaluation-only manifest group (outside the default `MODEL_GROUPS`, like `eval-qwen-image-2.1`), a
`fish` target in `docker/tts-bench` (fish-speech's own inference, behind the same `/synthesize` contract) and port
8043. Its results go into the report with the label "research reference — non-commercial licence"; it is never wired
into `src/`, compose's default services or `.env`.

## 5. The listener's review

`review-blind.html` per row: the reference clip, then each arm's take as A, B, C… in a fixed random order; the form
asks naturalness 1–5, Baghdadi yes / partly / no (MSA or other), same voice as the reference 1–5, emotion as asked,
words wrong, and a note; "Save" downloads the ratings JSON. The bar of IRAQI-EVAL-SET §6 applies per arm (natural ≥ 80 %,
no film line wrong, dialect yes ≥ 80 %, emotion ≥ 3/4, same voice ≥ 4 on 80 %). Only after the ratings are saved is
`blind-key.json` used to unblind. Whisper's verdicts are shown nowhere on the blind page on purpose.
