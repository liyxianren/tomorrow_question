import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Phase1ProductionMode } from "../../../../types";
import { Phase1ProductionPanel } from "./Phase1ProductionPanel";

const baseModes: Phase1ProductionMode[] = [
  {
    mode: "idle",
    label: "闲置",
    inputRatio: 1,
    outputRatio: 0,
    demandCoefficient: 0,
    buildCost: null,
    upgradeCost: null,
    currentCapacity: 2,
    requiredTech: null,
    isAvailable: true,
  },
  {
    mode: "handicraft",
    label: "手工业",
    inputRatio: 1,
    outputRatio: 1,
    demandCoefficient: 1,
    buildCost: 8,
    upgradeCost: null,
    currentCapacity: 3,
    requiredTech: null,
    isAvailable: true,
  },
  {
    mode: "mechanized",
    label: "机械化",
    inputRatio: 1,
    outputRatio: 2,
    demandCoefficient: 1.2,
    buildCost: 12,
    upgradeCost: 10,
    currentCapacity: 2,
    requiredTech: "spinning_jenny",
    isAvailable: false,
  },
  {
    mode: "steam",
    label: "蒸汽工业",
    inputRatio: 1,
    outputRatio: 3,
    demandCoefficient: 1.5,
    buildCost: 16,
    upgradeCost: 14,
    currentCapacity: 0,
    requiredTech: ["watt_engine", "lathe"],
    isAvailable: false,
  },
  {
    mode: "electrified",
    label: "电气工业",
    inputRatio: 1,
    outputRatio: 4,
    demandCoefficient: 2,
    buildCost: 20,
    upgradeCost: 18,
    currentCapacity: 0,
    requiredTech: ["power_generation", "combustion_engine"],
    isAvailable: false,
  },
];

function renderProductionPanel({
  modes = baseModes,
  assignments = {},
  onAssignmentChange = vi.fn(),
  factoryBudget = 5,
  factoryBudgetRemaining,
  factoryBudgetTotal,
}: {
  modes?: Phase1ProductionMode[];
  assignments?: Record<string, number>;
  onAssignmentChange?: (mode: string, quantity: number) => void;
  factoryBudget?: number;
  factoryBudgetRemaining?: number;
  factoryBudgetTotal?: number;
} = {}) {
  render(
    <Phase1ProductionPanel
      modes={modes}
      rawMaterials={5}
      factoryBudget={factoryBudget}
      factoryBudgetRemaining={factoryBudgetRemaining}
      factoryBudgetTotal={factoryBudgetTotal}
      domesticDemand={3}
      equilibriumPrice={4}
      domesticPricePreview={4}
      goodsInventory={1}
      assignments={assignments}
      onAssignmentChange={onAssignmentChange}
    />,
  );
  return { onAssignmentChange };
}

describe("Phase1ProductionPanel", () => {
  it("shows idle capacity as passive status instead of a production route", () => {
    renderProductionPanel();

    expect(screen.queryByTestId("production-route-idle")).not.toBeInTheDocument();
    expect(screen.getByTestId("idle-status-chip")).toHaveTextContent(/闲置工厂\s*2/);
    expect(screen.getByTestId("production-route-handicraft")).toBeInTheDocument();
  });

  it("renders locked route requirements without enabled controls", () => {
    renderProductionPanel();

    const mechanized = screen.getByTestId("production-route-mechanized");
    expect(within(mechanized).getByText("需 珍妮纺纱机")).toBeInTheDocument();
    expect(screen.queryByLabelText("机械化 增加")).not.toBeInTheDocument();

    const steam = screen.getByTestId("production-route-steam");
    expect(within(steam).getByText("需 瓦特蒸汽机 + 车床")).toBeInTheDocument();
  });

  it("updates assignments through compact route controls", async () => {
    function Harness() {
      const [assignments, setAssignments] = useState<Record<string, number>>({ handicraft: 1 });
      return (
        <Phase1ProductionPanel
          modes={baseModes}
          rawMaterials={5}
          factoryBudget={5}
          domesticDemand={3}
          equilibriumPrice={4}
          domesticPricePreview={4}
          goodsInventory={1}
          assignments={assignments}
          onAssignmentChange={(mode, quantity) => {
            setAssignments((previous) => ({ ...previous, [mode]: quantity }));
          }}
        />
      );
    }

    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("手工业 增加"));
    expect(within(screen.getByTestId("production-route-handicraft")).getByLabelText("手工业生产数据")).toHaveTextContent(/2\s*投入/);

    await user.click(screen.getByLabelText("手工业 最大"));
    expect(within(screen.getByTestId("production-route-handicraft")).getByLabelText("手工业生产数据")).toHaveTextContent(/3\s*投入/);

    await user.click(screen.getByLabelText("手工业 清空"));
    expect(within(screen.getByTestId("production-route-handicraft")).getByLabelText("手工业生产数据")).toHaveTextContent(/0\s*投入/);
  });

  it("does not ask players to upgrade industry when budget is the active production bottleneck", () => {
    const modes = baseModes.map((mode) =>
      mode.mode === "handicraft"
        ? { ...mode, currentCapacity: 4 }
        : mode,
    );

    render(
      <Phase1ProductionPanel
        modes={modes}
        rawMaterials={5}
        factoryBudget={3}
        domesticDemand={3}
        equilibriumPrice={4}
        domesticPricePreview={4}
        goodsInventory={1}
        assignments={{ handicraft: 3 }}
        onAssignmentChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("capacity-warning")).not.toBeInTheDocument();
    expect(screen.getByTestId("budget-warning")).toHaveTextContent("工厂预算不足");
  });

  it("keeps the factory budget denominator on the full decision budget", () => {
    renderProductionPanel({
      factoryBudget: 3,
      factoryBudgetRemaining: 6,
      factoryBudgetTotal: 10,
      assignments: { handicraft: 1 },
    });

    expect(screen.getByText("6 / 10")).toBeInTheDocument();
  });
});
