/** The media kit (docs/design/VISUAL-STANDARD-V5.1.md §5.5–§5.7, §5.11; v4 §5.3–5.9). Pages import from here. */
export { Frame, type FrameProps } from './Frame';
export { DecisionCard, MediaTile, ContentName, Facts } from './Cards';
export { TitleCard, type TitleCardProps, type TitleState } from './TitleCard';
export { Slate } from './Slate';
export { FaceCircle, type FaceSize } from './FaceCircle';
export { StageMeter, stageSegments, type StageSegment } from './StageMeter';
export { KeyArtTile, PosterTile, SleeveTile, FigureTile, PlateTile, StillCard, TileShell, TileSkeleton, type TileProps } from './tiles';
export { Rail } from './Rail';
export { EpisodeCard, EpisodeRow, SeasonPicker, type EpisodeData, type SeasonOption } from './Episodes';
export { CastGrid, CastRow, type CastMember } from './CastRow';
export { CompactHeader, CompactThumb, type ThumbShape } from './CompactHeader';
export { BackdropHero, DiptychHero, SleeveHero, FigureHero, PlateHero, TheatreHero, HeroText } from './hero';
export { artStyle, objectPosition, focalOf, faceBoxOf, faceCrop, portraitPosition, initials, RATIO_VALUE, type Picture, type FrameRatio } from './art';
