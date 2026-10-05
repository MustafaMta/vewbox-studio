# Sample the RTX 5090 every 2 s (time, VRAM used, utilisation) into var/acc-gpu-2s.csv (acceptance GPU evidence).
$out = 'D:\volexar-studio\volexar-studio\var\acc-gpu-2s.csv'
while ($true) {
  $r = nvidia-smi --query-gpu=timestamp,memory.used,utilization.gpu --format=csv,noheader
  Add-Content -Path $out -Value $r -Encoding utf8
  Start-Sleep -Milliseconds 1850
}
