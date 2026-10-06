import { StudioError } from '@/domain/errors';
import { termsRefusalFor } from '@/domain/terms';
import type { Settings } from '@/domain/types';
import { readState } from './studio/engine';

/** THE TERMS OF USE ON THE SERVER (src/domain/terms.ts): every path that queues work refuses a generating job while the
 *  studio's terms are not accepted for this version — 403 CONSENT_REQUIRED, naming /terms, class INVALID_INPUT (an
 *  unchanged retry cannot succeed). The pages check first; this is the rule, the pages only show it. */
export function termsError(message: string): StudioError {
  return new StudioError('CONSENT_REQUIRED', message, { failureClass: 'INVALID_INPUT', reason: 'TERMS', page: '/terms', httpStatus: 403, retryable: false });
}

export function assertTermsFor(settings: Pick<Settings, 'terms'> | undefined, type: string): void {
  const why = termsRefusalFor(settings, type);
  if (why) throw termsError(why);
}

/** The same, reading the studio's settings. */
export async function assertTermsAccepted(type: string): Promise<void> {
  const { state } = await readState();
  assertTermsFor(state.settings, type);
}
