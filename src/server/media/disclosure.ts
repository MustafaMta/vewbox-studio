import type { Asset, Production } from '@/domain/types';

/** AI DISCLOSURE ON EVERY EXPORT (licence compliance: the MiniMax H3 acceptable-use policy asks that machine-generated
 *  content be disclosed). Every cut and export carries it in its container metadata (`comment`, `description`), and an
 *  export may end on a credit card listing the engines. The engines are read from what the film is really made of —
 *  the chosen takes' models, the recorded voices' and the song's engines — never from a fixed list. Pure (tested). */

export const AI_DISCLOSURE = 'AI-generated with Vewbox Studio; video by MiniMax H3';

export interface Disclosure { comment: string; description: string; engines: string[] }

const clean = (s: unknown): string | undefined => (typeof s === 'string' && s.trim() ? s.trim().replace(/\s+/g, ' ').slice(0, 120) : undefined);

/** The engines a production's current cut is made with, in a stable order: video, then voices, then music. */
export function enginesOf(p: Production, assets: Asset[], sourceAssetIds: string[] = []): string[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const video: string[] = []; const voice: string[] = []; const music: string[] = [];
  for (const sh of p.shots) {
    const t = sh.takes.find((x) => x.id === sh.selectedTakeId);
    if (!t || byId.get(t.assetId)?.sample) continue;
    video.push(t.provider === 'MINIMAX' ? (/minimax/i.test(t.model ?? '') ? clean(t.model)! : 'MiniMax H3') : clean(t.model) ?? clean(t.provider) ?? 'unknown video engine');
  }
  const sources = new Set(sourceAssetIds);
  for (const sh of p.shots) for (const d of sh.dialogue) if (d.audioAssetId) sources.add(d.audioAssetId);
  if (p.song?.assetId) sources.add(p.song.assetId);
  for (const id of sources) {
    const a = byId.get(id);
    if (!a || a.sample) continue;
    const pv = (a.provenance ?? {}) as { engine?: unknown; model?: unknown; provider?: unknown };
    const name = clean(pv.model) ?? clean(pv.engine) ?? clean(pv.provider);
    if (!name) continue;
    if (a.tags?.includes('song') || id === p.song?.assetId) music.push(name);
    else if (a.tags?.some((t) => t === 'voice' || t === 'dialogue')) voice.push(name);
  }
  const uniq = (xs: string[]) => Array.from(new Set(xs));
  return [...uniq(video), ...uniq(voice), ...uniq(music)];
}

export function disclosureOf(p: Production, assets: Asset[], sourceAssetIds: string[] = []): Disclosure {
  const engines = enginesOf(p, assets, sourceAssetIds);
  const description = `${AI_DISCLOSURE}. Engines: ${engines.length ? engines.join('; ') : 'MiniMax H3'}.`;
  return { comment: AI_DISCLOSURE, description, engines: engines.length ? engines : ['MiniMax H3'] };
}

/** The end-credit card's lines. */
export function creditLines(p: Pick<Production, 'title'>, d: Disclosure): string[] {
  return [p.title, '', 'AI-generated with Vewbox Studio', 'Video: MiniMax H3', '', 'Engines', ...d.engines];
}

/** The ffmpeg `-metadata` arguments that carry the disclosure (standard keys every MP4/MOV reader shows). */
export const disclosureMetadataArgs = (d: Disclosure, title?: string): string[] => [
  '-metadata', `comment=${d.comment}`, '-metadata', `description=${d.description}`, ...(title ? ['-metadata', `title=${title}`] : []),
];
