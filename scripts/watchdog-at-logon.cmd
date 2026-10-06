@echo off
rem Vewbox watchdog at sign-in (Task Scheduler "Vewbox watchdog", runs as the user, not elevated).
rem Attaches the model store (D:\models\vewbox-models.vhdx), starts Docker Desktop, the worker and the web server
rem OUTSIDE the Claude app's job if they are down, and keeps watching (never kills, never resets). docs/MODELS-STORAGE.md
cd /d "D:\volexar-studio\volexar-studio"
"D:\tools\node\node.exe" "D:\volexar-studio\volexar-studio\node_modules\tsx\dist\cli.mjs" scripts\docker-watchdog.ts --fix --worker --web --watch 60 >> var\docker-watchdog.log 2>&1
