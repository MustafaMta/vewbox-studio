import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

/** The access gate: with STUDIO_PASSWORD set, everything but the health probe needs HTTP Basic credentials. */

const load = async (password: string) => {
  process.env.STUDIO_PASSWORD = password;
  const mod = await import(`@/proxy?pw=${encodeURIComponent(password)}`); // a fresh module instance per password
  return mod.proxy as (req: NextRequest) => Response;
};
const basic = (pw: string, user = 'studio') => `Basic ${Buffer.from(`${user}:${pw}`).toString('base64')}`;
const req = (path: string, auth?: string) => new NextRequest(`http://studio.local${path}`, { headers: auth ? { authorization: auth } : {} });

describe('studio password', () => {
  it('is not asked for when no password is configured', async () => {
    const proxy = await load('');
    expect(proxy(req('/')).status).not.toBe(401);
    expect(proxy(req('/api/studio')).status).not.toBe(401);
  });

  it('refuses pages and API calls without it, with a Basic challenge, and lets the health probe through', async () => {
    const proxy = await load('open-sesame');
    const page = proxy(req('/shows'));
    expect(page.status).toBe(401);
    expect(page.headers.get('www-authenticate')).toMatch(/^Basic realm=/);
    const api = proxy(req('/api/studio'));
    expect(api.status).toBe(401);
    expect(api.headers.get('content-type')).toContain('application/json');
    expect(proxy(req('/api/health')).status).not.toBe(401);
  });

  it('accepts the right password under any user name and refuses a wrong or malformed one', async () => {
    const proxy = await load('open-sesame');
    expect(proxy(req('/api/studio', basic('open-sesame'))).status).not.toBe(401);
    expect(proxy(req('/api/studio', basic('open-sesame', ''))).status).not.toBe(401);
    expect(proxy(req('/api/studio', basic('open-sesam'))).status).toBe(401);
    expect(proxy(req('/api/studio', basic('open-sesame-'))).status).toBe(401);
    expect(proxy(req('/api/studio', 'Basic %%%')).status).toBe(401);
    expect(proxy(req('/api/studio', 'Bearer open-sesame')).status).toBe(401);
  });
});
