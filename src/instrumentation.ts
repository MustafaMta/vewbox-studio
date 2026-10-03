/** Next.js calls `register` once when the server starts: check where it is published, then run migrations and seed
 *  before the first request.
 *
 *  Exposure (docs/BACKEND-AUDIT-2026-10.md H1): the compose stack passes the address the web port is published on as
 *  STUDIO_BIND (WEB_BIND, default 127.0.0.1); a LAN address without STUDIO_PASSWORD stops the server here, so an open
 *  studio is never published to the network by accident. On the host, `pnpm dev` / `pnpm start` check the same rule
 *  before they start (scripts/serve.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.STUDIO_BIND) {
      const { checkExposure } = await import('./server/exposure');
      const exposure = checkExposure(process.env);
      if (!exposure.ok) throw new Error(exposure.reason);
    }
    const { bootstrap } = await import('./server/bootstrap');
    await bootstrap();
  }
}
