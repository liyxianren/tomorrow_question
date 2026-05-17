import { describe, expect, it } from "vitest";

import { calculateDecisionSpendSummary, calculateGovernmentFiscalState } from "./decisionShared";
import { createInitialPhaseDraft } from "./forms";
import { createDecisionPlayerWorkspace } from "../../test/gameSnapshotFixtures";

describe("calculateDecisionSpendSummary", () => {
  it("counts colonization unlock once and does not charge fiscal cost for colonization target selection", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.militaryPlan.unlockColonization = true;
    draft.militaryPlan.colonizationActions = [{ targetRegionId: "africa" }];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(10);
  });

  it("does not add unlock spend when colonization is already permanently unlocked", () => {
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...createDecisionPlayerWorkspace().militaryWorkspace,
        colonizationCapability: {
          ...createDecisionPlayerWorkspace().militaryWorkspace.colonizationCapability,
          isUnlocked: true,
        },
      },
    });
    const draft = createInitialPhaseDraft("decision");

    draft.militaryPlan.unlockColonization = true;
    draft.militaryPlan.colonizationActions = [{ targetRegionId: "middle_east" }];

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

  it("previews factory actions as factory spend and government fiscal relief", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.factoryPlan.factoryActions = [
      { actionId: "factory_raw_procurement" },
      { actionId: "factory_tax_contracting" },
    ];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.factorySpend).toBe(3);
    expect(summary.governmentSpend).toBe(-4);
  });

  it("counts administration purchases and policy activation as government spend", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.governmentPlan.adminPurchases = 2;
    draft.activatePolicies = ["trade_agreement"];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(22);
  });

  it("counts market regulation strategies as government spend, not domestic spend", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.governmentPlan.strategySelections = [{ actionId: "market_fair" }];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(5);
    expect(summary.domesticSpend).toBe(0);
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
          isMarketRegulation: strategy.actionId === "market_fair" || strategy.actionId === "consumer_subsidy",
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

    expect(state.baseGovernmentBudget).toBe(18);
    expect(state.marketRegulationAllowance).toBe(0);
    expect(state.effectiveGovernmentBudget).toBe(18);
  });

  it("charges market regulation strategies directly to government fiscal", () => {
    const workspace = createMarketRegulationWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.governmentPlan.strategySelections = [{ actionId: "market_fair" }];
    const stateWithinGovernmentFiscal = calculateGovernmentFiscalState(workspace, draft);

    expect(stateWithinGovernmentFiscal.marketRegulationSpend).toBe(5);
    expect(stateWithinGovernmentFiscal.marketRegulationOverflow).toBe(5);
    expect(stateWithinGovernmentFiscal.baseGovernmentRemaining).toBe(13);
    expect(stateWithinGovernmentFiscal.effectiveGovernmentRemaining).toBe(13);

    draft.governmentPlan.strategySelections = [
      { actionId: "market_fair" },
      { actionId: "consumer_subsidy" },
    ];
    const stateWithOverflow = calculateGovernmentFiscalState(workspace, draft);

    expect(stateWithOverflow.marketRegulationSpend).toBe(13);
    expect(stateWithOverflow.marketRegulationOverflow).toBe(13);
    expect(stateWithOverflow.baseGovernmentRemaining).toBe(5);
    expect(stateWithOverflow.effectiveGovernmentRemaining).toBe(5);
  });
});
