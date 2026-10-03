import type { ResearchPlatform } from '@/domain/development';
import { RESEARCH_PLATFORMS } from '@/domain/development';
import { facebook } from './facebook';
import { gdelt } from './gdelt';
import { instagram } from './instagram';
import { tiktok } from './tiktok';
import type { ResearchProvider } from './types';
import { wikipedia } from './wikipedia';
import { youtube } from './youtube';

/** The providers in the producer's priority order (TikTok, Instagram, Facebook, YouTube), then the supporting public
 *  sources (news, Wikipedia). */
export const PROVIDERS: Record<ResearchPlatform, ResearchProvider> = { TIKTOK: tiktok, INSTAGRAM: instagram, FACEBOOK: facebook, YOUTUBE: youtube, NEWS: gdelt, WIKIPEDIA: wikipedia };
export const providersInOrder = (): ResearchProvider[] => RESEARCH_PLATFORMS.map((p) => PROVIDERS[p]);
export type { ResearchProvider, SourceAnswer, SourceQuery, FetchedItem } from './types';
