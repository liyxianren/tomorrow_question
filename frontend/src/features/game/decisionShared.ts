import i18n, { translateBackend } from "../../i18n";
import type {
  BudgetPools,
  DecisionActionOption,
  DecisionPlayerPhaseWorkspace,
  FactoryProductionOption,
  IncomeAllocationRatio,
  Phase1EconomyWorkspace,
  PriceTrend,
  RegionAccessStatus,
  RegionAccessLevel,
  TechTreeData,
  TechTreeChainTech,
  TechTreeNode,
} from "../../types";
import type { PhaseDraftByPhase } from "./forms";
import {
  DOMESTIC_PRICE_CEILING_RATIO,
  DOMESTIC_PRICE_FLOOR_RATIO,
} from "./marketMath";

const RATIO_KEY_LABELS: Record<string, string> = {
  domesticMarket: i18n.t("game:ratioKey.domesticMarket", "内需"),
  factory: i18n.t("game:ratioKey.factory", "工厂"),
  governmentFiscal: i18n.t("game:ratioKey.governmentFiscal", "政府"),
};

const BUDGET_POOL_LABELS: Record<string, string> = {
  domesticMarket: i18n.t("game:budgetPool.domesticMarket", "国内预算"),
  factory: i18n.t("game:budgetPool.factory", "工厂预算"),
  governmentFiscal: i18n.t("game:budgetPool.governmentFiscal", "政府预算"),
};

const DEFAULT_INCOME_ALLOCATION_RATIO: IncomeAllocationRatio = {
  domesticMarket: 3,
  factory: 3,
  governmentFiscal: 4,
};

const INCOME_RATIO_KEYS = ["domesticMarket", "factory", "governmentFiscal"] as const;
type IncomeRatioKey = typeof INCOME_RATIO_KEYS[number];

function normalizeRatioKey(key: string): IncomeRatioKey | null {
  if (key === "consumption") return "domesticMarket";
  if (key === "fiscal") return "governmentFiscal";
  if ((INCOME_RATIO_KEYS as readonly string[]).includes(key)) return key as IncomeRatioKey;
  return null;
}

function normalizeIncomeRatio(ratio: Partial<IncomeAllocationRatio> | undefined): IncomeAllocationRatio {
  return {
    domesticMarket: Math.max(0, ratio?.domesticMarket ?? DEFAULT_INCOME_ALLOCATION_RATIO.domesticMarket),
    factory: Math.max(0, ratio?.factory ?? DEFAULT_INCOME_ALLOCATION_RATIO.factory),
    governmentFiscal: Math.max(0, ratio?.governmentFiscal ?? DEFAULT_INCOME_ALLOCATION_RATIO.governmentFiscal),
  };
}

function applyRatioDelta(
  ratio: IncomeAllocationRatio,
  delta: Partial<IncomeAllocationRatio> | Record<string, unknown> | undefined,
  multiplier = 1,
): IncomeAllocationRatio {
  const next = { ...ratio };
  if (!delta) return next;
  for (const [rawKey, rawValue] of Object.entries(delta)) {
    const key = normalizeRatioKey(rawKey);
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!key || !Number.isFinite(value)) continue;
    next[key] = Math.max(0, next[key] + value * multiplier);
  }
  return next;
}

function applyRatioEffects(ratio: IncomeAllocationRatio, effects: Record<string, unknown> | undefined): IncomeAllocationRatio {
  if (!effects) return ratio;
  const override = effects.ratioOverride;
  if (override && typeof override === "object") {
    const next = { ...DEFAULT_INCOME_ALLOCATION_RATIO };
    for (const [rawKey, rawValue] of Object.entries(override as Record<string, unknown>)) {
      const key = normalizeRatioKey(rawKey);
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (!key || !Number.isFinite(value)) continue;
      next[key] = Math.max(0, value);
    }
    return next;
  }
  return applyRatioDelta(ratio, effects.ratioDelta as Record<string, unknown> | undefined);
}

export function getBaseBudgetPools(workspace: DecisionPlayerPhaseWorkspace): BudgetPools {
  return workspace.baseBudgetPools ?? workspace.budgetPools;
}

export type DecisionMarketReferencePrice = {
  basePrice?: number;
  existingPriceBonus: number;
  priceBeforeFloor?: number;
  price?: number;
  minimumPrice: number;
  maximumPrice: number;
  isFloored: boolean;
  isCapped: boolean;
};

export function calculateDecisionMarketReferencePrice(
  phase1: Phase1EconomyWorkspace | null | undefined,
  selectedPriceDelta = 0,
): DecisionMarketReferencePrice {
  const basePrice = pickFiniteNumber(
    phase1?.equilibriumPrice,
    phase1?.domesticBasePricePreview,
    phase1?.domesticPricePreview,
  );
  const minimumPrice = phase1?.minimumDomesticPrice
    ?? (basePrice == null ? 0 : Math.max(0, basePrice * DOMESTIC_PRICE_FLOOR_RATIO));
  const maximumPrice = phase1?.domesticPriceCeiling
    ?? (basePrice == null ? Number.POSITIVE_INFINITY : Math.max(0, basePrice * DOMESTIC_PRICE_CEILING_RATIO));
  const existingPriceBonus = phase1?.domesticPriceBonus ?? 0;
  const priceBeforeFloor = basePrice == null
    ? undefined
    : basePrice + existingPriceBonus + selectedPriceDelta;
  const price = priceBeforeFloor == null
    ? undefined
    : Math.min(maximumPrice, Math.max(minimumPrice, priceBeforeFloor));

  return {
    basePrice,
    existingPriceBonus,
    priceBeforeFloor,
    price,
    minimumPrice,
    maximumPrice,
    isFloored: priceBeforeFloor != null && priceBeforeFloor < minimumPrice,
    isCapped: priceBeforeFloor != null && priceBeforeFloor > maximumPrice,
  };
}

function pickFiniteNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function isMarketRegulationAction(action: DecisionActionOption | undefined): boolean {
  return Boolean(action?.isMarketRegulation);
}

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
  const rawMaterialPurchaseSpend = getSelectedRawMaterialPurchaseQuantity(workspace, draft)
    * (workspace.phase1Economy?.rawMaterialPurchaseUnitCost ?? 1);
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
  const adminPurchaseSpend = Math.max(0, draft.governmentPlan.adminPurchases ?? 0)
    * (workspace.governmentReforms?.adminPurchaseCost ?? 0);
  const governmentPurchaseSpend = draft.governmentPlan.pointPurchases.reduce((sum, purchase) => {
    return sum + purchase.quantity * workspace.governmentActions.pointPurchaseCosts[purchase.pointType];
  }, adminPurchaseSpend);
  const governmentStrategySpend = draft.governmentPlan.strategySelections.reduce((sum, selection) => {
    const action = workspace.governmentActions.strategies.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const policyActivationSpend = (draft.activatePolicies ?? []).reduce((sum, policyId) => {
    const policy = workspace.governmentReforms?.availablePolicies.find((item) => item.policyId === policyId);
    if (!policy || policy.isActive) {
      return sum;
    }
    return sum + policy.budgetCost || 0;
  }, 0);
  const militaryActionSpend = draft.militaryPlan.militaryActions.reduce((sum, selection) => {
    const action = workspace.militaryWorkspace.availableMilitaryActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const diplomacySpend = 0;
  return {
    domesticMarket: domesticSpend - factoryActionDomesticBudgetDelta,
    factory: productionSpend + phase1ProductionSpend + expansionSpend + upgradeSpend + newFactorySpend + rawMaterialPurchaseSpend + factoryActionSpend,
    governmentFiscal: (
      governmentPurchaseSpend
      + governmentStrategySpend
      + policyActivationSpend
      + militaryActionSpend
      + diplomacySpend
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

  const capacityDeltaByMode = getSelectedProductionCapacityDeltaByMode(workspace, draft);
  const rawMaterials = Math.max(
    0,
    phase1.rawMaterials
      + sumSelectedFactoryActionEffect(workspace, draft, "rawMaterialsDelta")
      + getSelectedRawMaterialPurchaseQuantity(workspace, draft),
  );
  let remainingRawMaterials = rawMaterials;
  let remainingCapacity = Math.max(
    0,
    phase1.productionModes
      .filter((mode) => mode.isAvailable && mode.mode !== "idle")
      .reduce((sum, mode) => sum + Math.max(0, mode.currentCapacity + (capacityDeltaByMode[mode.mode] ?? 0)), 0)
      + sumSelectedFactoryActionEffect(workspace, draft, "phase1ProductionRawCapacityDelta"),
  );
  let rawUsed = 0;

  for (const mode of phase1.productionModes.filter((item) => item.mode !== "idle")) {
    const requested = Math.max(0, Math.floor(assignments[mode.mode] ?? 0));
    const capped = Math.min(
      requested,
      Math.max(0, mode.currentCapacity + (capacityDeltaByMode[mode.mode] ?? 0)),
      remainingRawMaterials,
      remainingCapacity,
    );
    rawUsed += capped;
    remainingRawMaterials -= capped;
    remainingCapacity -= capped;
  }

  return rawUsed * unitCost;
}

export function clampDecisionPhase1ProductionDraft(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): PhaseDraftByPhase["decision"] {
  const phase1 = workspace.phase1Economy;
  const assignments = draft.phase1Production?.rawMaterialAssignments ?? {};
  if (!phase1 || phase1.productionModes.length === 0 || Object.keys(assignments).length === 0) {
    return draft;
  }

  const requested = shiftUpgradedPhase1Assignments(workspace, draft, assignments);
  const capacityDeltaByMode = getSelectedProductionCapacityDeltaByMode(workspace, draft);
  const rawMaterials = Math.max(
    0,
    phase1.rawMaterials
      + sumSelectedFactoryActionEffect(workspace, draft, "rawMaterialsDelta")
      + getSelectedRawMaterialPurchaseQuantity(workspace, draft),
  );
  const unitCost = workspace.productionOptions.find((option) => option.goodsId === "phase1_goods")?.unitBudgetCost ?? 1;
  const availableFactoryBudget = Math.max(0, workspace.budgetPools.factory + getSelectedFactoryBudgetDelta(workspace, draft) - calculateFactorySpendExcludingPhase1(workspace, draft));
  let remainingBudgetRaw = unitCost > 0 ? Math.floor(availableFactoryBudget / unitCost) : Number.MAX_SAFE_INTEGER;
  let remainingRawMaterials = rawMaterials;
  let remainingCapacity = Math.max(
    0,
    phase1.productionModes
      .filter((mode) => mode.isAvailable && mode.mode !== "idle")
      .reduce((sum, mode) => sum + Math.max(0, mode.currentCapacity + (capacityDeltaByMode[mode.mode] ?? 0)), 0)
      + sumSelectedFactoryActionEffect(workspace, draft, "phase1ProductionRawCapacityDelta"),
  );
  const nextAssignments: Record<string, number> = {};

  for (const mode of phase1.productionModes.filter((item) => item.mode !== "idle")) {
    const requestedQuantity = Math.max(0, Math.floor(requested[mode.mode] ?? 0));
    const capped = Math.min(
      requestedQuantity,
      Math.max(0, mode.currentCapacity + (capacityDeltaByMode[mode.mode] ?? 0)),
      remainingRawMaterials,
      remainingCapacity,
      remainingBudgetRaw,
    );
    if (capped > 0) {
      nextAssignments[mode.mode] = capped;
    }
    remainingRawMaterials -= capped;
    remainingCapacity -= capped;
    remainingBudgetRaw -= capped;
  }

  if (areNumberRecordsEqual(assignments, nextAssignments)) {
    return draft;
  }

  return {
    ...draft,
    phase1Production: Object.keys(nextAssignments).length > 0
      ? { rawMaterialAssignments: nextAssignments }
      : undefined,
  };
}

function shiftUpgradedPhase1Assignments(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
  assignments: Record<string, number>,
): Record<string, number> {
  const shifted: Record<string, number> = { ...assignments };

  for (const order of draft.factoryPlan.upgradeOrders) {
    const option = workspace.upgradeOptions.find((item) => item.routeId === order.routeId);
    if (!option) {
      continue;
    }
    const quantity = Math.min(
      Math.max(0, Math.floor(order.quantity ?? 0)),
      Math.max(0, option.maxQuantity),
    );
    if (quantity <= 0) {
      continue;
    }
    const capacityDelta = quantity * Math.max(1, option.capacityDelta ?? 1);
    const sourceCapacity = workspace.phase1Economy?.productionModes.find((mode) => mode.mode === option.sourceRouteId)?.currentCapacity ?? 0;
    const sourceAfterUpgrade = Math.max(0, sourceCapacity - capacityDelta);
    const sourceRequested = Math.max(0, Math.floor(shifted[option.sourceRouteId] ?? 0));
    const overflow = Math.max(0, sourceRequested - sourceAfterUpgrade);
    if (overflow <= 0) {
      continue;
    }
    const remainingSource = sourceRequested - overflow;
    if (remainingSource > 0) {
      shifted[option.sourceRouteId] = remainingSource;
    } else {
      delete shifted[option.sourceRouteId];
    }
    shifted[option.routeId] = Math.max(0, Math.floor(shifted[option.routeId] ?? 0)) + overflow;
  }

  return shifted;
}

function calculateFactorySpendExcludingPhase1(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): number {
  const productionSpend = draft.factoryPlan.productionOrders.reduce((sum, item) => {
    const option = workspace.productionOptions.find((candidate) => candidate.goodsId === item.goodsId);
    return sum + item.quantity * (option?.unitBudgetCost ?? 0);
  }, 0);
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
  const rawMaterialPurchaseSpend = getSelectedRawMaterialPurchaseQuantity(workspace, draft)
    * (workspace.phase1Economy?.rawMaterialPurchaseUnitCost ?? 1);
  const factoryActionSpend = (draft.factoryPlan.factoryActions ?? []).reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    if (!action) return sum;
    return sum + action.cost;
  }, 0);
  return productionSpend + expansionSpend + upgradeSpend + newFactorySpend + rawMaterialPurchaseSpend + factoryActionSpend;
}

function getSelectedFactoryBudgetDelta(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): number {
  return (draft.factoryPlan.factoryActions ?? []).reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum + getNumericEffect(action?.effects, "factoryBudgetDelta");
  }, 0);
}

function areNumberRecordsEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (Math.max(0, Math.floor(left[key] ?? 0)) !== Math.max(0, Math.floor(right[key] ?? 0))) {
      return false;
    }
  }
  return true;
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
  const factoryActionGovernmentBudgetDelta = selectedFactoryActions.reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum
      + getNumericEffect(action?.effects, "governmentFiscalBudgetDelta")
      + getNumericEffect(action?.effects, "governmentFiscalDelta");
  }, 0);
  const marketRegulationAllowance = 0;
  const baseGovernmentBudget = Math.max(
    0,
    getBaseBudgetPools(workspace).governmentFiscal + factoryActionGovernmentBudgetDelta,
  );
  const effectiveGovernmentBudget = baseGovernmentBudget;
  const adminPurchaseSpend = Math.max(0, draft.governmentPlan.adminPurchases ?? 0)
    * (workspace.governmentReforms?.adminPurchaseCost ?? 0);
  const governmentPurchaseSpend = draft.governmentPlan.pointPurchases.reduce((sum, purchase) => {
    return sum + purchase.quantity * workspace.governmentActions.pointPurchaseCosts[purchase.pointType];
  }, adminPurchaseSpend);
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
    return sum + policy.budgetCost || 0;
  }, 0);
  const militaryActionSpend = draft.militaryPlan.militaryActions.reduce((sum, selection) => {
    const action = workspace.militaryWorkspace.availableMilitaryActions.find((item) => item.actionId === selection.actionId);
    return sum + (action?.cost ?? 0);
  }, 0);
  const diplomacySpend = 0;

  const coreGovernmentSpend = governmentPurchaseSpend + coreGovernmentStrategySpend + policyActivationSpend;
  const militaryFiscalSpend = militaryActionSpend + diplomacySpend;
  const totalDecisionSpend = coreGovernmentSpend + militaryFiscalSpend + marketRegulationSpend;
  const baseFiscalSpend = totalDecisionSpend;
  return {
    baseGovernmentBudget,
    marketRegulationAllowance,
    effectiveGovernmentBudget,
    coreGovernmentSpend,
    marketRegulationSpend,
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
  let nextRatio = normalizeIncomeRatio(workspace.effectiveIncomeAllocationRatio ?? workspace.incomeAllocationRatio);

  for (const selection of draft.governmentPlan.strategySelections) {
    const action = workspace.governmentActions.strategies.find((item) => item.actionId === selection.actionId);
    nextRatio = applyRatioDelta(nextRatio, action?.ratioDelta);
  }

  for (const reformId of draft.reforms ?? []) {
    const reform = workspace.governmentReforms?.availableReforms.find((item) => item.reformId === reformId);
    nextRatio = applyRatioEffects(nextRatio, reform?.effects);
  }

  for (const policyId of draft.activatePolicies ?? []) {
    const policy = workspace.governmentReforms?.availablePolicies.find((item) => item.policyId === policyId);
    if (policy && !policy.isActive) {
      nextRatio = applyRatioEffects(nextRatio, policy.effects);
    }
  }

  for (const policyId of draft.deactivatePolicies ?? []) {
    const policy = workspace.governmentReforms?.availablePolicies.find((item) => item.policyId === policyId);
    const ratioDelta = policy?.effects?.ratioDelta;
    if (policy?.isActive && ratioDelta && typeof ratioDelta === "object") {
      nextRatio = applyRatioDelta(nextRatio, ratioDelta as Record<string, unknown>, -1);
    }
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
  return i18n.t(`game:goods.${goodsId}`, goodsId);
}

export function getRouteLabel(routeId: string): string {
  return i18n.t(`game:productionRoute.${routeId}`, routeId);
}

export function buildGovernmentActionDescription(
  action: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"][number],
): string {
  const parts = [action.description ? translateBackend(action.description) : i18n.t("game:effect.defaultDesc", "执行后会改变国家结构。")];
  if ((((action as any).militaryPointDelta ?? 0) ?? 0) !== 0) {
    parts.push(i18n.t("game:effect.militaryPointsValue", "军事点 {{value}}", { value: formatSignedValue(((action as any).militaryPointDelta ?? 0) ?? 0) }));
  }
  if (action.ratioDelta && Object.keys(action.ratioDelta).length > 0) {
    parts.push(i18n.t("game:effect.ratioLabel", "比例：{{ratio}}", { ratio: formatRatioDeltaSummary(action.ratioDelta) }));
  }
  return parts.join(" ");
}

export function buildMilitaryActionDescription(
  action: DecisionPlayerPhaseWorkspace["militaryWorkspace"]["availableMilitaryActions"][number],
): string {
  const parts = [action.description ? translateBackend(action.description) : i18n.t("game:effect.defaultMilitaryDesc", "执行后会改变当前海外扩张态势。")];
  if ("maxPerRound" in action) {
    parts.push(i18n.t("game:effect.militaryGovernmentFiscalCost", "消耗政府财政 {{cost}}。", { cost: action.cost }));
    parts.push(i18n.t("game:effect.maxPerRound", "本轮上限 {{max}} 次。", { max: action.maxPerRound }));
  }
  return parts.join(" ");
}

export function getRegionAccessLevelLabel(accessLevel: RegionAccessLevel): string {
  switch (accessLevel) {
    case "open":
      return i18n.t("game:accessLabel.open", "开放市场");
    case "concession":
      return i18n.t("game:accessLabel.concession", "特许权市场");
    case "colony":
      return i18n.t("game:accessLabel.colony", "控制市场");
    case "closed":
    default:
      return i18n.t("game:accessLabel.closed", "封闭市场");
  }
}

export function buildRegionAccessDescription(
  status: DecisionPlayerPhaseWorkspace["militaryWorkspace"]["regionAccessStatus"][number],
  options: { includeRouteBlockadeDetail?: boolean } = {},
): string {
  const parts = [
    i18n.t("game:accessLabel.marketLevel", "市场级别：{{level}}。", { level: getRegionAccessLevelLabel(status.accessLevel) }),
    status.isAccessible ? i18n.t("game:accessLabel.accessible", "当前可进入。") : i18n.t("game:accessLabel.notAccessible", "当前仍不可进入。"),
  ];
  if (status.acceptedGoods.length > 0) {
    parts.push(i18n.t("game:accessLabel.sellable", "可售：{{goods}}。", { goods: status.acceptedGoods.map(getGoodsLabel).join("、") }));
  }
  if (options.includeRouteBlockadeDetail !== false) {
    const routeBlockadeDetail = buildRegionRouteBlockadeDetail(status);
    if (routeBlockadeDetail) {
      parts.push(routeBlockadeDetail);
    }
  }
  return parts.join(" ");
}

export function buildRegionRouteBlockadeDetail(status: RegionAccessStatus): string | null {
  if (status.lockReason !== "route_blocked") {
    return null;
  }
  return i18n.t("game:market.routeBlockedDetail", {
    nodes: formatBlockedOceanNodeList(status.blockedOceanNodes),
    effect: i18n.t("game:market.routeBlockedEffect", "Cannot sell to this region; capacity counts as 0."),
    resolution: i18n.t("game:market.routeBlockedResolution", "Assign more fleets to this region, break the opposing regional blockade, or wait for event / policy changes."),
    defaultValue: "Blocked region: {{nodes}}. Impact: {{effect}} Resolution: {{resolution}}",
  });
}

export function formatBlockedOceanNodeList(
  nodes: RegionAccessStatus["blockedOceanNodes"] | undefined,
): string {
  if (!nodes || nodes.length === 0) {
    return i18n.t("game:market.unknownOceanNode", "unknown region");
  }
  return nodes.map((node) => {
    const label = node.label
      ? translateBackend(node.label)
      : i18n.t(`game:region.${node.nodeId}`, {
        defaultValue: i18n.t(`game:oceanNode.${node.nodeId}`, node.nodeId),
      });
    const controller = node.controllerLabel
      ? translateBackend(node.controllerLabel)
      : i18n.t(`game:country.${node.controller}`, node.controller);
    return node.controller
      ? i18n.t("game:market.blockedOceanNodeWithController", {
          node: label,
          controller,
          defaultValue: "{{node}} (controlled by {{controller}})",
        })
      : label;
  }).join(i18n.language?.startsWith("zh") ? "、" : ", ");
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
  let militaryPoints = (workspace as any).militaryPoints;

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
      invalidReasonByTechId.set(tech.techId, i18n.t("game:tech.prerequisiteNotMet", "前置未满足"));
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
    return i18n.t("game:tech.unlocked", "已解锁");
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
    .map((prerequisite) => translateBackend(flattenTechTree(workspace.techTree).find((candidate) => candidate.techId === prerequisite)?.label ?? prerequisite));

  if (missingPrerequisites.length > 0) {
    return i18n.t("game:tech.prerequisiteNeeded", "前置：{{list}}", { list: missingPrerequisites.join("、") });
  }

  const budgetPool = "budgetPool" in tech ? tech.budgetPool : undefined;
  const budgetCost = "budgetCost" in tech ? tech.budgetCost || 0 : undefined;
  if (budgetPool && typeof budgetCost === "number" && budgetCost > 0 && preview.remainingBudgets[budgetPool as keyof BudgetPools] < budgetCost) {
    return i18n.t("game:tech.budgetInsufficient", "{{pool}}不足", { pool: getBudgetPoolLabel(budgetPool) });
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
  const budgetCost = "budgetCost" in tech ? tech.budgetCost || 0 : undefined;
  const budgetLabel = (typeof budgetCost === "number" && budgetCost > 0)
    ? i18n.t("game:tech.budgetConsume", "消耗 {{cost}} {{pool}}。", { cost: budgetCost, pool: getBudgetPoolLabel(budgetPool ?? "governmentFiscal") })
    : i18n.t("game:tech.advanceByFacility", "通过研究设施推进。");
  const parts = [budgetLabel];
  const prerequisites = "prerequisites" in tech ? tech.prerequisites : [];
  if (prerequisites.length > 0) {
    const labels = prerequisites.map((prerequisite) => {
      return translateBackend(flattenTechTree(workspace.techTree).find((candidate) => candidate.techId === prerequisite)?.label ?? prerequisite);
    });
    parts.push(i18n.t("game:tech.prerequisiteNeeded", "前置：{{list}}。", { list: labels.join("、") }));
  }
  const unlockSummary = buildTechUnlockSummary(tech, workspace);
  if (unlockSummary) {
    parts.push(unlockSummary);
  }
  if (tech.isUnlocked) {
    parts.push(i18n.t("game:tech.alreadyUnlocked", "该科技已解锁。"));
  } else if (queued) {
    parts.push(i18n.t("game:tech.queuedForResearch", "已加入本轮研究队列。"));
  } else if (lockedReason) {
    parts.push(i18n.t("game:tech.currentlyLocked", "当前锁定：{{reason}}", { reason: lockedReason }));
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
    parts.push(i18n.t("game:tech.unlocksGoods", "商品：{{list}}", { list: unlocksGoods.map(getGoodsLabel).join("、") }));
  }
  if (unlocksRoutes.length > 0) {
    parts.push(i18n.t("game:tech.unlocksRoutes", "路线：{{list}}", { list: unlocksRoutes.map(getRouteLabel).join("、") }));
  }
  if (unlocksActions.length > 0) {
    const actionLabels = unlocksActions.map((actionId) => {
      const label = workspace.domesticMarketActions.find((action) => action.actionId === actionId)?.label
        ?? workspace.factoryActions?.find((action) => action.actionId === actionId)?.label
        ?? workspace.governmentActions.strategies.find((action) => action.actionId === actionId)?.label
        ?? actionId;
      return translateBackend(label);
    });
    parts.push(i18n.t("game:tech.unlocksActions", "动作：{{list}}", { list: actionLabels.join("、") }));
  }
  return parts.length > 0 ? i18n.t("game:tech.unlockSummary", "解锁 {{list}}。", { list: parts.join("；") }) : "";
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
    return i18n.t("game:effect.priceTrendFlat", "行情持平");
  }

  return trend === "up"
    ? i18n.t("game:effect.priceTrendUp", "行情上涨 +{{adjustment}}", { adjustment: Math.abs(adjustment) })
    : i18n.t("game:effect.priceTrendDown", "行情下跌 -{{adjustment}}", { adjustment: Math.abs(adjustment) });
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

const EFFECT_LABEL_KEYS: Record<string, { key: string; fallback: string }> = {
  handicraftCapacityDelta: { key: "game:effect.handicraftCapacityDelta", fallback: "手工业产能" },
  domesticMarketCapacityDelta: { key: "game:effect.domesticMarketCapacityDelta", fallback: "国内容量" },
  domesticPriceBonusDelta: { key: "game:effect.domesticPriceBonusDelta", fallback: "国内价格" },
  overseasMarketCapacityDelta: { key: "game:effect.overseasMarketCapacityDelta", fallback: "海外容量" },
  militaryPointsDelta: { key: "game:effect.militaryPointsDelta", fallback: "军事点" },
  armyCapDelta: { key: "game:effect.armyCapDelta", fallback: "军事力量上限" },
  controlledRegionsDelta: { key: "game:effect.controlledRegionsDelta", fallback: "控制区域" },
  factoryBudgetDelta: { key: "game:effect.factoryBudgetDelta", fallback: "工厂预算" },
  governmentFiscalBudgetDelta: { key: "game:effect.governmentFiscalBudgetDelta", fallback: "政府预算" },
  domesticMarketBudgetDelta: { key: "game:effect.domesticMarketBudgetDelta", fallback: "国内预算" },
  productionOutputMultiplier: { key: "game:effect.productionOutputMultiplier", fallback: "产出倍率" },
  rawMaterialsPerTurnDelta: { key: "game:effect.rawMaterialsPerTurnDelta", fallback: "每回合原材料" },
  factoryUpgradeCostReductionPercent: { key: "game:effect.factoryUpgradeCostReductionPercent", fallback: "升级成本" },
  factoryExpansionCostReductionPercent: { key: "game:effect.factoryExpansionCostReductionPercent", fallback: "扩产成本" },
  newFactoryCostReductionPercent: { key: "game:effect.newFactoryCostReductionPercent", fallback: "兼容新建成本" },
  phase1ProductionOutputBonusPercent: { key: "game:effect.phase1ProductionOutputBonusPercent", fallback: "生产产出" },
  rawMaterialsDelta: { key: "game:effect.rawMaterialsDelta", fallback: "原材料" },
  phase1ProductionRawCapacityDelta: { key: "game:effect.phase1ProductionRawCapacityDelta", fallback: "投料上限" },
  administrationCapacityDelta: { key: "game:effect.administrationCapacityDelta", fallback: "行政力上限" },
};

const TEMPORARY_EFFECT_KEYS = new Set([
  "domesticPriceBonusDelta",
  "phase1ProductionRawCapacityDelta",
  "productionOutputMultiplier",
]);

const PERMANENT_EFFECT_KEYS = new Set([
  "administrationCapacityDelta",
  "armyCapDelta",
  "domesticMarketCapacityDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
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

const IDEOLOGY_EFFECT_KEYS = new Set(["ideologyDelta", "ideologyLevelDelta"]);

function resolveEffectLabel(key: string): string | undefined {
  const entry = EFFECT_LABEL_KEYS[key];
  return entry ? i18n.t(entry.key, entry.fallback) : undefined;
}

function resolveNestedLabels(effectKey: string): Record<string, string> | undefined {
  if (effectKey === "armyDelta") {
    return {
      army: i18n.t("game:unit.army", "陆军"),
      infantry: i18n.t("game:unit.infantry", "步兵"),
      artillery: i18n.t("game:unit.artillery", "炮兵"),
    };
  }
  if (effectKey === "navyDelta") {
    return {
      fleets: i18n.t("game:unit.fleets", "舰队"),
    };
  }
  return undefined;
}

export interface EffectMetric {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  temporary?: boolean;
  permanent?: boolean;
}

export function buildEffectMetrics(
  effects: Record<string, number | Record<string, number>> | undefined,
): EffectMetric[] {
  if (!effects) return [];

  const metrics: EffectMetric[] = [];

  for (const [key, value] of Object.entries(effects)) {
    if (typeof value === "number") {
      const label = resolveEffectLabel(key);
      if (!label) continue;
      const tone = value > 0 ? "positive" : value < 0 ? "negative" : undefined;
      const temporary = TEMPORARY_EFFECT_KEYS.has(key);
      const permanent = PERMANENT_EFFECT_KEYS.has(key);
      const displayValue = key === "productionOutputMultiplier"
        ? `x${value}`
        : PERCENT_EFFECT_KEYS.has(key)
        ? COST_REDUCTION_EFFECT_KEYS.has(key)
          ? `-${Math.abs(value)}%`
          : `${value > 0 ? "+" : ""}${value}%`
        : formatSignedValue(value);
      metrics.push({ label, value: displayValue, tone, temporary, permanent });
    } else if (typeof value === "object" && value !== null) {
      const nestedLabels = resolveNestedLabels(key);
      for (const [subKey, subValue] of Object.entries(value)) {
        const subLabel = resolveNestedEffectLabel(key, subKey, nestedLabels);
        if (!subLabel || typeof subValue !== "number") continue;
        const tone = resolveNestedEffectTone(key, subValue);
        metrics.push({ label: subLabel, value: formatSignedValue(subValue), tone });
      }
    }
  }

  return metrics;
}

function resolveNestedEffectLabel(
  effectKey: string,
  subKey: string,
  nestedLabels: Record<string, string> | undefined,
): string | undefined {
  if (IDEOLOGY_EFFECT_KEYS.has(effectKey)) {
    const ideologyLabel = i18n.t(`game:ideology.${subKey}`, subKey);
    const suffix = i18n.t("game:government.ideologySuffix", "思潮");
    return i18n.language.startsWith("zh")
      ? `${ideologyLabel}${suffix}`
      : `${ideologyLabel} ${suffix}`;
  }

  return nestedLabels?.[subKey];
}

function resolveNestedEffectTone(effectKey: string, value: number): EffectMetric["tone"] {
  if (value === 0) {
    return undefined;
  }

  if (IDEOLOGY_EFFECT_KEYS.has(effectKey)) {
    return value > 0 ? "negative" : "positive";
  }

  return value > 0 ? "positive" : "negative";
}

function getNumericEffect(
  effects: Record<string, number | Record<string, number>> | undefined,
  key: string,
): number {
  const value = effects?.[key];
  return typeof value === "number" ? value : 0;
}

export function getSelectedFactoryActionCapacityDeltaByMode(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): Record<string, number> {
  const handicraftDelta = sumSelectedFactoryActionEffect(workspace, draft, "handicraftCapacityDelta");
  return handicraftDelta === 0 ? {} : { handicraft: handicraftDelta };
}

export function getSelectedProductionCapacityDeltaByMode(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): Record<string, number> {
  const capacityDeltaByMode: Record<string, number> = {
    ...getSelectedFactoryActionCapacityDeltaByMode(workspace, draft),
  };

  for (const order of draft.factoryPlan.expansionOrders) {
    const option = workspace.expansionOptions.find((item) => item.routeId === order.routeId);
    if (!option) {
      continue;
    }
    const quantity = Math.min(
      Math.max(0, Math.floor(order.quantity ?? 0)),
      Math.max(0, option.maxQuantity),
    );
    if (quantity <= 0) {
      continue;
    }
    const capacityDelta = quantity * Math.max(1, option.capacityDelta ?? 1);
    capacityDeltaByMode.idle = (capacityDeltaByMode.idle ?? 0) - capacityDelta;
    capacityDeltaByMode[option.routeId] = (capacityDeltaByMode[option.routeId] ?? 0) + capacityDelta;
  }

  for (const order of draft.factoryPlan.newFactoryOrders) {
    const option = workspace.newFactoryOptions.find((item) => item.routeId === order.routeId);
    if (!option) {
      continue;
    }
    const quantity = Math.min(
      Math.max(0, Math.floor(order.quantity ?? 0)),
      Math.max(0, option.maxQuantity),
    );
    if (quantity <= 0) {
      continue;
    }
    const capacityDelta = quantity * Math.max(1, option.capacityDelta ?? 1);
    capacityDeltaByMode.idle = (capacityDeltaByMode.idle ?? 0) - capacityDelta;
    capacityDeltaByMode[option.routeId] = (capacityDeltaByMode[option.routeId] ?? 0) + capacityDelta;
  }

  for (const order of draft.factoryPlan.upgradeOrders) {
    const option = workspace.upgradeOptions.find((item) => item.routeId === order.routeId);
    if (!option) {
      continue;
    }
    const quantity = Math.min(
      Math.max(0, Math.floor(order.quantity ?? 0)),
      Math.max(0, option.maxQuantity),
    );
    if (quantity <= 0) {
      continue;
    }
    const capacityDelta = quantity * Math.max(1, option.capacityDelta ?? 1);
    capacityDeltaByMode[option.sourceRouteId] = (capacityDeltaByMode[option.sourceRouteId] ?? 0) - capacityDelta;
    capacityDeltaByMode[option.routeId] = (capacityDeltaByMode[option.routeId] ?? 0) + capacityDelta;
  }

  return capacityDeltaByMode;
}

export function getSelectedRawMaterialPurchaseQuantity(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
): number {
  const requested = Math.max(0, Math.floor(draft.factoryPlan.rawMaterialPurchaseQuantity ?? 0));
  const phase1 = workspace.phase1Economy;
  if (!phase1) {
    return requested;
  }
  const unitCost = Math.max(0, phase1.rawMaterialPurchaseUnitCost ?? 1);
  const cap = Math.max(0, phase1.materialPurchaseCapPerTurn ?? phase1.maxRawMaterialPurchase ?? requested);
  const budgetLimit = unitCost > 0
    ? Math.max(0, Math.floor(workspace.budgetPools.factory / unitCost))
    : cap;
  return Math.min(requested, cap, budgetLimit);
}

export function sumSelectedFactoryActionEffect(
  workspace: DecisionPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["decision"],
  effectKey: string,
): number {
  return (draft.factoryPlan.factoryActions ?? []).reduce((sum, selection) => {
    const action = workspace.factoryActions?.find((item) => item.actionId === selection.actionId);
    return sum + getNumericEffect(action?.effects, effectKey);
  }, 0);
}
