# Contact sheet + waveform of a clip: sheet.ps1 <input.mp4> <outPrefix> [fps=4] [cols=6] [width=320]
param([string]$in, [string]$out, [double]$fps = 4, [int]$cols = 6, [int]$w = 320)
$ErrorActionPreference = 'Stop'
$dur = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 $in)
$n = [Math]::Ceiling($dur * $fps)
$rows = [Math]::Ceiling($n / $cols)
ffmpeg -loglevel error -y -i $in -vf "fps=$fps,scale=${w}:-2,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=4:color=black" -frames:v 1 "$out-sheet.jpg"
ffmpeg -loglevel error -y -i $in -filter_complex "showwavespic=s=1600x240:split_channels=0:colors=0x66ccff" -frames:v 1 "$out-wave.png"
"$in duration=$dur frames@$fps=$n"
