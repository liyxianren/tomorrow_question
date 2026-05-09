import type {
  BudgetPools,
  DecisionActionOption,
  DecisionPlayerPhaseWorkspace,
  FactoryProductionOption,
  IncomeAllocationRatio,
  PriceTrend,
  RegionAccessLevel,
  TechTreeData,
  TechTreeChainTech,
  TechTreeNode,
} from "../../types";
import type { PhaseDraftByPhase } from "./forms";

const RATIO_KEY_LABELS: Record<string, string> = {
  domesticMarket: "内需",
  factory: "工厂",
  governmentFiscal: "政府",
};

const BUDGET_POOL_LABELS: Record<string, string> = {
  domesticMarket: "国内预算",
  factory: "工厂预算",
  governmentFiscal: "政府预算",
};

export function getMarketRegulationAllowance(workspace: DecisionPlayerPhaseWorkspace): number {
  return Math.max(0, Math.floor(workspace.marketRegulationAllowance ?? 0));
}

export function getBaseBudgetPools(workspace: DecisionPlayerPhaseWorkspace): BudgetPools {
  if (workspace.baseBudgetPools) {
    return workspace.baseBudgetPools;
  }
  const allowance = getMarketRegulationAllowance(workspace);
  return {
    ...workspace.budgetPools,
    governmentFiscal: Math.max(0, workspace.budgetPools.governmentFiscal - allowance),
  };
}

function isMarketRegulationAction(action: DecisionActionOption | undefined): boolean {
  return Boolean(action?.isMarketRegulation);
}

const GOODS_LABELS: Record<string, string> = {
  grain: "粮食",
  cotton: "棉花",
  tea: "茶叶",
  coal: "煤炭",
  minerals: "矿产",
  steel: "钢铁",
  silk: "丝绸",
  oil: "石油",
  rubber: "橡胶",
};

const ROUTE_LABELS: Record<string, string> = {
  handicraft: "手工业",
  mechanized: "机械化",
  steam: "蒸汽动力",
  electrified: "电气化",
};

/** Flatten the Phase 3 chain-based techTree into a flat array for backward compat. */
export function flattenTechTree(techTree: TechTreeData): TechTreeChainTech[] {
  return techTree.chains.flatMap((chain) => chain.techs);
}

export interface TechResearchPreview {
  queuedTechIds: Set<string>;
  unlockedTechIds: Set<string>;
  invalidReasonByTechId: Map<string, string>;
  spendByPool: BudgetPools;
  remainingBudgets: BudgetPools;
}

function calculateNonResearchSpendByPool(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): BudgetPools {
  const productionSpend = draft.factoryPlan.productionOrders.reduce((sum, item) => {
    const option = workspace.productionOptions.find((candidate) => candidate.goodsId === item.goodsId);
    return sum + item.quantity * (option?.unitBudgetCost ?? 0);
  }, 0);
  const phase1ProductionSpend = calculatePhase1ProductionSpend(workspace, draft);
  const expansionSpend = draft.factoryPlan.expansionOrders.reduce((sum, item) => {
    const option = workspace.expansionOptions.find((candidate) => candidate.routeId === item.routeId);
    return sum + item.quantity * (option?.unitBudgetCost ?? 0);
  }, 0);
  const upgradeSpend = draft.factoryPlan.upgradeOrders.reduce((sum, item) => {
    const option = workspace.upgradeOptions.find((candidate) => candidate.routeId === item.routeId);
    return sum + item.quantity * (option?.unitBudgetCost ?? 0);
  }, 0);
  const newFactorySpend = draft.factoryPlan.newFactoryOrders.reduce((sum, item) => {
    const option = workspace.newFactoryOptions.find((candidate) => candidate.routeId === item.routeId);
    return sum + item.quantity * (option?.unitBudgetCost ?? 0);
  }, 0);
  const factoryActionSpend = (draft.factoryPlan.factoryActions ?? []).reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    if (!action) return sum;
    return sum + action.cost - getNumericEffect(action.effects, "factoryBudgetDelta");
  }, 0);
  const factoryActionDomesticBudgetDelta = (draft.factoryPlan.factoryActions ?? []).reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum + getNumericEffect(action?.effects, "domesticMarketBudgetDelta");
  }, 0);
  const factoryActionGovernmentBudgetDelta = (draft.factoryPlan.factoryActions ?? []).reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum
      + getNumericEffect(action?.effects, "governmentFiscalBudgetDelta")
      + getNumericEffect(action?.effects, "governmentFiscalDelta");
  }, 0);
  const domesticSpend = draft.domesticMarketPlan.domesticMarketActions.reduce((sum, selection) => {
    const action = workspace.domesticMarketActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const governmentPurchaseSpend = draft.governmentPlan.pointPurchases.reduce((sum, purchase) => {
    return sum + purchase.quantity * workspace.governmentActions.pointPurchaseCosts[purchase.pointType];
  }, 0);
  const governmentAdminSpend = Math.max(0, draft.governmentPlan.adminPurchases ?? 0)
    * (workspace.governmentReforms?.adminPurchaseCost ?? 0);
  const governmentStrategySpend = draft.governmentPlan.strategySelections.reduce((sum, selection) => {
    const action = workspace.governmentActions.strategies.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const policyActivationSpend = (draft.activatePolicies ?? []).reduce((sum, policyId) => {
    const policy = workspace.governmentReforms?.availablePolicies.find((item) => item.policyId === policyId);
    if (!policy || policy.isActive) {
      return sum;
    }
    return sum + policy.budgetCost;
  }, 0);
  const diplomacySpend = draft.militaryPlan.diplomacyActions.reduce((sum, selection) => {
    const action = workspace.militaryWorkspace.availableDiplomacyActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const colonizationSpend = draft.militaryPlan.unlockColonization && !workspace.militaryWorkspace.colonizationCapability.isUnlocked
    ? (workspace.militaryWorkspace.colonizationCapability.unlockCost ?? 0)
    : 0;
  return {
    domesticMarket: domesticSpend - factoryActionDomesticBudgetDelta,
    factory: productionSpend + phase1ProductionSpend + expansionSpend + upgradeSpend + newFactorySpend + factoryActionSpend,
    governmentFiscal: (
      governmentPurchaseSpend
      + governmentAdminSpend
      + governmentStrategySpend
      + policyActivationSpend
      + diplomacySpend
      + colonizationSpend
      - factoryActionGovernmentBudgetDelta
    ),
  };
}

export function calculatePhase1ProductionSpend(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): number {
  const unitCost = workspace.productionOptions.find((option) => option.goodsId === "phase1_goods")?.unitBudgetCost ?? 1;
  const assignments = draft.phase1Production?.rawMaterialAssignments ?? {};
  const phase1 = workspace.phase1Economy;
  if (!phase1 || phase1.productionModes.length === 0) {
    return Object.values(assignments).reduce((sum, quantity) => {
      return sum + Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0)) * unitCost;
    }, 0);
  }

  const rawMaterials = Math.max(0, phase1.rawMaterials + sumSelectedFactoryActionEffect(workspace, draft, "rawMaterialsDelta"));
  let remainingRawMaterials = rawMaterials;
  let remainingCapacity = Math.max(
    0,
    phase1.productionModes
      .filter((mode) => mode.isAvailable && mode.mode !== "idle")
      .reduce((sum, mode) => sum + Math.max(0, mode.currentCapacity), 0)
      + sumSelectedFactoryActionEffect(workspace, draft, "phase1ProductionRawCapacityDelta"),
  );
  let rawUsed = 0;

  for (const mode of phase1.productionModes.filter((item) => item.mode !== "idle")) {
    const requested = Math.max(0, Math.floor(assignments[mode.mode] ?? 0));
    const capped = Math.min(
      requested,
      Math.max(0, mode.currentCapacity),
      remainingRawMaterials,
      remainingCapacity,
    );
    rawUsed += capped;
    remainingRawMaterials -= capped;
    remainingCapacity -= capped;
  }

  return rawUsed * unitCost;
}

export function calculateDecisionSpendSummary(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
) {
  const nonResearchSpendByPool = calculateNonResearchSpendByPool(workspace, draft);
  const techResearchPreview = calculateTechResearchPreview(workspace, draft, nonResearchSpendByPool);

  return {
    productionBatches: draft.factoryPlan.productionOrders.reduce((sum, item) => sum + item.quantity, 0),
    factorySpend: nonResearchSpendByPool.factory + techResearchPreview.spendByPool.factory,
    domesticSpend: nonResearchSpendByPool.domesticMarket + techResearchPreview.spendByPool.domesticMarket,
    governmentSpend: nonResearchSpendByPool.governmentFiscal + techResearchPreview.spendByPool.governmentFiscal,
  };
}

export type GovernmentSpendBreakdown = {
  total: number;
  government: number;
  military: number;
  coreGovernment: number;
  marketRegulation: number;
  marketRegulationAllowance: number;
  marketRegulationOverflow: number;
  baseGovernmentBudget: number;
  baseGovernmentRemaining: number;
  effectiveGovernmentBudget: number;
  effectiveGovernmentRemaining: number;
};

export function calculateGovernmentSpendBreakdown(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): GovernmentSpendBreakdown {
  const state = calculateGovernmentFiscalState(workspace, draft);
  return {
    total: state.totalDecisionSpend,
    government: state.coreGovernmentSpend + state.marketRegulationSpend,
    military: state.militaryFiscalSpend,
    coreGovernment: state.coreGovernmentSpend,
    marketRegulation: state.marketRegulationSpend,
    marketRegulationAllowance: state.marketRegulationAllowance,
    marketRegulationOverflow: state.marketRegulationOverflow,
    baseGovernmentBudget: state.baseGovernmentBudget,
    baseGovernmentRemaining: state.baseGovernmentRemaining,
    effectiveGovernmentBudget: state.effectiveGovernmentBudget,
    effectiveGovernmentRemaining: state.effectiveGovernmentRemaining,
  };
}

export type GovernmentFiscalState = {
  baseGovernmentBudget: number;
  marketRegulationAllowance: number;
  effectiveGovernmentBudget: number;
  coreGovernmentSpend: number;
  marketRegulationSpend: number;
  marketRegulationOverflow: number;
  militaryFiscalSpend: number;
  baseFiscalSpend: number;
  totalDecisionSpend: number;
  baseGovernmentRemaining: number;
  effectiveGovernmentRemaining: number;
};

export function calculateGovernmentFiscalState(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): GovernmentFiscalState {
  const selectedFactoryActions = draft.factoryPlan.factoryActions ?? [];
  const factoryActionDomesticBudgetDelta = selectedFactoryActions.reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum + getNumericEffect(action?.effects, "domesticMarketBudgetDelta");
  }, 0);
  const factoryActionGovernmentBudgetDelta = selectedFactoryActions.reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum
      + getNumericEffect(action?.effects, "governmentFiscalBudgetDelta")
      + getNumericEffect(action?.effects, "governmentFiscalDelta");
  }, 0);
  const legacyDomesticSpend = draft.domesticMarketPlan.domesticMarketActions.reduce((sum, selection) => {
    const action = workspace.domesticMarketActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const marketRegulationAllowance = Math.max(
    0,
    getMarketRegulationAllowance(workspace) + factoryActionDomesticBudgetDelta - legacyDomesticSpend,
  );
  const baseGovernmentBudget = Math.max(
    0,
    getBaseBudgetPools(workspace).governmentFiscal + factoryActionGovernmentBudgetDelta,
  );
  const governmentPurchaseSpend = draft.governmentPlan.pointPurchases.reduce((sum, purchase) => {
    return sum + purchase.quantity * workspace.governmentActions.pointPurchaseCosts[purchase.pointType];
  }, 0);
  const governmentAdminSpend = Math.max(0, draft.governmentPlan.adminPurchases ?? 0)
    * (workspace.governmentReforms?.adminPurchaseCost ?? 0);
  const coreGovernmentStrategySpend = draft.governmentPlan.strategySelections.reduce((sum, selection) => {
    const action = workspace.governmentActions.strategies.find((item) => item.actionId === selection.actionId);
    return isMarketRegulationAction(action) ? sum : sum + (action?.cost ?? 0);
  }, 0);
  const marketRegulationSpend = draft.governmentPlan.strategySelections.reduce((sum, selection) => {
    const action = workspace.governmentActions.strategies.find((item) => item.actionId === selection.actionId);
    return isMarketRegulationAction(action) ? sum + (action?.cost ?? 0) : sum;
  }, 0);
  const policyActivationSpend = (draft.activatePolicies ?? []).reduce((sum, policyId) => {
    const policy = workspace.governmentReforms?.availablePolicies.find((item) => item.policyId === policyId);
    if (!policy || policy.isActive) {
      return sum;
    }
    return sum + policy.budgetCost;
  }, 0);
  const diplomacySpend = draft.militaryPlan.diplomacyActions.reduce((sum, selection) => {
    const action = workspace.militaryWorkspace.availableDiplomacyActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const colonizationSpend = draft.militaryPlan.unlockColonization && !workspace.militaryWorkspace.colonizationCapability.isUnlocked
    ? (workspace.militaryWorkspace.colonizationCapability.unlockCost ?? 0)
    : 0;

  const coreGovernmentSpend = governmentPurchaseSpend + governmentAdminSpend + coreGovernmentStrategySpend + policyActivationSpend;
  const militaryFiscalSpend = diplomacySpend + colonizationSpend;
  const marketRegulationOverflow = Math.max(0, marketRegulationSpend - marketRegulationAllowance);
  const baseFiscalSpend = coreGovernmentSpend + militaryFiscalSpend + marketRegulationOverflow;
  const totalDecisionSpend = coreGovernmentSpend + militaryFiscalSpend + marketRegulationSpend;
  const effectiveGovernmentBudget = baseGovernmentBudget + marketRegulationAllowance;
  return {
    baseGovernmentBudget,
    marketRegulationAllowance,
    effectiveGovernmentBudget,
    coreGovernmentSpend,
    marketRegulationSpend,
    marketRegulationOverflow,
    militaryFiscalSpend,
    baseFiscalSpend,
    totalDecisionSpend,
    baseGovernmentRemaining: baseGovernmentBudget - baseFiscalSpend,
    effectiveGovernmentRemaining: effectiveGovernmentBudget - totalDecisionSpend,
  };
}

export function calculateRatioPreview(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): IncomeAllocationRatio {
  const nextRatio = { ...workspace.incomeAllocationRatio };

  for (const selection of draft.governmentPlan.strategySelections) {
    const action = workspace.governmentActions.strategies.find((item) => item.actionId === selection.actionId);
    if (!action?.ratioDelta) {
      continue;
    }
    nextRatio.domesticMarket += action.ratioDelta.domesticMarket ?? 0;
    nextRatio.factory += action.ratioDelta.factory ?? 0;
    nextRatio.governmentFiscal += action.ratioDelta.governmentFiscal ?? 0;
  }

  return {
    domesticMarket: roundRatioValue(nextRatio.domesticMarket),
    factory: roundRatioValue(nextRatio.factory),
    governmentFiscal: roundRatioValue(nextRatio.governmentFiscal),
  };
}

export function groupUnlockedProductionOptions(options: FactoryProductionOption[]) {
  const grouped = new Map<string, FactoryProductionOption[]>();
  for (const option of options) {
    if (option.lockedReason) {
      continue;
    }
    const current = grouped.get(option.routeId) ?? [];
    current.push(option);
    grouped.set(option.routeId, current);
  }
  return Array.from(grouped.entries());
}

export function getBudgetPoolLabel(pool: string): string {
  return BUDGET_POOL_LABELS[pool] ?? pool;
}

export function getGoodsLabel(goodsId: string): string {
  return GOODS_LABELS[goodsId] ?? goodsId;
}

export function getRouteLabel(routeId: string): string {
  return ROUTE_LABELS[routeId] ?? routeId;
}

export function buildGovernmentActionDescription(
  action: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"][number],
): string {
  const parts = [action.description ?? "执行后会改变国家结构。"];
  if ((action.militaryPointDelta ?? 0) !== 0) {
    parts.push(`军事点 ${formatSignedValue(action.militaryPointDelta ?? 0)}`);
  }
  if (action.ratioDelta && Object.keys(action.ratioDelta).length > 0) {
    parts.push(`比例：${formatRatioDeltaSummary(action.ratioDelta)}`);
  }
  return parts.join(" ");
}

export function buildMilitaryActionDescription(
  action:
    | DecisionPlayerPhaseWorkspace["militaryWorkspace"]["availableMilitaryActions"][number]
    | DecisionPlayerPhaseWorkspace["militaryWorkspace"]["availableDiplomacyActions"][number],
): string {
  const parts = [action.description ?? "执行后会改变当前海外扩张态势。"];
  if ("maxPerRound" in action) {
    parts.push(`消耗军事点 ${action.cost}。`);
    parts.push(`本轮上限 ${action.maxPerRound} 次。`);
  }
  if ("targetRegionLabel" in action) {
    parts.push(`消耗政府财政 ${action.cost}。`);
    parts.push(`目标区域：${action.targetRegionLabel}。`);
  }
  return parts.join(" ");
}

export function getRegionAccessLevelLabel(accessLevel: RegionAccessLevel): string {
  switch (accessLevel) {
    case "open":
      return "开放市场";
    case "concession":
      return "特许权市场";
    case "colony":
      return "殖民市场";
    case "closed":
    default:
      return "封闭市场";
  }
}

export function buildRegionAccessDescription(
  status: DecisionPlayerPhaseWorkspace["militaryWorkspace"]["regionAccessStatus"][number],
): string {
  const parts = [
    `市场级别：${getRegionAccessLevelLabel(status.accessLevel)}。`,
    status.isAccessible ? "当前可进入。": "当前仍不可进入。",
    status.isDiplomacyEstablished ? "已建交。": "尚未建交。",
  ];
  if (status.acceptedGoods.length > 0) {
    parts.push(`可售：${status.acceptedGoods.map(getGoodsLabel).join("、")}。`);
  }
  return parts.join(" ");
}

export function calculateGovernmentPointPreview(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): {
  techPoints: number;
  militaryPoints: number;
  unlockedTechIds: Set<string>;
} {
  let techPoints = workspace.techPoints;
  let militaryPoints = workspace.militaryPoints;

  for (const purchase of draft.governmentPlan.pointPurchases) {
    if (purchase.pointType === "tech") {
      techPoints += purchase.quantity;
      continue;
    }
    militaryPoints += purchase.quantity;
  }

  for (const selection of draft.governmentPlan.strategySelections) {
    const action = workspace.governmentActions.strategies.find((item) => item.actionId === selection.actionId);
    if (!action) {
      continue;
    }
    techPoints = Math.max(0, techPoints - (action.techPointCost ?? 0) + (action.techPointDelta ?? 0));
    militaryPoints = Math.max(0, militaryPoints - (action.militaryPointCost ?? 0) + (action.militaryPointDelta ?? 0));
  }

  for (const selection of draft.factoryPlan.factoryActions ?? []) {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    if (!action) {
      continue;
    }
    techPoints = Math.max(0, techPoints + getNumericEffect(action.effects, "techPointsDelta"));
    militaryPoints = Math.max(0, militaryPoints + getNumericEffect(action.effects, "militaryPointsDelta"));
  }

  return {
    techPoints,
    militaryPoints,
    unlockedTechIds: new Set(flattenTechTree(workspace.techTree).filter((node) => node.isUnlocked).map((node) => node.techId)),
  };
}

export function calculateTechResearchPreview(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
  existingSpendByPool?: Partial<BudgetPools>,
): TechResearchPreview {
  const initialSpendByPool = existingSpendByPool
    ? {
        domesticMarket: existingSpendByPool.domesticMarket ?? 0,
        factory: existingSpendByPool.factory ?? 0,
        governmentFiscal: existingSpendByPool.governmentFiscal ?? 0,
      }
    : calculateNonResearchSpendByPool(workspace, draft);
  const remainingBudgets: BudgetPools = {
    domesticMarket: workspace.budgetPools.domesticMarket - initialSpendByPool.domesticMarket,
    factory: workspace.budgetPools.factory - initialSpendByPool.factory,
    governmentFiscal: workspace.budgetPools.governmentFiscal - initialSpendByPool.governmentFiscal,
  };
  const allTechs = flattenTechTree(workspace.techTree);
  const queuedTechIds = new Set<string>();
  const unlockedTechIds = new Set(allTechs.filter((node) => node.isUnlocked).map((node) => node.techId));
  const invalidReasonByTechId = new Map<string, string>();

  for (const selection of draft.governmentPlan.techResearch) {
    const tech = allTechs.find((node) => node.techId === selection.techId);
    if (!tech || tech.isUnlocked || queuedTechIds.has(tech.techId)) {
      continue;
    }
    if (!tech.canResearch) {
      invalidReasonByTechId.set(tech.techId, "前置未满足");
      continue;
    }
    queuedTechIds.add(tech.techId);
    unlockedTechIds.add(tech.techId);
  }

  return {
    queuedTechIds,
    unlockedTechIds,
    invalidReasonByTechId,
    spendByPool: { domesticMarket: 0, factory: 0, governmentFiscal: 0 },
    remainingBudgets,
  };
}

export function getTechResearchLockedReason(
  tech: TechTreeChainTech | TechTreeNode,
  preview: TechResearchPreview,
  workspace: DecisionPlayerPhaseWorkspace,
): string | null {
  if (tech.isUnlocked) {
    return "已解锁";
  }

  if (preview.invalidReasonByTechId.has(tech.techId)) {
    return preview.invalidReasonByTechId.get(tech.techId) ?? null;
  }

  if (preview.queuedTechIds.has(tech.techId)) {
    return null;
  }

  const prerequisites = "prerequisites" in tech ? tech.prerequisites : [];
  const missingPrerequisites = prerequisites
    .filter((prerequisite) => !preview.unlockedTechIds.has(prerequisite))
    .map((prerequisite) => flattenTechTree(workspace.techTree).find((candidate) => candidate.techId === prerequisite)?.label ?? prerequisite);

  if (missingPrerequisites.length > 0) {
    return `前置：${missingPrerequisites.join("、")}`;
  }

  const budgetPool = "budgetPool" in tech ? tech.budgetPool : undefined;
  const budgetCost = "budgetCost" in tech ? tech.budgetCost : undefined;
  if (budgetPool && typeof budgetCost === "number" && budgetCost > 0 && preview.remainingBudgets[budgetPool as keyof BudgetPools] < budgetCost) {
    return `${getBudgetPoolLabel(budgetPool)}不足`;
  }

  return null;
}

export function buildTechResearchDescription(
  tech: TechTreeChainTech | TechTreeNode,
  lockedReason: string | null,
  workspace: DecisionPlayerPhaseWorkspace,
  queued: boolean,
): string {
  const budgetPool = "budgetPool" in tech ? tech.budgetPool : undefined;
  const budgetCost = "budgetCost" in tech ? tech.budgetCost : undefined;
  const budgetLabel = (typeof budgetCost === "number" && budgetCost > 0)
    ? `消耗 ${budgetCost} ${getBudgetPoolLabel(budgetPool ?? "governmentFiscal")}。`
    : "通过研究设施推进。";
  const parts = [budgetLabel];
  const prerequisites = "prerequisites" in tech ? tech.prerequisites : [];
  if (prerequisites.length > 0) {
    const labels = prerequisites.map((prerequisite) => {
      return flattenTechTree(workspace.techTree).find((candidate) => candidate.techId === prerequisite)?.label ?? prerequisite;
    });
    parts.push(`前置：${labels.join("、")}。`);
  }
  const unlockSummary = buildTechUnlockSummary(tech, workspace);
  if (unlockSummary) {
    parts.push(unlockSummary);
  }
  if (tech.isUnlocked) {
    parts.push("该科技已解锁。");
  } else if (queued) {
    parts.push("已加入本轮研究队列。");
  } else if (lockedReason) {
    parts.push(`当前锁定：${lockedReason}`);
  }
  return parts.join(" ");
}

export function buildTechUnlockSummary(
  tech: TechTreeChainTech | TechTreeNode,
  workspace: DecisionPlayerPhaseWorkspace,
): string {
  const parts: string[] = [];
  const unlocksGoods = "unlocksGoods" in tech ? tech.unlocksGoods ?? [] : [];
  const unlocksRoutes = "unlocksRoutes" in tech ? tech.unlocksRoutes ?? [] : [];
  const unlocksActions = "unlocksActions" in tech ? tech.unlocksActions ?? [] : [];
  if (unlocksGoods.length > 0) {
    parts.push(`商品：${unlocksGoods.map(getGoodsLabel).join("、")}`);
  }
  if (unlocksRoutes.length > 0) {
    parts.push(`路线：${unlocksRoutes.map(getRouteLabel).join("、")}`);
  }
  if (unlocksActions.length > 0) {
    const actionLabels = unlocksActions.map((actionId) => {
      return workspace.domesticMarketActions.find((action) => action.actionId === actionId)?.label
        ?? workspace.factoryActions?.find((action) => action.actionId === actionId)?.label
        ?? workspace.governmentActions.strategies.find((action) => action.actionId === actionId)?.label
        ?? actionId;
    });
    parts.push(`动作：${actionLabels.join("、")}`);
  }
  return parts.length > 0 ? `解锁 ${parts.join("；")}。` : "";
}

export function formatRatio(ratio: IncomeAllocationRatio): string {
  return `${formatRatioValue(ratio.domesticMarket)} / ${formatRatioValue(ratio.factory)} / ${formatRatioValue(ratio.governmentFiscal)}`;
}

export function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatRatioDeltaSummary(delta: Partial<IncomeAllocationRatio>): string {
  return Object.entries(delta)
    .map(([key, value]) => {
      const label = RATIO_KEY_LABELS[key] ?? key;
      const sign = typeof value === "number" && value > 0 ? "+" : "";
      return `${label} ${sign}${value}`;
    })
    .join(" / ");
}

export function formatPriceTrendText(trend: PriceTrend, adjustment: number): string {
  if (trend === "flat" || adjustment === 0) {
    return "行情持平";
  }

  return trend === "up"
    ? `行情上涨 +${Math.abs(adjustment)}`
    : `行情下跌 -${Math.abs(adjustment)}`;
}

function roundRatioValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 10) / 10;
}

function formatRatioValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

const EFFECT_LABELS: Record<string, string> = {
  handicraftCapacityDelta: "手工业产能",
  domesticMarketCapacityDelta: "国内容量",
  domesticPriceBonusDelta: "国内价格",
  overseasMarketCapacityDelta: "海外容量",
  overseasPriceBonusDelta: "海外价格",
  militaryPointsDelta: "军事点",
  controlledRegionsDelta: "控制区域",
  factoryBudgetDelta: "工厂预算",
  governmentFiscalBudgetDelta: "政府预算",
  domesticMarketBudgetDelta: "国内预算",
  productionOutputMultiplier: "产出倍率",
  rawMaterialsPerTurnDelta: "每回合原材料",
  factoryUpgradeCostReductionPercent: "升级成本",
  factoryExpansionCostReductionPercent: "扩产成本",
  newFactoryCostReductionPercent: "新建成本",
  phase1ProductionOutputBonusPercent: "生产产出",
  rawMaterialsDelta: "原材料",
  phase1ProductionRawCapacityDelta: "投料上限",
};

const TEMPORARY_EFFECT_KEYS = new Set([
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "overseasMarketCapacityDelta",
  "overseasPriceBonusDelta",
  "phase1ProductionRawCapacityDelta",
  "productionOutputMultiplier",
]);

const PERCENT_EFFECT_KEYS = new Set([
  "factoryUpgradeCostReductionPercent",
  "factoryExpansionCostReductionPercent",
  "newFactoryCostReductionPercent",
  "phase1ProductionOutputBonusPercent",
]);

const COST_REDUCTION_EFFECT_KEYS = new Set([
  "factoryUpgradeCostReductionPercent",
  "factoryExpansionCostReductionPercent",
  "newFactoryCostReductionPercent",
]);

const NESTED_EFFECT_LABELS: Record<string, Record<string, string>> = {
  armyDelta: { infantry: "步兵", artillery: "炮兵" },
};

export interface EffectMetric {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  temporary?: boolean;
}

export function buildEffectMetrics(
  effects: Record<string, number | Record<string, number>> | undefined,
): EffectMetric[] {
  if (!effects) return [];

  const metrics: EffectMetric[] = [];

  for (const [key, value] of Object.entries(effects)) {
    if (typeof value === "number") {
      const label = EFFECT_LABELS[key];
      if (!label) continue;
      const tone = value > 0 ? "positive" : value < 0 ? "negative" : undefined;
      const temporary = TEMPORARY_EFFECT_KEYS.has(key);
      const displayValue = key === "productionOutputMultiplier"
        ? `x${value}`
        : PERCENT_EFFECT_KEYS.has(key)
        ? COST_REDUCTION_EFFECT_KEYS.has(key)
          ? `-${Math.abs(value)}%`
          : `${value > 0 ? "+" : ""}${value}%`
        : formatSignedValue(value);
      metrics.push({ label, value: displayValue, tone, temporary });
    } else if (typeof value === "object" && value !== null) {
      const nestedLabels = NESTED_EFFECT_LABELS[key];
      if (!nestedLabels) continue;
      for (const [subKey, subValue] of Object.entries(value)) {
        const subLabel = nestedLabels[subKey];
        if (!subLabel || typeof subValue !== "number") continue;
        const tone = subValue > 0 ? "positive" : subValue < 0 ? "negative" : undefined;
        metrics.push({ label: subLabel, value: formatSignedValue(subValue), tone });
      }
    }
  }

  return metrics;
}

function getNumericEffect(
  effects: Record<string, number | Record<string, number>> | undefined,
  key: string,
): number {
  const value = effects?.[key];
  return typeof value === "number" ? value : 0;
}

function sumSelectedFactoryActionEffect(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
  effectKey: string,
): number {
  return (draft.factoryPlan.factoryActions ?? []).reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum + getNumericEffect(action?.effects, effectKey);
  }, 0);
}
