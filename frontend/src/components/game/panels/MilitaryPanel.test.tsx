import { fireEvent, render, screen } from "@testing-library/react";
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
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onRegionBlockadeChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("可部署舰队 / 本轮总舰队")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("地区封锁部署")).toBeInTheDocument();
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
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onRegionBlockadeChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    expect(screen.queryByText("殖民扩张")).not.toBeInTheDocument();
    expect(screen.queryByText(/永久解锁殖民能力/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /殖民/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /掠夺/ })).not.toBeInTheDocument();
  });

  it("hides legacy naval drill even when an old snapshot still includes it", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        availableMilitaryActions: [
          ...baseWorkspace.militaryWorkspace.availableMilitaryActions,
          {
            actionId: "naval_drill",
            label: "海军演练",
            cost: 4,
            maxPerRound: 2,
            description: "消耗政府财政开展海军演练，永久提高海外市场承接上限。",
            effects: { overseasMarketCapacityDelta: 1 },
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={24}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onRegionBlockadeChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    expect(screen.queryByText("海军演练")).not.toBeInTheDocument();
    expect(screen.queryByText(/海外容量 \+1/)).not.toBeInTheDocument();
  });

  it("does not render legacy conquest controls on accessible regions", () => {
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
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onRegionBlockadeChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /世界地图/ })).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^conquest-/)).toHaveLength(0);
    expect(screen.queryByText(/投入已有部队/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /增加.*步兵/ })).not.toBeInTheDocument();
  });

  it("does not render ocean node deployment controls", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        navy: { fleets: 2 },
        oceanNodes: [
          {
            nodeId: "legacy_ocean",
            navyByCountry: { britain: 1 },
            controller: "britain",
            isBlockaded: true,
            myFleet: 1,
          },
        ],
      },
    });
    const draft = createInitialPhaseDraft("decision");
    draft.militaryPlan.navalDeployment = { legacy_ocean: 2 };

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={100}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onRegionBlockadeChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("ocean-node-legacy_ocean")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /部署/ })).not.toBeInTheDocument();
  });

  it("shows region blockade controls and rule explanation", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        navy: { fleets: 4 },
      },
    });
    const draft = createInitialPhaseDraft("decision");
    draft.militaryPlan.regionBlockades = { africa: 2 };

    render(
      <MilitaryPanel
        workspace={workspace}
        draft={draft}
        remainingGovernmentBudget={100}
        onAddMilitary={vi.fn()}
        onRemoveMilitary={vi.fn()}
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onRegionBlockadeChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("region-node-africa"));

    const drawer = screen.getByLabelText("非洲 区域详情");
    expect(drawer).toHaveTextContent("地区封锁");
    expect(drawer).toHaveTextContent("已向这个地区分配 2 支舰队");
    expect(drawer).toHaveTextContent("投入 4 支及以上");
    expect(drawer).toHaveTextContent("多人同时封锁时比舰队数，平手不形成封锁");
    expect(drawer).toHaveTextContent("本地区舰队");
    expect(drawer).toHaveTextContent("可调 0-4");
  });

  it("shows region blockade details inside military region decisions", () => {
    const baseWorkspace = createDecisionPlayerWorkspace();
    const workspace = createDecisionPlayerWorkspace({
      militaryWorkspace: {
        ...baseWorkspace.militaryWorkspace,
        regionAccessStatus: baseWorkspace.militaryWorkspace.regionAccessStatus.map((region) => (
          region.regionId === "africa"
            ? {
                ...region,
                isAccessible: false,
                lockReason: "route_blocked",
                blockedOceanNodes: [
                  {
                    nodeId: "africa",
                    label: "非洲",
                    controller: "france",
                    controllerLabel: "法国",
                  },
                ],
                navyByCountry: { france: 4 },
                blockadeController: "france",
                isBlockaded: true,
                canCompete: false,
                competitionLockedReason: "route_blocked",
              }
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
        onToggleColonizationUnlock={vi.fn()}
        onColonize={vi.fn()}
        onCancelColonize={vi.fn()}
        onRegionBlockadeChange={vi.fn()}
        onConquestChange={vi.fn()}
        onLootingToggle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("region-node-africa"));
    expect(screen.getByTestId("region-node-africa")).toHaveTextContent("非洲 - 法国封锁");

    const drawer = screen.getByLabelText("非洲 区域详情");
    expect(drawer).toHaveTextContent("地区封锁");
    expect(drawer).toHaveTextContent("封锁地区：非洲（控制：法国）");
    expect(drawer).toHaveTextContent("法国 正在封锁这个地区");
    expect(drawer).toHaveTextContent("无法向该区域出售；容量视为 0");
  });
});
