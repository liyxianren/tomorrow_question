import type {
  DecisionSubmission,
  GamePhase,
  MarketSubmission,
} from "../../types";

export interface Phase1ProductionDraft {
  rawMaterialAssignments: Record<string, number>;
}

export type DecisionPhaseDraft = DecisionSubmission & {
  phase1Production?: Phase1ProductionDraft;
};
export type MarketPhaseDraft = MarketSubmission;
export type SettlementPhaseDraft = Record<string, never>;

export interface PhaseDraftByPhase {
  decision: DecisionPhaseDraft;
  market: MarketPhaseDraft;
  settlement: SettlementPhaseDraft;
}

export type PhaseDraft = PhaseDraftByPhase[GamePhase];

export function createInitialPhaseDraft(phase: "decision"): DecisionPhaseDraft;
export function createInitialPhaseDraft(phase: "market"): MarketPhaseDraft;
export function createInitialPhaseDraft(phase: "settlement"): SettlementPhaseDraft;
export function createInitialPhaseDraft(phase: GamePhase): PhaseDraft {
  switch (phase) {
    case "decision":
      return {
        factoryPlan: {
          productionOrders: [],
          expansionOrders: [],
          upgradeOrders: [],
          newFactoryOrders: [],
        },
        domesticMarketPlan: {
          domesticMarketActions: [],
        },
        governmentPlan: {
          pointPurchases: [],
          strategySelections: [],
          techResearch: [],
        },
        militaryPlan: {
          unlockColonization: false,
          militaryActions: [],
          diplomacyActions: [],
          colonizationActions: [],
        },
        talentPlan: {
          talentUnlocks: [],
        },
      };
    case "market":
      return {
        saleOrders: [],
        phase1Market: {
          domesticAllocation: 0,
          externalAllocations: [],
        },
      };
    case "settlement":
      return {};
    default:
      return {};
  }
}
