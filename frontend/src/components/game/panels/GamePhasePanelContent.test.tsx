import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { createInitialDecisionFlowState } from "../../../features/game/flow/decisionFlow";
import { createInitialPhaseDraft } from "../../../features/game/forms";
import {
  createDecisionPlayerWorkspace,
  createMarketPlayerWorkspace,
  createNationalState,
} from "../../../test/gameSnapshotFixtures";

import { GamePhasePanelContent } from "./GamePhasePanelContent";

function renderPanel(
  phase: "decision" | "market",
  overrides: {
    decisionWorkspace?: ReturnType<typeof createDecisionPlayerWorkspace>;
    marketWorkspace?: ReturnType<typeof createMarketPlayerWorkspace>;
  } = {},
) {
  function Harness() {
    const [drafts, setDrafts] = useState({
      decision: createInitialPhaseDraft("decision"),
      market: createInitialPhaseDraft("market"),
      settlement: createInitialPhaseDraft("settlement"),
    });
    const [decisionFlowState, setDecisionFlowState] = useState(createInitialDecisionFlowState());

    return (
      <>
        <GamePhasePanelContent
          currentPhase={phase}
          currentPlayerState={createNationalState()}
          currentPlayerWorkspace={
            phase === "decision"
              ? (overrides.decisionWorkspace ?? createDecisionPlayerWorkspace())
              : (overrides.marketWorkspace ?? createMarketPlayerWorkspace())
          }
          decisionFlowState={decisionFlowState}
          drafts={drafts}
          onDecisionFlowChange={setDecisionFlowState}
          onDraftsChange={setDrafts}
        />
        <pre data-testid="draft-json">{JSON.stringify(drafts[phase])}</pre>
      </>
    );
  }

  render(<Harness />);
}

function readDraftJson() {
  return JSON.parse(screen.getByTestId("draft-json").textContent ?? "{}");
}

describe("GamePhasePanelContent", () => {
  it("guides decision editing one step at a time and still builds the 2.0 payload", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    expect(screen.getByTestId("factory-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-factory")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    expect(screen.getByTestId("domestic-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-domestic")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "选择 博览会" }));

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getByTestId("government-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-government")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "激活政策：贸易协定" }));

    await user.click(screen.getByRole("button", { name: "下一步：军事要塞" }));
    expect(screen.getByTestId("military-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-military")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByLabelText("确认动作：海军演练"));
    await user.click(screen.getByRole("button", { name: "与非洲建交" }));

    expect(readDraftJson()).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [{ actionId: "market_fair" }],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [],
        adminPurchases: 0,
      },
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [{ actionId: "naval_drill" }],
        diplomacyActions: [{ actionId: "establish_africa" }],
        colonizationActions: [],
        navalDeployment: {},
        conquestActions: [],
        lootingActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      reforms: [],
      activatePolicies: ["trade_agreement"],
      deactivatePolicies: [],
    });
  });

  it("navigates between decision steps and can return to the industrial panel", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    expect(screen.getByTestId("domestic-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-domestic")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "上一步：工厂决策" }));
    expect(screen.getByTestId("factory-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-factory")).toHaveAttribute("aria-pressed", "true");
  });

  it("renders factory panel with the header", () => {
    renderPanel("decision");

    const factoryPanel = screen.getByTestId("factory-panel");
    expect(within(factoryPanel).getByRole("heading", { name: "🏭 工业区" })).toBeInTheDocument();
  });

  it.skip("updates industrial overview and route capacity when production changes (legacy — removed with v1 panels)", async () => {
    // This test relied on FactoryRouteLane buttons which are no longer rendered.
  });

  it.skip("writes construction orders and shows next-round capacity preview (legacy — removed with v1 panels)", async () => {
    // This test relied on FactoryConstructionPanel buttons which are no longer rendered.
  });

  it("keeps domestic and government as dedicated panels", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    expect(screen.getByTestId("domestic-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getByTestId("government-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();
  });

  it.skip("shows locked factory goods and route reasons inside industrial intel (legacy — removed with v1 panels)", () => {});

  it.skip("renders route labels with localized names instead of internal ids (legacy — removed with v1 panels)", () => {});

  it.skip("queues chained industrial research in order and reveals newly unlocked production cards", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    expect(screen.getByLabelText("研究 蒸汽引擎")).toBeDisabled();
    expect(within(screen.getByTestId("factory-intel-panel")).getByText("钢铁")).toBeInTheDocument();

    await user.click(screen.getByLabelText("研究 珍妮纺织机"));
    await waitFor(() => {
      expect(screen.getByLabelText("研究 蒸汽引擎")).not.toBeDisabled();
    });
    expect(within(screen.getByTestId("factory-route-lane-mechanized")).getByText("钢铁")).toBeInTheDocument();

    await user.click(screen.getByLabelText("研究 蒸汽引擎"));

    expect(readDraftJson()).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        adminPurchases: 0,
        techResearch: [],
      },
      militaryPlan: {
        militaryActions: [],
        diplomacyActions: [],
        unlockColonization: false,
        colonizationActions: [],
        navalDeployment: {},
        conquestActions: [],
        lootingActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      reforms: [],
      activatePolicies: [],
      deactivatePolicies: [],
      researchTarget: { techId: "spinning_jenny" },
    });
  });

  it.skip("shows locked domestic and government actions with explicit tech reasons", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    expect(screen.getAllByText("需要研究「市场经济」").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "选择 消费补贴" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getAllByText("需要研究「行政改革」").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "产业政策" })).toBeDisabled();
  });

  it.skip("includes national ability selection and france ideology targeting in the decision payload", async () => {
    renderPanel("decision", {
      decisionWorkspace: createDecisionPlayerWorkspace({
        countryCode: "france",
        countryLabel: "法国",
        nationalAbility: {
          abilityId: "code_napoleon",
          label: "民法典",
          description: "将三项意识形态重置为 3，并使你选定的一项额外 +3。",
          requiresTargetIdeology: true,
          isAvailable: true,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    await user.click(screen.getByLabelText("启用国家能力：民法典"));
    await user.click(screen.getByLabelText("民法典 民族主义"));

    expect(readDraftJson()).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        adminPurchases: 0,
        techResearch: [],
      },
      militaryPlan: {
        militaryActions: [],
        diplomacyActions: [],
        unlockColonization: false,
        colonizationActions: [],
        navalDeployment: {},
        conquestActions: [],
        lootingActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      abilitySelection: {
        abilityId: "code_napoleon",
        targetIdeology: "nationalism",
      },
      reforms: [],
      activatePolicies: [],
      deactivatePolicies: [],
    });
  });

  it("renders military region status and hides established diplomacy actions", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    await user.click(screen.getByRole("button", { name: "下一步：军事要塞" }));

    expect(screen.getByRole("heading", { name: /海外区域/ })).toBeInTheDocument();
    expect(screen.getByText("橡胶·棉花·矿产")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "与中东建交" })).not.toBeInTheDocument();
    expect(screen.getByText("中东 已建交")).toBeInTheDocument();
  });

  it("builds the 2.0 market payload with phase1Market allocations", async () => {
    renderPanel("market", {
      marketWorkspace: createMarketPlayerWorkspace({
        regionAccessStatus: [
          {
            regionId: "asia_pacific",
            label: "亚太",
            accessLevel: "concession",
            isAccessible: true,
            isDiplomacyEstablished: true,
            isColonized: false,
            controller: null,
            acceptedGoods: ["grain"],
          },
        ],
      }),
    });
    const user = userEvent.setup();

    // Click the domestic market stepper "+" button twice
    const domesticIncreaseBtn = screen.getByLabelText("增加国内市场投放");
    await user.click(domesticIncreaseBtn);
    await user.click(domesticIncreaseBtn);

    // Click the overseas region stepper "+" button
    const overseasIncreaseBtn = screen.getByLabelText("增加亚太投放");
    await user.click(overseasIncreaseBtn);

    const draft = readDraftJson();
    expect(draft.phase1Market).toEqual({
      domesticAllocation: 2,
      externalAllocations: [{ marketId: "asia_pacific", quantity: 1 }],
    });
  });

  it("renders the Phase1MarketPanel with summary stats", () => {
    renderPanel("market");

    const panel = screen.getByTestId("phase1-market-panel");
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText("商品库存")).toBeInTheDocument();
    expect(within(panel).getByText("市场需求")).toBeInTheDocument();
    expect(within(panel).getByText("购买力")).toBeInTheDocument();
  });
});
