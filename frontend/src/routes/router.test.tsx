import { render, screen } from "@testing-library/react";
import { Outlet, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/AppShell", () => ({
  AppShell: () => <Outlet />,
}));

vi.mock("../pages/HomePage", () => ({
  HomePage: () => <div>Home Page</div>,
}));

vi.mock("../pages/LobbyPage", () => ({
  LobbyPage: () => <div>Lobby Page</div>,
}));

vi.mock("../pages/RoomPage", () => ({
  RoomPage: () => <div>Room Page</div>,
}));

vi.mock("../pages/GamePage", () => ({
  GamePage: () => <div>Game Page</div>,
}));

vi.mock("../pages/SettlementPage", () => ({
  SettlementPage: () => <div>Settlement Page</div>,
}));

vi.mock("../pages/DecisionCardDemoPage", () => ({
  DecisionCardDemoPage: () => <div>Decision Card Demo Page</div>,
}));

vi.mock("../pages/NotFoundPage", () => ({
  NotFoundPage: () => <div>Not Found Page</div>,
}));

describe("router", () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState({}, "", "/");
  });

  it("routes /design/decision-card-demo to the decision card demo page", async () => {
    window.history.pushState({}, "", "/design/decision-card-demo");

    const { router } = await import("./router");

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Decision Card Demo Page")).toBeInTheDocument();
  });
});
