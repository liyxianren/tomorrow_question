import { expect } from "@playwright/test";

import {
  submitCurrentPhaseForHelperPlayers,
} from "./support/api-game-driver";
import { test as gameTest } from "./support/fixtures-game";

gameTest.describe("Game phase submit flow", () => {
  gameTest("submits the current phase, shows waiting state, and renders settlement plus ranking after helpers finish", async ({
    gameContext,
    openGamePage,
    page,
  }) => {
    await openGamePage(gameContext);

    await expect(page.getByTestId("game-country")).toBeVisible();
    await expect(page.getByTestId("game-round")).toContainText("第 1 / 15 回合");
    await expect(page.getByTestId("game-phase")).toContainText("当前阶段：国家决策");
    await expect(page.getByTestId("game-left-rail")).toContainText("国家仪表盘");
    await expect(page.getByTestId("game-assist-rail")).toContainText("预算与容量是否合法");
    await expect(page.getByTestId("game-assist-rail")).toContainText("本轮提交后会怎样");

    const phasePanel = page.getByTestId("game-phase-panel");
    await expect(phasePanel).toBeVisible();
    await expect(phasePanel.getByText("国家决策台")).toBeVisible();
    await expect(phasePanel.getByRole("heading", { name: /本轮国家决策/ })).toBeVisible();

    const firstNumberInput = phasePanel.locator("input[type='number']").first();
    await expect(firstNumberInput).toBeVisible();
    await firstNumberInput.fill("1");

    await page.getByTestId("game-submit-button").click();

    await expect(page.getByTestId("game-submitted-state")).toContainText("指令已签发");

    await submitCurrentPhaseForHelperPlayers(gameContext);

    await expect(page.getByTestId("game-settlement-panel")).toBeVisible();
    await expect(page.getByTestId("game-ranking-panel")).toBeVisible();
    await expect(page.getByText("国家决策已完成，新的预算结构和卖货库存已经准备好。")).toBeVisible();
    await expect(page.getByTestId("game-ranking-panel")).toContainText("累计国家收入");
  });
});
