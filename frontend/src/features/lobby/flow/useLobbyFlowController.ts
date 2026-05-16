import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { resolveSessionRoute, restoreSessionContext } from "../../../app/sessionRecovery";
import { fetchWaitingRooms } from "../../../services/lobby";
import { apiRequest, getSessionId, setSessionId } from "../../../services/http";
import type { SessionContextResponse } from "../../../types";
import i18n from "../../../i18n";
import {
  bindStoredProfileSession,
  rememberRecentRoomCode,
  setLastActiveGameId,
  type LocalProfile,
} from "./identityStorage";
import {
  formatRequestError,
  normalizeRoomCode,
  resolveLobbyStatusViewModel,
  type LobbyFlowMessage,
  type LobbyPendingAction,
} from "./model";
import {
  buildRecoverableGameBannerViewModel,
  buildWaitingRoomCardViewModel,
  type RecoverableGameBannerViewModel,
  type WaitingRoomCardViewModel,
} from "./viewModel";

function createErrorMessage(text: string): LobbyFlowMessage {
  return {
    tone: "error",
    text,
  };
}

function createSuccessMessage(text: string): LobbyFlowMessage {
  return {
    tone: "success",
    text,
  };
}

export function useLobbyFlowController(
  profile: LocalProfile | null,
  {
    initialRoomCode = "",
  }: {
    initialRoomCode?: string;
  } = {},
) {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState(() => normalizeRoomCode(initialRoomCode));
  const [pendingAction, setPendingAction] = useState<LobbyPendingAction>(null);
  const [message, setMessage] = useState<LobbyFlowMessage | null>(null);
  const [waitingRooms, setWaitingRooms] = useState<WaitingRoomCardViewModel[]>([]);
  const [isLoadingWaitingRooms, setLoadingWaitingRooms] = useState(false);
  const [waitingRoomsError, setWaitingRoomsError] = useState<string | null>(null);
  const [waitingRoomsRefreshToken, setWaitingRoomsRefreshToken] = useState(0);
  const [recoverableBanner, setRecoverableBanner] = useState<RecoverableGameBannerViewModel | null>(null);
  const normalizedRoomCode = useMemo(() => normalizeRoomCode(roomCode), [roomCode]);
  const boundSessionId = profile?.boundSessionId ?? null;

  useEffect(() => {
    setRoomCode(normalizeRoomCode(initialRoomCode));
  }, [initialRoomCode]);

  useEffect(() => {
    let cancelled = false;

    async function loadWaitingRooms(): Promise<void> {
      setLoadingWaitingRooms(true);
      setWaitingRoomsError(null);

      try {
        const rooms = await fetchWaitingRooms();

        if (!cancelled) {
          setWaitingRooms(rooms.map(buildWaitingRoomCardViewModel));
        }
      } catch (error) {
        if (!cancelled) {
          setWaitingRooms([]);
          setWaitingRoomsError(formatRequestError(error));
        }
      } finally {
        if (!cancelled) {
          setLoadingWaitingRooms(false);
        }
      }
    }

    void loadWaitingRooms();

    return () => {
      cancelled = true;
    };
  }, [waitingRoomsRefreshToken]);

  useEffect(() => {
    if (!profile?.displayName || !boundSessionId) {
      setRecoverableBanner(null);
      return;
    }

    let cancelled = false;

    async function loadRecoverableTarget(): Promise<void> {
      try {
        const restored = await restoreSessionContext();

        if (!cancelled) {
          setRecoverableBanner(restored ? buildRecoverableGameBannerViewModel(restored) : null);
        }
      } catch {
        if (!cancelled) {
          setRecoverableBanner(null);
        }
      }
    }

    void loadRecoverableTarget();

    return () => {
      cancelled = true;
    };
  }, [boundSessionId, profile?.displayName]);

  function persistSession(sessionId: string): void {
    setSessionId(sessionId);
    bindStoredProfileSession(sessionId);
  }

  function navigateFromSessionContext(response: SessionContextResponse): void {
    const target = resolveSessionRoute(response);

    persistSession(response.session.sessionId);
    rememberRecentRoomCode(response.room.roomCode);
    setLastActiveGameId(response.activeGame?.gameId ?? null);

    navigate(target.path, {
      state: target.state,
    });
  }

  async function joinRoomByCode(targetRoomCode: string): Promise<void> {
    if (!profile?.displayName) {
      return;
    }

    const normalizedTargetRoomCode = normalizeRoomCode(targetRoomCode);
    if (!normalizedTargetRoomCode) {
      setMessage(createErrorMessage(i18n.t("lobby:messages.roomCodeRequired")));
      return;
    }

    setPendingAction("join");
    setMessage(null);

    try {
      const existingSessionId = getSessionId() ?? profile.boundSessionId ?? null;
      const response = await apiRequest<SessionContextResponse>("/api/v1/rooms/join", {
        method: "POST",
        body: {
          nickname: profile.displayName,
          roomCode: normalizedTargetRoomCode,
        },
        sessionId: existingSessionId,
      });

      setMessage(createSuccessMessage(i18n.t("lobby:messages.roomJoined")));
      navigateFromSessionContext(response);
    } catch (error) {
      setMessage(createErrorMessage(formatRequestError(error)));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCreateRoom(): Promise<void> {
    if (!profile?.displayName) {
      return;
    }

    setPendingAction("create");
    setMessage(null);

    try {
      const response = await apiRequest<SessionContextResponse>("/api/v1/rooms", {
        method: "POST",
        body: {
          nickname: profile.displayName,
        },
        sessionId: null,
      });

      setMessage(createSuccessMessage(i18n.t("lobby:messages.roomCreated")));
      navigateFromSessionContext(response);
    } catch (error) {
      setMessage(createErrorMessage(formatRequestError(error)));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleJoinRoom(): Promise<void> {
    await joinRoomByCode(normalizedRoomCode);
  }

  async function handleJoinWaitingRoom(targetRoomCode: string): Promise<void> {
    setRoomCode(targetRoomCode);
    await joinRoomByCode(targetRoomCode);
  }

  function handleRefreshWaitingRooms(): void {
    setWaitingRoomsRefreshToken((value) => value + 1);
  }

  return {
    roomCode,
    profile,
    waitingRooms,
    recoverableBanner,
    pendingAction,
    isBusy: pendingAction !== null,
    isLoadingWaitingRooms,
    waitingRoomsError,
    requiresIdentity: !profile?.displayName,
    statusViewModel: resolveLobbyStatusViewModel({
      pendingAction,
      message,
    }),
    setRoomCode,
    handleCreateRoom,
    handleJoinRoom,
    handleJoinWaitingRoom,
    handleRefreshWaitingRooms,
  };
}
