import i18n from "../../../i18n";
import { getReformLabel } from "../panelGlossary";
import {
  getAllocatedProductionBatchesForRoute,
  getProductionOrderQuantity,
  getRouteOrderQuantity,
} from "../decisionDrafts";
import {
  buildEffectMetrics,
  buildMilitaryActionDescription,
  buildRegionAccessDescription,
  buildTechResearchDescription,
  buildTechUnlockSummary,
  calculateDecisionMarketReferencePrice,
  calculateDecisionSpendSummary,
  calculateGovernmentFiscalState,
  calculateGovernmentPointPreview,
  calculateRatioPreview,
  calculateTechResearchPreview,
  flattenTechTree,
  formatPriceTrendText,
  formatRatio,
  formatRatioDeltaSummary,
  formatSignedValue,
  getGoodsLabel,
  getRegionAccessLevelLabel,
  getTechResearchLockedReason,
} from "../decisionShared";
import type { PhaseDraftByPhase } from "../forms";
import {
  DECISION_STEP_ORDER,
  getDecisionStepLabel,
  type DecisionStepId,
} from "../flow/decisionFlow";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type {
  DecisionCardViewModel,
  DecisionCommandDeckViewModel,
  DecisionLocationId,
  DecisionLocationViewModel,
} from "./types";

const MARKET_PREVIEW_EFFECT_KEYS = [
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
] as const;

const MARKET_PREVIEW_EFFECT_LABELS: Record<(typeof MARKET_PREVIEW_EFFECT_KEYS)[number], string> = {
  domesticMarketCapacityDelta: i18n.t("game:effect.domesticMarketCapacityDelta", "国内容量"),
  domesticPriceBonusDelta: i18n.t("game:effect.domesticPriceBonusDelta", "国内价格"),
  handicraftCapacityDelta: i18n.t("game:effect.handicraftCapacityDelta", "手工业产能"),
  overseasMarketCapacityDelta: i18n.t("game:effect.overseasMarketCapacityDelta", "海外容量"),
};

function formatPolicyCostSummary(policy: { adminCostPerTurn: number; budgetCost: number }): string {
  const parts: string[] = [];
  if (policy.adminCostPerTurn > 0) {
    parts.push(i18n.t("game:commandDeck.government.policySubtitle", "行政力 {{admin}}", { admin: policy.adminCostPerTurn }));
  }
  if (policy.budgetCost > 0) {
    parts.push(i18n.t("game:commandDeck.government.policyFiscalCost", "财政 {{budget}}", { budget: policy.budgetCost }));
  }
  return parts.length > 0 ? parts.join(" · ") : i18n.t("game:government.noDirectCost", "无直接消耗");
}

function buildPolicyCostMetrics(policy: { adminCostPerTurn: number; budgetCost: number }) {
  return [
    ...(policy.adminCostPerTurn > 0
      ? [{ label: i18n.t("game:commandDeck.government.adminCost", "行政力消耗"), value: policy.adminCostPerTurn }]
      : []),
    ...(policy.budgetCost > 0
      ? [{ label: i18n.t("game:commandDeck.government.budget", "预算"), value: policy.budgetCost }]
      : []),
  ];
}

export function buildDecisionCommandDeckViewModel({
  workspace,
  draft,
  activeStep,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  activeStep: DecisionStepId;
}): DecisionCommandDeckViewModel {
  const spendSummary = calculateDecisionSpendSummary(workspace, draft);
  const fiscalState = calculateGovernmentFiscalState(workspace, draft);
  const ratioPreview = calculateRatioPreview(workspace, draft);
  const governmentPointPreview = calculateGovernmentPointPreview(workspace, draft);
  const techResearchPreview = calculateTechResearchPreview(workspace, draft);
  const remainingBudgets = {
    domesticMarket: workspace.budgetPools.domesticMarket - spendSummary.domesticSpend,
    factory: workspace.budgetPools.factory - spendSummary.factorySpend,
    governmentFiscal: workspace.budgetPools.governmentFiscal - spendSummary.governmentSpend,
  };

  const locations: Record<DecisionLocationId, DecisionLocationViewModel> = {
    factory: buildFactoryLocation({
      draft,
      remainingFactoryBudget: remainingBudgets.factory,
      techResearchPreview,
      workspace,
    }),
    domestic: buildDomesticLocation({
      draft,
      remainingDomesticBudget: remainingBudgets.domesticMarket,
      workspace,
    }),
    government: buildGovernmentLocation({
      draft,
      fiscalState,
      governmentPointPreview,
      ratioPreview,
      remainingGovernmentBudget: remainingBudgets.governmentFiscal,
      techResearchPreview,
      workspace,
    }),
    military: buildMilitaryLocation({
      draft,
      availableMilitaryPoints: governmentPointPreview.militaryPoints,
      remainingGovernmentBudget: fiscalState.baseGovernmentRemaining,
      workspace,
    }),
    research: buildResearchLocation({
      workspace,
      draft,
      remainingGovernmentBudget: fiscalState.baseGovernmentRemaining,
    }),
  };

  return {
    countryCode: workspace.countryCode,
    countryLabel: workspace.countryLabel,
    activeLocationId: activeStep,
    tabs: DECISION_STEP_ORDER.map((step) => ({
      id: step,
      label: getLocationLabel(step),
    })),
    locations,
  };
}

function buildFactoryLocation({
  workspace,
  draft,
  remainingFactoryBudget,
  techResearchPreview,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingFactoryBudget: number;
  techResearchPreview: ReturnType<typeof calculateTechResearchPreview>;
}): DecisionLocationViewModel {
  const remainingRouteCapacityByRouteId = new Map(
    workspace.routeSummaries.map((summary) => [
      summary.routeId,
      Math.max(
        summary.availableBatchesThisRound
          - getAllocatedProductionBatchesForRoute(draft, workspace.productionOptions, summary.routeId),
        0,
      ),
    ]),
  );

  const productionCards = workspace.productionOptions
    .filter((option) => option.lockedReason === null)
    .map((option) =>
      buildProductionCard(option, draft, {
        remainingFactoryBudget,
        remainingRouteCapacity: remainingRouteCapacityByRouteId.get(option.routeId) ?? 0,
      }),
    );

  const constructionCards = [
    ...workspace.expansionOptions.map((option) => buildExpansionCard(option, draft, remainingFactoryBudget)),
    ...workspace.upgradeOptions.map((option) => buildUpgradeCard(option, draft, remainingFactoryBudget)),
    ...workspace.newFactoryOptions.map((option) => buildNewFactoryCard(option, draft, remainingFactoryBudget)),
  ];

  const factoryTechCards = flattenTechTree(workspace.techTree)
    .filter((tech) => tech.budgetPool === "factory")
    .map((tech) => {
      const queued = draft.governmentPlan.techResearch.some((item) => item.techId === tech.techId);
      const lockedReason = getTechResearchLockedReason(tech, techResearchPreview, workspace);
      const unlockSummary = buildTechUnlockSummary(tech, workspace);

      return {
        id: `technology-${tech.techId}`,
        title: tech.label,
        subtitle: i18n.t("game:commandDeck.factory.factoryBudgetAmount", "工厂预算 {{amount}}", { amount: tech.budgetCost }),
        description: buildTechResearchDescription(tech, lockedReason, workspace, queued),
        badges: unlockSummary ? [unlockSummary] : [],
        metrics: [{ label: i18n.t("game:commandDeck.factory.budgetCost", "预算消耗"), value: `${tech.budgetCost}` }],
        feedback: queued ? i18n.t("game:commandDeck.factory.techQueued", "已加入本轮工业研究队列。") : undefined,
        lockedReason,
        tone: lockedReason ? "locked" : queued || tech.isUnlocked ? "accent" : "default",
        selected: queued || tech.isUnlocked,
        control: {
          kind: "toggle",
          label: tech.label,
          checked: queued || tech.isUnlocked,
          disabled: tech.isUnlocked || (!queued && lockedReason !== null),
        },
        interaction: { type: "technology", techId: tech.techId },
      } satisfies DecisionCardViewModel;
    });

  const lockedGoodsCards = workspace.productionOptions
    .filter((option) => option.lockedReason !== null)
    .map((option) => ({
      id: `locked-${option.goodsId}`,
      title: option.label,
      subtitle: option.routeLabel,
      description: option.usageHint,
      badges: [
        i18n.t("game:commandDeck.factory.domesticPriceBadge", "国内 {{price}}", { price: option.domesticReferencePrice }),
        i18n.t("game:commandDeck.factory.overseasPriceBadge", "海外 {{min}}-{{max}}", { min: option.overseasReferencePriceMin, max: option.overseasReferencePriceMax }),
        formatPriceTrendText(option.priceTrend, option.priceAdjustment),
      ],
      metrics: [],
      lockedReason: option.lockedReason,
      tone: "locked",
      control: { kind: "none" },
    } satisfies DecisionCardViewModel));

  return {
    id: "factory",
    label: i18n.t("game:building.factory", "工业区"),
    eyebrow: i18n.t("game:commandDeck.stepEyebrow", "步骤 {{current}} / 5", { current: 1 }),
    subtitle: i18n.t("game:commandDeck.factory.subtitle", "你的工厂今天需要什么指令？"),
    description: i18n.t("game:commandDeck.factory.description", "安排本轮生产、建设产线，并把工业研究直接挂到工厂预算上。"),
    budgetLabel: i18n.t("game:commandDeck.factory.budgetLabel", "工厂预算"),
    remainingBudget: remainingFactoryBudget,
    summaryPills: [
      `${i18n.t("game:commandDeck.factory.budgetLabel", "工厂预算")} ${remainingFactoryBudget}`,
      i18n.t("game:commandDeck.factory.plannedBatches", "已排产 {{count}} 批", { count: draft.factoryPlan.productionOrders.reduce((sum, item) => sum + item.quantity, 0) }),
      ...workspace.routeSummaries.map((summary) => {
        const allocated = getAllocatedProductionBatchesForRoute(draft, workspace.productionOptions, summary.routeId);
        return `${summary.routeLabel}${i18n.t("game:commandDeck.factory.remainingCapacity", "剩余 {{count}} 批", { count: Math.max(summary.availableBatchesThisRound - allocated, 0) })}`;
      }),
    ],
    sections: [
      {
        id: "production",
        title: i18n.t("game:commandDeck.factory.productionTitle", "本轮生产"),
        description: i18n.t("game:commandDeck.factory.productionDesc", "选择生产批次，预算和共享产能会即时联动。"),
        cards: productionCards,
      },
      {
        id: "construction",
        title: i18n.t("game:commandDeck.factory.constructionTitle", "建设升级"),
        description: i18n.t("game:commandDeck.factory.constructionDesc", "确认后写入本轮草稿，影响下一回合产能。"),
        cards: constructionCards,
      },
      ...(factoryTechCards.length > 0
        ? [
            {
              id: "factory-tech",
              title: i18n.t("game:commandDeck.factory.techTitle", "工业研究"),
              description: i18n.t("game:commandDeck.factory.techDesc", "使用工厂预算解锁新商品和产线。"),
              cards: factoryTechCards,
            },
          ]
        : []),
      ...(lockedGoodsCards.length > 0
        ? [
            {
              id: "locked-goods",
              title: i18n.t("game:commandDeck.factory.lockedGoodsTitle", "未解锁商品"),
              description: i18n.t("game:commandDeck.factory.lockedGoodsDesc", "当前还不能投入生产的商品会集中展示在这里。"),
              cards: lockedGoodsCards,
            },
          ]
        : []),
    ],
  };
}

function formatOptionalNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 100) / 100}`;
}

function sumMarketEffect(
  actions: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"],
  effectKey: (typeof MARKET_PREVIEW_EFFECT_KEYS)[number],
): number {
  return actions.reduce((sum, action) => {
    const value = action.effects?.[effectKey];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

function hasMarketPreviewEffect(action: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"][number]): boolean {
  return MARKET_PREVIEW_EFFECT_KEYS.some((key) => typeof action.effects?.[key] === "number");
}

function buildDomesticLocation({
  workspace,
  draft,
  remainingDomesticBudget,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingDomesticBudget: number;
}): DecisionLocationViewModel {
  const phase1 = workspace.phase1Economy;
  const selectedStrategyIds = new Set(draft.governmentPlan.strategySelections.map((item) => item.actionId));
  const selectedMarketStrategies = workspace.governmentActions.strategies.filter((action) =>
    action.actionId !== "expand_research"
    && selectedStrategyIds.has(action.actionId)
    && hasMarketPreviewEffect(action),
  );
  const selectedCapacityDelta = sumMarketEffect(selectedMarketStrategies, "domesticMarketCapacityDelta");
  const selectedPriceDelta = sumMarketEffect(selectedMarketStrategies, "domesticPriceBonusDelta");
  const selectedEffectSummary = MARKET_PREVIEW_EFFECT_KEYS
    .map((key) => ({ key, value: sumMarketEffect(selectedMarketStrategies, key) }))
    .filter((item) => item.value !== 0);

  const baseCapacity = workspace.domesticMarketCapacity ?? phase1?.domesticDemand;
  const projectedCapacity = baseCapacity != null ? Math.max(0, baseCapacity + selectedCapacityDelta) : undefined;
  const domesticDemand = phase1?.domesticDemand;
  const referencePrice = calculateDecisionMarketReferencePrice(phase1, selectedPriceDelta);

  const previewCards: DecisionCardViewModel[] = [
    {
      id: "market-demand-preview",
      title: i18n.t("game:commandDeck.domestic.demandTitle", "市场需求"),
      subtitle: i18n.t("game:commandDeck.domestic.demandSubtitle", "出售阶段参考"),
      description: i18n.t("game:commandDeck.domestic.demandDesc", "国内需求决定最多能承接多少统一商品；贸易港会按实际投放量重新计算成交价。"),
      badges: [i18n.t("game:commandDeck.domestic.readOnlyPreview", "只读预览")],
      metrics: [
        { label: i18n.t("game:commandDeck.domestic.consumerPower", "民间购买力"), value: remainingDomesticBudget },
        { label: i18n.t("game:commandDeck.domestic.marketDemand", "市场需求"), value: formatOptionalNumber(domesticDemand) },
        { label: i18n.t("game:commandDeck.domestic.capacityCap", "投放上限"), value: formatOptionalNumber(projectedCapacity) },
      ],
      lockedReason: null,
      tone: "default",
      control: { kind: "none" },
    },
    {
      id: "market-price-preview",
      title: i18n.t("game:commandDeck.domestic.priceSource", "价格来源"),
      subtitle: i18n.t("game:commandDeck.domestic.priceSubtitle", "供需定价"),
      description: i18n.t("game:commandDeck.domestic.priceDesc", "均衡价、既有加成和政府市场调节共同形成参考价，最终仍由出售阶段按投放量结算。"),
      badges: [
        i18n.t("game:commandDeck.domestic.equilibriumBadge", "均衡 {{price}}", { price: formatOptionalNumber(referencePrice.basePrice) }),
        i18n.t("game:commandDeck.domestic.existingBonusBadge", "既有加成 {{bonus}}", { bonus: formatSignedValue(referencePrice.existingPriceBonus) }),
        i18n.t("game:commandDeck.domestic.ceilingBadge", "上限 {{ceiling}}", { ceiling: referencePrice.priceCeiling }),
      ],
      metrics: [
        { label: i18n.t("game:commandDeck.domestic.govAdjustment", "政府调节"), value: formatSignedValue(selectedPriceDelta) },
        { label: i18n.t("game:commandDeck.domestic.equilibriumPrice", "均衡参考价"), value: formatOptionalNumber(referencePrice.price) },
        { label: i18n.t("game:commandDeck.domestic.priceCeiling", "价格上限"), value: referencePrice.priceCeiling },
      ],
      lockedReason: null,
      tone: selectedPriceDelta !== 0 ? "accent" : "default",
      control: { kind: "none" },
    },
    {
      id: "market-regulation-preview",
      title: i18n.t("game:commandDeck.domestic.regulationTitle", "本轮政府调节"),
      subtitle: selectedMarketStrategies.length > 0 ? i18n.t("game:commandDeck.domestic.selectedCount", "{{count}} 项已选择", { count: selectedMarketStrategies.length }) : i18n.t("game:commandDeck.domestic.parliamentSelect", "议会厅选择"),
      description: selectedMarketStrategies.length > 0
        ? selectedMarketStrategies.map((action) => action.label).join("、")
        : i18n.t("game:commandDeck.domestic.regulationDefaultDesc", "博览会、消费补贴、进口替代、公共工程、奢侈品推广和商贸枢纽都在议会厅统一决策。"),
      badges: selectedEffectSummary.length > 0
        ? selectedEffectSummary.map((item) => `${MARKET_PREVIEW_EFFECT_LABELS[item.key]} ${formatSignedValue(item.value)}`)
        : [i18n.t("game:commandDeck.domestic.noAdjustment", "暂无调节")],
      metrics: selectedEffectSummary.length > 0
        ? selectedEffectSummary.map((item) => ({
            label: MARKET_PREVIEW_EFFECT_LABELS[item.key],
            value: formatSignedValue(item.value),
          }))
        : [{ label: i18n.t("game:commandDeck.domestic.effect", "影响"), value: i18n.t("game:commandDeck.domestic.useBaseEffects", "使用基础供需和既有效果") }],
      feedback: selectedMarketStrategies.length > 0
        ? i18n.t("game:commandDeck.domestic.regulationFeedback", "这些动作已经写入 governmentPlan.strategySelections，并消耗政府财政。")
        : undefined,
      lockedReason: null,
      tone: selectedMarketStrategies.length > 0 ? "accent" : "default",
      control: { kind: "none" },
    },
  ];

  return {
    id: "domestic",
    label: i18n.t("game:building.domestic", "市民广场"),
    eyebrow: i18n.t("game:commandDeck.stepEyebrow", "步骤 {{current}} / 5", { current: 3 }),
    subtitle: i18n.t("game:commandDeck.domestic.locationSubtitle", "市场需求与价格预览"),
    description: i18n.t("game:commandDeck.domestic.locationDesc", "市民广场只展示内需、承接上限和价格来源；本轮市场调节由议会厅统一执行。"),
    budgetLabel: i18n.t("game:commandDeck.domestic.budgetLabel", "民间购买力"),
    remainingBudget: remainingDomesticBudget,
    summaryPills: [
      i18n.t("game:commandDeck.domestic.pillPurchasingPower", "购买力 {{amount}}", { amount: remainingDomesticBudget }),
      i18n.t("game:commandDeck.domestic.pillDemand", "需求 {{amount}}", { amount: formatOptionalNumber(domesticDemand) }),
      i18n.t("game:commandDeck.domestic.pillCapacity", "投放上限 {{amount}}", { amount: formatOptionalNumber(projectedCapacity) }),
      i18n.t("game:commandDeck.domestic.pillEqPrice", "均衡参考价 {{amount}}", { amount: formatOptionalNumber(referencePrice.price) }),
      i18n.t("game:commandDeck.domestic.pillGovAdjustment", "政府调节 {{count}} 项", { count: selectedMarketStrategies.length }),
    ],
    sections: [
      {
        id: "market-preview",
        title: i18n.t("game:commandDeck.domestic.sectionTitle", "市场预览"),
        description: i18n.t("game:commandDeck.domestic.sectionDesc", "这里不再提供可选动作，出售阶段会按实际投放重算成交价。"),
        cards: previewCards,
      },
    ],
  };
}

function buildGovernmentLocation({
  workspace,
  draft,
  fiscalState,
  remainingGovernmentBudget,
  ratioPreview,
  governmentPointPreview,
  techResearchPreview,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  fiscalState: ReturnType<typeof calculateGovernmentFiscalState>;
  remainingGovernmentBudget: number;
  ratioPreview: ReturnType<typeof calculateRatioPreview>;
  governmentPointPreview: ReturnType<typeof calculateGovernmentPointPreview>;
  techResearchPreview: ReturnType<typeof calculateTechResearchPreview>;
}): DecisionLocationViewModel {
  const selectedStrategyIds = new Set(draft.governmentPlan.strategySelections.map((item) => item.actionId));
  const selectedMarketStrategies = workspace.governmentActions.strategies.filter((action) =>
    action.actionId !== "expand_research"
    && selectedStrategyIds.has(action.actionId)
    && hasMarketPreviewEffect(action),
  );
  const selectedCapacityDelta = sumMarketEffect(selectedMarketStrategies, "domesticMarketCapacityDelta");
  const selectedPriceDelta = sumMarketEffect(selectedMarketStrategies, "domesticPriceBonusDelta");
  const selectedOverseasCapacityDelta = sumMarketEffect(selectedMarketStrategies, "overseasMarketCapacityDelta");
  const selectedEffectSummary = MARKET_PREVIEW_EFFECT_KEYS
    .map((key) => ({ key, value: sumMarketEffect(selectedMarketStrategies, key) }))
    .filter((item) => item.value !== 0);
  const phase1 = workspace.phase1Economy;
  const baseDomesticCapacity = workspace.domesticMarketCapacity ?? phase1?.domesticDemand;
  const projectedDomesticCapacity = baseDomesticCapacity != null
    ? Math.max(0, baseDomesticCapacity + selectedCapacityDelta)
    : undefined;
  const projectedOverseasCapacity = workspace.overseasMarketCapacity != null
    ? Math.max(0, workspace.overseasMarketCapacity + selectedOverseasCapacityDelta)
    : undefined;
  const domesticDemand = phase1?.domesticDemand;
  const referencePrice = calculateDecisionMarketReferencePrice(phase1, selectedPriceDelta);
  const marketPreviewCards: DecisionCardViewModel[] = [
    {
      id: "government-market-baseline",
      title: i18n.t("game:commandDeck.government.marketBaselineTitle", "市场基线"),
      subtitle: i18n.t("game:commandDeck.government.marketBaselineSubtitle", "国内承接与供需价格"),
      description: i18n.t("game:commandDeck.government.marketBaselineDesc", "政府市场调节会直接改变本轮国内承接量和均衡参考价，出售阶段仍按实际投放重新定价。"),
      badges: [
        i18n.t("game:commandDeck.government.demandBadge", "需求 {{amount}}", { amount: formatOptionalNumber(domesticDemand) }),
        i18n.t("game:commandDeck.government.baseCapacityBadge", "基础承接 {{amount}}", { amount: formatOptionalNumber(baseDomesticCapacity) }),
        i18n.t("game:commandDeck.government.priceCeilingBadge", "价格上限 {{ceiling}}", { ceiling: referencePrice.priceCeiling }),
      ],
      metrics: [
        { label: i18n.t("game:commandDeck.government.capacityCap", "投放上限"), value: formatOptionalNumber(projectedDomesticCapacity) },
        { label: referencePrice.isCapped ? i18n.t("game:commandDeck.government.eqPriceCapped", "均衡参考价已封顶") : i18n.t("game:commandDeck.government.eqPrice", "均衡参考价"), value: formatOptionalNumber(referencePrice.price) },
        { label: i18n.t("game:commandDeck.government.priceAdjustment", "政府价格调节"), value: formatSignedValue(selectedPriceDelta) },
      ],
      lockedReason: null,
      tone: selectedMarketStrategies.length > 0 ? "accent" : "default",
      control: { kind: "none" },
    },
    {
      id: "government-market-effects",
      title: i18n.t("game:commandDeck.government.regulationResultTitle", "本轮调节结果"),
      subtitle: selectedMarketStrategies.length > 0 ? i18n.t("game:commandDeck.government.selectedCount", "{{count}} 项已选择", { count: selectedMarketStrategies.length }) : i18n.t("game:commandDeck.government.noRegulation", "未选择调节"),
      description: selectedMarketStrategies.length > 0
        ? selectedMarketStrategies.map((action) => action.label).join("、")
        : i18n.t("game:commandDeck.government.noRegulationDesc", "暂不执行市场调节时，贸易港只使用基础供需、既有效果和实际投放结算。"),
      badges: selectedEffectSummary.length > 0
        ? selectedEffectSummary.map((item) => `${MARKET_PREVIEW_EFFECT_LABELS[item.key]} ${formatSignedValue(item.value)}`)
        : [i18n.t("game:commandDeck.government.baseSupplyDemand", "基础供需")],
      metrics: [
        { label: i18n.t("game:commandDeck.government.domesticCapacityChange", "国内容量变化"), value: formatSignedValue(selectedCapacityDelta) },
        { label: i18n.t("game:commandDeck.government.peaceExport", "和平外销"), value: formatOptionalNumber(projectedOverseasCapacity) },
        { label: i18n.t("game:commandDeck.government.overseasCapacityChange", "外销容量变化"), value: formatSignedValue(selectedOverseasCapacityDelta) },
      ],
      lockedReason: null,
      tone: selectedMarketStrategies.length > 0 ? "accent" : "default",
      control: { kind: "none" },
    },
  ];
  const selectedAbility = workspace.nationalAbility && draft.abilitySelection?.abilityId === workspace.nationalAbility.abilityId
    ? draft.abilitySelection
    : null;

  const strategyCards = workspace.governmentActions.strategies
    .filter((action) => action.actionId !== "expand_research")
    .map((action) => {
      const selected = selectedStrategyIds.has(action.actionId);
      const nextBaseFiscalSpend = fiscalState.baseFiscalSpend + action.cost;
      const lockedReason = action.lockedReason ?? (
        !selected && nextBaseFiscalSpend > fiscalState.baseGovernmentBudget ? i18n.t("game:commandDeck.government.marketRegulationInsufficient", "政府财政不足") : null
      );

      const govEffectMetrics = buildEffectMetrics(action.effects);
      const govExtraMetrics = govEffectMetrics
        .filter((em) => ![i18n.t("game:common.techPoints", "科技点"), i18n.t("game:common.militaryPoints", "军事点")].includes(em.label))
        .map((em) => ({ label: em.label, value: em.value }));
      const effectBadges = govExtraMetrics.length > 0
        ? govExtraMetrics.map((metric) => `${metric.label} ${metric.value}`)
        : [i18n.t("game:commandDeck.government.oneTimeStrategy", "一次性策略")];

      return {
        id: `strategy-${action.actionId}`,
        title: action.label,
        subtitle: i18n.t("game:commandDeck.government.marketRegulationCost", "市场调节 {{cost}}", { cost: action.cost }),
        description: action.description,
        badges: Object.keys(action.ratioDelta ?? {}).length > 0
          ? [formatRatioDeltaSummary(action.ratioDelta ?? {})]
          : effectBadges,
        metrics: [
          { label: i18n.t("game:commandDeck.government.fiscalCost", "财政消耗"), value: action.cost },
          ...(action.militaryPointDelta ? [{ label: i18n.t("game:commandDeck.government.militaryPointChange", "军事点变化"), value: action.militaryPointDelta }] : []),
          ...govExtraMetrics,
        ],
        feedback: selected ? i18n.t("game:commandDeck.government.strategyFeedback", "已纳入本轮政府政策，财政 -{{cost}}。", { cost: action.cost }) : undefined,
        lockedReason,
        tone: lockedReason && !selected ? "locked" : selected ? "accent" : "default",
        selected,
        control: {
          kind: "toggle",
          label: action.label,
          checked: selected,
          disabled: !selected && lockedReason !== null,
        },
        interaction: { type: "governmentStrategy", actionId: action.actionId },
      } satisfies DecisionCardViewModel;
    });

  const governmentTechCards = flattenTechTree(workspace.techTree)
    .filter((tech) => tech.budgetPool === "governmentFiscal")
    .map((tech) => {
      const queued = draft.governmentPlan.techResearch.some((item) => item.techId === tech.techId);
      const lockedReason = getTechResearchLockedReason(tech, techResearchPreview, workspace);
      const unlockSummary = buildTechUnlockSummary(tech, workspace);

      return {
        id: `technology-${tech.techId}`,
        title: tech.label,
        subtitle: i18n.t("game:commandDeck.government.govBudgetAmount", "政府预算 {{amount}}", { amount: tech.budgetCost }),
        description: buildTechResearchDescription(tech, lockedReason, workspace, queued),
        badges: unlockSummary ? [unlockSummary] : [],
        metrics: [{ label: i18n.t("game:commandDeck.factory.budgetCost", "预算消耗"), value: `${tech.budgetCost}` }],
        feedback: queued ? i18n.t("game:commandDeck.government.techQueued", "已加入本轮政策研究队列。") : undefined,
        lockedReason,
        tone: lockedReason ? "locked" : queued || tech.isUnlocked ? "accent" : "default",
        selected: queued || tech.isUnlocked,
        control: {
          kind: "toggle",
          label: tech.label,
          checked: queued || tech.isUnlocked,
          disabled: tech.isUnlocked || (!queued && lockedReason !== null),
        },
        interaction: { type: "technology", techId: tech.techId },
      } satisfies DecisionCardViewModel;
    });

  const abilityCards = workspace.nationalAbility
    ? [
        {
          id: `ability-${workspace.nationalAbility.abilityId}`,
          title: workspace.nationalAbility.label,
          subtitle: workspace.nationalAbility.isAvailable ? i18n.t("game:commandDeck.government.nationalAbility", "国家专属能力") : i18n.t("game:commandDeck.government.abilityUsed", "本局已使用"),
          description: workspace.nationalAbility.description,
          badges: workspace.nationalAbility.requiresTargetIdeology ? [i18n.t("game:commandDeck.government.needsIdeologyTarget", "需要选择意识形态目标")] : [i18n.t("game:commandDeck.government.instantEffect", "即时生效")],
          metrics: [
            { label: i18n.t("game:commandDeck.government.ratioPreview", "比例预告"), value: formatRatio(ratioPreview) },
            { label: i18n.t("game:commandDeck.government.fiscalRemaining", "财政剩余"), value: remainingGovernmentBudget },
          ],
          feedback: selectedAbility ? i18n.t("game:commandDeck.government.abilityFeedback", "本轮会一起提交国家能力。") : undefined,
          lockedReason: workspace.nationalAbility.isAvailable ? null : i18n.t("game:commandDeck.government.abilityUsed", "本局已使用"),
          tone: selectedAbility ? "accent" : workspace.nationalAbility.isAvailable ? "default" : "locked",
          selected: Boolean(selectedAbility),
          control: {
            kind: "toggle",
            label: i18n.t("game:commandDeck.government.enableAbility", "启用国家能力：{{label}}", { label: workspace.nationalAbility.label }),
            checked: Boolean(selectedAbility),
            disabled: !workspace.nationalAbility.isAvailable,
          },
          interaction: { type: "ability", abilityId: workspace.nationalAbility.abilityId },
        } satisfies DecisionCardViewModel,
      ]
    : [];

  const reforms = workspace.governmentReforms;
  const queuedReformIds = new Set(draft.reforms ?? []);
  const queuedActivatePolicyIds = new Set(draft.activatePolicies ?? []);
  const queuedDeactivatePolicyIds = new Set(draft.deactivatePolicies ?? []);

  const reformCards: DecisionCardViewModel[] = (reforms?.availableReforms ?? []).map((reform) => {
    const queued = queuedReformIds.has(reform.reformId);
    const pathLabel = reform.path === "freedom" ? i18n.t("game:government.reformPath.freedomRoad", "自由之路") : reform.path === "equality" ? i18n.t("game:government.reformPath.equalityRoad", "平等之路") : i18n.t("game:government.reformPath.nationalRoad", "民族之路");
    const lockedReason = reform.isCompleted
      ? i18n.t("game:government.statusCompleted", "已完成")
      : reform.isBlocked
        ? i18n.t("game:government.statusBlockedByOther", "被其他改革路径锁定")
        : null;
    return {
      id: `reform-${reform.reformId}`,
      title: reform.label,
      subtitle: i18n.t("game:commandDeck.government.reformSubtitle", "{{path}} · 行政力 {{adminCost}}", { path: pathLabel, adminCost: reform.adminCost }),
      description: lockedReason ?? i18n.t("game:commandDeck.government.reformDesc", "消耗 {{adminCost}} 行政力推动「{{path}}」。", { adminCost: reform.adminCost, path: pathLabel }),
      badges: [pathLabel],
      metrics: [{ label: i18n.t("game:commandDeck.government.adminPower", "行政力"), value: reform.adminCost }],
      feedback: queued ? i18n.t("game:commandDeck.government.reformQueued", "已加入本轮改革排队。") : undefined,
      lockedReason,
      tone: lockedReason ? "locked" : queued ? "accent" : "default",
      selected: queued || reform.isCompleted,
      control: {
        kind: "toggle",
        label: reform.label,
        checked: queued,
        disabled: reform.isCompleted || reform.isBlocked,
      },
      interaction: { type: "reform", reformId: reform.reformId },
    } satisfies DecisionCardViewModel;
  });

  const policyCards: DecisionCardViewModel[] = (reforms?.availablePolicies ?? []).map((policy) => {
    const queuedActivate = queuedActivatePolicyIds.has(policy.policyId);
    const queuedDeactivate = queuedDeactivatePolicyIds.has(policy.policyId);
    const willBeActive = queuedActivate || (policy.isActive && !queuedDeactivate);
    const lockedReason = !policy.isUnlocked && !policy.isActive
      ? policy.requiresReform
        ? i18n.t("game:commandDeck.government.policyRequiresReform", "需先完成改革：{{reform}}", { reform: getReformLabel(policy.requiresReform) })
        : i18n.t("game:commandDeck.government.policyNotUnlocked", "未解锁")
      : null;
    const subtitle = formatPolicyCostSummary(policy);
    return {
      id: `policy-${policy.policyId}`,
      title: policy.label,
      subtitle,
      description: policy.description ?? (willBeActive ? i18n.t("game:commandDeck.government.policySelectedThisRound", "本轮已选") : i18n.t("game:commandDeck.government.policyActivatable", "可激活")),
      badges: [
        willBeActive
          ? i18n.t("game:commandDeck.government.policySelectedThisRound", "本轮已选")
          : i18n.t("game:commandDeck.government.policyNotSelected", "未选择"),
      ],
      metrics: buildPolicyCostMetrics(policy),
      feedback: queuedActivate
        ? i18n.t("game:commandDeck.government.policyQueuedActivate", "已排入本轮激活。")
        : queuedDeactivate
          ? i18n.t("game:commandDeck.government.policyQueuedDeactivate", "已排入本轮停用。")
          : undefined,
      lockedReason,
      tone: lockedReason && !willBeActive ? "locked" : willBeActive ? "accent" : "default",
      selected: willBeActive,
      control: {
        kind: "toggle",
        label: policy.label,
        checked: willBeActive,
        disabled: lockedReason !== null && !willBeActive,
      },
      interaction: { type: "policy", policyId: policy.policyId },
    } satisfies DecisionCardViewModel;
  });

  return {
    id: "government",
    label: i18n.t("game:commandDeck.government.locationLabel", "议会厅"),
    eyebrow: i18n.t("game:commandDeck.stepEyebrow", "步骤 {{current}} / 5", { current: 2 }),
    subtitle: i18n.t("game:commandDeck.government.locationSubtitle", "帝国的政治方向"),
    description: i18n.t("game:commandDeck.government.locationDesc", "市场调节、政治策略、政策研究与国家能力共用政府财政。"),
    budgetLabel: i18n.t("game:commandDeck.government.budgetLabel", "政府财政"),
    remainingBudget: remainingGovernmentBudget,
    summaryPills: [
      i18n.t("game:commandDeck.government.pillBudget", "政府预算 {{amount}}", { amount: remainingGovernmentBudget }),
      i18n.t("game:commandDeck.government.pillRatioPreview", "比例预告 {{ratio}}", { ratio: formatRatio(ratioPreview) }),
      i18n.t("game:commandDeck.government.pillMarketPreview", "市场 需求 {{demand}} · 承接 {{capacity}} · 均衡价 {{price}}", { demand: formatOptionalNumber(domesticDemand), capacity: formatOptionalNumber(projectedDomesticCapacity), price: formatOptionalNumber(referencePrice.price) }),
      i18n.t("game:commandDeck.government.pillMilitaryPoints", "军事点 {{points}}", { points: governmentPointPreview.militaryPoints }),
      i18n.t("game:commandDeck.government.pillAbilityStatus", "国家能力 {{status}}", { status: selectedAbility ? i18n.t("game:commandDeck.government.enabled", "已启用") : i18n.t("game:commandDeck.government.notEnabled", "未启用") }),
    ],
    sections: [
      {
        id: "government-market-preview",
        title: i18n.t("game:commandDeck.government.marketBaselineSectionTitle", "市场基线"),
        description: i18n.t("game:commandDeck.government.marketBaselineSectionDesc", "这些数值已经并入议会厅；选择市场调节后会直接改变同一组预览。"),
        cards: marketPreviewCards,
      },
      {
        id: "government-strategy",
        title: i18n.t("game:commandDeck.government.marketRegulationSectionTitle", "市场调节"),
        description: i18n.t("game:commandDeck.government.marketRegulationSectionDesc", "本回合一次性调节市场承接、售价或海外容量，统一消耗政府财政。"),
        cards: strategyCards,
      },
      ...(governmentTechCards.length > 0
        ? [
            {
              id: "government-tech",
              title: i18n.t("game:commandDeck.government.policyResearchTitle", "政策研究"),
              description: i18n.t("game:commandDeck.government.policyResearchDesc", "使用政府预算推进政治科技链。"),
              cards: governmentTechCards,
            },
          ]
        : []),
      ...(abilityCards.length > 0
        ? [
            {
              id: "government-ability",
              title: i18n.t("game:commandDeck.government.abilitySectionTitle", "国家能力卡"),
              description: i18n.t("game:commandDeck.government.abilitySectionDesc", "国家专属能力不再和普通策略混排。"),
              cards: abilityCards,
            },
          ]
        : []),
      ...(reformCards.length > 0
        ? [
            {
              id: "government-reform",
              title: i18n.t("game:commandDeck.government.reformSectionTitle", "政治改革"),
              description: i18n.t("game:commandDeck.government.reformSectionDesc", "消耗行政力推动制度改革。已完成的改革会解锁新政策。"),
              cards: reformCards,
            },
          ]
        : []),
      ...(policyCards.length > 0
        ? [
            {
              id: "government-policy",
              title: i18n.t("game:commandDeck.government.policySectionTitle", "国家政策"),
              description: i18n.t("game:commandDeck.government.policySectionDesc", "激活或停用已解锁的政策。每项激活的政策每回合消耗行政力。"),
              cards: policyCards,
            },
          ]
        : []),
    ],
  };
}

function buildMilitaryLocation({
  workspace,
  draft,
  availableMilitaryPoints,
  remainingGovernmentBudget,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  availableMilitaryPoints: number;
  remainingGovernmentBudget: number;
}): DecisionLocationViewModel {
  const militaryWorkspace = workspace.militaryWorkspace;
  const colonizationCapability = militaryWorkspace.colonizationCapability;
  const getMilitarySelectionCount = (actionId: string) =>
    draft.militaryPlan.militaryActions.filter((item) => item.actionId === actionId).length;
  const selectedMilitaryPointSpend = draft.militaryPlan.militaryActions.reduce((sum, selection) => {
    const action = militaryWorkspace.availableMilitaryActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const selectedColonizationPointSpend = draft.militaryPlan.colonizationActions.length
    * colonizationCapability.budgetCost;
  const remainingMilitaryPoints = Math.max(
    0,
    availableMilitaryPoints - selectedMilitaryPointSpend - selectedColonizationPointSpend,
  );

  const navalCards = militaryWorkspace.availableMilitaryActions
    .filter((action) => action.actionId === "naval_drill")
    .map((action) => buildMilitaryActionCard(action, getMilitarySelectionCount(action.actionId), remainingMilitaryPoints));

  const armyCards = militaryWorkspace.availableMilitaryActions
    .filter((action) => action.actionId === "recruit_infantry" || action.actionId === "train_artillery")
    .map((action) => buildMilitaryActionCard(action, getMilitarySelectionCount(action.actionId), remainingMilitaryPoints));

  const supportCards = militaryWorkspace.availableMilitaryActions
    .filter((action) => action.actionId !== "naval_drill" && action.actionId !== "recruit_infantry" && action.actionId !== "train_artillery")
    .map((action) => buildMilitaryActionCard(action, getMilitarySelectionCount(action.actionId), remainingMilitaryPoints));

  const diplomacyCards = militaryWorkspace.availableDiplomacyActions.map((action) => {
    const selected = draft.militaryPlan.diplomacyActions.some((item) => item.actionId === action.actionId);
    const lockedReason = action.isEstablished
      ? i18n.t("game:commandDeck.military.diplomacyAlreadyEstablished", "该区域已经建交")
      : !selected && remainingGovernmentBudget < action.cost
        ? i18n.t("game:commandDeck.military.insufficientBudget", "政府预算不足")
        : null;

    return {
      id: `diplomacy-${action.actionId}`,
      title: action.label,
      subtitle: i18n.t("game:commandDeck.military.govBudget", "政府预算 {{cost}}", { cost: action.cost }),
      description: buildMilitaryActionDescription(action),
      badges: [action.targetRegionLabel],
      metrics: [
        { label: i18n.t("game:commandDeck.military.currentStatus", "当前状态"), value: action.isEstablished ? i18n.t("game:commandDeck.military.statusEstablished", "已建交") : selected ? i18n.t("game:commandDeck.military.statusPending", "待提交") : i18n.t("game:commandDeck.military.statusAvailable", "可发起") },
        { label: i18n.t("game:commandDeck.military.fiscalCost", "财政消耗"), value: action.cost },
      ],
      feedback: action.isEstablished
        ? i18n.t("game:military.diplomacyAlreadyEstablished", "该区域已经完成建交，本轮不能重复提交。")
        : selected
          ? i18n.t("game:commandDeck.military.diplomacyPlanned", "已纳入本轮建交计划。")
          : undefined,
      lockedReason,
      tone: action.isEstablished ? "locked" : selected ? "accent" : "default",
      selected,
      control: {
        kind: "confirm",
        mode: "toggle",
        confirmed: selected,
        confirmLabel: action.label,
        cancelLabel: i18n.t("game:commandDeck.military.cancelAction", "取消{{label}}", { label: action.label }),
        disabled: action.isEstablished || (!selected && remainingGovernmentBudget < action.cost),
      },
      interaction: { type: "diplomacyAction", actionId: action.actionId },
    } satisfies DecisionCardViewModel;
  });

  const unlockSelected = draft.militaryPlan.unlockColonization;
  const previewIsUnlocked = colonizationCapability.isUnlocked || unlockSelected;
  const previewEstablishedDiplomacy = new Set([
    ...militaryWorkspace.establishedDiplomacy,
    ...militaryWorkspace.availableDiplomacyActions
      .filter((action) => draft.militaryPlan.diplomacyActions.some((selection) => selection.actionId === action.actionId))
      .map((action) => action.targetRegion),
  ]);
  const unlockLockedReason = colonizationCapability.isUnlocked
    ? i18n.t("game:commandDeck.military.colonizationUnlocked", "已永久解锁")
    : !unlockSelected && remainingGovernmentBudget < colonizationCapability.unlockCost
      ? i18n.t("game:commandDeck.military.insufficientBudget", "政府预算不足")
      : null;

  const colonizationUnlockCard: DecisionCardViewModel = {
    id: "colonization-unlock",
    title: i18n.t("game:commandDeck.military.colonizationUnlockTitle", "殖民扩张"),
    subtitle: i18n.t("game:commandDeck.military.govBudget", "政府预算 {{cost}}", { cost: colonizationCapability.unlockCost }),
    description: i18n.t("game:commandDeck.military.colonizationUnlockDesc", "支付 {{cost}} 政府财政，永久获得殖民能力。之后每次殖民仅消耗 {{mp}} 军事点。", { cost: colonizationCapability.unlockCost, mp: colonizationCapability.budgetCost }),
    badges: [
      i18n.t("game:commandDeck.military.colonyIncomeBonus", "每殖民地 +{{income}} 国家收入", { income: colonizationCapability.incomePerColonyPerRound }),
      i18n.t("game:commandDeck.military.maxColoniesPerRound", "每回合最多 {{max}} 个目标", { max: colonizationCapability.maxColonizationsPerRound }),
    ],
    metrics: [
      { label: i18n.t("game:commandDeck.military.currentStatus", "当前状态"), value: colonizationCapability.isUnlocked ? i18n.t("game:commandDeck.military.statusPermanentlyUnlocked", "已永久解锁") : unlockSelected ? i18n.t("game:commandDeck.military.statusPendingUnlock", "待本轮解锁") : i18n.t("game:commandDeck.military.statusNotUnlocked", "未解锁") },
      { label: i18n.t("game:commandDeck.military.fiscalCost", "财政消耗"), value: colonizationCapability.unlockCost },
    ],
    feedback: colonizationCapability.isUnlocked
      ? i18n.t("game:commandDeck.military.colonizationPermanentlyUnlocked", "本局已经完成永久解锁。")
      : unlockSelected
        ? i18n.t("game:commandDeck.military.colonizationPlanned", "已纳入本轮永久解锁计划。")
        : undefined,
    lockedReason: unlockLockedReason,
    tone: colonizationCapability.isUnlocked ? "locked" : unlockSelected ? "accent" : "default",
    selected: colonizationCapability.isUnlocked || unlockSelected,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed: colonizationCapability.isUnlocked || unlockSelected,
      confirmLabel: i18n.t("game:commandDeck.military.confirmUnlockColonization", "解锁殖民扩张"),
      cancelLabel: i18n.t("game:commandDeck.military.cancelUnlockColonization", "取消解锁殖民扩张"),
      disabled: colonizationCapability.isUnlocked || (!unlockSelected && remainingGovernmentBudget < colonizationCapability.unlockCost),
      revokeDisabled: colonizationCapability.isUnlocked || !unlockSelected,
    },
    interaction: { type: "colonizationUnlock" },
  };

  const colonizationCards = militaryWorkspace.colonizationOptions.map((option) => {
    const selected = draft.militaryPlan.colonizationActions.some((item) => item.targetRegionId === option.regionId);
    const previewHasDiplomacy = previewEstablishedDiplomacy.has(option.regionId);
    const previewHasMilitary = selected || remainingMilitaryPoints >= colonizationCapability.budgetCost;
    const previewCanColonize = !option.isColonized && previewIsUnlocked && previewHasDiplomacy && previewHasMilitary;
    const previewLockedReason = option.isColonized
      ? i18n.t("game:commandDeck.military.regionAlreadyColonized", "该区域已经被殖民")
      : !previewIsUnlocked
        ? i18n.t("game:commandDeck.military.needUnlockColonization", "需先永久解锁殖民扩张")
        : !previewHasDiplomacy
          ? i18n.t("game:commandDeck.military.needDiplomacyFirst", "需先建交")
          : !previewHasMilitary
            ? i18n.t("game:commandDeck.military.needMilitaryPoints", "需要{{mp}}军事点", { mp: colonizationCapability.budgetCost })
            : null;
    return {
      id: `colonization-${option.regionId}`,
      title: option.regionLabel,
      subtitle: option.isColonized ? i18n.t("game:commandDeck.military.statusColonized", "已殖民") : selected ? i18n.t("game:commandDeck.military.statusPending", "待提交") : previewLockedReason ?? i18n.t("game:commandDeck.military.statusCanColonize", "可殖民"),
      description: option.isColonized
        ? i18n.t("game:commandDeck.military.regionColonizedDesc", "{{label}} 已经进入殖民状态。", { label: option.regionLabel })
        : i18n.t("game:commandDeck.military.colonizeDesc", "执行殖民消耗 {{mp}} 军事点；结算时每回合增加 {{income}} 国家收入。", { mp: colonizationCapability.budgetCost, income: colonizationCapability.incomePerColonyPerRound }),
      badges: [option.isColonized ? i18n.t("game:commandDeck.military.statusColonized", "已殖民") : i18n.t("game:commandDeck.military.colonizeTarget", "殖民目标")],
      metrics: [
        { label: i18n.t("game:commandDeck.military.status", "状态"), value: option.isColonized ? i18n.t("game:commandDeck.military.statusColonized", "已殖民") : selected ? i18n.t("game:commandDeck.military.statusPending", "待提交") : previewLockedReason ?? i18n.t("game:commandDeck.military.statusCanColonize", "可殖民") },
        { label: i18n.t("game:commandDeck.military.militaryCost", "军事消耗"), value: i18n.t("game:commandDeck.military.points", "{{count}} 点", { count: colonizationCapability.budgetCost }) },
      ],
      feedback: selected ? i18n.t("game:commandDeck.military.colonizePlanned", "已纳入本轮殖民目标。") : undefined,
      lockedReason: selected ? null : previewLockedReason,
      tone: option.isColonized ? "locked" : selected ? "accent" : previewCanColonize ? "default" : "locked",
      selected,
      control: {
        kind: "confirm",
        mode: "toggle",
        confirmed: selected,
        confirmLabel: i18n.t("game:commandDeck.military.confirmColonize", "殖民{{label}}", { label: option.regionLabel }),
        cancelLabel: i18n.t("game:commandDeck.military.cancelColonize", "取消殖民{{label}}", { label: option.regionLabel }),
        disabled: option.isColonized || (!selected && !previewCanColonize),
        revokeDisabled: !selected,
      },
      interaction: { type: "colonizationTarget", targetRegionId: option.regionId },
    } satisfies DecisionCardViewModel;
  });

  const regionCards = militaryWorkspace.regionAccessStatus.map((status) => ({
    id: `region-${status.regionId}`,
    title: status.label,
    subtitle: status.isAccessible ? i18n.t("game:commandDeck.military.regionAccessible", "当前可进入") : i18n.t("game:commandDeck.military.regionRestricted", "当前仍受限"),
    description: buildRegionAccessDescription(status),
    badges: status.acceptedGoods.map(getGoodsLabel),
    metrics: [
      { label: i18n.t("game:commandDeck.military.accessLevel", "准入等级"), value: getRegionAccessLevelLabel(status.accessLevel) },
      { label: i18n.t("game:commandDeck.military.diplomacyStatus", "外交状态"), value: status.isDiplomacyEstablished ? i18n.t("game:commandDeck.military.statusEstablished", "已建交") : i18n.t("game:commandDeck.military.statusNotEstablished", "未建交") },
    ],
    tone: status.isAccessible ? "accent" : "locked",
    lockedReason: status.isAccessible ? null : i18n.t("game:commandDeck.military.needDiplomacyOrMilitary", "需要建交或提升军事点"),
    control: { kind: "none" },
  } satisfies DecisionCardViewModel));

  return {
    id: "military",
    label: i18n.t("game:commandDeck.military.locationLabel", "军事要塞"),
    eyebrow: i18n.t("game:commandDeck.stepEyebrow", "步骤 {{current}} / 5", { current: 4 }),
    subtitle: i18n.t("game:commandDeck.military.locationSubtitle", "海军、陆军、外交与殖民执行"),
    description: i18n.t("game:commandDeck.military.locationDesc", "殖民被拆成永久能力解锁与区域执行两层，外交是殖民前置，殖民收益在结算阶段并入国家收入。"),
    budgetLabel: i18n.t("game:commandDeck.military.budgetLabel", "军事点"),
    remainingBudget: remainingMilitaryPoints,
    summaryPills: [
      i18n.t("game:commandDeck.military.pillFiscalRemaining", "财政剩余 {{amount}}", { amount: remainingGovernmentBudget }),
      i18n.t("game:commandDeck.military.pillMilitaryPointsAvailable", "军事点可用 {{amount}}", { amount: availableMilitaryPoints }),
      i18n.t("game:commandDeck.military.pillMilitaryPointsRemaining", "军事点余量 {{amount}}", { amount: remainingMilitaryPoints }),
      i18n.t("game:commandDeck.military.pillOverseasCapacity", "海外承接 {{amount}}", { amount: militaryWorkspace.overseasCapacity }),
      i18n.t("game:commandDeck.military.pillDiplomacyCount", "已建交 {{count}} 区", { count: militaryWorkspace.establishedDiplomacy.length }),
      i18n.t("game:commandDeck.military.pillControlledRegions", "控制区域 {{regions}}", { regions: militaryWorkspace.controlledRegions }),
      i18n.t("game:commandDeck.military.pillColonizationStatus", "殖民能力 {{status}}", { status: previewIsUnlocked ? (colonizationCapability.isUnlocked ? i18n.t("game:commandDeck.military.unlocked", "已解锁") : i18n.t("game:commandDeck.military.pendingUnlock", "待解锁")) : i18n.t("game:commandDeck.military.notUnlocked", "未解锁") }),
    ],
    sections: [
      {
        id: "military-regions",
        title: i18n.t("game:commandDeck.military.regionStatusTitle", "海外区域状态"),
        description: i18n.t("game:commandDeck.military.regionStatusDesc", "先判断市场准入与外交状态，再决定建交、解锁或殖民。"),
        cards: regionCards,
      },
      ...(navalCards.length > 0
        ? [
            {
              id: "navy",
              title: i18n.t("game:commandDeck.military.navalTitle", "海军建设"),
              description: i18n.t("game:commandDeck.military.navalDesc", "优先提高海外承接与投送能力。"),
              cards: navalCards,
            },
          ]
        : []),
      ...(armyCards.length > 0
        ? [
            {
              id: "army",
              title: i18n.t("game:commandDeck.military.armyTitle", "陆军征募"),
              description: i18n.t("game:commandDeck.military.armyDesc", "补充陆军兵力与重武器。"),
                cards: armyCards,
              },
            ]
          : []),
      ...((supportCards.length > 0 || diplomacyCards.length > 0)
        ? [
            {
              id: "diplomacy-support",
              title: i18n.t("game:commandDeck.military.diplomacySupportTitle", "外交行动 / 军事支援"),
              description: i18n.t("game:commandDeck.military.diplomacySupportDesc", "建交提供永久准入，其它军事动作负责补充本轮力量与海外投送。"),
              cards: [...supportCards, ...diplomacyCards],
            },
          ]
        : []),
      {
        id: "colonization-unlock",
        title: i18n.t("game:commandDeck.military.colonizationExpansionTitle", "殖民扩张"),
        description: i18n.t("game:commandDeck.military.colonizationExpansionDesc", "先买下永久能力，再从已建交区域里选择本轮唯一殖民目标。"),
        cards: [colonizationUnlockCard],
      },
      ...(colonizationCards.length > 0
        ? [
            {
              id: "colonization-targets",
              title: i18n.t("game:commandDeck.military.colonizationTargetsTitle", "殖民目标"),
              description: i18n.t("game:commandDeck.military.colonizationTargetsDesc", "区域列表只负责执行态选择，不再重复收取财政成本。"),
              cards: colonizationCards,
            },
          ]
        : []),
    ],
  };
}

function buildResearchLocation({
  workspace,
  draft,
  remainingGovernmentBudget,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
}): DecisionLocationViewModel {
  const { chains, researchFacilities, facilityCost, progressPerFacility, activeResearch } = workspace.techTree;
  const breakthroughDieSides = workspace.techTree.breakthroughDieSides ?? 10;
  const selectedTechIds = new Set(draft.governmentPlan.techResearch.map((item) => item.techId));
  const facilitySelected = draft.governmentPlan.strategySelections.some((selection) => selection.actionId === "expand_research");
  const activeTech = activeResearch
    ? chains.flatMap((chain) => chain.techs).find((tech) => tech.techId === activeResearch)
    : null;
  const perTurnProgress = researchFacilities * progressPerFacility;
  const plannedFacilities = researchFacilities + (facilitySelected ? 1 : 0);
  const plannedPerTurnProgress = plannedFacilities * progressPerFacility;

  const facilityCard: DecisionCardViewModel = {
    id: "research-facility",
    title: i18n.t("game:commandDeck.research.buildFacilityTitle", "建立研究院"),
    subtitle: i18n.t("game:commandDeck.research.govBudget", "政府财政 {{cost}}", { cost: facilityCost }),
    description: i18n.t("game:commandDeck.research.buildFacilityDesc", "消耗政府财政建设研究设施。设施越多，当前研究每回合推进越快；进度达有效阈值后，结算时掷突破骰。"),
    badges: facilitySelected ? [i18n.t("game:commandDeck.research.buildThisRound", "本轮建设")] : [i18n.t("game:commandDeck.research.longTermInvestment", "长期投入")],
    metrics: [
      { label: i18n.t("game:commandDeck.research.existingFacilities", "现有设施"), value: i18n.t("game:commandDeck.research.facilitiesCount", "{{count}} 所", { count: researchFacilities }) },
      { label: i18n.t("game:commandDeck.research.currentProgress", "当前进度"), value: i18n.t("game:commandDeck.research.perTurn", "{{progress}}/回合", { progress: perTurnProgress }) },
      { label: i18n.t("game:commandDeck.research.afterBuild", "建成后"), value: i18n.t("game:commandDeck.research.perTurn", "{{progress}}/回合", { progress: plannedPerTurnProgress }) },
      { label: i18n.t("game:commandDeck.research.breakthroughDie", "突破骰"), value: `1D${breakthroughDieSides}` },
    ],
    feedback: facilitySelected ? i18n.t("game:commandDeck.research.facilityPlanned", "已排入本轮政府财政计划。") : undefined,
    lockedReason: !facilitySelected && remainingGovernmentBudget < facilityCost ? i18n.t("game:commandDeck.research.insufficientBudget", "政府财政不足") : null,
    tone: facilitySelected ? "accent" : remainingGovernmentBudget < facilityCost ? "locked" : "default",
    selected: facilitySelected,
    control: {
      kind: "toggle",
      label: i18n.t("game:commandDeck.research.buildFacilityTitle", "建立研究院"),
      checked: facilitySelected,
      disabled: !facilitySelected && remainingGovernmentBudget < facilityCost,
    },
    interaction: { type: "governmentStrategy", actionId: "expand_research" },
  };

  const sections: DecisionLocationViewModel["sections"] = [
    {
      id: "research-facility",
      title: i18n.t("game:commandDeck.research.facilitySectionTitle", "研究设施"),
      description: i18n.t("game:commandDeck.research.facilitySectionDesc", "研究院只消耗政府财政，设施越多，研究推进越快。"),
      cards: [facilityCard],
    },
    ...chains.map((chain) => ({
      id: `research-chain-${chain.chainId}`,
      title: chain.label,
      description: i18n.t("game:commandDeck.research.chainDesc", "同一回合只能选择一个研究目标。进度达到有效阈值后，结算掷 1D{{sides}}，结果不低于有效阈值才解锁；失败会保留进度并降低下次阈值。", { sides: breakthroughDieSides }),
      cards: chain.techs.map((tech) => {
        const selected = selectedTechIds.has(tech.techId);
        const progressDisplay = Math.min(tech.progress, tech.effectiveThreshold);
        const progressText = `${progressDisplay}/${tech.effectiveThreshold}`;
        const progressPercent = tech.effectiveThreshold > 0
          ? Math.min(100, Math.round((progressDisplay / tech.effectiveThreshold) * 100))
          : 0;
        const breakthroughChance = formatBreakthroughChance(tech.effectiveThreshold, breakthroughDieSides);
        const unlocks = [
          ...(tech.unlocksGoods ?? []),
          ...(tech.unlocksRoutes ?? []),
        ];
        const lockedReason = tech.isUnlocked
          ? i18n.t("game:commandDeck.research.techCompleted", "已完成")
          : tech.isActive
            ? null
            : !tech.canResearch
              ? i18n.t("game:commandDeck.research.needPrerequisite", "需完成前置科技")
              : null;

        return {
          id: `research-${tech.techId}`,
          title: tech.label,
          subtitle: tech.isUnlocked ? i18n.t("game:commandDeck.research.techCompleted", "已完成") : i18n.t("game:commandDeck.research.progressLabel", "{{text}} 进度", { text: progressText }),
          description: unlocks.length > 0
            ? i18n.t("game:commandDeck.research.unlocksHint", "完成后解锁：{{list}}", { list: unlocks.join("、") })
            : i18n.t("game:commandDeck.research.unlocksDefault", "完成后解锁后续工业能力。"),
          badges: tech.isUnlocked
            ? [i18n.t("game:commandDeck.research.badgeUnlocked", "已解锁")]
            : tech.isActive
              ? [i18n.t("game:commandDeck.research.badgeResearching", "研究中")]
              : selected
                ? [i18n.t("game:commandDeck.research.badgeThisRound", "本轮目标")]
                : tech.canResearch
                  ? [i18n.t("game:commandDeck.research.badgeResearchable", "可研究")]
                  : [],
          metrics: [
            { label: i18n.t("game:commandDeck.research.progress", "进度"), value: `${progressPercent}%` },
            { label: i18n.t("game:commandDeck.research.threshold", "阈值"), value: tech.effectiveThreshold },
            { label: i18n.t("game:commandDeck.research.breakthrough", "突破"), value: breakthroughChance ? `1D${breakthroughDieSides} / ${breakthroughChance}` : `1D${breakthroughDieSides}` },
          ],
          feedback: selected
            ? i18n.t("game:commandDeck.research.submitTarget", "提交后将作为研究院目标。")
            : tech.isActive
              ? tech.progress >= tech.effectiveThreshold
                ? i18n.t("game:commandDeck.research.breakthroughReady", "已达到突破条件，下次结算会继续尝试。")
                : i18n.t("game:commandDeck.research.researchInProgress", "当前研究设施正在推进该科技。")
              : undefined,
          lockedReason,
          tone: tech.isUnlocked
            ? "locked"
            : selected || tech.isActive
              ? "accent"
              : lockedReason
                ? "locked"
                : "default",
          selected: tech.isUnlocked || tech.isActive || selected,
          control: {
            kind: "toggle" as const,
            label: tech.isUnlocked ? i18n.t("game:commandDeck.research.techCompleted", "已完成") : tech.isActive ? i18n.t("game:commandDeck.research.researching", "研究中") : i18n.t("game:commandDeck.research.research", "研究"),
            checked: tech.isUnlocked || tech.isActive || selected,
            disabled: tech.isUnlocked || tech.isActive || (!selected && lockedReason !== null),
          },
          interaction: { type: "technology" as const, techId: tech.techId },
        } satisfies DecisionCardViewModel;
      }),
    })),
  ];

  return {
    id: "research",
    label: i18n.t("game:commandDeck.research.locationLabel", "研究院"),
    eyebrow: i18n.t("game:commandDeck.stepEyebrow", "步骤 {{current}} / 5", { current: 5 }),
    subtitle: i18n.t("game:commandDeck.research.locationSubtitle", "政府财政支持的科技研究"),
    description: i18n.t("game:commandDeck.research.locationDesc", "玩家只需要建设研究设施，并选择一个研究目标。"),
    budgetLabel: i18n.t("game:commandDeck.government.budgetLabel", "政府财政"),
    remainingBudget: remainingGovernmentBudget,
    summaryPills: [
      i18n.t("game:commandDeck.research.pillBudget", "政府财政 {{amount}}", { amount: remainingGovernmentBudget }),
      i18n.t("game:commandDeck.research.pillFacilities", "研究设施 {{count}} 所", { count: researchFacilities }),
      i18n.t("game:commandDeck.research.pillProgress", "进度 {{progress}}/回合", { progress: perTurnProgress }),
      activeTech ? i18n.t("game:commandDeck.research.pillCurrentTech", "当前 {{label}}", { label: activeTech.label }) : i18n.t("game:commandDeck.research.pillNoTarget", "当前未指定"),
      selectedTechIds.size > 0 ? i18n.t("game:commandDeck.research.pillTargetSelected", "本轮已选目标") : i18n.t("game:commandDeck.research.pillNoTargetSelected", "本轮未选目标"),
    ],
    sections,
  };
}

function formatBreakthroughChance(effectiveThreshold: number, dieSides: number): string | null {
  if (effectiveThreshold <= 0 || dieSides <= 0) {
    return null;
  }
  const successOutcomes = Math.max(0, dieSides - effectiveThreshold + 1);
  const clamped = Math.min(successOutcomes, dieSides);
  return `${Math.round((clamped / dieSides) * 100)}%`;
}

function buildProductionCard(
  option: DecisionPlayerPhaseWorkspace["productionOptions"][number],
  draft: PhaseDraftByPhase["decision"],
  availability: {
    remainingFactoryBudget: number;
    remainingRouteCapacity: number;
  },
): DecisionCardViewModel {
  const quantity = getProductionOrderQuantity(draft, option.goodsId);
  const effectiveMax = resolveProductionMaxQuantity(option, quantity, availability);
  const lockedReason = quantity > 0
    ? null
    : effectiveMax <= 0
      ? availability.remainingFactoryBudget < option.unitBudgetCost
        ? i18n.t("game:commandDeck.factory.insufficientBudget", "工厂预算不足")
        : i18n.t("game:commandDeck.factory.routeCapacityFull", "共享{{label}}产能已满", { label: option.routeLabel })
      : null;

  return {
    id: `production-${option.goodsId}`,
    title: option.label,
    subtitle: `${option.routeLabel} · ${option.usageHint}`,
    badges: [
      i18n.t("game:commandDeck.factory.costPerBatch", "成本 {{cost}}/批", { cost: option.unitBudgetCost }),
      i18n.t("game:commandDeck.factory.domesticPrice", "国内价 {{price}}", { price: option.domesticReferencePrice }),
      i18n.t("game:commandDeck.factory.overseasPriceRange", "海外价 {{min}}-{{max}}", { min: option.overseasReferencePriceMin, max: option.overseasReferencePriceMax }),
      formatPriceTrendText(option.priceTrend, option.priceAdjustment),
    ],
    metrics: [
      { label: i18n.t("game:commandDeck.factory.costPerBatchShort", "成本/批"), value: i18n.t("game:commandDeck.factory.budgetAmount", "{{amount}} 预算", { amount: option.unitBudgetCost }) },
      { label: i18n.t("game:commandDeck.factory.outputPerBatch", "产出/批"), value: i18n.t("game:commandDeck.factory.itemCount", "{{count}} 件", { count: option.unitOutput }) },
    ],
    feedback: quantity > 0
      ? i18n.t("game:commandDeck.factory.productionFeedback", "已安排 {{batches}} 批，消耗 {{cost}} 工厂预算，产出 {{output}} 件商品。", { batches: quantity, cost: quantity * option.unitBudgetCost, output: quantity * option.unitOutput })
      : undefined,
    lockedReason,
    tone: lockedReason && quantity === 0 ? "locked" : quantity > 0 ? "accent" : "default",
    selected: quantity > 0,
    control: {
      kind: "quantity",
      label: i18n.t("game:commandDeck.factory.produceLabel", "生产 {{label}}", { label: option.label }),
      max: effectiveMax,
      value: quantity,
      disabled: effectiveMax <= 0 && quantity <= 0,
      unitLabel: i18n.t("game:commandDeck.factory.batch", "批"),
    },
    interaction: { type: "production", goodsId: option.goodsId },
  };
}

function buildExpansionCard(
  option: DecisionPlayerPhaseWorkspace["expansionOptions"][number],
  draft: PhaseDraftByPhase["decision"],
  remainingFactoryBudget: number,
): DecisionCardViewModel {
  const quantity = getRouteOrderQuantity(draft.factoryPlan.expansionOrders, option.routeId);
  const confirmed = quantity > 0;
  const lockedReason = resolveBudgetLockedReason({
    baseLockedReason: option.lockedReason,
    isSelected: confirmed,
    remainingBudget: remainingFactoryBudget,
    requiredBudget: option.unitBudgetCost,
    insufficientBudgetLabel: i18n.t("game:commandDeck.factory.insufficientBudget", "工厂预算不足"),
  });

  return {
    id: `expansion-${option.routeId}`,
    title: i18n.t("game:commandDeck.factory.expandProduction", "扩产 {{label}}", { label: option.routeLabel }),
    subtitle: i18n.t("game:commandDeck.factory.capacityIncrease", "产能 +{{delta}}", { delta: option.capacityDelta }),
    description: i18n.t("game:commandDeck.factory.expansionDesc", "影响下一回合产能结构。"),
    badges: [i18n.t("game:commandDeck.factory.costBadge", "费用 {{cost}} 预算", { cost: option.unitBudgetCost })],
    metrics: [{ label: i18n.t("game:commandDeck.factory.cost", "费用"), value: i18n.t("game:commandDeck.factory.factoryBudgetAmount", "{{amount}} 工厂预算", { amount: option.unitBudgetCost }) }],
    feedback: confirmed ? i18n.t("game:commandDeck.factory.expansionConfirmed", "已确认扩产，工厂预算 -{{cost}}。", { cost: option.unitBudgetCost }) : undefined,
    lockedReason,
    tone: lockedReason && !confirmed ? "locked" : confirmed ? "accent" : "default",
    selected: confirmed,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed,
      confirmLabel: i18n.t("game:commandDeck.factory.confirmExpansion", "确认扩产"),
      cancelLabel: i18n.t("game:commandDeck.factory.cancelExpansion", "取消扩产"),
      disabled: !confirmed && lockedReason !== null,
    },
    interaction: { type: "expansion", routeId: option.routeId },
  };
}

function buildUpgradeCard(
  option: DecisionPlayerPhaseWorkspace["upgradeOptions"][number],
  draft: PhaseDraftByPhase["decision"],
  remainingFactoryBudget: number,
): DecisionCardViewModel {
  const quantity = getRouteOrderQuantity(draft.factoryPlan.upgradeOrders, option.routeId);
  const confirmed = quantity > 0;
  const lockedReason = resolveBudgetLockedReason({
    baseLockedReason: option.lockedReason,
    isSelected: confirmed,
    remainingBudget: remainingFactoryBudget,
    requiredBudget: option.unitBudgetCost,
    insufficientBudgetLabel: i18n.t("game:commandDeck.factory.insufficientBudget", "工厂预算不足"),
  });

  return {
    id: `upgrade-${option.routeId}`,
    title: i18n.t("game:commandDeck.factory.upgradeTo", "升级到 {{label}}", { label: option.routeLabel }),
    subtitle: `${option.sourceRouteLabel} → ${option.routeLabel}`,
    description: i18n.t("game:commandDeck.factory.upgradeDesc", "把现有产能升级到更高工业路线。"),
    badges: [i18n.t("game:commandDeck.factory.costBadge", "费用 {{cost}} 预算", { cost: option.unitBudgetCost })],
    metrics: [{ label: i18n.t("game:commandDeck.factory.cost", "费用"), value: i18n.t("game:commandDeck.factory.factoryBudgetAmount", "{{amount}} 工厂预算", { amount: option.unitBudgetCost }) }],
    feedback: confirmed ? i18n.t("game:commandDeck.factory.upgradeConfirmed", "已确认升级，工厂预算 -{{cost}}。", { cost: option.unitBudgetCost }) : undefined,
    lockedReason,
    tone: lockedReason && !confirmed ? "locked" : confirmed ? "accent" : "default",
    selected: confirmed,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed,
      confirmLabel: i18n.t("game:commandDeck.factory.confirmUpgrade", "确认升级"),
      cancelLabel: i18n.t("game:commandDeck.factory.cancelUpgrade", "取消升级"),
      disabled: !confirmed && lockedReason !== null,
    },
    interaction: { type: "upgrade", routeId: option.routeId },
  };
}

function buildNewFactoryCard(
  option: DecisionPlayerPhaseWorkspace["newFactoryOptions"][number],
  draft: PhaseDraftByPhase["decision"],
  remainingFactoryBudget: number,
): DecisionCardViewModel {
  const quantity = getRouteOrderQuantity(draft.factoryPlan.newFactoryOrders, option.routeId);
  const confirmed = quantity > 0;
  const lockedReason = resolveBudgetLockedReason({
    baseLockedReason: option.lockedReason,
    isSelected: confirmed,
    remainingBudget: remainingFactoryBudget,
    requiredBudget: option.unitBudgetCost,
    insufficientBudgetLabel: i18n.t("game:commandDeck.factory.insufficientBudget", "工厂预算不足"),
  });

  return {
    id: `new-factory-${option.routeId}`,
    title: i18n.t("game:commandDeck.factory.newFactory", "新建 {{label}}工厂", { label: option.routeLabel }),
    subtitle: i18n.t("game:commandDeck.factory.capacityIncrease", "产能 +{{delta}}", { delta: option.capacityDelta }),
    description: i18n.t("game:commandDeck.factory.newFactoryDesc", "为下一回合增加基础产能。"),
    badges: [i18n.t("game:commandDeck.factory.costBadge", "费用 {{cost}} 预算", { cost: option.unitBudgetCost })],
    metrics: [{ label: i18n.t("game:commandDeck.factory.cost", "费用"), value: i18n.t("game:commandDeck.factory.factoryBudgetAmount", "{{amount}} 工厂预算", { amount: option.unitBudgetCost }) }],
    feedback: confirmed ? i18n.t("game:commandDeck.factory.newFactoryConfirmed", "已确认新建，工厂预算 -{{cost}}。", { cost: option.unitBudgetCost }) : undefined,
    lockedReason,
    tone: lockedReason && !confirmed ? "locked" : confirmed ? "accent" : "default",
    selected: confirmed,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed,
      confirmLabel: i18n.t("game:commandDeck.factory.confirmNewFactory", "确认新建"),
      cancelLabel: i18n.t("game:commandDeck.factory.cancelNewFactory", "取消新建"),
      disabled: !confirmed && lockedReason !== null,
    },
    interaction: { type: "newFactory", routeId: option.routeId },
  };
}

function buildMilitaryActionCard(
  action: DecisionPlayerPhaseWorkspace["militaryWorkspace"]["availableMilitaryActions"][number],
  selectionCount: number,
  remainingMilitaryPoints: number,
): DecisionCardViewModel {
  const canAdd = selectionCount < action.maxPerRound && remainingMilitaryPoints >= action.cost;
  const lockedReason = selectionCount >= action.maxPerRound
    ? i18n.t("game:commandDeck.military.maxPerRoundReached", "已达到本轮上限 {{max}} 次", { max: action.maxPerRound })
    : !canAdd
      ? i18n.t("game:commandDeck.military.insufficientMilitaryPoints", "军事点不足")
      : null;

  return {
    id: `military-${action.actionId}`,
    title: action.label,
    subtitle: i18n.t("game:commandDeck.military.militaryPointsCost", "军事点 {{cost}}", { cost: action.cost }),
    description: buildMilitaryActionDescription(action),
    badges: [i18n.t("game:commandDeck.military.maxPerRound", "每轮上限 {{max}}", { max: action.maxPerRound })],
    metrics: [
      { label: i18n.t("game:commandDeck.military.currentArrangement", "当前安排"), value: `${selectionCount} / ${action.maxPerRound}` },
      { label: i18n.t("game:commandDeck.military.militaryPointsCostShort", "军事点消耗"), value: action.cost },
    ],
    feedback: selectionCount > 0 ? i18n.t("game:military.actionScheduledCount", "当前已安排 {{current}} / {{max}} 次。", { current: selectionCount, max: action.maxPerRound }) : undefined,
    lockedReason,
    tone: selectionCount > 0 ? "accent" : lockedReason ? "locked" : "default",
    selected: selectionCount > 0,
    control: {
      kind: "confirm",
      mode: "count",
      count: selectionCount,
      maxCount: action.maxPerRound,
      confirmLabel: i18n.t("game:military.confirmAction", "确认动作：{{label}}", { label: action.label }),
      cancelLabel: i18n.t("game:military.revokeAction", "撤回动作：{{label}}", { label: action.label }),
      disabled: !canAdd,
      revokeDisabled: selectionCount === 0,
    },
    interaction: { type: "militaryAction", actionId: action.actionId },
  };
}

function resolveProductionMaxQuantity(
  option: DecisionPlayerPhaseWorkspace["productionOptions"][number],
  quantity: number,
  availability: {
    remainingFactoryBudget: number;
    remainingRouteCapacity: number;
  },
): number {
  const budgetHeadroom = option.unitBudgetCost > 0
    ? Math.floor(Math.max(availability.remainingFactoryBudget, 0) / option.unitBudgetCost)
    : option.maxQuantity;
  const budgetLimitedMax = quantity + budgetHeadroom;
  const routeLimitedMax = quantity + Math.max(availability.remainingRouteCapacity, 0);

  return Math.max(quantity, Math.min(option.maxQuantity, budgetLimitedMax, routeLimitedMax));
}

function resolveBudgetLockedReason({
  baseLockedReason,
  isSelected,
  remainingBudget,
  requiredBudget,
  insufficientBudgetLabel,
}: {
  baseLockedReason: string | null | undefined;
  isSelected: boolean;
  remainingBudget: number;
  requiredBudget: number;
  insufficientBudgetLabel: string;
}): string | null {
  if (isSelected) {
    return null;
  }
  if (baseLockedReason) {
    return baseLockedReason;
  }
  if (remainingBudget < requiredBudget) {
    return insufficientBudgetLabel;
  }
  return null;
}

function getLocationLabel(step: DecisionStepId): string {
  switch (step) {
    case "factory":
      return i18n.t("game:building.factory", "工业区");
    case "domestic":
      return i18n.t("game:commandDeck.domestic.locationLabel", "市民广场");
    case "government":
      return i18n.t("game:commandDeck.government.locationLabel", "议会厅");
    case "military":
      return i18n.t("game:commandDeck.military.locationLabel", "军事要塞");
    case "research":
      return i18n.t("game:commandDeck.research.locationLabel", "研究院");
    default:
      return getDecisionStepLabel(step);
  }
}
