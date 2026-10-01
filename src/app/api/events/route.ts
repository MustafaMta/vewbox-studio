import { subscribe, type StudioEvent } from '@/server/events';
import { currentVersion } from '@/server/studio/engine';
import { bootstrap } from '@/server/bootstrap';

export const dynamic = 'force-dynamic';

/** Server-sent events: `studio` when the state changes (with version and origin), `job` when a job moves, `ping`
 *  every 20 s so proxies keep the connection. The browser reconnects on its own. */
export async function GET(req: Request) {
  await bootstrap();
  const enc = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StudioEvent) => { try { controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
      send({ type: 'hello', version: await currentVersion(), at: new Date().toISOString() });
      unsubscribe = await subscribe(send);
      timer = setInterval(() => send({ type: 'ping', at: new Date().toISOString() }), 20_000);
      req.signal.addEventListener('abort', () => { unsubscribe?.(); if (timer) clearInterval(timer); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel() { unsubscribe?.(); if (timer) clearInterval(timer); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
