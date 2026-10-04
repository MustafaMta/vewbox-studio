/** THE ENGLISH COPY — temporary. The website is English-only (docs/DESIGN-SYSTEM-V5.md §9): there is no interface
 *  language, no locale and no translation. This module is what is left of the v4 dictionaries: one flat map of the
 *  English strings that pages written before the redesign still look up by key, so they keep compiling until their
 *  page package rewrites them.
 *
 *  Rules (EN-1, 2026-10-03):
 *  - Add no keys. New and rewritten code writes its English inline, in the component.
 *  - A page package deletes the keys of the code it rewrites (and every key that becomes unused):
 *    tests/unit/english-copy.test.ts fails on a key nothing uses and on a key used in the source that is missing here.
 *  - The consolidation package deletes this file once no file imports it.
 *
 *  `T('btn.save')`; `` T.dyn(`stage.${x}`) `` for a key built at runtime (unknown keys become readable words);
 *  `T.f(key, { name })` fills `{name}`; `T.p(key, n)` picks `one|other` by the count and fills `{n}`. */
const COPY = {
  // ---- common --------------------------------------------------------------------------------------------------------
  // stages
  'stage.STORY': 'Story',
  'stage.CAST_AND_WORLD': 'Cast & World',
  'stage.STORYBOARD': 'Storyboard',
  'stage.PRODUCE': 'Produce',
  'stage.FINAL_CUT': 'Final Cut',
  'stage.COMPLETE': 'Complete',

  // kinds
  'kind.EPISODE': 'Episode',
  'kind.SHORT': 'Short',
  'kind.MUSIC_VIDEO': 'Music video',
  'kind.SHOW': 'Show',
  'kind.SEASON': 'Season',

  // styles
  'style.CARTOON': 'Cartoon',
  'style.ANIME': 'Anime',
  'style.REALISTIC': 'Realistic',
  'style.CARTOON.hint': 'Bold shapes, flat colour, exaggerated motion.',
  'style.ANIME.hint': 'Clean line, expressive eyes, painted light.',
  'style.REALISTIC.hint': 'Natural proportions, photographic light.',

  // workspace tabs
  'tab.overview': 'Overview',
  'tab.story': 'Story',
  'tab.storyboard': 'Storyboard',
  'tab.produce': 'Produce',
  'tab.finalCut': 'Final Cut',
  'tab.voice': 'Voice',

  // buttons
  'btn.create': 'Create',
  'btn.save': 'Save',
  'btn.saved': 'Saved',
  'btn.cancel': 'Cancel',
  'btn.discard': 'Discard changes',
  'btn.delete': 'Delete',
  'btn.duplicate': 'Duplicate',
  'btn.edit': 'Edit',
  'btn.done': 'Done',
  'btn.back': 'Back',
  'btn.add': 'Add',
  'btn.remove': 'Remove',
  'btn.open': 'Open',
  'btn.view': 'View',
  'btn.addSeason': 'Add Season',
  'btn.addEpisode': 'Add Episode',
  'btn.addShot': 'Add Shot',
  'btn.addScene': 'Add Scene',
  'btn.addBeat': 'Add beat',
  'btn.addLine': 'Add line',
  'btn.moveUp': 'Move up',
  'btn.moveDown': 'Move down',
  'btn.select': 'Select',
  'btn.selected': 'Selected',
  'btn.createNew': 'Create new',
  'btn.markDone': 'Mark this step done',

  // labels
  'label.title': 'Title',
  'label.titleAr': 'Arabic title',
  'label.logline': 'Logline',
  'label.synopsis': 'Synopsis',
  'label.genre': 'Genre',
  'label.style': 'Visual style',
  'label.language': 'Language',
  'label.dialect': 'Dialect',
  'label.aspect': 'Aspect',
  'label.duration': 'Duration',
  'label.seconds': 'seconds',
  'label.cast': 'Cast',
  'label.locations': 'Locations',
  'label.notes': 'Notes',
  'label.name': 'Name',
  'label.nameAr': 'Arabic name',
  'label.role': 'Role',
  'label.search': 'Search',
  'label.status': 'Status',
  'label.scenes': 'Scenes',
  'label.shots': 'Shots',
  'label.takes': 'Takes',
  'label.frames': 'Frames',
  'label.runtime': 'Runtime',
  'label.target': 'Target',
  'label.updated': 'Updated',
  'label.created': 'Created',
  'label.arc': 'Season arc',
  'label.english': 'English',
  'label.arabic': 'Arabic',
  'label.all': 'All',
  'label.sample': 'Sample',
  'label.sampleContent': 'Sample content',
  'label.timeOfDay': 'Time of day',
  'label.location': 'Location',
  'label.scene': 'Scene',
  'label.shot': 'Shot',
  'label.framing': 'Framing',
  'label.camera': 'Camera',
  'label.transition': 'Begins with',
  'label.dialogue': 'Dialogue',
  'label.purpose': 'Purpose',
  'label.action': 'Action',
  'label.people': 'People in the shot',
  'label.songWindow': 'Song window',
  'label.kind': 'Kind',
  'label.interior': 'Interior',
  'label.exterior': 'Exterior',
  'label.sex': 'Sex',
  'label.age': 'Age',
  'label.build': 'Build',
  'label.face': 'Face',
  'label.hair': 'Hair',
  'label.skin': 'Skin',
  'label.eyes': 'Eyes',
  'label.distinguishing': 'Distinguishing marks',
  'label.wardrobe': 'Wardrobe',
  'label.personality': 'Personality',
  'label.species': 'Species',
  'label.pitch': 'Pitch',
  'label.pace': 'Pace',
  'label.timbre': 'Timbre',
  'label.voiceNotes': 'Performance notes',
  'label.female': 'Female',
  'label.male': 'Male',

  // libraries
  'lib.addShow': 'Add Show',
  'lib.addShort': 'Add Short',
  'lib.addMusicVideo': 'Add Music Video',
  'lib.addCharacter': 'Add Character',
  'lib.addLocation': 'Add Location',
  'lib.voiceSelected': 'voice chosen',
  'lib.noVoice': 'no voice yet',
  'lib.search': 'Search…',
  'lib.noMatches': 'Nothing matches your search.',
  'lib.clearSearch': 'Clear search',
  'lib.sortRecent': 'Recently updated',
  'lib.sortTitle': 'Title',
  'lib.filterStyle': 'Style',
  'lib.filterStage': 'Stage',
  'lib.inheritedFromShow': 'from the show',
  'lib.uploadHint': 'Files you add are checked, stored in the studio library on the server and listed here with their origin.',

  // empty states
  'empty.shows': 'No shows yet.',
  'empty.shows.hint': 'A show holds seasons and episodes that share a cast and a world.',
  'empty.shorts': 'No shorts yet.',
  'empty.shorts.hint': 'A short is one film, from idea to final cut.',
  'empty.musicVideos': 'No music videos yet.',
  'empty.musicVideos.hint': 'A music video starts with its song.',
  'empty.seasons': 'No seasons yet.',
  'empty.shots': 'No shots yet.',
  'empty.shots.hint': 'Add a scene, then plan its shots.',
  'empty.scenes': 'No scenes yet.',
  'empty.takes': 'No takes yet.',
  'empty.dialogue': 'No dialogue in this shot.',
  'empty.cast': 'Nobody in the cast yet.',
  'empty.locationsIn': 'No locations chosen yet.',
  'empty.references': 'No reference views yet.',

  // misc
  'toast.saved': 'Saved.',
  'toast.created': 'Created.',
  'toast.deleted': 'Deleted.',
  'toast.takeSelected': 'Take selected.',
  'misc.notFound': 'Not here',
  'misc.notFound.hint': 'This page does not exist, or the item was deleted.',
  'misc.of': 'of',

  // section tabs
  'tab.seasons': 'Seasons',
  'tab.characters': 'Characters',
  'tab.locations': 'Locations',
  'tab.settings': 'Settings',
  'tab.song': 'Song & Lyrics',
  'tab.performers': 'Performers',
  'tab.visual': 'Visual Story',
  'meta.seasons': 'seasons',
  'meta.season': 'season',
  'meta.episodes': 'episodes',
  'meta.episode': 'episode',
  'meta.artist': 'Artist',
  'meta.noArtist': 'No performer yet',
  // home
  // misc
  'misc.play': 'Play',
  'misc.pause': 'Pause',
  'misc.noArtwork': 'No artwork yet',
  'misc.details': 'Details',
  'meta.progress': 'Progress',
  'lib.castBy': 'No cast yet',
  'btn.addSection': 'Add section',
  'lib.sort': 'Sort',
  'misc.episodeOf': 'Episode',

  // jobs and generation (the real backend)
  // ---- end of design v3 block ----
  'tab.episodes': 'Episodes',
  'tab.showCast': 'Cast',
  'lib.filterLanguage': 'Language',
  'lib.filterGenre': 'Genre',
  // ---- kit -----------------------------------------------------------------------------------------------------------
  // library views and metadata
  'view.grid': 'Grid',
  'view.list': 'List',
  // ---- design v3: kit, Studio Company, department and agent pages (docs/DESIGN-SYSTEM-V3.md §6, §9.1–9.3) ----

  // job progress: the worker's real phases, in words
  'jp.QUEUED': 'Queued',
  'jp.PREPARING': 'Preparing',
  'jp.GENERATING': 'Generating',
  'jp.VALIDATING': 'Checking the result',
  'jp.POSTPROCESSING': 'Saving',
  'jp.phases': 'Phases',
  'jp.elapsed': 'Elapsed',
  'jp.step': 'step',
  'jp.done': 'done',
  'jp.failed': 'failed',
  'jp.skipped': 'skipped',
  // the phases character and voice jobs report (progress.phase), read as `jp.${phase}` (finding 14)
  'jp.preparing': 'Preparing',
  'jp.recovering': 'Recovering',
  'jp.design': 'Designing',
  'jp.designing': 'Designing',
  'jp.appearance': 'Drawing the portrait',
  'jp.voice': 'Building the voice',
  'jp.drawing': 'Drawing',
  'jp.cloning': 'Cloning the voice',
  'jp.speaking': 'Speaking',
  'jp.recording': 'Recording',
  'jp.retry scheduled': 'Retry scheduled',
  'jp.awaiting review': 'Awaiting review',
  'jp.cancelled': 'Cancelled',
  // error codes → plain copy and the one recovery action
  'err.unknown': 'The step failed.',
  'err.UNAVAILABLE': 'The engine is not reachable.',
  'err.UNAVAILABLE.hint': 'The studio could not reach the service that does this step.',
  'err.UNAVAILABLE.fix': 'Start the engine, then retry',
  'err.NOT_CONFIGURED': 'The model is not set up.',
  'err.NOT_CONFIGURED.hint': 'A model or a key this step needs is missing.',
  'err.NOT_CONFIGURED.fix': 'Download the model (Settings → Engines)',
  'err.PROVIDER': 'The engine returned nothing usable.',
  'err.PROVIDER.hint': 'It ran, but what came back did not pass the checks.',
  'err.PROVIDER.fix': 'Try again',
  'err.INVALID': 'Something in the request is not valid.',
  'err.INVALID.hint': 'Check the fields the message names.',
  'err.INVALID.fix': 'Check the fields',
  'err.CONSENT_REQUIRED': 'A consent choice is needed for this recording.',
  'err.CONSENT_REQUIRED.hint': 'Say whether it is your own voice or you have the speaker’s permission; a voice is only made from a recording with consent.',
  'err.CONSENT_REQUIRED.fix': 'Choose consent',
  'err.ASSET_PROTECTED': 'This file is kept for continuity.',
  'err.ASSET_PROTECTED.hint': 'A character who has been in a video rests on it, so it cannot be removed.',
  'err.MISSING_REFERENCE': 'No usable reference.',
  'err.MISSING_REFERENCE.hint': 'This step needs a reference you add yourself: a picture for the look, a recording for the voice.',
  'err.MISSING_REFERENCE.fix': 'Add a reference',
  'err.LOCKED': 'Preserved for continuity.',
  'err.LOCKED.hint': 'This character has been in a video; the look and voice they appeared with are kept.',
  'err.LOCKED.fix': 'See where it was used',
  'err.CONFLICT': 'Already running.',
  'err.CONFLICT.hint': 'The same step is running for this item.',
  'err.CONFLICT.fix': 'Open the job',
  'err.NOT_FOUND': 'The record is gone.',
  'err.NOT_FOUND.hint': 'What this step needed was deleted in the meantime.',
  'err.NOT_FOUND.fix': 'Go back',
  'err.CANCELLED': 'Cancelled.',
  'err.CANCELLED.hint': 'You stopped it; what was finished is kept.',
  // image preview

  // ---- design v4 (F2): the interface kit (docs/DESIGN-SYSTEM-V4.md §5.2, §5.10–5.11, §5.15–5.19) ------------------
  // status (§5.10)
  'kit.identity.lockedIn': 'Locked · in {n} video|Locked · in {n} videos',
  'kit.stage.STORY': 'Story',
  'kit.stage.CAST_AND_WORLD': 'Cast & world',
  'kit.stage.STORYBOARD': 'Storyboard',
  'kit.stage.PRODUCE': 'Producing',
  'kit.stage.FINAL_CUT': 'Final cut',
  'kit.stage.COMPLETE': 'Finished',
  // in-page navigation (§5.11)
  // overlays (§5.17)
  // forms (§5.18)
  'kit.rec.mine': 'This is my voice',
  'kit.rec.permission': 'I have the speaker’s permission',
  // approval card (§5.15)
  // creation flows (§5.19)

  // ---- /kit, the specimen page (development only) ---------------------------------------------------------------
  // ---- media ---------------------------------------------------------------------------------------------------------
  // players
  'player.noTake.hint': 'A take appears here once one exists. Generate one from the shot, or upload a clip.',

  // ---- v4 (F3): frames and title cards (§5.4) ----------------------------------------------------------------

  // ---- tiles, rail, cast (§5.5–5.8) ----------------------------------------------------------------------------

  // ---- episodes (§5.7) -------------------------------------------------------------------------------------------
  'media.season.episodes': '{n} episode|{n} episodes',

  // ---- heroes (§5.3) ---------------------------------------------------------------------------------------------

  // ---- the player family (§5.12) ---------------------------------------------------------------------------------

  // ---- music (§5.13) ---------------------------------------------------------------------------------------------
  'media.count.sections': '{n} section|{n} sections',
  'media.count.shots': '{n} shot|{n} shots',

  // ---- timeline (§5.14) ------------------------------------------------------------------------------------------

  // ---- cutting-room kit (§5.20) ---------------------------------------------------------------------------------

  // ---- the specimen sections of the dev-only /kit page (components/media/Specimens.tsx) ------------------------

  // ---- production menu (ProductionTile) --------------------------------------------------------------------------
  'media.delete.title': 'Delete “{title}”?',
  'media.delete.body': 'Its story, shots and takes go with it. Characters, locations and files stay in the studio.',
  // ---- shell ---------------------------------------------------------------------------------------------------------
  // navigation
  'nav.shows': 'Shows',
  'nav.shorts': 'Shorts',
  'nav.musicVideos': 'Music Videos',
  'nav.more': 'More',

  // home
  'home.continue': 'Continue working',
  // the restored shell
  'home.inProduction': 'In production',

  // the six areas and the studio organisation
  // navigation and the production page

  // ---- v4: page titles (§7.3; src/components/shell/titles.ts) ----

  // ---- v4: the shell (§5.1, §7.1) ----
  // SaveState (audit D1): what the store's queue says, never assumed
  // the connection (the event stream) and what the studio is running, from the job list
  // ServerBar: only when the event stream has really dropped
  // the error and loading states of every page
  'shell.error.title': 'This page stopped working.',
  'shell.error.hint': 'What the studio holds is not affected. Try the page again; the details below say what broke.',
  'shell.error.retry': 'Try again',
  'shell.error.details': 'Details',
  'shell.error.home': 'Go to Home',

  // ---- v4: the command palette (§5.17, §7.6) ----
  'shell.palette.group.recent': 'Recent',
  'shell.palette.group.goto': 'Go to',
  'shell.palette.group.create': 'Create',
  'shell.palette.group.decide': 'Decide',
  'shell.palette.group.settings': 'Settings',
  'shell.palette.count': '{n} result|{n} results',
  'shell.palette.new.show': 'New show',
  'shell.palette.new.season': 'New season',
  'shell.palette.new.episode': 'New episode',
  'shell.palette.new.short': 'New short',
  'shell.palette.new.musicVideo': 'New music video',
  'shell.palette.propose': 'Let the studio propose',
  'shell.palette.write': 'Write it yourself',
  'shell.palette.decide.stage': '{stage} of {title}',
  'shell.palette.decide.image': 'Picture of {name}',
  // B8: the other kinds of decision (docs/CONTRACTS-REDESIGN-BACKEND.md)
  'shell.palette.decide.line': '1 line to hear again in {title}',
  'shell.palette.decide.lines': '{n} lines to hear again in {title}',
  'shell.palette.decide.take': 'Take to review in {title}',
  'shell.palette.decide.pass': 'Production pass of {title}',
  'shell.palette.motionOn': 'Reduce motion: On',
  'shell.palette.motionOff': 'Reduce motion: Off',
  'shell.palette.keysOn': 'Single-key shortcuts: On',
  'shell.palette.keysOff': 'Single-key shortcuts: Off',

  // ---- v4: the shortcut sheet (§5.17, §7.5) ----
  'shell.keys.global': 'Global',
  'shell.keys.global.hint': 'Anywhere, except while typing in a field.',
  'shell.keys.player': 'Player',
  'shell.keys.player.hint': 'While a player has focus.',
  'shell.keys.storyboard': 'Storyboard',
  'shell.keys.storyboard.hint': 'While the film strip or the board has focus.',
  'shell.keys.timeline': 'Timeline',
  'shell.keys.timeline.hint': 'In the cutting room’s timeline.',
  'shell.keys.palette': 'Open the command palette',
  'shell.keys.sheet': 'Show these shortcuts',
  'shell.keys.collapse': 'Collapse or expand the navigation',
  'shell.keys.focus': 'Focus mode, in the cutting room',
  'shell.keys.esc': 'Close the innermost layer',
  'shell.keys.play': 'Play or pause',
  'shell.keys.jump': '5 seconds back or forward',
  'shell.keys.frame': 'One frame back or forward',
  'shell.keys.second': 'One second back or forward',
  'shell.keys.ends': 'Go to the start or the end',
  'shell.keys.mute': 'Mute or unmute',
  'shell.keys.captions': 'Captions on or off',
  'shell.keys.fullscreen': 'Full screen',
  'shell.keys.marks': 'Mark in or out, in the cutting room',
  'shell.keys.compare': 'Show A or B while comparing',
  'shell.keys.frames': 'Move between frames',
  'shell.keys.reorder': 'Move the shot earlier or later',
  'shell.keys.range': 'Select a run of clips',
  'shell.keys.toggleClip': 'Add a clip to the selection, or take it out',
  'shell.keys.zoom': 'Zoom the timeline',
  // ---- shows ---------------------------------------------------------------------------------------------------------
  // wizard
  'wizard.optional': 'optional',
  'wizard.newShow': 'New Show',
  'wizard.newEpisode': 'New Episode',
  'wizard.newShort': 'New Short',
  'wizard.newMusicVideo': 'New Music Video',
  'wizard.song': 'The song',
  'wizard.generateSong': 'Generate Song',
  'wizard.uploadSong': 'Upload Song',
  'wizard.songCaption': 'Describe the song',
  'wizard.songCaption.help': 'Genre, mood, tempo, instruments, voice.',
  'wizard.lyrics': 'Lyrics',
  'wizard.lyrics.help': 'Leave a blank line between sections. Start a section with [verse], [chorus], [bridge], [intro] or [outro] to name it.',
  'wizard.createdSong': 'The song is saved with the project. Generate the recording from the Story tab once the project exists.',
  // show workspace
  'show.selectSeason': 'Season',
  'show.firstSeason': 'This show has no seasons yet. Add the first season, then its first episode.',
  'show.noEpisodes': 'No episodes in this season yet.',
  'show.settings.hint': 'The show’s details. Episodes inherit the look, language and aspect unless they set their own.',
  'show.canonHint': 'Characters here belong to the show and appear in every episode’s cast.',
  'show.worldHint': 'Locations here belong to the show and are offered to every episode.',
  'show.backTo': 'Back to',
  'show.deleteShow': 'Delete show',
  'show.delete.hint': 'This removes the show, its seasons and every episode. Characters and locations stay in the library.',
  // creation steps
  'wizard.concept': 'Treatment',
  'show.overallProgress': 'Overall progress',
  'show.styleFormat': 'Style & format',
  'show.world': 'World',
  'show.episodeLength': 'Episode length',
  'show.noWorld': 'No locations chosen yet.',
  // Auto Idea
  // Manual brief
  'bible.title': 'World Bible',
  'bible.hint': 'The durable facts of this world. The story engine reads them for every episode; the cast (locked looks, voices) and the places (plates, layouts) are linked from the library.',
  'bible.rules': 'Rules of the world',
  'bible.rules.hint': 'One per line: what is always true here (the rooftop faces the river; nobody owns a car).',
  'bible.relationships': 'Relationships',
  'bible.relationships.hint': 'One per line: who is what to whom.',
  'bible.timeline': 'What has happened',
  'bible.timeline.hint': 'One per line, in order: the events later episodes must respect.',
  'bible.style': 'Art direction',
  'bible.style.hint': 'Light, palette, recurring motifs.',
  'wizard.newSeason': 'New Season',
  'bible.unresolved': 'Open storylines',
  'bible.unresolved.hint': 'What the finished episodes left open; the next episode or season picks them up. The Continuity Writer adds to this after every cut.',
  'show.allEpisodes': 'Every episode of the show, newest season first.',
  'show.preview': 'Preview',
  'show.preview.hint': 'The latest finished cut of an episode.',
  // ---- film ----------------------------------------------------------------------------------------------------------
  // D23: what the script writer and the shot planner read, editable by the producer
  'film.scene.purpose': 'What the scene is for',
  'film.scene.purposeHelp': 'The script and the shot plan are written from this. Correct it before writing the script.',
  'film.brief.promiseHelp': 'The story’s promise: how it opens and how it ends. Every later step of the story keeps to it.',
  'film.brief.hook': 'The opening',
  'film.brief.ending': 'The ending',
  // next steps
  'next.writeStory': 'Write the story',
  'next.chooseCast': 'Choose the cast',
  'next.writeScript': 'Write the script',
  'next.planShots': 'Plan the shots',
  'next.chooseTakes': 'Choose takes',
  'next.reviewCut': 'Review the cut',
  'produce.sampleNote': 'The takes here are sample clips. Generate makes real ones; they cannot be exported as yours.',

  // story
  'story.brief': 'The brief',
  'story.script': 'Script',
  'story.lines': 'lines',
  'story.present': 'Present',
  'story.autoIdea': 'Started from Auto Idea',
  'story.autoIdea.example': 'Started from Auto Idea (the written example)',
  'story.manual': 'Started from your brief',
  'story.writeHint': 'Write the story in your own words, or let "Develop the story" draft it from the brief; every edit is yours.',

  // storyboard
  'board.shotsIn': 'shots',
  'board.noFrame': 'No opening frame',
  'board.dragHint': 'Drag shots to reorder within a scene.',
  'board.editShot': 'Edit shot',
  'board.planned': 'planned',
  'board.framed': 'framed',
  'board.filmed': 'with takes',
  'board.chosen': 'chosen',

  // produce
  'produce.lead': 'Frames and takes for every shot. Choose the take that goes into the cut.',
  'produce.selectedTake': 'Selected take',
  'produce.chooseTake': 'Choose a take',
  'produce.noTakes': 'No takes yet for this shot.',
  'produce.opening': 'Opening frame',
  'produce.ending': 'Ending frame',
  'produce.shotsReady': 'shots with a chosen take',

  // final cut
  'final.assembled': 'Assembled cut',
  'final.sampleCut': 'Sample cut',
  'final.noCut': 'No assembled cut yet.',
  'final.mix': 'Sound in this cut',
  'final.mix.hint': 'Every sound the cut was mixed from, where it sits and why it has that level. Each source appears once.',
  'final.mix.muted': 'take soundtrack(s) muted under the song master.',
  'final.sequence': 'Sequence',
  'final.export': 'Export',
  'final.missing': 'shots still need a chosen take',
  'final.sound': 'Sound',
  'final.dialogueTrack': 'Dialogue',
  'final.musicTrack': 'Music',
  'final.ambienceTrack': 'Ambience',

  // shot editor
  'shot.whatHappens': 'What happens',
  'shot.references': 'References',
  'shot.advanced': 'Advanced',
  'shot.opening': 'Opening frame',
  'shot.ending': 'Ending frame',
  'shot.previous': 'Previous shot',
  'shot.nextShot': 'Next shot',
  'shot.backToBoard': 'Back to storyboard',
  'shot.unsaved': 'Unsaved changes',
  'shot.leave': 'You have unsaved changes. Leave anyway?',
  'shot.deleteConfirm': 'Delete this shot and its takes?',
  'gen.writeStory': 'Develop the story',
  'gen.writeStory.hint': 'From the brief: logline, synopsis, new characters and places, and the scene breakdown.',
  'gen.writeScript': 'Write the script',
  'gen.planShots': 'Plan the shots',
  'gen.replanShots': 'Replan the shots',
  'gen.replanConfirm': 'This scene already has takes. Replanning replaces its shots and their takes stay only in the library. Continue?',
  'gen.frames': 'Prepare frames',
  'gen.take': 'Generate video',
  'gen.anotherTake': 'Another take',
  'gen.produceAll': 'Produce every shot',
  'gen.produceAll.hint': 'Draws missing frames, generates a take for each shot without one, then assembles the cut.',
  'gen.assemble': 'Assemble the cut',
  'gen.export': 'Export',
  'gen.dialogue': 'Record the dialogue',
  'gen.dialogue.hint': 'Speaks every line with its character’s studio voice and checks each one by transcription. The cut uses these recordings for takes without their own sound (uploaded clips); MiniMax takes speak natively.', // v4-lint: allow engine — pre-existing copy that names an engine; the page package that rewrites this page writes it engine-free (Produce)
  'produce.linesVoiced': 'lines recorded',
  'gen.song': 'Generate the song',
  'gen.respeak': 'Re-record speaking shots',
  'gen.respeak.hint': 'New takes for the speaking shots whose chosen take was never checked against the script: each line is recorded first with the character’s voice, the shot is cut to its words, and the clip is transcribed back; a passing take becomes the choice.',
  'gen.performance': 'Assign the singing',
  'gen.performance.hint': 'Decides who sings each section (solo, duet, alternating, instrumental) from the lyrics and the story, and copies it onto the planned shots. Only the assigned performer sings in a shot.',
  'gen.rejectTake': 'Reject',
  'gen.rejectReason': 'Why is this take rejected?',
  'gen.rejected': 'Rejected',
  'gen.qaFailed': 'Automatic checks failed',
  'gen.qaPassed': 'Checks passed',
  'gen.provenance': 'How it was made',
  'gen.model': 'Model',
  'gen.request': 'Request',
  'gen.prompt': 'Prompt',
  'gen.cost': 'Cost',
  'gen.time': 'Generation time',
  'gen.editPrompt': 'Prompt for this shot',
  'gen.editPrompt.hint': 'Written by the studio from the shot; edit it and the next take uses your words.',
  'final.measured': 'Measured loudness of the cut',
  'final.target': 'Loudness target',
  'final.truePeak': 'true peak',
  'final.mixTargets': 'mix: dialogue 0 dB, music −14 dB, ambience −12 dB',
  'take.upload': 'Upload a clip',
  'take.upload.hint': 'A video file becomes a take of this shot (MP4, MOV or WebM). The people in the shot count as having appeared in a video.',
  'take.uploaded': 'Clip added as a take.',
  'final.exportsTitle': 'Exports',
  'final.download': 'Download',
  'final.subtitles': 'Subtitles',
  'final.exportStarted': 'Export started. The file appears here when it is ready.',
  'final.realCut': 'Assembled from the chosen takes',
  'final.needsRealTakes': 'Some chosen takes are sample clips. Generate real takes first.',
  'gate.story': 'The story needs your approval before production starts',
  'gate.story.hint': 'Read the scenes and the script; approve when they are what you want made. Nothing is generated before that.',
  'gate.cut': 'The cut needs your approval before it is exported',
  'gate.cut.hint': 'Watch the assembled cut; approve it to unlock the export.',
  'gate.approved': 'Approved',
  'gate.by': 'by',
  'gate.changesRequested': 'Changes were requested',
  // ---- music ---------------------------------------------------------------------------------------------------------
  // songs
  'song.title': 'Song',
  'song.generated': 'Generated song',
  'song.notRecorded': 'Not recorded yet',
  'song.uploaded': 'Uploaded track',
  'song.sections': 'Sections',
  'song.lyrics': 'Lyrics',
  'song.noSong': 'No song yet.',
  'song.replace': 'Replace song',
  // music video workspace
  'mv.lyrics.hint': 'Write the lyrics as sections. Select a section to set who sings it and when.',
  'mv.sectionTiming': 'Timing',
  'mv.sectionSingers': 'Sung by',
  'mv.from': 'From',
  'mv.to': 'To',
  'mv.noSection': 'Select a section to see who sings it and when.',
  'mv.performers.hint': 'Who sings and how they sound. Each performer’s voice is chosen on their character page.',
  'mv.addPerformer': 'Add performer',
  'mv.lead': 'Lead',
  'mv.sections': 'sections',
  'mv.visual.hint': 'How the song is seen: the performer on camera, a story under the song, or both.',
  'mv.concept.PERFORMANCE': 'Performance',
  'mv.concept.PERFORMANCE.hint': 'The singer on camera, in the location, for the whole song.',
  'mv.concept.NARRATIVE': 'Narrative',
  'mv.concept.NARRATIVE.hint': 'A story told under the song; the singer may never appear.',
  'mv.concept.MIXED': 'Mixed',
  'mv.concept.MIXED.hint': 'Performance cut with story; the chorus returns to the singer.',
  'mv.waveform': 'Waveform, from the audio file',
  'mv.noAudio': 'No audio yet. The song plays once a track exists.',
  'mv.nowPlaying': 'Now playing',
  'song.noWordsYet': 'No words yet — select to write them.',
  'mv.waveformUnavailable': 'The waveform could not be drawn from this file.',
  // ---- cast ----------------------------------------------------------------------------------------------------------
  // later — where generation would happen

  // characters & locations
  // characters & locations
  'char.voiceIdentity': 'Voice identity',
  // voice
  // characters: usage and the continuity rule
  'char.lock.short': 'Preserved: used in a video.',
  'char.lock.title': 'Appearance preserved',
  'char.lock.formHint': 'This character has been in a video, so the fields that describe how they look are kept as they are.',
  // character creation — one page, three starts
  'char.look.fromReference': 'from the reference picture',
  'char.create.recordOnly': 'Create',
  'char.create.andDraw': 'Create and draw',
  // the sheet
  'char.form.identity': 'Identity',
  'char.form.look': 'Look',
  'char.form.needName': 'give them a name',
  'char.form.nameArHint': 'used by the Arabic voice',
  'char.form.roleHelp': 'One sentence: who they are in the story.',
  'char.form.rolePh': 'Café owner, sixty, unhurried',
  'char.form.personalityHelp': 'How they think and speak. Casting writes it when blank.',
  'char.form.speciesHelp': 'Leave blank for a person.',
  'char.form.speciesPh': 'cat',
  'char.form.lookHint': 'Every field is optional: what you leave blank, Casting decides and you can change later.',
  'char.form.voiceHint': 'How the voice should feel. The voice itself is made later on the profile’s Voice tab: designed from these words, or built from a recording you have permission to use.',
  'char.form.distinguishingHelp': 'Separate with commas: a scar, a limp, round glasses.',
  'char.form.timbrePh': 'Gravelly, warm',
  'char.form.exactAge': 'Exact age',
  'char.form.age.child': 'Child',
  'char.form.age.teen': 'Teen',
  'char.form.age.adult': 'Adult',
  'char.form.age.older': 'Older',
  'char.form.preview': 'Sheet preview',
  'char.form.unnamed': 'Unnamed',
  'char.form.previewNote': 'The words as type. The look is drawn after saving.',
  'voice.pitch.LOW': 'Low',
  'voice.pitch.MID': 'Mid',
  'voice.pitch.HIGH': 'High',
  'voice.pace.SLOW': 'Slow',
  'voice.pace.MEASURED': 'Measured',
  'voice.pace.QUICK': 'Quick',
  // the directory and the profile
  // ---- characters v3: the canonical image, the cast profile, the voice identity, creation (CONTRACTS-IDENTITY-PACK.md v2; DESIGN-SYSTEM-V3 §9.4–9.7) ----
  'cast.status.draft': 'Draft',
  'cast.status.approved': 'Approved',
  'cast.status.locked': 'Locked',
  'cast.status.none': 'No image yet',
  'cast.status.legacy': 'Older portrait',
  'cast.status.legacyLong': 'Older portrait — no canonical image yet',
  'cast.status.draftLong': 'Draft — awaiting your approval',
  'cast.status.approvedLong': 'Approved',
  'cast.status.lockedUsed': 'Locked: used in {n} videos',
  'cast.status.lockedUsedOne': 'Locked: used in 1 video',
  'cast.status.lockedUnknown': 'Locked: video history not on record',
  'cast.status.noneLong': 'No image yet',
  'cast.start.describe': 'Describe them',
  'cast.start.describe.hint': 'A line is enough; Casting does the rest.',
  'cast.start.sheet': 'Write the sheet',
  'cast.start.sheet.hint': 'You fill it in; the image is drawn when you ask.',
  'cast.start.picture': 'From a picture',
  'cast.start.picture.hint': 'The studio draws them to match your reference.',
  'cast.voice.consentFor': '“{label}” has no consent statement. Whose voice is it?',
  // ---- end of characters v3 block ----
  // voice tab
  // ---- studio --------------------------------------------------------------------------------------------------------

  // settings
  'jobs.queued': 'Queued',
  'jobs.inProgress': 'In progress',
  // counted phrases: `one|other` (T.p); {n} is the count
  'studio.approve': 'Approve',
  'studio.requestChanges': 'Request changes',
  'screening.title': 'Screening Room',
  'screening.lead': 'Finished cuts and exports, ready to watch.',
  'screening.empty': 'Nothing to screen yet.',
  'screening.empty.hint': 'A production appears here once its cut is assembled.',
  'screening.cut': 'Assembled cut',
  'pipeline.STORY': 'Story',
  'pipeline.CAST_WORLD': 'Cast & world',
  'pipeline.SCRIPT': 'Script',
  'pipeline.STORYBOARD': 'Storyboard',
  'pipeline.SHOT_PLAN': 'Shot plan',
  'pipeline.AUDIO_PREP': 'Audio preparation',
  'pipeline.VIDEO': 'Video generation',
  'pipeline.QA': 'Quality assurance',
  'pipeline.EDIT': 'Edit',
  'pipeline.EXPORT': 'Export',
} as const;

export type Key = keyof typeof COPY;
export const KEYS = Object.keys(COPY) as Key[];

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
/** A counted phrase is `one|other`; a string without `|` is used for every count. */
const plural = (s: string, n: number) => { const i = s.indexOf('|'); return i < 0 ? s : n === 1 ? s.slice(0, i) : s.slice(i + 1); };
/** An unknown dynamic key becomes readable words: `stage.FINAL_CUT` → "Final cut". */
const words = (key: string) => key.split('.').pop()!.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** The English string of a key. */
export const T = Object.assign((key: Key): string => COPY[key], {
  dyn: (key: string, fallback?: string): string => (COPY as Record<string, string>)[key] ?? fallback ?? words(key),
  f: (key: Key, vars: Record<string, string | number>): string => fill(COPY[key], vars),
  p: (key: Key, n: number, vars: Record<string, string | number> = {}): string => fill(plural(COPY[key], n), { n, ...vars }),
});
export type TFn = typeof T;
