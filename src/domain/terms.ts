import type { Settings } from './types';

/** THE STUDIO'S TERMS OF USE (licence compliance: MiniMax H3 Community License §V.2 and its Acceptable Use Policy,
 *  Exhibit A; LatentSync OpenRAIL++-M Attachment A; the IndexTTS model licence §3.4 —
 *  each asks that the restrictions on its outputs bind the people who use them). Accepted once per studio, for this
 *  version (`settings.terms`); a new version asks again. The full sources: docs/LICENSES.md. Pure. */

export const TERMS_VERSION = '2026-10-06';

export interface TermsSection { title: string; items: string[] }

export const TERMS: readonly TermsSection[] = [
  { title: 'What you may not make', items: [
    'Anything unlawful, or anything that helps someone break the law.',
    'Harassment, threats, bullying or content meant to intimidate or humiliate someone.',
    'Defamation: false statements of fact that harm a real person or organisation.',
    'Deception: content meant to pass as real footage of real events or real people, impersonation, fraud, spam or disinformation.',
    'A real person’s face or voice without their consent.',
    'Sexual content involving minors, or any content that exploits or harms minors.',
    'Content for military use, weapons, or surveillance of people.',
    'Content that discriminates against people for who they are, or incites violence or hatred.',
  ] },
  { title: 'When you share what you make', items: [
    'Say that it is AI-generated wherever you post or show it publicly. Every export already says so in its file’s metadata, and can end on a card naming the engines.',
    'Keep the “MiniMax H3” credit with films made by the studio.',
    'Pass these restrictions on to anyone you give the outputs to for further use.',
  ] },
  { title: 'Where outputs may be shown', items: [
    'Until MiniMax’s territory licence is granted, outputs of local MiniMax H3 may not be displayed in the United States, the European Union, the United Kingdom or South Korea.',
    'Commercial use of MiniMax H3 is allowed only below US$20 million of yearly revenue.',
  ] },
];

export const termsAccepted = (s: Pick<Settings, 'terms'> | undefined): boolean => s?.terms?.version === TERMS_VERSION;

/** The words a page shows when making new work waits for the terms. */
export const TERMS_NEEDED = 'Accept the studio’s terms of use before making new work (Settings › Licences and terms).';
/** The server's refusal: names the page where the terms are accepted. */
export const TERMS_REFUSAL = 'The studio’s terms of use are not accepted for this version: accept them at /terms before making new work.';

/** Job types that make nothing (no engine output, no new media, no written story) and so run without the terms: the
 *  check of an uploaded file. Every other type generates, writes or assembles — refused until the terms are accepted. */
export const TERMS_EXEMPT_JOBS: readonly string[] = ['MEDIA_PROBE'];

/** Why a job of this type may not be queued or run now, or null. */
export const termsRefusalFor = (s: Pick<Settings, 'terms'> | undefined, type: string): string | null => (TERMS_EXEMPT_JOBS.includes(type) || termsAccepted(s) ? null : TERMS_REFUSAL);
