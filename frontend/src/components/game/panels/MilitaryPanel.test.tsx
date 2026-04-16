import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialPhaseDraft } from "../../../features/game/forms";
import { createDecisionPlayerWorkspace } from "../../../test/gameSnapshotFixtures";

import { MilitaryPanel } from "./MilitaryPanel";

describe("MilitaryPanel", () => {
  it("renders colonization as permanent unlock plus target status, without mixed 10+3 military pricing", () => {
    const workspace = createDecisionPlayerWorkspace();
    const draft = createInitialPhaseDraft("decision");

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={24}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleDiplomacy={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
      />,
    );

    expect(screen.getByText("殖民扩张")).toBeInTheDocument();
    expect(screen.getByText(/永久解锁殖民能力/)).toBeInTheDocument();
    expect(screen.getAllByText("需先永久解锁殖民扩张")).toHaveLength(2);
    expect(screen.queryByText("10+3军")).not.toBeInTheDocument();
  });

  it("shows colonization target as executable after permanent unlock", () => {
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...createDecisionPlayerWorkspace().militaryWorkspace,
        militaryPoints: 3,
        establishedDiplomacy: ["middle_east"],
        colonizationCapability: {
          ...createDecisionPlayerWorkspace().militaryWorkspace.colonizationCapability,
          isUnlocked: true,
        },
        colonizationOptions: [
          {
            regionId: "middle_east",
            regionLabel: "中东",
            controller: null,
            isColonized: false,
            militaryPointCost: 3,
            canColonize: true,
            lockedReason: null,
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={14}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleDiplomacy={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
      />,
    );

    expect(screen.getByText(/已永久解锁/)).toBeInTheDocument();
    expect(screen.getByText("可殖民")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "殖民中东" })).toBeEnabled();
  });
});
