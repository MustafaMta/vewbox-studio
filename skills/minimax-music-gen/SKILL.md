---
name: minimax-music-gen
description: The MiniMax hosted music generation API as packaged in MiniMax-AI/skills. Registered for reference; NOT usable on this machine because no MINIMAX_API_KEY is configured (and the hosted music endpoint is closed to new accounts).
license: MIT (MiniMax-AI/skills); not vendored
allowed-tools: music.generate
metadata:
  version: "read 2026-10 (main)"
  source: https://github.com/MiniMax-AI/skills
  status: UNAVAILABLE — needs a MiniMax API key
---

# MiniMax music generation (hosted) — reference only

Upstream: a prompt plus lyrics to `/v1/music_generation`, returning an MP3. This studio's `music.generate` tool calls
the same endpoint when a key exists and otherwise composes locally with ACE-Step 1.5 (default) or MiniMax Music 3 in
ComfyUI, then separates stems and aligns the lyrics (see the `singing-performance` skill).

Not executed here; shown on the Studio page as "needs a MiniMax API key".
