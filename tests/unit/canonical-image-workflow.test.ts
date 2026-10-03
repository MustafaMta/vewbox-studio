import { describe, expect, it } from 'vitest';
import {
  CANONICAL_FRAME, CANONICAL_OUTPUT, DESCRIBE_PROMPT, EXPECTED_MEDIUM, FACE_CHECK_OUTPUTS, MODELS, REFERENCE_DESCRIBE_KEY, STYLE_MEDIUM, canonicalIdentityLine, canonicalPrompt,
  faceCropRect, firstJsonObject, hasNonLatinLetters, identityLineFromDescription, negativeFor, parseCharacterDescription, parseFaceBoxes, parseStyleJudgement,
  qwenCanonicalImage, qwenReferenceCanonical, qwenVlmText, referenceCanonicalPrompt, referenceReadGraph, sentences, vlmOutput, whoPhrase, workflowVersion, type Graph,
} from '@/server/workflows';

/** THE CANONICAL CHARACTER IMAGE (docs/CONTRACTS-IDENTITY-PACK.md v2) — the pure builders behind CHARACTER_APPEARANCE:
 *  the English identity line (style first, age, no non-Latin script), the medium-first prompt (the wave-2 "cartoon
 *  comes out photographic" fix), the whole-figure framing, the graphs, the face crop of an upload and the parsing of the
 *  vision model's description. GPU evidence: docs/evidence/image-v2/REPORT.md. */

const kiteMaker = { sex: 'MALE' as const, ageYears: 70, build: 'slim', hair: 'short grey', eyes: 'dark brown', skin: 'warm tan', wardrobe: 'a patchwork jacket of brown, teal, ochre and brick-red squares, olive trousers, tan leather sandals', distinguishing: ['full white beard', 'round wire glasses', 'a large brass wristwatch on his own left wrist'], canon: { accessories: ['silver crescent pendant'] } };
const linked = (g: Graph) => { for (const [id, n] of Object.entries(g)) for (const v of Object.values(n.inputs)) if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'number') expect(g[v[0]], `${id} → ${v[0]}`).toBeDefined(); };
const classes = (g: Graph) => Object.values(g).map((n) => n.class_type);

describe('the English identity line (style first, age, Latin script only)', () => {
  it('states style, sex and age first, then the tokens in the contract order', () => {
    const r = canonicalIdentityLine(kiteMaker, { style: 'CARTOON' });
    expect(r.line.startsWith('Identity: stylized 3D animated character, a man of about 70; slim build; ')).toBe(true);
    for (const t of ['short grey hair', 'dark brown eyes', 'wearing a patchwork jacket', 'full white beard', 'a large brass wristwatch on his own left wrist', 'accessories: silver crescent pendant']) expect(r.line).toContain(t);
    expect(r.line.indexOf('hair')).toBeLessThan(r.line.indexOf('wearing'));
    expect(r).toMatchObject({ hasAge: true, nonLatin: [] });
    expect(r.line).toBe(canonicalIdentityLine({ ...kiteMaker }, { style: 'CARTOON' }).line);
    expect(canonicalIdentityLine(kiteMaker).line.startsWith('Identity: a man of about 70;')).toBe(true);
  });
  it('picks child and teenager words from the age', () => {
    expect(whoPhrase({ sex: 'FEMALE', ageYears: 10 })).toBe('a girl of about 10');
    expect(whoPhrase({ sex: 'FEMALE', ageYears: 17 })).toBe('a teenage girl of about 17');
    expect(whoPhrase({ sex: 'MALE', ageYears: 35 })).toBe('a man of about 35');
    expect(whoPhrase({ species: 'cat', ageYears: 4 })).toBe('a cat');
    expect(whoPhrase({})).toBe('a person');
  });
  it('never passes Arabic to the image model: a stored Arabic line and Arabic fields are reported, not used', () => {
    const r = canonicalIdentityLine({ ...kiteMaker, hair: 'شعر داكن', canon: { identityLine: 'Identity: شعر داكن، ثوب مطرز', accessories: ['خاتم'] } }, { style: 'REALISTIC' });
    expect(hasNonLatinLetters(r.line)).toBe(false);
    expect(r.nonLatin).toEqual(expect.arrayContaining(['شعر داكن، ثوب مطرز', 'شعر داكن hair', 'خاتم']));
    expect(r.line).toContain('a man of about 70');
  });
  it('keeps a stored English line, adding the style and, when it has none, the age', () => {
    expect(canonicalIdentityLine({ ...kiteMaker, canon: { identityLine: 'Identity: short grey hair; full white beard.' } }, { style: 'ANIME' }).line).toBe('Identity: 2D anime character, a man of about 70; short grey hair; full white beard.');
    expect(canonicalIdentityLine({ ...kiteMaker, canon: { identityLine: 'an elderly man, about 70 years old, white beard' } }).line).toBe('Identity: an elderly man, about 70 years old, white beard.');
  });
  it('detects non-Latin letters but not punctuation or accents', () => {
    expect(hasNonLatinLetters('café, 85 mm — “quoted”')).toBe(false);
    expect(hasNonLatinLetters('hair: أسود')).toBe(true);
  });
});

describe('the canonical prompt: medium first, one whole figure', () => {
  it('leads with the medium, then the framing, the identity line, the direction, the avoid list', () => {
    for (const style of ['CARTOON', 'ANIME', 'REALISTIC'] as const) {
      const p = canonicalPrompt({ style, identityLine: 'Identity: x.', character: 'CHAR', visual: 'VISUAL', avoid: 'AVOID' });
      expect(p.startsWith(STYLE_MEDIUM[style].lead)).toBe(true);
      expect(p).toContain('full-body front view facing the camera, the whole figure from the top of the head to the soles of the feet');
      expect(p.indexOf('Identity: x.')).toBeGreaterThan(p.indexOf('plain neutral mid-grey studio background'));
      expect(p.indexOf('CHAR.')).toBeGreaterThan(p.indexOf('Identity'));
      expect(p.indexOf('AVOID.')).toBeGreaterThan(p.indexOf('VISUAL.'));
    }
    expect(canonicalPrompt({ style: 'CARTOON', identityLine: '' })).toMatch(/^3D animated feature-film character design, stylized CG render, not a photograph:/);
    expect(negativeFor('CARTOON')).toContain('photograph');
    expect(negativeFor('ANIME')).toContain('3D render');
  });
  it('joins pieces as sentences (no run-ons)', () => {
    expect(sentences(['front view', 'Identical face', '', undefined, 'Done.'])).toBe('front view. Identical face. Done.');
  });
  it('redraws an upload into the production medium, face from image 2 when there is one', () => {
    const p = referenceCanonicalPrompt({ style: 'ANIME', identityLine: 'Identity: z.', faceImage: true });
    expect(p).toContain('Redraw the person in image 1, with the face exactly as in image 2, as a 2D anime character');
    expect(p).toContain('one character, full-body front view');
    expect(p).toContain('Identity: z.');
    expect(referenceCanonicalPrompt({ style: 'REALISTIC', identityLine: '' })).not.toContain('image 2');
  });
});

describe('the canonical graphs', () => {
  it('text: Qwen-Image-2512 in quality mode by default (30 steps, cfg 4, no Lightning), 928×1664', () => {
    const g = qwenCanonicalImage({ prompt: 'p', negative: 'n', seed: 7 });
    linked(g);
    expect(g['4']).toBeUndefined();
    expect(g['9'].inputs).toMatchObject({ steps: 30, cfg: 4, seed: 7 });
    expect(g['8'].inputs).toMatchObject({ width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height });
    expect(g[CANONICAL_OUTPUT].class_type).toBe('SaveImage');
    const draft = qwenCanonicalImage({ prompt: 'p', quality: false });
    expect(draft['4'].inputs.lora_name).toBe(MODELS.qwenLightning);
    expect(draft['9'].inputs).toMatchObject({ steps: 8, cfg: 1 });
    expect(workflowVersion(qwenCanonicalImage({ prompt: 'a', seed: 1 }))).toBe(workflowVersion(qwenCanonicalImage({ prompt: 'b', seed: 2 })));
  });
  it('reference: Edit-2511 quality mode, the upload as image 1 and its face cut in the graph as image 2', () => {
    const g = qwenReferenceCanonical({ upload: 'up.png', faceRect: { x: 300.4, y: 200, width: 400, height: 400 }, prompt: 'p', seed: 3 });
    linked(g);
    expect(g['4']).toBeUndefined();
    expect(g.facecrop.inputs).toMatchObject({ x: 300, y: 200, width: 400, height: 400, image: ['img1', 0] });
    expect(g['6'].inputs).toMatchObject({ image1: ['img1s', 0], image2: ['img2s', 0] });
    expect(g['9'].inputs).toMatchObject({ steps: 24, cfg: 4 });
    expect(g['8'].inputs).toMatchObject({ width: 928, height: 1664 });
    const plain = qwenReferenceCanonical({ upload: 'up.png', prompt: 'p' });
    expect(plain['6'].inputs.image2).toBeUndefined();
    expect(qwenReferenceCanonical({ upload: 'up.png', face: 'f.png', prompt: 'p' })['img2'].inputs.image).toBe('f.png');
  });
  it('reads a reference in one prompt: MediaPipe boxes and, when the vision model is installed, its description', () => {
    const g = referenceReadGraph({ image: 'up.png', describe: true });
    linked(g);
    expect(classes(g)).toEqual(expect.arrayContaining(['LoadMediaPipeFaceLandmarker', 'MediaPipeFaceLandmarker', 'TextGenerate', 'CLIPLoader']));
    expect(g[FACE_CHECK_OUTPUTS.bboxes].class_type).toBe('PreviewAny');
    expect(g[vlmOutput(REFERENCE_DESCRIBE_KEY)].class_type).toBe('PreviewAny');
    expect(g.clip.inputs.clip_name).toBe(MODELS.vlm);
    expect(String(g.gen_0.inputs.prompt)).toBe(DESCRIBE_PROMPT);
    expect(classes(referenceReadGraph({ image: 'up.png', describe: false }))).not.toContain('TextGenerate');
  });
  it('the vision model runs greedy (sampling off, thinking off), one model load for many pictures', () => {
    const g = qwenVlmText({ items: [{ key: 'a', image: 'a.png', prompt: 'q' }, { key: 'b', image: 'b.png', prompt: 'q' }], system: 'sys', maxLength: 900 });
    linked(g);
    expect(classes(g).filter((c) => c === 'CLIPLoader')).toHaveLength(1);
    expect(g.gen_0.inputs).toMatchObject({ sampling_mode: 'off', thinking: false, max_length: 900, system_prompt: ['sys', 0] });
    expect(() => qwenVlmText({ items: [{ key: 'x y', image: 'a', prompt: 'q' }] })).toThrow();
    expect(() => qwenVlmText({ items: [] })).toThrow();
  });
});

describe('the face crop of an upload', () => {
  it('parses MediaPipe boxes from PreviewAny text, largest first', () => {
    const text = '[\n [\n {"x": 10, "y": 20, "width": 30, "height": 40, "label": "face", "score": 0.9},\n {"x": 319.5, "y": 245.4, "width": 356.7, "height": 408.2, "label": "face", "score": 0.96}\n ]\n]';
    const boxes = parseFaceBoxes(text);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x).toBeCloseTo(319.5);
    expect(boxes[0].score).toBeCloseTo(0.96);
    expect(parseFaceBoxes('not json')).toEqual([]);
    expect(parseFaceBoxes(['[[]]'])).toEqual([]);
  });
  it('cuts a square with a margin that holds the whole box and reaches below the chin, inside the picture', () => {
    const box = { x: 320, y: 245, width: 357, height: 408 };
    const r = faceCropRect(box, { width: 1024, height: 1280 });
    expect(r.width).toBe(r.height);
    expect(r.x).toBeLessThanOrEqual(box.x); expect(r.y).toBeLessThanOrEqual(box.y);
    expect(r.x + r.width).toBeGreaterThanOrEqual(box.x + box.width);
    expect(r.y + r.height).toBeGreaterThan(box.y + box.height + 0.2 * box.height);
    for (const b of [{ x: 0, y: 0, width: 300, height: 300 }, { x: 900, y: 1100, width: 120, height: 170 }, { x: 0, y: 0, width: 1024, height: 1280 }]) {
      const q = faceCropRect(b, { width: 1024, height: 1280 });
      expect(q.x).toBeGreaterThanOrEqual(0); expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.x + q.width).toBeLessThanOrEqual(1024); expect(q.y + q.height).toBeLessThanOrEqual(1280);
    }
  });
});

describe('the description of an uploaded picture', () => {
  it('parses a fenced, chatty answer and writes an English line without low-confidence or invisible fields', () => {
    const text = 'Here is the description:\n```json\n{"ageRange": "40-50", "sex": "female", "build": "medium", "skinTone": "light olive", "faceShape": "oval", "hair": {"colour": "greying black", "length": "long", "texture": "straight", "style": "low bun"}, "facialHair": "none", "eyes": {"colour": "brown"}, "glasses": "rectangular black glasses", "marks": ["small mole above the left lip"], "clothing": [{"item": "lab coat", "colour": "white", "pattern": "plain"}, {"item": "blouse", "colour": "burgundy"}], "footwear": "not visible", "accessories": [], "notVisible": ["shoes"], "confidence": {"marks": "low", "ageRange": "medium"}}\n```';
    const d = parseCharacterDescription(text);
    expect(d.hair.colour).toBe('greying black');
    expect(d.clothing).toHaveLength(2);
    const { line, lowConfidence, notVisible } = identityLineFromDescription(d, { style: 'CARTOON' });
    expect(line.startsWith('Identity: stylized 3D animated character, a woman aged about 40-50; ')).toBe(true);
    expect(line).toContain('wearing white lab coat, burgundy blouse');
    expect(line).toContain('rectangular black glasses');
    expect(line).toContain('no facial hair');
    expect(line).not.toContain('mole');
    expect(line).not.toContain('not visible');
    expect(lowConfidence).toEqual(['marks']);
    expect(notVisible).toEqual(expect.arrayContaining(['shoes', 'footwear']));
    expect(() => parseCharacterDescription('no json here')).toThrow();
  });
  it('tolerates strings where objects were asked for, and a <think> block', () => {
    const d = parseCharacterDescription('<think>let me see</think>{"hair": "short brown", "eyes": "green", "clothing": ["red scarf"], "accessories": "watch, ring"}');
    expect(d.hair.style).toBe('short brown');
    expect(d.eyes).toBe('green');
    expect(d.clothing[0].item).toBe('red scarf');
    expect(d.accessories).toEqual(['watch', 'ring']);
    // the vision model answered "black, rectangular frames" for the glasses on the real test upload
    expect(identityLineFromDescription(parseCharacterDescription('{"glasses": "black, rectangular frames"}')).line).toContain('glasses (black, rectangular frames)');
    expect(firstJsonObject('x {"a": {"b": "}"}} y')).toEqual({ a: { b: '}' } });
  });
  it('reads a medium / full-body judgement', () => {
    expect(parseStyleJudgement('{"medium": "3d_render", "fullBody": true, "figures": 1}')).toEqual({ medium: '3d_render', fullBody: true, figures: 1 });
    expect(parseStyleJudgement('```json\n{"medium": "Photograph", "fullBody": "no"}\n```')).toMatchObject({ medium: 'photograph', fullBody: false });
    expect(EXPECTED_MEDIUM).toEqual({ CARTOON: '3d_render', ANIME: '2d_drawing', REALISTIC: 'photograph' });
  });
});
