import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((x) => !x.error);
const f = (v) => (v ? `${v.n}/${(v.decoded / 1024).toFixed(0)}KB` : '-');
for (const x of p) {
  const k = x.byKind;
  console.log(`${x.name}@${x.viewport} img ${f(k['media-image'])} video ${f(k['media-video'])} audio ${f(k['media-audio'])} font ${f(k.font)} css ${f(k.css)} js ${f(k.js)} doc ${f(k.document)} events ${f(k['api-events'])} other ${f(k['api-other'])} fetch ${f(k.fetch)} | nav ttfb ${x.nav ? Math.round(x.nav.ttfb) : '-'} dcl ${x.nav ? Math.round(x.nav.domContentLoaded) : '-'} load ${x.nav ? Math.round(x.nav.load) : '-'} | nodes ${x.dom.nodes} buttons ${x.dom.buttons} | longTasks ${x.vitals.longTasks ?? '-'} | title ${x.dom.title}`);
}
