/** MUSIC STACK VALIDATION (PRODUCTION-STACK-DIRECTIVE 2026-10-06 §2–3): ONE song through the production route's own
 *  pieces, outside a production — ACE-Step 1.5 XL-SFT + the 5Hz LM 4B in ComfyUI (the graph GENERATE_SONG sends), the
 *  Demucs stems (asr /separate), Whisper large-v3 on the vocal stem + the fuzzy lyric match, then the forced alignment
 *  of the known lyrics (asr /align). Evidence under var/evidence/music-stack-v1/<run>/ (media outside Git).
 *
 *    pnpm exec tsx --env-file=.env --env-file=.env.local scripts/gpu-hold.ts --priority normal MUSIC 24000 -- \
 *      pnpm exec tsx --env-file=.env --env-file=.env.local scripts/music-validate.ts [--variant xl-sft] [--seconds 45]
 *
 *  The ComfyUI graph runs under the caller's MUSIC hold; the stems and the alignment run in the asr service afterwards
 *  (the hold is MUSIC: run this when no film job needs the card). Prints a JSON summary. */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as comfy from '../src/server/providers/comfy';
import { separateStems, transcribe } from '../src/server/providers/speech';
import { alignScript, isQaUnavailable, scriptWords } from '../src/server/providers/qa-service';
import { alignLyrics, linesFromForcedAlignment } from '../src/server/media/lyrics';
import { splitLyrics } from '../src/domain/lyrics';
import { ACE_VARIANTS, aceStepSong, type AceVariant } from '../src/server/workflows/music';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const variant = arg('--variant', 'xl-sft') as AceVariant;
const seconds = Number(arg('--seconds', '45'));
const seed = Number(arg('--seed', '20261006'));

// an original English song, verse + chorus, written for this test
const caption = 'Warm indie folk-pop, 96 BPM in G major. Fingerpicked acoustic guitar, soft brushed drums, upright bass and a light string pad. A clear, intimate male lead vocal, close-miked, gentle and hopeful; no backing choir.';
const lyrics = [
  '[Verse]',
  'Lanterns on the river, paper boats of light',
  'Every little window humming through the night',
  'I kept your name beside me like a folded map',
  'Every road I wandered only led me back',
  '',
  '[Chorus]',
  'So come on home, come on home',
  'The kettle on the fire and the door unlocked',
  'Come on home, come on home',
  'The street remembers you, the old clock never stopped',
].join('\n');

const root = path.resolve('var/evidence/music-stack-v1', `${new Date().toISOString().replace(/[:.]/g, '-')}-${variant}`);
await fsp.mkdir(root, { recursive: true });
const summary: Record<string, unknown> = { variant, settings: ACE_VARIANTS[variant], seconds, seed, caption, lyrics };

// 1) the song: the same graph the worker sends
const graph = aceStepSong({ caption, lyrics, seconds, language: 'EN', seed, variant, filenamePrefix: 'vewbox/validate-song' });
await fsp.writeFile(path.join(root, 'graph.json'), JSON.stringify(graph, null, 1));
const t0 = Date.now();
const run = await comfy.run(graph, { timeoutMs: 30 * 60_000 });
const out = comfy.firstOutput(run.outputs, 'audio');
if (!out) throw new Error('ComfyUI produced no audio');
const song = path.join(root, `song${path.extname(out.filename) || '.flac'}`);
await fsp.writeFile(song, await comfy.view(out));
summary.song = { file: song, ms: Date.now() - t0, promptId: run.promptId, workflowVersion: run.workflowVersion };
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', song]).toString());
summary.songProbe = probe;
const comfyStats = await fetch(`${process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188'}/system_stats`).then((r) => r.json()).catch(() => null);
summary.comfyAfter = comfyStats?.devices?.[0] ? { vramFreeMb: Math.round(comfyStats.devices[0].vram_free / 1048576), torchVramMb: Math.round((comfyStats.devices[0].torch_vram_total ?? 0) / 1048576) } : null;
console.error(`[music-validate] song ${song} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// 2) stems (Demucs in the asr service); ComfyUI's models are dropped first so the card is free for the asr models
await comfy.free().catch(() => undefined);
const stemsDir = path.join(root, 'stems');
const st = await separateStems(song, stemsDir);
summary.stems = st;
const vocals = st.files.vocals;
if (!vocals) throw new Error('no vocal stem');

// 3) lyric timing: Whisper on the vocal stem + the fuzzy match, then forced alignment of the known words per section
const tr = await transcribe(vocals, { language: 'en' });
const words = tr.segments.flatMap((s) => s.words ?? []).map((w) => ({ start: w.start, end: w.end, word: w.word }));
const duration = Number(probe.format?.duration ?? seconds);
const sections = splitLyrics(lyrics, duration).map((s) => ({ ...s, singerIds: [] }));
const fuzzy = alignLyrics(sections, words, 'EN');
const forced: Record<string, unknown> = {};
for (const sec of sections) {
  const lines = sec.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const mine = fuzzy.filter((l) => l.sectionId === sec.id && l.method === 'ALIGNED');
  const lo = Math.max(0, Math.min(sec.from, ...mine.map((l) => l.from)) - 1.5), hi = Math.min(duration, Math.max(sec.to, ...mine.map((l) => l.to)) + 1.5);
  const r = await alignScript(vocals, lines.join('\n'), 'en', { start: lo, end: hi });
  forced[sec.id] = isQaUnavailable(r) ? { unavailable: r.reason } : { window: [lo, hi], coverage: r.coverage, meanScore: r.meanScore, lines: linesFromForcedAlignment(lines, r.words, scriptWords).map((x, i) => ({ text: lines[i], ...(x ?? { unplaced: true }) })) };
}
summary.transcript = tr.text;
summary.fuzzy = fuzzy.map((l) => ({ text: l.text, from: Number(l.from.toFixed(2)), to: Number(l.to.toFixed(2)), method: l.method, confidence: Number(l.confidence.toFixed(2)) }));
summary.forced = forced;
await fsp.writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ root, song: summary.song, songProbe: probe.format, stems: Object.keys(st.files), transcript: tr.text.slice(0, 300), forced }, null, 1));
