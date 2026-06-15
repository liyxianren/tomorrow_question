import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../i18n";
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
      currentRound: 10,
      totalRounds: 10,
      currentPhase: "settlement",
      isFinished: true,
      activeSnapshotId: "snapshot-15-settlement",
    },
    snapshot: createGameSnapshot({
      snapshotId: "snapshot-15-settlement",
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
        roundNo: 10,
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
      "如果你是法国，下一局要更早把海外收益转成下一轮资源空间。",
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
    expect(screen.getByText("同分比较：总产能：2，控制区域数：1，资源总额：20")).toBeInTheDocument();
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

  it("shows ranking deltas with arrows and labels", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: { result: createFinalResult(), roomCode: "ROOM15" },
          },
        ]}
      >
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    const deltas = screen.getAllByTestId("ranking-delta");
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toHaveTextContent("▲ 领先 3");
    expect(deltas[1]).toHaveTextContent("▼ 落后 3");
  });

  it("groups final logs by category and renders an emoji label", () => {
    const finalResult = createFinalResult();
    finalResult.finalLogs = [
      {
        gameId: "game-15",
        roundNo: 12,
        phase: "market",
        kind: "market.resolved",
        message: "市场结算：英国海外销售额 18。",
        details: {},
        createdAt: "2026-03-30T13:30:00Z",
      },
      {
        gameId: "game-15",
        roundNo: 13,
        phase: "settlement",
        kind: "settlement.region_revolt",
        message: "苏格兰发生暴动，损失行政点 3。",
        details: {},
        createdAt: "2026-03-30T13:45:00Z",
      },
      {
        gameId: "game-15",
        roundNo: 10,
        phase: null,
        kind: "final_result",
        message: "大英帝国取得最终胜利。",
        details: {},
        createdAt: "2026-03-30T14:00:00Z",
      },
    ];

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: { result: finalResult, roomCode: "ROOM15" },
          },
        ]}
      >
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("settlement-log-group-final")).toHaveTextContent("终局裁定");
    expect(screen.getByTestId("settlement-log-group-events")).toHaveTextContent("事件与异常");
    expect(screen.getByTestId("settlement-log-group-economy")).toHaveTextContent("经济与财政");
  });

  it("localizes raw backend settlement logs before rendering the final timeline", () => {
    const finalResult = createFinalResult();
    finalResult.finalLogs = [
      {
        gameId: "game-15",
        roundNo: 10,
        phase: "settlement",
        kind: "settlement.resolved",
        message: "france completed national income allocation.",
        details: {},
        createdAt: "2026-03-30T13:58:00Z",
      },
      {
        gameId: "game-15",
        roundNo: 10,
        phase: "settlement",
        kind: "settlement.phase_resolved",
        message: "Final fiscal settlement is complete.",
        details: {},
        createdAt: "2026-03-30T14:00:00Z",
      },
      {
        gameId: "game-15",
        roundNo: 10,
        phase: "settlement",
        kind: "settlement.resolved",
        message: "Britain completed Round 10 fiscal allocation.",
        details: {},
        createdAt: "2026-03-30T14:00:01Z",
      },
    ];

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: { result: finalResult, roomCode: "ROOM15" },
          },
        ]}
      >
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("settlement-final-logs")).toHaveTextContent("法国完成第 10 回合财政分配。");
    expect(screen.getByTestId("settlement-final-logs")).toHaveTextContent("英国完成第 10 回合财政分配。");
    expect(screen.getByTestId("settlement-final-logs")).toHaveTextContent("终局财政结算已完成。");
    expect(screen.queryByText("france completed national income allocation.")).not.toBeInTheDocument();
    expect(screen.queryByText("Britain completed Round 10 fiscal allocation.")).not.toBeInTheDocument();
    expect(screen.queryByText("Final fiscal settlement is complete.")).not.toBeInTheDocument();
  });

  it("prioritizes player military and strategic logs before routine economy logs", () => {
    const finalResult = createFinalResult();
    finalResult.finalLogs = [
      {
        gameId: "game-15",
        roundNo: 10,
        phase: "settlement",
        kind: "settlement.resolved",
        message: "法国完成财政结算。",
        details: { playerId: "player-2" },
        createdAt: "2026-03-30T13:58:00Z",
      },
      {
        gameId: "game-15",
        roundNo: 12,
        phase: "decision",
        kind: "military.naval_blockade",
        message: "英国投入舰队封锁美洲地区。",
        details: { playerId: "player-1" },
        createdAt: "2026-03-30T13:20:00Z",
      },
      {
        gameId: "game-15",
        roundNo: 10,
        phase: null,
        kind: "final_result",
        message: "大英帝国取得最终胜利。",
        details: {},
        createdAt: "2026-03-30T14:00:00Z",
      },
    ];

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: { result: finalResult, roomCode: "ROOM15" },
          },
        ]}
      >
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    const timelineText = screen.getByTestId("settlement-final-logs").textContent ?? "";
    expect(timelineText.indexOf("英国投入舰队封锁美洲地区。")).toBeGreaterThanOrEqual(0);
    expect(timelineText.indexOf("英国投入舰队封锁美洲地区。")).toBeLessThan(
      timelineText.indexOf("法国完成财政结算。"),
    );
  });

  it("collapses long log messages by default and toggles on click", () => {
    const finalResult = createFinalResult();
    const longMessage = "这是一段非常详尽的复盘信息，".repeat(8);
    finalResult.finalLogs = [
      {
        gameId: "game-15",
        roundNo: 10,
        phase: null,
        kind: "final_result",
        message: longMessage,
        details: {},
        createdAt: "2026-03-30T14:00:00Z",
      },
    ];

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: { result: finalResult, roomCode: "ROOM15" },
          },
        ]}
      >
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    const timeline = screen.getByTestId("settlement-final-logs");
    const expandButton = screen.getByRole("button", { name: "展开" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(timeline.textContent ?? "").toMatch(/…/);
    expect(timeline).not.toHaveTextContent(longMessage);

    fireEvent.click(expandButton);
    expect(screen.getByRole("button", { name: "收起" })).toHaveAttribute("aria-expanded", "true");
    expect(timeline).toHaveTextContent(longMessage);
  });

  it("renders the final archive without Chinese labels or punctuation in English mode", async () => {
    await i18n.changeLanguage("en");

    const finalResult = createFinalResult();
    finalResult.finalLogs = [
      {
        gameId: "game-15",
        roundNo: 10,
        phase: "settlement",
        kind: "settlement.phase_resolved",
        message: "Final fiscal settlement is complete.",
        details: {},
        createdAt: "2026-03-30T14:00:00Z",
      },
    ];

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/settlement/game-15",
            state: { result: finalResult, roomCode: "ROOM15" },
          },
        ]}
      >
        <Routes>
          <Route element={<SettlementPage />} path="/settlement/:gameId" />
        </Routes>
      </MemoryRouter>,
    );

    const pageText = screen.getByTestId("settlement-center-stage").textContent ?? "";
    expect(screen.getByText("Archive ID: game-15")).toBeInTheDocument();
    expect(pageText).toContain("Cumulative National Income: 42");
    expect(pageText).toContain("Tie-break Comparison: Production capacity: 2, controlled regions: 1, total resources: 20");
    expect(pageText).not.toMatch(/[\u4e00-\u9fff]/);
    expect(pageText).not.toMatch(/[：，。、（）]/);
  });
});
