// Acceptance driver (2026-10-05): one long-lived headless Chromium on the live studio (http://localhost:4200), driven
// step by step. It listens on 127.0.0.1:4399; POST /eval with a JavaScript body runs it as
// `async ({ page, context, shot, log }) => { ... }` and answers its return value as JSON. Writes go to the real studio
// (this is the producer's acceptance, through the real UI); nothing is routed or stubbed.
//   node docs/evidence/acceptance-v1/driver/driver.mjs
//   (then) node docs/evidence/acceptance-v1/driver/run.mjs <file.js | -e "code">
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const OUT = path.resolve('docs/evidence/acceptance-v1');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, acceptDownloads: true });
const page = await context.newPage();
const logs = [];
const log = (...a) => { const l = `${new Date().toISOString()} ${a.join(' ')}`; logs.push(l); console.log(l); };
page.on('console', (m) => { if (m.type() === 'error') log('[console.error]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => log('[pageerror]', String(e).slice(0, 300)));
page.on('dialog', async (d) => { log('[dialog]', d.type(), d.message().slice(0, 200)); await d.accept(); });
page.on('response', (r) => { const u = r.url(); if (/\/api\/(commands|jobs|assets|studio\/org)/.test(u) && r.request().method() !== 'GET') log('[write]', r.request().method(), u.replace(BASE, ''), r.status()); });
const shot = async (name, opts = {}) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f, fullPage: opts.fullPage ?? false }); return f; };

http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  try {
    const fn = new Function('ctx', `return (async ({ page, context, shot, log, BASE }) => { ${body} })(ctx);`);
    const out = await fn({ page, context, shot, log, BASE });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, out }, null, 1));
  } catch (e) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(e?.stack ?? e).slice(0, 2000) }));
  }
}).listen(4399, '127.0.0.1', () => log('driver ready on 4399'));
