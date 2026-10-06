/** THE ENGINES AND THEIR LICENCES, as the studio shows them (Settings › Licences, the terms page, the film credits).
 *  The single source of truth for the text is docs/LICENSES.md; this is the same table as data. `status`: IN_USE (the
 *  studio makes work with it today), EVALUATING (under test, not in production), FONT. `obligations` are what the
 *  licence asks of the studio or passes on to its users, in plain words. Pure. */

export interface EngineLicence {
  id: string;
  engine: string;
  role: string;
  licence: string;
  status: 'IN_USE' | 'EVALUATING' | 'FONT';
  obligations: string[];
  /** the licence's use restrictions travel with its outputs: the terms of use bind the studio's users to them */
  passesRestrictions?: boolean;
}

export const ENGINE_LICENCES: readonly EngineLicence[] = [
  { id: 'minimax-h3', engine: 'MiniMax H3 (local, open weights)', role: 'Films every take: picture and sound', licence: 'MiniMax H3 Community License', status: 'IN_USE', passesRestrictions: true,
    obligations: ['“MiniMax H3” is shown prominently in the interface (§IV.2).', 'Commercial use only below US$20M a year.', 'Users are bound by its Acceptable Use Policy (§V.2, Exhibit A).', 'Outputs may not be displayed in the US, the EU, the UK or South Korea without MiniMax’s territory licence.'] },
  { id: 'qwen-image', engine: 'Qwen-Image-2512 and Qwen-Image-Edit-2511', role: 'Canonical character images, location plates, frames', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence and notices.'] },
  { id: 'qwen35-4b', engine: 'Qwen3.5-4B', role: 'Reads your reference picture', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence and notices.'] },
  { id: 'mediapipe', engine: 'MediaPipe face models', role: 'Face boxes and mouth movement (checks)', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence and notices.'] },
  { id: 'indextts', engine: 'IndexTTS 2.5', role: 'Speaks the characters’ lines', licence: 'bilibili IndexTTS model licence (code Apache-2.0)', status: 'IN_USE', passesRestrictions: true, obligations: ['Its use restrictions bind the users of what it makes (§3.4).'] },
  { id: 'habibi', engine: 'Habibi-TTS IRQ', role: 'Iraqi Arabic voices', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence and notices.'] },
  { id: 'voxcpm2', engine: 'VoxCPM2', role: 'Designs a voice from a description', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Label AI audio as AI audio; never impersonate a real person (model card).'] },
  { id: 'whisper', engine: 'faster-whisper large-v3', role: 'Hears lines back; subtitle timing', licence: 'MIT', status: 'IN_USE', obligations: ['Keep the licence notice.'] },
  { id: 'wav2vec2', engine: 'wav2vec2 aligners (English, Arabic)', role: 'Word timing of the recorded lines', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence and notices.'] },
  { id: 'opencv-face', engine: 'YuNet and SFace (OpenCV Zoo)', role: 'Face identity checks', licence: 'MIT / Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence notices.'] },
  { id: 'ecapa', engine: 'ECAPA-TDNN (SpeechBrain)', role: 'Voice similarity checks', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence and notices.'] },
  { id: 'demucs', engine: 'Demucs', role: 'Separates a song’s voice and music', licence: 'MIT', status: 'IN_USE', obligations: ['Keep the licence notice.'] },
  { id: 'ace-step', engine: 'ACE-Step 1.5', role: 'Makes songs', licence: 'MIT', status: 'IN_USE', obligations: ['Keep the licence notice.'] },
  { id: 'minimax-music3', engine: 'MiniMax Music 3 (open weights)', role: 'Makes songs (second engine)', licence: 'MiniMax-Music3 Community License', status: 'IN_USE', obligations: ['“MiniMax Music 3” is credited where it is used.', 'Commercial use only below US$20M a year.'] },
  { id: 'qwen38-27b', engine: 'Qwen3.8-27B-FP8', role: 'The studio’s brain: writes ideas, stories, scripts and shot plans', licence: 'Apache-2.0', status: 'IN_USE', obligations: ['Keep the licence and notices.'] },
  { id: 'latentsync', engine: 'LatentSync', role: 'Lip-sync correction', licence: 'OpenRAIL++-M', status: 'EVALUATING', passesRestrictions: true, obligations: ['Its use restrictions (Attachment A) bind the users of what it makes.'] },
  { id: 'geist', engine: 'Geist and Geist Mono', role: 'The interface’s typefaces', licence: 'SIL Open Font License 1.1', status: 'FONT', obligations: ['Ship the licence with the font files.'] },
] as const;

/** Until the producer's MiniMax territory licence is granted (Settings › Licences shows it). */
export const DISTRIBUTION_NOTE = 'Outputs of local MiniMax H3 may not be displayed in the United States, the European Union, the United Kingdom or South Korea without MiniMax’s territory licence.';
