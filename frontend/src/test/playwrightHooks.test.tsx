import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LobbyContinueBanner } from "../components/lobby/LobbyContinueBanner";
import { IdentityGateForm } from "../components/lobby/IdentityGateForm";
import { LobbyEntryForm } from "../components/lobby/LobbyEntryForm";
import { LobbyWaitingRoomsSection } from "../components/lobby/LobbyWaitingRoomsSection";
import { CountrySelectionPanel } from "../components/room/CountrySelectionPanel";
import { RoomHeaderPanel } from "../components/room/RoomHeaderPanel";
import { RoomMembersPanel } from "../components/room/RoomMembersPanel";
import { RoomReadyPanel } from "../components/room/RoomReadyPanel";
import { GamePage } from "../pages/GamePage";
import { SettlementPage } from "../pages/SettlementPage";
import { createGameSnapshot } from "./gameSnapshotFixtures";

import type { GameFinishedPayload, GameRuntimeState } from "../features/game/runtime/types";
import type { RoomContext } from "../types";

const { mockUseGameRuntime } = vi.hoisted(() => ({
  mockUseGameRuntime: vi.fn(),
}));

vi.mock("../features/game/runtime/useGameRuntime", () => ({
  useGameRuntime: mockUseGameRuntime,
}));

function createRoom(): RoomContext {
  return {
    roomCode: "ROOM01",
    status: "waiting",
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
        connectionStatus: "offline_recoverable",
        isReady: false,
      },
    ],
    countrySlots: {
      britain: "player-1",
      france: "player-2",
      prussia: null,
      austria: null,
      russia: null,
    },
    currentGameId: null,
    lastActivityAt: "2026-03-30T12:00:00.000Z",
  };
}

function createGameRuntimeState(): GameRuntimeState {
  return {
    room: {
      ...createRoom(),
      status: "in_game",
      currentGameId: "game-1",
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
      gameId: "game-1",
      phase: "market",
      round: 2,
      phaseDeadlineAt: "2026-03-30T12:01:30.000Z",
    }),
    session: {
      playerId: "player-1",
      sessionId: "session-1",
      nickname: "Britain",
      roomCode: "ROOM01",
      selectedCountry: "britain",
      connectionStatus: "online",
      lastSeenAt: "2026-03-30T12:00:00.000Z",
    },
    recoveredTurnInputs: [],
    recoveredLogs: [],
    socketState: "connected",
    secondsRemaining: 90,
    submissionStatusByPlayerId: {
      "player-1": "pending",
      "player-2": "pending",
    },
    latestSettlement: null,
    finalResult: null,
    hasRecoveredFromServer: true,
    isCurrentPlayerSubmitted: false,
    canSubmitCurrentPhase: true,
  };
}

function createFinalResult(): GameFinishedPayload {
  return {
    game: {
      gameId: "game-15",
      roomCode: "ROOM15",
      currentRound: 10,
      totalRounds: 10,
      currentPhase: "settlement",
      isFinished: true,
      activeSnapshotId: "snapshot-15",
    },
    snapshot: createGameSnapshot({
      snapshotId: "snapshot-15",
      gameId: "game-15",
      round: 10,
      phase: "settlement",
      phaseDeadlineAt: null,
    }),
    finalRanking: [
      {
        rank: 1,
        playerId: "player-1",
        country: "britain",
        nickname: "Ada",
        totalIncome: 42,
        cumulativeNationalIncome: 42,
        tieBreak: {
          productionCapacity: 2,
          controlledRegions: 1,
          budgetPoolsTotal: 20,
        },
      },
    ],
    finalLogs: [
      {
        gameId: "game-15",
        roundNo: 10,
        phase: null,
        kind: "final_result",
        message: "大英帝国取得最终胜利。",
        details: {},
        createdAt: "2026-03-30T14:00:00Z",
      },
    ],
  };
}

describe("Playwright hook contracts", () => {
  it("exposes identity and lobby selectors for waiting-room entry and the conditional continue-game banner", () => {
    render(
      <>
        <IdentityGateForm
          message={null}
          nickname="Britain"
          onClearIdentity={() => {}}
          onContinue={() => {}}
          onNicknameChange={() => {}}
          profileId="profile-britain01"
        />
        <LobbyEntryForm
          isBusy={false}
          onCreateRoom={() => {}}
          onJoinRoom={() => {}}
          onRoomCodeChange={() => {}}
          pendingAction={null}
          roomCode="ROOM01"
        />
        <LobbyWaitingRoomsSection
          errorMessage={null}
          isBusy={false}
          isLoading={false}
          onJoinRoom={() => {}}
          onRefresh={() => {}}
          rooms={[
            {
              roomCode: "ROOM01",
              hostLabel: "房主 Britain",
              memberCountLabel: "2 / 5 人",
              availableSeatLabel: "3 个空位",
              readyCountLabel: "准备 1 / 2",
              selectedCountriesLabel: "已选 2 / 5 个国家",
              statusLabel: "可直接加入",
              activityLabel: "最近有活动",
              occupancyPercent: 40,
              memberPreview: ["Britain · 英国", "France · 法国"],
              joinLabel: "加入 ROOM01",
              isJoinable: true,
            },
          ]}
        />
        <MemoryRouter>
          <LobbyContinueBanner
            viewModel={{
              title: "可恢复的进度",
              description: "已找到之前离开的房间或对局。",
              actionLabel: "回到对局",
              targetPath: "/game/game-1",
            }}
          />
        </MemoryRouter>
      </>,
    );

    expect(screen.getByTestId("identity-nickname-input")).toHaveAccessibleName("昵称");
    expect(screen.getByTestId("lobby-create-room-button")).toHaveTextContent("创建房间");
    expect(screen.getByTestId("lobby-waiting-room-ROOM01")).toHaveTextContent("加入 ROOM01");
    expect(screen.getByTestId("lobby-continue-banner")).toBeInTheDocument();
  });

  it("exposes room selectors on header, members, country, and ready panels", () => {
    const room = createRoom();

    render(
      <>
        <RoomHeaderPanel
          currentPlayer={room.members[0]}
          isLoading={false}
          room={room}
          socketState="connected"
          statusMessage="你已准备完成，等待其他玩家准备后自动开局。"
        />
        <RoomMembersPanel currentPlayerId="player-1" room={room} />
        <CountrySelectionPanel
          currentPlayerId="player-1"
          isBusy={false}
          onSelectCountry={() => {}}
          room={room}
        />
        <RoomReadyPanel
          currentPlayer={room.members[0]}
          isBusy={false}
          onToggleReady={() => {}}
          room={room}
          statusMessage="你已准备完成，等待其他玩家准备后自动开局。"
        />
      </>,
    );

    expect(screen.getByTestId("room-code")).toHaveTextContent("ROOM01");
    expect(screen.getByTestId("room-members-panel")).toBeInTheDocument();
    expect(screen.getByTestId("room-country-panel")).toBeInTheDocument();
    expect(screen.getByTestId("room-ready-button")).toHaveTextContent("取消准备");
  });

  it("exposes game selectors for workbench, ranking, and settlement feedback", () => {
    mockUseGameRuntime.mockReturnValue({
      runtimeState: createGameRuntimeState(),
      isLoadingContext: false,
      loadError: null,
      settlementTargetPath: null,
      updateSubmissionStatusByPlayerId: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/game/game-1"]}>
        <Routes>
          <Route element={<GamePage />} path="/game/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("game-round")).toHaveTextContent("第 2 / 10 回合");
    expect(screen.getByTestId("game-phase")).toHaveTextContent("当前阶段：市场出售");
    expect(screen.getByTestId("game-map-view")).toBeInTheDocument();
    expect(screen.getByTestId("game-resource-strip")).toBeInTheDocument();
    expect(screen.getByTestId("game-submit-button")).toBeInTheDocument();
  });

  it("exposes settlement selectors for ranking, logs, and return links", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: {
              result: createFinalResult(),
              roomCode: "ROOM15",
            },
          },
        ]}
      >
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("settlement-ranking-panel")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-final-logs")).toHaveTextContent("终局日志时间线");
    expect(screen.getByTestId("settlement-back-lobby")).toHaveAttribute("href", "/lobby");
    expect(screen.getByTestId("settlement-back-room")).toHaveAttribute("href", "/room/ROOM15");
  });
});
