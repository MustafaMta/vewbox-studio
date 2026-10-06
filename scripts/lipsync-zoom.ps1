# Before/after zoom of chosen frames of one corrected take (for looking at it): the speaker's face from the corrector's
# track at each frame, original above, corrected below, each tile 400 px wide.
#   powershell -File scripts/lipsync-zoom.ps1 <original.mp4> <corrected.mp4> <track.json> <out.jpg> 88,92,96,100
param([string]$Orig, [string]$Corr, [string]$Track, [string]$Out, [string]$Frames)
$t = Get-Content $Track -Raw | ConvertFrom-Json
$fs = $Frames.Split(',') | ForEach-Object { [int]$_ }
$parts = @(); $i = 0
$filter = ''
foreach ($f in $fs) {
  $b = $t.boxes[$f]; if (-not $b) { $b = ($t.boxes | Where-Object { $_ })[0] }
  $w = $b[2] - $b[0]; $h = $b[3] - $b[1]
  $x = [Math]::Max(0, [int]($b[0] - 0.2 * $w)); $y = [Math]::Max(0, [int]($b[1] + 0.25 * $h)); $cw = [int](1.4 * $w); $ch = [int](0.95 * $h)
  $filter += "[0]select='eq(n\,$f)',crop=${cw}:${ch}:${x}:${y},scale=400:420,setsar=1[o$i];[1]select='eq(n\,$f)',crop=${cw}:${ch}:${x}:${y},scale=400:420,setsar=1[c$i];[o$i][c$i]vstack[p$i];"
  $parts += "[p$i]"; $i++
}
$filter += ($parts -join '') + "hstack=inputs=$i"
if ($i -eq 1) { $filter = $filter.Replace('[p0]hstack=inputs=1', '[p0]null') }
ffmpeg -v error -y -i $Orig -i $Corr -filter_complex $filter -frames:v 1 -q:v 2 $Out
