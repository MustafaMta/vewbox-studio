# Test results

Latest runs on the reference machine (Windows 11, RTX 5090, Docker Desktop/WSL2; web and worker on the host with
hot reload against the Docker database and local story engine). Dated 2026-10-02.

| Suite | Command | Result | Notes |
|---|---|---|---|
| Unit | `pnpm test` | **42 / 42** | reducers and rules (28), command engine (4), tolerant story schemas (3), access gate (3), timeline (4) |
| API (live) | `pnpm test:api` | **22 / 22** | contracts (13): health, snapshot hash, batch atomicity, APPEARANCE_LOCKED 409, uploads probed and served with Range, protected delete 423, jobs + idempotency, event stream, reset; negative (9): truncated MP4, SVG with script, empty/no-file/non-multipart, hostile media ids, take without an engine fails honestly, wrong payloads, cancel/retry states, atomic batches, oversized batches |
| Worker (live DB) | `pnpm test:worker` | **8 / 8** | stale lease reclaimed by a second worker, backoff, non-retryable, idempotency, cancel flag, backoff curve; MiniMax client: missing key → NOT_CONFIGURED, wrong key against the real api.minimax.io → terminal PROVIDER error |
| Browser (Playwright) | `pnpm e2e` | **54 / 54** in 2.3 min | desktop (53) + phone (1); includes two real Auto Idea proposals written by the local model, Arabic/RTL shell, uploads of real media, reset, jobs in Activity, the continuity rule end to end |

Bugs these runs found and fixed (details in `IMPLEMENTATION-CHECKLIST.md`): reset request aborted by navigation
(writes are now `keepalive`); jobs and settings leaking between tests (reset clears job history; tests reset
settings); external font requests failing on a slow link (fonts self-hosted); stale "kept in this browser" copy; a
fake-audio fixture the server rightly refused (real fixtures under `tests/fixtures`); worker crash when a reset deleted
a job it was finishing; NOT_CONFIGURED masked as a retryable provider error; SVG uploads accepted.

Earlier history: the first E2E run after the backend landed was 41/54, the second 49/54, the third 54/54.
