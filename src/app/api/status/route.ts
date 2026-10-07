import { capabilities, env } from '@/server/env';
import { json, route } from '@/server/http';
import { videoBackendStatus } from '@/server/providers/video';
import * as comfy from '@/server/providers/comfy';
import { plannerBase, resolveProvider } from '@/server/providers/llm';
import { VOICE_ENGINES, englishEngine } from '@/server/providers/voice-engines';
import { vllmSleeping } from '@/server/providers/vllm';
import { llmDisplayName } from '@/domain/llm-names';

export const dynamic = 'force-dynamic';

async function probe(url: string, timeoutMs = 2500): Promise<{ ok: boolean; detail?: string; data?: Record<string, unknown> }> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { signal: ctrl.signal }); const data = (await r.json().catch(() => ({}))) as Record<string, unknown>; return { ok: r.ok, detail: r.ok ? undefined : `HTTP ${r.status}`, data }; }
  catch (e) { return { ok: false, detail: (e as Error).name === 'AbortError' ? 'timeout' : 'unreachable' }; }
  finally { clearTimeout(t); }
}

/** Live engine status for the Settings page: what runs where, and whether it is reachable right now. */
export const GET = route(async () => {
  const e = env();
  const voiceEngine = englishEngine(e.VOICE_ENGINE_EN);
  const voiceUrl = String(e[VOICE_ENGINES[voiceEngine].urlEnv] || VOICE_ENGINES[voiceEngine].defaultUrl).replace(/\/$/, '');
  const caps = capabilities();
  const [video, comfyHealth, tts, asr, design, habibi] = await Promise.all([videoBackendStatus(), comfy.health(), probe(`${voiceUrl}/health`), probe(`${e.ASR_URL}/health`), probe(`${e.TTS_DESIGN_URL}/health`), probe(`${e.TTS_HABIBI_URL}/health`)]);
  // THE LOCAL HELPERS THE CHECKS AND VOICES NEED (the engine room says which one is offline, with the service's own
  // reason): word timing and picture QA from the asr service's capabilities, voice design and the Iraqi voice engine
  const cap = (asr.data?.capabilities ?? {}) as { align?: { en?: { available?: boolean; reason?: string | null; model?: string }; ar?: { available?: boolean; reason?: string | null; model?: string } }; qa_mouth?: { available?: boolean; reason?: string | null; model?: string }; qa_identity?: { available?: boolean; reason?: string | null; model?: string }; syncnet?: { available?: boolean; reason?: string | null } };
  const helper = (c: { available?: boolean; reason?: string | null; model?: string } | undefined, down: string) => (!asr.ok ? { ok: false, detail: `transcription service ${asr.detail ?? 'unreachable'}` } : !c ? { ok: false, detail: down } : { ok: Boolean(c.available), detail: c.available ? c.model ?? 'ready' : c.reason ?? down });
  const checks = {
    alignEn: { name: 'Word timing, English', does: 'Times each word of a recorded line', ...helper(cap.align?.en, 'not offered by this transcription service') },
    alignAr: { name: 'Word timing, Arabic', does: 'Times each word of an Arabic line', ...helper(cap.align?.ar, 'not offered by this transcription service') },
    lipSync: { name: 'Lip-sync check', does: 'Mouth movement against the recorded lines', ...helper(cap.qa_mouth, 'not offered by this transcription service') },
    faceIdentity: { name: 'Face check', does: 'Faces against their canonical images', ...helper(cap.qa_identity, 'not offered by this transcription service') },
    voiceDesign: { name: 'Voice design', does: 'Designs a voice from a description', ok: design.ok, detail: design.ok ? String(design.data?.engine ?? 'ready') : `voice-design service ${design.detail}` },
    iraqiVoice: { name: 'Iraqi voices', does: 'Speaks Iraqi Arabic lines', ok: habibi.ok, detail: habibi.ok ? String(habibi.data?.engine ?? 'ready') : `Iraqi voice service ${habibi.detail}` },
  };
  let story: { ok: boolean; detail: string; where: 'hosted' | 'local' | null } = { ok: false, detail: 'not configured', where: null };
  try {
    const cfg = resolveProvider();
    const p = await probe(`${cfg.baseUrl}/models`); const ids = ((p.data?.data as Array<{ id: string }> | undefined) ?? []).map((m) => m.id); const has = ids.some((id) => id === cfg.model || id.startsWith(cfg.model));
    const name = llmDisplayName(cfg.model);
    // the planner sleeps while another family holds the card: it is ready, it wakes on the next story job
    const asleep = p.ok ? await vllmSleeping(plannerBase(cfg.baseUrl)) : undefined;
    story = { ok: p.ok && has, detail: p.ok ? (has ? `${name} (vLLM${asleep ? ', asleep: wakes for the next story job' : ''})` : `${name} not served (${ids.length} models present)`) : `unreachable: ${p.detail}`, where: 'local' };
  } catch (err) { story = { ok: false, detail: (err as Error).message, where: null }; }
  let images: { ok: boolean; detail: string } = { ok: false, detail: 'ComfyUI unreachable' };
  let music: { ok: boolean; detail: string } = { ok: Boolean(e.MINIMAX_API_KEY), detail: e.MINIMAX_API_KEY ? 'MiniMax Music (hosted)' : 'no engine' };
  if (comfyHealth.ok) {
    const models = await comfy.listModels('diffusion_models').catch(() => [] as string[]);
    const q = models.some((m) => m.includes('qwen_image'));
    images = { ok: q, detail: q ? `Qwen-Image in ComfyUI ${comfyHealth.version ?? ''} on ${comfyHealth.device ?? 'GPU'}` : 'ComfyUI up; Qwen-Image weights not downloaded yet' };
    const ace = models.some((m) => m.startsWith('acestep')); const m3 = models.some((m) => m.startsWith('minimax_music3'));
    if (!e.MINIMAX_API_KEY) music = { ok: ace || m3, detail: ace ? 'ACE-Step 1.5 (local)' : m3 ? 'MiniMax Music 3 (local)' : 'music weights not downloaded yet' };
  }
  return json({
    video: { ok: video.ready, detail: video.detail, where: video.backend === 'api' ? 'hosted' : 'local', backend: video.backend, model: video.backend === 'api' ? caps.videoModel : 'MiniMax-H3 (open weights)' },
    story, images: { ...images, where: 'local' },
    // the engine new English voices are built and spoken with (VOICE_ENGINE_EN: MOSS-TTS), not the retired default
    voice: { ok: tts.ok, detail: tts.ok ? `${VOICE_ENGINES[voiceEngine].label}${tts.data?.loaded === false ? ' (loads on first use)' : ''}` : `${VOICE_ENGINES[voiceEngine].label} ${tts.detail}`, where: 'local' },
    transcription: { ok: asr.ok, detail: asr.ok ? String(asr.data?.model ?? 'ready') : `transcription service ${asr.detail}`, where: 'local' },
    music: { ...music, where: e.MINIMAX_API_KEY ? 'hosted' : 'local' },
    gpu: comfyHealth.ok ? { device: comfyHealth.device, vramTotal: comfyHealth.vramTotal, vramFree: comfyHealth.vramFree } : null,
    minimaxConfigured: caps.minimax,
    checks,
  }, { headers: { 'Cache-Control': 'no-store' } });
});
