/** THE VEWBOX MARK (docs/DESIGN-SYSTEM-V5.md §1.4) — the viewfinder: four frame corners around a dot, the frame you
 *  look through. Monochrome, in the current colour (paper in the shell), never on a coloured tile: the work stays the
 *  brightest, most colourful thing on screen. The same drawing is the favicon (src/app/layout.tsx). */
export function VewboxGlyph({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" className={className} aria-hidden="true" focusable="false">
      <path d="M2.5 8V3.5H7M19 3.5h4.5V8M23.5 18v4.5H19M7 22.5H2.5V18" />
      <circle cx="13" cy="13" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
