import { describe, expect, it } from 'vitest';
import { composeVolumeProblems, scanCheckout, scanText } from '../../scripts/check-model-paths.mjs';
import { judgeModelMounts, judgeTombstones, tombstoneCreateArgs, tombstoneDevice } from '../../scripts/lib/models-store.mjs';

const ROOT = '/run/desktop/mnt/host/wsl/models';
const rules = (rel: string, text: string) => scanText(rel, text).map((h: { rule: string; line: number }) => `${h.line}:${h.rule}`);

describe('check-model-paths: old model storage is found with its file and line', () => {
  it('the retired volume names, but not the store volumes', () => {
    expect(rules('scripts/x.sh', 'docker run -v vewbox_models:/models alpine\ndocker run -v vewbox_models_store:/models alpine\n-v vewbox_ollama:/root/.ollama')).toEqual(['1:retired-volume', '3:retired-volume']);
  });
  it('the old in-container layout, a C: model path, /mnt/wsl as a bind source, a cache variable outside the store', () => {
    expect(rules('compose.yaml', 'x: { HF_HOME: /models/hf-home }')).toEqual(['1:old-layout']);
    expect(rules('scripts/a.py', 'p = "/models/diffusion_models/x.safetensors"\nq = "/models/comfyui/diffusion_models/x.safetensors"')).toEqual(['1:old-layout']);
    expect(rules('docker/comfyui/extra_model_paths.yaml', 'vewbox:\n  base_path: /models\n')).toEqual(['2:old-layout']);
    expect(rules('scripts/b.ps1', '$m = "C:\\Users\\x\\.cache\\huggingface\\hub"\n$d = "D:\\models\\vewbox-models.vhdx"')).toEqual(['1:c-drive']);
    expect(rules('scripts/c.sh', 'docker run -v /mnt/wsl/models:/models alpine\ndocker run -v /run/desktop/mnt/host/wsl/models:/models alpine')).toEqual(['1:wsl-path']);
    expect(rules('docker/x/Dockerfile', 'ENV TORCH_HOME=/root/.cache/torch\nENV TORCH_HOME=/models/cache/torch')).toEqual(['1:cache-env']);
  });
  it('the opt-out marker and comments (only a retired name counts in a comment)', () => {
    expect(rules('scripts/x.sh', 'docker run -v vewbox_models:/models alpine # model-paths: allow')).toEqual([]);
    expect(rules('scripts/x.ts', '// the flat /models/vae/ layout was replaced\n// use vewbox_models for this')).toEqual(['2:retired-volume']);
  });
  it('a compose file whose models/ollama volume is not the store bind is stale', () => {
    const stale = 'services:\n  a:\n    volumes: [ "models:/models" ]\nvolumes:\n  pgdata:\n  models:\n  ollama:\n';
    expect(composeVolumeProblems(stale).map((p: { line: number }) => p.line)).toEqual([6, 7]);
    const good = 'volumes:\n  models:\n    name: vewbox_models_store\n    driver: local\n    driver_opts: { type: none, o: bind, device: "${VEWBOX_MODELS_ROOT:-/run/desktop/mnt/host/wsl/models}" }\n  ollama:\n    name: vewbox_ollama_store\n    driver_opts: { type: none, o: bind, device: "${VEWBOX_MODELS_ROOT:-x}/llm/ollama" }\n';
    expect(composeVolumeProblems(good)).toEqual([]);
  });
  it('this checkout is clean', () => {
    expect(scanCheckout(process.cwd())).toEqual([]);
  });
});

describe('tombstones: the retired volume names bind a path that never exists', () => {
  it('create arguments and the judgement', () => {
    expect(tombstoneDevice(ROOT)).toBe(`${ROOT}/.retired-volume-DO-NOT-USE`);
    expect(tombstoneCreateArgs('vewbox_models', ROOT)).toEqual(['volume', 'create', '--driver', 'local', '--opt', 'type=none', '--opt', 'o=bind', '--opt', `device=${ROOT}/.retired-volume-DO-NOT-USE`, '--label', 'vewbox.retired=1', 'vewbox_models']);
    const tomb = (Name: string) => ({ Name, Options: { type: 'none', o: 'bind', device: tombstoneDevice(ROOT) } });
    expect(judgeTombstones([tomb('vewbox_models'), tomb('vewbox_ollama')], ROOT)).toMatchObject({ ok: true, warnings: [], rows: [{ state: 'tombstone' }, { state: 'tombstone' }] });
    const before = judgeTombstones([{ Name: 'vewbox_models', Options: null }], ROOT);
    expect(before.ok).toBe(true);
    expect(before.warnings).toHaveLength(2); // still the old volume; the ollama tombstone missing
    expect(judgeTombstones([{ Name: 'vewbox_models', Options: { o: 'bind', device: '/somewhere' } }], ROOT).ok).toBe(false);
  });
  it('a container on a tombstone, on another named volume or on the store path through a foreign volume name fails', () => {
    const vols = [
      { Name: 'vewbox_models', Options: { type: 'none', o: 'bind', device: tombstoneDevice(ROOT) } },
      { Name: 'someone_models', Options: { type: 'none', o: 'bind', device: ROOT } },
      { Name: 'vewbox_models_store', Options: { type: 'none', o: 'bind', device: ROOT } },
    ];
    const r = judgeModelMounts([
      { Name: '/stale', Mounts: [{ Type: 'volume', Name: 'vewbox_models', Destination: '/models' }] },
      { Name: '/foreign', Mounts: [{ Type: 'volume', Name: 'someone_models', Destination: '/models' }] },
      { Name: '/good', Mounts: [{ Type: 'volume', Name: 'vewbox_models_store', Destination: '/models' }] },
    ], vols, ROOT);
    expect(r.problems).toEqual([
      `stale: /models comes from retired volume vewbox_models (tombstone: a stale compose file), not the store (${ROOT})`,
      `foreign: /models comes from volume someone_models → ${ROOT}, not the store (${ROOT})`,
    ]);
  });
});
