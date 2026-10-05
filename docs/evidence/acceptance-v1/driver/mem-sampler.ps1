# Sample container memory (docker stats) every ~4 s into var/acc-docker-mem.log (acceptance-v1 evidence of host RAM).
$out = 'D:\volexar-studio\volexar-studio\var\acc-docker-mem.log'
while ($true) {
  $t = (Get-Date).ToUniversalTime().ToString('HH:mm:ss')
  $rows = docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
  foreach ($r in $rows) { Add-Content -Path $out -Value "$t $r" -Encoding utf8 }
  Start-Sleep 4
}
