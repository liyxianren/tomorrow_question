import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import i18n from "../../../../i18n";
import { createDecisionPlayerWorkspace } from "../../../../test/gameSnapshotFixtures";
import type { FactoryExpansionOption, FactoryNewFactoryOption, FactoryUpgradeOption } from "../../../../types";
import { createInitialPhaseDraft } from "../../../../features/game/forms";

import { FactoryPanel, getConstructionTitle } from "./FactoryPanel";

describe("FactoryPanel construction titles", () => {
  it("interpolates Chinese route labels for construction actions", async () => {
    await i18n.changeLanguage("zh");

    const expansionOption: FactoryExpansionOption = {
      routeId: "handicraft",
      routeLabel: "手工业",
      unitBudgetCost: 4,
      capacityDelta: 1,
      maxQuantity: 2,
      lockedReason: null,
    };
    const upgradeOption: FactoryUpgradeOption = {
      ...expansionOption,
      routeId: "mechanized",
      routeLabel: "机械化",
      sourceRouteId: "handicraft",
      sourceRouteLabel: "手工业",
    };
    const newFactoryOption: FactoryNewFactoryOption = {
      ...expansionOption,
      routeId: "steam",
      routeLabel: "蒸汽",
    };

    expect(getConstructionTitle(expansionOption, "expansion")).toBe("扩建 手工业");
    expect(getConstructionTitle(upgradeOption, "upgrade")).toBe("升级到 机械化");
    expect(getConstructionTitle(newFactoryOption, "newFactory")).toBe("新建 蒸汽 工厂");
  });

  it("interpolates the phase-1 allocation counter", async () => {
    await i18n.changeLanguage("zh");

    expect(i18n.t("game:factory.allocatedCount", { assigned: 2, total: 5 })).toBe("已分配 2/5 份");
  });

  it("shows ideology deltas on overtime shift dispatch actions", async () => {
    const previousLanguage = i18n.language;
    await i18n.changeLanguage("zh");

    try {
      const workspace = createDecisionPlayerWorkspace({
        expansionOptions: [],
        upgradeOptions: [],
        newFactoryOptions: [],
        factoryActions: [
          {
            actionId: "factory_overtime_shift",
            label: "加班轮班",
            cost: 6,
            description: "支付加班和维护成本，本回合统一商品产出翻倍。加剧平等主义思潮。",
            lockedReason: null,
            effects: {
              productionOutputMultiplier: 2,
              ideologyDelta: {
                egalitarianism: 1,
              },
            },
          },
        ],
      });

      render(
        <FactoryPanel
          workspace={workspace}
          draft={createInitialPhaseDraft("decision")}
          remainingFactoryBudget={15}
          onProductionQuantityChange={() => undefined}
          onConstructionQuantityChange={() => undefined}
          onFactoryActionToggle={() => undefined}
          onTechnologyToggle={() => undefined}
          onPhase1RawMaterialAssignmentChange={() => undefined}
        />,
      );

      expect(screen.getByText("产出倍率 x2")).toBeInTheDocument();
      expect(screen.getByText("平等主义思潮 +1")).toHaveClass("factory-command-row__effect--negative");
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });

  it("renders stage-specific factory increase and industry upgrade controls", async () => {
    const previousLanguage = i18n.language;
    await i18n.changeLanguage("zh");

    try {
      const workspace = createDecisionPlayerWorkspace({
        phase1Economy: {
          capacityByMode: { idle: 0, handicraft: 2, mechanized: 0, steam: 0, electrified: 0 },
          rawMaterials: 3,
          goodsInventory: 0,
          productionModes: [
            {
              mode: "handicraft",
              label: "手工业",
              inputRatio: 1,
              outputRatio: 1,
              demandCoefficient: 2,
              buildCost: 12,
              upgradeCost: null,
              currentCapacity: 2,
              requiredTech: null,
              isAvailable: true,
            },
            {
              mode: "mechanized",
              label: "机械化",
              inputRatio: 1,
              outputRatio: 2,
              demandCoefficient: 3,
              buildCost: 14,
              upgradeCost: 5,
              currentCapacity: 0,
              requiredTech: null,
              isAvailable: true,
            },
          ],
          domesticDemand: 4,
          equilibriumPrice: 5,
          domesticPricePreview: 5,
          investmentPool: 20,
          incomeAllocationRatio: {},
          marketMetrics: {},
        },
        expansionOptions: [
          {
            routeId: "handicraft",
            routeLabel: "手工业",
            unitBudgetCost: 4,
            capacityDelta: 1,
            maxQuantity: 2,
            lockedReason: null,
          },
        ],
        upgradeOptions: [
          {
            routeId: "mechanized",
            routeLabel: "机械化",
            sourceRouteId: "handicraft",
            sourceRouteLabel: "手工业",
            unitBudgetCost: 5,
            capacityDelta: 1,
            maxQuantity: 1,
            lockedReason: null,
          },
        ],
        newFactoryOptions: [
          {
            routeId: "mechanized",
            routeLabel: "机械化",
            unitBudgetCost: 14,
            capacityDelta: 2,
            maxQuantity: 1,
            lockedReason: null,
          },
        ],
        factoryActions: [
          {
            actionId: "industrial_upgrade",
            label: "升级产业",
            cost: 6,
            description: "提高生产上限，并扩大国内市场承接。",
            lockedReason: null,
            effects: { handicraftCapacityDelta: 1, domesticMarketCapacityDelta: 2 },
          },
        ],
      });

      render(
        <FactoryPanel
          workspace={workspace}
          draft={createInitialPhaseDraft("decision")}
          remainingFactoryBudget={15}
          onProductionQuantityChange={() => undefined}
          onConstructionQuantityChange={() => undefined}
          onFactoryActionToggle={() => undefined}
          onTechnologyToggle={() => undefined}
          onPhase1RawMaterialAssignmentChange={() => undefined}
        />,
      );

      expect(screen.getByText("产业建设")).toBeInTheDocument();
      expect(screen.getAllByText("工厂增加")).toHaveLength(2);
      expect(screen.getAllByText("产业升级")).toHaveLength(2);
      expect(screen.getByText("扩建已有 手工业 工厂：新增 1 点产能，下回合生效；不消耗已有产能。")).toBeInTheDocument();
      expect(screen.getByText("新建首座 机械化 工厂：新增 2 点产能，下回合生效；用于从 0 打开该阶段，所以成本高于后续扩建。")).toBeInTheDocument();
      expect(screen.getByText("手工业 → 机械化：每次消耗 1 点 手工业 产能，立即转为 1 点 机械化 产能；本回合可生产，不增加总产能。")).toBeInTheDocument();
      expect(screen.queryByText("提高生产上限，并扩大国内市场承接。")).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });

  it("explains locked stage prerequisites instead of showing generic unavailable paths", async () => {
    const previousLanguage = i18n.language;
    await i18n.changeLanguage("zh");

    try {
      const workspace = createDecisionPlayerWorkspace({
        phase1Economy: {
          capacityByMode: { idle: 0, handicraft: 2, mechanized: 0, steam: 0, electrified: 0 },
          rawMaterials: 3,
          goodsInventory: 0,
          productionModes: [
            {
              mode: "handicraft",
              label: "手工业",
              inputRatio: 1,
              outputRatio: 1,
              demandCoefficient: 2,
              buildCost: 12,
              upgradeCost: null,
              currentCapacity: 2,
              requiredTech: null,
              isAvailable: true,
            },
            {
              mode: "mechanized",
              label: "机械化",
              inputRatio: 1,
              outputRatio: 2,
              demandCoefficient: 3,
              buildCost: 14,
              upgradeCost: 5,
              currentCapacity: 0,
              requiredTech: "spinning_jenny",
              isAvailable: false,
            },
          ],
          domesticDemand: 4,
          equilibriumPrice: 5,
          domesticPricePreview: 5,
          investmentPool: 20,
          incomeAllocationRatio: {},
          marketMetrics: {},
        },
        expansionOptions: [],
        upgradeOptions: [],
        newFactoryOptions: [],
        factoryActions: [],
      });

      render(
        <FactoryPanel
          workspace={workspace}
          draft={createInitialPhaseDraft("decision")}
          remainingFactoryBudget={15}
          onProductionQuantityChange={() => undefined}
          onConstructionQuantityChange={() => undefined}
          onFactoryActionToggle={() => undefined}
          onTechnologyToggle={() => undefined}
          onPhase1RawMaterialAssignmentChange={() => undefined}
        />,
      );

      expect(screen.getByText("工厂增加 = 新增 机械化 产能，下回合生效。前置：先解锁 机械化（珍妮纺纱机）。")).toBeInTheDocument();
      expect(screen.getByText("产业升级 = 手工业 → 机械化。前置：解锁 机械化（珍妮纺纱机） + 至少 1 点 手工业 产能；执行后消耗 1 点 手工业 产能，立即转为 1 点 机械化 产能。")).toBeInTheDocument();
      expect(screen.queryByText("当前无法为该阶段增加工厂")).not.toBeInTheDocument();
      expect(screen.queryByText("当前没有可用升级路径")).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
});
