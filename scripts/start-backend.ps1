[CmdletBinding()]
param(
    [switch]$RunChild,
    [Nullable[int]]$PhaseDurationSeconds = $null
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Read-EnvironmentFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()
        $values[$key] = $value
    }

    return $values
}

function Add-JobObjectTypes {
    if ("TomorrowQuestion.JobObjectNative" -as [type]) {
        return
    }

    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace TomorrowQuestion
{
    public static class JobObjectNative
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetInformationJobObject(
            IntPtr hJob,
            int JobObjectInfoClass,
            IntPtr lpJobObjectInfo,
            uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CloseHandle(IntPtr handle);
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }
}
"@
}

function New-ManagedJobHandle {
    Add-JobObjectTypes

    $jobHandle = [TomorrowQuestion.JobObjectNative]::CreateJobObject([IntPtr]::Zero, $null)
    if ($jobHandle -eq [IntPtr]::Zero) {
        throw "Unable to create Windows job object."
    }

    $limitInfo = New-Object TomorrowQuestion.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    $limitInfo.BasicLimitInformation.LimitFlags = 0x2000

    $length = [System.Runtime.InteropServices.Marshal]::SizeOf([type][TomorrowQuestion.JOBOBJECT_EXTENDED_LIMIT_INFORMATION])
    $buffer = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($length)
    try {
        [System.Runtime.InteropServices.Marshal]::StructureToPtr($limitInfo, $buffer, $false)
        $configured = [TomorrowQuestion.JobObjectNative]::SetInformationJobObject(
            $jobHandle,
            9,
            $buffer,
            [uint32]$length
        )
        if (-not $configured) {
            throw "Unable to configure Windows job object."
        }
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($buffer)
    }

    return $jobHandle
}

function Close-ManagedHandle {
    param(
        [Parameter(Mandatory = $true)]
        [System.IntPtr]$Handle
    )

    if ($Handle -ne [IntPtr]::Zero) {
        [void][TomorrowQuestion.JobObjectNative]::CloseHandle($Handle)
    }
}

function Get-ManagedProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PidFilePath,
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath
    )

    if (-not (Test-Path -LiteralPath $PidFilePath)) {
        return $null
    }

    $rawPid = (Get-Content -LiteralPath $PidFilePath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($rawPid)) {
        Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
        return $null
    }

    $pidValue = 0
    if (-not [int]::TryParse($rawPid, [ref]$pidValue)) {
        Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
        return $null
    }

    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
        return $null
    }

    $cimProcess = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
    if ($null -eq $cimProcess) {
        return $null
    }

    $normalizedScriptPath = $ScriptPath.ToLowerInvariant()
    $commandLine = ""
    if ($null -ne $cimProcess.CommandLine) {
        $commandLine = $cimProcess.CommandLine.ToLowerInvariant()
    }
    if ($commandLine.Contains($normalizedScriptPath.ToLowerInvariant()) -and $commandLine.Contains("-runchild")) {
        return $process
    }

    Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
    return $null
}

function Start-BackendChild {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BackendDir,
        [Parameter(Mandatory = $true)]
        [string]$PythonPath,
        [Parameter(Mandatory = $true)]
        [string]$BackendEnvPath,
        [Parameter(Mandatory = $true)]
        [string]$LogPath,
        [Nullable[int]]$PhaseDurationSeconds = $null
    )

    Ensure-Directory -Path (Split-Path -Path $LogPath -Parent)

    $jobHandle = New-ManagedJobHandle
    try {
        if (-not [TomorrowQuestion.JobObjectNative]::AssignProcessToJobObject($jobHandle, [System.Diagnostics.Process]::GetCurrentProcess().Handle)) {
            throw "Failed to bind backend wrapper to Windows job object."
        }

        Add-Content -LiteralPath $LogPath -Value ("[{0}] starting backend" -f [DateTimeOffset]::Now.ToString("u")) -Encoding UTF8

        $environmentValues = Read-EnvironmentFile -Path $BackendEnvPath
        $previousEnv = @{}
        foreach ($entry in $environmentValues.GetEnumerator()) {
            $previousEnv[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
            [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
        }
        if ($PSBoundParameters.ContainsKey("PhaseDurationSeconds")) {
            if (-not $previousEnv.ContainsKey("PHASE_DURATION_SECONDS")) {
                $previousEnv["PHASE_DURATION_SECONDS"] = [Environment]::GetEnvironmentVariable("PHASE_DURATION_SECONDS", "Process")
            }
            [Environment]::SetEnvironmentVariable("PHASE_DURATION_SECONDS", $PhaseDurationSeconds.ToString(), "Process")
        }

        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"

        Push-Location -Path $BackendDir
        try {
            & $PythonPath run.py 2>&1 | ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) {
                    $_.Exception.Message
                }
                else {
                    $_
                }
            } | Out-File -FilePath $LogPath -Append -Encoding utf8
            $exitCode = $LASTEXITCODE
        }
        finally {
            Pop-Location
            $ErrorActionPreference = $previousErrorActionPreference
            foreach ($entry in $previousEnv.GetEnumerator()) {
                [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
            }
        }

        Add-Content -LiteralPath $LogPath -Value ("[{0}] backend exited with code {1}" -f [DateTimeOffset]::Now.ToString("u"), $exitCode) -Encoding UTF8
    }
    finally {
        Close-ManagedHandle -Handle $jobHandle
    }
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$backendDir = Join-Path -Path $repoRoot -ChildPath "backend"
$runtimeDir = Join-Path -Path (Join-Path -Path $repoRoot -ChildPath "data") -ChildPath "runtime"
$logsDir = Join-Path -Path (Join-Path -Path $repoRoot -ChildPath "data") -ChildPath "logs"
$pidFile = Join-Path -Path $runtimeDir -ChildPath "backend.pid"
$logFile = Join-Path -Path $logsDir -ChildPath "backend.log"
$backendEnv = Join-Path -Path $backendDir -ChildPath ".env"
$pythonPath = Join-Path -Path $backendDir -ChildPath ".venv\\Scripts\\python.exe"

if ($RunChild) {
    if ($PSBoundParameters.ContainsKey("PhaseDurationSeconds")) {
        Start-BackendChild -BackendDir $backendDir -PythonPath $pythonPath -BackendEnvPath $backendEnv -LogPath $logFile -PhaseDurationSeconds $PhaseDurationSeconds
    }
    else {
        Start-BackendChild -BackendDir $backendDir -PythonPath $pythonPath -BackendEnvPath $backendEnv -LogPath $logFile
    }
    exit 0
}

Ensure-Directory -Path $runtimeDir
Ensure-Directory -Path $logsDir

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Backend Python executable not found at $pythonPath. Run scripts/bootstrap-local.ps1 first."
}

if (-not (Test-Path -LiteralPath $backendEnv)) {
    throw "Backend env file not found at $backendEnv. Run scripts/bootstrap-local.ps1 first."
}

$managedProcess = Get-ManagedProcess -PidFilePath $pidFile -ScriptPath $PSCommandPath
if ($null -ne $managedProcess) {
    Write-Host "Backend already running (PID $($managedProcess.Id))."
    exit 0
}

$wrapperArguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-RunChild")
if ($PSBoundParameters.ContainsKey("PhaseDurationSeconds")) {
    $wrapperArguments += @("-PhaseDurationSeconds", $PhaseDurationSeconds.ToString())
}

$wrapperProcess = Start-Process -FilePath "powershell.exe" `
    -ArgumentList $wrapperArguments `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -PassThru

[System.IO.File]::WriteAllText($pidFile, $wrapperProcess.Id.ToString(), [System.Text.UTF8Encoding]::new($false))
Start-Sleep -Seconds 2

if ($wrapperProcess.HasExited) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    throw "Backend wrapper exited before startup completed. Check $logFile."
}

Write-Host "Backend started (PID $($wrapperProcess.Id)). Log: $logFile"
