import type { Handler } from './index';
import { StudioError } from '@/domain/errors';

export const assemble: Handler = async () => { throw new StudioError('NOT_CONFIGURED', 'Assembly is not wired in this build yet.'); };
export const exportCut: Handler = async () => { throw new StudioError('NOT_CONFIGURED', 'Export is not wired in this build yet.'); };
