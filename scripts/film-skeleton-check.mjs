// Shorts skeleton exactness: loads /shorts and /shorts/<id> at 1440, 1920 and 390 on a crawling network, measures the
// skeleton's blocks while it shows, then the same blocks once the page has rendered, and reports any x / y / height that
// differs (zero layout shift by construction). Needs the two ROUTE_SKELETONS entries (src/components/shell/route-skeletons.tsx).
//   node scripts/film-skeleton-check.mjs   (server on :4254)
import { chromium } from '@playwright/test';
const base='http://localhost:4254';
const b = await chromium.launch();
for (const [w,h] of [[1440,900],[1920,1080],[390,844]]) for (const [path, sk, sels] of [['/shorts','.shorts-skeleton',['.shorts-head','.shorts-title','.shorts-lead','.shorts-grid > :first-child']],['/shorts/short-28bdb3342b','.film-skeleton',['.film-head-row','.film-meta','.film-title','.film-logline','.film-acts','.film-poster-frame','.film-screen .film-player','.film-strip']]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, isMobile: w<500, hasTouch: w<500 }); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:200000,uploadThroughput:100000});
  const rects = (sels) => sels.map(s => { const e=document.querySelector('main '+s); if(!e) return null; const r=e.getBoundingClientRect(); return r.width? [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:'hidden'; });
  await p.goto(base+path,{waitUntil:'commit'}); await p.waitForSelector(sk,{timeout:180000});
  await p.waitForTimeout(300); const a = await p.evaluate(rects, sels);
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await p.waitForSelector(sk,{state:'detached',timeout:180000}); await p.waitForTimeout(800); const c = await p.evaluate(rects, sels);
  let bad=0; const lines=[]; sels.forEach((s,i)=>{ const A=a[i],C=c[i]; const same = Array.isArray(A)&&Array.isArray(C) ? (A[1]===C[1]&&A[3]===C[3]&&A[0]===C[0]) : JSON.stringify(A)===JSON.stringify(C); if(!same) bad++; lines.push(`  ${same?'=':'≠'} ${s} skel ${JSON.stringify(A)} real ${JSON.stringify(C)}`); });
  console.log(`${w} ${path}: ${bad?bad+' differ':'all x/y/height equal'}`); if (bad) console.log(lines.join('\n'));
  await ctx.close();
}
await b.close();