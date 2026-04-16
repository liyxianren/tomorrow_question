import { expect, test } from "@playwright/test";

import {
  createPlayerPage,
  createRoomFromLobby,
  enterIdentity,
  getGameIdFromUrl,
  getRoomCode,
  gotoLobby,
  joinRoomFromLobby,
  selectCountry,
  toggleReady,
} from "./support/browser-room";
import {
  waitForGamePagePrimer,
  waitForGameRuntime,
  waitForMemberCard,
  waitForRoomUrl,
} from "./support/wait-runtime";


test.describe("room AI fill flows", () => {
  test("1 真人 + 4 AI 可以自动开局，并在真人提交后直接进入结算", async ({ browser }) => {
    const host = await createPlayerPage(browser);
    const hostNickname = `host-ai-${Date.now()}`;

    await gotoLobby(host.page);
    await enterIdentity(host.page, hostNickname);
    await createRoomFromLobby(host.page);

    const roomCode = await getRoomCode(host.page);
    await waitForRoomUrl(host.page, roomCode);

    await selectCountry(host.page, "britain");
    await expect(host.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 20_000 });
    await toggleReady(host.page);
    await host.page.getByTestId("room-fill-bots-button").click();

    await waitForGamePagePrimer(host.page);
    await waitForGameRuntime(host.page);

    const phasePanel = host.page.getByTestId("game-phase-panel");

    const firstNumberInput = phasePanel.locator("input[type='number']").first();
    await expect(firstNumberInput).toBeVisible();
    await firstNumberInput.fill("1");

    await host.page.getByTestId("game-submit-button").click();

    await expect(host.page.getByTestId("game-settlement-panel")).toBeVisible({ timeout: 20_000 });

    await host.context.close();
  });

  test("房主可以踢出 AI 释放席位，再让真人正常加入", async ({ browser }) => {
    const host = await createPlayerPage(browser);
    const guest = await createPlayerPage(browser);
    const hostNickname = `host-room-${Date.now()}`;
    const guestNickname = `guest-room-${Date.now()}`;

    await gotoLobby(host.page);
    await enterIdentity(host.page, hostNickname);
    await createRoomFromLobby(host.page);

    const roomCode = await getRoomCode(host.page);
    await waitForRoomUrl(host.page, roomCode);

    await host.page.getByTestId("room-fill-bots-button").click();
    await expect(host.page.locator("[data-testid^='room-member-ai-badge-']")).toHaveCount(4, { timeout: 15_000 });

    const removeButtons = host.page.locator("[data-testid^='room-remove-bot-']");
    await expect(removeButtons).toHaveCount(4, { timeout: 15_000 });
    await removeButtons.first().click();

    await gotoLobby(guest.page);
    await enterIdentity(guest.page, guestNickname);
    await joinRoomFromLobby(guest.page, roomCode);

    await waitForRoomUrl(guest.page, roomCode);
    await waitForMemberCard(host.page, guestNickname);
    await waitForMemberCard(guest.page, guestNickname);

    await guest.context.close();
    await host.context.close();
  });

  test("3 真人 + 2 AI 可以自动开局并把所有真人带入同一局", async ({ browser }) => {
    const host = await createPlayerPage(browser);
    const guestA = await createPlayerPage(browser);
    const guestB = await createPlayerPage(browser);
    const seed = Date.now();

    await gotoLobby(host.page);
    await enterIdentity(host.page, `host-three-${seed}`);
    await createRoomFromLobby(host.page);

    const roomCode = await getRoomCode(host.page);
    await waitForRoomUrl(host.page, roomCode);

    await gotoLobby(guestA.page);
    await enterIdentity(guestA.page, `guest-a-${seed}`);
    await joinRoomFromLobby(guestA.page, roomCode);
    await waitForRoomUrl(guestA.page, roomCode);

    await gotoLobby(guestB.page);
    await enterIdentity(guestB.page, `guest-b-${seed}`);
    await joinRoomFromLobby(guestB.page, roomCode);
    await waitForRoomUrl(guestB.page, roomCode);

    await selectCountry(host.page, "britain");
    await selectCountry(guestA.page, "france");
    await selectCountry(guestB.page, "prussia");

    await host.page.getByTestId("room-fill-bots-button").click();
    await expect(host.page.locator("[data-testid^='room-member-ai-badge-']")).toHaveCount(2, { timeout: 15_000 });
    await expect(host.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 20_000 });
    await expect(guestA.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 20_000 });
    await expect(guestB.page.getByTestId("room-ready-button")).toBeEnabled({ timeout: 20_000 });

    await toggleReady(host.page);
    await toggleReady(guestA.page);
    await toggleReady(guestB.page);

    await waitForGamePagePrimer(host.page);
    await waitForGamePagePrimer(guestA.page);
    await waitForGamePagePrimer(guestB.page);
    await waitForGameRuntime(host.page);
    await waitForGameRuntime(guestA.page);
    await waitForGameRuntime(guestB.page);
    const hostGameId = getGameIdFromUrl(host.page);
    const guestAGameId = getGameIdFromUrl(guestA.page);
    const guestBGameId = getGameIdFromUrl(guestB.page);
    expect(hostGameId).toBeTruthy();
    expect(hostGameId).toBe(guestAGameId);
    expect(hostGameId).toBe(guestBGameId);

    await guestB.context.close();
    await guestA.context.close();
    await host.context.close();
  });
});
