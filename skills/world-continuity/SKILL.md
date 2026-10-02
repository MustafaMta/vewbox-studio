---
name: world-continuity
description: Keeping characters and places the same across shots, scenes and episodes — canonical identities, the appearance lock, reference sheets and plates on every shot, the returning-location rule, the Character/World/Location Bibles. Use whenever a picture or video is conditioned on identity.
license: Proprietary to this studio; references-on-every-shot after lumosai8/MinimaxStoryBuilder (MIT)
allowed-tools: image.edit_with_references studio.read
metadata:
  version: "1.2.0"
  source: docs/CHARACTER-CONTINUITY.md, docs/research/CHARACTER-IMAGE-STACK.md §4, src/domain/rules.ts (canChangeAppearance), src/server/workflows/identity.ts, src/server/story/engine.ts (establishedAt)
  models: Qwen-Image-2512, Qwen-Image-Edit-2511 (+ fal Multiple-Angles LoRA, MediaPipe face check), MiniMax-H3
---

# World and location continuity

## Characters

- One canonical identity: portrait + **identity sheet** + derived views, drawn by appearance, never by name, in the
  production's visual direction, on a plain mid-grey background.
- **The sheet is drawn once, jointly.** Front, three-quarter, side and back come from ONE quality-mode Edit-2511 pass
  (no Lightning, 24 steps, cfg 4) whose references are the portrait and its face crop; the sheet is then cut into the
  four tiles. Secondary identity tokens (facial hair, shoe colour, accessories, fabric pattern) drifted when each
  view was a separate pass from the portrait alone — drawing them in one denoising is what keeps them agreeing.
- **Fixed references for everything derived.** Full body, expressions, outfit and any redrawn tile are drawn from
  three references in this order and no other: image 1 the FRONT tile (neutral pose, nothing leaks), image 2 the
  face crop (face), image 3 the whole sheet (wardrobe truth). Never draw a view from the portrait alone.
- **Identity line and seed.** `canon.identityLine` is the short fixed list of the tokens that must not change,
  repeated verbatim in every prompt that draws the character; `canon.identitySeed` is the one seed the sheet starts
  from (each derived view adds its offset; a redraw bumps the previous seed by one). Props belong in the action
  sentence, never in the identity description.
- **Say what was used.** Every ref and asset records `view`, `references` (asset ids, in order) and `seed`; the
  activity line names them. No identity score is shown until a measured check exists (DINOv2 cosine is backlog).
- **Uploaded references are validated first** (short side ≥ 512, not blurry; face detection when available) and an
  unusable one is refused (`MISSING_REFERENCE`) rather than silently replaced by the written description.
- **Appearance lock.** A character who has appeared in any generated video cannot have the appearance regenerated
  (`APPEARANCE_LOCKED`, HTTP 423). The page shows the preservation notice. A redraw of an unlocked character keeps
  the previous portrait, sheet and tiles as assets; only the character's pointers move.
- Every shot the character is in receives the FRONT tile (fallback: the portrait) as a reference picture (ref2va) or
  starts on a drawn frame made from it (fl2va); a lone character also gets the face crop. The Character Continuity
  Agent records every take a character appears in.

## Places

- A place has a master plate (unoccupied), views (reverse angle, towards the landmark) and time-of-day states, plus
  a layout record (geography, architecture, materials, camera zones, entrances) and its props.
- **Returning location.** A scene set at a place used before is the same place: the same plates by id, the same
  architecture and fixed props; only light, weather, time and movable things change, and the shots say how.
  The planner receives what was established there.
- Storyboard frames are drawn from the plate (image 1) and the characters' FRONT tiles (following images), with each
  character's identity line in the guidance.

## Bibles

The show's World Bible (rules, relationships, timeline, art direction) is edited on the show page and persisted with
the show. The Character Bible is the character record (identity, references, voice, lock). The Location Bible is the
place record (plates, layout, props). The Continuity Writer appends to the timeline after each finished episode.
