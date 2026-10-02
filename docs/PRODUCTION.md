# Producing with Vewbox Studio

How a show, a short or a music video goes from nothing to an exported file, what each step does for you, and what
the studio refuses to do.

## The six areas

**Studio** is the company: the Executive Office and eight departments, each with named agents that show what they
have actually run (nothing decorative), the pipeline every production moves along, the live activity feed and the
reliability figures. **Projects** holds every show, short and music video and the three ways to start one.
**Library** is the canonical cast, the places and every file. **Production** shows where each production stands in
the pipeline (from the recorded handoffs), what waits for your decision, and everything the studio is running.
**Screening Room** lists the finished cuts and exports. **Settings** keeps the interface, engines, models and
reliability panels.

Two decisions are yours and block the pipeline until given: **approve the story** (on the Produce tab or in
Production) before any take is generated, and **approve the cut** (on the Final Cut tab) before it is exported.

## Two ways to start

**Auto Idea.** New production → *Create an idea for me*. Optional: a line of your own, a style, a language, a mood,
a length, characters and places that must appear. The story engine writes a proposal: title, logline, premise, genre,
mood, structure (scenes or episodes), cast with reasons, places. You review and edit every field, untick anyone you
don't want, then *Create Project*. For an episode, the show's regulars are offered as returning cast and the engine
proposes a newcomer the episode needs. A written example is always available when you only want to see the shape.

**Manual Brief.** New production → *Write my brief*. A title is enough; a line of premise is better. The project
opens on its Story tab, where *Develop the story* turns the brief into a logline, a synopsis, new characters (full
designs), new places and a scene breakdown with entry/exit states and a running time per scene.

## Story → Script → Storyboard → Production → Final cut

Each production has these tabs. Buttons that start generation show the live phase of their job and a cancel; the
same jobs appear in **Activity** with their log, attempts, errors and a retry.

1. **Story.** Logline and synopsis (editable), scenes with beats and lines. *Write the script* writes beats (what we
   see, present tense) and short lines for every scene, in the production's language: Arabic productions get the
   dialect (Iraqi Baghdadi by default) with an English gloss for review. Existing beats are improved, not thrown away.
2. **Storyboard.** *Plan the shots* turns each scene into 3–10 s shots with framing, camera move, purpose, action, the
   lines that belong to the shot, and a continuity state: who is in frame, wardrobe, pose, position, screen direction,
   eyeline, emotion, props and their owners, light and weather, and whether the shot continues the previous moment,
   cuts within the scene or marks a story transition. Replanning asks first; editing a shot's continuity records a new
   version. Drag shots within a scene; add or delete; open the shot editor for the prompt and the frames.
3. **Production.** For a shot: *Prepare frames* draws an opening (and optionally closing) still from the location
   plate and the character sheets, in the production's visual direction; *Generate* makes a MiniMax H3 take. A
   **speaking shot starts from its sound**: every line is recorded first with the character's canonical voice and
   checked by transcription, the shot is cut to its words, the recording is anchored in the clip as time-positioned
   voice context, and the exact script lines go to MiniMax as its dialogue (its own paraphrases are never used). The
   finished clip is transcribed back: a take that does not say its lines is REJECTED with the `script-spoken` check
   named; a passing take records where each line is actually spoken, and the subtitles use those times. A shot that
   *continues* the previous one (continuity: CONTINUATION) is generated from the previous take's last frames and
   sound, so the picture carries straight on; the cut drops the repeated frames. A take arrives as READY (chosen
   automatically if it is the first clean one) or REJECTED with the failed checks named (duration, size, black frames,
   frozen video, flicker, silence, true peak, script spoken). Regenerate as often as you like: each attempt is a new
   take with full provenance (model, request id, prompt, references, seed, cost, time, QA, workflow version);
   accepted takes are never overwritten. *Produce every shot* queues the whole production; *Re-record speaking shots*
   makes new takes for the speaking shots whose chosen take was never checked against the script, and a passing new
   take becomes the choice.
4. **Final cut.** *Assemble* conforms and joins the chosen takes' pictures frame-exactly, then mixes the sound from a
   **typed mix plan**: every source once, placed to the sample (a take's own sound at unity; recorded lines only
   under takes without sound; in a music video the song master alone, with every take's own singing muted), brought
   to broadcast loudness (EBU R128: −23 LUFS for films, −14 for music videos). The plan is shown under *Sound in
   this cut* with each track's placement, level and the policy that set it. In a music video each performer is
   aligned to the song: the take's lag against the master is measured and that many head frames are dropped, so the
   mouths land on the beat; nothing is stretched. Every cut and export is validated before it is recorded (picture
   and sound lengths within a frame, frame rate, size, timestamps, no black stretches); a failed check fails the job.
   *Export* renders the delivery file at the chosen size with optional burned-in subtitles (one lyric line per cue,
   on the vocal track's real timing). Sample takes cannot be exported; the button says so.

## Characters

A character is one identity across every production: a design (build, face, hair, skin, eyes, distinguishing marks,
wardrobe), a canon (height, accessories, visual restrictions, age presentation, speech), a reference pack
(portrait, front, three-quarter, side, back, full body, expressions, outfit) and a voice.

- *Regenerate appearance* and reference uploads/replacements are available **only while the character has never
  appeared in a generated video**. The moment a take contains them, appearance becomes immutable; the server enforces
  this (a 409 APPEARANCE_LOCKED), not just the interface. Role, personality and notes stay editable. Any history the
  studio cannot account for is treated as used.
- **Voice.** Choose a studio voice or upload a recording (any character, used or not), then *Build the voice*: the
  identity is pinned (engine, reference, revision) and a preview line is spoken and checked by transcription. Iraqi
  Arabic uses the dialect engine; English and Arabic use IndexTTS; a MiniMax voice can be chosen when a key exists.
- In a video take, the character's lines are first recorded with that voice and the recording is anchored in the
  clip as voice context; MiniMax renders the performance itself (it always generates its own speech, in sync with
  the mouths it draws), so the result is checked by transcription and the voice stays close to, not identical with,
  the recording. An Iraqi voice needs an Arabic reference recording; a line that switches into English is spoken by
  the bilingual engine.

## Locations

A location has a description, a kind (interior/exterior), landmarks, props, times of day it is lit for, and a
layout (geography, architecture, materials, camera zones, entrances). *Draw plates* renders the master view and
alternate angles that storyboard frames and takes are built from, so the place looks the same across shots.

## Music videos

A music video has a song (written by Auto Idea, pasted, or uploaded), split into sections with timing. *Generate the
song* produces the track (ACE-Step locally, MiniMax Music where available) and stems. The **performance plan**
assigns each section to its singer or singers (solo, duet, alternating, ensemble, listener, instrumental); only an
assigned performer who is in the shot sings in the picture, and their lines are passed to the video generation for
that section; a listener keeps their lips closed; when nobody on screen is a singer the song continues off camera.
*Assign the singing* first places the written lines on the real vocal track (the vocal stem is transcribed and each
line aligned), so the sections, the shot windows and the lyric cues follow the recording. Each take gets its stretch
of the song as a time-positioned guide, and the cut aligns the performer to the master and keeps the master as the
only soundtrack.

## Languages

Productions are English or Arabic; Arabic productions pick a dialect (Iraqi Baghdadi is the default). The interface
itself switches between English and Arabic in Settings, with right-to-left layout.

## What the studio will not do

- Invent progress. A percentage appears only when an engine reports one; otherwise you see the phase.
- Substitute another video model. Video is MiniMax H3, hosted or local. If neither is available, the job fails with
  the reason and a retry, and nothing pretends to be a take.
- Change a used character's look, even on request through the API.
- Export sample content as if it were yours.

## When something fails

Open Activity. Each job shows its attempt count, the last error in plain words, and its log. Transient failures
(network, a busy engine) retry on their own with growing delays; configuration problems (no key, no weights) fail at
once and say what is missing; moderation refusals from the hosted API are terminal and shown as such. *Retry* re-runs
a failed job; *Regenerate* on a shot makes a new take instead.
