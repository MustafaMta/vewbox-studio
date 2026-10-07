---
name: minimax-music-gen
description: Read-only reference note on the upstream MiniMax-AI/skills music skill (prompt expansion and the mmx CLI for the hosted music-2.5 model). Never executed or injected in this studio; unavailable here without a MiniMax API key.
license: MIT (MiniMax-AI/skills); not vendored — this note is the studio's own summary
metadata:
  version: "2.0.0"
  kind: "REFERENCE"
  upstream: "https://github.com/MiniMax-AI/skills/tree/main/skills/minimax-music-gen"
  upstream-commit: "60aaae52 (2026-04-18), read 2026-10-02"
  status: "UNAVAILABLE: reference knowledge; needs a MiniMax API key; nothing here is executed"
---

# MiniMax music generation (hosted) — reference only

**Upstream (v1.1).** Intent (vocal, instrumental or cover) → prompt expansion → `mmx music generate` with genre, mood,
vocals, instruments and BPM; lyric markers `[verse] [chorus] [bridge] [intro] [outro]`; a prompt formula "A [mood]
[BPM] [genre] song, featuring [vocals], about [theme], [atmosphere], [key instruments]" written in English; playback
with a local player into the user's music folder. It targets the hosted `music-2.5` model; its own guides disagree on
whether prompts are sentences or comma-separated descriptors.

**This studio.** `music.generate` composes locally with ACE-Step 1.5 XL-SFT + the 5Hz LM 4B in ComfyUI — the only
song engine; the hosted Music API and MiniMax Music 3 routes were removed (2026-10-07). The stems and the lyric
alignment follow (see `singing-performance`). The prompt formula above is reference only, to be checked against the
ACE-Step caption conventions before any use.

**Trust.** Read, never executed: no CLI, no shell, no player, no credentials. Assigned to no agent. Status UNAVAILABLE:
no MiniMax API key on this machine, and as reference knowledge it would not be executed even with one.
