$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "flutter_app"

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  Write-Error "Flutter SDK is not available on PATH. Install Flutter first."
}

Push-Location $appDir
try {
  if (-not (Test-Path (Join-Path $appDir "android")) -or -not (Test-Path (Join-Path $appDir "ios"))) {
    flutter create --platforms=android,ios .
  }
  flutter pub get
  Write-Host ""
  Write-Host "Flutter app bootstrap complete."
  Write-Host "Next:"
  Write-Host "  cd flutter_app"
  Write-Host "  flutter run"
}
finally {
  Pop-Location
}
