# Incremental real acceptance, run 1 (2026-10-05)

Stopped safely for the producer's power-off before the incremental acceptance finished. Steps 1–2 done (the Iraqi part
of step 2 deferred by the producer); step 3's English scene is close but its gate is not passed; the step-4 export has
not been made. Machine state and the resume steps: `resume.json`. Evidence bundle: `tea-at-mutanabbi/` (`manifest.json`,
`attempts.jsonl`, `gpu-2s.csv`, `docker-mem.log`, `comfyui-model-loads.log`); also `takes/`, `cut/`, `iraqi/README.md`.
Generated media (images, audio, video) stays on the workstation only (not in Git).

**Stop state:** intake paused ("producer power-off"); worker stopped; comfyui, tts, asr, tts-habibi, tts-design and llm
stopped; only `vewbox-db-1` runs. No job was running at the stop. `settings.voice.allowDesignedIraqi` off (on only
16:51–17:55 UTC; before: off).

## Step 1 — characters: done, all three first-attempt OK

| Mode | Character | Model | Time | Result |
|---|---|---|---|---|
| Auto | Abu Haidar | Qwen-Image-2512 | 96 s | approved; the design dropped the brief's "grey moustache" |
| Manual | Clara Hughes | Qwen-Image-2512 | 112 s | approved |
| From a picture | Karim Saleh | FLUX.2 klein | 88 s | the "What should change?" note was ignored (fixed in 56845d4); retest after the fix correct, approved |

Location plate: the samovar had cartoon eyes on the first attempt; one "Redraw the place" with an edited description fixed it.

## Step 2 — voices

- English: Clara, IndexTTS 2.5 from a designed seed — first attempt OK, transcript exact.
- Iraqi: deferred by the producer (English-first order). Abu Haidar's voice is designed (synthetic), "pending native
  review", preserved in `iraqi/`. The Settings page has no control for the Iraqi switch; it was set through the studio's
  settings command.

## Step 3 — scene "Tea at Mutanabbi" (`short-efe98843f0`, English, 3 shots)

- Shot 1 (transition): passed first attempt.
- Shot 2 (Continuous): the first take spoke the Iraqi line; re-made silent for the English directive; passed.
- Shot 3 (Cut): 9 attempts. Four rejected by the app's own speech check (local MiniMax H3 repeats "Thank you" to fill the
  clip; one of these generated across a deliberate worker kill/restart). The others exposed app defects: lip-sync over a
  sip, a stranger drawn into the opening frame, a stale line recording, a hard cut to an anchored ending frame. Take 9
  passes, including lip-sync.
- Cut 4 (`gen-c7cd61bebcf4e6c3b58d`) assembled, not yet inspected; edit approval and export not done.

**Restart/recovery:** the worker was killed in the middle of two video jobs; on restart both were reclaimed and their
ComfyUI prompts adopted without regenerating.

**MiniMax is local:** proven from the `vewbox-comfyui-1` image id, the queued graph's H3 model files and the ComfyUI
load log; `MINIMAX_API_KEY` not set. Peak VRAM 31.6 of 32.6 GB; peak host RAM 45.1 of 46.8 GiB (H3 alone 41.8) — very
tight (the `.wslconfig` memory raise is still pending).

## Gate (results from cut 3 unless noted)

| Item | Status |
|---|---|
| Same character across shots | PASS |
| Same voice across lines | **OPEN** — H3 re-voices every take; similarity shot 1 vs 3 was 0.45 (that take used the stale recording); re-measure on cut 4 |
| Stable location | PASS (the plate check flags the closer continuation shot at 59.8 vs 36; same stall by eye) |
| Clean Continuous boundary | PASS (no repeated frames; slight expression change on Clara) |
| Intentional Cut boundary | PASS |
| Lip-sync | shot 3 PASS; shots 1 and 2 not checked yet |
| No duplicated guide frames or audio | PASS |
| No fade or black frames | PASS |
| Export watched end to end | NOT STARTED |

## Defects fixed (each with a unit test; tsc clean)

| Commit | Fix |
|---|---|
| 56845d4 | From a picture: the change note reaches the image |
| d35fe3d | Each dialogue line tagged in its own language (an Arabic line had gone to H3 tagged English); also added a "nobody speaks after the last line" sentence |
| d0d180d | Reverts that sentence (no effect in 2 of 2 takes) |
| b162d2d, f71c5f2 | An edited "What happens" reaches the take instead of the planner's old direction |
| 97d0823 | An edited line is recorded again instead of reusing the old recording |
| 3ddb966 | "Remove the opening/ending frame" saves |

## Still open

1. Frames are drawn at the plate's framing, so H3 sometimes hard-cuts inside a take to reach the planned framing or an
   anchored ending frame (workaround: matching framing or no ending frame).
2. Character names leak into H3 prompts (the app only warns).
3. A recovered take shows "made in 8 s".
4. An "ar" subtitle track is written for an English film, containing English text.
5. A frame that fails the people count is kept, and the warning is not shown on the shot page.
6. The plate check misfires on closer continuation shots.
7. The Final cut tab shows "0 of 2 voices chosen" although both speakers have voices.

## Resume

1. Bring up asr and tts-design.
2. `driver/cut-check.ps1` on `var/library/video/2026/10/gen-c7cd61bebcf4e6c3b58d.a1.mp4` with joins `144,264`.
3. Lip-sync on shots 1 and 2; re-measure voice similarity shot 1 vs 3.
4. If every item passes: approve the cut and export (MP4 H.264, 1080p, English subtitles) through the UI, watch the
   export, update the bundle, then start the Short.
