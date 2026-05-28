import i18n from "../../../i18n";
import type { PhaseDraftByPhase } from "../forms";

export type DecisionStepId = "factory" | "domestic" | "government" | "military" | "research";
export type DecisionStepReviewState = "unreviewed" | "checked" | "no_op" | "needs_recheck";

export type DecisionFlowState = {
  activeStep: DecisionStepId;
  stepReviewStateByStep: Record<DecisionStepId, DecisionStepReviewState>;
  activeResearchBranch: string | null;
};

export const DECISION_STEP_ORDER: DecisionStepId[] = ["factory", "government", "domestic", "military", "research"];

export type DecisionStepContentContext = {
  activeResearch?: string | null;
  requireFactoryReviewForPhase1?: boolean;
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
  return i18n.t(`game:stepLabel.${step}`, step);
}

export function getDecisionStepReviewLabel(state: DecisionStepReviewState): string {
  switch (state) {
    case "checked":
      return i18n.t("game:stepReview.checked", "Checked");
    case "no_op":
      return i18n.t("game:stepReview.noOp", "Skipped");
    case "needs_recheck":
      return i18n.t("game:stepReview.needsRecheck", "Modified");
    case "unreviewed":
    default:
      return i18n.t("game:stepReview.unreviewed", "Not Decided");
  }
}

export function hasDecisionStepContent(
  draft: PhaseDraftByPhase["decision"],
  step: DecisionStepId,
  context: DecisionStepContentContext = {},
): boolean {
  if (step === "factory") {
    const rawAssignments = draft.phase1Production?.rawMaterialAssignments ?? {};
    const hasPhase1 = !context.requireFactoryReviewForPhase1
      && Object.values(rawAssignments).some((value) => Math.max(0, value) > 0);
    return (
      hasPhase1 ||
      draft.factoryPlan.productionOrders.some((order) => order.quantity > 0) ||
      draft.factoryPlan.expansionOrders.some((order) => order.quantity > 0) ||
      draft.factoryPlan.upgradeOrders.some((order) => order.quantity > 0) ||
      draft.factoryPlan.newFactoryOrders.some((order) => order.quantity > 0) ||
      Math.max(0, draft.factoryPlan.rawMaterialPurchaseQuantity ?? 0) > 0 ||
      (draft.factoryPlan.factoryActions ?? []).length > 0
    );
  }
  if (step === "domestic") {
    return true;
  }
  if (step === "military") {
    return (
      draft.militaryPlan.militaryActions.length > 0 ||
      (draft.militaryPlan.colonizationActions ?? []).length > 0 ||
      Object.keys(draft.militaryPlan.navalDeployment ?? {}).length > 0 ||
      Object.keys(draft.militaryPlan.regionBlockades ?? {}).length > 0
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
    draft.governmentPlan.strategySelections.some((selection) => selection.actionId !== "expand_research") ||
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
        rawMaterialPurchaseQuantity: 0,
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
        colonizationActions: [],
        navalDeployment: {},
        regionBlockades: {},
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
      strategySelections: draft.governmentPlan.strategySelections.filter((selection) => selection.actionId === "expand_research"),
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
    const rawPurchase = Math.max(0, draft.factoryPlan.rawMaterialPurchaseQuantity ?? 0);
    const industrialActions = factoryActions + construction + (rawPurchase > 0 ? 1 : 0);
    const arrangementLabel = i18n.t("game:factory.industrialArrangements", "产业安排");
    if (phase1RawMaterials > 0) {
      return `${i18n.t("game:factory.input", "Input")} ${phase1RawMaterials} ${i18n.t("game:factory.rawMaterials", "Raw Materials")} / ${arrangementLabel} ${industrialActions} ${i18n.t("game:flow.itemUnit", "items")}`;
    }
    return `${i18n.t("game:flow.production", "Production")} ${production} ${i18n.t("game:flow.batches", "batches")} / ${arrangementLabel} ${industrialActions} ${i18n.t("game:flow.itemUnit", "items")}`;
  }

  if (step === "domestic") {
    return i18n.t("game:stepLabel.domestic", "Market Preview");
  }

  if (step === "military") {
    const colonizations = draft.militaryPlan.colonizationActions?.length ?? 0;
    return `${i18n.t("game:military.militaryActions", "Military Actions")} ${draft.militaryPlan.militaryActions.length} ${i18n.t("game:flow.times", "times")} / ${i18n.t("game:military.colonizationAction", "殖民行动")} ${colonizations}`;
  }

  if (step === "research") {
    const facility = draft.governmentPlan.strategySelections.some((selection) => selection.actionId === "expand_research") ? 1 : 0;
    if (context.activeResearch && draft.governmentPlan.techResearch.length === 0 && facility === 0) {
      return `${i18n.t("game:research.currentlyResearching", "Currently Researching")}: ${context.activeResearch}`;
    }
    return `${i18n.t("game:research.research", "Research")} ${draft.governmentPlan.techResearch.length} ${i18n.t("game:flow.items", "items")} / ${i18n.t("game:research.researchFacilities", "Facilities")} ${facility}`;
  }

  const purchases = draft.governmentPlan.pointPurchases.reduce((sum, item) => sum + item.quantity, 0);
  const strategies = draft.governmentPlan.strategySelections.filter((selection) => selection.actionId !== "expand_research").length;
  const policies = (draft.activatePolicies ?? []).length + (draft.deactivatePolicies ?? []).length;
  const reforms = (draft.reforms ?? []).length;
  const ability = draft.abilitySelection ? i18n.t("game:government.abilityEnabledThisRound", "Enabled") : i18n.t("game:government.abilityNotEnabled", "Not Enabled");
  return `${i18n.t("game:flow.points", "Points")} ${purchases} / ${i18n.t("game:flow.strategies", "Strategies")} ${strategies} / ${i18n.t("game:flow.policies", "Policies")} ${policies} / ${i18n.t("game:flow.reforms", "Reforms")} ${reforms} / ${i18n.t("game:government.nationalAbility", "Ability")} ${ability}`;
}

export function getNextDecisionStep(step: DecisionStepId): DecisionStepId | null {
  const index = DECISION_STEP_ORDER.indexOf(step);
  return index >= 0 && index < DECISION_STEP_ORDER.length - 1 ? DECISION_STEP_ORDER[index + 1] : null;
}

export function getPreviousDecisionStep(step: DecisionStepId): DecisionStepId | null {
  const index = DECISION_STEP_ORDER.indexOf(step);
  return index > 0 ? DECISION_STEP_ORDER[index - 1] : null;
}
