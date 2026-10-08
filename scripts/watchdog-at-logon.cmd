@echo off
rem Vewbox watchdog at sign-in (Task Scheduler "Vewbox watchdog", runs as the user, not elevated; at sign-in and every
rem 10 minutes). Attaches the model store (D:\models\vewbox-models.vhdx), starts Docker Desktop, the worker and the web
rem server OUTSIDE the Claude app's job if they are down, and keeps watching (never kills, never resets).
rem docs/MODELS-STORAGE.md
rem The watcher is started DETACHED and hidden (--start-self): run in this console it was killed by a Ctrl+C after the
rem 2026-10-08 15:17 boot and nothing restarted it. A watcher already running keeps the lock; a second one exits.
rem The launcher logs to its own file: the running watcher holds var\docker-watchdog.log open.
rem The checkout is this script's parent folder (D:\vewbox), so the task follows the repository wherever it lives.
cd /d "%~dp0.."
"D:\tools\node\node.exe" "node_modules\tsx\dist\cli.mjs" scripts\docker-watchdog.ts --start-self --fix --worker --web --watch 60 >> var\watchdog-launcher.log 2>&1
