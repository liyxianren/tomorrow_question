import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameFinishedPayload } from "../features/game/runtime/types";
import { createGameSnapshot } from "../test/gameSnapshotFixtures";

import { SettlementPage } from "./SettlementPage";

const { mockFetchFinalResult } = vi.hoisted(() => ({
  mockFetchFinalResult: vi.fn(),
}));

vi.mock("../services/game", async () => {
  const actual = await vi.importActual<typeof import("../services/game")>("../services/game");

  return {
    ...actual,
    fetchFinalResult: mockFetchFinalResult,
  };
});

function createFinalResult(): GameFinishedPayload {
  return {
    game: {
      gameId: "game-15",
      roomCode: "ROOM15",
      currentRound: 15,
      totalRounds: 15,
      currentPhase: "settlement",
      isFinished: true,
      activeSnapshotId: "snapshot-15-settlement",
    },
    snapshot: createGameSnapshot({
      snapshotId: "snapshot-15-settlement",
      gameId: "game-15",
      round: 15,
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
      {
        rank: 2,
        playerId: "player-2",
        country: "france",
        nickname: "Linus",
        totalIncome: 39,
        cumulativeNationalIncome: 39,
        tieBreak: {
          productionCapacity: 1,
          controlledRegions: 0,
          budgetPoolsTotal: 12,
        },
      },
    ],
    finalLogs: [
      {
        gameId: "game-15",
        roundNo: 15,
        phase: null,
        kind: "final_result",
        message: "大英帝国取得最终胜利。",
        details: {},
        createdAt: "2026-03-30T14:00:00Z",
      },
    ],
    whyRankChanged: [
      "英国在市场出售和财政结算阶段持续保持更高累计国家收入，因此把领先优势留到了终局。",
    ],
    turningPointCards: [
      {
        title: "第 8 回合：英国把钢材卖进高价区",
        detail: "这一轮让英国把累计国家收入差距拉开到 6 点，之后法国再也没有完全追上。",
      },
    ],
    replayGuidance: [
      "如果你是法国，下一局要更早把海外收益转成下一轮三池空间。",
    ],
  };
}

function createLegacyFinalResult(): GameFinishedPayload {
  const finalResult = createFinalResult() as GameFinishedPayload & {
    replayGuidance?: string[];
    whyRankChanged?: string[];
  };

  delete finalResult.whyRankChanged;
  delete finalResult.replayGuidance;

  return finalResult;
}

describe("SettlementPage", () => {
  beforeEach(() => {
    mockFetchFinalResult.mockResolvedValue(createFinalResult());
  });

  it("renders final ranking and final logs from route state", () => {
    const finalResult = createFinalResult();

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: {
              result: finalResult,
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

    expect(document.querySelector(".game-workbench--wide-a")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-left-rail")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-center-stage")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-assist-rail")).toBeInTheDocument();
    expect(screen.getByText("终局已归档")).toBeInTheDocument();
    expect(screen.getByText("最终排名主表")).toBeInTheDocument();
    expect(screen.getByText("累计国家收入：42")).toBeInTheDocument();
    expect(screen.getByText("同分比较：总产能：2，控制区域数：1，三池总额：20")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-left-rail")).toHaveTextContent("最终国家档案");
    expect(screen.getByTestId("settlement-assist-rail")).toHaveTextContent("终局判断辅助");
    expect(screen.getByText("英国 以 42 累计国家收入位列第一。")).toBeInTheDocument();
    expect(screen.getByText(/第 8 回合：英国把钢材卖进高价区/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "凯旋并返回大厅" })).toHaveAttribute("href", "/lobby");
    expect(screen.getByRole("link", { name: "重开纪元" })).toHaveAttribute("href", "/room/ROOM15");
  });

  it("falls back to unified 2.0 wording when replay guidance is absent", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: {
              result: createLegacyFinalResult(),
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

    expect(screen.getByText("英国这局主打“稳增长”，最终累计国家收入 42，领先 法国 3。")).toBeInTheDocument();
    expect(screen.getByText("如果你是 英国，继续“稳增长”，把优势滚到后续回合，换成更大的下轮空间。")).toBeInTheDocument();
  });

  it("loads the final result from the backend when route state is missing", async () => {
    render(
      <MemoryRouter initialEntries={["/settlement/game-15"]}>
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(mockFetchFinalResult).toHaveBeenCalledWith("game-15");
    expect(await screen.findByText("终局已归档")).toBeInTheDocument();
    expect(screen.getByText("英国 以 42 累计国家收入位列第一。")).toBeInTheDocument();
    expect(screen.getByText("为什么停在这里")).toBeInTheDocument();
  });
});
