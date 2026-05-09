import { describe, expect, it } from "vitest";

import { createInitialPhaseDraft } from "../forms";
import {
  DECISION_STEP_ORDER,
  clearDecisionStepDraft,
  getDecisionStepCompletionSummary,
  getNextDecisionStep,
  getPreviousDecisionStep,
  getUncheckedDecisionSteps,
  hasDecisionStepContent,
  createInitialDecisionFlowState,
} from "./decisionFlow";

describe("decisionFlow factory draft helpers", () => {
  it("places government policy before the read-only market preview", () => {
    expect(DECISION_STEP_ORDER).toEqual(["factory", "government", "domestic", "military", "research"]);
    expect(getNextDecisionStep("factory")).toBe("government");
    expect(getPreviousDecisionStep("domestic")).toBe("government");
  });

  it("clears phase-1 raw assignments when the factory step is cleared", () => {
    const draft = {
      ...createInitialPhaseDraft("decision"),
      phase1Production: {
        rawMaterialAssignments: {
          handicraft: 2,
        },
      },
    };

    expect(clearDecisionStepDraft(draft, "factory")).not.toHaveProperty("phase1Production");
  });

  it("summarizes phase-1 production by raw material input", () => {
    const draft = {
      ...createInitialPhaseDraft("decision"),
      phase1Production: {
        rawMaterialAssignments: {
          handicraft: 2,
          mechanized: 1,
        },
      },
    };

    expect(getDecisionStepCompletionSummary(draft, "factory")).toBe("投料 3 原材料 / 建设 0 次");
  });

  it("counts research facility construction as research content without making government dirty", () => {
    const draft = createInitialPhaseDraft("decision");
    draft.governmentPlan.strategySelections = [{ actionId: "expand_research" }];

    expect(hasDecisionStepContent(draft, "government")).toBe(false);
    expect(hasDecisionStepContent(draft, "research")).toBe(true);
  });

  it("counts policy and reform queues as government content and clears them with the step", () => {
    const draft = createInitialPhaseDraft("decision");
    draft.activatePolicies = ["expand_army"];
    draft.reforms = ["constitutional_monarchy"];

    expect(hasDecisionStepContent(draft, "government")).toBe(true);

    const cleared = clearDecisionStepDraft(draft, "government");
    expect(cleared.activatePolicies).toEqual([]);
    expect(cleared.deactivatePolicies).toEqual([]);
    expect(cleared.reforms).toEqual([]);
    expect(hasDecisionStepContent(cleared, "government")).toBe(false);
  });

  it("treats existing active research as reviewed content for the research step", () => {
    const draft = createInitialPhaseDraft("decision");
    const context = { activeResearch: "internal_combustion" };

    expect(hasDecisionStepContent(draft, "research", context)).toBe(true);
    expect(getDecisionStepCompletionSummary(draft, "research", context)).toBe("当前研究中：internal_combustion");
    expect(getUncheckedDecisionSteps(createInitialDecisionFlowState(), draft, context)).not.toContain("research");
  });
});
