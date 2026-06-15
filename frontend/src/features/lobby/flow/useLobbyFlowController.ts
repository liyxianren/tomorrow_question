import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { resolveSessionRoute, restoreSessionContext } from "../../../app/sessionRecovery";
import { fetchWaitingRooms } from "../../../services/lobby";
import { apiRequest, getSessionId, setSessionId } from "../../../services/http";
import type { SessionContextResponse, WaitingRoomSummaryResponse } from "../../../types";
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
  const { i18n: reactI18n } = useTranslation();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState(() => normalizeRoomCode(initialRoomCode));
  const [pendingAction, setPendingAction] = useState<LobbyPendingAction>(null);
  const [message, setMessage] = useState<LobbyFlowMessage | null>(null);
  const [waitingRoomSummaries, setWaitingRoomSummaries] = useState<WaitingRoomSummaryResponse[]>([]);
  const [isLoadingWaitingRooms, setLoadingWaitingRooms] = useState(false);
  const [waitingRoomsError, setWaitingRoomsError] = useState<string | null>(null);
  const [waitingRoomsRefreshToken, setWaitingRoomsRefreshToken] = useState(0);
  const [recoverableContext, setRecoverableContext] = useState<SessionContextResponse | null>(null);
  const normalizedRoomCode = useMemo(() => normalizeRoomCode(roomCode), [roomCode]);
  const boundSessionId = profile?.boundSessionId ?? null;
  const currentLanguage = reactI18n.resolvedLanguage ?? reactI18n.language;
  const waitingRooms = useMemo<WaitingRoomCardViewModel[]>(
    () => waitingRoomSummaries.map(buildWaitingRoomCardViewModel),
    [currentLanguage, waitingRoomSummaries],
  );
  const recoverableBanner = useMemo<RecoverableGameBannerViewModel | null>(
    () => (recoverableContext ? buildRecoverableGameBannerViewModel(recoverableContext) : null),
    [currentLanguage, recoverableContext],
  );

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
          setWaitingRoomSummaries(rooms);
        }
      } catch (error) {
        if (!cancelled) {
          setWaitingRoomSummaries([]);
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
      setRecoverableContext(null);
      return;
    }

    let cancelled = false;

    async function loadRecoverableTarget(): Promise<void> {
      try {
        const restored = await restoreSessionContext();

        if (!cancelled) {
          setRecoverableContext(restored);
        }
      } catch {
        if (!cancelled) {
          setRecoverableContext(null);
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
