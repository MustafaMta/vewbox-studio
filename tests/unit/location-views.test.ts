import { describe, expect, it } from 'vitest';
import { landmarkLabel, landmarkViewPrompt } from '@/worker/handlers/images';

/** D24: a location's views — a closer view towards the first landmark, named honestly; no "reverse angle". */
describe('location views (D24)', () => {
  it('writes the measured landmark wording', () => {
    expect(landmarkViewPrompt('A long wooden workbench in the centre, covered in radio parts.')).toBe('A closer view of the same place, the camera moved forward towards a long wooden workbench in the centre, covered in radio parts, which fills the middle of the frame. Keep the same materials, colours, furnishings, style of rendering and lighting.');
  });
  it('labels the view by the landmark itself, without its position', () => {
    expect(landmarkLabel('A long wooden workbench in the centre, covered in radio parts, under a hanging lamp')).toBe('a long wooden workbench');
    expect(landmarkLabel('The framed photo of his wife on the right wall')).toBe('the framed photo of his wife');
    expect(landmarkLabel('A large multi-pane window on the back wall, facing the sea')).toBe('a large multi-pane window');
  });
});
