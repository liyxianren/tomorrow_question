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
      "industrial-development",
      "factory-dispatch",
      "locked-goods",
    ]);
    expect(viewModel.locations.domestic.sections.map((section) => section.id)).toEqual([
      "market-preview",
    ]);
    expect(viewModel.locations.government.sections.map((section) => section.id)).toEqual([
      "government-market-preview",
      "government-strategy",
      "government-ability",
    ]);
    expect(viewModel.locations.research.sections.map((section) => section.id)).toContain("research-facility");
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
        factoryActions: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [{ actionId: "market_subsidy" }],
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
    expect(viewModel.summary.ratioPreview.factory).toBe(3);
    expect(viewModel.locations.factory.sections[0].cards.find((card) => card.id === "production-coal")?.feedback).toContain("已安排 2 批");
    expect(
      viewModel.locations.government.sections.flatMap((section) => section.cards).find((card) => card.id === "strategy-market_subsidy")?.selected,
    ).toBe(true);
  });

  it("keeps selected research targets out of budget point previews", () => {
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

    expect(viewModel.summary.remainingBudgets.domesticMarket).toBe(10);
    expect(viewModel.locations.research.summaryPills).toContain("本轮已选目标");
  });

  it("shows discovered technologies as direct catch-up research without dice", () => {
    const workspace = createDecisionPlayerWorkspace();
    const industrialChain = workspace.techTree.chains[0];
    const catchUpTech = {
      ...industrialChain.techs[1],
      isDiscovered: true,
      progress: 6,
    };
    const scenario = createDecisionCardDemoScenario({
      source: "live",
      workspace: {
        ...workspace,
        techTree: {
          ...workspace.techTree,
          activeResearch: catchUpTech.techId,
          chains: [
            {
              ...industrialChain,
              techs: [
                industrialChain.techs[0],
                catchUpTech,
                ...industrialChain.techs.slice(2),
              ],
            },
            ...workspace.techTree.chains.slice(1),
          ],
        },
      },
    });

    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "research",
      draft: createInitialPhaseDraft("decision"),
      scenario,
    });
    const researchCard = viewModel.locations.research.sections
      .flatMap((section) => section.cards)
      .find((card) => card.id === "research-spinning_jenny");

    expect(researchCard?.subtitle).toContain("5/5");
    expect(researchCard?.metrics.find((metric) => metric.label === "突破")?.value).toBe("追赶直解，无骰");
  });

  it("shows market-regulation effect badges in government strategy cards", () => {
    const scenario = createSeedDecisionCardDemoScenario();
    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "government",
      draft: createInitialPhaseDraft("decision"),
      scenario,
    });

    expect(
      viewModel.locations.government.sections.flatMap((section) => section.cards).find((card) => card.id === "strategy-market_fair")?.badges,
    ).toContain("国内容量 +2");
    expect(
      viewModel.locations.government.sections.flatMap((section) => section.cards).some((card) => card.id === "strategy-expand_research"),
    ).toBe(false);
  });

  it("does not lock factory production when a research target is selected", () => {
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

    expect(factoryCards.find((card) => card.id === "production-grain")?.lockedReason).toBeNull();
    expect(factoryCards.find((card) => card.id === "expansion-handicraft")?.lockedReason).toBeNull();
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

  it("keeps the domestic location as read-only market preview when a research target is selected", () => {
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

    expect(domesticCards.map((card) => card.id)).toEqual([
      "market-demand-preview",
      "market-price-preview",
      "market-regulation-preview",
    ]);
    expect(domesticCards.every((card) => card.control.kind === "none")).toBe(true);
    expect(domesticCards.every((card) => card.interaction == null)).toBe(true);
  });

  it("previews selected government market regulation without spending domestic budget", () => {
    const scenario = createSeedDecisionCardDemoScenario();
    const draft = {
      ...createInitialPhaseDraft("decision"),
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [{ actionId: "market_fair" }],
        techResearch: [],
      },
    };

    const viewModel = buildDecisionCardDemoViewModel({
      activeStep: "domestic",
      draft,
      scenario,
    });
    const regulationCard = viewModel.locations.domestic.sections
      .flatMap((section) => section.cards)
      .find((card) => card.id === "market-regulation-preview");

    expect(viewModel.summary.remainingBudgets.domesticMarket).toBe(10);
    expect(viewModel.summary.remainingBudgets.governmentFiscal).toBe(10);
    expect(regulationCard?.badges).toContain("国内容量 +2");
    expect(regulationCard?.feedback).toContain("governmentPlan.strategySelections");
  });
});
