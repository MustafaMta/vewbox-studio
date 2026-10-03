import type { Dialect, Language, Style } from '@/domain/vocabulary';
import type { IdeaPreferences, ResearchSettings } from '@/domain/types';
import type { IdeaKind, ResearchPlatform } from '@/domain/development';
import type { ResearchStore } from './store';

/** What the Trend Research Agent is asked: the request of one Auto Idea, with what it inherits from its show. */
export interface ResearchRequest {
  ideaJobId: string;
  jobId?: string;
  kind: IdeaKind;
  language: Language;
  dialect?: Dialect;
  style?: Style;
  preferences: IdeaPreferences;
  brief?: string;
  /** For a season or an episode: the show's identity, so topics fit it instead of replacing it. */
  show?: { title: string; genre: string; logline: string };
  /** Bypass the cache. */
  refresh?: boolean;
}

export interface ResearchOptions {
  settings?: ResearchSettings;
  store?: ResearchStore;
  signal?: AbortSignal;
  /** The clock (tests). */
  now?: () => Date;
  /** A line for the job's event log ("Querying …"); never carries a secret. */
  event?: (message: string, data?: Record<string, unknown>) => Promise<void>;
  /** Progress with a real message (the orchestrator shows the running child's message). */
  progress?: (message: string) => Promise<void>;
}

/** What each platform's access path is right now (Settings and the progress page show it); never a secret. */
export interface ResearchSourceStatus { platform: ResearchPlatform; provider: string; status: 'READY' | 'NOT_CONFIGURED' | 'UNSUPPORTED' | 'DISABLED'; detail: string; ttlHours: number }
