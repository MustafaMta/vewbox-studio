import fs from 'node:fs';
import path from 'node:path';

/** The evidence runs' environment: the main checkout's env files (service URLs on the host ports), without overriding
 *  what the shell already set; the library is a scratch folder (EVIDENCE_LIBRARY) so nothing lands in the studio's. */
const files = (process.env.VEWBOX_ENV_FILES ?? 'D:/volexar-studio/volexar-studio/.env;D:/volexar-studio/volexar-studio/.env.local').split(';').filter(Boolean);
const fromFiles: Record<string, string> = {};
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    fromFiles[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
for (const [k, v] of Object.entries(fromFiles)) if (process.env[k] === undefined) process.env[k] = v;
process.env.LIBRARY_ROOT = process.env.EVIDENCE_LIBRARY ?? path.resolve('var/evidence-library');
process.env.LOG_LEVEL = process.env.LOG_LEVEL_EVIDENCE ?? 'warn';
process.env.LOG_PRETTY = '';
