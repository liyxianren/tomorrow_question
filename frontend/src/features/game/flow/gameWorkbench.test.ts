import { describe, expect, it } from "vitest";

import { createInitialDecisionFlowState } from "./decisionFlow";
import { createGameWorkbenchViewModel, getPhaseSubmitBlockingReasons } from "./gameWorkbench";
import { createInitialPhaseDraft } from "../forms";
import {
  createDecisionPlayerWorkspace,
  createNationalState,
} from "../../../test/gameSnapshotFixtures";

describe("createGameWorkbenchViewModel", () => {
  it("marks government as decided when a policy activation is queued", () => {
    const draft = createInitialPhaseDraft("decision");
    draft.activatePolicies = ["trade_agreement"];

    const viewModel = createGameWorkbenchViewModel({
      currentPhase: "decision",
      currentPlayerId: "player-1",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace(),
      currentSubmittedStatus: "pending",
      draftPayload: draft,
      decisionFlowState: createInitialDecisionFlowState(),
      rankingStandings: [],
      settlementWorkspace: null,
    });

    expect(viewModel.topWorkflow?.steps.find((step) => step.id === "government")?.statusLabel).toBe("已决策");
    expect(viewModel.assistRail.checklist.lines.find((line) => line.startsWith("政府政策"))).toContain("已决策");
    expect(viewModel.assistRail.submit.warningLines).not.toEqual(
      expect.arrayContaining([expect.stringContaining("政府政策")]),
    );
  });

  it("blocks decision submission until undecided steps are reviewed or skipped", () => {
    const draft = createInitialPhaseDraft("decision");
    const reasons = getPhaseSubmitBlockingReasons({
      currentPhase: "decision",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace(),
      draftPayload: draft,
      decisionFlowState: createInitialDecisionFlowState(),
    });

    expect(reasons[0]).toContain("请先完成或跳过");
    expect(reasons[0]).toContain("工厂决策");
    expect(reasons[0]).toContain("政府政策");
    expect(reasons[0]).toContain("军事要塞");
    expect(reasons[0]).toContain("研究院");
  });

  it("allows decision submission when empty steps have been explicitly skipped", () => {
    const decisionFlowState = createInitialDecisionFlowState();
    const reasons = getPhaseSubmitBlockingReasons({
      currentPhase: "decision",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace(),
      draftPayload: createInitialPhaseDraft("decision"),
      decisionFlowState: {
        ...decisionFlowState,
        stepReviewStateByStep: {
          factory: "no_op",
          government: "no_op",
          domestic: "checked",
          military: "no_op",
          research: "no_op",
        },
      },
    });

    expect(reasons).toEqual([]);
  });

  it("allows same-turn production on capacity created by upgrade orders", () => {
    const decisionFlowState = createInitialDecisionFlowState();
    const draft = createInitialPhaseDraft("decision");
    draft.factoryPlan.upgradeOrders = [{ routeId: "mechanized", quantity: 1 }];
    draft.phase1Production = { rawMaterialAssignments: { mechanized: 1 } };

    const reasons = getPhaseSubmitBlockingReasons({
      currentPhase: "decision",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace({
        budgetPools: { domesticMarket: 10, factory: 20, governmentFiscal: 20 },
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
          rawMaterials: 2,
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
      }),
      draftPayload: draft,
      decisionFlowState: {
        ...decisionFlowState,
        stepReviewStateByStep: {
          factory: "checked",
          government: "no_op",
          domestic: "checked",
          military: "no_op",
          research: "no_op",
        },
      },
    });

    expect(reasons).toEqual([]);
  });

  it("counts same-turn raw material procurement before blocking production submission", () => {
    const decisionFlowState = createInitialDecisionFlowState();
    const draft = createInitialPhaseDraft("decision");
    draft.factoryPlan.factoryActions = [{ actionId: "factory_raw_procurement" }];
    draft.phase1Production = { rawMaterialAssignments: { handicraft: 5 } };

    const reasons = getPhaseSubmitBlockingReasons({
      currentPhase: "decision",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace({
        budgetPools: { domesticMarket: 10, factory: 20, governmentFiscal: 20 },
        phase1Economy: {
          capacityByMode: { idle: 0, handicraft: 5, mechanized: 0, steam: 0, electrified: 0 },
          rawMaterials: 1,
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
              currentCapacity: 5,
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
      }),
      draftPayload: draft,
      decisionFlowState: {
        ...decisionFlowState,
        stepReviewStateByStep: {
          factory: "checked",
          government: "no_op",
          domestic: "checked",
          military: "no_op",
          research: "no_op",
        },
      },
    });

    expect(reasons).toEqual([]);
  });

  it("renders route labels instead of raw placeholders for capacity validation", () => {
    const decisionFlowState = createInitialDecisionFlowState();
    const draft = createInitialPhaseDraft("decision");
    draft.phase1Production = { rawMaterialAssignments: { mechanized: 1 } };

    const reasons = getPhaseSubmitBlockingReasons({
      currentPhase: "decision",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace({
        phase1Economy: {
          capacityByMode: { idle: 0, handicraft: 2, mechanized: 0, steam: 0, electrified: 0 },
          rawMaterials: 2,
          goodsInventory: 0,
          productionModes: [
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
      }),
      draftPayload: draft,
      decisionFlowState: {
        ...decisionFlowState,
        stepReviewStateByStep: {
          factory: "checked",
          government: "no_op",
          domestic: "checked",
          military: "no_op",
          research: "no_op",
        },
      },
    });

    expect(reasons.join("\n")).toContain("机械化 分配 1");
    expect(reasons.join("\n")).not.toContain("{{mode}}");
  });
});
