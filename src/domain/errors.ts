/** Errors the studio raises on purpose, with a code the interface can translate and the API can map to a status. */
export type StudioErrorCode =
  | 'NOT_FOUND'
  | 'APPEARANCE_LOCKED'
  | 'ASSET_PROTECTED'
  | 'INVALID'
  | 'CONFLICT'
  | 'NOT_CONFIGURED'
  | 'PROVIDER'
  | 'UNAVAILABLE';

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: StudioErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'StudioError';
    this.code = code;
    this.details = details;
  }
}

export const isStudioError = (e: unknown): e is StudioError => e instanceof StudioError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'StudioError');

export function httpStatusFor(code: StudioErrorCode): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'APPEARANCE_LOCKED':
    case 'ASSET_PROTECTED': return 423;
    case 'INVALID': return 400;
    case 'CONFLICT': return 409;
    case 'NOT_CONFIGURED': return 424;
    case 'PROVIDER': return 502;
    case 'UNAVAILABLE': return 503;
  }
}
