import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";


vi.mock("./AppRouteRecovery", () => ({
  AppRouteRecovery: () => null,
}));

function renderAppShell(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <div>Identity Page</div>,
          },
          {
            path: "lobby",
            element: <div>Lobby Page</div>,
          },
          {
            path: "room/:roomCode",
            element: <div>Room Page</div>,
          },
          {
            path: "game/:gameId",
            element: <div>Game Page</div>,
          },
          {
            path: "settlement/:gameId",
            element: <div>Settlement Page</div>,
          },
          {
            path: "design/decision-card-demo",
            element: <div>Decision Card Demo Page</div>,
          },
        ],
      },
    ],
    {
      initialEntries: [initialEntry],
    },
  );

  return render(<RouterProvider router={router} />);
}

describe("AppShell", () => {
  it("keeps a product shell without development-panel language", () => {
    renderAppShell("/");

    expect(screen.getByRole("heading", { name: "Tomorrow Question" })).toBeInTheDocument();
    expect(screen.getByText("以国家议程、资源调度与联盟博弈推进 19 世纪工业化竞逐。")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/壳层/)).not.toBeInTheDocument();
    expect(screen.queryByText(/演示态/)).not.toBeInTheDocument();
    expect(screen.queryByText(/流程面板/)).not.toBeInTheDocument();
    expect(screen.queryByText(/工业时代策略/)).not.toBeInTheDocument();
    expect(screen.getByText("Identity Page")).toBeInTheDocument();
  });

  it("keeps the brand shell for the lobby without a route-stage explainer", () => {
    renderAppShell("/lobby");

    expect(screen.getByRole("heading", { name: "Tomorrow Question" })).toBeInTheDocument();
    expect(screen.getByText("集结盟友、进入房间、正式开始这一局 19 世纪列强竞逐。")).toBeInTheDocument();
    expect(screen.queryByText("当前阶段")).not.toBeInTheDocument();
    expect(screen.queryByText("首页 / 大厅 / 房间 / 对局 / 结算")).not.toBeInTheDocument();
    expect(screen.getByText("Lobby Page")).toBeInTheDocument();
  });

  it("switches to a compact task shell for room routes", () => {
    renderAppShell("/room/ROOM01");

    expect(screen.getByText("房间准备")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到大厅" })).toHaveAttribute("href", "/lobby");
    expect(screen.queryByText("当前阶段")).not.toBeInTheDocument();
    expect(screen.queryByText("首页 / 大厅 / 房间 / 对局 / 结算")).not.toBeInTheDocument();
    expect(screen.queryByText("以国家议程、资源调度与联盟博弈推进 19 世纪工业化竞逐。")).not.toBeInTheDocument();
    expect(screen.getByText("Room Page")).toBeInTheDocument();
  });

  it("uses the workbench shell width for active game routes", () => {
    const { container } = renderAppShell("/game/game-1");

    expect(container.querySelector(".page-shell--workbench")).toBeInTheDocument();
    expect(screen.queryByText("当前对局")).not.toBeInTheDocument();
    expect(screen.getByText("Game Page")).toBeInTheDocument();
  });

  it("uses the workbench shell width for settlement routes", () => {
    const { container } = renderAppShell("/settlement/game-1");

    expect(container.querySelector(".page-shell--workbench")).toBeInTheDocument();
    expect(screen.queryByText("对局结果")).not.toBeInTheDocument();
    expect(screen.getByText("Settlement Page")).toBeInTheDocument();
  });

  it("uses the workbench shell width for decision card demo routes", () => {
    const { container } = renderAppShell("/design/decision-card-demo");

    expect(container.querySelector(".page-shell--workbench")).toBeInTheDocument();
    expect(screen.queryByText("Tomorrow Question")).not.toBeInTheDocument();
    expect(screen.getByText("Decision Card Demo Page")).toBeInTheDocument();
  });
});
