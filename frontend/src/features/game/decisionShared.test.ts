import { describe, expect, it } from "vitest";

import i18n from "../../i18n";
import {
  buildEffectMetrics,
  calculateDecisionSpendSummary,
  calculateGovernmentFiscalState,
  clampDecisionPhase1ProductionDraft,
} from "./decisionShared";
import { createInitialPhaseDraft } from "./forms";
import { createDecisionPlayerWorkspace } from "../../test/gameSnapshotFixtures";

describe("calculateDecisionSpendSummary", () => {
  it("ignores legacy colonization fields after the mechanic is removed", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.militaryPlan.unlockColonization = true;
    draft.militaryPlan.colonizationActions = [{ targetRegionId: "africa" }];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(0);
  });

  it("counts phase-1 raw material assignments as factory budget spend", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = {
      ...createInitialPhaseDraft("decision"),
      phase1Production: {
        rawMaterialAssignments: {
          handicraft: 3,
          mechanized: 2,
        },
      },
    };

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.factorySpend).toBe(5);
  });

  it("previews factory actions as factory spend", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.factoryPlan.factoryActions = [
      { actionId: "factory_raw_procurement" },
    ];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.factorySpend).toBe(3);
    expect(summary.governmentSpend).toBe(0);
  });

  it("lets upgrade orders move same-turn phase-1 production capacity between routes", () => {
    const workspace = createDecisionPlayerWorkspace({
      budgetPools: {
        domesticMarket: 10,
        factory: 20,
        governmentFiscal: 10,
      },
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
    });
    const draft = createInitialPhaseDraft("decision");
    draft.factoryPlan.upgradeOrders = [{ routeId: "mechanized", quantity: 1 }];
    draft.phase1Production = { rawMaterialAssignments: { handicraft: 2, mechanized: 1 } };

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.factorySpend).toBe(7);
  });

  it("counts administration purchases and policy activation as government spend", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.governmentPlan.adminPurchases = 2;
    draft.activatePolicies = ["trade_agreement"];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(22);
  });

  it("moves phase-1 assignments from an upgraded source route to the target route", () => {
    const workspace = createDecisionPlayerWorkspace({
      upgradeOptions: [
        {
          routeId: "mechanized",
          routeLabel: "机械化",
          sourceRouteId: "handicraft",
          sourceRouteLabel: "手工业",
          unitBudgetCost: 2,
          capacityDelta: 1,
          maxQuantity: 1,
          lockedReason: null,
        },
      ],
      phase1Economy: {
        productionModes: [
          {
            mode: "handicraft",
            label: "手工业",
            currentCapacity: 2,
            outputPerRaw: 1,
            outputRatio: 1,
            marketDemandDelta: 0,
            unitBudgetCost: 1,
            lockedReason: null,
            isAvailable: true,
          },
          {
            mode: "mechanized",
            label: "机械化",
            currentCapacity: 0,
            outputPerRaw: 2,
            outputRatio: 2,
            marketDemandDelta: 1,
            unitBudgetCost: 1,
            lockedReason: null,
            isAvailable: true,
          },
        ],
        rawMaterials: 3,
        goodsInventory: 0,
        marketDemand: 4,
        domesticDemand: 4,
        equilibriumPrice: 5,
        domesticPricePreview: 5,
        investmentPool: 20,
        incomeAllocationRatio: {},
        marketMetrics: {},
      },
    });
    const draft = createInitialPhaseDraft("decision");
    draft.factoryPlan.upgradeOrders = [{ routeId: "mechanized", quantity: 1 }];
    draft.phase1Production = { rawMaterialAssignments: { handicraft: 2 } };

    const clamped = clampDecisionPhase1ProductionDraft(workspace, draft);

    expect(clamped.phase1Production?.rawMaterialAssignments).toEqual({ handicraft: 1, mechanized: 1 });
  });

  it("keeps admin-based market policies out of fiscal spend", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.governmentPlan.strategySelections = [{ actionId: "market_subsidy" }];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(0);
    expect(summary.domesticSpend).toBe(0);
  });
});

describe("buildEffectMetrics", () => {
  it("includes ideology deltas for factory dispatch actions", async () => {
    const previousLanguage = i18n.language;
    await i18n.changeLanguage("zh");

    try {
      const metrics = buildEffectMetrics({
        productionOutputMultiplier: 2,
        ideologyDelta: {
          egalitarianism: 1,
        },
      });

      expect(metrics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "产出倍率", value: "x2" }),
          expect.objectContaining({ label: "平等主义思潮", value: "+1", tone: "negative" }),
        ]),
      );
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });
});

describe("calculateGovernmentFiscalState", () => {
  function createMarketRegulationWorkspace() {
    const baseWorkspace = createDecisionPlayerWorkspace();
    return createDecisionPlayerWorkspace({
      budgetPools: {
        domesticMarket: 12,
        factory: 15,
        governmentFiscal: 18,
      },
      baseBudgetPools: {
        domesticMarket: 12,
        factory: 15,
        governmentFiscal: 10,
      },
      marketRegulationAllowance: 5,
      governmentActions: {
        ...baseWorkspace.governmentActions,
        strategies: baseWorkspace.governmentActions.strategies.map((strategy) => ({
          ...strategy,
          isMarketRegulation: strategy.actionId === "market_subsidy" || strategy.actionId === "price_control",
          lockedReason: null,
        })),
      },
    });
  }

  it("uses government fiscal directly without adding a separate market budget line", () => {
    const state = calculateGovernmentFiscalState(
      createMarketRegulationWorkspace(),
      createInitialPhaseDraft("decision"),
    );

    expect(state.baseGovernmentBudget).toBe(10);
    expect(state.policyBudgetSupplement).toBe(8);
    expect(state.marketRegulationAllowance).toBe(0);
    expect(state.effectiveGovernmentBudget).toBe(18);
  });

  it("does not charge admin-based market policies to government fiscal", () => {
    const workspace = createMarketRegulationWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.governmentPlan.strategySelections = [{ actionId: "market_subsidy" }];
    const stateWithinGovernmentFiscal = calculateGovernmentFiscalState(workspace, draft);

    expect(stateWithinGovernmentFiscal.marketRegulationSpend).toBe(0);
    expect(stateWithinGovernmentFiscal.marketRegulationOverflow).toBe(0);
    expect(stateWithinGovernmentFiscal.baseGovernmentRemaining).toBe(10);
    expect(stateWithinGovernmentFiscal.effectiveGovernmentRemaining).toBe(18);

    draft.governmentPlan.strategySelections = [
      { actionId: "market_subsidy" },
      { actionId: "price_control" },
    ];
    const stateWithOverflow = calculateGovernmentFiscalState(workspace, draft);

    expect(stateWithOverflow.marketRegulationSpend).toBe(0);
    expect(stateWithOverflow.marketRegulationOverflow).toBe(0);
    expect(stateWithOverflow.baseGovernmentRemaining).toBe(10);
    expect(stateWithOverflow.effectiveGovernmentRemaining).toBe(18);
  });

  it("counts selected military actions in government fiscal previews", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.militaryPlan.militaryActions = [{ actionId: "naval_drill" }];

    const summary = calculateDecisionSpendSummary(workspace, draft);
    const state = calculateGovernmentFiscalState(workspace, draft);

    expect(summary.governmentSpend).toBe(1);
    expect(state.militaryFiscalSpend).toBe(1);
    expect(state.baseGovernmentRemaining).toBe(workspace.budgetPools.governmentFiscal - 1);
  });
});
