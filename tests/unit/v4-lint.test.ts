import { describe, expect, it } from 'vitest';
import { lintPaths, lintText } from '../../scripts/v4-lint.mjs';

/** docs/DESIGN-SYSTEM-V4.md §1.5 and §8.4 gate 2: what Lights Down refuses, as a lint every package passes on the
 *  files it owns. These cases pin each rule both ways, so a later change to the lint cannot quietly let one through
 *  or start refusing the logical, tokenised forms the design asks for. */

type Finding = { rule: string; line: number };
const rules = (file: string, text: string) => (lintText(file, text) as Finding[]).map((f) => f.rule);
const C = 'src/components/x/Thing.tsx';
const S = 'src/app/styles/kit.css';

describe('v4-lint refuses', () => {
  it.each([
    ['blur', C, '<div className="backdrop-blur-md" />'],
    ['blur', S, '.chip { backdrop-filter: blur(8px); }'],
    ['dialog', C, 'if (window.confirm(msg)) remove();'],
    ['dialog', 'src/lib/hooks.ts', 'const name = window.prompt("Name");'],
    ['gradient', C, '<div className="bg-gradient-to-br from-a to-b" />'],
    ['gradient', C, "style={{ background: 'radial-gradient(circle, red, blue)' }}"],
    ['glow', C, '<span className="drop-shadow" />'],
    ['shouting', C, '<span className="text-xs uppercase" />'],
    ['shouting', C, '<h3 className="tracking-[-0.015em]" />'],
    ['shouting', C, '<h3 className="tracking-widest" />'],
    ['shouting', S, '.k { letter-spacing: 0.12em; }'],
    ['shouting', S, '.k { text-transform: uppercase; }'],
    ['raw-colour', C, "style={{ color: '#0e0f14' }}"],
    ['raw-colour', C, '<div style={{ background: `hsl(${h} 60% 50%)` }} />'],
    ['raw-colour', S, '.b { border-color: rgba(240, 127, 116, 0.4); }'],
    ['raw-colour', 'src/app/styles/base.css', '::selection { background: #a99ff5; }'],
    ['physical', C, '<div className="absolute left-3 top-3" />'],
    ['physical', C, '<div className="ml-2 pr-4 text-right" />'],
    ['physical', C, '<div className="sm:border-l-2 rounded-r" />'],
    ['physical', C, "<b style={{ left: '50%' }} />"],
    ['physical', S, '.x { margin-left: 4px; }'],
    ['physical', S, '.x { text-align: left; }'],
    ['engine', 'src/lib/i18n/v4/cast.ts', "  'voice.x': ['MiniMax clone', 'استنساخ MiniMax'],"],
    ['engine', C, '<p className="hint">Rendered by ComfyUI on the GPU</p>'],
  ])('%s in %s: %s', (rule, file, text) => {
    expect(rules(file, text)).toContain(rule);
  });
});

describe('v4-lint accepts', () => {
  it.each([
    [C, '<div className="absolute start-3 top-3 ms-2 pe-4 text-end border-s rounded-e" />'],
    [C, '<div className="rounded-lg border-line text-lg border-line-strong ps-3" />'],
    [C, '<a href="#main" className="sr-only">Skip</a>'],
    [C, '<div className="bg-surface text-fg" style={{ color: "var(--fg)" }} />'],
    [C, '// uses window.confirm today; MiniMax and #fff in a comment are not code'],
    [C, '/** the TrackCover radial-gradient is refused */'],
    [C, "const engine = job.provider === 'MINIMAX';"],
    [S, '.x { margin-inline-start: 4px; inset-inline-end: 0; text-align: start; letter-spacing: -0.02em; }'],
    [S, '.x { background: color-mix(in srgb, var(--accent) 32%, transparent); }'],
    ['src/app/styles/tokens.css', ':root { --ink-950: #0d0c0b; --accent-soft: rgb(169 159 245 / 0.12); }'],
    ['src/components/players/TheatrePlayer.tsx', '<div className="backdrop-blur-md" />'],
    [S, "html[dir='rtl'] [dir='auto'] { text-align: right; } /* v4-lint: allow physical — match-parent is dropped by Chromium */"],
    ['src/lib/i18n/v4/cast.ts', "  'voice.engine.minimax': ['Hosted voice clone', 'استنساخ مستضاف'],"],
  ])('%s: %s', (file, text) => {
    expect(rules(file, text)).toEqual([]);
  });
});

describe('the files F0 and F1 own', () => {
  it('pass the lint (tokens, base, type, fonts, the title shell, the split dictionary module)', () => {
    const found = lintPaths(['src/app/styles/tokens.css', 'src/app/styles/base.css', 'src/app/styles/type.css', 'src/app/fonts.ts', 'src/app/boot.ts', 'src/app/globals.css', 'src/components/shell', 'src/lib/i18n.ts']) as Array<Finding & { file: string; text: string }>;
    expect(found.map((f) => `${f.file}:${f.line} ${f.rule} ${f.text}`)).toEqual([]);
  });
});
