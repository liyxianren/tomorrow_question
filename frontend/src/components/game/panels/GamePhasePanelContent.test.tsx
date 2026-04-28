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

    await user.click(screen.getByRole("button", { name: "增加生产 煤炭" }));
    await user.click(screen.getByRole("button", { name: "增加生产 煤炭" }));

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    expect(screen.getByTestId("domestic-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-domestic")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "选择 博览会" }));

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getByTestId("government-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-government")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByLabelText("贸易协定"));

    await user.click(screen.getByRole("button", { name: "下一步：军事要塞" }));
    expect(screen.getByTestId("military-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-military")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByLabelText("确认动作：海军演练"));
    await user.click(screen.getByRole("button", { name: "与非洲建交" }));

    expect(readDraftJson()).toEqual({
      factoryPlan: {
        productionOrders: [{ goodsId: "coal", quantity: 2 }],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [{ actionId: "market_fair" }],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [{ actionId: "trade_agreement" }],
        techResearch: [],
      },
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [{ actionId: "naval_drill" }],
        diplomacyActions: [{ actionId: "establish_africa" }],
        colonizationActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      reforms: [],
      activatePolicies: [],
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

  it("renders factory as a dedicated industrial workbench with the fixed five sections", () => {
    renderPanel("decision");

    const factoryPanel = screen.getByTestId("factory-panel");
    expect(within(factoryPanel).getByRole("heading", { name: "工业总览" })).toBeInTheDocument();
    expect(within(factoryPanel).getByRole("heading", { name: "产线排程" })).toBeInTheDocument();
    expect(within(factoryPanel).getByRole("heading", { name: "建设改造" })).toBeInTheDocument();
    expect(within(factoryPanel).getByRole("heading", { name: "工业研究" })).toBeInTheDocument();
    expect(within(factoryPanel).getByRole("heading", { name: "工业情报" })).toBeInTheDocument();
    expect(within(factoryPanel).getByTestId("factory-route-lane-handicraft")).toBeInTheDocument();
    expect(within(factoryPanel).getByTestId("factory-route-lane-mechanized")).toBeInTheDocument();
    expect(within(factoryPanel).getByTestId("factory-construction-panel")).toBeInTheDocument();
    expect(within(factoryPanel).getByTestId("factory-tech-panel")).toBeInTheDocument();
    expect(within(factoryPanel).getByTestId("factory-intel-panel")).toBeInTheDocument();
  });

  it("updates industrial overview and route capacity when production changes", async () => {
    renderPanel("decision");
    const user = userEvent.setup();
    const factoryPanel = screen.getByTestId("factory-panel");

    expect(within(factoryPanel).getByText("工厂预算剩余 15")).toBeInTheDocument();
    expect(within(factoryPanel).getByText("手工业剩余 2 / 2 批")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "增加生产 煤炭" }));

    expect(within(factoryPanel).getByText("工厂预算剩余 13")).toBeInTheDocument();
    expect(within(factoryPanel).getByText("手工业剩余 1 / 2 批")).toBeInTheDocument();
    expect(within(factoryPanel).getByText("已安排 1 批，消耗 2 工厂预算，产出 1 件商品。")).toBeInTheDocument();
  });

  it("writes construction orders and shows next-round capacity preview", async () => {
    renderPanel("decision");
    const user = userEvent.setup();
    const factoryPanel = screen.getByTestId("factory-panel");

    await user.click(screen.getByRole("button", { name: "增加建设 扩产 手工业" }));

    expect(within(factoryPanel).getByText("下回合产能变化 +1")).toBeInTheDocument();
    expect(readDraftJson()).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [{ routeId: "handicraft", quantity: 1 }],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [],
      },
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [],
        diplomacyActions: [],
        colonizationActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      reforms: [],
      activatePolicies: [],
      deactivatePolicies: [],
    });
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

  it("shows locked factory goods and route reasons inside industrial intel", () => {
    renderPanel("decision");

    const intelPanel = screen.getByTestId("factory-intel-panel");
    expect(within(intelPanel).getByText("钢铁")).toBeInTheDocument();
    expect(within(intelPanel).getByText("机械化")).toBeInTheDocument();
    expect(screen.getAllByText("需要研究「珍妮纺织机」").length).toBeGreaterThan(0);
  });

  it("renders route labels with localized names instead of internal ids", () => {
    renderPanel("decision");

    expect(screen.getByText("手工业剩余 2 / 2 批")).toBeInTheDocument();
    expect(screen.getAllByText("机械化").length).toBeGreaterThan(0);
    expect(screen.queryByText(/handicraft/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mechanized/)).not.toBeInTheDocument();
  });

  it("queues chained industrial research in order and reveals newly unlocked production cards", async () => {
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
        techResearch: [
          { techId: "spinning_jenny" },
          { techId: "steam_engine" },
        ],
      },
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [],
        diplomacyActions: [],
        colonizationActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      reforms: [],
      activatePolicies: [],
      deactivatePolicies: [],
    });
  });

  it("shows locked domestic and government actions with explicit tech reasons", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：国民消费" }));
    expect(screen.getAllByText("需要研究「市场经济」").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "选择 消费补贴" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getAllByText("需要研究「行政改革」").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "产业政策" })).toBeDisabled();
  });

  it("includes national ability selection and france ideology targeting in the decision payload", async () => {
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
        techResearch: [],
      },
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [],
        diplomacyActions: [],
        colonizationActions: [],
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

  it("builds the 2.0 market payload with domestic and overseas sale orders", async () => {
    renderPanel("market", {
      marketWorkspace: createMarketPlayerWorkspace({
        regionAccessStatus: [
          {
            regionId: "asia_pacific",
            label: "亚太",
            accessLevel: "concession",
            isAccessible: true,
            isDiplomacyEstablished: true,
            acceptedGoods: ["grain"],
          },
        ],
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("增加粮食国内市场卖量"));
    await user.click(screen.getByLabelText("增加粮食国内市场卖量"));
    await user.click(screen.getByLabelText("增加粮食亚太卖量"));

    expect(readDraftJson()).toEqual({
      phase1Market: {
        domesticAllocation: 0,
        externalAllocations: [],
      },
      saleOrders: [
        { goodsId: "grain", market: "domestic", quantity: 2 },
        { goodsId: "grain", market: "overseas", quantity: 1, regionId: "asia_pacific" },
      ],
    });
  });

  it("shows price trend context in the market sell rows", () => {
    renderPanel("market");

    expect(screen.getAllByText("行情上涨 +1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("行情下跌 -1").length).toBeGreaterThan(0);
    expect(screen.getByText("参考价 3")).toBeInTheDocument();
  });
});
