import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGameSnapshot } from "../test/gameSnapshotFixtures";
import type { PlayerSession, RoomContext, SessionContextResponse, SocketEnvelope } from "../types";

import { RoomPage } from "./RoomPage";


type Handler = (...args: any[]) => void;

const {
  mockRestoreSessionContext,
  mockResolveSessionRoute,
  mockApiRequest,
  mockConnectSocket,
  mockDisconnectSocket,
  mockSocketEventNames,
} = vi.hoisted(() => ({
  mockRestoreSessionContext: vi.fn<() => Promise<SessionContextResponse | null>>(),
  mockResolveSessionRoute: vi.fn<(response: SessionContextResponse) => { path: string; state?: unknown }>(),
  mockApiRequest: vi.fn(),
  mockConnectSocket: vi.fn(),
  mockDisconnectSocket: vi.fn(),
  mockSocketEventNames: {
    roomUpdated: "room.updated",
    gameStarted: "game.started",
    gameSnapshotSync: "game.snapshot_sync",
  } as const,
}));

vi.mock("../app/sessionRecovery", () => ({
  restoreSessionContext: mockRestoreSessionContext,
  resolveSessionRoute: mockResolveSessionRoute,
}));

vi.mock("../services/http", async () => {
  const actual = await vi.importActual<typeof import("../services/http")>("../services/http");

  return {
    ...actual,
    apiRequest: mockApiRequest,
  };
});

vi.mock("../services/socket", () => ({
  SOCKET_EVENT_NAMES: mockSocketEventNames,
  connectSocket: mockConnectSocket,
  disconnectSocket: mockDisconnectSocket,
}));

function createMockSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const socket = {
    connected: false,
    connect: vi.fn(() => {
      socket.connected = true;
    }),
    on: vi.fn((event: string, handler: Handler) => {
      const eventHandlers = handlers.get(event) ?? new Set<Handler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
    }),
    emitEvent(event: string, payload?: unknown) {
      const eventHandlers = handlers.get(event);
      if (!eventHandlers) {
        return;
      }

      for (const handler of eventHandlers) {
        handler(payload);
      }
    },
  };

  return socket;
}

function createRoom(overrides: Partial<RoomContext> = {}): RoomContext {
  return {
    roomCode: "ROOM01",
    status: "waiting",
    hostPlayerId: "player-1",
    memberPlayerIds: ["player-1", "player-2"],
    members: [
      {
        playerId: "player-1",
        nickname: "Britain",
        selectedCountry: null,
        connectionStatus: "online",
        isReady: false,
      },
      {
        playerId: "player-2",
        nickname: "France",
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
    ...overrides,
  };
}

function createSession(overrides: Partial<PlayerSession> = {}): PlayerSession {
  return {
    playerId: "player-1",
    sessionId: "session-1",
    nickname: "Britain",
    roomCode: "ROOM01",
    selectedCountry: null,
    connectionStatus: "online",
    lastSeenAt: "2026-03-30T12:00:00.000Z",
    ...overrides,
  };
}

function createBootstrap({
  room = createRoom(),
  session = createSession(),
}: {
  room?: RoomContext;
  session?: PlayerSession;
} = {}): SessionContextResponse {
  return {
    session,
    room,
    activeGame: null,
    activeSnapshot: null,
  };
}

function createEnvelope<TPayload>(payload: TPayload): SocketEnvelope<TPayload> {
  return {
    roomCode: "ROOM01",
    gameId: null,
    serverTime: "2026-03-30T12:00:00.000Z",
    payload,
  };
}

function renderRoomPage(bootstrap = createBootstrap()) {
  const router = createMemoryRouter(
    [
      {
        path: "/room/:roomCode",
        element: <RoomPage />,
      },
      {
        path: "/game/:gameId",
        element: <div>game route</div>,
      },
    ],
    {
      initialEntries: [
        {
          pathname: `/room/${bootstrap.room.roomCode}`,
          state: {
            bootstrap,
          },
        },
      ],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("RoomPage", () => {
  const writeText = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    mockResolveSessionRoute.mockImplementation((response) => ({
      path: `/room/${response.room.roomCode}`,
      state: {
        bootstrap: response,
      },
    }));
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/rooms/ROOM01/context") {
        return {
          room: createRoom(),
          activeGame: null,
          activeSnapshot: null,
        };
      }

      return {};
    });
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the room code, room status, current identity, and a copy entry in the header", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);

    renderRoomPage();

    const headerPanel = screen.getByRole("heading", { name: "开局准备区" }).closest("section");
    const headerStatus = screen.getByTestId("room-status-banner");
    const actionPanel = screen.getByRole("heading", { name: "准备开局" }).closest("section");

    expect(screen.getByRole("heading", { name: "开局准备区" })).toBeInTheDocument();
    expect(screen.getByTestId("room-code")).toHaveTextContent("ROOM01");
    expect(headerPanel).not.toBeNull();
    expect(actionPanel).not.toBeNull();
    expect(headerPanel as HTMLElement).toHaveTextContent("Britain");
    expect(headerPanel as HTMLElement).toHaveTextContent("房主");
    expect(headerPanel as HTMLElement).toHaveTextContent("未选国家");
    expect(headerStatus).toHaveTextContent("等待其他玩家");
    expect(screen.getByRole("heading", { name: "选择你的国家" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "房间内玩家" })).toBeInTheDocument();
    expect(within(headerPanel as HTMLElement).queryByText("房间链路")).not.toBeInTheDocument();
    expect(within(headerPanel as HTMLElement).queryByText(/Flow/)).not.toBeInTheDocument();
    expect(within(headerPanel as HTMLElement).queryByText(/当前步骤/)).not.toBeInTheDocument();
    expect(within(headerPanel as HTMLElement).queryByText(/下一步/)).not.toBeInTheDocument();
    expect(within(headerPanel as HTMLElement).queryByText(/结构化/)).not.toBeInTheDocument();
    expect(within(headerPanel as HTMLElement).queryByText(/恢复链路/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "复制房间码" }));

    expect(writeText).toHaveBeenCalledWith("ROOM01");

    await userEvent.click(screen.getByRole("button", { name: "复制邀请链接" }));

    expect(writeText).toHaveBeenLastCalledWith("http://localhost/lobby?roomCode=ROOM01&from=invite");
  });

  it("guides a regular player to finish selecting a country and getting ready", () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);

    renderRoomPage(
      createBootstrap({
        room: createRoom({
          hostPlayerId: "player-1",
        }),
        session: createSession({
          playerId: "player-2",
          sessionId: "session-2",
          nickname: "France",
        }),
      }),
    );

    const actionPanel = screen.getByRole("heading", { name: "准备开局" }).closest("section");

    expect(actionPanel).not.toBeNull();
    expect(actionPanel as HTMLElement).toHaveTextContent("下一步");
    expect(actionPanel as HTMLElement).toHaveTextContent("先选择一个国家，再点准备开局。");
    expect(actionPanel as HTMLElement).toHaveTextContent("自动开局规则");
    expect(actionPanel as HTMLElement).toHaveTextContent("满足后会自动开局");
    expect(actionPanel as HTMLElement).toHaveTextContent("没有单独的手动开始按钮");
    expect(actionPanel as HTMLElement).toHaveTextContent("你尚未选定国家");
    expect(screen.getByTestId("room-ready-button")).toBeDisabled();
  });

  it("reports country selection through the unified flow message without exposing transport details", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);

    renderRoomPage();

    await userEvent.click(screen.getByTestId("room-country-britain"));

    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/rooms/ROOM01/country", {
      method: "POST",
      body: {
        selectedCountry: "britain",
      },
    });
    expect(screen.queryByText("room.updated")).not.toBeInTheDocument();
    expect(screen.queryByText("game.started")).not.toBeInTheDocument();
  });

  it("reloads the authoritative room context after country selection without reconnecting the socket", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/rooms/ROOM01/country") {
        return {
          playerId: "player-1",
          selectedCountry: "britain",
        };
      }
      if (path === "/api/v1/rooms/ROOM01/context") {
        return {
          room: createRoom({
            members: [
              {
                playerId: "player-1",
                nickname: "Britain",
                selectedCountry: "britain",
                connectionStatus: "online",
                isReady: false,
              },
              {
                playerId: "player-2",
                nickname: "France",
                selectedCountry: null,
                connectionStatus: "online",
                isReady: false,
              },
            ],
            countrySlots: {
              britain: "player-1",
              france: null,
              prussia: null,
              austria: null,
              russia: null,
            },
          }),
          activeGame: null,
          activeSnapshot: null,
        };
      }

      return {};
    });

    renderRoomPage();

    await userEvent.click(screen.getByTestId("room-country-britain"));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/rooms/ROOM01/context");
    });
    expect(screen.getByTestId("room-ready-button")).toBeEnabled();
    expect(mockConnectSocket).toHaveBeenCalledTimes(1);
  });

  it("shows host-specific waiting guidance and who the room is still waiting for", () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);

    renderRoomPage(
      createBootstrap({
        room: createRoom({
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
              isReady: false,
            },
            {
              playerId: "player-3",
              nickname: "Prussia",
              selectedCountry: null,
              connectionStatus: "online",
              isReady: false,
            },
          ],
          countrySlots: {
            britain: "player-1",
            france: "player-2",
            prussia: null,
            austria: null,
            russia: null,
          },
        }),
        session: createSession({
          selectedCountry: "britain",
        }),
      }),
    );

    const actionPanel = screen.getByRole("heading", { name: "准备开局" }).closest("section");
    const headerStatus = screen.getByTestId("room-status-banner");

    expect(actionPanel).not.toBeNull();
    expect(within(actionPanel as HTMLElement).getByText("开局前检查清单")).toBeInTheDocument();
    expect(within(actionPanel as HTMLElement).getByText("自动开局规则")).toBeInTheDocument();
    expect(actionPanel as HTMLElement).toHaveTextContent("下一步");
    expect(actionPanel as HTMLElement).toHaveTextContent("你已准备开局");
    expect(actionPanel as HTMLElement).toHaveTextContent("全员准备开局后会自动开局");
    expect(actionPanel as HTMLElement).toHaveTextContent("France：尚未准备开局");
    expect(actionPanel as HTMLElement).toHaveTextContent("Prussia：还没有选国家");
    expect(actionPanel as HTMLElement).toHaveTextContent("还差 2 人进入房间");
    expect(actionPanel as HTMLElement).toHaveTextContent("没有单独的手动开始按钮");
    expect(headerStatus).toHaveTextContent("等待其他玩家");
  });

  it("shows host-only AI fill controls and sends the fill request", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/rooms/ROOM01/bots/fill") {
        return {
          room: createRoom({
            members: [
              {
                playerId: "player-1",
                nickname: "Britain",
                selectedCountry: "britain",
                connectionStatus: "online",
                isReady: false,
              },
              {
                playerId: "bot-1",
                nickname: "AI 1",
                selectedCountry: "france",
                connectionStatus: "online",
                isReady: true,
                memberType: "bot",
              },
            ],
            countrySlots: {
              britain: "player-1",
              france: "bot-1",
              prussia: null,
              austria: null,
              russia: null,
            },
          }),
        };
      }
      if (path === "/api/v1/rooms/ROOM01/context") {
        return {
          room: createRoom(),
          activeGame: null,
          activeSnapshot: null,
        };
      }
      return {};
    });

    renderRoomPage(
      createBootstrap({
        room: createRoom({
          members: [
            {
              playerId: "player-1",
              nickname: "Britain",
              selectedCountry: "britain",
              connectionStatus: "online",
              isReady: false,
            },
          ],
          memberPlayerIds: ["player-1"],
          countrySlots: {
            britain: "player-1",
            france: null,
            prussia: null,
            austria: null,
            russia: null,
          },
        }),
        session: createSession({
          selectedCountry: "britain",
        }),
      }),
    );

    expect(screen.getByTestId("room-fill-bots-button")).toHaveTextContent("一键补满 AI");
    await userEvent.click(screen.getByTestId("room-fill-bots-button"));

    expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/rooms/ROOM01/bots/fill", {
      method: "POST",
    });
  });

  it("lets hosts kick visible AI seats from the member list", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);
    const roomWithBot = createRoom({
      members: [
        {
          playerId: "player-1",
          nickname: "Britain",
          selectedCountry: "britain",
          connectionStatus: "online",
          isReady: true,
        },
        {
          playerId: "bot-1",
          nickname: "AI 1",
          selectedCountry: "france",
          connectionStatus: "online",
          isReady: true,
          memberType: "bot",
        },
      ],
      memberPlayerIds: ["player-1", "bot-1"],
      countrySlots: {
        britain: "player-1",
        france: "bot-1",
        prussia: null,
        austria: null,
        russia: null,
      },
    });
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/rooms/ROOM01/context") {
        return {
          room: roomWithBot,
          activeGame: null,
          activeSnapshot: null,
        };
      }
      if (path === "/api/v1/rooms/ROOM01/bots/bot-1") {
        return {
          room: createRoom({
            hostPlayerId: "player-1",
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
            memberPlayerIds: ["player-1", "player-2"],
            countrySlots: {
              britain: "player-1",
              france: "player-2",
              prussia: null,
              austria: null,
              russia: null,
            },
          }),
        };
      }
      return {};
    });

    renderRoomPage(
      createBootstrap({
        room: roomWithBot,
        session: createSession({
          selectedCountry: "britain",
        }),
      }),
    );

    expect(screen.getByTestId("room-member-ai-badge-bot-1")).toHaveTextContent("AI");
    await userEvent.click(screen.getByTestId("room-remove-bot-bot-1"));
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith("/api/v1/rooms/ROOM01/bots/bot-1", {
        method: "DELETE",
      });
    });
  });

  it("hides AI controls from non-host users", () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);

    const roomWithBot = createRoom({
      members: [
        {
          playerId: "player-1",
          nickname: "Britain",
          selectedCountry: "britain",
          connectionStatus: "online",
          isReady: true,
        },
        {
          playerId: "bot-1",
          nickname: "AI 1",
          selectedCountry: "france",
          connectionStatus: "online",
          isReady: true,
          memberType: "bot",
        },
      ],
      memberPlayerIds: ["player-1", "bot-1"],
      countrySlots: {
        britain: "player-1",
        france: "bot-1",
        prussia: null,
        austria: null,
        russia: null,
      },
    });

    const router = createMemoryRouter([{ path: "/room/:roomCode", element: <RoomPage /> }], {
      initialEntries: [
        {
          pathname: "/room/ROOM01",
          state: {
            bootstrap: createBootstrap({
              room: roomWithBot,
              session: createSession({
                playerId: "player-2",
                sessionId: "session-2",
                nickname: "France",
                selectedCountry: null,
              }),
            }),
          },
        },
      ],
    });
    render(<RouterProvider router={router} />);
    expect(screen.queryByTestId("room-fill-bots-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("room-remove-bot-bot-1")).not.toBeInTheDocument();
  });

  it("routes the room start transition directly into the game workbench", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/rooms/ROOM01/context") {
        return {
          room: createRoom({
            status: "in_game",
            currentGameId: "game-1",
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
          }),
          activeGame: {
            gameId: "game-1",
            roomCode: "ROOM01",
            currentRound: 1,
            totalRounds: 15,
            currentPhase: "decision",
            isFinished: false,
            activeSnapshotId: "snapshot-1",
          },
          activeSnapshot: createGameSnapshot({
            snapshotId: "snapshot-1",
            gameId: "game-1",
            round: 1,
            phase: "decision",
            phaseDeadlineAt: "2026-03-30T12:05:00.000Z",
          }),
        };
      }

      return {};
    });

    const router = renderRoomPage();

    await act(async () => {
      socket.emitEvent(
        mockSocketEventNames.gameStarted,
        createEnvelope({
          game: {
            gameId: "game-1",
            roomCode: "ROOM01",
            currentRound: 1,
            totalRounds: 15,
            currentPhase: "decision",
            isFinished: false,
            activeSnapshotId: "snapshot-1",
          },
          snapshot: {
            ...createGameSnapshot({
              snapshotId: "snapshot-1",
              gameId: "game-1",
              round: 1,
              phase: "decision",
              phaseDeadlineAt: "2026-03-30T12:05:00.000Z",
            }),
          },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/game/game-1");
    });
  });

  it("updates the preparation guidance after room.updated confirms the selected country", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);

    renderRoomPage();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      socket.emitEvent(
        mockSocketEventNames.roomUpdated,
        createEnvelope({
          room: createRoom({
            members: [
              {
                playerId: "player-1",
                nickname: "Britain",
                selectedCountry: "britain",
                connectionStatus: "online",
                isReady: false,
              },
              {
                playerId: "player-2",
                nickname: "France",
                selectedCountry: null,
                connectionStatus: "online",
                isReady: false,
              },
            ],
            countrySlots: {
              britain: "player-1",
              france: null,
              prussia: null,
              austria: null,
              russia: null,
            },
          }),
        }),
      );
      await Promise.resolve();
    });

    const updatedActionPanel = screen.getByRole("heading", { name: "准备开局" }).closest("section");
    expect(updatedActionPanel).not.toBeNull();
    expect(updatedActionPanel as HTMLElement).toHaveTextContent("已选国家：英国");
    expect(updatedActionPanel as HTMLElement).toHaveTextContent("现在点准备开局，之后就只需要等待自动开局。满足后会自动开局。");
    expect(screen.getByTestId("room-ready-button")).toBeEnabled();
  });

  it("loads the authoritative game context when room.updated reports an in-game room", async () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === "/api/v1/rooms/ROOM01/context") {
        return {
          room: createRoom({
            status: "in_game",
            currentGameId: "game-1",
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
          }),
          activeGame: {
            gameId: "game-1",
            roomCode: "ROOM01",
            currentRound: 1,
            totalRounds: 15,
            currentPhase: "decision",
            isFinished: false,
            activeSnapshotId: "snapshot-1",
          },
          activeSnapshot: createGameSnapshot({
            snapshotId: "snapshot-1",
            gameId: "game-1",
            round: 1,
            phase: "decision",
            phaseDeadlineAt: "2026-03-30T12:05:00.000Z",
          }),
        };
      }

      return {};
    });

    const router = renderRoomPage();

    await act(async () => {
      socket.emitEvent(
        mockSocketEventNames.roomUpdated,
        createEnvelope({
          room: createRoom({
            status: "in_game",
            currentGameId: "game-1",
          }),
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/game/game-1");
    });
  });

  it("shows the automatic start transition when the room has already entered the game", () => {
    const socket = createMockSocket();
    mockConnectSocket.mockReturnValue(socket);

    renderRoomPage(
      createBootstrap({
        room: createRoom({
          status: "in_game",
          currentGameId: "game-1",
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
        }),
        session: createSession({
          selectedCountry: "britain",
        }),
      }),
    );

    const actionPanel = screen.getByRole("heading", { name: "准备开局" }).closest("section");
    const headerStatus = screen.getByTestId("room-status-banner");

    expect(actionPanel).not.toBeNull();
    expect(actionPanel as HTMLElement).toHaveTextContent("房间已开局，正在进入游戏。");
    expect(headerStatus).toHaveTextContent("房间已开局，正在进入游戏");
  });
});
