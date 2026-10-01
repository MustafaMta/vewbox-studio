import type { Handler } from './index';
import { StudioError } from '@/domain/errors';

export const produce: Handler = async () => { throw new StudioError('NOT_CONFIGURED', 'Produce is not wired in this build yet.'); };
