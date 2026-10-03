import { Fragment, type ReactNode } from 'react';
import { cls } from '@/components/ui/kit';

/** THE SLATE (docs/DESIGN-SYSTEM-V4.md §3.4, §5.9) — one line of facts in a fixed order: kind · year · count · runtime
 *  · style · language · status. Status always comes last (a StateWord from the kit). Missing facts are dropped, never
 *  shown as "—". Items are isolated spans that never break inside; the line wraps only between them, and the `·`
 *  separators (`--ink-500`) are hidden from assistive technology. Sizes: `hero` 13/20 muted (`onArt`: on-art muted),
 *  `tile` 12/16 faint and clamped at two lines, `header` 12/16 muted. */

export function Slate({ items, status, size = 'tile', onArt, className, id }: { items: Array<ReactNode | false | null | undefined>; status?: ReactNode; size?: 'hero' | 'tile' | 'header'; onArt?: boolean; className?: string; id?: string }) {
  const xs = items.filter((x): x is Exclude<ReactNode, false | null | undefined | ''> => x !== false && x !== null && x !== undefined && x !== '');
  if (status) xs.push(status);
  if (xs.length === 0) return null;
  return (
    <p id={id} className={cls('slate mslate', size !== 'hero' && 'slate-sm', onArt && 'slate-on-art', className)} data-size={size}>
      {xs.map((x, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="mslate-sep" aria-hidden> · </span>}
          <span className="mslate-item">{x}</span>
        </Fragment>
      ))}
    </p>
  );
}
