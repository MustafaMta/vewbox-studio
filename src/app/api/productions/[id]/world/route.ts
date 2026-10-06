import { json, params, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { StudioError } from '@/domain/errors';
import { readState } from '@/server/studio/engine';
import { editWorld, worldView, type ProducerWorldEdit } from '@/server/world/producer';

export const dynamic = 'force-dynamic';

/** THE WORLD BIBLE OF A PRODUCTION (src/server/world/producer.ts): GET — the revision it reads (its pin, else the
 *  scope's latest, else derived and marked unrecorded; reading never writes), what a newer revision would change and
 *  which of that would change what it already filmed, the pin history. POST — the producer's own fact (a rule, a
 *  relationship, a timeline fact, or removing one they added) or the audio policy, appended as a new revision by a
 *  person: `{ action, text? | id? | audio?, characterIds?, by? }`. */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === id);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  return json(await worldView(state, p), { headers: { 'Cache-Control': 'no-store' } });
});

const ACTIONS = ['addRule', 'removeRule', 'addRelationship', 'removeRelationship', 'addEvent', 'removeEvent', 'audio'] as const;
const DIALOGUE = ['AUTO', 'MODEL_VOICE', 'RECORDED_VOICE'];
const SONG_BED = ['INSTRUMENTAL_WHEN_AVAILABLE', 'MASTER'];

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const body = await readJson<Record<string, unknown>>(req);
  const action = body.action as (typeof ACTIONS)[number];
  if (!ACTIONS.includes(action)) throw new StudioError('INVALID', `Unknown World Bible edit ${String(body.action)}.`);
  let edit: ProducerWorldEdit;
  if (action === 'audio') {
    const a = body.audio as { dialogue?: unknown; songBed?: unknown } | undefined;
    if (!a || !DIALOGUE.includes(String(a.dialogue)) || !SONG_BED.includes(String(a.songBed))) throw new StudioError('INVALID', 'The audio policy needs a dialogue and a song-bed choice.');
    edit = { action, audio: { dialogue: a.dialogue as 'AUTO', songBed: a.songBed as 'MASTER' } };
  } else if (action.startsWith('remove')) {
    if (typeof body.id !== 'string' || !body.id) throw new StudioError('INVALID', 'Which one to remove?');
    edit = { action, id: body.id } as ProducerWorldEdit;
  } else {
    edit = { action, text: String(body.text ?? ''), ...(Array.isArray(body.characterIds) ? { characterIds: body.characterIds.filter((x): x is string => typeof x === 'string') } : {}) } as ProducerWorldEdit;
  }
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === id);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim().slice(0, 80) : 'producer';
  const r = await editWorld(state, p, edit, by);
  return json({ revision: r.revision.number, created: r.created }, { status: r.created ? 201 : 200 });
});
