import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createDecisionPlayerWorkspace, createNationalState } from "../../test/gameSnapshotFixtures";
import type { ParameterBindingSource } from "../../features/game/parameterInspector";

import { DecisionParameterSandbox, type DecisionSandboxPayload } from "./DecisionParameterSandbox";

const rawMaterialPurchaseCostSource: ParameterBindingSource = {
  fileName: "production.json",
  path: ["rawMaterialPurchaseUnitCost"],
  pathLabel: "rawMaterialPurchaseUnitCost",
  label: "材料购买单位成本",
  fieldLabel: "材料购买单位成本",
  value: 1,
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
      phase1Economy: {
        capacityByMode: { idle: 2, handicraft: 1 },
        rawMaterials: 4,
        goodsInventory: 0,
        factoryTotalCap: 3,
        factoryEnabledCount: 1,
        idleCapacity: 2,
        factoryCapsByMode: { handicraft: 3, mechanized: 3, steam: 3, electrified: 3 },
        materialPurchaseCapPerTurn: 5,
        rawMaterialPurchaseUnitCost: 1,
        maxRawMaterialPurchase: 5,
        productionModes: [
          {
            mode: "handicraft",
            label: "手工业",
            inputRatio: 1,
            outputRatio: 1,
            demandCoefficient: 2,
            buildCost: 12,
            upgradeCost: 6,
            currentCapacity: 1,
            factoryCap: 3,
            requiredTech: null,
            isAvailable: true,
          },
        ],
        domesticDemand: 2,
        equilibriumPrice: 3,
        domesticPricePreview: 3,
        investmentPool: 12,
        incomeAllocationRatio: {},
        marketMetrics: {},
      },
    }),
    parameterBindings: [
      {
        targetKey: "factory.rawMaterialPurchase",
        title: "材料购买",
        currentEffect: "每购买 1 原材料，立即增加本回合可投料数量，并消耗工厂预算。",
        sources: [rawMaterialPurchaseCostSource],
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
    const materialPurchaseCard = within(factoryPanel).getByText("材料购买").closest("section");
    expect(materialPurchaseCard).not.toBeNull();
    await user.click(within(materialPurchaseCard as HTMLElement).getByRole("button", { name: "查看数值关系" }));

    expect(screen.getByText("本次点击变化")).toBeInTheDocument();
    expect(screen.getByText("玩家视角怎么理解")).toBeInTheDocument();
    expect(screen.getByText("可编辑参数")).toBeInTheDocument();
    expect(screen.getAllByText(/控制每购买 1 原材料需要消耗多少工厂预算/).length).toBeGreaterThan(0);
    expect(screen.getByText(/production\.json .* rawMaterialPurchaseUnitCost/)).toBeInTheDocument();

    const input = screen.getByDisplayValue("1");
    await user.clear(input);
    await user.type(input, "2");

    expect(onSourceValueChange).toHaveBeenLastCalledWith(rawMaterialPurchaseCostSource, 2);
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
  const [value, setValue] = useState(1);
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
