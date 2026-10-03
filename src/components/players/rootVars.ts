/** Players write `--bottom-bars` (and the media header `--sticky-extra`) through the kit's single contribution set
 *  (docs/DESIGN-SYSTEM-V4.md §2.1 amendment): two writers would overwrite each other's sums. */
export { useRootVarContribution } from '@/components/ui/kit/layout';
