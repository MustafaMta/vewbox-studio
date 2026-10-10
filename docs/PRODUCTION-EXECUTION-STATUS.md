# HARD CREATIVE RESET — 2026-10-10 (the producer's order; supersedes the sequence below from this point)

**Human verdict on the music video and the voices: NOT ACCEPTED.** The producer's review found two foundational
failures: the character's face and appearance drift between shots (individually attractive shots, not one performer), and
the voice identity drifts and still sounds artificial — the Iraqi voice, and recognisably synthesized English too. No
metric (ECAPA, SFace, ASR, QA, similarity, frame checks, successful jobs) overrides that verdict; they are supporting
evidence only.

Done on the order:
1. every creative job stopped (three H3 takes cancelled mid-run, PRODUCE and its children ended; no automatic restart);
2. the diagnostic record of the one result the producer found closer to acceptable — ComfyUI run
   `9cd01433-cf15-5362-be5d-5220391797d7` = job-4476c800df, shot 1 attempt 5 — written **before** deletion:
   [docs/evidence/diagnostics/JOB-9cd01433-DIAGNOSTIC.md](evidence/diagnostics/JOB-9cd01433-DIAGNOSTIC.md) (engine,
   references, prompt, opening frame, continuity, seed, camera, identity numbers, voice source and audio conditioning,
   what differed from the worse attempts; the prompt text and two small images beside it). Not canonical, not accepted;
3. the generated creative state deleted (`scripts/clean-production-reset.ts --apply`, manifest
   [docs/archive/CLEAN-RESET-2026-10-10-manifest.json](archive/CLEAN-RESET-2026-10-10-manifest.json)): 1 production,
   3 characters, 1 location, 8 shots, 13 takes, 1 song and its stems, every voice line, 262 library files (190 MB), all
   jobs, events, approvals, QA reports, World Bible revisions — the Recycle Bin holds the folders until emptied; the
   media copies under docs/evidence removed (56 files), the JSON/Markdown records and the diagnostics kept;
4. verified clean: 0 productions, shows, seasons, episodes, shorts, music videos, characters, locations, scenes, shots,
   takes, assets, jobs; library 0 files; the web app healthy on an empty studio.

Preserved: source and git history, D:\models (incl. the verified H3 BF16 tier, Chatterbox V3, Seed-VC), manifests and
download state, the Iraqi datasets and token caches, the Vewbox-IQ pipeline/trainer/evaluation, the phoneme frontend,
tests, licences, settings, the lessons learned in this file and in the research notes.

**Labels from here on (the order's §9/§41):** audio gates record `TECHNICAL_PASS` / `TECHNICAL_FAIL` for what is measured
(transcript accuracy, pronunciation targets, speaker consistency, clipping, silence, pitch anomalies, phoneme presence)
and `PERCEPTUAL_NATURALNESS = UNVERIFIED` / `PERCEPTUAL_REVIEW_NOT_AVAILABLE` for how a voice sounds — never an approval of
naturalness from metrics. The earlier "ENGLISH PASS" entries for A/B/C below are to be read as TECHNICAL_PASS with
PERCEPTUAL_NATURALNESS = UNVERIFIED, and the producer's verdict on those voices is FAIL (artificial).

**New development order (do not skip a layer):** 1 voice technology itself → 2 one persistent character identity →
3 Realistic / Anime / Cartoon validation → 4 singer identity → 5 standalone English song → 6 standalone Iraqi song →
7 one image-to-video shot → 8 two-shot identity continuity → 9 small coherent scene → 10 English music video → 11 Iraqi
music video → 12 Short → 13 Show / Season / Episode. **No H3 generation** during the identity phases; H3 BF16 stays
downloaded and unused. Voice is the first blocker: continue Chatterbox V3 → Vewbox-IQ (corpus, splits, tokens, baseline,
ONE controlled smoke after each diagnosed fix; full training only after a smoke proves useful). Then ONE character (A,
Realistic, Actor + Singer, English + Iraqi, one canonical image, one voice identity with English/Iraqi/singing profiles
in one `canonicalReferencePack`), its small voice pack measured; only then B (Anime) and C (Cartoon).

The record of 2026-10-09/10 below stays as engineering history.

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

**The separation (the four Iraqi lines from an ARABIC reference — a Kharrufa clip, seed 7, base vs smoke2-1500):** base
CER 0.128 / similarity 0.79 / phoneme gate 0 of 2 → adapted **CER 0.103 / 0.83 / 1 of 2** (the hard line 0.20 → 0.133,
«گلتلك» heard «قلت لك» — the right word; the long line passes the gate; «چاي» still «كاي»). The dialect IS being learned,
modestly; Character A's English seed masks it (cross-language reference). Decisions: (1) full Stage A — 6,000 steps,
peak lr 1e-5, batch 8, 40 s cap, replay 0.2, checkpoints every 1,000 each scored on the Arabic-reference pack AND the
held-out validation set (per-speaker Arabic references); stop rules unchanged (validation SIM not below base − 0.03,
English CER 0 kept); (2) Character A's reference pack gains an IRAQI same-performer clip (a Vewbox-IQ render from her
own seed, kept as STUDIO_RENDER after the fingerprint check) so Iraqi lines condition on an Arabic clip of the same identity.

**Stage A (`stage-a`, 6,000 steps ≈ 4 epochs, batch 8, peak lr 1e-5, warm-up 200, 40 s cap, MSA replay 0.2, LoRA r32/α64 on 30
layers + Arabic text_emb rows, 25.1 M trainable; 51 min; commit c49a3ae) — `AUTO_REVIEW: PASS (modest)`, winner step-002000.**
Loss 6.08 (step 1,000) → 5.42 (6,000), no divergence. Every checkpoint scored two ways, seed 7, one generation per line
(`D:\vewbox-data\training\iraqi\eval\stage-a-step-00N000-arabic-ref\scores.json`, `…\validation-stage-a-step-00N000\scores.json`):

| checkpoint | pack from an Arabic reference: Iraqi CER / ECAPA / چ‑گ gate | English CER / ECAPA | held-out validation (6 utterances, 3 speakers, own-speaker references): mean CER / median / ECAPA / gate |
| --- | --- | --- | --- |
| base | 0.128 / 0.79 / 0 of 2 | 0 / 0.85 | 0.572 (one collapse, CER 2.78) / 0.085 / 0.752 / 0 of 5 |
| smoke2‑1500 | 0.103 / 0.83 / 1 of 2 | — | 0.200 / 0.126 / 0.746 / 1 of 5 |
| 1000 | 0.148 / 0.83 / 0 of 2 | 0 / 0.85 | 0.463 / 0.178 / 0.770 / 1 of 5 |
| **2000** | **0.112 / 0.81 / 1 of 2** | **0 / 0.84** | **0.137 / 0.098 / 0.776 / 1 of 5** |
| 3000 | 0.155 / 0.82 / 1 of 2 | 0 / 0.79 | 0.177 / 0.114 / 0.764 / 1 of 5 |
| 4000 | 0.130 / 0.83 / 1 of 2 | 0 / 0.79 | 0.177 / 0.148 / 0.778 / 1 of 5 |
| 5000 | 0.094 / 0.81 / 1 of 2 | 0 / 0.82 | 0.224 / 0.191 / 0.770 / 1 of 5 |
| 6000 | 0.105 / 0.84 / 0 of 2 | 0 / 0.80 | 0.171 / 0.125 / 0.775 / 1 of 5 |

Step 2000 is the only checkpoint better than the base on every stop rule (pack CER and gate, validation CER and gate,
validation ECAPA above base − 0.03, English CER 0). What the numbers also say, plainly: the gain is modest and noisy (single
generations; the validation median on the non-collapsed speakers is 0.085 → 0.098), the base's collapse on the Kharrufa
speaker is what the mean CER mostly measures, «چاي» is still heard «كاي» at every checkpoint, and later checkpoints trade
validation CER for pack CER (over-fitting the small set). The ceiling is the data (≈ 1 h studio Iraqi + ASR-grade
Omnilingual), not the recipe. Served: `IQ_ADAPTER_DIR=/training/checkpoints/stage-a/step-002000` (in `.env`, read by compose).

**English renderer (one small comparison, the same line and seed through the pipeline):** MOSS CER 0 / ECAPA to the seed
0.835 / 195 Hz; Chatterbox V3 CER 0 / 0.80–0.85 / 238 Hz (the seed is 234 Hz). A tie on the machine; MOSS keeps English
(the pinned, proven production engine); Vewbox‑IQ is the Iraqi renderer. One winner per role.

**Character A, attempt 1 (Iraqi through Vewbox‑IQ step‑2000 from her new IRAQI pack clip, English through MOSS) —
`AUTO_REVIEW: FAIL` (identity).** The pack rule is in the code (`packReference`: a line's language picks its clip of the
canonical reference pack, sha256‑checked, else the primary; `reference: PRIMARY` renders a clip from the seed alone). Her
IRAQI clip (`gen-2b6c184e65`, 10 s, CER 0.076, REVIEW only for چ) measured 0.587 to her fingerprint. Through it the four
Iraqi lines: CER 0.12 / 0.233 / 0.171 / 0.093 (mean 0.154 vs attempt 0's 0.141 from the seed), چ‑گ gate 1 of 2 (the long line
passes, «باچر» heard «باتشر» — the چ sound), but ECAPA to the seed 0.55 / 0.44 / 0.57 / 0.55 (attempt 0: 0.56–0.60) and the
hard line still at coverage 0.17. Root cause: the two-hop chain (seed → rendered Arabic clip at 0.587 → lines) compounds the
identity loss; four candidate clips (one generation each, all kept) all land at 0.50–0.59, the model's cross-language
speaker ceiling. Package: `docs/evidence/character-a-voice/attempt-1/` (+ `0-reference-iraqi.wav`, `lines.json`, `scores.json`).
The dual reference was built (`iq_model.prepare_dual_conditionals`: speaker embedding + S3Gen reference from the seed, T3
prompt tokens alone from the Arabic clip) and measured on the same four lines, step‑2000, seed 7, ECAPA to the seed:
**seed‑only CER 0.126 / 0.60 / gate 1 of 2; clip‑only 0.134 / 0.50 / 1 of 2; dual 0.147 / 0.58 / 1 of 2**
(`eval\a-cond-{seed-only,clip-only,dual}\scores.json`). A rendered Arabic clip of this identity brings no dialect and costs
identity, so: a STUDIO_RENDER clip conditions lines only at ECAPA ≥ 0.70 to the fingerprint (`STUDIO_RENDER_CLIP_FLOOR`);
below it the clip stays in the pack as evidence and the line speaks from the seed. Character A's Iraqi lines condition on
her seed. The dual path stays available in the service for a clip that clears the floor (a consented recording, or a
render of a stronger model).

**THE MEASUREMENT WAS CONTAMINATED — Stage A's gate is revised to `AUTO_REVIEW: FAIL`.** Scoring the NATIVE Kharrufa
validation recordings (the real speaker, not renders: `eval\native-kharrufa\scores.json`) gave CER 0.53 and transcripts like
«تَفْوَّجَلَ وَتَفْوَّجَلِي…» — because the texts ARE that: 427 of the 450 rows of the corpus's Iraqi subset are synthetic phoneme
drills («تَڤَّڤَچَ وَتَڤِّڤَچِ … وَرۆچٌ وَرێچٍ», pseudo-words on ڤ چ گ پ with the Kurdish vowels ۆ ێ and ڵ), only 159 of which the
corpus lists in `generated_metadata.txt` (the adapter flagged those alone, and the flag did not reject). The "collapse of
the base on the Kharrufa speaker" was the base refusing nonsense; the "1 of 5" validation gates were drill lines; ≈ 0.9 h
of nonsense was in the training set, and the natural Iraqi studio speech is ≈ 8 minutes (66 sentences), not 1 h. On the
natural held-out lines alone (4 Omnilingual utterances): base CER 0.067 / ECAPA 0.79 / gate 0 of 3 → step‑2000 0.082 /
0.79 / 0 of 3, every checkpoint 0.08–0.16 — no checkpoint beats the base on natural speech. The only positive signal is the
Arabic-reference pack (four natural Baghdadi lines: 0.128 → 0.112, gate 0 → 1 of 2), within single-generation noise.
Fix: drills are rejected by the pipeline (`isPhonemeDrill`: the generated list OR any ۆ ێ ڵ), the corpus is re-prepared and
re-split, the tokens rebuilt, ONE controlled retrain of the same recipe on clean data, evaluated on a larger natural
validation set (≥ 20 lines) and the Arabic-reference pack. Expectation stated in advance: with ≈ 8 min of natural studio
Iraqi plus ASR-grade Omnilingual (413 of 1,891 transcripts in Baghdadi spelling), the dialect gain will be modest at best;
the professional fix remains the studio's own consented Baghdadi recording (≥ 3 speakers, ≥ 10 h) — a producer item.

**The clean rerun (`stage-a-clean`: train 1,776 utterances / 11.76 h without drills, validation 84 natural utterances, same
recipe, 47 min; commit 2fb074f) — `AUTO_REVIEW: FAIL`. Vewbox‑IQ's adaptation is NOT promoted.** Natural held-out validation
(8 utterances, 3 speakers, own-speaker references; `eval\validation-clean-*\scores.json`): base CER 0.065 / ECAPA 0.787 /
چ‑گ gate 0 of 7 → steps 1000–6000: CER 0.092 / 0.078 / 0.104 / 0.074 / 0.078 / 0.093, ECAPA 0.79–0.81, gate 0 of 7 at every
step. Arabic-reference pack: base 0.128 / 0.79 / 0 of 2 → 0.150 / 0.100 / 0.124 / 0.131 / 0.170 / 0.143, gate 0–1 of 2 (the long
line only), English identity through the same model 0.85 → 0.74–0.77 (the adaptation erodes the English side). No checkpoint
beats the base on natural speech; the pack differences are single-generation noise. Why the data cannot teach the dialect:
after the drills, the licensed natural Baghdadi colloquial speech with dialect spelling is ≈ 8 minutes (66 Kharrufa sentences);
the Omnilingual Iraqi hours (1,712 train utterances) are prompted answers by Iraqi speakers in a largely MSA-leaning
register and standard orthography — گ appears in 102 utterances, چ in 300, ق in 1,477 — so a broad ق→گ respelling would
mislabel formal [q] speech, and the lexicon respelling (375 utterances) covers too little. Stage B (partial fine-tune) on the
same data would only over-fit; not run. Served now: Chatterbox Multilingual V3 **base** (no adapter) as the Iraqi comparison
renderer `vewbox-iq` — the one simple, measured choice; the training stack (pipeline, tokens, trainer, evaluation) stays
ready for the consented Baghdadi recording, which is the only route to a professional Iraqi voice from here.

**Character A — the record for the gate CHARACTER_A_VOICE (engineering QA, cannot listen):** English (MOSS) `PASS` — CER 0,
coverage 1, ECAPA to the seed 0.835, 195 Hz (seed 234 Hz). Iraqi (Vewbox‑IQ base from her seed; attempt 0 is the base record
and a rerun is bit-identical by seed) `FAIL` — natural 0.08 / hard 0.233 (coverage 0.33) / emotional 0.122 / long 0.128, چ‑گ
gate 0 of 2, ECAPA 0.56–0.60 (cross-language). Verdict recorded `AUTO_APPROVED_BY_ENGINEERING_QA: ENGLISH PASS, IRAQI FAIL (data
gap)`; Habibi and FireRed stay defeated; nothing Iraqi is presented as accepted.

**Characters B and C on the same basis (one generation per line; Iraqi: Vewbox‑IQ base from the seed; English: MOSS;
packages `docs/evidence/character-{b,c}-voice/attempt-1/` with `lines.json` + `scores.json`; A's full seven-line package is
`attempt-3`):** the long Baghdadi line of each was written once by Qwen3.8 (B: «يا ربي، شلونك؟ هسه باچر ماكو وقت، بس گلتلك اني
حبيتك، كلشي تمام.» — grammatical but semantically thin, kept as written; C: «يا حبيبي، شلونك؟ گلت لك ماكو وقت، بس هيچ مشكلة،
نجلس شوية ونشرب چاي.»).

| character (seed pitch) | English: CER / ECAPA to the seed (identity, emotional, long) | Iraqi: CER natural / hard / emotional / long · چ‑گ gate · ECAPA | gate |
| --- | --- | --- | --- |
| A Layla (234 Hz) | 0 / 0.835 · 0 / 0.846 · 0 / 0.917 | 0.08 / 0.233 / 0.122 / 0.128 · 0 of 2 · 0.56–0.60 | EN PASS · IQ FAIL |
| B Tariq (199 Hz) | 0 / 0.667 · 0 / 0.661 · 0 / 0.784 | 0.04 / 0.133 / 0.098 / 0.07 · 0 of 2 · 0.47–0.57 | EN PASS (identity weaker: MOSS speaks him at 234–247 Hz) · IQ FAIL |
| C Karim (119 Hz) | 0 / 0.637 · 0 / 0.783 · 0 / 0.782 | 0.16 / 0.50 / 0.146 / 0.19 · 0 of 2 · 0.50–0.55 | EN PASS · IQ FAIL (the hard line half lost) |

English: every line heard back exactly (CER 0, coverage 1); identity continuity by ECAPA 0.64–0.92 (no calibrated absolute
threshold exists for these synthetic seeds — relative evidence only). Iraqi: the hard چ‑گ line fails for all three, the gate
passes nowhere, cross-language ECAPA sits at 0.47–0.60 — the same data-gap verdict as A. Recorded
`AUTO_APPROVED_BY_ENGINEERING_QA: A/B/C ENGLISH PASS, IRAQI FAIL (data gap)`. The sequence continues with the singer identity.

## 2026-10-10 — The singer identity (the autonomous directive: the same performer sings)

**Research** ([docs/research/SINGING-IDENTITY-2026-10.md](research/SINGING-IDENTITY-2026-10.md)): the identity stays a speech
identity and sings through singing-voice conversion of an ACE-Step lead vocal. **Seed-VC v1 `seed-uvit-whisper-base`**
(Plachtaa/seed-vc, GPL-3.0 code and weights — commercial use allowed, copyleft, so an isolated worker; zero-shot from 1–30 s;
the only open SVC with a 44.1 kHz singing checkpoint) chosen; RVC second; Vevo/YuE2/F5 derivatives excluded (non-commercial
weights); SoulX-Singer (Apache-2.0, zh/en/yue) tracked. The RMVPE pitch weights upstream fetches from lj1995/VoiceConversionWebUI
were NOT taken (that package's notice: research use only); pitch comes from torchcrepe (MIT). Residual risk recorded: the Seed-VC
checkpoint's training data is undisclosed.

**Built:** manifest group `svc-seed-vc` (Seed-VC DiT + config, whisper-small, BigVGAN v2 44 kHz, CAM++; 2.15 GB, VERIFIED through
the tick after H3), `docker/svc-seedvc` (profile `svc`, port 8028: `/convert`, `/warm`, `/unload`, `/health`; a port of
inference.py by path, under no_grad, re-entrant lock — the first run deadlocked on a plain lock and hung the idle container's
CUDA-free unload), `src/server/providers/svc.ts`, the lease unloader, job **SING_CONVERT** (the song's Demucs vocal → the named
singer's timbre from the identity's SINGING reference or its seed, F0-conditioned, no auto pitch, at most ±3 st; remixed at the
original vocal's loudness; the sung mix becomes the song's recording, the engine's recording stays; ECAPA to the fingerprint,
pitch statistics and the lyrics re-placed on the sung vocal recorded; the SINGING reference bootstrapped once at ≥ 0.60), org
tool `audio.convert_voice`, step `singer-identity` (ORG_VERSION 21). Measured: models load in 12 s, 12 s of speech converts in
4.4 s (RTF 0.36), 75 s of singing in 50 s, peak 3.4 GB VRAM.

**Character A's song (`mv-1437496511`, English, 75 s):** Qwen3.8 wrote it once (“a poignant acoustic ballad… the fading lights
of a harbour at dusk”, 4 sections, 16 lines, solo female mezzo-soprano, fingerpicked guitar, oud, strings); ACE-Step 1.5 XL-SFT
recorded it once (38 s; level, length and dead-air checks pass; 9 of 16 lines placed on the vocal). SING_CONVERT (40 steps, seed 7,
no shift): 11 of 16 lines placed on the sung vocal; F0 of the lead median 347 Hz / p95 479 Hz (span 10.4 st) against her seed's
232 Hz / 292 Hz — the song sits ≈ 7–9 semitones above her speaking range. **Identity, calibrated against impostors:** ECAPA to
Layla's fingerprint — the raw ACE vocal **0.00**, the converted vocal **0.50**, the sung mix 0.43; the converted vocal against
Tariq 0.10 and Karim −0.04. The conversion moves the vocal decisively to her identity (0.00 → 0.50 with impostors at ≈ 0.1), but
below the 0.60 bootstrap floor, so no SINGING reference was kept yet. The one allowed variation, −3 st (attempt 3): 0.506,
melody median 291 Hz / p95 395 Hz, 11 of 16 lines — no identity gain for a changed key, so **attempt 2 (no shift) is the
song's recording** (`gen-5ce8e1bec57386f52c0c`; the ACE recording `gen-e8119a3f0bec1aeaa672` and both converted vocals stay as
assets). Gate `SONG_A_ENGLISH = AUTO_REVIEW: PASS with limits` (sung by the identity relative to impostors; the engineering QA
cannot judge the singing by ear). The SINGING-reference bootstrap waits for a conversion at ≥ 0.60 — likely a song written
in her speaking range (an alto caption) rather than a shift; noted for the next song.

**The English music video (`mv-1437496511`, in progress):** DEVELOP_STORY (48 s; 4 scenes, one new place “Old Pier Quay”,
no new characters), WRITE_SCRIPT (4 scenes written), PLAN_SHOTS (8 shots of 8–10 s = 75 s; the singing assignment SOLO on all
four sections, copied onto the shots), LOCATION_PLATES (master, a view towards a bollard, night). **Plates, first attempt:
FAIL on close inspection** — the pier itself reads right (weathered concrete, rusted bollards, stone wall, dusk and night with
the same geometry), but each plate is a three-panel collage whose right two-thirds are portraits of a long-haired woman who is
nobody in the cast, despite the negative prompt "people, person"; the first shot frame drawn from it inherited the collage
(Layla correct in the left panel, the stranger on the right). Root cause: the text-to-image path always ran the Qwen-Image
Lightning 8-step LoRA at cfg 1 — where a negative prompt has no effect — and the frame path the Edit-2511 4-step LoRA, against
the large-model policy (no turbo defaults). Fix (commit after 9c4c5a2): every production picture runs the full model by default
(30 steps, cfg 4 for text-to-image; 24 steps, cfg 4 for edits); the Lightning path remains only for an explicit draft.
**Second attempt (full quality, negative effective): still a collage** — a different stranger's portrait and a guitar-case
panel beside a correct pier. The deeper cause, read off the prompt: the story engine's location record carries camera zones
("Wide shot … looking back at Layla; Medium shot … Layla's profile; Close-up zone near the bollard for intimate facial
details"), and the identity line pasted them into every picture prompt, so the model drew the portraits it was asked for.
Fix (commit 8ef2cf1): camera zones stay in the location record for the shot planner and never enter a picture prompt (left
out of the identity line; a stored line still carrying them is cut where it enters a prompt). **Third attempt: PASS by
inspection** — one unoccupied pier between stone walls, rusted bollards, a weathered bench, the open guitar case and pinned
maps, the same geometry at dusk (master) and at night, a clean bollard view; no people, no panels (40–59 s each at full
quality). Shot 1's frame, drawn again against the clean plate (the production's World Bible pin advanced from revision 2
to 3 — the old plates removed, the new ones added, nothing filmed yet so the re-pin was safe): **PASS** — one wide shot,
Layla from behind (chin-length hair, charcoal coat, indigo jeans, black boots) on the pier at dusk, bollards, the open guitar
case and the pinned map, the harbour and sunset ahead (95 s at full quality). The first take's preflight then refused on
`canonical-approved-before-first-use` (the first take locks the look): Layla's canonical image (`gen-2293bffbe1ffde3ab7c8`,
inspected directly — full body, neutral pose, chin-length dark brown hair parted left, charcoal oversized wool coat over a
rust-orange turtleneck, indigo jeans, black ankle boots, the collarbone mole; it matches her identity line) was recorded
APPROVED with the reason `AUTO_APPROVED_BY_ENGINEERING_QA`. B's and C's canonical images are approved the same way only
after their own inspection, when their productions need it.
**Shot 1 at int8 (`take-2722cd78541affa80164`, 10.1 s, 243 frames, 17.3 min, Ref2VA 20 steps): FAIL by inspection** — the
planned locked-off wide shot holds under a second, then the engine cuts into a montage (her face in close-up, the guitar in
close-up, her boots on the rocks: cuts at 0.79 / 5.00 / 7.38 s, 18.6 % repeated frames), and her mouth stays closed while the
song plays (singing-sync FAIL); the identity in the close-ups does read as Layla. Root cause, read off the take's own prompt:
the `<Subject 2>` environment definition still carried the camera zones ("Medium shot from the side … profile; Close-up zone
near the bollard for intimate facial details") — the H3 prompt path reads the stored identity line directly, which the
plate fix had not covered — and H3 re-stages from staging words (the 2026-10-08 lesson). Fix: the stored identity line
loses its camera zones at the one function every consumer reads (`locationIdentity`), so plates, frames, shot packs and
the H3 `<Subject>` definition all stop carrying them. **The BF16 run of the same prompt and seed
(`take-043a94a941b1db404950`): 20.8 min against 17.3 at int8 (1.2×, far under the research's 2–3× estimate — ComfyUI's dynamic
VRAM streams the 40 GB DiT from pinned RAM; host RAM 58.5 GiB, card 18 GB), the same montage staging (the prompt was the same
flawed one: cuts at 0.92 / 5.00 / 6.04 / 7.50 / 8.21 s), the same closed mouth; the face close-ups show finer skin and hair
detail than int8's.** Both takes re-made after the prompt fix (same seed): **int8 attempt 3 (`take-5b19cb14446da44cd2d2`,
17.3 min, prompt zone-free) — the same montage.** So the camera zones were one cause, not the cause. Read off the plan
itself: the wide locked-off action named details below its scale — "her fingers rest on the guitar neck" (the engine cut to
a guitar insert), "slick black rocks just inches from her boots" at the [0:05] beat (the cut at exactly 5.00 s to boots on
rocks), "her gaze fixed… lonely expression" plus a sung `<d>` line on a performer facing away (the cut to her face). H3
re-stages from words it cannot show in the framing it was given (the 2026-10-08 lesson again). Two fixes: (1) a singer seen
from behind is never asked to sing on camera — the prompt says the song plays, they are seen from behind the whole time and
never turn (`singingTags`); (2) a director's revision of shot 1 (recorded on the shot): whole-figure action at the wide
scale, "she does not turn", no hands, boots or gaze details. The same reading applied to the other seven shots found two
more mixed-scale actions and they were revised the same way: the INSERT of the strumming hand (scene 2, shot 2) lost "her
breath visible in the cold air" (a face detail in a hands-only frame); the CLOSE-UP of the dropped gaze (scene 3, shot 2)
lost "her right hand slowly lowers, fingers uncurving" (a hand detail in a face frame) and says "face to camera… stays in
the same framing". Attempt 4 of shot 1 at int8 follows; BF16 attempt 3 (the same flawed prompt as int8 attempt 3) was
cancelled as redundant — the attempt-2 pair already compares the tiers on one prompt and seed. **Shot 1 int8 attempt 4
(`take-ade6b9169cb3996f3c0c`, whole-figure action, "seen from behind the whole time and never turns", no sung tag, 17.3
min): still a face.** Fewer cuts (0.67 / 6.17 / 8.54 s; repeated frames 10 % → 3 %), the wide from behind at the head and the
tail, but ≈ 8 s of a sunlit face close-up in between. Four variants over two tiers say the same thing: over a sung vocal
in the guide audio H3 supplies the singer's face, whatever the prompt says about a back-turned figure. The director's
decision follows the brief ("singer visibly singing"): shot 1 is revised to Layla facing the camera at the centre of the
pier, harbour and dusk behind her, singing the opening lines (continuity screenDirection TOWARD; the frame redrawn, the
take re-made). A back-turned opening is not something this engine will hold over vocals — recorded as an engine rule for the
shot planner. **Attempt 5 (facing the camera, singing; frame redrawn and inspected: PASS — Layla full-figure at the centre of
the pier, guitar in hand, harbour and sunset behind): she now sings on camera (the mouth moves to the words in the
close-ups), but the engine still leaves the wide after 1.1 s for a face close-up and returns at 8.2 s, and that close-up
drifts from her canonical face (SFace median 0.42 < 0.5).** The rule the five attempts establish: over a sung vocal H3 goes
to the mouth at a readable scale — a WIDE singing shot is re-staged into a close-up of its own making. Director's decision:
a singing shot is framed MEDIUM or closer; shot 1 becomes a waist-up medium of Layla singing to the lens (frame redrawn,
attempt 6). A wide of the singer belongs to an instrumental passage. **Attempt 6 (`take-73d4434fa2c25c0c49ab`, medium,
singing to the lens, int8, 17.4 min): the first continuous take** — no cut, no repeated frame, Layla singing on camera for
the whole ten seconds with the mouth on the words (the machine's correlation stays weak, r 0.15, with the mouth moving
outside the lines too — review, not fail), identity held (SFace above the floor in all but one frame; a 0.20 drift from the
first frame where she turns to profile). The one deviation from the plan: the camera does not stay locked off — it pushes in
from the medium to a close-up and turns towards her profile. Across six attempts that is the engine's nature on a ten-second
singing shot; it is recorded as a planning rule (a singing shot of 8–10 s is planned as a slow push-in, not a lock-off)
rather than rerun again. The tier decision: BF16 proved on the attempt-2 pair (1.2× the int8 time, finer skin and hair
detail, identical staging), so the production tier is BF16 (`MINIMAX_H3_WEIGHTS=bf16`); shot 1 is made once more at BF16 on
this plan and seed for the direct comparison that chooses the carried take. **Attempt 7 (`take-ecf0ea2cd8ce344fd005`, BF16,
same plan and seed, 21.0 min): the same continuous take** — no cut, no repeated frame, the same push-in and turn to profile
(the seed governs the staging), identity drift 0.16 against int8's 0.20, machine singing-correlation 0.09 against 0.15 (both
weak; the mouth visibly moves on the words in both), finer skin and hair texture at BF16 on the same frames. The BF16 take
is the one carried for shot 1; the tier verdict stands (BF16 = 1.2× the time, the same staging, finer detail, equal or
better identity). Shot 1's plan now records the push-in it shows; its take is selected and rated GOOD by the engineering QA.
PRODUCE runs the remaining seven shots at BF16 (frames, then takes); every take is inspected by eye and by its QA record
before it is chosen; then ASSEMBLE, the cut gate, EXPORT.
**Frames of the remaining shots inspected:** 1.2 PASS (to camera, foggy rather than pink dusk — accepted), 2.1 FAIL (she was
drenched: the planner's continuity condition "wet hair strands clinging to neck" from the mist beat; condition removed, the
take draws its frame anew), 3.1 PASS, 4.1 PASS (night, blue light). **Pilot takes (the first of each scene, BF16):** 4.1
`take-e29b0f0044d66491593e` PASS — continuous, no cut, Layla singing to the lens at night, face matching the canonical image
(SFace), the push-in as planned; carried and rated GOOD (the machine's lip offset of 13 frames recorded). 3.1
`take-dd6d89b56b7d15b95151` FAIL — "wind whipping her hair across her face" turned her away from the camera and the engine
cut at 3.0 s to a different wide figure (identity 0.43); the action is revised (the wind lifts her hair at the sides, her
face stays to the lens, she keeps singing; facing TOWARD) and the take re-made. 2.1 `take-01bd8ee8e4443cd77699` FAIL for the
brief — continuous and on-identity (dry hair now), the push-in as planned, but her mouth stays closed through a sung chorus
(activity 0.02): "lifts her chin, locks her gaze on the horizon without blinking" read as a silent stare. Revised to say the
singing outright ("sings it straight to the camera, her mouth shaping every word") and re-made. Lesson for the planner
prompt: in a sung passage the action names the singing. The director plan
reviewed against the brief (one performer, one place dusk → night, intimate, no spectacle; the shot actions carry guitar and
gaze, the prompt layer's singing tags make her visibly sing) and the story gate recorded
`AUTO_APPROVED_BY_ENGINEERING_QA` (appr-d608f5836e, bound to the story's hash). Next: the H3 weights-tier first-attempt
comparison on shot 1 (the same shot, seed and frames at int8 and at BF16; frames inspected, timings and QA recorded), then
PRODUCE at the chosen tier, ASSEMBLE, the cut gate, EXPORT.

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
