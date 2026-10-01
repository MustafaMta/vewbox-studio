import type { Aspect, CameraMove, CharacterRefRole, Dialect, Framing, Kind, Language, LocationRefRole, LyricKind, Sex, Stage, Style, TimeOfDay, Transition } from './vocabulary';

/** WHAT THE STUDIO KEEPS — the shapes every page reads and writes. This is the whole model of the prototype; the
 *  fixtures in `src/demo` fill it with clearly labelled sample content and the store keeps it in the browser. */

export type AssetKind = 'IMAGE' | 'VIDEO' | 'AUDIO';

export interface Asset {
  id: string;
  kind: AssetKind;
  /** A path under /public. Every bundled file is sample media made for this prototype. */
  src: string;
  poster?: string;
  label: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags: string[];
  /** Sample content is marked so the interface can say so wherever it appears. */
  sample: boolean;
  /** A file the producer added: the bytes live in this browser's IndexedDB under the asset id; `src` is empty and
   *  resolved to a session URL by the media store. */
  local?: boolean;
  mimeType?: string;
  bytes?: number;
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

export interface Line { id: string; characterId: string; text: string; textAr?: string; delivery?: string }
export interface Beat { id: string; action: string; lines: Line[] }

export interface Scene {
  id: string;
  number: number;
  title: string;
  locationId?: string;
  timeOfDay: TimeOfDay;
  characterIds: string[];
  beats: Beat[];
}

export interface Take {
  id: string;
  label: string;
  /** A sample clip. The prototype never generates a take; it shows how takes are laid out and chosen. */
  assetId: string;
  createdAt: string;
  note?: string;
}

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
  dialogue: Array<{ id: string; characterId: string; text: string; textAr?: string }>;
  transition: Transition;
  openingFrameAssetId?: string;
  endingFrameAssetId?: string;
  takes: Take[];
  selectedTakeId?: string;
  /** Music video: the song window this shot covers. */
  songWindow?: { from: number; to: number };
  notes?: string;
}

export interface LyricSection {
  id: string;
  kind: LyricKind;
  text: string;
  textAr?: string;
  singerIds: string[];
  from: number;
  to: number;
}

export interface Song {
  id: string;
  title: string;
  source: 'GENERATED_EXAMPLE' | 'UPLOADED';
  assetId?: string;
  durationSeconds: number;
  caption: string;
  sections: LyricSection[];
  singerIds: string[];
}

export interface Brief {
  mode: 'AUTO_IDEA' | 'MANUAL';
  text: string;
  /** Auto Idea: the title of the proposal the project started from. */
  ideaTitle?: string;
  /** Auto Idea: the preferences the producer set (all optional), kept so a real backend could re-run the request. */
  preferences?: IdeaPreferences;
  /** Set when the project was created from the labelled sample proposal (automatic writing is not connected). */
  fromSampleProposal?: boolean;
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

/** The request a future backend receives: what to make, where it belongs, and the optional preferences. For an
 *  episode or season the show's world, cast, style and continuity are the context. */
export interface AutoIdeaRequest {
  kind: 'SHOW' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO';
  showId?: string;
  seasonId?: string;
  preferences: IdeaPreferences;
}

/** A proposed cast member: an existing character reused (with the reason), or a new one the story needs. */
export interface ProposedCast { key: string; characterId?: string; name: string; role: string; reason: string; isNew: boolean; fromPreference: boolean; sex?: Sex }
export interface ProposedLocation { key: string; locationId?: string; name: string; description: string; isNew: boolean; fromPreference: boolean; kind?: 'INTERIOR' | 'EXTERIOR' }

/** What the automatic workflow returns, for the producer to review and edit before anything is created. In this
 *  prototype every proposal is a labelled sample (`sample: true`): nothing is researched or written. */
export interface IdeaProposal {
  sample: true;
  title: string;
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
  /** A sample assembled cut, when the fixture carries one. */
  cutAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterRef { id: string; role: CharacterRefRole; assetId: string }

export interface Voice {
  pitch: 'LOW' | 'MID' | 'HIGH';
  pace: 'SLOW' | 'MEASURED' | 'QUICK';
  timbre: string;
  notes: string;
  /** Voice lines. A selected voice is the one the character speaks with. `source` says where it came from: a bundled
   *  sample, a recording the producer uploaded (kept in this browser), or a voice the studio will generate — which
   *  has no audio until generation is connected. */
  samples: VoiceSample[];
  selectedSampleId?: string;
}

export interface VoiceSample { id: string; label: string; assetId?: string; source: 'SAMPLE' | 'UPLOADED' | 'GENERATED' }

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
 *  appearance: it stays pending until a generation replaces the portrait, which needs the backend. */
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
  /** Creative notes: free text for the writers, never used to draw the character. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationRef { id: string; role: LocationRefRole; assetId: string; label: string }

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
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  uiLanguage: 'en' | 'ar';
  reducedMotion: boolean;
  defaults: { style: Style; language: Language; dialect: Dialect; aspect: Aspect };
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
