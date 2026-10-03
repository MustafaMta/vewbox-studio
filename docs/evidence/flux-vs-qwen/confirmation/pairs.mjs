#!/usr/bin/env node
/** The upload/redraw pairs of the confirmation for sface.py:  node pairs.mjs > pairs.json */
import fs from 'node:fs/promises';

const ROOT = 'D:/volexar-studio/volexar-studio/var/flux-vs-qwen';
const UPLOAD = {
  'ir1-headshot-to-cartoon': `${ROOT}/fixtures/upload-photo-headshot.png`, 'ir2-photo-to-realistic': `${ROOT}/fixtures/upload-photo-fullbody.png`, 'ir3-anime-to-anime': `${ROOT}/fixtures/upload-anime.png`,
  'ix1-bust-photo-to-realistic': `${ROOT}/fixtures/ix1-bust-photo-to-realistic.png`, 'ix2-waist-photo-to-cartoon': `${ROOT}/fixtures/ix2-waist-photo-to-cartoon.png`, 'ix3-bust-photo-to-anime': `${ROOT}/fixtures/ix3-bust-photo-to-anime.png`,
  ...Object.fromEntries(['ic1-scarf-headshot-to-realistic', 'ic2-moustache-waist-to-cartoon', 'ic3-fullbody-teen-to-anime', 'ic4-cg-girl-to-cartoon', 'ic5-curly-headshot-to-anime', 'ic6-bob-bust-to-realistic'].map((k) => [k, `${ROOT}/confirmation/fixtures/${k.slice(0, 3)}.png`])),
};
const report = JSON.parse(await fs.readFile(new URL('./results.json', import.meta.url), 'utf8'));
const pairs = report.records.filter((r) => (r.phase === 'klein' || r.phase === 'qwen') && r.file).map((r) => ({ key: `${r.phase}|${r.key}|${r.variant}|${r.seed}`, upload: UPLOAD[r.key], output: r.file }));
process.stdout.write(JSON.stringify(pairs, null, 1));
