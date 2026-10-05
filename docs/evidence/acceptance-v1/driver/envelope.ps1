# RMS envelope (dBFS) of a file's audio between two times, in 50 ms windows: envelope.ps1 <file> <from> <to>
param([string]$f, [double]$from, [double]$to)
$len = $to - $from
$out = ffmpeg -hide_banner -ss $from -t $len -i $f -vn -af "aresample=16000,pan=mono|c0=c0,asetnsamples=800,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level" -f null - 2>&1
$t = $from
$vals = @()
foreach ($l in $out) { if ($l -match 'RMS_level=(-?[\d\.inf]+)') { $vals += ('{0:N2}:{1}' -f $t, $Matches[1]); $t += 0.05 } }
$vals -join '  '
