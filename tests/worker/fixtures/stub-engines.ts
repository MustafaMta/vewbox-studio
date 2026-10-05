import http from 'node:http';
import type { AddressInfo } from 'node:net';

/** FIXTURE ENGINES — tiny HTTP stand-ins for ComfyUI and the voice/transcription services, for the failure-injection
 *  tests only (tests/worker/engine-faults.test.ts). They speak just enough of each API for the studio's clients, and
 *  misbehave on purpose: a restart that forgets every prompt, an out-of-memory error, a zero-byte or truncated clip, a
 *  connection reset in the middle of an answer. Nothing they return is generated media or acceptance evidence. */

export type PromptMode = 'ok' | 'restart' | 'oom' | 'zero' | 'truncated';

export interface StubComfy {
  url: string;
  /** behaviour of the next submitted prompts, in order (default 'ok') */
  modes: PromptMode[];
  submitted: string[];
  views: number;
  frees: number;
  close: () => Promise<void>;
  restart: (downMs: number) => Promise<void>;
}

const listen = (srv: http.Server) => new Promise<string>((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`)));
const body = (req: http.IncomingMessage) => new Promise<Buffer>((r) => { const c: Buffer[] = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const json = (res: http.ServerResponse, code: number, v: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };

/** A ComfyUI stand-in. `nodes`/`models`: what /object_info and /models list. `goodClip`: the bytes of a valid output. */
export async function stubComfy(opts: { nodes: string[]; models: Record<string, string[]>; goodClip: Buffer; runMs?: number }): Promise<StubComfy> {
  const prompts = new Map<string, { mode: PromptMode; at: number }>();
  const runMs = opts.runMs ?? 400;
  const state: StubComfy = { url: '', modes: [], submitted: [], views: 0, frees: 0, close: async () => {}, restart: async () => {} };
  const status = (id: string): 'pending' | 'in_progress' | 'completed' | 'failed' | 'gone' => {
    const p = prompts.get(id);
    if (!p) return 'gone';
    const age = Date.now() - p.at;
    if (p.mode === 'restart' && age > runMs / 2) { prompts.clear(); return 'gone'; } // the container restarted: everything forgotten
    if (age < runMs) return 'in_progress';
    return p.mode === 'oom' ? 'failed' : 'completed';
  };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const p = u.pathname;
    if (p === '/system_stats') return json(res, 200, { system: { comfyui_version: 'stub' }, devices: [{ name: 'stub', vram_total: 1, vram_free: 1 }] });
    if (p === '/object_info') return json(res, 200, Object.fromEntries(opts.nodes.map((n) => [n, {}])));
    if (p.startsWith('/models/')) return json(res, 200, opts.models[decodeURIComponent(p.slice(8))] ?? []);
    if (p === '/upload/image') { await body(req); return json(res, 200, { name: 'vb-stub.png', subfolder: '' }); }
    if (p === '/free') { await body(req); state.frees++; return json(res, 200, {}); }
    if (p === '/prompt' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString()) as { prompt_id: string };
      prompts.set(b.prompt_id, { mode: state.modes.shift() ?? 'ok', at: Date.now() });
      state.submitted.push(b.prompt_id);
      return json(res, 200, { prompt_id: b.prompt_id, number: 1, node_errors: {} });
    }
    const job = /^\/api\/jobs\/([^/]+)(\/cancel)?$/.exec(p);
    if (job) {
      if (job[2]) { prompts.delete(job[1]); return json(res, 200, { cancelled: true }); }
      const s = status(job[1]);
      if (s === 'gone') return json(res, 404, { error: 'Job not found' });
      return json(res, 200, { status: s });
    }
    const hist = /^\/history\/(.+)$/.exec(p);
    if (hist) {
      const id = hist[1]; const s = status(id); const m = prompts.get(id);
      if (s !== 'completed' && s !== 'failed') return json(res, 200, {});
      if (s === 'failed') return json(res, 200, { [id]: { outputs: {}, status: { status_str: 'error', messages: [['execution_start', { timestamp: 1 }], ['execution_error', { node_id: '12', node_type: 'MiniMaxH3Sampler', exception_type: 'torch.OutOfMemoryError', exception_message: 'CUDA out of memory. Tried to allocate 2.00 GiB' }]] } } });
      return json(res, 200, { [id]: { outputs: { 16: { video: [{ filename: `h3_${id.slice(0, 8)}_${m!.mode}.mp4`, subfolder: 'vewbox', type: 'output' }] } }, status: { status_str: 'success', messages: [['execution_start', { timestamp: 1000 }], ['execution_success', { timestamp: 3000 }]] } } });
    }
    if (p === '/queue') return json(res, 200, { queue_running: [], queue_pending: [] });
    if (p === '/view') {
      state.views++;
      const f = u.searchParams.get('filename') ?? '';
      const bytes = f.endsWith('_zero.mp4') ? Buffer.alloc(0) : f.endsWith('_truncated.mp4') ? opts.goodClip.subarray(0, Math.floor(opts.goodClip.length / 3)) : opts.goodClip;
      res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(bytes);
    }
    json(res, 404, { error: `stub: ${p}` });
  });
  state.url = await listen(srv);
  const port = Number(new URL(state.url).port);
  state.close = () => new Promise((r) => { srv.closeAllConnections(); srv.close(() => r()); });
  /** a container restart: the port refuses connections for `downMs`, then the engine is back knowing nothing */
  state.restart = (downMs: number) => new Promise<void>((r) => {
    prompts.clear();
    srv.closeAllConnections();
    srv.close(() => setTimeout(() => srv.listen(port, '127.0.0.1', () => r()), downMs));
  });
  return state;
}

export type SpeechMode = 'ok' | 'reset-mid-body' | 'zero' | 'truncated' | 'malformed-json';

/** A voice + transcription service stand-in (POST /synthesize answers a WAV, POST /transcribe JSON). */
export async function stubSpeech(goodWav: Buffer): Promise<{ url: string; modes: SpeechMode[]; close: () => Promise<void> }> {
  const s = { url: '', modes: [] as SpeechMode[], close: async () => {} };
  const srv = http.createServer(async (req, res) => {
    await body(req);
    const mode = s.modes.shift() ?? 'ok';
    const isAsr = req.url?.startsWith('/transcribe');
    const payload = isAsr ? Buffer.from(JSON.stringify({ language: 'en', language_probability: 1, duration: 1, text: 'hello', segments: [], ms: 1, model: 'stub' })) : goodWav;
    if (mode === 'reset-mid-body') {
      res.writeHead(200, { 'content-type': isAsr ? 'application/json' : 'audio/wav', 'content-length': String(payload.length) });
      res.write(payload.subarray(0, Math.floor(payload.length / 2)));
      setTimeout(() => req.socket.destroy(), 50); // the container went away mid-answer
      return;
    }
    if (mode === 'malformed-json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"language": "en", "text": '); }
    const out = mode === 'zero' ? Buffer.alloc(0) : mode === 'truncated' ? payload.subarray(0, Math.floor(payload.length / 2)) : payload;
    res.writeHead(200, { 'content-type': isAsr ? 'application/json' : 'audio/wav', 'x-engine': 'stub', 'x-duration': '1' });
    res.end(out);
  });
  s.url = await listen(srv);
  s.close = () => new Promise((r) => { srv.closeAllConnections(); srv.close(() => r()); });
  return s;
}
