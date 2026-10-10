# Singing identity for a synthetic character voice (2026-10-10)

**Verdict.** The identity stays a *speech* identity (Chatterbox V3 / MOSS-TTS, ECAPA fingerprint) and sings through singing-voice conversion (SVC) of an ACE-Step lead vocal. The only open SVC with a 44.1 kHz singing checkpoint, zero-shot timbre from 1–30 s and a usable code+weights licence is **Seed-VC v1 `seed-uvit-whisper-base`** (GPL-3.0: commercial use allowed, copyleft; repo archived Nov 2025; v2 `hubert-bsqvae-small` is speech-only). Second choice **RVC** (MIT code, per-identity training on ~10 min of *our own synthetic* audio). The best-sounding 2025–26 singing models (Vevo1.5/Vevo2, YuE2, F5 derivatives) are CC-BY-NC(-ND) and excluded; SoulX-Singer (Apache-2.0, Feb 2026) is the one new permissive singing model, zh/en/yue only — track it. Hosted services (Suno, Mureka) are excluded: no local weights, no provenance we control. A spoken 10 s seed under-specifies singing timbre: bootstrap one *sung* reference once and condition every song on it. Takin-VC and any NVIDIA/ByteDance zero-shot SVC: no open release found (UNVERIFIED).

## §1 SVC options

| Model | Zero-shot / ref | Singing notes | VRAM | Licence code / weights | Verdict |
|---|---|---|---|---|---|
| Seed-VC v1 `seed-uvit-whisper-base` | yes, 1–30 s | 44.1 kHz, 200M, BigVGAN; `--f0-condition True`, 30–50 steps, `--semi-tone-shift`; F0 follows source (range/vibrato kept) | <4 GB | GPL-3.0 both ([README](https://github.com/Plachtaa/seed-vc), [HF](https://huggingface.co/Plachta/Seed-VC)); training data not stated (UNVERIFIED) | COMMERCIAL-SAFE (copyleft) |
| RVC WebUI | no; ≥10 min training | 40/48 kHz, RMVPE F0, index-rate formant control; good pop vibrato | <6 GB | MIT ([LICENSE](https://raw.githubusercontent.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/main/LICENSE)); base "≈50 h VCTK"; hubert_base MIT ([fairseq](https://github.com/facebookresearch/fairseq/blob/main/LICENSE)); ContentVec MIT ([repo](https://github.com/auspicious3000/contentvec)) | COMMERCIAL-SAFE on our synthetic data; VCTK-base terms UNVERIFIED |
| so-vits-svc 4.1 / -fork | no; ≥30 min | unmaintained | 6–8 GB | AGPL-3.0 ([listing](https://awesome.ecosyste.ms/projects/github.com%2Fsvc-develop-team%2Fso-vits-svc)) / MIT+Apache ([LICENSE](https://github.com/34j/so-vits-svc-fork/blob/main/LICENSE)); base weights UNCLEAR | UNCLEAR |
| DDSP-SVC 6.x | no; ~1000 clips | realtime | 4 GB | MIT ([repo](https://github.com/yxlllc/DDSP-SVC)); required NSF-HiFiGAN weights **CC-BY-NC-SA** ([releases](https://github.com/openvpi/vocoders/releases)) | NON-COMMERCIAL (vocoder) |
| Diff-SVC | no; hours | unmaintained | 8 GB | AGPL-3.0 ([repo](https://github.com/prophesier/diff-svc)) | NON-COMMERCIAL in practice |
| CosyVoice VC | yes, ~3 s | VC on CosyVoice-300M only; v2/v3 VC UNVERIFIED; no F0 path | 6 GB | Apache-2.0 ([repo](https://github.com/FunAudioLLM/CosyVoice)) | SAFE, speech only |
| F5-TTS-style VC | yes, 3–10 s | speech only | 6 GB | MIT code; weights **CC-BY-NC-4.0** ([HF](https://huggingface.co/SWivid/F5-TTS)) | NON-COMMERCIAL |
| OpenVoice V2 / FreeVC / kNN-VC | yes, 5–10 s (kNN-VC: minutes) | speech tone-colour, 16–24 kHz, no F0 model | 2–4 GB | MIT each ([OpenVoice](https://github.com/myshell-ai/OpenVoice), [FreeVC](https://github.com/OlaWod/FreeVC), [kNN-VC](https://raw.githubusercontent.com/bshall/knn-vc/master/LICENSE)) | SAFE, weak singers |
| Vevo1.5 / Vevo2 (Amphion) | yes, ~10 s | SVC, singing style conversion, humming-to-singing; ~1.4B | ~10 GB | code MIT ([Amphion](https://github.com/open-mmlab/Amphion/blob/main/LICENSE)); weights **cc-by-nc-nd-4.0** ([Vevo1.5](https://huggingface.co/amphion/Vevo1.5), [Vevo2](https://huggingface.co/RMSnow/Vevo2)) | NON-COMMERCIAL |
| SaMoye-SVC (IJCAI-25) | yes, one clip | ~1700 h Chinese | 6 GB | **no LICENSE file** ([repo](https://github.com/CarlWangChina/SaMoye-SVC)) | UNCLEAR |
| SoulX-Singer-SVC (2026-03-16) | yes; ref length unstated | wav+F0 input; zh/en/yue; wav-to-wav w/o transcription on roadmap | UNVERIFIED | Apache-2.0 ([repo](https://github.com/Soul-AILab/SoulX-Singer)) | SAFE; needs our eval |

## §2 Lyrics + melody synthesis

| Model | Timbre from a reference? | Licence | Verdict |
|---|---|---|---|
| ACE-Step 1.5 (in stack) | text timbre description + undocumented **Refer audio**; **Cover**/**Repaint**/Vocal2BGM; no voice-clone path | MIT, outputs commercial ([HF](https://huggingface.co/ACE-Step/Ace-Step1.5)); XL 4B ≥20 GB | SAFE generator, not an identity carrier |
| DiffSinger (openvpi) + OpenUtau | no — trained voicebank | Apache-2.0 ([repo](https://github.com/openvpi/DiffSinger)); OpenUtau MIT ([repo](https://github.com/stakira/OpenUtau)); NSF-HiFiGAN CC-BY-NC-SA | NON-COMMERCIAL vocoder; no data |
| YuE (2025) / YuE2-3B (2026-09) | no | Apache-2.0 ([HF](https://huggingface.co/m-a-p/YuE-s1-7B-anneal-en-cot/blob/main/README.md)) / **CC-BY-NC-4.0** ([HF](https://huggingface.co/m-a-p/YuE2-3B)) | no timbre control / NON-COMMERCIAL |
| SongGen (ICML 2025) | yes, `ref_voice_path` | Apache-2.0 ([repo](https://github.com/LiuZH-19/SongGen)); English, 30 s, unnamed 2k h | UNCLEAR provenance |
| TCSinger 2 | speech-to-singing style transfer | MIT, **no checkpoints** ([repo](https://github.com/AaronZ345/TCSinger2)) | UNVERIFIED |
| Prompt-Singer / VersBand | text attributes; VocalBand unreleased | no code / MIT AccompBand only ([repo](https://github.com/AaronZ345/VersBand)) | not usable |
| SoulX-Singer SVS (2026-02) | yes, zero-shot + MIDI/F0 | Apache-2.0 ([HF](https://huggingface.co/Soul-AILab/SoulX-Singer)); zh/en | SAFE; no Arabic |

## §3 Pipeline

- (a) ACE-Step 1.5 writes the song, keep mix + stems; (b) htdemucs_ft isolates the lead; (c) **Seed-VC v1, `--f0-condition True`, 40 steps**, reference = identity clip; (d) remix the lead over stems at the original level/reverb.
- The spoken seed lacks sustained vowels and high F0, so singing timbre is weak. **Bootstrap:** convert one ~20 s clean vocal in the comfortable range from the speech seed; if ECAPA cosine to the fingerprint ≥ 0.60 (separate, lower singing threshold), store it sha256-checked as `SINGING_REFERENCE`; later songs condition on it. Repeat per language if Arabic drifts.
- Second choice **RVC**: train per identity on 10–20 min of its own converted singing + TTS speech (all synthetic); stabler high notes and formant control, but a derived model needing that corpus first.
- Not chosen: Vevo2 (NC-ND); SoulX-Singer-SVC (no Arabic, unknown reference rules — re-evaluate when wav-to-wav lands).

## §4 Iraqi singing (abstract)

- *Maqam al-'Iraqi*: unmetered tahrir opening, climb to the high meyana, descent into the metered **pesteh**; quarter-tone modes (Bayati, Saba, Segah), slow free ornamentation ([QDL](https://www.qdl.qa/dusty-streets-and-hot-music-baghdad-iraqi-maqam-music-and-chalgi-ensembles), [Wikipedia](https://en.wikipedia.org/wiki/Music_of_Iraq)). **Rīfī** (southern/rural): short mournful love/separation songs, heavy melisma ([QDL](https://qdl.qa/en/love-and-separation-baghdad-pesta-and-rifi-songs-shellac-discs)). Modern pop: the same melismatic line over chobi rhythms and Western harmony.
- Preserve melismas, trills, glottal "cry" breaks, pharyngealised vowels: F0-conditioned SVC only, `--auto-f0-adjust` **off** (no snapping of quarter-tones/glides), `--semi-tone-shift` ≤ ±3, never pitch-correct.
- Lyrics in Arabic script with Iraqi spellings; melodies generated, never transcribed from recordings.

## §5 Risks and measurement

- **Speech→song drift**: ECAPA encodes vocal manner; singing has higher intra-speaker variance ([KunquDB](https://arxiv.org/pdf/2403.13356)). Calibrate a singing threshold from our own genuine/impostor distributions, not the 0.70 speech gate.
- **F0 beyond the reference**: seed ~100–250 Hz, songs 400+ Hz. Log F0 median/p5/p95/semitone span per clip; if a song's p95 exceeds the singing reference's by >4 semitones, re-bootstrap in that range.
- **Gate record** per song: cosine vs fingerprint and vs `SINGING_REFERENCE`, F0 stats, Seed-VC settings, reference sha256; FAIL below threshold (AUTO_REVIEW).
- **Licence hygiene**: Seed-VC GPL-3.0 — isolated worker, publish modifications if ever distributed; its checkpoint training data is undisclosed (UNVERIFIED), the residual provenance risk.
