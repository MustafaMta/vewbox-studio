import type { Aspect, CameraMove, CharacterRefRole, Dialect, Framing, Kind, Language, LocationRefRole, LyricKind, PerformerKind, Sex, Stage, Style, TimeOfDay, Transition, VoiceType } from './vocabulary';
import type { Presentation } from './presentation';

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
  /** Character/location imagery only: canonical identity view, optional secondary material, or raw intermediate
   *  output (docs/CONTRACTS-IDENTITY-PACK.md). Absent on everything else. */
  tier?: AssetTier;
  /** Pictures only: how the image presents itself (docs/DESIGN-SYSTEM-V4.md §2.4), measured from its pixels once
   *  at ingest (src/server/media/presentation.ts). Absent means neutral. */
  presentation?: Presentation;
  /** Pictures only: the display-size JPEG derived beside the original (docs/CONTRACTS-REDESIGN-BACKEND.md B7):
   *  long side ≤ 960 px, ≤ 120 KB for a figure and ≤ 160 KB for a still. `src` is what an <img> loads
   *  (`/api/media/{id}?thumb=1`); absent until made — the page then loads the original. */
  thumb?: AssetThumb;
  createdAt: string;
}

export interface AssetThumb { src: string; /** library path of the derived file, beside the original */ path: string; width: number; height: number; bytes: number }

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
  /** "ESTABLISH HERE" (the Location Bible): the production declares that this scene is the place's first appearance —
   *  its shots may be filmed without a plate, and the first accepted take's opening frame becomes the place's master
   *  plate and an ESTABLISHED frame of the World Bible. Without it a shot in a place that has no plate is refused
   *  (UnestablishedLocationError, src/server/production/location-rule.ts). */
  establishLocation?: boolean;
  /** what this scene changes in the story (see `SceneStory`): events, knowledge, persistent changes, relationships */
  story?: SceneStory;
}

export type TakeStatus = 'READY' | 'REJECTED';

/** What a take was conditioned on. `binding` is how the prompt names it (`<Picture 1>` / `<Subject 1>`, `<Audio 1>`,
 *  or `guide@0` for media anchored on the timeline), so the provenance says which picture was whom. */
export interface TakeReference { kind: 'FIRST_FRAME' | 'LAST_FRAME' | 'SUBJECT' | 'CHARACTER' | 'LOCATION' | 'VIDEO' | 'AUDIO'; assetId?: string; characterId?: string; locationId?: string; note?: string; binding?: string }

/** How a shot joins the one before it, as the take was generated: CONTINUATION (the previous take's tail anchored at
 *  frame 0), CUT (a new opening frame of the same moment), STORY_TRANSITION (fresh). */
export type ShotRelation = 'CONTINUATION' | 'CUT' | 'STORY_TRANSITION';

/** THE SHOT BOUNDARY, as the planner decides it (docs/research/STORYBUILDER-INTEGRATION.md §f.6) — explicit data on
 *  the shot, the source of truth for how its take is conditioned:
 *  - `continuous`: the action carries on without a cut — the previous take's tail (frames and sound) is anchored at
 *    frame 0 and dropped again in the cut; refused when the previous shot has no usable tail;
 *  - `cut`: an editorial cut on the same moment — same cast, same place, same story state, an intentional change of
 *    camera; conditioned on the canonical references (and a drawn opening frame when there is one), never a tail;
 *  - `transition`: a new place or time — the destination's canonical references and the story state at that point;
 *    nothing of the previous shot is anchored.
 *  Maps to `ShotRelation` (continuous → CONTINUATION, cut → CUT, transition → STORY_TRANSITION); a shot without it
 *  falls back to `continuity.relationToPrevious` (older plans). */
export type ShotBoundary = 'continuous' | 'cut' | 'transition';
export const BOUNDARY_RELATION: Record<ShotBoundary, ShotRelation> = { continuous: 'CONTINUATION', cut: 'CUT', transition: 'STORY_TRANSITION' };
export const RELATION_BOUNDARY: Record<ShotRelation, ShotBoundary> = { CONTINUATION: 'continuous', CUT: 'cut', STORY_TRANSITION: 'transition' };

export interface QaCheck { name: string; ok: boolean; value?: number | string; threshold?: number | string; detail?: string }
export interface QaReport { ok: boolean; checks: QaCheck[]; reviewedAt?: string; reviewer?: 'AUTO' | 'HUMAN'; notes?: string }

/** WHAT A TAKE ACTUALLY ENDED WITH (planned vs actual end state, 2026-10-08): per person the pose, what they hold and
 *  their condition at the take's last frame; per prop its state and holder. `observed` is a reading of the picture (a
 *  person's or a model's); `approved` is the producer's — the one the next same-moment shot starts from. */
export interface TakeEndStateRecord {
  characters: Array<{ characterId: string; pose?: string; holding?: string[]; condition?: string }>;
  props?: Array<{ name: string; state?: string; ownerCharacterId?: string }>;
  source: 'PRODUCER' | 'VISION' | 'PLANNED';
  by?: string;
  note?: string;
  at: string;
}
export interface TakeEndState { /** what the shot planned the take to end with, recorded when the take was made (or first chosen) */ planned?: TakeEndStateRecord; observed?: TakeEndStateRecord; approved?: TakeEndStateRecord }

export interface Take {
  id: string;
  label: string;
  assetId: string;
  createdAt: string;
  note?: string;
  /** what the take actually ended with (TakeEndState): the next same-moment shot starts from the approved one */
  endState?: TakeEndState;
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
  /** The relation the take was generated for, and for a CONTINUATION the take whose tail it continues (so a later
   *  change of the previous shot's chosen take can be detected). */
  relation?: ShotRelation;
  continuesTakeId?: string;
  /** THE STALE CHAIN (src/domain/continuation.ts): a continuation take whose predecessor's chosen take is no longer
   *  the one it continued — or continues a take that is itself stale — is marked here by the studio (never by a
   *  page) the moment the choice changes, and cleared when the chain is whole again. The map shows it; PRODUCE
   *  re-conditions exactly these shots; the cut refuses a stale join unless told to allow it. */
  stale?: TakeStale;
  /** The authoritative soundtrack this take was generated to follow (recorded dialogue or the song stretch), with
   *  each line's exact window inside the take: subtitles and the mix use these, never estimates. */
  /** `lines`: where each line is heard in the take (seconds on its clock); `anchoredFrom`/`audioAssetId`: where the
   *  line's recording was anchored as the take's audio guide, and which recording (src/domain/timeline.ts
   *  anchoredLineStarts — the cut plays the authoritative recording there) */
  soundtrack?: { kind: 'DIALOGUE' | 'SONG'; assetId?: string; lines: Array<{ lineId: string; from: number; to: number; anchoredFrom?: number; audioAssetId?: string }> };
  /** THE PRODUCER'S JUDGEMENT (docs/CONTRACTS-REDESIGN-BACKEND.md B5), apart from `status` (the inspectors' and the
   *  older rejectTake's verdict): GOOD or REJECTED with an optional reason, who gave it and when. Written only by
   *  `rateTake`; a REJECTED take is kept (never deleted) and cannot be chosen for the cut. */
  rating?: TakeRating;
  ratingReason?: string;
  ratedBy?: string;
  ratedAt?: string;
  /** A take made FROM another take of the shot by a post-process (src/domain/lipsync-correction.ts): the original is
   *  kept unchanged; this one carries the process, the reason it was asked for and its before/after measurements in
   *  `params.postProcess`. */
  derivedFrom?: { takeId: string; process: 'LIPSYNC_CORRECTION'; jobId?: string };
}

export type TakeRating = 'GOOD' | 'REJECTED';

/** Why a continuation take is stale: the shot before it now chooses `expectedTakeId` (the take whose tail this one
 *  should continue), or that chosen take is itself stale (`because: 'UPSTREAM_STALE'`). */
export interface TakeStale { since: string; because: 'PREDECESSOR_RESELECTED' | 'UPSTREAM_STALE'; previousShotId: string; expectedTakeId?: string; detail: string }

export type ScreenDirection = 'LEFT' | 'RIGHT' | 'TOWARD' | 'AWAY' | 'NEUTRAL';
/** Where a person stands in the frame (third of the picture): the BLOCKING the 180° line keeps across cuts
 *  (src/domain/blocking.ts). Absent: read from the `position` words when they say it, else unknown. */
export type FrameSide = 'LEFT' | 'CENTER' | 'RIGHT';

/** The continuity state of a shot: what must match the shot before and carry into the shot after. Versioned on
 *  the server; the current version travels with the shot. */
export interface ContinuityState {
  version: number;
  /** each person's state in the shot. Beyond where they are and what they hold (the older fields): their physical
   *  condition (wet, injured, out of breath — what must persist), who they are interacting with, the pose they start
   *  and end the shot in (a continuous next shot starts from `endPose`), and the direction they move on screen */
  characters: Array<{ characterId: string; wardrobe?: string; pose?: string; position?: string; frameSide?: FrameSide; screenDirection?: ScreenDirection; eyeline?: string; emotion?: string; holding?: string[]; condition?: string; interactingWith?: string[]; startPose?: string; endPose?: string; motion?: ShotMotion }>;
  props: Array<{ name: string; ownerCharacterId?: string; state?: string; position?: string }>;
  environment: { locationId?: string; timeOfDay?: TimeOfDay; weather?: string; lighting?: string; state?: string };
  /** `crossesLine`: the camera deliberately crosses the 180° line in this shot (or the shot re-stages the people), so
   *  the scene's left/right order and screen directions may flip here — and the new order holds from this shot on */
  camera: { framing?: Framing; move?: CameraMove; lensIntent?: string; angle?: string; crossesLine?: boolean };
  previousShotId?: string;
  nextShotId?: string;
  /** Continuation: the same action continues from the previous shot. Cut: a new framing of the same moment.
   *  Transition: the story moves in place, time or state. */
  relationToPrevious?: 'CONTINUATION' | 'CUT' | 'STORY_TRANSITION';
  notes?: string;
  /** explicit continuity constraints the take must honour ("the cup stays in her right hand", "rain on the window") */
  constraints?: string[];
  /** continuity-log flags the producer accepted as intended for this shot, by key (src/domain/continuity-log.ts) */
  acknowledged?: string[];
}

/** How a person (or the camera's subject) moves across the frame: the screen direction of travel and, in words, the
 *  path ("from the door to the counter"). A continuous next shot keeps the direction (the 180° rule). */
export interface ShotMotion { direction?: 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT' | 'TOWARD_CAMERA' | 'AWAY_FROM_CAMERA' | 'STILL'; path?: string }

/** THE STORY STATE A SCENE CHANGES (cloud directive 2026-10-05 §4 "Story state"), as structured records the studio
 *  keeps — never only in an LLM prompt. Facts take effect at the scene (or at a shot of it, `atShotId`) and hold for
 *  everything after it in story order:
 *  - `events`: what happened (story beats completed);
 *  - `knowledge`: what a character now knows (the planner keeps characters from acting on what they cannot know);
 *  - `changes`: persistent changes to a person, a prop or a place ("Karim's left arm is in a sling", "the window is
 *    broken") — carried into every later shot that shows them until a later change replaces them (same `key`);
 *  - `relationships`: how a relationship stands after the scene. */
export interface StoryFact { id: string; text: string; atShotId?: string; /** SCRIPT: written by the script writer (replaced when the scene is rewritten); absent: the producer's */ source?: 'SCRIPT' }
export interface KnowledgeFact extends StoryFact { characterId: string }
export interface PersistentChange extends StoryFact { /** what it applies to */ subject: { kind: 'CHARACTER'; characterId: string } | { kind: 'PROP'; name: string } | { kind: 'LOCATION'; locationId: string }; /** facts with the same key replace each other (e.g. "arm" healed later) */ key?: string; /** ends a previous change with the same key without a new state */ cleared?: boolean }
export interface RelationshipFact extends StoryFact { characterIds: string[] }
export interface SceneStory { events?: StoryFact[]; knowledge?: KnowledgeFact[]; changes?: PersistentChange[]; relationships?: RelationshipFact[] }

export type PerformanceMode = 'SOLO' | 'DUET' | 'ALTERNATING' | 'ENSEMBLE' | 'LISTENER' | 'INSTRUMENTAL';

/** A line of a shot. `audioAssetId` is its recording in the character's pinned voice; `voiceRevision` says which
 *  identity revision spoke it, so a rebuilt voice makes the recording stale and a take records it again. */
/** `offscreen`: the line is heard while its speaker is not in the picture (a reverse on the listener): the speaker is not
 *  in the shot's cast, never drawn, and the lip-sync check does not look for their mouth (continuity recovery 2026-10-08). */
export interface ShotDialogue { id: string; characterId: string; text: string; textAr?: string; delivery?: string; audioAssetId?: string; durationSeconds?: number; voiceRevision?: number; offscreen?: boolean }

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
  /** How this shot joins the one before it (see `ShotBoundary`); set by the planner, read by the worker and the preflight. */
  boundary?: ShotBoundary;
  /** The staging inside the shot (see `ShotStaging`): timed beats, in-take cuts, pace, point of view, extras. */
  staging?: ShotStaging;
  /** A continuous shot's own continuation choice (overrides the studio's; see `GenerationSettings.continuation`). */
  continuation?: import('./video-capability').ContinuationChoice;
}

/** THE STAGING OF ONE SHOT (docs/research/STORYBUILDER-INTEGRATION.md §d, §f.6–f.7; src/server/story/beats.ts):
 *  - `beats`: the observable actions inside the take, each at its second (from the first new frame), timed by how long
 *    the action takes and tiled over the shot — rendered as `[M:SS]` marks; a beat with `cut` opens a new `[Shot N]`
 *    inside the one generation (an editorial cut with identity carried in one latent; at most two, never near the
 *    ends, never on the hosted engine);
 *  - `pace`: DWELL (one moment, no cuts), NORMAL, MONTAGE (a run of distinct actions);
 *  - `pov`: the character whose eyes the camera is (they are not seen);
 *  - `extras`: unnamed people described as a group, never referenced by a picture (so no extra wears a hero's face);
 *  - `actions`: the discrete visible actions the shot covers (the scene's action coverage). */
export type ShotPace = 'DWELL' | 'NORMAL' | 'MONTAGE';
export interface ShotBeat { at: number; action: string; cut?: { camera: string; locationId?: string } }
export interface ShotExtras { description: string; count?: number }
export interface ShotStaging { beats?: ShotBeat[]; pace?: ShotPace; pov?: string; extras?: ShotExtras[]; actions?: string[] }

export interface LyricSection {
  id: string;
  kind: LyricKind;
  text: string;
  textAr?: string;
  singerIds: string[];
  from: number;
  to: number;
  performanceMode?: PerformanceMode;
  /** Alternating vocals: who sings which line, in order, with timing when known; `role` BACKING for a harmony or
   *  echo line under the lead (sung softly, never the lead's words over them). */
  lines?: Array<{ singerId: string; text: string; from?: number; to?: number; role?: 'LEAD' | 'BACKING' }>;
  /** Backing singers of the whole section (harmonies under `singerIds`, who lead); absent: no backing vocals. */
  backingIds?: string[];
  /** Where each written line is actually sung on the real vocal track (from alignment against the transcribed
   *  vocal stem); cues and shot windows use these instead of an even spread. */
  lineTimes?: Array<{ index: number; from: number; to: number; method: 'ALIGNED' | 'SPREAD'; confidence: number; /** CTC: forced alignment of the known words (asr /align); TRANSCRIPT: the fuzzy match on the Whisper transcript */ source?: 'CTC' | 'TRANSCRIPT' }>;
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
  /** The key the song is in ("D minor"), as the planner wrote it and the song engine reads it. */
  key?: string;
  /** What the song is about and how it feels, in the planner's words. */
  concept?: string;
  provider?: string;
  model?: string;
  requestId?: string;
  stems?: { vocals?: string; instrumental?: string };
  jobId?: string;
  /** The producer's listening verdicts, newest last. Each names the recording it judged, so a later recording is never
   *  taken as accepted. Machine checks are evidence; this is the acceptance. */
  listening?: SongListeningRecord[];
  /** An Iraqi song's contextual dialect review by the planner (hints → review → the edits it made and the words it
   *  kept, and why). Evidence for the producer, whose Iraqi listening decides. */
  dialectReview?: { hints: Array<{ word: string; say: string }>; overall: 'BAGHDADI' | 'MOSTLY_BAGHDADI' | 'DRIFTED' | 'NOT_REVIEWED'; notes: string; changes: Array<{ section: number; from: string; to: string; why: string }>; kept: Array<{ section: number; word: string; why: string }>; at: string };
}

/** "I listened to the whole song": accepted, or not yet right, with what was heard. */
export interface SongListeningRecord { by: 'PRODUCER'; verdict: 'ACCEPTED' | 'NOT_YET'; assetId: string; note?: string; at: string }

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
  /** Auto Idea: the development intent production must keep (tone, audience, hook, ending) — never rewritten by a
   *  later department (src/domain/development.ts). */
  development?: import('./development').DevelopmentIntent;
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
  genre?: string;
  /** Who it is for, in the producer's words (e.g. "Iraqi families", "teens who like anime"). */
  audience?: string;
  /** Free creative direction (the brief stays the producer's own premise). */
  direction?: string;
  /** AUTO: research when Settings allow it; OFF: an explicitly original concept, no research. */
  research?: 'AUTO' | 'OFF';
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
  /** The research and development the proposal rests on (absent on proposals written before the pipeline). */
  development?: import('./development').DevelopmentDossier;
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
  /** The assembled cut, when one has been rendered, and every export made from it. Earlier cuts stay in the
   *  library: `cutVersionsOf` (src/studio/selectors/cuts.ts) lists them in order. */
  cutAssetId?: string;
  /** THE CUT IS OUT OF DATE (docs/BACKEND-AUDIT-2026-10.md M2, step 12): true once something the cut was made from
   *  changed after it was assembled — another take chosen, a take rated or removed, a shot edited, added, removed or
   *  moved, a line re-recorded, the song replaced. PRODUCE assembles again; a page can say "the cut is out of date".
   *  Cleared when a cut assembled from the current inputs is set. Absent: current (or no cut). */
  cutStale?: boolean;
  exports?: ExportRecord[];
  /** The composed frame poster (docs/CONTRACTS-REDESIGN-BACKEND.md B7): a 2:3 crop of the production's best frame,
   *  made when there is no key art (`posterAssetId`); it carries no text — the page renders the title. */
  framePosterAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

/** A SCREENING ROOM NOTE (docs/CONTRACTS-REDESIGN-BACKEND.md B2). Kept apart from the studio state (its own table and
 *  routes under /api/notes), exposed beside the snapshot. Times are seconds into the cut; the pin is 0–1. */
export interface CutNote {
  id: string;
  productionId: string;
  cutAssetId?: string;
  cutVersion?: number;
  timecode: number;
  rangeEnd?: number;
  pin?: { x: number; y: number };
  drawingAssetId?: string;
  text: string;
  author: string;
  status: 'open' | 'resolved';
  /** *Send to shot*: the shot whose notes received this text, and the take that later answered it */
  sentToShotId?: string;
  producedTakeId?: string;
  createdAt: string;
  updatedAt: string;
}

/** THE CANONICAL CHARACTER IMAGE (docs/CONTRACTS-IDENTITY-PACK.md, v2) — one character = ONE canonical front
 *  full-body image + one persistent voice identity. This image is the character's official identity and its primary
 *  image everywhere (cards, lists, detail page, cast displays, pickers, production assignment and shot references).
 *  Nothing else is generated by default. */
export interface CanonicalImage {
  assetId: string;
  /** DRAFT: drawn, waiting for the producer's approval. APPROVED: the official identity. A redraw returns it to DRAFT;
   *  a character used in a video is locked (no redraw at all, enforced on the server). */
  status: 'DRAFT' | 'APPROVED';
  /** +1 on every redraw; recorded on the usage of a take so a shot knows which image it was made with. */
  version: number;
  /** How it was drawn: the job, seed, the uploaded reference picture (Image Reference mode), the engine, and the
   *  fixed English identity line (style first) it was drawn from. */
  jobId?: string; seed?: number; referenceAssetId?: string; engine?: string; identityLine?: string;
  /** Automatic checks that demonstrably work (e.g. full body in frame, style) — absent when none applies. */
  check?: { ok: boolean; notes?: string[] };
  generatedAt: string;
  approvedAt?: string;
  /** Set when the producer approved over a failed check, with the reason they gave. Gone with the next redraw. */
  approvalOverride?: { reason: string; at: string };
}

/** What an asset is to the character system. CANONICAL: the character's canonical image. SECONDARY: optional material
 *  made on request (portrait close-up, expressions, outfits) — never the identity. RAW: intermediate generation output
 *  (rejected candidates, previous versions) — never shown on a profile, kept for provenance, purgeable. */
export type AssetTier = 'CANONICAL' | 'SECONDARY' | 'RAW';

export interface CharacterRef {
  id: string; role: CharacterRefRole; assetId: string; approved?: boolean;
  /** How the picture was made (image agent, wave 2): the view drawn ('SHEET_TILE' for a tile cut from the identity
   *  sheet, else the view name), the asset ids of the references actually given to the model in order (a tile lists
   *  the sheet it was cut from; a derived view lists FRONT tile, face crop, sheet), and the seed used. */
  view?: string; references?: string[]; seed?: number;
}

export type VoiceIdentityMode = 'REFERENCE' | 'AUTOMATIC' | 'MANUAL' | 'DESIGN';
export type VoiceIdentityStatus = 'ACTIVE' | 'REVIEW' | 'STALE';

/** Where a voice comes from (docs/CONTRACTS-VOICE-IDENTITY-V2.md §1). UPLOAD_CONSENTED: a real person's recording with
 *  the producer's consent statement. DESIGNED: a studio-designed synthetic voice (VoxCPM2, from a description only),
 *  its seed file's sha256 matching a design record (Rule V-DESIGN). HOSTED: a MiniMax voice. GENERATED: a line spoken
 *  from a voice — never the origin of an identity, never a clone source. */
export type VoiceOrigin = 'UPLOAD_CONSENTED' | 'DESIGNED' | 'HOSTED' | 'GENERATED';

/** The producer's consent statement for an uploaded or recorded voice (the upload is refused without one). */
export interface VoiceConsent { statement: 'MY_VOICE' | 'SPEAKER_PERMISSION'; by: 'PRODUCER'; at: string }

/** Whether a listener judged the accent or dialect. Only a listener's record (`recordVoiceListening`) moves it to
 *  LISTENER_APPROVED / LISTENER_REJECTED; ASR success never does. English voices are NOT_APPLICABLE. */
export type DialectStatus = 'NOT_APPLICABLE' | 'UNVERIFIED' | 'LISTENER_APPROVED' | 'LISTENER_REJECTED';

/** What was MEASURED on the proof line when the identity was pinned (contract v2 §4): intelligibility (CER and word
 *  coverage against the intended text, Arabic folded), loudness, true peak, clipped samples, and the ECAPA cosine
 *  between the reference the engine heard and the line it spoke. Never a naturalness or dialect claim. */
export interface VoiceEvaluation {
  cer?: number; coverage?: number; lufs?: number; truePeakDbtp?: number; clipped?: number;
  seedToLineSimilarity?: number;
  measuredAt: string;
  asrModel?: string; similarityModel?: string;
}

/** A listener's record ("I listened"): naturalness 1–5 and, for Arabic, whether the accent/dialect is authentic. */
export interface VoiceListeningRecord { by: 'PRODUCER'; natural: number; dialectAuthentic?: boolean; note?: string; at: string }

/** What was measured on one design candidate (its 24 kHz reference) or one preview rendering. */
export interface VoiceDesignMeasure {
  durationSeconds: number;
  cer?: number; coverage?: number; heard?: string; asrModel?: string;
  lufs?: number; truePeakDbtp?: number; clippedSamples?: number;
}

/** One preview sentence spoken by the LINE engine with a candidate as the reference, and ECAPA(seed, rendering). */
export interface VoiceDesignPreview { text: string; assetId?: string; engine: string; cosine?: number; cer?: number; coverage?: number; /** Arabic: letters heard in order, spaces ignored (src/server/media/arabic-align.ts) */ letterCoverage?: number; heard?: string; durationSeconds?: number }

export interface VoiceDesignCandidate {
  /** 1-based, as the design service numbers them (seed = record seed + index − 1). */
  index: number;
  seed: number;
  /** The 24 kHz mono reference the line engines clone from: Rule V-DESIGN pins THIS file's sha256. */
  assetId: string; sha256: string; durationSeconds: number;
  /** VoxCPM2's own 48 kHz output, kept for listening. */
  nativeAssetId?: string; nativeSha256?: string;
  measured: VoiceDesignMeasure;
  /** The contract's candidate gates (CER, loudness, true peak, clipping, ≤ 11.5 s) and why it failed them. */
  gate: { ok: boolean; reasons: string[] };
  previews?: VoiceDesignPreview[];
  /** Mean ECAPA(seed, line-engine rendering) over the preview sentences: what AUTOMATIC ranks EN/MSA on. */
  similarityMean?: number;
  /** Mean letter coverage and CER of the previews: what the Iraqi experiment ranks on (the Iraqi A/B's screening). */
  letterCoverageMean?: number; cerMean?: number;
}

/** A VOICE_DESIGN result (Rule V-DESIGN §1, contract v2 §3): the description, engine and version, the seeds, every
 *  candidate with its file's sha256 and measurements, the ranking, and the candidate pinned. Kept on the character
 *  (`voice.designs`) with every candidate file — the same seed reproduces the voice, not the bytes. */
export interface VoiceDesignRecord {
  id: string;
  characterId: string;
  mode: 'AUTOMATIC' | 'DESIGN';
  engine: string; model: string; engineVersion: string;
  description: string; descriptionSource: 'PROFILE' | 'PRODUCER';
  language: Language; dialect?: Dialect;
  /** Set only by the opt-in experiment: a designed Arabic seed for the Iraqi engine (dialect never verified). */
  experiment?: 'DESIGNED_IRAQI';
  /** The calibration sentence every candidate speaks (also the reference text a Habibi line conditions on). */
  text: string;
  seed: number; seeds: number[]; params: Record<string, number>;
  /** The line engine the candidates were previewed through, and the speaker-similarity model. */
  lineEngine: string; similarityModel?: string;
  /** The line engine's parameters the previews were spoken with; a build from this design pins the same seed and
   *  emotion strength, so the voice pinned is the voice heard. */
  lineParams?: { speed: number; emotionAlpha: number; seed: number };
  candidates: VoiceDesignCandidate[];
  /** Pairwise ECAPA cosine between the candidates (index order). */
  similarity?: number[][];
  /** Candidate indices, best first, and what decided the order. */
  ranking?: number[]; rankedBy?: string;
  /** The candidate an identity was pinned from, and who chose it (written only by `setVoiceIdentity`). */
  chosen?: number; chosenBy?: 'AUTOMATIC' | 'PRODUCER';
  label: string;
  jobId: string;
  createdAt: string;
}

/** The one voice a character speaks with: which engine, which reference recording (always the producer's upload,
 *  never a generated line), the parameters every line is spoken with, and the proof line that was spoken and heard
 *  back before the identity was pinned. Written only by `setVoiceIdentity`, in the same batch as the proof sample. */
export interface VoiceIdentity {
  provider: 'LOCAL_TTS' | 'MINIMAX';
  /** The primary engine (`indextts`, `habibi`, or the hosted model name). Never changed by a per-line fallback. */
  model: string;
  /** The engine Latin-script lines of an Arabic voice are spoken by, from the same reference (an Iraqi voice: MOSS-TTS,
   *  the English engine; earlier identities: IndexTTS); the switch is logged per line. */
  fallbackModel?: 'indextts' | 'moss';
  mode: VoiceIdentityMode;
  /** The UPLOADED sample the voice was cloned from, and its ORIGINAL asset. */
  referenceSampleId?: string;
  referenceAssetId?: string;
  /** The trimmed 24 kHz mono clip actually sent to the engine: its window inside the original and its own asset. */
  referenceWindow?: { from: number; to: number; assetId: string };
  /** What the reference says (stored once; the F5-based engine conditions on it). */
  referenceText?: string;
  providerVoiceId?: string;
  language: Language;
  dialect?: Dialect;
  /** Speech parameters every line uses: speed from the profile's pace, emotion strength, the seed, engine extras. */
  params: { speed: number; emotionAlpha: number; seed?: number; nfe?: number; cfg?: number };
  /** The proof line: a GENERATED sample spoken with this identity and transcribed back. Absent only on identities
   *  written before the proof rule existed; `setVoiceIdentity` refuses an identity without one. */
  proof?: { sampleId: string; assetId: string; text: string; wer?: number; cer?: number; coverage?: number; heard?: string };
  /** ACTIVE: proven. REVIEW: the proof could not be verified (transcription unavailable or drifted). STALE: the
   *  language, dialect or reference changed since the build; rebuild before recording. */
  status: VoiceIdentityStatus;
  engineVersion?: string;
  revision: number;
  createdAt: string;
  /** The VOICE_BUILD job that pinned it. */
  jobId?: string;
  // ---- voice identity v2 (docs/CONTRACTS-VOICE-IDENTITY-V2.md §3); absent on identities pinned before it ----
  /** Where the voice comes from; required for every identity pinned since v2. */
  origin?: VoiceOrigin;
  /** DESIGNED: the design record and the sha256 of the seed file the engine clones from (Rule V-DESIGN). */
  designId?: string; seedSha256?: string;
  /** UPLOAD_CONSENTED (and a hosted clone of an upload): the consent statement of the recording. */
  consent?: VoiceConsent;
  dialectStatus?: DialectStatus;
  evaluation?: VoiceEvaluation;
  /** "I listened" records, newest last; allowed on a locked voice. */
  listening?: VoiceListeningRecord[];
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
  /** Every voice design made for this character (VOICE_DESIGN, or the design step of an AUTOMATIC build). Written only
   *  by the design commands; a whole-form save never touches it. */
  designs?: VoiceDesignRecord[];
}

/** What the upload endpoint measured on a voice reference before accepting it (docs/research/CHARACTER-VOICE-DIAGNOSIS.md §3.2). */
export interface VoiceReferenceValidation {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  integratedLufs: number;
  truePeakDbtp: number;
  speech: { present: boolean; words: number; language: Language | 'UNKNOWN'; transcript: string; confidence: number };
  snrDb?: number;
  music?: boolean;
}

export type VoiceReferenceRefusal = 'TOO_SHORT' | 'TOO_LONG' | 'NO_SPEECH' | 'TOO_QUIET' | 'CLIPPING' | 'WRONG_LANGUAGE' | 'BAD_FORMAT';

export interface VoiceSample {
  id: string;
  label: string;
  /** The ORIGINAL file for an upload; the generated line for a GENERATED sample. */
  assetId?: string;
  source: 'SAMPLE' | 'UPLOADED' | 'GENERATED';
  /** What the recording says: the transcript stored once at upload (or the producer's), or the text a generated line was spoken from. */
  text?: string;
  language?: Language;
  dialect?: Dialect;
  durationSeconds?: number;
  jobId?: string;
  /** For an upload: the producer's consent statement (contract v2 §1). An upload without one is never cloned from in
   *  a new build (`CONSENT_REQUIRED`); `confirmVoiceConsent` records it for a recording uploaded before consent existed. */
  consent?: VoiceConsent;
  /** For an upload: the validation it passed and the trimmed 24 kHz window stored beside it. */
  provenance?: { validation?: VoiceReferenceValidation; trimmedAssetId?: string; window?: { from: number; to: number }; [k: string]: unknown };
}

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
  /** The canonical image version the character had when the take was recorded (absent: no canonical image yet, or
   *  a record from before canonical images existed). */
  canonicalImageVersion?: number;
}

/** Whether this character has ever been in a video. `known: false` means the history is not available (an imported
 *  character, an old record): the interface must then treat the character as used. */
export interface CharacterUsage { known: boolean; videos: VideoUsage[] }

/** What the upload endpoint measured on a reference picture (contract §1.2; computed by the Image agent's check). */
export interface ImageReferenceValidation { ok: boolean; width: number; height: number; sharpness?: number; faces?: number; faceBoxHeight?: number; reasons: string[] }

/** A reference picture uploaded to generate (or regenerate) an unused character's appearance from. It is not the
 *  appearance: it stays pending until a generation replaces the portrait. */
export interface PendingReference { assetId: string; addedAt: string; validation?: ImageReferenceValidation }

/** The written profile of a character as the server accepts it (diagnosis §3.1): validated by zod in commands.ts. */
/** A singer's capability, stored apart from the spoken voice (master plan §3, §10): range, styles and the languages the
 *  character sings in. The authoritative singing identity a song generator is conditioned on joins it in the music
 *  phase; a profile alone never makes a song claim a specific singer. */
export interface SingingProfile { voiceType?: VoiceType; styles: string[]; languages: Language[]; notes?: string }

export interface CharacterProfileInput {
  name: string;
  nameAr?: string;
  role: string;
  /** Actor, Singer, or Actor + Singer; ACTOR when absent. */
  kind?: PerformerKind;
  /** Only for a kind that sings; dropped for an actor. */
  singing?: SingingProfile;
  style: Style;
  sex: Sex;
  species?: string;
  ageYears: number;
  build: string;
  face: string;
  hair: string;
  skin: string;
  eyes: string;
  wardrobe: string;
  personality: string;
  distinguishing: string[];
  language: Language;
  /** Required when the language is Arabic (defaults to the studio's dialect); never set for English. */
  dialect?: Dialect;
  canon?: Character['canon'];
  notes?: string;
}

export interface VoiceProfileInput { pitch: 'LOW' | 'MID' | 'HIGH'; pace: 'SLOW' | 'MEASURED' | 'QUICK'; timbre?: string; notes?: string }

export interface Character {
  id: string;
  name: string;
  nameAr?: string;
  role: string;
  /** What the character performs: spoken parts (ACTOR), songs (SINGER) or both — the same identity either way. */
  kind: PerformerKind;
  /** The singing capability of a SINGER / ACTOR_SINGER, apart from `voice` (spoken); absent for an ACTOR. */
  singing?: SingingProfile;
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
  /** The canonical front full-body image — the official identity and primary image everywhere. Absent until drawn. */
  canonicalImage?: CanonicalImage;
  /** SECONDARY material only (portrait close-up, expressions, outfits), made on request — never the identity. */
  refs: CharacterRef[];
  /** Legacy/optional close-up portrait (SECONDARY). The primary image is `canonicalImage`. */
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

/** THE LOCATION IDENTITY (the Location Bible; src/domain/location.ts). What makes a place itself: its master plate,
 *  its architecture, layout, materials, landmarks, permanent furniture and props, entrances and camera zones — summed
 *  up in one identity line (carried in every prompt that shows the place) and VERSIONED: the version moves on whenever
 *  any of it changes (a redrawn master, a changed layout), so a take records the identity it was filmed against and a
 *  pinned production notices the change (`repinSafety`). The per-lighting plates are additions that never change the
 *  identity. Derived by the reducers on every change; a row without one is identity version 1 of what it holds. */
export interface LocationIdentity { version: number; hash: string; line: string; updatedAt: string }

/** THE PLACE'S LIGHTING RULES (the Location Bible; final directive §11 "lighting rules"; continuity gaps 2026-10-06
 *  item 6): the light design that makes a return to the place look like the same place — where the key light comes
 *  from, the practical lights in the set, the colour palette — and, per time of day, the light the place has then. Part
 *  of the place's canon (its identity version moves when they change); a scene that states its own light wins for that
 *  scene, the rule fills in when nothing is stated. */
export interface LocationLight { key?: string; practicals?: string[]; palette?: string[]; byTime?: Partial<Record<TimeOfDay, string>> }

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
  layout?: { geography?: string; architecture?: string; materials?: string[]; cameraZones?: string[]; entrances?: string[]; spatial?: string; light?: LocationLight };
  /** the canonical identity and its version (see `LocationIdentity`) */
  identity?: LocationIdentity;
  /** THE PLACE'S AMBIENCE BED (the AMBIENCE job, MOSS-SoundEffect v2): the World Bible carries it to every production
   *  at this place, and the cut loops it under the place's run of scenes (src/domain/timeline.ts) */
  ambience?: LocationAmbience;
  createdAt: string;
  updatedAt: string;
}

export interface LocationAmbience {
  assetId: string;
  /** what the bed is, in words (the prompt the engine was given) */
  description: string;
  seconds: number;
  model: string;
  engineVersion?: string;
  seed: number;
  /** integrated loudness and true peak as measured on the stored file */
  lufs?: number;
  truePeakDbtp?: number;
  jobId?: string;
  createdAt: string;
}

export interface GenerationSettings {
  /** MiniMax video model and resolution for new takes. */
  videoModel?: string;
  videoResolution?: string;
  /** Which story engine answers: 'minimax' | 'anthropic' | 'openai-compatible'. Empty means the server default. */
  llmProvider?: string;
  /** Which voice engine new identities use. */
  voiceProvider?: 'LOCAL_TTS' | 'MINIMAX';
  /** The studio's continuation choice inside the engine's capability (src/domain/video-capability.ts): the guide length
   *  (one the engine keeps, e.g. 5, 22 or 39 frames on local H3) and whether the tail's sound is anchored. Absent: the
   *  engine's default. */
  continuation?: import('./video-capability').ContinuationChoice;
  /** THE DERIVED FACE REFERENCE (src/domain/face-reference.ts): beside a character's canonical full-body image, a close
   *  crop of its face — a temporary production reference derived from the canonical image — when the shot frames the
   *  face close and the full-body picture leaves too few face pixels after the engine's reference scaling. AUTO: when
   *  that is so; ON: on every close framing; OFF (the default until the GPU validation G13 promotes it): never. */
  faceReference?: 'AUTO' | 'ON' | 'OFF';
  /** THE OPENING FRAME OF A CLOSE SHOT (acceptance 2026-10-06, G13): a close framing (medium and closer) with no drawn
   *  opening frame gets one drawn by the take before the engine runs — without it H3 opens on the plate's wide view
   *  and pushes in. Default on; false leaves the shot as it is (the preflight still warns). */
  autoOpeningFrame?: boolean;
}

/** Voice settings (docs/CONTRACTS-VOICE-IDENTITY-V2.md §2). */
export interface VoiceSettings {
  /** EXPERIMENT (default off): an Iraqi character without an Iraqi recording may get a designed Arabic seed spoken by
   *  the Iraqi engine — always `dialectStatus: UNVERIFIED` and identity status REVIEW. */
  allowDesignedIraqi?: boolean;
  /** THE PRONUNCIATION DICTIONARY (src/domain/pronunciation.ts): what an engine hears for a word; an entry takes effect
   *  only once a native reviewer approved it */
  pronunciations?: import('./pronunciation').PronunciationEntry[];
}

export interface Settings {
  reducedMotion: boolean;
  defaults: { style: Style; language: Language; dialect: Dialect; aspect: Aspect };
  generation?: GenerationSettings;
  voice?: VoiceSettings;
  /** Trend research for Auto Idea (docs/CONTRACTS-AUTO-IDEA.md). Credentials never live here: they are server
   *  environment variables; this only switches research and individual platforms on or off. */
  research?: ResearchSettings;
  /** THE STUDIO'S TERMS OF USE (src/domain/terms.ts): accepted once per studio, for the version shown; a new version
   *  asks again. Making new work through the pages waits until they are accepted. */
  terms?: { version: string; acceptedAt: string; by?: string };
}

export interface ResearchSettings {
  enabled: boolean;
  /** A platform switched off here is DISABLED in every run's coverage. Absent = on. */
  platforms?: Partial<Record<import('./development').ResearchPlatform, boolean>>;
  /** How long a fetched result is reused before it is fetched again (default per source; 1–168 h). */
  cacheHours?: number;
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

// ------------------------------------------------------------------------------------------------- World Bible
// THE WORLD BIBLE (docs/research/MINIMAX-CONTINUITY.md §4; directive Part 7): the structured, versioned record of a
// show's (or a short's / music video's) world. Revisions are append-only; a production PINS the revision its story was
// approved against and every job reads that pin; a take records the revision it used. Canon (what is always true:
// faces, voices, architecture) is kept apart from state (what is true at a story time: wardrobe of the day, prop
// positions, weather). Pure logic in src/domain/world.ts; storage in src/server/world.

/** Whose world: a show (its episodes inherit it) or one production (a short, a music video, a standalone episode). */
export type WorldScope = { kind: 'SHOW'; showId: string } | { kind: 'PRODUCTION'; productionId: string };

export interface WorldRule { id: string; text: string; scope: 'WORLD' | 'VISUAL' | 'AUDIO' | 'LANGUAGE'; source: 'SHOW_BIBLE' | 'STYLE' | 'PRODUCER' }

/** A garment set a character wears: the profile's own wardrobe is the default; variants are what the shot plan put
 *  them in, first seen in a scene. */
export interface WorldWardrobe { id: string; label: string; description: string; firstSeen?: { productionId: string; sceneId: string } }

export interface WorldCharacter {
  characterId: string;
  name: string;
  /** the canonical front full-body image as pinned: asset, version, status */
  canonical?: { assetId: string; version: number; status: 'DRAFT' | 'APPROVED' };
  /** the voice identity as pinned: revision, engine, status */
  voice?: { revision: number; provider: string; model: string; status: string; language: string; dialect?: string };
  identityLine?: string;
  wardrobe: WorldWardrobe[];
  defaultWardrobeId?: string;
}

export interface WorldRelationship { id: string; text: string; characterIds: string[]; source: 'SHOW_BIBLE' | 'PRODUCER' }

/** MASTER/VIEW/STATE: drawn plates (LOCATION_PLATES). ESTABLISHED: a frame of an approved take — what the audience
 *  has already seen of the place — reused by id when the story returns. */
export type WorldPlateRole = 'MASTER' | 'VIEW' | 'STATE' | 'ESTABLISHED';
export interface WorldPlate {
  assetId: string;
  role: WorldPlateRole;
  label: string;
  timeOfDay?: TimeOfDay;
  /** ESTABLISHED: the framing of the shot it was taken from (the camera setup it stands for) */
  framing?: Framing;
  source: { kind: 'DRAWN'; refId?: string } | { kind: 'FROM_TAKE'; productionId: string; sceneId: string; shotId: string; takeId: string; frame: number; approvalId?: string; approvedAt?: string };
  addedAt: string;
}

export interface WorldLocation {
  locationId: string;
  name: string;
  kind: 'INTERIOR' | 'EXTERIOR';
  /** the canonical identity as pinned (src/domain/location.ts): its version, hash and the line every prompt carries */
  identity: { version: number; hash: string; line: string };
  /** what never changes: architecture, materials, fixed features, layout */
  canon: { description: string; architecture?: string; materials: string[]; fixedFeatures: string[]; geography?: string; spatial?: string; entrances: string[]; zones: string[] };
  lighting: TimeOfDay[];
  /** every plate the place has had in this world, in the order it got them; never swapped once locked */
  plates: WorldPlate[];
  ambience?: { assetId?: string; description?: string };
  /** used in an approved cut: its plates are kept (a redraw adds plates, it never replaces them) */
  locked: boolean;
}

export interface WorldProp { id: string; name: string; ownerCharacterId?: string; fixedAtLocationId?: string; description?: string; last?: { state?: string; position?: string; productionId: string; sceneId: string; shotId: string } }

/** A fact on the story timeline, in story order. A SCENE event names its place, so a later scene there is a return. */
export interface WorldEvent { id: string; order: number; text: string; productionId?: string; sceneId?: string; locationId?: string; timeOfDay?: TimeOfDay; source: 'SHOW_BIBLE' | 'SCENE' | 'PRODUCER' }

/** The state of the world when a scene ends (its last shot's continuity): where people are, what they wear and hold,
 *  where the props are, the light and the weather. The next scene at that place starts from it. */
export interface WorldSceneState {
  id: string;
  productionId: string;
  sceneId: string;
  order: number;
  locationId?: string;
  environment: { timeOfDay?: TimeOfDay; weather?: string; lighting?: string; state?: string };
  characters: Array<{ characterId: string; wardrobe?: string; position?: string; holding?: string[] }>;
  props: Array<{ name: string; state?: string; position?: string; ownerCharacterId?: string }>;
  exitState?: string;
}

/** How the cut treats speech and songs (src/domain/timeline.ts). DIALOGUE — MODEL_VOICE: the take's own (MiniMax)
 *  speech; RECORDED_VOICE: the character's recorded line replaces it in every speaking shot; AUTO: the recorded line
 *  where the take has no sound or its speech check did not pass, the take's speech elsewhere. SONG_BED — a song under a
 *  film's dialogue: its instrumental stem when one exists (no vocals under speech), else the master, ducked. */
export interface WorldAudioPolicy { dialogue: 'AUTO' | 'MODEL_VOICE' | 'RECORDED_VOICE'; songBed: 'INSTRUMENTAL_WHEN_AVAILABLE' | 'MASTER' }

export interface WorldSong { productionId: string; songId: string; title: string; assetId?: string; stems?: { vocals?: string; instrumental?: string } }

/** The resolved World Bible at one revision. */
export interface WorldBible {
  scope: WorldScope;
  title: string;
  rules: WorldRule[];
  styleNotes?: string;
  characters: WorldCharacter[];
  relationships: WorldRelationship[];
  locations: WorldLocation[];
  props: WorldProp[];
  timeline: WorldEvent[];
  states: WorldSceneState[];
  songs: WorldSong[];
  openStorylines: string[];
  audio: WorldAudioPolicy;
  /** What each character has learned, in story order across the scope's productions (Episode N+1 inherits Episode
   *  N's): a character never acts on what they cannot know yet, and never forgets what they learned. */
  knowledge?: WorldKnowledge[];
  /** The persistent changes still in force after every earlier scene (a wound, a broken window, a lamp now fixed): a
   *  later change with the same key replaces an earlier one, a cleared one ends it. */
  changesInForce?: WorldCarriedChange[];
}

export interface WorldKnowledge { id: string; characterId: string; text: string; productionId: string; sceneId: string }
export interface WorldCarriedChange { id: string; subject: PersistentChange['subject']; key?: string; text: string; productionId: string; sceneId: string }

export interface WorldChange { op: 'ADD' | 'UPDATE' | 'REMOVE'; path: string; detail?: string }

export interface WorldRevision {
  id: string;
  scopeKey: string;
  number: number;
  parentId?: string;
  author: { kind: 'AGENT' | 'HUMAN'; id: string };
  reason: string;
  changes: WorldChange[];
  hash: string;
  bible: WorldBible;
  jobId?: string;
  createdAt: string;
}

/** A production's pin: the revision every job of the production reads. Append-only; the latest row is the pin. */
export interface WorldPin { id: string; productionId: string; revisionId: string; revisionNumber: number; scopeKey: string; reason: 'STORY_APPROVAL' | 'SAFE_REPIN'; approvalId?: string; diff: WorldChange[]; by: string; jobId?: string; createdAt: string }

/** What one job read from the bible for one shot (recorded per take). */
export interface WorldRead {
  revisionId: string;
  revisionNumber: number;
  pinned: boolean;
  /** the place as read: the plate chosen (none when the revision has no usable plate — the shot is then refused
   *  unless the scene is marked "establish here") and the identity version the prompt carries */
  location?: { locationId: string; assetId?: string; role?: WorldPlateRole; label?: string; why: string; source?: WorldPlate['source']; alternates: string[]; identityVersion?: number };
  characters: Array<{ characterId: string; pinnedVersion?: number; assetId?: string; currentVersion?: number; usedPinned: boolean }>;
  conflicts: string[];
}
