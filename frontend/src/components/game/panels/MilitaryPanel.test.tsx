import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createInitialPhaseDraft } from "../../../features/game/forms";
import { createDecisionPlayerWorkspace } from "../../../test/gameSnapshotFixtures";

import { MilitaryPanel } from "./MilitaryPanel";

describe("MilitaryPanel", () => {
  it("counts selected fleet construction in the map deployment preview", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        militaryPoints: 5,
        availableMilitaryActions: [
          ...baseWorkspace.militaryWorkspace.availableMilitaryActions,
          {
            actionId: "build_fleet",
            label: "建造舰队",
            cost: 3,
            maxPerRound: 1,
            description: "消耗军事点建造新舰队，增强海军封锁能力。",
            effects: { navyDelta: { fleets: 1 } },
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");
    draft.militaryPlan.militaryActions = [{ actionId: "build_fleet" }];

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

    expect(screen.getByText("可用舰队")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText(/现有舰队 \+ 本轮已选建造舰队/)).toBeInTheDocument();
  });

  it("does not render legacy colonization or looting controls", () => {
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

    expect(screen.queryByText("殖民扩张")).not.toBeInTheDocument();
    expect(screen.queryByText(/永久解锁殖民能力/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /殖民/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /掠夺/ })).not.toBeInTheDocument();
  });

  it("renders conquest section on accessible non-colonized regions", () => {
    const workspace = createDecisionPlayerWorkspace({
      militaryPoints: 30,
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
    expect(within(first).getAllByText(/投入已有部队/).length).toBeGreaterThan(0);
    expect(within(first).getByText(/战力/)).toBeInTheDocument();
    const region0 = conquestSections[0].getAttribute("data-testid")?.replace("conquest-", "") ?? "";
    expect(within(first).getByRole("button", { name: `增加${region0 === "africa" ? "非洲" : region0 === "middle_east" ? "中东" : region0}步兵` })).toBeEnabled();
  });

  it("shows defender power with artillery×2 weighting and ×2 attack threshold for garrisoned conquest targets", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryPoints: 30,
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        militaryPoints: 30,
        regionAccessStatus: baseWorkspace.militaryWorkspace.regionAccessStatus.map((region) => (
          region.regionId === "africa"
            ? { ...region, garrison: { infantry: 2, artillery: 1 } }
            : region
        )),
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

    const conquestSection = screen.getByTestId("conquest-africa");
    // defender power = 2 + 1×2 = 4; required attack = 4×2 = 8
    expect(within(conquestSection).getByText(/守军战力 = 4/)).toBeInTheDocument();
    expect(within(conquestSection).getByText(/需≥8/)).toBeInTheDocument();
  });

  it("merges draft naval deployment into ocean detail breakdown", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        navy: { fleets: 2 },
        oceanNodes: [
          {
            nodeId: "north_atlantic",
            navyByCountry: { britain: 1 },
            controller: "britain",
            isBlockaded: true,
            myFleet: 1,
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");
    draft.militaryPlan.navalDeployment = { north_atlantic: 2 };

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

    fireEvent.click(screen.getByTestId("ocean-node-north_atlantic"));

    const myCountryRow = screen.getByText("britain（你）").closest("li");
    expect(myCountryRow).not.toBeNull();
    expect(within(myCountryRow as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("previews ocean controller and blockade from draft naval deployment", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        navy: { fleets: 2 },
        oceanControlThreshold: 2,
        oceanNodes: [
          {
            nodeId: "north_atlantic",
            navyByCountry: {},
            controller: null,
            isBlockaded: false,
            myFleet: 0,
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");
    draft.militaryPlan.navalDeployment = { north_atlantic: 2 };

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

    fireEvent.click(screen.getByTestId("ocean-node-north_atlantic"));

    expect(screen.getByLabelText("北大西洋 区域详情")).toHaveTextContent("封锁中");
    expect(screen.getByLabelText("北大西洋 区域详情")).toHaveTextContent("控制：britain（你）");
  });
});
