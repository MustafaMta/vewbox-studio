#!/usr/bin/env node
/** MODEL PATH VALIDATOR (docs/MODELS-STORAGE.md). Every model weight lives in the model store (VEWBOX_MODELS_ROOT, the
 *  ext4 VHDX on D:); this scans the places a model path can hide for references to the OLD storage and fails with the
 *  file and line:
 *    - the retired volume names vewbox_models / vewbox_ollama (now tombstones) — not the *_store volumes;
 *    - a compose file whose `models` / `ollama` volume is not the store's bind (a stale compose.yaml);
 *    - the old in-container layout (/models/hf-home, /models/demucs, ComfyUI's flat /models/<type>/, base_path /models);
 *    - a model or cache path on C:;
 *    - /mnt/wsl/<name> as a bind source (invisible to Docker Desktop's engine: it silently becomes an empty directory);
 *    - an HF / Transformers / Torch / Ollama cache variable pointing outside the store.
 *
 *    node scripts/check-model-paths.mjs                 # this checkout (fails on a hit) + every worktree (listed)
 *    node scripts/check-model-paths.mjs --json          # machine-readable
 *    node scripts/check-model-paths.mjs --no-worktrees  # this checkout only
 *
 *  Exit 1 when THIS checkout has a hit; worktree hits are reported for their owners (--strict fails on them too).
 *  A line may opt out with the marker `model-paths: allow` (for text that names the old storage on purpose). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Files that name the old storage on purpose: the retirement tooling, the validator, their tests. */
export const ALLOW_FILES = new Set([
  'scripts/check-model-paths.mjs', 'scripts/lib/models-store.mjs', 'scripts/models-store-retire.ps1', 'scripts/compact-docker-disk.ps1',
  'tests/unit/models-store.test.ts', 'tests/unit/check-model-paths.test.ts',
  // a fixture's provenance note (where the vocabulary was read, 2026-10-04)
  'tests/fixtures/voice/habibi-irq-vocab-chars.json',
  // its first lines are docker/asr/Dockerfile's of 2026-10-06, verbatim, for layer reuse (TORCH_HOME there is overridden
  // by the image's own later ENV and, at run time, by compose's model-cache env)
  'docker/lipsync/Dockerfile',
]);

const SECRETISH = /(KEY|TOKEN|PASSWORD|SECRET)/i;

/** Line rules: [id, regex, message]. */
export const LINE_RULES = [
  ['retired-volume', /\bvewbox_(models|ollama)\b(?!_store)/, 'names a retired volume (now a tombstone): use the store (vewbox_models_store / vewbox_ollama_store, or ${VEWBOX_MODELS_ROOT})'],
  ['old-layout', /\/models\/(hf-home|demucs)\b/, 'old in-container cache path: HF_HOME is /models/cache/hf, TORCH_HOME /models/cache/torch'],
  ['old-layout', /\/models\/(diffusion_models|text_encoders|vae|loras|detection|checkpoints|clip_vision|controlnet|upscale_models)\//, "ComfyUI's flat layout: its typed folders are /models/comfyui/<type>/ (docker/models/layout.json)"],
  ['old-layout', /^\s*base_path:\s*\/models\s*$/, 'extra_model_paths base_path must be /models/comfyui'],
  ['c-drive', /\b[cC]:[\\/][^\s"'`]*?(?:[\\/]models\b|huggingface|[\\/]\.ollama|[\\/]\.cache[\\/](?:torch|huggingface))/, 'a model or cache path on C: (the store is on D:)'],
  ['wsl-path', /(?:-v\s+|device:\s*|^\s*-\s*"?|source:\s*)\/mnt\/wsl\//, '/mnt/wsl/<name> is invisible to Docker Desktop\'s engine: use /run/desktop/mnt/host/wsl/<name> (VEWBOX_MODELS_ROOT)'],
  ['cache-env', /\b(HF_HOME|HF_HUB_CACHE|TRANSFORMERS_CACHE|TORCH_HOME|OLLAMA_MODELS)\s*[:=]\s*["']?(?!\/models\/|\/root\/\.ollama|\$\{|["']?\s*$)\S/, 'a model cache variable outside the store (/models/cache/…, /root/.ollama/models)'],
];

/** Compose-file rule: a top-level `models` / `ollama` volume that is not the store's bind. */
export function composeVolumeProblems(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const top = lines.findIndex((l) => /^volumes:\s*$/.test(l));
  if (top < 0) return out;
  for (let i = top + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
    const m = lines[i].match(/^ {2}(models|ollama):\s*(.*)$/);
    if (!m) continue;
    let body = m[2];
    for (let j = i + 1; j < lines.length && /^ {4}/.test(lines[j]); j++) body += `\n${lines[j]}`;
    const want = m[1] === 'models' ? 'vewbox_models_store' : 'vewbox_ollama_store';
    if (!body.includes(want) || !/VEWBOX_MODELS_ROOT/.test(body)) out.push({ line: i + 1, rule: 'stale-compose', message: `volume "${m[1]}" is not the model store's bind (name ${want}, device \${VEWBOX_MODELS_ROOT}…): a stale compose.yaml — merge main` });
  }
  return out;
}

const SCAN_DIRS = ['scripts', 'docker', 'tools', 'src'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.next-test', '.git', 'var', 'docs', 'test-results', 'playwright-report', '.claude']);
const EXT = /\.(ya?ml|mjs|cjs|js|ts|tsx|py|sh|ps1|json|toml|cfg|ini|conf|txt)$|Dockerfile$/i;

function walk(dir, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (e.isFile() && EXT.test(e.name)) out.push(path.join(dir, e.name));
  }
}

/** The files of one checkout to scan. */
export function filesOf(root) {
  const out = [];
  for (const f of fs.readdirSync(root, { withFileTypes: true })) {
    if (f.isFile() && (/^compose.*\.ya?ml$/.test(f.name) || /^docker-compose.*\.ya?ml$/.test(f.name) || /^\.env(\..+)?$/.test(f.name))) out.push(path.join(root, f.name));
  }
  for (const d of SCAN_DIRS) walk(path.join(root, d), out);
  out.push(...['tests/fixtures', 'tests/unit'].flatMap((d) => { const o = []; walk(path.join(root, d), o); return o; }).filter((f) => /\.(json|ts)$/.test(f)));
  return [...new Set(out)];
}

/** Hits in one file's text. `rel` is the path relative to its checkout. */
export function scanText(rel, text) {
  if (ALLOW_FILES.has(rel.replace(/\\/g, '/'))) return [];
  const hits = [];
  const isEnv = /(^|\/)\.env(\.|$)/.test(rel.replace(/\\/g, '/'));
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('model-paths: allow')) return;
    if (/^\s*(#|\/\/|\*|\/\*)/.test(line) && !/^\s*#\s*(docker|wsl|-v)\b/.test(line)) {
      // comments: only the retired-volume rule applies (a comment that tells people to use an old volume still misleads)
      if (!LINE_RULES[0][1].test(line)) return;
    }
    for (const [rule, re, message] of LINE_RULES) {
      if (re.test(line)) {
        const shown = isEnv && SECRETISH.test(line.split('=')[0]) ? `${line.split('=')[0]}=<redacted>` : line.trim().slice(0, 200);
        hits.push({ line: i + 1, rule, message, text: shown });
        break;
      }
    }
  });
  if (/(^|\/)(docker-)?compose[^/]*\.ya?ml$/.test(rel.replace(/\\/g, '/'))) hits.push(...composeVolumeProblems(text).map((h) => ({ ...h, text: '' })));
  return hits;
}

export function scanCheckout(root) {
  const hits = [];
  for (const f of filesOf(root)) {
    let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (text.length > 4 * 1024 * 1024) continue;
    for (const h of scanText(path.relative(root, f), text)) hits.push({ file: path.relative(root, f).replace(/\\/g, '/'), ...h });
  }
  return hits;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');
  const ROOT = argv.includes('--root') ? path.resolve(argv[argv.indexOf('--root') + 1]) : HERE;
  const main = scanCheckout(ROOT);
  const worktrees = [];
  if (!argv.includes('--no-worktrees')) {
    const wtRoot = path.join(ROOT, '.claude', 'worktrees');
    for (const d of fs.existsSync(wtRoot) ? fs.readdirSync(wtRoot) : []) {
      const r = path.join(wtRoot, d);
      if (fs.existsSync(path.join(r, 'compose.yaml')) || fs.existsSync(path.join(r, 'scripts'))) worktrees.push({ worktree: d, hits: scanCheckout(r) });
    }
  }
  if (json) console.log(JSON.stringify({ checkout: ROOT, hits: main, worktrees: worktrees.filter((w) => w.hits.length) }, null, 2));
  else {
    console.log(`model paths — ${ROOT}: ${main.length ? `${main.length} hit(s)` : 'clean'}`);
    for (const h of main) console.log(`  ${h.file}:${h.line} [${h.rule}] ${h.message}${h.text ? `\n      ${h.text}` : ''}`);
    for (const w of worktrees.filter((x) => x.hits.length)) {
      console.log(`worktree ${w.worktree}: ${w.hits.length} hit(s)`);
      for (const h of w.hits) console.log(`  ${h.file}:${h.line} [${h.rule}] ${h.message}${h.text ? `\n      ${h.text}` : ''}`);
    }
    const clean = worktrees.filter((x) => !x.hits.length).length;
    if (worktrees.length) console.log(`${clean} of ${worktrees.length} worktrees clean`);
  }
  process.exitCode = main.length || (strict && worktrees.some((w) => w.hits.length)) ? 1 : 0;
}
