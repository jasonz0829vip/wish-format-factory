# Requires Node.js and an installed Chromium/Chrome browser. Isolated acceptance only.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$lab = Join-Path $env:TEMP ('wish-pdf-preview-qa-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$live = 'C:\Users\Admin\MobileTools\wish-factory'
$sample = Join-Path (Join-Path $live 'NativeFormatTests') 'bordered-table.pdf'
$archive = Join-Path $lab 'feature.zip'
$source = 'https://codeload.github.com/jasonz0829vip/wish-format-factory/zip/refs/heads/feat/pdf-visual-preview-20261018'
New-Item -ItemType Directory -Force -Path $lab | Out-Null
Write-Output ('LAB=' + $lab)
Write-Output ('LIVE_SERVICE_UNCHANGED=' + $live)
if (-not (Test-Path $sample)) { throw ('Missing existing test PDF: ' + $sample) }
Invoke-WebRequest -Uri $source -OutFile $archive -TimeoutSec 65 -UseBasicParsing
if (-not (Test-Path $archive)) { throw 'Download failed' }
Expand-Archive -Path $archive -DestinationPath (Join-Path $lab 'source') -Force
$project = Get-ChildItem (Join-Path $lab 'source') -Directory | Select-Object -First 1
if (-not $project) { throw 'Archive empty' }
Push-Location $project.FullName
try {
  Write-Output '=== REGRESSION TESTS ==='
  & node --test checks/format-regression.cjs checks/pdf-preview-contract.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed' }
  Write-Output '=== BROWSER TEST ==='
  $existing = Join-Path $live 'node_modules'
  $env:NODE_PATH = $existing
  $hasPlaywright = (Test-Path (Join-Path $existing 'playwright')) -or (Test-Path (Join-Path $existing 'playwright-core'))
  if (-not $hasPlaywright) {
    Write-Output 'Playwright not found in existing node_modules; installing playwright-core in disposable lab directory.'
    $deps = Join-Path $lab 'runner-deps'
    New-Item -ItemType Directory -Force -Path $deps | Out-Null
    & npm install --prefix $deps --no-save --ignore-scripts --no-audit --no-fund playwright-core@1.55.0
    if ($LASTEXITCODE -ne 0) { throw 'Could not obtain isolated Playwright dependency; UI unverified' }
    $env:NODE_PATH = $existing + ';' + (Join-Path $deps 'node_modules')
  }
  $chromeChoices = @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe', (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
  $chrome = $chromeChoices | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($chrome) { $env:CHROME_PATH = $chrome; Write-Output ('CHROME=' + $chrome) }
  $env:PREVIEW_SCREENSHOT = Join-Path $lab 'pdf-preview-acceptance.png'
  & node checks/pdf-preview-e2e.cjs $sample
  if ($LASTEXITCODE -ne 0) { throw 'Real-browser PDF preview test failed' }
  Write-Output ('E2E_SCREENSHOT=' + $env:PREVIEW_SCREENSHOT)
  Write-Output 'FINAL_STATUS=PASS; live v0.10.1 untouched.'
} finally {
  Pop-Location
}
