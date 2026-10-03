import type { Character } from '@/domain/types';

/** IDENTITY SEEDS — one number per character, used for its canonical image (plus the version it replaces) and its
 *  secondary material, so a character draws the same way on every machine. The identity line itself is
 *  `canonicalIdentityLine` (canonical-image.ts). */

/** FNV-1a over the id, folded to ComfyUI's 31-bit seed range: a character gets the same seed on every machine. */
export function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 2 ** 31;
}

export function identitySeedFor(c: Pick<Character, 'id'> & { canon?: Character['canon'] }): number {
  const s = c.canon?.identitySeed;
  return typeof s === 'number' && Number.isFinite(s) && s >= 0 ? Math.floor(s) % 2 ** 31 : seedFromId(c.id);
}
