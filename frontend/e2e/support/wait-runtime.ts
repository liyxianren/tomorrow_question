import { expect, type Page } from "@playwright/test";

import type { CountryCode } from "./types";


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function waitForRoomUrl(page: Page, roomCode: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/room/${escapeRegExp(roomCode)}$`));
}

export async function waitForMemberCard(page: Page, nickname: string): Promise<void> {
  await expect(page.getByTestId("room-members-panel")).toContainText(nickname);
}

export async function waitForCountryOccupant(
  page: Page,
  country: CountryCode,
  nickname: string,
): Promise<void> {
  await expect(page.getByTestId(`room-country-${country}`)).toContainText(nickname);
}

export async function waitForReadyMarker(
  page: Page,
  nickname: string,
  isReady: boolean,
): Promise<void> {
  const readyLabelPattern = isReady
    ? "(已准备开局|已准备|ready|Ready)"
    : "(尚未准备开局|未准备|unready|Unready)";
  const memberPattern = new RegExp(`${escapeRegExp(nickname)}[\\s\\S]*${readyLabelPattern}`);

  await expect
    .poll(async () => await page.getByTestId("room-members-panel").textContent())
    .toMatch(memberPattern);
}

export async function waitForGameRuntime(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/game\/[^/]+$/, { timeout: 25_000 });
  await expect(page.getByTestId("game-round")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("game-phase")).toBeVisible({ timeout: 25_000 });
  const timer = page.getByTestId("game-timer");
  if (await timer.count()) {
    await expect(timer).toBeVisible({ timeout: 25_000 });
  }
}

export async function waitForGamePagePrimer(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/game\/[^/]+$/, { timeout: 25_000 });
  await expect(page.getByTestId("game-phase-panel")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("game-round")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("game-phase")).toBeVisible({ timeout: 25_000 });
}
