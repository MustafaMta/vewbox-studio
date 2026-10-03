import { describe, expect, it } from 'vitest';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { STUDIO_ERROR_CODES } from '@/domain/errors';
import { KEYS, T } from '@/lib/copy';
import { ENGINE_NAMES } from '../../scripts/v4-lint.mjs';
import * as Kit from '@/components/ui/kit';
import * as Page from '@/components/ui/page';
import { KNOWN, ERROR_COPY, FailureNotice, useErrorCopy, type ErrorCopy } from '@/components/ui/progress';
import { toastDuration } from '@/components/ui/toast';
import { rovingIndex, rovingStep, tabStops } from '@/components/ui/kit/focus';
import { activeFilterCount, parseFilters, serializeFilters, toggleFilter } from '@/components/ui/kit/CatalogueBar';
import { addChips, needsErrorSummary } from '@/components/ui/kit/Field';
import { sectionInView } from '@/components/ui/kit/Tabs';

/** The interface kit (docs/DESIGN-SYSTEM-V4.md §5, package F2): the keyboard rules as pure functions, the markup
 *  each component promises (rendered on the server: there is no DOM here — the browser behaviour is driven by
 *  tests/e2e/v4 on /kit), the v3 exports kept for the pages, and AUDIT D6. */

const html = (el: ReactElement) => renderToStaticMarkup(el);

describe('roving focus (Tabs, Segmented, ChoiceTiles, menus)', () => {
  it('← and → follow the reading direction; ↑ ↓ move along a column; Home and End jump', () => {
    expect(rovingStep('ArrowRight')).toBe('next');
    expect(rovingStep('ArrowLeft')).toBe('prev');
    expect(rovingStep('ArrowDown')).toBeNull();
    expect(rovingStep('ArrowDown', { orientation: 'both' })).toBe('next');
    expect(rovingStep('ArrowRight', { orientation: 'vertical' })).toBeNull();
    expect(rovingStep('Home')).toBe('first');
    expect(rovingStep('End')).toBe('last');
    expect(rovingStep('a')).toBeNull();
  });
  it('skips disabled items and wraps (or stops at the ends)', () => {
    const d = [false, true, false, false];
    expect(rovingIndex('next', 0, d)).toBe(2);
    expect(rovingIndex('next', 3, d)).toBe(0);
    expect(rovingIndex('next', 3, d, false)).toBe(-1);
    expect(rovingIndex('prev', 2, d)).toBe(0);
    expect(rovingIndex('first', 3, [true, false])).toBe(1);
    expect(rovingIndex('last', 0, [false, true])).toBe(0);
    expect(rovingIndex('next', 0, [true, true])).toBe(-1);
  });
  it('a radio group is one Tab stop: the checked radio, else the first', () => {
    const r = (id: string, name: string, checked = false) => ({ id, tabIndex: 0, radioName: name, checked });
    const stops = tabStops([{ id: 'close', tabIndex: 0 }, r('a', 'm'), r('b', 'm', true), r('c', 'm'), { id: 'skip', tabIndex: -1 }, { id: 'off', tabIndex: 0, disabled: true }, r('x', 'n'), r('y', 'n'), { id: 'save', tabIndex: 0 }]);
    expect(stops.map((s) => s.id)).toEqual(['close', 'b', 'x', 'save']);
  });
  it('scrollspy: the last section whose top has passed the offset', () => {
    const tops = [{ id: 'a', top: -400 }, { id: 'b', top: 60 }, { id: 'c', top: 900 }];
    expect(sectionInView(tops, 80)).toBe('b');
    expect(sectionInView(tops, 20)).toBe('a');
    expect(sectionInView([{ id: 'a', top: 300 }], 80)).toBe('a');
  });
});

describe('the catalogue bar state (§7.4: ?f=style:CARTOON,lang:AR)', () => {
  it('parses, serialises in facet order, and survives odd values', () => {
    expect(parseFilters('style:CARTOON,lang:AR,lang:EN,lang:AR,broken,:x,y:')).toEqual({ style: ['CARTOON'], lang: ['AR', 'EN'] });
    expect(serializeFilters({ lang: ['AR'], style: ['CARTOON'], empty: [] }, ['style', 'lang'])).toBe('style:CARTOON,lang:AR');
    const odd = { genre: ['Drama, family'] };
    expect(parseFilters(serializeFilters(odd))).toEqual(odd);
    expect(parseFilters(null)).toEqual({});
  });
  it('a "one" facet holds one value, a "many" facet toggles; empty facets go', () => {
    expect(toggleFilter({ style: ['ANIME'] }, 'style', 'CARTOON', 'one')).toEqual({ style: ['CARTOON'] });
    expect(toggleFilter({ style: ['ANIME'] }, 'style', '', 'one')).toEqual({});
    expect(toggleFilter({ lang: ['AR'] }, 'lang', 'EN')).toEqual({ lang: ['AR', 'EN'] });
    expect(toggleFilter({ lang: ['AR'] }, 'lang', 'AR')).toEqual({});
    expect(activeFilterCount({ a: ['1', '2'], b: ['3'] })).toBe(3);
  });
});

describe('forms', () => {
  it('chips: commas (Latin and Arabic) split, no empties, no repeats, at most max', () => {
    expect(addChips(['Round glasses'], ' a scar , round GLASSES،  freckles ,')).toEqual(['Round glasses', 'a scar', 'freckles']);
    expect(addChips([], 'a, b, c', 2)).toEqual(['a', 'b']);
  });
  it('more than three errors earn a summary', () => {
    expect(needsErrorSummary(3)).toBe(false);
    expect(needsErrorSummary(4)).toBe(true);
    const errors = ['a', 'b', 'c'].map((id) => ({ id, message: id }));
    expect(html(h(Kit.ErrorSummary, { errors }))).toBe('');
    const four = html(h(Kit.ErrorSummary, { errors: [...errors, { id: 'd', message: 'd' }] }));
    expect(four).toContain('role="alert"');
    expect(four).toContain('href="#d"');
  });
  it('Field ties its message to the control and says "optional" at the end of the label row', () => {
    const out = html(h(Kit.Field, { label: 'Title', error: 'Give it a title.', optional: true, children: h(Kit.Input, {}) }));
    expect(out).toMatch(/<label for="([^"]+)"[^>]*>Title<\/label>/);
    const id = out.match(/<label for="([^"]+)"/)![1];
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain(`aria-describedby="${id}-help"`);
    expect(out).toContain('optional');
  });
});

describe('choices and tabs render as one radiogroup / tablist with one Tab stop', () => {
  it('ChoiceTiles: radios with aria-checked, the selected one tabbable, a disabled one says why', () => {
    const out = html(h(Kit.ChoiceTiles<'a' | 'b' | 'c'>, { label: 'How', value: 'b', onChange: () => undefined, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', hint: 'bee' }, { value: 'c', label: 'C', disabled: true, reason: 'Needs X' }] }));
    expect(out).toContain('role="radiogroup"');
    expect(out.match(/role="radio"/g)).toHaveLength(3);
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-checked="true" tabindex="0"/);
    expect(out).toContain('Needs X');
    expect(out).toMatch(/disabled="" aria-describedby="[^"]+"/);
  });
  it('Segmented: the reason of a disabled option is text beside the control', () => {
    const out = html(h(Kit.Segmented<'song' | 'video'>, { label: 'Mode', value: 'song', onChange: () => undefined, options: [{ value: 'song', label: 'Song' }, { value: 'video', label: 'Video', disabled: true, reason: 'No cut yet' }] }));
    expect(out).toContain('No cut yet');
    expect(out).toContain('aria-describedby');
  });
  it('TabBar with buttons controls its panels; the selected tab is the one Tab stop', () => {
    const out = html(h(Kit.TabBar, { tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', count: 3 }], current: 'b', onSelect: () => undefined, ariaLabel: 'Work', idBase: 'w' }));
    expect(out).toContain('role="tablist"');
    expect(out).toContain('aria-controls="w-panel-b"');
    expect(out).toMatch(/aria-selected="true" tabindex="0"/);
    expect(out).toContain('<span class="count">3</span>');
    expect(html(h(Kit.TabPanel, { idBase: 'w', id: 'a', current: 'b', children: 'x' }))).toBe('');
  });
});

describe('status, states and overlays say it in words', () => {
  it('StateWord carries its tone; IdentityState uses the contract words', () => {
    expect(html(h(Kit.StateWord, { tone: 'waiting', children: 'Waiting for you' }))).toContain('data-tone="waiting"');
    expect(html(h(Kit.IdentityState, { state: 'draft' }))).toContain('Draft — awaiting your approval');
    expect(html(h(Kit.IdentityState, { state: 'locked', videos: 2 }))).toContain('Locked · in 2 videos');
    expect(html(h(Kit.IdentityState, { state: 'locked', videos: 1 }))).toContain('Locked · in 1 video');
    expect(html(h(Kit.StageWord, { stage: 'PRODUCE' }))).toContain('Producing');
  });
  it('ErrorNotice: the raw message only inside Details, in .tc, left to right', () => {
    const out = html(h(Kit.ErrorNotice, { title: 'It failed.', why: 'Plain words.', details: 'RuntimeError: x at y' }));
    const [before, inside] = out.split('<details');
    expect(before).not.toContain('RuntimeError');
    expect(inside).toContain('class="notice-raw tc"');
    expect(inside).toContain('dir="ltr"');
  });
  it('PageEmpty shows one primary and at most two alternatives', () => {
    const b = (x: string) => h('button', { key: x }, x);
    const out = html(h(Kit.PageEmpty, { primary: b('P'), alternatives: [b('A1'), b('A2'), b('A3')], children: 'One sentence.' }));
    expect(out).toContain('A2');
    expect(out).not.toContain('A3');
  });
  it('toasts: 5 s; 10 s with an action, a link or an error; a sticky one stays', () => {
    expect(toastDuration({ tone: 'ok' })).toBe(5000);
    expect(toastDuration({ tone: 'info', action: { label: 'Undo', onClick: () => undefined } })).toBe(10000);
    expect(toastDuration({ tone: 'ok', link: { label: 'Open', href: '/x' } })).toBe(10000);
    expect(toastDuration({ tone: 'bad' })).toBe(10000);
    expect(toastDuration({ tone: 'ok', sticky: true })).toBeNull();
  });
});

describe('every v3 export still works (re-export shims until Q1, §8.2 rule 6)', () => {
  it('ui/kit', () => {
    for (const name of ['cls', 'Button', 'LinkButton', 'Spinner', 'Dropzone', 'ConfirmButton', 'Menu', 'MenuItem', 'MenuLink', 'Field', 'Input', 'Textarea', 'Select', 'Checkbox', 'Toggle', 'Segmented', 'Badge', 'Status', 'SampleMark', 'Card', 'Details', 'KV', 'ConfirmDelete', 'Modal', 'ChoiceCards', 'Notice', 'Thumb', 'TabBar', 'PickGrid', 'AddTile']) {
      expect(typeof (Kit as Record<string, unknown>)[name], name).toBe('function');
    }
  });
  it('ui/page', () => {
    for (const name of ['PageHeader', 'Section', 'FactList', 'ProgressBar', 'CastStack']) expect(typeof (Page as Record<string, unknown>)[name], name).toBe('function');
  });
});

describe('AUDIT D6 — every StudioError code has plain words and its own recovery', () => {
  it('KNOWN is the table of every code (typed Record<StudioErrorCode, …>), including CONSENT_REQUIRED and ASSET_PROTECTED', () => {
    for (const code of STUDIO_ERROR_CODES) { expect(KNOWN[code], code).toBeTruthy(); expect(KNOWN[code]).toBe(ERROR_COPY[code]); }
    expect(KNOWN.CONSENT_REQUIRED.kind).toBe('consent');
    expect(KNOWN.ASSET_PROTECTED.kind).toBe('usage');
  });
  it('the words exist and name no engine', () => {
    const engine = new RegExp(`\\b(${ENGINE_NAMES.join('|')})`, 'i');
    for (const [code, e] of Object.entries(ERROR_COPY)) {
      for (const k of [e.title, e.hint, e.fix]) {
        expect(KEYS, `${code}: ${k}`).toContain(k);
        const en = T(k);
        expect(en.trim(), `${code} ${k}`).not.toBe('');
        expect(en, `${code} ${k}`).not.toMatch(engine);
      }
    }
  });
  it('the engine’s own message never becomes the words: it is the detail, shown only in Details', () => {
    let copy: ErrorCopy | null = null;
    const Probe = () => { copy = useErrorCopy()({ code: 'CONSENT_REQUIRED', message: 'Recording sample-3 has no consent statement (MiniMax clone refused)' }); return null; };
    html(h(Probe));
    expect(copy!.title).toBe(T('err.CONSENT_REQUIRED'));
    expect(copy!.hint).toBe(T('err.CONSENT_REQUIRED.hint'));
    expect(copy!.detail).toContain('no consent statement');
    expect(copy!.fix.kind).toBe('consent');
    const out = html(h(FailureNotice, { copy: copy! }));
    const [before, inside] = out.split('<details');
    expect(before).not.toContain('MiniMax');
    expect(inside).toContain('no consent statement');
    let unknown: ErrorCopy | null = null;
    const Probe2 = () => { unknown = useErrorCopy()({ code: 'ECONNRESET', message: 'socket hang up' }); return null; };
    html(h(Probe2));
    expect(unknown!.title).toBe(T('err.unknown'));
    expect(unknown!.hint).not.toContain('socket');
    expect(unknown!.fix.kind).toBe('retry');
  });
});
