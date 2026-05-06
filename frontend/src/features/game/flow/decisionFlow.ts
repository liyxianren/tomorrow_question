import type { PhaseDraftByPhase } from "../forms";

export type DecisionStepId = "factory" | "domestic" | "government" | "military" | "research";
export type DecisionStepReviewState = "unreviewed" | "checked" | "no_op" | "needs_recheck";

export type DecisionFlowState = {
  activeStep: DecisionStepId;
  stepReviewStateByStep: Record<DecisionStepId, DecisionStepReviewState>;
  activeResearchBranch: string | null;
};

export const DECISION_STEP_ORDER: DecisionStepId[] = ["factory", "domestic", "government", "military", "research"];

export type DecisionStepContentContext = {
  activeResearch?: string | null;
};

export function createInitialDecisionFlowState(): DecisionFlowState {
  return {
    activeStep: "factory",
    stepReviewStateByStep: {
      factory: "unreviewed",
      domestic: "unreviewed",
      government: "unreviewed",
      military: "unreviewed",
      research: "unreviewed",
    },
    activeResearchBranch: null,
  };
}

export function getDecisionStepLabel(step: DecisionStepId): string {
  switch (step) {
    case "factory":
      return "工厂决策";
    case "domestic":
      return "国民消费";
    case "government":
      return "政府政策";
    case "military":
      return "军事要塞";
    case "research":
      return "研究院";
    default:
      return step;
  }
}

export function getDecisionStepReviewLabel(state: DecisionStepReviewState): string {
  switch (state) {
    case "checked":
      return "已检查";
    case "no_op":
      return "跳过";
    case "needs_recheck":
      return "已修改";
    case "unreviewed":
    default:
      return "未决策";
  }
}

export function hasDecisionStepContent(
  draft: PhaseDraftByPhase["decision"],
  step: DecisionStepId,
  context: DecisionStepContentContext = {},
): boolean {
  if (step === "factory") {
    const rawAssignments = draft.phase1Production?.rawMaterialAssignments ?? {};
    const hasPhase1 = Object.values(rawAssignments).some((value) => Math.max(0, value) > 0);
    return (
      hasPhase1 ||
      draft.factoryPlan.productionOrders.some((order) => order.quantity > 0) ||
      draft.factoryPlan.expansionOrders.some((order) => order.quantity > 0) ||
      draft.factoryPlan.upgradeOrders.some((order) => order.quantity > 0) ||
      draft.factoryPlan.newFactoryOrders.some((order) => order.quantity > 0) ||
      (draft.factoryPlan.factoryActions ?? []).length > 0
    );
  }
  if (step === "domestic") {
    return draft.domesticMarketPlan.domesticMarketActions.length > 0;
  }
  if (step === "military") {
    return (
      draft.militaryPlan.unlockColonization ||
      draft.militaryPlan.militaryActions.length > 0 ||
      draft.militaryPlan.diplomacyActions.length > 0 ||
      draft.militaryPlan.colonizationActions.length > 0 ||
      Object.keys(draft.militaryPlan.navalDeployment ?? {}).length > 0 ||
      (draft.militaryPlan.conquestActions ?? []).some((action) => action.infantry > 0 || action.artillery > 0) ||
      (draft.militaryPlan.lootingActions ?? []).length > 0
    );
  }
  if (step === "research") {
    return (
      Boolean(context.activeResearch) ||
      draft.governmentPlan.techResearch.length > 0 ||
      draft.governmentPlan.strategySelections.some((selection) => selection.actionId === "expand_research")
    );
  }
  return (
    draft.governmentPlan.pointPurchases.some((purchase) => purchase.quantity > 0) ||
    draft.governmentPlan.strategySelections.length > 0 ||
    (draft.governmentPlan.adminPurchases ?? 0) > 0 ||
    (draft.reforms ?? []).length > 0 ||
    (draft.activatePolicies ?? []).length > 0 ||
    (draft.deactivatePolicies ?? []).length > 0 ||
    Boolean(draft.abilitySelection?.abilityId)
  );
}

export function setDecisionActiveStep(
  state: DecisionFlowState,
  step: DecisionStepId,
): DecisionFlowState {
  return {
    ...state,
    activeStep: step,
  };
}

export function markDecisionStepReviewed(
  state: DecisionFlowState,
  step: DecisionStepId,
  reviewState: "checked" | "no_op",
): DecisionFlowState {
  return {
    ...state,
    stepReviewStateByStep: {
      ...state.stepReviewStateByStep,
      [step]: reviewState,
    },
  };
}

export function markDecisionStepDirty(
  state: DecisionFlowState,
  step: DecisionStepId,
): DecisionFlowState {
  const current = state.stepReviewStateByStep[step];
  if (current === "checked" || current === "no_op") {
    return {
      ...state,
      stepReviewStateByStep: {
        ...state.stepReviewStateByStep,
        [step]: "needs_recheck",
      },
    };
  }

  return state;
}

export function getUncheckedDecisionSteps(
  state: DecisionFlowState,
  draft?: PhaseDraftByPhase["decision"],
  context: DecisionStepContentContext = {},
): DecisionStepId[] {
  return DECISION_STEP_ORDER.filter((step) => {
    if (draft && hasDecisionStepContent(draft, step, context)) {
      return false;
    }
    const reviewState = state.stepReviewStateByStep[step];
    return reviewState === "unreviewed" || reviewState === "needs_recheck";
  });
}

export function clearDecisionStepDraft(
  draft: PhaseDraftByPhase["decision"],
  step: DecisionStepId,
): PhaseDraftByPhase["decision"] {
  if (step === "factory") {
    const { phase1Production: _phase1Production, ...restDraft } = draft;
    return {
      ...restDraft,
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
        factoryActions: [],
      },
    };
  }

  if (step === "domestic") {
    return {
      ...draft,
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
    };
  }

  if (step === "military") {
    return {
      ...draft,
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [],
        diplomacyActions: [],
        colonizationActions: [],
        navalDeployment: {},
        conquestActions: [],
        lootingActions: [],
      },
    };
  }

  if (step === "research") {
    return {
      ...draft,
      governmentPlan: {
        ...draft.governmentPlan,
        strategySelections: draft.governmentPlan.strategySelections.filter((selection) => selection.actionId !== "expand_research"),
        techResearch: [],
      },
    };
  }

  return {
    ...draft,
    governmentPlan: {
      pointPurchases: [],
      strategySelections: [],
      techResearch: draft.governmentPlan.techResearch,
      adminPurchases: 0,
    },
    reforms: [],
    activatePolicies: [],
    deactivatePolicies: [],
    abilitySelection: undefined,
  };
}

export function getDecisionStepCompletionSummary(
  draft: PhaseDraftByPhase["decision"],
  step: DecisionStepId,
  context: DecisionStepContentContext = {},
): string {
  if (step === "factory") {
    const phase1RawMaterials = Object.values(draft.phase1Production?.rawMaterialAssignments ?? {})
      .reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
    const production = draft.factoryPlan.productionOrders.reduce((sum, item) => sum + item.quantity, 0);
    const construction =
      draft.factoryPlan.expansionOrders.reduce((sum, item) => sum + item.quantity, 0) +
      draft.factoryPlan.upgradeOrders.reduce((sum, item) => sum + item.quantity, 0) +
      draft.factoryPlan.newFactoryOrders.reduce((sum, item) => sum + item.quantity, 0);
    const factoryActions = draft.factoryPlan.factoryActions?.length ?? 0;
    const actionSummary = factoryActions > 0 ? ` / 调度 ${factoryActions} 项` : "";
    if (phase1RawMaterials > 0) {
      return `投料 ${phase1RawMaterials} 原材料 / 建设 ${construction} 次${actionSummary}`;
    }
    return `生产 ${production} 批 / 建设 ${construction} 次${actionSummary}`;
  }

  if (step === "domestic") {
    return `已选动作 ${draft.domesticMarketPlan.domesticMarketActions.length} 项`;
  }

  if (step === "military") {
    return `军事动作 ${draft.militaryPlan.militaryActions.length} 次 / 建交 ${draft.militaryPlan.diplomacyActions.length} 项`;
  }

  if (step === "research") {
    const facility = draft.governmentPlan.strategySelections.some((selection) => selection.actionId === "expand_research") ? 1 : 0;
    if (context.activeResearch && draft.governmentPlan.techResearch.length === 0 && facility === 0) {
      return `当前研究中：${context.activeResearch}`;
    }
    return `研究 ${draft.governmentPlan.techResearch.length} 项 / 设施 ${facility}`;
  }

  const purchases = draft.governmentPlan.pointPurchases.reduce((sum, item) => sum + item.quantity, 0);
  const strategies = draft.governmentPlan.strategySelections.length;
  const policies = (draft.activatePolicies ?? []).length + (draft.deactivatePolicies ?? []).length;
  const reforms = (draft.reforms ?? []).length;
  const ability = draft.abilitySelection ? "已启用" : "未启用";
  return `点数 ${purchases} / 策略 ${strategies} / 政策 ${policies} / 改革 ${reforms} / 能力 ${ability}`;
}

export function getNextDecisionStep(step: DecisionStepId): DecisionStepId | null {
  const index = DECISION_STEP_ORDER.indexOf(step);
  return index >= 0 && index < DECISION_STEP_ORDER.length - 1 ? DECISION_STEP_ORDER[index + 1] : null;
}

export function getPreviousDecisionStep(step: DecisionStepId): DecisionStepId | null {
  const index = DECISION_STEP_ORDER.indexOf(step);
  return index > 0 ? DECISION_STEP_ORDER[index - 1] : null;
}
