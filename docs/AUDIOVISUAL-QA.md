# Audiovisual QA report

The corrective pass on the generated films: what was wrong in the actual output, how it was reproduced, what caused
it, what changed, and what the evidence is. Status vocabulary, in increasing strength:

- **implemented** — code changed, typecheck and unit tests pass
- **automated test passed** — the behaviour is covered by a test that runs against real services or files
- **real UI test passed** — exercised through the Screening Room UI on a real production
- **exported media reviewed** — the exported file was probed and watched / listened to
- **subjective quality pending review** — a judgement only a listener/viewer can make (dialect authenticity, acting)

| # | Defect | Reproduction | Root cause | Change | Evidence | Status |
|---|---|---|---|---|---|---|
| AV-1 | Music video with two overlapping sounds | "Whispers of the Midnight Bus" first cut (`gen-a27a69af03`): Whisper on the 15–30 s window returns the chorus twice over itself; the saved filter graph mixed `[0:a]volume=1.0` (take audio) with the song at 1.0 | every MiniMax take generated to a stretch of the song sings that stretch natively; the assembly then summed the takes' own sound with the song master | typed mix plan (`buildMixPlan`): in a music video with a song master the takes' `GENERATED_VIDEO_AUDIO` tracks are muted by policy, the song is the only soundtrack from sample 0; each source may appear once (the plan refuses double routing); the plan is kept in the cut's provenance | second cut `gen-f5d5e8f243`: chorus window transcribes as one clean chorus; see the re-export below | implemented · exported media reviewed (first fix); re-export with the typed plan pending |
| AV-2 | Sync drift risk at shot joins | AAC parts concatenated with `-c copy`: 20 parts → audio 22 ms longer than video (priming/padding per part) | per-part AAC encode and demuxer concat | parts carry picture only; every sound is placed at an integer sample offset derived from the shot's frame index (`adelay=…S`, `atrim` by sample); the cut clock is whole frames at 24 fps and whole samples at 48 kHz | ffprobe of the next cut: audio and video durations equal to the frame | implemented |
| AV-3 | Speaking characters' mouths not following their lines; voices not the characters' | S1E1 / Kite Mender: takes speak natively from `<d>` tags in MiniMax's own voice; the recorded dialogue (character voices) was a separate layer only under silent takes | the picture was generated first and sound added later | audio-first takes: the lines are recorded with the characters' canonical voices, checked by transcription, joined with natural gaps, and anchored as the clip's soundtrack through `MiniMaxH3AddGuide` (kept exactly, never denoised), so the mouths are animated to that very audio; the shot runs as long as its words need; the take records each line's exact window; a `soundtrack-kept` QA check transcribes the clip and compares it with the script | experiment pending (GPU busy with the episode run) | implemented |
| AV-4 | Singing performer not following the song | music video takes used the song stretch as *reference* audio (timbre guidance) | reference audio guides timbre, not content/timing | the song stretch is anchored as the clip's soundtrack (guide), so the take's sound is the song itself and the mouth follows the real vocal; the cut mutes it under the master | pending regeneration of the music video's singing shots | implemented |
| AV-5 | Lyric cues shown as whole sections | export `gen-538d893145`: a four-line chorus as one block | section-level cues | one cue per line spread over the section; next: lines placed on the vocal stem by fuzzy monotone alignment of Whisper word timings (`alignLyrics`) | pending re-export | implemented (per-line); alignment implemented, not yet wired |
| AV-6 | Episode cast drifted to another show's characters | episode 1 of "The Sky Above Adhamiya": first develop dropped Amina, added five characters of "The Last Sip" | the develop prompt offered the whole library; scene names resolved against the whole library; a model-supplied wrong id was trusted | episodes are cast from the show's regulars; outside characters only when the episode's brief names them (max two); scene names resolve only against that list (others dropped with a warning); ids are trusted only when the name agrees | fourth develop: Amina, Samir, Salim only | real UI test passed |
| AV-7 | Reclaimed produce run queued duplicate takes | worker restart mid-run: 12 extra GENERATE_TAKE jobs for shots already generating | idempotency key carried the attempt number | a retried/reclaimed run adopts its in-flight children instead of queuing new ones | next restart drill | implemented |

## Experiments (bounded, with measurements)

Filled in as they run; each names the take ids, the prompt/guide configuration, and the measured result.

## Iraqi Arabic pronunciation suite

See `docs/evidence/iraqi-suite.md` once run: the directive's phrases in male and female voices (Habibi-TTS IRQ), each
read back by Whisper large-v3, with word error rate and the heard text. Dialect authenticity is **subjective quality
pending review** by a native listener; the suite proves intelligibility and consistency, not nativeness.
