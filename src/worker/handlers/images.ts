import type { Handler } from './index';
import { StudioError } from '@/domain/errors';

const notYet = (what: string): Handler => async () => { throw new StudioError('NOT_CONFIGURED', `${what} is not available in this build yet.`); };
export const characterAppearance = notYet('Character drawing');
export const characterRefs = notYet('Reference views');
export const locationPlates = notYet('Location plates');
export const shotFrames = notYet('Frame preparation');
