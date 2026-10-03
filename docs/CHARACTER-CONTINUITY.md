# Character continuity — the regeneration rule

A character's appearance may be generated, regenerated or replaced **only while that character has never been used in
any video**. Once a take of any video contains them, their appearance is preserved for continuity. The identity itself
is defined in [CONTRACTS-IDENTITY-PACK.md](CONTRACTS-IDENTITY-PACK.md) (v2): one canonical front full-body image + one
persistent voice identity.

## Definitions

- **Used in a video** — a take exists, or existed, for a shot whose people include the character. Every take counts:
  chosen or not, approved, unapproved or rejected.
- **Not usage** — being in a show's cast, a season, an episode's cast, a scene or a storyboard shot that has no take.
  Assignment alone never locks a character.
- **History is permanent** — removing or rejecting a take marks its usage record (`TAKE_REMOVED`); it never erases
  it. Deleting a production keeps the records too (they carry the production's title).
- **Unknown history counts as used** — a character whose usage record is missing (`usage` absent) or marked
  `known: false` (for example, imported from an older library) is treated as used.

## What is protected

The appearance: the canonical image (and a legacy portrait of a character drawn before canonical images), the
secondary material (expression sheets, outfits, a close-up portrait — optional pictures drawn on request from the
canonical image), a pending reference picture, and the fields that describe how the character looks — style, species,
sex, age, build, face, hair, skin, eyes, distinguishing features, wardrobe and the canon (`APPEARANCE_KEYS`).

What stays editable: name, Arabic name, role, personality, creative notes, language and dialect, and the voice under its
own rule (the voice identity contract): a used character keeps the voice it spoke with, but may still get a first
voice if it had none.

## Where it is enforced

The same pure reducers run in the browser and on the server for every command, so the rule is applied where it cannot
be bypassed.

| Where | What happens |
| --- | --- |
| `src/domain/rules.ts` | The single definition: `appearanceLock()`, `canChangeAppearance()`, `APPEARANCE_KEYS`, `guardCharacterPatch()`, `protectedAssetOwner()`, `recordTakeUsage()`, `markTakeRemoved()`. |
| `updateCharacter` | A patch that changes an appearance field of a used character — including its refs (secondary material) and portrait — is refused with `APPEARANCE_LOCKED`; a whole-form save that leaves the look as it was is saved (its unchanged appearance fields are dropped). |
| `setCanonicalImage`, `approveCanonicalImage` | A redraw, a replacement or an approval change of a used character is refused (`APPEARANCE_LOCKED`). |
| `setPendingReference` | Refused for a used character. |
| `deleteAsset` | A picture a used character's appearance rests on is not deleted (`ASSET_PROTECTED`, the message names the character), and neither is any character's current canonical image. |
| `addTake` | Records usage for every character in the shot, with production, shot and take. |
| `removeTake` | Marks the records `TAKE_REMOVED`; the lock stays. |
| Worker (`CHARACTER_APPEARANCE`, `CHARACTER_REFS`) | Refuse to draw for a used character before anything runs; the production preflight checks the same (`appearance-unlocked`). |
| Character profile | Locked: the lock status says "Locked: used in N videos" with the reason; Redraw, Approve and the secondary-material requests are gone; the look is read-only; the voice keeps its own rule. |

Usage is recorded **at take creation** (`addTake` → `recordTakeUsage`), for every character in the shot, with
production, shot, take and time, in the append-only `character_usage` table. A refused command rolls back its whole
batch. `APPEARANCE_LOCKED` and `ASSET_PROTECTED` answer HTTP 423. `/api/studio` carries the usage records, so the
profile lists the productions a character was used in, take by take.

Tests: `tests/unit/actions.test.ts` ("character continuity"), `tests/unit/canonical-image.test.ts`,
`tests/unit/canonical-appearance.test.ts`, the browser tests `tests/e2e/continuity.spec.ts` and journey 08
(`tests/e2e/journeys/08-identity-locking.spec.ts`).
