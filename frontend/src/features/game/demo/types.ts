import type {
  CountryCode,
  DecisionPlayerPhaseWorkspace,
  IncomeAllocationRatio,
} from "../../../types";
import type {
  DecisionCardViewModel,
  DecisionLocationId,
  DecisionLocationViewModel,
} from "../commandDeck/types";

export type DecisionCardDemoVariant = "command-deck" | "archive-folio" | "action-stack";

export type { DecisionCardViewModel, DecisionLocationId, DecisionLocationViewModel };

export interface DecisionCardDemoScenario {
  source: "seed" | "live";
  sourceLabel: string;
  countryCode: CountryCode;
  countryLabel: string;
  workspace: DecisionPlayerPhaseWorkspace;
}

export interface DecisionCardDemoVariantMeta {
  id: DecisionCardDemoVariant;
  label: string;
  summary: string;
  accent: string;
}

export interface DecisionCardDemoViewModel {
  countryCode: CountryCode;
  countryLabel: string;
  sourceLabel: string;
  summary: {
    remainingBudgets: {
      domesticMarket: number;
      factory: number;
      governmentFiscal: number;
    };
    ratioPreview: IncomeAllocationRatio;
    militaryPoints: number;
  };
  variants: DecisionCardDemoVariantMeta[];
  locations: Record<DecisionLocationId, DecisionLocationViewModel>;
}
