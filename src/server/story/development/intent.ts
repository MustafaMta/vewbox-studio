import type { DevelopmentIntent } from '@/domain/development';

/** THE FIXED INTENT IN PRODUCTION PROMPTS (contract §4) — an accepted Auto Idea carries its development intent on
 *  `Brief.development` (domain/development.ts developmentIntentOf); DEVELOP_STORY, WRITE_SCRIPT and PLAN_SHOTS put
 *  this paragraph in their prompts so later departments build within it instead of rewriting it. Empty without an
 *  intent (a manual brief, a sample proposal), so those prompts are unchanged. */
export function intentDirective(intent: DevelopmentIntent | undefined): string {
  if (!intent) return '';
  return [
    'FIXED DEVELOPMENT INTENT (developed, reviewed and accepted by the producer — build within it; do not change the hook, the tone or the ending):',
    `- Audience: ${intent.audience}`,
    `- Tone: ${intent.tone}`,
    intent.hook ? `- Hook (the first 3–5 seconds): ${intent.hook}` : '',
    intent.ending ? `- Ending: ${intent.ending}` : '',
    `- Strategy: ${intent.strategy.replace(/_/g, ' ').toLowerCase()}`,
  ].filter(Boolean).join('\n');
}
