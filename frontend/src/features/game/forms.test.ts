import { describe, expect, it } from "vitest";

import {
  buildDecisionSubmission,
  createDefaultPhase1ProductionDraft,
  createInitialPhaseDraft,
} from "./forms";
import { toggleTechResearchSelection } from "./decisionDrafts";
import { createDecisionPlayerWorkspace } from "../../test/gameSnapshotFixtures";

describe("createInitialPhaseDraft", () => {
  it("creates the decision draft shape required by the 2.0 contract", () => {
    expect(createInitialPhaseDraft("decision")).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
        rawMaterialPurchaseQuantity: 0,
        factoryActions: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [],
        adminPurchases: 0,
      },
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [],
        colonizationActions: [],
        navalDeployment: {},
        regionBlockades: {},
        conquestActions: [],
        lootingActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      reforms: [],
      activatePolicies: [],
      deactivatePolicies: [],
    });
  });

  it("creates the market draft shape required by the 2.0 contract", () => {
    expect(createInitialPhaseDraft("market")).toEqual({
      saleOrders: [],
      phase1Market: {
        domesticAllocation: 0,
        externalAllocations: [],
        externalCompetitionDeployments: [],
      },
    });
  });

  it("creates the settlement draft as a read-only empty object", () => {
    expect(createInitialPhaseDraft("settlement")).toEqual({});
  });

  it("returns a fresh object for every call", () => {
    const firstDraft = createInitialPhaseDraft("decision");
    const secondDraft = createInitialPhaseDraft("decision");

    expect(firstDraft).not.toBe(secondDraft);
    expect(firstDraft.factoryPlan).not.toBe(secondDraft.factoryPlan);
    expect(firstDraft.governmentPlan).not.toBe(secondDraft.governmentPlan);
  });
});

describe("buildDecisionSubmission", () => {
  it("maps governmentPlan.techResearch[0].techId to top-level researchTarget", () => {
    const draft = createInitialPhaseDraft("decision");
    draft.governmentPlan.techResearch = [{ techId: "spinning_jenny" }];

    const result = buildDecisionSubmission(draft);

    expect(result.researchTarget).toBe("spinning_jenny");
    // All existing fields are preserved
    expect(result.factoryPlan).toBe(draft.factoryPlan);
    expect(result.governmentPlan).toBe(draft.governmentPlan);
    expect(result.militaryPlan).toBe(draft.militaryPlan);
  });

  it("omits researchTarget when techResearch is empty", () => {
    const draft = createInitialPhaseDraft("decision");
    draft.governmentPlan.techResearch = [];

    const result = buildDecisionSubmission(draft);

    expect(result).not.toHaveProperty("researchTarget");
    expect(result.factoryPlan).toBe(draft.factoryPlan);
  });

  it("uses the first techResearch entry when multiple are queued", () => {
    const draft = createInitialPhaseDraft("decision");
    draft.governmentPlan.techResearch = [
      { techId: "steam_engine" },
      { techId: "spinning_jenny" },
    ];

    const result = buildDecisionSubmission(draft);

    expect(result.researchTarget).toBe("steam_engine");
  });
});

describe("toggleTechResearchSelection", () => {
  it("keeps research target selection single-choice", () => {
    const draft = createInitialPhaseDraft("decision");

    const first = toggleTechResearchSelection(draft, "leyden_jar", true);
    const second = toggleTechResearchSelection(first, "spinning_jenny", true);

    expect(second.governmentPlan.techResearch).toEqual([{ techId: "spinning_jenny" }]);
  });

  it("clears the selected research target when toggled off", () => {
    const draft = createInitialPhaseDraft("decision");
    const selected = toggleTechResearchSelection(draft, "leyden_jar", true);

    expect(toggleTechResearchSelection(selected, "leyden_jar", false).governmentPlan.techResearch).toEqual([]);
  });
});

describe("createDefaultPhase1ProductionDraft", () => {
  it("allocates raw materials to available production modes by output efficiency", () => {
    const workspace = createDecisionPlayerWorkspace({
      phase1Economy: {
        capacityByMode: {
          idle: 0,
          handicraft: 3,
          mechanized: 2,
          steam: 0,
          electrified: 0,
        },
        rawMaterials: 4,
        goodsInventory: 0,
        productionModes: [
          {
            mode: "handicraft",
            label: "手工业",
            inputRatio: 1,
            outputRatio: 1,
            demandCoefficient: 2,
            buildCost: 12,
            upgradeCost: 0,
            currentCapacity: 3,
            requiredTech: null,
            isAvailable: true,
          },
          {
            mode: "mechanized",
            label: "机械化",
            inputRatio: 1,
            outputRatio: 2,
            demandCoefficient: 3,
            buildCost: 20,
            upgradeCost: 10,
            currentCapacity: 2,
            requiredTech: null,
            isAvailable: true,
          },
        ],
        domesticDemand: 0,
        equilibriumPrice: 0,
        domesticPricePreview: 0,
        investmentPool: 0,
        incomeAllocationRatio: {},
        marketMetrics: {},
      },
    });

    expect(createDefaultPhase1ProductionDraft(workspace)).toEqual({
      rawMaterialAssignments: {
        mechanized: 2,
        handicraft: 2,
      },
    });
  });

  it("returns undefined when no raw material can be assigned", () => {
    expect(
      createDefaultPhase1ProductionDraft(createDecisionPlayerWorkspace()),
    ).toBeUndefined();
  });

  it("does not auto-assign more raw materials than the factory budget can pay for", () => {
    const workspace = createDecisionPlayerWorkspace({
      budgetPools: {
        domesticMarket: 0,
        factory: 2,
        governmentFiscal: 0,
      },
      phase1Economy: {
        capacityByMode: {
          idle: 0,
          handicraft: 8,
          mechanized: 0,
          steam: 0,
          electrified: 0,
        },
        rawMaterials: 8,
        goodsInventory: 0,
        productionModes: [
          {
            mode: "handicraft",
            label: "手工业",
            inputRatio: 1,
            outputRatio: 1,
            demandCoefficient: 2,
            buildCost: 12,
            upgradeCost: 0,
            currentCapacity: 8,
            requiredTech: null,
            isAvailable: true,
          },
        ],
        domesticDemand: 0,
        equilibriumPrice: 0,
        domesticPricePreview: 0,
        investmentPool: 0,
        incomeAllocationRatio: {},
        marketMetrics: {},
      },
    });

    expect(createDefaultPhase1ProductionDraft(workspace)).toEqual({
      rawMaterialAssignments: {
        handicraft: 2,
      },
    });
  });
});
