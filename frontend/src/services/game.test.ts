import { describe, expect, it, vi } from "vitest";

import type { GamePhase } from "../types";

import { submitPhase } from "./game";
import { apiRequest } from "./http";


vi.mock("./http", () => ({
  apiRequest: vi.fn(),
}));

describe("submitPhase", () => {
  it("calls the phase submit endpoint with the provided payload", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      submission: {
        gameId: "game-1",
        roundNo: 1,
        phase: "decision",
        playerId: "player-1",
        submissionStatus: "submitted",
        payload: {
          factoryPlan: {
            productionOrders: [{ goodsId: "steel", quantity: 1 }],
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
        submittedAt: "2026-03-30T10:00:00Z",
        isTimeoutGenerated: false,
      },
      submissionStatus: {
        "player-1": "submitted",
      },
      phase: "decision",
      roundNo: 1,
      allSubmitted: false,
      settlementTriggered: false,
    });

    const payload = {
      factoryPlan: {
        productionOrders: [{ goodsId: "steel", quantity: 1 }],
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
    };

    await submitPhase("game-1", "decision" satisfies GamePhase, payload);

    expect(apiRequest).toHaveBeenCalledWith("/api/v1/games/game-1/phases/decision/submit", {
      method: "POST",
      body: {
        payload,
      },
    });
  });
});
