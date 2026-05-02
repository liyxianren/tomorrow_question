import type { PhaseDraftByPhase } from "../forms";

export type DecisionStepId = "factory" | "domestic" | "government" | "military" | "research";
export type DecisionStepReviewState = "unreviewed" | "checked" | "no_op" | "needs_recheck";
export type DecisionResearchView = "tech" | "talent";

export type DecisionFlowState = {
  activeStep: DecisionStepId;
  stepReviewStateByStep: Record<DecisionStepId, DecisionStepReviewState>;
  activeResearchBranch: string | null;
  activeResearchView: DecisionResearchView;
};

export const DECISION_STEP_ORDER: DecisionStepId[] = ["factory", "domestic", "government", "military", "research"];

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
    activeResearchView: "tech",
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
      return "已决策";
    case "no_op":
      return "跳过";
    case "needs_recheck":
      return "已修改";
    case "unreviewed":
    default:
      return "未决策";
  }
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

export function getUncheckedDecisionSteps(state: DecisionFlowState): DecisionStepId[] {
  return DECISION_STEP_ORDER.filter((step) => {
    const reviewState = state.stepReviewStateByStep[step];
    return reviewState === "unreviewed" || reviewState === "needs_recheck";
  });
}

export function clearDecisionStepDraft(
  draft: PhaseDraftByPhase["decision"],
  step: DecisionStepId,
): PhaseDraftByPhase["decision"] {
  if (step === "factory") {
    return {
      ...draft,
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
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
      talentPlan: {
        talentUnlocks: [],
      },
    };
  }

  return {
    ...draft,
    governmentPlan: {
      pointPurchases: [],
      strategySelections: [],
      techResearch: [],
    },
    abilitySelection: undefined,
  };
}

export function getDecisionStepCompletionSummary(
  draft: PhaseDraftByPhase["decision"],
  step: DecisionStepId,
): string {
  if (step === "factory") {
    const production = draft.factoryPlan.productionOrders.reduce((sum, item) => sum + item.quantity, 0);
    const construction =
      draft.factoryPlan.expansionOrders.reduce((sum, item) => sum + item.quantity, 0) +
      draft.factoryPlan.upgradeOrders.reduce((sum, item) => sum + item.quantity, 0) +
      draft.factoryPlan.newFactoryOrders.reduce((sum, item) => sum + item.quantity, 0);
    return `生产 ${production} 批 / 建设 ${construction} 次`;
  }

  if (step === "domestic") {
    return `已选动作 ${draft.domesticMarketPlan.domesticMarketActions.length} 项`;
  }

  if (step === "military") {
    return `军事动作 ${draft.militaryPlan.militaryActions.length} 次 / 建交 ${draft.militaryPlan.diplomacyActions.length} 项`;
  }

  if (step === "research") {
    return `研究 ${draft.governmentPlan.techResearch.length} 项`;
  }

  const purchases = draft.governmentPlan.pointPurchases.reduce((sum, item) => sum + item.quantity, 0);
  const strategies = draft.governmentPlan.strategySelections.length;
  const research = draft.governmentPlan.techResearch.length;
  const ability = draft.abilitySelection ? "已启用" : "未启用";
  return `点数 ${purchases} / 策略 ${strategies} / 科技 ${research} / 能力 ${ability}`;
}

export function getNextDecisionStep(step: DecisionStepId): DecisionStepId | null {
  const index = DECISION_STEP_ORDER.indexOf(step);
  return index >= 0 && index < DECISION_STEP_ORDER.length - 1 ? DECISION_STEP_ORDER[index + 1] : null;
}

export function getPreviousDecisionStep(step: DecisionStepId): DecisionStepId | null {
  const index = DECISION_STEP_ORDER.indexOf(step);
  return index > 0 ? DECISION_STEP_ORDER[index - 1] : null;
}
