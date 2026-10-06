import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_ROOT, decodeWslOutput, judgeCacheEnv, judgeModelMounts, judgeWslMount, loadLayout, parseEnvKeys, physicalPath, readStoreEnv, storeConfig, wslMountArgs } from '../../scripts/lib/models-store.mjs';
import { verifyModels } from '../../scripts/lib/resume-checks.mjs';
import { planWatchdog, strandedContainers, type WatchdogState } from '@/server/ops/docker-watchdog';

/** The model store (docs/MODELS-STORAGE.md): one ext4 VHDX on D:, every model path derived from VEWBOX_MODELS_ROOT. */

const ROOT = '/run/desktop/mnt/host/wsl/models';
const layout = loadLayout(process.cwd());

describe('the store settings', () => {
  it('default: D:\\models\\vewbox-models.vhdx attached as `models`, seen by the engine at /run/desktop/mnt/host/wsl/models', () => {
    const c = storeConfig({});
    expect(c).toMatchObject({ root: DEFAULT_ROOT, vhdx: 'D:\\models\\vewbox-models.vhdx', name: 'models', ollama: `${ROOT}/llm/ollama`, wslPath: '/mnt/wsl/models', problems: [] });
    expect(wslMountArgs(c)).toEqual(['--mount', '--vhd', 'D:\\models\\vewbox-models.vhdx', '--name', 'models']);
  });
  it('every path derives from VEWBOX_MODELS_ROOT; the mount name is its last segment', () => {
    const c = storeConfig({ VEWBOX_MODELS_ROOT: '/run/desktop/mnt/host/wsl/vb2/', VEWBOX_MODELS_VHDX: 'E:\\x\\y.vhdx' });
    expect(c).toMatchObject({ root: '/run/desktop/mnt/host/wsl/vb2', name: 'vb2', ollama: '/run/desktop/mnt/host/wsl/vb2/llm/ollama', problems: [] });
  });
  it('refuses a root the engine cannot see (/mnt/wsl, a C: path, a named volume) and a VHDX on C:', () => {
    expect(storeConfig({ VEWBOX_MODELS_ROOT: '/mnt/wsl/models' }).problems[0]).toMatch(/invisible to the engine/);
    expect(storeConfig({ VEWBOX_MODELS_ROOT: '/run/desktop/mnt/host/c/models' }).problems).toHaveLength(1);
    expect(storeConfig({ VEWBOX_MODELS_ROOT: 'vewbox_models' }).problems).toHaveLength(1);
    expect(storeConfig({ VEWBOX_MODELS_ROOT: '/run/desktop/mnt/host/wsl/models/sub' }).problems).toHaveLength(1);
    expect(storeConfig({ VEWBOX_MODELS_VHDX: 'C:\\models\\m.vhdx' }).problems[0]).toMatch(/on C:/);
  });
  it('reads the store keys from .env, then .env.local, then the environment (backslashes kept)', () => {
    expect(parseEnvKeys('# x\nVEWBOX_MODELS_VHDX=D:\\models\\vewbox-models.vhdx\nOTHER=1\nVEWBOX_MODELS_ROOT="/run/desktop/mnt/host/wsl/m2" # c\n', ['VEWBOX_MODELS_ROOT', 'VEWBOX_MODELS_VHDX'])).toEqual({ VEWBOX_MODELS_VHDX: 'D:\\models\\vewbox-models.vhdx', VEWBOX_MODELS_ROOT: '/run/desktop/mnt/host/wsl/m2' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-store-'));
    fs.writeFileSync(path.join(dir, '.env'), 'VEWBOX_MODELS_ROOT=/run/desktop/mnt/host/wsl/a\nVEWBOX_MODELS_VHDX=D:\\a.vhdx\n');
    fs.writeFileSync(path.join(dir, '.env.local'), 'VEWBOX_MODELS_ROOT=/run/desktop/mnt/host/wsl/b\n');
    expect(readStoreEnv(dir, {})).toEqual({ VEWBOX_MODELS_ROOT: '/run/desktop/mnt/host/wsl/b', VEWBOX_MODELS_VHDX: 'D:\\a.vhdx' });
    expect(readStoreEnv(dir, { VEWBOX_MODELS_ROOT: '/run/desktop/mnt/host/wsl/c' }).VEWBOX_MODELS_ROOT).toBe('/run/desktop/mnt/host/wsl/c');
  });
});

describe('attaching with wsl --mount (idempotent)', () => {
  const utf16 = (s: string) => Buffer.from(s, 'utf16le');
  it('attached now, or already attached, are both fine', () => {
    expect(judgeWslMount(0, utf16("The disk was successfully mounted as '/mnt/wsl/models'."))).toMatchObject({ ok: true, state: 'attached' });
    expect(judgeWslMount(4294967295, utf16('That volume is already mounted inside WSL2.\r\nError code: Wsl/Service/MountDisk/WSL_E_DISK_ALREADY_MOUNTED\r\n'))).toMatchObject({ ok: true, state: 'already' });
  });
  it('a missing VHDX or another error is reported (wsl prints UTF-16)', () => {
    expect(judgeWslMount(1, utf16('The system cannot find the file specified.\r\nError code: Wsl/Service/AttachDisk/MountDisk/HCS/ERROR_FILE_NOT_FOUND'))).toMatchObject({ ok: false, state: 'missing' });
    expect(judgeWslMount(1, utf16('Something else'))).toMatchObject({ ok: false, state: 'error', detail: 'Something else' });
    expect(decodeWslOutput(utf16('abc'))).toBe('abc');
    expect(decodeWslOutput(Buffer.from('plain'))).toBe('plain');
  });
});

describe('the layout inside the store (docker/models/layout.json, shared with fetch.py)', () => {
  it("ComfyUI's typed folders under comfyui/, the caches under cache/, the rest by name", () => {
    expect(physicalPath('diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors', layout)).toBe('comfyui/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors');
    expect(physicalPath('text_encoders/a.safetensors', layout)).toBe('comfyui/text_encoders/a.safetensors');
    expect(physicalPath('detection/mediapipe_face_fp32.safetensors', layout)).toBe('comfyui/detection/mediapipe_face_fp32.safetensors');
    expect(physicalPath('asr/faster-whisper-large-v3/model.bin', layout)).toBe('asr/faster-whisper-large-v3/model.bin');
    expect(physicalPath('tts/voxcpm2/model.safetensors', layout)).toBe('tts/voxcpm2/model.safetensors');
    expect(physicalPath('hf-home/hub/x', layout)).toBe('cache/hf/hub/x');
    expect(physicalPath('demucs/hub/checkpoints/a.th', layout)).toBe('cache/torch/hub/checkpoints/a.th');
  });
  it('fetch.py applies the same file (same keys, same rule)', () => {
    const py = fs.readFileSync('docker/models/fetch.py', 'utf8');
    expect(py).toContain('Path(__file__).with_name("layout.json")');
    expect(py).toContain('dest_dir = root / physical(entry["folder"])');
    expect(fs.readFileSync('docker/comfyui/extra_model_paths.yaml', 'utf8')).toMatch(/base_path: \/models\/comfyui/);
    // every ComfyUI folder the extra_model_paths file maps is one layout.json places under comfyui/
    const mapped = [...fs.readFileSync('docker/comfyui/extra_model_paths.yaml', 'utf8').matchAll(/^\s+(\w+): (\w+)\s*$/gm)].map((m) => m[2]);
    for (const f of mapped) expect(layout.comfyui.folders).toContain(f);
  });
  it('the gates’ model check finds the files at their place in the store', () => {
    const manifest = { groups: [{ name: 'g', files: [{ repo: 'r', file: 'x/b.safetensors', folder: 'diffusion_models', bytes: 20 }, { repo: 'r', file: 'model.bin', folder: 'asr/w', bytes: 5 }] }] };
    const state = { 'diffusion_models/b.safetensors': { verified: true }, 'asr/w/model.bin': { verified: true } };
    expect(verifyModels(manifest, state, '20 comfyui/diffusion_models/b.safetensors\n5 asr/w/model.bin', ['g'], layout)).toMatchObject({ ok: true, ready: 2 });
    expect(verifyModels(manifest, state, '20 diffusion_models/b.safetensors\n5 asr/w/model.bin', ['g'], layout).missing).toEqual([{ group: 'g', file: 'diffusion_models/b.safetensors', why: 'not in the model store' }]);
  });
});

describe('compose derives every model path from VEWBOX_MODELS_ROOT', () => {
  const compose = fs.readFileSync('compose.yaml', 'utf8');
  it('the models and ollama volumes are binds of the store, under names of their own', () => {
    expect(compose).toMatch(/models:\n\s+name: vewbox_models_store\n\s+driver: local\n\s+driver_opts: \{ type: none, o: bind, device: "\$\{VEWBOX_MODELS_ROOT:-\/run\/desktop\/mnt\/host\/wsl\/models\}" \}/);
    expect(compose).toMatch(/ollama:\n\s+name: vewbox_ollama_store\n\s+driver: local\n\s+driver_opts: \{ type: none, o: bind, device: "\$\{VEWBOX_MODELS_ROOT:-\/run\/desktop\/mnt\/host\/wsl\/models\}\/llm\/ollama" \}/);
  });
  it('no hard-coded C: path, no /mnt/wsl bind, no old volume name, no cache outside the store', () => {
    const code = compose.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(code).not.toMatch(/\b[cC]:[\\/]|\/run\/desktop\/mnt\/host\/c\//);
    expect(code).not.toMatch(/\/mnt\/wsl/);
    expect(code).not.toMatch(/vewbox_models["\s:]|vewbox_ollama["\s:]/);
    expect(compose).not.toMatch(/HF_HOME: \/models\/hf-home|TORCH_HOME: \/models\/demucs/);
    expect(compose).toMatch(/HF_HOME: \/models\/cache\/hf/);
    expect(compose).toMatch(/TORCH_HOME: \/models\/cache\/torch/);
    expect(compose).toMatch(/OLLAMA_MODELS: \/root\/\.ollama\/models/);
  });
  it('the inference services mount the store read-only; only the fetcher writes it whole', () => {
    const rw = [...compose.matchAll(/["\s-]models:\/models(:ro)?["\s,\]]/g)];
    expect(rw.length).toBeGreaterThanOrEqual(7);
    const writable = rw.filter((m) => !m[1]);
    expect(writable).toHaveLength(1); // the fetcher (`models` service)
  });
});

describe('mounts: every running service loads from the store', () => {
  const vols = [
    { Name: 'vewbox_models_store', Options: { type: 'none', o: 'bind', device: ROOT } },
    { Name: 'vewbox_ollama_store', Options: { type: 'none', o: 'bind', device: `${ROOT}/llm/ollama` } },
    { Name: 'vewbox_models', Options: null },
  ];
  it('store volumes and binds pass; the legacy volume, a plain volume and a C: bind fail', () => {
    const ok = judgeModelMounts([
      { Name: '/vewbox-comfyui-1', Mounts: [{ Type: 'volume', Name: 'vewbox_models_store', Destination: '/models', RW: false }, { Type: 'volume', Name: 'vewbox_models_store', Destination: '/models/cache/hf', RW: true }, { Type: 'volume', Name: 'vewbox_comfyout', Destination: '/opt/comfyui/output' }] },
      { Name: '/vewbox-llm-1', Mounts: [{ Type: 'volume', Name: 'vewbox_ollama_store', Destination: '/root/.ollama', RW: true }] },
      { Name: '/x', Mounts: [{ Type: 'bind', Source: `${ROOT}/tts`, Destination: '/models/tts' }] },
    ], vols, ROOT);
    expect(ok.ok).toBe(true);
    expect(ok.rows).toHaveLength(4);
    const bad = judgeModelMounts([
      { Name: '/vewbox-tts-1', Mounts: [{ Type: 'volume', Name: 'vewbox_models', Destination: '/models' }] },
      { Name: '/b', Mounts: [{ Type: 'bind', Source: '/run/desktop/mnt/host/c/models', Destination: '/models' }] },
      { Name: '/c', Mounts: [{ Type: 'volume', Name: 'other', Destination: '/root/.ollama' }] },
    ], vols, ROOT);
    expect(bad.ok).toBe(false);
    expect(bad.problems).toEqual([
      `vewbox-tts-1: /models comes from legacy volume vewbox_models (Docker's disk image on C:), not the store (${ROOT})`,
      `b: /models comes from /run/desktop/mnt/host/c/models, not the store (${ROOT})`,
      `c: /root/.ollama comes from volume other (Docker's disk image on C:), not the store (${ROOT})`,
    ]);
  });
  it('a cache variable pointing outside the store is reported', () => {
    expect(judgeCacheEnv({ Config: { Env: ['HF_HOME=/models/cache/hf', 'TORCH_HOME=/models/cache/torch'] } }).ok).toBe(true);
    expect(judgeCacheEnv({ Config: { Env: ['HF_HOME=/root/.cache/huggingface'] } }).problems).toEqual(['HF_HOME=/root/.cache/huggingface is outside the store']);
  });
});

describe('watchdog: the store is attached before Docker starts', () => {
  const up: WatchdogState = { engineOk: true, dockerProcesses: 3, engineDownForMs: 0, secretsSocketExists: false, dbHealthy: true, workerRunning: true, workerAliveAgeMs: 2_000, workerWanted: true, recentDockerStarts: 0 };
  const crashed: WatchdogState = { ...up, engineOk: false, dockerProcesses: 0, engineDownForMs: 30_000, dbHealthy: false, workerRunning: false };
  const kinds = (a: ReturnType<typeof planWatchdog>) => a.map((x) => (x.kind === 'warn' ? `warn:${x.code}` : x.kind));
  it('after a reboot (engine down, store unknown): attach, then start Docker', () => {
    expect(kinds(planWatchdog({ ...crashed, modelStore: { attached: undefined, stranded: [] } }, { fix: true }))).toEqual(['attach-models', 'start-docker', 'wait-engine']);
    expect(kinds(planWatchdog({ ...crashed, secretsSocketExists: true, modelStore: { attached: undefined, stranded: [] } }, { fix: true }))).toEqual(['attach-models', 'rename-stale-socket', 'start-docker', 'wait-engine']);
  });
  it('Docker still starting: the store is attached anyway (Docker Desktop may have started on its own at sign-in)', () => {
    expect(kinds(planWatchdog({ ...crashed, dockerProcesses: 2, modelStore: { attached: undefined, stranded: [] } }, { fix: true }))).toEqual(['attach-models', 'ok']);
  });
  it('attached and healthy: nothing to do; detached without --fix: reported', () => {
    expect(kinds(planWatchdog({ ...up, modelStore: { attached: true, stranded: [] } }, { fix: true }))).toEqual(['ok', 'ok']);
    expect(kinds(planWatchdog({ ...up, modelStore: { attached: false, stranded: [] } }, { fix: false }))).toEqual(['ok', 'warn:MODELS_DETACHED', 'ok']);
  });
  it('services that could not start without the store: attached, then started (fix); reported otherwise', () => {
    expect(kinds(planWatchdog({ ...up, modelStore: { attached: false, stranded: ['vewbox-comfyui-1'] } }, { fix: true }))).toEqual(['ok', 'attach-models', 'start-stranded', 'ok']);
    expect(kinds(planWatchdog({ ...up, modelStore: { attached: true, stranded: ['vewbox-comfyui-1'] } }, { fix: false }))).toEqual(['ok', 'warn:MODELS_STRANDED', 'ok']);
  });
  it('a container on old storage (tombstone, foreign volume, C:) is reported, with or without --fix, never acted on', () => {
    const s = { ...up, modelStore: { attached: true, stranded: [], mountProblems: ['vewbox-llm-1: /root/.ollama comes from retired volume vewbox_ollama (tombstone: a stale compose file), not the store'] } };
    expect(kinds(planWatchdog(s, { fix: true }))).toEqual(['ok', 'warn:MODEL_MOUNTS', 'ok']);
    expect(kinds(planWatchdog(s, { fix: false }))).toEqual(['ok', 'warn:MODEL_MOUNTS', 'ok']);
  });
  it('stranded = a service meant to run whose start failed on a store volume; a container stopped on purpose is not', () => {
    const cfg = { root: ROOT };
    expect(strandedContainers([
      { Name: '/vewbox-comfyui-1', State: { Status: 'exited', Error: "error while mounting volume '/var/lib/docker/volumes/vewbox_models_store/_data': failed to mount local volume: mount /run/desktop/mnt/host/wsl/models:/var/lib/docker/volumes/vewbox_models_store/_data, flags: 0x1000: no such file or directory" }, HostConfig: { RestartPolicy: { Name: 'unless-stopped' } } },
      { Name: '/vewbox-tts-1', State: { Status: 'exited', Error: '' }, HostConfig: { RestartPolicy: { Name: 'unless-stopped' } } },
      { Name: '/vewbox-models-run-1', State: { Status: 'exited', Error: 'vewbox_models_store …' }, HostConfig: { RestartPolicy: { Name: 'no' } } },
      { Name: '/vewbox-llm-1', State: { Status: 'running', Error: '' }, HostConfig: { RestartPolicy: { Name: 'unless-stopped' } } },
    ], cfg)).toEqual(['vewbox-comfyui-1']);
  });
});
