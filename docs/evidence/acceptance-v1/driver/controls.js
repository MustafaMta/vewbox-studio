// List the form controls of main (or of `globalThis.SCOPE` selector): tag, role/type, state, aria-label, label, text/value
const root = page.locator(globalThis.SCOPE ?? 'main');
const els = await root.locator('button, input, textarea, select, [role=checkbox], [role=switch], [role=radio]').evaluateAll((as) => as.map((a) => [a.tagName, a.getAttribute('role') || a.type || '', a.getAttribute('aria-pressed') || a.getAttribute('aria-checked') || (a.checked === undefined ? '' : String(a.checked)), a.getAttribute('aria-label') || '', a.labels && a.labels[0] ? a.labels[0].innerText.trim().slice(0, 30) : '', (a.tagName === 'SELECT' ? a.options[a.selectedIndex]?.text : (a.innerText || a.value || '')).trim().replace(/\n/g, ' ').slice(0, 140)].join(' | ')));
return els.join('\n');
