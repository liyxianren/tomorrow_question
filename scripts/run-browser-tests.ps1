[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet("smoke", "full")]
    [string]$Mode = "smoke"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$frontendDir = Join-Path -Path $repoRoot -ChildPath "frontend"
$playwrightCli = Join-Path -Path $frontendDir -ChildPath "node_modules\.bin\playwright.cmd"
$configPath = Join-Path -Path $frontendDir -ChildPath "playwright.config.ts"

if (-not (Test-Path -LiteralPath $playwrightCli)) {
    throw "Playwright CLI not found at $playwrightCli. Run scripts/install-playwright.ps1 first."
}

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Playwright config not found at $configPath."
}

$arguments = @(
    "test",
    "--config", $configPath,
    "--project", "chromium",
    "--pass-with-no-tests"
)

if ($Mode -eq "smoke") {
    $arguments += "./e2e/lobby-room.spec.ts"
}

$env:PLAYWRIGHT_TEST_MODE = $Mode

Push-Location $frontendDir
try {
    Write-Host "Running Playwright browser suite mode=$Mode"
    & $playwrightCli @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Playwright browser suite failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    Remove-Item Env:PLAYWRIGHT_TEST_MODE -ErrorAction SilentlyContinue
}

Write-Host "Playwright browser suite completed mode=$Mode" -ForegroundColor Green
