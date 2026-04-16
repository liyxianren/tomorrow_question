import { describe, expect, it } from "vitest";

import { createEmptyGameRuntimeState } from "../runtime/model";
import type { GameRuntimeState } from "../runtime/types";
import {
  createGameSnapshot,
  createRankingWorkspace,
  createSettlementWorkspace,
} from "../../../test/gameSnapshotFixtures";

import { createGameFlowState, createPhaseActionStatusViewModel } from "./gameFlow";

function createRuntimeState(overrides: Partial<GameRuntimeState> = {}): GameRuntimeState {
  return {
    ...createEmptyGameRuntimeState(),
    room: {
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
    },
    game: {
      gameId: "game-1",
      roomCode: "ROOM01",
      currentRound: 2,
      totalRounds: 15,
      currentPhase: "market",
      isFinished: false,
      activeSnapshotId: "snapshot-1",
    },
    snapshot: createGameSnapshot({
      snapshotId: "snapshot-1",
      gameId: "game-1",
      round: 2,
      phase: "market",
    }),
    session: {
      playerId: "player-1",
      sessionId: "session-1",
      nickname: "Britain",
      roomCode: "ROOM01",
      selectedCountry: "britain",
      connectionStatus: "online",
      lastSeenAt: "2026-03-30T11:59:00.000Z",
    },
    submissionStatusByPlayerId: {
      "player-1": "pending",
      "player-2": "pending",
    },
    hasRecoveredFromServer: true,
    canSubmitCurrentPhase: true,
    ...overrides,
  };
}

describe("createGameFlowState", () => {
  it("reads the current player state from nationalStateByPlayer and marks the phase editable", () => {
    const runtimeState = createRuntimeState({
      game: {
        gameId: "game-1",
        roomCode: "ROOM01",
        currentRound: 2,
        totalRounds: 15,
        currentPhase: "decision",
        isFinished: false,
        activeSnapshotId: "snapshot-decision",
      },
      snapshot: createGameSnapshot({
        snapshotId: "snapshot-decision",
        phase: "decision",
      }),
    });

    const flowState = createGameFlowState({
      runtimeState,
      isLoadingContext: false,
      settlementTargetPath: null,
    });

    expect(flowState.currentPlayerState?.countryId).toBe("britain");
    expect(flowState.currentStepLabel).toBe("填写阶段");
    expect(flowState.isEditable).toBe(true);
    expect(flowState.hasSubmitted).toBe(false);
    expect(flowState.statusMessage).toBe("当前可以填写并提交本阶段操作。");
  });

  it("switches to waiting settlement after the current player has submitted", () => {
    const runtimeState = createRuntimeState({
      submissionStatusByPlayerId: {
        "player-1": "submitted",
        "player-2": "pending",
      },
      isCurrentPlayerSubmitted: true,
      canSubmitCurrentPhase: false,
    });

    const flowState = createGameFlowState({
      runtimeState,
      isLoadingContext: false,
      settlementTargetPath: null,
    });
    const statusViewModel = createPhaseActionStatusViewModel({
      currentPhase: "market",
      flowState,
      runtimeState,
    });

    expect(flowState.currentStepLabel).toBe("等待结算");
    expect(flowState.isWaitingSettlement).toBe(true);
    expect(statusViewModel.badge).toBe("等待玩家");
    expect(statusViewModel.showSubmitAction).toBe(false);
  });

  it("shows the settled state once the latest settlement payload is available", () => {
    const runtimeState = createRuntimeState({
      latestSettlement: {
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 2,
          totalRounds: 15,
          currentPhase: "settlement",
          isFinished: false,
          activeSnapshotId: "snapshot-settlement",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-settlement",
          phase: "settlement",
          rankingWorkspace: createRankingWorkspace(),
          lastSettlementWorkspace: createSettlementWorkspace({
            phaseLabel: "市场出售",
            headline: "市场出售阶段已经完成结算，国家收入已进入三池分账。",
          }),
        }),
        logs: [],
        autoSubmittedPlayerIds: [],
        rankingWorkspace: createRankingWorkspace(),
        lastSettlementWorkspace: createSettlementWorkspace({
          phaseLabel: "市场出售",
          headline: "市场出售阶段已经完成结算，国家收入已进入三池分账。",
        }),
      },
      canSubmitCurrentPhase: false,
    });

    const flowState = createGameFlowState({
      runtimeState,
      isLoadingContext: false,
      settlementTargetPath: null,
    });
    const statusViewModel = createPhaseActionStatusViewModel({
      currentPhase: "settlement",
      flowState,
      runtimeState,
    });

    expect(flowState.currentStepLabel).toBe("查看阶段结果");
    expect(statusViewModel.kind).toBe("settled");
    expect(statusViewModel.badge).toBe("已结算");
  });

  it("marks the flow ready for redirect after the final result arrives", () => {
    const runtimeState = createRuntimeState({
      game: {
        gameId: "game-1",
        roomCode: "ROOM01",
        currentRound: 15,
        totalRounds: 15,
        currentPhase: "settlement",
        isFinished: true,
        activeSnapshotId: "snapshot-final",
      },
      finalResult: {
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 15,
          totalRounds: 15,
          currentPhase: "settlement",
          isFinished: true,
          activeSnapshotId: "snapshot-final",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-final",
          round: 15,
          phase: "settlement",
          phaseDeadlineAt: null,
        }),
        finalRanking: [],
        finalLogs: [],
      },
    });

    const flowState = createGameFlowState({
      runtimeState,
      isLoadingContext: false,
      settlementTargetPath: "/settlement/game-1",
    });
    const statusViewModel = createPhaseActionStatusViewModel({
      currentPhase: "settlement",
      flowState,
      runtimeState,
    });

    expect(flowState.currentStepLabel).toBe("进入下一阶段/最终结算");
    expect(flowState.shouldRedirectToSettlement).toBe(true);
    expect(statusViewModel.kind).toBe("finished");
  });
});
