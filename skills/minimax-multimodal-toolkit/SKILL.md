---
name: minimax-multimodal-toolkit
description: Read-only reference note on the upstream MiniMax-AI/skills folder of this name, which now holds the mmx-cli skill for the hosted MiniMax API (Hailuo-2.3 video, speech-2.8, music-2.5, image-01). Never executed or injected in this studio; unavailable here without a MiniMax API key.
license: MIT (MiniMax-AI/skills); not vendored — this note is the studio's own summary
metadata:
  version: "2.0.0"
  kind: "REFERENCE"
  upstream: "https://github.com/MiniMax-AI/skills/tree/main/skills/minimax-multimodal-toolkit"
  upstream-commit: "60aaae52 (2026-04-18), read 2026-10-02"
  status: "UNAVAILABLE: reference knowledge; needs a MiniMax API key; nothing here is executed"
---

# MiniMax mmx-cli (hosted API) — reference only

**What the upstream folder holds now.** Since upstream commit `e0fdeef` (2026-04-08) the folder's SKILL.md is named
`mmx-cli` (its name no longer matches its folder) and teaches the `mmx` command-line client (`npm install -g mmx-cli`)
for the hosted MiniMax API: text `MiniMax-M2.7`, images `image-01`, video `MiniMax-Hailuo-2.3` / `-Fast`
(first frame, asynchronous tasks), speech `speech-2.8-hd` / `2.6` / `02`, music `music-2.5`, vision and web search. It
authenticates with `mmx auth login --api-key` or `MINIMAX_API_KEY`. The shell scripts the studio's earlier note
described were removed upstream.

**How it relates to this studio.** Nothing in it covers MiniMax H3 (the studio's only video engine, run locally in
ComfyUI), the `<d>` dialogue tags, reference-to-video or voice cloning through `/v1/voice_clone`. The studio's
`video.minimax_generate`, `speech.synthesize`, `speech.clone_voice` and `music.generate` tools call the hosted endpoints
themselves when a key exists (`src/server/providers/minimax.ts`); this note grants and changes nothing.

**Trust.** External content is read, never executed: no global npm install, no shell, no credential files, no MCP
server. It is assigned to no agent. Status UNAVAILABLE: this machine has no MiniMax API key, and as reference knowledge
it would not be executed even with one.
