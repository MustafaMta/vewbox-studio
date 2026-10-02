// The Playwright command scripts/qa-journeys.mjs runs (review finding 22): the CLI is started with this Node binary,
// never through a shell — so a --grep regex with `&`, `|` or quotes, and any trailing argument, reaches Playwright as
// one argv element and is never interpreted by cmd.exe or sh. (pnpm on Windows is a .cmd file, which Node refuses
// to spawn without a shell; running the CLI's own JavaScript avoids both.)
import { createRequire } from 'node:module';

/** Where the Playwright test CLI lives (resolved from this project). */
export function playwrightCli() {
  return createRequire(import.meta.url).resolve('@playwright/test/cli');
}

/**
 * @param {{ grep?: string; headed?: boolean; rest?: string[]; cli?: string; node?: string }} o
 * @returns {{ command: string; args: string[]; options: { shell: false; windowsHide: true } }}
 */
export function playwrightCommand(o = {}) {
  const args = [o.cli ?? playwrightCli(), 'test', '--project=journeys', '--reporter=list,html', ...(o.grep ? ['--grep', o.grep] : []), ...(o.headed ? ['--headed'] : []), ...(o.rest ?? [])];
  return { command: o.node ?? process.execPath, args, options: { shell: false, windowsHide: true } };
}
