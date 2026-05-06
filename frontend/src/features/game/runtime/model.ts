import type { GamePhase, PlayerSubmissionStatus, PlayerTurnInput, SessionContextResponse } from "../../../types";
import type {
  GameFinishedPayload,
  GamePhaseSettledPayload,
  GamePhaseStartedPayload,
  GameRuntimeState,
  GameSnapshotSyncPayload,
} from "./types";


export interface GamePhaseTimerPayload {
  phase: GamePhase;
  deadlineAt: string | null;
  remainingSeconds: number;
}

export function createEmptyGameRuntimeState(): GameRuntimeState {
  return withDerivedState({
    room: null,
    game: null,
    snapshot: null,
    session: null,
    recoveredTurnInputs: [],
    recoveredLogs: [],
    socketState: "idle",
    secondsRemaining: null,
    submissionStatusByPlayerId: {},
    latestSettlement: null,
    finalResult: null,
    hasRecoveredFromServer: false,
    isCurrentPlayerSubmitted: false,
    canSubmitCurrentPhase: false,
  });
}

export function createRecoveredGameRuntimeState(
  context: SessionContextResponse,
  previousState: GameRuntimeState | null = null,
): GameRuntimeState {
  return withDerivedState({
    room: context.room,
    game: context.activeGame ?? null,
    snapshot: normalizeRecoveredSnapshot(context.activeSnapshot ?? null),
    session: context.session,
    recoveredTurnInputs: [...(context.activeTurnInputs ?? [])],
    recoveredLogs: [...(context.gameLogs ?? [])],
    socketState: previousState?.socketState ?? "idle",
    secondsRemaining: resolveInitialSecondsRemaining(context.activeSnapshot?.phaseDeadlineAt ?? null),
    submissionStatusByPlayerId: buildRecoveredSubmissionStatus(
      context.activeSnapshot ?? null,
      context.activeTurnInputs ?? [],
    ),
    latestSettlement: resolveRecoveredLatestSettlement(context, previousState),
    finalResult: previousState?.finalResult ?? null,
    hasRecoveredFromServer: true,
    isCurrentPlayerSubmitted: false,
    canSubmitCurrentPhase: false,
  });
}

export function applySocketState(
  state: GameRuntimeState,
  socketState: GameRuntimeState["socketState"],
): GameRuntimeState {
  return withDerivedState({
    ...state,
    socketState,
  });
}

export function applyGamePhaseStarted(
  state: GameRuntimeState,
  payload: GamePhaseStartedPayload,
): GameRuntimeState {
  return withDerivedState({
    ...state,
    recoveredTurnInputs: [],
    game: payload.game,
    snapshot: payload.snapshot,
    secondsRemaining: resolveInitialSecondsRemaining(payload.snapshot.phaseDeadlineAt),
    submissionStatusByPlayerId: payload.submissionStatusByPlayerId,
    latestSettlement: null,
    finalResult: null,
  });
}

export function applyGamePhaseTimer(
  state: GameRuntimeState,
  payload: GamePhaseTimerPayload,
): GameRuntimeState {
  return withDerivedState({
    ...state,
    secondsRemaining: Math.max(0, Math.floor(payload.remainingSeconds)),
  });
}

export function applyGamePhaseSettled(
  state: GameRuntimeState,
  payload: GamePhaseSettledPayload,
): GameRuntimeState {
  const snapshot = {
    ...payload.snapshot,
    rankingWorkspace: payload.rankingWorkspace,
    lastSettlementWorkspace: payload.lastSettlementWorkspace,
  };
  return withDerivedState({
    ...state,
    recoveredLogs: payload.logs,
    game: payload.game,
    snapshot,
    secondsRemaining: resolveInitialSecondsRemaining(snapshot.phaseDeadlineAt),
    submissionStatusByPlayerId: {},
    latestSettlement: {
      ...payload,
      snapshot,
    },
    finalResult: null,
  });
}

export function applyGameFinished(
  state: GameRuntimeState,
  payload: GameFinishedPayload,
): GameRuntimeState {
  return withDerivedState({
    ...state,
    recoveredLogs: payload.finalLogs,
    game: payload.game,
    snapshot: payload.snapshot,
    secondsRemaining: null,
    finalResult: payload,
  });
}

export function applyGameSnapshotSync(
  state: GameRuntimeState,
  payload: GameSnapshotSyncPayload,
): GameRuntimeState {
  const shouldResetSubmissionStatus =
    state.snapshot?.round !== payload.snapshot.round || state.snapshot?.phase !== payload.snapshot.phase;

  return withDerivedState({
    ...state,
    recoveredTurnInputs: shouldResetSubmissionStatus ? [] : state.recoveredTurnInputs,
    room: payload.room,
    game: payload.game,
    snapshot: payload.snapshot,
    secondsRemaining: resolveInitialSecondsRemaining(payload.snapshot.phaseDeadlineAt),
    submissionStatusByPlayerId: shouldResetSubmissionStatus ? {} : state.submissionStatusByPlayerId,
    latestSettlement: shouldResetSubmissionStatus ? null : state.latestSettlement,
    finalResult: null,
  });
}

export function applySubmissionStatusUpdate(
  state: GameRuntimeState,
  submissionStatusByPlayerId: GameRuntimeState["submissionStatusByPlayerId"],
  scope?: { phase: GamePhase; roundNo: number },
): GameRuntimeState {
  if (
    scope &&
    (
      state.snapshot?.phase !== scope.phase ||
      state.snapshot.round !== scope.roundNo
    )
  ) {
    return state;
  }

  return withDerivedState({
    ...state,
    submissionStatusByPlayerId,
  });
}

export function tickGameRuntimeClock(state: GameRuntimeState): GameRuntimeState {
  if (state.finalResult || !state.snapshot?.phaseDeadlineAt) {
    return state.secondsRemaining === null
      ? state
      : withDerivedState({
          ...state,
          secondsRemaining: null,
        });
  }

  const nextSecondsRemaining = state.secondsRemaining === null
    ? resolveInitialSecondsRemaining(state.snapshot.phaseDeadlineAt)
    : Math.max(0, state.secondsRemaining - 1);

  return withDerivedState({
    ...state,
    secondsRemaining: nextSecondsRemaining,
  });
}

export function resolveInitialSecondsRemaining(deadlineAt: string | null): number | null {
  if (!deadlineAt) {
    return null;
  }

  const deadline = Date.parse(deadlineAt);
  if (Number.isNaN(deadline)) {
    return null;
  }

  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function withDerivedState(state: GameRuntimeState): GameRuntimeState {
  const normalizedSubmissionStatusByPlayerId =
    state.snapshot && state.snapshot.phase !== "settlement"
      ? {
          ...buildRecoveredSubmissionStatus(state.snapshot, state.recoveredTurnInputs),
          ...state.submissionStatusByPlayerId,
        }
      : {};
  const currentPlayerId = state.session?.playerId ?? null;
  const currentSubmissionStatus = currentPlayerId
    ? normalizedSubmissionStatusByPlayerId[currentPlayerId]
    : undefined;
  const isCurrentPlayerSubmitted =
    currentSubmissionStatus === "submitted" || currentSubmissionStatus === "timeout_auto_submitted";
  const canSubmitCurrentPhase = Boolean(
    state.game &&
      state.snapshot &&
      state.session &&
      !state.game.isFinished &&
      state.snapshot.phase !== "settlement" &&
      currentSubmissionStatus !== "submitted" &&
      currentSubmissionStatus !== "timeout_auto_submitted",
  );

  return {
    ...state,
    submissionStatusByPlayerId: normalizedSubmissionStatusByPlayerId,
    isCurrentPlayerSubmitted,
    canSubmitCurrentPhase,
  };
}

function normalizeRecoveredSnapshot(snapshot: GameRuntimeState["snapshot"]): GameRuntimeState["snapshot"] {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    rankingWorkspace: {
      leader:
        Array.isArray(snapshot.rankingWorkspace?.standings) && snapshot.rankingWorkspace.standings.length > 0
          ? snapshot.rankingWorkspace.standings[0].playerId
          : null,
      standings: Array.isArray(snapshot.rankingWorkspace?.standings)
        ? snapshot.rankingWorkspace.standings
        : [],
    },
  };
}

function buildRecoveredSubmissionStatus(
  snapshot: SessionContextResponse["activeSnapshot"] | null,
  turnInputs: PlayerTurnInput[],
): Record<string, PlayerSubmissionStatus> {
  if (!snapshot || snapshot.phase === "settlement") {
    return {};
  }

  const submissionStatusByPlayerId: Record<string, PlayerSubmissionStatus> = {};
  for (const turnInput of turnInputs) {
    if (turnInput.roundNo !== snapshot.round || turnInput.phase !== snapshot.phase) {
      continue;
    }
    submissionStatusByPlayerId[turnInput.playerId] = turnInput.submissionStatus;
  }
  return submissionStatusByPlayerId;
}

function resolveRecoveredLatestSettlement(
  context: SessionContextResponse,
  previousState: GameRuntimeState | null,
): GameRuntimeState["latestSettlement"] {
  if (context.activeGame && context.activeSnapshot?.lastSettlementWorkspace) {
    return {
      game: context.activeGame,
      snapshot: context.activeSnapshot,
      logs: [...(context.gameLogs ?? [])],
      autoSubmittedPlayerIds: [...context.activeSnapshot.lastSettlementWorkspace.autoSubmittedPlayerIds],
      rankingWorkspace: context.activeSnapshot.rankingWorkspace,
      lastSettlementWorkspace: context.activeSnapshot.lastSettlementWorkspace,
    };
  }

  return previousState?.latestSettlement ?? null;
}
