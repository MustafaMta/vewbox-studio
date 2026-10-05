// wait up to WAIT_S seconds for main's text to match WAIT_RE (set by the caller with -e prelude); returns the text
const re = new RegExp(globalThis.WAIT_RE ?? 'Approve|failed|Failed|Retry');
const until = Date.now() + (globalThis.WAIT_S ?? 540) * 1000;
let t = '';
while (Date.now() < until) {
  t = await page.locator('main').innerText().catch(() => '');
  if (re.test(t)) break;
  await page.waitForTimeout(5000);
}
return new Date().toISOString() + ' matched=' + re.test(t) + '\n' + t.slice(0, 2500);
