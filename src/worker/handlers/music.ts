import type { Handler } from './index';
import { StudioError } from '@/domain/errors';

export const generateSong: Handler = async () => { throw new StudioError('NOT_CONFIGURED', 'Song generation is not wired in this build yet.'); };
