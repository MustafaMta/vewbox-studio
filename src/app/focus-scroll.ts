/** FOCUS INSIDE A STRIP — owned by DS (docs/DESIGN-SYSTEM-V5.md §5.0, §5.6; QA re-check F1 "rail items at the faded
 *  end lose one side"). A browser scrolls a focused element into view only when it is entirely hidden: an item half
 *  out of a horizontal strip, a tab row or a rail keeps its hidden half — and half its focus ring — out of sight. This
 *  inline script (in <head>, like boot.ts; no React, no dependency) brings a keyboard-focused item fully into its
 *  scroll container, ring included (the containers' 8 px scroll padding is in base.css). Pointer focus is left alone:
 *  only `:focus-visible` moves anything, and it moves the strip, never the page sideways. */
export const FOCUS_SCROLL = [
  'try{document.addEventListener("focusin",function(e){',
  'var t=e.target;if(!t||!t.closest||!t.matches||!t.matches(":focus-visible"))return;',
  'var s=t.closest(".scrolls,[data-strip],.rail-list,.filmstrip,.fstrip-list,.phase-strip,[role=tablist],.tabs,.anchor-nav ul,.overflow-x-auto");',
  'if(!s)return;var r=t.getBoundingClientRect(),b=s.getBoundingClientRect();',
  'if(r.left<b.left+8||r.right>b.right-8){var x=r.left<b.left+8?r.left-b.left-8:Math.min(r.left-b.left-8,r.right-b.right+8);s.scrollBy({left:x,behavior:"instant"})}',
  '},true)}catch(e){}',
].join('');
