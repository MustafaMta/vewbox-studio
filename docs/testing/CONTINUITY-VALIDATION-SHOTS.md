# Continuity validation shots — READY FOR LOCAL GPU ACCEPTANCE (2026-10-06)

The continuity engineer's implementations (docs/research/CONTINUITY-GAPS-2026-10-06.md) are proved here on real H3
output. Fold these shots into gates 4–8 of the English acceptance run. Where a test is A/B, use the same seeds. Every
threshold is a START value to calibrate on these takes:

| Threshold | Start value |
|---|---|
| Face-pixel floor | 192 px |
| Colour shift at a join, \|ΔU\|, \|ΔV\| | ≤ 4 continuous / 8 cut |
| Brightness shift at a join, \|ΔY\| | ≤ 12 continuous / 25 cut |
| Face-similarity drop that triggers a re-anchor | 0.10 |

Make every take on the final H3 quality tier, whichever the H3 configuration benchmark selects.

## A. Blocking, the 180° line, match on action (gates 5/6)

One 2-person scene at the pharmacy, 4 shots:
- **S1, TWO_SHOT transition:** Clara frameSide LEFT facing RIGHT; Karim RIGHT facing LEFT.
- **S2, OVER_THE_SHOULDER cut onto Clara:** no sides set; they carry over.
- **S3, MCU cut onto Karim:** one line.
- **S4, TWO_SHOT cut.**

**Check by eye**
- Clara is screen-left and Karim screen-right in S1, in S2's over-the-shoulder and in S4.
- Eyelines run Clara → right and Karim → left.
- The prompt contains "Blocking (the 180° line holds): <Subject 1> is to the left of <Subject 2>".

**Movement pair**
- **S5:** Clara walks LEFT_TO_RIGHT, endPose "reaching the shop door".
- **S6, cut (MEDIUM, no motion set):** she starts at the door and, if she moves, moves left to right.

**No-GPU control:** swap S3's sides, and the preflight warning `screen-direction` appears. Set crossesLine, and it
clears.

## B. Drift re-anchor (gate 5, a chain of 4–8 continuous shots)

When any tail take's identityCheck is REVIEW or FAIL, the next take's notes must say "re-anchor: identity drift…", with
a 5-frame guide. Report whether the next take's SFace median recovers compared with the drifted take.

## C. Wardrobe change

1. Add a scene-story change on Karim at the end of scene 1: key "wardrobe", text "a dark blue police uniform with a
   peaked cap".
2. In scene 2, an MCU of Karim must show the same face and the uniform, with no third person.
3. In a later scene, clear the change: the canonical clothes must return.

Watch for a second "Karim" appearing in the old clothes.

## D. Lighting rule and colour join (gate 8, return to a location)

Give the pharmacy these light rules:
- **key:** "cool fluorescent tubes overhead";
- **practicals:** "green cross sign in the window";
- **palette:** white, mint green, steel grey;
- **byTime DUSK:** "blue dusk through the front window, tubes on".

Film the return scene without a stated light and compare it with the first visit by eye. Collect the
colour-continuity values (ΔY/ΔU/ΔV) of every join from gates 4–8 into the evidence bundle; they calibrate the START
thresholds.

## E. Face reference (G13)

**Setup**
- Arm A: `settings.generation.faceReference` OFF. Arm B: AUTO.
- In B, the take's references must include a CHARACTER ref noted "derived face reference".
- Tea-at-Mutanabbi is CARTOON style. Judge Clara by eye, and add one REALISTIC character for the measured threshold.

**Shots per character** (3 shots × A/B, fixed seed)
1. MEDIUM_CLOSE_UP speaking one recorded line (~2–3 s).
2. CLOSE_UP silent reaction ("her smile fades into worry").
3. TWO_SHOT with one speaker.

**Measure per take**
- The identityCheck median, using the rival-reference rule on multi-person shots.
- people-on-screen.
- The lip-sync verdict and lag.

**Check by eye at normal speed**
- (a) It is the same face as the canonical image.
- (b) The expression is not frozen to the crop's neutral face.
- (c) There is no inset and no duplicate face.
- (d) The second person keeps their own face.

**Promote AUTO only if** median SFace AUTO ≥ OFF + 0.05 on the realistic set, there are no new people or duplicate
failures, expressions are alive in ≥ 5/6 B takes, and lip-sync is not worse.
