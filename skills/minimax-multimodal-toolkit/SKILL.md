---
name: minimax-multimodal-toolkit
description: The MiniMax hosted multimodal API (video, speech, music, image, vision) as packaged in MiniMax-AI/skills and the mmx CLI. Registered for reference; NOT usable on this machine because no MINIMAX_API_KEY is configured.
license: MIT (MiniMax-AI/skills); not vendored
allowed-tools: video.minimax_generate
metadata:
  version: "read 2026-10 (main)"
  source: https://github.com/MiniMax-AI/skills
  status: UNAVAILABLE — needs a MiniMax API key; nothing here has been executed in this studio
---

# MiniMax multimodal toolkit (hosted) — reference only

What the upstream skill does: wraps the hosted MiniMax endpoints — `/v1/video_generation` (Hailuo image/text/
subject-reference to video), `/v1/t2a_v2` (speech), `/v1/music_generation`, image generation and vision analysis —
behind scripts and an `mmx` command, installed into Claude Code through the plugin marketplace.

How this studio relates to it: the `video.minimax_generate`, `speech.synthesize` and `music.generate` tools already
call the same hosted endpoints when `MINIMAX_API_KEY` exists (`src/server/providers/minimax.ts`). The local MiniMax H3
graphs in ComfyUI are what runs here.

Trust: external repository content is read, not executed. No shell access, credentials or destructive permissions
are given to it. It is listed on the Studio page with the status "needs a MiniMax API key" and is not assigned as a
live capability of any agent.
