import { describe, expect, it } from "vitest";

import { createInitialPhaseDraft } from "./forms";

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
