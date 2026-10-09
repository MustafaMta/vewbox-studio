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

**`PHASE_1 = WAITING_FOR_USER_ACCEPTANCE`** (2026-10-09). All three characters exist with one canonical image, one voice
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

## Large-model policy (the producer's directive, 2026-10-09) — research done, downloads in progress

| Role | Research | Outcome |
| --- | --- | --- |
| Brain | — | Qwen3.8-27B-NVFP4 kept (no change) |
| Video | [docs/research/MINIMAX-H3-FULL-QUALITY-2026-10.md](research/MINIMAX-H3-FULL-QUALITY-2026-10.md) | The official highest-quality local path: Comfy-Org pruned **BF16** Ref2VA + FL2VA (the released BF16 weights, AdaLN folded, no quantization) + fp16 video VAE, 79.8 GiB; feasible on the 5090 through DynamicVRAM with ~66–68 GiB RAM (96 GB installed). **Downloading** (manifest group `video-minimax-h3-bf16`, revision-pinned, sha256-verified, resumable; `var/download-h3-bf16.log`). Measured link while downloading: ≈ 1 MB/s on the Wi-Fi adapter (not the 5 MB/s assumed) → ≈ 22 h for the tier at that rate; a wired link would cut it to ≈ 5 h. FireRedTTS3-Base (11.5 GB, `eval-tts-fireredtts3-base`) is queued behind it (`var/download-fireredtts3.log`). The int8 text encoder (27 GB) is a later RAM decision; int8 DiTs stay the fallback until the BF16 tier is measured with the §8.4 harness. Turbo LoRAs remain draft-only. |
| Image | [docs/research/LARGE-IMAGE-MODELS-2026-10.md](research/LARGE-IMAGE-MODELS-2026-10.md) | **Keep Qwen-Image-2512 + Qwen-Image-Edit-2511; nothing downloaded.** FLUX.2 [dev] (32B): non-commercial licence forbids production use (evaluation only; commercial licence by quote). HunyuanImage-3.0/Instruct (80B MoE): 168.5 GB official, ≥ 3×80 GB official requirement, community NF4 needs ≥ 48 GB VRAM, territory-bound licence, CC-BY-NC ComfyUI nodes. GLM-Image (16B, MIT, unified gen+edit) is the licence-clean model to re-check later. |
| Voice | [docs/research/IRAQI-ARABIC-TTS-2026-10.md](research/IRAQI-ARABIC-TTS-2026-10.md) | Habibi Specialized IRQ remains the only model with Iraqi evidence (paper: 70.7 h Iraqi speech; its UTMOS 2.63 explains the "robotic" verdict). Shortlist for a blind single-output listening against Habibi and MOSS: **FireRedTTS3-Base** (Apache-2.0, Arabic CER 1.75 / SIM 78.9 self-reported, no dialect evidence, 12.3 GB — queued behind H3) and Audar-TTS-V1-Turbo (Arabic-first, Gulf-strongest, capped community licence — **the producer decides** whether a capped licence is acceptable before it is downloaded). MOSS 8B stays the English engine. Qwen3-TTS has no Arabic; Fish S2 Pro non-commercial; Lahgtna lost to an XTTS baseline in NADI 2026. |
| Filmmaking | [docs/research/AI-FILMMAKING-PIPELINES-2026-10.md](research/AI-FILMMAKING-PIPELINES-2026-10.md) | Eleven real failures mapped to causes; a system-design extract (one identity pack with state sheets, voice as the shot's clock, one image path, one edit path, one video path with I2VA / R2V-continuation / FL2VA entries, one music path, a PLANNED-vs-ACTUAL continuity ledger, one job system) and an 11-stage music-video direction specification with a coverage matrix. H3's official grammar (`<Subject N>` / `<Picture N>` / `<Video N>` / `<Audio N>` with retention and `fully_copy`) replaces the hand-built prose. To be applied after Phase 1 is accepted. |

## Open producer items

- `WAITING_FOR_USER_HARDWARE_CHECK`: two unexpected power losses on 2026-10-08 (Windows Kernel-Power 41, no crash
  record).
- The Iraqi listening pack (LAB, upstream demo speaker) stays a LAB comparison only.
