#requires -version 5
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$auditRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '_archive/audit-2026-10-12'))
$fixtureRoot = Join-Path $auditRoot ('build-selfcheck-' + [guid]::NewGuid().ToString('N'))
$node = (Get-Command node -ErrorAction Stop).Source
$shell = Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $shell)) { $shell = Join-Path $PSHOME 'powershell.exe' }
$pinned = (Get-Content -LiteralPath (Join-Path $repoRoot 'extensions/nebulagrab/manifest.json') -Raw | ConvertFrom-Json).key
if (-not $pinned) { throw 'The fixture requires an established pinned extension identity.' }
$originalTemp = $env:TEMP
$originalAppData = $env:APPDATA

try {
  foreach ($case in @('missing', 'mismatch')) {
    $caseRoot = Join-Path $fixtureRoot $case
    $fixtureTools = Join-Path $caseRoot 'tools'
    $fixtureExtension = Join-Path $caseRoot 'extensions/fixture'
    $fixtureTemp = Join-Path $caseRoot 'temp'
    $fixtureProfile = Join-Path $caseRoot 'profile'
    New-Item -ItemType Directory -Path $fixtureTools, $fixtureExtension, $fixtureTemp, $fixtureProfile -Force | Out-Null
    foreach ($file in @('build.ps1', 'pubkey.cjs', 'validate-extension.mjs')) {
      Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $fixtureTools $file)
    }
    $manifestPath = Join-Path $fixtureExtension 'manifest.json'
    $manifest = [ordered]@{ manifest_version = 3; name = 'Fixture'; short_name = 'Fixture'; version = '1.0.0'; key = $pinned }
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    $before = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
    $keyPath = Join-Path $fixtureTools 'keys/fixture.pem'
    if ($case -eq 'mismatch') {
      New-Item -ItemType Directory -Path (Split-Path $keyPath) -Force | Out-Null
      $generate = "const fs=require('node:fs'),crypto=require('node:crypto');const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});fs.writeFileSync(process.argv[1],privateKey.export({type:'pkcs8',format:'pem'}));"
      & $node -e $generate $keyPath
      if ($LASTEXITCODE -ne 0) { throw 'Could not generate the isolated mismatched test key.' }
      $keyBefore = (Get-FileHash -LiteralPath $keyPath -Algorithm SHA256).Hash
    }

    $env:TEMP = $fixtureTemp
    $env:APPDATA = $fixtureProfile
    $stdout = Join-Path $caseRoot 'stdout.txt'
    $stderr = Join-Path $caseRoot 'stderr.txt'
    $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f (Join-Path $fixtureTools 'build.ps1')), '-Opera', ('"{0}"' -f $node), '-NoZip', '-NoLaunch')
    $process = Start-Process -FilePath $shell -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $output = (Get-Content -LiteralPath $stdout -Raw) + (Get-Content -LiteralPath $stderr -Raw)
    if ($process.ExitCode -eq 0) { throw "$case signing-key case unexpectedly succeeded: $output" }
    $expected = if ($case -eq 'missing') { 'Signing key missing' } else { 'Signing key mismatch' }
    if ($output -notlike "*$expected*") { throw "$case failed for an unexpected cause: $output" }
    if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ne $before) { throw "$case changed the pinned source manifest." }
    if ($case -eq 'mismatch' -and (Get-FileHash -LiteralPath $keyPath -Algorithm SHA256).Hash -ne $keyBefore) { throw 'The mismatched private key was replaced.' }
    if ($case -eq 'missing' -and (Test-Path -LiteralPath $keyPath)) { throw 'A missing pinned key was replaced with a new identity.' }
    Write-Host "PASS $case pinned signing key: build failed and source identity was preserved."
  }
} finally {
  $env:TEMP = $originalTemp
  $env:APPDATA = $originalAppData
  $resolved = [IO.Path]::GetFullPath($fixtureRoot)
  if (-not $resolved.StartsWith($auditRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing fixture cleanup outside audit directory: $resolved"
  }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
