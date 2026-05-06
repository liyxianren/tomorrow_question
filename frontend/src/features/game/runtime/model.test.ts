import { describe, expect, it } from "vitest";

import type {
  GameContext,
  GameSnapshot,
  PhaseSettlementWorkspace,
  PlayerTurnInput,
  RankingWorkspace,
  RoomContext,
  SessionContextResponse,
} from "../../../types";
import { createGameSnapshot, createPhaseWorkspace, createRankingWorkspace, createSettlementWorkspace } from "../../../test/gameSnapshotFixtures";

import {
  applyGamePhaseStarted,
  applyGameSnapshotSync,
  applySubmissionStatusUpdate,
  createRecoveredGameRuntimeState,
  createEmptyGameRuntimeState,
} from "./model";

function createRoom(): RoomContext {
  return {
    roomCode: "ROOM01",
    status: "in_game",
    hostPlayerId: "player-1",
    memberPlayerIds: ["player-1", "player-2"],
    members: [
      {
        playerId: "player-1",
        nickname: "Britain",
        selectedCountry: "britain",
        connectionStatus: "online",
        isReady: true,
      },
      {
        playerId: "player-2",
        nickname: "France",
        selectedCountry: "france",
        connectionStatus: "online",
        isReady: true,
      },
    ],
    countrySlots: {
      britain: "player-1",
      france: "player-2",
      prussia: null,
      austria: null,
      russia: null,
    },
    currentGameId: "game-1",
    lastActivityAt: "2026-03-30T12:00:00.000Z",
  };
}

function createGame(currentPhase: GameContext["currentPhase"], round = 2): GameContext {
  return {
    gameId: "game-1",
    roomCode: "ROOM01",
    currentRound: round,
    totalRounds: 15,
    currentPhase,
    isFinished: false,
    activeSnapshotId: `snapshot-${currentPhase}-${round}`,
  };
}

function createSnapshot(phase: GameContext["currentPhase"], round = 2): GameSnapshot {
  return createGameSnapshot({
    snapshotId: `snapshot-${phase}-${round}`,
    gameId: "game-1",
    round,
    phase,
    phaseWorkspace: createPhaseWorkspace(phase),
    rankingWorkspace: createRankingWorkspace(),
    lastSettlementWorkspace: createSettlementWorkspace(),
  });
}

function createLatestSettlement(phase: GameContext["currentPhase"]): {
  game: GameContext;
  snapshot: GameSnapshot;
  logs: [];
  autoSubmittedPlayerIds: string[];
  rankingWorkspace: RankingWorkspace;
  lastSettlementWorkspace: PhaseSettlementWorkspace;
} {
  const rankingWorkspace = createRankingWorkspace();
  const lastSettlementWorkspace = createSettlementWorkspace({
    settledPhase: phase,
    phaseLabel: "上一阶段",
    headline: "旧结算结果",
  });

  return {
    game: createGame(phase),
    snapshot: createSnapshot(phase),
    logs: [],
    autoSubmittedPlayerIds: [],
    rankingWorkspace,
    lastSettlementWorkspace,
  };
}

function createTurnInput(
  overrides: Partial<PlayerTurnInput> = {},
): PlayerTurnInput {
  return {
    gameId: "game-1",
    roundNo: 2,
    phase: "market",
    playerId: "player-1",
    submissionStatus: "submitted",
    payload: { saleOrders: [] },
    submittedAt: "2026-03-30T12:00:00.000Z",
    isTimeoutGenerated: false,
    ...overrides,
  };
}

function createRecoveredContext(
  overrides: Partial<SessionContextResponse> = {},
): SessionContextResponse {
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
    activeGame: createGame("market"),
    activeSnapshot: createSnapshot("market"),
    activeTurnInputs: [],
    gameLogs: [],
    ...overrides,
  };
}

describe("game runtime model settlement lifecycle", () => {
  it("clears the last settlement banner when a new phase starts", () => {
    const previousState = {
      ...createEmptyGameRuntimeState(),
      room: createRoom(),
      game: createGame("market"),
      snapshot: createSnapshot("market"),
      latestSettlement: createLatestSettlement("market"),
    };

    const nextState = applyGamePhaseStarted(previousState, {
      game: createGame("settlement"),
      snapshot: createSnapshot("settlement"),
      submissionStatusByPlayerId: {
        "player-1": "pending",
        "player-2": "pending",
      },
    });

    expect(nextState.latestSettlement).toBeNull();
    expect(nextState.snapshot?.phase).toBe("settlement");
  });

  it("clears the last settlement banner when a snapshot sync advances to a new round", () => {
    const previousState = {
      ...createEmptyGameRuntimeState(),
      room: createRoom(),
      game: createGame("market", 2),
      snapshot: createSnapshot("market", 2),
      latestSettlement: createLatestSettlement("market"),
      submissionStatusByPlayerId: {
        "player-1": "submitted" as const,
        "player-2": "pending" as const,
      },
    };

    const nextState = applyGameSnapshotSync(previousState, {
      room: createRoom(),
      game: createGame("decision", 3),
      snapshot: createSnapshot("decision", 3),
    });

    expect(nextState.latestSettlement).toBeNull();
    expect(nextState.submissionStatusByPlayerId).toEqual({});
    expect(nextState.snapshot?.phase).toBe("decision");
    expect(nextState.snapshot?.round).toBe(3);
  });

  it("rebuilds submission status from recovered turn inputs", () => {
    const state = createRecoveredGameRuntimeState(
      createRecoveredContext({
        activeTurnInputs: [
          createTurnInput({
            playerId: "player-1",
            submissionStatus: "submitted",
          }),
          createTurnInput({
            playerId: "player-2",
            submissionStatus: "timeout_auto_submitted",
            isTimeoutGenerated: true,
          }),
        ],
      }),
    );

    expect(state.submissionStatusByPlayerId).toEqual({
      "player-1": "submitted",
      "player-2": "timeout_auto_submitted",
    });
    expect(state.isCurrentPlayerSubmitted).toBe(true);
    expect(state.canSubmitCurrentPhase).toBe(false);
  });

  it("keeps settlement recovery read-only even when restored inputs exist", () => {
    const state = createRecoveredGameRuntimeState(
      createRecoveredContext({
        activeGame: createGame("settlement"),
        activeSnapshot: createSnapshot("settlement"),
        activeTurnInputs: [
          createTurnInput({
            phase: "settlement",
            submissionStatus: "submitted",
          }),
        ],
      }),
    );

    expect(state.submissionStatusByPlayerId).toEqual({});
    expect(state.canSubmitCurrentPhase).toBe(false);
  });

  it("ignores a stale submission status response after the phase has advanced", () => {
    const state = createRecoveredGameRuntimeState(
      createRecoveredContext({
        activeGame: createGame("market", 3),
        activeSnapshot: createSnapshot("market", 3),
        activeTurnInputs: [],
      }),
    );

    const nextState = applySubmissionStatusUpdate(
      state,
      {
        "player-1": "submitted",
        "player-2": "submitted",
      },
      {
        phase: "decision",
        roundNo: 3,
      },
    );

    expect(nextState.submissionStatusByPlayerId).toEqual({});
    expect(nextState.canSubmitCurrentPhase).toBe(true);
  });
});
