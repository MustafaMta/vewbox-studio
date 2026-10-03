/** WHAT WAITS FOR THE PRODUCER — the shell reads the one shared selector (docs/CONTRACTS-REDESIGN-BACKEND.md B8,
 *  docs/DESIGN-SYSTEM-V5.md §6.7): src/studio/selectors/decisions.ts, the same function the server runs for
 *  `GET /api/decisions`, so the top-bar count, the tab title, Home, Production and the Studio Company agree.
 *  (F4 kept this module's path; it holds nothing of its own any more.) */
export { waitingDecisions, decisionCounts, type Decision, type DecisionKind, type DecisionSubject, type Decisions, type PipelineRow } from '@/studio/selectors/decisions';
