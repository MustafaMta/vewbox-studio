import { NextResponse, type NextRequest } from 'next/server';

/** ACCESS — when STUDIO_PASSWORD is set, every page and API call (except the health probe) needs it, as HTTP Basic
 *  authentication: the browser asks once and remembers; API clients send `Authorization: Basic …`. With no password
 *  the studio is open, which is why it listens on 127.0.0.1 by default and refuses a LAN address without one
 *  (src/server/exposure.ts, scripts/serve.ts, compose WEB_BIND). The comparison is constant-time. */

const PASSWORD = process.env.STUDIO_PASSWORD ?? '';
const REALM = 'Vewbox Studio';

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i % Math.max(1, x.length)] ?? 0) ^ (y[i % Math.max(1, y.length)] ?? 0);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  if (!PASSWORD) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === '/api/health') return NextResponse.next();
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const pw = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded;
      if (constantTimeEqual(pw, PASSWORD)) return NextResponse.next();
    } catch { /* malformed header: refused below */ }
  }
  const api = pathname.startsWith('/api/');
  return new NextResponse(api ? JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'This studio needs its password.' } }) : 'This studio needs its password.', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`, 'Content-Type': api ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
