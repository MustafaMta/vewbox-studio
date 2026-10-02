---
name: world-continuity
description: Keeping characters and places the same across shots, scenes and episodes — canonical identities, the appearance lock, reference sheets and plates on every shot, the returning-location rule, the Character/World/Location Bibles. Use whenever a picture or video is conditioned on identity.
license: Proprietary to this studio; references-on-every-shot after lumosai8/MinimaxStoryBuilder (MIT)
allowed-tools: image.edit_with_references studio.read
metadata:
  version: "1.1.0"
  source: docs/CHARACTER-CONTINUITY.md, src/domain/rules.ts (canChangeAppearance), src/server/story/engine.ts (establishedAt)
  models: Qwen-Image-2512, Qwen-Image-Edit-2511, MiniMax-H3
---

# World and location continuity

## Characters

- One canonical identity: portrait + reference sheet (front, three-quarter, side, full body, expression), drawn by
  appearance, never by name, in the production's visual direction, on a plain background.
- **Appearance lock.** A character who has appeared in any generated video cannot have the appearance regenerated
  (`APPEARANCE_LOCKED`, HTTP 423). The page shows the preservation notice.
- Every shot the character is in receives the portrait as a reference picture (ref2va) or starts on a drawn frame
  made from it (fl2va). The Character Continuity Agent records every take a character appears in.

## Places

- A place has a master plate (unoccupied), views (reverse angle, towards the landmark) and time-of-day states, plus
  a layout record (geography, architecture, materials, camera zones, entrances) and its props.
- **Returning location.** A scene set at a place used before is the same place: the same plates by id, the same
  architecture and fixed props; only light, weather, time and movable things change, and the shots say how.
  The planner receives what was established there.
- Storyboard frames are drawn from the plate (image 1) and the portraits (following images).

## Bibles

The show's World Bible (rules, relationships, timeline, art direction) is edited on the show page and persisted with
the show. The Character Bible is the character record (identity, references, voice, lock). The Location Bible is the
place record (plates, layout, props). The Continuity Writer appends to the timeline after each finished episode.
