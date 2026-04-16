import { expect, test } from "@playwright/test";

import { restoreSession } from "./support/api-client";
import {
  createPlayerPage,
  createRoomFromLobby,
  enterIdentity,
  getGameIdFromUrl,
  getRoomCode,
  gotoLobby,
  joinRoomFromLobby,
  readStoredSessionId,
  refreshCurrentPage,
  selectCountry,
  toggleReady,
} from "./support/browser-room";
import {
  waitForCountryOccupant,
  waitForGamePagePrimer,
  waitForGameRuntime,
  waitForMemberCard,
  waitForReadyMarker,
  waitForRoomUrl,
} from "./support/wait-runtime";

test.describe("room runtime flows", () => {
  test("两个上下文会同步成员加入、选国和 ready 状态", async ({ browser }) => {
    const host = await createPlayerPage(browser);
    const guest = await createPlayerPage(browser);
    const hostNickname = `sh-${Date.now()}`;
    const guestNickname = `sg-${Date.now()}`;

    await gotoLobby(host.page);
    await enterIdentity(host.page, hostNickname);
    await createRoomFromLobby(host.page);

    const roomCode = await getRoomCode(host.page);
    await waitForRoomUrl(host.page, roomCode);

    await gotoLobby(guest.page);
    await enterIdentity(guest.page, guestNickname);
    await joinRoomFromLobby(guest.page, roomCode);
    await waitForRoomUrl(guest.page, roomCode);

    await waitForMemberCard(host.page, guestNickname);
    await selectCountry(host.page, "britain");
    await waitForCountryOccupant(host.page, "britain", hostNickname);
    await waitForCountryOccupant(guest.page, "britain", hostNickname);

    await toggleReady(host.page);
    await waitForReadyMarker(host.page, hostNickname, true);
    await waitForReadyMarker(guest.page, hostNickname, true);

    await guest.context.close();
    await host.context.close();
  });

  test("房间满足开局条件后，两端都会自动进入 GamePage", async ({ browser }) => {
    const host = await createPlayerPage(browser);
    const guest = await createPlayerPage(browser);
    const hostNickname = `ah-${Date.now()}`;
    const guestNickname = `ag-${Date.now()}`;

    await gotoLobby(host.page);
    await enterIdentity(host.page, hostNickname);
    await createRoomFromLobby(host.page);

    const roomCode = await getRoomCode(host.page);
    await waitForRoomUrl(host.page, roomCode);

    await gotoLobby(guest.page);
    await enterIdentity(guest.page, guestNickname);
    await joinRoomFromLobby(guest.page, roomCode);
    await waitForRoomUrl(guest.page, roomCode);

    await selectCountry(host.page, "britain");
    await waitForCountryOccupant(host.page, "britain", hostNickname);
    await selectCountry(guest.page, "france");
    await waitForCountryOccupant(host.page, "france", guestNickname);
    await waitForCountryOccupant(guest.page, "france", guestNickname);
    await host.page.getByTestId("room-fill-bots-button").click();
    await expect(host.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 10_000 });
    await expect(guest.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 10_000 });

    await toggleReady(host.page);
    await waitForReadyMarker(guest.page, hostNickname, true);

    await toggleReady(guest.page);
    await waitForReadyMarker(host.page, guestNickname, true);
    await waitForReadyMarker(guest.page, guestNickname, true);
    await waitForGamePagePrimer(host.page);
    await waitForGamePagePrimer(guest.page);
    await waitForGameRuntime(host.page);
    await waitForGameRuntime(guest.page);
    const hostGameId = getGameIdFromUrl(host.page);
    const guestGameId = getGameIdFromUrl(guest.page);
    await expect(hostGameId).toBeTruthy();
    await expect(guestGameId).toBeTruthy();
    expect(hostGameId).toBe(guestGameId);

    await guest.context.close();
    await host.context.close();
  });

  test("刷新后会基于 sessionId 恢复当前对局", async ({ browser }) => {
    const host = await createPlayerPage(browser);
    const guest = await createPlayerPage(browser);
    const hostNickname = `rh-${Date.now()}`;
    const guestNickname = `rg-${Date.now()}`;

    await gotoLobby(host.page);
    await enterIdentity(host.page, hostNickname);
    await createRoomFromLobby(host.page);

    const roomCode = await getRoomCode(host.page);
    await waitForRoomUrl(host.page, roomCode);

    await gotoLobby(guest.page);
    await enterIdentity(guest.page, guestNickname);
    await joinRoomFromLobby(guest.page, roomCode);
    await waitForRoomUrl(guest.page, roomCode);

    await selectCountry(host.page, "britain");
    await selectCountry(guest.page, "france");
    await host.page.getByTestId("room-fill-bots-button").click();
    await expect(host.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 20_000 });
    await expect(guest.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 20_000 });
    await toggleReady(host.page);
    await toggleReady(guest.page);
    await waitForGamePagePrimer(host.page);
    await waitForGameRuntime(host.page);

    const decisionInput = host.page.getByTestId("game-phase-panel").locator("input[type='number']").first();
    await expect(decisionInput).toBeVisible();
    await decisionInput.fill("1");
    await host.page.getByTestId("game-submit-button").click();
    await expect(host.page.getByTestId("game-submitted-state")).toContainText("指令已签发");

    const guestDecisionInput = guest.page.getByTestId("game-phase-panel").locator("input[type='number']").first();
    await expect(guestDecisionInput).toBeVisible();
    await guestDecisionInput.fill("1");
    await guest.page.getByTestId("game-submit-button").click();

    await expect(host.page.getByTestId("game-phase")).toContainText("当前阶段：市场出售");
    await expect(host.page.getByTestId("game-settlement-panel")).toBeVisible();

    const marketInput = host.page.getByTestId("game-phase-panel").locator("input[type='number']").first();
    await expect(marketInput).toBeVisible();
    await marketInput.fill("1");
    await host.page.getByTestId("game-submit-button").click();
    await expect(host.page.getByTestId("game-submitted-state")).toContainText("指令已签发");

    const gameId = getGameIdFromUrl(host.page);
    const sessionId = await readStoredSessionId(host.page);
    expect(gameId).toBeTruthy();
    expect(sessionId).toBeTruthy();

    const restoredBeforeRefresh = await restoreSession(sessionId!);
    expect(restoredBeforeRefresh.activeGame?.gameId).toBe(gameId);
    expect(restoredBeforeRefresh.activeSnapshot?.round).toBe(1);
    expect(restoredBeforeRefresh.activeSnapshot?.phase).toBe("market");
    expect(restoredBeforeRefresh.activeTurnInputs?.some((item) => item.playerId === restoredBeforeRefresh.session.playerId)).toBe(true);
    expect(restoredBeforeRefresh.activeSnapshot?.lastSettlementWorkspace?.settledPhase).toBe("decision");

    await refreshCurrentPage(host.page);
    await waitForGameRuntime(host.page);
    await expect(host.page).toHaveURL(new RegExp(`/game/${gameId}$`));
    await expect(host.page.getByTestId("game-round")).toContainText("第 1 / 15 回合");
    await expect(host.page.getByTestId("game-phase")).toContainText("当前阶段：市场出售");
    await expect(host.page.getByTestId("game-submitted-state")).toContainText("指令已签发");
    await expect(host.page.getByTestId("game-settlement-panel")).toBeVisible();
    await expect(host.page.getByTestId("game-settlement-panel")).toContainText("国家决策已完成");

    await guest.context.close();
    await host.context.close();
  });
});
