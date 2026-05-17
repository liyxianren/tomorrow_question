import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import {
  createDecisionPlayerWorkspace,
  createGameSnapshot,
  createNationalState,
  createPhaseWorkspace,
} from "../../../test/gameSnapshotFixtures";
import type { GameRuntimeState } from "../runtime/types";
import { useGamePageController } from "./useGamePageController";

function renderController(runtimeState: GameRuntimeState) {
  function Harness() {
    const controller = useGamePageController({
      runtimeState,
      isLoadingContext: false,
      settlementTargetPath: null,
    });

    return <pre data-testid="draft-payload">{JSON.stringify(controller.draftPayload)}</pre>;
  }

  render(<Harness />);
}

function MutableHarness({ state, shouldSeedPolicy }: { state: GameRuntimeState; shouldSeedPolicy: boolean }) {
  const controller = useGamePageController({
    runtimeState: state,
    isLoadingContext: false,
    settlementTargetPath: null,
  });

  useEffect(() => {
    if (!shouldSeedPolicy) {
      return;
    }
    controller.onDraftsChange((previous) => ({
      ...previous,
      decision: {
        ...previous.decision,
        activatePolicies: ["raise_commercial_tax"],
      },
    }));
  }, [controller.onDraftsChange, shouldSeedPolicy]);

  return <pre data-testid="draft-payload">{JSON.stringify(controller.draftPayload)}</pre>;
}

function renderMutableController(runtimeState: GameRuntimeState, seedPolicy = false) {
  return render(<MutableHarness state={runtimeState} shouldSeedPolicy={seedPolicy} />);
}

function createRuntimeState(snapshot = createGameSnapshot()): GameRuntimeState {
  return {
    room: null,
    game: {
      gameId: snapshot.gameId,
      roomCode: "ROOM01",
      currentRound: snapshot.round,
      totalRounds: snapshot.maxRounds,
      currentPhase: snapshot.phase,
      isFinished: false,
      activeSnapshotId: snapshot.snapshotId,
    },
    snapshot,
    session: {
      playerId: "player-1",
      sessionId: "session-1",
      nickname: "Player",
      roomCode: "ROOM01",
      selectedCountry: "britain",
      connectionStatus: "online",
      lastSeenAt: null,
    },
    recoveredTurnInputs: [],
    recoveredLogs: [],
    socketState: "connected",
    secondsRemaining: null,
    submissionStatusByPlayerId: { "player-1": "pending" },
    latestSettlement: null,
    finalResult: null,
    hasRecoveredFromServer: true,
    isCurrentPlayerSubmitted: false,
    canSubmitCurrentPhase: true,
  };
}

describe("useGamePageController", () => {
  it("preloads phase-1 raw material assignments before the player opens the industrial panel", async () => {
    const workspace = createDecisionPlayerWorkspace({
      phase1Economy: {
        capacityByMode: {
          idle: 0,
          handicraft: 2,
          mechanized: 0,
          steam: 0,
          electrified: 0,
        },
        rawMaterials: 10,
        goodsInventory: 0,
        productionModes: [
          {
            mode: "handicraft",
            label: "手工业",
            inputRatio: 1,
            outputRatio: 1,
            demandCoefficient: 2,
            buildCost: 12,
            upgradeCost: 0,
            currentCapacity: 2,
            requiredTech: null,
            isAvailable: true,
          },
        ],
        domesticDemand: 0,
        equilibriumPrice: 0,
        domesticPricePreview: 0,
        investmentPool: 0,
        incomeAllocationRatio: {},
        marketMetrics: {},
      },
    });
    const phaseWorkspace = createPhaseWorkspace("decision", {
      availableActionsByPlayer: { "player-1": workspace },
      players: { "player-1": workspace },
    });
    const snapshot = createGameSnapshot({
      phase: "decision",
      nationalStateByPlayer: { "player-1": createNationalState() },
      phaseWorkspace,
    });

    renderController(createRuntimeState(snapshot));

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("draft-payload").textContent ?? "{}")).toMatchObject({
        phase1Production: {
          rawMaterialAssignments: {
            handicraft: 2,
          },
        },
      });
    });
  });

  it("clears decision policy drafts when a new decision round is restored directly", async () => {
    const roundOne = createGameSnapshot({ phase: "decision", round: 1 });
    const view = renderMutableController(createRuntimeState(roundOne), true);

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("draft-payload").textContent ?? "{}").activatePolicies).toEqual([
        "raise_commercial_tax",
      ]);
    });

    const roundTwo = createGameSnapshot({ phase: "decision", round: 2, snapshotId: "snapshot-2" });
    view.rerender(<MutableHarness state={createRuntimeState(roundTwo)} shouldSeedPolicy={false} />);

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("draft-payload").textContent ?? "{}").activatePolicies).toEqual([]);
    });
  });
});
