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
type RestoreSessionOptions = {
  includeGameDetails?: boolean;
};

function logSessionRecovery(stage: string, details: Record<string, unknown> = {}): void {
  console.info("[session-recovery]", stage, {
    at: new Date().toISOString(),
    ...details,
  });
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export function getStoredSessionId(): string | null {
  return getRecoverableSessionId();
}

async function hydrateActiveGameContext(
  restored: SessionContextResponse,
  { includeGameDetails = false }: RestoreSessionOptions = {},
): Promise<SessionContextResponse> {
  if (!includeGameDetails) {
    return restored;
  }

  if (!restored.room?.currentGameId || (restored.activeGame && restored.activeSnapshot)) {
    logSessionRecovery("hydrate.skip", {
      roomCode: restored.room?.roomCode ?? null,
      currentGameId: restored.room?.currentGameId ?? null,
      hasGame: Boolean(restored.activeGame),
      hasSnapshot: Boolean(restored.activeSnapshot),
    });
    return restored;
  }

  const startedAt = performance.now();
  logSessionRecovery("hydrate.context.start", {
    roomCode: restored.room.roomCode,
    currentGameId: restored.room.currentGameId,
  });

  try {
    const roomContext = await apiRequest<RoomContextResponse>(
      `/api/v1/rooms/${restored.room.roomCode}/context`,
      {
        sessionId: restored.session.sessionId,
      },
    );

    if (!roomContext.activeGame || !roomContext.activeSnapshot) {
      logSessionRecovery("hydrate.context.missing_active_state", {
        roomCode: restored.room.roomCode,
        elapsedMs: elapsedSince(startedAt),
        roomStatus: roomContext.room.status,
        hasGame: Boolean(roomContext.activeGame),
        hasSnapshot: Boolean(roomContext.activeSnapshot),
      });
      return restored;
    }

    logSessionRecovery("hydrate.context.done", {
      roomCode: restored.room.roomCode,
      elapsedMs: elapsedSince(startedAt),
      gameId: roomContext.activeGame.gameId,
      snapshotId: roomContext.activeSnapshot.snapshotId,
      phase: roomContext.activeSnapshot.phase,
    });
    return {
      ...restored,
      room: roomContext.room,
      activeGame: roomContext.activeGame,
      activeSnapshot: roomContext.activeSnapshot,
    };
  } catch (error) {
    logSessionRecovery("hydrate.context.error", {
      roomCode: restored.room.roomCode,
      elapsedMs: elapsedSince(startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
    return restored;
  }
}

export async function restoreSessionContext(
  { includeGameDetails = false }: RestoreSessionOptions = {},
): Promise<SessionContextResponse | null> {
  const sessionId = getStoredSessionId();
  if (!sessionId) {
    logSessionRecovery("restore.skip_no_session", { includeGameDetails });
    return null;
  }

  const startedAt = performance.now();
  logSessionRecovery("restore.start", {
    includeGameDetails,
    sessionIdPresent: true,
  });

  try {
    const restoredResponse = await apiRequest<SessionRestoreResponse>(
      `/api/v1/sessions/restore?includeDetails=${includeGameDetails ? "1" : "0"}`,
      {
        method: "POST",
        sessionId,
      },
    );
    if (!restoredResponse.room) {
      logSessionRecovery("restore.no_room", {
        includeGameDetails,
        elapsedMs: elapsedSince(startedAt),
      });
      clearSessionId();
      clearStoredProfileSession();
      setLastActiveGameId(null);
      return null;
    }

    const restored = await hydrateActiveGameContext(
      restoredResponse as SessionContextResponse,
      { includeGameDetails },
    );
    setSessionId(restored.session.sessionId);
    bindStoredProfileSession(restored.session.sessionId);
    rememberRecentRoomCode(restored.room.roomCode);
    setLastActiveGameId(restored.activeGame?.gameId ?? null);
    logSessionRecovery("restore.done", {
      includeGameDetails,
      elapsedMs: elapsedSince(startedAt),
      roomCode: restored.room.roomCode,
      roomStatus: restored.room.status,
      gameId: restored.activeGame?.gameId ?? null,
      hasSnapshot: Boolean(restored.activeSnapshot),
    });
    return restored;
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.code === "INVALID_SESSION" || error.code === "RECOVERY_NOT_AVAILABLE")
    ) {
      logSessionRecovery("restore.invalid", {
        includeGameDetails,
        elapsedMs: elapsedSince(startedAt),
        code: error.code,
      });
      clearSessionId();
      clearStoredProfileSession();
      return null;
    }

    logSessionRecovery("restore.error", {
      includeGameDetails,
      elapsedMs: elapsedSince(startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
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
