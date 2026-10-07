# Licences — models, terms, obligations (single source of truth)

Status 2026-10-06. The producer chose commercial use and is applying for MiniMax's territory licence. The same table is
data in `src/domain/licences.ts` (Settings › Licences and terms, the film credits); the terms users accept are
`src/domain/terms.ts` (page `/terms`). Where a licence text was not read directly by this checkout's authors the row says
so (◐) and names where the finding came from (docs/MODELS.md, docs/research/*, the image engineer's findings).

## 0. Policy: commercial-safe models only (producer, 2026-10-06)

Vewbox must be usable commercially. Non-commercial weights (FLUX.2 [dev], FLUX.2 klein 9B under the FLUX
Non-Commercial licence, the Fish Audio research licence, CC-BY-NC, InsightFace packs, …) never enter the runtime, the
production configuration or a required workflow. A non-commercial model may be recorded as a research reference, or
compared in a clearly labelled evaluation, but is never promoted. For every candidate verify the exact model/version,
parameter count, licence and commercial-use terms before it is evaluated through the UI. If a commercial BFL licence is
bought later, FLUX is re-evaluated separately without redesigning the image pipeline.

## 1. Engines and their licences

| Engine | Used for | Licence | Status | What it asks of the studio | Passes restrictions to users |
|---|---|---|---|---|---|
| MiniMax H3 (local open weights, ComfyUI) | every take, picture and sound | MiniMax H3 Community License | in use | display "MiniMax H3" prominently in the UI (§IV.2); commercial use below US$20M a year; users bound by its Acceptable Use Policy (§V.2, Exhibit A); outputs not displayed in the US, EU, UK or South Korea without MiniMax's territory licence | yes |
| Qwen-Image-2512, Qwen-Image-Edit-2511 | canonical images, plates, frames | Apache-2.0 | in use | keep the licence and notices | no |
| Qwen3.5-4B | reading the reference picture | Apache-2.0 | in use | keep the licence and notices | no |
| MediaPipe (face detector, Face Landmarker, Hand Landmarker) | face box, mouth activity, the lip-sync corrector's face alignment and occlusion gate | Apache-2.0 ✔ — code (google-ai-edge/mediapipe LICENSE) and the model cards, each stating "LICENSED UNDER Apache License, Version 2.0": Face Mesh V2, Blendshape V2, BlazeFace short-range, Hand Tracking Lite/Full (Oct 2021) — read 2026-10-06 from storage.googleapis.com/mediapipe-assets | in use | keep the licence and notices | no |
| IndexTTS 2.5 | the characters' lines | bilibili IndexTTS model licence (code Apache-2.0) ◐ | in use | its use restrictions bind users of its outputs (§3.4) | yes |
| Habibi-TTS IRQ | Iraqi Arabic voices | Apache-2.0 | in use | keep the licence and notices | no |
| VoxCPM2 | voice design | Apache-2.0 | in use | the card asks that AI audio be labelled and forbids impersonation | (card) |
| faster-whisper large-v3 | transcription, subtitle timing | MIT | in use | keep the notice | no |
| wav2vec2 aligners (EN, AR) | word timing | Apache-2.0 ◐ | in use | keep the licence and notices | no |
| YuNet / SFace | face identity checks | MIT / Apache-2.0 | in use | keep the notices | no |
| ECAPA-TDNN (SpeechBrain) | voice similarity | Apache-2.0 | in use | keep the licence and notices | no |
| Demucs | stems | MIT | in use | keep the notice | no |
| ACE-Step 1.5 XL-SFT + 5Hz LM 4B (Comfy-Org repackage; XL turbo only as a chosen draft) | songs — the only song engine | MIT | in use (proven Phase 2, 2026-10-07) | keep the notice | no |
| Qwen3.8-27B-NVFP4 (Inferact/Qwen3.8-27B-NVFP4 @ 6128240e, ModelOpt NVFP4 of Qwen/Qwen3.8-27B; vLLM 0.31) | the studio's only brain: ideas, stories, scripts, shot plans, continuity | Apache-2.0 ✔ (model card and LICENSE, not gated) | in use (proven Phase 0, 2026-10-07) | keep the licence and notices | no |
| LatentSync 1.6 (+ Whisper tiny MIT, SD VAE ft-MSE MIT) | lip-sync correction of a confirmed take (opt-in service) | weights CreativeML OpenRAIL++-M ✔ (model card), code Apache-2.0 ✔ | under evaluation | its use restrictions (Attachment A) bind users of its outputs; InsightFace packs stay out (non-commercial); the repo's auxiliary weights (S3FD, syncnet_v2, VGG, I3D, KonIQ, ViT-g) are not fetched | yes |
| Geist, Geist Mono | interface typefaces | SIL Open Font License 1.1 | in use | ship the licence with the files (`src/app/fonts/OFL-Geist.txt`) | no |

Installed, not active (weights kept in the model store's Ollama folder until the producer approves their removal): Qwen3.6
27B (Apache-2.0), the previous planner; Gemma 4 31B (Gemma Terms of Use; its Prohibited Use Policy would bind users
again, and come back into §2 and the terms, only if it were reactivated). FLUX.2 klein 4B (Apache-2.0): its route was
removed 2026-10-06; manifest group `images-flux2-klein` is unreferenced and its weights await the producer's decision.
MiniMax Music 3 (open weights, MiniMax-Music3 Community License) and the hosted MiniMax Music API: routes removed
2026-10-07 after ACE-Step XL-SFT was proven; nothing in the studio was made with them; manifest group `music-minimax-3`
is out of the default groups and its weights await the producer's decision.

Not used (licence): MMS forced-alignment weights and ctc-forced-aligner's default model (CC-BY-NC), InsightFace model
packs (non-commercial), Wav2Lip, Diff2Lip, SyncNet weights (no stated licence; interface only, disabled).

## 2. Obligations and where the studio meets them

| Obligation | Source | Where it is met |
|---|---|---|
| "MiniMax H3" displayed prominently in the UI | H3 §IV.2 | sidebar footer on every page ("Video by MiniMax H3", the phone's More sheet), the engine room (Video · MiniMax H3), the shot workspace beside New take, Settings › Licences, the film page's credits |
| Users bound to the use restrictions | H3 §V.2 + Exhibit A; LatentSync Attachment A; IndexTTS §3.4 | `/terms`, accepted once per studio (`settings.terms`, version `TERMS_VERSION`); until accepted, the pages start no new work (`src/studio/store.tsx` startJob; every generation button says why) and a line at the top of the content leads to the terms |
| Disclose machine-generated content | H3 AUP; VoxCPM2 card | every cut and export carries the disclosure in its container metadata (`src/server/media/disclosure.ts`); an export can end on a credit card naming the engines (Final cut › Export › End credits, default on); the terms ask users to disclose when they post |
| Territory restriction | H3 Community License | Settings › Licences shows the distribution note until the producer's territory licence is granted; the terms say it |
| Revenue cap (US$20M a year) | H3 | the terms say it |
| Keep licences and notices | Apache-2.0, MIT, OFL | this file; `src/app/fonts/OFL-Geist.txt`; the model registry (engine room › Models) lists each file's licence |

## 3. Distribution note (until the territory licence is granted)

Outputs of local MiniMax H3 may not be displayed in the United States, the European Union, the United Kingdom or South
Korea without MiniMax's territory licence.

## 4. Changing this

A new engine, a promoted model or a changed licence: update this file, `src/domain/licences.ts` and, when the change
alters what users must accept, `src/domain/terms.ts` with a new `TERMS_VERSION` (the studio then asks again).
