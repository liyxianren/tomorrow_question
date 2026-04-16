[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-ManagedScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,
        [hashtable]$Parameters = @{}
    )

    if (-not (Test-Path -LiteralPath $ScriptPath)) {
        throw "$Name script not found at $ScriptPath."
    }

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    $global:LASTEXITCODE = 0
    & $ScriptPath @Parameters
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

$runTestsScript = Join-Path -Path $PSScriptRoot -ChildPath "run-tests.ps1"
$startLocalScript = Join-Path -Path $PSScriptRoot -ChildPath "start-local.ps1"
$runBrowserTestsScript = Join-Path -Path $PSScriptRoot -ChildPath "run-browser-tests.ps1"
$checkLocalScript = Join-Path -Path $PSScriptRoot -ChildPath "check-local.ps1"
$stopLocalScript = Join-Path -Path $PSScriptRoot -ChildPath "stop-local.ps1"
$stackStarted = $false
$primaryFailure = $null

try {
    Invoke-ManagedScript -Name "Unit and frontend tests" -ScriptPath $runTestsScript
    Invoke-ManagedScript -Name "Start local stack" -ScriptPath $startLocalScript -Parameters @{ PhaseDurationSeconds = 15 }
    $stackStarted = $true

    Invoke-ManagedScript -Name "Browser full tests" -ScriptPath $runBrowserTestsScript -Parameters @{ Mode = "full" }
    Invoke-ManagedScript -Name "HTTP full checks" -ScriptPath $checkLocalScript -Parameters @{ Mode = "full" }
}
catch {
    $primaryFailure = $_
    throw
}
finally {
    if ($stackStarted) {
        try {
            Invoke-ManagedScript -Name "Stop local stack" -ScriptPath $stopLocalScript
        }
        catch {
            if ($null -ne $primaryFailure) {
                Write-Warning "stop-local.ps1 failed while unwinding: $($_.Exception.Message)"
            } else {
                throw
            }
        }
    }
}

Write-Host ""
Write-Host "Full local test suite completed." -ForegroundColor Green
