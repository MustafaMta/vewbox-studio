# Film pipeline research: continuity, alignment, lip-sync, QA, music video (2026-10-05)

Research Engineer, cloud session. Answers directive `docs/directives/CLOUD-SESSION-DIRECTIVE-2026-10-05.md` §3, §7, §8,
§9 and §10. The directive has no §21, so the brief's reference to it is read as §18 (execution rule). Builds on
`docs/research/STORYBUILDER-INTEGRATION.md` (SB) and `docs/research/MINIMAX-CONTINUITY.md` (MC) and does not repeat them.
No generation ran and no file other than this one was changed.

**Fixed H3 facts used here (from SB §b and MC §1, not re-derived):** `MiniMaxH3AddGuide` snaps guide clips down to
17k+5 frames (5, 22, 39 …). Keyframe and guide audio are conditioning rows: H3 always regenerates its audio and cannot
be made to play a given soundtrack verbatim (E1, `docs/AUDIOVISUAL-QA.md`). Output is 24 fps with a 40 Hz audio latent
and a trained range of 124–362 frames. Reference-to-video takes at most 9 pictures, 3 videos and 3 audios.

**How sources were read.** Every claim cites a source `[S#]` (list in §5). All were accessed on 2026-10-05.
- ✔ means read at the primary source: a GitHub page, a raw file (README, LICENSE, code), PyPI JSON or FFmpeg's
  `doc/filters.texi`.
- ◐ means read only through a search-engine summary. The egress proxy blocked arxiv.org, huggingface.co,
  docs.pytorch.org, *.readthedocs.io, robots.ox.ac.uk and github.io project pages, so all model cards on Hugging Face
  are ◐. A ◐ licence must be re-checked on the card before the weights enter the models manifest.
- No benchmark number below was measured here. Every number is quoted from a source, and every threshold is marked
  **START**: a starting value to calibrate on the RTX 5090.

---

## 1. Summary of decisions

| # | Topic | Decision | Why | Licence (code / weights) | Build now in the cloud (no GPU) | Needs the GPU |
|---|---|---|---|---|---|---|
| 1 | Shot-to-shot continuity (A) | **Keep** the measured H3 tail continuation (AddGuide clip + its audio at frame 0) for CONTINUOUS boundaries only. **Re-anchor** canonical character and location references on *every* shot. **Cap** continuation chain depth, and add a planned end-state keyframe as an anti-drift anchor | Every system surveyed that holds identity over many shots gets identity from per-shot references or keyframes, not from chained last frames. Chained extension is where community workflows fight colour and identity drift [S12–S18] | n/a | chain-depth counter, a forced re-anchor rule, a colour-drift metric, `ref_videos` context for CUT behind a flag | chain-depth and end-keyframe tests (§4: G9–G12) |
| 2 | Story/world state (A) | **Keep** the state in the app DB (World Bible, scene state), versioned. The LLM only reads it | MovieAgent, VideoClaw and SB all persist intermediate assets and banks outside the model [S3, S5, S1] | n/a | already present (`src/domain/world.ts`, `scene-state.ts`); extend with wardrobe and prop state per shot | — |
| 3 | Forced alignment (B) | **Adopt** wav2vec2 CTC forced alignment of the **script text** (WhisperX's algorithm, vendored) inside the existing `asr` container: EN `facebook/wav2vec2-base-960h`, AR `jonatasgrosman/wav2vec2-large-xlsr-53-arabic`. faster-whisper word timestamps stay as a cross-check and fallback | Aligns known text (not ASR guesses) at frame-level resolution. Needs only `transformers` on top of the container's torch 2.8. Commercial-safe weights. MFA is more accurate but heavy (Kaldi/conda); MMS is non-commercial | BSD-2 / Apache-2.0 ◐ | `/align` endpoint, normalisers, tests on recorded TTS lines (CPU is enough) | AR accuracy on Iraqi; the timing gate |
| 4 | Lip-sync scoring (C) | **Two tiers.** (i) A licence-clean *mouth-activity* check on every speaking or singing shot: MediaPipe lip landmarks against the speech envelope and word windows. (ii) **SyncNet** LSE-C/LSE-D + AV offset (`syncnet_python`) on realistic faces | SyncNet is the field's standard metric [S43, S44], but its weights have no stated licence, and it is unreliable on stylised faces and weakly correlated with human judgement [S44]. Tier (i) has no licence or style blind spot | MIT / *unstated* (SyncNet); Apache-2.0 (MediaPipe) | both scorers on CPU, the 24→25 fps resample, per-face-track scoring, offset repair | thresholds (§C.4), stylised-face validity |
| 5 | Lip-sync correction (C) | **Optional, opt-in, per shot** corrector: **LatentSync 1.6** (fixed lower-face mask, 512² face). Run only after an offset repair has failed and the producer approves. Never on every shot, never silently. **MuseTalk 1.5** is the fallback | LatentSync edits only the masked mouth region of an affine-aligned face [S33]. Code is Apache-2.0 ✔; weights are Apache-2.0 ◐. **Blocker:** its face detector is InsightFace, whose models are non-commercial [S46]. It must be swapped for YuNet/MediaPipe before production. `AUDIO-STACK.md` still says "LatentSync excluded by policy"; the 2026-10-05 directive asks for it to be evaluated, so the producer must lift that policy | Apache-2.0 / Apache-2.0 ◐ (+ SD VAE `sd-vae-ft-mse`) | service design, a detector swap patch, the gating policy, provenance | install on Blackwell (torch 2.5.1 cu121 pin), identity before/after, VRAM next to H3 |
| 6 | Continuity QA (D) | **CPU stack:** YuNet + SFace (face identity, realistic), CCIP (anime), DINOv2-small (wardrobe and location crops), PySceneDetect AdaptiveDetector / ffmpeg `scdet` (unplanned cuts), ffmpeg `blackdetect` / `freezedetect` / `mpdecimate` / `signalstats` (black, freeze, duplicate frames, fades, colour drift), numpy cross-correlation (audio duplication) | All the weights are already on the models volume and their licences are already recorded (`docs/MODELS.md`). No InsightFace. Everything runs on CPU | MIT / Apache-2.0 / BSD-3 / OpenRAIL (CCIP) | the whole QA module and its fixtures (synthetic clips) | calibration of every START threshold on real H3 takes |
| 7 | Music video (E) | Song master is authoritative (exists). Lyrics are aligned to the Demucs **vocal stem** with the same CTC aligner, falling back to the existing fuzzy `alignLyrics`. Lead and backing come from source stems, or from `UVR_MDXNET_KARA_2` through `audio-separator`. Each lyric line names its performers. Extra singers are caught per face track. Duplicate music is checked on the exported mix | Directive §8. Reuses B and C. AV-1 and AV-4 are already fixed at plan level; this adds measurement | MIT (Demucs, audio-separator, UVR models with credit ◐) | data model, alignment endpoint mode, mix duplication QA, extra-singer QA | singing alignment accuracy, extra-singer frequency, H3 `<|lyrics_start|>` behaviour |

**Rejected outright:**
- **Licence:** Wav2Lip (research and personal use only), Diff2Lip (CC BY-NC 4.0), InsightFace model packs and MMS
  forced-alignment weights (both non-commercial), and the default model of ctc-forced-aligner (MMS-based).
- **Video-model policy:** LipForcing, InfiniteTalk and every other Wan/LTX/Hunyuan-based lip-sync or extension tool.
- **No weights to adopt:** sliding "context windows" (Wan-style) and scene-level joint-attention methods (LCT,
  HoloCine, Captain Cinema). These need a trained model.

---

## 2. Findings and decisions by question

### A. Long-form multi-shot consistency

**A.0 MinimaxStoryBuilder re-check.** The repository still has exactly one commit, `47b6ceb` (2026-08-29, "Initial
release: paste a story, get a film") [S1]. Its only issue, #1, is about a missing `krea2_charactersheet_full_v1`
model file and says nothing about continuity [S2]. SB's verdict stands unchanged: the README describes a 22-frame
plus audio join, but the code ships hard cuts only.

**A.1 What the surveyed systems actually do**

| System | Identity across shots | Shot chaining / boundaries | State outside the LLM | Source |
|---|---|---|---|---|
| MovieAgent (showlab) | **Character bank** on disk: `character_list/<name>/photo_*.jpg + audio.wav`. Keyframes made with ROICtrl (or StoryDiffusion) | keyframe image → I2V (SVD / HunyuanVideo-I2V) per shot. Hierarchical CoT roles: director, screenwriter, storyboard artist, location manager | files (bank, per-scene plans) | [S3] ✔, [S4] ◐ |
| VideoClaw (formerly FilmAgent; `HITsz-TMG/FilmAgent` now serves VideoClaw, MIT, 2026) | character/scene concept art generated first, as the visual basis for every storyboard | script → design → storyboard → **reference image per storyboard shot** → video. Since 2026-06-11 the video mode is chosen **per shot**: first-frame, first+last-frame or reference-image | every stage's intermediate asset is visible, editable and re-generatable | [S5] ✔ |
| AniMaker (Anim-Director successor, SIGGRAPH Asia 2025) | storyboard by a Director agent | **MCTS-Gen**: several candidate clips per shot, pruned and selected by **AniEval** (story consistency, action completion) | agent-managed | [S6] ✔ (code "soon") |
| StoryAgent | reference videos of the subject; an **observer** agent reviews the results | storyboard → video | agents | [S7] ◐ |
| VideoGen-of-Thought | identity-preserving portrait (IPP) tokens in every shot's keyframe | keyframes → I2V (the 2025 version runs on FramePack). "Adjacent latent transition / boundary-aware reset" at joins | step-by-step pipeline | [S8] ✔ |
| Captain Cinema | **top-down keyframe planning** for the whole story first, for long-range coherence in characters and scenes | **bottom-up** synthesis between keyframes with a long-context MM-DiT trained on interleaved data | keyframe sequence | [S9] ◐ |
| Long Context Tuning (LCT, ICCV 2025) | full attention across all shots of a scene | **asynchronous noise**: earlier shots sit at low noise as clean context for the next. Context-causal variant for autoregressive shot extension with a KV-cache | in-model | [S10] ◐ |
| HoloCine (CVPR 2026) | holistic generation of all shots at once; window cross-attention per shot prompt; sparse inter-shot self-attention | in-model | in-model | [S11] ◐ |
| MAGREF / Phantom / SkyReels-A2 (reference-to-video) | 1–4 (Phantom: "within 4") subject reference images per generation. READMEs advise describing each reference's visual content precisely in the prompt | n/a | n/a | [S12–S14] ✔ |
| StoryDiffusion | consistent self-attention across a batch of images (SD1.5/SDXL), then transitions between them | image-then-video two-stage | none | [S15] ✔ |
| VideoDirectorGPT | **consistency groupings**: the same image+text embedding is reused for the same entity or background in every scene | layout-guided | video plan | [S19] ✔ |
| FramePack | constant-length compressed history context. "Anti-drifting" sampling; P1 plans "planned anti-drifting" and "history discretization" | next-section prediction | n/a | [S16] ✔ |
| ComfyUI community (Wan VACE extend) | last **16–24 overlap frames** as context per extension loop. **Colour drift** is a known failure, fixed with ColorMatch (MKL) or "auto colour drift correction" nodes | last-frames chaining | n/a | [S17] ◐ |
| ComfyUI core *Context Windows (Manual)* | n/a | sliding windows (`context_length`, overlap default 30, schedules `static_standard` / `uniform_standard` / …, fuse `pyramid`) within one sampling pass | n/a | [S18] ◐ |

**A.2 Techniques: what each solves, whether H3 has it, and the Vewbox decision**

| # | Technique | Problem solved | Model-specific? | H3 equivalent (local, v0.38.1) | DECISION |
|---|---|---|---|---|---|
| T1 | Story → scene → shot → beat planning by role agents [S3, S5, S6] | coherent structure, coverage | no | n/a (planner) | **Adopt (exists).** SB §f.7 beats and pace are still to do |
| T2 | Character bank / canonical reference on every shot [S3, S12–S14, S19] | identity, wardrobe | the mechanism is; the idea is not | `ref_images` ≤ 9 as `<Picture i>`, `<Subject N>` binding, `retention_analysis` (MC §1.1) | **Adopt.** Every shot carries the canonical image of every on-screen character plus the location plate, whatever its boundary type. Optional *derived* refs (a face crop of the canonical image for CU shots) are traceable to the canonical and count against the 9 (test G13) |
| T3 | Keyframe-first: an opening frame (or keyframes) drawn from references, then I2V [S3, S5, S8, S9] | composition, staging, identity on frame 0 | no | `first_frame` (fl2va) or AddGuide image at 0 on ref2va, together with refs (template `multiframe_reference`) | **Adopt.** The opening frame is drawn from canonical + plate + current scene state (Qwen-Image-Edit, exists), **never from the previous take's last frame**, except for CONTINUOUS boundaries |
| T4 | Last-frames chaining / overlap extension [S16, S17]; hosted "last frame as first frame" (MC §1.4) | motion continuity | the mechanism is | AddGuide clip of 5/22/39 frames + its audio at frame 0, head trimmed after measurement (`src/server/media/guide-head.ts`) | **Keep for CONTINUOUS only.** Add T5 and T6 so that drift cannot accumulate |
| T5 | Anti-drift by anchoring to clean or canonical context: FramePack anti-drifting, LCT low-noise context, community colour matching [S10, S16, S17] | identity and colour drift over long chains | in-model for LCT and FramePack; the idea transfers | H3 condition rows sit at t ≥ 0.999 ("clean") on the target timeline. An **AddGuide still at the last frame** (planned end state, drawn from canonical + state) is endpoint anchoring | **Adapt.** (a) **Chain-depth cap:** after K consecutive CONTINUOUS links (**START K = 4**), the next boundary becomes a CUT with a fresh, canonical-derived opening frame. (b) **Drift trigger:** if SFace-to-canonical falls by more than 0.10 (**START**) along the chain, re-anchor at the next boundary. (c) Optional end-state keyframe (test G10). (d) **Colour-drift metric** (signalstats U/V/Y means, head against previous tail and plate), **flag only, never auto-grade** (test G12) |
| T6 | Scene-level context of previous shots (LCT, HoloCine, Captain Cinema) [S9–S11] | lighting and look consistency across a CUT | trained capability | `ref_videos` (≤ 3, 2–15 s, `<Video k>`, with `ref_video_audios`) sit *before* the target as semantic context (MC §1.2) | **Adapt behind a flag.** For CUT within a scene, pass one excerpt of the previous approved shot (≤ 5 s, **START**) as `<Video 1>`. "Context only, not continuation" goes into the prompt. Default **off** until test G11 shows it does not leak motion or pose |
| T7 | Joint multi-shot generation with in-clip cuts (HoloCine; SB `[Shot N] At MM:SS`) [S11] | identity is free inside one generation | trained | `[Shot N]` grammar inside one ≤ 15 s take (SB §f.6) | **Adopt as SB recommends** (in-take cut, SB Q5) |
| T8 | Sliding context windows over a long sampling pass [S18] | length beyond the trained range | model/latent-specific | not verified for H3's nested AV latent; trained range is 124–362 frames | **Reject.** No need: shots are ≤ 15 s and boundaries are explicit |
| T9 | Multi-candidate generation with automatic evaluation and selection (AniMaker MCTS-Gen + AniEval, StoryAgent observer) [S6, S7] | first-attempt quality | no | n/a | **Adapt within directive §10.** Optional N > 1 takes per shot are ranked by the §D QA scores. **Every take and its scores stay in history.** No hidden loop "until pass": the take budget is set by the producer, and a failing set is surfaced, not retried |
| T10 | Latent blending or "boundary reset" at joins (VGoT) [S8] | visible seams | in-model | none exposed | **Reject.** Joins stay explicit: trim + 3-frame audio cross-fade, or a hard cut |
| T11 | Persistent per-character voice asset in the bank (MovieAgent `audio.wav`) [S3] | voice persistence | no | `ref_audios` (`<Audio j>`) + time-positioned AddGuide audio | **Adopt (exists):** canonical voice identity + ASR check |

**A.3 Shot boundary types, mapped to H3.** The directive's three modes are SB §f.6 (CONTINUATION / CUT /
STORY_TRANSITION plus the in-take cut). Research adds two rules to them:
- **(R1)** A CUT or TRANSITION never inherits pixels from the previous take, only state: positions, props, wardrobe,
  lighting text, and the plate.
- **(R2)** Every boundary type re-applies the canonical references (T2). The previous take is never the identity source.

These match how every system above that holds identity gets it: from the bank or keyframes on every shot.

### B. Forced alignment (word and phoneme timing)

**B.1 Comparison**

| Tool | Method | EN | AR | Accuracy evidence | CPU/GPU | Code licence | Weights licence | Dependency weight | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **WhisperX** 3.8.6 (PyPI; 3.8.7rc1 on main) | wav2vec2 CTC emissions; Python trellis + backtrack (`whisperx/alignment.py`, not `torchaudio.functional.forced_align`) | `WAV2VEC2_ASR_BASE_960H` (torchaudio bundle) | `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` (default map) | word accuracy within 20 ms on TIMIT: 52.7 % (vs MFA 72.8 %) [S26 ◐] | both | BSD-2 ✔ [S20] | per model (below) | heavy as a package: `pyannote-audio>=4`, `torchcodec`, `nltk`, `pandas`, `transformers`, `triton`. Pins `torch~=2.8.0`, the same as the `asr` image ✔ [S20] | **Adapt.** Vendor the alignment algorithm only (BSD-2 notice), not the package |
| ctc-forced-aligner 1.0.2 | same CTC approach; C++ (pybind11) Viterbi, "≥5× less memory than TorchAudio" | yes (romanised) | yes (`--language ara`, romanised, or a native-vocab model) | — | both | **inconsistent:** LICENSE file is BSD-2, `pyproject.toml` declares "CC-BY-NC 4.0" ✔ [S22] | default `MahmoudAshraf/mms-300m-1130-forced-aligner` is **CC-BY-NC 4.0** ✔ [S22] | light | **Reject** until the licence conflict is resolved upstream |
| torchaudio `MMS_FA` | MMS-300M CTC, 1,130 languages | yes | yes | in the MMS comparison of [S26] ◐ | both | BSD-2 | **CC-BY-NC 4.0** [S23 ◐] | torchaudio. The C++ forced-alignment op is in the set that "may be dropped" [S24 ✔]; search summaries say deprecated in 2.8, removed in 2.9 [S24 ◐] | **Reject** (non-commercial; API at risk) |
| Montreal Forced Aligner 3.4.2 | Kaldi GMM-HMM, pronunciation dictionary; **phone-level** | `english_mfa` | Arabic MFA dictionary v2.0.0 exists [S25 ◐]; the acoustic model page could not be reached | best of the three in [S26 ◐]; "mean boundary errors below 15 ms" on its 2026 benchmarks [S27 ◐] | CPU | MIT ✔ [S25] | MFA models CC BY 4.0 [S25 ◐] | heavy: conda (Kaldi, pynini), its own container | **Defer.** Optional phone-level (viseme) aligner later, separate container. Not needed for SyncNet scoring |
| NeMo Forced Aligner | NeMo CTC / hybrid models; token, word and segment timestamps; > 1 h audio | yes | `stt_ar_fastconformer_hybrid_large_pcd_v1.0` (CC-BY-4.0 ◐) | — | GPU preferred | Apache-2.0 (NeMo) | CC-BY-4.0 [S28 ◐] | very heavy (NeMo ASR) | **Reject** for this container (weight) |
| faster-whisper word timestamps (in use) | cross-attention / DTW on Whisper's own transcript | yes | yes | coarser than CTC on read speech per [S26, S32 ◐]; aligns what Whisper heard, not the script | GPU (in use) | MIT | MIT | already installed | **Keep** as cross-check and fallback; never the source of truth for script timing |
| stable-ts 2.19.1 | `align(audio, text)` with Whisper; VAD and silence suppression | yes | yes | — | GPU | MIT ✔ [S31] | Whisper MIT | needs openai-whisper / torch | **Not needed** (duplicates the above) |

**B.2 DECISION: primary aligner.** Add `POST /align` to `docker/asr/app.py`:
- **Input and output.** It takes `file`, `text`, `language`, `unit=word|char` and returns
  `{words:[{text,start,end,score}], chars?, coverage, model}`.
- **Algorithm.** Wav2Vec2ForCTC emissions from `transformers` (one new pip dependency; torch and torchaudio 2.8.0 are
  already in the image), then the vendored WhisperX trellis/backtrack (BSD-2 notice in the third-party notices file).
  Characters missing from the model's vocabulary are interpolated, as WhisperX does with NaNs.
- **Models.** EN uses the Hugging Face `facebook/wav2vec2-base-960h` (Apache-2.0 [S29 ◐]; the same LibriSpeech model as
  the torchaudio bundle, and it avoids torchaudio's deprecated pipelines). AR uses
  `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` (Apache-2.0 [S30 ◐]; one secondary card says its output is in
  Buckwalter transliteration, so the normaliser must map Arabic script to the model's actual vocabulary, checked at
  load).
- **Fetching.** Both models go into the models manifest with sha256.
- **What the timings are used for.** Aligned word windows on the **authoritative recorded line** set the shot's dialogue
  windows (directive §7 step 6), the subtitle timing and the lip-sync scoring windows (§C). On a generated take the
  same endpoint, run on the take's audio, gives an aligned-vs-planned onset error per word.
- **Confidence floor.** Lines whose mean CTC score falls below a floor (**START: calibrate**) are REVIEW.
- **No GPU needed.** Tests run on the recorded TTS lines already in `docs/evidence` (EN, then AR). Runtime on CPU has
  not been measured here.

### C. Lip-sync verification and correction

**C.1 Tools**

| Tool | Code licence | Weights licence / commercial | VRAM | Face resolution | Edits | Identity | ComfyUI node | Notes | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| **SyncNet** (`joonson/syncnet_python`) | MIT ✔ [S43] | `syncnet_v2.model` downloaded from robots.ox.ac.uk with **no licence stated** in the repo; the VGG page was unreachable. Detector `sfd_face.pth` (S3FD) also unlicensed in the repo | CPU fallback | 224 crop | scorer | — | — | 25 fps / 16 kHz hard-coded. `min_track` 100 frames by default. Outputs offset (±`vshift` 10 frames), min distance, confidence = median − min distance, and a median-filtered per-frame confidence [S43 ✔] | **Adopt as scorer** for realistic faces, internal QA only, legal check owed. Replace S3FD with YuNet (MIT) |
| LatentSync StableSyncNet (`stable_syncnet.pt`) | Apache-2.0 | in `ByteDance/LatentSync-1.6` (repo Apache-2.0 ◐). 94 % sync accuracy on VoxCeleb2 and HDTF per README ✔ | GPU | 256/512 | scorer | — | — | needs LatentSync's affine preprocessing; a different scale from LSE-C | **Fallback scorer** if `syncnet_v2` is refused legally |
| **LatentSync 1.6** (ByteDance, 2025-06-11) | Apache-2.0 ✔ [S33] | Apache-2.0 ◐ [S34]; VAE `stabilityai/sd-vae-ft-mse`; Whisper tiny/small | **18 GB** inference (1.5: 8 GB) ✔ | **512²** ✔ | **lower-face fixed mask** (`latentsync/utils/mask.png`) on an affine-aligned face ✔ | upper face kept from the source frames | `ShmuelRonen/ComfyUI-LatentSyncWrapper` (1.6) [S35 ◐] | requirements pin `torch==2.5.1` cu121 (no Blackwell wheels; needs cu128); **face detection = `insightface.app.FaceAnalysis`** (det + `landmark_2d_106`) ✔ → licence blocker [S46] | **Adopt as the optional corrector** after a detector swap and producer approval |
| MuseTalk 1.5 (2025-03-28) | MIT ✔ [S36] | "available for any purpose, even commercially" ✔; components: sd-vae-ft-mse, whisper-tiny, DWPose, BiSeNet face-parse (Google Drive, licence not stated) | 4 GB card works (fp16, slow) ✔ | **256²** face region ✔ | **whole face region** ✔ | README: moustache, lip shape and colour "not well preserved" ✔ | third-party | `torch 2.0.1` cu118, mmcv 2.0.1 → hard to port to sm_120. EN/ZH/JA | **Fallback corrector** (only if LatentSync fails tests) |
| Wav2Lip | — | "personal/research/non-commercial purposes" only; LRS2-trained ✔ [S37] | — | 96² | mouth | low | many | — | **Reject (licence)** |
| Diff2Lip | CC BY-NC 4.0 ✔ [S38] | — | — | — | mouth | — | — | — | **Reject (licence)** |
| VideoReTalking (Tencent) | Apache-2.0 ✔ [S39] | bundled third-party weights not checked | — | — | face | — | — | GAN pipeline, 2022; Tencent disclaimer forbids portrait-rights abuse ✔ | **Not pursued** (superseded; licence chain unverified) |
| KeySync (2025) | Apache-2.0 (repo LICENCE ✔ [S40]) | `toninio19/keysync` card unreachable; built on Stability's generative-models (SVD lineage, so the Stability licence probably applies ◐) | GPU | "high resolution" | masked lower face + occlusion handling ✔ | leakage-aware (LipLeak metric) | — | demo limited to 6 s | **Hold** (weights licence unknown) |
| OmniSync (NeurIPS 2025) | no code or licence found [S41 ◐] | — | — | — | mask-free DiT | — | — | — | **Reject** (not released) |
| LipForcing (KAIST, 2026-07-07) | Apache-2.0 ✔ | 14B student merged with **Wan 2.1** base + Wan VAE ✔ [S42] | — | — | mouth mask (borrows LatentSync's) | — | — | — | **Reject (policy: Wan)** |
| InfiniteTalk | — | Wan-based [search ◐] | — | — | regenerates head and body | — | — | — | **Reject (policy)** |

**C.2 DECISION: scorer.** This is a new module, `src/server/media/lipsync-check.ts`, backed by a CPU Python job in the
`asr` image or a small `qa` image.

*Which audio is scored.* The clip's picture is scored against the audio that **will play in the cut**. In an audio-first
dialogue shot that is the authoritative recorded line placed at its planned offset, not H3's regenerated audio (E1).
In a music video it is the master's vocal stem. Where the cut plays the take's own audio, that audio is scored.

*Steps for each speaking or singing shot:*
1. **Face tracks.** YuNet boxes are linked by IoU into tracks, and each track is assigned to a character by SFace
   (Hungarian match against the canonical images).
2. **Tier 1, mouth activity (always).** MediaPipe Face Landmarker gives the inner-lip gap divided by mouth width (MAR)
   per frame.
   - Speakers: MAR variance inside the aligned word windows against outside them, and the best lag between MAR velocity
     and the speech envelope within ±200 ms.
   - Non-speakers: MAR activity during the audio's speech windows.
   - Gives `MOUTH_STILL_WHILE_SPEAKING`, `MOUTH_MOVING_WHILE_SILENT` and `NON_SPEAKER_TALKING` (the last also catches
     extra singers, §E).
3. **Tier 2, SyncNet (realistic style only).** The track crop is resampled to 25 fps with 16 kHz audio, as
   `run_pipeline.py` does [S43]. Records: offset, LSE-D (min distance), LSE-C (confidence) and per-word-window
   confidence from the framewise output. `min_track` is lowered to the shot length (LatentSync's eval uses 50 [S33]).
4. **Offset repair before anything else.** If |offset| is 2–6 frames at 25 fps and the confidence passes, shift the
   audio placement by the offset. This is what LatentSync's own data pipeline does (`adjust_offset`, accepting
   `conf ≥ 3` and `|offset| ≤ 6` [S33 ✔]). Record the shift, then re-score. This keeps the face untouched.

Results go into the take's QA record as measured facts. A failure is visible, never silently regenerated.

**C.3 DECISION: corrector (optional, never applied to every shot).**
- **Eligibility.** All of these must hold:
  - (a) the shot is a dialogue shot that failed C.2 after the offset repair;
  - (b) the style is REALISTIC (stylised faces are untested; MuseTalk and LatentSync are trained on real faces);
  - (c) the face height is ≥ 128 px in the frame (**START**; LatentSync works on a 512² aligned crop);
  - (d) one tracked speaker is on screen;
  - (e) the producer approves (per shot, or per production policy).
- **Run.** LatentSync 1.6 runs with a YuNet + MediaPipe landmark adapter in place of InsightFace, `inference_steps` 20,
  `guidance_scale` 1.5 (repo config defaults ✔). It runs under the GPU lease with H3 unloaded (18 GB).
- **Output.** A **new take** (`derivedFrom`, `postProcess: 'LATENTSYNC_1_6'`); the original is kept.
- **Acceptance.**
  - SFace identity (the corrected frames against the original take's frames on the same track) median ≥ 0.80
    (**START**), and no frame below 0.60 (**START**).
  - LSE-C improved by ≥ 1.0 (**START**).
  - No new black, freeze or duplicate-frame findings.
  - Upper-face pixels unchanged outside the mask (mean absolute difference ≤ 2 luma, **START**; a check that the mask
    held).
- **On failure.** The derived take is kept and labelled failed; the producer chooses.

**C.4 Threshold guidance (all START, realistic faces, 25 fps SyncNet frames)**
- **Reference points:**
  - real-video ground truth reported around LSE-C 7.67 / LSE-D 6.88 [S44 ◐];
  - the `syncnet_python` demo prints confidence ≈ 10.0 and min distance ≈ 5.35 on its example [S43 ✔];
  - LatentSync keeps training clips with `conf ≥ 3` and `|offset| ≤ 6` [S33 ✔];
  - a 2025 diarisation dataset treats `conf ≥ 1` and `|offset| ≤ 5` as synchronised [S45 ◐];
  - the metric correlates poorly with human ratings and is sensitive to crop, quality and brightness [S44 ◐].
- **Start with:**
  - **LSE-C:** pass ≥ 5.0, review 3.0–5.0, fail < 3.0.
  - **|offset|:** ≤ 1 pass; 2–6 → offset repair; > 6 → fail.
  - **LSE-D:** recorded; review > 8.0.
  - **Per-word-window confidence:** review if any word window has median confidence < 1.0.
- **Not yet trusted for:** singing (sustained vowels lower the confidence) and stylised characters. Both use Tier 1 as
  the gate until G2 and G7 calibrate them.

### D. Automated continuity QA (licence-clean, CPU)

| Check (directive §10) | Tool | Measure | START threshold | Exists? |
|---|---|---|---|---|
| Character identity (realistic) | YuNet 2023mar (MIT) + **SFace** 2021dec (Apache-2.0, LFW 99.40 % [S47 ✔]), already on the volume | cosine, per assigned face track, 2 fps sampled, median, against the canonical image | fail < 0.363 (OpenCV's same-identity threshold, used in `FLUX-VS-QWEN.md`); review 0.363–0.50; pass ≥ 0.50. Repo evidence: realistic redraws scored 0.62–0.85 | weights yes, wiring **no** |
| Identity (anime) | CCIP caformer (OpenRAIL; use restrictions pass on) | difference against the canonical image | the threshold in `metrics.json` (0.178 per the repo note). Valid **anime-to-anime only** | weights yes |
| Identity (cartoon) | SFace advisory + DINOv2 face crop | cosine | advisory only (repo: SFace unreliable on stylised faces) | — |
| Facial drift within a take | SFace | max drop against the take's first kept frame along the track | review if the drop is > 0.15 | no |
| Wardrobe drift | **DINOv2-small** (Apache-2.0 ✔ [S50]) CLS of a torso crop (the region from 1.0 to 3.5 face heights below the chin, 2.5 face widths wide), against the same crop of the canonical image | cosine | **uncalibrated:** set at the 5th percentile of the first 20 accepted takes; until then record only | no |
| Location similarity | existing `plate-drift.ts` (luma structure, max 36) + DINOv2 global CLS against the plate, with people masked by their boxes | cosine | record-only until calibrated (as plate-drift does) | partial |
| Scene-object / prop consistency | prompt-listed props → **SigLIP 2** (Apache-2.0 [S51 ◐]) zero-shot presence on 3 sampled frames | text-image score | REVIEW only; never fail (open-vocabulary detection is noisy) | no |
| Unplanned cut inside a take | **PySceneDetect 0.7.1** AdaptiveDetector (defaults `adaptive_threshold` 3.0, `min_content_val` 15, `min_scene_len` 15 ✔ [S54]) or ffmpeg `scdet` (`t` 10; docs: "good values 8–14" ✔ [S55]) | detected cut times | any cut not within ±6 frames of a planned in-take `[Shot N]` cut → flag | no |
| Soft transitions / dissolves | TransNetV2 (MIT; TF weights in repo, PyTorch port needs a conversion step ✔ [S53]) | probability | optional, only if `scdet` misses dissolves (test) | no |
| Temporal discontinuity at joins | existing `assembly-joins.ts` (luma, RMS, flux) + `guide-head.ts` (PSNR head against tail) | as implemented | as implemented (C1 38.7 dB) | yes |
| Black frames | ffmpeg `blackdetect` (defaults d = 2.0, pic_th 0.98 ✔); studio uses `d=0.3:pix_th=0.10` | intervals | keep the studio values | yes |
| Freeze frames | `freezedetect` (defaults n = −60 dB, d = 2 s ✔); studio `n=-45dB:d=1.0` | intervals | keep; open freezes counted to the end (fixed) | yes |
| Duplicate frames / stutter | `mpdecimate` (defaults hi 64×12, lo 64×5, frac 0.33 ✔), log the dropped frames | runs of near-identical frames | flag a run ≥ 3 frames outside a planned hold; a generated 24 fps take should drop ~0 | no |
| Accidental fades | `signalstats` YAVG per frame | monotonic luma ramp ≥ 8 frames reaching YAVG < 20 (8-bit) | flag unless the boundary is a planned FADE or DISSOLVE (directive §5: no fades to hide failures) | partial (YAVG already read) |
| Colour drift (T5) | `signalstats` YAVG/UAVG/VAVG | head against previous tail; take against plate | review if mean \|ΔU\| or \|ΔV\| > 4 levels (uncalibrated) | no |
| Motion discontinuity | mean absolute frame difference series (`assembly-joins` measure) at the join against the take's own median | ratio | review > 3× (uncalibrated) | partial |
| Audio duplication | numpy normalised cross-correlation of onset envelopes (100 Hz): exported mix against master, and take audio against previous take around joins | secondary peak | flag a secondary peak ≥ 0.5 at \|lag\| > 50 ms. Chromaprint is LGPL-2.1 as a whole ✔ [S56]; not needed | plan-level only (AV-1) |
| Dialogue timing | `/align` (B) on the authoritative line and on the take | word-onset error against planned windows | review > 3 frames (125 ms) | no |
| Lip-sync score | §C | §C.4 | §C.4 | no |
| Duration / codec / container | ffprobe + full decode (`qaTake`, `validateExport`) | as implemented | as implemented | yes |

**Candidates and rejections for D**

| Item | Licence | Decision |
|---|---|---|
| AuraFace v1 (fal) | Apache-2.0 ◐; ResNet100 ArcFace-style, 512-d, LFW 99.65 % ◐; "trained on commercially available data" [S48] | Candidate upgrade if SFace does not separate characters on H3 output (G7) |
| InsightFace `buffalo_*` / `antelopev2` packs | "non-commercial research purposes only" ✔ [S46] | Reject |
| facenet-pytorch weights | VGGFace2 / CASIA-WebFace trained [S49 ✔]; dataset terms not checked | Reject |
| DINOv3 | custom licence [S50 ◐] | Reject |
| Ultralytics YOLO (person boxes) | AGPL | Reject. Use face-box heuristics, or MediaPipe pose (Apache-2.0) if needed |

### E. Music-video singing performance

| Need | Finding | DECISION |
|---|---|---|
| Authoritative track, no duplicates | AV-1 already mutes the takes' generated audio by plan (`buildMixPlan`) | **Keep.** Add audio-duplication QA on the exported mix (§D) |
| Lyric timestamps | Lyric aligners in the wild transcribe a Demucs vocal stem with Whisper, then DP- or fuzzy-match the known lyrics (syncalong, lyric-align [S60 ◐]). This is what `alignLyrics` (`src/server/media/lyrics.ts`) already does. Research aligner LyricsAlignment-MTL: code MIT ✔, but trained on DALI (dataset terms not checked) and English only [S59] | **Adopt:** Demucs vocal stem (in the container) → `/align` in a `singing` mode with the known lyric lines, done line by line inside each section window from `alignLyrics`. The current fuzzy path is the fallback. Low-score lines are REVIEW with a manual nudge. Phone-level MFA is not used for singing |
| Lead/backing separation | `audio-separator` 0.47.0 (MIT ✔) runs UVR models. UVR's README asks third-party users of **its** models to "honor the MIT license by providing credit" ✔ [S57, S58]. Karaoke model `UVR_MDXNET_KARA_2` (lead vs rest). Community Roformer karaoke checkpoints (e.g. `mel_band_roformer_karaoke_gabox`) have no stated licence ◐ | **Prefer source stems** (if the song engine outputs per-voice stems, use them). Otherwise Demucs vocals → `UVR_MDXNET_KARA_2` → lead / backing. Credit UVR in the notices file. Third-party Roformer karaoke weights: reject (no licence) |
| Performer by lyric segment | — | Data: `LyricLine { id, start, end, text, part: LEAD\|BACKING\|DUET\|CHORUS, performerIds[] }`. `part` is pre-filled from the stem energy ratio in the line window (backing-only if lead RMS < backing RMS − 12 dB, **START**) and confirmed by the producer. Shots are cut on line or beat boundaries. A shot whose window holds a sung LEAD line must show that performer, MCU or closer if lip-sync is intended. BACKING lines go to wide or off-screen coverage (no lip-sync claim) |
| Prevent extra singers | — | **Prompt:** only the performer's Subject gets the lyric (H3 has `<|lyrics_start|>…<|lyrics_end|>` special tokens (MC §1.2); their effect is untested, G15). Others are defined as "listening, mouth closed, not singing". **Refs:** voice/audio refs only for performers. **Framing:** no CU of non-performers during vocal lines. **QA:** per face track, Tier 1 mouth activity against the vocal stem, and Tier 2 SyncNet on non-assigned tracks. A non-performer track with conf ≥ 3 or high MAR correlation gives `EXTRA_SINGER` (flag, keep) |
| Singing lip-sync per shot | AV-4: H3 sings the right stretch hundreds of ms off. `sync.ts` corrects lag from loudness envelopes | **Add** the SyncNet offset of the assigned performer against the **lead stem** as a second lag estimate. When both agree within 1 frame the trim is applied as today; when they disagree → REVIEW (G14) |

---

## 3. Licence table (everything recommended or kept as a fallback)

| Tool / model | Role | Code licence | Weights licence | Commercial use OK? | Verified |
|---|---|---|---|---|---|
| WhisperX alignment code (vendored) | B | BSD-2-Clause | — | yes (keep notice) | ✔ [S20] |
| `transformers` | B | Apache-2.0 | — | yes | general knowledge; PyPI not checked |
| `facebook/wav2vec2-base-960h` | B (EN) | — | Apache-2.0 | yes | ◐ [S29] |
| `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` | B (AR) | — | Apache-2.0 | yes | ◐ [S30] |
| faster-whisper 1.2.1 + large-v3 | B fallback (in use) | MIT | MIT | yes | `docs/MODELS.md` |
| Montreal Forced Aligner 3.4.2 (deferred) | B phones | MIT | CC BY 4.0 (models) | yes (attribution) | ✔ code / ◐ models [S25] |
| syncnet_python | C scorer | MIT | `syncnet_v2.model`, `sfd_face.pth`: **not stated** | **unresolved**: internal QA only until confirmed | ✔ [S43] |
| LatentSync StableSyncNet | C scorer fallback | Apache-2.0 | Apache-2.0 | yes | ✔ code / ◐ weights [S33, S34] |
| MediaPipe Face Landmarker | C Tier 1 | Apache-2.0 | Apache-2.0 | yes | `docs/MODELS.md` (BlazeFace/Landmarker) |
| LatentSync 1.6 (optional) | C corrector | Apache-2.0 | Apache-2.0; VAE `sd-vae-ft-mse` (Hugging Face card not reachable) | yes **after the InsightFace detector is replaced** | ✔ code / ◐ weights [S33, S34, S46] |
| MuseTalk 1.5 (fallback) | C corrector | MIT | "any purpose, even commercially"; BiSeNet face-parse weights not stated | yes, except BiSeNet (check) | ✔ [S36] |
| YuNet 2023mar | C, D detector | MIT | MIT | yes | `docs/MODELS.md` |
| SFace 2021dec | D identity | Apache-2.0 | Apache-2.0 | yes | ✔ [S47] |
| AuraFace v1 (candidate) | D identity | — | Apache-2.0 | yes | ◐ [S48] |
| CCIP caformer | D anime identity | — | OpenRAIL (use restrictions) | yes, with the restrictions passed on | `docs/MODELS.md` |
| DINOv2-small | D wardrobe/location | Apache-2.0 | Apache-2.0 | yes | ✔ [S50] |
| SigLIP 2 base | D props (review only) | Apache-2.0 | Apache-2.0 | yes | ◐ [S51] |
| PySceneDetect 0.7.1 | D cuts | BSD-3-Clause | none | yes | ✔ [S54] |
| TransNetV2 (optional) | D dissolves | MIT | in repo (MIT repo) | yes | ✔ [S53] |
| FFmpeg filters | D | LGPL/GPL per build | — | yes (already shipped) | ✔ [S55] |
| Demucs 4.0.1 htdemucs | E stems | MIT | MIT | yes | `docs/MODELS.md` / Dockerfile |
| audio-separator 0.47.0 + `UVR_MDXNET_KARA_2` | E lead/backing | MIT | MIT with UVR credit (training data not stated) | yes (credit UVR) | ✔ [S57, S58] |

**Explicitly not usable:**
- Wav2Lip: non-commercial [S37].
- Diff2Lip: CC BY-NC [S38].
- InsightFace packs: non-commercial [S46].
- MMS forced-alignment weights: CC-BY-NC [S22, S23].
- ctc-forced-aligner: conflicting licence declarations [S22].
- DINOv3: custom licence [S50].
- LipForcing and InfiniteTalk: Wan [S42].
- KeySync weights: unknown [S40].

---

## 4. Open questions only a GPU test can answer

(SB §g Q1–Q12 still stand. These add to them; each names the decision it sets.)

| # | Question | Minimal setup | Decides |
|---|---|---|---|
| G1 | Native H3 lip-sync quality on EN dialogue (ref2va + time-positioned voice guide + exact `<d>` line). LSE-C / offset distribution | 3 speaking shots × 5 seeds, scored with C.2 against the authoritative line | how often correction is needed at all; LSE-C pass line |
| G2 | Is SyncNet meaningful on CARTOON / ANIME H3 faces? Does Tier 1 agree with a human rating? | 3 styles × 3 shots, blind 1–5 rating against both tiers | whether Tier 2 may gate stylised shots |
| G3 | Offset repair: how often a 2–6 frame shift alone brings a shot to pass | G1 set | whether the corrector is needed for H3 at all |
| G4 | LatentSync 1.6 on H3 output: identity (SFace before/after), mask seams at 1280×736, teeth and beard artefacts, runtime; install on torch cu128 for sm_120; VRAM with H3 unloaded | 5 failing shots from G1 | corrector go/no-go; C.3 acceptance numbers |
| G5 | Alignment accuracy on our TTS lines: EN (IndexTTS) and AR / Iraqi (Habibi IRQ). Word onsets against hand marks; Arabic vocabulary mapping of the xlsr-53 model | 20 EN + 20 AR lines (CPU is enough; GPU for speed) | the `/align` score floor; the AR model choice |
| G6 | Lyric alignment on Demucs vocal stems: CTC against faster-whisper + `alignLyrics` | 3 songs, hand-marked line onsets | the singing-mode default |
| G7 | SFace, AuraFace and CCIP separation on H3 takes: same character across shots against different characters | 4 characters × 6 takes | the identity START thresholds; whether to add AuraFace |
| G8 | DINOv2 wardrobe and location cosine distributions on accepted takes | first 20 accepted takes | wardrobe and location thresholds |
| G9 | Chain depth: identity (SFace to canonical) and colour drift over 1–8 consecutive CONTINUOUS links | one 8-link action chain | K (START 4) and the drift trigger |
| G10 | Does an AddGuide **end-state still** (canonical-derived) at the last frame reduce chain drift without visible snapping? | G9 with and without it | T5(c) |
| G11 | `ref_videos` context (previous approved shot) on CUT: does lighting and look consistency improve, or does motion or pose leak? | 3 CUT pairs with and without it | the T6 flag default |
| G12 | Colour drift magnitude between a take's head and the previous tail (ΔU, ΔV) on real joins | existing continuation joins | the colour-drift threshold |
| G13 | Does a derived face-crop reference (from the canonical) improve CU identity, or does it over-constrain expression? | 3 CU shots with and without it | T2 derived-ref rule |
| G14 | Music video: SyncNet offset on the performer against the lead stem, compared with the `sync.ts` loudness-envelope lag | 6 singing shots | which lag estimator the cut trusts |
| G15 | Does H3 respect `<|lyrics_start|>…<|lyrics_end|>` bound to one Subject? Frequency of `EXTRA_SINGER` with and without the prompt and framing rules | 2 performers + 3 extras, 5 seeds | the music-video prompt grammar |
| G16 | Unplanned in-take cuts: how often H3 cuts inside a single-shot prompt; `scdet` against AdaptiveDetector agreement | the G1 and G9 takes | the unplanned-cut detector |

---

## 5. Sources (all accessed 2026-10-05)

| # | Source | Status |
|---|---|---|
| S1 | https://github.com/lumosai8/MinimaxStoryBuilder/commits/main | ✔ |
| S2 | https://github.com/lumosai8/MinimaxStoryBuilder/issues | ✔ |
| S3 | https://github.com/showlab/MovieAgent (README) | ✔ |
| S4 | https://arxiv.org/abs/2503.07314 (MovieAgent paper) | ◐ blocked; search summary |
| S5 | https://raw.githubusercontent.com/HITsz-TMG/FilmAgent/main/README.md (serves VideoClaw); https://raw.githubusercontent.com/HITsz-TMG/VideoClaw/main/README_EN.md; LICENSE (MIT) | ✔ |
| S6 | https://github.com/HITsz-TMG/Anim-Director (README, AniMaker/README.md) | ✔ |
| S7 | https://arxiv.org/pdf/2411.04925 (StoryAgent) | ◐ |
| S8 | https://github.com/DuNGEOnmassster/VideoGen-of-Thought (README) | ✔ |
| S9 | https://arxiv.org/abs/2507.18634 (Captain Cinema) | ◐ |
| S10 | https://arxiv.org/abs/2503.10589 ; ICCV 2025 page (Long Context Tuning) | ◐ |
| S11 | https://arxiv.org/abs/2510.20822 (HoloCine); CVPR 2026 poster page | ◐ |
| S12 | https://github.com/MAGREF-Video/MAGREF (README) | ✔ |
| S13 | https://github.com/Phantom-video/Phantom (README) | ✔ |
| S14 | https://github.com/SkyworkAI/SkyReels-A2 (README; licence badge commented out, so its licence is unconfirmed) | ✔ |
| S15 | https://github.com/HVision-NKU/StoryDiffusion (README) | ✔ |
| S16 | https://github.com/lllyasviel/FramePack (README) | ✔ |
| S17 | https://github.com/Granddyser/wan-video-extender ; runcomfy "auto color drift correction" node page (overlap 16–24, ColorMatch MKL) | ◐ |
| S18 | https://docs.comfy.org/built-in-nodes/WanContextWindowsManual.md (Context Windows Manual) | ◐ |
| S19 | https://github.com/HL-hanlin/VideoDirectorGPT | ✔ |
| S20 | https://github.com/m-bain/whisperX (README, LICENSE BSD-2, pyproject.toml, whisperx/alignment.py) | ✔ |
| S21 | https://pypi.org/pypi/whisperx/json (3.8.6, BSD-2-Clause) | ✔ |
| S22 | https://github.com/MahmoudAshraf97/ctc-forced-aligner (README, LICENSE BSD-2, pyproject "CC-BY-NC 4.0"); PyPI 1.0.2 | ✔ |
| S23 | torchaudio `MMS_FA` docs and HF `mms-300m-1130-forced-aligner` card (CC-BY-NC 4.0) | ◐ |
| S24 | https://github.com/pytorch/audio/issues/3902 (✔); "deprecated 2.8 / removed 2.9" (search summary of the torchaudio tutorials) | ✔ / ◐ |
| S25 | https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner (README, LICENSE MIT); PyPI 3.4.2; mfa-models CC BY 4.0 | ✔ / ◐ |
| S26 | https://arxiv.org/abs/2406.19363 "Tradition or Innovation" (MFA 72.8 % vs WhisperX 52.7 % word accuracy within 20 ms, TIMIT) | ◐ |
| S27 | https://arxiv.org/abs/2606.18466 "MFA and the state of speech-to-text alignment in 2026" | ◐ |
| S28 | https://github.com/NVIDIA/NeMo/tree/main/tools/nemo_forced_aligner (✔); `stt_ar_fastconformer_hybrid_large_pcd_v1.0` CC-BY-4.0 (◐) | ✔ / ◐ |
| S29 | https://huggingface.co/facebook/wav2vec2-base-960h (Apache-2.0) | ◐ |
| S30 | https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic (Apache-2.0) | ◐ |
| S31 | https://github.com/jianfch/stable-ts (README, LICENSE MIT); PyPI 2.19.1 | ✔ |
| S32 | search results on cross-attention DTW vs wav2vec2 timestamps (arXiv 2408.16589 and others) | ◐ |
| S33 | https://github.com/bytedance/LatentSync (README; LICENSE Apache-2.0; `latentsync/utils/image_processor.py` fixed mask; `latentsync/utils/face_detector.py` InsightFace; `requirements.txt`; `eval/eval_sync_conf.py`; `preprocess/sync_av.py` conf ≥ 3 and \|offset\| ≤ 6; `configs/unet/stage2_512.yaml`; `scripts/inference.py`) | ✔ |
| S34 | https://huggingface.co/ByteDance/LatentSync-1.6 (Apache-2.0 per search summaries) | ◐ |
| S35 | https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper | ◐ |
| S36 | https://github.com/TMElyralab/MuseTalk (README, LICENSE MIT, requirements.txt) | ✔ |
| S37 | https://github.com/Rudrabha/Wav2Lip (README licence section) | ✔ |
| S38 | https://github.com/soumik-kanad/diff2lip (README: CC BY-NC 4.0) | ✔ |
| S39 | https://github.com/OpenTalker/video-retalking (README, LICENSE Apache-2.0) | ✔ |
| S40 | https://github.com/antonibigata/keysync (README; repo page reports an Apache-2.0 LICENCE file) | ✔ |
| S41 | OmniSync, NeurIPS 2025 (arXiv 2505.21448; project page blocked) | ◐ |
| S42 | https://github.com/cvlab-kaist/LipForcing (README, LICENSE Apache-2.0; Wan 2.1 base) | ✔ |
| S43 | https://github.com/joonson/syncnet_python (README, LICENSE.md MIT, download_model.sh, run_pipeline.py, SyncNetInstance.py) | ✔ |
| S44 | LSE reference values and limitations (search summaries citing VisualTTS arXiv 2110.03342 / LipDiffuser arXiv 2505.11391) | ◐ |
| S45 | M3SD dataset (arXiv 2506.14427): SyncNet conf ≥ 1, \|offset\| ≤ 5 | ◐ |
| S46 | https://github.com/deepinsight/insightface (README licence section) | ✔ |
| S47 | https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface (README: Apache-2.0, 99.40 %) | ✔ |
| S48 | https://huggingface.co/fal/AuraFace-v1 ; HF blog "Introducing AuraFace" | ◐ |
| S49 | https://github.com/timesler/facenet-pytorch (README, LICENSE MIT) | ✔ |
| S50 | https://github.com/facebookresearch/dinov2 (LICENSE Apache-2.0 ✔); DINOv3 custom licence (◐, github.com/facebookresearch/dinov3/issues/31) | ✔ / ◐ |
| S51 | `google/siglip2-base-patch16-*` cards (Apache-2.0) | ◐ |
| S52 | https://github.com/mlfoundations/open_clip (LICENSE, MIT-style) | ✔ |
| S53 | https://github.com/soCzech/TransNetV2 (README, LICENSE MIT, inference-pytorch/README) | ✔ |
| S54 | https://github.com/Breakthrough/PySceneDetect (LICENSE BSD-3; detector sources; `__version__` 0.7.1) | ✔ |
| S55 | https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/doc/filters.texi (blackdetect, freezedetect, mpdecimate, scdet, signalstats) | ✔ |
| S56 | https://github.com/acoustid/chromaprint (LICENSE.md) | ✔ |
| S57 | https://github.com/nomadkaraoke/python-audio-separator (README licence, models); PyPI 0.47.0 MIT | ✔ |
| S58 | https://github.com/Anjok07/ultimatevocalremovergui (README licence section) | ✔ |
| S59 | https://github.com/jhuang448/LyricsAlignment-MTL (README, LICENSE MIT) | ✔ |
| S60 | lyric-align (PyPI 0.4.1, https://github.com/ijuinryukichi/lyric-align), syncalong docs | ✔ (PyPI) / ◐ |
| S61 | https://github.com/Junhua-Liao/Light-ASD (LICENSE MIT); TaoRuijie/TalkNet-ASD (no LICENSE file found) | ✔ |

Repository context read: `docs/directives/CLOUD-SESSION-DIRECTIVE-2026-10-05.md`, `docs/research/STORYBUILDER-INTEGRATION.md`,
`docs/research/MINIMAX-CONTINUITY.md`, `docs/research/AUDIO-STACK.md`, `docs/AUDIOVISUAL-QA.md`, `docs/MODELS.md`,
`docs/research/FLUX-VS-QWEN.md`, `tools/flux-vs-qwen-identity.py`, `docker/asr/Dockerfile`, `docker/asr/app.py`,
`src/server/media/{plate-drift,guide-head,ffmpeg,lyrics}.ts`, `src/domain/continuation.ts`.
