import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ApiRequestError,
  clearSessionId,
  setSessionId,
} from "../../../services/http";
import type { SessionContextResponse } from "../../../types";
import { resolveSessionRoute, restoreSessionContext } from "../../../app/sessionRecovery";
import i18n from "../../../i18n";

import {
  bindStoredProfileSession,
  clearPreferredNickname,
  clearStoredProfileSession,
  getPreferredNickname,
  getRecoverableSessionId,
  getStoredProfile,
  rememberRecentRoomCode,
  setLastActiveGameId,
  upsertStoredProfile,
} from "./identityStorage";
import { formatRequestError, type LobbyFlowMessage } from "./model";


type IdentityPendingAction = "continue" | "restore" | null;
type UseIdentityGateControllerOptions = {
  onIdentityConfirmed?: () => void;
};

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

export function useIdentityGateController(options: UseIdentityGateControllerOptions = {}) {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<IdentityPendingAction>(null);
  const [message, setMessage] = useState<LobbyFlowMessage | null>(null);

  useEffect(() => {
    const storedProfile = getStoredProfile();
    setNickname(storedProfile?.displayName ?? getPreferredNickname() ?? "");
    setProfileId(storedProfile?.profileId ?? null);
    setStoredSessionId(getRecoverableSessionId());
  }, []);

  function navigateFromSessionContext(response: SessionContextResponse): void {
    setSessionId(response.session.sessionId);
    bindStoredProfileSession(response.session.sessionId);
    rememberRecentRoomCode(response.room.roomCode);
    setLastActiveGameId(response.activeGame?.gameId ?? null);
    setStoredSessionId(response.session.sessionId);
    const target = resolveSessionRoute(response);
    navigate(target.path, {
      replace: true,
      state: target.state,
    });
  }

  function handleNicknameChange(value: string): void {
    setNickname(value);
  }

  function handleContinue(): void {
    const normalizedNickname = nickname.trim();
    if (!normalizedNickname) {
      setMessage(createErrorMessage(i18n.t("lobby:messages.nicknameRequired")));
      return;
    }

    const profile = upsertStoredProfile(normalizedNickname);
    setProfileId(profile.profileId);
    setStoredSessionId(profile.boundSessionId);
    setMessage(createSuccessMessage(i18n.t("lobby:messages.identityConfirmed")));
    setPendingAction("continue");
    options.onIdentityConfirmed?.();
    setPendingAction(null);
  }

  async function handleRestore(): Promise<void> {
    const recoverableSessionId = getRecoverableSessionId();
    if (!recoverableSessionId) {
      setMessage(createErrorMessage(i18n.t("lobby:messages.noRecoverableSession")));
      return;
    }

    setPendingAction("restore");
    setMessage(null);

    try {
      const response = await restoreSessionContext();
      if (!response) {
        throw new ApiRequestError(i18n.t("lobby:messages.noRecoverableSession"), 401, "INVALID_SESSION");
      }

      setMessage(createSuccessMessage(i18n.t("lobby:messages.progressRecovered")));
      navigateFromSessionContext(response);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "INVALID_SESSION") {
        clearSessionId();
        clearStoredProfileSession();
        setStoredSessionId(null);
        setMessage(createErrorMessage(i18n.t("lobby:messages.recoveryFailedIdentityKept")));
      } else {
        setMessage(createErrorMessage(formatRequestError(error)));
      }
    } finally {
      setPendingAction(null);
    }
  }

  function handleClearStoredSession(): void {
    clearSessionId();
    clearStoredProfileSession();
    setStoredSessionId(null);
    setMessage(createSuccessMessage(i18n.t("lobby:messages.sessionCleared")));
  }

  function handleClearIdentity(): void {
    clearSessionId();
    clearPreferredNickname();
    setNickname("");
    setProfileId(null);
    setStoredSessionId(null);
    setMessage(createSuccessMessage(i18n.t("lobby:messages.identityCleared")));
  }

  return {
    nickname,
    profileId,
    storedSessionId,
    pendingAction,
    message,
    isBusy: pendingAction !== null,
    setNickname: handleNicknameChange,
    handleContinue,
    handleRestore,
    handleClearStoredSession,
    handleClearIdentity,
  };
}
