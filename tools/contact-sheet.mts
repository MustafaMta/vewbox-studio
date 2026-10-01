import { chromium } from '@playwright/test';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
/** Contact sheets of the sample artwork, for reviewing it by eye. Usage: tsx tools/contact-sheet.mts [outDir] */
const OUT = process.argv[2] ?? 'var/design/sample-sheets';
mkdirSync(OUT, { recursive: true });
const root = resolve('public/sample');
const sheets: Array<[string, string[]]> = [['covers', ['covers']], ['characters', ['characters']], ['locations', ['locations']], ['frames', ['frames']]];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
for (const [name, dirs] of sheets) {
  const files = dirs.flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith('.svg')).sort().map((f) => `${d}/${f}`));
  const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;color:#cfd4de;font:12px Inter,system-ui;padding:16px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">${files.map((f) => `<figure style="margin:0"><img src="file://${join(root, f)}" style="width:100%;display:block;border-radius:10px;background:#000"><figcaption style="margin-top:4px;opacity:.8">${f}</figcaption></figure>`).join('')}</div></body></html>`;
  const p = join(OUT, `${name}.html`); writeFileSync(p, html);
  await page.goto(`file://${resolve(p)}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  process.stdout.write(`${name}: ${files.length} pictures\n`);
}
await browser.close();
