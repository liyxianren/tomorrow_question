import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_PROFILE_STORAGE_KEY } from "../features/lobby/flow/identityStorage";

import { IdentityPage } from "./IdentityPage";


const {
  mockApiRequest,
  mockGetSessionId,
  mockClearSessionId,
} = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockGetSessionId: vi.fn<() => string | null>(),
  mockClearSessionId: vi.fn<() => void>(),
}));

vi.mock("../services/http", async () => {
  const actual = await vi.importActual<typeof import("../services/http")>("../services/http");

  return {
    ...actual,
    apiRequest: mockApiRequest,
    getSessionId: mockGetSessionId,
    clearSessionId: mockClearSessionId,
  };
});

function renderIdentityPage() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <IdentityPage />,
      },
    ],
    {
      initialEntries: ["/"],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("IdentityPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires a display name before entering the lobby", async () => {
    mockGetSessionId.mockReturnValue(null);
    renderIdentityPage();

    await userEvent.click(screen.getByTestId("identity-continue-button"));

    expect(screen.getByTestId("identity-gate-modal")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "显示昵称" })).toBeInTheDocument();
    expect(screen.getByTestId("identity-status-message")).toHaveTextContent("请先填写你想在本局使用的显示姓名。");
  });

  it("stores a local profile after identity confirmation", async () => {
    mockGetSessionId.mockReturnValue(null);
    const router = renderIdentityPage();

    await userEvent.clear(screen.getByTestId("identity-nickname-input"));
    await userEvent.type(screen.getByTestId("identity-nickname-input"), "tester");
    await userEvent.click(screen.getByTestId("identity-continue-button"));

    const storedProfile = JSON.parse(window.localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY) ?? "{}");
    expect(storedProfile.displayName).toBe("tester");
    expect(storedProfile.profileId).toMatch(/^profile-/);
    expect(storedProfile.recentRoomCodes).toEqual([]);
    expect(router.state.location.pathname).toBe("/");
  });

  it("keeps saved-progress controls out of the nickname confirmation modal", async () => {
    mockGetSessionId.mockReturnValue(null);
    window.localStorage.setItem(
      LOCAL_PROFILE_STORAGE_KEY,
      JSON.stringify({
        profileId: "profile-restore01",
        displayName: "tester",
        boundSessionId: "session-1234567890",
        updatedAt: "2026-03-30T10:00:00.000Z",
      }),
    );

    renderIdentityPage();

    expect(screen.queryByTestId("lobby-restore-button")).not.toBeInTheDocument();
    expect(screen.queryByText("继续上次会话")).not.toBeInTheDocument();
    expect(screen.getByTestId("identity-profile-id")).toHaveTextContent("profile-restore01");
  });
});
