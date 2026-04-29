import { fireEvent, render, screen, within } from "@testing-library/react";
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
        onNavalDeploymentChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
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
        onNavalDeploymentChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    expect(screen.getByText(/已永久解锁/)).toBeInTheDocument();
    expect(screen.getByText("可殖民")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "殖民中东" })).toBeEnabled();
  });

  it("renders conquest section on accessible non-colonized regions", () => {
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...createDecisionPlayerWorkspace().militaryWorkspace,
        militaryPoints: 30,
      },
    });
    const draft = createInitialPhaseDraft("decision");

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={100}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleDiplomacy={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onNavalDeploymentChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    const conquestSections = screen.getAllByTestId(/^conquest-/);
    expect(conquestSections.length).toBe(2);
    const first = conquestSections[0];
    expect(within(first).getByText(/⚔️ 征服/)).toBeInTheDocument();
    expect(within(first).getAllByText(/步兵/).length).toBeGreaterThan(0);
    expect(within(first).getAllByText(/炮兵/).length).toBeGreaterThan(0);
    expect(within(first).getByText(/战力/)).toBeInTheDocument();
    const region0 = conquestSections[0].getAttribute("data-testid")?.replace("conquest-", "") ?? "";
    expect(within(first).getByRole("button", { name: `增加${region0 === "africa" ? "非洲" : region0 === "middle_east" ? "中东" : region0}步兵` })).toBeEnabled();
  });

  it("renders independence bar with warning when independence >= 60", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        colonizationOptions: [
          {
            regionId: "africa",
            regionLabel: "非洲",
            controller: "britain",
            isColonized: true,
            militaryPointCost: 3,
            canColonize: false,
            lockedReason: "已被殖民",
            independence: 70,
            garrison: { britain: 3 },
            resourceLimit: { coal: 5, iron: 3 },
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={50}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleDiplomacy={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onNavalDeploymentChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    expect(screen.getByText(/独立度 70%/)).toBeInTheDocument();
    expect(screen.getByText(/⚠️/)).toBeInTheDocument();
    expect(screen.getByText(/驻军/)).toBeInTheDocument();
    expect(screen.getByText(/britain×3/)).toBeInTheDocument();
  });

  it("calls onLootingToggle with the resource type when 掠夺 button is clicked", () => {
    const handleLootingToggle = vi.fn();
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        colonizationOptions: [
          {
            regionId: "africa",
            regionLabel: "非洲",
            controller: "britain",
            isColonized: true,
            militaryPointCost: 3,
            canColonize: false,
            lockedReason: "已被殖民",
            independence: 30,
            garrison: { britain: 1 },
            resourceLimit: { coal: 5 },
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={50}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleDiplomacy={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onNavalDeploymentChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={handleLootingToggle}
      />,
    );

    const lootBtn = screen.getByRole("button", { name: /掠夺非洲煤炭/ });
    fireEvent.click(lootBtn);
    expect(handleLootingToggle).toHaveBeenCalledWith("africa", "coal");
  });
});
