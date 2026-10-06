@echo off
rem Vewbox watchdog at sign-in (Task Scheduler "Vewbox watchdog", runs as the user, not elevated).
rem Attaches the model store (D:\models\vewbox-models.vhdx), starts Docker Desktop, the worker and the web server
rem OUTSIDE the Claude app's job if they are down, and keeps watching (never kills, never resets). docs/MODELS-STORAGE.md
rem The checkout is this script's parent folder (D:\vewbox), so the task follows the repository wherever it lives.
cd /d "%~dp0.."
"D:\tools\node\node.exe" "node_modules\tsx\dist\cli.mjs" scripts\docker-watchdog.ts --fix --worker --web --watch 60 >> var\docker-watchdog.log 2>&1
