import type { ResearchPlatform } from '@/domain/development';
import type { ResearchSettings } from '@/domain/types';

/** RESEARCH ACCESS — which credentials exist (server environment only; never in the UI, the logs or a job record), the
 *  default reuse window per source, and the producer's switches from Settings. Read from `process.env` at call time,
 *  so a key added to the environment is used by the next run without a code change. */

export const RESEARCH_ENV = {
  TIKTOK: ['TIKTOK_RESEARCH_CLIENT_KEY', 'TIKTOK_RESEARCH_CLIENT_SECRET'],
  INSTAGRAM: ['INSTAGRAM_GRAPH_TOKEN', 'INSTAGRAM_BUSINESS_ID'],
  YOUTUBE: ['YOUTUBE_API_KEY'],
} as const;

const value = (name: string) => process.env[name]?.trim() || '';
/** The credential values for a platform, or null when any is missing. Only provider code calls this. */
export function credentials(platform: keyof typeof RESEARCH_ENV): Record<string, string> | null {
  const names = RESEARCH_ENV[platform];
  const out: Record<string, string> = {};
  for (const n of names) { const v = value(n); if (!v) return null; out[n] = v; }
  return out;
}
/** The names of the variables a platform still needs (for a NOT_CONFIGURED sentence; names only, never values). */
export const missingEnv = (platform: keyof typeof RESEARCH_ENV): string[] => RESEARCH_ENV[platform].filter((n) => !value(n));

/** Default reuse windows (contract §3): platform charts 12 h, news 24 h, Wikipedia's daily lists 24 h. */
export const DEFAULT_TTL_HOURS: Record<ResearchPlatform, number> = { TIKTOK: 12, INSTAGRAM: 12, FACEBOOK: 12, YOUTUBE: 12, NEWS: 24, WIKIPEDIA: 24 };

/** The reuse window for a platform: Settings' cacheHours (clamped to 1–168 h) when set, else the source's default. */
export function ttlHours(platform: ResearchPlatform, settings?: ResearchSettings): number {
  const h = settings?.cacheHours;
  return typeof h === 'number' && Number.isFinite(h) ? Math.min(168, Math.max(1, Math.round(h))) : DEFAULT_TTL_HOURS[platform];
}

/** Research is on unless Settings switched it off. */
export const researchEnabled = (settings?: ResearchSettings) => settings?.enabled !== false;
/** A platform is on unless Settings switched it off. */
export const platformEnabled = (platform: ResearchPlatform, settings?: ResearchSettings) => settings?.platforms?.[platform] !== false;

/** The honest User-Agent every research call sends (Wikimedia's API policy asks for a contact: RESEARCH_CONTACT, a URL
 *  or address the operator chooses to publish; nothing is sent when it is unset). */
export const userAgent = () => `VewboxStudio-TrendResearch/1.0 (AI film studio trend research${process.env.RESEARCH_CONTACT?.trim() ? `; ${process.env.RESEARCH_CONTACT.trim()}` : ''})`;
