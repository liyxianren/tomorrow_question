import { describe, expect, it } from "vitest";

import type { SessionContextResponse } from "../types";
import { resolveSessionRoute } from "./sessionRecovery";


function createResponse(overrides: Partial<SessionContextResponse> = {}): SessionContextResponse {
  return {
    session: {
      playerId: "player-1",
      sessionId: "session-1",
      nickname: "Britain",
      roomCode: "ROOM01",
      selectedCountry: "britain",
      connectionStatus: "online",
      lastSeenAt: "2026-03-30T12:00:00.000Z",
    },
    room: {
      roomCode: "ROOM01",
      status: "in_game",
      hostPlayerId: "player-1",
      memberPlayerIds: ["player-1", "player-2"],
      members: [
        {
          playerId: "player-1",
          nickname: "Britain",
          selectedCountry: "britain",
          connectionStatus: "online",
          isReady: true,
        },
        {
          playerId: "player-2",
          nickname: "France",
          selectedCountry: "france",
          connectionStatus: "online",
          isReady: true,
        },
      ],
      countrySlots: {
        britain: "player-1",
        france: "player-2",
        prussia: null,
        austria: null,
        russia: null,
      },
      currentGameId: "game-1",
      lastActivityAt: "2026-03-30T12:00:00.000Z",
    },
    activeGame: {
      gameId: "game-1",
      roomCode: "ROOM01",
      currentRound: 2,
      totalRounds: 15,
      currentPhase: "market",
      isFinished: false,
      activeSnapshotId: "snapshot-2",
    },
    activeSnapshot: null,
    ...overrides,
  };
}

describe("resolveSessionRoute", () => {
  it("returns the room route when there is no active game", () => {
    expect(
      resolveSessionRoute(
        createResponse({
          activeGame: null,
          room: {
            ...createResponse().room,
            status: "waiting",
            currentGameId: null,
          },
        }),
      ),
    ).toEqual({
      path: "/room/ROOM01",
      state: {
        bootstrap: expect.objectContaining({
          room: expect.objectContaining({
            roomCode: "ROOM01",
          }),
        }),
      },
    });
  });

  it("returns the game route for an ongoing active game", () => {
    expect(resolveSessionRoute(createResponse())).toEqual({
      path: "/game/game-1",
    });
  });

  it("returns the settlement route for a finished active game", () => {
    expect(
      resolveSessionRoute(
        createResponse({
          activeGame: {
            ...createResponse().activeGame!,
            isFinished: true,
            currentPhase: "settlement",
          },
          room: {
            ...createResponse().room,
            status: "finished",
          },
        }),
      ),
    ).toEqual({
      path: "/settlement/game-1",
    });
  });
});
