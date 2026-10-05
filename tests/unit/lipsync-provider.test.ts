import { describe, expect, it } from 'vitest';
import { decodeReport } from '@/server/providers/lipsync';

describe('the lip-sync corrector client', () => {
  it('reads the service report from its base64url header, snake_case → camelCase', () => {
    const rep = { frames: 158, fps: 24, out_frames: 158, track: { frames_with_face: 150, face_height_px: { median: 180, min: 150 }, lost_runs: [[3, 4]] }, vram_peak_allocated_mb: 17000 };
    const h = Buffer.from(JSON.stringify(rep)).toString('base64url');
    const r = decodeReport(h)!;
    expect(r.outFrames).toBe(158);
    expect(r.track.framesWithFace).toBe(150);
    expect(r.track.faceHeightPx).toEqual({ median: 180, min: 150 });
    expect(r.track.lostRuns).toEqual([[3, 4]]);
    expect(r.vramPeakAllocatedMb).toBe(17000);
  });
  it('a missing or broken header is no report (the call then answers unavailable, never a silent pass)', () => {
    expect(decodeReport(null)).toBeNull();
    expect(decodeReport('%%%not-base64-json')).toBeNull();
  });
});
