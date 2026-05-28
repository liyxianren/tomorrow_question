import { expect } from "@playwright/test";

import { getFinalResult } from "./support/api-client";
import { driveGameToFinished } from "./support/api-game-driver";
import { test as gameTest } from "./support/fixtures-game";

gameTest.describe("Settlement page flow", () => {
  gameTest("pushes the game to finished via helper API and renders settlement page", async ({
    gameContext,
    openGamePage,
    page,
  }) => {
    await openGamePage(gameContext);

    await driveGameToFinished(gameContext);

    await expect(page).toHaveURL(new RegExp(`/settlement/${gameContext.gameId}$`), {
      timeout: 20_000,
    });
    await expect(page.getByTestId("game-settlement-panel")).toBeHidden();
    await expect(page.getByTestId("settlement-ranking-panel")).toBeVisible();
    await expect(page.getByTestId("settlement-final-logs")).toBeVisible();
    await expect(page.getByTestId("settlement-back-lobby")).toBeVisible();
    await expect(page.getByTestId("settlement-back-room")).toBeVisible();
    await expect(page.locator(".settlement-status-bar__meta")).toContainText("终局回合 10 / 10");

    const finalResult = await getFinalResult(gameContext.gameId, gameContext.primaryPlayer.sessionId);
    expect(finalResult.game.isFinished).toBe(true);
    expect(finalResult.game.currentRound).toBe(10);
    expect(finalResult.finalLogs.length).toBeGreaterThan(0);

    const rankingRows = page.getByTestId("settlement-ranking-panel").locator("li");
    await expect(rankingRows).toHaveCount(finalResult.finalRanking.length);
    const rowTexts = await rankingRows.allTextContents();

    for (let index = 0; index < finalResult.finalRanking.length; index += 1) {
      const entry = finalResult.finalRanking[index];
      expect(rowTexts[index]).toContain(`第 ${entry.rank} 名`);
      expect(rowTexts[index]).toContain(entry.nickname);
      expect(rowTexts[index]).toContain(`${entry.cumulativeNationalIncome}`);
      if (index > 0) {
        expect(finalResult.finalRanking[index - 1].cumulativeNationalIncome).toBeGreaterThanOrEqual(
          entry.cumulativeNationalIncome ?? entry.totalIncome,
        );
      }
    }

    await expect(page.getByTestId("settlement-final-logs").locator("li")).toHaveCount(finalResult.finalLogs.length);
  });
});
