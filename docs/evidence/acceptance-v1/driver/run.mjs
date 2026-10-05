// Send one snippet to the acceptance driver (driver.mjs): node run.mjs <file.js>  |  node run.mjs -e "code"
// (node:http, not fetch: a long wait would hit fetch's 300 s header timeout)
import fs from 'node:fs';
import http from 'node:http';
const a = process.argv.slice(2);
const code = a[0] === '-e' ? a.slice(1).join(' ') : fs.readFileSync(a[0], 'utf8');
const body = await new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 4399, path: '/eval', method: 'POST', timeout: 0 }, (res) => {
    let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b));
  });
  req.on('error', reject); req.end(code);
});
const j = JSON.parse(body);
console.log(j.ok ? (typeof j.out === 'string' ? j.out : JSON.stringify(j.out, null, 1)) : `ERROR ${j.error}`);
