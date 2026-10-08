import fsp from 'node:fs/promises';
import { errorResponse } from '@/server/http';
import { clipFile } from '@/server/voice/evaluation';

export const dynamic = 'force-dynamic';

/** One clip of the voice comparison by (test, letter) or the test's reference (`clip=ref`); the file is resolved on the
 *  server from the run's own records (src/server/voice/evaluation.ts), never from the URL. */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const file = await clipFile(String(u.searchParams.get('test') ?? '').slice(0, 20), String(u.searchParams.get('clip') ?? '').slice(0, 4));
    const bytes = await fsp.readFile(file);
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) { return errorResponse(e); }
}
