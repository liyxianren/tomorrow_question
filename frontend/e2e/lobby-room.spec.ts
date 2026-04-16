import { expect, test } from "@playwright/test";

import {
  createPlayerPage,
  createRoomFromLobby,
  enterIdentity,
  getRoomCode,
  gotoLobby,
  joinRoomFromLobby,
  readStoredSessionId,
} from "./support/browser-room";
import {
  waitForMemberCard,
  waitForRoomUrl,
} from "./support/wait-runtime";

test.describe("lobby room flows", () => {
  test("创建房间后第二玩家可以从大厅加入同一房间", async ({ browser }) => {
    const host = await createPlayerPage(browser);
    const guest = await createPlayerPage(browser);
    const hostNickname = `host-${Date.now()}`;
    const guestNickname = `guest-${Date.now()}`;

    await gotoLobby(host.page);
    await enterIdentity(host.page, hostNickname);
    await expect(host.page.getByTestId("lobby-waiting-rooms-panel")).toBeVisible();
    await expect(host.page.getByRole("heading", { name: "等待中的房间" })).toBeVisible();
    await expect(host.page.getByTestId("lobby-create-room-button")).toBeVisible();
    await expect(host.page.getByTestId("lobby-continue-banner")).toHaveCount(0);
    await createRoomFromLobby(host.page);

    const roomCode = await getRoomCode(host.page);
    await waitForRoomUrl(host.page, roomCode);

    await gotoLobby(guest.page);
    await enterIdentity(guest.page, guestNickname);
    await expect(guest.page.getByTestId("lobby-waiting-rooms-panel")).toBeVisible();
    await expect(guest.page.getByTestId(`lobby-waiting-room-${roomCode}`)).toContainText(roomCode);
    await expect(guest.page.getByTestId(`lobby-waiting-room-${roomCode}`)).toContainText(`加入 ${roomCode}`);
    await expect(guest.page.getByTestId("lobby-continue-banner")).toHaveCount(0);
    await joinRoomFromLobby(guest.page, roomCode);

    await waitForRoomUrl(guest.page, roomCode);
    await waitForMemberCard(host.page, hostNickname);
    await waitForMemberCard(host.page, guestNickname);
    await waitForMemberCard(guest.page, hostNickname);
    await waitForMemberCard(guest.page, guestNickname);

    await guest.context.close();
    await host.context.close();
  });

  test("新开页面进入 lobby 时会基于 sessionId 自动恢复到房间页", async ({ browser }) => {
    const player = await createPlayerPage(browser);
    const nickname = `restore-${Date.now()}`;

    await gotoLobby(player.page);
    await enterIdentity(player.page, nickname);
    await createRoomFromLobby(player.page);

    const roomCode = await getRoomCode(player.page);
    await waitForRoomUrl(player.page, roomCode);
    await expect(await readStoredSessionId(player.page)).toBeTruthy();

    const restorePage = await player.context.newPage();
    await gotoLobby(restorePage);
    await waitForRoomUrl(restorePage, roomCode);
    await waitForMemberCard(restorePage, nickname);

    await player.context.close();
  });
});
