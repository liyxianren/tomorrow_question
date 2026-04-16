import { describe, expect, it } from "vitest";

import { calculateDecisionSpendSummary } from "./decisionShared";
import { createInitialPhaseDraft } from "./forms";
import { createDecisionPlayerWorkspace } from "../../test/gameSnapshotFixtures";

describe("calculateDecisionSpendSummary", () => {
  it("counts colonization unlock once and does not charge fiscal cost for colonization target selection", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    draft.militaryPlan.unlockColonization = true;
    draft.militaryPlan.colonizationActions = [{ targetRegionId: "africa" }];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(10);
  });

  it("does not add unlock spend when colonization is already permanently unlocked", () => {
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...createDecisionPlayerWorkspace().militaryWorkspace,
        colonizationCapability: {
          ...createDecisionPlayerWorkspace().militaryWorkspace.colonizationCapability,
          isUnlocked: true,
        },
      },
    });
    const draft = createInitialPhaseDraft("decision");

    draft.militaryPlan.unlockColonization = true;
    draft.militaryPlan.colonizationActions = [{ targetRegionId: "middle_east" }];

    const summary = calculateDecisionSpendSummary(workspace, draft);

    expect(summary.governmentSpend).toBe(0);
  });
});
