import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionCardDemoPage } from "./DecisionCardDemoPage";

const { mockRestoreSessionContext } = vi.hoisted(() => ({
  mockRestoreSessionContext: vi.fn(),
}));

vi.mock("../app/sessionRecovery", () => ({
  restoreSessionContext: mockRestoreSessionContext,
}));

function renderDecisionCardDemoPage() {
  const router = createMemoryRouter(
    [
      {
        path: "/design/decision-card-demo",
        element: <DecisionCardDemoPage />,
      },
    ],
    {
      initialEntries: ["/design/decision-card-demo"],
    },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe("DecisionCardDemoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRestoreSessionContext.mockResolvedValue(null);
  });

  it("renders three variants and all decision locations on the demo route", async () => {
    renderDecisionCardDemoPage();

    expect(await screen.findByRole("heading", { name: "决策卡片 DEMO" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /方案 A：指挥台卡组/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /方案 B：档案册卡组/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /方案 C：行动栈卡组/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "工业区" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "市民广场" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "议会厅" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "军事要塞" })).toBeInTheDocument();
  });

  it("opens each location modal and keeps draft state when switching variants", async () => {
    renderDecisionCardDemoPage();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "决策卡片 DEMO" });

    await user.click(screen.getByRole("button", { name: "工业区" }));
    expect(screen.getByText("本轮生产")).toBeInTheDocument();
    expect(screen.getByText("购买原材料")).toBeInTheDocument();
    expect(screen.getByText("产业建设")).toBeInTheDocument();
    expect(screen.getByText("未解锁商品")).toBeInTheDocument();

    const grainCard = screen.getByText("粮食").closest("article");
    expect(grainCard).not.toBeNull();
    const grainScope = within(grainCard as HTMLElement);

    await user.click(screen.getByRole("button", { name: "增加生产 粮食" }));
    expect(grainScope.getByText("1 批")).toBeInTheDocument();
    expect(screen.getByText("工厂预算 9")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /方案 B：档案册卡组/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "减少生产 粮食" })).toBeEnabled();
      expect(screen.getByText("工厂预算 9")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "市民广场" }));
    expect(screen.getAllByText("市场预览").length).toBeGreaterThan(0);
    expect(screen.getAllByText("市场需求").length).toBeGreaterThan(0);
    expect(screen.getByText("价格来源")).toBeInTheDocument();
    expect(screen.queryByText("民生政策")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "议会厅" }));
    expect(screen.getByText("市场调节")).toBeInTheDocument();
    expect(screen.getByText("贸易促进")).toBeInTheDocument();
    expect(screen.getByText("国家能力卡")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "军事要塞" }));
    expect(screen.getByText("海外区域状态")).toBeInTheDocument();
    expect(screen.getByText("陆军征募")).toBeInTheDocument();
  });

  it("allows material purchase and market regulation toggles to update the shared draft", async () => {
    renderDecisionCardDemoPage();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "决策卡片 DEMO" });
    await user.click(screen.getByRole("button", { name: "工业区" }));

    await user.click(screen.getByRole("button", { name: "增加购买原材料" }));
    expect(screen.getByText("已安排购买 1 原材料，工厂预算 -1。")).toBeInTheDocument();
    expect(screen.getByText("工厂预算 9")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "减少购买原材料" }));
    await user.click(screen.getByTestId("decision-command-deck-tab-government"));
    await user.click(screen.getByLabelText("贸易促进"));
    expect(screen.getByText("已纳入本轮政府政策，行政力 -1。")).toBeInTheDocument();

    await user.click(screen.getByTestId("decision-command-deck-tab-domestic"));
    expect(screen.getByText("本轮政府调节")).toBeInTheDocument();
    expect(screen.getByText("海外容量 +2")).toBeInTheDocument();
    expect(screen.queryByLabelText("选择 贸易促进")).not.toBeInTheDocument();
  });
});
