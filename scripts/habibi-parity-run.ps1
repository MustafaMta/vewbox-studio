# HABIBI RAW AUDIO PARITY, both arms under one TTS GPU lease (run by scripts/gpu-hold.ts). LAB TEST.
# A: upstream CLI inside the container (scripts/habibi-parity.py); B: the Vewbox service /synthesize, same seed.
param([string]$Out = "D:\vewbox\var\eval\LAB-TEST-iraqi-raw-parity-20261008", [int]$Seed = 20261008)
$ErrorActionPreference = 'Stop'
docker exec vewbox-tts-habibi-1 sh /tmp/parity/par.sh
docker cp vewbox-tts-habibi-1:/tmp/parity/out/A_upstream_cli.wav "$Out\A_upstream_cli.wav" | Out-Null
$h = curl.exe -s -D "$Out\B_headers.txt" -o "$Out\B_vewbox_service.wav" -F "text=<$Out\_gen_text.txt" -F "language=ar" -F "dialect=IRQ" -F "reference=@C:\Users\MTA\Downloads\src_habibi_tts_assets_IRQ.wav" -F "reference_text=<$Out\_ref_text.txt" -F "seed=$Seed" http://127.0.0.1:8021/synthesize
Write-Output "B done: $((Get-Item "$Out\B_vewbox_service.wav").Length) bytes"
