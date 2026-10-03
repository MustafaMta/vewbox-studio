import type { ResearchProvider } from './types';

/** FACEBOOK — no permitted path. Meta's Content Library (the successor of CrowdTangle) is available only to approved
 *  researchers inside Meta's own environment, and the Graph API offers no public-content search for this use. The
 *  studio therefore never queries Facebook and says why in every run's coverage. */

export const FACEBOOK_REASON = 'Meta offers public Facebook content only through its Content Library, to approved researchers inside Meta\'s own environment; there is no public API this studio may call, so Facebook is not researched.';

export const facebook: ResearchProvider = {
  platform: 'FACEBOOK',
  id: 'none (Meta Content Library is researcher-only)',
  access: () => ({ status: 'UNSUPPORTED', detail: FACEBOOK_REASON }),
  queries: () => [],
  fetch: async () => ({ status: 'FAILED', detail: FACEBOOK_REASON, items: [] }),
};
