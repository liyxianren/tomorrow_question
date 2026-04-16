[CmdletBinding()]
param(
    [int]$PhaseDurationSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Wait-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Write-Host "$Name is reachable at $Url"
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
            continue
        }
    }

    throw "$Name did not become reachable at $Url within $TimeoutSeconds seconds."
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$startBackendScript = Join-Path -Path $PSScriptRoot -ChildPath "start-backend.ps1"
$startFrontendScript = Join-Path -Path $PSScriptRoot -ChildPath "start-frontend.ps1"

& $startBackendScript -PhaseDurationSeconds $PhaseDurationSeconds
& $startFrontendScript

Wait-HttpEndpoint -Name "Backend" -Url "http://127.0.0.1:5000/healthz"
Wait-HttpEndpoint -Name "Frontend" -Url "http://127.0.0.1:5173"

Write-Host "Local stack is ready."
