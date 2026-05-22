import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
              buildCost: 13,
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
            unitBudgetCost: 13,
            capacityDelta: 1,
            maxQuantity: 2,
            lockedReason: null,
          },
          {
            routeId: "mechanized",
            routeLabel: "机械化",
            unitBudgetCost: 26,
            capacityDelta: 1,
            maxQuantity: 1,
            lockedReason: null,
          },
        ],
        upgradeOptions: [
          {
            routeId: "handicraft",
            routeLabel: "手工业",
            sourceRouteId: "idle",
            sourceRouteLabel: "闲置",
            unitBudgetCost: 6,
            capacityDelta: 1,
            maxQuantity: 1,
            lockedReason: null,
          },
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
            capacityDelta: 1,
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
      expect(screen.getByText("扩建 手工业 工厂：新增 1 点产能，本回合生效；只受国家总工厂上限、闲置名额、预算和科技前置限制。")).toBeInTheDocument();
      expect(screen.getByText("扩建 机械化 工厂：新增 1 点产能，本回合生效；只受国家总工厂上限、闲置名额、预算和科技前置限制。")).toBeInTheDocument();
      expect(screen.getByText("闲置 → 手工业：每次消耗 1 点 闲置产能，立即转为 1 点 手工业产能；本回合可生产，不增加总工厂数。")).toBeInTheDocument();
      expect(screen.getByText("手工业 → 机械化：每次消耗 1 点 手工业产能，立即转为 1 点 机械化产能；本回合可生产，不增加总工厂数。")).toBeInTheDocument();
      expect(screen.queryByText("提高生产上限，并扩大国内市场承接。")).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });

  it("previews selected expansion capacity in the capacity overview", async () => {
    const previousLanguage = i18n.language;
    await i18n.changeLanguage("zh");

    try {
      const draft = createInitialPhaseDraft("decision");
      draft.factoryPlan.expansionOrders = [{ routeId: "handicraft", quantity: 1 }];

      const workspace = createDecisionPlayerWorkspace({
        phase1Economy: {
          capacityByMode: { idle: 2, handicraft: 1, mechanized: 0, steam: 0, electrified: 0 },
          rawMaterials: 10,
          goodsInventory: 5,
          factoryTotalCap: 3,
          factoryEnabledCount: 1,
          idleCapacity: 2,
          factoryCapsByMode: { handicraft: 3, mechanized: 3, steam: 3, electrified: 3 },
          materialPurchaseCapPerTurn: 5,
          rawMaterialPurchaseUnitCost: 1,
          maxRawMaterialPurchase: 5,
          productionModes: [
            {
              mode: "idle",
              label: "闲置",
              inputRatio: 0,
              outputRatio: 0,
              demandCoefficient: 1,
              buildCost: 0,
              upgradeCost: null,
              currentCapacity: 2,
              factoryCap: 0,
              requiredTech: null,
              isAvailable: true,
            },
            {
              mode: "handicraft",
              label: "手工业",
              inputRatio: 1,
              outputRatio: 1,
              demandCoefficient: 2,
              buildCost: 13,
              upgradeCost: 6,
              currentCapacity: 1,
              factoryCap: 3,
              requiredTech: null,
              isAvailable: true,
            },
          ],
          domesticDemand: 3,
          equilibriumPrice: 4,
          domesticPricePreview: 4,
          investmentPool: 12,
          incomeAllocationRatio: {},
          marketMetrics: {},
        },
        expansionOptions: [
          {
            routeId: "handicraft",
            routeLabel: "手工业",
            unitBudgetCost: 13,
            capacityDelta: 1,
            maxQuantity: 2,
            lockedReason: null,
          },
        ],
        upgradeOptions: [],
        newFactoryOptions: [],
      });

      render(
        <FactoryPanel
          workspace={workspace}
          draft={draft}
          remainingFactoryBudget={3}
          onProductionQuantityChange={() => undefined}
          onConstructionQuantityChange={() => undefined}
          onFactoryActionToggle={() => undefined}
          onTechnologyToggle={() => undefined}
          onPhase1RawMaterialAssignmentChange={() => undefined}
        />,
      );

      const overview = within(screen.getByRole("region", { name: "工厂容量总览" }));
      expect(overview.getByText("已启用 / 总上限")).toBeInTheDocument();
      expect(overview.getByText("2 / 3")).toBeInTheDocument();
      expect(overview.getByText(/手工业/)).toHaveTextContent("2");
      expect(overview.getByText(/闲置工厂/)).toHaveTextContent("1");
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
              buildCost: 13,
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

      expect(screen.getByText("扩建 = 直接建设 机械化 工厂，本回合生效。前置：先解锁 机械化（珍妮纺纱机），且国家总工厂池还有闲置名额。")).toBeInTheDocument();
      expect(screen.getByText("产业升级 = 手工业 → 机械化。前置：解锁 机械化（珍妮纺纱机） + 至少 1 点 手工业 产能；执行后消耗 1 点 手工业 工厂，立即转为 1 点 机械化 工厂。")).toBeInTheDocument();
      expect(screen.queryByText("当前无法为该阶段增加工厂")).not.toBeInTheDocument();
      expect(screen.queryByText("当前没有可用升级路径")).not.toBeInTheDocument();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
});
