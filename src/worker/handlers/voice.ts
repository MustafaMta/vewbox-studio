import type { Handler } from './index';
import { StudioError } from '@/domain/errors';

const notYet = (what: string): Handler => async () => { throw new StudioError('NOT_CONFIGURED', `${what} is not available in this build yet.`); };
export const voiceBuild = notYet('Voice building');
export const voicePreview = notYet('Voice preview');
export const dialogueAudio = notYet('Dialogue recording');
