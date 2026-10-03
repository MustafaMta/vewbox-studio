import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { classifyFailure } from '@/server/org/runs';

process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused';
process.env.COMFYUI_URL = 'http://comfy.test:8188';

type Comfy = typeof import('@/server/providers/comfy');
let comfy: Comfy;
beforeAll(async () => { comfy = await import('@/server/providers/comfy'); });
afterEach(() => { vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A minimal in-memory ComfyUI: /prompt, /api/jobs/{id}, /history/{id}, /queue, cancel. */
function fakeComfy(opts: { reject?: unknown; finishAfterPolls?: number; error?: unknown[]; forgetAfterSubmit?: boolean; known?: Record<string, 'pending' | 'in_progress' | 'completed' | 'failed'> } = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const jobs: Record<string, { status: string; polls: number }> = Object.fromEntries(Object.entries(opts.known ?? {}).map(([k, v]) => [k, { status: v, polls: 0 }]));
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: u.pathname, body });
    if (u.pathname === '/prompt') {
      if (opts.reject) return json(opts.reject, 400);
      if (!opts.forgetAfterSubmit) jobs[body.prompt_id] = { status: 'pending', polls: 0 };
      return json({ prompt_id: body.prompt_id, number: 1, node_errors: {} });
    }
    const m = /^\/api\/jobs\/([^/]+)(\/cancel)?$/.exec(u.pathname);
    if (m) {
      const j = jobs[m[1]];
      if (m[2]) { if (j && (j.status === 'pending' || j.status === 'in_progress')) { j.status = 'cancelled'; return json({ cancelled: true }); } return json({ cancelled: false }); }
      if (!j) return json({ error: 'Job not found' }, 404);
      j.polls++;
      if (j.status === 'pending' || j.status === 'in_progress') j.status = j.polls >= (opts.finishAfterPolls ?? 2) ? (opts.error ? 'failed' : 'completed') : 'in_progress';
      return json({ id: m[1], status: j.status });
    }
    const h = /^\/history\/(.+)$/.exec(u.pathname);
    if (h) {
      const j = jobs[h[1]];
      if (!j || !['completed', 'failed'].includes(j.status)) return json({});
      return json({ [h[1]]: j.status === 'failed'
        ? { outputs: {}, status: { status_str: 'error', completed: false, messages: opts.error } }
        : { outputs: { '11': { images: [{ filename: 'x.png', subfolder: '', type: 'output' }] } }, status: { status_str: 'success', completed: true, messages: [['execution_start', { timestamp: 1000 }], ['execution_success', { timestamp: 4500 }]] } } });
    }
    if (u.pathname === '/queue') return json({ queue_running: [], queue_pending: [] });
    if (u.pathname === '/free') return json({});
    if (u.pathname === '/interrupt') return json({});
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, jobs };
}

const fast = { pollMs: 5, socket: false } as const;

describe('ComfyUI client: prompt id before submit (C1)', () => {
  it('generates the id, records it through onSubmitted BEFORE the POST, and submits with it', async () => {
    const f = fakeComfy();
    const order: string[] = [];
    const r = await comfy.run({ '1': { class_type: 'X', inputs: {} } }, { ...fast, onSubmitted: (id) => { order.push(`recorded ${id}`); expect(f.calls.some((c) => c.path === '/prompt')).toBe(false); } });
    expect(order).toHaveLength(1);
    const post = f.calls.find((c) => c.path === '/prompt')!;
    expect((post.body as { prompt_id: string }).prompt_id).toBe(r.promptId);
    expect(order[0]).toBe(`recorded ${r.promptId}`);
    expect(r.promptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(r.engineMs).toBe(3500);
    expect(r.outputs['11'].images?.[0].filename).toBe('x.png');
  });
  it('adopts a prompt a previous attempt submitted instead of drawing it twice', async () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const f = fakeComfy({ known: { [id]: 'in_progress' } });
    const r = await comfy.run({ a: { class_type: 'X', inputs: {} } }, { ...fast, resumePromptId: id });
    expect(r.promptId).toBe(id);
    expect(r.resumed).toBe(true);
    expect(f.calls.some((c) => c.path === '/prompt')).toBe(false);
  });
  it('resubmits with the recorded id when ComfyUI never saw it, and with a new id after a failed attempt', async () => {
    const id = '11111111-2222-4333-8444-555555555556';
    let f = fakeComfy();
    const r1 = await comfy.run({ a: { class_type: 'X', inputs: {} } }, { ...fast, resumePromptId: id });
    expect(r1.promptId).toBe(id);
    expect(f.calls.filter((c) => c.path === '/prompt')).toHaveLength(1);
    f = fakeComfy({ known: { [id]: 'failed' } });
    const seen: string[] = [];
    const r2 = await comfy.run({ a: { class_type: 'X', inputs: {} } }, { ...fast, resumePromptId: id, onSubmitted: (x) => { seen.push(x); } });
    expect(r2.promptId).not.toBe(id);
    expect(seen).toEqual([r2.promptId]);
  });
  it('derives a stable id from a step key, so a restarted worker finds its prompt without a record', async () => {
    const g = { a: { class_type: 'X', inputs: { seed: 1 } } };
    expect(comfy.promptIdFromKey('job-1:sheet', g)).toBe(comfy.promptIdFromKey('job-1:sheet', g));
    expect(comfy.promptIdFromKey('job-1:sheet', g)).not.toBe(comfy.promptIdFromKey('job-1:sheet', { a: { class_type: 'X', inputs: { seed: 2 } } }));
    const first = comfy.promptIdFromKey('job-1:sheet', g);
    const f = fakeComfy({ known: { [first]: 'failed' } });
    const r = await comfy.run(g, { ...fast, promptKey: 'job-1:sheet' });
    expect(r.promptId).toBe(comfy.promptIdFromKey('job-1:sheet', g, 1));
    expect(f.calls.filter((c) => c.path === '/prompt')).toHaveLength(1);
  });
});

describe('ComfyUI client: classified failures (C2, C3)', () => {
  it('a missing model file is a non-retryable INFRASTRUCTURE failure that names the file', async () => {
    fakeComfy({ reject: { error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation', details: '', extra_info: {} }, node_errors: { lora1: { class_type: 'LoraLoaderModelOnly', dependent_outputs: ['11'], errors: [{ type: 'value_not_in_list', message: 'Value not in list', details: "lora_name: 'missing.safetensors' not in [...]", extra_info: { input_name: 'lora_name', received_value: 'missing.safetensors' } }] } } } });
    const e = await comfy.run({ a: { class_type: 'X', inputs: {} } }, fast).catch((x) => x);
    expect(e).toBeInstanceOf(comfy.ComfyError);
    expect(e.kind).toBe('MODEL_OR_NODE_MISSING');
    expect(e.message).toContain('lora_name "missing.safetensors"');
    expect(e.code).toBe('NOT_CONFIGURED');
    expect(classifyFailure(e)).toBe('INFRASTRUCTURE');
    expect(e.retryable).toBe(false);
  });
  it('a missing node class, a bad value and a lost input picture are told apart', () => {
    expect(comfy.classifyRejection(400, JSON.stringify({ error: { type: 'missing_node_type', message: "Node 'Foo' not found", extra_info: { node_id: '3', class_type: 'Foo' } }, node_errors: {} })).kind).toBe('MODEL_OR_NODE_MISSING');
    const bad = comfy.classifyRejection(400, JSON.stringify({ error: { type: 'prompt_outputs_failed_validation' }, node_errors: { '9': { class_type: 'KSampler', errors: [{ type: 'value_bigger_than_max', details: 'steps 20000 > 10000', extra_info: { input_name: 'steps', received_value: 20000 } }] } } }));
    expect(bad.kind).toBe('BAD_INPUT');
    expect(classifyFailure(bad)).toBe('WRONG_PARAMETERS');
    expect(bad.message).toContain('KSampler #9 input "steps"');
    const img = comfy.classifyRejection(400, JSON.stringify({ error: { type: 'prompt_outputs_failed_validation' }, node_errors: { img1: { class_type: 'LoadImage', errors: [{ type: 'custom_validation_failed', details: 'Invalid image file: vb-1.png', extra_info: { input_name: 'image', received_value: 'vb-1.png' } }] } } }));
    expect(img.kind).toBe('INPUT_FILE_MISSING');
    expect(img.retryable).toBe(true);
    expect(comfy.classifyRejection(400, 'plain text').kind).toBe('BAD_INPUT');
  });
  it('out of memory frees VRAM and is RESOURCE_EXHAUSTION; other runtime errors carry node and exception', async () => {
    const f = fakeComfy({ error: [['execution_start', {}], ['execution_error', { node_id: '9', node_type: 'KSampler', exception_type: 'torch.OutOfMemoryError', exception_message: 'Allocation on device' }]] });
    const e = await comfy.run({ a: { class_type: 'X', inputs: {} } }, fast).catch((x) => x);
    expect(e.kind).toBe('OUT_OF_MEMORY');
    expect(classifyFailure(e)).toBe('RESOURCE_EXHAUSTION');
    expect(f.calls.some((c) => c.path === '/free')).toBe(true);
    const ex = comfy.classifyExecutionError([['execution_error', { node_id: '2', node_type: 'CLIPLoader', exception_type: 'RuntimeError', exception_message: 'bad header' }]]);
    expect(ex.kind).toBe('EXECUTION');
    expect(ex.message).toContain('CLIPLoader #2 failed: RuntimeError: bad header');
    expect(comfy.classifyExecutionError([['execution_interrupted', {}]]).kind).toBe('INTERRUPTED');
  });
});

describe('ComfyUI client: lost prompts and targeted cancel (C4, C5)', () => {
  it('reports a prompt ComfyUI forgot (restart) after three polls instead of waiting for the timeout', async () => {
    fakeComfy({ forgetAfterSubmit: true });
    const t0 = Date.now();
    const e = await comfy.run({ a: { class_type: 'X', inputs: {} } }, { ...fast, timeoutMs: 60_000 }).catch((x) => x);
    expect(e.kind).toBe('LOST');
    expect(classifyFailure(e)).toBe('INFRASTRUCTURE');
    expect(e.retryable).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('cancels only its own prompt, never the global interrupt', async () => {
    const f = fakeComfy({ finishAfterPolls: 1000 });
    let n = 0;
    const e = await comfy.run({ a: { class_type: 'X', inputs: {} } }, { ...fast, shouldStop: () => ++n > 2 }).catch((x) => x);
    expect(e.message).toBe('cancelled');
    const cancel = f.calls.find((c) => c.path.endsWith('/cancel'));
    expect(cancel?.path).toMatch(/^\/api\/jobs\/[0-9a-f-]{36}\/cancel$/);
    expect(f.calls.some((c) => c.path === '/interrupt')).toBe(false);
  });
  it('cancels its own prompt on timeout', async () => {
    const f = fakeComfy({ finishAfterPolls: 1000 });
    const e = await comfy.run({ a: { class_type: 'X', inputs: {} } }, { ...fast, timeoutMs: 30 }).catch((x) => x);
    expect(e.kind).toBe('TIMEOUT');
    expect(f.calls.some((c) => c.path.endsWith('/cancel'))).toBe(true);
    expect(f.calls.some((c) => c.path === '/interrupt')).toBe(false);
  });
});
