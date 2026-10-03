'use client';

import { Shell } from '@/components/shell/Shell';

/** Every page of the studio sits in the shell (src/components/shell/Shell.tsx; docs/DESIGN-SYSTEM-V4.md §5.1): the
 *  navigation (a 240 px sidebar, an 80 px rail, or a phone bar with its menu sheet), the content column that carries
 *  the page's room, the ServerBar, the command palette and the shortcut sheet. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
