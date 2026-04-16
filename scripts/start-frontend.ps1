[CmdletBinding()]
param(
    [switch]$RunChild
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

function Start-FrontendChild {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FrontendDir,
        [Parameter(Mandatory = $true)]
        [string]$NpmPath,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    Ensure-Directory -Path (Split-Path -Path $LogPath -Parent)

    $jobHandle = New-ManagedJobHandle
    try {
        if (-not [TomorrowQuestion.JobObjectNative]::AssignProcessToJobObject($jobHandle, [System.Diagnostics.Process]::GetCurrentProcess().Handle)) {
            throw "Failed to bind frontend wrapper to Windows job object."
        }

        Add-Content -LiteralPath $LogPath -Value ("[{0}] starting frontend" -f [DateTimeOffset]::Now.ToString("u")) -Encoding UTF8

        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"

        Push-Location -Path $FrontendDir
        try {
            & $NpmPath run dev -- --host 127.0.0.1 --port 5173 2>&1 | ForEach-Object {
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
        }

        Add-Content -LiteralPath $LogPath -Value ("[{0}] frontend exited with code {1}" -f [DateTimeOffset]::Now.ToString("u"), $exitCode) -Encoding UTF8
    }
    finally {
        Close-ManagedHandle -Handle $jobHandle
    }
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$frontendDir = Join-Path -Path $repoRoot -ChildPath "frontend"
$runtimeDir = Join-Path -Path (Join-Path -Path $repoRoot -ChildPath "data") -ChildPath "runtime"
$logsDir = Join-Path -Path (Join-Path -Path $repoRoot -ChildPath "data") -ChildPath "logs"
$pidFile = Join-Path -Path $runtimeDir -ChildPath "frontend.pid"
$logFile = Join-Path -Path $logsDir -ChildPath "frontend.log"
$frontendEnv = Join-Path -Path $frontendDir -ChildPath ".env.local"

$npmCommand = Get-Command -Name "npm.cmd" -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) {
    $npmCommand = Get-Command -Name "npm" -ErrorAction SilentlyContinue
}

if ($RunChild) {
    if ($null -eq $npmCommand) {
        throw "npm is not available in PATH."
    }

    Start-FrontendChild -FrontendDir $frontendDir -NpmPath $npmCommand.Source -LogPath $logFile
    exit 0
}

Ensure-Directory -Path $runtimeDir
Ensure-Directory -Path $logsDir

if ($null -eq $npmCommand) {
    throw "npm is not available in PATH."
}

if (-not (Test-Path -LiteralPath $frontendEnv)) {
    throw "Frontend env file not found at $frontendEnv. Run scripts/bootstrap-local.ps1 first."
}

$managedProcess = Get-ManagedProcess -PidFilePath $pidFile -ScriptPath $PSCommandPath
if ($null -ne $managedProcess) {
    Write-Host "Frontend already running (PID $($managedProcess.Id))."
    exit 0
}

$wrapperProcess = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-RunChild") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -PassThru

[System.IO.File]::WriteAllText($pidFile, $wrapperProcess.Id.ToString(), [System.Text.UTF8Encoding]::new($false))
Start-Sleep -Seconds 2

if ($wrapperProcess.HasExited) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    throw "Frontend wrapper exited before startup completed. Check $logFile."
}

Write-Host "Frontend started (PID $($wrapperProcess.Id)). Log: $logFile"
