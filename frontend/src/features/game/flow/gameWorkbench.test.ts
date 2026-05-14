import { describe, expect, it } from "vitest";

import { createInitialDecisionFlowState } from "./decisionFlow";
import { createGameWorkbenchViewModel, getPhaseSubmitBlockingReasons } from "./gameWorkbench";
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

  it("blocks decision submission until undecided steps are reviewed or skipped", () => {
    const draft = createInitialPhaseDraft("decision");
    const reasons = getPhaseSubmitBlockingReasons({
      currentPhase: "decision",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace(),
      draftPayload: draft,
      decisionFlowState: createInitialDecisionFlowState(),
    });

    expect(reasons[0]).toContain("请先完成或跳过");
    expect(reasons[0]).toContain("工厂决策");
    expect(reasons[0]).toContain("政府政策");
    expect(reasons[0]).toContain("军事要塞");
    expect(reasons[0]).toContain("研究院");
  });

  it("allows decision submission when empty steps have been explicitly skipped", () => {
    const decisionFlowState = createInitialDecisionFlowState();
    const reasons = getPhaseSubmitBlockingReasons({
      currentPhase: "decision",
      currentPlayerState: createNationalState(),
      currentPlayerWorkspace: createDecisionPlayerWorkspace(),
      draftPayload: createInitialPhaseDraft("decision"),
      decisionFlowState: {
        ...decisionFlowState,
        stepReviewStateByStep: {
          factory: "no_op",
          government: "no_op",
          domestic: "checked",
          military: "no_op",
          research: "no_op",
        },
      },
    });

    expect(reasons).toEqual([]);
  });
});
