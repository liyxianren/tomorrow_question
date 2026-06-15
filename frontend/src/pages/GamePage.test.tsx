import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameRuntimeState } from "../features/game/runtime/types";
import { createEmptyGameRuntimeState } from "../features/game/runtime/model";
import { createGameSnapshot } from "../test/gameSnapshotFixtures";

import { GamePage } from "./GamePage";

const { mockUseGameRuntime, mockUpdateSubmissionStatusByPlayerId } = vi.hoisted(() => ({
  mockUseGameRuntime: vi.fn(),
  mockUpdateSubmissionStatusByPlayerId: vi.fn(),
}));

vi.mock("../features/game/runtime/useGameRuntime", () => ({
  useGameRuntime: mockUseGameRuntime,
}));

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
      totalRounds: 10,
      currentPhase: "market",
      isFinished: false,
      activeSnapshotId: "snapshot-1",
    },
    snapshot: createGameSnapshot({
      snapshotId: "snapshot-1",
      phase: "market",
      round: 2,
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
    socketState: "connected",
    secondsRemaining: 90,
    submissionStatusByPlayerId: {
      "player-1": "pending",
      "player-2": "pending",
    },
    hasRecoveredFromServer: true,
    isCurrentPlayerSubmitted: false,
    canSubmitCurrentPhase: true,
    ...overrides,
  };
}

function renderGamePage() {
  const router = createMemoryRouter(
    [
      {
        path: "/game/:gameId",
        element: <GamePage />,
      },
      {
        path: "/settlement/:gameId",
        element: <div>settlement route</div>,
      },
    ],
    {
      initialEntries: ["/game/game-1"],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("GamePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createRuntimeState(),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: null,
      updateSubmissionStatusByPlayerId: mockUpdateSubmissionStatusByPlayerId,
    });
  });

  it("renders the 2.0 market workbench without treasury wording", () => {
    renderGamePage();

    expect(screen.getByTestId("game-map-view")).toBeInTheDocument();
    expect(screen.getByTestId("game-country")).toHaveTextContent("英国");
    expect(screen.getByTestId("game-round")).toHaveTextContent("第 2 / 10 回合");
    expect(screen.getByTestId("game-phase")).toHaveTextContent("当前阶段：市场出售");
    expect(screen.getByTestId("game-resource-strip")).toBeInTheDocument();
    expect(screen.getByTestId("map-building-market")).toBeInTheDocument();
    expect(screen.getByTestId("game-submit-button")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("国库");
    expect(document.body.textContent).not.toContain("累计回流");
  });

  it("keeps submit available in decision while warning about unchecked guided steps", () => {
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createRuntimeState({
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 2,
          totalRounds: 10,
          currentPhase: "decision",
          isFinished: false,
          activeSnapshotId: "snapshot-decision",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-decision",
          phase: "decision",
          round: 2,
        }),
      }),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: null,
      updateSubmissionStatusByPlayerId: mockUpdateSubmissionStatusByPlayerId,
    });

    renderGamePage();

    expect(screen.getByTestId("game-workflow-step-factory")).toBeInTheDocument();
    expect(screen.getByTestId("game-workflow-step-domestic")).toBeInTheDocument();
    expect(screen.getByTestId("game-workflow-step-government")).toBeInTheDocument();
    expect(screen.getByTestId("game-workflow-step-military")).toBeInTheDocument();
    expect(screen.getByTestId("game-resource-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("game-settlement-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("game-ranking-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("game-map-view")).toBeInTheDocument();
    expect(screen.getByTestId("map-building-factory")).toBeInTheDocument();
    expect(screen.getByTestId("map-building-domestic")).toBeInTheDocument();
    expect(screen.getByTestId("map-building-government")).toBeInTheDocument();
    expect(screen.getByTestId("map-building-military")).toBeInTheDocument();
    expect(screen.getByTestId("game-submit-button")).toBeInTheDocument();
  });

  it("opens the industrial panel from the map and keeps step switching in sync", async () => {
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createRuntimeState({
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 2,
          totalRounds: 10,
          currentPhase: "decision",
          isFinished: false,
          activeSnapshotId: "snapshot-decision",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-decision",
          phase: "decision",
          round: 2,
        }),
      }),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: null,
      updateSubmissionStatusByPlayerId: mockUpdateSubmissionStatusByPlayerId,
    });

    renderGamePage();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("工业区"));
    expect(screen.getByTestId("map-modal")).toBeInTheDocument();
    expect(screen.getByTestId("factory-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-factory")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByTestId("decision-step-tab-government"));
    expect(screen.getByTestId("government-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-government")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByLabelText("军事要塞"));
    expect(screen.getByTestId("military-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-military")).toHaveAttribute("aria-pressed", "true");
  });

  it("opens 市民广场 as the dedicated domestic tactical panel from the map", async () => {
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createRuntimeState({
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 2,
          totalRounds: 10,
          currentPhase: "decision",
          isFinished: false,
          activeSnapshotId: "snapshot-decision",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-decision",
          phase: "decision",
          round: 2,
        }),
      }),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: null,
      updateSubmissionStatusByPlayerId: mockUpdateSubmissionStatusByPlayerId,
    });

    renderGamePage();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("市民广场"));

    expect(screen.getByTestId("map-modal")).toBeInTheDocument();
    expect(screen.getByTestId("domestic-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-domestic")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows settlement as a read-only stage without a submit button", () => {
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createRuntimeState({
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 2,
          totalRounds: 10,
          currentPhase: "settlement",
          isFinished: false,
          activeSnapshotId: "snapshot-settlement",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-settlement",
          phase: "settlement",
          round: 2,
          phaseDeadlineAt: null,
        }),
        secondsRemaining: null,
        canSubmitCurrentPhase: false,
      }),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: null,
      updateSubmissionStatusByPlayerId: mockUpdateSubmissionStatusByPlayerId,
    });

    renderGamePage();

    expect(screen.getByTestId("game-map-view")).toBeInTheDocument();
    expect(screen.getByText("财政结算台")).toBeInTheDocument();
    expect(screen.queryByTestId("game-submit-button")).not.toBeInTheDocument();
  });

  it("uses final archive wording during the last settlement countdown", () => {
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createRuntimeState({
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 10,
          totalRounds: 10,
          currentPhase: "settlement",
          isFinished: false,
          activeSnapshotId: "snapshot-final-settlement",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-final-settlement",
          phase: "settlement",
          round: 10,
          phaseDeadlineAt: null,
        }),
        secondsRemaining: 10,
        canSubmitCurrentPhase: false,
      }),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: null,
      updateSubmissionStatusByPlayerId: mockUpdateSubmissionStatusByPlayerId,
    });

    renderGamePage();

    expect(screen.getAllByText(/10 秒后进入终局档案/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("10 秒后进入下一回合");
  });

  it("redirects to the settlement route after finalResult is ready", async () => {
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createRuntimeState({
        game: {
          gameId: "game-1",
          roomCode: "ROOM01",
          currentRound: 10,
          totalRounds: 10,
          currentPhase: "settlement",
          isFinished: true,
          activeSnapshotId: "snapshot-final",
        },
        snapshot: createGameSnapshot({
          snapshotId: "snapshot-final",
          phase: "settlement",
          round: 10,
          phaseDeadlineAt: null,
        }),
        finalResult: {
          game: {
            gameId: "game-1",
            roomCode: "ROOM01",
            currentRound: 10,
            totalRounds: 10,
            currentPhase: "settlement",
            isFinished: true,
            activeSnapshotId: "snapshot-final",
          },
          snapshot: createGameSnapshot({
            snapshotId: "snapshot-final",
            phase: "settlement",
            round: 10,
            phaseDeadlineAt: null,
          }),
          finalRanking: [],
          finalLogs: [],
        },
      }),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: "/settlement/game-1",
      updateSubmissionStatusByPlayerId: mockUpdateSubmissionStatusByPlayerId,
    });

    const router = renderGamePage();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settlement/game-1");
    });
  });
});
