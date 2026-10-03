// `pnpm dev` / `pnpm start` — the studio's web server on the LOOPBACK interface by default
// (docs/BACKEND-AUDIT-2026-10.md H1, step 2).
//
//   STUDIO_BIND   where to listen (default 127.0.0.1). A LAN address (e.g. 0.0.0.0) is an explicit opt-in and needs
//                 STUDIO_PASSWORD (HTTP Basic, src/proxy.ts); STUDIO_ALLOW_OPEN_LAN=1 accepts an open studio anyway.
//   WEB_PORT      the port (default 4200).
// Values come from the shell, then .env.local, then .env — as Next reads them.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { checkExposure } from '../src/server/exposure';
import { readEnvFiles } from './lib/env-files';

const require = createRequire(import.meta.url);
const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const env = { ...readEnvFiles(), ...process.env };
const exposure = checkExposure(env);
if (!exposure.ok) { console.error(`[serve] ${exposure.reason}`); process.exit(1); }
if (exposure.lan) console.warn(`[serve] listening on ${exposure.host}: the studio is reachable from the network${exposure.open ? ' WITHOUT a password (STUDIO_ALLOW_OPEN_LAN=1)' : ' (password required)'}.`);
const port = env.WEB_PORT || '4200';
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, '-p', port, '-H', exposure.host, ...process.argv.slice(3)], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
