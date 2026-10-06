import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Segmented } from '@/components/ui/kit';

/** QA S5: on the film's first shot both "Continuous" and "Cut" are disabled for the same reason, and the sentence was
 *  printed twice. A reason shared by several disabled options is said once; each option is described by it. */
describe('Segmented: a shared disabled reason is said once', () => {
  it('two options, one reason: one line, both described by it; different reasons stay apart', () => {
    const why = 'The film’s first shot has no shot before it: it starts fresh.';
    const html = renderToStaticMarkup(h(Segmented, { label: 'Join', value: 'transition', onChange: () => {}, options: [{ value: 'continuous', label: 'Continuous', disabled: true, reason: why }, { value: 'cut', label: 'Cut', disabled: true, reason: why }, { value: 'transition', label: 'Transition' }] }));
    expect(html.split(why).length - 1).toBe(1);
    const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
    const two = renderToStaticMarkup(h(Segmented, { label: 'View', value: 'take', onChange: () => {}, options: [{ value: 'take', label: 'Take' }, { value: 'a', label: 'A', disabled: true, reason: 'No A yet.' }, { value: 'b', label: 'B', disabled: true, reason: 'No B yet.' }] }));
    expect(two).toContain('No A yet.'); expect(two).toContain('No B yet.');
  });
});
