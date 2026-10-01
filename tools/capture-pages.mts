import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
/** Full-page captures of a running preview. Usage: tsx shoot.ts <baseUrl> <outDir> name=path ... */
const [base, out, ...pairs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const w of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const pair of pairs) {
    const i = pair.indexOf('='); const name = pair.slice(0, i); const path = pair.slice(i + 1);
    try {
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(out, `${name}-${w}.png`), fullPage: true });
      process.stdout.write(`${w} ${name} ok\n`);
    } catch (e) { process.stdout.write(`${w} ${name} FAILED ${(e as Error).message.split('\n')[0]}\n`); }
  }
  await ctx.close();
}
await browser.close();
