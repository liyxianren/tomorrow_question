import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameContext, GamePhase, RoomContext, SessionContextResponse } from "../../../types";
import { createGameSnapshot } from "../../../test/gameSnapshotFixtures";

import { useGameRuntime } from "./useGameRuntime";

const { mockRestoreSessionContext, mockFetchFinalResult, mockConnectSocket, mockDisconnectSocket } = vi.hoisted(() => ({
  mockRestoreSessionContext: vi.fn(),
  mockFetchFinalResult: vi.fn(),
  mockConnectSocket: vi.fn(),
  mockDisconnectSocket: vi.fn(),
}));

vi.mock("../../../app/sessionRecovery", () => ({
  restoreSessionContext: mockRestoreSessionContext,
  resolveSessionRoute: (context: SessionContextResponse) => ({
    path: context.activeGame ? `/game/${context.activeGame.gameId}` : "/lobby",
  }),
}));

vi.mock("../../../services/game", async () => {
  const actual = await vi.importActual<typeof import("../../../services/game")>("../../../services/game");

  return {
    ...actual,
    fetchFinalResult: mockFetchFinalResult,
  };
});

vi.mock("../../../services/socket", () => ({
  SOCKET_EVENT_NAMES: {
    gamePhaseStarted: "game:phase_started",
    gamePhaseTimer: "game:phase_timer",
    gamePhaseSettled: "game:phase_settled",
    gameFinished: "game:finished",
    gameSnapshotSync: "game:snapshot_sync",
  },
  connectSocket: mockConnectSocket,
  disconnectSocket: mockDisconnectSocket,
}));

function createRoom(): RoomContext {
  return {
    roomCode: "ROOM01",
    status: "in_game",
    hostPlayerId: "player-1",
    memberPlayerIds: ["player-1"],
    members: [
      {
        playerId: "player-1",
        nickname: "Britain",
        selectedCountry: "britain",
        connectionStatus: "online",
        isReady: true,
      },
    ],
    countrySlots: {
      britain: "player-1",
      france: null,
      prussia: null,
      austria: null,
      russia: null,
    },
    currentGameId: "game-1",
    lastActivityAt: "2026-03-30T12:00:00.000Z",
  };
}

function createGame(phase: GamePhase, round: number): GameContext {
  return {
    gameId: "game-1",
    roomCode: "ROOM01",
    currentRound: round,
    totalRounds: 10,
    currentPhase: phase,
    isFinished: false,
    activeSnapshotId: `snapshot-${phase}-${round}`,
  };
}

function createContext(phase: GamePhase, round: number, deadlineAt: string | null): SessionContextResponse {
  return {
    session: {
      playerId: "player-1",
      sessionId: "session-1",
      nickname: "Britain",
      roomCode: "ROOM01",
      selectedCountry: "britain",
      connectionStatus: "online",
      lastSeenAt: "2026-03-30T12:00:00.000Z",
    },
    room: createRoom(),
    activeGame: createGame(phase, round),
    activeSnapshot: createGameSnapshot({
      snapshotId: `snapshot-${phase}-${round}`,
      gameId: "game-1",
      round,
      phase,
      phaseDeadlineAt: deadlineAt,
    }),
    activeTurnInputs: [],
    gameLogs: [],
  };
}

function wrapper({ children }: PropsWithChildren) {
  return <MemoryRouter initialEntries={["/game/game-1"]}>{children}</MemoryRouter>;
}

describe("useGameRuntime deadline recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T12:00:00.000Z"));
    mockRestoreSessionContext.mockReset();
    mockFetchFinalResult.mockReset();
    mockDisconnectSocket.mockReset();
    mockConnectSocket.mockReturnValue({
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps reconciling after a deadline reaches zero until the server advances phase", async () => {
    const expiredSettlement = createContext("settlement", 2, "2026-03-30T11:59:59.000Z");
    const nextDecision = createContext("decision", 3, "2026-03-30T12:01:00.000Z");
    mockRestoreSessionContext.mockResolvedValue(expiredSettlement);

    const { result } = renderHook(
      () => useGameRuntime({ routeGameId: "game-1", bootstrap: expiredSettlement }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockRestoreSessionContext).toHaveBeenCalled();
    const callsBeforePolling = mockRestoreSessionContext.mock.calls.length;
    mockRestoreSessionContext.mockResolvedValue(nextDecision);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.runtimeState.snapshot?.phase).toBe("decision");
    expect(result.current.runtimeState.snapshot?.round).toBe(3);
    expect(mockRestoreSessionContext.mock.calls.length).toBeGreaterThan(callsBeforePolling);
  });
});
