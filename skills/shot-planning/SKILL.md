---
name: shot-planning
description: Turning a written scene into executable shots — purpose, staging, framing, duration fitting, line assignment, continuity entry and exit states, the continuation/cut/transition relation. Use for PLAN_SHOTS and when reviewing a shot list.
license: Proprietary to this studio; staging order after lumosai8/MinimaxStoryBuilder SYSTEM_PROMPTS (MIT)
allowed-tools: story.structured_answer studio.read studio.command
metadata:
  version: "1.2.0"
  source: src/server/story/engine.ts (planShots, fitDurations, establishedAt), src/server/story/prompts.ts
  models: qwen3:14b or the configured hosted LLM
---

# Shot planning

## Rules the planner is held to

- **Every shot has a purpose** (what it does for the scene) and an action the picture can show in its seconds.
- **Durations** 3–10 s planned (the engine allows up to 15); `fitDurations` scales the scene to its budget and the
  handoff checks the running time is within −15 % / +25 % of the target.
- **Every script line is assigned to exactly one shot.** A line spoken on screen puts the speaker's face in frame.
- **Relation to the previous shot**: `CONTINUATION` (same place, same moment, action carries over — the next take
  starts from the last 22 frames of this one), `CUT` (same scene, new angle), `TRANSITION` (new scene or time).
- **Continuity states**: entry and exit (who is where, holding what, light, weather) written per shot; the next
  shot's entry equals this shot's exit.
- **Returning location**: when a scene returns to a place used earlier, the planner is told what was established
  there (`establishedAt`) — same plates by id, same architecture; only light, time and movable things change.
- **180° line and screen direction** hold within a scene.
- **Music videos**: the singing assignment per section decides who performs in a shot's window; listeners keep
  their lips closed; "everyone sings everything" from a wizard is a placeholder to be replaced.

## Three passes

Cast and places first (resolved by id), then the outline (purpose per shot), then staging (framing, move, lens,
action, lines). Nothing incomplete reaches Video Production: preflight refuses an empty action, an unresolved
place, an unknown character or a continuation without an accepted predecessor.
