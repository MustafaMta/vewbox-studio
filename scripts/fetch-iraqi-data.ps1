# THE LICENSED IRAQI DATA FETCH (the master directive §7, §41): resumable, verified, one file at a time, into
# D:\vewbox-data\training\iraqi\raw\<source>\ — never into the model store, never modified afterwards.
#   1. facebook/omnilingual-asr-corpus (CC BY 4.0): the Iraqi rows (acm_Arab, ayp_Arab) as parquet, sha256 = the LFS oid
#   2. hayderkharrufa/iraqi-dialect-tts-corpus (CC BY 4.0): the Google Drive zip (no published hash: ours is recorded on
#      first complete download), expanded beside it
# Idempotent: a verified file is skipped; a partial file resumes (curl -C -). Writes var/state/iraqi-data-ready when done.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fetch-iraqi-data.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$root = 'D:\vewbox-data\training\iraqi\raw'
$log = 'var/iraqi-data-fetch.log'
function Say($m) { "$((Get-Date).ToUniversalTime().ToString('s'))Z $m" | Out-File -FilePath $log -Append -Encoding utf8 }
function Fetch($url, $dest, $sha, $bytes) {
  New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
  if ((Test-Path $dest) -and (Test-Path "$dest.sha256")) { if ((Get-Content "$dest.sha256") -eq $sha -or -not $sha) { return $true } }
  for ($n = 1; $n -le 20; $n++) {
    curl.exe -sS -L -C - --retry 10 --retry-all-errors --retry-delay 15 --max-time 7200 -o $dest $url
    $ok = ($LASTEXITCODE -eq 0) -or ($LASTEXITCODE -eq 33) # 33 = range not satisfiable: already complete
    if ($ok -and (Test-Path $dest)) {
      if ($bytes -and (Get-Item $dest).Length -lt $bytes) { Say "$dest incomplete ($((Get-Item $dest).Length) of $bytes); resuming"; Start-Sleep 20; continue }
      $got = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
      if ($sha -and $got -ne $sha) { Say "$dest sha256 mismatch ($got); downloading again"; Remove-Item $dest -Force; continue }
      $got | Out-File "$dest.sha256" -Encoding ascii
      Say "verified $dest $((Get-Item $dest).Length) bytes sha256 $got"
      return $true
    }
    Say "$dest attempt $n failed (curl $LASTEXITCODE); resuming in 20 s"; Start-Sleep 20
  }
  return $false
}
Say 'START iraqi data'
$omni = @(
  @{ p = 'data/acm_Arab/train-00000-of-00001.parquet'; b = 496350074; s = 'c01f6e3c573960a03c49b3ecf48970c669285c8a6c4497fa1d1a117106e11aaa' },
  @{ p = 'data/ayp_Arab/train-00000-of-00003.parquet'; b = 370427696; s = 'c1ccd1be2e12ba5495c71d12e1ffe97fcd9ce95865d773a457507b5032db833e' },
  @{ p = 'data/ayp_Arab/train-00001-of-00003.parquet'; b = 340210460; s = 'f87aa861fb319b10c3c2a7a103fe9039e402c219e7d4a70b3190cadfd49c630c' },
  @{ p = 'data/ayp_Arab/train-00002-of-00003.parquet'; b = 309745139; s = '195544e95e9d4ad8d6e435fd57a3822aa7ed8146108d1b16490d854fd338195a' },
  @{ p = 'data/ayp_Arab/dev-00000-of-00001.parquet';   b = 364676364; s = '6188329f5c79462abc59b2fa39f7be058a47170c31376e738efb7939263ddf6e' },
  @{ p = 'data/ayp_Arab/test-00000-of-00001.parquet';  b = 307668203; s = 'dd4823e0b00698f5565e3c2739aa07827b623b1a6bcb26e29d98419cba82f5f8' }
)
$rev = '8648ba8946377697b427ae952076e49fc0e5e44d'
foreach ($f in $omni) {
  $dest = Join-Path $root "omnilingual-asr-corpus-iraqi\$($f.p -replace '/', '\')"
  if (-not (Fetch "https://huggingface.co/datasets/facebook/omnilingual-asr-corpus/resolve/$rev/$($f.p)" $dest $f.s $f.b)) { Say "STOPPED: $($f.p)"; exit 1 }
}
# the Kharrufa corpus zip from Google Drive (large-file confirm form bypassed by the usercontent endpoint)
$zip = Join-Path $root 'iraqi-dialect-tts-corpus\iraqi-dialect-tts-corpus.zip'
if (-not (Fetch 'https://drive.usercontent.google.com/download?id=1iQ-ueye2pLFavy-2HWDEOhscD_wn_7ie&export=download&confirm=t' $zip $null 0)) { Say 'STOPPED: the corpus zip'; exit 1 }
$fs = [IO.File]::OpenRead($zip); $hb = New-Object byte[] 4; $fs.Read($hb, 0, 4) | Out-Null; $fs.Close(); $head = $hb -join ','
if ($head -ne '80,75,3,4') { Say "STOPPED: the corpus download is not a zip (first bytes $head) - Google Drive returned a page; download it by hand into $zip"; Remove-Item "$zip.sha256" -Force -ErrorAction SilentlyContinue; exit 1 }
$out = Join-Path $root 'iraqi-dialect-tts-corpus\extracted'
if (-not (Test-Path $out)) { Expand-Archive -Path $zip -DestinationPath $out -Force; Say "expanded to $out" }
New-Item -ItemType Directory -Force var/state | Out-Null
(Get-Date).ToUniversalTime().ToString('s') | Out-File var/state/iraqi-data-ready -Encoding ascii
Say 'DONE iraqi data'
