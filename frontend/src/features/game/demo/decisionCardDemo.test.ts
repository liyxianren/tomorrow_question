import { describe, expect, it } from "vitest";

import { createInitialPhaseDraft } from "../forms";
import { createDecisionPlayerWorkspace } from "../../../test/gameSnapshotFixtures";
import {
  buildDecisionCardDemoViewModel,
  createDecisionCardDemoScenario,
  createSeedDecisionCardDemoScenario,
} from "./decisionCardDemo";

describe("decisionCardDemo adapter", () => {
  it("builds all four decision locations from the Austria seed scenario", () => {
    const scenario = createSeedDecisionCardDemoScenario();
    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "factory",
      draft: createInitialPhaseDraft("decision"),
      scenario,
    });

    expect(scenario.countryLabel).toBe("奥地利");
    expect(viewModel.locations.factory.label).toBe("工业区");
    expect(viewModel.locations.domestic.label).toBe("市民广场");
    expect(viewModel.locations.government.label).toBe("议会厅");
    expect(viewModel.locations.military.label).toBe("军事要塞");
    expect(viewModel.locations.factory.sections.map((section) => section.id)).toEqual([
      "production",
      "construction",
      "factory-tech",
      "locked-goods",
    ]);
    expect(viewModel.locations.domestic.sections.map((section) => section.id)).toEqual([
      "domestic-actions",
      "domestic-tech",
    ]);
    expect(viewModel.locations.government.sections.map((section) => section.id)).toEqual([
      "government-points",
      "government-strategy",
      "government-tech",
      "government-ability",
    ]);
  });

  it("keeps live workspace values and reflects draft-driven budget and ratio previews", () => {
    const workspace = createDecisionPlayerWorkspace();
    const scenario = createDecisionCardDemoScenario({
      source: "live",
      workspace,
    });
    const draft = {
      ...createInitialPhaseDraft("decision"),
      factoryPlan: {
        productionOrders: [{ goodsId: "coal", quantity: 2 }],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [{ actionId: "industrial_policy" }],
        techResearch: [],
      },
    };

    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "government",
      draft,
      scenario,
    });

    expect(viewModel.sourceLabel).toBe("实时对局");
    expect(viewModel.summary.remainingBudgets.factory).toBe(11);
    expect(viewModel.summary.ratioPreview.factory).toBe(3.2);
    expect(viewModel.locations.factory.sections[0].cards.find((card) => card.id === "production-coal")?.feedback).toContain("已安排 2 批");
    expect(
      viewModel.locations.government.sections.flatMap((section) => section.cards).find((card) => card.id === "strategy-industrial_policy")?.selected,
    ).toBe(true);
  });

  it("applies queued research to the matching budget pool without draining tech points", () => {
    const seedScenario = createSeedDecisionCardDemoScenario();
    const scenario = createDecisionCardDemoScenario({
      source: "live",
      workspace: {
        ...seedScenario.workspace,
        techPoints: 10,
      },
    });
    const draft = {
      ...createInitialPhaseDraft("decision"),
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [{ techId: "market_economy" }],
      },
    };

    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "domestic",
      draft,
      scenario,
    });

    expect(viewModel.summary.remainingBudgets.domesticMarket).toBe(4);
    expect(viewModel.summary.techPoints).toBe(10);
  });

  it("localizes ratio delta badges in government strategy cards", () => {
    const scenario = createSeedDecisionCardDemoScenario();
    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "government",
      draft: createInitialPhaseDraft("decision"),
      scenario,
    });

    expect(
      viewModel.locations.government.sections.flatMap((section) => section.cards).find((card) => card.id === "strategy-expand_shipping_lines")?.badges,
    ).toContain("内需 -0.2 / 政府 +0.2");
  });

  it("locks factory production and construction cards when queued research exhausts the factory budget", () => {
    const scenario = createSeedDecisionCardDemoScenario();
    const draft = {
      ...createInitialPhaseDraft("decision"),
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [{ techId: "spinning_jenny" }],
      },
    };

    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "factory",
      draft,
      scenario,
    });
    const factoryCards = viewModel.locations.factory.sections.flatMap((section) => section.cards);

    expect(factoryCards.find((card) => card.id === "production-grain")?.lockedReason).toBe("工厂预算不足");
    expect(factoryCards.find((card) => card.id === "production-grain")?.control).toMatchObject({
      kind: "quantity",
      max: 0,
    });
    expect(factoryCards.find((card) => card.id === "expansion-handicraft")?.lockedReason).toBe("工厂预算不足");
    expect(factoryCards.find((card) => card.id === "expansion-handicraft")?.control).toMatchObject({
      kind: "confirm",
      disabled: true,
    });
  });

  it("locks shared handicraft capacity after one batch is already allocated", () => {
    const scenario = createSeedDecisionCardDemoScenario();
    const draft = {
      ...createInitialPhaseDraft("decision"),
      factoryPlan: {
        productionOrders: [{ goodsId: "grain", quantity: 1 }],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
    };

    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "factory",
      draft,
      scenario,
    });
    const factoryCards = viewModel.locations.factory.sections.flatMap((section) => section.cards);

    expect(factoryCards.find((card) => card.id === "production-minerals")?.lockedReason).toBe("共享手工业产能已满");
    expect(factoryCards.find((card) => card.id === "production-minerals")?.control).toMatchObject({
      kind: "quantity",
      max: 0,
    });
  });

  it("locks domestic actions when queued research has already consumed the remaining domestic budget", () => {
    const scenario = createSeedDecisionCardDemoScenario();
    const draft = {
      ...createInitialPhaseDraft("decision"),
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [{ techId: "market_economy" }],
      },
    };

    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "domestic",
      draft,
      scenario,
    });
    const domesticCards = viewModel.locations.domestic.sections.flatMap((section) => section.cards);

    expect(domesticCards.find((card) => card.id === "domestic-rural_development")?.lockedReason).toBe("国内预算不足");
    expect(domesticCards.find((card) => card.id === "domestic-rural_development")?.control).toMatchObject({
      kind: "toggle",
      disabled: true,
    });
  });
});
