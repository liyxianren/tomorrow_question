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
  type DecisionFlowState,
  type DecisionStepId,
} from "./decisionFlow";
import {
  getAllocatedProductionBatchesForRoute as getAllocatedProductionBatchesForRouteFromDraft,
} from "../decisionDrafts";
import {
  calculateDecisionSpendSummary as calculateDecisionSpendSummaryFromDraft,
  calculateRatioPreview as calculateRatioPreviewFromDraft,
} from "../decisionShared";
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
    topWorkflow: createTopWorkflowViewModel(currentPhase, decisionFlowState, draftPayload),
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

function createTopWorkflowViewModel(
  currentPhase: GamePhase | null,
  decisionFlowState: DecisionFlowState,
  draftPayload: Record<string, unknown>,
): TopWorkflowViewModel {
  if (currentPhase !== "decision") {
    return null;
  }

  const draft = normalizeDecisionDraft(draftPayload);
  return {
    steps: DECISION_STEP_ORDER.map((step) => {
      const hasDraftContent = hasDecisionStepContent(draft, step);
      return {
        id: step,
        label: getDecisionStepLabel(step),
        statusLabel: hasDraftContent ? "已决策" : "未决策",
        isActive: decisionFlowState.activeStep === step,
      };
    }),
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

  const metrics: ResourceStripMetric[] = [
    { label: "国内消费市场", value: currentPlayerState.budgetPools.domesticMarket },
    { label: "工厂", value: currentPlayerState.budgetPools.factory },
    { label: "政府财政", value: currentPlayerState.budgetPools.governmentFiscal },
  ];

  if (currentPhase === "decision" && currentPlayerWorkspace && "militaryWorkspace" in currentPlayerWorkspace) {
    const spendSummary = calculateDecisionSpendSummary(currentPlayerWorkspace as DecisionPlayerPhaseWorkspace, draftPayload);
    if (spendSummary.factorySpend > currentPlayerState.budgetPools.factory) {
      metrics[1].tone = "warning";
    }
    if (spendSummary.domesticSpend > currentPlayerState.budgetPools.domesticMarket) {
      metrics[0].tone = "warning";
    }
    if (spendSummary.governmentSpend > currentPlayerState.budgetPools.governmentFiscal) {
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

  return {
    title: "国家仪表盘",
    cards: [
      {
        eyebrow: "当前资源",
        title: "三池与点数",
        tone: "accent",
        metrics: currentPlayerState
          ? [
              { label: "国内消费市场", value: currentPlayerState.budgetPools.domesticMarket },
              { label: "工厂", value: currentPlayerState.budgetPools.factory },
              { label: "政府财政", value: currentPlayerState.budgetPools.governmentFiscal },
              { label: "科技点", value: currentPlayerState.techPoints },
              { label: "军事点", value: currentPlayerState.militaryPoints },
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
        eyebrow: "长期态势",
        title: "收入、排名与最近结算",
        body: currentPlayerState
          ? `当前比例 ${formatRatio(currentPlayerState.incomeAllocationRatio)}，累计国家收入 ${currentPlayerState.cumulativeNationalIncome}。`
          : "等待国家结构同步。",
        lines: [
          selfStanding ? `当前名次：第 ${selfStanding.rank} 名` : "当前名次：等待同步",
          leader
            ? `当前榜首：${getCountryLabel(leader.countryId)} · ${leader.cumulativeNationalIncome}`
            : "当前榜首：等待同步",
          settlementWorkspace
            ? `最近结算：${settlementWorkspace.headline}`
            : "最近结算：暂无结算摘要",
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
  const uncheckedDecisionSteps = currentPhase === "decision" ? getUncheckedDecisionSteps(decisionFlowState) : [];
  const uncheckedDecisionStepLabels = uncheckedDecisionSteps.map((step) => getDecisionStepLabel(step));
  const validationLines = buildValidationLines({
    currentPhase,
    currentPlayerState,
    currentPlayerWorkspace,
    draftPayload,
  });
  const blockingLines = extractBlockingLines(validationLines);

  return {
    title: "检查与提交",
    checklist: {
      eyebrow: "步骤检查",
      title: "步骤检查清单",
      tone: uncheckedDecisionStepLabels.length > 0 ? "warning" : "default",
      lines: buildChecklistLines(currentPhase, decisionFlowState, draftPayload),
    },
    blocking: blockingLines.length > 0
      ? {
          eyebrow: "阻断性问题",
          title: "当前存在阻断性问题",
          tone: "warning",
          lines: blockingLines,
        }
      : null,
    submit: {
      eyebrow: "最终提交",
      title: currentPhase === "settlement" ? "本阶段无玩家提交" : "提交确认",
      body:
        currentPhase === "settlement"
          ? "财政结算阶段由系统自动推进，无需玩家提交。"
          : uncheckedDecisionStepLabels.length > 0
            ? `${uncheckedDecisionStepLabels.join("、")}尚未决策。`
            : currentSubmittedStatus === "pending"
              ? "所有关键步骤都在这里完成最终确认。"
              : currentSubmittedStatus === "submitted"
                ? "你已完成本阶段提交，等待系统结算。"
                : "你未在截止前完成操作，系统已代为确认当前阶段安排。",
      draftSummaryLines: buildDraftSummaryLines(currentPhase, draftPayload),
      warningLines:
        currentPhase === "decision" && uncheckedDecisionStepLabels.length > 0
          ? [`未决策：${uncheckedDecisionStepLabels.join("、")}。`]
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
      eyebrow: "阶段操作台",
      title: "国家决策",
      body: "把三池预算转成生产、内需和政府策略，并为下一阶段准备结构条件。",
      pills: [],
    };
  }

  if (currentPhase === "market") {
    return {
      eyebrow: "阶段操作台",
      title: "市场出售",
      body: "把库存分配到国内和海外市场，直接形成当回合国家收入。",
      pills: currentPlayerState
        ? [
            `当前国家收入 ${currentPlayerState.nationalIncome}`,
            `内销 ${currentPlayerState.domesticSalesRevenue}`,
            `外销 ${currentPlayerState.overseasSalesRevenue}`,
          ]
        : [],
    };
  }

  return {
    eyebrow: "阶段操作台",
    title: "财政结算",
    body: "系统将按当前收入分配比例重分三池，并生成下一回合结构起点。",
    pills: currentPlayerState
      ? [
          `累计国家收入 ${currentPlayerState.cumulativeNationalIncome}`,
          `当前比例 ${formatRatio(currentPlayerState.incomeAllocationRatio)}`,
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
    return ["等待当前阶段资源同步。"];
  }

  if (currentPhase === "decision" && "militaryWorkspace" in currentPlayerWorkspace) {
    const workspace = currentPlayerWorkspace as DecisionPlayerPhaseWorkspace;
    const spendSummary = calculateDecisionSpendSummary(workspace, draftPayload);
    const draft = normalizeDecisionDraft(draftPayload);
    if (decisionFlowState.activeStep === "factory") {
      const lines = [
        `工厂 · 剩余 ${currentPlayerState.budgetPools.factory - spendSummary.factorySpend}`,
      ];
      const phase1 = workspace.phase1Economy;
      if (phase1) {
        const rawAssignments = (draftPayload as Record<string, unknown>).phase1Production as { rawMaterialAssignments?: Record<string, number> } | undefined;
        const assignments = rawAssignments?.rawMaterialAssignments ?? {};
        const totalAssigned = Object.values(assignments).reduce((s, v) => s + v, 0);
        lines.push(`原材料 ${phase1.rawMaterials} · 已分配 ${totalAssigned}`);
        lines.push(`库存 ${phase1.goodsInventory} · 国内需求 ${phase1.domesticDemand}`);
      }
      return lines;
    }

    if (decisionFlowState.activeStep === "domestic") {
      return [
        `消费 · 剩余 ${currentPlayerState.budgetPools.domesticMarket - spendSummary.domesticSpend}`,
        `已选动作 ${getDomesticActionCount(draftPayload)} 项`,
      ];
    }

    if (decisionFlowState.activeStep === "military") {
      return [
        `军事 · 财政剩余 ${currentPlayerState.budgetPools.governmentFiscal - spendSummary.governmentSpend}`,
        `军事动作 ${draft.militaryPlan.militaryActions.length} 次 / 建交 ${draft.militaryPlan.diplomacyActions.length} 项`,
        `海外承接预览 ${workspace.militaryWorkspace.overseasCapacity}`,
      ];
    }

    return [
      `政府 · 剩余 ${currentPlayerState.budgetPools.governmentFiscal - spendSummary.governmentSpend}`,
      `比例预告 ${formatRatio(calculateRatioPreview(workspace, draftPayload))}`,
    ];
  }

  if (currentPhase === "market" && "sellableInventory" in currentPlayerWorkspace) {
    const workspace = currentPlayerWorkspace as MarketPlayerPhaseWorkspace;
    const saleOrders = getSaleOrders(draftPayload);
    const domesticAllocated = saleOrders
      .filter((item) => item.market === "domestic")
      .reduce((sum, item) => sum + item.quantity, 0);
    const overseasAllocated = saleOrders
      .filter((item) => item.market === "overseas")
      .reduce((sum, item) => sum + item.quantity, 0);

    return [
      `国内承接剩余 ${Math.max(workspace.domesticMarketCapacity - domesticAllocated, 0)}`,
      `海外承接剩余 ${Math.max(workspace.overseasMarketCapacity - overseasAllocated, 0)}`,
    ];
  }

  return [`本回合国家收入 ${currentPlayerState.nationalIncome}`];
}

function buildChecklistLines(
  currentPhase: GamePhase | null,
  decisionFlowState: DecisionFlowState,
  draftPayload: Record<string, unknown>,
): string[] {
  if (currentPhase === "decision") {
    const draft = normalizeDecisionDraft(draftPayload);
    return DECISION_STEP_ORDER.map((step) => {
      const decided = hasDecisionStepContent(draft, step);
      const status = decided ? "已决策" : "未决策";
      const summary = getDecisionStepCompletionSummary(draft, step);
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
    if (spendSummary.factorySpend > currentPlayerState.budgetPools.factory) {
      lines.push(`工厂计划消耗 ${spendSummary.factorySpend}，超过工厂预算 ${currentPlayerState.budgetPools.factory}。`);
    }
    if (spendSummary.domesticSpend > currentPlayerState.budgetPools.domesticMarket) {
      lines.push(`内需动作消耗 ${spendSummary.domesticSpend}，超过国内消费市场预算 ${currentPlayerState.budgetPools.domesticMarket}。`);
    }
    if (spendSummary.governmentSpend > currentPlayerState.budgetPools.governmentFiscal) {
      lines.push(`政府动作消耗 ${spendSummary.governmentSpend}，超过政府财政预算 ${currentPlayerState.budgetPools.governmentFiscal}。`);
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
    const domesticAllocated = getSaleOrders(draftPayload)
      .filter((item) => item.market === "domestic")
      .reduce((sum, item) => sum + item.quantity, 0);
    const overseasAllocated = getSaleOrders(draftPayload)
      .filter((item) => item.market === "overseas")
      .reduce((sum, item) => sum + item.quantity, 0);

    if (domesticAllocated > currentPlayerWorkspace.domesticMarketCapacity) {
      lines.push(`国内卖量 ${domesticAllocated} 超过承接能力 ${currentPlayerWorkspace.domesticMarketCapacity}。`);
    }
    if (overseasAllocated > currentPlayerWorkspace.overseasMarketCapacity) {
      lines.push(`海外卖量 ${overseasAllocated} 超过承接能力 ${currentPlayerWorkspace.overseasMarketCapacity}。`);
    }
    for (const inventory of currentPlayerWorkspace.sellableInventory) {
      const allocated = getSaleOrders(draftPayload)
        .filter((item) => item.goodsId === inventory.goodsId)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (allocated > inventory.quantity) {
        lines.push(`${inventory.label} 已分配 ${allocated}，超过库存 ${inventory.quantity}。`);
      }
    }

    return lines.length > 0 ? lines : ["当前草稿未突破任何硬约束。"];
  }

  return ["当前草稿未突破任何硬约束。"];
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

function normalizeDecisionDraft(draftPayload: Record<string, unknown>) {
  const draft = draftPayload as {
    factoryPlan?: {
      productionOrders?: Array<{ goodsId: string; quantity: number }>;
      expansionOrders?: Array<{ routeId: string; quantity: number }>;
      upgradeOrders?: Array<{ routeId: string; quantity: number }>;
      newFactoryOrders?: Array<{ routeId: string; quantity: number }>;
    };
    domesticMarketPlan?: {
      domesticMarketActions?: Array<{ actionId: string }>;
    };
    governmentPlan?: {
      pointPurchases?: Array<{ pointType: "tech" | "military"; quantity: number }>;
      strategySelections?: Array<{ actionId: string }>;
      techResearch?: Array<{ techId: string }>;
    };
    militaryPlan?: {
      unlockColonization?: boolean;
      militaryActions?: Array<{ actionId: string }>;
      diplomacyActions?: Array<{ actionId: string }>;
      colonizationActions?: Array<{ targetRegionId: string }>;
    };
    abilitySelection?: {
      abilityId?: string;
      targetIdeology?: string;
    };
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
    },
    domesticMarketPlan: {
      domesticMarketActions: draft.domesticMarketPlan?.domesticMarketActions ?? [],
    },
    governmentPlan: {
      pointPurchases: draft.governmentPlan?.pointPurchases ?? [],
      strategySelections: draft.governmentPlan?.strategySelections ?? [],
      techResearch: draft.governmentPlan?.techResearch ?? [],
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
    phase1Production: {
      rawMaterialAssignments: draft.phase1Production?.rawMaterialAssignments ?? {},
    },
  };
}

function hasDecisionStepContent(
  draft: ReturnType<typeof normalizeDecisionDraft>,
  step: DecisionStepId,
): boolean {
  if (step === "factory") {
    const hasPhase1 = Object.keys(draft.phase1Production.rawMaterialAssignments).length > 0
      && Object.values(draft.phase1Production.rawMaterialAssignments).some((v) => v > 0);
    return (
      hasPhase1 ||
      draft.factoryPlan.productionOrders.some((o) => o.quantity > 0) ||
      draft.factoryPlan.expansionOrders.some((o) => o.quantity > 0) ||
      draft.factoryPlan.upgradeOrders.some((o) => o.quantity > 0) ||
      draft.factoryPlan.newFactoryOrders.some((o) => o.quantity > 0)
    );
  }
  if (step === "domestic") {
    return draft.domesticMarketPlan.domesticMarketActions.length > 0;
  }
  if (step === "military") {
    return (
      draft.militaryPlan.unlockColonization
      || draft.militaryPlan.militaryActions.length > 0
      || draft.militaryPlan.diplomacyActions.length > 0
      || draft.militaryPlan.colonizationActions.length > 0
    );
  }
  if (step === "research") {
    return draft.governmentPlan.techResearch.length > 0;
  }
  return (
    draft.governmentPlan.pointPurchases.length > 0
    || draft.governmentPlan.strategySelections.length > 0
    || draft.governmentPlan.techResearch.length > 0
    || Boolean(draft.abilitySelection?.abilityId)
  );
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

function getDomesticActionCount(draftPayload: Record<string, unknown>): number {
  return normalizeDecisionDraft(draftPayload).domesticMarketPlan.domesticMarketActions.length;
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

function formatRatio(ratio: {
  domesticMarket: number;
  factory: number;
  governmentFiscal: number;
}): string {
  return `${ratio.domesticMarket} / ${ratio.factory} / ${ratio.governmentFiscal}`;
}

function isIdeologyKey(value: unknown): value is IdeologyKey {
  return value === "liberalism" || value === "egalitarianism" || value === "nationalism";
}
