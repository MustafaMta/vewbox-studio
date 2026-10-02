# Decisions needed from the producer

Collected from the phased rebuild (2026-10-03). Each item names what it unblocks and what the studio does until you
decide. Nothing here is assumed approved unless marked **Proceeding**.

## Voice identity (source: `docs/research/VOICE-IDENTITY-V2.md` §6)

| # | Decision | What it unblocks | Until you decide |
|---|---|---|---|
| V1 | Voice-design engine VoxCPM2 (Apache-2.0, 4.96 GB) + ECAPA speaker embeddings (Apache-2.0, 89 MB) | Automatic English (and later MSA) voices without a recording; speaker-similarity checks | **Proceeding**: the Phase 4 directive asks to evaluate engines and build automatic voice creation; downloaded into the model volume for evaluation, removable |
| V2 | Rule V-DESIGN: a studio-designed synthetic voice (text description only, no audio input) may be the clone reference for IndexTTS/Habibi, at depth 1, always labelled "Studio-designed synthetic voice — not a real person"; descriptions naming or imitating real people are refused | Designed voices becoming a character's persistent identity | **Proceeding with the strict version**; you can revoke it, and designed identities would then be marked for rebuild |
| V3 | Commission Iraqi (Baghdadi) voice actors — 2 female, 2 male, neutral + 6 emotions, signed release covering synthetic voice | Authentic automatic Iraqi voices with emotional range | Iraqi automatic voice refuses with a clear message; Iraqi voices come only from your authorised uploads |
| V4 | Allow real-person dataset voices (CC-BY 4.0; consent originally for speech recognition) as a labelled stopgap — Iraqi: Omnilingual `acm_Arab` 496 MB, Kharrufa 340 MB | A stopgap Iraqi library | Not used |
| V5 | Confirm exclusions: Common Voice (needs your personal Mozilla account), MASC, QASR, ArVoice, SADA, non-commercial models | — | Excluded |
| V6 | Iraqi designed-voice experiment (VoxCPM2 Arabic seed → Habibi IRQ), listener-gated A/B | Possibly designed Iraqi voices | Off |
| V7 | MiniMax API key (optional) | Hosted voices, design, clone; MiniMax video via API | Hosted paths report "not configured", never a silent local substitute |
| V8 | Native listener panel (≥ 3 Baghdadi raters) | Any claim that a voice sounds authentically Iraqi | Iraqi voices stay "dialect not yet listener-verified" |
| V9 | Iraqi export gate: block release exports until listeners approve, or warn only | Release policy | Warn (no exports in this phase) |
| V10 | Audio watermark (AudioSeal) at export if films go to the EU | AI Act Art. 50 marking | Not added |
| V11 | Habibi licence: Hugging Face tag says CC-BY-NC-SA, README grants Apache-2.0 for IRQ/MSA | Commercial use certainty | Dated README copy archived; flagged |

## Studio Company

| # | Decision | Until you decide |
|---|---|---|
| S1 | The dark organisational-diagram reference image has not reached this session (two messages arrived text-only) | The design works from the written description |
