import { expect, type Browser, type Page } from "@playwright/test";

import { installApiProxy } from "./browser-runtime";
import {
  type BrowserPlayerPage,
  type CountryCode,
  SESSION_STORAGE_KEY,
  getAppBaseUrl,
} from "./types";


export async function createPlayerPage(browser: Browser): Promise<BrowserPlayerPage> {
  const context = await browser.newContext();
  await installApiProxy(context);
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
  };
}

export async function gotoLobby(page: Page): Promise<void> {
  await page.goto(`${getAppBaseUrl()}/`);

  const homeEntry = page.getByRole("link", { name: "进入大厅" });
  const storedSessionId = await page.evaluate(
    (storageKey) => window.localStorage.getItem(storageKey),
    SESSION_STORAGE_KEY,
  );

  if (storedSessionId) {
    try {
      await page.waitForURL(/\/(room\/[^/]+|game\/[^/]+)$/);
      return;
    } catch {
      // Fall through to the homepage CTA when the stored session cannot be restored.
    }
  }

  if (new URL(page.url()).pathname !== "/") {
    return;
  }

  await expect(homeEntry).toBeVisible();
  await homeEntry.click();
  await expect(page).toHaveURL(/\/lobby$/);
  await expect(page.getByRole("heading", { name: "创建或加入一局" })).toBeVisible();
}

export async function enterIdentity(page: Page, nickname: string): Promise<void> {
  await page.getByTestId("identity-nickname-input").fill(nickname);
  await page.getByTestId("identity-continue-button").click();
}

export async function createRoomFromLobby(page: Page): Promise<void> {
  await page.getByTestId("lobby-create-room-button").click();
}

export async function fillBotsFromRoom(page: Page): Promise<void> {
  const fillBotsButton = page.getByTestId("room-fill-bots-button");

  await expect(fillBotsButton).toBeVisible();
  if (await fillBotsButton.isEnabled()) {
    await fillBotsButton.click();
  }
}

export async function joinRoomFromLobby(page: Page, roomCode: string): Promise<void> {
  await page.getByTestId("lobby-room-code-input").fill(roomCode);
  await page.getByTestId("lobby-join-room-button").click();
}

export async function restoreFromLobby(page: Page): Promise<void> {
  await page.getByTestId("lobby-restore-button").click();
}

export async function getRoomCode(page: Page): Promise<string> {
  const rawText = (await page.getByTestId("room-code").textContent())?.trim() ?? "";
  const roomCode = rawText.match(/[A-Z0-9]{4,12}$/)?.[0] ?? null;

  if (!roomCode) {
    throw new Error("room-code testid did not expose a room code");
  }

  return roomCode;
}

export async function selectCountry(page: Page, country: CountryCode): Promise<void> {
  await page.getByTestId(`room-country-${country}`).click();
}

export async function toggleReady(page: Page): Promise<void> {
  await page.getByTestId("room-ready-button").click();
}

export async function readStoredSessionId(page: Page): Promise<string | null> {
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SESSION_STORAGE_KEY);
}

export async function refreshCurrentPage(page: Page): Promise<void> {
  await page.reload();
}

export function getGameIdFromUrl(page: Page): string | null {
  const { pathname } = new URL(page.url());
  const match = pathname.match(/^\/game\/([^/]+)$/);

  return match?.[1] ?? null;
}
