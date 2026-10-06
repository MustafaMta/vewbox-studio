# Vewbox Studio — final production stack and execution directive (producer, 2026-10-06, evening)

Binding with the earlier directives (FINAL-LOCAL, MODEL-UPGRADE, CLOUD-SESSION). It FREEZES the production model
stack and puts film production first. Coordinator's notes are marked ▸.

▸ This is the current directive. The earlier three were archived on 2026-10-06 (`D:\vewbox-data\archive\repo-docs-2026-10-06\directives\`,
and git history); their still-binding decisions live in docs/LICENSES.md §0 (commercial-safe only), docs/MODELS.md
(27B–30B size policy, promotion rule) and docs/OPERATIONS.md (GPU work through `scripts/gpu-hold.ts`).

## 1. Frozen production stack

| Role | Model | Notes |
|---|---|---|
| Main filmmaking intelligence (concept, story, screenplay, episode/scene/shot planning, agents, World/Location Bible, continuity reasoning, structured state, visual and QA reasoning, JSON/tool calls) | **Qwen 27B** (directive names Qwen3.5-27B) | ▸ On the store is **qwen3.6:27b-q8_0**, the current release of the same 27B line (3.5-27B is superseded; Apache-2.0). It is used as the production brain; no further 27B download. No 122B models. 7–14B LLMs only as temporary development/emergency fallbacks. |
| Image generation (canonical full-body characters in Cartoon/Anime/Realistic, canonical locations, plates, scene references, opening frames, posters, key art, music-video art) | **Qwen-Image-2512 (20B)** | primary generator |
| Image editing and consistency (identity-preserving edits, expression, wardrobe, props, recurring locations, opening-frame creation, shot-specific references) | **Qwen-Image-Edit-2511 (20B)** | ▸ takes over the "character from a picture" role from FLUX.2 klein. FLUX is no longer a production dependency. JoyAI stays only as an already-downloaded comparison/fallback for a proven spatial-edit advantage; it must not delay the pipeline. |
| Video | **MiniMax H3 (33B), local only** | the only video engine; strongest supported local config (FINAL tier: no LoRA, 20 steps); continue reference conditioning, re-anchoring, continuation, guide frames/audio, boundaries, duplicate-guide trimming, audio assembly; respect the H3 licence/territory rules |
| Character dialogue / persistent voice | **MOSS-TTS Delay-8B v1.5** | primary English production voice candidate (identity, dialogue, emotion, short and long lines, cloning). Prove it against the integrated stack only long enough to replace; then retire weaker engines from the normal route (never delete before the replacement is proven). Iraqi Arabic is a later phase. |
| Speech recognition | **Whisper large-v3** | dialogue verification, subtitle QA, transcription, later Iraqi diagnostics |
| Forced alignment | **WhisperX + Whisper large-v3** | ▸ the asr service already runs WhisperX's trellis/backtrack alignment (wav2vec2 CTC emissions) over Whisper large-v3 transcripts; word timings, subtitle timing, authoritative audio alignment, dialogue duration, lip-sync QA, lyric timing. Measurements, not proof of visual lip-sync. |
| Lip-sync correction | **LatentSync 1.6** | targeted repair only: native H3 → visual inspection → measurements → LatentSync only for a failing shot; never every face; keep occlusion/profile safeguards; corrected takes are separate derivatives |

## 2–3. Music video stack and workflow
- **ACE-Step 1.5 XL-SFT (4B DiT)**: primary final song generator. **ACE-Step 5Hz LM**: composition reasoning. **ACE-Step 1.5 XL-Base**: repaint/cover/extend/extract/completion.
- **HTDemucs**: stems. **MOSS-SoundEffect (8B)**: ambience, crowds, footsteps, doors, cinematic effects, narrative sections outside the song.
- Workflow: Qwen 27B (concept, story/visual concept, lyric structure, performer assignment, shot plan, storyboard) → ACE-Step authoritative song = master timeline → HTDemucs stems → Whisper + WhisperX lyric timing → Qwen-Image-2512 performer/stage/shot references and key art → Qwen-Image-Edit-2511 identity/wardrobe/stage/expressions → MiniMax H3 for all video → LatentSync only for failed singing shots → MOSS-SoundEffect where appropriate → FFmpeg/Vewbox editor locked to the original song.
- Never: random or background characters singing, duplicated vocals, H3 voice over the song, soundtrack or lyric drift. Performer assignment explicit per vocal segment.

## 4. Specialists (exempt from the 27B rule)
MediaPipe + YuNet (faces, head angle, hand–mouth occlusion); DINOv2 or current commercially safe embeddings for identity/drift support (never replacing human review); Real-ESRGAN only where restoration materially helps; FFmpeg for assembly/mux/trim/validation/export; ComfyUI stays the GPU runtime.

## 5–6. Storage and cleanup
All weights under `D:\models` (the store, through VEWBOX_MODELS_ROOT); every download straight to D:; HF credentials only from the git-ignored env, never printed, committed, logged or reported. ▸ The C: cleanup is complete (2026-10-06 17:27: 316 GB reclaimed; tombstones guard the old volume names). Obsolete models are removed only after a replacement is proven through the real UI.

## 7–8. Priorities
Film production first. At most three active workstreams: (1) filmmaking/acceptance, (2) one critical defect/reliability fix, (3) one background download/storage/model task. One GPU-heavy inference at a time; film jobs before benchmarks; no benchmark while H3 needs the card. Broad model hunting stops: no 122B, duplicate, FLUX, experimental video or random TTS downloads.

## 9–15. Engineering rules (unchanged)
Structured production state (character, location, shot, story) in the backend; one canonical image + one persistent voice per character, locked after approved video; explicit Continuous/Cut/Transition boundaries, no fades/black/dissolves/fake establishing shots to hide defects; audio-first dialogue with one authoritative performance; real lip-sync acceptance by eye; the opening-frame defect fixed globally (close/medium shots get a generated opening frame; readiness catches a missing one before H3); reliability fixes preserved; the Docker crash investigated separately (▸ root cause found: the Claude app's self-update; mitigated).

## 16–22. Acceptance
Real UI only. **Immediate target: a 15–30 s English scene from the UI** — 1 established location, 1–2 approved characters, an existing persistent voice, 2–3 shots with a speaking shot, one Continuous boundary and one intentional Cut, authoritative dialogue, subtitles, a final export, watched and inspected (faces, bodies, defining features, wardrobe, environment, props, movement direction, action, opening composition, repeated/duplicated frames, repeated dialogue, duplicate audio, black/freeze frames, fades, voice, dialogue timing, lip-sync, subtitle timing, A/V sync). Preserve attempt #1; fix root causes; regenerate only the affected shot. Then the gates in order (voice → speaking character → lip-sync → 2-shot → 4–8-shot → Cut → Transition → return → Short → Music Video → 5–10 min episode). Tests are not film acceptance: watch the film.

## 23–26. Promotion records, obsolete-model cleanup, Iraqi Arabic after English, execution behaviour
Record per production model: name, checkpoint, params, precision/quantization, path, licence, VRAM, RAM, speed, first-attempt rate, quality findings — without days of benchmarking. Remove obsolete models after a UI-proven replacement. Iraqi Arabic after the English Short, Music Video and episode. inspect → implement → focused test → real UI generation → watch media → fix → continue. The next milestone is the exported 15–30 s scene, then the Short, the Music Video and the episode.
