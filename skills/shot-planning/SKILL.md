---
name: shot-planning
description: Turning a written scene into executable shots — purpose, staging, framing, durations, line assignment, continuity entry and exit states, the continuation/cut/transition relation. Injected into the model calls of the Film Director; the Shot Planner's timing fit follows the same duration rule.
license: Proprietary to this studio; staging order after lumosai8/MinimaxStoryBuilder SYSTEM_PROMPTS (MIT)
allowed-tools: story.structured_answer
metadata:
  version: "1.3.0"
  kind: "PROMPT"
  source: "src/server/story/engine.ts (planShotsDraft, fitDurations, establishedAt); injected by src/server/org/skills.ts agentPrompt"
  models: "Qwen3.8-27B-NVFP4"
---

# Shot planning

## Rules every shot plan follows

- Every shot has a purpose (what it does for the scene) and an action the picture can show in its seconds.
- Shots last 3–10 seconds. Afterwards the scene's shots are stretched evenly to fill at least 90 % of its running
  time, so plan the shots the scene needs, not filler.
- Every script line is assigned to exactly one shot, in order. A line spoken on screen puts the speaker's face in frame.
- The relation to the previous shot: CONTINUATION (the same moment carries on; the next clip starts from the last
  frames of this one), CUT (same scene, new angle), STORY_TRANSITION (time or place changes).
- Continuity for every shot: who is where, wearing and holding what, facing which way, the light and the weather; the
  next shot's entry matches this shot's exit.
- A returning place is the same place: the same architecture and fixed props; only light, weather, time of day and
  movable things change, and the shot says how.
- Keep the 180° line and the screen direction within a scene.
- Music videos: only the performer assigned to a section sings in a shot; listeners keep their lips closed.

## What is refused before a video is generated

A shot without an action or a prompt, a character or place that is not in the production, a duration outside the
engine's range, or a continuation whose previous shot has no accepted take.
