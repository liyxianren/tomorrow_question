$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPython = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
$npmCommand = Get-Command -Name "npm.cmd" -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) {
    $npmCommand = Get-Command -Name "npm" -ErrorAction SilentlyContinue
}

function Get-BackendPython {
    if (Test-Path -LiteralPath $backendPython) {
        return $backendPython
    }

    $pythonCommand = Get-Command -Name "python" -ErrorAction SilentlyContinue
    if ($null -ne $pythonCommand) {
        return $pythonCommand.Source
    }

    throw "Python executable not found. Run scripts/bootstrap-local.ps1 first."
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    Push-Location $WorkingDirectory
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Name "Backend unit tests" -WorkingDirectory $repoRoot -Command {
    & (Get-BackendPython) -m unittest discover backend/tests -v
}

Invoke-Step -Name "Frontend test suite" -WorkingDirectory (Join-Path $repoRoot "frontend") -Command {
    if ($null -eq $npmCommand) {
        throw "npm is not available in PATH."
    }
    & $npmCommand.Source test
}

Invoke-Step -Name "Frontend production build" -WorkingDirectory (Join-Path $repoRoot "frontend") -Command {
    if ($null -eq $npmCommand) {
        throw "npm is not available in PATH."
    }
    & $npmCommand.Source run build
}

Write-Host ""
Write-Host "All test steps completed." -ForegroundColor Green
