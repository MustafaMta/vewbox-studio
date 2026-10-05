# Every frame of a stretch, cropped around a face, tiled with frame number and time (lip-sync review by eye):
# strip.ps1 <video> <out.jpg> <fromFrame> <toFrame> <cx> <cy> [size=320] [cols=12] [tile=200]
# cx/cy/size are in the video's own pixels. The audio is not in the picture: read it beside the word times.
param([string]$f, [string]$out, [int]$a, [int]$b, [int]$cx, [int]$cy, [int]$size = 320, [int]$cols = 12, [int]$tile = 200)
$x = [Math]::Max(0, $cx - [int]($size / 2)); $y = [Math]::Max(0, $cy - [int]($size / 2))
$n = $b - $a + 1; $rows = [Math]::Ceiling($n / $cols)
ffmpeg -loglevel error -y -i $f -vf "select='between(n\,$a\,$b)',crop=${size}:${size}:${x}:${y},scale=${tile}:${tile},drawtext=text='%{n}':x=4:y=4:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,drawtext=text='%{pts\:hms}':x=4:y=h-24:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=2" -fps_mode passthrough -frames:v 1 $out
"$out frames $a-$b (the label n counts from ${a}: frame = $a + n)"
