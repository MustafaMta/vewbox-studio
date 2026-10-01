/** ONE SOUND AT A TIME, ACROSS KINDS — the shared audio player (songs, voices, files) and every video player announce
 *  when they start; every other source pauses. Nothing ever starts on its own: only a press starts playback, which
 *  also keeps within browsers' autoplay rules. */

const EVENT = 'vewbox:media-play';

export function claimPlayback(owner: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: owner }));
}

export function onOtherPlayback(owner: string, pause: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const h = (e: Event) => { if ((e as CustomEvent<string>).detail !== owner) pause(); };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export const fmtClock = (t: number) => { if (!Number.isFinite(t) || t < 0) t = 0; const s = Math.floor(t); const m = Math.floor(s / 60); return `${m}:${String(s - m * 60).padStart(2, '0')}`; };

/** Remembered per viewer in this browser: the volume and whether sound is muted. */
const KEY = 'vewbox.player';
export function readVolume(): { volume: number; muted: boolean } {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { volume?: number; muted?: boolean }; return { volume: typeof v.volume === 'number' ? Math.min(1, Math.max(0, v.volume)) : 0.9, muted: Boolean(v.muted) }; } catch { return { volume: 0.9, muted: false }; }
}
export function writeVolume(v: { volume: number; muted: boolean }) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* a convenience only */ } }
