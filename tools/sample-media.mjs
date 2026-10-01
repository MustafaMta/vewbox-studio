#!/usr/bin/env node
/** SAMPLE MEDIA — every picture, clip and sound the prototype ships is made here, from nothing, and carries a small
 *  SAMPLE tag. Pictures are SVG illustrations drawn by this script: the café, the book alley, the rooftop, the
 *  riverbank, the hospital corridor and the kites roof as scenes with their people; each character as a portrait
 *  built from their written profile (Basbousa is a cat). Clips and audio are synthesised with ffmpeg. Nothing here
 *  is a photograph, a recording, a licensed asset or the output of any model — provenance is this file.
 *
 *  Usage: node tools/sample-media.mjs [--pictures]   (needs ffmpeg on PATH for the clips and audio; pictures need nothing) */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'sample');
for (const d of ['covers', 'characters', 'locations', 'frames', 'takes', 'audio']) mkdirSync(join(OUT, d), { recursive: true });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const write = (rel, svg) => writeFileSync(join(OUT, rel), svg);
const f = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------------------------------- palettes

/** Light by time of day: sky stops (top → horizon), the ground, the colour of light, whether lamps are lit. */
const TIMES = {
  DAWN: { sky: ['#2a2346', '#b9655e', '#f0b58e'], ground: '#3d3140', wall: '#8d6a56', light: '#ffd9b3', lit: false, warm: '#e9a27a' },
  MORNING: { sky: ['#7fb0d6', '#cfe1ec', '#f3e6c6'], ground: '#6d6252', wall: '#c8a882', light: '#fff5da', lit: false, warm: '#f1c98b' },
  AFTERNOON: { sky: ['#5f9ccc', '#bcd7e6', '#efe0b9'], ground: '#77654e', wall: '#c7a07a', light: '#fff0c6', lit: false, warm: '#f0c27f' },
  GOLDEN_HOUR: { sky: ['#3b2b4c', '#d6703f', '#f8c96c'], ground: '#4a3227', wall: '#a86f4c', light: '#ffd27a', lit: false, warm: '#f5a860' },
  DUSK: { sky: ['#1a1838', '#5a3a70', '#d47a5e'], ground: '#28233a', wall: '#6a4f5f', light: '#ffc98a', lit: true, warm: '#f2a56b' },
  NIGHT: { sky: ['#0a0f22', '#172344', '#24345c'], ground: '#131a2b', wall: '#3a4058', light: '#ffd98c', lit: true, warm: '#f0b866' },
  RAIN: { sky: ['#37424e', '#657580', '#9aa6ad'], ground: '#363c43', wall: '#7d7d78', light: '#e4ebef', lit: false, rain: true, warm: '#b8c2c8' },
  NEON: { sky: ['#12081f', '#3a1450', '#7a2a6c'], ground: '#1a1026', wall: '#3d2350', light: '#ff8fd0', lit: true, warm: '#ff6fb0' },
};

/** The characters, as colours and features drawn from their written profiles. */
const CH = {
  'abu-samir': { skin: '#c99a6b', hair: '#b8b3ac', hairStyle: 'back', top: '#f2eadb', layer: '#6b4a2e', moustache: '#b8b3ac', glasses: true, beads: true, heavy: true, style: 'CARTOON', bg: 30 },
  layla: { skin: '#d9b38c', hair: '#1d1a1f', hairStyle: 'scarf', scarf: '#3f8f5a', top: '#dbe4ee', stripes: '#3f5f88', layer: '#37527a', pen: true, scar: true, style: 'CARTOON', bg: 350 },
  karim: { skin: '#8a5a3b', hair: '#221c1e', hairStyle: 'curls', top: '#2b2b34', layer: '#a3743f', stubble: true, style: 'CARTOON', bg: 60 },
  hana: { skin: '#f1ddd0', hair: '#15121a', hairStyle: 'bob', top: '#2f8f8a', layer: '#7f838b', lanyard: '#c94c4c', circles: true, style: 'ANIME', bg: 300 },
  'the-cat': { cat: true, fur: '#d98a3e', stripe: '#a95f24', eyes: '#5fb36b', collar: '#c93b3b', style: 'CARTOON', bg: 80 },
  'um-hassan': { skin: '#c9966a', hair: '#7a3a64', hairStyle: 'hijab', top: '#8a8d93', layer: '#f1ece2', style: 'CARTOON', bg: 330 },
  nour: { skin: '#9a6a4c', hair: '#2a1d1c', hairStyle: 'long', top: '#f4f1ea', layer: '#33303d', eyes: '#3a2a22', style: 'REALISTIC', bg: 210 },
};

// ------------------------------------------------------------------------------------------------------ helpers

function svg(w, h, P, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)} — sample illustration">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky[0]}"/><stop offset="0.55" stop-color="${P.sky[1]}"/><stop offset="1" stop-color="${P.sky[2]}"/></linearGradient>
<linearGradient id="vig" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${P.light}" stop-opacity="0.9"/><stop offset="0.35" stop-color="${P.light}" stop-opacity="0.25"/><stop offset="1" stop-color="${P.light}" stop-opacity="0"/></radialGradient>
</defs>
${body.join('\n')}
<rect width="${w}" height="${h}" fill="url(#vig)"/>
${tag(w, h)}
</svg>`;
}
function tag(w, h) {
  const fs = Math.round(Math.min(w, h) * 0.075);
  return `<g transform="translate(${f(w - fs * 2.2)}, ${f(h - fs * 1.15)})"><rect width="${f(fs * 1.9)}" height="${f(fs * 0.62)}" rx="${f(fs * 0.14)}" fill="black" opacity="0.5"/><text x="${f(fs * 0.95)}" y="${f(fs * 0.44)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="${f(fs * 0.3)}" font-weight="700" letter-spacing="1" fill="white" opacity="0.9">SAMPLE</text></g>`;
}
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}/>`;
const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" ${extra}/>`;
const ellipse = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${fill}" ${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, sw, extra = '') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linecap="round" ${extra}/>`;
const shade = (hex, k) => { // darken (k<1) or lighten (k>1) a hex colour
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = (v) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `#${[t(r), t(g), t(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const rnd = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 233280 + 1) % 4294967296; return (s / 4294967296); }; };

/** A person in a scene, from the shoulders (or the feet) up, in the character's colours. */
function person(x, baseY, hgt, c, { full = true, facing = 1, arms = 'down', prop = null } = {}) {
  const out = [];
  const hr = hgt * 0.085; const headY = baseY - hgt + hr * 1.1;
  const shoulder = hgt * (c.heavy ? 0.2 : 0.15);
  const torsoTop = headY + hr * 1.35; const torsoBottom = baseY - (full ? hgt * 0.42 : 0);
  // legs
  if (full) { out.push(rect(x - shoulder * 0.55, torsoBottom - hgt * 0.02, shoulder * 0.5, hgt * 0.42, shade(c.layer ?? c.top, 0.55))); out.push(rect(x + shoulder * 0.05, torsoBottom - hgt * 0.02, shoulder * 0.5, hgt * 0.42, shade(c.layer ?? c.top, 0.5))); }
  // torso
  out.push(path(`M${f(x - shoulder)} ${f(torsoTop + hgt * 0.04)} Q${f(x)} ${f(torsoTop - hgt * 0.02)} ${f(x + shoulder)} ${f(torsoTop + hgt * 0.04)} L${f(x + shoulder * 0.92)} ${f(torsoBottom)} L${f(x - shoulder * 0.92)} ${f(torsoBottom)} Z`, c.top));
  if (c.layer) out.push(path(`M${f(x - shoulder)} ${f(torsoTop + hgt * 0.04)} L${f(x - shoulder * 0.35)} ${f(torsoTop + hgt * 0.02)} L${f(x - shoulder * 0.3)} ${f(torsoBottom)} L${f(x - shoulder * 0.92)} ${f(torsoBottom)} Z M${f(x + shoulder)} ${f(torsoTop + hgt * 0.04)} L${f(x + shoulder * 0.35)} ${f(torsoTop + hgt * 0.02)} L${f(x + shoulder * 0.3)} ${f(torsoBottom)} L${f(x + shoulder * 0.92)} ${f(torsoBottom)} Z`, c.layer));
  // arms
  const armW = hgt * 0.045;
  if (arms === 'wide') { out.push(line(x - shoulder * 0.9, torsoTop + hgt * 0.06, x - shoulder * 2.1, torsoTop - hgt * 0.06, c.layer ?? c.top, armW)); out.push(line(x + shoulder * 0.9, torsoTop + hgt * 0.06, x + shoulder * 2.1, torsoTop - hgt * 0.06, c.layer ?? c.top, armW)); }
  else if (arms === 'tray') { out.push(line(x - shoulder * 0.9, torsoTop + hgt * 0.06, x - shoulder * 0.9 + facing * hgt * 0.18, torsoTop + hgt * 0.16, c.layer ?? c.top, armW)); out.push(line(x + shoulder * 0.9, torsoTop + hgt * 0.06, x + shoulder * 0.9 + facing * hgt * 0.1, torsoTop + hgt * 0.16, c.layer ?? c.top, armW)); out.push(rect(x + facing * hgt * 0.02 - hgt * 0.16, torsoTop + hgt * 0.15, hgt * 0.32, hgt * 0.025, '#d9d3c7')); out.push(rect(x + facing * hgt * 0.02 - hgt * 0.05, torsoTop + hgt * 0.1, hgt * 0.05, hgt * 0.05, '#f2ecdf')); }
  else { out.push(line(x - shoulder * 0.95, torsoTop + hgt * 0.07, x - shoulder * 1.05, torsoBottom - hgt * 0.02, c.layer ?? c.top, armW)); out.push(line(x + shoulder * 0.95, torsoTop + hgt * 0.07, x + shoulder * 1.05, torsoBottom - hgt * 0.02, c.layer ?? c.top, armW)); }
  // neck + head
  out.push(rect(x - hr * 0.3, headY + hr * 0.8, hr * 0.6, hr * 0.6, shade(c.skin, 0.85)));
  out.push(ellipse(x, headY, hr * 0.9, hr, c.skin));
  hairFor(out, x, headY, hr, c, facing);
  if (prop === 'notebook') out.push(rect(x + facing * shoulder * 0.9 - hgt * 0.04, torsoBottom - hgt * 0.1, hgt * 0.09, hgt * 0.11, '#7a4a2a', 'rx="2"'));
  if (prop === 'beads') for (let i = 0; i < 6; i++) out.push(circle(x - shoulder * 1.05 + i * 2, torsoBottom + i * hgt * 0.012, hgt * 0.012, '#c9a24a'));
  return out.join('');
}

/** Hair on a small scene head. */
function hairFor(out, x, y, hr, c, facing = 1) {
  if (c.cat) return;
  switch (c.hairStyle) {
    case 'back': out.push(path(`M${f(x - hr * 0.9)} ${f(y - hr * 0.25)} Q${f(x)} ${f(y - hr * 1.15)} ${f(x + hr * 0.9)} ${f(y - hr * 0.25)} Q${f(x)} ${f(y - hr * 0.55)} ${f(x - hr * 0.9)} ${f(y - hr * 0.25)} Z`, c.hair)); break;
    case 'scarf': out.push(path(`M${f(x - hr * 0.92)} ${f(y - hr * 0.1)} Q${f(x)} ${f(y - hr * 1.2)} ${f(x + hr * 0.92)} ${f(y - hr * 0.1)} Q${f(x)} ${f(y - hr * 0.5)} ${f(x - hr * 0.92)} ${f(y - hr * 0.1)} Z`, c.hair)); out.push(path(`M${f(x - hr * 0.95)} ${f(y - hr * 0.35)} Q${f(x)} ${f(y - hr * 1.0)} ${f(x + hr * 0.95)} ${f(y - hr * 0.35)} Q${f(x)} ${f(y - hr * 0.72)} ${f(x - hr * 0.95)} ${f(y - hr * 0.35)} Z`, c.scarf)); out.push(circle(x - facing * hr * 0.75, y - hr * 0.1, hr * 0.32, c.hair)); break;
    case 'curls': for (let i = -3; i <= 3; i++) out.push(circle(x + i * hr * 0.3, y - hr * 0.72 - Math.cos(i / 2) * hr * 0.15, hr * 0.32, c.hair)); break;
    case 'bob': out.push(path(`M${f(x - hr * 1.02)} ${f(y + hr * 0.45)} L${f(x - hr * 1.02)} ${f(y - hr * 0.2)} Q${f(x)} ${f(y - hr * 1.25)} ${f(x + hr * 1.02)} ${f(y - hr * 0.2)} L${f(x + hr * 1.02)} ${f(y + hr * 0.45)} L${f(x + hr * 0.78)} ${f(y + hr * 0.45)} L${f(x + hr * 0.78)} ${f(y - hr * 0.15)} Q${f(x)} ${f(y - hr * 0.7)} ${f(x - hr * 0.78)} ${f(y - hr * 0.15)} L${f(x - hr * 0.78)} ${f(y + hr * 0.45)} Z`, c.hair)); break;
    case 'hijab': out.push(path(`M${f(x - hr * 1.15)} ${f(y + hr * 1.3)} L${f(x - hr * 1.1)} ${f(y - hr * 0.2)} Q${f(x)} ${f(y - hr * 1.35)} ${f(x + hr * 1.1)} ${f(y - hr * 0.2)} L${f(x + hr * 1.15)} ${f(y + hr * 1.3)} Z`, c.hair)); out.push(ellipse(x, y + hr * 0.05, hr * 0.72, hr * 0.8, c.skin)); break;
    case 'long': out.push(path(`M${f(x - hr * 1.05)} ${f(y + hr * 1.9)} L${f(x - hr * 1.0)} ${f(y - hr * 0.2)} Q${f(x)} ${f(y - hr * 1.25)} ${f(x + hr * 1.0)} ${f(y - hr * 0.2)} L${f(x + hr * 1.05)} ${f(y + hr * 1.9)} L${f(x + hr * 0.75)} ${f(y + hr * 1.9)} L${f(x + hr * 0.72)} ${f(y - hr * 0.1)} Q${f(x)} ${f(y - hr * 0.68)} ${f(x - hr * 0.72)} ${f(y - hr * 0.1)} L${f(x - hr * 0.75)} ${f(y + hr * 1.9)} Z`, c.hair)); break;
  }
}

/** A cat in a scene: sitting, tail curled, unimpressed. */
function cat(x, baseY, size, c = CH['the-cat']) {
  const out = [];
  out.push(ellipse(x, baseY - size * 0.32, size * 0.42, size * 0.32, c.fur));
  out.push(path(`M${f(x + size * 0.38)} ${f(baseY - size * 0.15)} Q${f(x + size * 0.75)} ${f(baseY - size * 0.05)} ${f(x + size * 0.6)} ${f(baseY - size * 0.5)}`, 'none', `stroke="${c.fur}" stroke-width="${f(size * 0.09)}" stroke-linecap="round"`));
  out.push(circle(x, baseY - size * 0.7, size * 0.24, c.fur));
  out.push(poly([[x - size * 0.22, baseY - size * 0.82], [x - size * 0.2, baseY - size * 1.05], [x - size * 0.04, baseY - size * 0.9]], c.fur));
  out.push(poly([[x + size * 0.22, baseY - size * 0.82], [x + size * 0.2, baseY - size * 1.05], [x + size * 0.04, baseY - size * 0.9]], c.fur));
  for (const dx of [-0.12, 0, 0.12]) out.push(path(`M${f(x + dx * size)} ${f(baseY - size * 0.9)} q${f(size * 0.04)} ${f(size * 0.08)} 0 ${f(size * 0.14)}`, 'none', `stroke="${c.stripe}" stroke-width="${f(size * 0.035)}"`));
  out.push(ellipse(x - size * 0.09, baseY - size * 0.7, size * 0.05, size * 0.03, c.eyes)); out.push(ellipse(x + size * 0.09, baseY - size * 0.7, size * 0.05, size * 0.03, c.eyes));
  out.push(rect(x - size * 0.2, baseY - size * 0.48, size * 0.4, size * 0.045, c.collar));
  return out.join('');
}

// -------------------------------------------------------------------------------------------------------- scenes

/** The book alley: two walls in perspective, canvas awnings over stalls of books, a strip of sky. */
function alley(w, h, P, o = {}) {
  const out = []; const u = Math.min(w, h); const vx = w * 0.5, vy = h * 0.52;
  out.push(rect(0, 0, w, h, 'url(#sky)'));
  if (!P.rain) out.push(circle(w * 0.5, h * 0.2, h * 0.32, 'url(#glow)'));
  // far end: an arch and a gate of light
  out.push(rect(vx - w * 0.06, vy - h * 0.16, w * 0.12, h * 0.2, shade(P.wall, 0.6)));
  out.push(path(`M${f(vx - w * 0.04)} ${f(vy + h * 0.04)} L${f(vx - w * 0.04)} ${f(vy - h * 0.08)} Q${f(vx)} ${f(vy - h * 0.16)} ${f(vx + w * 0.04)} ${f(vy - h * 0.08)} L${f(vx + w * 0.04)} ${f(vy + h * 0.04)} Z`, P.light, 'opacity="0.8"'));
  // walls
  out.push(poly([[0, h * 0.02], [w * 0.36, vy - h * 0.2], [w * 0.36, vy + h * 0.16], [0, h * 0.98]], P.wall));
  out.push(poly([[w, h * 0.02], [w * 0.64, vy - h * 0.2], [w * 0.64, vy + h * 0.16], [w, h * 0.98]], shade(P.wall, 0.82)));
  // windows and balconies along the walls
  for (let i = 0; i < 5; i++) { const t = i / 5; const x = w * 0.05 + t * w * 0.28; const y = h * 0.14 + t * h * 0.2; const s = (1 - t) * 0.6 + 0.4; out.push(rect(x, y, w * 0.05 * s, h * 0.1 * s, P.lit ? P.light : shade(P.wall, 0.45), P.lit ? 'opacity="0.8"' : '')); out.push(rect(w - x - w * 0.05 * s, y, w * 0.05 * s, h * 0.1 * s, P.lit ? P.light : shade(P.wall, 0.4), P.lit ? 'opacity="0.7"' : '')); }
  // ground
  out.push(poly([[0, h * 0.98], [w * 0.36, vy + h * 0.16], [w * 0.64, vy + h * 0.16], [w, h * 0.98], [w, h], [0, h]], P.ground));
  out.push(poly([[0, h], [w * 0.36, vy + h * 0.16], [w * 0.64, vy + h * 0.16], [w, h]], shade(P.ground, 1.12)));
  // gutter along the left
  out.push(poly([[w * 0.06, h], [w * 0.37, vy + h * 0.16], [w * 0.385, vy + h * 0.17], [w * 0.1, h]], shade(P.ground, 0.7)));
  if (o.boats) for (const [t, s] of [[0.35, 1], [0.6, 0.7]]) { const bx = w * 0.06 + t * w * 0.31, by = h - t * (h - vy - h * 0.16); out.push(poly([[bx - w * 0.022 * s, by], [bx + w * 0.022 * s, by], [bx + w * 0.012 * s, by - h * 0.03 * s], [bx - w * 0.012 * s, by - h * 0.03 * s]], '#f2efe6')); out.push(poly([[bx - w * 0.006 * s, by - h * 0.03 * s], [bx + w * 0.006 * s, by - h * 0.03 * s], [bx, by - h * 0.065 * s]], '#f2efe6')); }
  // awnings and book stalls
  const stalls = [[0.02, 0.62, 1], [0.15, 0.5, 0.8], [0.25, 0.42, 0.62], [0.31, 0.37, 0.5]];
  const spines = ['#b8473a', '#3f6fb0', '#d9a441', '#3d8a63', '#7a4f9a', '#e0e0d8', '#c66b2b'];
  for (const [t, y, s] of stalls) {
    const x = w * t; const sw = w * 0.13 * s; const sh = h * 0.16 * s;
    out.push(poly([[x - w * 0.005, h * y - sh * 0.9], [x + sw, h * y - sh * 0.7], [x + sw * 0.95, h * y - sh * 0.45], [x - w * 0.005, h * y - sh * 0.6]], o.awning ?? (P.rain ? '#5a4a3a' : '#a8412f'), 'opacity="0.92"'));
    out.push(rect(x, h * y - sh * 0.35, sw, sh * 0.35, shade(P.wall, 0.5)));
    for (let i = 0; i < 9; i++) out.push(rect(x + i * (sw / 9), h * y - sh * 0.62, sw / 9 - 1, sh * 0.28, spines[(i + Math.round(t * 10)) % spines.length], 'opacity="0.9"'));
  }
  // lanterns at night
  if (P.lit) for (const [t, y] of [[0.12, 0.2], [0.28, 0.3], [0.72, 0.3], [0.9, 0.2]]) { out.push(circle(w * t, h * y, h * 0.06, 'url(#glow)')); out.push(circle(w * t, h * y, h * 0.012, P.light)); }
  // people
  if (o.layla) out.push(person(w * 0.55, h * 0.93, u * 0.62, CH.layla, { facing: -1 }));
  if (o.karimDoor) { out.push(rect(w * 0.6, h * 0.5, w * 0.07, h * 0.28, shade(P.wall, 0.5))); out.push(person(w * 0.63, h * 0.83, u * 0.36, CH.karim, { prop: 'notebook' })); }
  if (o.kids) { out.push(person(w * 0.2, h * 0.96, u * 0.34, { skin: '#c7956a', hair: '#1a1416', hairStyle: 'curls', top: '#d9c25a' }, { arms: 'down' })); out.push(person(w * 0.29, h * 0.97, u * 0.28, { skin: '#b57f57', hair: '#1a1416', hairStyle: 'curls', top: '#4d7fbf' })); }
  if (o.closeKarim) { out.push(rect(0, 0, w, h, '#000', 'opacity="0.35"')); out.push(person(w * 0.5, h * 1.5, u * 1.6, CH.karim, { full: false })); }
  if (P.rain) { const r = rnd(7); for (let i = 0; i < 140; i++) { const x = r() * w, y = r() * h; out.push(line(x, y, x - w * 0.006, y + h * 0.05, '#dfe8ee', 1.2, 'opacity="0.35"')); } out.push(ellipse(w * 0.55, h * 0.9, w * 0.12, h * 0.02, P.light, 'opacity="0.25"')); }
  return out;
}

/** The café: a long counter with a samovar and tea glasses, small tables, a ceiling fan, a window onto the alley. */
function cafe(w, h, P, o = {}) {
  const out = []; const u = Math.min(w, h); const wall = P.lit ? '#3a2a24' : '#b8895c';
  out.push(rect(0, 0, w, h, wall));
  out.push(rect(0, 0, w, h * 0.16, shade(wall, 0.8)));
  out.push(rect(0, h * 0.68, w, h * 0.32, P.lit ? '#2a201c' : '#7a5238')); // floor
  out.push(rect(0, h * 0.68, w, h * 0.01, shade(wall, 0.5)));
  // window with the alley's sky behind it
  out.push(rect(w * 0.62, h * 0.2, w * 0.22, h * 0.32, 'url(#sky)')); out.push(rect(w * 0.62, h * 0.2, w * 0.22, h * 0.32, 'none', `stroke="${shade(wall, 0.45)}" stroke-width="${f(w * 0.008)}"`)); out.push(rect(w * 0.729, h * 0.2, w * 0.006, h * 0.32, shade(wall, 0.45)));
  // door with light
  if (o.doorway) { out.push(rect(w * 0.88, h * 0.12, w * 0.1, h * 0.56, P.light, 'opacity="0.9"')); out.push(circle(w * 0.93, h * 0.4, h * 0.3, 'url(#glow)')); }
  // ceiling fan
  out.push(circle(w * 0.45, h * 0.09, h * 0.02, '#3b2f2a')); for (const a of [0, 60, 120]) out.push(`<ellipse cx="${f(w * 0.45)}" cy="${f(h * 0.09)}" rx="${f(w * 0.11)}" ry="${f(h * 0.012)}" fill="#4d3d35" transform="rotate(${a} ${f(w * 0.45)} ${f(h * 0.09)})"/>`);
  // hanging lamp
  out.push(line(w * 0.2, 0, w * 0.2, h * 0.14, '#2a2220', 2)); out.push(path(`M${f(w * 0.16)} ${f(h * 0.2)} L${f(w * 0.24)} ${f(h * 0.2)} L${f(w * 0.215)} ${f(h * 0.14)} L${f(w * 0.185)} ${f(h * 0.14)} Z`, '#5a3f2a')); out.push(circle(w * 0.2, h * 0.21, h * 0.03, P.light, 'opacity="0.9"')); if (P.lit) out.push(circle(w * 0.2, h * 0.24, h * 0.22, 'url(#glow)'));
  // framed footballer on the right wall
  out.push(rect(w * 0.5, h * 0.24, w * 0.07, h * 0.12, '#2a1e18')); out.push(rect(w * 0.507, h * 0.25, w * 0.056, h * 0.1, '#6a8f5a')); out.push(circle(w * 0.535, h * 0.29, h * 0.02, '#e0c9a8'));
  // counter
  out.push(rect(0, h * 0.5, w * 0.46, h * 0.28, '#5b3a25')); out.push(rect(0, h * 0.5, w * 0.46, h * 0.03, '#8a5a36')); out.push(rect(0, h * 0.53, w * 0.46, h * 0.004, '#c99a5a', 'opacity="0.7"'));
  // samovar
  out.push(rect(w * 0.08, h * 0.44, w * 0.06, h * 0.06, '#c9a24a')); out.push(ellipse(w * 0.11, h * 0.36, w * 0.045, h * 0.09, '#d9b35a')); out.push(rect(w * 0.1, h * 0.25, w * 0.02, h * 0.04, '#c9a24a')); out.push(path(`M${f(w * 0.15)} ${f(h * 0.36)} q${f(w * 0.03)} ${f(h * 0.02)} ${f(w * 0.02)} ${f(h * 0.08)}`, 'none', `stroke="#c9a24a" stroke-width="${f(w * 0.008)}"`));
  // tea glasses
  for (let i = 0; i < 6; i++) { const x = w * 0.2 + i * w * 0.035; out.push(poly([[x, h * 0.44], [x + w * 0.022, h * 0.44], [x + w * 0.019, h * 0.5], [x + w * 0.003, h * 0.5]], '#c9782e', 'opacity="0.9"')); out.push(poly([[x, h * 0.44], [x + w * 0.022, h * 0.44], [x + w * 0.02, h * 0.46], [x + w * 0.002, h * 0.46]], '#f7d9a0')); }
  // tables and chairs
  for (const [x, s] of [[0.56, 1], [0.74, 0.85]]) { out.push(rect(w * x, h * 0.58, w * 0.12 * s, h * 0.02, '#3a2a22')); out.push(rect(w * x + w * 0.05 * s, h * 0.6, w * 0.02 * s, h * 0.1 * s, '#3a2a22')); out.push(rect(w * x - w * 0.04 * s, h * 0.56, w * 0.035 * s, h * 0.14 * s, '#4a3328')); out.push(poly([[w * x, h * 0.575], [w * x + w * 0.03 * s, h * 0.565], [w * x + w * 0.04 * s, h * 0.58], [w * x + w * 0.01 * s, h * 0.59]], '#f7d9a0')); }
  if (o.cat) out.push(cat(w * 0.4, h * 0.5, u * 0.16));
  if (o.abu) out.push(person(w * (o.abuX ?? 0.3), h * 0.5, u * 0.42, CH['abu-samir'], { full: false, prop: 'beads' }));
  if (o.layla) out.push(person(w * (o.laylaX ?? 0.12), h * 0.5, u * 0.4, CH.layla, { full: false }));
  if (o.karim) out.push(person(w * (o.karimX ?? 0.66), h * 0.9, u * 0.62, CH.karim, { prop: 'notebook' }));
  if (o.abuDoor) out.push(person(w * 0.93, h * 0.9, u * 0.66, CH['abu-samir'], { prop: 'beads' }));
  if (o.abuTable) out.push(person(w * 0.62, h * 0.62, u * 0.44, CH['abu-samir'], { full: false, prop: 'beads' }));
  if (o.notebook) { // an insert: the ledger, a glass of tea, a pen
    out.push(rect(0, 0, w, h, '#4a3a2e')); out.push(rect(0, 0, w, h, 'url(#vig)'));
    out.push(path(`M${f(w * 0.12)} ${f(h * 0.2)} L${f(w * 0.5)} ${f(h * 0.15)} L${f(w * 0.88)} ${f(h * 0.2)} L${f(w * 0.86)} ${f(h * 0.86)} L${f(w * 0.5)} ${f(h * 0.9)} L${f(w * 0.14)} ${f(h * 0.86)} Z`, '#f2e9d6'));
    out.push(line(w * 0.5, h * 0.15, w * 0.5, h * 0.9, '#cfc4ad', 2));
    for (let i = 0; i < 9; i++) { const y = h * 0.28 + i * h * 0.065; out.push(line(w * 0.17, y, w * 0.47, y - h * 0.005, '#b8ad97', 1.5)); out.push(line(w * 0.53, y - h * 0.005, w * 0.83, y, '#b8ad97', 1.5)); }
    for (let i = 0; i < 4; i++) out.push(line(w * 0.19, h * 0.28 + i * h * 0.065 - h * 0.012, w * 0.19 + w * (0.12 + (i % 2) * 0.08), h * 0.28 + i * h * 0.065 - h * 0.014, '#3b4b8a', h * 0.012, 'opacity="0.85"'));
    out.push(rect(w * 0.58, h * 0.4, w * 0.19, h * 0.03, '#2d3a70', 'opacity="0.9"'));
    out.push(poly([[w * 0.72, h * 0.62], [w * 0.8, h * 0.62], [w * 0.79, h * 0.8], [w * 0.73, h * 0.8]], '#c9782e')); out.push(poly([[w * 0.72, h * 0.62], [w * 0.8, h * 0.62], [w * 0.795, h * 0.66], [w * 0.725, h * 0.66]], '#f7d9a0'));
    out.push(line(w * 0.3, h * 0.78, w * 0.44, h * 0.6, '#2b2b34', h * 0.02)); out.push(line(w * 0.44, h * 0.6, w * 0.46, h * 0.575, '#d9b35a', h * 0.02));
  }
  if (o.hand) { // an insert: a hand puts a note on the counter
    out.push(rect(0, h * 0.5, w, h * 0.5, '#5b3a25')); out.push(rect(0, h * 0.5, w, h * 0.04, '#8a5a36'));
    out.push(poly([[w * 0.36, h * 0.6], [w * 0.7, h * 0.56], [w * 0.72, h * 0.74], [w * 0.38, h * 0.78]], '#8fae8a')); out.push(rect(w * 0.44, h * 0.6, w * 0.18, h * 0.12, '#a6c29f', 'opacity="0.8"')); out.push(circle(w * 0.53, h * 0.665, h * 0.045, '#7f9a79'));
    out.push(path(`M${f(w * 0.72)} ${f(h * 0.2)} L${f(w * 0.98)} ${f(h * 0.1)} L${f(w)} ${f(h * 0.4)} L${f(w * 0.78)} ${f(h * 0.52)} Q${f(w * 0.62)} ${f(h * 0.62)} ${f(w * 0.6)} ${f(h * 0.5)} Z`, '#caa27a'));
  }
  return out;
}

/** The rooftop: water tank, dish, washing line, a plastic chair, the whole city below. */
function rooftop(w, h, P, o = {}) {
  const out = []; const u = Math.min(w, h);
  out.push(rect(0, 0, w, h, 'url(#sky)'));
  out.push(circle(w * 0.72, h * 0.22, h * 0.3, 'url(#glow)')); out.push(circle(w * 0.72, h * 0.22, h * 0.055, P.light, 'opacity="0.95"'));
  // the city below
  const r = rnd(3); let x = -w * 0.02;
  while (x < w) { const bw = w * (0.03 + r() * 0.06); const bh = h * (0.08 + r() * 0.2); const y = h * 0.62 - bh; out.push(rect(x, y, bw, bh + h * 0.1, shade(P.ground, 1.3))); if (P.lit) for (let i = 0; i < 4; i++) if (r() > 0.45) out.push(rect(x + bw * (0.15 + (i % 2) * 0.45), y + bh * (0.15 + Math.floor(i / 2) * 0.4), bw * 0.2, bh * 0.14, P.light, 'opacity="0.85"')); x += bw + w * 0.008; }
  // roof slab and parapet
  out.push(rect(0, h * 0.66, w, h * 0.34, P.ground)); out.push(rect(0, h * 0.62, w, h * 0.05, shade(P.ground, 1.25)));
  // water tank
  out.push(rect(w * 0.08, h * 0.36, w * 0.14, h * 0.3, shade(P.ground, 1.5))); out.push(ellipse(w * 0.15, h * 0.36, w * 0.07, h * 0.035, shade(P.ground, 1.8))); out.push(rect(w * 0.1, h * 0.66, w * 0.02, h * 0.06, shade(P.ground, 0.8))); out.push(rect(w * 0.18, h * 0.66, w * 0.02, h * 0.06, shade(P.ground, 0.8)));
  // dish
  out.push(`<ellipse cx="${f(w * 0.88)}" cy="${f(h * 0.5)}" rx="${f(w * 0.045)}" ry="${f(h * 0.11)}" fill="${shade(P.ground, 1.9)}" transform="rotate(-20 ${f(w * 0.88)} ${f(h * 0.5)})"/>`); out.push(line(w * 0.88, h * 0.5, w * 0.9, h * 0.66, shade(P.ground, 1.5), w * 0.008));
  // washing line
  out.push(line(w * 0.24, h * 0.42, w * 0.7, h * 0.4, '#d9d3c7', 2, 'opacity="0.8"')); for (const [t, c, len] of [[0.3, '#e8e2d2', 0.14], [0.4, '#3f6fb0', 0.1], [0.5, '#d9a441', 0.16], [0.62, '#e0e0d8', 0.12]]) out.push(path(`M${f(w * t)} ${f(h * 0.41)} L${f(w * (t + 0.06))} ${f(h * 0.41)} L${f(w * (t + 0.055))} ${f(h * (0.41 + len))} L${f(w * (t + 0.005))} ${f(h * (0.41 + len))} Z`, c));
  // chair
  out.push(rect(w * 0.74, h * 0.55, w * 0.06, h * 0.03, '#e8e8e2')); out.push(rect(w * 0.74, h * 0.46, w * 0.012, h * 0.12, '#e8e8e2')); out.push(rect(w * 0.79, h * 0.57, w * 0.008, h * 0.1, '#e8e8e2')); out.push(rect(w * 0.745, h * 0.57, w * 0.008, h * 0.1, '#e8e8e2'));
  // string lights
  if (o.lights || P.lit) { out.push(path(`M${f(w * 0.02)} ${f(h * 0.3)} Q${f(w * 0.5)} ${f(h * 0.4)} ${f(w * 0.98)} ${f(h * 0.28)}`, 'none', `stroke="#3a3a44" stroke-width="1.5"`)); for (let i = 0; i <= 12; i++) { const t = i / 12; const lx = w * 0.02 + t * w * 0.96; const ly = h * 0.3 + Math.sin(Math.PI * t) * h * 0.05 - t * h * 0.02; out.push(circle(lx, ly + h * 0.012, h * 0.03, 'url(#glow)')); out.push(circle(lx, ly + h * 0.012, h * 0.008, o.neon ? '#ff9ad6' : P.light)); } }
  // radio
  if (o.radio) { out.push(rect(w * 0.42, h * 0.56, w * 0.13, h * 0.09, '#2a2230', 'rx="6"')); out.push(circle(w * 0.46, h * 0.605, h * 0.028, o.neon ? '#ff6fb0' : '#d9a441')); out.push(rect(w * 0.5, h * 0.58, w * 0.04, h * 0.05, '#4a4056', 'rx="2"')); out.push(line(w * 0.53, h * 0.56, w * 0.58, h * 0.42, '#9a9aa8', 2)); if (P.lit) out.push(circle(w * 0.485, h * 0.6, h * 0.16, 'url(#glow)')); }
  if (o.karim) out.push(person(w * 0.5, h * 0.72, u * 0.5, CH.karim, { arms: o.recite ? 'wide' : 'down', prop: 'notebook' }));
  if (o.duo) { out.push(person(w * 0.36, h * 0.74, u * 0.46, CH.layla)); out.push(person(w * 0.6, h * 0.74, u * 0.52, CH.karim, { prop: 'notebook' })); }
  if (o.kids) { for (const [x, top, hgt] of [[0.3, '#d9c25a', 0.34], [0.5, '#4d7fbf', 0.3], [0.68, '#c85a5a', 0.26]]) out.push(person(w * x, h * 0.72, u * hgt, { skin: '#c7956a', hair: '#1a1416', hairStyle: 'curls', top }, { arms: 'wide' })); for (const [kx, ky, c] of [[0.22, 0.14, '#e05a5a'], [0.56, 0.08, '#3f8fd0'], [0.8, 0.18, '#f2c14e']]) { out.push(poly([[w * kx, h * ky - h * 0.09], [w * kx + w * 0.045, h * ky], [w * kx, h * ky + h * 0.11], [w * kx - w * 0.045, h * ky]], c)); out.push(path(`M${f(w * kx)} ${f(h * ky + h * 0.11)} q${f(w * 0.02)} ${f(h * 0.06)} ${f(-w * 0.01)} ${f(h * 0.12)}`, 'none', `stroke="${c}" stroke-width="2"`)); out.push(line(w * kx, h * ky + h * 0.05, w * (kx + 0.08), h * 0.5, '#e8e2d2', 1, 'opacity="0.7"')); } }
  return out;
}

/** The riverbank at dusk: the far bank and its bridge, water carrying the lights, the promenade and its railing. */
function riverbank(w, h, P, o = {}) {
  const out = []; const u = Math.min(w, h); const horizon = h * 0.5;
  out.push(rect(0, 0, w, h, 'url(#sky)'));
  out.push(circle(w * 0.7, h * 0.36, h * 0.28, 'url(#glow)')); out.push(circle(w * 0.7, h * 0.36, h * 0.05, P.light, 'opacity="0.95"'));
  // far bank
  const r = rnd(11); let x = 0; while (x < w) { const bw = w * (0.02 + r() * 0.05); const bh = h * (0.02 + r() * 0.07); out.push(rect(x, horizon - bh, bw, bh, shade(P.sky[0], 1.35))); x += bw; }
  // bridge
  out.push(rect(w * 0.1, horizon - h * 0.03, w * 0.5, h * 0.02, shade(P.sky[0], 1.5))); for (let i = 0; i < 5; i++) out.push(path(`M${f(w * (0.1 + i * 0.1))} ${f(horizon)} Q${f(w * (0.15 + i * 0.1))} ${f(horizon - h * 0.05)} ${f(w * (0.2 + i * 0.1))} ${f(horizon)}`, 'none', `stroke="${shade(P.sky[0], 1.5)}" stroke-width="${f(h * 0.012)}"`));
  // water
  out.push(rect(0, horizon, w, h * 0.32, shade(P.sky[1], 0.75)));
  for (let i = 0; i < 18; i++) { const y = horizon + i * h * 0.017; out.push(rect(w * 0.6 + (i % 3) * w * 0.02, y, w * 0.2 - (i % 4) * w * 0.02, h * 0.006, P.light, `opacity="${0.35 - i * 0.015}"`)); }
  if (o.lightsOn) for (let i = 0; i < 9; i++) { const lx = w * (0.06 + i * 0.11); out.push(rect(lx - w * 0.008, horizon + h * 0.02, w * 0.016, h * 0.2, P.light, 'opacity="0.12"')); }
  // moored boats
  for (const [t, s] of [[0.18, 1], [0.32, 0.8], [0.86, 0.9]]) { const bx = w * t, by = horizon + h * 0.2 * s; out.push(path(`M${f(bx - w * 0.06 * s)} ${f(by)} Q${f(bx)} ${f(by + h * 0.05 * s)} ${f(bx + w * 0.07 * s)} ${f(by)} L${f(bx + w * 0.05 * s)} ${f(by - h * 0.02 * s)} L${f(bx - w * 0.05 * s)} ${f(by - h * 0.02 * s)} Z`, '#1c1a22')); out.push(line(bx, by - h * 0.02 * s, bx, by - h * 0.12 * s, '#1c1a22', 2)); }
  // reeds
  for (let i = 0; i < 7; i++) out.push(path(`M${f(w * 0.02 + i * w * 0.012)} ${f(h * 0.82)} q${f(w * 0.01)} ${f(-h * 0.1)} ${f(w * 0.004 + i * 0.5)} ${f(-h * 0.2)}`, 'none', `stroke="#1f2a24" stroke-width="${f(w * 0.004)}"`));
  // embankment and railing
  out.push(rect(0, h * 0.82, w, h * 0.18, shade(P.ground, 1.1))); out.push(rect(0, h * 0.82, w, h * 0.02, shade(P.ground, 1.5)));
  out.push(rect(0, h * 0.7, w, h * 0.01, '#2b2a33')); for (let i = 0; i <= 16; i++) out.push(rect(i * w / 16, h * 0.7, w * 0.004, h * 0.12, '#2b2a33'));
  // lamp posts and string lights
  for (const t of [0.12, 0.5, 0.88]) { out.push(rect(w * t, h * 0.45, w * 0.006, h * 0.37, '#1f1e26')); out.push(circle(w * t + w * 0.003, h * 0.45, h * 0.014, o.lightsOn ? P.light : '#3a3a44')); if (o.lightsOn) out.push(circle(w * t, h * 0.45, h * 0.12, 'url(#glow)')); }
  if (o.lightsOn) { out.push(path(`M${f(w * 0.12)} ${f(h * 0.46)} Q${f(w * 0.31)} ${f(h * 0.54)} ${f(w * 0.5)} ${f(h * 0.46)} Q${f(w * 0.69)} ${f(h * 0.54)} ${f(w * 0.88)} ${f(h * 0.46)}`, 'none', 'stroke="#2b2a33" stroke-width="1.5"')); for (let i = 1; i < 16; i++) { if (i === 8) continue; const t = i / 16; const lx = w * 0.12 + t * w * 0.76; const seg = (t < 0.5 ? t : t - 0.5) * 2; const ly = h * 0.46 + Math.sin(Math.PI * seg) * h * 0.04; out.push(circle(lx, ly, h * 0.035, 'url(#glow)')); out.push(circle(lx, ly, h * 0.007, P.light)); } }
  else out.push(circle(w * 0.5, h * 0.45, h * 0.05, 'url(#glow)'));
  if (o.nour) out.push(person(w * (o.nourX ?? 0.34), h * 0.86, u * (o.nourH ?? 0.5), CH.nour, { full: true }));
  if (o.closeNour) { out.push(rect(0, 0, w, h, '#000', 'opacity="0.3"')); out.push(person(w * 0.42, h * 1.45, u * 1.5, CH.nour, { full: false })); }
  return out;
}

/** The hospital corridor at three in the morning (vertical): doors that go on too long, a clock, a nurse with a tray. */
function corridor(w, h, P, o = {}) {
  const out = []; const u = Math.min(w, h); const vx = w * 0.5, vy = h * 0.46;
  const wallC = '#c7d2d6', floorC = '#8fa1a8', ceilC = '#dde5e8';
  out.push(rect(0, 0, w, h, wallC));
  out.push(poly([[0, 0], [w, 0], [vx + w * 0.08, vy - h * 0.06], [vx - w * 0.08, vy - h * 0.06]], ceilC));
  out.push(poly([[0, h], [w, h], [vx + w * 0.08, vy + h * 0.06], [vx - w * 0.08, vy + h * 0.06]], floorC));
  out.push(poly([[0, 0], [vx - w * 0.08, vy - h * 0.06], [vx - w * 0.08, vy + h * 0.06], [0, h]], shade(wallC, 0.86)));
  out.push(poly([[w, 0], [vx + w * 0.08, vy - h * 0.06], [vx + w * 0.08, vy + h * 0.06], [w, h]], shade(wallC, 0.78)));
  // fluorescent lights
  for (let i = 0; i < 6; i++) { const t = i / 6; const y = h * 0.03 + t * (vy - h * 0.09); const hw = w * 0.14 * (1 - t) + w * 0.01; out.push(rect(vx - hw, y, hw * 2, h * 0.008 * (1 - t) + 1, i % 3 === 1 ? '#f4f1d6' : '#fffdf0', `opacity="${i % 3 === 1 ? 0.55 : 0.95}"`)); }
  // doors
  const doors = o.longer ? 9 : 6;
  for (let i = 0; i < doors; i++) { const t = i / doors; const s = 1 - t; const dw = w * 0.1 * s, dh = h * 0.24 * s; const yBase = h * 0.95 - t * (h * 0.95 - vy - h * 0.06); const xl = w * 0.02 + t * (vx - w * 0.1 - w * 0.02); out.push(rect(xl, yBase - dh, dw, dh, '#5e7f8a')); out.push(rect(xl + dw * 0.55, yBase - dh * 0.75, dw * 0.3, dh * 0.25, '#e8f1f3', 'opacity="0.9"')); out.push(rect(w - xl - dw, yBase - dh, dw, dh, '#557480')); out.push(rect(w - xl - dw * 0.85, yBase - dh * 0.75, dw * 0.3, dh * 0.25, '#e8f1f3', 'opacity="0.9"')); }
  // the far end: a green exit light
  out.push(rect(vx - w * 0.06, vy - h * 0.06, w * 0.12, h * 0.12, '#dfe7ea')); out.push(rect(vx - w * 0.025, vy - h * 0.1, w * 0.05, h * 0.02, '#4dbb79'));
  // the station clock
  if (o.clock) { out.push(circle(w * 0.5, h * 0.2, w * 0.07, '#f3f3f0')); out.push(circle(w * 0.5, h * 0.2, w * 0.07, 'none', 'stroke="#2a3033" stroke-width="3"')); out.push(line(w * 0.5, h * 0.2, w * 0.5, h * 0.2 - w * 0.05, '#2a3033', 3)); out.push(line(w * 0.5, h * 0.2, w * 0.535, h * 0.2 - w * 0.04, '#2a3033', 3)); }
  if (o.nurse) out.push(person(w * 0.5, h * 0.9, u * 0.44, CH.hana, { arms: 'tray' }));
  if (o.nurseFar) out.push(person(w * 0.52, h * 0.7, u * 0.26, CH.hana, { arms: 'tray', facing: -1 }));
  if (o.doorNumber) { // a close-up: a door plate whose number is not a number
    out.push(rect(0, 0, w, h, '#5e7f8a')); out.push(rect(w * 0.18, h * 0.32, w * 0.64, h * 0.18, '#eef2f3', 'rx="8"')); out.push(rect(w * 0.18, h * 0.32, w * 0.64, h * 0.18, 'none', 'stroke="#2a3033" stroke-width="3" rx="8"'));
    out.push(path(`M${f(w * 0.3)} ${f(h * 0.45)} C${f(w * 0.3)} ${f(h * 0.35)} ${f(w * 0.42)} ${f(h * 0.35)} ${f(w * 0.42)} ${f(h * 0.41)} S${f(w * 0.36)} ${f(h * 0.47)} ${f(w * 0.36)} ${f(h * 0.42)} M${f(w * 0.5)} ${f(h * 0.36)} L${f(w * 0.5)} ${f(h * 0.46)} M${f(w * 0.58)} ${f(h * 0.46)} Q${f(w * 0.62)} ${f(h * 0.34)} ${f(w * 0.7)} ${f(h * 0.42)} Q${f(w * 0.66)} ${f(h * 0.47)} ${f(w * 0.6)} ${f(h * 0.44)}`, 'none', `stroke="#2a3033" stroke-width="${f(w * 0.012)}" stroke-linecap="round"`));
    out.push(rect(w * 0.18, h * 0.55, w * 0.64, h * 0.3, '#54737e')); out.push(circle(w * 0.75, h * 0.72, w * 0.03, '#c8ccd0'));
  }
  if (o.kitchen) { // the door opens onto her own kitchen
    const K = TIMES.NIGHT; out.push(rect(0, 0, w, h, '#4a3a2e')); out.push(rect(0, h * 0.62, w, h * 0.38, '#2f251d'));
    out.push(rect(w * 0.6, h * 0.14, w * 0.3, h * 0.26, K.sky[0])); out.push(circle(w * 0.78, h * 0.22, w * 0.04, K.light, 'opacity="0.9"')); out.push(rect(w * 0.6, h * 0.14, w * 0.3, h * 0.26, 'none', 'stroke="#2a1f18" stroke-width="6"'));
    out.push(line(w * 0.3, 0, w * 0.3, h * 0.16, '#2a1f18', 3)); out.push(circle(w * 0.3, h * 0.19, h * 0.03, P.light)); out.push(circle(w * 0.3, h * 0.22, h * 0.24, 'url(#glow)'));
    out.push(rect(w * 0.1, h * 0.58, w * 0.7, h * 0.03, '#8a5a36')); out.push(rect(w * 0.14, h * 0.61, w * 0.03, h * 0.25, '#5b3a25')); out.push(rect(w * 0.73, h * 0.61, w * 0.03, h * 0.25, '#5b3a25'));
    out.push(poly([[w * 0.42, h * 0.48], [w * 0.5, h * 0.48], [w * 0.49, h * 0.58], [w * 0.43, h * 0.58]], '#c9782e')); out.push(poly([[w * 0.42, h * 0.48], [w * 0.5, h * 0.48], [w * 0.495, h * 0.51], [w * 0.425, h * 0.51]], '#f7d9a0'));
    for (const dx of [-0.02, 0.01, 0.035]) out.push(path(`M${f(w * (0.46 + dx))} ${f(h * 0.46)} q${f(w * 0.015)} ${f(-h * 0.04)} 0 ${f(-h * 0.08)} q${f(-w * 0.015)} ${f(-h * 0.03)} 0 ${f(-h * 0.06)}`, 'none', 'stroke="#f7d9a0" stroke-width="2" opacity="0.7"'));
    out.push(rect(w * 0.2, h * 0.5, w * 0.16, h * 0.08, '#b8473a', 'rx="4"')); out.push(rect(w * 0.55, h * 0.4, w * 0.02, h * 0.18, '#3a2a22')); out.push(rect(w * 0.55, h * 0.4, w * 0.14, h * 0.02, '#3a2a22'));
  }
  return out;
}

// ----------------------------------------------------------------------------------------------------- portraits

/** A character portrait from the shoulders up, built from the written profile. `view` changes the angle. */
function portrait(c, w, h, { view = 'front', expression = 'calm' } = {}) {
  const P = { sky: [`oklch(0.42 0.1 ${c.bg})`, `oklch(0.5 0.12 ${c.bg})`, `oklch(0.34 0.08 ${c.bg})`], light: '#fff3e0' };
  const out = [rect(0, 0, w, h, 'url(#sky)'), circle(w * 0.62, h * 0.28, h * 0.42, 'url(#glow)')];
  const cartoon = c.style === 'CARTOON'; const stroke = cartoon ? `stroke="#2a1f1e" stroke-width="${f(w * 0.008)}" stroke-linejoin="round"` : '';
  if (c.cat) return svg(w, h, P, [...out, ...catPortrait(c, w, h, view, expression, stroke)], 'Basbousa');
  const side = view === 'side'; const tq = view === 'three-quarter' ? 1 : 0; const full = view === 'full-body';
  const dx = side ? w * 0.06 : tq * w * 0.045; // features shift towards the way the head turns
  const scale = full ? 0.5 : 1; const cx = w * 0.5; const headY = full ? h * 0.24 : h * 0.4; const hr = h * 0.19 * scale;
  const g = [];
  // body
  const shW = w * (c.heavy ? 0.46 : 0.36) * scale; const shY = headY + hr * 1.55;
  if (full) { const legTop = shY + h * 0.22; g.push(rect(cx - shW * 0.42, legTop, shW * 0.36, h * 0.27, shade(c.layer ?? c.top, 0.55))); g.push(rect(cx + shW * 0.06, legTop, shW * 0.36, h * 0.27, shade(c.layer ?? c.top, 0.5))); g.push(rect(cx - shW * 0.48, legTop + h * 0.26, shW * 0.46, h * 0.035, '#2a2422', 'rx="6"')); g.push(rect(cx + shW * 0.02, legTop + h * 0.26, shW * 0.46, h * 0.035, '#2a2422', 'rx="6"')); }
  const bodyBottom = full ? shY + h * 0.24 : h;
  g.push(path(`M${f(cx - shW)} ${f(shY + h * 0.05 * scale)} Q${f(cx)} ${f(shY - h * 0.03 * scale)} ${f(cx + shW)} ${f(shY + h * 0.05 * scale)} L${f(cx + shW * 1.02)} ${f(bodyBottom)} L${f(cx - shW * 1.02)} ${f(bodyBottom)} Z`, c.top, stroke));
  if (c.stripes) for (let i = 0; i < 7; i++) g.push(line(cx - shW * 0.9, shY + h * 0.07 * scale + i * h * 0.05 * scale, cx + shW * 0.9, shY + h * 0.06 * scale + i * h * 0.05 * scale, c.stripes, h * 0.012 * scale, 'opacity="0.55"'));
  if (c.layer) { // waistcoat, apron, jacket, cardigan or coat
    const inner = c.hairStyle === 'scarf' ? 0.45 : 0.32;
    g.push(path(`M${f(cx - shW)} ${f(shY + h * 0.05 * scale)} L${f(cx - shW * inner)} ${f(shY + h * 0.02 * scale)} L${f(cx - shW * (inner - 0.05))} ${f(bodyBottom)} L${f(cx - shW * 1.02)} ${f(bodyBottom)} Z`, c.layer, stroke));
    g.push(path(`M${f(cx + shW)} ${f(shY + h * 0.05 * scale)} L${f(cx + shW * inner)} ${f(shY + h * 0.02 * scale)} L${f(cx + shW * (inner - 0.05))} ${f(bodyBottom)} L${f(cx + shW * 1.02)} ${f(bodyBottom)} Z`, c.layer, stroke));
    if (c.hairStyle === 'scarf') g.push(rect(cx - shW * 0.4, shY + h * 0.12 * scale, shW * 0.8, bodyBottom - shY - h * 0.12 * scale, c.layer, stroke)); // the apron's bib
  }
  if (c.lanyard) { g.push(path(`M${f(cx - shW * 0.3)} ${f(shY + h * 0.02 * scale)} L${f(cx)} ${f(shY + h * 0.22 * scale)} L${f(cx + shW * 0.3)} ${f(shY + h * 0.02 * scale)}`, 'none', `stroke="${c.lanyard}" stroke-width="${f(w * 0.01 * scale)}"`)); g.push(rect(cx - w * 0.04 * scale, shY + h * 0.2 * scale, w * 0.08 * scale, h * 0.06 * scale, '#f4f4f0', 'rx="3"')); }
  if (c.beads) { for (let i = 0; i < 9; i++) g.push(circle(cx - shW * 0.95 + Math.sin(i / 2) * w * 0.02, shY + h * 0.14 * scale + i * h * 0.03 * scale, w * 0.012 * scale, '#c9a24a')); }
  // neck
  g.push(rect(cx - hr * 0.28 + dx * 0.3, headY + hr * 0.7, hr * 0.56, hr * 0.95, shade(c.skin, 0.82)));
  // hair behind the head
  if (c.hairStyle === 'long') { g.push(path(`M${f(cx - hr * 1.3)} ${f(headY + hr * 2.7)} Q${f(cx - hr * 1.2)} ${f(headY + hr * 1.2)} ${f(cx - hr * 1.05)} ${f(headY - hr * 0.3)} Q${f(cx)} ${f(headY - hr * 1.35)} ${f(cx + hr * 1.05)} ${f(headY - hr * 0.3)} Q${f(cx + hr * 1.2)} ${f(headY + hr * 1.2)} ${f(cx + hr * 1.3)} ${f(headY + hr * 2.7)} Q${f(cx + hr * 0.9)} ${f(headY + hr * 2.3)} ${f(cx + hr * 0.75)} ${f(headY + hr * 1.6)} L${f(cx - hr * 0.75)} ${f(headY + hr * 1.6)} Q${f(cx - hr * 0.9)} ${f(headY + hr * 2.3)} ${f(cx - hr * 1.3)} ${f(headY + hr * 2.7)} Z`, c.hair)); g.push(path(`M${f(cx - hr * 0.95)} ${f(headY + hr * 0.2)} Q${f(cx - hr * 1.05)} ${f(headY + hr * 1.4)} ${f(cx - hr * 1.0)} ${f(headY + hr * 2.2)}`, 'none', `stroke="${shade(c.hair, 1.6)}" stroke-width="${f(hr * 0.06)}" opacity="0.5"`)); }
  if (c.hairStyle === 'hijab') g.push(path(`M${f(cx - hr * 1.35)} ${f(headY + hr * 2.4)} Q${f(cx - hr * 1.3)} ${f(headY + hr * 0.4)} ${f(cx - hr * 1.12)} ${f(headY - hr * 0.35)} Q${f(cx)} ${f(headY - hr * 1.5)} ${f(cx + hr * 1.12)} ${f(headY - hr * 0.35)} Q${f(cx + hr * 1.3)} ${f(headY + hr * 0.4)} ${f(cx + hr * 1.35)} ${f(headY + hr * 2.4)} Z`, c.hair, stroke));
  if (c.hairStyle === 'bob') g.push(path(`M${f(cx - hr * 1.08)} ${f(headY + hr * 0.75)} L${f(cx - hr * 1.02)} ${f(headY - hr * 0.3)} Q${f(cx)} ${f(headY - hr * 1.35)} ${f(cx + hr * 1.02)} ${f(headY - hr * 0.3)} L${f(cx + hr * 1.08)} ${f(headY + hr * 0.75)} Z`, c.hair));
  if (c.hairStyle === 'scarf') g.push(circle(cx - hr * 0.95 - dx * 0.5, headY + hr * 0.1, hr * 0.42, c.hair));
  // head
  const faceW = side ? hr * 0.78 : hr * (0.86 - tq * 0.06);
  if (side) g.push(path(`M${f(cx - faceW)} ${f(headY)} Q${f(cx - faceW)} ${f(headY - hr)} ${f(cx)} ${f(headY - hr)} Q${f(cx + faceW * 1.05)} ${f(headY - hr)} ${f(cx + faceW * 1.02)} ${f(headY - hr * 0.1)} L${f(cx + faceW * 1.22)} ${f(headY + hr * 0.18)} L${f(cx + faceW * 1.0)} ${f(headY + hr * 0.28)} L${f(cx + faceW * 1.05)} ${f(headY + hr * 0.5)} Q${f(cx + faceW * 0.7)} ${f(headY + hr * 1.02)} ${f(cx)} ${f(headY + hr)} Q${f(cx - faceW)} ${f(headY + hr)} ${f(cx - faceW)} ${f(headY)} Z`, c.skin, stroke));
  else g.push(ellipse(cx + dx * 0.4, headY, faceW, hr, c.skin, stroke));
  if (c.style === 'REALISTIC') g.push(`<ellipse cx="${f(cx + dx * 0.4 - faceW * 0.3)}" cy="${f(headY - hr * 0.1)}" rx="${f(faceW * 0.7)}" ry="${f(hr * 0.8)}" fill="#fff" opacity="0.07"/>`);
  if (c.heavy) g.push(ellipse(cx + dx * 0.4, headY + hr * 0.75, faceW * 0.8, hr * 0.3, shade(c.skin, 0.93))); // the jowl
  // ears
  if (c.hairStyle === 'hijab') { g.push(path(`M${f(hx0(cx, dx) - faceW * 0.95)} ${f(headY - hr * 0.35)} Q${f(hx0(cx, dx))} ${f(headY - hr * 0.95)} ${f(hx0(cx, dx) + faceW * 0.95)} ${f(headY - hr * 0.35)}`, 'none', `stroke="${shade(c.hair, 1.35)}" stroke-width="${f(hr * 0.12)}" stroke-linecap="round"`)); }
  else if (!side) { g.push(ellipse(cx + dx * 0.4 - faceW * 1.02, headY + hr * 0.05, hr * 0.13, hr * 0.2, c.skin, stroke)); g.push(ellipse(cx + dx * 0.4 + faceW * 1.02, headY + hr * 0.05, hr * 0.13, hr * 0.2, c.skin, stroke)); }
  else g.push(ellipse(cx - faceW * 0.55, headY + hr * 0.05, hr * 0.13, hr * 0.2, shade(c.skin, 0.9), stroke));
  // hair on top
  const hx = cx + dx * 0.4;
  switch (c.hairStyle) {
    case 'back': g.push(path(`M${f(hx - faceW * 0.98)} ${f(headY - hr * 0.35)} Q${f(hx - faceW * 0.4)} ${f(headY - hr * 1.15)} ${f(hx + faceW * 0.5)} ${f(headY - hr * 1.12)} Q${f(hx + faceW * 1.05)} ${f(headY - hr * 0.9)} ${f(hx + faceW * 1.0)} ${f(headY - hr * 0.3)} Q${f(hx + faceW * 0.7)} ${f(headY - hr * 0.62)} ${f(hx)} ${f(headY - hr * 0.66)} Q${f(hx - faceW * 0.7)} ${f(headY - hr * 0.6)} ${f(hx - faceW * 0.98)} ${f(headY - hr * 0.35)} Z`, c.hair, stroke)); g.push(path(`M${f(hx - faceW * 0.1)} ${f(headY - hr * 0.9)} q${f(faceW * 0.3)} ${f(-hr * 0.1)} ${f(faceW * 0.6)} ${f(hr * 0.05)}`, 'none', `stroke="${shade(c.hair, 1.25)}" stroke-width="3" opacity="0.6"`)); break;
    case 'scarf': g.push(path(`M${f(hx - faceW)} ${f(headY - hr * 0.15)} Q${f(hx)} ${f(headY - hr * 1.3)} ${f(hx + faceW)} ${f(headY - hr * 0.15)} Q${f(hx)} ${f(headY - hr * 0.62)} ${f(hx - faceW)} ${f(headY - hr * 0.15)} Z`, c.hair, stroke)); g.push(path(`M${f(hx - faceW * 1.03)} ${f(headY - hr * 0.42)} Q${f(hx)} ${f(headY - hr * 1.12)} ${f(hx + faceW * 1.03)} ${f(headY - hr * 0.42)} Q${f(hx)} ${f(headY - hr * 0.8)} ${f(hx - faceW * 1.03)} ${f(headY - hr * 0.42)} Z`, c.scarf, stroke)); break;
    case 'curls': for (let i = -4; i <= 4; i++) g.push(circle(hx + i * faceW * 0.26, headY - hr * 0.8 - Math.cos(i / 2.6) * hr * 0.22, hr * 0.27, c.hair, stroke)); for (let i = -3; i <= 3; i += 2) g.push(circle(hx + i * faceW * 0.3, headY - hr * 0.55, hr * 0.2, c.hair)); break;
    case 'bob': g.push(path(`M${f(hx - faceW * 1.05)} ${f(headY - hr * 0.1)} Q${f(hx - faceW * 0.5)} ${f(headY - hr * 1.28)} ${f(hx + faceW * 0.6)} ${f(headY - hr * 1.2)} Q${f(hx + faceW * 1.05)} ${f(headY - hr * 1.0)} ${f(hx + faceW * 1.05)} ${f(headY - hr * 0.1)} L${f(hx + faceW * 0.86)} ${f(headY - hr * 0.1)} Q${f(hx + faceW * 0.5)} ${f(headY - hr * 0.55)} ${f(hx - faceW * 0.2)} ${f(headY - hr * 0.62)} Q${f(hx - faceW * 0.75)} ${f(headY - hr * 0.55)} ${f(hx - faceW * 0.86)} ${f(headY - hr * 0.05)} Z`, c.hair, stroke)); break;
    case 'long': g.push(path(`M${f(hx - faceW * 1.05)} ${f(headY + hr * 0.1)} Q${f(hx - faceW * 0.6)} ${f(headY - hr * 1.3)} ${f(hx + faceW * 0.3)} ${f(headY - hr * 1.22)} Q${f(hx + faceW * 1.05)} ${f(headY - hr * 1.0)} ${f(hx + faceW * 1.05)} ${f(headY + hr * 0.1)} L${f(hx + faceW * 0.9)} ${f(headY + hr * 0.1)} Q${f(hx + faceW * 0.6)} ${f(headY - hr * 0.7)} ${f(hx)} ${f(headY - hr * 0.7)} Q${f(hx - faceW * 0.6)} ${f(headY - hr * 0.7)} ${f(hx - faceW * 0.9)} ${f(headY + hr * 0.1)} Z`, c.hair)); break;
  }
  // face
  const eyeY = headY - hr * 0.02; const eyeDX = faceW * 0.4; const ex1 = hx - eyeDX + (side ? faceW * 0.55 : 0), ex2 = hx + eyeDX;
  const anime = c.style === 'ANIME'; const er = anime ? hr * 0.11 : hr * 0.07;
  const smile = expression === 'smile'; const browLift = smile ? hr * 0.06 : 0;
  if (c.circles) { g.push(ellipse(ex1, eyeY + er * 1.4, er * 1.4, er * 0.7, '#6b5c78', 'opacity="0.35"')); if (!side) g.push(ellipse(ex2, eyeY + er * 1.4, er * 1.4, er * 0.7, '#6b5c78', 'opacity="0.35"')); }
  const eye = (x) => { g.push(ellipse(x, eyeY, er * 1.15, er * (c.heavy ? 0.7 : 1), '#f6f2ea')); g.push(circle(x + (side ? er * 0.2 : dx * 0.3), eyeY, er * 0.7, c.eyes ?? '#2b2422')); if (anime) g.push(circle(x - er * 0.3, eyeY - er * 0.35, er * 0.25, '#fff')); if (c.heavy) g.push(path(`M${f(x - er * 1.2)} ${f(eyeY - er * 0.4)} Q${f(x)} ${f(eyeY - er * 1.0)} ${f(x + er * 1.2)} ${f(eyeY - er * 0.4)}`, c.skin)); };
  eye(ex1); if (!side) eye(ex2);
  // brows
  const brow = (x, dir) => g.push(path(`M${f(x - er * 1.3)} ${f(eyeY - er * 1.9 - browLift)} q${f(er * 1.3)} ${f(-er * 0.9 * dir)} ${f(er * 2.6)} ${f(-er * 0.1)}`, 'none', `stroke="${c.hair === '#b8b3ac' ? '#8a8580' : c.hair}" stroke-width="${f(er * 0.45)}" stroke-linecap="round"`));
  brow(ex1, 1); if (!side) brow(ex2, 1);
  if (c.scar) g.push(line(ex1 - er * 0.4, eyeY - er * 2.6, ex1 + er * 0.3, eyeY - er * 3.0, shade(c.skin, 0.72), er * 0.3));
  // nose and mouth
  if (!side) g.push(path(`M${f(hx + dx * 0.4)} ${f(eyeY + hr * 0.12)} q${f(hr * 0.1)} ${f(hr * 0.35)} ${f(-hr * 0.05)} ${f(hr * 0.4)}`, 'none', `stroke="${shade(c.skin, 0.72)}" stroke-width="${f(er * 0.3)}" stroke-linecap="round"`));
  const mouthY = eyeY + hr * 0.62; const mw = faceW * (smile ? 0.5 : 0.36);
  if (c.moustache) g.push(path(`M${f(hx - faceW * 0.5)} ${f(mouthY - hr * 0.02)} Q${f(hx)} ${f(mouthY - hr * 0.35)} ${f(hx + faceW * 0.5)} ${f(mouthY - hr * 0.02)} Q${f(hx)} ${f(mouthY + hr * 0.12)} ${f(hx - faceW * 0.5)} ${f(mouthY - hr * 0.02)} Z`, c.moustache, stroke));
  else g.push(path(`M${f(hx + dx * 0.4 - mw * 0.5)} ${f(mouthY)} Q${f(hx + dx * 0.4)} ${f(mouthY + (smile ? hr * 0.22 : hr * 0.08))} ${f(hx + dx * 0.4 + mw * 0.5)} ${f(mouthY)}`, 'none', `stroke="${shade(c.skin, 0.62)}" stroke-width="${f(er * 0.45)}" stroke-linecap="round"`));
  if (c.stubble) { const r = rnd(5); for (let i = 0; i < 90; i++) { const a = r() * Math.PI * 2, d = 0.45 + r() * 0.5; const px = hx + Math.cos(a) * faceW * d, py = headY + hr * 0.45 + Math.sin(a) * hr * 0.42 * d; if (py > mouthY - hr * 0.25 && Math.abs(px - hx) < faceW * 0.95) g.push(circle(px, py, 1.4, '#2a2422', 'opacity="0.5"')); } }
  // glasses pushed up on the forehead
  if (c.glasses) { const gy = headY - hr * 0.7; g.push(circle(hx - faceW * 0.4, gy, hr * 0.2, 'none', `stroke="#3a3430" stroke-width="${f(er * 0.35)}"`)); g.push(circle(hx + faceW * 0.4, gy, hr * 0.2, 'none', `stroke="#3a3430" stroke-width="${f(er * 0.35)}"`)); g.push(line(hx - faceW * 0.2, gy, hx + faceW * 0.2, gy, '#3a3430', er * 0.35)); }
  if (c.pen) g.push(`<rect x="${f(hx + faceW * 1.0)}" y="${f(headY - hr * 0.25)}" width="${f(hr * 0.08)}" height="${f(hr * 0.5)}" fill="#e8b830" transform="rotate(20 ${f(hx + faceW)} ${f(headY)})"/>`);
  if (full && c.beads) for (let i = 0; i < 7; i++) g.push(circle(cx - shW * 1.0, shY + h * 0.12 + i * h * 0.02, w * 0.008, '#c9a24a'));
  if (full && c.hairStyle === 'curls') g.push(rect(cx + shW * 0.9, shY + h * 0.14, w * 0.07, h * 0.09, '#7a4a2a', 'rx="3"'));
  if (full && c.lanyard) { g.push(rect(cx - shW * 0.55, shY + h * 0.17, shW * 1.1, h * 0.012, '#d9d3c7')); }
  return svg(w, h, P, [...out, `<g>${g.join('')}</g>`], 'Portrait');
}

const hx0 = (cx, dx) => cx + dx * 0.4;

/** Basbousa: an orange tabby with a torn left ear, green eyes, a red collar, unimpressed. */
function catPortrait(c, w, h, view, expression, stroke) {
  const g = []; const cx = w * 0.5, cy = h * 0.42; const side = view === 'side'; const dx = side ? w * 0.06 : view === 'three-quarter' ? w * 0.04 : 0;
  const full = view === 'full-body'; const s = full ? 0.6 : 1; const hr = w * 0.3 * s; const hy = full ? h * 0.3 : cy;
  // body
  if (full) { g.push(ellipse(cx, h * 0.68, w * 0.28, h * 0.17, c.fur, stroke)); for (const lx of [-0.16, -0.06, 0.06, 0.16]) g.push(rect(cx + w * lx - w * 0.03, h * 0.78, w * 0.06, h * 0.1, c.fur, stroke)); g.push(path(`M${f(cx + w * 0.26)} ${f(h * 0.7)} Q${f(cx + w * 0.42)} ${f(h * 0.62)} ${f(cx + w * 0.36)} ${f(h * 0.42)}`, 'none', `stroke="${c.fur}" stroke-width="${f(w * 0.05)}" stroke-linecap="round"`)); for (let i = 0; i < 4; i++) g.push(path(`M${f(cx - w * 0.2 + i * w * 0.1)} ${f(h * 0.55)} q${f(w * 0.02)} ${f(h * 0.05)} 0 ${f(h * 0.1)}`, 'none', `stroke="${c.stripe}" stroke-width="${f(w * 0.02)}"`)); }
  else { g.push(path(`M${f(cx - w * 0.5)} ${f(h)} Q${f(cx - w * 0.45)} ${f(h * 0.62)} ${f(cx)} ${f(h * 0.6)} Q${f(cx + w * 0.45)} ${f(h * 0.62)} ${f(cx + w * 0.5)} ${f(h)} Z`, c.fur, stroke)); for (let i = -2; i <= 2; i++) g.push(path(`M${f(cx + i * w * 0.14)} ${f(h * 0.7)} q${f(w * 0.03)} ${f(h * 0.08)} 0 ${f(h * 0.16)}`, 'none', `stroke="${c.stripe}" stroke-width="${f(w * 0.03)}"`)); g.push(rect(cx - w * 0.36, h * 0.66, w * 0.72, h * 0.05, c.collar, stroke)); }
  // ears (the left one torn)
  g.push(poly([[cx + dx - hr * 0.95, hy - hr * 0.35], [cx + dx - hr * 0.8, hy - hr * 1.25], [cx + dx - hr * 0.62, hy - hr * 1.0], [cx + dx - hr * 0.55, hy - hr * 1.18], [cx + dx - hr * 0.25, hy - hr * 0.7]], c.fur, stroke));
  g.push(poly([[cx + dx + hr * 0.95, hy - hr * 0.35], [cx + dx + hr * 0.75, hy - hr * 1.25], [cx + dx + hr * 0.25, hy - hr * 0.7]], c.fur, stroke));
  g.push(poly([[cx + dx + hr * 0.85, hy - hr * 0.42], [cx + dx + hr * 0.72, hy - hr * 1.05], [cx + dx + hr * 0.4, hy - hr * 0.68]], '#e8a3a3'));
  // head
  g.push(ellipse(cx + dx, hy, hr, hr * 0.82, c.fur, stroke));
  for (const [ox, oy, l] of [[-0.4, -0.55, 0.3], [0, -0.7, 0.35], [0.4, -0.55, 0.3]]) g.push(path(`M${f(cx + dx + hr * ox)} ${f(hy + hr * oy)} q${f(hr * 0.06)} ${f(hr * l * 0.5)} 0 ${f(hr * l)}`, 'none', `stroke="${c.stripe}" stroke-width="${f(hr * 0.09)}"`));
  g.push(path(`M${f(cx + dx - hr * 0.98)} ${f(hy + hr * 0.15)} q${f(hr * 0.15)} ${f(hr * 0.35)} ${f(hr * 0.45)} ${f(hr * 0.3)}`, 'none', `stroke="${c.stripe}" stroke-width="${f(hr * 0.08)}"`)); g.push(path(`M${f(cx + dx + hr * 0.98)} ${f(hy + hr * 0.15)} q${f(-hr * 0.15)} ${f(hr * 0.35)} ${f(-hr * 0.45)} ${f(hr * 0.3)}`, 'none', `stroke="${c.stripe}" stroke-width="${f(hr * 0.08)}"`));
  // eyes: green, half-lidded unless surprised
  const lid = expression === 'smile' ? 0.35 : 0.55;
  for (const sx of side ? [0.3] : [-0.4, 0.4]) { const ex = cx + dx + hr * sx; g.push(ellipse(ex, hy - hr * 0.05, hr * 0.2, hr * 0.17, c.eyes, stroke)); g.push(ellipse(ex, hy - hr * 0.05, hr * 0.05, hr * 0.15, '#1a1a1a')); g.push(path(`M${f(ex - hr * 0.22)} ${f(hy - hr * 0.05 - hr * 0.2)} L${f(ex + hr * 0.22)} ${f(hy - hr * 0.05 - hr * 0.2)} L${f(ex + hr * 0.22)} ${f(hy - hr * 0.05 - hr * 0.2 + hr * 0.17 * lid)} Q${f(ex)} ${f(hy - hr * 0.05 - hr * 0.2 + hr * 0.17 * lid + hr * 0.03)} ${f(ex - hr * 0.22)} ${f(hy - hr * 0.05 - hr * 0.2 + hr * 0.17 * lid)} Z`, c.fur)); }
  // nose, mouth, whiskers
  g.push(poly([[cx + dx - hr * 0.08, hy + hr * 0.22], [cx + dx + hr * 0.08, hy + hr * 0.22], [cx + dx, hy + hr * 0.32]], '#d97b8a'));
  g.push(path(`M${f(cx + dx)} ${f(hy + hr * 0.32)} L${f(cx + dx)} ${f(hy + hr * 0.4)} M${f(cx + dx - hr * 0.18)} ${f(hy + hr * 0.42)} Q${f(cx + dx)} ${f(hy + hr * 0.36)} ${f(cx + dx + hr * 0.18)} ${f(hy + hr * 0.42)}`, 'none', `stroke="#3a2a22" stroke-width="${f(hr * 0.04)}" stroke-linecap="round"`));
  for (const [sy, sx] of [[0.25, -1], [0.35, -1], [0.25, 1], [0.35, 1]]) g.push(line(cx + dx + sx * hr * 0.3, hy + hr * sy, cx + dx + sx * hr * 1.4, hy + hr * (sy - 0.08) + (sy > 0.3 ? hr * 0.12 : 0), '#f3e9d6', hr * 0.025, 'opacity="0.9"'));
  return [`<g>${g.join('')}</g>`];
}

// -------------------------------------------------------------------------------------------------- compositions

const scene = (fn, w, h, time, o, title) => svg(w, h, TIMES[time], fn(w, h, TIMES[time], o), title);

// covers (16:9 backdrops), posters (2:3) and sleeves (1:1) — one motif per production, coordinated across shapes
const backdrops = {
  'last-sip': ['cafe', 'MORNING', { cat: true, abu: true, layla: true, abuX: 0.3, laylaX: 0.12 }, 'The Last Sip'],
  'last-sip-s1e1': ['alley', 'DAWN', { layla: true }, 'The Opening Hour'],
  'last-sip-s1e2': ['cafe', 'AFTERNOON', { karim: true, layla: true, laylaX: 0.16 }, 'The Debt'],
  'last-sip-s2e1': ['cafe', 'NIGHT', { layla: true, laylaX: 0.2, abuTable: true, cat: true }, 'New Management'],
  'paper-kites': ['rooftop', 'AFTERNOON', { kids: true }, 'Paper Kites'],
  'paper-boats': ['alley', 'RAIN', { boats: true, kids: true }, 'Paper Boats'],
  'river-lights': ['riverbank', 'DUSK', { nour: true, lightsOn: true }, 'River Lights'],
  'rooftop-radio': ['rooftop', 'NEON', { radio: true, duo: true, lights: true, neon: true }, 'Rooftop Radio'],
};
const FN = { cafe, alley, rooftop, riverbank, corridor };
for (const [id, [fn, time, o, title]] of Object.entries(backdrops)) write(`covers/${id}.svg`, scene(FN[fn], 1280, 720, time, o, title));
write('covers/night-tray.svg', scene(corridor, 1280, 720, 'NIGHT', { nurse: true, clock: true }, 'Night Tray'));
write('covers/night-tray-vertical.svg', scene(corridor, 720, 1280, 'NIGHT', { nurse: true, clock: true, longer: true }, 'Night Tray'));
for (const [id, [fn, time, o, title]] of Object.entries({ ...backdrops, 'night-tray': ['corridor', 'NIGHT', { nurse: true, clock: true, longer: true }, 'Night Tray'] })) {
  if (['last-sip', 'paper-kites', 'night-tray', 'paper-boats', 'last-sip-s1e1', 'last-sip-s1e2', 'last-sip-s2e1'].includes(id)) write(`covers/${id}-poster.svg`, scene(FN[fn], 800, 1200, time, o, title));
}
write('covers/river-lights-square.svg', scene(riverbank, 1000, 1000, 'DUSK', { nour: true, lightsOn: true, nourX: 0.5, nourH: 0.56 }, 'River Lights'));
write('covers/rooftop-radio-square.svg', scene(rooftop, 1000, 1000, 'NEON', { radio: true, duo: true, lights: true, neon: true }, 'Rooftop Radio'));

// character portraits and reference views
for (const [id, c] of Object.entries(CH)) {
  write(`characters/${id}.svg`, portrait(c, 768, 960));
  write(`characters/${id}-front.svg`, portrait(c, 768, 960, { view: 'front' }));
  write(`characters/${id}-three-quarter.svg`, portrait(c, 768, 960, { view: 'three-quarter' }));
  write(`characters/${id}-side.svg`, portrait(c, 768, 960, { view: 'side' }));
  write(`characters/${id}-full-body.svg`, portrait(c, 768, 960, { view: 'full-body' }));
  write(`characters/${id}-expression.svg`, portrait(c, 768, 960, { view: 'front', expression: 'smile' }));
}

// locations — a master plate, a second view and a night state each
const locs = { cafe: ['cafe', 'MORNING', { cat: true }, 'Abu Samir’s Café'], alley: ['alley', 'AFTERNOON', {}, 'Al-Mutanabbi Alley'], rooftop: ['rooftop', 'GOLDEN_HOUR', {}, 'Karim’s Rooftop'], riverbank: ['riverbank', 'DUSK', { lightsOn: true }, 'Tigris Riverbank'] };
const secondView = { cafe: ['cafe', 'AFTERNOON', { doorway: true }], alley: ['alley', 'MORNING', { awning: '#3f6fb0' }], rooftop: ['rooftop', 'MORNING', {}], riverbank: ['riverbank', 'MORNING', {}] };
for (const [id, [fn, time, o, title]] of Object.entries(locs)) {
  write(`locations/${id}.svg`, scene(FN[fn], 1280, 720, time, o, title));
  const [fn2, time2, o2] = secondView[id]; write(`locations/${id}-view-2.svg`, scene(FN[fn2], 1280, 720, time2, o2, title));
  write(`locations/${id}-night.svg`, scene(FN[fn], 1280, 720, 'NIGHT', { ...o, lightsOn: true }, title));
}

// frames — opening (a) and ending (b) frames for the sample shots, in the scene each shot is set in
const frames = {
  1: ['alley', 'DAWN', { layla: true }], 2: ['alley', 'DAWN', { karimDoor: true, layla: true }], 3: ['alley', 'DAWN', { closeKarim: true }],
  4: ['cafe', 'MORNING', { cat: true, layla: true, laylaX: 0.14 }], 5: ['cafe', 'MORNING', { doorway: true, abuDoor: true, cat: true }], 6: ['cafe', 'MORNING', { hand: true }], 7: ['cafe', 'MORNING', { abu: true, abuX: 0.3 }],
  8: ['cafe', 'AFTERNOON', { notebook: true }], 9: ['cafe', 'AFTERNOON', { karim: true, layla: true, laylaX: 0.16 }], 10: ['cafe', 'AFTERNOON', { abu: true, abuX: 0.3 }], 11: ['rooftop', 'GOLDEN_HOUR', { karim: true, recite: true }],
  12: ['riverbank', 'DUSK', { lightsOn: false }], 13: ['riverbank', 'DUSK', { closeNour: true, lightsOn: false }], 14: ['riverbank', 'DUSK', { nour: true, lightsOn: true }],
  15: ['alley', 'RAIN', {}], 16: ['alley', 'RAIN', { boats: true }], 17: ['alley', 'RAIN', { boats: true, kids: true }],
};
const ENDING = { DAWN: 'MORNING', MORNING: 'MORNING', AFTERNOON: 'GOLDEN_HOUR', GOLDEN_HOUR: 'DUSK', DUSK: 'NIGHT', RAIN: 'RAIN', NIGHT: 'NIGHT' };
for (const [n, [fn, time, o]] of Object.entries(frames)) {
  const k = String(n).padStart(2, '0');
  write(`frames/frame-${k}-a.svg`, scene(FN[fn], 1280, 720, time, o, `Shot ${n}`));
  write(`frames/frame-${k}-b.svg`, scene(FN[fn], 1280, 720, ENDING[time], { ...o, lightsOn: true }, `Shot ${n}`));
}
const vframes = { 1: { nurse: true, clock: true }, 2: { nurseFar: true, longer: true }, 3: { doorNumber: true }, 4: { kitchen: true } };
for (const [n, o] of Object.entries(vframes)) write(`frames/vertical-${n}-a.svg`, scene(corridor, 720, 1280, 'NIGHT', o, `Shot ${n}`));

// clips and audio, if ffmpeg is present (skipped with --pictures)
let ffmpeg = !process.argv.includes('--pictures');
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ffmpeg = false; console.warn('ffmpeg not found — pictures written, clips and audio skipped'); }
if (ffmpeg) {
  const run = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  const takeCount = 9;
  for (let i = 1; i <= takeCount; i++) {
    const out = join(OUT, 'takes', `take-${String(i).padStart(2, '0')}.mp4`);
    if (existsSync(out)) continue;
    const secs = 4 + (i % 3);
    const hue = (i * 40) % 360;
    // a slow-moving colour field with a drifting shape and a quiet tone: obviously synthetic, pleasant to watch
    const vf = `gradients=size=1280x720:duration=${secs}:speed=0.02:c0=0x${hsl(hue, 0.35, 0.35)}:c1=0x${hsl(hue + 40, 0.4, 0.55)}:nb_colors=2,drawbox=x='(w-240)/2+120*sin(t)':y='(h-240)/2+60*cos(t)':w=240:h=240:color=white@0.25:t=fill,format=yuv420p`;
    run(['-f', 'lavfi', '-i', vf, '-f', 'lavfi', '-i', `sine=frequency=${180 + i * 25}:sample_rate=48000:duration=${secs}`, '-af', 'volume=0.12,afade=t=in:d=0.4,afade=t=out:st=' + (secs - 0.6) + ':d=0.6', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-r', '24', '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', out]);
  }
  const vertical = join(OUT, 'takes', 'take-vertical-01.mp4');
  if (!existsSync(vertical)) run(['-f', 'lavfi', '-i', `gradients=size=720x1280:duration=5:speed=0.02:c0=0x${hsl(265, 0.4, 0.3)}:c1=0x${hsl(300, 0.35, 0.5)}:nb_colors=2,format=yuv420p`, '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=5', '-af', 'volume=0.1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-r', '24', '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', vertical]);
  const cut = join(OUT, 'takes', 'assembled-cut-sample.mp4');
  if (!existsSync(cut)) run(['-f', 'lavfi', '-i', `gradients=size=1280x720:duration=12:speed=0.03:c0=0x${hsl(30, 0.4, 0.35)}:c1=0x${hsl(200, 0.35, 0.5)}:nb_colors=3,format=yuv420p`, '-f', 'lavfi', '-i', 'sine=frequency=196:sample_rate=48000:duration=12', '-af', 'volume=0.1,tremolo=f=0.5:d=0.4', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-r', '24', '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', cut]);

  // a "song": four chords, looping, 48 seconds — clearly a sketch, clearly not sung
  const song = join(OUT, 'audio', 'river-lights-sample.m4a');
  if (!existsSync(song)) {
    const chord = (f) => `sine=frequency=${f}:sample_rate=48000:duration=48`;
    run(['-f', 'lavfi', '-i', chord(196), '-f', 'lavfi', '-i', chord(246.9), '-f', 'lavfi', '-i', chord(293.7), '-f', 'lavfi', '-i', chord(392), '-filter_complex', '[0][1][2][3]amix=inputs=4:normalize=0,volume=0.18,tremolo=f=2:d=0.3,afade=t=in:d=1.5,afade=t=out:st=45:d=3', '-c:a', 'aac', '-b:a', '96k', song]);
  }
  const uploaded = join(OUT, 'audio', 'uploaded-track-sample.m4a');
  if (!existsSync(uploaded)) run(['-f', 'lavfi', '-i', 'sine=frequency=261.6:sample_rate=48000:duration=36', '-f', 'lavfi', '-i', 'sine=frequency=329.6:sample_rate=48000:duration=36', '-filter_complex', '[0][1]amix=inputs=2:normalize=0,volume=0.16,tremolo=f=1.2:d=0.4,afade=t=in:d=1,afade=t=out:st=33:d=3', '-c:a', 'aac', '-b:a', '96k', uploaded]);
  // voice samples: short tones at speaking pitches
  for (const [name, f] of [['low', 110], ['mid', 165], ['high', 240], ['warm', 140], ['bright', 200], ['soft', 125]]) {
    const out = join(OUT, 'audio', `voice-${name}-sample.m4a`);
    if (!existsSync(out)) run(['-f', 'lavfi', '-i', `sine=frequency=${f}:sample_rate=48000:duration=3`, '-af', 'volume=0.15,tremolo=f=5:d=0.5,afade=t=in:d=0.1,afade=t=out:st=2.6:d=0.4', '-c:a', 'aac', '-b:a', '64k', out]);
  }
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

console.log('sample media written to public/sample');
