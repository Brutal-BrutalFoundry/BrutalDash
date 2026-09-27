[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $root 'extension\vendor\battery-host'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:winexe /optimize+ "/out:$payload\BrutalDashBatteryHost.exe" "$payload\BrutalDashBatteryHost.cs"
if ($LASTEXITCODE -ne 0) { throw 'Battery launcher compilation failed' }
$hashes = [ordered]@{}
foreach ($file in Get-ChildItem -LiteralPath $payload -File -Recurse | Sort-Object FullName) {
    $relative = [IO.Path]::GetRelativePath($payload, $file.FullName).Replace('\', '/')
    if ($relative -match '__pycache__|\.pyc$' -or $relative -eq 'payload-sha256.json') { continue }
    $hashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$hashes | ConvertTo-Json | Set-Content -LiteralPath "$payload\payload-sha256.json" -Encoding utf8
Write-Output 'Built hidden battery launcher and recorded payload checksums.'
