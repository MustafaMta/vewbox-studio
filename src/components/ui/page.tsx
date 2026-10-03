/** THE PAGE FURNITURE (v3 module, kept as a re-export shim until Q1): the page header, titled sections, a list of
 *  facts, a progress bar and a stack of faces now live in the interface kit (src/components/ui/kit/PageHeader.tsx,
 *  kit/Status.tsx). New code imports them from '@/components/ui/kit'. */
export { PageHeader, Section, FactList, CastStack } from './kit/PageHeader';
export { ProgressBar } from './kit/Status';
