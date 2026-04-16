import { expect } from "@playwright/test";

import { restoreSession } from "./support/api-client";
import { test as gameTest } from "./support/fixtures-game";
import { refreshCurrentPage } from "./support/browser-room";
import { expireActivePhaseDeadline } from "./support/local-timeout";
import { waitForGameRuntime } from "./support/wait-runtime";

gameTest.describe("timeout auto submit flow", () => {
  gameTest("expires the current phase deadline and auto-submits the missing player turn", async ({
    gameContext,
    openGamePage,
    page,
  }) => {
    await openGamePage(gameContext);

    await expect(page.getByTestId("game-phase")).toContainText("当前阶段：国家决策");

    await expireActivePhaseDeadline(gameContext.gameId);

    await expect
      .poll(async () => {
        const context = await restoreSession(gameContext.primaryPlayer.sessionId);
        const snapshot = context.activeSnapshot;
        if (!snapshot?.lastSettlementWorkspace) {
          return false;
        }

        const autoSubmittedPlayerIds = snapshot.lastSettlementWorkspace.autoSubmittedPlayerIds ?? [];
        return (
          snapshot.lastSettlementWorkspace.settledPhase === "decision" &&
          autoSubmittedPlayerIds.length === 5 &&
          (snapshot.round > 1 || snapshot.phase !== "decision")
        );
      }, { timeout: 20_000 })
      .toBe(true);

    const restored = await restoreSession(gameContext.primaryPlayer.sessionId);
    const currentSnapshot = restored.activeSnapshot;
    expect(currentSnapshot).not.toBeNull();
    expect(currentSnapshot?.lastSettlementWorkspace?.settledPhase).toBe("decision");
    expect(currentSnapshot?.lastSettlementWorkspace?.autoSubmittedPlayerIds).toContain(
      gameContext.primaryPlayer.playerId,
    );

    await expect(page.getByTestId("game-settlement-panel")).toBeVisible();

    expect(restored.activeSnapshot?.lastSettlementWorkspace?.settledPhase).toBe("decision");
    expect(restored.activeSnapshot?.lastSettlementWorkspace?.autoSubmittedPlayerIds).toContain(
      gameContext.primaryPlayer.playerId,
    );

    await refreshCurrentPage(page);
    await waitForGameRuntime(page);
    const restoredAfterRefresh = await restoreSession(gameContext.primaryPlayer.sessionId);
    const refreshedPhase = restoredAfterRefresh.activeSnapshot?.phase;
    const refreshedPhaseLabel =
      refreshedPhase === "market"
        ? "市场出售"
        : refreshedPhase === "settlement"
          ? "财政结算"
          : "国家决策";
    await expect(page.getByTestId("game-phase")).toContainText(`当前阶段：${refreshedPhaseLabel}`);
    await expect(page.getByTestId("game-settlement-panel")).toBeVisible();
    await expect(page.getByTestId("game-settlement-panel")).toContainText(
      restoredAfterRefresh.activeSnapshot?.lastSettlementWorkspace?.phaseLabel ?? "国家决策",
    );
  });
});
