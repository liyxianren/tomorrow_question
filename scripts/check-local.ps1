[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet("smoke", "full", "timeout")]
    [string]$Mode = "smoke"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:RepoRoot = Split-Path -Path $PSScriptRoot -Parent
$script:BackendDir = Join-Path -Path $script:RepoRoot -ChildPath "backend"
$script:BackendBaseUrl = if ($env:TQ_BACKEND_URL) { $env:TQ_BACKEND_URL.TrimEnd("/") } else { "http://127.0.0.1:5000" }
$script:FrontendBaseUrl = if ($env:TQ_FRONTEND_URL) { $env:TQ_FRONTEND_URL.TrimEnd("/") } else { "http://127.0.0.1:5173" }
$script:Countries = @("britain", "france", "prussia", "austria", "russia")
$script:Concerns = [System.Collections.Generic.List[string]]::new()

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message"
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message"
}

function Add-Concern {
    param([string]$Message)
    $script:Concerns.Add($Message)
    Write-Warning $Message
}

function Fail-Check {
    param([string]$Message)
    throw $Message
}

function Assert-Check {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        Fail-Check $Message
    }
}

function Read-EnvironmentFile {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

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

function Resolve-BackendDatabasePath {
    if (-not [string]::IsNullOrWhiteSpace($env:TQ_BACKEND_DB_PATH)) {
        return $env:TQ_BACKEND_DB_PATH
    }

    if (-not [string]::IsNullOrWhiteSpace($env:PLAYWRIGHT_BACKEND_DB_PATH)) {
        return $env:PLAYWRIGHT_BACKEND_DB_PATH
    }

    $backendEnvValues = Read-EnvironmentFile -Path (Join-Path -Path $script:BackendDir -ChildPath ".env")
    $configured = $backendEnvValues["DATABASE_PATH"]
    if (-not [string]::IsNullOrWhiteSpace($configured)) {
        return [System.IO.Path]::GetFullPath((Join-Path -Path $script:BackendDir -ChildPath $configured))
    }

    return (Join-Path -Path $script:RepoRoot -ChildPath "data\\tomorrow_question.sqlite3")
}

function Resolve-BackendPythonPath {
    if (-not [string]::IsNullOrWhiteSpace($env:TQ_BACKEND_PYTHON)) {
        return $env:TQ_BACKEND_PYTHON
    }

    $venvPython = Join-Path -Path $script:BackendDir -ChildPath ".venv\\Scripts\\python.exe"
    if (Test-Path -LiteralPath $venvPython) {
        return $venvPython
    }

    return "python"
}

function ConvertTo-JsonBody {
    param([object]$Body)
    return ($Body | ConvertTo-Json -Depth 100 -Compress)
}

function ConvertFrom-JsonBody {
    param(
        [string]$Text,
        [string]$Operation
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    try {
        Add-Type -AssemblyName System.Web.Extensions
        $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $serializer.MaxJsonLength = [int]::MaxValue
        $serializer.RecursionLimit = 256
        return $serializer.DeserializeObject($Text)
    } catch {
        Fail-Check "HTTP parse failure operation=$Operation detail=$($_.Exception.Message)"
    }
}

function Read-ErrorResponseBody {
    param([object]$Response)

    if ($null -eq $Response) {
        return $null
    }

    $stream = $Response.GetResponseStream()
    if ($null -eq $stream) {
        return $null
    }

    $reader = New-Object System.IO.StreamReader($stream)
    try {
        return $reader.ReadToEnd()
    } finally {
        $reader.Dispose()
    }
}

function Invoke-WebRequestSafe {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$RequestParams,
        [Parameter(Mandatory = $true)]
        [string]$Operation
    )

    try {
        $response = Invoke-WebRequest @RequestParams
        return @{
            StatusCode = [int]$response.StatusCode
            Content = [string]$response.Content
        }
    } catch [System.Net.WebException] {
        if ($null -eq $_.Exception.Response) {
            Fail-Check "HTTP transport failure operation=$Operation detail=$($_.Exception.Message)"
        }

        return @{
            StatusCode = [int]$_.Exception.Response.StatusCode
            Content = [string](Read-ErrorResponseBody -Response $_.Exception.Response)
        }
    }
}

function Invoke-ApiRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Operation,
        [object]$Body,
        [string]$SessionId
    )

    $headers = @{ Accept = "application/json" }
    if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
        $headers["X-Session-Id"] = $SessionId
    }

    $params = @{
        Uri     = "$script:BackendBaseUrl$Path"
        Method  = $Method
        Headers = $headers
    }

    if ($PSBoundParameters.ContainsKey("Body")) {
        $params["ContentType"] = "application/json"
        $params["Body"] = ConvertTo-JsonBody -Body $Body
    }

    $response = Invoke-WebRequestSafe -RequestParams $params -Operation $Operation
    $payload = ConvertFrom-JsonBody -Text $response.Content -Operation $Operation

    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        $error = if ($payload -is [System.Collections.IDictionary]) { $payload["error"] } else { $null }
        $errorCode = if ($error -is [System.Collections.IDictionary]) { $error["code"] } else { $null }
        $errorMessage = if ($error -is [System.Collections.IDictionary]) { $error["message"] } else { $null }
        Fail-Check "HTTP failure operation=$Operation endpoint=$Path status=$($response.StatusCode) code=$errorCode message=$errorMessage"
    }

    Assert-Check -Condition ($payload -is [System.Collections.IDictionary]) -Message "HTTP failure operation=$Operation endpoint=$Path assertion=response-json-missing"
    Assert-Check -Condition ($payload["ok"] -eq $true) -Message "HTTP failure operation=$Operation endpoint=$Path assertion=ok-false"
    Assert-Check -Condition ($null -ne $payload["data"]) -Message "HTTP failure operation=$Operation endpoint=$Path assertion=data-field-missing"
    return $payload["data"]
}

function Invoke-WebCheck {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [string]$Operation
    )

    $response = Invoke-WebRequestSafe -RequestParams @{ Uri = $Uri; Method = "GET" } -Operation $Operation
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        Fail-Check "HTTP failure operation=$Operation endpoint=$Uri status=$($response.StatusCode)"
    }

    return $response
}

function Get-RoomContext {
    param([string]$RoomCode)
    return Invoke-ApiRequest -Method GET -Path "/api/v1/rooms/$RoomCode/context" -Operation "room-context room=$RoomCode"
}

function Restore-SessionContext {
    param(
        [string]$SessionId,
        [string]$PlayerLabel
    )

    return Invoke-ApiRequest -Method POST -Path "/api/v1/sessions/restore" -Operation "restore-session player=$PlayerLabel" -SessionId $SessionId
}

function Get-FinalResult {
    param(
        [string]$GameId,
        [string]$SessionId,
        [string]$PlayerLabel
    )

    return Invoke-ApiRequest -Method GET -Path "/api/v1/games/$GameId/final-result" -Operation "final-result player=$PlayerLabel game=$GameId" -SessionId $SessionId
}

function Find-RoomMember {
    param(
        [System.Collections.IEnumerable]$Members,
        [string]$PlayerId
    )

    foreach ($member in $Members) {
        if ($member["playerId"] -eq $PlayerId) {
            return $member
        }
    }

    return $null
}

function Find-TurnInput {
    param(
        [System.Collections.IEnumerable]$TurnInputs,
        [string]$PlayerId
    )

    foreach ($turnInput in $TurnInputs) {
        if ($turnInput["playerId"] -eq $PlayerId) {
            return $turnInput
        }
    }

    return $null
}

function Wait-ForRoomState {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RoomCode,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Predicate,
        [Parameter(Mandatory = $true)]
        [string]$Assertion,
        [int]$TimeoutSeconds = 15,
        [int]$PollMilliseconds = 250
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $context = Get-RoomContext -RoomCode $RoomCode
        if (& $Predicate $context) {
            return $context
        }

        Start-Sleep -Milliseconds $PollMilliseconds
    }

    Fail-Check "Assertion failed assertion=$Assertion endpoint=/api/v1/rooms/$RoomCode/context timeout=${TimeoutSeconds}s"
}

function Wait-ForProgressFromSnapshot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RoomCode,
        [Parameter(Mandatory = $true)]
        [string]$SnapshotId,
        [Parameter(Mandatory = $true)]
        [int]$Round,
        [Parameter(Mandatory = $true)]
        [string]$Phase,
        [int]$TimeoutSeconds = 15
    )

    return Wait-ForRoomState -RoomCode $RoomCode -Assertion "phase-progressed phase=$Phase round=$Round" -TimeoutSeconds $TimeoutSeconds -Predicate {
        param($candidate)

        if ($null -eq $candidate["activeGame"] -or $null -eq $candidate["activeSnapshot"]) {
            return $false
        }

        if ([bool]$candidate["activeGame"]["isFinished"]) {
            return $true
        }

        return (
            $candidate["activeSnapshot"]["snapshotId"] -ne $SnapshotId -or
            [int]$candidate["activeSnapshot"]["round"] -ne $Round -or
            $candidate["activeSnapshot"]["phase"] -ne $Phase
        )
    }
}

function New-DecisionPayload {
    return @{
        factoryPlan = @{
            productionOrders = @()
            expansionOrders = @()
            upgradeOrders = @()
            newFactoryOrders = @()
        }
        domesticMarketPlan = @{
            domesticMarketActions = @()
        }
        governmentPlan = @{
            pointPurchases = @()
            strategySelections = @()
        }
    }
}

function New-MarketPayload {
    return @{
        saleOrders = @()
    }
}

function Get-PhasePayload {
    param([string]$Phase)

    switch ($Phase) {
        "decision" { return New-DecisionPayload }
        "market" { return New-MarketPayload }
        default { Fail-Check "Unsupported submit phase for payload generation: $Phase" }
    }
}

function Submit-PhaseForPlayer {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Player,
        [Parameter(Mandatory = $true)]
        [string]$GameId,
        [Parameter(Mandatory = $true)]
        [int]$Round,
        [Parameter(Mandatory = $true)]
        [string]$Phase
    )

    $response = Invoke-ApiRequest `
        -Method POST `
        -Path "/api/v1/games/$GameId/phases/$Phase/submit" `
        -Operation "submit phase=$Phase round=$Round player=$($Player.Label)" `
        -Body @{ payload = (Get-PhasePayload -Phase $Phase) } `
        -SessionId $Player.SessionId

    Assert-Check -Condition ($response["phase"] -eq $Phase) -Message "Assertion failed endpoint=/api/v1/games/$GameId/phases/$Phase/submit player=$($Player.Label) assertion=response-phase expected=$Phase actual=$($response["phase"])"
    Assert-Check -Condition ([int]$response["roundNo"] -eq $Round) -Message "Assertion failed endpoint=/api/v1/games/$GameId/phases/$Phase/submit player=$($Player.Label) assertion=response-round expected=$Round actual=$($response["roundNo"])"
    Assert-Check -Condition ($response["submission"]["playerId"] -eq $Player.PlayerId) -Message "Assertion failed endpoint=/api/v1/games/$GameId/phases/$Phase/submit player=$($Player.Label) assertion=submission-player expected=$($Player.PlayerId) actual=$($response["submission"]["playerId"])"
    Assert-Check -Condition ($response["submission"]["phase"] -eq $Phase) -Message "Assertion failed endpoint=/api/v1/games/$GameId/phases/$Phase/submit player=$($Player.Label) assertion=submission-phase expected=$Phase actual=$($response["submission"]["phase"])"
    Assert-Check -Condition ($response["submission"]["submissionStatus"] -eq "submitted") -Message "Assertion failed endpoint=/api/v1/games/$GameId/phases/$Phase/submit player=$($Player.Label) assertion=submission-status expected=submitted actual=$($response["submission"]["submissionStatus"])"
    Assert-Check -Condition ($response["submissionStatus"][$Player.PlayerId] -eq "submitted") -Message "Assertion failed endpoint=/api/v1/games/$GameId/phases/$Phase/submit player=$($Player.Label) assertion=submission-summary expected=submitted actual=$($response["submissionStatus"][$Player.PlayerId])"

    return $response
}

function Submit-PhaseForPlayers {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Players,
        [Parameter(Mandatory = $true)]
        [string]$GameId,
        [Parameter(Mandatory = $true)]
        [int]$Round,
        [Parameter(Mandatory = $true)]
        [string]$Phase
    )

    for ($index = 0; $index -lt $Players.Count; $index++) {
        $response = Submit-PhaseForPlayer -Player $Players[$index] -GameId $GameId -Round $Round -Phase $Phase
        $expectedAllSubmitted = $index -eq ($Players.Count - 1)
        Assert-Check -Condition ([bool]$response["allSubmitted"] -eq $expectedAllSubmitted) -Message "Assertion failed endpoint=/api/v1/games/$GameId/phases/$Phase/submit player=$($Players[$index].Label) assertion=all-submitted expected=$expectedAllSubmitted actual=$($response["allSubmitted"])"
    }
}

function Expire-ActivePhaseDeadline {
    param(
        [Parameter(Mandatory = $true)]
        [string]$GameId
    )

    $pythonPath = Resolve-BackendPythonPath
    $databasePath = Resolve-BackendDatabasePath
    $pythonScript = @'
import json
import sqlite3
import sys
from datetime import UTC, datetime, timedelta

db_path, game_id = sys.argv[1:3]
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
game_row = conn.execute("SELECT active_snapshot_id FROM games WHERE game_id = ?", (game_id,)).fetchone()
assert game_row is not None, f"game {game_id} not found"
snapshot_id = game_row["active_snapshot_id"]
snapshot_row = conn.execute("SELECT payload_json FROM snapshots WHERE snapshot_id = ?", (snapshot_id,)).fetchone()
assert snapshot_row is not None, f"snapshot {snapshot_id} not found"
payload = json.loads(snapshot_row["payload_json"])
expired_at = (datetime.now(UTC) - timedelta(seconds=5)).isoformat()
payload["phaseDeadlineAt"] = expired_at
conn.execute(
    "UPDATE snapshots SET phase_deadline_at = ?, payload_json = ? WHERE snapshot_id = ?",
    (expired_at, json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True), snapshot_id),
)
conn.commit()
conn.close()
'@

    $tempScriptPath = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), ".py")
    try {
        Set-Content -LiteralPath $tempScriptPath -Value $pythonScript -Encoding UTF8
        $result = & $pythonPath $tempScriptPath $databasePath $GameId 2>&1
        if ($LASTEXITCODE -ne 0) {
            Fail-Check "Failed to expire phase deadline game=$GameId detail=$result"
        }
    } finally {
        Remove-Item -LiteralPath $tempScriptPath -Force -ErrorAction SilentlyContinue
    }
}

function Assert-RankingOrder {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Ranking
    )

    for ($index = 1; $index -lt $Ranking.Count; $index++) {
        $previousIncome = [int]$Ranking[$index - 1]["cumulativeNationalIncome"]
        $currentIncome = [int]$Ranking[$index]["cumulativeNationalIncome"]
        Assert-Check -Condition ($previousIncome -ge $currentIncome) -Message "Assertion failed assertion=ranking-order expected-non-increasing=true previous=$previousIncome current=$currentIncome index=$index"
    }
}

function Get-PhaseOrder {
    param([string]$Phase)

    switch ($Phase) {
        "decision" { return 1 }
        "market" { return 2 }
        "settlement" { return 3 }
        default { return 99 }
    }
}

function Assert-ForwardPhaseProgress {
    param(
        [Parameter(Mandatory = $true)]
        [int]$PreviousRound,
        [Parameter(Mandatory = $true)]
        [string]$PreviousPhase,
        [Parameter(Mandatory = $true)]
        [hashtable]$Context,
        [Parameter(Mandatory = $true)]
        [string]$RoomCode
    )

    if ([bool]$Context["activeGame"]["isFinished"]) {
        return
    }

    $nextRound = [int]$Context["activeSnapshot"]["round"]
    $nextPhase = [string]$Context["activeSnapshot"]["phase"]
    $movedForward =
        ($nextRound -gt $PreviousRound) -or
        ($nextRound -eq $PreviousRound -and (Get-PhaseOrder -Phase $nextPhase) -gt (Get-PhaseOrder -Phase $PreviousPhase))

    Assert-Check -Condition $movedForward -Message "Assertion failed endpoint=/api/v1/rooms/$RoomCode/context assertion=forward-progress previous=$PreviousRound/$PreviousPhase next=$nextRound/$nextPhase"
    Assert-Check -Condition ($null -ne $Context["activeSnapshot"]["lastSettlementWorkspace"]) -Message "Assertion failed endpoint=/api/v1/rooms/$RoomCode/context assertion=last-settlement-workspace-missing"
}

function Start-PreparedGame {
    $runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $players = @(
        [pscustomobject]@{ Label = "P1"; Nickname = "check-$runId-p1"; Country = $script:Countries[0] },
        [pscustomobject]@{ Label = "P2"; Nickname = "check-$runId-p2"; Country = $script:Countries[1] },
        [pscustomobject]@{ Label = "P3"; Nickname = "check-$runId-p3"; Country = $script:Countries[2] },
        [pscustomobject]@{ Label = "P4"; Nickname = "check-$runId-p4"; Country = $script:Countries[3] },
        [pscustomobject]@{ Label = "P5"; Nickname = "check-$runId-p5"; Country = $script:Countries[4] }
    )

    Write-Step "Creating room"
    $created = Invoke-ApiRequest -Method POST -Path "/api/v1/rooms" -Operation "create-room player=P1" -Body @{ nickname = $players[0].Nickname }
    $roomCode = $created["room"]["roomCode"]
    Assert-Check -Condition (-not [string]::IsNullOrWhiteSpace($roomCode)) -Message "Assertion failed endpoint=/api/v1/rooms assertion=room-code-missing"
    $players[0] | Add-Member -NotePropertyName SessionId -NotePropertyValue $created["session"]["sessionId"]
    $players[0] | Add-Member -NotePropertyName PlayerId -NotePropertyValue $created["session"]["playerId"]
    Write-Ok "Room created room=$roomCode"

    for ($index = 1; $index -lt $players.Count; $index++) {
        $player = $players[$index]
        Write-Step "Joining room player=$($player.Label)"
        $joined = Invoke-ApiRequest -Method POST -Path "/api/v1/rooms/join" -Operation "join-room player=$($player.Label)" -Body @{
            nickname = $player.Nickname
            roomCode = $roomCode
        }
        $player | Add-Member -NotePropertyName SessionId -NotePropertyValue $joined["session"]["sessionId"]
        $player | Add-Member -NotePropertyName PlayerId -NotePropertyValue $joined["session"]["playerId"]
    }
    Write-Ok "All 5 players joined room=$roomCode"

    $joiningContext = Get-RoomContext -RoomCode $roomCode
    Assert-Check -Condition ($joiningContext["room"]["members"].Count -eq 5) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=member-count expected=5 actual=$($joiningContext["room"]["members"].Count)"

    foreach ($player in $players) {
        Write-Step "Selecting country player=$($player.Label) country=$($player.Country)"
        [void](Invoke-ApiRequest -Method POST -Path "/api/v1/rooms/$roomCode/country" -Operation "select-country player=$($player.Label)" -Body @{
            selectedCountry = $player.Country
        } -SessionId $player.SessionId)
    }

    $countryContext = Get-RoomContext -RoomCode $roomCode
    foreach ($player in $players) {
        $member = Find-RoomMember -Members $countryContext["room"]["members"] -PlayerId $player.PlayerId
        Assert-Check -Condition ($null -ne $member) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context player=$($player.Label) assertion=member-present"
        Assert-Check -Condition ($member["selectedCountry"] -eq $player.Country) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context player=$($player.Label) assertion=selected-country expected=$($player.Country) actual=$($member["selectedCountry"])"
    }
    Write-Ok "Fixed country assignments applied"

    foreach ($player in $players) {
        Write-Step "Setting ready player=$($player.Label)"
        [void](Invoke-ApiRequest -Method POST -Path "/api/v1/rooms/$roomCode/ready" -Operation "set-ready player=$($player.Label)" -Body @{
            isReady = $true
        } -SessionId $player.SessionId)
    }

    $startedContext = Wait-ForRoomState -RoomCode $roomCode -Assertion "active-game-created room=$roomCode" -Predicate {
        param($context)
        return ($null -ne $context["activeGame"] -and $null -ne $context["activeSnapshot"])
    }

    Assert-Check -Condition ($startedContext["room"]["status"] -eq "in_game") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=room-status expected=in_game actual=$($startedContext["room"]["status"])"
    Assert-Check -Condition ([int]$startedContext["activeGame"]["currentRound"] -eq 1) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=current-round expected=1 actual=$($startedContext["activeGame"]["currentRound"])"
    Assert-Check -Condition ($startedContext["activeGame"]["currentPhase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=current-phase expected=decision actual=$($startedContext["activeGame"]["currentPhase"])"
    Assert-Check -Condition ([int]$startedContext["activeSnapshot"]["round"] -eq 1) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=snapshot-round expected=1 actual=$($startedContext["activeSnapshot"]["round"])"
    Assert-Check -Condition ($startedContext["activeSnapshot"]["phase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=snapshot-phase expected=decision actual=$($startedContext["activeSnapshot"]["phase"])"

    $restoreContext = Restore-SessionContext -SessionId $players[0].SessionId -PlayerLabel $players[0].Label
    Assert-Check -Condition ($restoreContext["activeGame"]["gameId"] -eq $startedContext["activeGame"]["gameId"]) -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=restore-active-game expected=$($startedContext["activeGame"]["gameId"]) actual=$($restoreContext["activeGame"]["gameId"])"
    Assert-Check -Condition ($restoreContext["activeSnapshot"]["phase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=restore-active-phase expected=decision actual=$($restoreContext["activeSnapshot"]["phase"])"
    Write-Ok "activeGame created and restorable"

    return @{
        RoomCode = $roomCode
        Players  = $players
        Context  = $startedContext
    }
}

function Invoke-SmokeFlow {
    Write-Step "Checking backend and frontend availability"
    $health = Invoke-ApiRequest -Method GET -Path "/healthz" -Operation "healthz"
    Assert-Check -Condition ($health["service"] -eq "backend") -Message "Assertion failed endpoint=/healthz assertion=service expected=backend actual=$($health["service"])"

    $frontendResponse = Invoke-WebCheck -Uri "$script:FrontendBaseUrl/" -Operation "frontend-root"
    Assert-Check -Condition (-not [string]::IsNullOrWhiteSpace($frontendResponse["Content"])) -Message "Assertion failed endpoint=$($script:FrontendBaseUrl)/ assertion=frontend-content-empty"
    Write-Ok "healthz and frontend root are reachable"

    $bootstrap = Start-PreparedGame
    $roomCode = $bootstrap["RoomCode"]
    $players = $bootstrap["Players"]
    $context = $bootstrap["Context"]
    $gameId = $context["activeGame"]["gameId"]

    Write-Step "Submitting a single decision payload to verify restore-session exposes activeTurnInputs"
    $decisionResponse = Submit-PhaseForPlayer -Player $players[0] -GameId $gameId -Round 1 -Phase "decision"
    Assert-Check -Condition (-not [bool]$decisionResponse["allSubmitted"]) -Message "Assertion failed endpoint=/api/v1/games/$gameId/phases/decision/submit player=P1 assertion=all-submitted expected=false actual=$($decisionResponse["allSubmitted"])"

    $restoredDecision = Restore-SessionContext -SessionId $players[0].SessionId -PlayerLabel $players[0].Label
    $turnInput = Find-TurnInput -TurnInputs $restoredDecision["activeTurnInputs"] -PlayerId $players[0].PlayerId
    Assert-Check -Condition ($null -ne $turnInput) -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=decision-turn-input-missing"
    Assert-Check -Condition ($turnInput["phase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=decision-turn-input-phase expected=decision actual=$($turnInput["phase"])"
    Assert-Check -Condition ($turnInput["submissionStatus"] -eq "submitted") -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=decision-turn-input-status expected=submitted actual=$($turnInput["submissionStatus"])"

    Write-Step "Submitting remaining decision payloads to advance into market"
    Submit-PhaseForPlayers -Players @($players | Select-Object -Skip 1) -GameId $gameId -Round 1 -Phase "decision"
    $context = Wait-ForProgressFromSnapshot -RoomCode $roomCode -SnapshotId $bootstrap["Context"]["activeSnapshot"]["snapshotId"] -Round 1 -Phase "decision"
    Assert-Check -Condition ([int]$context["activeSnapshot"]["round"] -eq 1) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=market-round expected=1 actual=$($context["activeSnapshot"]["round"])"
    Assert-Check -Condition ($context["activeSnapshot"]["phase"] -eq "market") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=market-phase expected=market actual=$($context["activeSnapshot"]["phase"])"
    Assert-Check -Condition ($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=market-last-settlement expected=decision actual=$($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"])"
    Assert-Check -Condition ($context["activeSnapshot"]["ranking"].Count -eq 5) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=market-ranking-count expected=5 actual=$($context["activeSnapshot"]["ranking"].Count)"

    Write-Step "Submitting market payloads to enter settlement"
    $marketSnapshotId = $context["activeSnapshot"]["snapshotId"]
    Submit-PhaseForPlayers -Players $players -GameId $gameId -Round 1 -Phase "market"
    $context = Wait-ForProgressFromSnapshot -RoomCode $roomCode -SnapshotId $marketSnapshotId -Round 1 -Phase "market"
    Assert-Check -Condition ([int]$context["activeSnapshot"]["round"] -eq 1) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=settlement-round expected=1 actual=$($context["activeSnapshot"]["round"])"
    Assert-Check -Condition ($context["activeSnapshot"]["phase"] -eq "settlement") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=settlement-phase expected=settlement actual=$($context["activeSnapshot"]["phase"])"
    Assert-Check -Condition ($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"] -eq "market") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=settlement-last-settlement expected=market actual=$($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"])"
    Assert-Check -Condition ($context["activeSnapshot"]["ranking"].Count -eq 5) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=settlement-ranking-count expected=5 actual=$($context["activeSnapshot"]["ranking"].Count)"

    Write-Step "Expiring settlement deadline to verify automatic progression into the next round"
    $settlementSnapshotId = $context["activeSnapshot"]["snapshotId"]
    Expire-ActivePhaseDeadline -GameId $gameId
    $context = Wait-ForProgressFromSnapshot -RoomCode $roomCode -SnapshotId $settlementSnapshotId -Round 1 -Phase "settlement"
    Assert-Check -Condition ([int]$context["activeSnapshot"]["round"] -eq 2) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=next-decision-round expected=2 actual=$($context["activeSnapshot"]["round"])"
    Assert-Check -Condition ($context["activeSnapshot"]["phase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=next-decision-phase expected=decision actual=$($context["activeSnapshot"]["phase"])"
    Assert-Check -Condition ($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"] -eq "settlement") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=next-decision-last-settlement expected=settlement actual=$($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"])"

    $restoredNextRound = Restore-SessionContext -SessionId $players[2].SessionId -PlayerLabel $players[2].Label
    Assert-Check -Condition ([int]$restoredNextRound["activeSnapshot"]["round"] -eq 2) -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[2].Label) assertion=restore-round-two expected=2 actual=$($restoredNextRound["activeSnapshot"]["round"])"
    Assert-Check -Condition ($restoredNextRound["activeSnapshot"]["phase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[2].Label) assertion=restore-phase-two expected=decision actual=$($restoredNextRound["activeSnapshot"]["phase"])"
    Assert-Check -Condition (($restoredNextRound["activeTurnInputs"] | Measure-Object).Count -eq 0) -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[2].Label) assertion=restore-round-two-turn-inputs expected=0 actual=$(($restoredNextRound["activeTurnInputs"] | Measure-Object).Count)"

    Write-Ok "Smoke flow completed room=$roomCode round=2 phase=decision"
    return @{
        RoomCode = $roomCode
        Players  = $players
        Context  = $context
    }
}

function Invoke-TimeoutFlow {
    Write-Step "Checking backend and frontend availability"
    $health = Invoke-ApiRequest -Method GET -Path "/healthz" -Operation "healthz"
    Assert-Check -Condition ($health["service"] -eq "backend") -Message "Assertion failed endpoint=/healthz assertion=service expected=backend actual=$($health["service"])"

    $frontendResponse = Invoke-WebCheck -Uri "$script:FrontendBaseUrl/" -Operation "frontend-root"
    Assert-Check -Condition (-not [string]::IsNullOrWhiteSpace($frontendResponse["Content"])) -Message "Assertion failed endpoint=$($script:FrontendBaseUrl)/ assertion=frontend-content-empty"
    Write-Ok "healthz and frontend root are reachable"

    $bootstrap = Start-PreparedGame
    $roomCode = $bootstrap["RoomCode"]
    $players = $bootstrap["Players"]
    $context = $bootstrap["Context"]
    $gameId = $context["activeGame"]["gameId"]
    $snapshotId = $context["activeSnapshot"]["snapshotId"]

    Write-Step "Submitting partial decision payloads before forcing timeout"
    [void](Submit-PhaseForPlayer -Player $players[0] -GameId $gameId -Round 1 -Phase "decision")
    [void](Submit-PhaseForPlayer -Player $players[1] -GameId $gameId -Round 1 -Phase "decision")

    Write-Step "Expiring decision deadline to verify timeout auto-submission"
    Expire-ActivePhaseDeadline -GameId $gameId
    $context = Wait-ForProgressFromSnapshot -RoomCode $roomCode -SnapshotId $snapshotId -Round 1 -Phase "decision"

    Assert-Check -Condition ([int]$context["activeSnapshot"]["round"] -eq 1) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=timeout-round expected=1 actual=$($context["activeSnapshot"]["round"])"
    Assert-Check -Condition ($context["activeSnapshot"]["phase"] -eq "market") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=timeout-phase expected=market actual=$($context["activeSnapshot"]["phase"])"
    Assert-Check -Condition ($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=timeout-last-settlement expected=decision actual=$($context["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"])"
    Assert-Check -Condition ($context["activeSnapshot"]["lastSettlementWorkspace"]["autoSubmittedPlayerIds"].Count -eq 3) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=timeout-auto-submit-count expected=3 actual=$($context["activeSnapshot"]["lastSettlementWorkspace"]["autoSubmittedPlayerIds"].Count)"

    $restored = Restore-SessionContext -SessionId $players[2].SessionId -PlayerLabel $players[2].Label
    Assert-Check -Condition ($restored["activeSnapshot"]["phase"] -eq "market") -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[2].Label) assertion=timeout-restored-phase expected=market actual=$($restored["activeSnapshot"]["phase"])"
    Assert-Check -Condition ($restored["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"] -eq "decision") -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[2].Label) assertion=timeout-restored-settled-phase expected=decision actual=$($restored["activeSnapshot"]["lastSettlementWorkspace"]["settledPhase"])"
    Assert-Check -Condition ($restored["activeSnapshot"]["lastSettlementWorkspace"]["autoSubmittedPlayerIds"] -contains $players[2].PlayerId) -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[2].Label) assertion=timeout-restored-auto-submit expected-contains=$($players[2].PlayerId)"

    Write-Ok "Timeout flow completed room=$roomCode advanced-to phase=market round=1"
}

function Invoke-FullFlow {
    param([hashtable]$SmokeState)

    $roomCode = $SmokeState["RoomCode"]
    $players = $SmokeState["Players"]
    $context = $SmokeState["Context"]
    $gameId = $context["activeGame"]["gameId"]
    $totalRounds = [int]$context["activeGame"]["totalRounds"]

    Write-Step "Continuing from smoke baseline to the final settlement"
    while (-not [bool]$context["activeGame"]["isFinished"]) {
        $context = Get-RoomContext -RoomCode $roomCode
        $round = [int]$context["activeSnapshot"]["round"]
        $phase = [string]$context["activeSnapshot"]["phase"]
        $snapshotId = [string]$context["activeSnapshot"]["snapshotId"]

        switch ($phase) {
            "decision" {
                Write-Step "Forcing decision timeout progression round=$round"
                Expire-ActivePhaseDeadline -GameId $gameId
                $context = Wait-ForProgressFromSnapshot -RoomCode $roomCode -SnapshotId $snapshotId -Round $round -Phase "decision"
                Assert-ForwardPhaseProgress -PreviousRound $round -PreviousPhase $phase -Context $context -RoomCode $roomCode
            }
            "market" {
                Write-Step "Forcing market timeout progression round=$round"
                Expire-ActivePhaseDeadline -GameId $gameId
                $context = Wait-ForProgressFromSnapshot -RoomCode $roomCode -SnapshotId $snapshotId -Round $round -Phase "market"
                Assert-ForwardPhaseProgress -PreviousRound $round -PreviousPhase $phase -Context $context -RoomCode $roomCode
            }
            "settlement" {
                Write-Step "Expiring settlement deadline round=$round"
                Expire-ActivePhaseDeadline -GameId $gameId
                $context = Wait-ForProgressFromSnapshot -RoomCode $roomCode -SnapshotId $snapshotId -Round $round -Phase "settlement"

                if ([bool]$context["activeGame"]["isFinished"]) {
                    Assert-Check -Condition ([int]$context["activeGame"]["currentRound"] -eq $totalRounds) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=finished-round expected=$totalRounds actual=$($context["activeGame"]["currentRound"])"
                    break
                }

                Assert-ForwardPhaseProgress -PreviousRound $round -PreviousPhase $phase -Context $context -RoomCode $roomCode
            }
            default {
                Fail-Check "Assertion failed assertion=unknown-phase phase=$phase"
            }
        }
    }

    Assert-Check -Condition ([bool]$context["activeGame"]["isFinished"]) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=game-finished expected=true actual=$($context["activeGame"]["isFinished"])"
    Assert-Check -Condition ($context["room"]["status"] -eq "finished") -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=room-status expected=finished actual=$($context["room"]["status"])"
    Assert-Check -Condition ([int]$context["activeGame"]["currentRound"] -eq $totalRounds) -Message "Assertion failed endpoint=/api/v1/rooms/$roomCode/context assertion=final-round expected=$totalRounds actual=$($context["activeGame"]["currentRound"])"

    $finalResult = Get-FinalResult -GameId $gameId -SessionId $players[0].SessionId -PlayerLabel $players[0].Label
    Assert-Check -Condition ([bool]$finalResult["game"]["isFinished"]) -Message "Assertion failed endpoint=/api/v1/games/$gameId/final-result assertion=final-game-finished expected=true actual=$($finalResult["game"]["isFinished"])"
    Assert-Check -Condition ([int]$finalResult["game"]["currentRound"] -eq $totalRounds) -Message "Assertion failed endpoint=/api/v1/games/$gameId/final-result assertion=final-game-round expected=$totalRounds actual=$($finalResult["game"]["currentRound"])"
    Assert-Check -Condition (($finalResult["finalRanking"] | Measure-Object).Count -eq 5) -Message "Assertion failed endpoint=/api/v1/games/$gameId/final-result assertion=final-ranking-count expected=5 actual=$(($finalResult["finalRanking"] | Measure-Object).Count)"
    Assert-Check -Condition (($finalResult["finalLogs"] | Measure-Object).Count -gt 0) -Message "Assertion failed endpoint=/api/v1/games/$gameId/final-result assertion=final-logs expected=>0 actual=$(($finalResult["finalLogs"] | Measure-Object).Count)"
    Assert-RankingOrder -Ranking $finalResult["finalRanking"]

    $restored = Restore-SessionContext -SessionId $players[0].SessionId -PlayerLabel $players[0].Label
    Assert-Check -Condition ($restored["room"]["status"] -eq "finished") -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=restored-room-status expected=finished actual=$($restored["room"]["status"])"
    Assert-Check -Condition ([bool]$restored["activeGame"]["isFinished"]) -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=restored-game-finished expected=true actual=$($restored["activeGame"]["isFinished"])"
    Assert-Check -Condition (($restored["gameLogs"] | Measure-Object).Count -gt 0) -Message "Assertion failed endpoint=/api/v1/sessions/restore player=$($players[0].Label) assertion=restored-game-logs expected=>0 actual=$(($restored["gameLogs"] | Measure-Object).Count)"

    Write-Ok "Full flow completed room=$roomCode finished=true round=$totalRounds"
}

try {
    switch ($Mode) {
        "timeout" {
            Invoke-TimeoutFlow
        }
        "full" {
            $smokeState = Invoke-SmokeFlow
            Invoke-FullFlow -SmokeState $smokeState
        }
        default {
            [void](Invoke-SmokeFlow)
        }
    }

    if ($script:Concerns.Count -gt 0) {
        Write-Host "[RESULT] check-local mode=$Mode passed with concerns=$($script:Concerns.Count)"
    } else {
        Write-Host "[RESULT] check-local mode=$Mode passed"
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
