import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../services/http";
import type { SubmitPhaseResponse } from "../../../services/game";
import { submitPhase } from "../../../services/game";

import { UnifiedSubmitPanel } from "./UnifiedSubmitPanel";

vi.mock("../../../services/game", () => ({
  submitPhase: vi.fn(),
}));

describe("UnifiedSubmitPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the current decision payload and shows waiting feedback while other players are pending", async () => {
    let resolveRequest: ((value: SubmitPhaseResponse) => void) | null = null;

    vi.mocked(submitPhase).mockImplementationOnce(
      () =>
        new Promise<SubmitPhaseResponse>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    render(
      <UnifiedSubmitPanel
        canSubmit
        draftPayload={{
          factoryPlan: {
            productionOrders: [{ goodsId: "steel", quantity: 2 }],
            expansionOrders: [],
            upgradeOrders: [],
            newFactoryOrders: [],
          },
          domesticMarketPlan: {
            domesticMarketActions: [],
          },
          governmentPlan: {
            pointPurchases: [],
            strategySelections: [],
            techResearch: [],
          },
        }}
        gameId="game-1"
        phase="decision"
        playerId="player-1"
        roundNo={3}
        submissionStatus="pending"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    expect(submitPhase).toHaveBeenCalledWith("game-1", "decision", {
      factoryPlan: {
        productionOrders: [{ goodsId: "steel", quantity: 2 }],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [],
      },
    });
    expect(screen.getByRole("button", { name: "提交中..." })).toBeDisabled();

    resolveRequest!({
      submission: {
        gameId: "game-1",
        roundNo: 3,
        phase: "decision",
        playerId: "player-1",
        submissionStatus: "submitted",
        payload: {
          factoryPlan: {
            productionOrders: [{ goodsId: "steel", quantity: 2 }],
            expansionOrders: [],
            upgradeOrders: [],
            newFactoryOrders: [],
          },
          domesticMarketPlan: {
            domesticMarketActions: [],
          },
          governmentPlan: {
            pointPurchases: [],
            strategySelections: [],
            techResearch: [],
          },
        },
        submittedAt: "2026-03-30T12:00:00Z",
        isTimeoutGenerated: false,
      },
      submissionStatus: {
        "player-1": "submitted",
        "player-2": "pending",
      },
      phase: "decision",
      roundNo: 3,
      allSubmitted: false,
      settlementTriggered: false,
    });

    await waitFor(() => {
      expect(screen.getByText("已提交")).toBeInTheDocument();
      expect(screen.getByText(/等待其他 1 名玩家/)).toBeInTheDocument();
    });
  });

  it("renders a clear submit error for contract error codes", async () => {
    vi.mocked(submitPhase).mockRejectedValueOnce(
      new ApiRequestError("Deadline passed", 409, "DEADLINE_PASSED"),
    );

    render(
      <UnifiedSubmitPanel
        canSubmit
        draftPayload={{ saleOrders: [{ goodsId: "steel", market: "domestic", quantity: 2 }] }}
        gameId="game-1"
        phase="market"
        playerId="player-1"
        roundNo={3}
        submissionStatus="pending"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    expect(await screen.findByText("提交截止时间已过。")).toBeInTheDocument();
  });

  it("does not reuse a stale local submission response after the phase changes", async () => {
    let resolveRequest: ((value: SubmitPhaseResponse) => void) | null = null;

    vi.mocked(submitPhase).mockImplementationOnce(
      () =>
        new Promise<SubmitPhaseResponse>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const { rerender } = render(
      <UnifiedSubmitPanel
        canSubmit
        draftPayload={{ factoryPlan: { productionOrders: [] } }}
        gameId="game-1"
        phase="decision"
        playerId="player-1"
        roundNo={3}
        submissionStatus="pending"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "确认提交" }));

    rerender(
      <UnifiedSubmitPanel
        canSubmit
        draftPayload={{ saleOrders: [] }}
        gameId="game-1"
        phase="market"
        playerId="player-1"
        roundNo={3}
        submissionStatus="pending"
      />,
    );

    resolveRequest!({
      submission: {
        gameId: "game-1",
        roundNo: 3,
        phase: "decision",
        playerId: "player-1",
        submissionStatus: "submitted",
        payload: { factoryPlan: { productionOrders: [] } },
        submittedAt: "2026-03-30T12:00:00Z",
        isTimeoutGenerated: false,
      },
      submissionStatus: {
        "player-1": "submitted",
        "player-2": "submitted",
      },
      phase: "decision",
      roundNo: 3,
      allSubmitted: true,
      settlementTriggered: true,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确认提交" })).not.toBeDisabled();
      expect(screen.queryByText("已提交")).not.toBeInTheDocument();
    });
  });

  it("shows the non-submittable state without calling the service", () => {
    render(
      <UnifiedSubmitPanel
        canSubmit={false}
        draftPayload={{}}
        gameId="game-1"
        phase="market"
        playerId="player-1"
        roundNo={3}
        submissionStatus="pending"
      />,
    );

    expect(screen.getByRole("button", { name: "当前不可提交" })).toBeDisabled();
    expect(submitPhase).not.toHaveBeenCalled();
  });
});
