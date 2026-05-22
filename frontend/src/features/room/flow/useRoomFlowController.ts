import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import i18n from "../../../i18n";
import {
  type SessionBootstrapRouteState,
  resolveSessionRoute,
  restoreSessionContext,
} from "../../../app/sessionRecovery";
import { apiRequest } from "../../../services/http";
import { SOCKET_EVENT_NAMES, connectSocket, disconnectSocket } from "../../../services/socket";
import type {
  CountryCode,
  GameContext,
  GameSnapshot,
  PlayerSession,
  RoomContext,
  RoomContextResponse,
  SocketEnvelope,
} from "../../../types";
import { createRoomPreparationViewModel } from "../roomPreparationViewModel";

import {
  createFallbackRoom,
  formatRequestError,
  getCurrentMember,
  isGamePayload,
  isRoomPayload,
  isSnapshotPayload,
  type PendingRoomAction,
  type RoomFlowMessage,
  type RoomSocketState,
} from "./model";


type RoomUpdatedPayload = {
  room?: unknown;
};

type GameStartedPayload = {
  game?: unknown;
  snapshot?: unknown;
};

type SnapshotSyncPayload = {
  room?: unknown;
  game?: unknown;
  snapshot?: unknown;
};

function logRoomStart(stage: string, details: Record<string, unknown> = {}): void {
  console.info("[room-start]", stage, {
    at: new Date().toISOString(),
    ...details,
  });
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function createErrorMessage(text: string): RoomFlowMessage {
  return {
    tone: "error",
    text,
  };
}

function createNeutralMessage(text: string): RoomFlowMessage {
  return {
    tone: "neutral",
    text,
  };
}

function createSuccessMessage(text: string): RoomFlowMessage {
  return {
    tone: "success",
    text,
  };
}

export function useRoomFlowController() {
  const { roomCode: routeRoomCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as SessionBootstrapRouteState | null) ?? null;
  const bootstrap = routeState?.bootstrap ?? null;
  const initialRoomCode = routeRoomCode ?? bootstrap?.room.roomCode ?? "";
  const [roomContext, setRoomContext] = useState<RoomContextResponse | null>(
    bootstrap
      ? {
          room: bootstrap.room,
          activeGame: bootstrap.activeGame,
          activeSnapshot: bootstrap.activeSnapshot,
        }
      : null,
  );
  const [session, setSession] = useState<PlayerSession | null>(bootstrap?.session ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingRoomAction>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(!bootstrap);
  const [socketState, setSocketState] = useState<RoomSocketState>("idle");
  const [messageOverride, setMessageOverride] = useState<RoomFlowMessage | null>(null);
  const waitingRoomSyncVersionRef = useRef(0);
  const sessionRef = useRef<PlayerSession | null>(bootstrap?.session ?? null);
  const roomContextRef = useRef<RoomContextResponse | null>(
    bootstrap
      ? {
          room: bootstrap.room,
          activeGame: bootstrap.activeGame,
          activeSnapshot: bootstrap.activeSnapshot,
        }
      : null,
  );

  const room = roomContext?.room ?? createFallbackRoom(initialRoomCode);
  const activeGame = roomContext?.activeGame ?? null;
  const currentPlayerId = session?.playerId ?? null;
  const currentMember = useMemo(() => getCurrentMember(room, session), [room, session]);
  const helperMessage = loadError ? createErrorMessage(loadError) : messageOverride;
  const viewModel = useMemo(
    () =>
      createRoomPreparationViewModel({
        room,
        currentMember,
        pendingAction,
        activeGame,
        helperMessage,
      }),
    [activeGame, currentMember, helperMessage, pendingAction, room],
  );

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    roomContextRef.current = roomContext;
  }, [roomContext]);

  function buildBootstrapState(context: RoomContextResponse) {
    const currentSession = sessionRef.current;
    if (!currentSession || !context.activeGame || !context.activeSnapshot) {
      return undefined;
    }

    return {
      bootstrap: {
        session: currentSession,
        room: context.room,
        activeGame: context.activeGame,
        activeSnapshot: context.activeSnapshot,
      },
    };
  }

  function applyAuthoritativeRoomContext(context: RoomContextResponse): void {
    setRoomContext((previous) => {
      const previousPayload = JSON.stringify(previous);
      const nextPayload = JSON.stringify(context);
      return previousPayload === nextPayload ? previous : context;
    });

    if (context.activeGame?.gameId && context.activeSnapshot) {
      logRoomStart("navigate.game", {
        roomCode: context.room.roomCode,
        gameId: context.activeGame.gameId,
        snapshotId: context.activeSnapshot.snapshotId,
        phase: context.activeSnapshot.phase,
      });
      navigate(`/game/${context.activeGame.gameId}`, {
        replace: true,
        state: buildBootstrapState(context),
      });
    }
  }

  async function fetchAuthoritativeRoomContext(roomCode: string): Promise<RoomContextResponse> {
    const startedAt = performance.now();
    logRoomStart("context.fetch.start", { roomCode });
    try {
      const context = await apiRequest<RoomContextResponse>(`/api/v1/rooms/${roomCode}/context`);
      logRoomStart("context.fetch.done", {
        roomCode,
        elapsedMs: elapsedSince(startedAt),
        roomStatus: context.room.status,
        gameId: context.activeGame?.gameId ?? null,
        snapshotId: context.activeSnapshot?.snapshotId ?? null,
        snapshotPhase: context.activeSnapshot?.phase ?? null,
      });
      return context;
    } catch (error) {
      logRoomStart("context.fetch.error", {
        roomCode,
        elapsedMs: elapsedSince(startedAt),
        error: formatRequestError(error),
      });
      throw error;
    }
  }

  async function syncAuthoritativeRoomContext(roomCode: string): Promise<RoomContextResponse> {
    const startedAt = performance.now();
    logRoomStart("context.sync.start", { roomCode });
    const context = await fetchAuthoritativeRoomContext(roomCode);
    applyAuthoritativeRoomContext(context);
    logRoomStart("context.sync.done", {
      roomCode,
      elapsedMs: elapsedSince(startedAt),
      roomStatus: context.room.status,
      gameId: context.activeGame?.gameId ?? null,
      snapshotId: context.activeSnapshot?.snapshotId ?? null,
    });
    return context;
  }

  useEffect(() => {
    if (bootstrap?.activeGame?.gameId) {
      logRoomStart("bootstrap.navigate.game", {
        roomCode: bootstrap.room.roomCode,
        gameId: bootstrap.activeGame.gameId,
        snapshotId: bootstrap.activeSnapshot?.snapshotId ?? null,
      });
      navigate(`/game/${bootstrap.activeGame.gameId}`, {
        replace: true,
        state: {
          bootstrap,
        },
      });
    }
  }, [bootstrap?.activeGame?.gameId, navigate]);

  useEffect(() => {
    if (bootstrap || !initialRoomCode) {
      if (!initialRoomCode) {
        setLoadError(i18n.t("room:errors.roomNotFound"));
      }

      return;
    }

    let disposed = false;

    async function loadRoomContext(): Promise<void> {
      const startedAt = performance.now();
      logRoomStart("room.load.start", { roomCode: initialRoomCode });
      setIsLoadingContext(true);
      setLoadError(null);
      setMessageOverride(null);

      try {
        const restored = await restoreSessionContext();
        if (restored) {
          if (disposed) {
            logRoomStart("room.load.disposed_after_restore", {
              roomCode: initialRoomCode,
              elapsedMs: elapsedSince(startedAt),
            });
            return;
          }

          logRoomStart("room.load.restore.done", {
            roomCode: restored.room.roomCode,
            elapsedMs: elapsedSince(startedAt),
            roomStatus: restored.room.status,
            gameId: restored.activeGame?.gameId ?? null,
            hasSnapshot: Boolean(restored.activeSnapshot),
          });
          setSession(restored.session);
          setRoomContext({
            room: restored.room,
            activeGame: restored.activeGame,
            activeSnapshot: restored.activeSnapshot,
          });

          const target = resolveSessionRoute(restored);
          if (target.path !== `/room/${initialRoomCode}`) {
            logRoomStart("room.load.restore.navigate", {
              fromRoomCode: initialRoomCode,
              targetPath: target.path,
              elapsedMs: elapsedSince(startedAt),
            });
            navigate(target.path, {
              replace: true,
              state: target.state,
            });
          }

          return;
        }

        const context = await fetchAuthoritativeRoomContext(initialRoomCode);

        if (disposed) {
          logRoomStart("room.load.disposed_after_context", {
            roomCode: initialRoomCode,
            elapsedMs: elapsedSince(startedAt),
          });
          return;
        }

        setSession(null);
        applyAuthoritativeRoomContext(context);
        logRoomStart("room.load.context.done", {
          roomCode: initialRoomCode,
          elapsedMs: elapsedSince(startedAt),
          roomStatus: context.room.status,
          gameId: context.activeGame?.gameId ?? null,
        });
      } catch (error) {
        if (!disposed) {
          logRoomStart("room.load.error", {
            roomCode: initialRoomCode,
            elapsedMs: elapsedSince(startedAt),
            error: formatRequestError(error),
          });
          setLoadError(`${i18n.t("room:errors.genericError")}: ${formatRequestError(error)}`);
        }
      } finally {
        if (!disposed) {
          setIsLoadingContext(false);
        }
      }
    }

    void loadRoomContext();

    return () => {
      disposed = true;
    };
  }, [bootstrap, initialRoomCode, navigate]);

  useEffect(() => {
    if (!session?.sessionId || !room.roomCode) {
      setSocketState("idle");
      return;
    }

    const socket = connectSocket();
    logRoomStart("socket.connecting", {
      roomCode: room.roomCode,
      connected: socket.connected,
      sessionIdPresent: Boolean(session.sessionId),
    });
    setSocketState(socket.connected ? "connected" : "connecting");

    const handleConnect = () => {
      logRoomStart("socket.connected", { roomCode: room.roomCode });
      setSocketState("connected");
    };
    const handleDisconnect = () => {
      logRoomStart("socket.disconnected", { roomCode: room.roomCode });
      setSocketState("disconnected");
    };
    const handleRoomUpdated = (envelope: SocketEnvelope<RoomUpdatedPayload>) => {
      const updatedRoom = envelope.payload?.room;

      if (envelope.roomCode !== room.roomCode || !isRoomPayload(updatedRoom)) {
        return;
      }

      waitingRoomSyncVersionRef.current += 1;
      logRoomStart("socket.room_updated", {
        roomCode: updatedRoom.roomCode,
        roomStatus: updatedRoom.status,
        currentGameId: updatedRoom.currentGameId ?? null,
        syncVersion: waitingRoomSyncVersionRef.current,
      });
      if (updatedRoom.status === "in_game" && !roomContextRef.current?.activeGame?.gameId) {
        setMessageOverride(createSuccessMessage(i18n.t("room:status.in_game")));
        void syncAuthoritativeRoomContext(updatedRoom.roomCode).catch(() => {
          setRoomContext((previous) => ({
            room: updatedRoom,
            activeGame: previous?.activeGame ?? null,
            activeSnapshot: previous?.activeSnapshot ?? null,
          }));
        });
        return;
      }

      setMessageOverride(null);
      setRoomContext((previous) => ({
        room: updatedRoom,
        activeGame: previous?.activeGame ?? null,
        activeSnapshot: previous?.activeSnapshot ?? null,
      }));
    };
    const handleGameStarted = (envelope: SocketEnvelope<GameStartedPayload>) => {
      const nextGame = envelope.payload?.game;
      const nextSnapshot = envelope.payload?.snapshot;

      if (
        envelope.roomCode !== room.roomCode ||
        !isGamePayload(nextGame) ||
        !isSnapshotPayload(nextSnapshot)
      ) {
        return;
      }

      waitingRoomSyncVersionRef.current += 1;
      logRoomStart("socket.game_started", {
        roomCode: room.roomCode,
        gameId: nextGame.gameId,
        snapshotId: nextSnapshot.snapshotId,
        snapshotPhase: nextSnapshot.phase,
        syncVersion: waitingRoomSyncVersionRef.current,
      });
      setMessageOverride(createSuccessMessage(i18n.t("room:status.in_game")));
      void syncAuthoritativeRoomContext(room.roomCode).catch(() => {
        logRoomStart("socket.game_started.context_fallback", {
          roomCode: room.roomCode,
          gameId: nextGame.gameId,
          snapshotId: nextSnapshot.snapshotId,
        });
        const fallbackContext = {
          room: roomContextRef.current?.room ?? createFallbackRoom(room.roomCode),
          activeGame: nextGame,
          activeSnapshot: nextSnapshot,
        };
        applyAuthoritativeRoomContext(fallbackContext);
      });
    };
    const handleSnapshotSync = (envelope: SocketEnvelope<SnapshotSyncPayload>) => {
      const nextRoom = envelope.payload?.room;
      const nextGame = envelope.payload?.game;
      const nextSnapshot = envelope.payload?.snapshot;

      if (
        envelope.roomCode !== room.roomCode ||
        !isRoomPayload(nextRoom) ||
        !isGamePayload(nextGame) ||
        !isSnapshotPayload(nextSnapshot)
      ) {
        return;
      }

      waitingRoomSyncVersionRef.current += 1;
      logRoomStart("socket.snapshot_sync", {
        roomCode: nextRoom.roomCode,
        gameId: nextGame.gameId,
        snapshotId: nextSnapshot.snapshotId,
        snapshotPhase: nextSnapshot.phase,
        syncVersion: waitingRoomSyncVersionRef.current,
      });
      setMessageOverride(createSuccessMessage(i18n.t("room:status.in_game")));
      setRoomContext({
        room: nextRoom,
        activeGame: nextGame,
        activeSnapshot: nextSnapshot,
      });
      logRoomStart("navigate.game", {
        roomCode: nextRoom.roomCode,
        gameId: nextGame.gameId,
        snapshotId: nextSnapshot.snapshotId,
        phase: nextSnapshot.phase,
        source: "socket.snapshot_sync",
      });
      navigate(`/game/${nextGame.gameId}`, {
        replace: true,
        state: buildBootstrapState({
          room: nextRoom,
          activeGame: nextGame,
          activeSnapshot: nextSnapshot,
        }),
      });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(SOCKET_EVENT_NAMES.roomUpdated, handleRoomUpdated);
    socket.on(SOCKET_EVENT_NAMES.gameStarted, handleGameStarted);
    socket.on(SOCKET_EVENT_NAMES.gameSnapshotSync, handleSnapshotSync);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off(SOCKET_EVENT_NAMES.roomUpdated, handleRoomUpdated);
      socket.off(SOCKET_EVENT_NAMES.gameStarted, handleGameStarted);
      socket.off(SOCKET_EVENT_NAMES.gameSnapshotSync, handleSnapshotSync);
      disconnectSocket();
    };
  }, [navigate, room.roomCode, session?.sessionId]);

  useEffect(() => {
    if (!room.roomCode || activeGame?.gameId || (room.status !== "waiting" && room.status !== "readying")) {
      return;
    }

    let disposed = false;

    async function syncWaitingRoomContext(): Promise<void> {
      const requestVersion = waitingRoomSyncVersionRef.current;

      try {
        const context = await fetchAuthoritativeRoomContext(room.roomCode);

        if (disposed || requestVersion != waitingRoomSyncVersionRef.current) {
          logRoomStart("poll.context.ignored", {
            roomCode: room.roomCode,
            requestVersion,
            currentVersion: waitingRoomSyncVersionRef.current,
            disposed,
          });
          return;
        }

        applyAuthoritativeRoomContext(context);
      } catch {
        // Keep waiting-room sync best-effort. Real failures are still surfaced by the main load path.
      }
    }

    void syncWaitingRoomContext();
    const intervalId = window.setInterval(() => {
      void syncWaitingRoomContext();
    }, 1500);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [activeGame?.gameId, navigate, room.roomCode, room.status]);

  async function handleSelectCountry(country: CountryCode): Promise<void> {
    if (!room.roomCode || !currentPlayerId) {
      setMessageOverride(createErrorMessage(i18n.t("room:errors.genericError")));
      return;
    }

    waitingRoomSyncVersionRef.current += 1;
    setPendingAction("country");
    setMessageOverride(null);

    try {
      await apiRequest(`/api/v1/rooms/${room.roomCode}/country`, {
        method: "POST",
        body: {
          selectedCountry: country,
        },
      });

      await syncAuthoritativeRoomContext(room.roomCode);
      setMessageOverride(createSuccessMessage(`${i18n.t("game:country." + country)}`));
    } catch (error) {
      setMessageOverride(createErrorMessage(`${i18n.t("room:errors.genericError")}: ${formatRequestError(error)}`));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggleReady(): Promise<void> {
    if (!room.roomCode || !currentPlayerId || !currentMember) {
      setMessageOverride(createErrorMessage(i18n.t("room:errors.genericError")));
      return;
    }

    const nextReady = !currentMember.isReady;
    waitingRoomSyncVersionRef.current += 1;
    setPendingAction("ready");
    setMessageOverride(null);
    const startedAt = performance.now();
    logRoomStart("ready.submit.start", {
      roomCode: room.roomCode,
      playerId: currentPlayerId,
      nextReady,
      syncVersion: waitingRoomSyncVersionRef.current,
    });

    try {
      await apiRequest(`/api/v1/rooms/${room.roomCode}/ready`, {
        method: "POST",
        body: {
          isReady: nextReady,
        },
      });
      logRoomStart("ready.submit.done", {
        roomCode: room.roomCode,
        nextReady,
        elapsedMs: elapsedSince(startedAt),
      });

      await syncAuthoritativeRoomContext(room.roomCode);
      setMessageOverride(
        createSuccessMessage(
          nextReady
            ? i18n.t("room:actions.ready")
            : i18n.t("room:actions.unready"),
        ),
      );
    } catch (error) {
      logRoomStart("ready.submit.error", {
        roomCode: room.roomCode,
        nextReady,
        elapsedMs: elapsedSince(startedAt),
        error: formatRequestError(error),
      });
      setMessageOverride(createErrorMessage(`${i18n.t("room:errors.genericError")}: ${formatRequestError(error)}`));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleFillBots(): Promise<void> {
    if (!room.roomCode || !currentPlayerId) {
      setMessageOverride(createErrorMessage(i18n.t("room:errors.genericError")));
      return;
    }

    waitingRoomSyncVersionRef.current += 1;
    setPendingAction("fillBots");
    setMessageOverride(null);
    const startedAt = performance.now();
    logRoomStart("bots.fill.start", {
      roomCode: room.roomCode,
      playerId: currentPlayerId,
      syncVersion: waitingRoomSyncVersionRef.current,
    });

    try {
      await apiRequest<{ room?: RoomContext }>(`/api/v1/rooms/${room.roomCode}/bots/fill`, {
        method: "POST",
      });
      logRoomStart("bots.fill.done", {
        roomCode: room.roomCode,
        elapsedMs: elapsedSince(startedAt),
      });
      await syncAuthoritativeRoomContext(room.roomCode);
      setMessageOverride(createSuccessMessage(i18n.t("room:status.readying")));
    } catch (error) {
      logRoomStart("bots.fill.error", {
        roomCode: room.roomCode,
        elapsedMs: elapsedSince(startedAt),
        error: formatRequestError(error),
      });
      setMessageOverride(createErrorMessage(`${i18n.t("room:errors.genericError")}: ${formatRequestError(error)}`));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveBot(botPlayerId: string): Promise<void> {
    if (!room.roomCode || !currentPlayerId) {
      setMessageOverride(createErrorMessage(i18n.t("room:errors.genericError")));
      return;
    }

    waitingRoomSyncVersionRef.current += 1;
    setPendingAction("removeBot");
    setMessageOverride(null);

    try {
      await apiRequest<{ room?: RoomContext }>(`/api/v1/rooms/${room.roomCode}/bots/${botPlayerId}`, {
        method: "DELETE",
      });
      await syncAuthoritativeRoomContext(room.roomCode);
      setMessageOverride(createSuccessMessage(i18n.t("room:members.empty")));
    } catch (error) {
      setMessageOverride(createErrorMessage(`${i18n.t("room:errors.genericError")}: ${formatRequestError(error)}`));
    } finally {
      setPendingAction(null);
    }
  }

  return {
    room,
    currentMember,
    currentPlayerId,
    socketState,
    isLoadingContext,
    pendingAction,
    viewModel,
    handleFillBots,
    handleRemoveBot,
    handleSelectCountry,
    handleToggleReady,
  };
}
