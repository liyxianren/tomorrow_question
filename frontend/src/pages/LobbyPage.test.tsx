import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_PROFILE_STORAGE_KEY } from "../features/lobby/flow/identityStorage";
import { LobbyPage } from "./LobbyPage";


const { mockGetSessionId, mockApiRequest } = vi.hoisted(() => ({
  mockGetSessionId: vi.fn<() => string | null>(),
  mockApiRequest: vi.fn(),
}));

vi.mock("../services/http", async () => {
  const actual = await vi.importActual<typeof import("../services/http")>("../services/http");

  return {
    ...actual,
    apiRequest: mockApiRequest,
    getSessionId: mockGetSessionId,
  };
});

function renderLobbyPage(initialEntry = "/lobby") {
  const router = createMemoryRouter(
    [
      {
        path: "/lobby",
        element: <LobbyPage />,
      },
    ],
    {
      initialEntries: [initialEntry],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

function storeProfile(profile: {
  profileId: string;
  displayName: string;
  boundSessionId: string | null;
  lastActiveGameId: string | null;
  updatedAt: string;
}) {
  window.localStorage.setItem(
    LOCAL_PROFILE_STORAGE_KEY,
    JSON.stringify({
      ...profile,
      recentRoomCodes: ["ROOM01", "ROOM02"],
    }),
  );
}

describe("LobbyPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockGetSessionId.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks the lobby until a display name has been confirmed", () => {
    renderLobbyPage();

    expect(screen.getByRole("heading", { name: "创建或加入一局" })).toBeInTheDocument();
    expect(
      screen.getByText("先确认显示昵称，再从可加入房间中直接进入；没有合适房间时再创建新房间。只有收到邀请时才需要输入房间码。"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("identity-gate-modal")).toBeInTheDocument();
    expect(screen.getByTestId("lobby-create-room-button")).toBeDisabled();
    expect(screen.getByTestId("lobby-join-room-button")).toBeDisabled();
  });

  it("shows waiting rooms as the main lobby content and keeps recent rooms out of the page", async () => {
    storeProfile({
      profileId: "profile-tester01",
      displayName: "tester",
      boundSessionId: null,
      lastActiveGameId: null,
      updatedAt: "2026-03-30T10:00:00.000Z",
    });
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/lobby/waiting-rooms") {
        return [
          {
            roomCode: "ROOM01",
            hostNickname: "tester",
            memberCount: 2,
            maxPlayers: 5,
            availableSeatCount: 3,
            status: "waiting",
            readyCount: 1,
            selectedCountriesCount: 2,
            hasActiveGame: false,
            isJoinable: true,
            lastActivityAt: "2026-03-30T10:00:00.000Z",
            members: [
              { nickname: "tester", selectedCountry: "britain", isReady: false, memberType: "human" },
              { nickname: "guest", selectedCountry: "france", isReady: true, memberType: "human" },
            ],
          },
          {
            roomCode: "ROOM02",
            hostNickname: "france",
            memberCount: 4,
            maxPlayers: 5,
            availableSeatCount: 1,
            status: "waiting",
            readyCount: 3,
            selectedCountriesCount: 4,
            hasActiveGame: false,
            isJoinable: true,
            lastActivityAt: "2026-03-30T10:00:00.000Z",
            members: [
              { nickname: "france", selectedCountry: "france", isReady: true, memberType: "human" },
              { nickname: "prussia", selectedCountry: "prussia", isReady: true, memberType: "human" },
              { nickname: "austria", selectedCountry: "austria", isReady: true, memberType: "human" },
              { nickname: "russia", selectedCountry: "russia", isReady: false, memberType: "human" },
            ],
          },
        ];
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    renderLobbyPage();

    expect(await screen.findByTestId("lobby-waiting-room-ROOM01")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "创建新房间" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "输入房间码加入" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "继续上次进度" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("lobby-continue-banner")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "可加入的房间" })).toBeInTheDocument();
    expect(screen.getByText("ROOM01")).toBeInTheDocument();
    expect(screen.getByText("房主 tester")).toBeInTheDocument();
    expect(screen.getByText("2 / 5 人")).toBeInTheDocument();
    expect(screen.getByText("3 个空位")).toBeInTheDocument();
    expect(screen.getByText("准备 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("已选 2 / 5 个国家")).toBeInTheDocument();
    expect(screen.getByText("tester · 英国")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入 ROOM01" })).toBeInTheDocument();
    expect(screen.getByTestId("lobby-current-identity-panel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "最近房间" })).not.toBeInTheDocument();
    expect(screen.queryByText(/flow/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/测试/)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前步骤|结构化|链路/)).not.toBeInTheDocument();
  });

  it("prefills the join action when the player arrives from an invite link", async () => {
    storeProfile({
      profileId: "profile-tester01",
      displayName: "tester",
      boundSessionId: null,
      lastActiveGameId: null,
      updatedAt: "2026-03-30T10:00:00.000Z",
    });
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/lobby/waiting-rooms") {
        return [];
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    renderLobbyPage("/lobby?roomCode=ROOM77&from=invite");

    expect(await screen.findByDisplayValue("ROOM77")).toBeInTheDocument();
    expect(screen.getByText("好友已经把房间码带给你了，确认身份后就能直接加入 ROOM77。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "输入房间码加入" })).toBeInTheDocument();
  });

  it("sends the current local session when rejoining a visible waiting room", async () => {
    storeProfile({
      profileId: "profile-tester01",
      displayName: "tester",
      boundSessionId: null,
      lastActiveGameId: null,
      updatedAt: "2026-03-30T10:00:00.000Z",
    });
    mockGetSessionId.mockReturnValue("session-room01");
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/lobby/waiting-rooms") {
        return [
          {
            roomCode: "ROOM01",
            hostNickname: "tester",
            memberCount: 1,
            maxPlayers: 5,
            availableSeatCount: 4,
            status: "waiting",
            readyCount: 0,
            selectedCountriesCount: 0,
            hasActiveGame: false,
            isJoinable: true,
            lastActivityAt: "2026-03-30T10:00:00.000Z",
            members: [
              { nickname: "tester", selectedCountry: null, isReady: false, memberType: "human" },
            ],
          },
        ];
      }

      if (path === "/api/v1/rooms/join") {
        return {
          session: {
            sessionId: "session-room01",
            playerId: "player-1",
            roomCode: "ROOM01",
            nickname: "tester",
          },
          room: {
            roomCode: "ROOM01",
            status: "waiting",
            hostPlayerId: "player-1",
            memberPlayerIds: ["player-1"],
            members: [
              {
                playerId: "player-1",
                nickname: "tester",
                selectedCountry: null,
                connectionStatus: "online",
                isReady: false,
              },
            ],
            countrySlots: {
              britain: null,
              france: null,
              prussia: null,
              austria: null,
              russia: null,
            },
            currentGameId: null,
          },
          activeGame: null,
          activeSnapshot: null,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });
    const router = renderLobbyPage();

    fireEvent.click(await screen.findByRole("button", { name: "加入 ROOM01" }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/rooms/join", {
        method: "POST",
        body: {
          nickname: "tester",
          roomCode: "ROOM01",
        },
        sessionId: "session-room01",
      });
    });
    expect(router.state.location.pathname).toBe("/room/ROOM01");
  });

  it("shows the continue action only after a valid restore target is confirmed", async () => {
    storeProfile({
      profileId: "profile-tester01",
      displayName: "tester",
      boundSessionId: "session-room01",
      lastActiveGameId: "game-1",
      updatedAt: "2026-03-30T10:00:00.000Z",
    });
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/lobby/waiting-rooms") {
        return [];
      }

      if (path === "/api/v1/sessions/restore?includeDetails=0") {
        return {
          session: {
            sessionId: "session-room01",
            playerId: "player-1",
            roomCode: "ROOM01",
            nickname: "tester",
          },
          room: {
            roomCode: "ROOM01",
            status: "in_game",
            hostPlayerId: "player-1",
            memberPlayerIds: ["player-1", "player-2"],
            members: [
              {
                playerId: "player-1",
                nickname: "tester",
                selectedCountry: "britain",
                connectionStatus: "online",
                isReady: true,
              },
              {
                playerId: "player-2",
                nickname: "france",
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
          },
          activeGame: {
            gameId: "game-1",
            roomCode: "ROOM01",
            currentRound: 10,
            totalRounds: 10,
            currentPhase: "settlement",
            isFinished: true,
            activeSnapshotId: "snapshot-final",
          },
          activeSnapshot: null,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    renderLobbyPage();

    expect(await screen.findByText("已找到之前离开的房间或对局。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看结算" })).toHaveAttribute("href", "/settlement/game-1");
  });
});
