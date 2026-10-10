# Singing identity for a synthetic character voice — research note (2026-10-10)

**Verdict.** Keep the identity in *speech* (Chatterbox Multilingual V3 / MOSS-TTS v1.5, ECAPA fingerprint) and make it *sing* by singing-voice conversion (SVC) of an ACE-Step lead vocal, not by a singing synthesiser. The only open SVC with a dedicated 44.1 kHz singing checkpoint, zero-shot timbre from a 1–30 s clip and a code+weights licence we can use is **Seed-VC v1 `seed-uvit-whisper-base`** (GPL-3.0 — commercial use allowed, copyleft applies to our internal pipeline only; archived Nov 2025, no v2 singing). Second choice: **RVC** (MIT code, VCTK-trained base, per-speaker training on ~10 min of *our own synthetic* audio — the identity's converted singing — so no real-person data). The strongest-sounding singing models of 2025–26 (Vevo1.5/Vevo2, YuE2, F5-based) are **CC-BY-NC(-ND)** and excluded; SoulX-Singer (Apache-2.0, Feb 2026) is the one new Apache singing model but is SVS/SVC on Mandarin/English/Cantonese with no Arabic and unstated reference rules — track it. Hosted services (Suno, Mureka) are excluded once and for all: no local weights, no commercial-safe provenance we control. A spoken 10 s seed gives weak singing timbre; bootstrap one *sung* reference clip of the identity (convert once, gate on ECAPA, keep) and condition all later songs on it.

## §1 Singing voice conversion (SVC)

| Model | Zero-shot? | Reference | Singing notes | VRAM | Licence (code / weights) | Verdict |
|---|---|---|---|---|---|---|
| Seed-VC v1 `seed-uvit-whisper-base` (Plachtaa) | yes | 1–30 s | 44.1 kHz, BigVGAN, 200M; `--f0-condition True`, 30–50 diffusion steps, `--semi-tone-shift`; F0-conditioned so range/vibrato follow the source vocal | <4 GB | GPL-3.0 both ([README](https://github.com/Plachtaa/seed-vc), [HF card](https://huggingface.co/Plachta/Seed-VC)); training data **not stated** (UNVERIFIED) | COMMERCIAL-SAFE (copyleft; don't ship inside closed binaries) |
| Seed-VC v2 `hubert-bsqvae-small` | yes | 1–25 s | 22.05 kHz, speech/accent only; no singing mode; repo archived 2025-11-21 | <4 GB | GPL-3.0 | COMMERCIAL-SAFE, not for singing |
| RVC (Retrieval-based-VC-WebUI) | no — per-speaker, ≥10 min | trained model + index | 40/48 kHz, RMVPE F0, formant shift via index rate; strong on pop, breath OK | <6 GB train | MIT ([LICENSE](https://raw.githubusercontent.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/main/LICENSE)); base models "≈50 h VCTK" per README; hubert_base = fairseq MIT ([LICENSE](https://github.com/facebookresearch/fairseq/blob/main/LICENSE)); ContentVec MIT ([repo](https://github.com/auspicious3000/contentvec)) | COMMERCIAL-SAFE if trained only on our synthetic audio; VCTK base weights' own licence UNVERIFIED |
| so-vits-svc 4.1 (svc-develop-team) | no | ≥30 min | good vibrato; archived | 6–8 GB | AGPL-3.0 code ([listing](https://awesome.ecosyste.ms/projects/github.com%2Fsvc-develop-team%2Fso-vits-svc)); base weights UNCLEAR | UNCLEAR (AGPL + unknown pretrain) |
| so-vits-svc-fork (34j) | no | ≥30 min | realtime GUI; unmaintained since 2023 | 6–8 GB | MIT + Apache-2.0 ([LICENSE](https://github.com/34j/so-vits-svc-fork/blob/main/LICENSE)); inherits so-vits base weights | UNCLEAR (weights) |
| DDSP-SVC 6.x (yxlllc) | no | ≈1000 clips ≥2 s | realtime; needs NSF-HiFiGAN vocoder | 4 GB | MIT code ([repo](https://github.com/yxlllc/DDSP-SVC)); openvpi NSF-HiFiGAN weights **CC-BY-NC-SA 4.0** ([releases](https://github.com/openvpi/vocoders/releases)) | NON-COMMERCIAL (vocoder) |
| Diff-SVC (prophesier) | no | hours | unmaintained | 8 GB | AGPL-3.0 ([repo](https://github.com/prophesier/diff-svc)) | NON-COMMERCIAL in practice |
| CosyVoice (FunAudioLLM) | yes | ~3 s | VC exists only on CosyVoice-300M (2024-09 roadmap); CosyVoice2/3 VC UNVERIFIED; speech model, no F0 path | 6 GB | Apache-2.0 ([repo](https://github.com/FunAudioLLM/CosyVoice)) | COMMERCIAL-SAFE but not a singer |
| F5-TTS style zero-shot VC | yes | 3–10 s | speech only | 6 GB | MIT code, weights **CC-BY-NC-4.0** (Emilia) ([HF](https://huggingface.co/SWivid/F5-TTS)) | NON-COMMERCIAL |
| OpenVoice V2 (MyShell) | yes | ~10 s | tone-colour converter for speech; no singing claim | 2 GB | MIT since Apr 2024 ([repo](https://github.com/myshell-ai/OpenVoice)) | COMMERCIAL-SAFE, speech only |
| FreeVC (OlaWod) | yes | ~5 s | 16 kHz, VCTK; speech only | 2 GB | MIT ([repo](https://github.com/OlaWod/FreeVC)) | COMMERCIAL-SAFE, speech only |
| kNN-VC (bshall) | yes | minutes (gains flatten >5 min) | 16 kHz WavLM-Large matching; needs *lots* of target audio, poor on singing F0 | 4 GB | MIT ([LICENSE](https://raw.githubusercontent.com/bshall/knn-vc/master/LICENSE)) | COMMERCIAL-SAFE, weak singer |
| Vevo1.5 (Amphion) | yes | ~10 s | SVC + singing style conversion, 780M+350M | ~10 GB | code MIT ([Amphion](https://github.com/open-mmlab/Amphion/blob/main/LICENSE)); weights **cc-by-nc-nd-4.0** ([HF](https://huggingface.co/amphion/Vevo1.5)) | NON-COMMERCIAL |
| Vevo2 (Amphion, 2025-08 paper, code 2026-03) | yes | ~10 s | unified speech+singing, SVC, humming-to-singing; Qwen2.5-0.5B AR | ~10 GB | weights **cc-by-nc-nd-4.0** ([HF](https://huggingface.co/RMSnow/Vevo2)) | NON-COMMERCIAL |
| SaMoye-SVC (IJCAI-25) | yes | one clip | zero-shot SVC incl. non-human timbres; ~1700 h Chinese | 6 GB | **no LICENSE file** ([repo](https://github.com/CarlWangChina/SaMoye-SVC)) | UNCLEAR |
| SoulX-Singer-SVC (Soul-AILab, 2026-03-16) | yes (fine-tuned from SVS) | prompt timbre, length unstated | wav+F0 input; zh/en/yue; wav-to-wav without transcription still on roadmap | UNVERIFIED | Apache-2.0 ([repo](https://github.com/Soul-AILab/SoulX-Singer), [HF](https://huggingface.co/Soul-AILab/SoulX-Singer)) | COMMERCIAL-SAFE; needs our own eval |
| Takin-VC (Ximalaya, ACL 2025) | — | — | speech paper; no code/weights found | — | — | UNVERIFIED / no release |
| NVIDIA / ByteDance zero-shot SVC | — | — | no open release found in this search | — | — | UNVERIFIED |

## §2 Singing synthesis from lyrics + melody

| Model | Zero-shot singer timbre? | From a *spoken* reference? | Licence | Verdict |
|---|---|---|---|---|
| ACE-Step 1.5 (in stack) | text "timbre description" + **Refer audio** (style guidance, undocumented); **Cover** and **Repaint** tasks; Vocal2BGM; stems via separation | no documented voice-clone path | MIT code+weights, outputs commercial ([HF](https://huggingface.co/ACE-Step/Ace-Step1.5), [repo](https://github.com/ace-step/ACE-Step-1.5)); XL 4B ≥20 GB | COMMERCIAL-SAFE — song generator, not an identity carrier |
| DiffSinger (openvpi) + OpenUtau | no — trained voicebank (hours of labelled singing) | no | Apache-2.0 ([repo](https://github.com/openvpi/DiffSinger)); OpenUtau MIT ([repo](https://github.com/stakira/OpenUtau)); NSF-HiFiGAN CC-BY-NC-SA | NON-COMMERCIAL unless we train our own vocoder; no data |
| YuE (2025) | no | no | Apache-2.0 ([HF](https://huggingface.co/m-a-p/YuE-s1-7B-anneal-en-cot/blob/main/README.md)) | COMMERCIAL-SAFE, no timbre control |
| YuE2-3B (2026-09) | no (cover via SheetSage2 ABC) | no | **CC-BY-NC-4.0** ([HF](https://huggingface.co/m-a-p/YuE2-3B)) | NON-COMMERCIAL |
| SongGen (LiuZH-19, ICML 2025) | yes — `ref_voice_path` | speech-or-song ref (unstated) | Apache-2.0 ([repo](https://github.com/LiuZH-19/SongGen)); English only, 30 s, 2k h unnamed data | UNCLEAR (training provenance) |
| TCSinger 2 (ACL 2025) | style transfer, speech-to-singing style | partly (needs VAE change) | MIT code, **no checkpoints** ([repo](https://github.com/AaronZ345/TCSinger2)) | UNVERIFIED (train ourselves) |
| Prompt-Singer (NAACL 2024) | text attributes only | no | no code found | UNVERIFIED |
| VersBand (EMNLP 2025) | VocalBand not released; AccompBand only | — | MIT ([repo](https://github.com/AaronZ345/VersBand)) | not usable |
| SoulX-Singer SVS (2026-02) | yes, zero-shot clone + MIDI/F0 | unstated | Apache-2.0 | COMMERCIAL-SAFE; zh/en/yue only |
| Suno / Mureka (hosted) | — | — | hosted, no weights | EXCLUDED |

## §3 Recommended pipeline

- (a) ACE-Step 1.5 writes the song (lyrics, style, Iraqi/English); keep mix + Vocal2BGM/separation stems. (b) htdemucs_ft isolates the lead vocal (already in stack). (c) **Seed-VC v1 `seed-uvit-whisper-base`, `--f0-condition True`, 40 steps**, reference = the identity's clip; (d) remix lead over stems with the original vocal's level/reverb.
- Limitation: a spoken 10 s seed under-specifies singing timbre (no sustained vowels, no high F0). **Bootstrap:** convert one ~20 s clean ACE-Step vocal in the identity's comfortable range with the *speech* seed; score ECAPA cosine against the fingerprint; if ≥ 0.60 (speech-to-song threshold lower than our 0.70 speech gate), store it as `SINGING_REFERENCE` in the pack with sha256; every later song conditions on it (Seed-VC accepts up to 30 s). Re-bootstrap per language if Arabic timbre drifts.
- Second choice **RVC**: train a per-identity model on 10–20 min of the identity's own Seed-VC-converted singing plus TTS speech (all synthetic, no real person); gives stabler high notes and formant control than zero-shot, but is a derived model to maintain. Not first because it needs that corpus first.
- Not chosen: Vevo2 (best quality, NC-ND), SoulX-Singer-SVC (Apache, but no Arabic, unknown reference rules — evaluate once released wav-to-wav mode lands).

## §4 Iraqi singing (abstract, no real-singer cloning, no copyrighted lyrics)

- *Maqam al-'Iraqi*: unmetered vocal opening (tahrir), build to a high-register climax (qit'a/meyana), descent and cadence into the metered **pesteh**; quarter-tone intervals (Bayati, Saba, Segah) and slow, free ornamentation ([QDL](https://www.qdl.qa/dusty-streets-and-hot-music-baghdad-iraqi-maqam-music-and-chalgi-ensembles), [Wikipedia](https://en.wikipedia.org/wiki/Music_of_Iraq)). **Rīfī** (southern/rural): short songs of love and separation, mournful, heavy melisma ([QDL](https://qdl.qa/en/love-and-separation-baghdad-pesta-and-rifi-songs-shellac-discs)). Modern Iraqi pop: Egyptian-influenced arrangements, chobi rhythms, same melismatic vocal line over Western harmony.
- Ornaments to preserve in SVC: long melismas on one syllable, fast trills, glottal "cry" breaks, pharyngealised vowels. Use **F0-conditioned** SVC only (Seed-VC `--f0-condition`), `--auto-f0-adjust` **off** so quarter-tones and glides are not snapped; `--semi-tone-shift` in whole semitones only, ≤ ±3 from the source's range; never pitch-correct.
- ACE-Step: write lyrics in Arabic script with Iraqi dialect spellings; the melody must be generated (not transcribed from a recording) to stay clear of copyrighted compositions.

## §5 Risks and measurement

- **Identity drift speech→song**: ECAPA embeddings carry vocal-manner information; singing shows larger intra-speaker variance than speech (KunquDB [arXiv 2403.13356](https://arxiv.org/pdf/2403.13356); IPSJ study). Expect lower speech-vs-song cosine for the *same* identity; calibrate a separate singing threshold from our own genuine/impostor distributions rather than reusing 0.70.
- **F0 beyond the reference**: the speech seed sits ~100–250 Hz; songs reach 400+ Hz. Log per-clip F0 stats (median, p5/p95, semitone span) for seed, speech lines and song; flag songs whose p95 exceeds the singing reference's p95 by > 4 semitones for re-bootstrap in the higher range.
- **Gate record**: for every song, store ECAPA cosine (song vs fingerprint, song vs SINGING_REFERENCE), F0 stats, Seed-VC settings and reference sha256; FAIL below threshold, no human approvals needed (AUTO_REVIEW gate).
- **Licence hygiene**: Seed-VC is GPL-3.0 — keep it as a separate worker process, publish our modifications if we ever distribute it; training data of its checkpoints is not disclosed (UNVERIFIED), the residual provenance risk for this plan.
