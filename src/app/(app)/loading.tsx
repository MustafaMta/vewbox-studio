'use client';

import { ShellSkeleton } from '@/components/shell/ShellSkeleton';

/** While a route's code loads: the page's frame in placeholders, and a sentence for screen readers (no spinner). */
export default function Loading() {
  return <ShellSkeleton />;
}
