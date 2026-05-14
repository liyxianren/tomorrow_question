import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { GameMapView } from "../components/game/layout/GameMapView";
import { PhaseAnnounce } from "../components/game/map/PhaseAnnounce";
import { UnifiedSubmitPanel } from "../components/game/feedback/UnifiedSubmitPanel";
import {
  DecisionWorkbench,
  GamePhasePanelContent,
  MarketWorkbench,
  SettlementWorkbench,
} from "../components/game/panels/GamePhasePanelContent";
import { GameSituationSummary } from "../components/game/status/GameSituationSummary";
import type { DecisionStepId } from "../features/game/flow/decisionFlow";
import { createGameWorkbenchViewModel, getPhaseSubmitBlockingReasons } from "../features/game/flow/gameWorkbench";
import { useGamePageController } from "../features/game/flow/useGamePageController";
import { useMapViewState } from "../features/game/flow/useMapViewState";
import { useGameRuntime } from "../features/game/runtime/useGameRuntime";
import type { SubmitPhaseResponse } from "../services/game";
import type {
  DecisionPlayerPhaseWorkspace,
  MarketPlayerPhaseWorkspace,
  SessionContextResponse,
  SettlementPlayerPhaseWorkspace,
} from "../types";

type GameRouteState = {
  bootstrap: SessionContextResponse;
};

const DECISION_STEP_MODAL_TITLE: Record<DecisionStepId, string> = {
  factory: "工业区",
  domestic: "市民广场",
  government: "议会厅",
  military: "军事要塞",
  research: "研究院",
};

export function GamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as GameRouteState | null) ?? null;
  const bootstrap = routeState?.bootstrap ?? null;
  const resolvedGameId = gameId ?? bootstrap?.activeGame?.gameId ?? "";
  const {
    runtimeState,
    isLoadingContext,
    loadError,
    settlementTargetPath,
    updateSubmissionStatusByPlayerId,
    forceReconcile,
  } = useGameRuntime({
    routeGameId: resolvedGameId,
    bootstrap,
  });
  const controller = useGamePageController({
    runtimeState,
    isLoadingContext,
    settlementTargetPath,
  });

  useEffect(() => {
    if (!controller.flowState.shouldRedirectToSettlement || !settlementTargetPath || !runtimeState.finalResult) {
      return;
    }
    navigate(settlementTargetPath, {
      replace: true,
      state: {
        result: runtimeState.finalResult,
        roomCode: runtimeState.room?.roomCode ?? null,
      },
    });
  }, [controller.flowState.shouldRedirectToSettlement, navigate, runtimeState.finalResult, runtimeState.room?.roomCode, settlementTargetPath]);

  function handleSubmitted(response: SubmitPhaseResponse): void {
    updateSubmissionStatusByPlayerId(response.submissionStatus, {
      phase: response.phase,
      roundNo: response.roundNo,
    });
    if (response.settlementTriggered || response.allSubmitted) {
      setTimeout(() => forceReconcile(), 300);
      setTimeout(() => forceReconcile(), 1000);
    }
  }

  const currentPhase = controller.currentPhase;
  const currentWorkspace = controller.currentPlayerPhaseWorkspace;
  const currentPlayerState = controller.currentPlayerState;
  const currentPlayerId = controller.currentPlayerId;
  const rankingStandings = runtimeState.snapshot?.rankingWorkspace?.standings ?? runtimeState.snapshot?.ranking ?? [];
  const settlementWorkspace = runtimeState.latestSettlement?.lastSettlementWorkspace ?? runtimeState.snapshot?.lastSettlementWorkspace ?? null;
  const currentSubmittedStatus = currentPlayerId
    ? runtimeState.submissionStatusByPlayerId[currentPlayerId] ?? "pending"
    : "pending";
  const workbenchViewModel = createGameWorkbenchViewModel({
    currentPhase,
    currentPlayerId,
    currentPlayerState,
    currentPlayerWorkspace: currentWorkspace,
    currentSubmittedStatus,
    draftPayload: controller.draftPayload,
    decisionFlowState: controller.decisionFlowState,
    rankingStandings,
    settlementWorkspace,
  });
  const submitBlockingReasons = getPhaseSubmitBlockingReasons({
    currentPhase,
    currentPlayerState,
    currentPlayerWorkspace: currentWorkspace,
    draftPayload: controller.draftPayload,
    decisionFlowState: controller.decisionFlowState,
  });

  const mapState = useMapViewState({
    currentPhase,
    currentPlayerWorkspace: currentWorkspace,
    currentPlayerState,
    onDecisionFlowChange: controller.onDecisionFlowChange,
  });
  const activeDecisionModalStep =
    currentPhase === "decision" && mapState.activeModalId
      ? controller.decisionFlowState.activeStep
      : null;
  const currentRound = runtimeState.snapshot?.round ?? runtimeState.game?.currentRound ?? 0;
  const totalRounds = runtimeState.game?.totalRounds ?? runtimeState.snapshot?.maxRounds ?? 0;
  const isFinalRoundSettlement = currentPhase === "settlement" && totalRounds > 0 && currentRound >= totalRounds;

  const bottomDock =
    runtimeState.game && currentPhase && currentPlayerId && currentPhase !== "settlement" ? (
      <UnifiedSubmitPanel
        canSubmit={runtimeState.canSubmitCurrentPhase && submitBlockingReasons.length === 0}
        disabledReasons={submitBlockingReasons}
        draftPayload={controller.draftPayload}
        gameId={runtimeState.game.gameId}
        onSubmitted={handleSubmitted}
        phase={currentPhase}
        playerId={currentPlayerId}
        roundNo={runtimeState.snapshot?.round ?? runtimeState.game.currentRound}
        submissionStatus={currentSubmittedStatus}
        submissionStatusByPlayerId={runtimeState.submissionStatusByPlayerId}
      />
    ) : (
      <div style={{ color: "var(--game-text-secondary)", fontSize: 14, textAlign: "center" }}>
        结算完成，{runtimeState.secondsRemaining != null && runtimeState.secondsRemaining > 0 ? `${runtimeState.secondsRemaining} 秒后` : "即将"}进入{isFinalRoundSettlement ? "终局档案" : "下一回合"}
      </div>
    );

  function renderModalContent(): React.ReactNode {
    if (!mapState.activeModalId || !currentPhase || !currentWorkspace) return null;

    if (currentPhase === "decision") {
      return (
        <GamePhasePanelContent
          currentPhase={currentPhase}
          currentPlayerState={currentPlayerState}
          currentPlayerWorkspace={currentWorkspace}
          decisionFlowState={controller.decisionFlowState}
          drafts={controller.drafts}
          onComplete={mapState.closeModal}
          onDecisionFlowChange={controller.onDecisionFlowChange}
          onDraftsChange={controller.onDraftsChange}
          isFinalRoundSettlement={isFinalRoundSettlement}
          secondsRemaining={runtimeState.secondsRemaining}
        />
      );
    }

    if (currentPhase === "market") {
      return (
        <MarketWorkbench
          draft={controller.drafts.market}
          onChange={(value) => controller.onDraftsChange((prev) => ({ ...prev, market: value }))}
          playerState={currentPlayerState}
          readOnly={currentSubmittedStatus === "submitted" || currentSubmittedStatus === "timeout_auto_submitted"}
          workspace={currentWorkspace as MarketPlayerPhaseWorkspace}
        />
      );
    }

    return null;
  }

  const inlineSettlement =
    currentPhase === "settlement" && currentWorkspace ? (
      <SettlementWorkbench
        isFinalRound={isFinalRoundSettlement}
        playerState={currentPlayerState}
        workspace={currentWorkspace as SettlementPlayerPhaseWorkspace}
        secondsRemaining={runtimeState.secondsRemaining}
      />
    ) : null;

  return (
    <>
    <PhaseAnnounce
      phase={currentPhase}
      round={currentRound}
    />
    <GameMapView
      activeModalId={mapState.activeModalId}
      bottomDock={bottomDock}
      buildings={mapState.buildings}
      mapImage={mapState.mapImage}
      inlineContent={loadError ? (
        <section className="panel">
          <p style={{ margin: 0, color: "#ffb4a1" }}>{loadError}</p>
        </section>
      ) : inlineSettlement}
      modalContent={renderModalContent()}
      modalTitle={
        activeDecisionModalStep
          ? DECISION_STEP_MODAL_TITLE[activeDecisionModalStep]
          : mapState.modalTitle
      }
      modalVariant={activeDecisionModalStep ?? mapState.activeModalId}
      onBuildingClick={mapState.openModal}
      onModalClose={mapState.closeModal}
      situationBar={
        <GameSituationSummary
          isLoading={isLoadingContext}
          onWorkflowStepChange={(step) => {
            controller.onDecisionFlowChange((previous) => ({ ...previous, activeStep: step }));
            mapState.openModal(step);
          }}
          resourceStrip={workbenchViewModel.resourceStrip}
          runtimeState={runtimeState}
          workflow={workbenchViewModel.topWorkflow}
        />
      }
    />
    </>
  );
}
