# MiniMax — what the API offers (verified 2026-10-02 against platform.minimax.io docs)

MiniMax is the only video provider in this studio. This note records what was verified before the client
(`src/server/providers/minimax.ts`) was written. Anything marked UNVERIFIED could not be confirmed from an official
page and is not relied on.

## Account and auth

- One key, created in the console (API Keys → "Create new secret key"). Header: `Authorization: Bearer <key>`.
  No GroupId on the international endpoints.
- International base: `https://api.minimax.io` (`/v1`, `/v2`, `/anthropic`). China: `https://api.minimax.cn`.
- Limits can be raised through api@minimax.io.

## Video

| Model | Surface | Status | Modes | Durations | Resolutions | Native audio |
|---|---|---|---|---|---|---|
| `MiniMax-H3` | `POST /v2/video_generation` | current | text, first frame, first+last frame, up to 9 reference images, up to 3 reference videos, up to 3 reference audio clips | integer 4–15 s | `768P`, `2K` | yes: stereo 32 kHz, speech in 11 languages incl. **Arabic**, dialogue as `<d>[Language] text</d>` |
| `MiniMax-H3-Max` | same | current | same | 5–15 s | `480P`, `768P` | per docs; `extra.prompt_expansion_mode` |
| `MiniMax-Hailuo-2.3` / `-Fast` / `-02`, `T2V-01*`, `I2V-01*`, `S2V-01` | `/v1/video_generation` | legacy | silent video, 6/10 s | 768P/1080P | no |

v2 lifecycle: create → `task_id`; `GET /v2/query/video_generation/{task_id}` → `status ∈ queued | running |
succeeded | failed | cancelled`, `content.url` (time-limited; re-query to refresh), `usage`; `DELETE
/v2/video_generation/{id}` cancels a queued task. Poll every 10 s. Tasks are queryable for 7 days; outputs must be
downloaded immediately (the studio stores them in its own library). Errors: HTTP status + `error.type`
(`rate_limit_error` 429, `authorized_error` 401, `insufficient_balance_error` 402, `unprocessable_entity_error` 422
moderation, `server_error` 500). Legacy v1 uses `base_resp.status_code` (1002 rate limit, 1004 auth, 1008 balance,
1026/1027 moderation, 2013 params, 2049 bad key).

Rules the client enforces: text-only requests need an explicit `ratio` (not `adaptive`); first/last-frame requests
use `ratio: adaptive`; frame roles and reference roles cannot be mixed in one request. Images: JPG/PNG/WEBP/HEIC,
≤30 MB, 256–5760 px per side, aspect 2:5–5:2, ≤12 files in total; sent as data URIs. Audio refs: WAV/MP3 ≤15 MB,
2–15 s each.

Pricing (pay as you go, USD): H3 768P $0.08/output s, 2K $0.13/s; first 5 input images free, then $0.04 each;
H3-Max 480P $0.05/s, 768P $0.08/s. Rate limit: H3 300 RPM, 30 tasks in flight. Failed/moderated tasks are not billed.
The take record stores the estimate from `estimateVideoCostUsd`.

ComfyUI also exposes MiniMax **partner nodes** (hosted calls billed through Comfy credits) — not used here; the
studio calls MiniMax directly. The **open weights** of MiniMax H3 (released 2026-08) run natively in ComfyUI ≥0.30
and are the studio's local backend when no key is set (see LOCAL-ENGINES.md).

License notes: hosted output is governed by the platform terms (https://platform.minimax.io/protocol/terms-of-service;
the clause text could not be fetched by the researcher — read it before commercial release). The open-weights
"MiniMax H3 Community License" allows commercial use below US$20M/year, requires "MiniMax H3" attribution in the UI,
claims no rights over outputs, and **excludes the EU, UK, South Korea and USA** as territories.

## Music

`POST /v1/music_generation` (`music-3.0`, `music-2.6`, `music-cover`): prompt ≤2000 chars, lyrics ≤3500 chars with
`[Intro] [Verse] [Pre Chorus] [Chorus] [Bridge] [Outro] …` tags, `is_instrumental`, `output_format hex|url`,
`audio_setting {sample_rate 44100, bitrate 256000, format mp3|wav}`. **Closed to new accounts since 2026-08-20**;
existing paying accounts keep access. No stems. The studio keeps the client and treats refusal as "use the local
engine" (ACE-Step 1.5 / MiniMax Music 3 open weights in ComfyUI).

## Speech

`POST /v1/t2a_v2` with `speech-2.8-hd` / `speech-2.8-turbo` (40 languages; `language_boost: "Arabic"`, no dialect
values), emotions `happy|sad|angry|fearful|disgusted|surprised|calm|fluent|whisper`, text <10k chars (async endpoint
for longer). Voice clone: upload 10 s–5 min (`purpose=voice_clone`) then `POST /v1/voice_clone` with a unique
`voice_id` ($1.50/voice); unused clones are deleted after 7 days. The studio's local voice stack is primary (see
AUDIO-STACK.md); MiniMax speech is available as `voiceProvider: MINIMAX` when a key exists.

## Text

`MiniMax-M3` (1M context) via the Anthropic-compatible `POST /anthropic/v1/messages` or the OpenAI-compatible
`POST /v1/chat/completions` (no `response_format` → JSON is enforced by prompting + validation + repair, which is what
`src/server/providers/llm.ts` does for every provider). $0.30 / $1.20 per M tokens in/out.
