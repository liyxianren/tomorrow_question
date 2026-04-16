[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Stop-ManagedProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$PidFilePath,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedScriptPath
    )

    if (-not (Test-Path -LiteralPath $PidFilePath)) {
        Write-Host "$Name is not running."
        return
    }

    $rawPid = (Get-Content -LiteralPath $PidFilePath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($rawPid)) {
        Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
        Write-Host "$Name pid file was empty and has been cleaned."
        return
    }

    $pidValue = 0
    if (-not [int]::TryParse($rawPid, [ref]$pidValue)) {
        Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
        Write-Host "$Name pid file was invalid and has been cleaned."
        return
    }

    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
        Write-Host "$Name was not running; stale pid file removed."
        return
    }

    $cimProcess = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
    $commandLine = ""
    if ($null -ne $cimProcess -and $null -ne $cimProcess.CommandLine) {
        $commandLine = $cimProcess.CommandLine.ToLowerInvariant()
    }

    $normalizedScriptPath = $ExpectedScriptPath.ToLowerInvariant()
    if (-not ($commandLine.Contains($normalizedScriptPath) -and $commandLine.Contains("-runchild"))) {
        Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
        throw "$Name pid file pointed to PID $pidValue, but that process does not look like a managed local wrapper. The pid file was removed without stopping the process."
    }

    $taskkillOutput = & taskkill.exe /PID $pidValue /T /F 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed to stop via taskkill: $($taskkillOutput -join ' ')"
    }

    Start-Sleep -Seconds 2
    Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
    Write-Host "$Name stopped (PID $pidValue)."
}

$runtimeDir = Join-Path -Path (Join-Path -Path (Split-Path -Path $PSScriptRoot -Parent) -ChildPath "data") -ChildPath "runtime"
$backendPidFile = Join-Path -Path $runtimeDir -ChildPath "backend.pid"
$frontendPidFile = Join-Path -Path $runtimeDir -ChildPath "frontend.pid"
$backendScript = Join-Path -Path $PSScriptRoot -ChildPath "start-backend.ps1"
$frontendScript = Join-Path -Path $PSScriptRoot -ChildPath "start-frontend.ps1"

Stop-ManagedProcess -Name "Backend" -PidFilePath $backendPidFile -ExpectedScriptPath $backendScript
Stop-ManagedProcess -Name "Frontend" -PidFilePath $frontendPidFile -ExpectedScriptPath $frontendScript
