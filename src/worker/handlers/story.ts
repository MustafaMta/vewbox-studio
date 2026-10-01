import type { Handler } from './index';
import { StudioError } from '@/domain/errors';

/** The story engine handlers are filled in by src/worker/handlers/story/*. Until then a job of this type fails
 *  clearly rather than pretending. */
const notYet = (what: string): Handler => async () => { throw new StudioError('NOT_CONFIGURED', `${what} is not available in this build yet.`); };

export const autoIdea = notYet('Auto Idea');
export const developStory = notYet('Story development');
export const writeScript = notYet('Script writing');
export const planShots = notYet('Shot planning');
