import { describe, expect, it } from 'vitest';
import { NewNoteSchema, NotePatchSchema, appendNoteToShotNotes, noteFromRow, noteLine, timecodeText } from '@/server/studio/notes';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B2 — the pure parts of the Screening Room notes: the contracts, the row shape,
 *  the line a sent note adds to a shot. The database paths run against the private copy (var/smoke/notes-roundtrip.ts). */

describe('cut notes: contracts', () => {
  it('a new note needs a production, a timecode and text; the range ends after its start; the pin is 0–1', () => {
    expect(NewNoteSchema.safeParse({ productionId: 'p', timecode: 51.2, text: 'The portrait should flicker' }).success).toBe(true);
    expect(NewNoteSchema.safeParse({ productionId: 'p', timecode: 51, rangeEnd: 50, text: 'x' }).success).toBe(false);
    expect(NewNoteSchema.safeParse({ productionId: 'p', timecode: 51, pin: { x: 1.2, y: 0.5 }, text: 'x' }).success).toBe(false);
    expect(NewNoteSchema.safeParse({ productionId: 'p', timecode: 51, text: '   ' }).success).toBe(false);
    expect(NewNoteSchema.safeParse({ productionId: 'p', timecode: -1, text: 'x' }).success).toBe(false);
    const ok = NewNoteSchema.safeParse({ productionId: 'p', cutAssetId: 'cut-3', timecode: 51, rangeEnd: 53.5, pin: { x: 0.62, y: 0.3 }, drawingAssetId: 'd', text: '  trimmed  ', author: 'Mustafa' });
    expect(ok.success && ok.data.text).toBe('trimmed');
  });
  it('a patch changes the words or the place, clears a range, pin or drawing with null, and nothing else', () => {
    expect(NotePatchSchema.safeParse({ text: 'new words', rangeEnd: null, pin: null, drawingAssetId: null }).success).toBe(true);
    expect(NotePatchSchema.safeParse({ status: 'resolved' }).success).toBe(false);
    expect(NotePatchSchema.safeParse({ sentToShotId: 'x' }).success).toBe(false);
  });
});

describe('cut notes: the row and the line', () => {
  const row = { id: 'note-1', productionId: 'short-1', cutAssetId: 'cut-3', cutVersion: 3, timecode: 51.17, rangeEnd: null, pinX: 0.62, pinY: 0.3, drawingAssetId: null, text: 'The portrait should flicker once more', author: 'producer', status: 'open', sentToShotId: null, producedTakeId: null, createdAt: '2026-10-03T09:40:00.000Z', updatedAt: '2026-10-03T09:40:00.000Z' };
  it('reads a row into the contract shape (pin joined, nulls dropped)', () => {
    expect(noteFromRow(row)).toEqual({ id: 'note-1', productionId: 'short-1', cutAssetId: 'cut-3', cutVersion: 3, timecode: 51.17, pin: { x: 0.62, y: 0.3 }, text: 'The portrait should flicker once more', author: 'producer', status: 'open', createdAt: '2026-10-03T09:40:00.000Z', updatedAt: '2026-10-03T09:40:00.000Z' });
    expect(noteFromRow({ ...row, pinX: null, status: 'resolved', sentToShotId: 'shot-2-4', producedTakeId: 'take-9' })).toMatchObject({ status: 'resolved', sentToShotId: 'shot-2-4', producedTakeId: 'take-9' });
    expect(noteFromRow({ ...row, pinX: null }).pin).toBeUndefined();
  });
  it('timecodes read as mm:ss, hours only when needed', () => {
    expect(timecodeText(51.17)).toBe('00:51'); expect(timecodeText(0)).toBe('00:00'); expect(timecodeText(3723)).toBe('01:02:03');
  });
  it('the line a sent note adds names the time, the range, the cut and the author; it is added once', () => {
    const line = noteLine(noteFromRow(row));
    expect(line).toBe('Screening note at 00:51 (cut 3), producer: The portrait should flicker once more');
    expect(noteLine({ timecode: 51, rangeEnd: 53.5, text: 'hold it', author: 'Mustafa' })).toBe('Screening note at 00:51–00:53, Mustafa: hold it');
    expect(appendNoteToShotNotes(undefined, line)).toBe(line);
    expect(appendNoteToShotNotes('Two-shot; keep the lamp in frame.', line)).toBe(`Two-shot; keep the lamp in frame.\n\n${line}`);
    expect(appendNoteToShotNotes(`Two-shot; keep the lamp in frame.\n\n${line}`, line)).toBe(`Two-shot; keep the lamp in frame.\n\n${line}`);
  });
});
