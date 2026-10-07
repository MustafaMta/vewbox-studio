# Production execution status

One record per phase of the master plan (producer directive 2026-10-07). Evidence files live under
`docs/evidence/<phase>/` (git-ignored, kept on this machine).

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