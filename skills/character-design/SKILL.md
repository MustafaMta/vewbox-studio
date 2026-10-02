---
name: character-design
description: Designing an original character that can be drawn and voiced, and how the studio draws it — every appearance field concrete, the producer's fields kept, one distinguishing detail, a speaking voice; then portrait, identity line and seed, the jointly drawn identity sheet and the fixed references for every further view. Injected into the Casting Director's design call; the drawing procedure is the Character Designer's.
license: Proprietary to this studio
allowed-tools: story.structured_answer image.generate image.edit_with_references
metadata:
  version: "1.0.0"
  kind: "PROMPT"
  source: "src/server/story/engine.ts (designCharacter), src/worker/handlers/story.ts (designCharacter), src/server/workflows/identity.ts, src/worker/handlers/images.ts (characterAppearance, characterRefs); docs/research/CHARACTER-IMAGE-STACK.md §4"
  models: "qwen3:14b, Qwen-Image-2512, Qwen-Image-Edit-2511"
---

# Character design and the identity sheet

## Designing a character

- Design one original character: never a protected character, a real person or a recognisable franchise figure.
- Make every appearance field concrete enough to draw from without guessing: build, face, hair, skin, eyes, and a
  complete default outfit as the wardrobe. Give one distinguishing detail that survives every shot.
- Describe the look, not the name: the pictures are drawn from these words alone.
- Keep every field the producer already wrote exactly; fill only what is missing.
- Do not repeat the look or the name of a character the studio already has.
- Give the character a personality and a speaking voice (pitch, pace, timbre): voice casting starts from it.
- When the look comes from the producer's reference picture, which you cannot see, design only who the character is
  (role, personality, sex and age, voice) and leave every look field to the picture: invent nothing visible.

## How the character is then drawn

1. Portrait: head and shoulders, centred, neutral, plain mid-grey background, the production direction's words first;
   from the producer's validated reference picture when there is one (Qwen-Image-Edit), otherwise from the
   description (Qwen-Image).
2. Identity line and seed: a short fixed list of the features that must not change, repeated in every prompt that
   draws the character, and one seed the sheet starts from.
3. Identity sheet: one quality pass draws front, three-quarter, side and back together from the portrait and its face
   crop; the sheet is cut into four tiles.
4. Further views (full body, expressions) are drawn from three references in a fixed order — the front tile, the face
   crop, the sheet — never from the portrait alone.
5. Every picture records its view, its references and its seed.
6. A character who has appeared in a generated video keeps its appearance: it is not redrawn.
