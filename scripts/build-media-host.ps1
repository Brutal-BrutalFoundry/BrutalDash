[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'extension\vendor\media-host\BrutalDashMediaHost.cs'
$output = Join-Path $root 'extension\vendor\media-host\BrutalDashMediaHost.exe'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$runtime = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\UnionMetadata'
$winmd = Get-ChildItem -LiteralPath $sdkRoot -Directory |
  Where-Object { $_.Name -match '^\d+(?:\.\d+){2,3}$' } |
  Sort-Object { [version]$_.Name } -Descending |
  ForEach-Object { Join-Path $_.FullName 'Windows.winmd' } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1

if (-not (Test-Path -LiteralPath $csc)) { throw "C# compiler not found: $csc" }
if (-not $winmd) { throw 'Windows SDK UnionMetadata\*\Windows.winmd was not found.' }

& $csc /nologo /target:winexe /optimize+ "/out:$output" "/r:$winmd" "/r:$runtime\System.Runtime.WindowsRuntime.dll" "/r:$runtime\System.Runtime.dll" "/r:$runtime\System.Drawing.dll" $source
if ($LASTEXITCODE -ne 0) { throw "Native media helper compilation failed with exit code $LASTEXITCODE." }
Write-Output "Built GUI-subsystem media helper: $output"
