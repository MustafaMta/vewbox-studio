# Real-hardware fault procedures (FINAL directive §26)

Written by the reliability engineer (2026-10-06); scheduled by the coordinator. They touch the shared ComfyUI/TTS
containers and the GPU, so they run only in an agreed window, never during another engineer's GPU batch. The
fixture-based versions of the same faults run in `tests/worker/failure-recovery.test.ts`, `export-recovery.test.ts`
and `engine-faults.test.ts`.

**Prerequisite:** the host worker runs main including the reliability merges. Each run uses a scratch 5 s shot with no
dialogue that already passes preflight (on the acceptance studio, or a restored copy via `scripts/restore.ts`). Start it
with the regenerate route so it is one GENERATE_TAKE job; note `JOB=<its id>`. Record job ids and rows, and send them to
the reliability engineer for comparison with the expectations.

## R1 — ComfyUI container restart mid-H3 render

1. Regenerate the shot. Wait until `select provider_task_id, progress->>'providerStatus' from jobs where id='JOB'` shows
   a prompt id and 'generating' (H3 visible in nvidia-smi).
2. `docker restart vewbox-comfyui-1` (note T0).

**Expected**
- While ComfyUI is down, the worker logs "ComfyUI is not answering; waiting for it to come back", with no immediate
  failure.
- Within ~6 s of ComfyUI answering again, attempt 1 is FAILED with failure_class INFRASTRUCTURE and the message
  "ComfyUI no longer knows prompt <id> … can be retried". If ComfyUI was down for more than 180 s, the message is
  "stopped answering for 180 s".
- The retry comes 12–18 s later. Attempt 2 waits up to 3 min for ComfyUI's health, then RESUBMITS THE SAME prompt id
  (the ComfyUI log's prompt id equals `jobs.provider_task_id`). It renders in full (+1–2 min for the model reload) and
  ends COMPLETED.

**Verify**
- `select attempt,outcome,failure_class,resolved from job_attempts where job_id='JOB' order by attempt` returns
  (1,FAILED,INFRASTRUCTURE,true) and (2,COMPLETED,null,false).
- There is exactly ONE new take on the shot.
- The take's generationMs is the second run's engine time.
- `resource_leases` is empty afterwards.
- No `.part` or orphan files exist for the job.

## R2 — real GPU OOM during H3

1. Put an outside VRAM ballast on the card. It sits outside the studio lease, simulating a foreign process, and uses
   the local comfyui image (no download). H3 peaks at ~31.9 of 32 GB, so 8 GB is enough:
   `docker run --rm -d --gpus all --name vram-ballast --entrypoint python vewbox/comfyui:dev -c "import torch,time; x=torch.empty(int(8e9),dtype=torch.uint8,device='cuda'); time.sleep(1200)"`
2. Regenerate the shot.

**Expected**
- ComfyUI raises execution_error torch.OutOfMemoryError, and attempt 1 is FAILED with failure_class
  RESOURCE_EXHAUSTION and the message "ComfyUI ran out of GPU memory in <node> #<id>: CUDA out of memory…".
- The worker POSTs /free; the ComfyUI log shows the models unloaded.
- A job event reads "attempt 1 failed; retrying".
- The ComfyUI container stays up. If it is OOM-killed instead (exit 137 = host RAM), the run follows the R1 path
  (LOST/INFRASTRUCTURE).

**Recovery (3a):** run `docker rm -f vram-ballast` as soon as attempt 1 is FAILED (the 12–18 s backoff window).
- Attempt 2 walks the prompt key past the failed prompt (a NEW prompt id), renders, and ends COMPLETED.
- job_attempts holds (1,FAILED,RESOURCE_EXHAUSTION,resolved=true) and (2,COMPLETED). There is one take.

**Optional (3b):** keep the ballast.
- Attempts 2 and 3 are also RESOURCE_EXHAUSTION, and the job is FAILED after 3: three rows, no take.
- The retry button is offered as transient, with no "what did you change" prompt.
- If ComfyUI silently offloads and completes slowly instead of hitting OOM, record that and repeat with 16e9.

**Always** run `docker rm -f vram-ballast` at the end.

## R3 — TTS container restart mid-line (cheap, optional)

Use a shot with 2–3 English lines whose recordings are stale (or force DIALOGUE_AUDIO for that shot via regenerate
lineId). While the job shows phase 'recording', run `docker restart vewbox-tts-1`.

**Expected**
- A request refused while the container boots is resent every 3 s for up to 90 s, with the log line "speech service
  refuses connections (restarting?)". There is no failure at all.
- A request cut mid-answer fails the attempt as INFRASTRUCTURE (UNAVAILABLE). It is retried after 15 s, and the lines
  already written are kept.
- The failure is never UNKNOWN/"terminated", and never NOT_CONFIGURED unless the weights are really missing.
