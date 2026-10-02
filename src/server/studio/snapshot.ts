import { asc } from 'drizzle-orm';
import type { Asset, AssetTier, Character, Location, Production, Scene, Season, Settings, Shot, Show, StudioState, Take, VideoUsage, Voice, VoiceIdentity } from '@/domain/types';
import { STATE_VERSION } from '@/domain/version';
import { DEFAULT_SETTINGS } from '@/domain/sample';
import { canonical, hashString } from '@/domain/hash';
import { db, schema, type Db } from '../db/client';
import { packFromColumns } from './identity-pack';

/** READING THE STUDIO — the whole state assembled from the tables, plus a fingerprint of every row so the saver can
 *  write back only what a command changed. */

export interface RowHashes {
  shows: Map<string, string>; seasons: Map<string, string>; productions: Map<string, string>;
  scenes: Map<string, string>; shots: Map<string, string>; takes: Map<string, string>;
  characters: Map<string, string>; locations: Map<string, string>; assets: Map<string, string>;
  usage: Map<string, string>; settings: string;
}

export interface Snapshot { state: StudioState; hashes: RowHashes; version: number }

type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const undef = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

/** A voice column as older rows wrote it: no `samples`, or an identity from before the wave-2 contract (no mode,
 *  params, proof, status). The shape every reducer expects is restored here, once, on load; nothing is invented —
 *  an identity without a proof line is reported as REVIEW, and the proof is taken from the generated line the same
 *  build stored when there is one. */
export function normalizeVoice(v: Voice | null | undefined): Voice {
  const base: Voice = { pitch: v?.pitch ?? 'MID', pace: v?.pace ?? 'MEASURED', timbre: v?.timbre ?? '', notes: v?.notes ?? '', samples: Array.isArray(v?.samples) ? v.samples : [], selectedSampleId: v?.selectedSampleId, identity: v?.identity };
  const id = base.identity;
  if (!id) return base;
  if (id.mode && id.params && id.status) return base;
  const proofSample = id.proof ? undefined : base.samples.find((s) => s.source === 'GENERATED' && s.assetId && s.text && (!id.referenceAssetId || s.assetId !== id.referenceAssetId));
  const proof = id.proof ?? (proofSample ? { sampleId: proofSample.id, assetId: proofSample.assetId!, text: proofSample.text! } : undefined);
  const legacyParams = (id.params ?? {}) as Record<string, unknown>;
  const params: VoiceIdentity['params'] = typeof legacyParams.speed === 'number' && typeof legacyParams.emotionAlpha === 'number' ? (legacyParams as VoiceIdentity['params']) : { ...legacyParams, speed: typeof legacyParams.speed === 'number' ? legacyParams.speed : 1, emotionAlpha: typeof legacyParams.emotionAlpha === 'number' ? legacyParams.emotionAlpha : 1 };
  return { ...base, identity: { ...id, mode: id.mode ?? (id.providerVoiceId && !id.referenceAssetId ? 'MANUAL' : 'REFERENCE'), params, proof, status: id.status ?? (proof ? 'ACTIVE' : 'REVIEW') } };
}

export function assetSrc(a: { id: string; storage: string; path: string }): string {
  return a.storage === 'PUBLIC' ? `/${a.path.replace(/^\/+/, '')}` : `/api/media/${a.id}`;
}

type AssetRowRead = typeof schema.assets.$inferSelect;
type CharacterRowRead = typeof schema.characters.$inferSelect;
type UsageRowRead = typeof schema.characterUsage.$inferSelect;

const TIERS: readonly AssetTier[] = ['CANONICAL', 'SECONDARY', 'RAW'];

/** An asset as the domain holds it, from its row (`posterOf` resolves a poster stored as another asset). */
export function assetFromRow(a: AssetRowRead, posterOf: (posterAssetId: string) => string | undefined = () => undefined): Asset {
  const poster = (a.posterAssetId ? posterOf(a.posterAssetId) : undefined) ?? (a.posterPath ? `/${a.posterPath.replace(/^\/+/, '')}` : undefined);
  return { id: a.id, kind: a.kind as Asset['kind'], src: assetSrc(a), poster, label: a.label, width: undef(a.width), height: undef(a.height), durationSeconds: undef(a.durationSeconds), fps: undef(a.fps), tags: a.tags, sample: a.sample, origin: a.origin as Asset['origin'], mimeType: undef(a.mimeType), bytes: undef(a.bytes), sha256: undef(a.sha256), provenance: undef(a.provenance), jobId: undef(a.jobId), unavailable: a.unavailable || undefined, tier: TIERS.includes(a.tier as AssetTier) ? (a.tier as AssetTier) : undefined, createdAt: a.createdAt };
}

export function usageFromRow(u: UsageRowRead): VideoUsage {
  return { productionId: u.productionId, productionTitle: u.productionTitle, shotId: u.shotId, shotLabel: u.shotLabel, takeId: u.takeId, takeLabel: u.takeLabel, recordedAt: u.recordedAt, status: u.status as VideoUsage['status'], canonicalImageVersion: undef(u.canonicalImageVersion) };
}

/** A character as the domain holds it, from its row, its usage records and (for a pack view written outside the
 *  studio without metadata) the creation time of an asset. */
export function characterFromRow(c: CharacterRowRead, videos: VideoUsage[], assetCreatedAt: (assetId: string) => string | undefined = () => undefined): Character {
  return { id: c.id, name: c.name, nameAr: undef(c.nameAr), role: c.role, style: c.style as Character['style'], sex: c.sex as Character['sex'], species: undef(c.species), ageYears: c.ageYears, build: c.build, face: c.face, hair: c.hair, skin: c.skin, eyes: c.eyes, distinguishing: c.distinguishing, wardrobe: c.wardrobe, personality: c.personality, language: c.language as Character['language'], dialect: undef(c.dialect) as Character['dialect'], voice: normalizeVoice(c.voice), identityPack: packFromColumns(c, (id) => assetCreatedAt(id) ?? c.updatedAt), refs: c.refs, portraitAssetId: undef(c.portraitAssetId), usage: { known: c.usageKnown, videos }, pendingReference: undef(c.pendingReference), canon: undef(c.canon), notes: undef(c.notes), createdAt: c.createdAt, updatedAt: c.updatedAt };
}

export async function loadSnapshot(tx: Tx = db()): Promise<Snapshot> {
  const [showRows, seasonRows, productionRows, sceneRows, shotRows, takeRows, characterRows, usageRows, locationRows, assetRows, settingsRows, metaRows] = await Promise.all([
    tx.select().from(schema.shows).orderBy(asc(schema.shows.createdAt)),
    tx.select().from(schema.seasons).orderBy(asc(schema.seasons.number)),
    tx.select().from(schema.productions).orderBy(asc(schema.productions.createdAt)),
    tx.select().from(schema.scenes).orderBy(asc(schema.scenes.position)),
    tx.select().from(schema.shots).orderBy(asc(schema.shots.position)),
    tx.select().from(schema.takes).orderBy(asc(schema.takes.position)),
    tx.select().from(schema.characters).orderBy(asc(schema.characters.createdAt)),
    tx.select().from(schema.characterUsage).orderBy(asc(schema.characterUsage.id)),
    tx.select().from(schema.locations).orderBy(asc(schema.locations.createdAt)),
    tx.select().from(schema.assets).orderBy(asc(schema.assets.createdAt)),
    tx.select().from(schema.settings),
    tx.select().from(schema.studioMeta),
  ]);

  const hashes: RowHashes = { shows: new Map(), seasons: new Map(), productions: new Map(), scenes: new Map(), shots: new Map(), takes: new Map(), characters: new Map(), locations: new Map(), assets: new Map(), usage: new Map(), settings: '' };
  const h = (v: unknown) => hashString(canonical(v));

  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const posterOf = (id: string) => { const p = assetById.get(id); return p ? assetSrc(p) : undefined; };
  const assets: Asset[] = assetRows.map((a) => {
    const asset = assetFromRow(a, posterOf);
    hashes.assets.set(a.id, h(asset));
    return asset;
  });

  const shows: Show[] = showRows.map((r) => {
    const show: Show = { id: r.id, title: r.title, titleAr: undef(r.titleAr), logline: r.logline, genre: r.genre, style: r.style as Show['style'], language: r.language as Show['language'], dialect: undef(r.dialect) as Show['dialect'], aspect: r.aspect as Show['aspect'], synopsis: undef(r.synopsis), coverAssetId: undef(r.coverAssetId), posterAssetId: undef(r.posterAssetId), castIds: r.castIds, locationIds: r.locationIds, bible: undef(r.bible), createdAt: r.createdAt, updatedAt: r.updatedAt };
    hashes.shows.set(r.id, h(show));
    return show;
  });

  const seasons: Season[] = seasonRows.map((r) => { const s: Season = { id: r.id, showId: r.showId, number: r.number, title: r.title, arc: r.arc, createdAt: r.createdAt }; hashes.seasons.set(r.id, h(s)); return s; });

  const takesByShot = new Map<string, Take[]>();
  for (const t of takeRows) {
    const take: Take = { id: t.id, label: t.label, assetId: t.assetId, createdAt: t.createdAt, note: undef(t.note), status: t.status as Take['status'], provider: undef(t.provider) as Take['provider'], model: undef(t.model), requestId: undef(t.requestId), prompt: undef(t.prompt), params: undef(t.params), seed: undef(t.seed), references: undef(t.references), width: undef(t.width), height: undef(t.height), durationSeconds: undef(t.durationSeconds), fps: undef(t.fps), generationMs: undef(t.generationMs), costUsd: undef(t.costUsd), qa: undef(t.qa), rejectionReason: undef(t.rejectionReason), jobId: undef(t.jobId), codeVersion: undef(t.codeVersion), workflowVersion: undef(t.workflowVersion), thumbnailAssetId: undef(t.thumbnailAssetId), trimStartFrames: undef(t.trimStartFrames), soundtrack: undef(t.soundtrack) };
    hashes.takes.set(t.id, h(take));
    takesByShot.set(t.shotId, [...(takesByShot.get(t.shotId) ?? []), take]);
  }
  const shotsByProduction = new Map<string, Shot[]>();
  for (const s of shotRows) {
    const shot: Shot = { id: s.id, sceneId: s.sceneId, number: s.number, purpose: s.purpose, action: s.action, framing: s.framing as Shot['framing'], cameraMove: s.cameraMove as Shot['cameraMove'], durationSeconds: s.durationSeconds, characterIds: s.characterIds, dialogue: s.dialogue, transition: s.transition as Shot['transition'], openingFrameAssetId: undef(s.openingFrameAssetId), endingFrameAssetId: undef(s.endingFrameAssetId), takes: takesByShot.get(s.id) ?? [], selectedTakeId: undef(s.selectedTakeId), songWindow: undef(s.songWindow), performance: undef(s.performance), notes: undef(s.notes), continuity: undef(s.continuity), prompt: undef(s.prompt) };
    hashes.shots.set(s.id, h({ ...shot, takes: undefined }));
    shotsByProduction.set(s.productionId, [...(shotsByProduction.get(s.productionId) ?? []), shot]);
  }
  const scenesByProduction = new Map<string, Scene[]>();
  for (const sc of sceneRows) {
    const scene: Scene = { id: sc.id, number: sc.number, title: sc.title, locationId: undef(sc.locationId), timeOfDay: sc.timeOfDay as Scene['timeOfDay'], characterIds: sc.characterIds, beats: sc.beats, purpose: undef(sc.purpose), emotionalObjective: undef(sc.emotionalObjective), entryState: undef(sc.entryState), exitState: undef(sc.exitState) };
    hashes.scenes.set(sc.id, h(scene));
    scenesByProduction.set(sc.productionId, [...(scenesByProduction.get(sc.productionId) ?? []), scene]);
  }
  const productions: Production[] = productionRows.map((p) => {
    const production: Production = { id: p.id, kind: p.kind as Production['kind'], showId: undef(p.showId), seasonId: undef(p.seasonId), episodeNumber: undef(p.episodeNumber), title: p.title, titleAr: undef(p.titleAr), logline: p.logline, synopsis: p.synopsis, style: p.style as Production['style'], language: p.language as Production['language'], dialect: undef(p.dialect) as Production['dialect'], aspect: p.aspect as Production['aspect'], targetSeconds: p.targetSeconds, stage: p.stage as Production['stage'], brief: p.brief, castIds: p.castIds, locationIds: p.locationIds, scenes: scenesByProduction.get(p.id) ?? [], shots: shotsByProduction.get(p.id) ?? [], song: undef(p.song), coverAssetId: undef(p.coverAssetId), posterAssetId: undef(p.posterAssetId), artist: undef(p.artist), concept: undef(p.concept) as Production['concept'], genre: undef(p.genre), mood: undef(p.mood), cutAssetId: undef(p.cutAssetId), exports: undef(p.exports), createdAt: p.createdAt, updatedAt: p.updatedAt };
    hashes.productions.set(p.id, h({ ...production, scenes: undefined, shots: undefined }));
    return production;
  });

  const usageByCharacter = new Map<string, VideoUsage[]>();
  for (const u of usageRows) {
    const v = usageFromRow(u);
    hashes.usage.set(`${u.characterId}|${u.shotId}|${u.takeId}`, h(v));
    usageByCharacter.set(u.characterId, [...(usageByCharacter.get(u.characterId) ?? []), v]);
  }
  const characters: Character[] = characterRows.map((c) => {
    const character = characterFromRow(c, usageByCharacter.get(c.id) ?? [], (id) => assetById.get(id)?.createdAt);
    hashes.characters.set(c.id, h({ ...character, usage: { known: character.usage!.known } }));
    return character;
  });

  const locations: Location[] = locationRows.map((l) => {
    const location: Location = { id: l.id, name: l.name, nameAr: undef(l.nameAr), kind: l.kind as Location['kind'], description: l.description, style: l.style as Location['style'], lighting: l.lighting as Location['lighting'], landmarks: l.landmarks, props: l.props, refs: l.refs, masterAssetId: undef(l.masterAssetId), layout: undef(l.layout), createdAt: l.createdAt, updatedAt: l.updatedAt };
    hashes.locations.set(l.id, h(location));
    return location;
  });

  const settings: Settings = settingsRows[0]?.data ?? DEFAULT_SETTINGS;
  hashes.settings = h(settings);

  return { state: { version: STATE_VERSION, shows, seasons, productions, characters, locations, assets, settings }, hashes, version: metaRows[0]?.version ?? 0 };
}
