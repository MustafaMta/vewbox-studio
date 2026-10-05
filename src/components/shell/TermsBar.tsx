'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { termsAccepted } from '@/domain/terms';
import { useStudio } from '@/studio/store';

/** THE TERMS LINE — one line at the top of the content while the studio's terms of use wait for acceptance
 *  (src/domain/terms.ts): browsing, editing and choosing stay open; new work waits. It leads to /terms (not shown
 *  there). Gone once accepted. */
export function TermsBar() {
  const { state, ready } = useStudio();
  const pathname = usePathname();
  if (!ready || termsAccepted(state.settings) || pathname === '/terms') return null;
  return (
    <div className="terms-bar" role="status">
      <p className="terms-bar-text"><span className="terms-bar-what">Accept the studio’s terms of use to make new work.</span> <span className="terms-bar-more">They pass on what the engines’ licences allow.</span></p>
      <Link className="btn btn-secondary btn-xs terms-bar-go" href="/terms">Read and accept</Link>
    </div>
  );
}
