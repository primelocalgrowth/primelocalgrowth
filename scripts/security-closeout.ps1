$ErrorActionPreference = 'Stop'
$operator = Join-Path $env:USERPROFILE '.codex\skills\plg-security-operator\scripts\plg-security-closeout.ps1'
if (-not (Test-Path $operator)) { throw "PLG security operator skill not found at $operator" }
& $operator -Repo (Split-Path -Parent $PSScriptRoot)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
