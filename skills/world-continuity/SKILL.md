---
name: world-continuity
description: Keeping characters and places the same across shots, scenes and episodes — one canonical image per character, the appearance lock, the canonical image and plates on every shot, the returning-location rule, the Character/World/Location Bibles. Use whenever a picture or video is conditioned on identity.
license: Proprietary to this studio; references-on-every-shot after lumosai8/MinimaxStoryBuilder (MIT)
allowed-tools: image.generate image.edit_with_references
metadata:
  version: "2.1.0"
  kind: "PROCEDURE"
  source: docs/CHARACTER-CONTINUITY.md, docs/CONTRACTS-IDENTITY-PACK.md v2, src/domain/identity.ts (primaryImageOf), src/domain/rules.ts (canChangeAppearance), src/worker/handlers/images.ts (characterRefs, drawShotFrame), src/server/production/shot-pack.ts, src/worker/handlers/take.ts, src/server/story/engine.ts (establishedAt)
  models: Qwen-Image-2512, Qwen-Image-Edit-2511, MiniMax-H3
---

# World and location continuity

## Characters

- **One canonical identity: one image.** A character's identity is its canonical front full-body image (drawn by
  appearance, never by name, in the production's visual direction, head to feet on a plain background), approved by
  the producer, plus its English identity line and seed. It is the primary image everywhere: cards, pickers, cast
  displays and the reference of every shot (`primaryImageOf`: the canonical image, else a legacy portrait).
- **Draft until approved.** A new or redrawn image is a DRAFT; production preflight warns when a cast character's
  image is not approved and fails when there is none. A redraw keeps the previous image in the library as RAW.
- **Identity line and seed.** The identity line is the fixed English list of what must not change (style, age,
  build, face, hair, skin, every garment and colour, accessories with their side, footwear), recorded with the image
  and repeated in the guidance of every frame; a redraw moves the seed on by one. Props belong in the action
  sentence, never in the identity description.
- **Say what was used.** Every picture records its references (asset ids, in order) and seed; the activity line names
  them. No identity score is shown: with a single image there is nothing to compare it with, and a check is used only
  when it demonstrably separates right from wrong (the full-body framing check does).
- **Uploaded references are validated first** (short side ≥ 512, not blurry, one face) and an unusable one is refused
  (`MISSING_REFERENCE`) rather than silently replaced by the written description; a usable one is read (face box,
  description) before anything is drawn from it.
- **Appearance lock.** A character who has appeared in any generated video cannot have the image regenerated or
  replaced (`APPEARANCE_LOCKED`, HTTP 423); name, description, personality and notes stay editable.
- **Secondary material** (an expression sheet, the outfit, a close-up portrait) is drawn only on request, each in one
  pass with the canonical image as its only reference, stored as SECONDARY; it never replaces the canonical image and
  is never an identity reference. No other view (side, back, turnaround) is drawn.
- A shot's opening frame is drawn from the plate and the canonical images of up to two characters; the take then
  starts on that frame (fl2va). Without a drawn frame the take is conditioned on each character's canonical image as a
  reference picture (ref2va), handed over by the Character Continuity Agent. Every take a character appears in is
  recorded in the character's usage.

## Places

- A place has a master plate (unoccupied), views (reverse angle, towards the landmark) and time-of-day states, plus
  a layout record (geography, architecture, materials, camera zones, entrances) and its props.
- **Returning location.** A scene set at a place used before is the same place: the same plates by id, the same
  architecture and fixed props; only light, weather, time and movable things change, and the shots say how.
  The planner receives what was established there.
- Storyboard frames are drawn from the plate (image 1) and the characters' canonical images (following images), with
  each character's identity line in the guidance.

## Bibles

The show's World Bible (rules, relationships, timeline, art direction) is edited on the show page and persisted with
the show. The Character Bible is the character record (identity image, voice, lock). The Location Bible is the place
record (plates, layout, props). The Continuity Writer appends to the timeline after each finished episode.
