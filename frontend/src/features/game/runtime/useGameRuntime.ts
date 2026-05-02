import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  resolveSessionRoute,
  restoreSessionContext,
  type RoomRouteState,
} from "../../../app/sessionRecovery";
import { ApiRequestError } from "../../../services/http";
import { fetchFinalResult } from "../../../services/game";
import { SOCKET_EVENT_NAMES, connectSocket, disconnectSocket } from "../../../services/socket";
import type {
  GameContext,
  GamePhase,
  GameLog,
  GameSnapshot,
  PhaseSettlementWorkspace,
  PhaseWorkspace,
  RankingWorkspace,
  RoomContext,
  SessionContextResponse,
  SocketEnvelope,
} from "../../../types";
import {
  applySubmissionStatusUpdate,
  applyGameFinished,
  applyGamePhaseSettled,
  applyGamePhaseStarted,
  applyGamePhaseTimer,
  applyGameSnapshotSync,
  applySocketState,
  createEmptyGameRuntimeState,
  createRecoveredGameRuntimeState,
  tickGameRuntimeClock,
  type GamePhaseTimerPayload,
} from "./model";
import type {
  GameFinishedPayload,
  GamePhaseSettledPayload,
  GamePhaseStartedPayload,
  GameRuntimeState,
  GameSnapshotSyncPayload,
} from "./types";
import type { PlayerSubmissionStatus } from "../../../types";


type UseGameRuntimeArgs = {
  routeGameId: string;
  bootstrap: SessionContextResponse | null;
};

type UseGameRuntimeResult = {
  runtimeState: GameRuntimeState;
  isLoadingContext: boolean;
  loadError: string | null;
  settlementTargetPath: string | null;
  updateSubmissionStatusByPlayerId: (submissionStatusByPlayerId: Record<string, PlayerSubmissionStatus>) => void;
  forceReconcile: () => void;
};

type GameSocket = ReturnType<typeof connectSocket>;
const GAME_PHASES: GamePhase[] = ["decision", "market", "settlement"];

export function useGameRuntime({
  routeGameId,
  bootstrap,
}: UseGameRuntimeArgs): UseGameRuntimeResult {
  const navigate = useNavigate();
  const deadlineRecoveryKeyRef = useRef<string | null>(null);
  const submissionRecoveryKeyRef = useRef<string | null>(null);
  const reconcileRuntimeRef = useRef<() => Promise<void>>(async () => {});
  const [runtimeState, setRuntimeState] = useState<GameRuntimeState>(() =>
    bootstrap ? createRecoveredGameRuntimeState(bootstrap) : createEmptyGameRuntimeState(),
  );
  const [isLoadingContext, setIsLoadingContext] = useState(!bootstrap);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeGameId) {
      setLoadError("缺少 gameId，无法装载游戏页。");
      setIsLoadingContext(false);
      return;
    }

    if (bootstrap) {
      const target = resolveSessionRoute(bootstrap);
      if (target.path !== `/game/${routeGameId}`) {
        navigate(target.path, {
          replace: true,
          state: target.state,
        });
        return;
      }

      setRuntimeState((previous) => createRecoveredGameRuntimeState(bootstrap, previous));
      setIsLoadingContext(false);
      setLoadError(null);
      return;
    }

    let disposed = false;

    async function loadRuntimeContext(): Promise<void> {
      setIsLoadingContext(true);
      setLoadError(null);

      try {
        const restored = await restoreSessionContext();
        if (disposed) {
          return;
        }

        if (!restored?.activeGame || !restored.activeSnapshot) {
          setLoadError("当前没有可恢复的进行中对局。");
          return;
        }

        const target = resolveSessionRoute(restored);
        if (target.path !== `/game/${routeGameId}`) {
          navigate(target.path, {
            replace: true,
            state: target.state as RoomRouteState | undefined,
          });
          return;
        }

        setRuntimeState((previous) => createRecoveredGameRuntimeState(restored, previous));
      } catch (error) {
        if (!disposed) {
          setLoadError(formatLoadError(error));
        }
      } finally {
        if (!disposed) {
          setIsLoadingContext(false);
        }
      }
    }

    void loadRuntimeContext();

    return () => {
      disposed = true;
    };
  }, [bootstrap, navigate, routeGameId]);

  useEffect(() => {
    if (!runtimeState.session?.sessionId || !runtimeState.room?.roomCode) {
      setRuntimeState((previous) => applySocketState(previous, "idle"));
      return;
    }

    const socket = connectSocket();
    setRuntimeState((previous) => applySocketState(previous, socket.connected ? "connected" : "connecting"));
    if (socket.connected) {
      void reconcileRuntimeRef.current?.();
    }

    const handleConnect = () => {
      setRuntimeState((previous) => applySocketState(previous, "connected"));
      void reconcileRuntimeRef.current?.();
    };
    const handleDisconnect = () => {
      setRuntimeState((previous) => applySocketState(previous, "disconnected"));
    };
    const handlePhaseStarted = (envelope: SocketEnvelope<unknown>) => {
      const payload = envelope.payload;
      if (!matchesGameEnvelope(envelope, routeGameId) || !isGamePhaseStartedPayload(payload)) {
        return;
      }

      setRuntimeState((previous) => applyGamePhaseStarted(previous, payload));
    };
    const handlePhaseTimer = (envelope: SocketEnvelope<unknown>) => {
      const payload = envelope.payload;
      if (!matchesGameEnvelope(envelope, routeGameId) || !isGamePhaseTimerPayload(payload)) {
        return;
      }

      setRuntimeState((previous) => applyGamePhaseTimer(previous, payload));
    };
    const handlePhaseSettled = (envelope: SocketEnvelope<unknown>) => {
      const payload = envelope.payload;
      if (!matchesGameEnvelope(envelope, routeGameId) || !isGamePhaseSettledPayload(payload)) {
        return;
      }

      setRuntimeState((previous) => applyGamePhaseSettled(previous, payload));
    };
    const handleGameFinished = (envelope: SocketEnvelope<unknown>) => {
      const payload = envelope.payload;
      if (!matchesGameEnvelope(envelope, routeGameId) || !isGameFinishedPayload(payload)) {
        return;
      }

      setRuntimeState((previous) => applyGameFinished(previous, payload));
    };
    const handleSnapshotSync = (envelope: SocketEnvelope<unknown>) => {
      const payload = envelope.payload;
      if (!matchesGameEnvelope(envelope, routeGameId) || !isGameSnapshotSyncPayload(payload)) {
        return;
      }

      setRuntimeState((previous) => applyGameSnapshotSync(previous, payload));
    };

    const listeners: Array<[string, (...args: any[]) => void]> = [
      ["connect", handleConnect],
      ["disconnect", handleDisconnect],
      [SOCKET_EVENT_NAMES.gamePhaseStarted, handlePhaseStarted],
      [SOCKET_EVENT_NAMES.gamePhaseTimer, handlePhaseTimer],
      [SOCKET_EVENT_NAMES.gamePhaseSettled, handlePhaseSettled],
      [SOCKET_EVENT_NAMES.gameFinished, handleGameFinished],
      [SOCKET_EVENT_NAMES.gameSnapshotSync, handleSnapshotSync],
    ];

    for (const [eventName, handler] of listeners) {
      socket.on(eventName, handler);
    }

    return () => {
      for (const [eventName, handler] of listeners) {
        socket.off(eventName, handler);
      }
      disconnectSocket();
    };
  }, [routeGameId, runtimeState.room?.roomCode, runtimeState.session?.sessionId]);

  useEffect(() => {
    if (!runtimeState.snapshot?.phaseDeadlineAt || runtimeState.finalResult) {
      return;
    }

    const timerId = window.setInterval(() => {
      setRuntimeState((previous) => tickGameRuntimeClock(previous));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [runtimeState.finalResult, runtimeState.snapshot?.phaseDeadlineAt]);

  useEffect(() => {
    reconcileRuntimeRef.current = async () => {
      if (
        !runtimeState.hasRecoveredFromServer ||
        !runtimeState.session?.playerId ||
        !runtimeState.game?.gameId ||
        !runtimeState.snapshot ||
        runtimeState.finalResult
      ) {
        return;
      }

      const activeGame = runtimeState.game;
      const activeSnapshot = runtimeState.snapshot;

      try {
        const restored = await restoreSessionContext();
        if (!restored?.activeGame || !restored.activeSnapshot) {
          return;
        }

        if (restored.activeGame.gameId !== routeGameId) {
          return;
        }

        if (restored.activeGame.isFinished) {
          const finalResult = await fetchFinalResult(restored.activeGame.gameId);
          setRuntimeState((previous) => applyGameFinished(previous, finalResult));
          return;
        }

        const currentPlayerId = runtimeState.session?.playerId ?? null;
        const currentSubmissionStatus = currentPlayerId
          ? runtimeState.submissionStatusByPlayerId[currentPlayerId]
          : undefined;
        const restoredSubmissionStatus = currentPlayerId
          ? restored.activeTurnInputs?.find(
              (turnInput) =>
                turnInput.playerId === currentPlayerId &&
                turnInput.roundNo === restored.activeSnapshot?.round &&
                turnInput.phase === restored.activeSnapshot?.phase,
            )?.submissionStatus
          : undefined;

        const shouldReconcile =
          restored.activeGame.isFinished !== activeGame.isFinished ||
          restored.activeSnapshot.snapshotId !== activeSnapshot.snapshotId ||
          restored.activeSnapshot.round !== activeSnapshot.round ||
          restored.activeSnapshot.phase !== activeSnapshot.phase ||
          restoredSubmissionStatus !== currentSubmissionStatus;

        if (shouldReconcile) {
          setRuntimeState((previous) => createRecoveredGameRuntimeState(restored, previous));
        }
      } catch {
        // Socket remains the primary path; reconciliation is best-effort.
      }
    };
  }, [
    routeGameId,
    runtimeState.finalResult,
    runtimeState.game,
    runtimeState.hasRecoveredFromServer,
    runtimeState.session?.playerId,
    runtimeState.snapshot,
    runtimeState.submissionStatusByPlayerId,
  ]);

  useEffect(() => {
    if (
      !runtimeState.hasRecoveredFromServer ||
      runtimeState.socketState !== "connected" ||
      runtimeState.finalResult ||
      !runtimeState.snapshot ||
      runtimeState.snapshot.phase === "settlement" ||
      !runtimeState.session?.playerId
    ) {
      submissionRecoveryKeyRef.current = null;
      return;
    }

    const currentPlayerStatus = runtimeState.submissionStatusByPlayerId[runtimeState.session.playerId];
    if (
      currentPlayerStatus === "submitted" ||
      currentPlayerStatus === "timeout_auto_submitted"
    ) {
      submissionRecoveryKeyRef.current = null;
      return;
    }

    const recoveryKey = `${runtimeState.snapshot.snapshotId}:${runtimeState.session.playerId}`;
    if (submissionRecoveryKeyRef.current === recoveryKey) {
      return;
    }
    submissionRecoveryKeyRef.current = recoveryKey;

    let disposed = false;

    async function recoverSubmissionState(): Promise<void> {
      try {
        const restored = await restoreSessionContext();
        if (disposed || !restored?.activeGame || !restored.activeSnapshot) {
          return;
        }

        if (restored.activeGame.gameId !== routeGameId) {
          return;
        }

        setRuntimeState((previous) => createRecoveredGameRuntimeState(restored, previous));
      } catch {
        if (!disposed) {
          submissionRecoveryKeyRef.current = null;
        }
      }
    }

    void recoverSubmissionState();

    return () => {
      disposed = true;
    };
  }, [
    routeGameId,
    runtimeState.finalResult,
    runtimeState.hasRecoveredFromServer,
    runtimeState.session?.playerId,
    runtimeState.snapshot,
    runtimeState.socketState,
    runtimeState.submissionStatusByPlayerId,
  ]);

  useEffect(() => {
    if (!runtimeState.game?.gameId || !runtimeState.snapshot || runtimeState.finalResult) {
      deadlineRecoveryKeyRef.current = null;
      return;
    }

    if (runtimeState.secondsRemaining === null || runtimeState.secondsRemaining > 0) {
      deadlineRecoveryKeyRef.current = null;
      return;
    }

    const recoveryKey = `${runtimeState.snapshot.snapshotId}:${runtimeState.snapshot.phase}`;
    if (deadlineRecoveryKeyRef.current === recoveryKey) {
      return;
    }
    deadlineRecoveryKeyRef.current = recoveryKey;

    let disposed = false;

    async function recoverAfterDeadline(): Promise<void> {
      try {
        const restored = await restoreSessionContext();
        if (disposed || !restored?.activeGame || !restored.activeSnapshot) {
          return;
        }

        if (restored.activeGame.gameId !== routeGameId) {
          return;
        }

        setRuntimeState((previous) => createRecoveredGameRuntimeState(restored, previous));
      } catch {
        if (!disposed) {
          deadlineRecoveryKeyRef.current = null;
        }
      }
    }

    void recoverAfterDeadline();

    return () => {
      disposed = true;
    };
  }, [
    routeGameId,
    runtimeState.finalResult,
    runtimeState.game?.gameId,
    runtimeState.secondsRemaining,
    runtimeState.snapshot,
  ]);

  useEffect(() => {
    const shouldRecoverFinalResult = Boolean(
      routeGameId &&
      !runtimeState.finalResult &&
      (
        runtimeState.game?.isFinished ||
        (
          runtimeState.game?.gameId === routeGameId &&
          runtimeState.snapshot?.phase === "settlement" &&
          runtimeState.snapshot.round === runtimeState.game?.totalRounds &&
          runtimeState.secondsRemaining === 0
        )
      ),
    );

    if (!shouldRecoverFinalResult) {
      return;
    }

    let disposed = false;

    async function recoverFinalResult(): Promise<void> {
      try {
        const finalResult = await fetchFinalResult(routeGameId);
        if (disposed || !finalResult.game.isFinished) {
          return;
        }

        setRuntimeState((previous) => applyGameFinished(previous, finalResult));
      } catch {
        return;
      }
    }

    void recoverFinalResult();

    const timerId = window.setInterval(() => {
      void recoverFinalResult();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(timerId);
    };
  }, [
    routeGameId,
    runtimeState.finalResult,
    runtimeState.game?.gameId,
    runtimeState.game?.isFinished,
    runtimeState.game?.totalRounds,
    runtimeState.secondsRemaining,
    runtimeState.snapshot?.phase,
    runtimeState.snapshot?.round,
  ]);

  const settlementTargetPath = useMemo(() => {
    if (!runtimeState.finalResult?.game.gameId) {
      return null;
    }

    return `/settlement/${runtimeState.finalResult.game.gameId}`;
  }, [runtimeState.finalResult]);

  return {
    runtimeState,
    isLoadingContext,
    loadError,
    settlementTargetPath,
    updateSubmissionStatusByPlayerId(submissionStatusByPlayerId) {
      setRuntimeState((previous) => applySubmissionStatusUpdate(previous, submissionStatusByPlayerId));
    },
    forceReconcile() {
      restoreSessionContext()
        .then((restored) => {
          if (!restored?.activeGame || !restored.activeSnapshot) return;
          if (restored.activeGame.gameId !== routeGameId) return;
          setRuntimeState((previous) => createRecoveredGameRuntimeState(restored, previous));
        })
        .catch(() => {});
    },
  };
}

function formatLoadError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.code ? `${error.message} (${error.code})` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "游戏上下文恢复失败，请稍后重试。";
}

function matchesGameEnvelope(envelope: SocketEnvelope<unknown>, routeGameId: string): boolean {
  return envelope.gameId === routeGameId;
}

function isGamePhaseValue(value: unknown): value is GamePhase {
  return typeof value === "string" && GAME_PHASES.includes(value as GamePhase);
}

function isRoomContext(value: unknown): value is RoomContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RoomContext>;
  return typeof candidate.roomCode === "string" && Array.isArray(candidate.members);
}

function isGameContext(value: unknown): value is GameContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameContext>;
  return typeof candidate.gameId === "string" && typeof candidate.roomCode === "string";
}

function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameSnapshot>;
  return (
    typeof candidate.snapshotId === "string" &&
    typeof candidate.gameId === "string" &&
    isGamePhaseValue(candidate.phase) &&
    isPhaseWorkspace(candidate.phaseWorkspace) &&
    isRankingWorkspace(candidate.rankingWorkspace) &&
    (candidate.lastSettlementWorkspace === null || candidate.lastSettlementWorkspace === undefined || isPhaseSettlementWorkspace(candidate.lastSettlementWorkspace))
  );
}

function isGameLog(value: unknown): value is GameLog {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameLog>;
  return typeof candidate.gameId === "string" && typeof candidate.kind === "string";
}

function isSubmissionStatusRecord(
  value: unknown,
): value is Record<string, "pending" | "submitted" | "timeout_auto_submitted"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((item) =>
    item === "pending" || item === "submitted" || item === "timeout_auto_submitted",
  );
}

function isPhaseWorkspace(value: unknown): value is PhaseWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PhaseWorkspace>;
  return isGamePhaseValue(candidate.phase) && Boolean(candidate.players && typeof candidate.players === "object");
}

function isRankingWorkspace(value: unknown): value is RankingWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RankingWorkspace>;
  return Array.isArray(candidate.standings);
}

function isPhaseSettlementWorkspace(value: unknown): value is PhaseSettlementWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PhaseSettlementWorkspace>;
  return (
    (candidate.settledPhase === null || candidate.settledPhase === undefined || isGamePhaseValue(candidate.settledPhase)) &&
    Array.isArray(candidate.summaryCards)
  );
}

function isGamePhaseStartedPayload(value: unknown): value is GamePhaseStartedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GamePhaseStartedPayload>;
  return (
    isGameContext(candidate.game) &&
    isGameSnapshot(candidate.snapshot) &&
    isSubmissionStatusRecord(candidate.submissionStatusByPlayerId)
  );
}

function isGamePhaseTimerPayload(value: unknown): value is GamePhaseTimerPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GamePhaseTimerPayload>;
  return isGamePhaseValue(candidate.phase) && typeof candidate.remainingSeconds === "number";
}

function isGamePhaseSettledPayload(value: unknown): value is GamePhaseSettledPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GamePhaseSettledPayload>;
  return (
    isGameContext(candidate.game) &&
    isGameSnapshot(candidate.snapshot) &&
    Array.isArray(candidate.logs) &&
    candidate.logs.every(isGameLog) &&
    Array.isArray(candidate.autoSubmittedPlayerIds) &&
    candidate.autoSubmittedPlayerIds.every((item) => typeof item === "string") &&
    isRankingWorkspace(candidate.rankingWorkspace) &&
    isPhaseSettlementWorkspace(candidate.lastSettlementWorkspace)
  );
}

function isGameFinishedPayload(value: unknown): value is GameFinishedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameFinishedPayload>;
  return (
    isGameContext(candidate.game) &&
    isGameSnapshot(candidate.snapshot) &&
    Array.isArray(candidate.finalRanking) &&
    Array.isArray(candidate.finalLogs) &&
    candidate.finalLogs.every(isGameLog)
  );
}

function isGameSnapshotSyncPayload(value: unknown): value is GameSnapshotSyncPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameSnapshotSyncPayload>;
  return isRoomContext(candidate.room) && isGameContext(candidate.game) && isGameSnapshot(candidate.snapshot);
}
