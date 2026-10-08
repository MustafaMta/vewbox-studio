# Production execution status

One record per phase of the master plan (producer directive 2026-10-07). Evidence files live under
`docs/evidence/<phase>/` (git-ignored, kept on this machine).

## Producer human review — 2026-10-08 (supersedes any conflicting acceptance below)

- **Iraqi voice: human acceptance FAILED.** The synthesized Iraqi speech sounds artificial and robotic, less natural
  than the upstream reference recording itself. It is not promoted, whatever its ASR, phoneme or intelligibility
  numbers. Robotic but intelligible speech is a FAIL.
- **Video continuity: NEEDS IMPROVEMENT / NOT FINAL.** The videos are generally good but not professional:
  - identity drift;
  - wrong continuity between shots;
  - physical state that changes;
  - composition jumps;
  - drifting character and location details;
  - adjacent shots that feel independently generated.

  Music Video, Shorts, Episodes and long-form are not accepted until a 6–8 shot continuity validation scene passes by
  viewing.
- **Acceptance rule (permanent):** automated QA is necessary; human perceptual QA is authoritative. A job that
  finished, a passing test or a passing ASR score is never acceptance.
- **Recovery gate before later film phases:**
  - (A) video consistency and continuity;
  - (B) Iraqi speech naturalness (upstream Habibi parity first, root cause before any engine change).

## Phase 0 — Qwen3.8 production brain — DONE (2026-10-07)

- **Commit:** branch `phase1/qwen3.8-planner`, merged to `main` (see the merge commit after `Phase 0:` commits).
- **Models active:** `Inferact/Qwen3.8-27B-NVFP4` @ `6128240e` (Apache-2.0; 22 files, 26,404,416,448 bytes, sha256
  verified) on vLLM 0.31.0 (`vllm/vllm-openai:v0.31.0@sha256:c1c9f6fd…`, CUDA 13.0), compose service `llm-vllm`:
  TP 1, `--max-model-len 32768`, FP8 KV cache, `--enforce-eager`, qwen3 reasoning parser, `--max-num-seqs 2`,
  `--gpu-memory-utilization 0.90`, thinking off by default. It is the ONLY planner: the Ollama route (Qwen3.6, Gemma),
  the hosted MiniMax-text / Anthropic routes and the remote OpenAI-compatible route are removed from code, compose
  and configuration; an unconfigured or non-local planner fails with the reason.
- **Measured:** cold start to healthy 92 s (weights 9.8 s, engine init 36 s incl. one-time FlashInfer autotune);
  weights 24.18 GiB, KV 2.29 GiB = 57,040 tokens (1.74 × 32K); VRAM 29,976 MiB peak answering; container RAM 5.6 GiB;
  decode 12.9–13.4 tok/s; first token ≈ 0.2 s warm (6.9 s on the very first request); a 9,947-token prompt read in
  1.3 s; sleep level 2 in 0.4 s (1,698 MiB of CUDA context stays), wake 6.1 s (11.7 s through the lease).
- **Real artifact:** the Short "The Lamp Keeper" (`short-a8b550d0ab`) planned through the real UI: Develop the story
  → Write the script → Plan the shots. One character (Ruth, 72), one location (Blackrock Lighthouse lantern room), one
  scene, 4 shots with full continuity state (poses, eyelines, screen direction, props with owners, camera, lighting,
  boundaries) and World Bible revisions. Direct test 7/7 (text, JSON by prompt, JSON by schema, 2,119-token answer,
  instruction following, 9,947-token recall, over-context refusal).
- **First-attempt result:** 3 jobs, 3 LLM calls, 0 repairs, 0 truncations, 0 reasoning leaks, each job attempt 1
  (101 s, 37 s, 285 s). Live re-check after the route removal: asleep → woken by the app → schema-valid on attempt 1.
- **Defects found:** (1) decode is 13 tok/s, half of the retired Qwen3.6 (25) — `--enforce-eager` disables CUDA
  graphs; (2) the shot plan ran 20 s for a 15 s short and 4 shots where 3 were asked — `fitDurations` only stretches,
  never trims (`src/server/story/engine.ts:654`); (3) shots 3–4 stage the scratched message on the window glass where
  the script puts it on the lamp lens; (4) shot 2's screen direction contradicts its motion; (5) a non-word
  ("beneathfoot") in the live check; (6) the "Story engine" user setting (`llmProvider`) still exists (not honoured).
- **Root causes fixed:** shot-plan deadlines were sized on the retired Ollama window (16,384) instead of the planner's
  32,768 (`src/server/jobs/work-deadline.ts`); the planner's speed/VRAM figures were placeholders (25 tok/s,
  31,500 MiB) — now the measured 13 tok/s and 30,000 MiB; the story agents named "qwen3:14b (Ollama) or the configured
  hosted LLM" — now the planner.
- **Remaining blocker:** none for Phase 1. Open (Phase 0): decode speed (try decode-only CUDA graphs once stability is proven);
  shot-length overrun (2) and the lens/window slip (3) belong to the shot-planning work of the filming phases; old LLM
  weights (Ollama 54 GB: Qwen3.6, Gemma; FP8 30.9 GB) are deleted only after NVFP4 has run stably, with the
  producer's approval.

## Phase 1 — Character + persistent voice — DONE, listening pending (2026-10-07)

- **Commit:** `main` (Phase 1 commits after `90ac641`).
- **Models active:** Qwen3.8-27B-NVFP4 (character sheets), Qwen-Image-2512 fp8 (canonical figures, ComfyUI 0.38.1),
  VoxCPM2 (one designed voice seed per character), MOSS-TTS v1.5 (8B Delay; every spoken line), Whisper large-v3
  (heard-back checks), ECAPA (speaker similarity). Services: `comfyui`, `tts-design`, `tts-moss`, `asr`.
- **Built:** performer kind ACTOR / SINGER / ACTOR_SINGER in domain, DB (migration 0028), creation UI ("Performs", with
  singing voice and styles for a kind that sings), character page (slate + Performs section) and cast directory (label
  under the name, filter); the singing profile is stored apart from the spoken voice.
- **First-attempt policy enforced in this path:** canonical image drawn ONCE (no automatic redraw); voice design makes
  ONE voice (no best-of-3, no candidate grid); the voice seed is the character's (a retry makes the same voice);
  dialogue lines failing their gate are kept and flagged, never re-spoken automatically.
- **Real artifacts (through the UI):** Walter Finch — Actor, Cartoon; Hana Kisaragi — Singer, Anime (soprano; ballad,
  city pop); Marcus Bell — Actor + Singer, Realistic (baritone; soul, gospel). Each: one canonical full-body front
  figure (inspected, approved), one designed voice pinned to MOSS, the proof line and three different requested
  sentences. 12/12 lines heard back exactly (CER 0). Speaker similarity (ECAPA, mean over each character's 4 lines):
  within a character 0.806 / 0.773 / 0.759, across characters 0.106–0.194 — one persistent, distinct voice each
  (`scripts/voice-identity-matrix.ts`). Creation 2:03–2:13 per character (design ~60 s, figure ~60 s), voice build
  60–127 s, a line ~14 s.
- **First-attempt result:** 20 of 21 jobs on attempt 1. The exception: Hana's design needed 3 job attempts (see root
  causes).
- **Defects found:** (1) side-specific details are mirrored in 4 of 4 cases (pencil ear, hair streak, ring hand, brow
  scar) — Qwen-Image places "left/right" from the viewer; a measured A/B (15/24 either way) showed prompt wording does
  not fix it, so the approved image is the authority and the written sheet can contradict it; (2) Marcus reads older
  than 41 (all-grey hair and beard for "greying at the temples") and his "small healed scar" was drawn as a fresh red
  cut; (3) planner sheet slips: boots inside Walter's face field, a garbled wardrobe ending, "clean-shaven; no facial
  hair" for Hana; (4) the creation form remembers the previous character's kind and singing range (convenient, but a
  soprano can carry over); (5) MOSS takes emotion only from its reference, so gruff / proud / kind lines cannot be
  steered per line — to be judged by ear; (6) unconfirmed: the cast directory figures looked dull in the pane's
  screenshots (CSS and the thumbnail file are normal).
- **Root causes fixed:** the character-design schemas capped look fields at 80–200 characters while the character
  record stores 400 — Qwen3.8 writes 130–250 and cannot count characters, so three repair rounds failed and the job
  re-ran (Hana); the caps now equal the record's and the prompt asks for one short sentence per field (Marcus: 0
  repairs); the same latent cap in story development's invented characters fixed. The voice health check probed the
  retired IndexTTS service and reported the voice engine down; it now probes the configured English engine (MOSS).
  The creation form put Style beside the singing fields; the singing fields now have their own row.
- **Remaining blocker:** the producer must LISTEN — naturalness, emotional range and pronunciation are not claimed by
  any measurement (each character's page plays the voice and every line; "I listened" records the judgement).

## Phase 2 — Standalone music (no video) — COMPLETE / PROMOTED (2026-10-07)

- **Commits:** `4983b07` (song planner + ACE-Step-only recording), `937c603` (contract, budget and timing fixes),
  `1bb916f` (first recording; level, timing and lyric placement fixed at the root; CHECK_SONG), then the removal of the
  replaced music routes.
- **Models active:** Qwen3.8-27B-NVFP4 writes the song (concept, lyrics, sections, who sings each, tempo, key, engine
  caption). ACE-Step 1.5 XL-SFT + 5Hz LM 4B records it in ComfyUI. XL-SFT DiT verified 9,974,719,930 B
  (sha256 3c05ae26…); 4B LM verified 8,379,154,232 B. Demucs makes the stems; Whisper large-v3 and wav2vec2 CTC
  place the lyrics.
- **Built:**
  - Job WRITE_SONG (music director; LLM lease). Only cast members who sing (Singer / Actor + Singer) may sing; an
    unknown or non-singing name in the plan is refused, never guessed. The plan's schema is sized to the song's length.
  - GENERATE_SONG is ACE-Step XL-SFT only. A missing file is a configuration error naming the files; turbo runs only
    when MUSIC_ACE_VARIANT=xl-turbo. The vocal asked of the engine is the singers' own (e.g. "female soprano and male
    baritone vocal duet"). Provenance carries seed, singers, tempo, key and creative attempt 1.
  - An open level trim: plain gain to −1 dBTP when the raw true peak is above it. The raw recording is kept; the trim is
    in provenance and in the QA report.
  - Section timing: planned by line count, scaled to the real length, then settled on the sung lines so the sections
    cover 0…duration exactly.
  - Job CHECK_SONG ("Check the recording again") re-runs the post-recording steps without composing again
    (ORG_VERSION 17).
  - New songs default to the cast members who sing. Song tab: Write / Rewrite / Generate / Check.
- **Removed (replacement proven):** MiniMax Music 3 graph and model names, the hosted MiniMax Music endpoint,
  MUSIC_ENGINE and MINIMAX_MUSIC_MODEL, the registry rows, the licence row, the checker entries and `music-minimax-3`
  from the default groups. Its weights stay on D:\models until the producer decides.
- **Real UI test:** music video "Harbour Lights", English, 90 s, Hana Kisaragi (Singer) and Marcus Bell (Actor + Singer).
  - Write the song, run 1: refused by the tool contract (no `song` task). Fixed, with a test.
  - Run 2 (136 s): 9 sections and 26 lines, against the 5–7 sections asked. Root cause: no budget was enforced; fixed.
  - Run 3 (Rewrite, ~65 s, no repair): 8 sections, 24 lines, 72 BPM, F minor. Hana verse 1, Marcus verse 2, both on
    choruses and bridge.
  - Generate the song: ONE recording on the first attempt. XL-SFT, 50 steps, cfg 7, 28.9 s in ComfyUI, 46.5 s for the
    whole job. 90.0 s, 48 kHz stereo.
  - All 24 written lines are sung, in order (Whisper on the vocal stem hears them almost word for word).
  - Sections as sung: verse 1 6–19 s, chorus 19–32, verse 2 (Marcus) 32–46, chorus 46–60, bridge 60–72,
    chorus 72–90. The vocal ends at 89 s, so there is no outro.
- **Defects found on that recording and fixed at the root (proven on the SAME recording, no second composition):**
  1. `loudness()` read the first brace in ffmpeg's output. ComfyUI writes its workflow JSON into every FLAC's tags,
     so the level was never measured. A regression test reproduces the exact error.
  2. The raw recording peaked at +0.31 dBTP: now −1.31 dB trim, giving −13.0 LUFS / −1.0 dBTP.
  3. Sections were re-spread evenly after recording, so the lyric search windows were wrong: 17/24 lines placed, and
     CTC put the bridge 5 s early at confidence 1. Now 23/24 lines are placed and the sections match the transcript.
  4. The outro read 90–91 s of a 90 s song, and lines overlapped across sections. Both fixed by `settleSections`.
- **CHECK_SONG through the UI:** level, length, dead air and lyrics all pass; awaitingReview false.
- **First-attempt result:** WRITE_SONG three runs (one refused by a code defect, one superseded after the budget fix);
  GENERATE_SONG 1 of 1.
- **Remaining:** the producer must LISTEN to the whole song (Song & Lyrics tab). Machine checks prove the words, the
  timing and the level; they do not prove the voices sound like Hana and Marcus or that the song is good. Lyric craft
  is serviceable but generic.
### Phase 2 acceptance (producer, 2026-10-07)

- **Producer listening: PASS / PROMOTE.** The producer heard all 90 s. The song is musically coherent; vocals are
  clear; the verse/chorus/bridge progression works; performer changes and shared sections are audible; transitions are
  clean, with no broken joins, accidental silence, duplicated sections or destructive clipping; the ending resolves.
  Singer identities will become more distinctive with the persistent Singer identity system. That is not a blocker,
  and there will be no new creative attempt.
- **Recorded in the studio:** a new song listening verdict (`song.listening`, command `recordSongListening`), pinned
  to the recording it judged, so a later recording is never taken as accepted. "Your listening" on the Song tab;
  the verdict was entered through the UI.
- **Canonical artifact:** Harbour Lights. This is the original first creative generation, not regenerated, with only
  the proven non-generative corrections applied (level trim, timing, lyric placement).
  - Raw generation: `gen-c9a078c56b99878b13f7` (GENERATED; ACE-Step 1.5 XL-SFT + 5Hz LM 4B, seed 944536676, workflow
    9f536c011f0ea4dd, creative attempt 1; −11.65 LUFS / +0.31 dBTP), with its stems `gen-c9a078c56b99f68ce9ac` and
    `gen-c9a078c56b99d8636f9b`.
  - Final production asset: `gen-922728fc6047bed7573c` (DERIVED from the raw; level trim −1.31 dB in provenance;
    −13.0 LUFS / −1.0 dBTP), with its stems `gen-922728fc6047fd2908f4` and `gen-922728fc60477d97cc7a`.
  - Also kept: the Qwen3.8 concept, the final lyrics, 8 sections with performer assignments and per-line times, the
    tempo and key, the QA reports (REVIEW on the raw recording, ACCEPT on the final), the AUDIO_PREP handoff, and the
    job records.
  - The lyric alignment stays at the honest automated 23 of 24 lines. No threshold was changed to report 24/24.
- **ACE-Step is the Vewbox production music stack.** The MiniMax music routes and configuration are removed.
- **Retired weights deleted** (producer-approved, after a dependency check found no runtime reference: source,
  compose, services' mounts, and vLLM's `--model`). Ollama planners Qwen3.6 / Qwen3 / Gemma 4 (54.1 GB);
  Qwen3.8-27B-FP8 (28.8 GB; NVFP4 active and proven); FLUX.2 klein 4B and klein Base, its VAE and `qwen_3_4b`
  encoder (22.2 GB); MiniMax Music 3 (11.1 GB). 116 GB freed inside the store (414 → 298 GB used). Their manifest
  groups are removed; every current production model is intact.
- **Not touched** (outside the approved list; for a later decision): evaluation weights still in the store —
  `joyai_image_edit`, `qwen_image_2.1` with its VAE, `qwen3vl_8b` (two), `wan_2.1_vae`.
## Phase 3 — Iraqi Arabic voice + Iraqi song — IN PROGRESS, waiting for the consented reference (2026-10-07)

- **Decisions (producer, 2026-10-07):**
  - **Habibi-TTS Specialized IRQ** is the Iraqi/Baghdadi production engine, cloned from one consented Baghdadi
    reference. Never the Unified checkpoint.
  - **MOSS-TTS v1.5** stays the English/general engine; at most a controlled Iraqi comparison later.
  - No synthetic or designed Iraqi voice; no voice from an MSA prompt.
  - First-attempt rule: one result per request.
  - Machine checks are evidence only; the producer's ear accepts.
  - No Music Video until Iraqi speech AND the Iraqi song both pass by listening.
- **Licence corrected:** the Specialized IRQ checkpoint is Apache-2.0 per the model card. Unified, SAU and UAE are
  CC-BY-NC-SA-4.0 and are not used. The F5-TTS/Emilia lineage is kept as a separate provenance note for legal review.
  Pinned in manifest group `tts-habibi-irq`: SWivid/Habibi-TTS @ 3ad11a15, sha256 1801bcc5…f500.
- **Dialect setting, verified against upstream:** upstream's own CLI (`--model Specialized --dialect IRQ`) and its
  evaluation pass NO dialect token to a Specialized checkpoint; only Unified takes one (IRQ = ⑤). So dialect=IRQ selects
  `Specialized/IRQ/model_100000` with no token. tts-habibi declares and reports this in /health.
- **Routing:** an Iraqi voice's Latin-script and mixed lines go to MOSS (same reference) instead of the retired
  IndexTTS. MOSS's documented Arabic is now in its capability list.
- **Qwen3-ASR-1.7B wired** (`/transcribe_qwen`), from the original release already in the store, on transformers
  5.18's native model: config from `thinker_config`, 708 tensors renamed and checked at load, the official prompt.
  - English line: exact, auto-detected English, 3.2 s on the GPU.
  - **Measured hazard:** forced to Arabic on English speech, it TRANSLATED the line. A forced run is never a check.
  - On upstream's real Iraqi clip, Qwen3-ASR heard «من نقدر نأخذ» where the dialect Whisper heard «ما نقدر ناخذ»
    exactly. Both readings are reported.
- **Iraqi phonology gate:** spelling cannot confirm چ/گ (no recogniser writes چ). `/qa/phonemes` aligns the known
  line and reads each dialect word's span with wav2vec2-xlsr-53-espeak-cv-ft (IPA, Apache-2.0; group
  `qa-phoneme-espeak`, queued). `iraqi-phonology.ts` requires /tʃ/ for چ and /ɡ/ for گ. «باچر» without /tʃ/ fails —
  it is a regression test. Unverifiable words go to REVIEW, never PASS.
- **Iraqi songs:** the planner writes Baghdadi lyrics in Arabic script with an English gloss (`textAr` is what ACE-Step
  sings). MSA words are sent back with the Baghdadi word to use.
- **Waiting for:** the producer's consented 5–12 s natural Baghdadi reference, in
  `D:\vewbox-data\inbox\phase3-iraqi-reference\`. The character (male or female realistic Baghdadi Actor + Singer)
  is created only after the speaker is confirmed from the recording. The producer uploads it and gives consent in the
  character's Voice panel.
### Phase 3 — corrections and the first engineering evidence (2026-10-07, later)

- **Corrections applied (producer):**
  - Cross-language identity is measured, not assumed: `cross-language-identity.ts`, tts-design `/voice-profile`, and
    `scripts/cross-language-identity.ts`.
  - Dialect is judged in context, not by a word list: MSA-associated words are hints for a Qwen3.8 contextual review
    that rewrites only drift and keeps register-justified formal words. Only a lyric still judged DRIFTED fails.
  - The phoneme gate is kept, with /ɡ/ regressions added.
- **The reference clip the producer sent** (`src_habibi_tts_assets_IRQ.wav`) is byte-identical to the upstream Habibi
  IRQ demo asset (sha256 D6180049…59FCA4): 5.54 s, one adult female speaker (pitch median 226 Hz), natural Baghdadi,
  −27.9 LUFS, noise floor −67 dB. The speaker's permission is unknown.
  - **Producer decision:** LAB TEST ONLY — no character, no promotion, no acceptance. Every output is labelled
    "LAB TEST — NOT PRODUCTION / NO SPEAKER PERMISSION".
- **Lab run 1** (`scripts/iraqi-lab.ts`, var/eval/LAB-TEST-iraqi-20261007-2230). 13 Iraqi eval lines spoken once each
  by Habibi Specialized IRQ, and 2 English lines by MOSS, all from that clip.
  - **«باچر» → «باسر» in 3 of 3 lines, by BOTH recognisers.** Also «الحچاية» → «الحساء/الحسايا», «نحچي» →
    «نحثي/نحسي», «چاي» → «هاي», «چنت» → «هنت». The historical failure reproduces on Habibi IRQ even with a real
    Iraqi reference. The phoneme gate (model still downloading) will make it a formal FAIL or clear it.
  - **Root-cause checks so far:** چ is in Habibi IRQ's vocabulary (token 2563); our text preparation changes
    nothing; the service does no normalisation; upstream's formatter passes the text through untouched. So text
    handling is ruled out. Remaining: the reference has no چ in it; model capability or training orthography
    (untested — the dataset query failed). Next diagnostic, once the phoneme model is present: one line each with
    «باچر», «باجر» and «باكر», read phonetically. Diagnosis only, never a production respelling.
  - **گ:** the dialect Whisper heard «گوم» and «گلتلك» correctly. Elsewhere both wrote غ/ق (an orthographic
    convention for /g/) — the phoneme gate will decide.
  - **Other slips:** «وام حسين» → «ومحسن», «لمن چنت» → «اللي من هنت», MOSS's «I told you» → «It all/Itola». The
    second MOSS line was exact.
  - **Speaker evidence (machine only):** ECAPA to the reference 0.61–0.83 (Habibi) and 0.66–0.71 (MOSS); pitch 239 Hz
    (Arabic) vs 241 Hz (English) vs 226 Hz (reference). Across-language similarity 0.60 vs within-language
    0.68/0.71, so no flags: CONSISTENT by machine. The producer's listening decides.
  - Listening files were sent to the producer, labelled as lab tests.
- **Singer identity — ACE-Step timbre reference:**
  - ComfyUI's own "Set Reference Audio" turns a reference into a COVER (it drops the LM's audio codes and takes the
    song's content from the reference). The official text2music `reference_audio` keeps the LM. Built
    `docker/comfyui/custom_nodes/vewbox_ace_timbre.py`: the reference goes to the timbre encoder only, and the LM
    still writes the song.
  - **Pre-check** on Hana's synthetic studio voice (engineering only, controlled pair, same seed):
    - Both vocals sang the lyrics clearly.
    - ECAPA to Hana: 0.005 without the reference, −0.044 with it.
    - Pitch moved toward Hana (390 → 356 Hz vs her 330), but the tone got darker (centroid 1181 → 739 Hz vs her 1319).
    - **No evidence that the reference transfers identity.** One hypothesis, untested: the timbre encoder expects a
      musical reference, not speech.
  - The controlled test with the consented reference still decides. If ACE-Step fails it, singing voice conversion
    gets evaluated (maintenance, licences, provenance, singing quality). No such model is approved; Seed-VC is
    archived and GPL-3.0.
### Phase 3 — lab verdicts and gates (2026-10-07, later)

- **Producer listening, lab run 1 (Habibi IRQ + MOSS English): FAIL.** "None of the generated voices are right; they
  are not like the reference, which is professional, clear and Iraqi."
- **Configuration ruled out:**
  - Our sampling settings equal upstream's defaults (nfe 32, cfg 2, sway −1, speed 1).
  - The service passes the reference unchanged; the limiter took 0.0 dB off every line.
  - چ is Habibi's token 2563 and nothing rewrites it.
  - **Upstream's own `habibi-tts_infer-cli --model Specialized --dialect IRQ`**, run on the same reference and lines
    with none of our code, reproduces «باچر» → «الباسر» and «الحچاية» → «الحسايا».
  - Conclusion: with this reference, Habibi Specialized IRQ does not produce /tʃ/. That is a model capability, not
    an integration defect.
- **Controlled comparison** (same reference, same 13 sentences, one take each): MOSS-TTS v1.5 with language=Arabic.
  - The dialect Whisper heard چ in «چاي», «باچر» (2 of 3) and «چنت». It heard none in the Habibi set.
  - But «الحچاية … لباچر» was garbled («الحتشاية … لبطر»), and گ → ق in several lines.
  - Machine evidence only. Listening files were sent.
- **Gates:**
  - Iraqi production voice: `WAITING_FOR_USER` (a consented Baghdadi reference).
  - Lab listening of the MOSS Arabic comparison: `WAITING_FOR_USER_ACCEPTANCE`.
  - Iraqi engine decision, given that Habibi failed with a verified integration: `WAITING_FOR_USER`. The frozen stack
    keeps Habibi IRQ until the producer decides; nothing was switched silently.
  - Phoneme gate formal run: waiting for its model download (queued behind MOSS-SFX v2 and htdemucs_ft).
### Phase 3 — singer identity (2026-10-07, later)

- **ACE-Step timbre reference with a real human voice** (the lab clip; LAB TEST, controlled pair, same seed, Iraqi
  lyrics):
  - ECAPA to the speaker rose from 0.05 (no reference) to 0.389 (with the reference). For scale, the same person
    speaking scores 0.76–0.81 and different people 0.11–0.19.
  - Pitch moved toward hers: 328 → 262 Hz, against her 226 Hz. The tone came out darker.
  - Both arms are intelligible, and the dialect Whisper hears «گلبي», «هسه» and «باچر» with the چ (ACE-Step sings the
    چ that Habibi failed to speak).
  - **A partial shift toward the speaker, not identity preservation, and not voice cloning.** On Hana's synthetic
    voice there was no shift at all.
  - Samples were sent: `WAITING_FOR_USER_ACCEPTANCE`.
- **Minimal production-safe candidate, under evaluation:** SoulX-Singer-SVC (Soul AI Lab).
  - Zero-shot singing voice conversion that re-voices the song's vocal with the performer's reference. It is
    transcription-free and needs no per-speaker training.
  - Passes: Apache-2.0 for code and weights, active (updated 2026-03-13), runs locally.
  - **Open:**
    - Training data is a proprietary 42k-hour set with no named sources: provenance needs legal review
      (`WAITING_FOR_USER`).
    - It expects a singing prompt; a speech reference is untested.
    - Arabic is untested.
    - Its weights are .pt pickles, so they are loaded only in an isolated evaluation container.
  - Pinned as manifest group `eval-svc-soulx-singer` (2.98 GB), queued after the phoneme model.
  - NOT production-approved. Seed-VC stays excluded (archived, GPL-3.0).
- **SoulX-Singer SVC, first evaluation (2026-10-08; LAB TEST — NOT PRODUCTION / NO SPEAKER PERMISSION):**
  - Container: docker/svc-eval, upstream 81aeb3a. torch 2.7.1+cu128 instead of upstream's 2.2, transformers 4.41.2,
    whisper-base pinned and served offline. It runs on the RTX 5090.
  - Input: the Iraqi ACE-Step control vocal (30 s), re-voiced with the Habibi demo speaker. The reference is
    **speech**, which upstream does not claim to support.
  - Timing: 4.3 s of conversion, 46 s in all.
  - **ECAPA to the speaker: 0.668.** For comparison, the source was 0.05 and ACE's timbre reference 0.389;
    same-person speech scores 0.76–0.81. Converted against source: 0.211.
  - Pitch median moved to 233 Hz (the speaker's is 226 Hz). The F0 range widened to 16 semitones; possible octave
    errors, to be checked by listening.
  - The dialect ASR still hears the lyrics with گ and چ («يا گلبي، بشلونك هسه؟ باچر نرجع الدار…»), and more words than
    in the source.
  - The first mechanism that gives a singer a speaker's identity from a speech reference while keeping the Iraqi
    lyrics.
  - Gates: listening `WAITING_FOR_USER_ACCEPTANCE`; training-data provenance (legal review) `WAITING_FOR_USER`.
    NOT production-approved until both are passed.

### Phase 3 — robotic Iraqi speech: root-cause investigation (2026-10-08, after the producer's FAIL)

- **Phase 3 split:**

  | Part | Status |
  | --- | --- |
  | Iraqi pipeline engineering | continuing |
  | Iraqi lab engine quality | FAILED by listening |
  | Iraqi commercial character | `WAITING_FOR_USER_PRODUCTION_REFERENCE` |
  | Iraqi song planning | continuing |
  | Iraqi production song | not promoted |

- **Parity with upstream: established. Vewbox's Habibi inference is upstream's inference.**
  - **Code path:** the service calls the same functions as upstream's `habibi-tts_infer-cli`: f5_tts
    `preprocess_ref_audio_text`, then habibi_tts `infer_process`, F5TTS_v1_Base config, vocos, fp16, no dialect token
    for Specialized. Packages: habibi-tts 0.1.1, f5-tts 1.1.22, vocos 0.1.0, torch 2.8.0+cu128. The paper's eval
    path (`eval/1_infer_habibi.py`) differs only in skipping the edge-silence trim.
  - **Parameters:** nfe 32, cfg 2.0, sway −1, speed 1, target_rms 0.1, cross-fade 0.15 s — upstream's defaults.
  - **Reference:** the upstream demo clip, byte-identical, with upstream's own transcript
    («يعني ااا ما نقدر ناخذ وقت أكثر، ااا لأنه شروط كلش يحتاجلها وقت.»). F5's preprocessing cuts only pauses over
    1 s (this clip has none) and the edges.
  - **Text:** every character of the reference and of the 13 lines is in the IRQ vocabulary (2,711 symbols). Nothing
    maps to the unknown index.
  - **Measured outputs:** the 3 upstream-CLI lines and the Vewbox lines on the same text have identical durations
    (the same F5 length formula) and matching pitch, voicing and spectral features.
- **Post-processing: not the cause.**
  - The service's peak limiter took 0.0 dB off every line.
  - Lines are only resampled 24 → 48 kHz when joined.
  - There is no time-stretch, denoise, compressor, loudness normalisation or silence removal on a dialogue line.
  - The raw engine output is what is stored.
- **Where the robotic delivery comes from (the model and its prompt, not the integration):**
  - **Fixed-rate timing.** F5 sets a line's length as characters × the reference's average rate. Habibi's lines
    come out with almost no phrase pauses: 0 in 12 of 13 lines. The reference has 5 pauses in 5.3 s, and MOSS
    paused 1–5 times on the same lines.
  - **The prompt is a hesitant 5.5 s clip.** It has two «ااا» fillers and 1.46 s of pauses, and F5 copies the
    prompt's delivery. The fluent part between the fillers (~1.7 s) is too short to test as a prompt, so this
    hypothesis is tested with the consented reference: a fluent 8–12 s Baghdadi recording.
  - **Pitch:** Habibi's median pitch drifts above the speaker's (236–272 Hz vs 225 Hz), with wide pitch spreads on
    short lines. These are glides, not breaks: no pitch breaks were found in any set.
  - Machine numbers do not capture "robotic". The producer's ear decides.
- **Controlled MOSS diagnostic (§21).** This is the 2026-10-07 run: the same reference, the same 13 sentences, one
  take each.
  - MOSS phrases with pauses and its pitch stays steadier.
  - It garbles «الحچاية … لباچر» and turns گ into ق in several lines. The phoneme gate scored MOSS 6/10 and Habibi
    1/10.
  - Nothing was switched.
- **Listening pack** (`var/eval/LAB-TEST-iraqi-parity-20261008/`, LAB TEST). It has three sentences, each playing
  reference → Habibi (Vewbox) → Habibi (upstream CLI) → MOSS. Every file is a first attempt from 2026-10-07; nothing
  was generated again.
  - Listening: `WAITING_FOR_USER_ACCEPTANCE`.
  - Iraqi engine decision: `WAITING_FOR_USER`.
  - Consented reference: `WAITING_FOR_USER_PRODUCTION_REFERENCE`.

## Phase 5 — Shows / Seasons / Episodes — IN PROGRESS (2026-10-07)

- **Gaps found against the directive, and what was done:**
  - **Dead air:** export validation now fails a stretch below −50 dB longer than 4 s, unless the plan declared it
    intentional (be14814).
  - **Storyboard as pre-production:** each card shows how the shot joins the one before, the opening line and its
    speaker, whether every speaker has a voice, and the continuity it carries.
  - **Episode N+1 inherits Episode N:**
    - WRITE_SCRIPT now returns what each scene establishes: events, who learns what, and lasting changes.
    - The World Bible carries the knowledge and the changes still in force. The next episode's writer, story
      development and shot planner are told them, with the subject ("Omar (left arm): in a sling").
    - A rewrite replaces the writer's earlier facts; the producer's own facts are kept (5633d53).
  - **Sound design, stage 1: ambience beds** (2746042).
    - Every place can carry a bed: the AMBIENCE job, run by the new Sound Designer agent with MOSS-SoundEffect v2.
    - The description comes from the place and the time and weather its scenes are written in; the bed is recorded
      once.
    - The stored bed loops without a seam; a silent or clipped bed is refused.
    - The World Bible carries it, and the cut loops it under the place's scenes.
    - The location page plays it and can make a new one.
    - The real sound test waits for the service image to build.
  - **MOSS-SFX v2 service** (7e39d53): its own image on upstream's pinned stack, with the flat store linked into the
    diffusers layout.
    - All 16 weight files are sha256-verified.
    - A fetcher fix (ab76fa6): the hub's 10 s read timeout made a 5.7 GB file fail three whole attempts on this link.
  - **Root cause fixed: shot planning could never finish a normal scene** (ab76fa6).
    - At the planner's 13 tok/s, the tool's flat 600 s holds 7,800 answer tokens; a 4-beat scene's plan budget is
      13,600.
    - Every attempt of this episode's PLAN_SHOTS was cut off.
    - Each story call is now bounded by its own token budget at the measured speed.
  - **Restart recovery observed live:** the worker was killed mid-PLAN_SHOTS. After 90 s without a heartbeat the job
    recorded "attempt 2 lost … WORKER_LOST; attempt 3 took the job over" and continued under the new bound.
  - **Planner speed:** 13 tok/s (`--enforce-eager`) is now the long-form bottleneck, about 12 min per scene plan.
    Decode-only CUDA graphs are to be tried when the LLM is idle, measured against this baseline.
  - **Still open:**
    - spot effects per shot (footsteps, doors), on top of the beds
    - no film score
    - no automatic chain from idea to cut
    - no frozen input snapshot
    - a voice heard only over a radio has no character
    - long-scale runs are untested
- **Progressive test, step 1: "The Last Crossing"** (Episode 1 of The Night Ferry; English; realistic; 180 s target).
  - DEVELOP_STORY and WRITE_SCRIPT ran first time: 4 scenes, Marcus Bell alone in a lighthouse in a storm, 12 beats,
    5 short lines. The radio voice is never heard, so the missing character does not block this episode.
  - The script was written before the scene-facts change. It is kept, not rewritten for facts, because a rewrite
    would be a hidden creative retry.
  - Story approval is left to the producer: `WAITING_FOR_USER`. Shot planning does not depend on it.
  - **PLAN_SHOTS:** 26 shots, 176 s of 180, on attempt 3.
    - Attempts 1–2 were cut off by the flat 600 s tool bound (fixed, ab76fa6).
    - The worker was restarted mid-job: the WORKER_LOST takeover was observed.
    - Inspected: scene 1 was padded with five near-identical "prepares to act" shots. The root cause was the script's
      flat "2–6 beats"; fixed for later episodes (ea80043). This plan is kept: a replan would be a second creative
      attempt.
  - **Planner 4× faster** (430f275): decode CUDA graphs, 53–56 tok/s instead of 13.4.
    - A KV cache sized by utilisation could not cold-start beside the other services' idle CUDA contexts (2.6 GB).
    - Fixed KV 1.8 GiB: measured to start beside 2.6 GB held by others, and sleep/wake works.
  - **Dialogue:** 5 of 5 lines recorded (MOSS), 0 flagged, 0 unverified.
  - **The place was the wrong style.**
    - The realistic show held the cartoon short's lantern room, so its plate came out as an animated-feature still.
    - Fixed in the domain (one style per production, 1e98f6d) and in the pickers (59ad0fe).
    - "Make a realistic version" (05d5566) made the place in this production's style.
    - The show, episode and four scenes were moved to it through the real UI; realistic night plates are drawn.
  - **Ambience:** the first real bed (MOSS-SFX v2, attempt 1) was carried to both productions at the place.
    `WAITING_FOR_USER_ACCEPTANCE` (listening).
  - **Opening frames 1.1–1.3, inspected:**
    - 1.3 (wide, back to camera) is right.
    - 1.1 and 1.2 showed Marcus smiling and dry, where the plan says strained, soaked and out of breath.
    - The frame lab (scripts/frame-expression-lab.ts) found that prompt text cannot override the portrait's
      expression.
    - One edit pass on the drawn frame can override it, at SFace 0.44 (the same person; REVIEW band).
    - Built: the moment's expression and condition as one edit stage (52998a5, 0895843), the face measured and gated
      (FAIL refused, REVIEW shown).
    - Fixed: a hidden creative retry in frame drawing (dd2cf83).
    - Fixed: a close-up framing that drew a giant second face in the lens, which the people count missed. The face
      count is now part of the check (1f3113a).
    - Open: the edit pass loses the grey beard (SFace about 0.44 each time).
    - Open: the identity judge scores a back-to-camera frame as FAIL; it should be not applicable.
  - **First takes** (local H3, pruned int8, 20 steps; about 17 min each; first attempts):
    - **1.3:** continuous and right. Marcus is at the lens with his back to the camera, turns, and wipes his face in
      storm light; no speech in its sound.
      - Its "fade" and "cuts" were the lamp's flicker and lightning. Fixed (2acfaae): a cut now needs the picture's
        structure to change, and a dip in a shot whose own light flickers is reported, not flagged.
      - Its identity FAIL was a back-to-camera shot. Fixed (864c29b): people facing away are not measured.
    - **1.2:** plays the moment: strained at the door, "Come on…", turns to the stair, breath steaming.
      - Lip-sync is −4 frames; the cut moves the line.
      - Identity drifts 0.22 within the take: the edited frame's face (beard lost) morphs back towards the canonical
        image under H3.
      - `WAITING_FOR_USER_ACCEPTANCE`.
  - **Frame lab result:**
    - Naming the person's own hair and facial hair in the edit keeps the face (SFace 0.44 → 0.52 PASS; fc4ca64).
    - Root cause of the smile: the character design wrote expression into the look fields ("a warm, approachable
      expression"). Fixed for new characters (d9473de). Marcus's own image is locked by filming.
  - **1.1:** redrawn with the fix (strained, beard kept, one person; SFace 0.48 REVIEW) and filming.
  - **1.1 take:** it opens on the strained frame, then H3 cut inside the take at 2.0 s to the planned shoe-on-the-step
    close-up.
    - The planner called a shoe detail a close-up, which the frame stage reads as a face. Fixed for future plans
      (7006b76): a hand, foot or object is an INSERT.
    - Its "2 people" (legs) could not be reproduced from a single frame; the count prompt was clarified (4d2bc03), not
      claimed as a fix.
  - All three first takes were sent for viewing: `WAITING_FOR_USER_ACCEPTANCE`.
  - **4–8-shot stage: scene 2** (six shots of real action).
    - 2.1 and 2.5 were corrected in the UI to INSERT.
    - Frames are consistent (suit, tie, beard, room, night light) and the actions are right.
    - 2.3 is in profile (SFace 0.26): the preflight refused it. A profile now reads FAIL as REVIEW (8c27158); 2.3 is
      redrawn.
    - **Takes (local H3, first attempts):**
      - 2.6 has no flag: the first clean take.
      - 2.2 plays the moment (wipes his brow, looks up at the lens).
      - 2.1, 2.4 and 2.5 cut inside the take: 4 of the 7 takes so far. The 2.4 prompt carried contradictions (a start
        pose with "speaking" in a silent shot, the previous shot's props with alternatives); the speech part is fixed
        (5839e25). The carried state is the hypothesis for the cuts.
      - **Controlled test (e3cef94):** a take that starts from an opening frame now carries only the environment of the
        scene state in words (time, weather, light, place); the frame already shows the people and props.
        - 2.4 re-take, same seed (1942397004), only the prompt changed: one continuous push-in on the keeper at the
          lens. The original jumped to a wide of the lantern room at about 40% of the take.
        - Supports the hypothesis (n=1, not yet proven). The next takes in new scenes check it.
        - The re-take is REVIEW for identity: SFace median 0.41, drift 0.22 as his face turns down to the knob. This is
          the same drift as 1.2 (the edited frame's face moving under H3). `WAITING_FOR_USER_ACCEPTANCE`.
      - 2.3 says its line twice in the take's own sound; QA catches it and the cut keeps one window.
    - **Lip-sync −4 frames in both speaking takes (1.2, 2.3): the measure's own lead, not H3.**
      - Calibration: LatentSync 1.6 redrew 2.3's mouth to the take's own sound. It is trained to be in sync, and it
        measures −5/−4 (r 0.78), the same as the H3 take (−4, r 0.77).
      - Cause: the check correlates mouth opening with loudness, and the mouth opens before its sound (the /h/ of
        "Hold" is under the noise floor).
      - The cut had been moving the line 4 frames earlier, so the sound led the picture by about 170 ms.
      - Fixed (src/domain/lip-sync-calibration.ts): lags are judged from the measured −167 ms lead, the search
        widened to ±367 ms, and older records are read through the calibration, so 1.2 and 2.3 are no longer shifted.
      - Take 1.2 cannot be calibrated (r ≤ 0.22: he pants with his mouth open). The calibration rests on one clip;
        recalibrate with a real in-sync recording or SyncNet.
    - **Deadline fix (d247966):** the 2.3 frame job was stopped by its deadline while only waiting for the GPU behind
      the H3 renders. Deadlines now count work time, not lease-wait time.
  - **Phoneme gate, formal run** (scripts/phoneme-gate.ts, f96e6b6) over existing lab recordings:
    - Habibi IRQ: 1 PASS, 9 FAIL (چ never /tʃ/; گ mostly lost).
    - MOSS-TTS Arabic, same reference: 6 PASS, 4 FAIL (گ passes; چ in about half the words).
    - SVC song, source and converted: گ PASS, «باچر» heard /t/ in both (singing; the conversion does not change it).
    - This is measured evidence for the Iraqi engine decision (`WAITING_FOR_USER`).
  - **Phase 3 unblocked:**
    - All downloads are in (phoneme model, Habibi verified, SoulX-Singer and whisper-base).
    - The SoulX-Singer SVC evaluation ran (b5d19d3): not production-approved (listening and provenance gates).
    - The phoneme gate formal run is done (above).
## Video continuity recovery — root cause from real media (2026-10-08)

Evidence: "The Last Crossing", scene 2 (six shots, one character, one room). Every shot's first and last frame, plus
the opening frames and the location plate, inspected side by side.

- **What the producer saw, in the media:**
  - His suit flips between dry and soaked: dry at the start of 2.1, soaked at its end and in 2.2, dry in 2.3–2.6.
  - A forehead wound appears at the end of 2.5.
  - The lens assembly is a different object in different shots: the plate's large drum lens, a small table lantern
    in 2.1 and 2.5, a flat round lens in 2.6.
  - 2.1, 2.3, 2.4 (old take) and 2.5 change framing inside the take.
- **The plan is consistent.** All six shots say "Soaked, out of breath", the same wardrobe and the right props. The
  state is lost after planning.
- **Loss 1 — the opening frame does not realise the shot.**
  - Every frame is the location's one wide plate, edited with the character and then cropped to the framing (an
    INSERT is a 538×307 crop, upscaled).
  - The planned INSERTs (2.1, 2.5) came out as medium shots at an invented lantern.
  - "Soaked" took in 2.2 only, even though the condition edit pass ran on every frame.
  - Nothing checks the frame against the plan before filming.
- **Loss 2 — the H3 prompt contradicts the frame.**
  - 2.1's prompt says "close-up on the hands", "soaked and clinging" and "faces away from the camera". The frame shows
    a dry man, side-on, in a medium shot.
  - H3 resolves the conflict by cutting or morphing toward the text. This is the mechanism behind both the in-take
    cuts and the dry→wet flips. The environment-only scene state (e3cef94) removed only part of the contradiction.
- **Loss 3 — nothing actual is handed to the next shot.**
  - Every shot is composed fresh from the same plate and the canonical portrait.
  - The previous shot's real end state (its last frame: the wet suit, the lens as drawn, the light) never reaches
    the next frame.
  - Every boundary in the production is "cut" or "transition"; the planner never used a continuous boundary.
- Fix plan: the next section, after the code audit.
### Continuity handoff v2 — fixes (2026-10-08)

- **The previous shot's actual end feeds the next frame.** On a CUT inside a scene, the last frame the cut shows of
  the previous shot's chosen take is kept as a DERIVED asset (`take-end`, recording the take and frame). The CUT's
  opening frame is drawn with it as a reference: after the people, before the plate, in place of the face crop.
  - It carries the clothes and their condition, what each hand holds, the objects and the light, as filmed.
  - Identity still comes from the canonical images. The end frame is a temporary production reference, never a new
    identity.
  - The frame records `previousEnd`. The preflight warns when the previous shot's chosen take has changed since
    (stale frame).
- **An insert is a detail.** It is drawn from the previous end (or the clothes and hands cut from the canonical image,
  never the whole portrait) plus the plate around the middle, with "no face and no whole person". It is not
  people-counted.
- **The frame's framing is measured** by its largest face on a framing ladder. It is recorded on the frame
  (`framingCheck`). The preflight refuses a frame two steps from its plan, or an insert with a face filling ≥ 10 % of
  the frame height, and warns at one step.
- **Who is in frame:**
  - A speaker the plan does not put in frame is heard off-screen (`ShotDialogue.offscreen`): never added to the cast,
    voiced in the H3 prompt as "a voice from off-screen" with no description of the speaker, and left out of the
    lip-sync windows and speaker count.
  - A name only addressed, looked at, spoken of or marked off-screen no longer puts the person in the picture (body
    parts and actions still do).
  - The planner is told that `characterNames` means only who the camera sees.
- Tests: 208 files, 1,780 passed.
- **Next:** the 6–8 shot continuity validation scene (two characters, one prop, dialogue, physical interaction).
  One generation per shot; viewing decides (`WAITING_FOR_USER_ACCEPTANCE`).
### Continuity validation scene — setup (2026-10-08)

- **Production:** Short "The Relief" (`short-78dc9a8d75`), Realistic, English, 1 min, 16:9, created through the real
  UI.
  - Cast: Marcus Bell and the new character Elena Ward (`char-6301606560`).
  - Location: Blackrock Lighthouse Lantern Room, realistic (`loc-f24a33edef`).
  - Prop: a dented brass thermos.
- **Elena Ward**, created through the real UI: Actor, Realistic, English, Woman, 32.
  - The sheet, the figure and a designed voice (MOSS) were made on the first attempt.
  - **Defects found:**
    - The designer gave her Marcus Bell's distinguishing detail ("a small healed scar on her left eyebrow").
    - The figure drew it as a fresh red cut on the forehead: 2 of 2 characters now (Marcus in Phase 1).
    - Her sheet says "clean-shaven skin", which added a shaving clause to a woman's identity line.
  - **Fixed in code (dfa92d3):**
    - A scar is written as old and healed.
    - No clean-shaven clause for a woman.
    - The designer must give each character their own detail.
  - **Explicit redraw** (creative attempt 2, of the affected asset only, recorded): the red marks were smaller but
    still there. **The healed wording did not fix it.** The open fix is a negative prompt against fresh wounds for
    the canonical model (cfg 4 honours negatives). No further redraw.
  - **Figure version 2 was approved by the engineering session** for the continuity validation, as in Phase 1. It is
    not the producer's casting decision: the producer may redraw or re-cast. `WAITING_FOR_USER_ACCEPTANCE`.- **Plan (shot planner, first attempt; two framings changed in the UI like a producer would):**
  - Shots: 1.1 WIDE (Marcus at the lens) → 1.2 MEDIUM WIDE cut (Elena enters with the thermos) → 1.3 TWO-SHOT
    continuous ("You made it.") → 1.4 MEDIUM CLOSE-UP Elena, cut ("Radio's dead. Had to row.") → 1.5 MEDIUM CLOSE-UP
    Marcus, the reverse ("Duty calls.") → 1.6 INSERT, the thermos handed over → 1.7 WIDE continuous (to the windows)
    → 1.8 MEDIUM continuous. 60 s.
  - 1.1 and 1.7 were medium and medium-wide in the plan; they were set to WIDE so the scene opens on and returns to
    a wide.
- **Filming, one generation per shot, in order:**
  - **1.1:** ACCEPT, no flags (14.5 min). One continuous shot, the lens and cloth consistent. **Defect:** planned
    WIDE, filmed as a medium. A wide shot got no opening frame, so H3 chose its own framing. Fixed (bd0cc66): every
    shot is anchored by a frame, wide ones too.
  - **1.2, first frame:** drawn with 1.1's end as a reference, which copied Marcus in beside Elena. The people check
    refused it before filming. Fixed (bc8a362): the previous end is used only when everyone in it is in this shot.
    For one person of several it is cut to that person (a685c25).
  - **1.2, frame redrawn** (creative attempt 2 of the frame, after the fix, recorded): one person, framing PASS, the
    plate's exact layout. Take ACCEPT, no flags (12 min). Elena keeps her wardrobe, wet hair and the brass thermos
    throughout; the handheld camera follows her forward.  - **1.3, attempt 1:** started on 1.2's tail, then jumped to a static wide two-shot in another part of the room. The
    prompt said both "continues without a cut" and "locked off, the framing of the first frame holds", over a tail of
    another framing. Fixed (7bd24d7): a continuous shot carries on from the tail and reaches its framing by one smooth
    move; the planner's static camera sentence is dropped; a static continuous shot with a new framing is given a
    push-in or pull-back in the plan.
  - **1.3, attempt 2** (explicit rerun of the affected shot): continuous, no cut (QA no-unplanned-cut PASS). Marcus
    comes into frame and the camera settles on the two-shot, in the right room, with the thermos and cloth.
    - REVIEW flags: lip-sync not measured (Marcus in profile while he speaks); Elena's identity drifts 0.21 as she
      turns.
    - Take 2 was chosen for the cut: take 1 carries the known defect.
  - **1.4, frame:** drawn from 1.3's end cut to Elena (`personBand`): her wet coat, the thermos, the lens behind her.
    Framing PASS, one person, SFace 0.40 REVIEW.
  - **1.4, attempt 1: REJECT.** H3 said the line twice ("Radio's dead. Had to row. Had to row."), so the
    script-spoken gate failed. Fixed (457ec7a): every speaking prompt says each line once, with closed mouths around
    it. Explicit rerun of 1.4.
  - The machine restarted at about 10:43 (containers recreated). No work was lost; the worker resumed on its own.