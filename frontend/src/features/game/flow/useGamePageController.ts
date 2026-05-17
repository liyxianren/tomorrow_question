import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { GamePhase, GameSnapshot, PlayerPhaseWorkspace, PlayerState } from "../../../types";
import {
  createInitialDecisionFlowState,
  type DecisionFlowState,
} from "./decisionFlow";
import {
  buildDecisionSubmission,
  createDefaultPhase1ProductionDraft,
  createInitialPhaseDraft,
  type PhaseDraftByPhase,
} from "../forms";
import type { GameRuntimeState } from "../runtime/types";

import { createGameFlowState, createPhaseActionStatusViewModel, type PhaseActionStatusViewModel } from "./gameFlow";


type PhaseDraftState = {
  decision: PhaseDraftByPhase["decision"];
  market: PhaseDraftByPhase["market"];
  settlement: PhaseDraftByPhase["settlement"];
};

type UseGamePageControllerArgs = {
  runtimeState: GameRuntimeState;
  isLoadingContext: boolean;
  settlementTargetPath: string | null;
};

export type GamePageController = {
  currentPhase: GamePhase | null;
  currentPlayerId: string | null;
  currentPlayerPhaseWorkspace: PlayerPhaseWorkspace | null;
  currentPlayerState: PlayerState | null;
  draftPayload: Record<string, unknown>;
  drafts: PhaseDraftState;
  decisionFlowState: DecisionFlowState;
  flowState: ReturnType<typeof createGameFlowState>;
  onDraftsChange: Dispatch<SetStateAction<PhaseDraftState>>;
  onDecisionFlowChange: Dispatch<SetStateAction<DecisionFlowState>>;
  phaseActionStatus: PhaseActionStatusViewModel;
  snapshot: GameSnapshot | null;
};

export function useGamePageController({
  runtimeState,
  isLoadingContext,
  settlementTargetPath,
}: UseGamePageControllerArgs): GamePageController {
  const [drafts, setDrafts] = useState<PhaseDraftState>(() => createDraftState());
  const [decisionFlowState, setDecisionFlowState] = useState<DecisionFlowState>(() =>
    createInitialDecisionFlowState(),
  );
  const currentPhase = runtimeState.snapshot?.phase ?? runtimeState.game?.currentPhase ?? null;
  const currentRound = runtimeState.snapshot?.round ?? runtimeState.game?.currentRound ?? null;
  const flowState = createGameFlowState({
    runtimeState,
    isLoadingContext,
    settlementTargetPath,
  });
  const currentPlayerPhaseWorkspace =
    flowState.currentPlayerId && flowState.currentSnapshot
      ? flowState.currentSnapshot.phaseWorkspace?.players?.[flowState.currentPlayerId] ?? null
      : null;
  const phaseActionStatus = createPhaseActionStatusViewModel({
    currentPhase,
    flowState,
    runtimeState,
  });

  useEffect(() => {
    if (!currentPhase) {
      return;
    }

    setDrafts((previous) => resetDraftForPhase(previous, currentPhase));
    setDecisionFlowState(createInitialDecisionFlowState());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset drafts when phase or round changes, not on every snapshot update
  }, [currentPhase, currentRound]);

  useEffect(() => {
    if (
      currentPhase !== "decision" ||
      !currentPlayerPhaseWorkspace ||
      !("militaryWorkspace" in currentPlayerPhaseWorkspace)
    ) {
      return;
    }

    const phase1Production = createDefaultPhase1ProductionDraft(currentPlayerPhaseWorkspace);
    if (!phase1Production) {
      return;
    }

    setDrafts((previous) => {
      if (previous.decision.phase1Production !== undefined) {
        return previous;
      }
      return {
        ...previous,
        decision: {
          ...previous.decision,
          phase1Production,
        },
      };
    });
  }, [currentPhase, currentPlayerPhaseWorkspace]);

  return {
    currentPhase,
    currentPlayerId: flowState.currentPlayerId,
    currentPlayerPhaseWorkspace,
    currentPlayerState: flowState.currentPlayerState,
    draftPayload: currentPhase === "decision"
      ? buildDecisionSubmission(drafts.decision)
      : currentPhase
        ? (drafts[currentPhase] as unknown as Record<string, unknown>)
        : {},
    drafts,
    decisionFlowState,
    flowState,
    onDraftsChange: setDrafts,
    onDecisionFlowChange: setDecisionFlowState,
    phaseActionStatus,
    snapshot: flowState.currentSnapshot,
  };
}

function createDraftState(): PhaseDraftState {
  return {
    decision: createInitialPhaseDraft("decision"),
    market: createInitialPhaseDraft("market"),
    settlement: createInitialPhaseDraft("settlement"),
  };
}

function resetDraftForPhase(drafts: PhaseDraftState, phase: GamePhase): PhaseDraftState {
  switch (phase) {
    case "decision":
      return {
        ...drafts,
        decision: createInitialPhaseDraft("decision"),
      };
    case "market":
      return {
        ...drafts,
        market: createInitialPhaseDraft("market"),
      };
    case "settlement":
      return {
        ...drafts,
        settlement: createInitialPhaseDraft("settlement"),
      };
    default:
      return drafts;
  }
}
