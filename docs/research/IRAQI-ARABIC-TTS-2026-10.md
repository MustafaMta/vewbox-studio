# Iraqi (Baghdadi) Arabic TTS with one cross-language voice identity — fresh research pass, October 2026

Research pass ordered by the producer on 2026-10-09: do NOT assume Habibi remains the answer. Read 2026-10-09 from
original sources only (HF model cards and file listings, GitHub READMEs/commits/licence files, arXiv papers, ACL
Anthology). Nothing was downloaded. Marketing pages were not used as evidence; where a number is a vendor's own
self-reported benchmark it is marked *self-reported*.

Ranking criteria, in the producer's order: (1) human naturalness, (2) voice identity, (3) Iraqi pronunciation,
(4) Baghdadi prosody, (5) emotion/acting, (6) cross-language same-person identity, (7) long-form stability,
(8) licence, (9) parameter count (last). Commercial-safe runtime remains the producer's rule (2026-10-06).

## 0. Headline findings

1. **There is still exactly one open model family with Iraqi-specific training data and an Iraqi-specific
   evaluation: Habibi-TTS (SJTU X-LANCE, F5-TTS lineage).** 70.7 h of Iraqi training speech; a 2,198-utterance
   Iraqi benchmark; per-dialect human MOS. Nothing else found in 2025–2026 has an Iraqi row anywhere.
2. **Habibi's own numbers explain the producer's "robotic" verdict (2026-10-08).** On the IRQ benchmark the
   specialized IRQ model scores UTMOS 2.63 (unified 2.44–2.48) — low naturalness by machine proxy — while its
   human NMOS is 3.83 (specialized) / 4.18 (unified) vs 3.94 for ElevenLabs Eleven v3 alpha. The *unified* model
   is the better Iraqi performer in the paper, and it is **CC-BY-NC-SA-4.0** (SADA/Mixat data) — not usable.
3. **One other model explicitly claims Iraqi: Lahgtna-OmniVoice-v2 ("- [x] Iraq" on its card).** It inherits
   OmniVoice's **CC-BY-NC** weights (Emilia), has no licence field of its own, and in NADI 2026 (the only
   independent dialectal-TTS evaluation found) it **lost to the XTTS-v2 baseline on all five metrics**
   (UTMOS 2.72, WER 32.5 %). Iraq was not even in that evaluation's dialect set. Not a candidate.
4. **No 2025–2026 Arabic-first or multilingual release has Iraqi evidence**: Audar-TTS (Gulf/Emirati-first;
   Pro tier "coming soon", no weights), SILMA TTS (MSA + English; v2 Najdi is API-only), FireRedTTS3 (Arabic as
   one of 24 languages, no dialect), MOSS-TTS v1.5 / Local-Transformer-v1.5 / Realtime (Arabic listed, zero
   Arabic benchmark anywhere), Qwen3-TTS (no Arabic at all; the Arabic Qwen TTS — Qwen-Audio-3.0-TTS, Jul 2026 —
   is API-only), Fish S2 Pro (Arabic Tier 2, non-commercial), Voxtral TTS (Arabic, CC-BY-NC), Chatterbox
   Multilingual (Arabic, MIT, 0.5 B, no dialect).
5. **Cross-language identity is an open research problem, with Arabic the hardest target.** IWSLT 2026 ran a
   Cross-Lingual Voice Cloning track (English reference → Arabic/Chinese/French). Ahtasam et al. evaluated four
   SOTA systems and found Arabic "particularly challenging" under zero-shot transfer. KIT's system on Fish S2 Pro
   reached only **SSIM 64 %** into Arabic (CER 6.4 %), and showed that language tags fix pronunciation bias but
   do not move identity. No open voice-conversion model with a cross-lingual identity claim was found
   (Seed-VC is archived, GPL-3.0, no cross-lingual claim).
6. **Strongest *Arabic-intelligibility* evidence among commercial-safe candidates: FireRedTTS3-Base** (Aug 2026,
   Qwen3-1.7B backbone, Apache-2.0): Arabic CER 1.75 % / SIM 78.9 % on MiniMax-MLS-Test (*self-reported*; same
   table puts Fish S2 at 3.50 / 75.0, VoxCPM2 at 13.05 / 79.1, dots.tts at 37.91 / 77.5, ElevenLabs at 1.67 /
   70.6). It has **no Iraqi or dialect evidence** and its card carries a "voice cloning solely for academic
   research" disclaimer that sits oddly beside Apache-2.0 (legal flag, §4.4).

**Shortlist (§6): at most two downloads for a controlled single-output listening comparison against Habibi IRQ
and MOSS-TTS v1.5: (A) FireRedTTS3-Base (≈ 12.3 GB) and (B) Audar-TTS-V1-Turbo (≈ 3.3 GB est.).** Both are
"Arabic, not Iraqi"; the comparison tests whether a strong Arabic model prompted with a Baghdadi reference and
Iraqi-spelled text beats a weak Iraqi-trained model on naturalness and identity. Expect dialect drift toward
MSA/Gulf; the native ear decides.

## 1. Comparison table

Legend: IRQ evidence = Iraqi-specific training data, benchmark row or demo from the original source. "—" = not
stated by the source. Sizes are parameter counts; download sizes in §6.

| Model (checkpoint) | Params | Released | Licence → commercial verdict | Zero-shot clone (ref) | Arabic | **Iraqi evidence** | Code-switch | Emotion/acting | Maintenance (last seen) | Blackwell / VRAM |
|---|---|---|---|---|---|---|---|---|---|---|
| **Habibi-TTS Specialized IRQ** `SWivid/Habibi-TTS/Specialized/IRQ/model_100000.safetensors` | ≈ 0.34 B (F5-TTS v1 base; 1.35 GB fp32) | Jan 2026 (HF files 9 months old; paper v1 20 Jan, v2 31 Mar 2026) | **Apache-2.0** (IRQ, ALG, EGY, MAR, MSA) → **OK**. Unified/SAU/UAE: CC-BY-NC-SA-4.0 → NO | yes; ref audio + exact transcript; demo says < 12 s | yes, dialectal | **YES: 58.9 h in-house + 11.7 h Omnilingual = 70.7 h; IRQ benchmark 2,198 utt.; NMOS 3.83 / SMOS 3.82 / DMOS 4.06; WER-O 17.66, SIM 0.763, UTMOS 2.63** | not mentioned | none (from reference only) | GitHub last commit 2026-03-30 (v0.1.1 7 Mar); 12 commits; releases empty | runs today on the 5090 in the current stack; small |
| Habibi Unified `Unified/model_200000.safetensors` | ≈ 0.34 B | Jan 2026 | **CC-BY-NC-SA-4.0** → NO | same | yes | YES: IRQ NMOS 4.18 (> Eleven v3 3.94), SIM 0.764, UTMOS 2.48 | — | none | same | same |
| **MOSS-TTS v1.5** (Delay-8B) `OpenMOSS-Team/MOSS-TTS-v1.5` (current EN engine) | 8 B (Qwen3-8B) | 2026-05-26 (HF) | Apache-2.0 → OK | yes; "short reference" | listed (`ar`, 31 langs); **no Arabic benchmark anywhere** (card, 1.0 card, tech report abstract) | **NO** | yes (card) | none (token-level duration, `[pause]`); style only via MOSS-VoiceGenerator (ZH/EN only) | active: Realtime 2026-07-27, Local-Transformer-v1.5 2026-06-18 | torch 2.9.1+cu128; measured here 24 GB peak bf16 |
| MOSS-TTS-Local-Transformer-v1.5 | 5 B (card) | 2026-06-18 | Apache-2.0 → OK | yes | listed (31 langs) | **NO** | yes | none | active | — |
| MOSS-TTS-Realtime | 1.7–2 B | 2026-07-27 | Apache-2.0 → OK | yes, multi-turn | listed (20 langs) | **NO** | — | none | active | — |
| **Fish Audio S2 Pro** `fishaudio/s2-pro` (eval-only in stack) | 4 B slow AR + 0.4 B fast AR (card: 5 B) | Mar 2026 (report 9 Mar) | **Fish Audio Research License: "No commercial rights are granted"** → NO | yes; 10–30 s | Tier 2 | **NO** (no dialects named) | — | 15,000+ free-form `[tags]` | active | H200 RTF 0.195; SGLang/vLLM-Omni path |
| **FireRedTTS3-Base** `FireRedTeam/FireRedTTS3/fireredtts3_base` | backbone Qwen3-1.7B (total not stated; 8.48 GB bf16 ⇒ ≈ 4 B incl. heads) + RedAE 3.78 GB | 2026-08-05 (Instruct + code 08-13; report 18 Aug) | Apache-2.0 → OK **but** card: cloning "intended solely for academic research purposes" (flag) | yes; "prompt in the desired language or dialect"; output inherits reference style | yes (24 langs); **Arabic CER 1.75 / SIM 78.9** (MLS, self-reported) | **NO** (21 *Chinese* dialects, no Arabic dialects) | — | Instruct: voice design by description; fixed templates for speed/pitch/volume; no free-form emotion | 15 commits; last change ≈ Aug 2026 | torch 2.8.0 + flash-attn 2.8.3 pinned (sm_120 wheel to verify; SDPA fallback unknown) |
| FireRedTTS-2 | — | 2025 (last push 2025-10-26) | Apache-2.0 + same research-only cloning disclaimer | yes | **no** (7 langs: EN, ZH, JA, KO, FR, DE, RU) | **NO** | — | dialogue model | stale | — |
| **Audar-TTS-V1-Turbo** `audarai/Audar-TTS-V1-Turbo` | 1.64 B (Qwen2.5-1.5B-class) + audar-codec (NeuCodec, 24 kHz) | 2026-07-07 (HF) | **AudarAI Community License v1.0**: commercial only under *all* caps (< 50 staff, < $2 M revenue, < 100 k MAU, < $5 M funding, < $250 k attributable revenue) → **OK for a small studio, capped** | yes; 5–15 s; no per-speaker tuning | **Arabic-first**: MSA + dialects "including Gulf/Emirati" + English | **NO** (Iraqi not named) | **yes** (AR↔EN) | 8 inline tags (laughs, whispers, excited, curious, sighs, exhales, mischievously, sarcastic) | 2026-07-07; ASR models 2026-08-20 | HF transformers; GGUF Q8 1.75 GB; CPU-capable |
| Audar-TTS-V1-Flash | 0.55 B | 2026-07-07 | **AudarAI Open License v1.0**: "No revenue cap, user cap, field-of-use restriction" → OK | yes; 5–15 s | Arabic-first, "strongest on Gulf-dialect speech" | **NO** | yes | same 8 tags | same | GGUF Q8 0.6 GB |
| Audar-TTS-V1-Pro | "4 B" is **unverified** — not on HF | "coming soon" | — | — | — | **NO** (no weights exist) | — | — | — | — |
| **Qwen3-TTS** (0.6 B / 1.7 B Base, CustomVoice, VoiceDesign) | 0.6 / 1.7 B | 2026-01-22 (only news entry) | Apache-2.0 → OK | yes; 3 s | **NO** (10 langs; Arabic absent; a community Emirati fine-tune had to *add* an Arabic language embedding) | **NO** | — | VoiceDesign instruct | no release after Jan 2026 found | — |
| Qwen-Audio-3.0-TTS (Flash/Plus) | — | 2026-07-20 | **API-only** (Alibaba Model Studio) → not local | yes | yes (16 langs) | **NO** (no Arabic dialects; Chinese dialects only) | — | style prompts + inline tags | active | n/a |
| **Lahgtna-OmniVoice-v2** `oddadmix/lahgtna-omnivoice-v2` | 0.6 B (OmniVoice / Qwen3-0.6B) | 2026 | **no licence field; base weights CC-BY-NC** → NO | yes; 3–10 s | yes, 13 dialects | **claimed: "- [x] Iraq"; no data hours, no evaluation; NADI 2026 (10 dialects, no Iraq): UTMOS 2.72, WER 32.5 %, lost to XTTS-v2 on all metrics** | — | none | 43 commits (fork of OmniVoice) | torch 2.8.0+cu128; ≈ 3 GB |
| OmniVoice `k2-fsa/OmniVoice` | 0.6 B | Apr 2026 (paper 2604.00688) | code Apache-2.0; **weights CC-BY-NC** (Emilia) → NO | yes; "short" | 600+ langs; Arabic not named | **NO** | — | voice design ZH/EN only | active | RTF 0.025 claimed |
| **SILMA TTS v1** `silma-ai/silma-tts` | 0.15 B (F5-TTS from scratch) | Mar 2026 (blog 15 Mar; card updated 23 Aug) | weights Apache-2.0, code MIT → OK | yes; < 8 s | **MSA (Fusha) + English only** | **NO** | sample mixes AR/EN | none | 2026-08-23 | RTF 0.12 on 4090 |
| SILMA TTS v2 (english / msa / ksa-Najdi) | — | 2026 | **hosted API only** (`api.silma.ai/tts/v2`) | — | MSA, Saudi Najdi | **NO** | — | — | — | n/a |
| Voxtral TTS `mistralai/voxtral-4b-tts-2603` | 4 B | 2026-03-26 | **CC-BY-NC-4.0** (inherits from reference datasets) → NO | yes; 3 s | yes (9 langs) | **NO** | — | yes | gated card (HTTP 401) | — |
| Chatterbox Multilingual V3 `ResembleAI/chatterbox` | 0.5 B | 2025–26 | MIT (PerTh watermark in every output) → OK | yes | yes (23 langs) | **NO** | — | `exaggeration` | active | small |
| VoxCPM2 `openbmb/VoxCPM2` (current voice-design engine) | 2 B | 2026 | Apache-2.0 → OK | yes + design from text | yes (30 langs); **Arabic CER 13.05 % / SIM 79.1 on MLS (FireRed's measurement)** | **NO** | — | style prefix | active | ≈ 8 GB |
| dots.tts-soar | 2 B | Jun 2026 | Apache-2.0 | yes | yes (24 langs); **Arabic CER 37.9 % on MLS (FireRed's measurement)** | **NO** | — | none | active | — |
| X-Voice (paper 2605.05611) | 0.4 B (F5-TTS +LID injection) | May 2026 | "open-source all resources" — **no HF/GitHub link found** | yes | 30 langs, Arabic not confirmed | **NO** | — | — | paper only | — |
| Seed-VC (voice conversion) | 25–200 M | V2 2025 | **GPL-3.0**; repo **archived 2025-11-21** | 1–30 s | not stated | **NO** (no cross-lingual claim) | — | accent/emotion conversion flag | dead | 3060-laptop real-time |
| ArTSTv3 (MBZUAI) | — | 2024–25 | CC-BY-NC-4.0 → NO | — | MSA-centred (SpeechT5) | **NO** | — | — | — | — |
| Egyptian/Levantine fine-tunes: VoiceTut-TTS (OmniVoice, 380 h EGY, "Apache-2.0" over CC-BY-NC base), Leva-TTS (XTTS-v2 CPML), NAMAA-Egyptian (Chatterbox), NAMAA-Saudi-V2 (Habibi SAU, CC-BY-NC-SA), Shami-TTS | 0.5–0.6 B | 2026 | mostly NO or licence-inconsistent | yes | one dialect each | **NO** (none Iraqi) | VoiceTut yes | none | — | — |

## 2. Per-model findings with sources

### 2.1 Habibi-TTS (SJTU X-LANCE; F5-TTS lineage) — the incumbent Iraqi engine
- Card: https://huggingface.co/SWivid/Habibi-TTS — "The unified, SAU, and UAE models are licensed under
  CC-BY-NC-SA-4.0, restricted by SADA and Mixat." / "All the rest (ALG, EGY, IRQ, MAR, MSA) are released under
  Apache 2.0 license." Base model: SWivid/F5-TTS. Training datasets listed: google/fleurs,
  facebook/omnilingual-asr-corpus, adiren7/darija_speech_to_text. HF metadata tag says cc-by-nc-sa-4.0 (the
  repo-level tag; the per-folder text governs).
- Files: https://huggingface.co/SWivid/Habibi-TTS/tree/main — 10.8 GB total; `Specialized/` 9.44 GB (7 dialect
  folders); `Specialized/IRQ/model_100000.safetensors` **1.35 GB** + `vocab.txt` 11.8 kB; `Unified/model_200000.safetensors`
  1.35 GB. Both uploaded in commit `880b7c9`, 9 months ago (≈ Jan 2026). No config, no vocoder in the folder
  (F5-TTS uses Vocos 24 kHz separately).
- Code: https://github.com/SWivid/Habibi-TTS — MIT. Commits: 2026-01-22 init → 2026-01-27 "v0.1.0 official
  release" → 2026-03-07 v0.1.1 deps → **2026-03-30 "update doc and readme" (latest)**. 12 commits; Releases empty.
  `--dialect` accepts MSA, SAU, UAE, ALG, IRQ, EGY, MAR, OMN, TUN, LEV, SDN, LBY; dialect is inferred from the
  reference if not set; `--ref_audio` + `--ref_text` required. Demo Space advises reference < 12 s with an exactly
  matching transcript.
- Paper: https://arxiv.org/abs/2601.13802 (v1 2026-01-20, v2 2026-03-31; full text
  https://arxiv.org/html/2601.13802v2). F5-TTS v1 base default setup, 200 K updates, ≈ 2 days on 8×H100; ≈ 8,000
  H100-hours of ablations. Data: 1,635 h (D1) → 1,857 h (D2); **IRQ 58.9 h in-house (48,534 utterances) + 11.7 h
  Omnilingual ASR Corpus = 70.7 h**; MSA 921.5, SAU 249.3, UAE 112.4, MAR 81.7, ALG 72.9, EGY 62.2. Appendix A.2:
  ALG and IRQ are "cleaner, in-house recorded data" (speakers, city and recording origin **not stated** — so
  "Baghdadi" is unverifiable). Benchmark: 11,357 utterances, IRQ subset 2,198 (in-house), prompts 3–12 s.
- **Iraqi results (paper):** human — DMOS Eleven v3 3.97 / specialized 4.06 / unified 4.21; SMOS 3.38 / 3.82 /
  3.82; **NMOS 3.94 / 3.83 / 4.18**. Objective (Table 7) — specialized: WER-O 17.66, WER-S 11.45, SIM 0.763,
  **UTMOS 2.63**; Uni.D2-I: WER-O 17.12, SIM 0.764, UTMOS 2.48. (Table 5 gives a different IRQ set: specialized
  WER-O 12.26, unified 12.85 / SIM 0.825, Eleven v3 14.95 / SIM 0.572 — inconsistency not explained.) No
  emotion, code-switching, NFE/CFG or RTF reported.
- Community: HF discussions contain one thread (licence of in-house ALG data / commercial licensing of Unified);
  no Iraqi quality reports found anywhere. NAMAA-Saudi-TTS-V2 (https://huggingface.co/NAMAA-Space/NAMAA-Saudi-TTS-V2)
  fine-tunes the SAU model on 18.4 h Najdi and reports only "subjective quality improvement" — i.e. the dialect
  models are known to improve with more in-dialect data.
- **Verdict:** the only Iraqi-evidenced model, commercial-safe in its IRQ specialized form, but its own UTMOS
  (2.63) is the lowest naturalness proxy of any model in this table that reports one, consistent with the
  producer's ear. The better-Iraqi unified checkpoint is non-commercial. Maintenance is light (one doc commit
  since March).

### 2.2 MOSS-TTS family (OpenMOSS, Fudan) — the current English engine
- v1.5 card: https://huggingface.co/OpenMOSS-Team/MOSS-TTS-v1.5 — 8 B, Apache-2.0, 31 languages incl. `ar`;
  "same generation API as the 1.0 MossTTSDelay-8B"; language tag recommended for non-ZH/EN; `tokens=` duration,
  `[pause X.Ys]`, pinyin/IPA, code-switching; cloning more stable than 1.0; **no emotion control**; torch
  2.9.1+cu128, Transformers 5.0.0. No reference length stated. No benchmarks on card (refers to 1.0 README).
- 1.0 card: https://huggingface.co/OpenMOSS-Team/MOSS-TTS — only Seed-TTS-eval EN/ZH tables (Delay-8B EN WER
  1.84 / SIM 70.86). **No Arabic row.** Tech report https://arxiv.org/abs/2603.18090 (18 Mar 2026): abstract names
  no languages, no Arabic; HTML body returned 404.
- Org listing https://huggingface.co/OpenMOSS-Team/models?search=TTS (newest first): MOSS-TTS-Realtime 2 B
  (2026-07-27), MOSS-TTS-Local-Transformer-v1.5 5 B (2026-06-18), MOSS-TTS-v1.5 8 B (2026-05-26), Nano-100M
  (Apr), GGUF (Mar 26), Local-Transformer 3 B and MOSS-TTS 8 B (Mar 20), TTSD v1.0 (Feb 14). **No v2.** Realtime
  (https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Realtime): streaming multi-turn, 20 langs incl. Arabic, 32 K
  context. MOSS-VoiceGenerator (https://huggingface.co/OpenMOSS-Team/MOSS-VoiceGenerator): voice design from
  text, **Chinese and English only**.
- **Verdict:** nothing newer changes the Iraqi picture; Arabic is a listed language with zero published Arabic
  evidence from the authors or anyone else. **NO Iraqi evidence.** Stays the English engine on its measured merits
  (VOICE-BENCH §3.2).

### 2.3 Fish Audio S2 Pro — eval-only reference
- Card https://huggingface.co/fishaudio/s2-pro: 4 B slow AR + 400 M fast AR; 80+ languages, Arabic **Tier 2**;
  15,000+ free-form `[tags]`; H200 RTF 0.195. README https://github.com/fishaudio/fish-speech: cloning 10–30 s
  reference; "will take action against any violation of the license".
- Licence https://github.com/fishaudio/fish-speech/blob/main/LICENSE — Fish Audio Research License Agreement:
  "No commercial rights are granted under this Agreement"; Commercial Purpose includes anything that "generate[s]
  revenue, whether directly or indirectly"; no threshold. **→ non-commercial, confirmed from the licence file.**
- Independent Arabic evidence: FireRedTTS3 report table — Arabic CER 3.50 / SIM 75.0 on MLS. KIT's IWSLT 2026
  system (https://www.alphaxiv.org/abs/2606.07240.md) built on S2 Pro: English reference → Arabic **CER 6.38,
  SSIM 64.15 %, UTMOS 2.93**; native-script language tags raised Arabic LID confidence 89.9 → 93.4 % and reduced
  English pronunciation bias; identity unchanged by tags.
- **NO Iraqi evidence.** Remains the licence-blocked reference it already is.

### 2.4 FireRedTTS3 (Xiaohongshu FireRed team) — new, Aug 2026
- Card https://huggingface.co/FireRedTeam/FireRedTTS3 — Base 2026-08-05; Instruct + code 2026-08-13; Apache-2.0
  tag; 24 languages **including Arabic**; 21 Chinese dialects (no Arabic dialects); "use a prompt in the desired
  language or dialect"; output inherits the reference's speaking style. Instruct: voice design from description
  (gender, age, timbre, emotion, pace, accent) with a textual planning step; acoustic editing by fixed templates
  only (speed 0.5–2.0, pitch ±1–6, volume 0.3–2.0); "free-form acoustic phrasing is not supported".
  **Usage Disclaimer: zero-shot voice cloning "intended solely for academic research purposes."**
- Files https://huggingface.co/FireRedTeam/FireRedTTS3/tree/main — 20.8 GB total: `fireredtts3_base/model.safetensors`
  **8.48 GB**, `fireredtts3_instruct/model.safetensors` 8.48 GB, `redae/model.safetensors` **3.78 GB**,
  `campp/campplus_voxceleb.bin` 29.4 MB, `text_tokenizer/` (small, size not listed).
- Code https://github.com/FireRedTeam/FireRedTTS3 — `LICENSE` Apache-2.0; 15 commits; requirements pin **torch
  2.8.0, torchaudio 2.8.0, flash-attn 2.8.3, transformers 5.6.2**; optional LLM text-normaliser needs an
  OpenAI-compatible endpoint (must be pointed at a local model or disabled — producer's secrets rule).
- Report https://arxiv.org/html/2608.17492v2 — backbone **Qwen3-1.7B** (Base from 1.7B-Base, Instruct from 1.7B);
  frozen FireRedAudio encoder as semantic teacher (RedAE, 500 k h); Base stage 1 2.6 M h ZH+EN, stage 2 560 k h
  over 24 languages + 21 dialects (no per-language hours → **Arabic hours unknown**). MiniMax-MLS-Test Arabic
  (CER / SIM): MiniMax 1.67 / 73.6, ElevenLabs 1.67 / 70.6, **FireRedTTS3 1.75 / 78.9**, FishAudio S2 3.50 /
  75.0, VoxCPM2 13.05 / 79.1, dots.tts 37.91 / 77.5. 24-language average CER/WER 3.75 vs MiniMax 3.77.
  Seed-TTS-Eval avg 3.04 WER / 78.8 SIM (CosyVoice3 3.06, IndexTTS2 3.46). No RTF, no VRAM, no emotion benchmark.
- **NO Iraqi evidence.** Best Arabic MSA-type intelligibility+similarity of any commercial-licensed open model
  found, *self-reported*. Blackwell risk: flash-attn 2.8.3 pinned — an sm_120 wheel must exist or SDPA fallback
  must be confirmed before any run.

### 2.5 Audar-TTS V1 (AudarAI) — Arabic-first, Jul 2026
- Org https://huggingface.co/audarai — five models: TTS-V1-Turbo 2 B and TTS-V1-Flash 0.6 B (both 2026-07-07),
  ASR Turbo/Flash (2026-08-20), Diarization. **No Pro model; the "V1 Pro 4B" the producer heard of does not exist
  on HF** — the Turbo card says Pro is "coming soon", larger, "maximum expressiveness and fidelity", open weights
  not promised.
- Turbo card https://huggingface.co/audarai/Audar-TTS-V1-Turbo — 1,643,998,208 params; Qwen2.5-1.5B-class
  decoder + audar-codec (NeuCodec fine-tune, 24 kHz); no phonemizer/G2P; Arabic (MSA + dialects "including
  Gulf/Emirati") + English; **AR↔EN code-switching**; zero-shot from 5–15 s; six synthetic presets; 8 inline tags;
  32 K context; training data not disclosed; internal benchmark with **no scores published**, human MOS "planned".
  GGUF Q4 1.07 / Q5 1.21 / Q8 1.75 GB.
- Turbo licence https://huggingface.co/audarai/Audar-TTS-V1-Turbo/blob/main/LICENSE — AudarAI Community License
  v1.0: "Limited Commercial Use" only for entities under **all** of: < 50 employees/contractors, < USD 2 M annual
  gross revenue, < 100 k MAU, < USD 5 M lifetime outside funding, < USD 250 k cumulative revenue attributable to
  products using it; 30 days to stop or license on crossing; no hosted general-purpose model service; no training
  a competing foundation model; outputs unowned by AudarAI.
- Flash card https://huggingface.co/audarai/Audar-TTS-V1-Flash and LICENSE — 0.55 B; **AudarAI Open License
  v1.0: "No revenue cap, user cap, field-of-use restriction, royalty, or reporting obligation"**; indemnity
  clause, Singapore law. "Strongest on Gulf-dialect speech."
- **NO Iraqi evidence** (Iraqi never named; Gulf/Emirati is the stated strength). Still the only Arabic-first
  open model with inline acting tags and code-switching — directly relevant to criteria 5 and 6.

### 2.6 Qwen TTS ecosystem
- https://github.com/QwenLM/Qwen3-TTS — single news entry **2026.1.22**: 0.6 B / 1.7 B Base, CustomVoice,
  VoiceDesign on the 12 Hz tokenizer; Apache-2.0; **10 languages (ZH, EN, JA, KO, DE, FR, RU, PT, ES, IT) — no
  Arabic**; 3 s cloning. A community Emirati fine-tune (https://huggingface.co/vadimbelsky/qwen3.5-TTS-Emirati)
  had to add an Arabic language embedding; ScienceSoft's write-up of the same approach
  (https://www.scnsoft.com/artificial-intelligence/arabic-dialect-tts) reports Emirati/Saudi only, 70 h synthetic
  data, drift into "foreign-sounding" Arabic on long passages; "research artifacts, not production".
- Qwen-Audio-3.0-TTS (https://tongyilab.substack.com/p/qwen-audio-30-tts-more-multilingual, 2026-07-20):
  Arabic among 16 languages, cloning, style prompts and `[tags]` — **API-only** on Alibaba Model Studio; no
  weights, no Arabic dialects.
- **NO Iraqi evidence; no local Arabic at all.**

### 2.7 Lahgtna (لهجتنا) — OmniVoice fine-tune
- Card https://huggingface.co/oddadmix/lahgtna-omnivoice-v2 and raw README: base `k2-fsa/OmniVoice`; roadmap
  checked: Egypt, Saudi, Morocco, **Iraq**, Sudan, Palestine, Lebanon, Syria, Libya, Tunisia, Bahrain, Yemen,
  Algeria; unchecked: UAE, Kuwait, Qatar, Oman, Jordan, Mauritania. **No licence field; no data hours; no
  evaluation.** Repo https://github.com/Oddadmix/Lahgtna-OmniVoice (fork, 43 commits): 3–10 s reference,
  cross-lingual cloning "carries an accent from the reference language", torch 2.8.0+cu128.
- Base licence: https://huggingface.co/k2-fsa/OmniVoice — code Apache-2.0, **pre-trained model CC-BY-NC**
  "because of constraints from its training data" (Emilia). Lahgtna inherits it.
- Independent evaluation — NADI 2026 shared task (https://arxiv.org/html/2609.27086v1), first-ever TTS subtask,
  10 dialects (EG, SD, SA, AE, JO, PS, TN, DZ, MA, YE — **no Iraq**), Bulbul prompts, baseline XTTS-v2 without
  dialect conditioning. Only submission: KAND CA with lahgtna-omnivoice-v2 (612 M). Result: UTMOS 2.72, NISQA-MOS
  3.57, WER 32.48 %, CER 11.40 %; **"The XTTS-v2 baseline beat the submission on all five averaged metrics."**
  Organisers add that the automatic metrics are MSA-biased and dialect-insensitive, so human evaluation is needed.
- **Iraqi claim without evidence; non-commercial; machine quality below an MSA-leaning XTTS-v2.** Not a candidate.

### 2.8 SILMA
- https://huggingface.co/silma-ai — seven models; the only TTS is `silma-tts` (updated 2026-08-23). Card
  https://huggingface.co/silma-ai/silma-tts: v1, **150 M**, F5-TTS architecture pre-trained from scratch, **Arabic
  Fusha/MSA + English**, < 8 s reference, RTF 0.12 on a 4090, weights Apache-2.0 / code MIT, CATT diacritiser, no
  evaluation, no emotion. v2 (english / msa / **ksa Najdi**) exists only as a hosted API
  (https://docs.pipecat.ai/api-reference/server/services/tts/silma.md → `api.silma.ai/tts/v2`). SILMA-9B etc. are LLMs.
- **NO Iraqi evidence; MSA-only locally.**

### 2.9 Other 2025–2026 models checked
- **Voxtral TTS** (Mistral, 2026-03-26, 4 B): Arabic among 9 languages, 3 s cloning; weights **CC-BY-NC-4.0**
  (inherited from the reference datasets, per the card as quoted by https://the-decoder.com and
  https://siliconangle.com; the HF card itself is gated, HTTP 401). Rejected on licence; no dialects.
- **Chatterbox Multilingual V3** (https://huggingface.co/ResembleAI/chatterbox): 0.5 B, MIT, 23 languages incl.
  Arabic, `exaggeration`, mandatory PerTh watermark. No dialect, no Iraqi.
- **VoxCPM2** (https://huggingface.co/openbmb/VoxCPM2): 2 B Apache-2.0, 30 langs incl. Arabic, design-from-text,
  style guidance, ≈ 8 GB; third-party Arabic CER 13.05 % (FireRed table) → poor Arabic intelligibility; keep it for
  English voice design only. **dots.tts-soar**: Arabic CER 37.9 % in the same table.
- **OmniVoice** (k2-fsa, Apr 2026): 0.6 B, 600+ languages, weights CC-BY-NC; cross-lingual output "will carry an
  accent from the reference audio's language" (README) — a clear statement of the cross-language identity problem.
- **X-Voice** (https://arxiv.org/abs/2605.05611, May 2026): 0.4 B F5-TTS extension with language-ID injection,
  claims cross-lingual cloning "comparable to billion-scale models such as Qwen3-TTS"; "open-source all related
  resources" but **no repository link found**; Arabic unconfirmed.
- **Seed-VC** (https://github.com/Plachtaa/seed-vc): zero-shot VC, 25–200 M, GPL-3.0, **archived 2025-11-21**; no
  cross-lingual identity claim; "accent conversion" only. No other open speech-to-speech model with a
  cross-lingual-identity claim was found.
- **ArTSTv3** (MBZUAI): SpeechT5, CC-BY-NC-4.0, MSA-centred; NADI notes ArTST/SILMA "fail to generalize to
  informal, colloquial speech".
- **Dialect fine-tunes, none Iraqi:** VoiceTut-TTS (Egyptian, 380 h, OmniVoice base; card says Apache-2.0 but
  the base weights are CC-BY-NC — inconsistent), Leva-TTS (Levantine, XTTS-v2 CPML), NAMAA-Egyptian (Chatterbox),
  NAMAA-Saudi-V2 (Habibi SAU, CC-BY-NC-SA), Shami-TTS (Levantine), EGTTS, Arabic-F5-TTS-v2 (MSA).
- **HF search "iraqi"** (https://huggingface.co/models?search=iraqi): 43 models — Whisper ASR fine-tunes, LLMs,
  image models; **zero TTS or voice models.**

### 2.10 Iraqi speech data that exists (for context, not for download)
- Habibi in-house IRQ 58.9 h (training set not released; the 2,198-utterance IRQ benchmark is released as
  SWivid/Habibi benchmark data).
- Kharrufa et al. 2024 Iraqi TTS corpus (https://github.com/hayderkharrufa/iraqi-dialect-tts-corpus): read
  speech, ≈ 5 h (survey: 3.7 h MSA + 1 h dialect), CC-BY-4.0, single-speaker TTS-oriented.
- Appen Iraqi Arabic telephone (LDC2006S45): 40.2 h conversational telephone — wrong quality for TTS.
- Survey "Arab Voices" (https://arxiv.org/html/2601.13319) flags Mesopotamian (acm) as under-represented and
  among the dialects benchmarks "struggle with".
- Text-only: factlogic/iraqi-arabic-dialect-corpus (326 k texts), ArSyra/arsyra-iraqi (CC-BY-NC-SA).

## 3. Explicit "NO Iraqi evidence" roll-call

MOSS-TTS v1.5 / Local-Transformer-v1.5 / Realtime; Fish S2 Pro; FireRedTTS3 (Base and Instruct); FireRedTTS-2
(no Arabic); Audar-TTS V1 Turbo / Flash (Pro: no weights); Qwen3-TTS (no Arabic); Qwen-Audio-3.0-TTS (API);
SILMA TTS v1 / v2; Voxtral TTS; Chatterbox Multilingual; VoxCPM2; dots.tts-soar; OmniVoice; X-Voice; Seed-VC;
ArTSTv3; every Egyptian/Levantine/Saudi fine-tune. **Lahgtna** claims Iraqi with no data, no evaluation and a
non-commercial base. **Only Habibi** has Iraqi training hours and an Iraqi evaluation.

## 4. Cross-cutting notes

### 4.1 Cross-language same-person identity (criterion 6)
- The field's own measurements say this is unsolved for Arabic: IWSLT 2026 CLVC (English reference → Arabic):
  Ahtasam et al. (https://aclanthology.org/2026.iwslt-1.12/) — Arabic "particularly challenging" across four SOTA
  systems; AR vs flow-matching trade accuracy against identity differently. KIT on Fish S2 Pro — Arabic SSIM
  64.15 % (compare the studio's ECAPA ≥ 0.80 same-language MOSS takes). Abebe & Moslem
  (https://aclanthology.org/2026.iwslt-1.25/) — OmniVoice-based, gains "varying across languages".
- Practical consequence: the Phase-1 design (one identity, same reference, per-language engine, REVIEW status
  until a listener confirms *same person*) is the right shape. No model found removes the need for the human
  same-person judgement, and no speech-to-speech model can be bolted on to repair identity across languages.

### 4.2 Baghdadi prosody (criterion 4)
No source for any model names Baghdad, Mosul, Basra or any Iraqi sub-variety. Habibi's IRQ data is "in-house
recorded", speakers unspecified. Any Baghdadi character still depends on a Baghdadi *reference clip* and on the
engine honouring reference prosody — which is exactly what FireRedTTS3 ("output inherits the reference's speaking
style") and Audar (zero-shot, dialect from reference) promise and Habibi (dialect ID + reference) does today.

### 4.3 Emotion / acting (criterion 5)
Only two commercial-safe candidates offer any explicit acting control in Arabic: Audar (8 inline tags, both
languages) and FireRedTTS3-Instruct (voice design by description; speed/pitch/volume templates; no free-form
emotion). Habibi, MOSS-TTS, SILMA: reference-only. Fish S2 Pro's free-form tags remain the non-commercial
reference for what acting control sounds like.

### 4.4 Licence flags
- FireRedTTS3 and FireRedTTS-2: Apache-2.0 LICENSE **plus** a README "Usage Disclaimer" that cloning is "intended
  solely for academic research purposes". A disclaimer is not a licence term, and Apache-2.0 §4 grants use without
  field restriction — but the producer should have this read before any production use; for a *listening
  comparison* it is irrelevant.
- Audar Turbo: commercial use is genuinely permitted but capped on five thresholds (Vewbox today is far under all
  five). Audar Flash: uncapped. Both have an indemnity clause and Singapore law.
- Habibi IRQ specialized: clean Apache-2.0. Habibi Unified (the better Iraqi model): CC-BY-NC-SA — never in the
  runtime.
- Fish S2 Pro, Voxtral TTS, OmniVoice-derived models (Lahgtna, VoiceTut): non-commercial — eval only, at most.

### 4.5 RTX 5090 / CUDA 12.8
- Habibi/F5-TTS: already running on this card. MOSS: pins torch 2.9.1+cu128 (running). OmniVoice/Lahgtna: torch
  2.8.0+cu128 (would run; not a candidate). Audar: plain HF transformers + GGUF — no risk. FireRedTTS3: torch 2.8.0
  + **flash-attn 2.8.3 pinned** — verify an sm_120 wheel or an SDPA path before building its container; the 8.48 GB
  bf16 model + 3.78 GB RedAE fits comfortably beside nothing else, but not beside a resident MOSS (24 GB) — run the
  comparison with MOSS unloaded, as the bench profile already does.

## 5. Ranking against the producer's criteria (evidence-weighted, not a listening verdict)

| Criterion | Habibi IRQ (incumbent) | FireRedTTS3-Base | Audar-TTS-V1-Turbo | MOSS-TTS v1.5 | Fish S2 Pro (eval) |
|---|---|---|---|---|---|
| 1 Naturalness | human NMOS 3.83 (Iraqi); UTMOS 2.63; producer: robotic | no Arabic MOS; SIM/CER lead on MLS Arabic (self) | no scores published | no Arabic evidence | KIT Arabic UTMOS 2.93 |
| 2 Identity | SIM 0.763 (IRQ) | SIM 78.9 (Arabic MLS, self) | — | ECAPA 0.80 measured here (EN) | SIM 75.0 (Arabic MLS) |
| 3 Iraqi pronunciation | **trained (70.7 h)**, WER-S 11.45 | untrained | untrained (Gulf-first) | untrained | untrained |
| 4 Baghdadi prosody | from reference + dialect ID | from reference only | from reference only | from reference only | from reference only |
| 5 Emotion/acting | none | Instruct: design + templates | 8 tags, AR+EN | none | free-form tags |
| 6 Cross-language identity | separate English engine needed | one model for EN+AR | one model for EN+AR (code-switch) | EN+AR listed | EN+AR; SSIM 64 % measured |
| 7 Long-form | F5 ≤ ~30 s chunks | AR LLM, not stated | 32 K context | strong (measured) | streaming |
| 8 Licence | Apache-2.0 | Apache-2.0 + disclaimer | Community (capped) | Apache-2.0 | non-commercial |
| 9 Params | 0.34 B | ≈ 4 B + 1.7 B backbone | 1.64 B | 8 B | 4.4 B |

## 6. Ranked shortlist — at most two downloads for a controlled single-output listening comparison

Both are "strong Arabic, no Iraqi". The comparison asks one question the papers cannot answer: *does a model with
much better Arabic naturalness and identity, given a Baghdadi reference clip and Iraqi-spelled text, sound more
like a real Baghdadi person than Habibi IRQ does?* Same reference, same lines, attempt #1 only, blind A/B with
Habibi IRQ and MOSS (Arabic-script) as the two incumbents, native Iraqi listener judges dialect and same-person.

**A. FireRedTTS3-Base** — `FireRedTeam/FireRedTTS3` (Apache-2.0; HF files dated Aug 2026)
- `fireredtts3_base/model.safetensors` 8.48 GB, `fireredtts3_base/config.json`
- `redae/model.safetensors` 3.78 GB, `redae/config.json`
- `campp/campplus_voxceleb.bin` 29.4 MB
- `text_tokenizer/` (size not listed; small)
- **≈ 12.3 GB** (≈ 41 min at 5 MB/s). Skip `fireredtts3_instruct` (another 8.48 GB) until Base has been heard.
- Why: highest Arabic SIM and near-best Arabic CER of any commercial-licensed open model (self-reported, MSA-type
  test set); explicitly keys dialect off the reference prompt; one model for English and Arabic (criterion 6).
- Risks: zero dialect evidence; flash-attn pin on Blackwell; README disclaimer (§4.4); Qwen3-1.7B backbone —
  smaller than MOSS, so English quality may fall below the current engine (keep MOSS for English regardless).

**B. Audar-TTS-V1-Turbo** — `audarai/Audar-TTS-V1-Turbo` (AudarAI Community License v1.0; 2026-07-07)
- bf16 safetensors for 1.64 B ≈ **3.3 GB (estimate — the card lists only GGUF sizes: Q8_0 1.75 GB)**, plus the
  separately distributed `audar-codec` decoder (size not listed).
- Why: the only Arabic-first open model with native AR↔EN code-switching and inline acting tags; zero-shot from
  5–15 s; cheap to run (no GPU contention with MOSS).
- Risks: Gulf/Emirati-trained — expect Gulf colouring of Iraqi text; no published scores at all; licence caps.
  If Turbo's licence caps worry the producer, Flash (0.55 B, uncapped Open License, 0.6–1.2 GB) is the fallback,
  at a fidelity cost.

**Not shortlisted and why:** Habibi Unified (better Iraqi NMOS 4.18, but CC-BY-NC-SA); Lahgtna (Iraqi claim,
non-commercial base, lost to XTTS-v2 in NADI 2026); SILMA v1 (MSA-only, 150 M); Voxtral TTS (CC-BY-NC); Chatterbox
Multilingual (0.5 B, no dialect, watermark; no evidence it would beat MOSS's Arabic); MOSS-TTS-Local-Transformer-v1.5
/ Realtime (same family, same absence of Arabic evidence — hearing them adds nothing the 8 B does not already show);
Qwen3-TTS (no Arabic); Seed-VC / X-Voice (no usable artefact).

**If both lose to Habibi IRQ on the Iraqi ear:** the honest remaining lever is *data*, not a new model — Habibi's
own ablations show dialect quality scales with in-dialect hours, and the IRQ specialized checkpoint is Apache-2.0
and fine-tunable with the released F5-TTS training code. That is a production decision for the producer, outside
this pass.

## 7. What could not be verified

- Habibi IRQ data origin (city, speakers, recording setup) — "in-house", unspecified.
- Habibi inference NFE/CFG and RTF — not in paper or README.
- MOSS-TTS tech report body (HTML 404) — Arabic training hours unknown.
- FireRedTTS3 total parameter count, VRAM, RTF, Arabic training hours — not stated anywhere official.
- Audar safetensors size, codec size, training data — not stated.
- Voxtral TTS HF card — gated (401); licence taken from two press reports quoting the card.
- IWSLT 2026 findings paper CLVC section (Arabic leaderboard) — PDF not renderable here; system papers used instead.
- Any independent human listening study of Habibi Iraqi output other than the authors' own.
