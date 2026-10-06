# Continuity gaps after the cloud session (2026-10-06)

Continuity engineer, final directive 2026-10-06 §§9–14. Builds on FILM-PIPELINE-RESEARCH-2026-10-05.md (research) and
STORYBUILDER-INTEGRATION.md (SB); does not repeat them. Implementation is the deliverable; this is the index.

**Re-verified.** MinimaxStoryBuilder upstream HEAD is still `47b6ceb` (`git ls-remote`, 2026-10-06); its source was
re-read: SB's integration report is accurate (no `MiniMaxH3AddGuide` call, `director.CONTINUITY = "off"`, hard cuts).
New: `sheets.py` and `turnaround.py` are dead code too (not imported; `casting.py` rejects sheets), but `sheets.py`'s
arithmetic applies to us — `ref_image_size=match` scales a reference by `sqrt(canvas/ref area)`, so a full-body
reference keeps ~140 px of face (gap 8). The H3 surface in ComfyUI v0.38.1 (`vewbox-comfyui-1`) is unchanged: six
nodes; `MiniMaxH3FunControlNetApply` (control video / mask / source video) has no weights installed. Alibaba-PAI's
*MiniMax-H3-Fun-ControlNet-Union 2.0* (13.5 GB, MiniMax H3 Community License, eight controls including Pose and
**Layout** = per-subject boxes) is the only H3-native way to enforce blocking beyond words. **Parked** (VRAM: H3 already
peaks at 31.6 of 32.6 GB; licence review; its adaLN form must match our int8 base); the blocking state below is what a
layout video would be drawn from.

| # | Gap (FINAL §) | Problem | Model-specific? / H3 | Decision → implementation | Status |
|---|---|---|---|---|---|
| 1 | Shot-list discipline (§10) | the planner never wrote start/end pose, travel, side, condition, constraints | no | ContinuitySchema + shapeShotPlan + planner rules (`schemas.ts`, `engine.ts`) | DONE (code) |
| 2 | Blocking, 180° line, screen direction (§9, §10) | only per-shot facing words; no line held across cuts | Layout ControlNet (parked); words today | `src/domain/blocking.ts`: line relations, carried side/facing/travel, swaps/flips/reversals → preflight `screen-direction`, prompt sentences, `crossesLine` | READY FOR LOCAL GPU ACCEPTANCE |
| 3 | Match on action across a Cut (§13) | end pose → start pose only on Continuous | no | same-moment cut inherits end pose, emotion; travel carried as "if they move" | READY FOR LOCAL GPU ACCEPTANCE |
| 4 | Re-anchoring cadence (§12) | chain length only; research T5(b) never built | no | drift trigger from the tail take's `params.identityCheck` (REVIEW/FAIL, or median drop > 0.10) | READY FOR LOCAL GPU ACCEPTANCE |
| 5 | Wardrobe / condition enforced (§10, §12) | retention said "wardrobe kept exactly" against a story change | H3 retention vocabulary | wardrobe change → `attribute_transfer` line; condition on the retention line | READY FOR LOCAL GPU ACCEPTANCE |
| 6 | Lighting & colour continuity (§9, §11, §24) | no per-place light rules; colour drift metric (T5(d)) never built | ColorMatch is community, not H3 | `LocationLight` in the Location Bible; `colour-continuity` QA (ΔY/ΔU/ΔV at the join, START) | READY FOR LOCAL GPU ACCEPTANCE (calibration) |
| 7 | Continuity log (§9) | no script-supervisor record | no | `src/domain/continuity-log.ts`, `GET /api/productions/[id]/continuity-log`, `continuity.acknowledged` | DONE (code); UI to the product engineer |
| 8 | Face pixels in the canonical reference (§12) | full-body canonical keeps ~124 px of face at 1344×768 | H3 `match` scaling | derived face crop (`src/domain/face-reference.ts`, `/qa/faces`), capability-gated, studio setting OFF until G13 | READY FOR LOCAL GPU ACCEPTANCE |
| — | Editorial trims (match-on-action cut point) | the cut point is the window start | no | **not built**: needs motion analysis; the windows are already frame-exact; revisit after gates 6–7 | deferred |
| — | Q6 / Q3 (QA) | flagged takes auto-chosen; dissolve/fade as a choice | no | `takeVerdict` (REVIEW never auto-chosen); transition derived from the boundary | DONE (code) |

START values (calibrate on the RTX 5090): face floor 192 px; colour ΔU/ΔV 4 (continuous) / 8 (cut), ΔY 12 / 25;
identity drop 0.10.
