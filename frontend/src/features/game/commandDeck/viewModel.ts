import {
  getAllocatedProductionBatchesForRoute,
  getProductionOrderQuantity,
  getRouteOrderQuantity,
} from "../decisionDrafts";
import {
  buildEffectMetrics,
  buildGovernmentActionDescription,
  buildMilitaryActionDescription,
  buildRegionAccessDescription,
  buildTechResearchDescription,
  buildTechUnlockSummary,
  calculateDecisionSpendSummary,
  calculateGovernmentPointPreview,
  calculateRatioPreview,
  calculateTechResearchPreview,
  flattenTechTree,
  formatPriceTrendText,
  formatRatio,
  formatRatioDeltaSummary,
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
      techResearchPreview,
      workspace,
    }),
    government: buildGovernmentLocation({
      draft,
      governmentPointPreview,
      ratioPreview,
      remainingGovernmentBudget: remainingBudgets.governmentFiscal,
      techResearchPreview,
      workspace,
    }),
    military: buildMilitaryLocation({
      draft,
      availableMilitaryPoints: governmentPointPreview.militaryPoints,
      remainingGovernmentBudget: remainingBudgets.governmentFiscal,
      workspace,
    }),
    research: buildResearchLocation({
      workspace,
      draft,
      remainingGovernmentBudget: remainingBudgets.governmentFiscal,
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
        subtitle: `工厂预算 ${tech.budgetCost}`,
        description: buildTechResearchDescription(tech, lockedReason, workspace, queued),
        badges: unlockSummary ? [unlockSummary] : [],
        metrics: [{ label: "预算消耗", value: `${tech.budgetCost}` }],
        feedback: queued ? "已加入本轮工业研究队列。" : undefined,
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
        `国内 ${option.domesticReferencePrice}`,
        `海外 ${option.overseasReferencePriceMin}-${option.overseasReferencePriceMax}`,
        formatPriceTrendText(option.priceTrend, option.priceAdjustment),
      ],
      metrics: [],
      lockedReason: option.lockedReason,
      tone: "locked",
      control: { kind: "none" },
    } satisfies DecisionCardViewModel));

  return {
    id: "factory",
    label: "工业区",
    eyebrow: "步骤 1 / 5",
    subtitle: "你的工厂今天需要什么指令？",
    description: "安排本轮生产、建设产线，并把工业研究直接挂到工厂预算上。",
    budgetLabel: "工厂预算",
    remainingBudget: remainingFactoryBudget,
    summaryPills: [
      `工厂预算 ${remainingFactoryBudget}`,
      `已排产 ${draft.factoryPlan.productionOrders.reduce((sum, item) => sum + item.quantity, 0)} 批`,
      ...workspace.routeSummaries.map((summary) => {
        const allocated = getAllocatedProductionBatchesForRoute(draft, workspace.productionOptions, summary.routeId);
        return `${summary.routeLabel}剩余 ${Math.max(summary.availableBatchesThisRound - allocated, 0)} 批`;
      }),
    ],
    sections: [
      {
        id: "production",
        title: "本轮生产",
        description: "选择生产批次，预算和共享产能会即时联动。",
        cards: productionCards,
      },
      {
        id: "construction",
        title: "建设升级",
        description: "确认后写入本轮草稿，影响下一回合产能。",
        cards: constructionCards,
      },
      ...(factoryTechCards.length > 0
        ? [
            {
              id: "factory-tech",
              title: "工业研究",
              description: "使用工厂预算解锁新商品和产线。",
              cards: factoryTechCards,
            },
          ]
        : []),
      ...(lockedGoodsCards.length > 0
        ? [
            {
              id: "locked-goods",
              title: "未解锁商品",
              description: "当前还不能投入生产的商品会集中展示在这里。",
              cards: lockedGoodsCards,
            },
          ]
        : []),
    ],
  };
}

function buildDomesticLocation({
  workspace,
  draft,
  remainingDomesticBudget,
  techResearchPreview,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingDomesticBudget: number;
  techResearchPreview: ReturnType<typeof calculateTechResearchPreview>;
}): DecisionLocationViewModel {
  const selectedActionIds = new Set(draft.domesticMarketPlan.domesticMarketActions.map((item) => item.actionId));

  const domesticActionCards = workspace.domesticMarketActions.map((action) => {
    const selected = selectedActionIds.has(action.actionId);
    const lockedReason = resolveBudgetLockedReason({
      baseLockedReason: action.lockedReason,
      isSelected: selected,
      remainingBudget: remainingDomesticBudget,
      requiredBudget: action.cost,
      insufficientBudgetLabel: "国内预算不足",
    });

    const effectMetrics = buildEffectMetrics(action.effects);

    return {
      id: `domestic-${action.actionId}`,
      title: action.label,
      subtitle: `国内预算 ${action.cost}`,
      description: action.description,
      badges: selected ? ["已纳入本轮"] : action.lockedReason ? ["待研究"] : ["待选择"],
      metrics: [
        { label: "预算消耗", value: action.cost },
        ...effectMetrics.map((em) => ({ label: em.label, value: em.value })),
      ],
      feedback: selected ? `已纳入本轮，国内消费市场预算 -${action.cost}。` : undefined,
      lockedReason,
      tone: lockedReason && !selected ? "locked" : selected ? "accent" : "default",
      selected,
      control: {
        kind: "toggle",
        label: action.label,
        checked: selected,
        disabled: !selected && lockedReason !== null,
      },
      interaction: { type: "domesticAction", actionId: action.actionId },
    } satisfies DecisionCardViewModel;
  });

  const domesticTechCards = flattenTechTree(workspace.techTree)
    .filter((tech) => tech.budgetPool === "domesticMarket")
    .map((tech) => {
      const queued = draft.governmentPlan.techResearch.some((item) => item.techId === tech.techId);
      const lockedReason = getTechResearchLockedReason(tech, techResearchPreview, workspace);
      const unlockSummary = buildTechUnlockSummary(tech, workspace);

      return {
        id: `technology-${tech.techId}`,
        title: tech.label,
        subtitle: `国内预算 ${tech.budgetCost}`,
        description: buildTechResearchDescription(tech, lockedReason, workspace, queued),
        badges: unlockSummary ? [unlockSummary] : [],
        metrics: [{ label: "预算消耗", value: `${tech.budgetCost}` }],
        feedback: queued ? "已加入本轮消费研究队列。" : undefined,
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

  return {
    id: "domestic",
    label: "市民广场",
    eyebrow: "步骤 2 / 5",
    subtitle: "如何刺激国内市场？",
    description: "消费动作和消费研究共享同一个国内预算池。",
    budgetLabel: "国内预算",
    remainingBudget: remainingDomesticBudget,
    summaryPills: [
      `国内预算 ${remainingDomesticBudget}`,
      `已选动作 ${selectedActionIds.size} 项`,
      `消费研究 ${draft.governmentPlan.techResearch.filter((item) => {
        const tech = flattenTechTree(workspace.techTree).find((candidate) => candidate.techId === item.techId);
        return tech?.budgetPool === "domesticMarket";
      }).length} 项`,
    ],
    sections: [
      {
        id: "domestic-actions",
        title: "民生政策",
        description: "选中后立即进入本轮提交草稿。",
        cards: domesticActionCards,
      },
      ...(domesticTechCards.length > 0
        ? [
            {
              id: "domestic-tech",
              title: "消费研究",
              description: "先研究，再决定是否把预算留给消费动作。",
              cards: domesticTechCards,
            },
          ]
        : []),
    ],
  };
}

function buildGovernmentLocation({
  workspace,
  draft,
  remainingGovernmentBudget,
  ratioPreview,
  governmentPointPreview,
  techResearchPreview,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingGovernmentBudget: number;
  ratioPreview: ReturnType<typeof calculateRatioPreview>;
  governmentPointPreview: ReturnType<typeof calculateGovernmentPointPreview>;
  techResearchPreview: ReturnType<typeof calculateTechResearchPreview>;
}): DecisionLocationViewModel {
  const selectedStrategyIds = new Set(draft.governmentPlan.strategySelections.map((item) => item.actionId));
  const selectedAbility = workspace.nationalAbility && draft.abilitySelection?.abilityId === workspace.nationalAbility.abilityId
    ? draft.abilitySelection
    : null;

  const strategyCards = workspace.governmentActions.strategies.map((action) => {
    const selected = selectedStrategyIds.has(action.actionId);
    const lockedReason = resolveBudgetLockedReason({
      baseLockedReason: action.lockedReason,
      isSelected: selected,
      remainingBudget: remainingGovernmentBudget,
      requiredBudget: action.cost,
      insufficientBudgetLabel: "政府预算不足",
    });

    const govEffectMetrics = buildEffectMetrics(action.effects);
    const govExtraMetrics = govEffectMetrics
      .filter((em) => !["科技点", "军事点"].includes(em.label))
      .map((em) => ({ label: em.label, value: em.value }));

    return {
      id: `strategy-${action.actionId}`,
      title: action.label,
      subtitle: `政府预算 ${action.cost}`,
      description: action.description,
      badges: Object.keys(action.ratioDelta ?? {}).length > 0
        ? [formatRatioDeltaSummary(action.ratioDelta ?? {})]
        : ["收入结构不变"],
      metrics: [
        { label: "财政消耗", value: action.cost },
        { label: "军事点变化", value: action.militaryPointDelta ?? 0 },
        ...govExtraMetrics,
      ],
      feedback: selected ? `已纳入本轮，政府财政 -${action.cost}。` : undefined,
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
        subtitle: `政府预算 ${tech.budgetCost}`,
        description: buildTechResearchDescription(tech, lockedReason, workspace, queued),
        badges: unlockSummary ? [unlockSummary] : [],
        metrics: [{ label: "预算消耗", value: `${tech.budgetCost}` }],
        feedback: queued ? "已加入本轮政策研究队列。" : undefined,
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
          subtitle: workspace.nationalAbility.isAvailable ? "国家专属能力" : "本局已使用",
          description: workspace.nationalAbility.description,
          badges: workspace.nationalAbility.requiresTargetIdeology ? ["需要选择意识形态目标"] : ["即时生效"],
          metrics: [
            { label: "比例预告", value: formatRatio(ratioPreview) },
            { label: "财政剩余", value: remainingGovernmentBudget },
          ],
          feedback: selectedAbility ? "本轮会一起提交国家能力。" : undefined,
          lockedReason: workspace.nationalAbility.isAvailable ? null : "本局已使用",
          tone: selectedAbility ? "accent" : workspace.nationalAbility.isAvailable ? "default" : "locked",
          selected: Boolean(selectedAbility),
          control: {
            kind: "toggle",
            label: `启用国家能力：${workspace.nationalAbility.label}`,
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
    const pathLabel = reform.path === "freedom" ? "自由之路" : reform.path === "equality" ? "平等之路" : "民族之路";
    const lockedReason = reform.isCompleted
      ? "已完成"
      : reform.isBlocked
        ? "被其他改革路径锁定"
        : null;
    return {
      id: `reform-${reform.reformId}`,
      title: reform.label,
      subtitle: `${pathLabel} · 行政力 ${reform.adminCost}`,
      description: lockedReason ?? `消耗 ${reform.adminCost} 行政力推动「${pathLabel}」。`,
      badges: [pathLabel],
      metrics: [{ label: "行政力", value: reform.adminCost }],
      feedback: queued ? "已加入本轮改革排队。" : undefined,
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
        ? `需先完成改革：${policy.requiresReform}`
        : "未解锁"
      : null;
    const subtitle = `行政力 ${policy.adminCostPerTurn}/回合${policy.budgetCost > 0 ? ` · 预算 ${policy.budgetCost}` : ""}`;
    return {
      id: `policy-${policy.policyId}`,
      title: policy.label,
      subtitle,
      description: policy.description ?? (willBeActive ? "已激活" : "可激活"),
      badges: [willBeActive ? "生效中" : "未生效"],
      metrics: [
        { label: "每回合行政力", value: policy.adminCostPerTurn },
        ...(policy.budgetCost > 0 ? [{ label: "预算", value: policy.budgetCost }] : []),
      ],
      feedback: queuedActivate
        ? "已排入本轮激活。"
        : queuedDeactivate
          ? "已排入本轮停用。"
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
    label: "议会厅",
    eyebrow: "步骤 3 / 5",
    subtitle: "帝国的政治方向",
    description: "政治策略、政策研究与国家能力共用政府财政。",
    budgetLabel: "政府财政",
    remainingBudget: remainingGovernmentBudget,
    summaryPills: [
      `政府预算 ${remainingGovernmentBudget}`,
      `比例预告 ${formatRatio(ratioPreview)}`,
      `军事点 ${governmentPointPreview.militaryPoints}`,
      `国家能力 ${selectedAbility ? "已启用" : "未启用"}`,
    ],
    sections: [
      {
        id: "government-strategy",
        title: "政府策略",
        description: "会影响收入结构、军事储备和后续发展方向。",
        cards: strategyCards,
      },
      ...(governmentTechCards.length > 0
        ? [
            {
              id: "government-tech",
              title: "政策研究",
              description: "使用政府预算推进政治科技链。",
              cards: governmentTechCards,
            },
          ]
        : []),
      ...(abilityCards.length > 0
        ? [
            {
              id: "government-ability",
              title: "国家能力卡",
              description: "国家专属能力不再和普通策略混排。",
              cards: abilityCards,
            },
          ]
        : []),
      ...(reformCards.length > 0
        ? [
            {
              id: "government-reform",
              title: "政治改革",
              description: "消耗行政力推动制度改革。已完成的改革会解锁新政策。",
              cards: reformCards,
            },
          ]
        : []),
      ...(policyCards.length > 0
        ? [
            {
              id: "government-policy",
              title: "国家政策",
              description: "激活或停用已解锁的政策。每项激活的政策每回合消耗行政力。",
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
    * colonizationCapability.militaryPointCost;
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
      ? "该区域已经建交"
      : !selected && remainingGovernmentBudget < action.cost
        ? "政府预算不足"
        : null;

    return {
      id: `diplomacy-${action.actionId}`,
      title: action.label,
      subtitle: `政府预算 ${action.cost}`,
      description: buildMilitaryActionDescription(action),
      badges: [action.targetRegionLabel],
      metrics: [
        { label: "当前状态", value: action.isEstablished ? "已建交" : selected ? "待提交" : "可发起" },
        { label: "财政消耗", value: action.cost },
      ],
      feedback: action.isEstablished
        ? "该区域已经完成建交，本轮不能重复提交。"
        : selected
          ? "已纳入本轮建交计划。"
          : undefined,
      lockedReason,
      tone: action.isEstablished ? "locked" : selected ? "accent" : "default",
      selected,
      control: {
        kind: "confirm",
        mode: "toggle",
        confirmed: selected,
        confirmLabel: action.label,
        cancelLabel: `取消${action.label}`,
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
    ? "已永久解锁"
    : !unlockSelected && remainingGovernmentBudget < colonizationCapability.unlockCost
      ? "政府预算不足"
      : null;

  const colonizationUnlockCard: DecisionCardViewModel = {
    id: "colonization-unlock",
    title: "殖民扩张",
    subtitle: `政府预算 ${colonizationCapability.unlockCost}`,
    description: `支付 ${colonizationCapability.unlockCost} 政府财政，永久获得殖民能力。之后每次殖民仅消耗 ${colonizationCapability.militaryPointCost} 军事点。`,
    badges: [
      `每殖民地 +${colonizationCapability.incomePerColonyPerRound} 国家收入`,
      `每回合最多 ${colonizationCapability.maxColonizationsPerRound} 个目标`,
    ],
    metrics: [
      { label: "当前状态", value: colonizationCapability.isUnlocked ? "已永久解锁" : unlockSelected ? "待本轮解锁" : "未解锁" },
      { label: "财政消耗", value: colonizationCapability.unlockCost },
    ],
    feedback: colonizationCapability.isUnlocked
      ? "本局已经完成永久解锁。"
      : unlockSelected
        ? "已纳入本轮永久解锁计划。"
        : undefined,
    lockedReason: unlockLockedReason,
    tone: colonizationCapability.isUnlocked ? "locked" : unlockSelected ? "accent" : "default",
    selected: colonizationCapability.isUnlocked || unlockSelected,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed: colonizationCapability.isUnlocked || unlockSelected,
      confirmLabel: "解锁殖民扩张",
      cancelLabel: "取消解锁殖民扩张",
      disabled: colonizationCapability.isUnlocked || (!unlockSelected && remainingGovernmentBudget < colonizationCapability.unlockCost),
      revokeDisabled: colonizationCapability.isUnlocked || !unlockSelected,
    },
    interaction: { type: "colonizationUnlock" },
  };

  const colonizationCards = militaryWorkspace.colonizationOptions.map((option) => {
    const selected = draft.militaryPlan.colonizationActions.some((item) => item.targetRegionId === option.regionId);
    const previewHasDiplomacy = previewEstablishedDiplomacy.has(option.regionId);
    const previewHasMilitary = selected || remainingMilitaryPoints >= colonizationCapability.militaryPointCost;
    const previewCanColonize = !option.isColonized && previewIsUnlocked && previewHasDiplomacy && previewHasMilitary;
    const previewLockedReason = option.isColonized
      ? "该区域已经被殖民"
      : !previewIsUnlocked
        ? "需先永久解锁殖民扩张"
        : !previewHasDiplomacy
          ? "需先建交"
          : !previewHasMilitary
            ? `需要${colonizationCapability.militaryPointCost}军事点`
            : null;
    return {
      id: `colonization-${option.regionId}`,
      title: option.regionLabel,
      subtitle: option.isColonized ? "已殖民" : selected ? "待提交" : previewLockedReason ?? "可殖民",
      description: option.isColonized
        ? `${option.regionLabel} 已经进入殖民状态。`
        : `执行殖民消耗 ${colonizationCapability.militaryPointCost} 军事点；结算时每回合增加 ${colonizationCapability.incomePerColonyPerRound} 国家收入。`,
      badges: [option.isColonized ? "已殖民" : "殖民目标"],
      metrics: [
        { label: "状态", value: option.isColonized ? "已殖民" : selected ? "待提交" : previewLockedReason ?? "可殖民" },
        { label: "军事消耗", value: `${colonizationCapability.militaryPointCost} 点` },
      ],
      feedback: selected ? "已纳入本轮殖民目标。" : undefined,
      lockedReason: selected ? null : previewLockedReason,
      tone: option.isColonized ? "locked" : selected ? "accent" : previewCanColonize ? "default" : "locked",
      selected,
      control: {
        kind: "confirm",
        mode: "toggle",
        confirmed: selected,
        confirmLabel: `殖民${option.regionLabel}`,
        cancelLabel: `取消殖民${option.regionLabel}`,
        disabled: option.isColonized || (!selected && !previewCanColonize),
        revokeDisabled: !selected,
      },
      interaction: { type: "colonizationTarget", targetRegionId: option.regionId },
    } satisfies DecisionCardViewModel;
  });

  const regionCards = militaryWorkspace.regionAccessStatus.map((status) => ({
    id: `region-${status.regionId}`,
    title: status.label,
    subtitle: status.isAccessible ? "当前可进入" : "当前仍受限",
    description: buildRegionAccessDescription(status),
    badges: status.acceptedGoods.map(getGoodsLabel),
    metrics: [
      { label: "准入等级", value: getRegionAccessLevelLabel(status.accessLevel) },
      { label: "外交状态", value: status.isDiplomacyEstablished ? "已建交" : "未建交" },
    ],
    tone: status.isAccessible ? "accent" : "locked",
    lockedReason: status.isAccessible ? null : "需要建交或提升军事点",
    control: { kind: "none" },
  } satisfies DecisionCardViewModel));

  return {
    id: "military",
    label: "军事要塞",
    eyebrow: "步骤 4 / 5",
    subtitle: "海军、陆军、外交与殖民执行",
    description: "殖民被拆成永久能力解锁与区域执行两层，外交是殖民前置，殖民收益在结算阶段并入国家收入。",
    budgetLabel: "军事点",
    remainingBudget: remainingMilitaryPoints,
    summaryPills: [
      `财政剩余 ${remainingGovernmentBudget}`,
      `军事点可用 ${availableMilitaryPoints}`,
      `军事点余量 ${remainingMilitaryPoints}`,
      `海外承接 ${militaryWorkspace.overseasCapacity}`,
      `已建交 ${militaryWorkspace.establishedDiplomacy.length} 区`,
      `控制区域 ${militaryWorkspace.controlledRegions}`,
      `殖民能力 ${previewIsUnlocked ? (colonizationCapability.isUnlocked ? "已解锁" : "待解锁") : "未解锁"}`,
    ],
    sections: [
      {
        id: "military-regions",
        title: "海外区域状态",
        description: "先判断市场准入与外交状态，再决定建交、解锁或殖民。",
        cards: regionCards,
      },
      ...(navalCards.length > 0
        ? [
            {
              id: "navy",
              title: "海军建设",
              description: "优先提高海外承接与投送能力。",
              cards: navalCards,
            },
          ]
        : []),
      ...(armyCards.length > 0
        ? [
            {
              id: "army",
              title: "陆军征募",
              description: "补充陆军兵力与重武器。",
                cards: armyCards,
              },
            ]
          : []),
      ...((supportCards.length > 0 || diplomacyCards.length > 0)
        ? [
            {
              id: "diplomacy-support",
              title: "外交行动 / 军事支援",
              description: "建交提供永久准入，其它军事动作负责补充本轮力量与海外投送。",
              cards: [...supportCards, ...diplomacyCards],
            },
          ]
        : []),
      {
        id: "colonization-unlock",
        title: "殖民扩张",
        description: "先买下永久能力，再从已建交区域里选择本轮唯一殖民目标。",
        cards: [colonizationUnlockCard],
      },
      ...(colonizationCards.length > 0
        ? [
            {
              id: "colonization-targets",
              title: "殖民目标",
              description: "区域列表只负责执行态选择，不再重复收取财政成本。",
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
    title: "建立研究院",
    subtitle: `政府财政 ${facilityCost}`,
    description: "消耗政府财政建设研究设施。设施越多，当前研究每回合推进越快；进度达有效阈值后，结算时掷突破骰。",
    badges: facilitySelected ? ["本轮建设"] : ["长期投入"],
    metrics: [
      { label: "现有设施", value: `${researchFacilities} 所` },
      { label: "当前进度", value: `${perTurnProgress}/回合` },
      { label: "建成后", value: `${plannedPerTurnProgress}/回合` },
      { label: "突破骰", value: `1D${breakthroughDieSides}` },
    ],
    feedback: facilitySelected ? "已排入本轮政府财政计划。" : undefined,
    lockedReason: !facilitySelected && remainingGovernmentBudget < facilityCost ? "政府财政不足" : null,
    tone: facilitySelected ? "accent" : remainingGovernmentBudget < facilityCost ? "locked" : "default",
    selected: facilitySelected,
    control: {
      kind: "toggle",
      label: "建立研究院",
      checked: facilitySelected,
      disabled: !facilitySelected && remainingGovernmentBudget < facilityCost,
    },
    interaction: { type: "governmentStrategy", actionId: "expand_research" },
  };

  const sections: DecisionLocationViewModel["sections"] = [
    {
      id: "research-facility",
      title: "研究设施",
      description: "研究院只消耗政府财政，设施越多，研究推进越快。",
      cards: [facilityCard],
    },
    ...chains.map((chain) => ({
      id: `research-chain-${chain.chainId}`,
      title: chain.label,
      description: `同一回合只能选择一个研究目标。进度达到有效阈值后，结算掷 1D${breakthroughDieSides}，结果不低于有效阈值才解锁；失败会保留进度并降低下次阈值。`,
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
          ? "已完成"
          : tech.isActive
            ? null
            : !tech.canResearch
              ? "需完成前置科技"
              : null;

        return {
          id: `research-${tech.techId}`,
          title: tech.label,
          subtitle: tech.isUnlocked ? "已完成" : `${progressText} 进度`,
          description: unlocks.length > 0
            ? `完成后解锁：${unlocks.join("、")}`
            : "完成后解锁后续工业能力。",
          badges: tech.isUnlocked
            ? ["已解锁"]
            : tech.isActive
              ? ["研究中"]
              : selected
                ? ["本轮目标"]
                : tech.canResearch
                  ? ["可研究"]
                  : [],
          metrics: [
            { label: "进度", value: `${progressPercent}%` },
            { label: "阈值", value: tech.effectiveThreshold },
            { label: "突破", value: breakthroughChance ? `1D${breakthroughDieSides} / ${breakthroughChance}` : `1D${breakthroughDieSides}` },
          ],
          feedback: selected
            ? "提交后将作为研究院目标。"
            : tech.isActive
              ? tech.progress >= tech.effectiveThreshold
                ? "已达到突破条件，下次结算会继续尝试。"
                : "当前研究设施正在推进该科技。"
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
            label: tech.isUnlocked ? "已完成" : tech.isActive ? "研究中" : "研究",
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
    label: "研究院",
    eyebrow: "步骤 5 / 5",
    subtitle: "政府财政支持的科技研究",
    description: "玩家只需要建设研究设施，并选择一个研究目标。",
    budgetLabel: "政府财政",
    remainingBudget: remainingGovernmentBudget,
    summaryPills: [
      `政府财政 ${remainingGovernmentBudget}`,
      `研究设施 ${researchFacilities} 所`,
      `进度 ${perTurnProgress}/回合`,
      activeTech ? `当前 ${activeTech.label}` : "当前未指定",
      selectedTechIds.size > 0 ? "本轮已选目标" : "本轮未选目标",
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
        ? "工厂预算不足"
        : `共享${option.routeLabel}产能已满`
      : null;

  return {
    id: `production-${option.goodsId}`,
    title: option.label,
    subtitle: `${option.routeLabel} · ${option.usageHint}`,
    badges: [
      `成本 ${option.unitBudgetCost}/批`,
      `国内价 ${option.domesticReferencePrice}`,
      `海外价 ${option.overseasReferencePriceMin}-${option.overseasReferencePriceMax}`,
      formatPriceTrendText(option.priceTrend, option.priceAdjustment),
    ],
    metrics: [
      { label: "成本/批", value: `${option.unitBudgetCost} 预算` },
      { label: "产出/批", value: `${option.unitOutput} 件` },
    ],
    feedback: quantity > 0
      ? `已安排 ${quantity} 批，消耗 ${quantity * option.unitBudgetCost} 工厂预算，产出 ${quantity * option.unitOutput} 件商品。`
      : undefined,
    lockedReason,
    tone: lockedReason && quantity === 0 ? "locked" : quantity > 0 ? "accent" : "default",
    selected: quantity > 0,
    control: {
      kind: "quantity",
      label: `生产 ${option.label}`,
      max: effectiveMax,
      value: quantity,
      disabled: effectiveMax <= 0 && quantity <= 0,
      unitLabel: "批",
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
    insufficientBudgetLabel: "工厂预算不足",
  });

  return {
    id: `expansion-${option.routeId}`,
    title: `扩产 ${option.routeLabel}`,
    subtitle: `产能 +${option.capacityDelta}`,
    description: "影响下一回合产能结构。",
    badges: [`费用 ${option.unitBudgetCost} 预算`],
    metrics: [{ label: "费用", value: `${option.unitBudgetCost} 工厂预算` }],
    feedback: confirmed ? `已确认扩产，工厂预算 -${option.unitBudgetCost}。` : undefined,
    lockedReason,
    tone: lockedReason && !confirmed ? "locked" : confirmed ? "accent" : "default",
    selected: confirmed,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed,
      confirmLabel: "确认扩产",
      cancelLabel: "取消扩产",
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
    insufficientBudgetLabel: "工厂预算不足",
  });

  return {
    id: `upgrade-${option.routeId}`,
    title: `升级到 ${option.routeLabel}`,
    subtitle: `${option.sourceRouteLabel} → ${option.routeLabel}`,
    description: "把现有产能升级到更高工业路线。",
    badges: [`费用 ${option.unitBudgetCost} 预算`],
    metrics: [{ label: "费用", value: `${option.unitBudgetCost} 工厂预算` }],
    feedback: confirmed ? `已确认升级，工厂预算 -${option.unitBudgetCost}。` : undefined,
    lockedReason,
    tone: lockedReason && !confirmed ? "locked" : confirmed ? "accent" : "default",
    selected: confirmed,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed,
      confirmLabel: "确认升级",
      cancelLabel: "取消升级",
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
    insufficientBudgetLabel: "工厂预算不足",
  });

  return {
    id: `new-factory-${option.routeId}`,
    title: `新建 ${option.routeLabel}工厂`,
    subtitle: `产能 +${option.capacityDelta}`,
    description: "为下一回合增加基础产能。",
    badges: [`费用 ${option.unitBudgetCost} 预算`],
    metrics: [{ label: "费用", value: `${option.unitBudgetCost} 工厂预算` }],
    feedback: confirmed ? `已确认新建，工厂预算 -${option.unitBudgetCost}。` : undefined,
    lockedReason,
    tone: lockedReason && !confirmed ? "locked" : confirmed ? "accent" : "default",
    selected: confirmed,
    control: {
      kind: "confirm",
      mode: "toggle",
      confirmed,
      confirmLabel: "确认新建",
      cancelLabel: "取消新建",
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
    ? `已达到本轮上限 ${action.maxPerRound} 次`
    : !canAdd
      ? "军事点不足"
      : null;

  return {
    id: `military-${action.actionId}`,
    title: action.label,
    subtitle: `军事点 ${action.cost}`,
    description: buildMilitaryActionDescription(action),
    badges: [`每轮上限 ${action.maxPerRound}`],
    metrics: [
      { label: "当前安排", value: `${selectionCount} / ${action.maxPerRound}` },
      { label: "军事点消耗", value: action.cost },
    ],
    feedback: selectionCount > 0 ? `当前已安排 ${selectionCount} / ${action.maxPerRound} 次。` : undefined,
    lockedReason,
    tone: selectionCount > 0 ? "accent" : lockedReason ? "locked" : "default",
    selected: selectionCount > 0,
    control: {
      kind: "confirm",
      mode: "count",
      count: selectionCount,
      maxCount: action.maxPerRound,
      confirmLabel: `确认动作：${action.label}`,
      cancelLabel: `撤回动作：${action.label}`,
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
      return "工业区";
    case "domestic":
      return "市民广场";
    case "government":
      return "议会厅";
    case "military":
      return "军事要塞";
    case "research":
      return "研究院";
    default:
      return getDecisionStepLabel(step);
  }
}
