#!/usr/bin/env node
/** Decode upload/redraw pairs to raw RGB24 for sface.py and write its manifest.
 *    node sface-prep.mjs <pairs.json> <out dir>      pairs.json: [{ key, upload: <png>, output: <png> }] */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [pairsFile, outDir] = process.argv.slice(2);
const pairs = JSON.parse((await fs.readFile(pairsFile, 'utf8')).replace(/^﻿/, ''));
await fs.mkdir(outDir, { recursive: true });
const done = new Map();
async function raw(file) {
  if (done.has(file)) return done.get(file);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  const [w, h] = stdout.trim().split(',').map(Number);
  const name = `${done.size}.rgb`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', path.join(outDir, name)]);
  const r = { name, w, h };
  done.set(file, r);
  return r;
}
const manifest = [];
for (const p of pairs) {
  const u = await raw(p.upload); const o = await raw(p.output);
  manifest.push({ key: p.key, upload: u.name, uw: u.w, uh: u.h, output: o.name, ow: o.w, oh: o.h });
}
await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} pairs, ${done.size} pictures → ${outDir}`);
