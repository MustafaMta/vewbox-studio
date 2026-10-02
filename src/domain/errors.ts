/** Errors the studio raises on purpose, with a code the interface can translate and the API can map to a status. */
export const STUDIO_ERROR_CODES = [
  'NOT_FOUND',
  'APPEARANCE_LOCKED',
  'VOICE_LOCKED',
  'ASSET_PROTECTED',
  'INVALID',
  /** A step needs a reference the producer adds (a usable picture for the look, an uploaded recording for the
   *  voice) and the one it has is missing or unusable. Never replaced silently by text or by a generated line. */
  'MISSING_REFERENCE',
  'CONFLICT',
  'NOT_CONFIGURED',
  'PROVIDER',
  'UNAVAILABLE',
] as const;
export type StudioErrorCode = (typeof STUDIO_ERROR_CODES)[number];

export const isStudioErrorCode = (x: unknown): x is StudioErrorCode => typeof x === 'string' && (STUDIO_ERROR_CODES as readonly string[]).includes(x);

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly details?: Record<string, unknown>;
  /** The failure class the worker records for this error (`classifyFailure` in src/server/org/runs.ts reads it
   *  before anything else): `details.failureClass` when given; a MISSING_REFERENCE error is always that class. */
  readonly failureClass?: string;
  constructor(code: StudioErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'StudioError';
    this.code = code;
    this.details = details;
    const fc = details?.failureClass;
    this.failureClass = typeof fc === 'string' ? fc : code === 'MISSING_REFERENCE' ? 'MISSING_REFERENCE' : undefined;
  }
}

export const isStudioError = (e: unknown): e is StudioError => e instanceof StudioError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'StudioError');

/** The one way a handler refuses for want of a usable reference: code and failure class are both MISSING_REFERENCE,
 *  so the page shows "Add a reference" and the reliability record says what was missing. */
export function missingReference(message: string, details: Record<string, unknown> = {}): StudioError {
  return new StudioError('MISSING_REFERENCE', message, { ...details, failureClass: 'MISSING_REFERENCE' });
}

/** A code read from somewhere else (a child job's stored error, a provider's answer) as a studio code: anything
 *  outside the union is a provider failure, never passed on as if it were one of ours. */
export const asStudioErrorCode = (code: unknown, fallback: StudioErrorCode = 'PROVIDER'): StudioErrorCode => (isStudioErrorCode(code) ? code : fallback);

export function httpStatusFor(code: StudioErrorCode): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'APPEARANCE_LOCKED':
    case 'VOICE_LOCKED':
    case 'ASSET_PROTECTED': return 423;
    case 'INVALID':
    case 'MISSING_REFERENCE': return 400;
    case 'CONFLICT': return 409;
    case 'NOT_CONFIGURED': return 424;
    case 'PROVIDER': return 502;
    case 'UNAVAILABLE': return 503;
  }
}
