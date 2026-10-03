/** THE PREFERENCE BOOT (docs/DESIGN-SYSTEM-V4.md §4.9; docs/design/VISUAL-STANDARD-V5.1.md §6.5). An inline script
 *  in <head> that applies the interface preferences saved in this browser to <html> before the first paint, so a
 *  More-contrast studio never flashes the standard ladder, a reduced-motion studio never animates, and the sidebar is
 *  drawn in its own shape from the first frame (no width change, no layout shift). The document is always English and
 *  left to right (<html lang="en" dir="ltr">, src/app/layout.tsx). Reads only this app's own keys; any failure leaves
 *  the defaults.
 *
 *  It sets exactly what src/components/shell/preferences.ts `prefAttributes()` sets afterwards (a unit test runs this
 *  string against that function):
 *    data-motion="reduce"     Reduce motion (a studio setting, mirrored here)
 *    data-contrast            "more" or "standard"; absent = follow the system (tokens.css)
 *    data-cutting-density     "comfortable"; absent = the cutting room's compact default
 *    data-previews="off"      hero previews off
 *    data-keys="off"          single-key shortcuts off
 *    data-sidebar             "expanded" or "collapsed": the stored choice (`vb.sidebar`), else expanded at ≥ 1280 —
 *                             except on a cutting-room route (a production's workspace, a shot: CUTTING_ROUTE), where it
 *                             starts collapsed, so a cold load never paints the expanded sidebar first */
/** The cutting room's routes (a production's workspace and a shot): the sidebar starts collapsed there by default.
 *  The shell (src/components/shell/Shell.tsx) applies the same rule after hydration. */
export const CUTTING_ROUTE = /^\/(?:shorts\/[^/]+|music-videos\/[^/]+|shows\/[^/]+\/seasons\/[^/]+\/episodes\/[^/]+)\/(?:production|shots\/[^/]+)\/?$/;
export const isCuttingRoute = (pathname: string | null | undefined) => CUTTING_ROUTE.test(pathname ?? '');

export const BOOT = [
  'try{',
  "var h=document.documentElement,u={},s=null;",
  "try{u=JSON.parse(localStorage.getItem('vewbox.ui')||'{}')||{}}catch(e){}",
  "try{s=localStorage.getItem('vb.sidebar')}catch(e){}",
  "if(typeof u!=='object'){u={}}",
  "if(u.motion){h.setAttribute('data-motion','reduce')}",
  "if(u.contrast==='more'||u.contrast==='standard'){h.setAttribute('data-contrast',u.contrast)}",
  "if(u.density==='comfortable'){h.setAttribute('data-cutting-density','comfortable')}",
  "if(u.previews===false){h.setAttribute('data-previews','off')}",
  "if(u.keys===false){h.setAttribute('data-keys','off')}",
  "var c=false;try{c=new RegExp(" + JSON.stringify(CUTTING_ROUTE.source) + ").test(window.location.pathname)}catch(e){}",
  "h.setAttribute('data-sidebar',s==='expanded'||s==='collapsed'?s:(!c&&window.matchMedia&&window.matchMedia('(min-width: 1280px)').matches?'expanded':'collapsed'))",
  '}catch(e){}',
].join('');
