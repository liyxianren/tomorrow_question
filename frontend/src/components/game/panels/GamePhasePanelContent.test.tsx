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
  createSettlementPlayerWorkspace,
} from "../../../test/gameSnapshotFixtures";

import { GamePhasePanelContent } from "./GamePhasePanelContent";

function renderPanel(
  phase: "decision" | "market" | "settlement",
  overrides: {
    decisionWorkspace?: ReturnType<typeof createDecisionPlayerWorkspace>;
    marketWorkspace?: ReturnType<typeof createMarketPlayerWorkspace>;
    settlementWorkspace?: ReturnType<typeof createSettlementPlayerWorkspace>;
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
              : phase === "market"
                ? (overrides.marketWorkspace ?? createMarketPlayerWorkspace())
                : (overrides.settlementWorkspace ?? createSettlementPlayerWorkspace())
          }
          decisionFlowState={decisionFlowState}
          drafts={drafts}
          onDecisionFlowChange={setDecisionFlowState}
          onDraftsChange={setDrafts}
        />
        <pre data-testid="draft-json">{JSON.stringify(drafts[phase])}</pre>
        <pre data-testid="flow-json">{JSON.stringify(decisionFlowState)}</pre>
      </>
    );
  }

  render(<Harness />);
}

function readDraftJson() {
  return JSON.parse(screen.getByTestId("draft-json").textContent ?? "{}");
}

function readFlowJson() {
  return JSON.parse(screen.getByTestId("flow-json").textContent ?? "{}");
}

describe("GamePhasePanelContent", () => {
  it("guides decision editing one step at a time and still builds the 2.0 payload", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    expect(screen.getByTestId("factory-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-factory")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getByTestId("government-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-government")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("government-resource-strip")).toHaveTextContent("行政力");
    expect(screen.getByTestId("government-resource-strip")).toHaveTextContent("3 / 3");
    expect(screen.getByTestId("government-resource-strip")).toHaveTextContent("基础比例");
    expect(screen.getByTestId("government-resource-strip")).toHaveTextContent("本轮比例");
    expect(screen.queryByTestId("government-market-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("government-market-policy-summary")).toBeInTheDocument();
    expect(screen.queryByText("市场补贴")).not.toBeInTheDocument();
    expect(screen.queryByText("价格管制")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "选择：贸易促进" }));
    expect(screen.getAllByText("贸易促进").length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "激活政策：扩充军队" }));

    await user.click(screen.getByRole("button", { name: "下一步：市场预览" }));
    expect(screen.getByTestId("domestic-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-domestic")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("domestic-panel")).toHaveTextContent("海外容量变化 +2");
    expect(screen.getByTestId("domestic-panel")).not.toHaveTextContent("暂无市场调节");

    await user.click(screen.getByRole("button", { name: "下一步：军事要塞" }));
    expect(screen.getByTestId("military-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-military")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("海军演练")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("确认动作：征募陆军"));

    expect(readDraftJson()).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
        rawMaterialPurchaseQuantity: 0,
        factoryActions: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [{ actionId: "trade_promotion" }],
        techResearch: [],
        adminPurchases: 0,
      },
      militaryPlan: {
        unlockColonization: false,
        militaryActions: [{ actionId: "recruit_army" }],
        colonizationActions: [],
        navalDeployment: {},
        regionBlockades: {},
        conquestActions: [],
        lootingActions: [],
      },
      talentPlan: {
        talentUnlocks: [],
      },
      reforms: [],
      activatePolicies: ["expand_army"],
      deactivatePolicies: [],
    });
  });

  it("navigates between decision steps and can return to the industrial panel", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getByTestId("government-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-government")).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "上一步：工厂决策" }));
    expect(screen.getByTestId("factory-panel")).toBeInTheDocument();
    expect(screen.getByTestId("decision-step-tab-factory")).toHaveAttribute("aria-pressed", "true");
  });

  it("lets players buy administrative power from the government panel", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    const adminPurchase = screen.getByTestId("government-admin-purchase");

    expect(adminPurchase).toHaveTextContent("购买行政力");
    expect(adminPurchase).toHaveTextContent("把政府财政永久转为行政力上限");
    await user.click(within(adminPurchase).getByRole("button", { name: "购买行政力" }));

    expect(readDraftJson().governmentPlan.adminPurchases).toBe(1);
    expect(screen.getByTestId("government-resource-strip")).toHaveTextContent("4 / 4");
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

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(screen.getByTestId("government-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步：市场预览" }));
    expect(screen.getByTestId("domestic-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("decision-command-deck")).not.toBeInTheDocument();
  });

  it("marks empty guided steps as skipped when moving forward", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    expect(readFlowJson().stepReviewStateByStep.factory).toBe("no_op");

    await user.click(screen.getByRole("button", { name: "下一步：市场预览" }));
    await user.click(screen.getByRole("button", { name: "下一步：军事要塞" }));

    const flow = readFlowJson();
    expect(flow.stepReviewStateByStep.domestic).toBe("unreviewed");
    expect(flow.stepReviewStateByStep.government).toBe("no_op");
  });

  it("disables policy activation when government fiscal cannot cover the activation cost", async () => {
    renderPanel("decision", {
      decisionWorkspace: createDecisionPlayerWorkspace({
        budgetPools: {
          domesticMarket: 12,
          factory: 15,
          governmentFiscal: 5,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));

    expect(screen.getByRole("button", { name: "激活政策：扩充军队" })).toBeDisabled();
    expect(screen.getAllByText("财政不足").length).toBeGreaterThan(0);
  });

  it("shows a single government fiscal pool without policy allowance", async () => {
    renderPanel("decision", {
      decisionWorkspace: createDecisionPlayerWorkspace({
        budgetPools: {
          domesticMarket: 12,
          factory: 15,
          governmentFiscal: 18,
        },
        baseBudgetPools: {
          domesticMarket: 12,
          factory: 15,
          governmentFiscal: 10,
        },
      }),
    });
    const user = userEvent.setup();

    expect(screen.getByTestId("decision-resource-bar")).toHaveTextContent("政府财政");
    expect(screen.getByTestId("decision-resource-bar")).toHaveTextContent("10 / 10");
    expect(screen.getByTestId("decision-resource-bar")).not.toHaveTextContent("政策专项额度");
    expect(screen.getByTestId("decision-resource-bar")).not.toHaveTextContent("18 / 18");

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));

    expect(screen.getByText("政府财政 10 / 10")).toBeInTheDocument();
    expect(screen.getByTestId("government-resource-strip")).not.toHaveTextContent("政策专项额度");
  });

  it("shows army strength and fleet blockade capacity in the decision resource bar", async () => {
    const workspace = createDecisionPlayerWorkspace();
    renderPanel("decision", {
      decisionWorkspace: {
        ...workspace,
        militaryWorkspace: {
          ...workspace.militaryWorkspace,
          army: { infantry: 2, artillery: 1 },
          navy: { fleets: 3 },
        },
      },
    });

    const resourceBar = screen.getByTestId("decision-resource-bar");
    expect(resourceBar).toHaveTextContent("陆军");
    expect(resourceBar).toHaveTextContent("3");
    expect(resourceBar).toHaveTextContent("市场争夺 / 军事力量");
    expect(resourceBar).toHaveTextContent("舰队封锁");
    expect(resourceBar).toHaveTextContent("3 / 3");
    expect(resourceBar).toHaveTextContent("可部署 / 总舰队");
  });

  it("explains research breakthrough rules in player-facing steps", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    await user.click(screen.getByRole("button", { name: "下一步：市场预览" }));
    await user.click(screen.getByRole("button", { name: "下一步：军事要塞" }));
    await user.click(screen.getByRole("button", { name: "下一步：研究院" }));

    expect(screen.getByText(/每所研究设施.*每回合.*研究进度/)).toBeInTheDocument();
    expect(screen.getByText(/首个发现者.*1-10/)).toBeInTheDocument();
    expect(screen.getByText(/如果你是第一个研究到的国家/)).toBeInTheDocument();
    expect(screen.getByText(/不会清空进度/)).toBeInTheDocument();
    expect(screen.getByText(/别的国家已经先发现这项科技/)).toBeInTheDocument();
    const workbench = screen.getByTestId("decision-workbench");
    expect(workbench).toHaveTextContent(/\+\d+\s*研究进度\/回合/);
    expect(workbench).toHaveTextContent("当前进度 0/3");
    expect(workbench).toHaveTextContent(/本轮研究产出 \+\d+ 进度\/回合/);
    expect(workbench).not.toHaveTextContent(/推进方式\s+0\s*%/);
  });

  it("labels one-round fiscal policies with government fiscal and this-round allocation", async () => {
    const workspace = createDecisionPlayerWorkspace();
    renderPanel("decision", {
      decisionWorkspace: {
        ...workspace,
        governmentReforms: {
          ...workspace.governmentReforms,
          availablePolicies: [
            {
              policyId: "work_relief",
              label: "以工代赈",
              adminCostPerTurn: 1,
              budgetCost: 6,
              description: "政府出资兴办公共工程，提升手工业产能，收入向消费池倾斜。",
              effects: {
                ratioDelta: {
                  fiscal: -0.5,
                  consumption: 0.5,
                },
              },
              isActive: false,
              requiresReform: "keynesianism",
              isUnlocked: true,
            },
          ],
        },
      },
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));

    expect(screen.getByText("6 政府财政 · 消耗 1 行政力")).toBeInTheDocument();
    expect(screen.getByText(/本轮收入分配/)).toBeInTheDocument();
    expect(screen.getByText(/国民消费 \+0.5，政府财政 -0.5/)).toBeInTheDocument();
    expect(screen.queryByText(/每回合收入分配/)).not.toBeInTheDocument();
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
        techResearch: [],
        adminPurchases: 0,
      },
      militaryPlan: {
        militaryActions: [],
        unlockColonization: false,
        colonizationActions: [],
        navalDeployment: {},
        regionBlockades: {},
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

    await user.click(screen.getByRole("button", { name: "下一步：市场预览" }));
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

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    await user.click(screen.getByLabelText("启用国家能力：民法典"));
    await user.click(screen.getByLabelText("民法典 民族主义"));

    expect(readDraftJson()).toEqual({
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
        rawMaterialPurchaseQuantity: 0,
        factoryActions: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
        techResearch: [],
        adminPurchases: 0,
      },
      militaryPlan: {
        militaryActions: [],
        unlockColonization: false,
        colonizationActions: [],
        navalDeployment: {},
        regionBlockades: {},
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

  it("renders military region status without diplomacy actions", async () => {
    renderPanel("decision");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "下一步：政府政策" }));
    await user.click(screen.getByRole("button", { name: "下一步：市场预览" }));
    await user.click(screen.getByRole("button", { name: "下一步：军事要塞" }));

    expect(screen.getByRole("heading", { name: /世界地图/ })).toBeInTheDocument();
    expect(screen.getAllByText("橡胶·棉花·矿产").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /建交/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/已建交/)).not.toBeInTheDocument();
  });

  it("builds the 2.0 market payload with phase1Market allocations", async () => {
    renderPanel("market", {
      marketWorkspace: createMarketPlayerWorkspace({
        regionAccessStatus: [
          {
            regionId: "asia_pacific",
            label: "亚太",
            accessLevel: "open",
            isAccessible: true,
            lockReason: null,
            canCompete: true,
            competitionLockedReason: null,
            competitionRewardCapacityBonus: 2,
            competitionMinimumPower: 1,
            isColonized: false,
            controller: null,
            acceptedGoods: ["grain"],
            fixedOverseasPrice: 6,
            priceMultiplier: 1.1,
          },
        ],
        overseasCompetition: {
          availableArmy: { infantry: 1, artillery: 0 },
          rewardCapacityBonus: 2,
          infantryPower: 1,
          artilleryPower: 2,
          minimumPower: 1,
        },
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
      externalCompetitionDeployments: [],
    });
  });

  it("adds overseas competition deployments to the market draft", async () => {
    renderPanel("market");
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("增加中东步兵投放"));

    const draft = readDraftJson();
    expect(draft.phase1Market?.externalCompetitionDeployments).toEqual([
      { marketId: "middle_east", infantry: 1, artillery: 0 },
    ]);
    expect(draft.militaryPlan).toBeUndefined();
  });

  it("lets domestic MAX use remaining inventory instead of domestic demand", async () => {
    renderPanel("market", {
      marketWorkspace: createMarketPlayerWorkspace({
        phase1GoodsAvailable: 8,
        domesticMarketCapacity: 10,
        phase1Economy: {
          capacityByMode: {},
          rawMaterials: 10,
          goodsInventory: 8,
          productionModes: [],
          domesticDemand: 7,
          equilibriumPrice: 1,
          domesticPricePreview: 1,
          investmentPool: 12,
          incomeAllocationRatio: {},
          marketMetrics: {},
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("国内市场投放最大"));

    const draft = readDraftJson();
    expect(draft.phase1Market?.domesticAllocation).toBe(8);
  });

  it("does not hard-clamp domestic MAX to the domestic soft cap", async () => {
    renderPanel("market", {
      marketWorkspace: createMarketPlayerWorkspace({
        phase1GoodsAvailable: 8,
        domesticMarketCapacity: 4,
        phase1Economy: {
          capacityByMode: {},
          rawMaterials: 10,
          goodsInventory: 8,
          productionModes: [],
          domesticDemand: 7,
          equilibriumPrice: 1,
          domesticPricePreview: 1,
          investmentPool: 12,
          incomeAllocationRatio: {},
          marketMetrics: {},
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("国内市场投放最大"));

    const draft = readDraftJson();
    expect(draft.phase1Market?.domesticAllocation).toBe(8);
  });

  it("renders the Phase1MarketPanel with summary stats", () => {
    renderPanel("market");

    const panel = screen.getByTestId("phase1-market-panel");
    expect(panel).toBeInTheDocument();
    expect(within(panel).getAllByText("商品库存").length).toBeGreaterThan(0);
    expect(within(panel).getByText("市场需求")).toBeInTheDocument();
    expect(within(panel).getByText("定价池")).toBeInTheDocument();
    expect(within(panel).getByText("定价软上限")).toBeInTheDocument();
    expect(within(panel).getByText("国内价格怎么算")).toBeInTheDocument();
    const domesticCalculation = within(panel).getByTestId("phase1-market-domestic-calculation");
    expect(domesticCalculation).toHaveTextContent("民间购买力");
    expect(domesticCalculation).toHaveTextContent("国内承接量");
    expect(domesticCalculation).toHaveTextContent("正常单价");
    expect(domesticCalculation).toHaveTextContent("本轮收入分配");
    expect(domesticCalculation).toHaveTextContent("3 / 3 / 4");
    expect(within(panel).getAllByText("区域固定价").length).toBeGreaterThan(0);
    expect(within(panel).getByText("市场计算核对")).toBeInTheDocument();
    expect(within(panel).getByText(/当前预估：国内/)).toBeInTheDocument();
    expect(within(panel).getByTestId("phase1-market-audit-backend-price")).toBeInTheDocument();
    expect(within(panel).getByTestId("phase1-market-audit-domestic-price")).toBeInTheDocument();
  });

  it("labels overseas exclusive and blocked regions on the market panel", () => {
    const baseWorkspace = createMarketPlayerWorkspace();
    renderPanel("market", {
      marketWorkspace: createMarketPlayerWorkspace({
        regionAccessStatus: [
          {
            ...baseWorkspace.regionAccessStatus[0],
            regionId: "africa",
            label: "非洲",
            isAccessible: true,
            lockReason: null,
            isBlockaded: true,
            blockadeController: "britain",
            myBlockadeFleet: 4,
          },
          {
            ...baseWorkspace.regionAccessStatus[1],
            regionId: "middle_east",
            label: "中东",
            isAccessible: false,
            lockReason: "route_blocked",
            blockedOceanNodes: [
              {
                nodeId: "middle_east",
                label: "中东",
                controller: "france",
                controllerLabel: "法国",
              },
            ],
            isBlockaded: true,
            blockadeController: "france",
            canCompete: false,
            competitionLockedReason: "route_blocked",
          },
        ],
      }),
    });

    const panel = screen.getByTestId("phase1-market-panel");
    expect(within(panel).getAllByText("本国独占").length).toBeGreaterThan(0);
    expect(within(panel).getByText(/你已封锁该地区/)).toBeInTheDocument();
    expect(within(panel).getAllByText("被封锁").length).toBeGreaterThan(0);
    expect(within(panel).getByText(/法国 正在封锁该地区/)).toBeInTheDocument();
  });

  it("shows government market policy effects in the market phase", () => {
    renderPanel("market", {
      marketWorkspace: createMarketPlayerWorkspace({
        domesticMarketCapacity: 6,
        overseasMarketCapacity: 7,
        phase1Economy: {
          capacityByMode: {},
          rawMaterials: 10,
          goodsInventory: 5,
          productionModes: [],
          domesticDemand: 3,
          equilibriumPrice: 4,
          domesticPricePreview: 6,
          investmentPool: 12,
          incomeAllocationRatio: {},
          marketMetrics: {},
          domesticMarketCapacityBonus: 0,
          domesticPriceBonus: 1,
          overseasMarketCapacityBonus: 2,
          governmentDomesticMarketCapacityBonus: 2,
          governmentDomesticPriceBonus: 2,
          governmentOverseasMarketCapacityBonus: 2,
        },
      }),
    });

    const banner = screen.getByTestId("phase1-market-government-adjustments");
    expect(banner).toHaveTextContent("市场容量调整");
    expect(banner).toHaveTextContent("国内容量 +2");
    expect(banner).toHaveTextContent("国内价格 +2");
    expect(banner).toHaveTextContent("海外容量 +2");
    expect(banner).toHaveTextContent("当前净调整");
    expect(banner).toHaveTextContent("国内价格 +1");
  });

  it("shows the full domestic/factory/government return ratio during settlement", () => {
    renderPanel("settlement", {
      settlementWorkspace: createSettlementPlayerWorkspace({
        nextRatio: {
          domesticMarket: 4,
          factory: 3,
          governmentFiscal: 4,
        },
        budgetAllocation: {
          domesticMarket: 10,
          factory: 12,
          governmentFiscal: 18,
        },
      }),
    });

    expect(screen.getByText("本轮有效回流比例")).toBeInTheDocument();
    expect(screen.getByText("4 / 3 / 4")).toBeInTheDocument();
    expect(screen.getByText("本轮分配到民间购买力的份额，结算后并入下回合国内消费池。")).toBeInTheDocument();
    expect(screen.queryByText(/40% 自然消费/)).not.toBeInTheDocument();
  });

  it("previews next consumer purchasing power as previous pool plus this-round return", () => {
    const phase1Economy = createMarketPlayerWorkspace().phase1Economy!;

    renderPanel("settlement", {
      settlementWorkspace: createSettlementPlayerWorkspace({
        nextRatio: {
          domesticMarket: 3,
          factory: 3,
          governmentFiscal: 4,
        },
        budgetAllocation: {
          domesticMarket: 19,
          factory: 19,
          governmentFiscal: 26,
        },
        phase1Economy: {
          ...phase1Economy,
          consumptionPool: 24,
          poolDeltaPreview: {
            consumption: 19,
            investment: 19,
            fiscal: 26,
          },
        },
      }),
    });

    expect(screen.getByText("上期余额 24 财政 + 本轮回流 19 财政 = 下回合民间购买力 43 财政。")).toBeInTheDocument();
    expect(screen.getByText("本回合收入按当前 3 / 3 / 4 分配到民间购买力的部分。")).toBeInTheDocument();
  });
});
