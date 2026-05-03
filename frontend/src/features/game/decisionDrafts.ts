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

// TODO: Legacy 1.0 helper — still used by FactoryPanel and commandDeck until they migrate to phase1Economy
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

export function setConquestAction(
  draft: PhaseDraftByPhase["decision"],
  regionId: string,
  infantry: number,
  artillery: number,
): PhaseDraftByPhase["decision"] {
  const safeInfantry = normalizeQuantity(infantry);
  const safeArtillery = normalizeQuantity(artillery);
  const remaining = (draft.militaryPlan.conquestActions ?? []).filter(
    (a) => a.regionId !== regionId,
  );
  const next = safeInfantry > 0 || safeArtillery > 0
    ? [...remaining, { regionId, infantry: safeInfantry, artillery: safeArtillery }]
    : remaining;
  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      conquestActions: next,
    },
  };
}

export function toggleLootingAction(
  draft: PhaseDraftByPhase["decision"],
  regionId: string,
  resourceType: string,
): PhaseDraftByPhase["decision"] {
  const existing = draft.militaryPlan.lootingActions ?? [];
  const has = existing.some((a) => a.regionId === regionId && a.resourceType === resourceType);
  const next = has
    ? existing.filter((a) => !(a.regionId === regionId && a.resourceType === resourceType))
    : [...existing, { regionId, resourceType }];
  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      lootingActions: next,
    },
  };
}

export function setNavalDeployment(
  draft: PhaseDraftByPhase["decision"],
  nodeId: string,
  count: number,
): PhaseDraftByPhase["decision"] {
  const next = normalizeQuantity(count);
  const current = draft.militaryPlan.navalDeployment ?? {};
  const nextDeployment: Record<string, number> = { ...current };
  if (next > 0) {
    nextDeployment[nodeId] = next;
  } else {
    delete nextDeployment[nodeId];
  }
  return {
    ...draft,
    militaryPlan: {
      ...draft.militaryPlan,
      navalDeployment: nextDeployment,
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

export function setAdminPurchases(
  draft: PhaseDraftByPhase["decision"],
  quantity: number,
): PhaseDraftByPhase["decision"] {
  return {
    ...draft,
    governmentPlan: {
      ...draft.governmentPlan,
      adminPurchases: normalizeQuantity(quantity),
    },
  };
}

export function setPointPurchase(
  draft: PhaseDraftByPhase["decision"],
  pointType: "tech" | "military",
  quantity: number,
): PhaseDraftByPhase["decision"] {
  const nextQuantity = normalizeQuantity(quantity);
  const remaining = draft.governmentPlan.pointPurchases.filter((p) => p.pointType !== pointType);
  const nextPurchases = nextQuantity > 0
    ? [...remaining, { pointType, quantity: nextQuantity }]
    : remaining;

  return {
    ...draft,
    governmentPlan: {
      ...draft.governmentPlan,
      pointPurchases: nextPurchases,
    },
  };
}

export function toggleReformQueue(
  draft: PhaseDraftByPhase["decision"],
  reformId: string,
  queued: boolean,
): PhaseDraftByPhase["decision"] {
  const current = draft.reforms ?? [];
  if (queued) {
    if (current.includes(reformId)) return draft;
    return { ...draft, reforms: [...current, reformId] };
  }
  return { ...draft, reforms: current.filter((id) => id !== reformId) };
}

export function togglePolicyQueue(
  draft: PhaseDraftByPhase["decision"],
  policyId: string,
  active: boolean,
): PhaseDraftByPhase["decision"] {
  const activate = (draft.activatePolicies ?? []).filter((id) => id !== policyId);
  const deactivate = (draft.deactivatePolicies ?? []).filter((id) => id !== policyId);
  if (active) {
    return {
      ...draft,
      activatePolicies: [...activate, policyId],
      deactivatePolicies: deactivate,
    };
  }
  return {
    ...draft,
    activatePolicies: activate,
    deactivatePolicies: [...deactivate, policyId],
  };
}
