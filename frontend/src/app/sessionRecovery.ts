import {
  ApiRequestError,
  apiRequest,
  clearSessionId,
  setSessionId,
} from "../services/http";
import type { RoomContextResponse, SessionContextResponse } from "../types";
import {
  bindStoredProfileSession,
  clearStoredProfileSession,
  getRecoverableSessionId,
  rememberRecentRoomCode,
  setLastActiveGameId,
} from "../features/lobby/flow/identityStorage";


export type RoomRouteState = {
  bootstrap: SessionContextResponse;
};

export type SessionBootstrapRouteState = RoomRouteState;
type SessionRestoreResponse = Partial<SessionContextResponse> & Pick<SessionContextResponse, "session">;

export function getStoredSessionId(): string | null {
  return getRecoverableSessionId();
}

async function hydrateActiveGameContext(
  restored: SessionContextResponse,
): Promise<SessionContextResponse> {
  if (!restored.room?.currentGameId || (restored.activeGame && restored.activeSnapshot)) {
    return restored;
  }

  try {
    const roomContext = await apiRequest<RoomContextResponse>(
      `/api/v1/rooms/${restored.room.roomCode}/context`,
      {
        sessionId: restored.session.sessionId,
      },
    );

    if (!roomContext.activeGame || !roomContext.activeSnapshot) {
      return restored;
    }

    return {
      ...restored,
      room: roomContext.room,
      activeGame: roomContext.activeGame,
      activeSnapshot: roomContext.activeSnapshot,
    };
  } catch {
    return restored;
  }
}

export async function restoreSessionContext(): Promise<SessionContextResponse | null> {
  const sessionId = getStoredSessionId();
  if (!sessionId) {
    return null;
  }

  try {
    const restoredResponse = await apiRequest<SessionRestoreResponse>("/api/v1/sessions/restore", {
      method: "POST",
      sessionId,
    });
    if (!restoredResponse.room) {
      clearSessionId();
      clearStoredProfileSession();
      setLastActiveGameId(null);
      return null;
    }

    const restored = await hydrateActiveGameContext(restoredResponse as SessionContextResponse);
    setSessionId(restored.session.sessionId);
    bindStoredProfileSession(restored.session.sessionId);
    rememberRecentRoomCode(restored.room.roomCode);
    setLastActiveGameId(restored.activeGame?.gameId ?? null);
    return restored;
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.code === "INVALID_SESSION" || error.code === "RECOVERY_NOT_AVAILABLE")
    ) {
      clearSessionId();
      clearStoredProfileSession();
      return null;
    }

    throw error;
  }
}

export function resolveSessionRoute(response: SessionContextResponse): {
  path: string;
  state?: RoomRouteState;
} {
  if (response.activeGame?.gameId) {
    if (response.activeGame.isFinished) {
      return { path: `/settlement/${response.activeGame.gameId}` };
    }

    return { path: `/game/${response.activeGame.gameId}` };
  }

  return {
    path: `/room/${response.room.roomCode}`,
    state: {
      bootstrap: response,
    },
  };
}

export function isRecoveredRouteSatisfied(currentPath: string, targetPath: string): boolean {
  return currentPath === targetPath;
}
