import type { Handler } from './index';
import { StudioError } from '@/domain/errors';

export const generateTake: Handler = async () => { throw new StudioError('NOT_CONFIGURED', 'Video generation is not wired in this build yet.'); };
