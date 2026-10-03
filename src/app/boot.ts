/** THE PREFERENCE BOOT — owned by F4 (docs/DESIGN-SYSTEM-V4.md §4.9, §8.3); moved out of src/app/layout.tsx by F0.
 *  An inline script in <head> that applies the saved interface language and motion preference before the first
 *  paint, so an Arabic studio never flashes English. Reads only this app's own key in localStorage. F4 extends it
 *  with contrast, density, previews and single-key shortcuts. */
export const BOOT = `try{var u=JSON.parse(localStorage.getItem('vewbox.ui')||'{}');var h=document.documentElement;if(u.locale==='ar'){h.lang='ar';h.dir='rtl'}if(u.motion){h.setAttribute('data-motion','reduce')}}catch(e){}`;
