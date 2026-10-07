import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { joinLyrics } from '@/domain/lyrics';
import type { Character, LyricSection, Production, Song } from '@/domain/types';
import { LYRIC_KINDS, sings, type VoiceType } from '@/domain/vocabulary';
import { json as llmJson, type LlmMessage, type LlmOptions, type LlmResult } from '../providers/llm';
import { ACE_KEYS } from '../workflows/music';

/** THE SONG PLAN (master plan Phase 2): the planner writes ONE song for a production — concept, structure, lyrics,
 *  tempo, key, the musical caption the song engine reads, and WHO sings each section. Only characters cast as singers
 *  (SINGER / ACTOR_SINGER) may sing; a song never claims a performer it does not name, and an actor never sings the
 *  lead. The plan becomes the production's Song; the recording is GENERATE_SONG's (src/worker/handlers/music.ts). */

/** A performer as the planner is told about them. */
export interface SongPerformer { id: string; name: string; sex: Character['sex']; voiceType?: VoiceType; styles: string[] }

/** Who may sing in a production: its cast members who sing (the given ids when the producer chose, in that order). */
export function songPerformers(cast: Character[], chosen?: string[]): SongPerformer[] {
  const singers = cast.filter((c) => sings(c.kind ?? 'ACTOR'));
  const picked = chosen?.length ? chosen.map((id) => singers.find((c) => c.id === id)).filter((c): c is Character => Boolean(c)) : singers;
  return picked.map((c) => ({ id: c.id, name: c.name, sex: c.sex, voiceType: c.singing?.voiceType, styles: c.singing?.styles ?? [] }));
}

/** The vocal the song engine is asked for, from the singers' own profiles (never a random voice): "female soprano lead
 *  vocal", a duet "male baritone and female soprano vocal duet". Pure (tested). */
export function vocalTag(performers: Array<Pick<SongPerformer, 'sex' | 'voiceType'>>): string {
  const one = (p: Pick<SongPerformer, 'sex' | 'voiceType'>) => [p.sex === 'FEMALE' ? 'female' : 'male', p.voiceType ? p.voiceType.toLowerCase().replace('_', '-') : null].filter(Boolean).join(' ');
  if (!performers.length) return '';
  if (performers.length === 1) return `${one(performers[0])} lead vocal`;
  return `${performers.slice(0, 2).map(one).join(' and ')} vocal duet`;
}

const kindOf = z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase().replace(/[- ]/g, '_') : v), z.enum(LYRIC_KINDS));
const SongPlanSchema = z.object({
  title: z.string().trim().min(1).max(80),
  concept: z.string().trim().min(10).max(600),
  genre: z.string().trim().min(2).max(80),
  mood: z.string().trim().min(2).max(80),
  bpm: z.coerce.number().int().min(50).max(200),
  key: z.string().trim().max(20),
  caption: z.string().trim().min(10).max(300),
  sections: z.array(z.object({ kind: kindOf, lyrics: z.string().trim().max(1200), singers: z.array(z.string().trim().min(1).max(80)).max(4).default([]) })).min(3).max(10),
});
export type SongPlan = z.infer<typeof SongPlanSchema>;

/** Ask the planner for the song. `brief`: the producer's words for this song (optional). */
export async function writeSongPlan(p: Production, performers: SongPerformer[], req: { seconds: number; brief?: string }, opts: LlmOptions & { onResult?: (r: LlmResult) => void } = {}): Promise<SongPlan> {
  if (!performers.length) throw new StudioError('INVALID', 'Nobody in this cast sings: cast a Singer or an Actor + Singer (Characters › Performs), then write the song.', { productionId: p.id, failureClass: 'INVALID_INPUT' });
  const who = performers.map((s) => `- ${s.name}: ${s.sex === 'FEMALE' ? 'woman' : 'man'}${s.voiceType ? `, ${s.voiceType.toLowerCase().replace('_', '-')}` : ''}${s.styles.length ? `, sings ${s.styles.join(', ')}` : ''}`).join('\n');
  const sectionsFor = req.seconds <= 75 ? '3–4 sections (verse, chorus, verse or bridge, chorus)' : req.seconds <= 150 ? '5–7 sections (intro optional, verse, chorus, verse, chorus, bridge, final chorus)' : '6–9 sections';
  const system: LlmMessage = { role: 'system', content: 'You are the songwriter of Vewbox Studio, an AI film studio. You write ONE original, singable English song for a production: a clear concept, a strong memorable chorus, natural rhymes and stresses, lines a singer can breathe through. Never quote or imitate an existing song, artist or lyric. Answer with ONE JSON object only.' };
  const user = `Write the song for "${p.title}" (${p.kind === 'MUSIC_VIDEO' ? 'a music video' : 'a production'}).
${p.logline ? `Logline: ${p.logline}\n` : ''}${req.brief?.trim() ? `The producer asks: """${req.brief.trim()}"""\n` : ''}Length: about ${Math.round(req.seconds)} seconds, so ${sectionsFor}.
The singers — ONLY these may sing, by these exact names:
${who}
Return JSON: { title, concept (2–3 sentences: what the song is about and how it feels), genre, mood, bpm (a whole number), key (like "D minor"), caption (one line for the music engine: genre, instruments, production and feel — no names, no lyrics), sections: [ { kind: one of ${LYRIC_KINDS.join('|')}, lyrics (the lines, one per line, in English; empty for an instrumental section), singers: [names from the list who sing this section; the first is the lead] } ] }.
Every sung section names at least one singer from the list. Choruses repeat their words. Keep each line under 12 words.`;
  const r = await llmJson(SongPlanSchema, [system, { role: 'user', content: user }], { ...opts, maxTokens: 3000, temperature: 0.8 });
  opts.onResult?.(r.result);
  return r.data;
}

/** The plan as the production's Song: sections with their singers (names resolved to the cast who sing — an unknown
 *  or non-singing name is refused, never guessed), the lead first; lyrics tagged for the engine; the key valid for
 *  the engine (or dropped). Pure (tested). */
export function songFromPlan(plan: SongPlan, performers: SongPerformer[], seconds: number, previous?: Song): Song {
  const byName = (n: string) => performers.find((s) => s.name.toLowerCase() === n.trim().toLowerCase()) ?? performers.find((s) => s.name.split(' ')[0].toLowerCase() === n.trim().split(' ')[0].toLowerCase());
  const each = seconds / plan.sections.length;
  const sections: LyricSection[] = plan.sections.map((s, i) => {
    const sung = s.kind !== 'INSTRUMENTAL' && Boolean(s.lyrics.trim());
    const ids = s.singers.map((n) => { const hit = byName(n); if (!hit && sung) throw new StudioError('PROVIDER', `The song plan gives a section to “${n}”, who is not one of this song's singers (${performers.map((x) => x.name).join(', ')}).`, { failureClass: 'PROVIDER' }); return hit?.id; }).filter((x): x is string => Boolean(x));
    if (sung && !ids.length) throw new StudioError('PROVIDER', `The song plan leaves section ${i + 1} (${s.kind.toLowerCase()}) without a singer.`, { failureClass: 'PROVIDER' });
    return { id: nid('sec'), kind: s.kind, text: sung ? s.lyrics.trim() : '', singerIds: [...new Set(ids)], from: Math.round(i * each), to: Math.round((i + 1) * each) };
  });
  const order = [...new Set(sections.flatMap((s) => s.singerIds))];
  const key = ACE_KEYS.find((k) => k.toLowerCase() === plan.key.trim().toLowerCase());
  return {
    id: previous?.id ?? nid('song'), title: plan.title, source: 'GENERATED_EXAMPLE', durationSeconds: Math.round(seconds),
    caption: plan.caption, sections, singerIds: order, lyrics: joinLyrics(sections), genre: plan.genre, mood: plan.mood, bpm: plan.bpm,
    ...(key ? { key } : {}), concept: plan.concept,
  };
}
