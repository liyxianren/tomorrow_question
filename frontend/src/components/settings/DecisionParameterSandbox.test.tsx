import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createDecisionPlayerWorkspace, createNationalState } from "../../test/gameSnapshotFixtures";
import type { ParameterBindingSource } from "../../features/game/parameterInspector";

import { DecisionParameterSandbox, type DecisionSandboxPayload } from "./DecisionParameterSandbox";

const factoryActionCostSource: ParameterBindingSource = {
  fileName: "decision_actions.json",
  path: ["factoryActions", "factory_raw_procurement", "budgetPoolCost"],
  pathLabel: "factoryActions.factory_raw_procurement.budgetPoolCost",
  label: "工厂行动 / 原料统购 - 预算池消耗",
  fieldLabel: "预算池消耗",
  value: 3,
};

const adminPurchaseCostSource: ParameterBindingSource = {
  fileName: "politics.json",
  path: ["administrationCost"],
  pathLabel: "administrationCost",
  label: "购买行政能力价格",
  fieldLabel: "购买行政能力价格",
  value: 10,
};

function createSandboxPayload(): DecisionSandboxPayload {
  return {
    countryId: "britain",
    playerId: "settings-britain",
    roundNo: 1,
    phase: "decision",
    playerState: createNationalState({
      administrationCapacity: 3,
      budgetPools: { domesticMarket: 10, factory: 15, governmentFiscal: 17 },
    }),
    decisionWorkspace: createDecisionPlayerWorkspace({
      budgetPools: { domesticMarket: 10, factory: 15, governmentFiscal: 17 },
      baseBudgetPools: { domesticMarket: 10, factory: 15, governmentFiscal: 9 },
    }),
    parameterBindings: [
      {
        targetKey: "factory.action.factory_raw_procurement",
        title: "工厂调度：原料统购",
        currentEffect: "立刻补充本回合原材料。",
        sources: [factoryActionCostSource],
      },
      {
        targetKey: "government.adminPurchase",
        title: "购买行政力",
        currentEffect: "玩家按 + 后会用政府财政永久增加行政力上限；新增行政力本回合立刻可用于改革、政策和市场政策。",
        sources: [adminPurchaseCostSource],
      },
    ],
  };
}

describe("DecisionParameterSandbox", () => {
  it("opens the real factory panel and expands editable parameter bindings", async () => {
    const user = userEvent.setup();
    const onSourceValueChange = vi.fn();

    render(
      <SandboxHarness onSourceValueChange={onSourceValueChange} />,
    );

    await user.click(screen.getByLabelText("工业区"));
    const factoryPanel = screen.getByTestId("factory-panel");
    const actionCard = within(factoryPanel).getByText("原料统购").closest("article");
    expect(actionCard).not.toBeNull();
    await user.click(within(actionCard as HTMLElement).getByRole("button", { name: "查看数值关系" }));

    expect(screen.getByText("本次点击变化")).toBeInTheDocument();
    expect(screen.getByText("玩家视角怎么理解")).toBeInTheDocument();
    expect(screen.getByText("可编辑参数")).toBeInTheDocument();
    expect(screen.getAllByText(/控制玩家点击这个按钮要花多少预算/).length).toBeGreaterThan(0);
    expect(screen.getByText(/decision_actions\.json .* factoryActions\.factory_raw_procurement\.budgetPoolCost/)).toBeInTheDocument();

    const input = screen.getByDisplayValue("3");
    await user.clear(input);
    await user.type(input, "5");

    expect(onSourceValueChange).toHaveBeenLastCalledWith(factoryActionCostSource, 5);
  });

  it("shows the permanent admin-purchase relationship in the settings sandbox", async () => {
    const user = userEvent.setup();

    render(
      <SandboxHarness onSourceValueChange={vi.fn()} />,
    );

    await user.click(screen.getByLabelText("议会厅"));
    const adminPurchaseCard = screen.getByTestId("government-admin-purchase");
    await user.click(within(adminPurchaseCard).getByRole("button", { name: "查看数值关系" }));

    expect(within(adminPurchaseCard).getByText("本次点击变化")).toBeInTheDocument();
    expect(within(adminPurchaseCard).getByText(/永久增加行政力上限/)).toBeInTheDocument();
    expect(within(adminPurchaseCard).getAllByText(/控制永久购买 1 点行政力上限/).length).toBeGreaterThan(0);
    expect(within(adminPurchaseCard).getByText(/politics\.json .* administrationCost/)).toBeInTheDocument();
  });
});

function SandboxHarness({
  onSourceValueChange,
}: {
  onSourceValueChange: (source: ParameterBindingSource, value: number) => void;
}) {
  const [value, setValue] = useState(3);
  return (
    <DecisionParameterSandbox
      sandbox={createSandboxPayload()}
      getSourceValue={() => value}
      onSourceValueChange={(source, nextValue) => {
        setValue(nextValue);
        onSourceValueChange(source, nextValue);
      }}
    />
  );
}
