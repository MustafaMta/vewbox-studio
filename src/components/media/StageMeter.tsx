/** THE STAGE METER (docs/DESIGN-SYSTEM-V4.md §5.7, §5.10) — six segments of 16 × 3 px with a 2 px gap, one per stage
 *  (Story · Cast & world · Storyboard · Produce · Final cut · Finished). Done segments are muted, the current one is light
 *  while running, warn while waiting for the producer, ivory otherwise; upcoming ones are the strong hairline. It is
 *  the decorative twin of the words beside it, so it is hidden from assistive technology. */

export type StageSegment = 'done' | 'running' | 'waiting' | 'current' | 'upcoming';

/** The six segments for a production at stage `index` (0–5); `complete` fills them all. */
export function stageSegments(index: number, tone: 'running' | 'waiting' | 'current' = 'current', count = 6, complete = false): StageSegment[] {
  return Array.from({ length: count }, (_, i) => (complete || i < index ? 'done' : i === index ? tone : 'upcoming'));
}

export function StageMeter({ segments, className }: { segments: StageSegment[]; className?: string }) {
  return (
    <span className={`stage-meter ${className ?? ''}`} aria-hidden>
      {segments.map((s, i) => <span key={i} data-s={s} />)}
    </span>
  );
}
