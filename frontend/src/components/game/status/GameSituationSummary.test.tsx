import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEmptyGameRuntimeState } from "../../../features/game/runtime/model";
import type { GameRuntimeState } from "../../../features/game/runtime/types";
import {
  createGameSnapshot,
  createNationalState,
} from "../../../test/gameSnapshotFixtures";

import { GameSituationSummary } from "./GameSituationSummary";

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
      lastActivityAt: "2026-04-09T12:00:00.000Z",
    },
    game: {
      gameId: "game-1",
      roomCode: "ROOM01",
      currentRound: 4,
      totalRounds: 15,
      currentPhase: "decision",
      isFinished: false,
      activeSnapshotId: "snapshot-1",
    },
    snapshot: createGameSnapshot({
      snapshotId: "snapshot-1",
      phase: "decision",
      round: 4,
      activeEvents: [
        {
          eventId: "grain_crisis",
          label: "粮食歉收",
          description: "粮价飙升，国内市场承接能力下降。",
          remainingRounds: 2,
        },
      ],
      nationalStateByPlayer: {
        "player-1": createNationalState({
          ideologyLevels: {
            liberalism: 5,
            egalitarianism: 3,
            nationalism: 7,
          },
          reforms: ["产业自由化", "公共教育"],
        }),
        "player-2": createNationalState({
          countryId: "france",
        }),
      },
    }),
    session: {
      playerId: "player-1",
      sessionId: "session-1",
      nickname: "Britain",
      roomCode: "ROOM01",
      selectedCountry: "britain",
      connectionStatus: "online",
      lastSeenAt: "2026-04-09T11:58:00.000Z",
    },
    socketState: "connected",
    secondsRemaining: 75,
    submissionStatusByPlayerId: {},
    hasRecoveredFromServer: true,
    isCurrentPlayerSubmitted: false,
    canSubmitCurrentPhase: true,
    ...overrides,
  };
}

describe("GameSituationSummary", () => {
  it("renders active events, ideology progress, reforms, and the phase timer", () => {
    render(
      <GameSituationSummary
        isLoading={false}
        runtimeState={createRuntimeState()}
      />,
    );

    expect(screen.getByTestId("game-active-events")).toBeInTheDocument();
    expect(screen.getByTestId("game-active-event-grain_crisis")).toBeInTheDocument();
    expect(screen.getByText("粮食歉收")).toBeInTheDocument();
    expect(screen.getByText("剩余 2 回合")).toBeInTheDocument();
    expect(screen.getByTestId("game-ideology-panel")).toBeInTheDocument();
    expect(screen.getByText("自由主义")).toBeInTheDocument();
    expect(screen.getByText("5 / 10")).toBeInTheDocument();
    expect(screen.getByText("产业自由化")).toBeInTheDocument();
    expect(screen.getByText("公共教育")).toBeInTheDocument();
    expect(screen.getByText("01:15")).toBeInTheDocument();
  });
});
