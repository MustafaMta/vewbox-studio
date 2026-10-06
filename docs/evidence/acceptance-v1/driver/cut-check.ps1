# Watch a cut or an export: probe, 2 fps contact sheet, waveform, black/freeze/silence detection, loudness over time,
# per-join frame strips and PSNR across each join vs the intra-shot frame-to-frame PSNR, and an ASR transcript with
# word times. cut-check.ps1 <file> <outDir> <joinFrame1,joinFrame2,...>
param([string]$f, [string]$out, [string]$joins = '')
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $out | Out-Null
$name = [IO.Path]::GetFileNameWithoutExtension($f)
"== probe"; ffprobe -v error -show_entries format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels,duration,nb_frames -of compact $f
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'sheet.ps1') $f (Join-Path $out "$name") 2 8 240 2>$null
"== black / freeze (video)"; ffmpeg -hide_banner -i $f -vf "blackdetect=d=0.04:pix_th=0.10,freezedetect=n=0.003:d=0.5" -an -f null - 2>&1 | Select-String -Pattern 'black_start|freeze_start|freeze_end|freeze_duration' | ForEach-Object { $_.Line.Trim() }
"== silence (audio, -45 dB, 0.3 s)"; ffmpeg -hide_banner -i $f -af silencedetect=n=-45dB:d=0.3 -vn -f null - 2>&1 | Select-String -Pattern 'silence_' | ForEach-Object { $_.Line -replace '^\[.*?\]\s*', '' }
"== loudness (EBU R128 summary)"; ffmpeg -hide_banner -i $f -af ebur128=peak=true -vn -f null - 2>&1 | Select-String -Pattern '^\s+(I:|LRA:|Peak:)' | ForEach-Object { $_.Line.Trim() }
"== short-term loudness every 0.5 s (M, momentary 400 ms)"
$m = ffmpeg -hide_banner -i $f -af "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M" -vn -f null - 2>&1 | Select-String -Pattern 'pts_time|lavfi.r128.M='
$rows = @(); $t = $null; $last = -1
foreach ($l in $m) { if ($l.Line -match 'pts_time:([\d\.]+)') { $t = [double]$Matches[1] } elseif ($l.Line -match 'M=(-?[\d\.inf]+)' -and $t -ne $null -and [Math]::Floor($t * 2) -gt $last) { $last = [Math]::Floor($t * 2); $rows += ('{0:N1}s:{1}' -f $t, $Matches[1]) } }
$rows -join '  '
if ($joins) {
  # joins as "144,264" (or space/semicolon separated: gpu-hold's shell re-splits a comma list)
  foreach ($j in ($joins -split '[,; ]+' | Where-Object { $_ })) {
    $j = [int]$j; $a = $j - 6; $b = $j + 5
    ffmpeg -loglevel error -y -i $f -vf "select='between(n\,$a\,$b)',scale=400:-2,tile=6x2:padding=2" -fps_mode passthrough -frames:v 1 (Join-Path $out "$name-join$j-frames$a-$b.jpg")
    # PSNR of consecutive frames around the join (frame k vs k+1): the join pair is ($j-1,$j)
    $tmpA = Join-Path $env:TEMP "cc-a.mp4"; $tmpB = Join-Path $env:TEMP "cc-b.mp4"
    ffmpeg -loglevel error -y -i $f -vf "select='between(n\,$($j-12)\,$($j+10))',setpts=N/24/TB" -an -c:v libx264 -qp 0 $tmpA
    ffmpeg -loglevel error -y -i $f -vf "select='between(n\,$($j-11)\,$($j+11))',setpts=N/24/TB" -an -c:v libx264 -qp 0 $tmpB
    $ps = ffmpeg -hide_banner -i $tmpA -i $tmpB -lavfi "[0:v][1:v]psnr=stats_file=-" -f null - 2>&1 | Select-String -Pattern 'psnr_avg:([\d\.inf]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }
    $k = $j - 12; $pairs = @(); foreach ($v in $ps) { $pairs += ('{0}->{1}:{2}' -f $k, ($k + 1), $v); $k++ }
    "== join at frame $j : PSNR frame k -> k+1 (dB); the join pair is $($j-1)->$j"; $pairs -join '  '
  }
}
"== ASR words"
$wav = Join-Path $env:TEMP "cc.wav"; ffmpeg -loglevel error -y -i $f -vn -ac 1 -ar 16000 $wav
$asrFile = Join-Path $out "$name-asr.json"
curl.exe -s -o $asrFile -F "file=@$wav" -F "language=en" -F "words=1" http://127.0.0.1:8030/transcribe
node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log(j.text); console.log((j.segments||[]).flatMap(s=>s.words||[]).map(w=>w.start.toFixed(2)+'-'+w.end.toFixed(2)+' '+w.word.trim()).join(' | '))" $asrFile
