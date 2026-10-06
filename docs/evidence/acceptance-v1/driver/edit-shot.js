// Edit one shot through its page (the shot inspector): globalThis.EDIT = { url, framing?, camera?, join?, people?: {name: bool}, action?, shotName }
const e = globalThis.EDIT;
await page.goto(BASE + e.url);
await page.waitForTimeout(4500);
const m = page.locator('main');
const radio = async (label) => { const r = m.getByRole('radio', { name: label, exact: true }); if ((await r.getAttribute('aria-checked')) !== 'true') await r.click(); };
if (e.framing) await radio(e.framing);
if (e.camera) await radio(e.camera);
if (e.join) await radio(e.join);
for (const [name, on] of Object.entries(e.people ?? {})) {
  const b = m.getByRole('button', { name: new RegExp(`^${name}`) }).first();
  const pressed = (await b.getAttribute('aria-pressed')) === 'true';
  if (pressed !== on) await b.click();
}
if (e.action) await m.getByLabel('What happens').fill(e.action);
await m.getByRole('button', { name: 'Save the shot' }).click();
await page.waitForTimeout(2500);
await shot(`scene/edit-${e.shotName}`, { fullPage: true });
const t = await m.innerText();
const i = t.indexOf('Shot ' + e.shotName.replace('s', '1.'));
return t.slice(t.indexOf('Ready'), t.indexOf('Ready') + 600);
