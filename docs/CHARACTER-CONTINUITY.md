# Character continuity — the regeneration rule

A character's appearance may be generated, regenerated or replaced **only while that character has never been used in
any video**. Once a take of any video contains them, their appearance is preserved for continuity.

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

The appearance: the portrait, the reference views, a pending reference, and the fields that describe how the character
looks — style, species, sex, age, build, face, hair, skin, eyes, distinguishing features and wardrobe.

What stays editable: name, role, personality, creative notes, language and dialect, and the **voice** (its samples,
recordings and chosen line). The appearance rule never changes the voice.

## How the frontend enforces it

| Where | What happens |
| --- | --- |
| `src/demo/rules.ts` | The single definition: `appearanceLock()`, `APPEARANCE_KEYS`, `guardCharacterPatch()`, `protectedAssetOwner()`, `recordTakeUsage()`, `markTakeRemoved()`. |
| `updateCharacter` (shared action) | Drops every appearance field from a patch to a locked character, whatever page sends it. |
| `setPendingReference` | Refused for a locked character. |
| `deleteAsset` / the store's `removeAsset` | A picture a locked character's appearance rests on is not deleted; the Asset Library says which character keeps it. |
| `addTake` | Records usage for every character in the shot, with production, shot and take. |
| `removeTake` | Marks the records `TAKE_REMOVED`; the lock stays. |
| Character page → Appearance | Locked: the notice ("This character has been used in a video. Its appearance is preserved for continuity.") with the records, a disabled Regenerate button, a disabled reference drop zone, no view uploads, no portrait or view changes. Unused: reference upload, preview, replace, remove (kept in IndexedDB across reloads), and Generate/Regenerate, which explains that generation is not connected. |
| Character form | Locked: the appearance fields are shown read-only with the reason. |
| Used In tab | The actual video usage, take by take, separate from mere assignments; an unknown history says so. |

Unit tests in `tests/unit/actions.test.ts` (describe "character continuity") and browser tests in
`tests/e2e/media-and-cast.spec.ts` cover each row.

## Requirements for a future backend

1. Record usage **server-side at take creation**, for every character in the shot, with production, shot, take and
   time. Never delete these records; mark them when a take is removed or rejected.
2. **Refuse** any request that would change a used character's appearance — regenerate, replace the portrait, add,
   remove or reorder reference views, or change the appearance fields — with a clear error. The client's checks are a
   convenience, not the enforcement.
3. Treat a character with no usage information as used until the history is established.
4. Keep voice changes independent of this rule.
5. Expose the usage records so the interface can show where a character was used.
