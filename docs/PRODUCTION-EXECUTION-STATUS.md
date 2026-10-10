# CLEAN PRODUCTION VALIDATION RESTART — 2026-10-09

The producer rejected the previous generated creative data and restarted product validation from the foundation:
persistent performers first, then every later layer built on identities that are already proven. This is not a
source-code or a model-stack rollback; every proven engineering fix is kept. From this point only NEW artifacts count
toward production acceptance.

The previous validation (2026-10-07 → 2026-10-09) is **engineering history only**:
[docs/archive/PRODUCTION-EXECUTION-STATUS-pre-clean-restart-2026-10-09.md](archive/PRODUCTION-EXECUTION-STATUS-pre-clean-restart-2026-10-09.md).

## Reset — DONE (2026-10-09)

| Item | Result |
| --- | --- |
| Creative generation stopped (no active or queued jobs; the Fish image build stopped; Fish weights kept, verified) | DONE |
| Rejected creative data removed (`scripts/clean-production-reset.ts --apply`, the producer's explicit authorisation) | DONE |
| Active database | 0 productions, shows, seasons, episodes, shorts, music videos, characters, locations, scenes, shots, takes, assets, jobs, events, leases |
| Active library `D:\vewbox-data\library` | 0 files (313 files, 258 MB removed) |
| Recoverability | The removed media folders and a metadata dump of the removed rows are in the Windows Recycle Bin until it is emptied; no other copy was made |
| Audit record | [docs/archive/CLEAN-RESET-2026-10-09-manifest.json](archive/CLEAN-RESET-2026-10-09-manifest.json): timestamp, database counts, generated files and bytes, model-store size (427.6 GB), git commit |
| Source, git history, model weights (`D:\models`), model / licence / agent registries, settings, migrations, tests, infrastructure, engineering fixes | PRESERVED |
| Application | starts, connects, health 200, registries loaded (304 models), the UI opens on an empty cast |
| LAB fixtures | outside the production library (`var/eval`) |

## Validation order (one layer at a time; no layer is used before the producer accepts it)

Character visual identity → persistent voice identity → multilingual same-person voice → singing identity → locations →
world / story → storyboard → one video shot → two-shot continuity → small scene → short → music video → show / season /
episode.

## Phase 1 — Characters + voice identity (the only creative phase)

- **Allowed:** Qwen3.8 writes each character sheet; Qwen-Image-2512 draws ONE canonical front full-body image (neutral
  pose, neutral expression, no temporary condition); a designed original voice per character (VoxCPM2 design: no real
  person cloned); MOSS-TTS v1.5 speaks English; Habibi IRQ and MOSS Arabic each speak the Iraqi lines once, for the
  producer's listening.
- **Not allowed:** MiniMax H3, video of any kind, songs, locations, stories, shows.
- **The image is the visual authority:** once a canonical image is technically correct, the character's metadata is
  corrected to describe that image.
- **First-attempt rule:** one request, one output, inspect; a defect → keep the failed artifact, fix the root cause,
  one explicit regeneration of that asset.
- **Iraqi:** no engine is chosen and nothing is promoted from machine scores; Fish stays evaluation only.

| Character | Style | Performs | Languages | Canonical image | Voice | English samples | Iraqi samples | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A — Layla Haddad | Realistic | Actor + Singer (mezzo-soprano; Iraqi folk, acoustic ballad) | English, Iraqi Arabic | v1 DRAFT, first image request | designed synthetic (VoxCPM2), revision 1 | 5 / 5 MOSS, all heard as written | 5 Habibi + 5 MOSS (comparison) | waiting for the producer |
| B — Tariq Al-Rawi | Anime | Actor + Singer (tenor; pop, Iraqi maqam) | English, Iraqi Arabic | v1 DRAFT, first image request | designed synthetic (VoxCPM2), revision 1 | 5 / 5 MOSS, all heard as written | 5 Habibi + 5 MOSS (comparison) | waiting for the producer |
| C — Karim Al-Dawoud | Cartoon | Actor + Singer (baritone; Iraqi chalghi, wedding songs) | English, Iraqi Arabic | v1 DRAFT, first image request | designed synthetic (VoxCPM2), revision 1 | 5 / 5 MOSS, all heard as written | 5 Habibi + 5 MOSS (comparison) | waiting for the producer |

**`PHASE_1 = NOT ACCEPTED` for voice identity (the producer, 2026-10-09)** — the three canonical images and the
character records are KEPT; only the voice layer is being recovered:

| Recovery step | State |
| --- | --- |
| H3 BF16 download paused safely (partials kept: FL2VA 57.0 %, Ref2VA 9.2 %, VAE 57.8 % = 27.6 of 79.8 GiB) | DONE — resumes after the voice tests |
| FireRedTTS3-Base (official, Apache-2.0, revision dcf1bdcd, 8 files, hashes pinned) → `voice/fireredtts3-base` | DOWNLOADING (`var/download-fireredtts3.log`) |
| FireRedTTS3 as an evaluation engine (`docker/tts-firered`, same `/synthesize` contract, never production, never pinnable) | **RUNNING** (2026-10-09 21:15Z): image built in 30 min; `/health` ok; revision `FireRedTTS3-Base@dcf1bdcd`, code `FireRedTeam/FireRedTTS3@7a1f3a7`, PyTorch SDPA attention (no sm_120 flash-attn wheel), torch 2.8.0+cu128, transformers 5.6.2. **Direct inference** through the studio's `synthesize()` on character A's own seed and transcript, seed 7: English line 2.08 s of audio in 14.6 s cold (model load), Iraqi line 3.52 s in 2.7 s warm; output 24 kHz float WAV (`raw=1`), params n_timesteps 10 / cfg 2; **peak VRAM 14 728 MB**; clips `docs/evidence/phase1/firered-direct-{en,ar}.wav`. First defect found and fixed: the `speech.synthesize` tool contract refused the evaluation engine at the boundary (30 lines, nothing spoken) — contract widened, jobs retried as their first real attempt. |
| One voice identity per character with language profiles; creation offers English / Iraqi Arabic / Both | DONE |
| Controlled comparison: the same three characters, their existing references, one result per engine per line (English: MOSS vs FireRed; Iraqi: Habibi vs MOSS vs FireRed; the original Iraqi spelling, never rewritten) | after the weights verify |
| Blind listening pack of the three characters (`scripts/phase1-blind.ts` → Voice Studio → LAB comparisons → "Phase 1"): naturalness, Iraqi authenticity, pronunciation, emotion, same person, cinematic; engines revealed only after rating; the reference of an Iraqi line is the same character's English line | READY with MOSS + Habibi (FireRed arms added when spoken) |
| Same-person measures per engine (ECAPA against the same-language baseline, median pitch, pitch shift) in the review evidence | DONE for the current engines |
| Audar-TTS | not downloaded (capped licence) unless all three fail |
| Network queue strictly serial (the producer, 2026-10-09): weights → verify → image build → service → tests → pack → THEN the H3 BF16 resume | the H3 resume was un-queued and the image build stopped while the weights download; the build's wheel step now uses a BuildKit cache mount so a stopped build resumes its wheels |
| **Persistent mechanism: the FireRed tick** (`scripts/firered-tick.ps1`, Task Scheduler "Vewbox firered tick" every 5 min; no battery stop, no time limit, one instance, missed starts run) — locks, waits for Docker, reads the physical inventory, resumes exactly ONE step (fetch weights → build image → start + health-check service → after `var/state/phase1-pack-ready`, fetch the H3 BF16 tier from its partials), logs every transition to `var/firered-tick.log` | RUNNING. Why the previous chain died: the machine slept at 12:53Z (Kernel-Power 42, "Application API"), resumed 16:23Z, WSL/Docker restarted and the single task process was terminated (0x40010004); the partial was never touched |

**IndexTTS 2.5 orphans (≈ 10.4 GiB, not in the manifest): NOT deleted.** They are still referenced: the `tts` service in
`compose.yaml` (docker/tts, IndexTTS 2.5, :8020), `VOICE_ENGINES.indextts` in `src/server/providers/voice-engines.ts`,
`pickEngine` (the engine for non-Iraqi Arabic dialects) and `latinFallbackOf` (the English engine when `VOICE_ENGINE_EN`
is not MOSS), `docker/tts/app.py`, the registry and licence tables. The service is not running and no Phase 1 line uses
it, but the producer's rule is clear: delete only when nothing references them. Proposal for after the voice decision:
remove IndexTTS from the code and compose (MOSS or FireRed for English; Habibi/FireRed for Arabic; other dialects
out of scope) in one simplification commit, then delete the files and record the reclaimed space.

Earlier that day the gate read `WAITING_FOR_USER_ACCEPTANCE`; the producer's verdict on the voices came back NOT ACCEPTED. All three characters exist with one canonical image, one voice
identity and 15 lines each. Nothing after Phase 1 — singing, locations, story, storyboard, video — starts until the
producer has looked at the three images and listened to the English and Iraqi lines (`/characters/review`), and
recorded, per character and language, naturalness, dialect authenticity and whether the Iraqi voice is the same
person as the English one. The machine evidence below never decides; a voice that sounds like a different person in
Iraqi is a FAIL whatever the numbers say.

Review package: `/characters/review` (and Voice Studio → Character voices); machine evidence
`docs/evidence/phase1/<A|B|C>.json` (`scripts/phase1-review.ts`); the run itself is `scripts/phase1.ts`.

### Character A — what happened (first-attempt record)

1. **Creation attempt 1 refused before anything was made** (job-5f1863dfdd): the neutral-identity step stored a scar with
   its full drawing instruction (+~100 characters), so a distinguishing detail exceeded the record's 120. Root cause
   fixed (the identity stores the word "healed"; the drawing instruction is added only in picture/video prompts),
   regression test, then **one explicit regeneration** (attempt 2, `phase1:create:A:2`). Sheet, image and voice were
   each made once.
2. **Languages lost on read**: the state loader rebuilt the voice field by field and dropped the new `languages`
   list, so the voice was built with an English profile only. Fixed; the SAME identity (revision 1, same reference)
   was given its Iraqi profile (`addVoiceLanguageProfiles`, routing only — nothing re-spoken).
3. **Proof line heard by Whisper alone**: the Audio Synchronization Inspector was not allowed Qwen3-ASR. Fixed
   (ORG_VERSION 20; the org test's scan now follows functions a step calls). The proof was re-heard by Qwen3-ASR for
   the evidence: exact.
4. **Image vs sheet**: the sheet put a mole on the collarbone under a turtleneck; the image drew a small dark dot on
   the sweater. The image is the authority: the mole was removed from the identity (note on the character). The design
   prompt now asks for distinguishing details visible over the canonical wardrobe. The dot on the sweater is the
   image's only visible defect; whether it needs a redraw is the producer's call.
5. **Machine evidence (supporting only)**: English 5/5 heard exactly (Qwen3-ASR). Iraqi Habibi 3/5 exact; lines 2 and
   5 flagged — the phoneme gate did not hear چ in «باچر», «نحچي», «چاي», «چانت» or گ in «گدام». MOSS Iraqi: line 2 FAIL
   (heard in Persian-style letters), lines 3 and 5 REVIEW. ECAPA English↔English 0.72; English↔Iraqi 0.55 (Habibi) /
   0.56 (MOSS); median pitch shift −0.5 st (Habibi) / +0.6 st (MOSS). Naturalness, dialect and "same person" are the
   producer's.

### Character B — what happened (first-attempt record)

1. **Every artifact is a first attempt**: sheet, canonical image (anime line work, no photorealism; the star earring on
   the left ear as designed), voice identity (one, revision 1, English + Iraqi profiles from the creation — the
   languages persisted after fix 2 above), 15 lines. No regeneration.
2. **Sheet vs image**: the neutral-identity step had moved "expressive dark brown eyes" whole to the personality, leaving
   the eyes field without a colour. The image shows large dark brown eyes; the sheet was corrected to the image and the
   step fixed (an adjective leaves, the noun stays). A doubled "and" in the wardrobe tidied.
3. **Machine evidence (supporting only)**: English 5/5 heard exactly. Iraqi Habibi: line 1 exact; line 2 **FAIL** (CER
   0.27, median pitch 93 Hz against ~200 Hz elsewhere — a voice break for the listener to hear); lines 3–5 REVIEW; چ
   not heard in «باچر», «نحچي», «چان». MOSS Iraqi: lines 1, 3, 4 heard; 2 and 5 REVIEW. ECAPA English↔English 0.68;
   English↔Iraqi 0.46 (Habibi) / 0.56 (MOSS); pitch shift −1.2 st (Habibi) / −1.5 st (MOSS). The producer's ears decide.

### Character C — what happened (first-attempt record)

1. **Every artifact is a first attempt**: sheet, canonical image (stylised cartoon proportions, an original design —
   not a studio character; turban, dusty-blue dishdasha, burgundy vest, brown shoes, age spots on the hands as
   designed), voice identity (one, revision 1, English + Iraqi profiles), 15 lines. No regeneration.
2. **Sheet vs image**: the image shows a short grey-flecked beard and moustache the sheet never named — added to the
   face (the image is the authority). The design gave him a gold star earring in the left ear, the same motif as B's
   silver one although the prompt forbids a detail another cast member has; kept because it is in the image, noted as
   a cast-distinctness defect of the design model. "deep laugh lines" returned to the face (rule fixed: wrinkles are
   physical).
3. **Machine evidence (supporting only)**: English 5/5 heard (one CER 0.09 on "Come in…"). Iraqi Habibi: lines 1, 3, 4
   exact; line 2 REVIEW (گ in «گلتلك» and چ in «باچر», «نحچي», «چاي» not heard); line 5 REVIEW (چ in «چنت»). MOSS Iraqi:
   line 2 FAIL, 1 and 5 REVIEW. ECAPA English↔English 0.68; English↔Iraqi 0.45 (Habibi) / 0.54 (MOSS); median pitch
   ~119 Hz in both languages (shift +1.5 st Habibi, +0.1 st MOSS).

### Across the three — what the machine can say before the producer listens

- The chain is reliable now: after A's refused first attempt (a code defect, fixed), B and C were made end to end on
  the first request with no regeneration — sheet, image, identity, 30 lines each.
- Every English line of every character was heard back as written by Qwen3-ASR (15/15).
- Iraqi line 2 («گلتلك باچر نكعد نحچي ونشرب چاي») is the hard one for both engines and all three voices: the Iraqi
  letters چ and گ are not heard as /tʃ/ and /ɡ/. This is consistent with the earlier LAB finding (چ never confirmed by
  ASR in 36 tries); whether the engines SAY them right is for a native ear.
- Cross-language ECAPA sits at ≈ 0.45–0.56 against a ≈ 0.68–0.72 same-language baseline for all three; the
  comparison is language-sensitive, so this neither proves nor disproves "same person" — it is why the listening
  comparison exists.

## 2026-10-10 — PROFESSIONAL IRAQI VOICE master directive (supersedes the Phase 1 voice path)

**Human verdicts (the producer, after listening):** Habibi Specialized IRQ = `EVALUATED — HUMAN FAIL`;
FireRedTTS3-Base = `EVALUATED — HUMAN FAIL`; MOSS Iraqi = `BASELINE / NOT ACCEPTED`. Synthetic, robotic cadence,
wrong چ/گ, identity not stable across English and Iraqi. Evidence preserved (`docs/evidence/phase1/*.json`, the blind
pack `var/eval/phase1-voices-2026-10`, 75 clips); no further comparison batches for these engines.

**The last FireRed finding before the verdict (for the record):** with the identity's English design seed as the prompt,
every FireRed Iraqi line was unintelligible to Qwen3-ASR (CER 1.1–1.4, heard as Danish/English/Persian-like); with the
SAME character's own Iraqi line as the prompt, the same lines were intelligible (CER 0.07–0.14, «گلتلك باچر…» heard
«قلت لك باجر نكعد نحتى ونشرب جاي»). Upstream's own guidance: "use a prompt in the desired language". Cross-lingual
prompting from an English seed is the model's limit, not a service bug — and irrelevant now: the engine failed the ear.

**The programme now (one capability, one identity):** `Vewbox-IQ` = Chatterbox Multilingual V3 (official, MIT, pinned)
+ Iraqi/Baghdadi dialect adaptation trained ONCE on licensed data (LoRA first, then strategic partial fine-tuning if the
dialect is not learned), reference-conditioned per character; one `CharacterVoiceIdentity` per character with a
canonical reference pack and English / Iraqi profiles; Character A only until the architecture passes a decisive
five-line pack on its first attempt; gate `CHARACTER_A_VOICE = WAITING_FOR_USER_ACCEPTANCE`. Download priority:
Chatterbox V3 → Iraqi corpus → training data → training deps → H3 BF16 (its partials kept: FL2VA 57 %, Ref2VA 12 %,
VAE 58 %; the resume that had started at 21:50Z was stopped) → others. Research (current, from original sources) first:
`docs/research/iraqi-voice-production.md`, `docs/research/iraqi-speech-and-singing-brief.md`.

### Vewbox-IQ — the four prerequisites (the producer's order of 2026-10-10)

| # | Item | State |
| --- | --- | --- |
| 1 | **Chatterbox Multilingual V3 verdict** ([research](research/iraqi-voice-production.md)) | `ResembleAI/chatterbox` @5bb1f6ee (2026-06-10), **MIT**; T3 v3 `t3_mtl23ls_v3.safetensors` (536 M, Llama 30×1024) + S3Gen (264 M, CosyVoice CFM + HiFT, 24 kHz; the official loader uses `s3gen.pt`, `s3gen_v3` shipped — A/B by ear) + voice encoder; `ar` and `en` among 23 languages; reference cloning via a 256-d voice embedding + 6 s prompt tokens + 10 s S3Gen reference; the reference must match the language tag (cross-language references measurably hurt → two same-actor references per character); RTX 5090: cu128 torch ≥ 2.7 (the pin is 2.6.0), ≈ 3.5 GB VRAM, RTF ≈ 0.3–1 unoptimised; fine-tuning: no official trainer — proven LoRA r32/α64 on T3 attention/MLP at lr 3e-6 (2e-5 diverged), then partial FT of T3 layers 18–29 with `ve`, `s3gen`, `cond_enc`, `speech_emb/head` frozen (identity enters T3 only through `cond_enc`); grapheme input (the vocabulary already holds چ گ پ ڤ). **4.0 GiB pinned (`voice-chatterbox-mtl-v3`), fetching through the tick.** |
| 2 | **Iraqi dataset report** | Licensed Iraqi audio today: Kharrufa corpus (CC BY 4.0) ≈ **1 h Iraqi** + 3.7 h Damascene MSA (Halabi), a Google Drive zip, speaker count and sample rate not published online; Omnilingual ASR corpus (Meta, CC BY 4.0) Iraqi rows `acm_Arab` + `ayp_Arab` ≈ 2.2 GB parquet, multi-speaker, ASR-grade. Nothing else carries training rights (the other HF "iraqi" sets have no licence; MASC is YouTube-derived; LDC is 8 kHz telephone under a fee licence; Kharrufa's phonetiser is CC BY-NC and is not used). Licence records written; fetch queued behind Chatterbox; the measured report (`scripts/iraqi-dataset.ts prepare/report`: hours, speakers, loudness, SNR, clipping, length, duplicates, dialect-unit coverage, deterministic split) follows the download. **Gap that limits professional quality: ≈ 1 h of studio Iraqi speech is warm-up data; the cinematic dataset is the studio's own consented Baghdadi recording (≥ 3 speakers, ≥ 10 h, 48 kHz, the emotions and registers of the brief).** |
| 3 | **Iraqi phoneme/text frontend** (`src/server/providers/iraqi-g2p.ts`) | Original script untouched (`engineText`); internal pronunciation (lexicon-first: the brief's 75 words with IPA; clitics and the article with sun-letter assimilation; letter rules: چ→tʃ گ→ɡ پ→p ڤ→v, ق→ɡ by default / q in the learned list / k in وقت-type words, ج→dʒ, ض/ظ→ðˤ); `dialectWords` names what the phoneme gate must confirm; permanent regression tests for باچر نحچي گلتلك گدام and the coverage vocabulary. Model input stays graphemes in pronounced Iraqi spelling (the research's decision); the phoneme inventory is the annotation/QA standard. |
| 4 | **CharacterVoiceIdentity** | One identity per character: `canonicalReferencePack` (same-performer clips: neutral seed, expressive, English, Iraqi), `speakerFingerprint`, `languageProfiles` (English / Iraqi; singing later), status, lock; Voice Studio shows one identity. Done. |

**Autonomous mode (the producer, 2026-10-10): no user approvals between phases; gates are `AUTO_REVIEW_PENDING` →
PASS/FAIL recorded `AUTO_APPROVED_BY_ENGINEERING_QA` (never the producer's approval). Known limit stated with every
audio gate: the engineering QA cannot listen — audio verdicts rest on Qwen3-ASR, the phoneme gate, ECAPA, pitch/prosody
statistics and transcripts; images and frames are inspected directly.**

**Dataset (measured):** train 12.6 h / validation 0.73 h / test 0.6 h (Omnilingual Iraqi 1,891 utterances, 12.87 h,
11 speakers, SNR 55 dB, 413 transcripts respelled into pronounced Iraqi spelling; Kharrufa 450, 1.08 h, 1 speaker;
MSA replay 1,687, 3.32 h). Reports: `D:\vewbox-data\training\iraqi\reports\*.md`.

**Chatterbox V3 base (no adapter), the same five lines, Character A's seed, seed 7, through the pipeline** —
`D:\vewbox-data\training\iraqi\eval\base\scores.json`: Iraqi CER 0.16 / 0.167 / 0.122 / 0.105 (mean 0.139), ECAPA to
the seed 0.51–0.69 (mean 0.63), phoneme gate 0 of 2 («گلتلك» heard «أل تلك», «باچر» «بأر», «چاي» «صاي»); English CER 0,
ECAPA 0.82. The smoke gate must beat these on real audio: Iraqi CER and the چ/گ gate better, similarity not below, English unchanged.

**Smoke #1 (`stage-a-smoke`, 200 steps, peak lr 3e-6, batch 4, 0.5 h main + 0.5 h MSA replay at 0.2, LoRA r32/α64 on 30
layers + Arabic text_emb rows, 25.1 M trainable of 561 M; commit a6d6975) — `AUTO_REVIEW: FAIL`.** Same five lines,
reference and seed: Iraqi CER 0.136 vs base 0.139, phoneme gate 0/2 vs 0/2, the hard line worse (0.30 vs 0.167), ECAPA
0.644 vs 0.627, English CER 0 / 0.84 (intact). Root cause: no learning — the loss stayed flat at ≈ 7.2 for all 200 steps;
a peak lr of 3e-6 over 800 samples (the Praxy figure belongs to 8,000 steps × batch 16) cannot move the model. Before
that: upstream `T3.loss` crashed on step 1 (untransposed, unshifted cross-entropy) — replaced by a shifted next-token
loss in the trainer. Evidence: `D:\vewbox-data\training\iraqi\eval\stage-a-smoke-step-000200\scores.json`,
`checkpoints\stage-a-smoke\train-log.jsonl`. Decision: ONE controlled second smoke with enough signal to be measurable
(more steps, a higher but still conservative lr, the loss required to fall), everything else unchanged.

**Smoke #2 (`stage-a-smoke2`, 1,500 steps ≈ 1 epoch of 12.6 h, batch 8, peak lr 1e-5, warm-up 100, 40 s cap, replay 0.2,
grad checkpointing; 13 min) — `AUTO_REVIEW: FAIL` on Character A.** The loss fell (6.78 → 6.08; text 2.2 → 1.77, speech
4.55 → 4.0–4.3; no divergence), but the five lines from the English seed did not improve at any checkpoint: Iraqi CER
0.151 / 0.185 / 0.152 (base 0.139), phoneme gate 0/2 throughout («باچر» → «بأشر», «چاي» → «كاي»), ECAPA 0.64 / 0.62 / 0.61
(base 0.63), English CER 0 and 0.83–0.85 (intact). Two causes are still indistinguishable: the dialect was not learned,
or it was and the evaluation's cross-language reference (Character A's ENGLISH seed with the `[ar]` tag, the exact case
the research warns about) masks it. Next, in order: a held-out validation evaluation (each utterance with its own
speaker's Arabic reference, base vs checkpoints) and the five lines from an Arabic reference — then the recipe, not before.

## Model inventory — the source of truth (2026-10-09)

Every "downloaded" claim comes from `scripts/model-inventory.ps1` (`docker/models/inventory.py`): a file counts as
PRESENT_VERIFIED only when it physically exists in the store with the manifest's byte size and a verified sha256 equal
to the manifest's; otherwise PRESENT_UNVERIFIED (`-Hash` verifies it), PARTIAL (the resumable blob's bytes), QUEUED,
MISSING or HISTORICAL_STALE (a state record whose file is gone — pruned with `-PruneStale`). Nothing is downloaded by
it. First run: the Qwen-Image-2512 bf16 record was stale (pruned); H3 BF16 tier PARTIAL 27.59 / 79.78 GiB (34.6 %);
FireRedTTS3-Base PARTIAL; orphans ≈ 10.4 GiB of IndexTTS 2.5 (the English engine MOSS replaced) and ≈ 1 GiB of unlisted
LoRAs — deletion candidates for the producer. Output: `var/model-inventory.json`.

## Large-model policy (the producer's directive, 2026-10-09) — research done, downloads in progress

| Role | Research | Outcome |
| --- | --- | --- |
| Brain | — | Qwen3.8-27B-NVFP4 kept (no change) |
| Video | [docs/research/MINIMAX-H3-FULL-QUALITY-2026-10.md](research/MINIMAX-H3-FULL-QUALITY-2026-10.md) | The official highest-quality local path: Comfy-Org pruned **BF16** Ref2VA + FL2VA (the released BF16 weights, AdaLN folded, no quantization) + fp16 video VAE, 79.8 GiB; feasible on the 5090 through DynamicVRAM with ~66–68 GiB RAM (96 GB installed). **Downloading** (manifest group `video-minimax-h3-bf16`, revision-pinned, sha256-verified, resumable; `var/download-h3-bf16.log`). Measured link while downloading: ≈ 1 MB/s on the Wi-Fi adapter (not the 5 MB/s assumed) → ≈ 22 h for the tier at that rate; a wired link would cut it to ≈ 5 h. FireRedTTS3-Base (11.5 GB, `eval-tts-fireredtts3-base`) is queued behind it (`var/download-fireredtts3.log`). The int8 text encoder (27 GB) is a later RAM decision; int8 DiTs stay the fallback until the BF16 tier is measured with the §8.4 harness. Turbo LoRAs remain draft-only. |
| Image | [docs/research/LARGE-IMAGE-MODELS-2026-10.md](research/LARGE-IMAGE-MODELS-2026-10.md) | **Keep Qwen-Image-2512 + Qwen-Image-Edit-2511; nothing downloaded.** FLUX.2 [dev] (32B): non-commercial licence forbids production use (evaluation only; commercial licence by quote). HunyuanImage-3.0/Instruct (80B MoE): 168.5 GB official, ≥ 3×80 GB official requirement, community NF4 needs ≥ 48 GB VRAM, territory-bound licence, CC-BY-NC ComfyUI nodes. GLM-Image (16B, MIT, unified gen+edit) is the licence-clean model to re-check later. **2512 fp8 vs bf16 (the producer's eight-test order, 2026-10-09): not run — the bf16 weight was deleted after the 2026-10-06 A/B (no visible gain, +19 GiB RAM); rows 4–6/8 belong to Edit-2511; [evidence](evidence/model-eval-2026-10/images-2512-bf16-phase1/RESULTS.md). fp8 stays; a re-fetch is NOT wanted (the producer, 2026-10-09: same 20B architecture, no visible gain).** **Pass 2** ([docs/research/LARGE-IMAGE-MODELS-2026-10-PASS2.md](research/LARGE-IMAGE-MODELS-2026-10-PASS2.md), 27B–30B+ brief, broad search): no ≥ 20B open-weight model qualifies — NVIDIA Cosmos3-Super-Text2Image (64B, permissive OpenMDW) is text-to-image only with no 32 GB path or ComfyUI route; Wan2.2-T2V-A14B (27B MoE) could draw stills but cannot edit and collides with the no-Wan rule; the rest are non-commercial, territory-bound, API-only or unreleased. **Qwen-Image-2512 fp8 stays the TEMPORARY baseline.** Flagged for the producer, below the size bar: SenseNova-U1.5-8B-MoT (17.5B, Apache-2.0, one model for generation + editing + up to 10 references, native in this ComfyUI; its own report beats both incumbents on editing and multi-reference consistency) — one 35 GB evaluation download if the producer allows it. |
| Voice | [docs/research/IRAQI-ARABIC-TTS-2026-10.md](research/IRAQI-ARABIC-TTS-2026-10.md) | Habibi Specialized IRQ remains the only model with Iraqi evidence (paper: 70.7 h Iraqi speech; its UTMOS 2.63 explains the "robotic" verdict). Shortlist for a blind single-output listening against Habibi and MOSS: **FireRedTTS3-Base** (Apache-2.0, Arabic CER 1.75 / SIM 78.9 self-reported, no dialect evidence, 12.3 GB — queued behind H3) and Audar-TTS-V1-Turbo (Arabic-first, Gulf-strongest, capped community licence — **the producer decides** whether a capped licence is acceptable before it is downloaded). MOSS 8B stays the English engine. Qwen3-TTS has no Arabic; Fish S2 Pro non-commercial; Lahgtna lost to an XTTS baseline in NADI 2026. |
| Filmmaking | [docs/research/AI-FILMMAKING-PIPELINES-2026-10.md](research/AI-FILMMAKING-PIPELINES-2026-10.md) | Eleven real failures mapped to causes; a system-design extract (one identity pack with state sheets, voice as the shot's clock, one image path, one edit path, one video path with I2VA / R2V-continuation / FL2VA entries, one music path, a PLANNED-vs-ACTUAL continuity ledger, one job system) and an 11-stage music-video direction specification with a coverage matrix. H3's official grammar (`<Subject N>` / `<Picture N>` / `<Video N>` / `<Audio N>` with retention and `fully_copy`) replaces the hand-built prose. To be applied after Phase 1 is accepted. |

## Open producer items

- `WAITING_FOR_USER_HARDWARE_CHECK`: two unexpected power losses on 2026-10-08 (Windows Kernel-Power 41, no crash
  record).
- The Iraqi listening pack (LAB, upstream demo speaker) stays a LAB comparison only.
