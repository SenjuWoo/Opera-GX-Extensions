#requires -version 5
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$sourceRoot = Join-Path $repoRoot 'sources/nebulagrab-companion'
$releaseRoot = Join-Path $repoRoot 'Release'
$stageRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP ('nebulagrab-package-' + [guid]::NewGuid().ToString('N'))))
$files = @('server.py', 'README.md', 'CHANGELOG.md', 'LICENSE.txt', 'config.example.json',
  'setup_companion.ps1', 'setup_ffmpeg.ps1', 'show_token.bat', 'start_helper.bat', 'update_tools.bat')
$server = Get-Content -LiteralPath (Join-Path $sourceRoot 'server.py') -Raw
if ($server -notmatch '(?m)^VERSION = "(\d+\.\d+\.\d+)"') { throw 'Missing companion semantic version.' }
$version = $Matches[1]
$packageTime = [datetime]::new(2000, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)

try {
  $payload = Join-Path $stageRoot 'payload'
  New-Item -ItemType Directory -Path $payload, $releaseRoot -Force | Out-Null
  foreach ($file in $files) {
    $sourceFile = Join-Path $sourceRoot $file
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Missing companion payload: $file" }
    Copy-Item -LiteralPath $sourceFile -Destination $payload
  }
  Get-ChildItem -LiteralPath $payload -File | ForEach-Object { $_.LastWriteTimeUtc = $packageTime }
  $archive = Join-Path $stageRoot 'companion.zip'
  Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $archive -CompressionLevel Optimal
  Move-Item -LiteralPath $archive -Destination (Join-Path $releaseRoot "nebulagrab-companion-v$version.zip") -Force
  Write-Host "Companion ${version}: $($files.Count) payload files packaged; personal configuration excluded."
} finally {
  $tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $stageRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup outside temporary staging.' }
  if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
}
