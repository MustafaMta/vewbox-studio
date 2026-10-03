/** THE PREFERENCE BOOT — owned by F4 (docs/DESIGN-SYSTEM-V4.md §4.9, §8.3). An inline script in <head> that applies the
 *  interface preferences saved in this browser (`vewbox.ui`) to <html> before the first paint, so an Arabic studio
 *  never flashes English, a More-contrast studio never flashes the standard ladder, and a collapsed navigation never
 *  flashes open. Reads only this app's own key in localStorage; any failure leaves the defaults.
 *
 *  It sets exactly what src/components/shell/preferences.ts `prefAttributes()` sets afterwards (a unit test runs this
 *  string against that function):
 *    lang/dir                 the interface language (a studio setting, mirrored here)
 *    data-motion="reduce"     Reduce motion (a studio setting, mirrored here)
 *    data-contrast            "more" or "standard"; absent = follow the system (tokens.css)
 *    data-cutting-density     "comfortable"; absent = the cutting room's compact default
 *    data-previews="off"      hero previews off
 *    data-keys="off"          single-key shortcuts off
 *    data-nav-boot            "rail" or "sidebar": the navigation's shape until the shell has mounted */
export const BOOT = [
  'try{',
  "var h=document.documentElement,u={};",
  "try{u=JSON.parse(localStorage.getItem('vewbox.ui')||'{}')||{}}catch(e){}",
  "if(typeof u!=='object'){u={}}",
  "if(u.locale==='ar'){h.lang='ar';h.dir='rtl'}",
  "if(u.motion){h.setAttribute('data-motion','reduce')}",
  "if(u.contrast==='more'||u.contrast==='standard'){h.setAttribute('data-contrast',u.contrast)}",
  "if(u.density==='comfortable'){h.setAttribute('data-cutting-density','comfortable')}",
  "if(u.previews===false){h.setAttribute('data-previews','off')}",
  "if(u.keys===false){h.setAttribute('data-keys','off')}",
  "var n=u.nav&&typeof u.nav==='object'?u.nav.lobby:null;",
  "h.setAttribute('data-nav-boot',n==='rail'||n==='sidebar'?n:(window.matchMedia&&window.matchMedia('(min-width: 1024px)').matches?'sidebar':'rail'))",
  '}catch(e){}',
].join('');
