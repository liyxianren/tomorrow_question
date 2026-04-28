import type { CountryCode, IdeologyKey } from "../../../types";
import type { DecisionStepId } from "../flow/decisionFlow";

export type DecisionLocationId = DecisionStepId;

export type DecisionCardControl =
  | { kind: "none"; label?: string }
  | {
      kind: "quantity";
      label: string;
      max: number;
      value: number;
      disabled?: boolean;
      unitLabel?: string;
    }
  | {
      kind: "toggle";
      label: string;
      checked: boolean;
      disabled?: boolean;
      activeText?: string;
      inactiveText?: string;
      disabledText?: string;
    }
  | {
      kind: "confirm";
      mode?: "toggle" | "count";
      confirmed?: boolean;
      count?: number;
      maxCount?: number;
      confirmLabel: string;
      cancelLabel?: string;
      disabled?: boolean;
      revokeDisabled?: boolean;
    };

export type DecisionCardInteraction =
  | { type: "production"; goodsId: string }
  | { type: "expansion"; routeId: string }
  | { type: "upgrade"; routeId: string }
  | { type: "newFactory"; routeId: string }
  | { type: "domesticAction"; actionId: string }
  | { type: "governmentStrategy"; actionId: string }
  | { type: "technology"; techId: string }
  | { type: "ability"; abilityId: string }
  | { type: "militaryAction"; actionId: string }
  | { type: "diplomacyAction"; actionId: string }
  | { type: "colonizationUnlock" }
  | { type: "colonizationTarget"; targetRegionId: string }
  | { type: "talentUnlock"; nodeId: string }
  | { type: "pointPurchase"; pointType: "tech" | "military" }
  | { type: "selectResearchBranch"; branchId: string }
  | { type: "reform"; reformId: string }
  | { type: "policy"; policyId: string };

export interface DecisionCardMetric {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "warn";
}

export interface DecisionCardViewModel {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  badges: string[];
  metrics: DecisionCardMetric[];
  feedback?: string;
  lockedReason: string | null;
  tone: "default" | "accent" | "locked";
  selected?: boolean;
  control: DecisionCardControl;
  interaction?: DecisionCardInteraction;
}

export interface DecisionCardSectionViewModel {
  id: string;
  title: string;
  description?: string;
  cards: DecisionCardViewModel[];
}

export interface DecisionLocationViewModel {
  id: DecisionLocationId;
  label: string;
  eyebrow: string;
  subtitle: string;
  description: string;
  budgetLabel: string;
  remainingBudget: number;
  summaryPills: string[];
  sections: DecisionCardSectionViewModel[];
}

export interface DecisionCommandDeckTabViewModel {
  id: DecisionLocationId;
  label: string;
}

export interface DecisionCommandDeckViewModel {
  countryCode: CountryCode;
  countryLabel: string;
  activeLocationId: DecisionLocationId;
  tabs: DecisionCommandDeckTabViewModel[];
  locations: Record<DecisionLocationId, DecisionLocationViewModel>;
}

export interface DecisionAbilityTargetOption {
  key: IdeologyKey;
  label: string;
}
