[CmdletBinding()]
param(
    [switch]$SkipNpmInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-NpmCommand {
    $npmCommand = Get-Command -Name "npm.cmd" -ErrorAction SilentlyContinue
    if ($null -eq $npmCommand) {
        $npmCommand = Get-Command -Name "npm" -ErrorAction SilentlyContinue
    }

    if ($null -eq $npmCommand) {
        throw "npm is not available in PATH."
    }

    return $npmCommand.Source
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$frontendDir = Join-Path -Path $repoRoot -ChildPath "frontend"
$playwrightCli = Join-Path -Path $frontendDir -ChildPath "node_modules\.bin\playwright.cmd"
$npm = Get-NpmCommand

Push-Location $frontendDir
try {
    if (-not $SkipNpmInstall) {
        Write-Host "Installing frontend npm dependencies..."
        & $npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    }

    if (-not (Test-Path -LiteralPath $playwrightCli)) {
        throw "Playwright CLI not found at $playwrightCli. Run npm install in frontend first."
    }

    Write-Host "Installing Chromium browser for Playwright..."
    & $playwrightCli install chromium
    if ($LASTEXITCODE -ne 0) {
        throw "playwright install chromium failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host "Playwright Chromium installation completed." -ForegroundColor Green
