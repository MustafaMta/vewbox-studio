# Voice identity v2 — automatic, manual and reference voices for EN, AR-MSA and AR-Iraqi

Voice/audio research, 2026-10-03 (web sources fetched 2026-10-02/03). Research only: no code edited, nothing downloaded,
no GPU job, no restart. Local facts come from the code and three read-only `GET /health` calls made today:
`tts` (8020) IndexTTS `indextts 2.0.0; repo v2.5.0; model IndexTTS-2.5; torch 2.8.0+cu128`, not loaded; `tts-habibi`
(8021) `habibi-tts 0.1.1; f5-tts 1.1.22; model Specialized/IRQ/model_100000`, not loaded; `asr` (8030) faster-whisper
`large-v3` fp16, loaded. The GPU had 23.3 of 32.6 GB in use at the time.

Builds on `VOICE-STACK.md`, `CHARACTER-VOICE-DIAGNOSIS.md`, `MINIMAX-API.md`, `docs/CONTRACTS-CHARACTER-VOICE.md` §1.4–1.5
and `docs/REVIEW-WAVE2.md` findings 4–9, 11, 15 and 17. Those documents stay valid. This one adds what they left open: a
voice for a character who has **no recording**.

---

## 0. Decision in one paragraph

Keep the two line engines: **IndexTTS 2.5** for English, MSA and mixed lines, and **Habibi-TTS IRQ** for Iraqi lines.
Add two things around them. First, a **studio voice library**: approved reference voices, each with recorded rights,
attribution, previews and an evaluation. Second, a **local voice-design engine, VoxCPM2** (Apache-2.0, 30 languages
including Arabic, about 8 GB VRAM, 4.96 GB of weights). It creates *synthetic* voices from a text description for EN and
MSA. A designed seed sample may become an IndexTTS or Habibi reference **only** under the rule in §3. Automatic voice
then works like this:

- **English:** select a library voice, otherwise design a new one.
- **MSA:** the same, but the voice stays `REVIEW` until the design engine's Arabic passes a listening test.
- **Iraqi:** select an **approved Iraqi library voice made from real, authorised Iraqi recordings**, otherwise refuse
  with a clear message. Iraqi has no designed path by default, because Habibi's authors say the reference should match
  the dialect.

MiniMax is the configured-but-unavailable hosted path: catalogue voices, Voice Design, and clones. It needs a key, and
without one every hosted option fails with `NOT_CONFIGURED`. ASR measures intelligibility only. Any "Iraqi" claim
requires a native Baghdadi listening panel.

---

## 1. The gap today (code facts)

| What | Where | Effect |
|---|---|---|
| AUTOMATIC means "pick the best uploaded recording" | `src/worker/handlers/voice.ts:86-106` `pickReference`, `:211-213` → `MISSING_REFERENCE` | A character without an upload cannot get any voice. The Describe start's "Studio voice" can never succeed (REVIEW-WAVE2 #15). |
| The UI already expects a voice bank | `VoiceTab.tsx:115-116`: disabled "Choose a studio voice", `i18n.ts:1190` "The studio has no voice bank yet." | No library entity, job or endpoint exists. |
| MANUAL is MiniMax only | `voice.ts:206-207,223` | No key on this machine, so it fails with `NOT_CONFIGURED` (correct and honest, but no local manual path exists). |
| No consent data model | grep `consent\|rightsHolder\|authorisedBy` in `src/` → 0 hits | The "authorised reference" rule is enforced only by origin (`UPLOADED` vs `GENERATED`), not by recorded rights. |
| Synthetic tag written, never read | `docker/tts/app.py:393-397`; REVIEW-WAVE2 #7 | Engine output can be re-uploaded as a "recording". |
| Hosted clone gets the ≤12 s window | `voice.ts:227`; REVIEW-WAVE2 #11 | MiniMax needs 10 s–5 min, so most hosted clones would fail. |
| Emotion strength pinned at 1.0 | `voice.ts:220` `emotionAlpha: 1` | IndexTTS recommends about 0.6 or lower for natural speech (§2.6). |
| Dialect status is not recorded | `VoiceIdentity` (`src/domain/types.ts:327-357`) | Nothing separates "intelligible" from "listener-verified Iraqi". |

---

## 2. Findings

### 2.1 MiniMax speech (platform.minimax.io, fetched 2026-10-02)

| Item | Fact | Source |
|---|---|---|
| Models | `speech-2.8-hd`, `speech-2.8-turbo` (current); 2.6, 02 and 01 hd/turbo (legacy) | `/docs/api-reference/speech-t2a-http`, `/docs/guides/pricing-paygo.md` |
| Languages | 40 values for `language_boost`, including `Arabic`, plus `auto`. **No dialect parameter**: Arabic is one value | speech-t2a-http |
| Voice controls | `speed` 0.5–2, `vol` (0,10], `pitch` −12…12, `emotion` ∈ happy, sad, angry, fearful, disgusted, surprised, calm, fluent, whisper; `voice_modify` pitch, intensity and timbre −100…100 plus 4 effects; text < 10 000 chars; wav/mp3/flac/pcm/opus at 8–44.1 kHz | speech-t2a-http |
| System voices | 332 in total; English 45; **Arabic 2: `Arabic_CalmWoman`, `Arabic_FriendlyGuy`, no dialect labels**. The public Arabic page shows the same two voices and makes no dialect claim | `/docs/faq/system-voice-id`; minimax.io/audio/text-to-speech/arabic |
| Voice Design | `POST /v1/voice_design` `{prompt, preview_text ≤ 500 chars, voice_id?}` returns `voice_id` and `trial_audio` (hex). Preview text costs $30/M chars; **$3 per voice, charged on first synthesis**. A designed id **unused for 7 days is deleted** (stated by Novita and WaveSpeed; the official reference page does not say this, so it is UNVERIFIED and the studio should design for it anyway) | `/docs/api-reference/voice-design-design.md`; pricing-paygo |
| Voice Clone | Source audio **10 s – 5 min**, mp3/m4a/wav, ≤ 20 MB. Optional `clone_prompt` (< 8 s clip + transcript). `voice_id` is 8–256 chars, starts with a letter, unique. Options: `language_boost`, `need_noise_reduction`, `need_volume_normalization`, `accuracy` (0.7), `aigc_watermark`. **$1.50 per voice on first use.** "If a cloned voice is not used within 7 days, the system will delete it." | `/docs/guides/speech-voice-clone`, `/docs/api-reference/voice-cloning-clone.md` |
| Consent | The clone pages contain **no consent or rights text**. The terms page could not be fetched (rendered empty). The studio must apply its own consent rule before uploading anyone's voice | as above |
| Prices | speech-2.8-hd **$100/M chars**, turbo **$60/M chars** (sync and async alike). Example: one hour of dialogue is about 50 000 chars, about $5 on hd | pricing-paygo |
| Limits | T2A 60 RPM, clone 60 RPM, design 20 RPM | `/docs/guides/rate-limits.md` |
| Without a key | **Nothing.** Every hosted speech call returns `NOT_CONFIGURED` (`minimax.ts:32`) | code |

**Configured-but-unavailable path (to implement).**

- `/api/status` reports `speech.minimax: NOT_CONFIGURED | READY`.
- The UI shows the three hosted options (catalogue, design, clone) **disabled**, with "Needs MINIMAX_API_KEY" and the price.
- Each job refuses with `NOT_CONFIGURED`. It never falls back to a local engine, and the reverse is equally forbidden.

With a key:

1. **Catalogue.** `GET` the voice list, cached daily. Arabic system voices are offered as "Arabic (dialect not stated)"
   and **never labelled Iraqi**. MSA labelling waits for a listener pass.
2. **Design.** Store the description so the voice can be re-created. Make the proof line the first T2A call, which
   pins the voice and triggers the $3.
3. **Clone.** Send the **original** upload (10 s–5 min), never the ≤12 s window (REVIEW #11). Refuse up front under
   10 s. Require a consent scope `CLONE_HOSTED_MINIMAX`, because this is biometric data sent to a third party.

Identities keep `hosted.voiceId` plus `recreateFrom`, because hosted ids are account-scoped and can disappear. A
production checks that the id still exists before recording.

### 2.2 Local automatic voice creation: voice-design engines (fetched 2026-10-02/03)

| Engine | Voice from text only | Arabic | Licence (weights) | Size / VRAM | Verdict |
|---|---|---|---|---|---|
| **VoxCPM2** (OpenBMB, released 2026-04) | yes: `(A warm, low male voice, about 50)text…`. Also controllable cloning and "ultimate" cloning with a transcript | **yes**, 1 of 30 languages. Internal Arabic CER 1.23 %; CV3-eval Arabic WER 13.0 %, SIM 79.1 %. No Arabic dialect control | **Apache-2.0**, "free for commercial use". Disclaimer forbids impersonation and fraud and asks that AI content be labelled | 2 B params; `model.safetensors` 4.58 GB + `audiovae.pth` 377 MB (pickle; load only inside its container) = **4.96 GB**; about **8 GB VRAM**; RTF about 0.30 on a 4090; 48 kHz output | **Adopt as the design engine (EN, MSA). Challenger as an EN/MSA line engine.** github.com/OpenBMB/VoxCPM · huggingface.co/openbmb/VoxCPM2 |
| Qwen3-TTS-12Hz-1.7B-VoiceDesign (2026-01) | yes. The README documents a **"design, then clone"** workflow for consistent characters | **no** (10 languages) | Apache-2.0 | 1.7 B | EN-only alternative to VoxCPM2. huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign · github.com/QwenLM/Qwen3-TTS |
| MOSS-VoiceGenerator (OpenMOSS) | yes | **no** (zh, en). MOSS-TTS v1.5 (8 B) clones in 31 languages including Arabic but does not design | Apache-2.0 | 1.7 B | EN-only alternative. github.com/OpenMOSS/MOSS-TTS |
| Maya1 (2025-11) | yes, `<description="…">` plus 20 emotion tags | no | Apache-2.0 | 3 B, ≥16 GB | EN-only alternative |
| Parler-TTS large v1 | yes (gender, pitch, rate, noise, reverb; 34 named LibriTTS-R/MLS speakers) | no | Apache-2.0 | 2.2 B | Superseded |
| Chatterbox Multilingual v3 (Resemble) | **no** (needs a reference); Perth watermark on every output | yes (23 languages) | MIT | 0.5 B | Already listed as a challenger line engine (VOICE-STACK) |
| CosyVoice 3 instruct | instruct style, Chinese and others | **no** | Apache-2.0 | 0.5 B | Out |
| F5/E2 base | no | MSA fine-tunes exist | **CC-BY-NC** (Emilia) | — | Out (Habibi IRQ/MSA specialised are Apache) |
| Voxtral TTS 4B (Mistral, 2026-03) | 20 presets, clones in 3 s | yes | **CC-BY-NC-4.0** (commercial only through the API) | 4 B | Out |
| Breeze TTS 2 (2026-03, secondary source) | yes | yes | **CC-BY-NC-4.0** | 3 B | Out |
| OmniVoice (k2-fsa, 2026-04) and its Arabic-dialect fine-tune *Lahgtna OmniVoice v2* (lists Iraqi on a roadmap) | attribute-controlled design | 600+ languages | weights **CC-BY-NC** (Emilia) | 0.6 B | Out. Watch Lahgtna for a commercially licensed release |
| Qwen-Audio-3.0-TTS (2026-07-20) | style prompts plus a preset library, 16 languages including Arabic | yes | **API only** (Alibaba Model Studio) | — | Not local |
| IndexTTS 2.5 | **no** design | yes (no Arabic text normaliser in `infer_v2_5.py`) | bilibili Model Use License | about 6 GB | Stays the line engine |

**Conclusion.** VoxCPM2 is the only open-weights engine found that designs voices, speaks Arabic and allows
commercial use. Its Arabic dialect behaviour is unknown, so a designed Arabic voice is **MSA-accented at best** until
tested. No local engine can design an Iraqi voice. On RTX 5090 VRAM, VoxCPM2 (about 8 GB) runs under the same GPU
lease as IndexTTS (about 6–8 GB) and Habibi (about 4–6 GB), one engine at a time, so no new pressure is added.

### 2.3 A designed seed as a clone reference: the rule

**Background.** The studio refuses to clone from generated audio. The fear is that synthetic audio could pass as a
person's recording, and that a feedback loop would degrade timbre (VOICE-STACK D6). "Design, then clone" is standard
upstream practice for consistent characters (Qwen3-TTS README). A designed voice belongs to nobody (MiniMax describes
designed voices the same way). The rule below allows that case and nothing else.

**Rule V-DESIGN (proposed for `docs/CONTRACTS-CHARACTER-VOICE.md` §1.4):**

1. **Definition.** A *designed studio voice* is audio produced by the studio's own `VOICE_DESIGN` job, from a text
   description only, with no audio input, by an engine whose licence allows commercial use. The job writes a
   `VoiceDesignRecord` holding: engine, engineVersion, description, text, seed, params, candidates, chosen index,
   **sha256 of the seed file**, jobId and createdAt.
2. **Clone-source eligibility.** A file may be a reference for IndexTTS, Habibi or a hosted clone **only** if its
   origin is one of these three:
   - (a) `UPLOAD_CONSENTED`: a real person, with a `ConsentRecord` whose scope covers that use.
   - (b) `LIBRARY_LICENSED` or `LIBRARY_COMMISSIONED`: a real person, with a licence or release record.
   - (c) `DESIGNED`: its sha256 matches a `VoiceDesignRecord` created by this studio.

   An upload is never `DESIGNED`, whatever the uploader claims. A file carrying the `vewbox-tts` / "not a voice
   reference" tag and no matching design record is refused (closes REVIEW #7).
3. **Generation depth 1.** Only the design seed may be cloned. Anything spoken *from* a voice (proof, preview,
   dialogue, take) stays `GENERATED` and is never a clone source. Re-designing creates a new design record and a new
   identity revision. This keeps the D6 feedback loop impossible.
4. **Descriptions describe attributes, not people.** Allowed: sex, age, pitch, pace, timbre, accent, mood and
   recording quality. Refused (`INVALID`, before any GPU work): a person's name, "sounds like / the voice of / imitate"
   followed by anyone, or a real role holder ("the current president…"). Checked by a deny-list plus the LLM's
   structured classifier, and the user ticks "this voice is not meant to resemble a real person".
5. **Labelling.** Everywhere the voice appears, the label reads "Studio-designed synthetic voice — not a real person".
   It is never called a "recording". Its WAV files carry the existing provenance tag plus `designId`. An exported film
   keeps the per-line provenance.
6. **Real people.** A voice of an identifiable real person is only ever (2a) or (2b). It is never named after the
   person in the UI, never used for a character who depicts that real person, and a request to make any voice
   "sound like" a named real person is refused regardless of source. Creative Commons licences do **not** license
   personality or publicity rights (CC BY 4.0 legal code §2(b)(1)), so a dataset licence alone is a weaker basis than
   a signed release. See §3.4 and the decisions in §6.
7. **Near-clone guard.** If a designed candidate's ECAPA cosine to any real-person voice in the library or uploads
   is ≥ 0.80, it is flagged and re-rolled. It should not accidentally reproduce a real speaker the studio holds.

This separates the two cases: a designed voice is a **labelled synthetic identity**, while a "fake recording of a real
person" (cloning someone without authorisation, or presenting synthetic audio as their recording) stays refused.

Disclosure context: EU AI Act Art. 50 transparency duties have applied since **2 August 2026**, with machine-readable
marking of synthetic audio. The Digital Omnibus grants systems already on the market a grace period to **2 December
2026** (Cooley, 2026-08-03; compliancehub.wiki). If films ship in the EU, add an inaudible watermark
(**AudioSeal**, MIT, code and weights) at export. That is the user's decision (§6).

### 2.4 Licensed speech for a curated library

| Source | Language / dialect | Speakers, quality | Licence and terms | Who must accept | Use in the library |
|---|---|---|---|---|---|
| **Omnilingual ASR Corpus**, config `acm_Arab` (Meta FAIR) | **Mesopotamian (Iraqi) Arabic**, spontaneous, with transcripts | Target was 10 h from about 10 native speakers; speakers were paid; no gender field; FLAC, sample rate not documented (measure). Habibi used **11.7 h of it** for IRQ | **CC-BY-4.0**; cite arXiv 2511.09690 | Nobody (open download); attribution required | **Best open Iraqi candidate.** Opt-in tier: real people whose consent covered ASR collection, not voice synthesis. 496 MB parquet |
| Iraqi Dialect TTS corpus (Kharrufa, Taha, Baraq, Zenodo 10.5281/zenodo.11170567, 2024-05) | 1 h custom-recorded Iraqi + 3.7 h MSA (the Arabic Speech Corpus); Iraqi letters گ ڤ پ چ ۆ ڵ ێ in transcripts | Speaker count and consent not documented | **CC-BY-4.0** | Nobody; attribution | Opt-in, after checking the paper for speaker details. 339.7 MB |
| Arabic Speech Corpus (Halabi) | MSA read by a Damascene-accented male | 1 speaker, professional studio, 48 kHz, orthographic, phonetic and diacritised text; speaker identity protected by agreement | **CC-BY-4.0**; must not try to identify the speaker | Nobody | MSA male option (opt-in) |
| ClArTTS (MBZUAI) | Classical Arabic (LibriVox audiobook) | 1 male, about 12 h, 40.1 kHz | **CC-BY-4.0** | Nobody | Classical/formal register only (opt-in). 3.2 GB |
| ArVoice (MBZUAI) | MSA, diacritised | Human subset = ASC; 4 synthetic voices (73.5 h); 6 professional speakers only under a signed DUA "for qualified researchers" | CC-BY-4.0 (open parts) | DUA requires the user personally, and research only | Not useful (open human part = ASC; synthetic part is another engine's output) |
| Habibi benchmark (`SWivid/Habibi`) and `assets/IRQ.wav` | IRQ 2.2 k utterances, "in-house" | Real speakers of unknown origin and consent | Apache-2.0 (most subsets) | — | **Engineering smoke tests only, never a character voice** (consent unknown) |
| Mozilla Common Voice 23.0 Arabic | mostly read MSA, crowd microphones | 1 654 speakers, 158 h (92 h validated), 3.24 GB | CC0, but **Mozilla Data Collective account plus terms (updated 2026-05-06)**: no re-identification; "synthetic data … or model outputs … do not contain personal data … and are clearly disclosed … as machine-generated" | **The user personally** (18+, or an authorised organisation representative); an agent cannot create the account or accept | **Do not use for voice prompts** (a cloned contributor voice is personal data). ASR evaluation only, if ever |
| MASC | multi-dialect including Iraqi (YouTube, 16 kHz) | crawled from more than 700 channels | mirrors disagree (HF metadata CC-BY-NC-4.0) | — | **Exclude** (no speaker consent, 16 kHz) |
| QASR / MGB-2 (Al Jazeera) | multi-dialect broadcast | 2 000 h, 16 kHz | **Academic/research licence**, form and approval | user personally | **Exclude** (research only) |
| SADA (Saudi) | Saudi | — | CC-BY-NC-SA | — | Exclude |
| **LibriTTS-R** | English | about 585 h, 24 kHz, restored; LibriVox volunteers | **CC-BY-4.0** | Nobody | EN opt-in tier. `dev_clean` 1.3 GB + `test_clean` 1.2 GB are enough to choose from |
| **VCTK 0.92** | English, about 110 accented speakers | 48 kHz, read | **CC-BY-4.0**; cite DOI 10.7488/ds/2645 | Nobody | EN accents (opt-in). 10.94 GB |
| Hi-Fi TTS | English, 10 speakers, 44.1 kHz | ≥17 h each | CC-BY-4.0 | Nobody | Too big (41 GB) for a library of a few voices |
| EARS, Expresso, Emilia | English, expressive | — | **CC-BY-NC** (Emilia-YODAS CC-BY, but YouTube) | — | Exclude |

Obligations for CC-BY sources:
- Give a TASL attribution: title, author, source URL, licence.
- State the changes made (trimmed, resampled, loudness-normalised).
- Keep the licence link.
- Show the attribution in the studio's credits page and in each export's credits file.

CC0 needs no attribution, but the studio keeps the record anyway. No CC-BY source needs any personal acceptance.
Mozilla Data Collective, ArVoice's DUA and QASR do, and those are excluded.

### 2.5 Iraqi Arabic

**Habibi-TTS IRQ** (arXiv 2601.13802 v2, 2026-03-31; repo and HF card):

- **Training data.** IRQ is **58.9 h in-house + 11.7 h Omnilingual ASR Corpus**.
- **Subjective results.** 10–20 paid native speakers rated each dialect–dimension pair. For IRQ: DMOS (dialect)
  **4.06**, SMOS 3.82, NMOS 3.83 for the specialised model. The unified model scores 4.21/3.82/4.18 but is
  **CC-BY-NC-SA**. ElevenLabs v3 scores 3.97/3.38/3.94.
- **Objective results.** The real Iraqi ground truth scores **WER-O 27.18**, SIM 0.790, UTMOS 2.42. The specialised
  model scores **WER-O 17.66**, SIM 0.763, UTMOS 2.63. Synthetic Iraqi is *easier* for ASR and *preferred* by UTMOS
  compared with real Iraqi speech. **This is direct evidence that ASR and MOS predictors cannot certify dialect
  authenticity.**
- **Reference guidance.** The README says "best use matched dialectal content", meaning the reference should be in the
  dialect. `dialect_id` applies to the unified model.
- **Licence.** Code is MIT. Specialised ALG/EGY/IRQ/MAR/MSA weights are **Apache-2.0**. Unified, SAU and UAE weights
  are CC-BY-NC-SA. Note: the HF repo's metadata tag says `cc-by-nc-sa-4.0` for the whole repo while the README grants
  Apache-2.0 to IRQ and MSA. Keep a dated copy of the README as evidence (§6).
- **What the README does not say.** It gives no guidance on diacritics, گ/چ or digits (verified on the raw README).
  `vocab.txt` contains گ چ پ ڤ and digits (VOICE-STACK D3).

**Other Iraqi-capable options:**
- **Azure Neural TTS** `ar-IQ-BasselNeural` (M) and `ar-IQ-RanaNeural` (F): hosted, two fixed voices, SSML.
- ElevenLabs v3: hosted.
- Lahgtna: NC base, see §2.2.
- Fanar Aura (QCRI): hosted, dialect support not documented.
- MiniMax: no dialect control.

None replaces Habibi locally. Azure is the only hosted catalogue with Iraqi-labelled voices. It would be a new provider,
so it is listed as optional in §6.

**Text normalisation for Habibi** (worker side, before `/synthesize`; the script is never rewritten):
- **Keep** گ چ پ ڤ as written (`skills/iraqi-dialogue` already requires them). Never map them to ق/ج/ك for synthesis;
  the fold is for *evaluation* only.
- **Expand digits to Iraqi words** (اثنعش، خمسطعش، ميتين, times, prices, years) from a table. That table is the
  inverse of `IRAQI_NUMBERS` in `speech.ts`. How Habibi pronounces digits is untested.
- **No automatic diacritisation.** MSA diacritisers add case endings (iʿrāb) and push toward MSA. Hand diacritics on
  one ambiguous word is an A/B item, not a default.
- Remove tatweel and Quranic marks; NFC; keep `؟ ، .` for prosody; spell Latin acronyms in Arabic letters, or route
  the line to IndexTTS with the labelled fallback (existing rule).
- IndexTTS Arabic (MSA) has **no Arabic normaliser** in `infer_v2_5.py` (branches only for zh/en/ja/es). The worker
  must expand digits and abbreviations to MSA words itself.

### 2.6 Engine controls worth exposing

| Engine | Expose to the user | Keep internal or pinned | Notes (source) |
|---|---|---|---|
| IndexTTS 2.5 | **Delivery** preset = the 8-dim `emo_vector` [happy, angry, sad, afraid, disgusted, melancholic, surprised, calm] (existing map in `app.py`); **intensity** subtle/normal/strong = `emo_alpha` 0.35/0.55/0.75; **pace** = `duration_factor` 0.5–2 (studio speed 0.9/1.0/1.12 plus a ±10 % per-line nudge); **another take** = seed+k | seed per identity; `use_random=False` (README: random sampling "reduces the voice cloning fidelity"); `do_sample, top_p 0.8, top_k 30, temperature 0.8, num_beams 3, repetition_penalty 10, max_mel_tokens 1500`; `interval_silence 200`; `max_text_tokens_per_segment 120` | README recommends `emo_alpha` "around 0.6 (or lower)". The studio pins 1.0 (`voice.ts:220`), which should change to 0.6 and be checked with ECAPA. Backlog: `emo_audio_prompt` (a separate emotion reference clip) and `emo_text` (Qwen emotion model, off today). CMU-phoneme overrides for English names (a per-production lexicon). Reference capped at 15 s. Output 22.05 kHz. |
| Habibi IRQ | **pace** (`speed`); **another take** (seed); **delivery** = choose the reference's *emotion variant* (only if the library voice has one) | `nfe_step` 32, `cfg_strength` 2.0, `sway` −1 until the Phase-2 A/B; `dialect_id` None vs IRQ is an A/B | F5 has no emotion input; emotion comes only from the reference (VOICE-STACK D9). |
| VoxCPM2 (design) | the description fields (profile-driven, editable); 3 candidates | `cfg_value` 2.0, `inference_timesteps` 10 (docs examples); seed recorded | 48 kHz output: resample the seed to 24 kHz mono for the line engines. |
| MiniMax | pace (`speed`), `pitch` ±12, `emotion` (9), `vol` | `voice_modify` (advanced) | Hosted only. |

### 2.7 Preview UX facts (what a person must hear before choosing)

Industry practice is to generate several previews from one description, the user picks one, and that one becomes the
voice. ElevenLabs takes preview text of 100–1 000 characters; MiniMax caps `preview_text` at 500 characters and
returns `trial_audio`. For the studio:

1. **The same text for every candidate**, so candidates can be compared. Use 3 fixed sentences per language: a 10–15
   s neutral paragraph (≥ 100 chars), a question for intonation, and one emotional line. Add **the character's own
   first line** from the script when one exists.
2. **Heard through the line engine.** A designed voice is previewed as *IndexTTS or Habibi speaking with the design
   seed as reference*, because that is what the film will sound like. The raw design seed is a secondary "source
   sample" button. A voice that sounds good in VoxCPM2 but loses its timbre through the clone hop must be visible
   before choosing.
3. **Matched loudness** (−20 LUFS) so the louder candidate does not win by default.
4. **In the character's language and dialect.** Iraqi candidates speak Iraqi lines; never an English demo for an
   Iraqi character.
5. **Labels on each card:**
   - origin: designed synthetic / licensed dataset voice / commissioned actor / your recording / MiniMax catalogue;
   - the line engine;
   - the dialect status ("Iraqi — verified by 3 Baghdadi listeners on <date>" or "dialect not yet verified");
   - attribution, for licensed voices.
6. **Cast check:** play the candidate next to the other cast members' voices. Show the measured warning "sounds close
   to <name> (cosine 0.81)".
7. **Another take** (seed+1), pace 0.9/1.0/1.1, and delivery presets (IndexTTS only), each clearly a preview.
   Previews are `GENERATED` assets and never clone sources.

---

## 3. Recommended architecture

### 3.1 Voice origins (one field, fixed meaning)

| `origin` | Real person? | Rights basis | Clone source? | Shown as |
|---|---|---|---|---|
| `UPLOAD_CONSENTED` | yes | `ConsentRecord` (scope includes `CLONE_LOCAL`; `CLONE_HOSTED_MINIMAX` for hosted) | yes | "Your recording of <label>" |
| `LIBRARY_COMMISSIONED` | yes | signed release covering synthetic voice, commercial use, languages, term | yes | "Studio voice (commissioned actor)" |
| `LIBRARY_LICENSED` | yes | CC0 or CC-BY record + attribution | yes, if the user enables the dataset tier (§6) | "Studio voice (licensed: <dataset>, CC-BY)" |
| `DESIGNED` | **no** | `VoiceDesignRecord` (Rule V-DESIGN) | yes, the seed only | "Studio-designed synthetic voice — not a real person" |
| `HOSTED_SYSTEM`, `HOSTED_DESIGNED`, `HOSTED_CLONE` | system/design: no; clone: yes | provider terms (+ consent for clone) | n/a (provider holds it) | "MiniMax …" |
| `GENERATED` (proof, preview, line) | — | — | **never** | "Generated line" |

### 3.2 Per-language matrix (exact engines; every substitution is labelled, none is hidden)

| | **English** | **Arabic — MSA** | **Arabic — Iraqi (Baghdadi)** |
|---|---|---|---|
| Line engine | IndexTTS 2.5 | IndexTTS 2.5 (A/B challengers: Habibi **MSA** specialised, Apache, 1.35 GB; VoxCPM2 clone) | **Habibi-TTS IRQ** specialised |
| Mixed-script line | — | IndexTTS (same engine) | IndexTTS, job event "fallback: mixed script" (existing `routeLine`) |
| **AUTOMATIC: select** | APPROVED EN library voice matching the profile (§3.3) | APPROVED MSA library voice | APPROVED **Iraqi** library voice (real authorised Iraqi recording, listener-approved) |
| **AUTOMATIC: create** | VoxCPM2 design → best of 3 → seed → IndexTTS | VoxCPM2 Arabic design → seed → IndexTTS; identity `REVIEW` and badge "MSA design engine not yet listener-verified" until §5.2 passes once for the engine | **None by default.** Refuse with `MISSING_LIBRARY_VOICE`: "No approved Iraqi studio voice fits <name>. Upload an authorised Iraqi recording or add Iraqi voices to the library." Never an MSA voice in its place. Opt-in experiment `allowDesignedIraqi`: VoxCPM2 Arabic seed → Habibi IRQ, `dialectStatus: UNVERIFIED`, `REVIEW` until a listener pass |
| **MANUAL: local** | library picker + "Design a voice" (description → 3 previews → choose) | same | library picker (Iraqi voices only); design only under the experiment flag, labelled |
| **MANUAL: hosted** | MiniMax 45 English system voices; Voice Design | `Arabic_CalmWoman`, `Arabic_FriendlyGuy` ("dialect not stated"); Voice Design | nothing offered as Iraqi |
| **REFERENCE: local** | consented upload → IndexTTS | consented upload → IndexTTS | consented **Iraqi** upload → Habibi; English clip refused (`WRONG_LANGUAGE`, existing) |
| **REFERENCE: hosted** | MiniMax clone of the original upload (10 s–5 min) | same, `language_boost: Arabic` | same; `dialectStatus: UNVERIFIED` until listening |
| Missing component | design engine not installed → `NOT_CONFIGURED` ("automatic voice creation needs the voice-design engine") | same | no library voice → `MISSING_LIBRARY_VOICE` |

### 3.3 Automatic voice: selection, then creation

**Input:** the character's language, dialect, sex, ageYears, voice.{pitch, pace, timbre, notes}, personality, and the
cast of its productions and shows.

1. **Filter** the library: `status = APPROVED`; same language and dialect (Iraqi only matches Iraqi); same sex (hard
   filter); origin allowed by the studio's settings (dataset tier on or off). Exclude voices already pinned by another
   character in the same production or show (hard filter); voices used in other shows are allowed with a warning.
2. **Score:**
   - age-band distance (CHILD < 13, YOUNG 13–29, ADULT 30–54, OLDER 55+);
   - pitch-band match, measured by the library voice's F0 median. Provisional bands: male LOW < 100 Hz, HIGH > 140;
     female LOW < 175, HIGH > 225; calibrate on the library;
   - pace match (syllables/s);
   - timbre-tag overlap (the LLM maps free-text timbre to the fixed tag set warm, bright, deep, husky, nasal, breathy,
     crisp, gravelly);
   - **distinctness** from the cast: ECAPA cosine to every other cast reference ≤ 0.75.
3. **Pick** the best score above a threshold. The job result says *why* ("female, ADULT, MID pitch, warm; distinct from
   Ali 0.52").
4. **Otherwise create** (EN, MSA) with `VOICE_DESIGN`:
   - description = deterministic template from the profile + LLM polish + Rule V-DESIGN check;
   - generate 3 candidates (seeds s, s+1, s+2) on the calibration paragraph;
   - gate each candidate: CER ≤ 0.10 for EN or ≤ 0.15 for AR (folded), LUFS −26…−14, TP ≤ −1 dBTP, 0 clipped
     samples, F0 band matches the requested sex and pitch;
   - re-speak the 3 preview sentences **through the line engine**, using the candidate as reference;
   - rank by ECAPA(seed, line-engine rendering) ≥ 0.75 (the voice survives the clone hop), distinctness, then
     UTMOSv2 (EN only, advisory);
   - store the winner as a `DESIGNED` asset with its record, then run the normal `VOICE_BUILD` proof.

   Iraqi: refuse unless the experiment flag is on.
5. The **identity is pinned** with origin, library or design id, the reference sha256, params and the evaluation
   summary. A later library change never alters a pinned identity: library voices are immutable, a correction is a
   new voice, and RETIRED voices stay readable.

### 3.4 The studio voice library

**How many (first release).**

| Language | Voices | Grid |
|---|---|---|
| EN | 12 | 2 sexes × 3 age bands (YOUNG, ADULT, OLDER) × 2 timbres. **Designed by default**; the LibriTTS-R/VCTK tier is optional |
| AR-MSA | 8 | 2 sexes × 2 age bands × 2 timbres. Designed (after the MSA listening gate) + ASC male + ClArTTS male (optional) |
| AR-Iraqi | 8 | 2 sexes × 2 age bands × 2 timbres. **Commissioned Baghdadi actors (recommended)** or Omnilingual `acm_Arab` + Kharrufa (opt-in). Each needs listener approval. Commissioned voices also record **emotion variants** (neutral, angry, sad, happy, afraid, tired), because that is Habibi's only route to emotional delivery |

No children's voices come from datasets or uploads of minors. Child characters get designed voices only, labelled.

**How each library voice is chosen:**
- **Clean:** SNR ≥ 30 dB (stricter than the upload gate's 20 dB), no reverb tail, 0 clipped samples, ≥ 24 kHz source
  preferred. 16 kHz is accepted only for Iraqi when nothing better exists, and marked.
- **One speaker,** confirmed by ECAPA windows ≥ 0.6.
- **6–12 s of continuous speech,** with a verified transcript.
- **Pairwise ECAPA ≤ 0.75** to every other library voice of the same language and sex, so the grid is genuinely
  varied.
- **Sex and age band:** confirmed by a listener (never inferred by a model for the record).

**Storage:**
- **Files.** `var/library/voices/<voiceId>/` holds:
  - `original.<ext>` (the exact source segment),
  - `window.wav` (24 kHz mono, static gain to −20 LUFS),
  - `emotions/*.wav` (optional),
  - `previews/<sentenceId>.<engine>.wav`,
  - `voice.json` (the `LibraryVoice` record, §4).
- **Database.** A `library_voices` table mirrors `voice.json`.
- **Repository.** Commit only a manifest (`docker/voices/manifest.json`: source URL, item id, sha256, licence) so the
  library can be rebuilt by a fetch script. **Never commit the audio.**
- **Credits.** Generated from the CC-BY records: a studio credits page plus `credits.txt` in every export that uses
  such a voice, for example: *"Voice derived from 'Omnilingual ASR Corpus' (Meta FAIR), speaker 0007, CC BY 4.0,
  https://huggingface.co/datasets/facebook/omnilingual-asr-corpus — trimmed, resampled, loudness-normalised."*

### 3.5 New pieces (for the architect; no code here)

- **Service `tts-design`** (VoxCPM2) on :8022, with the same contract style as `docker/tts/app.py`: `/design`
  (description, text, seed, n) → WAVs + headers; `/health`; `/unload`. It sits in the `TTS` GPU lease and returns
  `x-engine-version`.
- **Jobs:**
  - `VOICE_DESIGN` (GPU): candidates + record.
  - `VOICE_LIBRARY_IMPORT` (CPU + ASR): ingest a dataset item or a commissioned session, validate, window, measure,
    embed, render previews.
  - `VOICE_EVAL` (GPU ASR + CPU): §5.1 on an identity or library voice.
- **`VOICE_BUILD` payload modes:**
  - `AUTOMATIC` (select, then create);
  - `LIBRARY {libraryVoiceId}`;
  - `DESIGN {designId}` (manual design result);
  - `REFERENCE {referenceSampleId}` (requires `consentId`);
  - `MANUAL {provider: MINIMAX, providerVoiceId}`;
  - `HOSTED_DESIGN {description}`;
  - `HOSTED_CLONE {referenceSampleId}` (requires consent scope `CLONE_HOSTED_MINIMAX`; sends the original file).
- **Endpoints:** `GET /api/voices?language&dialect&sex&ageBand` (library + previews); `POST /api/voices/design`
  (manual design, returns a job); `POST /api/consents` (consent record + optional signed-release asset).
- **Failure classes:**
  - `NOT_CONFIGURED`: no design engine or MiniMax key.
  - `MISSING_LIBRARY_VOICE`: new; Iraqi automatic with no approved voice.
  - `CONSENT_REQUIRED`: new; an upload without a consent record, or a hosted clone without the hosted scope.
  - `MISSING_REFERENCE`: existing.

---

## 4. Identity record changes (append-only to `src/domain/types.ts`)

```ts
export type VoiceOrigin =
  | 'UPLOAD_CONSENTED' | 'LIBRARY_COMMISSIONED' | 'LIBRARY_LICENSED' | 'DESIGNED'
  | 'HOSTED_SYSTEM' | 'HOSTED_DESIGNED' | 'HOSTED_CLONE';

export interface ConsentRecord {
  id: string;
  speakerRef: string;            // private label, never shown on a character
  rightsHolder: string; authorisedBy: string; signedAt: string; revokedAt?: string;
  scope: Array<'CLONE_LOCAL' | 'CLONE_HOSTED_MINIMAX' | 'COMMERCIAL' | 'LANG_EN' | 'LANG_AR'>;
  evidenceAssetId?: string;      // the signed release (PDF/image), stored in the library
}

export interface VoiceRights {
  basis: 'CONSENT' | 'RELEASE' | 'LICENCE' | 'SYNTHETIC_DESIGN' | 'PROVIDER_TERMS';
  realPerson: boolean;
  consentId?: string;
  licence?: 'CC0-1.0' | 'CC-BY-4.0' | 'PUBLIC-DOMAIN';
  attribution?: string;          // TASL line for credits
  source?: { dataset: string; url: string; item: string; retrievedAt: string; sha256: string };
}

export interface VoiceDesignRecord {
  id: string; engine: 'voxcpm2' | 'minimax-voice-design'; engineVersion: string;
  description: string; language: Language; text: string; seed: number;
  params: { cfg?: number; steps?: number };
  candidates: Array<{ assetId: string; seed: number; sha256: string; metrics: VoiceObjective }>;
  chosen: number; sha256: string; jobId: string; createdAt: string;
}

export interface VoiceObjective {
  asrModel: string; lines: number; cerMedian: number; coverageMin: number;
  lufs: [number, number]; truePeakMax: number; clippedSamples: number;
  durationCv: number; ecapaToRef: { min: number; mean: number }; ecapaBetweenSeeds: { min: number };
  f0MedianHz: number; f0DriftPct: number; utmos?: number /* English only, advisory */;
}

export interface VoiceListening {
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'INCONCLUSIVE';
  panel: Array<{ raterId: string; profile: { dialect: string; ageBand: string; sex: Sex } }>;
  dmosMedian?: number; nmosMedian?: number; smosMedian?: number; clarityMedian?: number;
  flaggedWords?: string[]; krippendorffAlpha?: number; sheetAssetId: string; at: string;
}

export interface LibraryVoice {
  id: string; label: string;
  origin: 'LIBRARY_COMMISSIONED' | 'LIBRARY_LICENSED' | 'DESIGNED';
  language: Language; dialect?: Dialect; sex: Sex;
  ageBand: 'CHILD' | 'YOUNG' | 'ADULT' | 'OLDER'; pitchBand: 'LOW' | 'MID' | 'HIGH'; paceBand: 'SLOW' | 'MEASURED' | 'QUICK';
  timbreTags: string[];
  reference: { assetId: string; windowAssetId: string; window: { from: number; to: number }; text: string; sha256: string; sampleRate: number; lufs: number; truePeakDbtp: number; snrDb: number };
  emotionVariants?: Partial<Record<'neutral' | 'angry' | 'sad' | 'happy' | 'afraid' | 'tired', { assetId: string; text: string; sha256: string }>>;
  rights: VoiceRights; designId?: string;
  previews: Record<string, { assetId: string; engine: string }>;
  embedding?: number[];          // ECAPA 192-d of the window
  evaluation: { objective?: VoiceObjective; listening?: VoiceListening };
  status: 'CANDIDATE' | 'APPROVED' | 'RETIRED';
}

// VoiceIdentity gains (all optional for old rows; setVoiceIdentity requires origin + rights for new ones):
//   origin: VoiceOrigin;
//   libraryVoiceId?: string; designId?: string; consentId?: string;
//   referenceSha256?: string;                      // the exact window the engine hears
//   rights: VoiceRights;                           // snapshot at pin time, immutable for this revision
//   label: 'REAL_PERSON' | 'SYNTHETIC';
//   params: { speed; emotionAlpha /* default 0.6 */; seed; nfe?; cfg?; sway?; emotionPreset? };
//   evaluation?: { objective?: VoiceObjective; listening?: VoiceListening };
//   dialectStatus?: 'NOT_APPLICABLE' | 'UNVERIFIED' | 'LISTENER_APPROVED' | 'LISTENER_REJECTED';
//   distinctness?: Array<{ characterId: string; cosine: number }>;
//   hosted?: { provider: 'MINIMAX'; voiceId: string; voiceType: 'system_voice' | 'voice_generation' | 'voice_cloning';
//              model: string; createdAt: string; firstUsedAt?: string;
//              recreateFrom?: { designId?: string; referenceAssetId?: string } };
```

**Rules:**
- `isCloneSource` accepts only the origins in §3.1 that are marked "yes", and for `DESIGNED` checks the sha256
  against the record.
- `setVoiceIdentity` refuses `UPLOAD_CONSENTED` without a live (unrevoked) consent whose scope matches the provider.
- Revoking a consent marks dependent identities `STALE`. A used character is then `VOICE_LOCKED` with the reason
  "consent revoked: re-voice or remove", and the user decides.
- An Iraqi identity may be `ACTIVE` for drafting with `dialectStatus: UNVERIFIED`. The **export preflight warns, or
  blocks (see §6)**, until it is `LISTENER_APPROVED`.

---

## 5. Evaluation protocol

### 5.1 Objective (automatic; reported on every identity and library voice; gates marked)

**Material:** 6 standard lines per language (neutral, long 10–15 s, question, emotional, numbers/names, the 5 Iraqi
consistency words for Iraqi), each × 3 seeds, plus the proof line. The existing per-line gates stay as they are.

| Measure | Tool | Gate / report |
|---|---|---|
| Intelligibility | faster-whisper large-v3 (current), language forced; CER and coverage after `normalizeIraqi`/`normalizeLatin` | **Gate:** CER ≤ 0.15 and coverage ≥ 0.85 (line), ≥ 0.70 (take): the contract's `verdict()`, with REVIEW-WAVE2 #4 applied. Raw WER reported. Second opinion for Arabic: `oddadmix/whisper-large-v3-arabic-dialectal-v2` (Apache-2.0; Iraqi WER 0.254, CER 0.068 on real speech), reported side by side and **never** used as dialect proof |
| Language ID | ASR `language_probability` | report |
| Loudness | ffmpeg loudnorm pass 1 / ebur128 | **Gate:** −23…−16 LUFS integrated, TP ≤ −1 dBTP |
| Clipping | full-scale samples + astats flat factor | **Gate:** 0 |
| Duration stability | `x-duration` across 3 seeds per line; syllables/s vs the reference | **Gate:** CV ≤ 0.12; rate within ±25 % of the reference. Flag a lost opening (first two words missing in ASR word timings, the VOICE-STACK D2 failure) |
| Internal silence | silencedetect −35 dB | flag a pause > 1.2 s not in the script |
| Speaker similarity | speechbrain ECAPA (Apache-2.0, 89 MB, CPU) | **Gate (provisional):** line↔reference ≥ 0.70, seed↔seed ≥ 0.80, cast distinctness ≤ 0.75. **Calibrate first:** compute the same-speaker cosine distribution on the approved real Iraqi references and set the gate at their 5th percentile. VoxCeleb is not Arabic-tuned (VOICE-STACK) |
| Pitch | F0 median and IQR (pyin / parselmouth) | F0 drift ≤ 15 % between lines; flag IQR < 2 semitones (monotone) |
| Naturalness proxy | UTMOSv2 (MIT, English-trained) | **EN advisory only.** For Arabic it is reported with "uncalibrated"; Habibi's real Iraqi scores *lower* (2.42) than its synthetic (2.63) |
| Provenance | WAV tags, sha256, design/consent record | **Gate:** Rule V-DESIGN §2 |

### 5.2 Human listening (decides dialect, naturalness and voice identity)

**Who must listen:**
- **Iraqi:** at least **3 native Baghdadi speakers**: born or raised in Baghdad, speaking the dialect daily, at least
  one woman and one man, at least two age bands. They must not be the voice actor, the scriptwriter, or anyone who
  chose the voice. The studio owner counts as one rater only if a native Baghdadi speaker. The Habibi authors used
  10–20 paid native raters per dialect and dimension; 3 is the minimum for a studio decision, and 5 is better.
- **MSA:** ≥ 2 educated Arabic speakers who judge Fusha (any home dialect).
- **English:** ≥ 2 fluent listeners.

**Setup:**
- Headphones in a quiet room; loudness-matched; randomised order.
- **Blind:** file names are random ids, and engine and source are hidden. This fixes the current sheet, which names
  the engine; see the Phase-2 plan §5.
- Sessions of 20 minutes or less.

**Controls:**
- A **hidden real Iraqi recording** of the same kind of line (upper anchor). A rater who scores it below 4 on dialect
  is excluded.
- An **MSA rendering** of the same line by IndexTTS (lower dialect anchor). A rater who scores it 4 or more is
  excluded.
- 10 % repeated items, to measure each rater's consistency.

**Scales (1–5, with anchored descriptions on the sheet):**

| Scale | 1 | 3 | 5 |
|---|---|---|---|
| **Dialect authenticity** | not Iraqi | understandable but off, or mixed with MSA | "a Baghdadi speaker would say it like this" |
| **Pronunciation** | — | — | — |
| **Naturalness** | robotic, with artefacts | — | a person |
| **Clarity** | — | — | — |
| **Same voice as the reference** | — | — | — |
| **Emotion fits the direction** | — | — | — |

Pronunciation is a word-level flag list plus a target-sound checklist: گ /g/; چ /tʃ/; ق realised as /g/ where
Baghdadi does; ك → چ in the words the script spells so; emphatics; vowel length; Iraqi numerals. Same-voice and
emotion fit are rated on emotional lines and across lines. Every scale also takes a free note.

**Acceptance for a pinned Iraqi voice or an approved Iraqi library voice:**
- dialect-authenticity median ≥ 4, with **≥ 80 % of lines** rated ≥ 4 by a majority of raters;
- same-voice median ≥ 4;
- no target word flagged by ≥ 2 raters;
- Krippendorff's α (ordinal) reported. If α < 0.4 the result is `INCONCLUSIVE`, so add raters.

The design engine's MSA gate is the same with MSA raters and "Fusha as a news reader speaks it" as the top anchor.

**Record:** `listen.csv` (rater pseudonym, profile, item id, scores, flags, note) is stored as an asset and summarised
into `evaluation.listening`.

**Claim policy (UI, reports, QA):**
- "Iraqi Arabic — verified by N native Baghdadi listeners on <date>" appears **only** after a `PASSED` sheet.
- Otherwise the label reads "Iraqi dialect not yet verified by a native listener".
- Successful synthesis, a PASS verdict from ASR, low CER, high UTMOS or high ECAPA **never** produce a dialect claim.
  The reason is spelled out by Habibi's own numbers: real Iraqi speech scores WER-O 27 % and the synthetic 18 %.

---

## 6. Decisions needed from the user

| # | Decision | Detail (size / licence / cost) | Recommendation |
|---|---|---|---|
| 1 | **Download the voice-design engine** | VoxCPM2 4.96 GB (Apache-2.0), plus a container image (reuse the tts CUDA base). About 17 min at the machine's ~5 MB/s; pause the model fetcher during the build | **Yes**: it is what makes automatic EN (and later MSA) voices possible |
| 2 | Download the evaluation models | ECAPA 89 MB (Apache-2.0): yes. Whisper dialectal v2 about 6.2 GB F32 download, about 3.1 GB as CTranslate2 fp16 (Apache-2.0): yes, after #1. UTMOSv2 (MIT): optional | ECAPA now; dialectal Whisper next |
| 3 | **Commission Iraqi voice actors** | 2 F + 2 M Baghdadi (later 2 older). Each records 60 s neutral conversation + 15 s × 6 emotions + an Iraqi phonetically rich script, 48 kHz, with a **signed release** naming synthetic-voice creation, commercial use, languages, term, revocation and hosted-processing (MiniMax) yes or no | **Yes**: the only route to authentic, emotionally capable Iraqi automatic voices without dataset-consent doubts |
| 4 | **Allow real-person dataset voices?** (opt-in tier) | Iraqi: Omnilingual `acm_Arab` 496 MB + Kharrufa 339.7 MB. MSA: ASC + ClArTTS 3.2 GB. EN: LibriTTS-R dev/test 2.5 GB, VCTK 10.94 GB. All CC-BY-4.0: attribution required, no personal acceptance needed; CC does not license personality rights | Iraqi: **yes, as a stopgap until #3**, labelled, attributed, listener-gated. EN/MSA: designed voices first; the dataset tier is optional |
| 5 | Exclusions to confirm | Common Voice (needs **your personal** Mozilla Data Collective account and terms; outputs must not contain personal data), MASC, QASR (research licence), ArVoice DUA, SADA, NC models (Voxtral, Breeze 2, OmniVoice/Lahgtna, Fish, XTTS, Habibi unified) | Confirm exclusion |
| 6 | **Approve Rule V-DESIGN** (§2.3) | Lets a designed seed become an IndexTTS/Habibi reference under a record, at depth 1, labelled | Approve |
| 7 | Iraqi designed-voice experiment | VoxCPM2 Arabic seed → Habibi IRQ; goes against Habibi's "matched dialectal content" advice | Off by default; run once as an A/B with listeners |
| 8 | **MiniMax API key** | Hosted catalogue (2 Arabic, 45 EN voices), Design $3/voice, Clone $1.50/voice, T2A $100/M chars (hd) or $60 (turbo); unused voices deleted after 7 days | Optional; the local path does not depend on it |
| 9 | **Native listener panel** | ≥ 3 Baghdadi raters (+ 2 MSA, 2 EN), about 20 min per voice batch | Required before any "Iraqi" claim |
| 10 | Iraqi export gate | Warn vs **block** export while `dialectStatus ≠ LISTENER_APPROVED` | Block "release" exports, allow drafts |
| 11 | Watermark at export | AudioSeal (MIT) if films are distributed in the EU (Art. 50 since 2026-08-02; grace to 2026-12-02 for systems already on the market) | Decide by distribution plan |
| 12 | Habibi licence evidence | HF repo tag says CC-BY-NC-SA; the README grants Apache-2.0 to IRQ/MSA | Archive a dated README copy; optionally ask the authors to fix the tag |
| 13 | Azure Iraqi voices (optional new provider) | `ar-IQ-BasselNeural`, `ar-IQ-RanaNeural`; hosted; needs a key | Not now; reconsider only if #3 and #4 both fail |

---

## 7. Open points and what was not verified

- **UNVERIFIED:**
  - MiniMax designed-voice 7-day expiry (secondary sources only);
  - MiniMax's consent clauses (the terms page did not render);
  - the Omnilingual corpus sample rate and per-speaker gender (measure after download);
  - Kharrufa corpus speaker count and consent;
  - VoxCPM2's Arabic accent and whether a designed timbre survives the IndexTTS/Habibi clone hop (the first GPU
    test after #1);
  - whether IndexTTS's `lang_to_token` covers `ar` in the shipped `infer_v2_5.py` (the studio's suite did produce
    Arabic through it; check inside the container during Phase 2).
- **Not measured:** no audio was generated for this report. All quality statements about engines come from their
  authors' papers and model cards (dated above). No listening test has been run.
- **Interacts with:** REVIEW-WAVE2 #4 (CER gate), #7 (synthetic tag), #9 (one measurement stack), #11 (hosted clone
  window), #15 ("Studio voice" option, which this design makes real), #17 (Habibi ASR-outage path). These should land
  before the library, because the library relies on the same gates.

## Sources (fetched 2026-10-02/03)

MiniMax: platform.minimax.io/docs/api-reference/speech-t2a-http · /docs/guides/speech-voice-clone ·
/docs/api-reference/voice-cloning-clone.md · /docs/api-reference/voice-design-design.md · /docs/faq/system-voice-id ·
/docs/guides/pricing-paygo.md · /docs/guides/rate-limits.md · /docs/api-reference/voice-management-get.md ·
minimax.io/audio/text-to-speech/arabic · blogs.novita.ai/minimax-voice-design-api-on-novita-ai (7-day rule, secondary).
Design engines: github.com/OpenBMB/VoxCPM · huggingface.co/openbmb/VoxCPM2 (+ files tree) ·
voxcpm.readthedocs.io/en/latest/models/voxcpm2.html · huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign ·
github.com/QwenLM/Qwen3-TTS · github.com/OpenMOSS/MOSS-TTS · huggingface.co/OpenMOSS-Team/MOSS-VoiceGenerator ·
huggingface.co/maya-research/maya1 · huggingface.co/parler-tts/parler-tts-large-v1 · huggingface.co/ResembleAI/chatterbox ·
huggingface.co/mistralai/voxtral-4b-tts-2603 (+ siliconangle.com 2026-03-26) · mindstudio.ai/blog/breeze-tts-2-open-weight-release ·
huggingface.co/k2-fsa/OmniVoice · huggingface.co/oddadmix/lahgtna-omnivoice-v2 · tongyilab.substack.com (Qwen-Audio-3.0-TTS) ·
huggingface.co/silma-ai/silma-tts.
Line engines: github.com/index-tts/index-tts (README, indextts/infer_v2_5.py) · huggingface.co/IndexTeam/IndexTTS-2.5 ·
github.com/SWivid/Habibi-TTS (README, src/habibi_tts/assets) · huggingface.co/SWivid/Habibi-TTS (Specialized/IRQ, /MSA trees) ·
arxiv.org/html/2601.13802v2 (Tables 1, 4, 5) · huggingface.co/datasets/SWivid/Habibi.
Data: huggingface.co/datasets/facebook/omnilingual-asr-corpus (README, data/acm_Arab) · arxiv.org/html/2511.09690 ·
github.com/hayderkharrufa/iraqi-dialect-tts-corpus · zenodo.org/records/11170567 · huggingface.co/datasets/halabi2016/arabic_speech_corpus ·
huggingface.co/datasets/MBZUAI/ClArTTS · huggingface.co/datasets/MBZUAI/ArVoice · huggingface.co/datasets/abdusah/masc ·
huggingface.co/datasets/QCRI/mgb2 + arxiv.org/abs/2106.13000 (QASR licence) · mozilladatacollective.com/terms (2026-05-06) ·
datacollective.mozillafoundation.org (Common Voice 23.0 Arabic) · openslr.org/141 (LibriTTS-R) · openslr.org/109 (Hi-Fi TTS) ·
datashare.ed.ac.uk/handle/10283/3443 (VCTK 0.92) · creativecommons.org/licenses/by/4.0/legalcode §2(b)(1).
Evaluation: huggingface.co/oddadmix/whisper-large-v3-arabic-dialectal-v2 · huggingface.co/speechbrain/spkrec-ecapa-voxceleb ·
github.com/sarulab-speech/UTMOSv2 · github.com/facebookresearch/audioseal.
Hosted Iraqi: json2video.com/ai-voices/azure/voices/ar-iq-basselneural, …/ar-iq-rananeural.
Regulation: cooley.com/news/insight/2026/2026-08-03-eu-ai-act-transparency-obligations-take-effect-2-august-2026 ·
compliancehub.wiki/eu-ai-act-article-50-transparency-digital-omnibus-2026.
UX: elevenlabs.io/docs/eleven-api/guides/how-to/voices/voice-design · MiniMax voice-design reference (above).
