import { describe, expect, it } from "vitest";

import { buildDecisionSubmission, createInitialPhaseDraft } from "./forms";

describe("createInitialPhaseDraft", () => {
  it("creates the decision draft shape required by the 2.0 contract", () => {
    expect(createInitialPhaseDraft("decision")).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
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
        diplomacyActions: [],
        colonizationActions: [],
        navalDeployment: {},
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
