import type { Aspect, CameraMove, CharacterRefRole, Dialect, Framing, Kind, Language, LocationRefRole, LyricKind, Sex, Stage, Style, TimeOfDay, Transition } from './vocabulary';

/** WHAT THE STUDIO KEEPS — the shapes every page reads and writes, and the shapes the server persists. The
 *  database is the source of truth; the browser holds a snapshot of it and the workers write into it. */

export type AssetKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'SUBTITLE';
export type AssetOrigin = 'SAMPLE' | 'UPLOAD' | 'GENERATED' | 'DERIVED';

export interface Asset {
  id: string;
  kind: AssetKind;
  /** Where the browser loads it from: `/sample/…` for bundled sample media, `/api/media/{id}` for library files. */
  src: string;
  poster?: string;
  label: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  tags: string[];
  /** Sample content is marked so the interface can say so wherever it appears. */
  sample: boolean;
  origin: AssetOrigin;
  mimeType?: string;
  bytes?: number;
  sha256?: string;
  /** Who made it and from what: job id, provider, model, request id, prompt, references, workflow version. */
  provenance?: Record<string, unknown>;
  jobId?: string;
  /** Set by the server when the file behind the record cannot be found. */
  unavailable?: boolean;
  createdAt: string;
}

export interface Show {
  id: string;
  title: string;
  titleAr?: string;
  logline: string;
  genre: string;
  style: Style;
  language: Language;
  dialect?: Dialect;
  aspect: Aspect;
  synopsis?: string;
  /** Wide backdrop (16:9) and portrait poster (2:3). */
  coverAssetId?: string;
  posterAssetId?: string;
  /** Show-level canon: the cast and world every episode inherits. */
  castIds: string[];
  locationIds: string[];
  /** World rules, relationships and timeline facts every episode must respect. */
  bible?: { worldRules?: string[]; relationships?: string[]; timeline?: string[]; /** storylines left open by the finished episodes; the next season or episode picks them up */ unresolved?: string[]; styleNotes?: string };
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  showId: string;
  number: number;
  title: string;
  arc: string;
  createdAt: string;
}

export interface Line { id: string; characterId: string; text: string; textAr?: string; delivery?: string; audioAssetId?: string; durationSeconds?: number }
export interface Beat { id: string; action: string; lines: Line[] }

export interface Scene {
  id: string;
  number: number;
  title: string;
  locationId?: string;
  timeOfDay: TimeOfDay;
  characterIds: string[];
  beats: Beat[];
  /** Story planning: why the scene exists, what it must achieve, how it starts and ends. */
  purpose?: string;
  emotionalObjective?: string;
  entryState?: string;
  exitState?: string;
}

export type TakeStatus = 'READY' | 'REJECTED';

export interface TakeReference { kind: 'FIRST_FRAME' | 'LAST_FRAME' | 'SUBJECT' | 'CHARACTER' | 'LOCATION' | 'VIDEO' | 'AUDIO'; assetId?: string; characterId?: string; locationId?: string; note?: string }

export interface QaCheck { name: string; ok: boolean; value?: number | string; threshold?: number | string; detail?: string }
export interface QaReport { ok: boolean; checks: QaCheck[]; reviewedAt?: string; reviewer?: 'AUTO' | 'HUMAN'; notes?: string }

export interface Take {
  id: string;
  label: string;
  assetId: string;
  createdAt: string;
  note?: string;
  status: TakeStatus;
  /** Provenance: who generated it and how. Sample takes carry `provider: 'SAMPLE'`. */
  provider?: 'MINIMAX' | 'UPLOAD' | 'SAMPLE';
  model?: string;
  requestId?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  seed?: number;
  references?: TakeReference[];
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  generationMs?: number;
  costUsd?: number;
  qa?: QaReport;
  rejectionReason?: string;
  jobId?: string;
  codeVersion?: string;
  workflowVersion?: string;
  thumbnailAssetId?: string;
  /** Frames at the start that repeat the previous shot's tail (a continuation guide); the cut drops them. */
  trimStartFrames?: number;
  /** The authoritative soundtrack this take was generated to follow (recorded dialogue or the song stretch), with
   *  each line's exact window inside the take: subtitles and the mix use these, never estimates. */
  soundtrack?: { kind: 'DIALOGUE' | 'SONG'; assetId?: string; lines: Array<{ lineId: string; from: number; to: number }> };
}

export type ScreenDirection = 'LEFT' | 'RIGHT' | 'TOWARD' | 'AWAY' | 'NEUTRAL';

/** The continuity state of a shot: what must match the shot before and carry into the shot after. Versioned on
 *  the server; the current version travels with the shot. */
export interface ContinuityState {
  version: number;
  characters: Array<{ characterId: string; wardrobe?: string; pose?: string; position?: string; screenDirection?: ScreenDirection; eyeline?: string; emotion?: string; holding?: string[] }>;
  props: Array<{ name: string; ownerCharacterId?: string; state?: string; position?: string }>;
  environment: { locationId?: string; timeOfDay?: TimeOfDay; weather?: string; lighting?: string; state?: string };
  camera: { framing?: Framing; move?: CameraMove; lensIntent?: string; angle?: string };
  previousShotId?: string;
  nextShotId?: string;
  /** Continuation: the same action continues from the previous shot. Cut: a new framing of the same moment.
   *  Transition: the story moves in place, time or state. */
  relationToPrevious?: 'CONTINUATION' | 'CUT' | 'STORY_TRANSITION';
  notes?: string;
}

export type PerformanceMode = 'SOLO' | 'DUET' | 'ALTERNATING' | 'ENSEMBLE' | 'LISTENER' | 'INSTRUMENTAL';

export interface ShotDialogue { id: string; characterId: string; text: string; textAr?: string; audioAssetId?: string; durationSeconds?: number }

export interface Shot {
  id: string;
  sceneId: string;
  number: number;
  purpose: string;
  action: string;
  framing: Framing;
  cameraMove: CameraMove;
  durationSeconds: number;
  characterIds: string[];
  dialogue: ShotDialogue[];
  transition: Transition;
  openingFrameAssetId?: string;
  endingFrameAssetId?: string;
  takes: Take[];
  selectedTakeId?: string;
  /** Music video: the song window this shot covers, and who performs in it. */
  songWindow?: { from: number; to: number };
  performance?: { mode: PerformanceMode; singerIds: string[]; listenerIds?: string[] };
  notes?: string;
  continuity?: ContinuityState;
  /** The generation prompt the studio wrote for this shot; editable. Empty means "write it from the shot". */
  prompt?: string;
}

export interface LyricSection {
  id: string;
  kind: LyricKind;
  text: string;
  textAr?: string;
  singerIds: string[];
  from: number;
  to: number;
  performanceMode?: PerformanceMode;
  /** Alternating vocals: who sings which line, in order, with timing when known. */
  lines?: Array<{ singerId: string; text: string; from?: number; to?: number }>;
  /** Where each written line is actually sung on the real vocal track (from alignment against the transcribed
   *  vocal stem); cues and shot windows use these instead of an even spread. */
  lineTimes?: Array<{ index: number; from: number; to: number; method: 'ALIGNED' | 'SPREAD'; confidence: number }>;
}

export interface Song {
  id: string;
  title: string;
  source: 'GENERATED' | 'GENERATED_EXAMPLE' | 'UPLOADED';
  assetId?: string;
  durationSeconds: number;
  caption: string;
  sections: LyricSection[];
  singerIds: string[];
  lyrics?: string;
  genre?: string;
  mood?: string;
  bpm?: number;
  provider?: string;
  model?: string;
  requestId?: string;
  stems?: { vocals?: string; instrumental?: string };
  jobId?: string;
}

export interface Brief {
  mode: 'AUTO_IDEA' | 'MANUAL';
  text: string;
  /** Auto Idea: the title of the proposal the project started from. */
  ideaTitle?: string;
  /** Auto Idea: the preferences the producer set (all optional), kept so the request can be re-run. */
  preferences?: IdeaPreferences;
  /** Set when the project was created from the bundled sample proposal rather than a generated one. */
  fromSampleProposal?: boolean;
  proposalJobId?: string;
}

// ------------------------------------------------------------------------------------------------- Auto Idea

/** What the producer may constrain before asking for an idea. Every field is optional: absent means "let the studio
 *  decide". Explicit preferences take priority over the show's context and over the studio's defaults. */
export interface IdeaPreferences {
  style?: Style;
  language?: Language;
  dialect?: Dialect;
  durationSeconds?: number;
  mood?: string;
  /** Characters and locations that must be in it; never prerequisites. */
  castIds?: string[];
  locationIds?: string[];
  /** Music video: how the song is seen. */
  concept?: 'PERFORMANCE' | 'NARRATIVE' | 'MIXED';
}

/** The request the story engine receives: what to make, where it belongs, and the optional preferences. For an
 *  episode or season the show's world, cast, style and continuity are the context. */
export interface AutoIdeaRequest {
  kind: 'SHOW' | 'SEASON' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO';
  showId?: string;
  seasonId?: string;
  preferences: IdeaPreferences;
}

/** A proposed cast member: an existing character reused (with the reason), or a new one the story needs. */
export interface ProposedCast { key: string; characterId?: string; name: string; role: string; reason: string; isNew: boolean; fromPreference: boolean; sex?: Sex; appearance?: string; personality?: string; ageYears?: number }
export interface ProposedLocation { key: string; locationId?: string; name: string; description: string; isNew: boolean; fromPreference: boolean; kind?: 'INTERIOR' | 'EXTERIOR' }

/** What the story engine returns, for the producer to review and edit before anything is created. */
export interface IdeaProposal {
  /** True only for the bundled written examples; a generated proposal is `false`. */
  sample: boolean;
  title: string;
  titleAr?: string;
  logline: string;
  premise: string;
  genre: string;
  mood: string;
  style: Style;
  language: Language;
  dialect?: Dialect;
  durationSeconds: number;
  structure: Array<{ title: string; summary: string }>;
  cast: ProposedCast[];
  locations: ProposedLocation[];
  concept?: 'PERFORMANCE' | 'NARRATIVE' | 'MIXED';
  song?: { title: string; caption: string; lyrics: string };
}

export interface ExportRecord { id: string; assetId: string; format: string; resolution: string; subtitles: string; createdAt: string; jobId?: string; durationSeconds?: number; bytes?: number }

export interface Production {
  id: string;
  kind: Kind;
  showId?: string;
  seasonId?: string;
  episodeNumber?: number;
  title: string;
  titleAr?: string;
  logline: string;
  synopsis: string;
  style: Style;
  language: Language;
  dialect?: Dialect;
  aspect: Aspect;
  targetSeconds: number;
  stage: Stage;
  brief: Brief;
  castIds: string[];
  locationIds: string[];
  scenes: Scene[];
  shots: Shot[];
  song?: Song;
  /** Wide backdrop (16:9); the poster is portrait (2:3) for films and square (1:1) for music videos. */
  coverAssetId?: string;
  posterAssetId?: string;
  /** Music video: who performs (shown as the artist), how it is treated, and its genre and mood. */
  artist?: string;
  concept?: 'PERFORMANCE' | 'NARRATIVE' | 'MIXED';
  genre?: string;
  mood?: string;
  /** The assembled cut, when one has been rendered, and every export made from it. */
  cutAssetId?: string;
  exports?: ExportRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterRef {
  id: string; role: CharacterRefRole; assetId: string; approved?: boolean;
  /** How the picture was made (image agent, wave 2): the view drawn ('SHEET_TILE' for a tile cut from the identity
   *  sheet, else the view name), the asset ids of the references actually given to the model in order (a tile lists
   *  the sheet it was cut from; a derived view lists FRONT tile, face crop, sheet), and the seed used. */
  view?: string; references?: string[]; seed?: number;
}

/** The one voice a character speaks with: which engine, which reference recording, which revision. */
export interface VoiceIdentity {
  provider: 'LOCAL_TTS' | 'MINIMAX';
  model: string;
  referenceAssetId?: string;
  providerVoiceId?: string;
  revision: number;
  language: Language;
  dialect?: Dialect;
  params?: Record<string, unknown>;
  createdAt: string;
}

export interface Voice {
  pitch: 'LOW' | 'MID' | 'HIGH';
  pace: 'SLOW' | 'MEASURED' | 'QUICK';
  timbre: string;
  notes: string;
  /** Voice lines. A selected voice is the one the character speaks with. `source` says where it came from: a bundled
   *  sample, a recording the producer uploaded, or a voice the studio generated. */
  samples: VoiceSample[];
  selectedSampleId?: string;
  identity?: VoiceIdentity;
}

export interface VoiceSample { id: string; label: string; assetId?: string; source: 'SAMPLE' | 'UPLOADED' | 'GENERATED'; text?: string; language?: Language; jobId?: string }

/** One fact: a character appeared in a take of a video. Recorded when the take exists and never erased — removing or
 *  rejecting the take marks it, but the character has still been seen. Titles are copied so the record stays
 *  readable after the production is renamed or deleted. */
export interface VideoUsage {
  productionId: string;
  productionTitle: string;
  shotId: string;
  shotLabel: string;
  takeId: string;
  takeLabel: string;
  recordedAt: string;
  status: 'IN_TAKE' | 'TAKE_REMOVED';
}

/** Whether this character has ever been in a video. `known: false` means the history is not available (an imported
 *  character, an old record): the interface must then treat the character as used. */
export interface CharacterUsage { known: boolean; videos: VideoUsage[] }

/** A reference picture uploaded to generate (or regenerate) an unused character's appearance from. It is not the
 *  appearance: it stays pending until a generation replaces the portrait. */
export interface PendingReference { assetId: string; addedAt: string }

export interface Character {
  id: string;
  name: string;
  nameAr?: string;
  role: string;
  style: Style;
  sex: Sex;
  species?: string;
  ageYears: number;
  build: string;
  face: string;
  hair: string;
  skin: string;
  eyes: string;
  distinguishing: string[];
  wardrobe: string;
  personality: string;
  language: Language;
  dialect?: Dialect;
  voice: Voice;
  refs: CharacterRef[];
  portraitAssetId?: string;
  /** Absent means unknown, and unknown means locked. */
  usage?: CharacterUsage;
  pendingReference?: PendingReference;
  /** Durable identity details beyond the written look. */
  canon?: {
    heightCm?: number; accessories?: string[]; visualRestrictions?: string[]; agePresentation?: string; speech?: string;
    /** Image agent (wave 2): the fixed identity tokens repeated verbatim in every prompt that draws the character,
     *  and the one seed the sheet and every derived view start from. Kept in `canon` (jsonb) so they persist
     *  without a schema change; a dedicated column can replace this later. */
    identityLine?: string; identitySeed?: number;
  };
  /** Creative notes: free text for the writers, never used to draw the character. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationRef { id: string; role: LocationRefRole; assetId: string; label: string; timeOfDay?: TimeOfDay }

export interface Location {
  id: string;
  name: string;
  nameAr?: string;
  kind: 'INTERIOR' | 'EXTERIOR';
  description: string;
  style: Style;
  lighting: TimeOfDay[];
  landmarks: string[];
  props: string[];
  refs: LocationRef[];
  masterAssetId?: string;
  layout?: { geography?: string; architecture?: string; materials?: string[]; cameraZones?: string[]; entrances?: string[]; spatial?: string };
  createdAt: string;
  updatedAt: string;
}

export interface GenerationSettings {
  /** MiniMax video model and resolution for new takes. */
  videoModel?: string;
  videoResolution?: string;
  /** Which story engine answers: 'minimax' | 'anthropic' | 'openai-compatible'. Empty means the server default. */
  llmProvider?: string;
  /** Which voice engine new identities use. */
  voiceProvider?: 'LOCAL_TTS' | 'MINIMAX';
}

export interface Settings {
  uiLanguage: 'en' | 'ar';
  reducedMotion: boolean;
  defaults: { style: Style; language: Language; dialect: Dialect; aspect: Aspect };
  generation?: GenerationSettings;
}

export interface StudioState {
  version: number;
  shows: Show[];
  seasons: Season[];
  productions: Production[];
  characters: Character[];
  locations: Location[];
  assets: Asset[];
  settings: Settings;
}
