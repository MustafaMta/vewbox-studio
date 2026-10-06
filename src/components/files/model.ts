import type { Asset, StudioState } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { productionHref } from '@/studio/selectors';
import { faceReferenceProvenance } from '@/domain/face-reference';

/** A production-only reference the studio derived for its own use (a face crop of a canonical image, FINAL §12): never
 *  an identity, so never listed among the studio's files; the character's page shows it under its canonical image. */
export const productionOnly = (a: Pick<Asset, 'provenance' | 'tags'>): boolean => Boolean(faceReferenceProvenance(a)) || a.tags.includes('production-reference');
/** The files the Files page lists. */
export const listed = <T extends Pick<Asset, 'provenance' | 'tags'>>(assets: readonly T[]): T[] => assets.filter((a) => !productionOnly(a));

/** FILES, GROUPED BY OWNER (docs/DESIGN-SYSTEM-V5.md §8.13) — pure: whose each file is, from the record and nothing
 *  else, in this order: the owner's own fields reference it (a character's canonical image and voice samples, a
 *  location's plates, a production's frames, takes, cuts and lines); its provenance names the owner; the job that made
 *  it was for that owner; its label begins with the owner's name ("The Static Sky — cut poster"). A file none of these
 *  name is "Other files". */

export type OwnerKind = 'character' | 'location' | 'production' | 'other';
export interface Owner { kind: OwnerKind; id: string; name: string; href?: string; lang?: 'ar' }
export type FileKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'SUBTITLE';
export interface FileItem { asset: Asset; owner: Owner; name: string; kind: FileKind }
export interface OwnerGroup { owner: Owner; files: FileItem[] }

type S = Pick<StudioState, 'characters' | 'locations' | 'productions' | 'assets'>;
const arabic = (s: string) => (/[؀-ۿݐ-ݿࢠ-ࣿ]/.test(s) ? 'ar' as const : undefined);
const OTHER: Owner = { kind: 'other', id: 'other', name: 'Other files' };

export function owners(s: S): Owner[] {
  return [
    ...s.characters.map((c) => ({ kind: 'character' as const, id: c.id, name: c.name, href: `/characters/${encodeURIComponent(c.id)}`, lang: arabic(c.name) })),
    ...s.locations.map((l) => ({ kind: 'location' as const, id: l.id, name: l.name, href: `/locations/${encodeURIComponent(l.id)}`, lang: arabic(l.name) })),
    ...s.productions.map((p) => { const name = p.kind === 'MUSIC_VIDEO' ? p.song?.title || p.title : p.title; return { kind: 'production' as const, id: p.id, name, href: productionHref(p), lang: arabic(name) }; }),
  ];
}

/** Each file's owner (see above). */
export function ownership(s: S, jobs: Pick<Job, 'id' | 'characterId' | 'locationId' | 'productionId'>[] = []): Map<string, Owner> {
  const ids = new Set(s.assets.map((a) => a.id));
  const all = owners(s);
  const byId = new Map(all.map((o) => [o.id, o]));
  const out = new Map<string, Owner>();
  const walk = (v: unknown, o: Owner, depth = 0) => {
    if (depth > 12) return;
    if (typeof v === 'string') { if (ids.has(v) && !out.has(v)) out.set(v, o); return; }
    if (v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walk(x, o, depth + 1);
  };
  for (const c of s.characters) walk(c, byId.get(c.id)!);
  for (const l of s.locations) walk(l, byId.get(l.id)!);
  for (const p of s.productions) walk(p, byId.get(p.id)!);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  for (const a of s.assets) {
    if (out.has(a.id)) continue;
    const prov = (a.provenance ?? {}) as Record<string, unknown>;
    const j = a.jobId ? jobById.get(a.jobId) : undefined;
    const named = [prov.characterId, prov.locationId, prov.productionId, j?.characterId, j?.locationId, j?.productionId].find((x) => typeof x === 'string' && byId.has(x)) as string | undefined;
    if (named) { out.set(a.id, byId.get(named)!); continue; }
    const head = a.label.split(' — ')[0]?.trim();
    const byName = head && a.label.includes(' — ') ? all.find((o) => o.name === head) : undefined;
    out.set(a.id, byName ?? OTHER);
  }
  return out;
}

/** The file's own name inside its owner's group: what follows "Owner — ", else the whole label. */
export function fileName(a: Pick<Asset, 'label'>, owner: Owner): string {
  const [head, ...rest] = a.label.split(' — ');
  return owner.kind !== 'other' && rest.length && head.trim() === owner.name ? rest.join(' — ').trim() : a.label;
}

export type KindFilter = 'ALL' | FileKind;
export type OwnerFilter = 'all' | OwnerKind;

/** The files through the search and the filters, grouped by owner kind, then owner (in the studio's order). */
export function groups(s: S, own: Map<string, Owner>, f: { q: string; kind: KindFilter; owner: OwnerFilter }): Record<OwnerKind, OwnerGroup[]> {
  const q = f.q.trim().toLowerCase();
  const order = new Map(owners(s).map((o, i) => [o.id, i]));
  const by = new Map<string, OwnerGroup>();
  for (const a of listed(s.assets)) {
    const owner = own.get(a.id) ?? OTHER;
    const kind = a.kind as FileKind;
    if (f.kind !== 'ALL' && kind !== f.kind) continue;
    if (f.owner !== 'all' && owner.kind !== f.owner) continue;
    if (q && !a.label.toLowerCase().includes(q) && !owner.name.toLowerCase().includes(q) && !a.tags.some((t) => t.toLowerCase().includes(q))) continue;
    const g = by.get(owner.id) ?? { owner, files: [] };
    g.files.push({ asset: a, owner, name: fileName(a, owner), kind });
    by.set(owner.id, g);
  }
  const sorted = [...by.values()].sort((a, b) => (order.get(a.owner.id) ?? 1e9) - (order.get(b.owner.id) ?? 1e9));
  for (const g of sorted) g.files.sort((x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) || y.asset.createdAt.localeCompare(x.asset.createdAt));
  return { character: sorted.filter((g) => g.owner.kind === 'character'), location: sorted.filter((g) => g.owner.kind === 'location'), production: sorted.filter((g) => g.owner.kind === 'production'), other: sorted.filter((g) => g.owner.kind === 'other') };
}
const KIND_ORDER: FileKind[] = ['IMAGE', 'VIDEO', 'AUDIO', 'SUBTITLE'];

export function kindCounts(s: Pick<S, 'assets'>): Record<KindFilter, number> {
  const shown = listed(s.assets);
  const c: Record<KindFilter, number> = { ALL: shown.length, IMAGE: 0, VIDEO: 0, AUDIO: 0, SUBTITLE: 0 };
  for (const a of shown) if (a.kind in c) c[a.kind as FileKind] += 1;
  return c;
}

/** 0:56 · 12:04 */
export const clip = (sec?: number | null) => { if (!sec || !Number.isFinite(sec)) return null; const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** 1.2 MB · 340 KB */
export const size = (b?: number | null) => (!b ? null : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const originWords = (a: Pick<Asset, 'origin' | 'sample' | 'tier'> & Partial<Pick<Asset, 'provenance' | 'tags'>>) => (a.tags && productionOnly(a as Pick<Asset, 'provenance' | 'tags'>) ? 'Derived · production only' : a.sample ? 'Sample' : a.tier === 'CANONICAL' ? 'Canonical' : a.origin === 'UPLOAD' ? 'Uploaded' : a.origin === 'DERIVED' ? 'Derived' : 'Made by the studio');
