import type { NationalAbility, IdeologyKey } from "../../types";
import type { PhaseDraftByPhase } from "./forms";

export function getProductionOrderQuantity(
  draft: PhaseDraftByPhase["decision"],
  goodsId: string,
): number {
  return draft.factoryPlan.productionOrders.find((order) => order.goodsId === goodsId)?.quantity ?? 0;
}

export function setProductionOrderQuantity(
  draft: PhaseDraftByPhase["decision"],
  goodsId: string,
  quantity: number,
): PhaseDraftByPhase["decision"] {
  const nextQuantity = normalizeQuantity(quantity);
  const remainingOrders = draft.factoryPlan.productionOrders.filter((item) => item.goodsId !== goodsId);
  const nextOrders = nextQuantity > 0 ? [...remainingOrders, { goodsId, quantity: nextQuantity }] : remainingOrders;

  return {
    ...draft,
    factoryPlan: {
      ...draft.factoryPlan,
      productionOrders: nextOrders,
    },
  };
}

export function getAllocatedProductionBatchesForRoute(
  draft: PhaseDraftByPhase["decision"],
  productionOptions: Array<{ goodsId: string; routeId: string }>,
  routeId: string,
): number {
  return draft.factoryPlan.productionOrders.reduce((sum, item) => {
    const option = productionOptions.find((candidate) => candidate.goodsId === item.goodsId);
    if (option?.routeId !== routeId) {
      return sum;
    }
    return sum + item.quantity;
  }, 0);
}

export function getRouteOrderQuantity(
  orders: Array<{ routeId: string; quantity: number }>,
  routeId: string,
): number {
  return orders.find((order) => order.routeId === routeId)?.quantity ?? 0;
}

export function setRouteDecisionOrderQuantity(
  draft: PhaseDraftByPhase["decision"],
  field: "expansionOrders" | "upgradeOrders" | "newFactoryOrders",
  routeId: string,
  quantity: number,
): PhaseDraftByPhase["decision"] {
  const nextQuantity = normalizeQuantity(quantity);
  const remainingOrders = draft.factoryPlan[field].filter((item) => item.routeId !== routeId);
  const nextOrders = nextQuantity > 0 ? [...remainingOrders, { routeId, quantity: nextQuantity }] : remainingOrders;

  return {
    ...draft,
    factoryPlan: {
      ...draft.factoryPlan,
      [field]: nextOrders,
    },
  };
}

export function toggleDomesticMarketActionSelection(
  draft: PhaseDraftByPhase["decision"],
  actionId: string,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  const remainingActions = draft.domesticMarketPlan.domesticMarketActions.filter((item) => item.actionId !== actionId);
  const nextActions = checked ? [...remainingActions, { actionId }] : remainingActions;

  return {
    ...draft,
    domesticMarketPlan: {
      ...draft.domesticMarketPlan,
      domesticMarketActions: nextActions,
    },
  };
}

export function toggleGovernmentStrategySelection(
  draft: PhaseDraftByPhase["decision"],
  actionId: string,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  const remainingStrategies = draft.governmentPlan.strategySelections.filter((item) => item.actionId !== actionId);
  const nextStrategies = checked ? [...remainingStrategies, { actionId }] : remainingStrategies;

  return {
    ...draft,
    governmentPlan: {
      ...draft.governmentPlan,
      strategySelections: nextStrategies,
    },
  };
}

export function toggleReformSelection(
  draft: PhaseDraftByPhase["decision"],
  reformId: string,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  const remaining = (draft.reforms ?? []).filter((id) => id !== reformId);
  return {
    ...draft,
    reforms: checked ? [...remaining, reformId] : remaining,
  };
}

export function togglePolicySelection(
  draft: PhaseDraftByPhase["decision"],
  policyId: string,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  const remainingActivate = (draft.activatePolicies ?? []).filter((id) => id !== policyId);
  const remainingDeactivate = (draft.deactivatePolicies ?? []).filter((id) => id !== policyId);

  if (checked) {
    return {
      ...draft,
      activatePolicies: [...remainingActivate, policyId],
      deactivatePolicies: remainingDeactivate,
    };
  }

  return {
    ...draft,
    activatePolicies: remainingActivate,
    deactivatePolicies: [...remainingDeactivate, policyId],
  };
}

export function toggleTechResearchSelection(
  draft: PhaseDraftByPhase["decision"],
  techId: string,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  const remainingTechs = draft.governmentPlan.techResearch.filter((item) => item.techId !== techId);
  const nextTechs = checked ? [...remainingTechs, { techId }] : remainingTechs;

  return {
    ...draft,
    governmentPlan: {
      ...draft.governmentPlan,
      techResearch: nextTechs,
    },
  };
}

export function addMilitaryActionSelection(
  draft: PhaseDraftByPhase["decision"],
  actionId: string,
): PhaseDraftByPhase["decision"] {
  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      militaryActions: [...draft.militaryPlan.militaryActions, { actionId }],
    },
  };
}

export function removeMilitaryActionSelection(
  draft: PhaseDraftByPhase["decision"],
  actionId: string,
): PhaseDraftByPhase["decision"] {
  const nextIndex = draft.militaryPlan.militaryActions.findIndex((item) => item.actionId === actionId);
  if (nextIndex < 0) {
    return draft;
  }

  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      militaryActions: draft.militaryPlan.militaryActions.filter((_, index) => index !== nextIndex),
    },
  };
}

export function toggleTalentUnlockSelection(
  draft: PhaseDraftByPhase["decision"],
  nodeId: string,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  const existing = draft.talentPlan?.talentUnlocks ?? [];
  const filtered = existing.filter((item) => item.nodeId !== nodeId);
  return {
    ...draft,
    talentPlan: {
      ...draft.talentPlan,
      talentUnlocks: checked ? [...filtered, { nodeId }] : filtered,
    },
  };
}

export function addColonizationAction(
  draft: PhaseDraftByPhase["decision"],
  targetRegionId: string,
): PhaseDraftByPhase["decision"] {
  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      colonizationActions: [{ targetRegionId }],
    },
  };
}

export function removeColonizationAction(
  draft: PhaseDraftByPhase["decision"],
  targetRegionId: string,
): PhaseDraftByPhase["decision"] {
  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      colonizationActions: (draft.militaryPlan.colonizationActions ?? []).filter(
        (a) => a.targetRegionId !== targetRegionId,
      ),
    },
  };
}

export function setColonizationUnlockSelection(
  draft: PhaseDraftByPhase["decision"],
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      unlockColonization: checked,
    },
  };
}

export function toggleDiplomacyActionSelection(
  draft: PhaseDraftByPhase["decision"],
  actionId: string,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  const remainingActions = draft.militaryPlan.diplomacyActions.filter((item) => item.actionId !== actionId);
  const nextActions = checked ? [...remainingActions, { actionId }] : remainingActions;

  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      diplomacyActions: nextActions,
    },
  };
}

export function toggleNationalAbilitySelection(
  draft: PhaseDraftByPhase["decision"],
  ability: NationalAbility,
  checked: boolean,
): PhaseDraftByPhase["decision"] {
  if (!checked) {
    return omitAbilitySelection(draft);
  }

  return {
    ...draft,
    abilitySelection: ability.requiresTargetIdeology
      ? {
          abilityId: ability.abilityId,
          targetIdeology:
            draft.abilitySelection?.abilityId === ability.abilityId
              ? draft.abilitySelection.targetIdeology ?? "liberalism"
              : "liberalism",
        }
      : {
          abilityId: ability.abilityId,
        },
  };
}

export function setAbilitySelectionTarget(
  draft: PhaseDraftByPhase["decision"],
  abilityId: string,
  targetIdeology: IdeologyKey,
): PhaseDraftByPhase["decision"] {
  if (draft.abilitySelection?.abilityId !== abilityId) {
    return draft;
  }

  return {
    ...draft,
    abilitySelection: {
      ...draft.abilitySelection,
      targetIdeology,
    },
  };
}

function omitAbilitySelection(
  draft: PhaseDraftByPhase["decision"],
): PhaseDraftByPhase["decision"] {
  const nextDraft = { ...draft };
  delete nextDraft.abilitySelection;
  return nextDraft;
}

export function addPointPurchase(
  draft: PhaseDraftByPhase["decision"],
  pointType: "tech" | "military",
): PhaseDraftByPhase["decision"] {
  const existing = draft.governmentPlan.pointPurchases.find((p) => p.pointType === pointType);
  if (existing) {
    return {
      ...draft,
      governmentPlan: {
        ...draft.governmentPlan,
        pointPurchases: draft.governmentPlan.pointPurchases.map((p) =>
          p.pointType === pointType ? { ...p, quantity: p.quantity + 1 } : p
        ),
      },
    };
  }
  return {
    ...draft,
    governmentPlan: {
      ...draft.governmentPlan,
      pointPurchases: [...draft.governmentPlan.pointPurchases, { pointType, quantity: 1 }],
    },
  };
}

export function removePointPurchase(
  draft: PhaseDraftByPhase["decision"],
  pointType: "tech" | "military",
): PhaseDraftByPhase["decision"] {
  const existing = draft.governmentPlan.pointPurchases.find((p) => p.pointType === pointType);
  if (!existing || existing.quantity <= 0) return draft;
  if (existing.quantity === 1) {
    return {
      ...draft,
      governmentPlan: {
        ...draft.governmentPlan,
        pointPurchases: draft.governmentPlan.pointPurchases.filter((p) => p.pointType !== pointType),
      },
    };
  }
  return {
    ...draft,
    governmentPlan: {
      ...draft.governmentPlan,
      pointPurchases: draft.governmentPlan.pointPurchases.map((p) =>
        p.pointType === pointType ? { ...p, quantity: p.quantity - 1 } : p
      ),
    },
  };
}

function normalizeQuantity(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}
