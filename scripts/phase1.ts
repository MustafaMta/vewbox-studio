/* PHASE 1 — CHARACTER FOUNDATION (the producer's order, 2026-10-09: "VEWBOX STUDIO — FULL CREATIVE RESET").
 *
 * Three characters, all Actor + Singer, all speaking English and Iraqi Arabic: A Realistic, B Anime, C Cartoon. For
 * each, ONE request per artifact and no retries of a creative result (infrastructure retries reuse the same seed):
 *
 *   create <A|B|C>   CREATE_CHARACTER: Qwen3.8 writes the sheet → Qwen-Image-2512 draws ONE canonical front
 *                    full-body image → ONE designed original voice (VoxCPM2 design, a synthetic voice — nobody cloned),
 *                    pinned as the identity with a profile per language (English: MOSS; Iraqi: Habibi + MOSS compare)
 *   lines <A|B|C>    the producer's lines, one generation each: five English (MOSS) and five Iraqi spoken by Habibi
 *                    and by MOSS once each, from the same reference
 *   status           what exists
 *
 *   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/phase1.ts create A
 *
 * No H3, no video, no song, no location, no story. Idempotent: a second run adopts the jobs of the first. */
import type { JobPayload } from '@/domain/jobs';

type Key = 'A' | 'B' | 'C';
const IRAQI = { language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
const LANGUAGES = [{ language: 'EN' as const }, IRAQI];

/** The briefs Qwen3.8 designs from: who the performer is, never the look in detail (the design model writes it). */
export const CHARACTERS: Record<Key, { style: 'REALISTIC' | 'ANIME' | 'CARTOON'; brief: string; singing: { voiceType: 'MEZZO_SOPRANO' | 'TENOR' | 'BARITONE'; styles: string[]; languages: Array<'EN' | 'AR'> }; emotional: string; long: string; iraqiLong: string }> = {
  A: {
    style: 'REALISTIC',
    brief: 'A Baghdad-born stage actor and singer in her early thirties who has lived in London for years and speaks English and Iraqi Arabic natively; private off stage, observant and quietly funny. Contemporary everyday clothes.',
    singing: { voiceType: 'MEZZO_SOPRANO', styles: ['Iraqi folk', 'acoustic ballad'], languages: ['EN', 'AR'] },
    emotional: 'I kept every letter you sent me. Every single one.',
    long: 'You know, the first time I sang on a real stage, my hands were shaking so badly I nearly dropped the microphone, but the moment the music started, all of that just disappeared.',
    iraqiLong: 'أول مرة غنيت گدام ناس، چانت إيدي ترجف، بس من بدت الموسيقى نسيت كلشي وصرت بس أغني.',
  },
  B: {
    style: 'ANIME',
    brief: 'An anime-style young man of about nineteen, a music student from Baghdad who sings and acts in his university theatre troupe and speaks English and Iraqi Arabic; earnest, stubborn and loyal. Casual student clothes.',
    singing: { voiceType: 'TENOR', styles: ['pop', 'Iraqi maqam'], languages: ['EN', 'AR'] },
    emotional: "I'm not running away this time. Not ever again.",
    long: "Every morning I take the long way past the river, because that's where my grandfather used to practise his songs, and I swear sometimes I can still hear him humming along with the water.",
    iraqiLong: 'كل يوم الصبح أمشي من صوب الشط، لأن جدي چان يغني هناك، وأحس بعدني أسمع صوته وياي.',
  },
  C: {
    style: 'CARTOON',
    brief: 'A cartoon street musician in his fifties from Baghdad, round and theatrical, who plays the oud, sings at weddings and in the markets and speaks English and Iraqi Arabic; generous, loud and endlessly hopeful. An original design, not based on any existing studio character.',
    singing: { voiceType: 'BARITONE', styles: ['Iraqi chalghi', 'wedding songs'], languages: ['EN', 'AR'] },
    emotional: "Oh, don't cry, little one. Everything's going to be alright, I promise.",
    long: "Gather round, everybody, because tonight I'm going to play you the song my mother taught me when I was smaller than this guitar, and if you know the chorus, you'd better sing it loud!",
    iraqiLong: 'تعالوا يا جماعة، هسه راح أغنيلكم الأغنية اللي علمتني ياها أمي من چنت زغيرون، واللي يعرف الكورس خل يغني وياي!',
  },
};

/** The producer's lines, word for word (not rewritten). */
export const ENGLISH = ["It's good to finally meet you.", 'Come in. You must be tired after that journey.', 'We need to leave before the storm reaches us.'];
export const IRAQI_LINES = ['شلونك؟ صارلي هواية ما شايفك.', 'گلتلك باچر نكعد نحچي ونشرب چاي.', 'يمعود لا تشيل هم، كلشي يصير زين.', 'هسه لازم نروح، قبل لا يتغير الجو.'];

export function linesFor(key: Key) {
  const c = CHARACTERS[key];
  return {
    english: [...ENGLISH, c.emotional, c.long].map((text, i) => ({ id: `en-${i + 1}`, text })),
    iraqi: [...IRAQI_LINES, c.iraqiLong].map((text, i) => ({ id: `iq-${i + 1}`, text })),
  };
}

async function main() {
  const [cmd, k] = process.argv.slice(2);
  const { enqueue } = await import('@/server/jobs/queue');
  const { db } = await import('@/server/db/client');
  const { sql } = await import('drizzle-orm');
  const created = async (key: Key): Promise<string | undefined> => {
    // the latest creation that made the character (attempt 1, or an explicit regeneration after a root-cause fix)
    const r = await db().execute(sql`select result->>'characterId' as id from jobs where (idempotency_key = ${`phase1:create:${key}`} or idempotency_key like ${`phase1:create:${key}:%`}) and result->>'characterId' is not null order by created_at desc limit 1`);
    const rows = (r as unknown as { rows?: Array<{ id: string | null }> }).rows ?? (r as unknown as Array<{ id: string | null }>);
    return rows?.[0]?.id ?? undefined;
  };
  if (cmd === 'create') {
    const key = k as Key;
    const c = CHARACTERS[key];
    if (!c) throw new Error('create A|B|C');
    const payload: JobPayload<'CREATE_CHARACTER'> = { mode: 'AUTO', brief: c.brief, style: c.style, language: 'EN', languages: LANGUAGES, profile: { kind: 'ACTOR_SINGER', singing: c.singing }, voice: { mode: 'AUTOMATIC' } };
    // --attempt N: an EXPLICIT regeneration after the root cause of attempt N-1 was fixed (never automatic)
    const n = Number(process.argv[process.argv.indexOf('--attempt') + 1]);
    const attempt = process.argv.includes('--attempt') && n > 1 ? n : 1;
    const r = await enqueue({ type: 'CREATE_CHARACTER', payload, idempotencyKey: `phase1:create:${key}${attempt > 1 ? `:${attempt}` : ''}` });
    console.log(JSON.stringify({ character: key, attempt, job: r.job.id, created: r.created, status: r.job.status }));
    return;
  }
  if (cmd === 'lines') {
    const key = k as Key;
    const id = await created(key);
    if (!id) throw new Error(`character ${key} has not been created yet (or its creation has not finished)`);
    const { english, iraqi } = linesFor(key);
    const jobs: Array<{ line: string; engine: string; job: string; created: boolean }> = [];
    const add = async (line: { id: string; text: string }, extra: Partial<JobPayload<'VOICE_PREVIEW'>>, engine: string) => {
      const r = await enqueue({ type: 'VOICE_PREVIEW', payload: { characterId: id, text: line.text, ...extra }, idempotencyKey: `phase1:line:${key}:${line.id}:${engine}`, maxAttempts: 2 });
      jobs.push({ line: line.id, engine, job: r.job.id, created: r.created });
    };
    for (const l of english) await add(l, {}, 'moss');
    for (const l of iraqi) { await add(l, { ...IRAQI }, 'habibi'); await add(l, { ...IRAQI, engine: 'moss' }, 'moss'); }
    console.log(JSON.stringify({ character: key, characterId: id, jobs }, null, 1));
    return;
  }
  if (cmd === 'profiles') {
    // the languages the character speaks, and their profiles on the voice it already has — routing only, nothing is
    // spoken or regenerated (character A lost its languages on read before the voice was built, 2026-10-09)
    const key = k as Key;
    const id = await created(key);
    if (!id) throw new Error(`character ${key} has not been created yet`);
    const { readState, commands } = await import('@/server/studio/engine');
    const { languageProfilesFor } = await import('@/worker/handlers/voice');
    const { sameLanguage, spokenLanguages } = await import('@/domain/voice-identity');
    let c = (await readState()).state.characters.find((x) => x.id === id)!;
    if (spokenLanguages(c).length < LANGUAGES.length) { await commands([{ name: 'setSpokenLanguages', args: [id, LANGUAGES] }], 'worker'); c = (await readState()).state.characters.find((x) => x.id === id)!; }
    const v = c.voice.identity;
    if (!v) throw new Error(`${c.name} has no voice yet`);
    const missing = languageProfilesFor(c, v, v.origin).slice(1).filter((p) => !v.languageProfiles?.some((x) => sameLanguage(x, p)));
    if (missing.length) await commands([{ name: 'addVoiceLanguageProfiles', args: [id, missing] }], 'worker');
    c = (await readState()).state.characters.find((x) => x.id === id)!;
    console.log(JSON.stringify({ character: key, name: c.name, languages: c.voice.languages, profiles: c.voice.identity?.languageProfiles, revision: c.voice.identity?.revision }, null, 1));
    return;
  }
  if (cmd === 'status') {
    for (const key of ['A', 'B', 'C'] as Key[]) console.log(key, (await created(key)) ?? '—');
    return;
  }
  throw new Error('usage: phase1.ts create <A|B|C> | lines <A|B|C> | status');
}

if (process.argv[1]?.endsWith('phase1.ts')) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
