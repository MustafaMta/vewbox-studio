---
name: character-design
description: Designing an original character that can be drawn and voiced, and how the studio draws it — every appearance field concrete and in English, the producer's fields kept, one distinguishing detail, a speaking voice; then one canonical front full-body image in the production's style, from the English identity line or from the producer's picture read by a vision model, awaiting the producer's approval. Injected into the Casting Director's design call; the drawing procedure is the Character Designer's.
license: Proprietary to this studio
allowed-tools: story.structured_answer image.generate image.edit_with_references image.describe_reference
metadata:
  version: "2.1.0"
  kind: "PROMPT"
  source: "src/server/story/engine.ts (designCharacter), src/worker/handlers/story.ts (designCharacter), src/server/workflows/canonical-image.ts, src/server/media/figure-check.ts, src/worker/handlers/images.ts (characterAppearance); docs/CONTRACTS-IDENTITY-PACK.md v2; docs/evidence/image-v2/REPORT.md"
  models: "qwen3:14b, Qwen-Image-2512, Qwen-Image-Edit-2511, Qwen3.5-4B"
---

# Character design and the canonical image

## Designing a character

- Design one original character: never a protected character, a real person or a recognisable franchise figure.
- No logos, lettering, words, brand names or brand marks on clothing, shoes or props unless the producer wrote them:
  the image model renders them literally, and a mark can resemble a real brand. Describe garments by cut, colour and
  material instead.
- Make every appearance field concrete enough to draw from without guessing, and write it in English (the image
  model reads English): build, face, hair, skin, eyes, and a complete default outfit as the wardrobe — every garment
  with its colour, and the footwear. Give one distinguishing detail that survives every shot.
- For a detail worn on one side of the body, say which side as the character's own ("a watch on his own left
  wrist"). The image model places such details on the correct side only about two times in three, so prefer details
  that read from any side unless the side matters to the story.
- Describe the look, not the name: the picture is drawn from these words alone.
- Keep every field the producer already wrote exactly; fill only what is missing.
- Do not repeat the look or the name of a character the studio already has.
- Give the character a personality and a speaking voice (pitch, pace, timbre): voice casting starts from it.
- When the look comes from the producer's reference picture, which you cannot see, design only who the character is
  (role, personality, sex and age, voice) and leave every look field to the picture: invent nothing visible.

## How the character is then drawn

1. One character is one canonical image: a single front full-body figure, standing in a relaxed neutral pose, head to
   feet in the frame with margin, on a plain neutral background in even light. Nothing else is drawn by default
   (portrait close-ups, expressions and outfits are optional secondary material, made on request).
2. The identity line is English and starts with the style, then age and sex, build, face, hair, eyes, skin, every
   garment with its colour, accessories with their side, footwear. Pieces in another script are left out and
   reported, never sent to the image model.
3. From text (Auto, Manual): the prompt starts with the medium ("3D animated feature-film character design, stylized
   CG render, not a photograph" / "2D anime character design, cel-shaded … not 3D" / "Photorealistic full-length
   studio photograph"), then the framing, the identity line and the production direction; Qwen-Image-2512 in quality
   mode (30 steps, cfg 4), 928×1664.
4. From a picture (Image Reference): the picture is validated, then read — its face box and a description by the
   vision model, from which the identity line is written (low-confidence details are left out and shown); the
   picture (and its face crop) is then redrawn into the production's style by Qwen-Image-Edit-2511.
5. The whole figure must be in the frame (checked on the CPU); a picture that fails is redrawn once, then left for
   the producer with the reason.
6. The image is a draft until the producer approves it; it is then the character's identity and the primary picture
   everywhere, including the reference of every shot. Every picture records its seed, its references and its
   identity line.
7. A character who has appeared in a generated video keeps its image: it is not redrawn.
