/** MEDIA ICONS — owned by F3 (docs/DESIGN-SYSTEM-V4.md §8.2 rule 4). Add the icons F3 needs here only, as
 *  `export { Name as IconName } from 'lucide-react';`; src/components/ui/icons.tsx re-exports this file. Before adding one, check
 *  icons.tsx: an icon that already has a name keeps it. Transport glyphs are never mirrored (media time runs left to
 *  right, §5.12). */
export {
  Rewind as IconBack5, FastForward as IconForward5, ZoomIn as IconZoomIn, ZoomOut as IconZoomOut, Scan as IconFit,
  Focus as IconFocusMode, Columns2 as IconCompare, MessageSquarePlus as IconAddNote, Minus as IconMinus,
} from 'lucide-react';
