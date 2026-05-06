import { describe, expect, it } from "vitest";

import { createInitialDecisionFlowState } from "./decisionFlow";
import { createGameWorkbenchViewModel } from "./gameWorkbench";
import { createInitialPhaseDraft } from "../forms";
import {
  createDecisionPlayerWorkspace,
  createNationalState,
} from "../../../test/gameSnapshotFixtures";

describe("createGameWorkbenchViewModel", () => {
  it("marks government as decided when a policy activation is queued", () => {
    const draft = createInitialPhaseDraft("decision");
    draft.activatePolicies = ["trade_agreement"];

    const viewModel = createGameWorkbenchViewModel({
      currentPhase: "decision",
      currentPlayerId: "player-1",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace(),
      currentSubmittedStatus: "pending",
      draftPayload: draft,
      decisionFlowState: createInitialDecisionFlowState(),
      rankingStandings: [],
      settlementWorkspace: null,
    });

    expect(viewModel.topWorkflow?.steps.find((step) => step.id === "government")?.statusLabel).toBe("已决策");
    expect(viewModel.assistRail.checklist.lines.find((line) => line.startsWith("政府政策"))).toContain("已决策");
    expect(viewModel.assistRail.submit.warningLines).not.toEqual(
      expect.arrayContaining([expect.stringContaining("政府政策")]),
    );
  });
});
