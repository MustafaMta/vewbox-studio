import fs from 'node:fs';
import path from 'node:path';

/** .env then .env.local (later files win), WITHOUT touching process.env. */
export function readEnvFiles(dir = process.cwd()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ['.env', '.env.local']) {
    try {
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    } catch { /* optional */ }
  }
  return out;
}
