/** The cutting-room kit (docs/DESIGN-SYSTEM-V4.md §5.12, §5.14, §5.20). */
export { FilmStrip, type StripFrame } from './FilmStrip';
export { DualScaleStrip, type OverviewSegment } from './DualScaleStrip';
export { StoryboardReel, reelIndexAt, type ReelShot } from './StoryboardReel';
export { CompareAB, type CompareSource } from './CompareAB';
export { Timeline, type TimelineClip, type TimelineLine } from './Timeline';
export { DockLayout, Panel, type DockPanel } from './DockLayout';
export { Inspector, shared, MIXED, useMixedLabel } from './Inspector';
export { FocusModeProvider, FocusModeButton, useFocusMode } from './FocusMode';
export { VersionStack, type Version } from './VersionStack';
export { ToolRow, ToolButton } from './ToolRow';
export { useMediaQuery } from './useMediaQuery';
