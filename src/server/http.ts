import { NextResponse } from 'next/server';
import { httpStatusFor, isStudioError } from '@/domain/errors';
import { log } from './log';

/** ROUTE HELPERS — one place that turns a StudioError into the right status and a readable body, and logs anything
 *  unexpected with a reference the user can quote. */

export type ApiError = { error: { code: string; message: string; details?: Record<string, unknown>; ref?: string } };

export const json = <T>(body: T, init?: ResponseInit) => NextResponse.json(body, init);

export function errorResponse(e: unknown): NextResponse<ApiError> {
  if (isStudioError(e)) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: httpStatusFor(e.code) });
  const ref = Math.random().toString(36).slice(2, 10);
  log.error({ err: e, ref }, 'unhandled api error');
  return NextResponse.json({ error: { code: 'INTERNAL', message: `Something went wrong on the server (ref ${ref}).`, ref } }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;
/** Wrap a route handler so every thrown error becomes a JSON response, and every call leaves one structured log
 *  line (method, path, status, duration) — debug when it went well, warn when the client was refused, error when
 *  the server failed. Query strings are not logged (they could carry ids the caller considers private). */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const t0 = Date.now();
    let res: Response;
    try { res = await fn(req, ctx); } catch (e) { res = errorResponse(e); }
    const path = (() => { try { return new URL(req.url).pathname; } catch { return req.url; } })();
    const line = { method: req.method, path, status: res.status, ms: Date.now() - t0 };
    if (res.status >= 500) log.error(line, 'api'); else if (res.status >= 400) log.warn(line, 'api'); else log.debug(line, 'api');
    return res;
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw Object.assign(new Error('Body must be JSON'), { name: 'StudioError', code: 'INVALID' }); }
}

export const params = async <P>(ctx: { params: Promise<P> }): Promise<P> => ctx.params;
