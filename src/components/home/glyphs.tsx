import type { ToolShape } from './model';

/** THE SHAPE GLYPHS of the start actions (docs/design/VISUAL-STANDARD-V5.1.md §5.8): each object in its own shape,
 *  drawn with the viewfinder's four corners at lucide weight — a 16:9 frame for a show, a 2:3 poster for a short, a
 *  1:1 sleeve for a music video, a standing figure for a character, a 2.39 plate for a location, three linked members
 *  for the company. 20 px, the current colour, decorative.
 *  (Home's until the kit's ActionCard carries them.) */

const corners = (x0: number, y0: number, x1: number, y1: number, arm = 3) =>
  `M${x0} ${y0 + arm}V${y0}H${x0 + arm}M${x1 - arm} ${y0}H${x1}V${y0 + arm}M${x1} ${y1 - arm}V${y1}H${x1 - arm}M${x0 + arm} ${y1}H${x0}V${y1 - arm}`;

const DRAW: Record<ToolShape, React.ReactNode> = {
  show: (<><path d={corners(2, 6.5, 22, 17.5)} /><path d="M10.5 9.75v4.5l3.75-2.25z" /></>),
  short: (<><path d={corners(6, 2.5, 18, 21.5)} /><path d="M9.5 17h5" /></>),
  music: (<><path d={corners(3, 3, 21, 21)} /><circle cx="12" cy="12" r="4.25" /><circle cx="12" cy="12" r="0.9" /></>),
  character: (<><path d={corners(5, 2, 19, 22)} /><circle cx="12" cy="7.75" r="2.25" /><path d="M8.75 18.5v-3.25a3.25 3.25 0 0 1 6.5 0v3.25" /></>),
  location: (<><path d={corners(1.5, 7, 22.5, 17)} /><path d="M5 14.5l4-4 3 3 2.5-2.5 4.5 3.5" /></>),
  studio: (<><path d={corners(3, 3, 21, 21)} /><circle cx="12" cy="8.5" r="1.75" /><circle cx="8" cy="15" r="1.75" /><circle cx="16" cy="15" r="1.75" /><path d="M11 10l-2 3.5M13 10l2 3.5M9.75 15h4.5" /></>),
};

export function ShapeGlyph({ shape }: { shape: ToolShape }) {
  return (
    <svg className="home-glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {DRAW[shape]}
    </svg>
  );
}
