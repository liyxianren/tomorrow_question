[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-DirectoryIfMissing {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Ensure-FileFromTemplate {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TemplatePath,
        [Parameter(Mandatory = $true)]
        [string]$TargetPath,
        [Parameter(Mandatory = $true)]
        [hashtable]$Replacements
    )

    if (Test-Path -LiteralPath $TargetPath) {
        return
    }

    $content = Get-Content -LiteralPath $TemplatePath -Raw
    foreach ($entry in $Replacements.GetEnumerator()) {
        $content = $content.Replace($entry.Key, $entry.Value)
    }

    [System.IO.File]::WriteAllText($TargetPath, $content, [System.Text.UTF8Encoding]::new($false))
}

function Replace-InFileIfPresent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [hashtable]$Replacements
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $content = Get-Content -LiteralPath $Path -Raw
    $updatedContent = $content
    foreach ($entry in $Replacements.GetEnumerator()) {
        $updatedContent = $updatedContent.Replace($entry.Key, $entry.Value)
    }

    if ($updatedContent -ne $content) {
        [System.IO.File]::WriteAllText($Path, $updatedContent, [System.Text.UTF8Encoding]::new($false))
    }
}

function Get-PythonBootstrapCommand {
    $pyCommand = Get-Command -Name "py.exe" -ErrorAction SilentlyContinue
    if ($null -ne $pyCommand) {
        return @($pyCommand.Source, @("-3", "-m", "venv"))
    }

    $pythonCommand = Get-Command -Name "python.exe" -ErrorAction SilentlyContinue
    if ($null -ne $pythonCommand) {
        return @($pythonCommand.Source, @("-m", "venv"))
    }

    throw "Python launcher not found. Install Python 3 or py.exe first."
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$backendDir = Join-Path -Path $repoRoot -ChildPath "backend"
$frontendDir = Join-Path -Path $repoRoot -ChildPath "frontend"
$dataDir = Join-Path -Path $repoRoot -ChildPath "data"
$runtimeDir = Join-Path -Path $dataDir -ChildPath "runtime"
$logsDir = Join-Path -Path $dataDir -ChildPath "logs"

$backendEnvExample = Join-Path -Path $backendDir -ChildPath ".env.example"
$backendEnv = Join-Path -Path $backendDir -ChildPath ".env"
$frontendEnvExample = Join-Path -Path $frontendDir -ChildPath ".env.example"
$frontendEnv = Join-Path -Path $frontendDir -ChildPath ".env.local"
$backendVenvDir = Join-Path -Path $backendDir -ChildPath ".venv"
$backendPython = Join-Path -Path $backendVenvDir -ChildPath "Scripts\\python.exe"
$backendRequirements = Join-Path -Path $backendDir -ChildPath "requirements.txt"
$frontendPackageLock = Join-Path -Path $frontendDir -ChildPath "package-lock.json"

New-DirectoryIfMissing -Path $runtimeDir
New-DirectoryIfMissing -Path $logsDir

Ensure-FileFromTemplate -TemplatePath $backendEnvExample -TargetPath $backendEnv -Replacements @{
    "DATABASE_PATH=./data/tomorrow_question.sqlite3" = "DATABASE_PATH=../data/tomorrow_question.sqlite3"
    "CORS_ALLOWED_ORIGINS=http://localhost:5173" = "CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173"
}
Replace-InFileIfPresent -Path $backendEnv -Replacements @{
    "DATABASE_PATH=./data/tomorrow_question.sqlite3" = "DATABASE_PATH=../data/tomorrow_question.sqlite3"
    "CORS_ALLOWED_ORIGINS=http://localhost:5173" = "CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173"
    "CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173" = "CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173"
}

Ensure-FileFromTemplate -TemplatePath $frontendEnvExample -TargetPath $frontendEnv -Replacements @{
    "http://localhost:5000" = "http://127.0.0.1:5000"
}
Replace-InFileIfPresent -Path $frontendEnv -Replacements @{
    "http://localhost:5000" = "http://127.0.0.1:5000"
}

if (-not (Test-Path -LiteralPath $backendPython)) {
    $bootstrapCommand = Get-PythonBootstrapCommand
    $launcherPath = $bootstrapCommand[0]
    $launcherArgs = $bootstrapCommand[1]
    Write-Host "Creating backend virtual environment at $backendVenvDir"
    & $launcherPath @launcherArgs $backendVenvDir
}
else {
    Write-Host "Backend virtual environment already exists at $backendVenvDir"
}

Write-Host "Installing backend dependencies"
Push-Location -Path $backendDir
try {
    & $backendPython -m pip install --upgrade pip
    & $backendPython -m pip install -r $backendRequirements
}
finally {
    Pop-Location
}

$npmCommand = Get-Command -Name "npm.cmd" -ErrorAction SilentlyContinue
if ($null -eq $npmCommand) {
    $npmCommand = Get-Command -Name "npm" -ErrorAction SilentlyContinue
}
if ($null -eq $npmCommand) {
    throw "npm is not available in PATH."
}

Write-Host "Installing frontend dependencies"
Push-Location -Path $frontendDir
try {
    if (Test-Path -LiteralPath $frontendPackageLock) {
        & $npmCommand.Source install
    }
    else {
        & $npmCommand.Source install
    }
}
finally {
    Pop-Location
}

Write-Host "Bootstrap completed."
