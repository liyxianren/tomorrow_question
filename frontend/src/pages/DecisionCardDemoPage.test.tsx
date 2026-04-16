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
    expect(screen.getByText("建设升级")).toBeInTheDocument();
    expect(screen.getByText("工业研究")).toBeInTheDocument();
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
    expect(screen.getByText("民生政策")).toBeInTheDocument();
    expect(screen.getByText("消费研究")).toBeInTheDocument();
    expect(screen.getByText("消费补贴")).toBeInTheDocument();
    expect(screen.getAllByText("需要研究「市场经济」").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "议会厅" }));
    expect(screen.getByText("政府策略")).toBeInTheDocument();
    expect(screen.getByText("政策研究")).toBeInTheDocument();
    expect(screen.getByText("国家能力卡")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "军事要塞" }));
    expect(screen.getByText("海外区域状态")).toBeInTheDocument();
    expect(screen.getByText("海军建设")).toBeInTheDocument();
  });

  it("allows confirm cards to update draft and prevents overspending after research is queued", async () => {
    renderDecisionCardDemoPage();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "决策卡片 DEMO" });
    await user.click(screen.getByRole("button", { name: "工业区" }));

    await user.click(screen.getByRole("button", { name: "确认扩产" }));
    expect(screen.getByRole("button", { name: "取消扩产" })).toBeInTheDocument();
    expect(screen.getByText("工厂预算 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消扩产" }));
    await user.click(screen.getByLabelText("珍妮纺织机"));
    expect(screen.getByText("工厂预算 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "增加生产 粮食" })).toBeDisabled();
  });
});
