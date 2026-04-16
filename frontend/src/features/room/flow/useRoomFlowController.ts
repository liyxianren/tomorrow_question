import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

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
      navigate(`/game/${context.activeGame.gameId}`, {
        replace: true,
        state: buildBootstrapState(context),
      });
    }
  }

  async function fetchAuthoritativeRoomContext(roomCode: string): Promise<RoomContextResponse> {
    return apiRequest<RoomContextResponse>(`/api/v1/rooms/${roomCode}/context`);
  }

  async function syncAuthoritativeRoomContext(roomCode: string): Promise<RoomContextResponse> {
    const context = await fetchAuthoritativeRoomContext(roomCode);
    applyAuthoritativeRoomContext(context);
    return context;
  }

  useEffect(() => {
    if (bootstrap?.activeGame?.gameId) {
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
        setLoadError("缺少房间码，无法进入房间。");
      }

      return;
    }

    let disposed = false;

    async function loadRoomContext(): Promise<void> {
      setIsLoadingContext(true);
      setLoadError(null);
      setMessageOverride(null);

      try {
        const restored = await restoreSessionContext();
        if (restored) {
          if (disposed) {
            return;
          }

          setSession(restored.session);
          setRoomContext({
            room: restored.room,
            activeGame: restored.activeGame,
            activeSnapshot: restored.activeSnapshot,
          });

          const target = resolveSessionRoute(restored);
          if (target.path !== `/room/${initialRoomCode}`) {
            navigate(target.path, {
              replace: true,
              state: target.state,
            });
          }

          return;
        }

        const context = await fetchAuthoritativeRoomContext(initialRoomCode);

        if (disposed) {
          return;
        }

        setSession(null);
        applyAuthoritativeRoomContext(context);
      } catch (error) {
        if (!disposed) {
          setLoadError(`进入房间失败：${formatRequestError(error)}`);
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
    setSocketState(socket.connected ? "connected" : "connecting");

    const handleConnect = () => setSocketState("connected");
    const handleDisconnect = () => setSocketState("disconnected");
    const handleRoomUpdated = (envelope: SocketEnvelope<RoomUpdatedPayload>) => {
      const updatedRoom = envelope.payload?.room;

      if (envelope.roomCode !== room.roomCode || !isRoomPayload(updatedRoom)) {
        return;
      }

      waitingRoomSyncVersionRef.current += 1;
      if (updatedRoom.status === "in_game" && !roomContextRef.current?.activeGame?.gameId) {
        setMessageOverride(createSuccessMessage("房间已满足开局条件，正在同步最新对局。"));
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
      setMessageOverride(createSuccessMessage("房间已满足开局条件，正在跳转到对局。"));
      void syncAuthoritativeRoomContext(room.roomCode).catch(() => {
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
      setMessageOverride(createSuccessMessage("房间已完成开局，正在同步最新对局。"));
      setRoomContext({
        room: nextRoom,
        activeGame: nextGame,
        activeSnapshot: nextSnapshot,
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
      setMessageOverride(createErrorMessage("当前没有可用的玩家身份，无法选择国家。"));
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
      setMessageOverride(createSuccessMessage(`已选国家：${country}。`));
    } catch (error) {
      setMessageOverride(createErrorMessage(`选择国家失败：${formatRequestError(error)}`));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleToggleReady(): Promise<void> {
    if (!room.roomCode || !currentPlayerId || !currentMember) {
      setMessageOverride(createErrorMessage("当前没有可用的玩家身份，无法切换准备状态。"));
      return;
    }

    const nextReady = !currentMember.isReady;
    waitingRoomSyncVersionRef.current += 1;
    setPendingAction("ready");
    setMessageOverride(null);

    try {
      await apiRequest(`/api/v1/rooms/${room.roomCode}/ready`, {
        method: "POST",
        body: {
          isReady: nextReady,
        },
      });

      await syncAuthoritativeRoomContext(room.roomCode);
      setMessageOverride(
        createSuccessMessage(
          nextReady
            ? "你已准备开局。"
            : "你已取消准备。",
        ),
      );
    } catch (error) {
      setMessageOverride(createErrorMessage(`准备状态更新失败：${formatRequestError(error)}`));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleFillBots(): Promise<void> {
    if (!room.roomCode || !currentPlayerId) {
      setMessageOverride(createErrorMessage("当前没有可用的房主身份，无法补满 AI。"));
      return;
    }

    waitingRoomSyncVersionRef.current += 1;
    setPendingAction("fillBots");
    setMessageOverride(null);

    try {
      await apiRequest<{ room?: RoomContext }>(`/api/v1/rooms/${room.roomCode}/bots/fill`, {
        method: "POST",
      });
      await syncAuthoritativeRoomContext(room.roomCode);
      setMessageOverride(createSuccessMessage("已补入 AI 席位。若房间条件已齐，系统会自动开局。"));
    } catch (error) {
      setMessageOverride(createErrorMessage(`补满 AI 失败：${formatRequestError(error)}`));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveBot(botPlayerId: string): Promise<void> {
    if (!room.roomCode || !currentPlayerId) {
      setMessageOverride(createErrorMessage("当前没有可用的房主身份，无法踢出 AI。"));
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
      setMessageOverride(createSuccessMessage("已踢出 1 个 AI 席位，现在可以让真人加入。"));
    } catch (error) {
      setMessageOverride(createErrorMessage(`踢出 AI 失败：${formatRequestError(error)}`));
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
