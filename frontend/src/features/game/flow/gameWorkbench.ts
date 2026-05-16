import i18n from "../../../i18n";
import type {
  IdeologyKey,
  DecisionPlayerPhaseWorkspace,
  GamePhase,
  MarketPlayerPhaseWorkspace,
  PlayerPhaseWorkspace,
  PlayerState,
  RankingEntry,
} from "../../../types";
import {
  DECISION_STEP_ORDER,
  getDecisionStepCompletionSummary,
  getDecisionStepLabel,
  getDecisionStepReviewLabel,
  getUncheckedDecisionSteps,
  hasDecisionStepContent,
  type DecisionFlowState,
  type DecisionStepId,
} from "./decisionFlow";
import {
  getAllocatedProductionBatchesForRoute as getAllocatedProductionBatchesForRouteFromDraft,
} from "../decisionDrafts";
import {
  calculateDecisionMarketReferencePrice,
  calculateDecisionSpendSummary as calculateDecisionSpendSummaryFromDraft,
  calculateGovernmentFiscalState,
  calculateRatioPreview as calculateRatioPreviewFromDraft,
} from "../decisionShared";
import type { DecisionPhaseDraft } from "../forms";
import { getCountryLabel } from "../labels";

type RailMetric = {
  label: string;
  value: string | number;
};

type RailCardViewModel = {
  eyebrow: string;
  title: string;
  body?: string;
  lines?: string[];
  metrics?: RailMetric[];
  tone?: "default" | "accent" | "warning";
};

export type WorkflowStepViewModel = {
  id: DecisionStepId;
  label: string;
  statusLabel: string;
  isActive: boolean;
};

export type TopWorkflowViewModel = {
  steps: WorkflowStepViewModel[];
} | null;

export type LeftRailViewModel = {
  title: string;
  cards: RailCardViewModel[];
};

export type AssistRailViewModel = {
  title: string;
  checklist: RailCardViewModel;
  blocking: RailCardViewModel | null;
  submit: RailCardViewModel & {
    draftSummaryLines: string[];
    warningLines: string[];
  };
};

export type PhaseHeaderViewModel = {
  eyebrow: string;
  title: string;
  body: string;
  pills: string[];
};

export type ResourceStripMetric = {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "warning";
};

export type ResourceStripViewModel = {
  metrics: ResourceStripMetric[];
  contextLines: string[];
} | null;

type CreateGameWorkbenchViewModelArgs = {
  currentPhase: GamePhase | null;
  currentPlayerId: string | null;
  currentPlayerState: PlayerState | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  currentSubmittedStatus: "pending" | "submitted" | "timeout_auto_submitted";
  draftPayload: Record<string, unknown>;
  decisionFlowState: DecisionFlowState;
  rankingStandings: RankingEntry[];
  settlementWorkspace: {
    phaseLabel: string;
    headline: string;
    summaryLines: string[];
  } | null;
};

export function createGameWorkbenchViewModel({
  currentPhase,
  currentPlayerId,
  currentPlayerState,
  currentPlayerWorkspace,
  currentSubmittedStatus,
  draftPayload,
  decisionFlowState,
  rankingStandings,
  settlementWorkspace,
}: CreateGameWorkbenchViewModelArgs): {
  topWorkflow: TopWorkflowViewModel;
  leftRail: LeftRailViewModel;
  resourceStrip: ResourceStripViewModel;
  assistRail: AssistRailViewModel;
  phaseHeader: PhaseHeaderViewModel;
} {
  return {
    topWorkflow: createTopWorkflowViewModel(currentPhase, decisionFlowState, draftPayload, currentPlayerWorkspace),
    resourceStrip: createResourceStripViewModel({
      currentPhase,
      currentPlayerState,
      currentPlayerWorkspace,
      draftPayload,
      decisionFlowState,
    }),
    leftRail: createLeftRailViewModel({
      currentPhase,
      currentPlayerId,
      currentPlayerState,
      currentPlayerWorkspace,
      draftPayload,
      decisionFlowState,
      rankingStandings,
      settlementWorkspace,
    }),
    assistRail: createAssistRailViewModel({
      currentPhase,
      currentPlayerState,
      currentPlayerWorkspace,
      currentSubmittedStatus,
      draftPayload,
      decisionFlowState,
    }),
    phaseHeader: createPhaseHeaderViewModel({
      currentPhase,
      currentPlayerState,
    }),
  };
}

export function getPhaseSubmitBlockingReasons({
  currentPhase,
  currentPlayerState,
  currentPlayerWorkspace,
  draftPayload,
  decisionFlowState,
}: {
  currentPhase: GamePhase | null;
  currentPlayerState: PlayerState | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  draftPayload: Record<string, unknown>;
  decisionFlowState: DecisionFlowState;
}): string[] {
  if (!currentPhase || !currentPlayerState || !currentPlayerWorkspace) {
    return [i18n.t("game:flow.validateWaitingSync", "等待当前阶段数据同步。")];
  }
  if (currentPhase === "settlement") {
    return [];
  }

  const reasons: string[] = [];
  if (currentPhase === "decision") {
    const draft = normalizeDecisionDraft(draftPayload);
    const contentContext = getDecisionContentContext(currentPlayerWorkspace);
    const uncheckedDecisionSteps = getUncheckedDecisionSteps(decisionFlowState, draft, contentContext);
    if (uncheckedDecisionSteps.length > 0) {
      reasons.push(i18n.t("game:flow.validateNeedComplete", "请先完成或跳过：{{steps}}。", { steps: uncheckedDecisionSteps.map((step) => getDecisionStepLabel(step)).join("、") }));
    }
  }

  reasons.push(
    ...extractBlockingLines(
      buildValidationLines({
        currentPhase,
        currentPlayerState,
        currentPlayerWorkspace,
        draftPayload,
      }),
    ),
  );
  return reasons;
}

function createTopWorkflowViewModel(
  currentPhase: GamePhase | null,
  decisionFlowState: DecisionFlowState,
  draftPayload: Record<string, unknown>,
  currentPlayerWorkspace: PlayerPhaseWorkspace | null,
): TopWorkflowViewModel {
  if (currentPhase !== "decision") {
    return null;
  }

  const draft = normalizeDecisionDraft(draftPayload);
  const contentContext = getDecisionContentContext(currentPlayerWorkspace);
  return {
    steps: DECISION_STEP_ORDER.map((step) => {
      const hasDraftContent = hasDecisionStepContent(draft, step, contentContext);
      const reviewState = decisionFlowState.stepReviewStateByStep[step];
      return {
        id: step,
        label: getDecisionStepLabel(step),
        statusLabel: hasDraftContent ? "已决策" : getDecisionStepReviewLabel(reviewState),
        isActive: decisionFlowState.activeStep === step,
      };
    }),
  };
}

function getDecisionContentContext(currentPlayerWorkspace: PlayerPhaseWorkspace | null) {
  if (!currentPlayerWorkspace || !("techTree" in currentPlayerWorkspace)) {
    return {};
  }
  return {
    activeResearch: currentPlayerWorkspace.techTree.activeResearch,
  };
}

function createResourceStripViewModel({
  currentPhase,
  currentPlayerState,
  currentPlayerWorkspace,
  draftPayload,
  decisionFlowState,
}: {
  currentPhase: GamePhase | null;
  currentPlayerState: PlayerState | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  draftPayload: Record<string, unknown>;
  decisionFlowState: DecisionFlowState;
}): ResourceStripViewModel {
  if (!currentPlayerState) {
    return null;
  }

  const decisionWorkspace =
    currentPhase === "decision" && currentPlayerWorkspace && "militaryWorkspace" in currentPlayerWorkspace
      ? (currentPlayerWorkspace as DecisionPlayerPhaseWorkspace)
      : null;
  const visibleBudgetPools = decisionWorkspace?.budgetPools ?? currentPlayerState.budgetPools;
  const draft = normalizeDecisionDraft(draftPayload);
  const fiscalState = decisionWorkspace
    ? calculateGovernmentFiscalState(decisionWorkspace, draft)
    : null;
  const metrics: ResourceStripMetric[] = [
    { label: i18n.t("game:settlement.consumerPurchasingPower", "民间购买力"), value: visibleBudgetPools.domesticMarket },
    { label: i18n.t("game:settlement.factoryBudget", "工厂"), value: visibleBudgetPools.factory },
    {
      label: fiscalState && fiscalState.marketRegulationAllowance > 0 ? i18n.t("game:government.budgetBasePlusMarket", "政府财政(基础+市场)") : i18n.t("game:government.budget", "政府财政"),
      value: fiscalState && fiscalState.marketRegulationAllowance > 0
        ? `${fiscalState.baseGovernmentBudget}+${fiscalState.marketRegulationAllowance}`
        : visibleBudgetPools.governmentFiscal,
    },
  ];

  if (currentPhase === "decision" && currentPlayerWorkspace && "militaryWorkspace" in currentPlayerWorkspace) {
    const spendSummary = calculateDecisionSpendSummary(currentPlayerWorkspace as DecisionPlayerPhaseWorkspace, draftPayload);
    if (spendSummary.factorySpend > visibleBudgetPools.factory) {
      metrics[1].tone = "warning";
    }
    if (spendSummary.domesticSpend > visibleBudgetPools.domesticMarket) {
      metrics[0].tone = "warning";
    }
    if (
      spendSummary.governmentSpend > visibleBudgetPools.governmentFiscal
      || (fiscalState && fiscalState.baseFiscalSpend > fiscalState.baseGovernmentBudget)
    ) {
      metrics[2].tone = "warning";
    }
  }

  const contextLines = buildCurrentResourceLines({
    currentPhase,
    currentPlayerWorkspace,
    currentPlayerState,
    draftPayload,
    decisionFlowState,
  });

  return { metrics, contextLines };
}

function createLeftRailViewModel({
  currentPhase,
  currentPlayerId,
  currentPlayerState,
  currentPlayerWorkspace,
  draftPayload,
  decisionFlowState,
  rankingStandings,
  settlementWorkspace,
}: {
  currentPhase: GamePhase | null;
  currentPlayerId: string | null;
  currentPlayerState: PlayerState | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  draftPayload: Record<string, unknown>;
  decisionFlowState: DecisionFlowState;
  rankingStandings: RankingEntry[];
  settlementWorkspace: {
    phaseLabel: string;
    headline: string;
    summaryLines: string[];
  } | null;
}): LeftRailViewModel {
  const selfStanding = currentPlayerId
    ? rankingStandings.find((entry) => entry.playerId === currentPlayerId) ?? null
    : null;
  const leader = rankingStandings[0] ?? null;
  const researchFacilities = currentPlayerWorkspace && "techTree" in currentPlayerWorkspace
    ? currentPlayerWorkspace.techTree.researchFacilities
    : null;
  const decisionWorkspace =
    currentPhase === "decision" && currentPlayerWorkspace && "militaryWorkspace" in currentPlayerWorkspace
      ? (currentPlayerWorkspace as DecisionPlayerPhaseWorkspace)
      : null;
  const visibleBudgetPools = decisionWorkspace?.budgetPools ?? currentPlayerState?.budgetPools;
  const visibleMilitaryPoints = decisionWorkspace?.militaryWorkspace.militaryPoints ?? currentPlayerState?.militaryPoints;
  const visibleArmy: Record<string, number> = decisionWorkspace?.militaryWorkspace.army ?? currentPlayerState?.army ?? {};
  const visibleArmyTotal = Object.values(visibleArmy).reduce((sum, value) => sum + Math.max(0, Math.floor(value)), 0);
  const fiscalState = decisionWorkspace
    ? calculateGovernmentFiscalState(decisionWorkspace, normalizeDecisionDraft(draftPayload))
    : null;

  return {
    title: i18n.t("game:flow.dashboard", "国家仪表盘"),
    cards: [
      {
        eyebrow: i18n.t("game:flow.currentResources", "当前资源"),
        title: i18n.t("game:flow.resourcesAndMilitary", "资源与军事"),
        tone: "accent",
        metrics: currentPlayerState
          ? [
              { label: i18n.t("game:settlement.consumerPurchasingPower", "民间购买力"), value: visibleBudgetPools?.domesticMarket ?? currentPlayerState.budgetPools.domesticMarket },
              { label: i18n.t("game:settlement.factoryBudget", "工厂"), value: visibleBudgetPools?.factory ?? currentPlayerState.budgetPools.factory },
              {
                label: fiscalState && fiscalState.marketRegulationAllowance > 0 ? i18n.t("game:government.budgetBasePlusMarket", "政府财政(基础+市场)") : i18n.t("game:government.budget", "政府财政"),
                value: fiscalState && fiscalState.marketRegulationAllowance > 0
                  ? `${fiscalState.baseGovernmentBudget}+${fiscalState.marketRegulationAllowance}`
                  : visibleBudgetPools?.governmentFiscal ?? currentPlayerState.budgetPools.governmentFiscal,
              },
              { label: i18n.t("game:military.militaryPoints", "军事点"), value: visibleMilitaryPoints ?? currentPlayerState.militaryPoints },
              { label: i18n.t("game:unit.infantry", "陆军"), value: visibleArmyTotal },
              ...(researchFacilities !== null
                ? [{ label: i18n.t("game:research.researchFacilities", "研究设施"), value: researchFacilities }]
                : []),
            ]
          : [],
        lines: buildCurrentResourceLines({
          currentPhase,
          currentPlayerWorkspace,
          currentPlayerState,
          draftPayload,
          decisionFlowState,
        }),
      },
      {
        eyebrow: i18n.t("game:flow.longTermTrends", "长期态势"),
        title: i18n.t("game:flow.incomeRankAndSettlement", "收入、排名与最近结算"),
        body: currentPlayerState
          ? i18n.t("game:flow.currentRatioAndIncome", "当前比例 {{ratio}}，累计国家收入 {{income}}。", { ratio: formatRatio(currentPlayerState.incomeAllocationRatio), income: currentPlayerState.cumulativeNationalIncome })
          : i18n.t("game:flow.waitingCountrySync", "等待国家结构同步。"),
        lines: [
          selfStanding ? i18n.t("game:flow.currentRank", "当前名次：第 {{rank}} 名", { rank: selfStanding.rank }) : i18n.t("game:flow.currentRankWaiting", "当前名次：等待同步"),
          leader
            ? i18n.t("game:flow.currentLeader", "当前榜首：{{country}} · {{income}}", { country: getCountryLabel(leader.countryId), income: leader.cumulativeNationalIncome })
            : i18n.t("game:flow.currentLeaderWaiting", "当前榜首：等待同步"),
          settlementWorkspace
            ? i18n.t("game:flow.latestSettlement", "最近结算：{{headline}}", { headline: settlementWorkspace.headline })
            : i18n.t("game:flow.latestSettlementNone", "最近结算：暂无结算摘要"),
        ],
      },
    ],
  };
}

function createAssistRailViewModel({
  currentPhase,
  currentPlayerState,
  currentPlayerWorkspace,
  currentSubmittedStatus,
  draftPayload,
  decisionFlowState,
}: {
  currentPhase: GamePhase | null;
  currentPlayerState: PlayerState | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  currentSubmittedStatus: "pending" | "submitted" | "timeout_auto_submitted";
  draftPayload: Record<string, unknown>;
  decisionFlowState: DecisionFlowState;
}): AssistRailViewModel {
  const decisionDraft = currentPhase === "decision" ? normalizeDecisionDraft(draftPayload) : null;
  const contentContext = getDecisionContentContext(currentPlayerWorkspace);
  const uncheckedDecisionSteps = currentPhase === "decision" && decisionDraft
    ? getUncheckedDecisionSteps(decisionFlowState, decisionDraft, contentContext)
    : [];
  const uncheckedDecisionStepLabels = uncheckedDecisionSteps.map((step) => getDecisionStepLabel(step));
  const validationLines = buildValidationLines({
    currentPhase,
    currentPlayerState,
    currentPlayerWorkspace,
    draftPayload,
  });
  const blockingLines = extractBlockingLines(validationLines);

  return {
    title: i18n.t("game:flow.checkAndSubmit", "检查与提交"),
    checklist: {
      eyebrow: i18n.t("game:flow.stepChecklist", "步骤检查"),
      title: i18n.t("game:flow.stepChecklistTitle", "步骤检查清单"),
      tone: uncheckedDecisionStepLabels.length > 0 ? "warning" : "default",
      lines: buildChecklistLines(currentPhase, decisionFlowState, draftPayload, currentPlayerWorkspace),
    },
    blocking: blockingLines.length > 0
      ? {
          eyebrow: i18n.t("game:flow.blockingIssues", "阻断性问题"),
          title: i18n.t("game:flow.blockingTitle", "当前存在阻断性问题"),
          tone: "warning",
          lines: blockingLines,
        }
      : null,
    submit: {
      eyebrow: i18n.t("game:commandDock.finalConfirm", "最终提交"),
      title: currentPhase === "settlement" ? i18n.t("game:flow.submitTitleSettlement", "本阶段无玩家提交") : i18n.t("game:flow.submitTitle", "提交确认"),
      body:
        currentPhase === "settlement"
          ? i18n.t("game:flow.submitSettlementDesc", "财政结算阶段由系统自动推进，无需玩家提交。")
          : uncheckedDecisionStepLabels.length > 0
            ? i18n.t("game:flow.submitUncheckedSteps", "{{steps}}尚未决策。", { steps: uncheckedDecisionStepLabels.join("、") })
            : currentSubmittedStatus === "pending"
              ? i18n.t("game:flow.submitAllReady", "所有关键步骤都在这里完成最终确认。")
              : currentSubmittedStatus === "submitted"
                ? i18n.t("game:flow.submitAlreadySubmitted", "你已完成本阶段提交，等待系统结算。")
                : i18n.t("game:flow.submitAutoSubmitted", "你未在截止前完成操作，系统已代为确认当前阶段安排。"),
      draftSummaryLines: buildDraftSummaryLines(currentPhase, draftPayload),
      warningLines:
        currentPhase === "decision" && uncheckedDecisionStepLabels.length > 0
          ? [i18n.t("game:flow.submitUncheckedWarning", "未决策：{{steps}}。", { steps: uncheckedDecisionStepLabels.join("、") })]
          : [],
      lines: buildSubmitLines({
        currentPhase,
        currentPlayerState,
        currentPlayerWorkspace,
        draftPayload,
        hasBlockingIssues: blockingLines.length > 0,
      }),
      tone: "accent",
    },
  };
}

function createPhaseHeaderViewModel({
  currentPhase,
  currentPlayerState,
}: {
  currentPhase: GamePhase | null;
  currentPlayerState: PlayerState | null;
}): PhaseHeaderViewModel {
  if (currentPhase === "decision") {
    return {
      eyebrow: i18n.t("game:government.phaseHeaderEyebrow", "阶段操作台"),
      title: i18n.t("game:government.phaseHeaderDecisionTitle", "国家决策"),
      body: i18n.t("game:government.phaseHeaderDecisionDesc", "把工厂预算和政府财政转成生产、市场调节和国家治理，并同步内需购买力。"),
      pills: [],
    };
  }

  if (currentPhase === "market") {
    return {
      eyebrow: i18n.t("game:government.phaseHeaderEyebrow", "阶段操作台"),
      title: i18n.t("game:government.phaseHeaderMarketTitle", "市场出售"),
      body: i18n.t("game:government.phaseHeaderMarketDesc", "把库存分配到国内和海外市场，直接形成当回合国家收入。"),
      pills: currentPlayerState
        ? [
            i18n.t("game:government.currentNationalIncome", "当前国家收入") + ` ${currentPlayerState.nationalIncome}`,
            i18n.t("game:government.domesticSalesLabel", "内销") + ` ${currentPlayerState.domesticSalesRevenue}`,
            i18n.t("game:government.overseasSalesLabel", "外销") + ` ${currentPlayerState.overseasSalesRevenue}`,
          ]
        : [],
    };
  }

  return {
    eyebrow: i18n.t("game:government.phaseHeaderEyebrow", "阶段操作台"),
    title: i18n.t("game:government.phaseHeaderSettlementTitle", "财政结算"),
    body: i18n.t("game:government.phaseHeaderSettlementDesc", "系统将按当前收入分配比例回流到民间购买力、工厂和政府财政，并生成下一回合结构起点。"),
    pills: currentPlayerState
      ? [
          i18n.t("game:settlement.cumulativeIncome", "累计国家收入") + ` ${currentPlayerState.cumulativeNationalIncome}`,
          i18n.t("game:settlement.nextRatio", "当前比例") + ` ${formatRatio(currentPlayerState.incomeAllocationRatio)}`,
        ]
      : [],
  };
}

function buildCurrentResourceLines({
  currentPhase,
  currentPlayerWorkspace,
  currentPlayerState,
  draftPayload,
  decisionFlowState,
}: {
  currentPhase: GamePhase | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  currentPlayerState: PlayerState | null;
  draftPayload: Record<string, unknown>;
  decisionFlowState: DecisionFlowState;
}): string[] {
  if (!currentPhase || !currentPlayerState || !currentPlayerWorkspace) {
    return [i18n.t("game:flow.resourcesContextWaiting", "等待当前阶段资源同步。")];
  }

  if (currentPhase === "decision" && "militaryWorkspace" in currentPlayerWorkspace) {
    const workspace = currentPlayerWorkspace as DecisionPlayerPhaseWorkspace;
    const spendSummary = calculateDecisionSpendSummary(workspace, draftPayload);
    const draft = normalizeDecisionDraft(draftPayload);
    const fiscalState = calculateGovernmentFiscalState(workspace, draft);
    if (decisionFlowState.activeStep === "factory") {
      const lines = [
        i18n.t("game:flow.resourcesFactoryActive", "工厂 · 剩余 {{remaining}}", { remaining: workspace.budgetPools.factory - spendSummary.factorySpend }),
      ];
      const phase1 = workspace.phase1Economy;
      if (phase1) {
        const rawAssignments = (draftPayload as Record<string, unknown>).phase1Production as { rawMaterialAssignments?: Record<string, number> } | undefined;
        const assignments = rawAssignments?.rawMaterialAssignments ?? {};
        const totalAssigned = Object.values(assignments).reduce((s, v) => s + v, 0);
        lines.push(i18n.t("game:flow.resourcesRawMaterials", "原材料 {{materials}} · 已分配 {{allocated}}", { materials: phase1.rawMaterials, allocated: totalAssigned }));
        lines.push(i18n.t("game:flow.resourcesInventoryDemand", "库存 {{inventory}} · 国内需求 {{demand}}", { inventory: phase1.goodsInventory, demand: formatNumber(phase1.domesticDemand) }));
      }
      return lines;
    }

    if (decisionFlowState.activeStep === "domestic") {
      const phase1 = workspace.phase1Economy;
      return [
        i18n.t("game:flow.resourcesConsumerPower", "民间购买力 {{power}}", { power: workspace.budgetPools.domesticMarket }),
        phase1
          ? i18n.t("game:flow.resourcesMarketDemandPrice", "需求 {{demand}} · 均衡参考价 {{price}}", { demand: formatNumber(phase1.domesticDemand), price: formatNumber(calculateDecisionMarketReferencePrice(phase1).price ?? 0) })
          : i18n.t("game:domestic.marketPreview", "市场预览"),
      ];
    }

    if (decisionFlowState.activeStep === "military") {
      return [
        i18n.t("game:flow.resourcesMilitary", "军事 · 基础财政剩余 {{remaining}}", { remaining: fiscalState.baseGovernmentRemaining }),
        i18n.t("game:flow.resourcesMilitaryActions", "军事动作 {{actions}} 次 / 建交 {{diplomacy}} 项", { actions: draft.militaryPlan.militaryActions.length, diplomacy: draft.militaryPlan.diplomacyActions.length }),
        i18n.t("game:flow.resourcesOverseasPreview", "海外承接预览 {{capacity}}", { capacity: workspace.militaryWorkspace.overseasCapacity }),
      ];
    }

    const selectedStrategyIds = new Set(draft.governmentPlan.strategySelections.map((selection) => selection.actionId));
    const selectedMarketStrategies = workspace.governmentActions.strategies.filter((strategy) =>
      strategy.actionId !== "expand_research"
      && selectedStrategyIds.has(strategy.actionId)
      && (
        typeof strategy.effects?.domesticMarketCapacityDelta === "number"
        || typeof strategy.effects?.domesticPriceBonusDelta === "number"
      ),
    );
    const marketCapacityDelta = selectedMarketStrategies.reduce((sum, strategy) => {
      const value = strategy.effects?.domesticMarketCapacityDelta;
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
    const marketPriceDelta = selectedMarketStrategies.reduce((sum, strategy) => {
      const value = strategy.effects?.domesticPriceBonusDelta;
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
    const phase1 = workspace.phase1Economy;
    const projectedMarketCapacity = phase1
      ? Math.max(0, (workspace.domesticMarketCapacity ?? phase1.domesticDemand) + marketCapacityDelta)
      : null;
    const projectedMarketPrice = phase1
      ? calculateDecisionMarketReferencePrice(phase1, marketPriceDelta).price
      : null;
    const marketLine = phase1
      ? `市场 需求 ${formatNumber(phase1.domesticDemand)} · 承接 ${formatNumber(projectedMarketCapacity ?? 0)} · 均衡价 ${formatNumber(projectedMarketPrice ?? 0)}`
      : "市场数值等待同步";

    return [
      `政府 · 总余量 ${fiscalState.effectiveGovernmentRemaining}（基础 ${fiscalState.baseGovernmentRemaining} / 市场 ${Math.max(0, fiscalState.marketRegulationAllowance - fiscalState.marketRegulationSpend)}）`,
      marketLine,
      `比例预告 ${formatRatio(calculateRatioPreview(workspace, draftPayload))}`,
    ];
  }

  if (currentPhase === "market" && "sellableInventory" in currentPlayerWorkspace) {
    const workspace = currentPlayerWorkspace as MarketPlayerPhaseWorkspace;
    const { domesticAllocated, overseasAllocated } = getMarketAllocationTotals(draftPayload);
    const effectiveOverseasCapacity = getEffectiveOverseasCapacityForMarketDraft(draftPayload, workspace);

    return [
      `国内承接剩余 ${Math.max(workspace.domesticMarketCapacity - domesticAllocated, 0)}`,
      `海外承接剩余 ${Math.max(effectiveOverseasCapacity - overseasAllocated, 0)}`,
    ];
  }

  return [`本回合国家收入 ${currentPlayerState.nationalIncome}`];
}

function buildChecklistLines(
  currentPhase: GamePhase | null,
  decisionFlowState: DecisionFlowState,
  draftPayload: Record<string, unknown>,
  currentPlayerWorkspace: PlayerPhaseWorkspace | null = null,
): string[] {
  if (currentPhase === "decision") {
    const draft = normalizeDecisionDraft(draftPayload);
    const contentContext = getDecisionContentContext(currentPlayerWorkspace);
    return DECISION_STEP_ORDER.map((step) => {
      const decided = hasDecisionStepContent(draft, step, contentContext);
      const reviewState = decisionFlowState.stepReviewStateByStep[step];
      const status = decided ? "已决策" : getDecisionStepReviewLabel(reviewState);
      const summary = getDecisionStepCompletionSummary(draft, step, contentContext);
      return `${getDecisionStepLabel(step)} · ${status} · ${summary}`;
    });
  }

  if (currentPhase === "market") {
    const saleOrders = getSaleOrders(draftPayload);
    return [
      "市场出售 · 当前阶段",
      saleOrders.length > 0 ? `已配置卖单 ${saleOrders.length} 项` : "当前还没有配置任何卖单",
    ];
  }

  return ["财政结算 · 系统自动推进", "当前只需要等待结算广播。"];
}

function buildSubmitLines({
  currentPhase,
  currentPlayerState,
  currentPlayerWorkspace,
  draftPayload,
  hasBlockingIssues,
}: {
  currentPhase: GamePhase | null;
  currentPlayerState: PlayerState | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  draftPayload: Record<string, unknown>;
  hasBlockingIssues: boolean;
}): string[] {
  const lines: string[] = [];

  if (!hasBlockingIssues) {
    lines.push("当前没有阻断性问题。");
  }

  if (!currentPhase || !currentPlayerWorkspace || !currentPlayerState) {
    return lines;
  }

  if (currentPhase === "decision" && "militaryWorkspace" in currentPlayerWorkspace) {
    const spendSummary = calculateDecisionSpendSummary(currentPlayerWorkspace, draftPayload);
    lines.push(`工厂预计消耗 ${spendSummary.factorySpend}，内需预计消耗 ${spendSummary.domesticSpend}，政府预计消耗 ${spendSummary.governmentSpend}。`);
    lines.push(`当前已规划生产批次 ${spendSummary.productionBatches}。`);
    lines.push(`当前已规划军事动作 ${normalizeDecisionDraft(draftPayload).militaryPlan.militaryActions.length} 次，建交 ${normalizeDecisionDraft(draftPayload).militaryPlan.diplomacyActions.length} 项。`);
    return lines;
  }

  if (currentPhase === "market" && "sellableInventory" in currentPlayerWorkspace) {
    const revenuePreview = calculateMarketRevenuePreview(currentPlayerWorkspace, draftPayload);
    lines.push(`预计国内销售额 ${revenuePreview.domesticRevenue}，预计海外销售额 ${revenuePreview.overseasRevenue}。`);
    lines.push(`预计国家收入 ${revenuePreview.nationalIncome}。`);
    return lines;
  }

  lines.push(`累计国家收入 ${currentPlayerState.cumulativeNationalIncome}。`);
  lines.push("系统会自动推进到下一轮国家决策。");
  return lines;
}

function buildValidationLines({
  currentPhase,
  currentPlayerState,
  currentPlayerWorkspace,
  draftPayload,
}: {
  currentPhase: GamePhase | null;
  currentPlayerState: PlayerState | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  draftPayload: Record<string, unknown>;
}): string[] {
  if (!currentPhase || !currentPlayerState || !currentPlayerWorkspace) {
    return ["等待当前阶段数据同步。"];
  }

  if (currentPhase === "settlement") {
    return ["财政结算阶段没有玩家硬约束需要确认。"];
  }

  if (currentPhase === "decision" && "militaryWorkspace" in currentPlayerWorkspace) {
    const lines: string[] = [];
    const spendSummary = calculateDecisionSpendSummary(currentPlayerWorkspace, draftPayload);
    const draft = normalizeDecisionDraft(draftPayload);
    const budgetPools = currentPlayerWorkspace.budgetPools;
    const fiscalState = calculateGovernmentFiscalState(currentPlayerWorkspace, draft);
    if (spendSummary.factorySpend > budgetPools.factory) {
      lines.push(`工厂计划消耗 ${spendSummary.factorySpend}，超过工厂预算 ${budgetPools.factory}。`);
    }
    if (spendSummary.domesticSpend > budgetPools.domesticMarket) {
      lines.push(`旧版国内市场动作消耗 ${spendSummary.domesticSpend}，超过民间购买力 ${budgetPools.domesticMarket}。`);
    }
    if (spendSummary.governmentSpend > budgetPools.governmentFiscal) {
      lines.push(`政府动作消耗 ${spendSummary.governmentSpend}，超过政府财政预算 ${budgetPools.governmentFiscal}。`);
    }
    if (fiscalState.baseFiscalSpend > fiscalState.baseGovernmentBudget) {
      lines.push(
        `基础政府财政不足：政务/军事/市场调节溢出需要 ${fiscalState.baseFiscalSpend}，基础财政只有 ${fiscalState.baseGovernmentBudget}。`,
      );
    }
    const phase1 = currentPlayerWorkspace.phase1Economy;
    if (phase1) {
      // 2.0: Validate raw material assignments against available resources and per-mode capacity
      const phase1Prod = draftPayload as Record<string, unknown>;
      const rawAssignments = (phase1Prod.phase1Production as { rawMaterialAssignments?: Record<string, number> } | undefined)?.rawMaterialAssignments ?? {};
      const totalAssigned = Object.values(rawAssignments).reduce((s, v) => s + v, 0);
      if (totalAssigned > phase1.rawMaterials) {
        lines.push(`原材料分配 ${totalAssigned}，超过可用原材料 ${phase1.rawMaterials}。`);
      }
      for (const [modeId, assigned] of Object.entries(rawAssignments)) {
        const capacity = phase1.capacityByMode[modeId] ?? 0;
        if (assigned > capacity) {
          const modeLabel = phase1.productionModes.find((m) => m.mode === modeId)?.label ?? modeId;
          lines.push(`${modeLabel} 分配 ${assigned}，超过产能 ${capacity}。`);
        }
      }
    } else {
      // Legacy 1.0 fallback: validate route batch allocation
      for (const routeSummary of currentPlayerWorkspace.routeSummaries) {
        const allocated = getAllocatedProductionBatchesForRoute(
          draftPayload,
          currentPlayerWorkspace.productionOptions,
          routeSummary.routeId,
        );
        if (allocated > routeSummary.availableBatchesThisRound) {
          lines.push(`${routeSummary.routeLabel} 已安排 ${allocated} 批，超过本回合共享产能 ${routeSummary.availableBatchesThisRound}。`);
        }
      }
    }
    for (const action of currentPlayerWorkspace.militaryWorkspace.availableMilitaryActions) {
      const selectedCount = draft.militaryPlan.militaryActions.filter((item) => item.actionId === action.actionId).length;
      if (selectedCount > action.maxPerRound) {
        lines.push(`${action.label} 已安排 ${selectedCount} 次，超过本轮上限 ${action.maxPerRound}。`);
      }
    }
    for (const action of currentPlayerWorkspace.militaryWorkspace.availableDiplomacyActions) {
      const selectedCount = draft.militaryPlan.diplomacyActions.filter((item) => item.actionId === action.actionId).length;
      if (action.isEstablished && selectedCount > 0) {
        lines.push(`${action.targetRegionLabel} 已完成建交，本轮不能重复提交。`);
      }
      if (selectedCount > 1) {
        lines.push(`${action.targetRegionLabel} 建交动作本轮只能提交 1 次。`);
      }
    }
    return lines.length > 0 ? lines : ["当前草稿未突破任何硬约束。"];
  }

  if (currentPhase === "market" && "sellableInventory" in currentPlayerWorkspace) {
    const lines: string[] = [];
    const { domesticAllocated, overseasAllocated, totalAllocated, usesPhase1Market } = getMarketAllocationTotals(draftPayload);
    const effectiveOverseasCapacity = usesPhase1Market
      ? getEffectiveOverseasCapacityForMarketDraft(draftPayload, currentPlayerWorkspace)
      : currentPlayerWorkspace.overseasMarketCapacity;

    if (domesticAllocated > currentPlayerWorkspace.domesticMarketCapacity) {
      lines.push(`国内卖量 ${domesticAllocated} 超过承接能力 ${currentPlayerWorkspace.domesticMarketCapacity}。`);
    }
    if (overseasAllocated > effectiveOverseasCapacity) {
      lines.push(`海外卖量 ${overseasAllocated} 超过承接能力 ${effectiveOverseasCapacity}。`);
    }
    if (usesPhase1Market) {
      const goodsAvailable = currentPlayerWorkspace.phase1GoodsAvailable
        ?? currentPlayerWorkspace.phase1Economy?.goodsInventory
        ?? 0;
      const domesticDemand = currentPlayerWorkspace.phase1Economy?.domesticDemand ?? goodsAvailable;
      if (domesticAllocated > domesticDemand) {
        lines.push(`国内卖量 ${domesticAllocated} 超过本轮需求 ${domesticDemand}。`);
      }
      if (totalAllocated > goodsAvailable) {
        lines.push(`总卖量 ${totalAllocated} 超过库存 ${goodsAvailable}。`);
      }
      const competitionValidationLines = validateMarketCompetitionDraft(
        draftPayload,
        currentPlayerWorkspace,
      );
      lines.push(...competitionValidationLines);
    } else {
      for (const inventory of currentPlayerWorkspace.sellableInventory) {
        const allocated = getSaleOrders(draftPayload)
          .filter((item) => item.goodsId === inventory.goodsId)
          .reduce((sum, item) => sum + item.quantity, 0);
        if (allocated > inventory.quantity) {
          lines.push(`${inventory.label} 已分配 ${allocated}，超过库存 ${inventory.quantity}。`);
        }
      }
    }

    return lines.length > 0 ? lines : ["当前草稿未突破任何硬约束。"];
  }

  return ["当前草稿未突破任何硬约束。"];
}

function getEffectiveOverseasCapacityForMarketDraft(
  draftPayload: Record<string, unknown>,
  workspace: MarketPlayerPhaseWorkspace,
): number {
  const phase1Market = draftPayload.phase1Market as {
    externalCompetitionDeployments?: Array<{ marketId?: unknown; infantry?: unknown; artillery?: unknown }>;
  } | undefined;
  const deployments = Array.isArray(phase1Market?.externalCompetitionDeployments)
    ? phase1Market.externalCompetitionDeployments
    : [];
  const competition = workspace.overseasCompetition;
  const infantryPower = Math.max(0, competition?.infantryPower ?? 1);
  const artilleryPower = Math.max(0, competition?.artilleryPower ?? 2);
  const minimumPower = Math.max(1, competition?.minimumPower ?? 1);
  const countedRegions = new Set<string>();
  const rewardCapacity = deployments.reduce((sum, deployment) => {
    const marketId = typeof deployment.marketId === "string" ? deployment.marketId : "";
    if (!marketId || countedRegions.has(marketId)) {
      return sum;
    }
    countedRegions.add(marketId);
    const region = workspace.regionAccessStatus.find((item) => item.regionId === marketId);
    if (!region?.canCompete) {
      return sum;
    }
    const power = (
      toSafeQuantity(deployment.infantry) * infantryPower
      + toSafeQuantity(deployment.artillery) * artilleryPower
    );
    if (power < minimumPower) {
      return sum;
    }
    return sum + Math.max(0, region.competitionRewardCapacityBonus ?? competition?.rewardCapacityBonus ?? 0);
  }, 0);
  return Math.max(0, workspace.overseasMarketCapacity + rewardCapacity);
}

function validateMarketCompetitionDraft(
  draftPayload: Record<string, unknown>,
  workspace: MarketPlayerPhaseWorkspace,
): string[] {
  const phase1Market = draftPayload.phase1Market as {
    externalCompetitionDeployments?: Array<{ marketId?: unknown; infantry?: unknown; artillery?: unknown }>;
  } | undefined;
  const deployments = Array.isArray(phase1Market?.externalCompetitionDeployments)
    ? phase1Market.externalCompetitionDeployments
    : [];
  if (deployments.length === 0) {
    return [];
  }

  const lines: string[] = [];
  const competition = workspace.overseasCompetition;
  const availableInfantry = Math.max(0, Math.floor(competition?.availableArmy.infantry ?? 0));
  const availableArtillery = Math.max(0, Math.floor(competition?.availableArmy.artillery ?? 0));
  const infantryPower = Math.max(0, competition?.infantryPower ?? 1);
  const artilleryPower = Math.max(0, competition?.artilleryPower ?? 2);
  const minimumPower = Math.max(1, competition?.minimumPower ?? 1);
  const seenRegions = new Set<string>();
  let totalInfantry = 0;
  let totalArtillery = 0;

  for (const deployment of deployments) {
    const marketId = typeof deployment.marketId === "string" ? deployment.marketId : "";
    if (!marketId) {
      lines.push("海外争夺缺少目标区域。");
      continue;
    }
    if (seenRegions.has(marketId)) {
      lines.push(`${marketId} 本轮只能提交一组海外争夺兵力。`);
      continue;
    }
    seenRegions.add(marketId);
    const infantry = toSafeQuantity(deployment.infantry);
    const artillery = toSafeQuantity(deployment.artillery);
    totalInfantry += infantry;
    totalArtillery += artillery;
    const region = workspace.regionAccessStatus.find((item) => item.regionId === marketId);
    if (!region) {
      lines.push(`${marketId} 不是有效海外区域。`);
      continue;
    }
    if (!region.canCompete) {
      lines.push(`${region.label} 当前不可争夺：${formatCompetitionLockReason(region.competitionLockedReason)}。`);
    }
    const power = infantry * infantryPower + artillery * artilleryPower;
    if (power < minimumPower) {
      lines.push(`${region.label} 争夺战力 ${power} 低于最低要求 ${minimumPower}。`);
    }
  }

  if (totalInfantry > availableInfantry) {
    lines.push(`海外争夺步兵 ${totalInfantry} 超过可用 ${availableInfantry}。`);
  }
  if (totalArtillery > availableArtillery) {
    lines.push(`海外争夺炮兵 ${totalArtillery} 超过可用 ${availableArtillery}。`);
  }
  return lines;
}

function formatCompetitionLockReason(reason: string | null | undefined): string {
  if (reason === "diplomacy_not_established") {
    return "需要先建交";
  }
  if (reason === "route_blocked") {
    return "航线被封锁";
  }
  if (reason === "no_army") {
    return "没有可投放陆军";
  }
  return "暂不可争夺";
}

function extractBlockingLines(lines: string[]): string[] {
  if (lines.length === 1 && (
    lines[0] === "当前草稿未突破任何硬约束。"
    || lines[0] === "财政结算阶段没有玩家硬约束需要确认。"
    || lines[0] === "等待当前阶段数据同步。"
  )) {
    return [];
  }
  return lines;
}

function buildDraftSummaryLines(phase: GamePhase | null, draftPayload: Record<string, unknown>): string[] {
  if (!phase || phase === "settlement") {
    return [];
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(draftPayload)) {
    if (Array.isArray(value)) {
      if (value.length > 0) {
        lines.push(`${key}: ${value.length} 项`);
      }
      continue;
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      const nonEmptyKeys = entries.filter(([, item]) => Array.isArray(item) ? item.length > 0 : Boolean(item));
      if (nonEmptyKeys.length > 0) {
        lines.push(`${key}: ${nonEmptyKeys.length} 个子项已填写`);
      }
    }
  }
  return lines;
}

function normalizeDecisionDraft(draftPayload: Record<string, unknown>): DecisionPhaseDraft {
  const draft = draftPayload as {
    factoryPlan?: {
      productionOrders?: Array<{ goodsId: string; quantity: number }>;
      expansionOrders?: Array<{ routeId: string; quantity: number }>;
      upgradeOrders?: Array<{ routeId: string; quantity: number }>;
      newFactoryOrders?: Array<{ routeId: string; quantity: number }>;
      factoryActions?: Array<{ actionId: string }>;
    };
    domesticMarketPlan?: {
      domesticMarketActions?: Array<{ actionId: string }>;
    };
    governmentPlan?: {
      pointPurchases?: Array<{ pointType: "tech" | "military"; quantity: number }>;
      strategySelections?: Array<{ actionId: string }>;
      techResearch?: Array<{ techId: string }>;
      adminPurchases?: number;
    };
    militaryPlan?: {
      unlockColonization?: boolean;
      militaryActions?: Array<{ actionId: string }>;
      diplomacyActions?: Array<{ actionId: string }>;
      colonizationActions?: Array<{ targetRegionId: string }>;
      navalDeployment?: Record<string, number>;
      conquestActions?: Array<{ regionId: string; infantry: number; artillery: number }>;
      lootingActions?: Array<{ regionId: string; resourceType: string }>;
    };
    talentPlan?: {
      talentUnlocks?: Array<{ nodeId: string }>;
    };
    abilitySelection?: {
      abilityId?: string;
      targetIdeology?: string;
    };
    reforms?: string[];
    activatePolicies?: string[];
    deactivatePolicies?: string[];
    phase1Production?: {
      rawMaterialAssignments?: Record<string, number>;
    };
  };
  const targetIdeology = isIdeologyKey(draft.abilitySelection?.targetIdeology)
    ? draft.abilitySelection.targetIdeology
    : undefined;
  const abilitySelection = typeof draft.abilitySelection?.abilityId === "string"
    ? {
        abilityId: draft.abilitySelection.abilityId,
        ...(targetIdeology
          ? { targetIdeology }
          : {}),
      }
    : undefined;

  return {
    factoryPlan: {
      productionOrders: draft.factoryPlan?.productionOrders ?? [],
      expansionOrders: draft.factoryPlan?.expansionOrders ?? [],
      upgradeOrders: draft.factoryPlan?.upgradeOrders ?? [],
      newFactoryOrders: draft.factoryPlan?.newFactoryOrders ?? [],
      factoryActions: draft.factoryPlan?.factoryActions ?? [],
    },
    domesticMarketPlan: {
      domesticMarketActions: draft.domesticMarketPlan?.domesticMarketActions ?? [],
    },
    governmentPlan: {
      pointPurchases: draft.governmentPlan?.pointPurchases ?? [],
      strategySelections: draft.governmentPlan?.strategySelections ?? [],
      techResearch: draft.governmentPlan?.techResearch ?? [],
      adminPurchases: draft.governmentPlan?.adminPurchases ?? 0,
    },
    militaryPlan: {
      unlockColonization: draft.militaryPlan?.unlockColonization ?? false,
      militaryActions: draft.militaryPlan?.militaryActions ?? [],
      diplomacyActions: draft.militaryPlan?.diplomacyActions ?? [],
      colonizationActions: draft.militaryPlan?.colonizationActions ?? [],
      navalDeployment: draft.militaryPlan?.navalDeployment ?? {},
      conquestActions: draft.militaryPlan?.conquestActions ?? [],
      lootingActions: draft.militaryPlan?.lootingActions ?? [],
    },
    abilitySelection,
    talentPlan: {
      talentUnlocks: draft.talentPlan?.talentUnlocks ?? [],
    },
    reforms: draft.reforms ?? [],
    activatePolicies: draft.activatePolicies ?? [],
    deactivatePolicies: draft.deactivatePolicies ?? [],
    phase1Production: {
      rawMaterialAssignments: draft.phase1Production?.rawMaterialAssignments ?? {},
    },
  };
}

function calculateDecisionSpendSummary(
  workspace: DecisionPlayerPhaseWorkspace,
  draftPayload: Record<string, unknown>,
): {
  productionBatches: number;
  factorySpend: number;
  domesticSpend: number;
  governmentSpend: number;
} {
  return calculateDecisionSpendSummaryFromDraft(workspace, normalizeDecisionDraft(draftPayload));
}

function calculateRatioPreview(
  workspace: DecisionPlayerPhaseWorkspace,
  draftPayload: Record<string, unknown>,
) {
  return calculateRatioPreviewFromDraft(workspace, normalizeDecisionDraft(draftPayload));
}

function calculateMarketRevenuePreview(
  workspace: MarketPlayerPhaseWorkspace,
  draftPayload: Record<string, unknown>,
) {
  const domesticRevenue = getSaleOrders(draftPayload)
    .filter((item) => item.market === "domestic")
    .reduce((sum, item) => {
      const inventory = workspace.sellableInventory.find((candidate) => candidate.goodsId === item.goodsId);
      return sum + item.quantity * (inventory?.domesticReferencePrice ?? 0);
    }, 0);
  const overseasRevenue = getSaleOrders(draftPayload)
    .filter((item) => item.market === "overseas")
    .reduce((sum, item) => {
      const inventory = workspace.sellableInventory.find((candidate) => candidate.goodsId === item.goodsId);
      const price = inventory?.overseasReferencePrices.find((candidate) => candidate.regionId === item.regionId);
      return sum + item.quantity * (price?.unitPrice ?? 0);
    }, 0);

  return {
    domesticRevenue,
    overseasRevenue,
    nationalIncome: domesticRevenue + overseasRevenue,
  };
}

// TODO: Remove once legacy 1.0 factory path is fully replaced by phase1Economy
function getAllocatedProductionBatchesForRoute(
  draftPayload: Record<string, unknown>,
  productionOptions: DecisionPlayerPhaseWorkspace["productionOptions"],
  routeId: string,
): number {
  return getAllocatedProductionBatchesForRouteFromDraft(
    normalizeDecisionDraft(draftPayload),
    productionOptions,
    routeId,
  );
}

function getSaleOrders(draftPayload: Record<string, unknown>): Array<{
  goodsId: string;
  market: "domestic" | "overseas";
  quantity: number;
  regionId?: string;
}> {
  return Array.isArray(draftPayload.saleOrders)
    ? draftPayload.saleOrders as Array<{
        goodsId: string;
        market: "domestic" | "overseas";
        quantity: number;
        regionId?: string;
      }>
    : [];
}

function getMarketAllocationTotals(draftPayload: Record<string, unknown>): {
  domesticAllocated: number;
  overseasAllocated: number;
  totalAllocated: number;
  usesPhase1Market: boolean;
} {
  const phase1Market = draftPayload.phase1Market as {
    domesticAllocation?: unknown;
    externalAllocations?: Array<{ marketId?: unknown; quantity?: unknown }>;
  } | undefined;

  if (phase1Market && typeof phase1Market === "object") {
    const domesticAllocated = toSafeQuantity(phase1Market.domesticAllocation);
    const overseasAllocated = Array.isArray(phase1Market.externalAllocations)
      ? phase1Market.externalAllocations.reduce((sum, item) => sum + toSafeQuantity(item.quantity), 0)
      : 0;
    return {
      domesticAllocated,
      overseasAllocated,
      totalAllocated: domesticAllocated + overseasAllocated,
      usesPhase1Market: true,
    };
  }

  const saleOrders = getSaleOrders(draftPayload);
  const domesticAllocated = saleOrders
    .filter((item) => item.market === "domestic")
    .reduce((sum, item) => sum + item.quantity, 0);
  const overseasAllocated = saleOrders
    .filter((item) => item.market === "overseas")
    .reduce((sum, item) => sum + item.quantity, 0);
  return {
    domesticAllocated,
    overseasAllocated,
    totalAllocated: domesticAllocated + overseasAllocated,
    usesPhase1Market: false,
  };
}

function toSafeQuantity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function formatRatio(ratio: {
  domesticMarket: number;
  factory: number;
  governmentFiscal: number;
}): string {
  return `${ratio.domesticMarket} / ${ratio.factory} / ${ratio.governmentFiscal}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return `${Math.round(value * 100) / 100}`;
}

function isIdeologyKey(value: unknown): value is IdeologyKey {
  return value === "liberalism" || value === "egalitarianism" || value === "nationalism";
}
