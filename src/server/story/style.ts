import type { Style } from '@/domain/vocabulary';

/** THREE PRODUCTION DIRECTIONS — cartoon, anime and realistic are different ways of making a film, not a word on
 *  the end of a prompt. Each direction tells the writers, the designers and the video model how characters are
 *  built, how light and material behave, how the camera moves and what the picture must avoid. The quality bar is
 *  the best of each tradition; the content is always original. */

export interface StyleDirection {
  name: string;
  /** How the story engine should think about character design, environments and staging in this mode. */
  writing: string;
  /** Visual language for image and video prompts (prefix). */
  visual: string;
  /** Character construction rules for reference sheets. */
  character: string;
  /** Environment and lighting rules for location plates. */
  environment: string;
  /** Camera and motion expectations for shot planning. */
  camera: string;
  /** What must not appear; written as positives for models without negative prompts. */
  avoid: string;
}

export const STYLE_DIRECTIONS: Record<Style, StyleDirection> = {
  CARTOON: {
    name: 'Cartoon (feature-animation CG)',
    writing: 'Feature-animation storytelling: clear wants, big readable emotions, visual gags that pay off, a warm ensemble. Scenes are built around physical business and expressive reactions. Dialogue is short and playful; silences and looks do real work.',
    visual: 'high-end 3D animated feature film still, stylized CG characters with appealing simplified shapes, soft subsurface skin, large expressive eyes, clean readable silhouettes, rich saturated but controlled palette, painterly global illumination, shallow depth of field, cinematic composition',
    character: 'Appealing stylized proportions (slightly larger head and eyes, simplified hands), one strong silhouette, two or three signature colours, costume details reduced to the memorable few, exaggerated but consistent facial structure, materials read as soft and tactile.',
    environment: 'Sets designed like animated features: simplified geometry with caricatured proportions, warm bounce light, saturated local colour, every prop designed and placed on purpose, atmosphere (dust, steam, haze) used for depth.',
    camera: 'Confident, planned camera: dolly and crane moves with eases, snappy timing, staging on clear lines of action, poses held for readability, squash-and-stretch energy in motion.',
    avoid: 'Every frame stays stylized CG animation: no photographic realism, no live-action texture, no uncanny semi-real faces, no motion blur smears, no text artifacts, no extra fingers or limbs.',
  },
  ANIME: {
    name: 'Anime (premium 2D television/film)',
    writing: 'Anime storytelling: interiority and atmosphere, beats that linger on a face or a landscape, dramatic escalation with precise emotional turns, monologue and silence both allowed. Dialogue can be heightened; quiet scenes breathe.',
    visual: 'premium 2D anime film still, clean confident line art, cel shading with two-tone shadows and specular highlights, painted backgrounds with soft gouache texture, expressive eyes with layered highlights, dramatic rim light, hand-drawn feel, cinematic widescreen composition',
    character: 'Anime construction: clean line weight, simplified nose and mouth, detailed eyes and hair clusters, flat colour fills with hard-edged shadow shapes, costume rendered in flat tones with a few fabric folds, consistent head-to-body ratio.',
    environment: 'Painted backgrounds: perspective-correct architecture with soft painterly texture, strong colour scripts per time of day (cool dawns, golden afternoons, deep blue nights with warm windows), lens flares and light rays used deliberately.',
    camera: 'Anime camera grammar: held wide establishing shots, slow pans across painted backgrounds, dramatic push-ins on faces, impact frames, limited but intentional character animation, speed lines reserved for action.',
    avoid: 'Every frame stays 2D anime: no 3D CG look, no photoreal skin, no western cartoon proportions, no muddy gradients, no smeared or melting line work, no duplicated faces.',
  },
  REALISTIC: {
    name: 'Realistic (cinematic live-action look)',
    writing: 'Grounded drama: subtext over statement, naturalistic dialogue with interruptions and hesitation, behaviour revealing character, locations treated as real places with history. Scenes end a beat early.',
    visual: 'cinematic live-action film still, photorealistic, natural skin texture and pores, practical and motivated lighting, 35mm anamorphic look with gentle halation, true-to-life colour grade with lifted blacks, shallow depth of field, real-world materials and wear',
    character: 'Real human proportions and faces with asymmetry and texture, wardrobe with realistic fabric behaviour and wear, hair with flyaways, make-up invisible, jewellery and accessories small and specific.',
    environment: 'Real locations: believable architecture and clutter, motivated light sources (windows, lamps, neon), weather and haze, surfaces with age and dirt, period-correct details.',
    camera: 'Live-action camera: handheld or dolly with natural imperfection, eye-level lenses 35–85mm, rack focus, natural motion blur, actors blocked on continuous lines, coverage that cuts (wide, medium, close).',
    avoid: 'Every frame stays photoreal: no illustration or CG look, no plastic skin, no over-saturated HDR, no warped hands or extra limbs, no morphing faces, no floating or duplicated objects.',
  },
};

export const styleDirection = (s: Style): StyleDirection => STYLE_DIRECTIONS[s];
