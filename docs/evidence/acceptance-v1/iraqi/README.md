# Iraqi voice material — DEFERRED PHASE, pending native Baghdadi review

Status: **pending native review / deferred phase**. Nothing here is verified Iraqi. The producer made English the
reference language of the acceptance phase on 2026-10-05; Iraqi Arabic becomes its own final quality phase.

- Character: Abu Haidar (`char-3a54ed1937`, AR / IRAQI_BAGHDADI).
- Voice: **designed, synthetic** (VoxCPM2 seed, cloned by Habibi IRQ), made through the profile's Automatic button with
  the studio's experiment switch `settings.voice.allowDesignedIraqi` turned on for this run only (16:51 UTC) and turned
  off again (17:55 UTC). Before: absent (off). After: `{"allowDesignedIraqi":false}`. No real Iraqi recording exists on
  this machine; a designed seed was never uploaded as a "recording" (that would misstate its provenance).
- Voice build job `job-d21ce20a09` (AWAITING_REVIEW; identity status REVIEW, dialect UNVERIFIED).
- `lines.json`: each file, its text and what the app's ASR (whisper-large-v3-arabic-dialectal-v2) heard — support only.
  The ASR repeatedly did not hear چ as ch (چاي→آي/فاي, باچر→باسر): a listening item, not a verdict.
- The Iraqi line once spoken in a video take (shot 1.2 take 1 of "Tea at Mutanabbi", `gen-6394fe8c2f5a99a72c7b`) was
  replaced by a silent shot when the production went English; the take stays in the library.
