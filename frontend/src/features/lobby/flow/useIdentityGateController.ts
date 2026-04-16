import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ApiRequestError,
  apiRequest,
  clearSessionId,
  setSessionId,
} from "../../../services/http";
import type { SessionContextResponse } from "../../../types";
import { resolveSessionRoute } from "../../../app/sessionRecovery";

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
      setMessage(createErrorMessage("请先填写你想在本局使用的显示姓名。"));
      return;
    }

    const profile = upsertStoredProfile(normalizedNickname);
    setProfileId(profile.profileId);
    setStoredSessionId(profile.boundSessionId);
    setMessage(createSuccessMessage("身份已确认，可以开始进入大厅操作。"));
    setPendingAction("continue");
    options.onIdentityConfirmed?.();
    setPendingAction(null);
  }

  async function handleRestore(): Promise<void> {
    const recoverableSessionId = getRecoverableSessionId();
    if (!recoverableSessionId) {
      setMessage(createErrorMessage("当前没有可以继续的上次会话。"));
      return;
    }

    setPendingAction("restore");
    setMessage(null);

    try {
      const response = await apiRequest<SessionContextResponse>("/api/v1/sessions/restore", {
        method: "POST",
        sessionId: recoverableSessionId,
      });

      setMessage(createSuccessMessage("已找回你上次离开的进度。"));
      navigateFromSessionContext(response);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "INVALID_SESSION") {
        clearSessionId();
        clearStoredProfileSession();
        setStoredSessionId(null);
        setMessage(createErrorMessage("没能找回你上次离开的进度，但当前身份仍然保留。"));
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
    setMessage(createSuccessMessage("已清除这台设备保存的上次会话记录。"));
  }

  function handleClearIdentity(): void {
    clearSessionId();
    clearPreferredNickname();
    setNickname("");
    setProfileId(null);
    setStoredSessionId(null);
    setMessage(createSuccessMessage("这台设备上的身份和会话记录都已清除。"));
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
