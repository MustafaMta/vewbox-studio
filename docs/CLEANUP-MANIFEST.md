# Cleanup manifest — 2026-10-02 17:49 (before the studio restructuring)

Phase 0 of the restructuring directive: stop every production job, remove the application's generated and
demonstration content, keep everything that is source, configuration, credentials, weights or infrastructure.

## 0.1 Shutdown (done before this manifest)

| Target | Found | Action | After |
|---|---|---|---|
| Host worker (`tsx src/worker/index.ts`, detached) | 1 process tree (PIDs 19844, 5516, 8816, 21744) | stopped | 0 worker processes |
| Active jobs | 12 (8 GENERATE_TAKE, 3 PRODUCE, 1 DIALOGUE_AUDIO) | cancel requested on all; no executor remains; rows cleared in 0.2 | — |
| ComfyUI queue | 1 running + 1 pending prompt | queue cleared, interrupted, models unloaded (`/free`) | 0 / 0 |
| IndexTTS, Habibi, Whisper services | models loaded | `/unload` on all three | idle |
| ffmpeg / ffprobe on the host | none | — | none |
| Hosted MiniMax tasks | none (no key on this machine) | — | none |
| Background watchers (tool tasks) | 1 | stopped | none |
| GPU | 21.8 GB used, 100 % | | 2.7 GB (Ollama resident), 0 % |

Not stopped (infrastructure, not production work): `db`, `web` (production container on :4300), `comfyui`,
`llm`, `asr`, `tts`, `tts-habibi` containers; the Next.js dev server on :4200.

## 0.2 What is removed

### Database (`vewbox` on `vewbox-db-1`) — via the application's own reset to an empty studio

| Table | Rows | Why it goes |
|---|---|---|
| shows | 3 (`last-sip`, `paper-kites` = bundled demos; `show-43bfb1ac46` = acceptance test) | demonstration / test productions |
| seasons | 4 | belong to the shows |
| productions | 11 (s1e1, s1e2, s2e1, night-tray, paper-boats, river-lights, rooftop-radio = demos; short-ac783798af, short-8b07ac3c8e, mv-a7647388aa, ep-8eaf6bc28d = acceptance tests) | demonstration / test productions |
| scenes / shots / takes | 23 / 99 / 98 | belong to the productions |
| characters | 11 (7 bundled demo, 4 created by test runs) | demonstration / test |
| locations | 9 (6 bundled demo, 3 created by test runs) | demonstration / test |
| assets | 485: 129 SAMPLE (bundled), 202 GENERATED, 151 DERIVED, 3 UPLOAD (test voice clips made by the test runs, not user material) | generated / demo content |
| jobs / job_events | 249 / 560 | completed, failed and cancelled demonstration jobs |
| proposals | 2 | demo proposals |
| metrics | 679 | measurements of the demo runs (the numbers are already recorded in the docs) |

**Kept**: `settings` (1 row), `models` (33: the weight registry), `workflows` (10: template versions) — infrastructure
data; the schema and Drizzle migrations.

### Files

| Path | Contents | Action |
|---|---|---|
| `var/library/` (video 94 files 696 MB, image 200 / 136 MB, audio 22 / 60 MB, subtitle 40) | every generated and derived media file of the demo and test productions | moved to `var/backups/library-before-cleanup-<ts>/` (outside the application's library root); the library root is recreated empty |
| Docker volume `vewbox_comfyin` | reference pictures and audio uploaded to ComfyUI for generations | files deleted |
| Docker volume `vewbox_comfyout` | ComfyUI's generated outputs (`vewbox/*`) | files deleted |
| Docker volume `vewbox_workertmp` | empty | — |
| `var/*.mp4 *.wav *.png *.flac *.audio *.hdr *.json *.py *.ts *.zip *.srt *.err` (≈330 scratch files, ≈1 GB), `var/design/` (1473 UI iteration screenshots), `var/stems/` | scratch and render artifacts of the test runs | deleted |
| `var/backups/` | database dumps and the library archive from earlier today | kept |
| `var/*.log` | build and worker logs | kept |

### Kept on purpose

Source code and Git history; `.env`, `.env.local`, `.env.example`; `docker/`, `compose.yaml`; the model weights
volume `vewbox_models` (143 GB) and the Ollama volume; the Postgres volume (its contents are reset through the
application, the database stays); `docs/` including `docs/evidence/` (the documentation's own evidence files, part of
the repository); `tests/fixtures/` (test inputs, code); `public/` sample media (part of the shipped UI samples —
not re-seeded into the empty studio).

Nothing is deleted outside `var/`, the two ComfyUI volumes and the application's own database rows.

## 0.2 Result (executed 2026-10-02 17:51)

| Step | Outcome |
|---|---|
| Database dump | `var/backups/vewbox-before-cleanup-20261002-1749.sql` (1.8 MB) |
| Library backup | `var/backups/library-before-cleanup-20261002-1751/` — 356 files, 892 MB (a copy, taken before the reset) |
| Application reset (`POST /api/studio/reset {kind: empty, keepSettings: true}`) | version 1456; 249 jobs removed; every generated library file removed by the reset; 0 files left under `var/library/` |
| ComfyUI volumes `vewbox_comfyin` (106 files, 108 MB) and `vewbox_comfyout` (200 files, 303 MB) | emptied (0 entries each) |
| `var/` scratch (≈330 files ≈1 GB), `var/design/`, `var/stems/` | removed; `var/backups/` and `var/*.log` kept |
| `metrics` | truncated (679 rows) |

## 0.3 Clean baseline (verified)

| Check | Result |
|---|---|
| Database rows | shows 0 · seasons 0 · productions 0 · scenes 0 · shots 0 · takes 0 · characters 0 · locations 0 · assets 0 · jobs 0 · job_events 0 · proposals 0 · metrics 0 · settings 1 · models 33 · workflows 10 |
| `GET /api/health` (dev :4200 and production container :4300) | ok, db reachable, queue 0/0/0/0 |
| `GET /api/status` | video: local MiniMax H3 in ComfyUI 0.38.1 on the RTX 5090; story: qwen3:14b; images: Qwen-Image; voice: IndexTTS; transcription: large-v3 — all reachable |
| `GET /api/studio` | empty snapshot, seeded `{kind: empty}` |
| Worker processes | none running (the worker is started again only when the restructured backend is in place) |
| ComfyUI queue / GPU | 0 running, 0 pending; ≈2.7 GB resident (Ollama), 0 % utilisation |
| UI | home page renders the empty studio (screenshot in the restructuring log) |
