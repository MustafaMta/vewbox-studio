/** THE LOCAL RESUME — the pure judgements (cloud directive 2026-10-05 §14). Every check the one-command resume makes
 *  (scripts/resume-local.mjs) is a function of what a command printed, so it is tested in the cloud and run on the
 *  workstation unchanged. Numbers are the workstation's measured needs (docs/research/GPU-STAGING-2026-10.md,
 *  docs/evidence/acceptance-v1/REPORT.md): H3 staging peaked at 45.1 of 46.8 GiB of host RAM and 31.6 of 32.6 GB VRAM. */

export const NEEDS = {
  /** host RAM the Docker VM must have: H3 alone reached 41.8 GiB; the acceptance run peaked at 45.1 of 46.8 */
  dockerMemGiB: 46,
  /** recommended (the pending .wslconfig raise): room for H3 + the voice services + the browser */
  dockerMemGiBRecommended: 64,
  gpuName: /RTX 5090/i,
  gpuMemMiB: 32000,
  /** the manifest groups the acceptance gates need (video, images, voices, transcription) */
  modelGroups: ['video-minimax-h3', 'video-minimax-h3-reference', 'images-qwen', 'images-flux2-klein', 'asr-whisper', 'voice-design', 'qa-identity'],
  /** fetched before the alignment gates (licences to confirm on the model cards first: docs/MODELS.md) */
  optionalGroups: ['qa-align'],
};

/** `docker info --format "{{json .}}"` → memory and CPUs. */
export function parseDockerInfo(text) {
  const j = JSON.parse(text);
  return { memGiB: Number(((j.MemTotal ?? 0) / 1024 ** 3).toFixed(1)), cpus: j.NCPU ?? 0, server: j.ServerVersion, os: j.OperatingSystem, runtimes: Object.keys(j.Runtimes ?? {}) };
}

export function judgeDocker(info) {
  const problems = [];
  if (info.memGiB < NEEDS.dockerMemGiB) problems.push(`Docker has ${info.memGiB} GiB of memory; MiniMax H3 staging needs ≥ ${NEEDS.dockerMemGiB} GiB (raise memory= in %USERPROFILE%\\.wslconfig, then \`wsl --shutdown\` and restart Docker Desktop)`);
  const warn = info.memGiB < NEEDS.dockerMemGiBRecommended ? `Docker has ${info.memGiB} GiB; ${NEEDS.dockerMemGiBRecommended} GiB is recommended (the pending .wslconfig memory=80GB, swap=32GB)` : undefined;
  return { ok: problems.length === 0, problems, warn, detail: `${info.memGiB} GiB, ${info.cpus} CPUs, Docker ${info.server ?? '?'}` };
}

/** `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits` → the GPUs. */
export function parseNvidiaSmi(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [name, mem, driver] = l.split(',').map((x) => x.trim()); return { name, memMiB: Number(mem), driver }; });
}

export function judgeGpu(gpus) {
  const card = gpus.find((g) => NEEDS.gpuName.test(g.name));
  if (!card) return { ok: false, problems: [`no RTX 5090 visible (${gpus.map((g) => g.name).join(', ') || 'no GPU'})`], detail: '' };
  const ok = card.memMiB >= NEEDS.gpuMemMiB;
  return { ok, problems: ok ? [] : [`${card.name} reports ${card.memMiB} MiB, under ${NEEDS.gpuMemMiB}`], detail: `${card.name}, ${card.memMiB} MiB, driver ${card.driver}` };
}

/** The models the gates need, against the fetcher's `.manifest-state.json` (docker/models/fetch.py) and the sizes on the
 *  volume (`path size` lines). A file is ready when the fetcher verified it AND it is on the volume at its size. */
export function verifyModels(manifest, state, sizes, groups = NEEDS.modelGroups) {
  const onDisk = new Map(sizes.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(' '); return [l.slice(i + 1), Number(l.slice(0, i))]; }));
  const missing = []; let ready = 0;
  const unknownGroups = groups.filter((g) => !manifest.groups.some((x) => x.name === g));
  for (const g of manifest.groups.filter((x) => groups.includes(x.name))) {
    for (const f of g.files) {
      const name = f.as ?? f.file.split('/').pop();
      const key = `${f.folder}/${name}`;
      const rec = state[key];
      const size = onDisk.get(key);
      const why = !rec?.verified ? 'not verified by the fetcher' : size === undefined ? 'not on the volume' : f.bytes && size !== Number(f.bytes) ? `size ${size}, expected ${f.bytes}` : undefined;
      if (why) missing.push({ group: g.name, file: key, why }); else ready++;
    }
  }
  return { ok: missing.length === 0 && unknownGroups.length === 0, ready, missing, unknownGroups };
}

/** `.wslconfig` → memory and swap as written (for the message; Docker's own number is what counts). */
export function parseWslConfig(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) { const m = line.match(/^\s*(memory|swap|processors)\s*=\s*(\S+)/i); if (m) out[m[1].toLowerCase()] = m[2]; }
  return out;
}

/** What the saved acceptance checkpoint says to do next, and which of its gate results a code change since then makes
 *  stale (directive §15: resume from the saved gate unless a code change invalidates that step). `changed` are the
 *  repository paths changed since the checkpoint commit. */
export function resumePlan(resume, changed) {
  const touches = (re) => changed.some((p) => re.test(p));
  const generationChanged = touches(/^src\/(worker\/handlers\/(take|images|voice)|server\/(story\/prompts|production|workflows|providers\/video))/);
  const assemblyChanged = touches(/^src\/(server\/media\/(assembly|mix|sync)|domain\/timeline|worker\/handlers\/assemble)/);
  const subtitlesChanged = touches(/^src\/server\/media\/assembly\.ts$/);
  const gates = Object.entries(resume.gate ?? {}).map(([name, verdict]) => {
    const v = String(verdict);
    // a gate measured on an existing cut stays valid unless the cut would now be assembled differently
    const stale = /^(continuousBoundary|cutBoundary|noDuplicatedGuide|noFadeOrBlack)$/.test(name) && assemblyChanged ? 'the cut is assembled by changed code: re-assemble and re-check' : undefined;
    return { name, verdict: v, open: !/^PASS/.test(v), stale };
  });
  return {
    production: resume.state?.production,
    keep: ['characters (approved, locked by use)', 'voices', 'the location plate', 'the selected takes of the checkpoint (made by the earlier code; kept as they are)'],
    newTakesUseNewCode: generationChanged,
    reassemble: assemblyChanged,
    subtitlesChanged,
    gates,
    next: resume.next ?? [],
  };
}

/** The real-generation gates of directive §16, in order: never past a failed gate without its root cause. */
export const GATES = [
  { id: 1, name: 'one English voice', proves: 'voice identity: proof line transcribed, ECAPA to the seed' },
  { id: 2, name: 'one speaking character', proves: 'audio-first take: recorded line as the authoritative audio, script heard once, no repeat' },
  { id: 3, name: 'lip-sync validation', proves: 'mouth activity inside the line windows (qa-service /qa/mouth), offset ≤ 1 frame or repaired by an audio shift' },
  { id: 4, name: 'two-shot continuous action', proves: 'tail guide, head-repeats-tail, trimmed join, same positions, motion direction kept' },
  { id: 5, name: '4–8 shot continuous scene', proves: 'chain depth and re-anchoring (REANCHOR.after), identity similarity along the chain' },
  { id: 6, name: 'intentional camera cut', proves: 'cut boundary: same moment, new framing, frame drawn at the shot framing, no tail' },
  { id: 7, name: 'scene transition', proves: 'transition boundary: destination plate and story state, nothing carried' },
  { id: 8, name: 'return to an established location', proves: 'World Bible ESTABLISHED plate, persistent location changes in the context' },
  { id: 9, name: 'complete Short', proves: 'every gate together; export watched end to end' },
  { id: 10, name: 'Music Video', proves: 'song master authoritative, performers per lyric line, no extra singers, one copy of the music' },
  { id: 11, name: '5–10 minute episode', proves: 'long-form story state, durability across restarts' },
];
