@echo off
rem Runs the FireRed serial chain OUTSIDE the Claude app's process tree (a one-shot scheduled task; processes started from
rem a tool shell died mid-way on 2026-10-09). The download queue first (one network consumer), then the chain.
cd /d D:\vewbox
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\vewbox\scripts\download-queue.ps1 -Groups eval-tts-fireredtts3-base >> D:\vewbox\var\download-fireredtts3.log 2>> D:\vewbox\var\download-fireredtts3.err.log
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\vewbox\scripts\firered-chain.ps1 >> D:\vewbox\var\firered-chain.out.log 2>&1
