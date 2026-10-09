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
| C | Cartoon | Actor + Singer | English, Iraqi Arabic | — | — | — | — | after B |

`PHASE_1` ends at `WAITING_FOR_USER_ACCEPTANCE` with a review package; nothing proceeds without the producer.

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

## Open producer items

- `WAITING_FOR_USER_HARDWARE_CHECK`: two unexpected power losses on 2026-10-08 (Windows Kernel-Power 41, no crash
  record).
- The Iraqi listening pack (LAB, upstream demo speaker) stays a LAB comparison only.
