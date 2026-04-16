import { test as base } from "@playwright/test";

import { prepareStartedGame, SESSION_STORAGE_KEY, type PreparedGameContext } from "./api-game-driver";

type GameFixtures = {
  gameContext: PreparedGameContext;
  openGamePage: (context?: PreparedGameContext) => Promise<void>;
};

export const test = base.extend<GameFixtures>({
  gameContext: async ({}, use) => {
    const context = await prepareStartedGame();
    await use(context);
  },

  openGamePage: async ({ gameContext, page }, use) => {
    try {
      await use(async (context = gameContext) => {
        await page.route(`${context.apiBaseUrl}/**`, async (route) => {
          const request = route.request();

          try {
            if (request.method() === "OPTIONS") {
              await route.fulfill({
                status: 204,
                headers: {
                  "access-control-allow-origin": context.frontendBaseUrl,
                  "access-control-allow-methods":
                    request.headers()["access-control-request-method"] ?? "GET,POST,OPTIONS",
                  "access-control-allow-headers":
                    request.headers()["access-control-request-headers"] ?? "content-type,x-session-id",
                  vary: "Origin",
                },
              });
              return;
            }

            const response = await route.fetch();
            await route.fulfill({
              response,
              headers: {
                ...response.headers(),
                "access-control-allow-origin": context.frontendBaseUrl,
                "access-control-allow-credentials": "true",
                vary: "Origin",
              },
            });
          } catch (error) {
            if (page.isClosed()) {
              return;
            }
            throw error;
          }
        });

        await page.addInitScript(
          ([storageKey, sessionId]) => {
            window.localStorage.setItem(storageKey, sessionId);
          },
          [SESSION_STORAGE_KEY, context.primaryPlayer.sessionId],
        );

        await page.goto(`${context.frontendBaseUrl}/game/${context.gameId}`);
      });
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  },
});

export { expect } from "@playwright/test";
