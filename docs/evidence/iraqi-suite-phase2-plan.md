# Iraqi voice suite — Phase 2 plan (run when the GPU is free)

Agent 6 (Voice and Audio), 2026-10-02. Phase 1 landed the code (voice-service limiter, seeds and parameters, the dialect
fold and CER/coverage gate, the reference measurement helpers, the rewritten suite). Nothing in this file has been run
yet: the GPU is held by a MiniMax video batch and the contract forbids GPU work until the architect releases it.

## An honest note on the published table

`docs/evidence/iraqi-suite.md` (32 lines, mean WER 0.37) was produced with **synthesised references**: the two clips the
suite cloned from are engine output (`var/library/audio/2026/10/up-8bde923b06.wav` is byte-identical to
`female-long.wav`; `up-dbb2bcbf56.wav` to `male-long.wav`; VOICE-STACK.md D6), the female clip was an English line
transcribed with Arabic forced, and 25 of the 32 output files are clipped at 0 dBFS. The table shows that the pipeline
runs; it says nothing about how well a real Iraqi voice is cloned. It stays in the repository as history and is marked
so in `skills/iraqi-dialogue`. The original `var/ref-male.wav` / `var/ref-female.wav` no longer exist, so that run cannot
be reproduced; Phase 2 starts from new references.

## 0. Preconditions

```powershell
curl 127.0.0.1:8020/health; curl 127.0.0.1:8021/health; curl 127.0.0.1:8030/health   # loaded:false, engine_version present
nvidia-smi --query-gpu=memory.used --format=csv                                      # < 2 GB: the video batch is done
docker compose up -d --no-deps tts tts-habibi                                         # once after merging: app.py is bind-mounted
```
`GET /health` must now answer with `engine_version` and `peak_ceiling_dbtp: -1`; if it does not, the containers still run
the old `app.py`.

## 1. References (the one thing code cannot provide)

Two male and two female Iraqi speakers, 10–20 s each of clean conversational speech with a written transcript, recorded
or licensed **with a release that allows voice synthesis** (own recordings, a commissioned voice actor, or a dataset whose
terms permit it — Habibi's corpora are ASR data and do not qualify). Keep them under `var/refs/` (not committed) with a
sidecar `<name>.consent.json` `{ speaker, rightsHolder, authorisedBy, date, terms }`. Check each on the CPU first:

```powershell
pnpm exec tsx -e "import('./src/server/media/voice-check.ts').then(async m => console.log(await m.validateVoiceReference('var/refs/male-1.wav', { language: 'AR' })))"
```
Expect `ok: true`, `window` inside the speech, LUFS −30…−10, `clipping.ratio` 0. The suite re-runs this and refuses a
clip that is engine output (WAV provenance tag, library record, or byte-identical to an evidence file); `--allow-synthetic`
exists only for a smoke test and stamps the report.

## 2. Engine facts to record once

```powershell
docker exec vewbox-tts-habibi-1 python3 -c "from importlib.metadata import version as v; print(v('habibi-tts'), v('f5-tts'), v('torch'))"
docker exec vewbox-tts-1 /opt/index-tts/.venv/bin/python -c "from importlib.metadata import version as v; print(v('indextts'), v('torch'))"
docker exec vewbox-tts-1 sh -c "cd /opt/index-tts && git describe --tags --always"
docker exec vewbox-tts-habibi-1 sh -c "grep -c '[A-Za-z]' /models/tts/habibi/Specialized/IRQ/vocab.txt; grep -c 'گ' /models/tts/habibi/Specialized/IRQ/vocab.txt"
```
(Measured today from outside the GPU: habibi-tts 0.1.1, f5-tts 1.1.22, indextts 2.0.0 at repo tag v2.5.0 / 39207d9, torch
2.8.0+cu128. The service now reports the same string in `x-engine-version`.)

## 3. The suite

```powershell
pnpm exec tsx scripts/iraqi-voice-suite.mjs --references male=var/refs/male-1.wav,female=var/refs/female-1.wav --seed 7 --out docs/evidence/iraqi-suite-v2.md
pnpm exec tsx scripts/iraqi-voice-suite.mjs --references male=var/refs/male-1.wav,female=var/refs/female-1.wav --seed 8 --out docs/evidence/iraqi-suite-v2-seed8.md   # repeatability
```
27 lines per voice: short conversational, emotions (anger, happiness, sadness, fear, tiredness, excitement, hesitation),
a rising question, Iraqi/Kurdish/Western names, numbers spelled / ASCII digits / Arabic-Indic digits, five words
(«باچر», «گلتلي», «هواية», «شلونك», «الأعظمية») inside different sentences for pronunciation consistency, the two
code-switched lines (routed to IndexTTS, marked "fallback") and their transliterated twin on Habibi, and the long line.
Each row: script class, engine (+ fallback), seconds, integrated LUFS, true peak, clipping %, raw WER, CER and coverage
after the fold, and the verdict at the recorded-line gate (CER ≤ 0.15, coverage ≥ 0.85).

A/B matrix on the male reference, `--only why,tomorrow,numbers,consist-1,consist-2,long` (6 lines, ~1 min of GPU each):
```powershell
foreach ($nfe in 16,32,64) { pnpm exec tsx scripts/iraqi-voice-suite.mjs --references male=var/refs/male-1.wav --seed 7 --nfe $nfe --only why,tomorrow,numbers,consist-1,consist-2,long --out docs/evidence/ab/nfe-$nfe.md }
foreach ($cfg in 1.5,2.0,2.5) { ... --cfg $cfg --out docs/evidence/ab/cfg-$cfg.md }
foreach ($sp in 0.9,1.0,1.1) { ... --speed $sp --out docs/evidence/ab/speed-$sp.md }
```
Decide the default `nfeStep` / `cfgStrength` / `speed` for Iraqi identities from CER, coverage, seconds per character
and the listener sheet; `dialect_id='IRQ'` vs `None` and a 6 s vs 12 s window are the next two A/Bs if time allows
(both need one-line changes in `app.py` / the suite flags).

## 4. What is measured automatically (all CPU except ASR)

| measure | where | pass |
|---|---|---|
| CER, coverage (folded), WER (raw) | `speech.ts` `charErrorRate` / `scriptCoverage` / `wordErrorRate` | CER ≤ 0.15, coverage ≥ 0.85 (line) / 0.7 (take) → `verdict` |
| duration | service header `x-duration` | flag < 70 % or > 160 % of the male baseline per line |
| integrated LUFS, true peak | `voice-check.ts` `loudness` (loudnorm pass 1) | −23…−16 LUFS, ≤ −1 dBTP (the limiter guarantees the peak) |
| clipping | `voice-check.ts` `clipping` (full-scale samples + astats flat factor) | 0 samples |
| reference window, gain | `validateVoiceReference`, `trimReference` | window inside speech, static gain, TP ≤ −1 |
| ASR language of the reference | suite, `language: auto` | `ar`, probability ≥ 0.8 |
| repeatability | seed 7 vs seed 8, same line | same CER class; byte-identical files with the same seed are the goal, not a requirement |

Backlog (needs a dependency in the asr image): ECAPA speaker similarity to the reference (target ≥ 0.70) and between
lines (≥ 0.80); median F0 drift ≤ 15 % between lines.

## 5. Native-listener sheet

The suite writes `docs/evidence/iraqi-suite-v2/listen.csv` with one row per file:

| column | meaning |
|---|---|
| `file`, `voice`, `id`, `engine`, `line` | filled by the suite (the file name carries the engine, so the review is not blind — say so in the report) |
| `dialect_authenticity_1_5` | 1 = not Iraqi, 3 = understandable but off, 5 = Baghdadi as spoken |
| `naturalness_1_5` | 1 = robotic / artefacts, 5 = a person |
| `same_voice_as_reference_1_5` | listen to `refs/<voice>-ref-*.wav` first; 5 = the same person |
| `note` | the wrong sound («باچر» said with /s/), the lost opening, the pace |

Acceptance for a pinned voice: authenticity ≥ 4 and same-voice ≥ 4 on ≥ 80 % of its lines; otherwise the identity stays
`REVIEW`. Until the sheet is filled, every report says **subjective quality pending review**.

## 6. Then

Publish `docs/evidence/iraqi-suite-v2.md` with the labelled files, update `skills/iraqi-dialogue` with the chosen
parameters and the listener's verdicts, and give the Backend agent the default `params` for Iraqi identities.
