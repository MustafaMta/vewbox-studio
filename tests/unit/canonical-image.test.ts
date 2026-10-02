import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { addAsset, addTake, approveCanonicalImage, deleteAsset, deleteCharacter, setAssetTier, setCanonicalImage, setPendingReference, updateAsset, updateCharacter } from '@/domain/actions';
import { runCommand, type Command } from '@/domain/commands';
import { StudioError } from '@/domain/errors';
import { canonical } from '@/domain/hash';
import { canonicalStatusOf, primaryImageOf, primaryImageSourceOf } from '@/domain/identity';
import { appearanceLock } from '@/domain/rules';
import { primaryImageSrc } from '@/studio/selectors';
import { preflightCharacter, preflightPlan, preflightTake } from '@/server/org/preflight';
import { canonicalFromColumns, canonicalToColumns } from '@/server/studio/canonical-image';
import { assetRow, characterRow, usageRow } from '@/server/studio/persist';
import { assetFromRow, characterFromRow, usageFromRow } from '@/server/studio/snapshot';
import type { Asset, CanonicalImage, Character, StudioState } from '@/domain/types';

/** THE CANONICAL IMAGE (docs/CONTRACTS-IDENTITY-PACK.md v2): one front full-body image per character — drawn as a
 *  DRAFT, approved by the producer by version, locked once the character is in a video; tiers follow it; it is the
 *  primary image everywhere; it survives the database round trip unchanged. */

const ch = (s: StudioState, id: string): Character => s.characters.find((c) => c.id === id)!;
const asset = (s: StudioState, id: string): Asset | undefined => s.assets.find((a) => a.id === id);
const codeOf = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof StudioError ? e.code : 'OTHER'; } };
const errOf = (fn: () => unknown): StudioError => { try { fn(); } catch (e) { return e as StudioError; } throw new Error('did not throw'); };
const pic = (s: StudioState, id: string, extra: Partial<Asset> = {}) => addAsset(s, { id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: ['character'], sample: false, origin: 'GENERATED', mimeType: 'image/png', width: 1024, height: 1536, ...extra }).state;
const withPictures = (s: StudioState = seed()) => ['img-1', 'img-2', 'img-3'].reduce((acc, id) => pic(acc, id), s);
const cmd = (name: Command['name'], args: unknown[], at = '2026-10-03T10:00:00.000Z'): Command => ({ name, args, seed: `t-${name}`, at } as Command);

/** Nour (unused) drawn once: img-1 as her canonical image, v1 DRAFT. */
const drawn = () => setCanonicalImage(withPictures(), 'nour', { assetId: 'img-1', jobId: 'job-1', seed: 42, engine: 'qwen-image-2512', identityLine: 'Realistic. Woman, 31, athletic…', check: { ok: true } });
/** …approved, then filmed in a take of River Lights (rl-2): locked. */
const lockedNour = () => {
  const s = approveCanonicalImage(drawn(), 'nour', 1);
  return addTake(s, 'river-lights', 'rl-2', { assetId: 'take-01', provider: 'MINIMAX' }).state;
};

describe('setCanonicalImage', () => {
  it('sets the image as a DRAFT one version further and makes the picture CANONICAL', () => {
    const s = drawn();
    const img = ch(s, 'nour').canonicalImage!;
    expect(img).toMatchObject({ assetId: 'img-1', status: 'DRAFT', version: 1, jobId: 'job-1', seed: 42, engine: 'qwen-image-2512', check: { ok: true } });
    expect(img.generatedAt).toBeTruthy();
    expect(asset(s, 'img-1')!.tier).toBe('CANONICAL');
    expect(canonicalStatusOf(ch(s, 'nour'))).toBe('DRAFT');
    expect(canonicalStatusOf(ch(seed(), 'nour'))).toBe('NONE');
  });

  it('a redraw: version +1, back to DRAFT, approval gone; the previous picture becomes RAW and is never deleted', () => {
    let s = approveCanonicalImage(drawn(), 'nour', 1);
    expect(ch(s, 'nour').canonicalImage!.status).toBe('APPROVED');
    s = setCanonicalImage(s, 'nour', { assetId: 'img-2', jobId: 'job-2' });
    const img = ch(s, 'nour').canonicalImage!;
    expect(img).toMatchObject({ assetId: 'img-2', status: 'DRAFT', version: 2 });
    expect(img.approvedAt).toBeUndefined();
    expect(asset(s, 'img-2')!.tier).toBe('CANONICAL');
    expect(asset(s, 'img-1')).toMatchObject({ tier: 'RAW' });
  });

  it('status and version come from the reducer, never from the caller', () => {
    const s = setCanonicalImage(withPictures(), 'nour', { assetId: 'img-1', status: 'APPROVED', version: 99, approvedAt: 'x' } as never);
    expect(ch(s, 'nour').canonicalImage).toMatchObject({ status: 'DRAFT', version: 1 });
    expect(ch(s, 'nour').canonicalImage!.approvedAt).toBeUndefined();
  });

  it('the same picture with the same details again changes nothing (a retried job is harmless)', () => {
    const s = approveCanonicalImage(drawn(), 'nour', 1);
    const again = setCanonicalImage(s, 'nour', { assetId: 'img-1', jobId: 'job-1', seed: 42, engine: 'qwen-image-2512', identityLine: 'Realistic. Woman, 31, athletic…', check: { ok: true }, generatedAt: '2030-01-01T00:00:00Z' });
    expect(again).toBe(s);
    // a changed check on the same picture is a new version to review
    const rechecked = setCanonicalImage(s, 'nour', { assetId: 'img-1', jobId: 'job-1', seed: 42, engine: 'qwen-image-2512', identityLine: 'Realistic. Woman, 31, athletic…', check: { ok: false, notes: ['feet cropped'] } });
    expect(ch(rechecked, 'nour').canonicalImage).toMatchObject({ version: 2, status: 'DRAFT' });
    expect(asset(rechecked, 'img-1')!.tier).toBe('CANONICAL');
  });

  it('an image drawn from the pending reference picture consumes it', () => {
    let s = pic(withPictures(), 'up-face', { origin: 'UPLOAD' });
    s = setPendingReference(s, 'nour', 'up-face');
    const other = setCanonicalImage(s, 'nour', { assetId: 'img-1' });
    expect(ch(other, 'nour').pendingReference?.assetId).toBe('up-face');
    const fromIt = setCanonicalImage(s, 'nour', { assetId: 'img-1', referenceAssetId: 'up-face' });
    expect(ch(fromIt, 'nour').pendingReference).toBeUndefined();
    expect(ch(fromIt, 'nour').canonicalImage!.referenceAssetId).toBe('up-face');
  });

  it('refuses a bundled sample, a non-picture, a missing asset, and another character’s canonical image', () => {
    const s = drawn();
    expect(codeOf(() => setCanonicalImage(s, 'nour', { assetId: 'portrait-layla' }))).toBe('INVALID');
    expect(codeOf(() => setCanonicalImage(s, 'nour', { assetId: 'take-01' }))).toBe('INVALID');
    expect(codeOf(() => setCanonicalImage(s, 'nour', { assetId: 'nope' }))).toBe('NOT_FOUND');
    expect(codeOf(() => setCanonicalImage(s, 'nobody', { assetId: 'img-2' }))).toBe('NOT_FOUND');
    const hana = { ...ch(s, 'hana'), usage: { known: true, videos: [] } };
    const s2: StudioState = { ...s, characters: s.characters.map((c) => (c.id === 'hana' ? hana : c)) };
    expect(errOf(() => setCanonicalImage(s2, 'hana', { assetId: 'img-1' })).message).toMatch(/Nour’s canonical image/);
  });
});

describe('approveCanonicalImage', () => {
  it('approves the current version: APPROVED with the command’s clock; again is a no-op', () => {
    const r = runCommand(drawn(), cmd('approveCanonicalImage', ['nour', 1]));
    expect(ch(r.state, 'nour').canonicalImage).toMatchObject({ status: 'APPROVED', version: 1, approvedAt: '2026-10-03T10:00:00.000Z' });
    expect(ch(r.state, 'nour').canonicalImage!.approvalOverride).toBeUndefined();
    expect(approveCanonicalImage(r.state, 'nour', 1)).toBe(r.state);
  });

  it('refuses when there is no image (INVALID) and a stale version (CONFLICT — never approve what was not reviewed)', () => {
    expect(codeOf(() => approveCanonicalImage(withPictures(), 'nour', 1))).toBe('INVALID');
    const s = setCanonicalImage(drawn(), 'nour', { assetId: 'img-2' });
    const e = errOf(() => approveCanonicalImage(s, 'nour', 1));
    expect(e.code).toBe('CONFLICT');
    expect(e.details).toMatchObject({ currentVersion: 2, requestedVersion: 1 });
    // an approved image is not re-approved under an old version either
    const approved = approveCanonicalImage(s, 'nour', 2);
    expect(codeOf(() => approveCanonicalImage(approved, 'nour', 1))).toBe('CONFLICT');
  });

  it('a failed check needs an override with a reason, which is recorded', () => {
    const s = setCanonicalImage(withPictures(), 'nour', { assetId: 'img-1', check: { ok: false, notes: ['feet out of frame'] } });
    const refused = errOf(() => approveCanonicalImage(s, 'nour', 1));
    expect(refused.code).toBe('INVALID');
    expect(refused.message).toMatch(/feet out of frame/);
    expect(codeOf(() => approveCanonicalImage(s, 'nour', 1, { override: true }))).toBe('INVALID');
    expect(codeOf(() => approveCanonicalImage(s, 'nour', 1, { override: true, reason: '   ' }))).toBe('INVALID');
    const r = runCommand(s, cmd('approveCanonicalImage', ['nour', 1, { override: true, reason: 'The crop is intended: a seated pose.' }]));
    expect(ch(r.state, 'nour').canonicalImage).toMatchObject({ status: 'APPROVED', approvalOverride: { reason: 'The crop is intended: a seated pose.', at: '2026-10-03T10:00:00.000Z' } });
    // the next redraw clears the override with the approval
    const redrawn = setCanonicalImage(r.state, 'nour', { assetId: 'img-2' });
    expect(ch(redrawn, 'nour').canonicalImage!.approvalOverride).toBeUndefined();
  });

  it('no check is not a failure (nothing applied) and does not block approval', () => {
    const s = setCanonicalImage(withPictures(), 'nour', { assetId: 'img-1' });
    expect(ch(approveCanonicalImage(s, 'nour', 1), 'nour').canonicalImage!.status).toBe('APPROVED');
  });
});

describe('the lock (APPEARANCE_LOCKED once the character is in a video)', () => {
  it('a take records the canonical image version the character had', () => {
    const s = lockedNour();
    expect(appearanceLock(ch(s, 'nour')).locked).toBe(true);
    expect(ch(s, 'nour').usage!.videos.at(-1)).toMatchObject({ takeId: expect.any(String), canonicalImageVersion: 1 });
  });

  it('refuses redraw, replacement and approval changes for a used character, and for one with unknown history', () => {
    const s = pic(lockedNour(), 'img-9');
    expect(codeOf(() => setCanonicalImage(s, 'nour', { assetId: 'img-9' }))).toBe('APPEARANCE_LOCKED');
    expect(codeOf(() => approveCanonicalImage(s, 'nour', 1))).toBe('APPEARANCE_LOCKED');
    expect(codeOf(() => setCanonicalImage(s, 'um-hassan', { assetId: 'img-9' }))).toBe('APPEARANCE_LOCKED');
    expect(codeOf(() => setCanonicalImage(s, 'layla', { assetId: 'img-9' }))).toBe('APPEARANCE_LOCKED');
    // through the command path too (the server runs exactly this)
    expect(codeOf(() => runCommand(s, cmd('setCanonicalImage', ['nour', { assetId: 'img-9' }])))).toBe('APPEARANCE_LOCKED');
    // its picture cannot be deleted or moved off CANONICAL
    expect(codeOf(() => deleteAsset(s, 'img-1'))).toBe('ASSET_PROTECTED');
    expect(codeOf(() => setAssetTier(s, 'img-1', 'RAW'))).toBe('APPEARANCE_LOCKED');
    expect(preflightCharacter(s, ch(s, 'nour'), 'CHARACTER_APPEARANCE').checks.find((c) => c.name === 'appearance-unlocked')!.ok).toBe(false);
  });

  it('harmless metadata stays editable when locked: name, Arabic name, role, personality, notes', () => {
    const s = lockedNour();
    const before = ch(s, 'nour');
    const after = ch(updateCharacter(s, 'nour', { name: 'Nour H.', nameAr: 'نور ح.', role: 'Singer and songwriter', personality: 'Quiet, then not.', notes: 'Prefers dusk.' }), 'nour');
    expect(after).toMatchObject({ name: 'Nour H.', nameAr: 'نور ح.', role: 'Singer and songwriter', personality: 'Quiet, then not.', notes: 'Prefers dusk.' });
    expect(after.canonicalImage).toEqual(before.canonicalImage);
    // the look is not
    expect(codeOf(() => updateCharacter(s, 'nour', { hair: 'Shaved' }))).toBe('APPEARANCE_LOCKED');
  });

  it('a whole-form save never writes the canonical image (locked or not)', () => {
    const locked = lockedNour();
    const forged: CanonicalImage = { assetId: 'img-2', status: 'APPROVED', version: 7, generatedAt: 'x' };
    expect(ch(updateCharacter(locked, 'nour', { canonicalImage: forged, notes: 'n' }), 'nour').canonicalImage).toEqual(ch(locked, 'nour').canonicalImage);
    const open = drawn();
    expect(ch(updateCharacter(open, 'nour', { canonicalImage: forged }), 'nour').canonicalImage).toEqual(ch(open, 'nour').canonicalImage);
  });
});

describe('asset tiers', () => {
  it('setAssetTier moves a picture between SECONDARY, RAW and none; CANONICAL is reserved to canonical images', () => {
    let s = drawn();
    s = setAssetTier(s, 'img-2', 'SECONDARY');
    expect(asset(s, 'img-2')!.tier).toBe('SECONDARY');
    s = setAssetTier(s, 'img-2', 'RAW');
    expect(asset(s, 'img-2')!.tier).toBe('RAW');
    expect(setAssetTier(s, 'img-2', 'RAW')).toBe(s);
    s = setAssetTier(s, 'img-2', null);
    expect(asset(s, 'img-2')!.tier).toBeUndefined();
    expect(codeOf(() => setAssetTier(s, 'img-2', 'CANONICAL'))).toBe('INVALID');
    expect(codeOf(() => setAssetTier(s, 'img-1', 'SECONDARY'))).toBe('INVALID');
    expect(setAssetTier(s, 'img-1', 'CANONICAL')).toBe(s);
    expect(codeOf(() => setAssetTier(s, 'take-01', 'RAW'))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('setAssetTier', ['img-2', 'GOLD'])))).toBe('INVALID');
  });

  it('a general asset patch never moves a tier', () => {
    const s = drawn();
    const after = updateAsset(s, 'img-1', { label: 'Nour — canonical', tier: 'RAW' } as never);
    expect(asset(after, 'img-1')).toMatchObject({ label: 'Nour — canonical', tier: 'CANONICAL' });
  });

  it('an unused character’s canonical image is not deleted from under it; after a redraw the old one can go', () => {
    const s = drawn();
    expect(codeOf(() => deleteAsset(s, 'img-1'))).toBe('ASSET_PROTECTED');
    const redrawn = setCanonicalImage(s, 'nour', { assetId: 'img-2' });
    const gone = deleteAsset(redrawn, 'img-1');
    expect(asset(gone, 'img-1')).toBeUndefined();
    expect(ch(gone, 'nour').canonicalImage!.assetId).toBe('img-2');
  });

  it('deleting a character keeps its picture, as RAW', () => {
    const s = deleteCharacter(drawn(), 'nour');
    expect(asset(s, 'img-1')).toMatchObject({ tier: 'RAW' });
  });
});

describe('primaryImageOf', () => {
  it('canonical image, else the legacy portrait, else none', () => {
    const s = drawn();
    expect(primaryImageOf(ch(s, 'nour'))).toBe('img-1');
    expect(primaryImageSourceOf(ch(s, 'nour'))).toBe('CANONICAL');
    expect(primaryImageSrc(s, ch(s, 'nour'))).toBe('/api/media/img-1');
    expect(primaryImageOf(ch(s, 'layla'))).toBe('portrait-layla');
    expect(primaryImageSourceOf(ch(s, 'layla'))).toBe('PORTRAIT');
    expect(primaryImageOf({ ...ch(s, 'layla'), portraitAssetId: undefined })).toBeUndefined();
    expect(primaryImageSourceOf({ ...ch(s, 'layla'), portraitAssetId: undefined })).toBeNull();
  });
});

describe('preflight', () => {
  const rl2 = (s: StudioState) => { const p = s.productions.find((x) => x.id === 'river-lights')!; return { p, sh: p.shots.find((x) => x.id === 'rl-2')! }; };

  it('a take warns "identity not approved" for a DRAFT image and passes the image check with it', () => {
    const s = drawn(); const { p, sh } = rl2(s);
    const r = preflightTake(s, p, sh, { backend: 'local', customPrompt: true });
    expect(r.checks.find((c) => c.name === 'every-character-has-image')).toMatchObject({ ok: true });
    expect(r.checks.find((c) => c.name === 'identity-reference-present')).toMatchObject({ ok: true, detail: '1 character image(s)' });
    expect(r.warnings).toEqual([expect.objectContaining({ name: 'identity-approved', characterIds: ['nour'], detail: expect.stringMatching(/identity not approved: Nour \(draft v1\)/) })]);
    // the warning never turns into a failed check
    expect(r.checks.some((c) => c.name === 'identity-approved')).toBe(false);
  });

  it('no warning once approved', () => {
    const s = approveCanonicalImage(drawn(), 'nour', 1); const { p, sh } = rl2(s);
    expect(preflightTake(s, p, sh, { backend: 'local', customPrompt: true }).warnings).toEqual([]);
  });

  it('fails (MISSING_REFERENCE) when a character in the shot has no image at all', () => {
    const s0 = seed();
    const s: StudioState = { ...s0, characters: s0.characters.map((c) => (c.id === 'nour' ? { ...c, portraitAssetId: undefined } : c)) };
    const { p, sh } = rl2(s);
    const r = preflightTake(s, p, sh, { backend: 'local', customPrompt: true });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === 'every-character-has-image')).toMatchObject({ ok: false, failureClass: 'MISSING_REFERENCE', detail: expect.stringMatching(/no canonical image for Nour/) });
    expect(r.warnings[0].detail).toMatch(/Nour \(no canonical image\)/);
  });

  it('a legacy character still passes on its portrait (and is told its identity is not approved)', () => {
    const s0 = seed();
    const portrait = ch(s0, 'nour').portraitAssetId!;
    expect(portrait).toBeTruthy();
    const s: StudioState = { ...s0, assets: s0.assets.map((a) => (a.id === portrait ? { ...a, sample: false, mimeType: 'image/png' } : a)) };
    const { p, sh } = rl2(s);
    const r = preflightTake(s, p, sh, { backend: 'local', customPrompt: true });
    expect(r.checks.find((c) => c.name === 'every-character-has-image')).toMatchObject({ ok: true, detail: expect.stringMatching(/legacy portrait for Nour/) });
    expect(r.warnings[0].detail).toMatch(/legacy portrait, no canonical image/);
  });

  it('character jobs: secondary material is drawn from the primary image; a redraw of an approved image is announced', () => {
    const approved = approveCanonicalImage(drawn(), 'nour', 1);
    const refs = preflightCharacter(approved, ch(approved, 'nour'), 'CHARACTER_REFS');
    expect(refs.checks.find((c) => c.name === 'primary-image-usable')).toMatchObject({ ok: true, detail: 'canonical image ready' });
    expect(refs.warnings).toEqual([]);
    const redraw = preflightCharacter(approved, ch(approved, 'nour'), 'CHARACTER_APPEARANCE');
    expect(redraw.ok).toBe(true);
    expect(redraw.warnings.map((w) => w.name)).toEqual(['approved-identity-redrawn']);
    const draft = drawn();
    expect(preflightCharacter(draft, ch(draft, 'nour'), 'VOICE_BUILD', { mode: 'MANUAL', providerVoiceId: 'v' }).warnings.map((w) => w.name)).toEqual(['identity-approved']);
    // nothing usable to draw from: the sample portrait is a placeholder
    const none = seed();
    expect(preflightCharacter(none, ch(none, 'nour'), 'CHARACTER_REFS').checks.find((c) => c.name === 'primary-image-usable')).toMatchObject({ ok: false, failureClass: 'MISSING_REFERENCE' });
    expect(preflightPlan(rl2(none).p).warnings).toEqual([]);
  });
});

describe('command schemas (malformed arguments are INVALID before any reducer runs)', () => {
  it('setCanonicalImage / approveCanonicalImage / setAssetTier', () => {
    const s = drawn();
    expect(codeOf(() => runCommand(s, cmd('setCanonicalImage', ['nour'])))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('setCanonicalImage', ['nour', { assetId: 'img-2', check: { notes: ['x'] } }])))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('setCanonicalImage', ['nour', { assetId: 'img-2', seed: 'forty' }])))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('approveCanonicalImage', ['nour', 0])))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('approveCanonicalImage', ['nour', '1'])))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('approveCanonicalImage', ['nour', 1, { override: 'yes' }])))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('setAssetTier', ['img-2'])))).toBe('INVALID');
    const r = runCommand(s, cmd('setCanonicalImage', ['nour', { assetId: 'img-2' }]));
    expect(ch(r.state, 'nour').canonicalImage).toMatchObject({ assetId: 'img-2', version: 2, generatedAt: '2026-10-03T10:00:00.000Z' });
  });
});

describe('persistence round trip (what the saver writes is what the loader assembles)', () => {
  /** What Postgres hands back: jsonb and every other column through JSON (nulls kept). */
  const viaDb = <T>(row: T): T => JSON.parse(JSON.stringify(row)) as T;
  const h = (c: Character) => canonical({ ...c, usage: { known: c.usage?.known ?? false } });

  it('canonical image ⇄ columns, including an approval override', () => {
    const img: CanonicalImage = { assetId: 'img-1', status: 'APPROVED', version: 3, jobId: 'job-3', seed: 7, referenceAssetId: 'up-face', engine: 'qwen-image-2512', identityLine: 'Cartoon. …', check: { ok: false, notes: ['style drift'] }, generatedAt: '2026-10-03T09:00:00.000Z', approvedAt: '2026-10-03T09:05:00.000Z', approvalOverride: { reason: 'intended', at: '2026-10-03T09:05:00.000Z' } };
    const cols = viaDb(canonicalToColumns(img));
    expect(cols.canonicalAssetId).toBe('img-1');
    expect(cols.canonicalImage).not.toHaveProperty('assetId');
    expect(canonical(canonicalFromColumns(cols, () => 'never'))).toBe(canonical(img));
    expect(canonicalToColumns(undefined)).toEqual({ canonicalAssetId: null, canonicalImage: null });
    expect(canonicalFromColumns({ canonicalAssetId: null, canonicalImage: null }, () => 'never')).toBeUndefined();
    // written outside the studio: a column without metadata is a DRAFT v1 dated by its asset; metadata alone is nothing
    expect(canonicalFromColumns({ canonicalAssetId: 'img-1', canonicalImage: null }, () => '2026-01-01T00:00:00.000Z')).toEqual({ assetId: 'img-1', status: 'DRAFT', version: 1, generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(canonicalFromColumns({ canonicalAssetId: null, canonicalImage: cols.canonicalImage }, () => 'never')).toBeUndefined();
  });

  it('a character with a canonical image fingerprints the same after the round trip (no spurious rewrite)', () => {
    const s = approveCanonicalImage(drawn(), 'nour', 1);
    for (const c of [ch(s, 'nour'), ch(s, 'layla')]) {
      const row = viaDb(characterRow(c));
      const back = characterFromRow(row as never, c.usage?.videos ?? [], (id) => asset(s, id)?.createdAt);
      expect(h(back)).toBe(h(c));
      expect(back.canonicalImage).toEqual(c.canonicalImage);
    }
    expect(viaDb(characterRow(ch(s, 'nour')))).toMatchObject({ canonicalAssetId: 'img-1', canonicalImage: { status: 'APPROVED', version: 1 } });
    expect(viaDb(characterRow(ch(s, 'layla')))).toMatchObject({ canonicalAssetId: null, canonicalImage: null });
  });

  it('asset tier and the usage record’s image version round-trip', () => {
    const s = setCanonicalImage(drawn(), 'nour', { assetId: 'img-2' });
    for (const id of ['img-1', 'img-2', 'img-3', 'portrait-layla']) {
      const a = asset(s, id)!;
      const back = assetFromRow(viaDb(assetRow(a)) as never);
      expect(canonical(back)).toBe(canonical(a));
    }
    expect(viaDb(assetRow(asset(s, 'img-1')!))).toMatchObject({ tier: 'RAW' });
    expect(viaDb(assetRow(asset(s, 'img-3')!))).toMatchObject({ tier: null });
    const locked = lockedNour();
    const v = ch(locked, 'nour').usage!.videos.at(-1)!;
    const row = viaDb(usageRow('nour', v));
    expect(row.canonicalImageVersion).toBe(1);
    expect(canonical(usageFromRow({ ...row, id: 1 } as never))).toBe(canonical(v));
    const legacy = ch(seed(), 'layla').usage!.videos[0];
    expect(canonical(usageFromRow({ ...viaDb(usageRow('layla', legacy)), id: 2 } as never))).toBe(canonical(legacy));
  });
});
