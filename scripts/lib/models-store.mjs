/** THE MODEL STORE (docs/MODELS-STORAGE.md) — the pure parts, shared by scripts/resume-local.mjs and the watchdog
 *  (src/server/ops/docker-watchdog.ts) and tested in tests/unit/models-store.test.ts.
 *
 *  Every weight lives in ONE ext4 VHDX on D: (VEWBOX_MODELS_VHDX), attached to the WSL VM with
 *  `wsl --mount --vhd <vhdx> --name <name>` (no admin rights needed on WSL 2.x/3.x). Docker Desktop's engine sees it at
 *  /run/desktop/mnt/host/wsl/<name> = VEWBOX_MODELS_ROOT; the WSL distros see /mnt/wsl/<name>, which the ENGINE does not
 *  (a bind of it silently creates an empty directory on Docker Desktop's own disk — measured 2026-10-06). The compose
 *  volumes `models` and `ollama` are binds of the root; a detached store makes them unmountable, so no service runs
 *  without its weights. The store's root carries the marker `.vewbox-models`. */
import fs from 'node:fs';
import path from 'node:path';

export const ENGINE_WSL_DIR = '/run/desktop/mnt/host/wsl';
export const DEFAULT_ROOT = `${ENGINE_WSL_DIR}/models`;
export const DEFAULT_VHDX = 'D:\\models\\vewbox-models.vhdx';
export const MARKER = '.vewbox-models';
/** The volumes compose used before the store; nothing may load weights from them any more. */
export const LEGACY_VOLUMES = ['vewbox_models', 'vewbox_ollama', 'volexar-studio_models'];

/** The store's settings from the environment (.env / .env.local). Every path derives from VEWBOX_MODELS_ROOT. */
/** @param {Record<string, string | undefined>} [env] */
export function storeConfig(env = process.env) {
  const root = (env.VEWBOX_MODELS_ROOT || DEFAULT_ROOT).replace(/\/+$/, '');
  const vhdx = env.VEWBOX_MODELS_VHDX || DEFAULT_VHDX;
  const name = root.split('/').pop();
  const problems = [];
  if (!root.startsWith(`${ENGINE_WSL_DIR}/`) || root.split('/').length !== ENGINE_WSL_DIR.split('/').length + 1) {
    problems.push(`VEWBOX_MODELS_ROOT=${root} is not ${ENGINE_WSL_DIR}/<name> (where Docker's engine sees a disk attached with wsl --mount --name <name>; /mnt/wsl/<name> is invisible to the engine)`);
  }
  if (/^[cC]:/.test(vhdx)) problems.push(`VEWBOX_MODELS_VHDX=${vhdx} is on C: — the store belongs on D: (the global model storage policy)`);
  if (!/\.vhdx$/i.test(vhdx)) problems.push(`VEWBOX_MODELS_VHDX=${vhdx} is not a .vhdx file`);
  return { root, vhdx, name, ollama: `${root}/llm/ollama`, wslPath: `/mnt/wsl/${name}`, problems };
}

/** VEWBOX_MODELS_* from the environment, else from `<repo>/.env.local`, else `<repo>/.env` (for scripts run with plain
 *  `node`, which loads no env file). Only the store's keys are read. */
/** @param {string} repoRoot @param {Record<string, string | undefined>} [env] @returns {Record<string, string>} */
export function readStoreEnv(repoRoot, env = process.env) {
  const keys = ['VEWBOX_MODELS_ROOT', 'VEWBOX_MODELS_VHDX'];
  /** @type {Record<string, string>} */
  const out = {};
  const files = ['.env', '.env.local'].map((f) => path.join(repoRoot, f)).filter((f) => fs.existsSync(f));
  for (const f of files) Object.assign(out, parseEnvKeys(fs.readFileSync(f, 'utf8'), keys));
  for (const k of keys) if (env[k]) out[k] = env[k];
  return out;
}

/** `KEY=value` lines → the listed keys (unquoted values literally, so `D:\models\…` keeps its backslashes). */
/** @param {string} text @param {string[]} keys @returns {Record<string, string>} */
export function parseEnvKeys(text, keys) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || !keys.includes(m[1])) continue;
    let v = m[2];
    const q = v[0];
    if ((q === '"' || q === "'") && v.indexOf(q, 1) > 0) v = v.slice(1, v.indexOf(q, 1));
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

/** The `wsl --mount` argument vector that attaches the store (idempotent with judgeWslMount). */
export function wslMountArgs(cfg) { return ['--mount', '--vhd', cfg.vhdx, '--name', cfg.name]; }

/** wsl.exe prints UTF-16LE; decode a Buffer (or pass a string through) and drop the NULs. */
export function decodeWslOutput(out) {
  if (out == null) return '';
  if (typeof out === 'string') return out.replace(/\u0000/g, '');
  const looksUtf16 = out.length > 1 && out[1] === 0;
  return (looksUtf16 ? out.toString('utf16le') : out.toString('utf8')).replace(/\u0000/g, '');
}

/** The outcome of `wsl --mount --vhd …`: attached now, already attached (fine), or an error to report. */
export function judgeWslMount(code, text) {
  const t = decodeWslOutput(text);
  if (code === 0) return { ok: true, state: 'attached', detail: 'store attached now' };
  if (/WSL_E_DISK_ALREADY_MOUNTED|already (mounted|attached)/i.test(t)) return { ok: true, state: 'already', detail: 'store already attached' };
  if (/ERROR_FILE_NOT_FOUND|cannot find the (file|path)|WSL_E_.*NOT_FOUND/i.test(t)) return { ok: false, state: 'missing', detail: `the store's VHDX does not exist: ${t.trim().split('\n')[0]}` };
  if (/in use|being used by another process|SHARING_VIOLATION/i.test(t)) return { ok: false, state: 'busy', detail: `the VHDX is in use by something else (a second attach under another name?): ${t.trim().split('\n')[0]}` };
  return { ok: false, state: 'error', detail: (t.trim().split('\n')[0] || `wsl --mount exited ${code}`) };
}

// ------------------------------------------------------------------------------------------------- layout

/** docker/models/layout.json (the single source fetch.py also reads). */
export function loadLayout(repoRoot) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'docker', 'models', 'layout.json'), 'utf8'));
}

/** A logical manifest path (`diffusion_models/x.safetensors`, `asr/…`, `hf-home/…`) → its path inside the store. */
export function physicalPath(logical, layout) {
  const i = logical.indexOf('/');
  const top = i < 0 ? logical : logical.slice(0, i);
  const rest = i < 0 ? '' : logical.slice(i + 1);
  const comfy = layout?.comfyui ?? {};
  if ((comfy.folders ?? []).includes(top)) return `${comfy.dir ?? 'comfyui'}/${logical}`;
  const renamed = layout?.renamed?.[top];
  if (renamed) return rest ? `${renamed}/${rest}` : renamed;
  return logical;
}

// ------------------------------------------------------------------------------------------------- mounts

/** Is `src` (a container mount's source, or a volume's bind device) inside the store root? */
export const inStore = (src, root) => typeof src === 'string' && (src === root || src.startsWith(`${root}/`));

/** Every container mount that reaches model weights (/models…, /root/.ollama…), judged against the store.
 *  `containers`: `docker inspect <c…>` (array); `volumes`: `docker volume inspect <v…>` (array). A model mount is fine
 *  only when it is a bind of the store or a volume whose bind device is in the store; a legacy volume, a plain named
 *  volume (inside Docker's disk image on C:) or a host path on C: is a failure. */
export function judgeModelMounts(containers, volumes, root) {
  const vol = new Map((volumes ?? []).map((v) => [v.Name, v]));
  const rows = []; const problems = [];
  for (const c of containers ?? []) {
    const name = String(c.Name ?? '').replace(/^\//, '');
    for (const m of c.Mounts ?? []) {
      const dest = m.Destination ?? '';
      if (!(dest === '/models' || dest.startsWith('/models/') || dest === '/root/.ollama' || dest.startsWith('/root/.ollama/'))) continue;
      let where; let ok;
      const tomb = tombstoneDevice(root);
      if (m.Type === 'volume') {
        const v = vol.get(m.Name);
        const device = v?.Options?.device;
        const isBind = v?.Options?.o?.split(',').includes('bind');
        // only the store's own volumes, bound inside the store (and never the tombstone a retired name points at)
        ok = Boolean(STORE_VOLUMES.includes(m.Name) && isBind && inStore(device, root) && device !== tomb && !String(device).startsWith(`${tomb}/`));
        where = ok ? device
          : device === tomb ? `retired volume ${m.Name} (tombstone: a stale compose file)`
          : LEGACY_VOLUMES.includes(m.Name) ? `legacy volume ${m.Name} (Docker's disk image on C:)`
          : `volume ${m.Name}${device ? ` → ${device}` : ' (Docker\'s disk image on C:)'}`;
      } else if (m.Type === 'bind') {
        ok = inStore(m.Source, root) && !String(m.Source).startsWith(tomb);
        where = m.Source;
      } else { ok = false; where = `${m.Type} mount`; }
      rows.push({ container: name, destination: dest, rw: Boolean(m.RW), source: where, ok });
      if (!ok) problems.push(`${name}: ${dest} comes from ${where}, not the store (${root})`);
    }
  }
  return { ok: problems.length === 0, rows, problems };
}

/** The retired volume names as TOMBSTONES: local bind volumes whose device is a path that never exists. Compose never
 *  recreates an existing volume, so a stale compose file that still binds `vewbox_models` / `vewbox_ollama` fails
 *  container creation ("no such file or directory") instead of starting on old or empty storage. */
export const TOMBSTONE_NAME = '.retired-volume-DO-NOT-USE';
export const tombstoneDevice = (root) => `${root}/${TOMBSTONE_NAME}`;
/** `docker volume create` arguments for one tombstone. */
export const tombstoneCreateArgs = (name, root) => ['volume', 'create', '--driver', 'local', '--opt', 'type=none', '--opt', 'o=bind', '--opt', `device=${tombstoneDevice(root)}`, '--label', 'vewbox.retired=1', name];

/** The old names (vewbox_models, vewbox_ollama) against `docker volume inspect` output: each must be a tombstone.
 *  Still a real volume = not retired yet (warning: retire it); absent = the tombstone is missing (warning: create it);
 *  a bind elsewhere = failure. */
export function judgeTombstones(volumes, root, names = ['vewbox_models', 'vewbox_ollama']) {
  const by = new Map((volumes ?? []).map((v) => [v.Name, v]));
  const problems = []; const warnings = []; const rows = [];
  for (const n of names) {
    const v = by.get(n);
    const device = v?.Options?.device;
    if (!v) { warnings.push(`${n}: no tombstone (docker ${tombstoneCreateArgs(n, root).join(' ')})`); rows.push({ name: n, state: 'absent' }); }
    else if (device === tombstoneDevice(root)) rows.push({ name: n, state: 'tombstone' });
    else if (!device) { warnings.push(`${n}: still the old volume (inside Docker's disk image on C:): retire it (scripts/models-store-retire.ps1)`); rows.push({ name: n, state: 'old-volume' }); }
    else { problems.push(`${n}: binds ${device}, not the tombstone ${tombstoneDevice(root)}`); rows.push({ name: n, state: 'wrong' }); }
  }
  return { ok: problems.length === 0, problems, warnings, rows };
}

/** The store's own compose volumes (compose.yaml `name:`): the only named volumes a model mount may use. */
export const STORE_VOLUMES = ['vewbox_models_store', 'vewbox_ollama_store'];

/** The env of a container (`docker inspect` Config.Env) → cache variables that would land outside the store. */
export function judgeCacheEnv(container) {
  const env = Object.fromEntries((container?.Config?.Env ?? []).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
  const problems = [];
  for (const k of ['HF_HOME', 'HF_HUB_CACHE', 'TRANSFORMERS_CACHE', 'TORCH_HOME', 'OLLAMA_MODELS']) {
    const v = env[k];
    if (v !== undefined && !(v.startsWith('/models/') || v.startsWith('/root/.ollama'))) problems.push(`${k}=${v} is outside the store`);
  }
  return { ok: problems.length === 0, problems };
}
