/** The shell writes `--sticky-extra` and `--bottom-bars` through the kit's one set of contributions
 *  (docs/DESIGN-SYSTEM-V4.md §2.1 amendment): two writers would overwrite each other's sums. */
export { useRootVarContribution } from '@/components/ui/kit/layout';
