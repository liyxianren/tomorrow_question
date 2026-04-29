import type { Dispatch, SetStateAction } from "react";

import { MarketSellCard as MarketSellCardComponent } from "./MarketSellCard";
import { Phase1MarketPanel } from "./Phase1MarketPanel";
import { buildMarketDeckViewModel as buildMarketDeckViewModelFn } from "../../../features/game/marketDeck/viewModel";
import { TalentTreePanel } from "./TalentTreePanel";
import { MilitaryPanel } from "./MilitaryPanel";
import { GovernmentPanel } from "./GovernmentPanel";
import { DomesticPanel } from "./DomesticPanel";
import { DecisionStepTabs } from "./DecisionStepTabs";
import { FactoryPanel } from "./factory/FactoryPanel";
import type {
  DecisionFlowState,
  DecisionStepId,
} from "../../../features/game/flow/decisionFlow";
import {
  clearDecisionStepDraft,
  getDecisionStepLabel,
  getDecisionStepReviewLabel,
  getNextDecisionStep,
  getPreviousDecisionStep,
  markDecisionStepDirty,
  markDecisionStepReviewed,
  setDecisionActiveStep,
} from "../../../features/game/flow/decisionFlow";
import {
  addColonizationAction,
  addMilitaryActionSelection,
  addPointPurchase,
  getAllocatedProductionBatchesForRoute,
  getProductionOrderQuantity,
  getRouteOrderQuantity,
  removeColonizationAction,
  removeMilitaryActionSelection,
  removePointPurchase,
  setColonizationUnlockSelection,
  setAbilitySelectionTarget,
  setConquestAction,
  setNavalDeployment,
  setProductionOrderQuantity,
  setRouteDecisionOrderQuantity,
  toggleDiplomacyActionSelection,
  toggleDomesticMarketActionSelection,
  toggleGovernmentStrategySelection,
  toggleLootingAction,
  toggleNationalAbilitySelection,
  toggleTalentUnlockSelection,
  toggleTechResearchSelection,
} from "../../../features/game/decisionDrafts";
import {
  buildMilitaryActionDescription,
  buildRegionAccessDescription,
  buildGovernmentActionDescription,
  buildTechResearchDescription,
  calculateDecisionSpendSummary,
  calculateGovernmentPointPreview,
  calculateTechResearchPreview,
  calculateRatioPreview,
  formatPriceTrendText,
  formatRatio,
  getBudgetPoolLabel,
  getRegionAccessLevelLabel,
  getTechResearchLockedReason,
  groupUnlockedProductionOptions,
} from "../../../features/game/decisionShared";
import type {
  DecisionPlayerPhaseWorkspace,
  FactoryExpansionOption,
  FactoryNewFactoryOption,
  FactoryProductionOption,
  FactoryUpgradeOption,
  GamePhase,
  IncomeAllocationRatio,
  IdeologyKey,
  MarketPlayerPhaseWorkspace,
  MarketRegionReferencePrice,
  PlayerPhaseWorkspace,
  PlayerState,
  SettlementPlayerPhaseWorkspace,
  TechTreeNode,
} from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import { getCountryLabel, getPhaseLabel } from "../../../features/game/labels";

type PhaseDraftState = {
  decision: PhaseDraftByPhase["decision"];
  market: PhaseDraftByPhase["market"];
  settlement: PhaseDraftByPhase["settlement"];
};

type GamePhasePanelContentProps = {
  currentPhase: GamePhase | null;
  currentPlayerWorkspace: PlayerPhaseWorkspace | null;
  currentPlayerState: PlayerState | null;
  decisionFlowState: DecisionFlowState;
  drafts: PhaseDraftState;
  onDecisionFlowChange: Dispatch<SetStateAction<DecisionFlowState>>;
  onDraftsChange: Dispatch<SetStateAction<PhaseDraftState>>;
  onComplete?: () => void;
};

// All game phase panel styles are in CSS classes (gp-*) defined in styles.css

export function GamePhasePanelContent({
  currentPhase,
  currentPlayerWorkspace,
  currentPlayerState,
  decisionFlowState,
  drafts,
  onDecisionFlowChange,
  onDraftsChange,
  onComplete,
}: GamePhasePanelContentProps) {
  if (!currentPhase || !currentPlayerWorkspace) {
    return (
      <div className="gp-card">
        <strong>{currentPhase ? getPhaseLabel(currentPhase) : "正在恢复当前阶段"}</strong>
        <p style={{ margin: 0 }}>正在同步当前阶段数据，稍后就可以开始本阶段操作。</p>
      </div>
    );
  }

  switch (currentPhase) {
    case "decision":
      return (
        <DecisionWorkbench
          draft={drafts.decision}
          decisionFlowState={decisionFlowState}
          onChange={(value) =>
            onDraftsChange((previous) => ({
              ...previous,
              decision: value,
            }))
          }
          onComplete={onComplete}
          onDecisionFlowChange={onDecisionFlowChange}
          workspace={currentPlayerWorkspace as DecisionPlayerPhaseWorkspace}
        />
      );
    case "market":
      return (
        <MarketWorkbench
          draft={drafts.market}
          onChange={(value) =>
            onDraftsChange((previous) => ({
              ...previous,
              market: value,
            }))
          }
          playerState={currentPlayerState}
          workspace={currentPlayerWorkspace as MarketPlayerPhaseWorkspace}
        />
      );
    case "settlement":
      return (
        <SettlementWorkbench
          playerState={currentPlayerState}
          workspace={currentPlayerWorkspace as SettlementPlayerPhaseWorkspace}
        />
      );
    default:
      return null;
  }
}

export function DecisionWorkbench({
  workspace,
  draft,
  decisionFlowState,
  onChange,
  onDecisionFlowChange,
  onComplete,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  decisionFlowState: DecisionFlowState;
  onChange: (value: PhaseDraftByPhase["decision"]) => void;
  onDecisionFlowChange: Dispatch<SetStateAction<DecisionFlowState>>;
  onComplete?: () => void;
}) {
  const activeStep = decisionFlowState.activeStep;
  const activeStepReviewState = decisionFlowState.stepReviewStateByStep[activeStep];

  function handleStepSwitch(step: DecisionStepId) {
    onDecisionFlowChange((previous) => setDecisionActiveStep(previous, step));
  }

  function handleStepChecked() {
    onDecisionFlowChange((previous) => markDecisionStepReviewed(previous, activeStep, "checked"));
  }

  function handleStepNoOp() {
    onChange(clearDecisionStepDraft(draft, activeStep));
    onDecisionFlowChange((previous) => markDecisionStepReviewed(previous, activeStep, "no_op"));
  }

  function handleDraftChange(step: DecisionStepId, nextDraft: PhaseDraftByPhase["decision"]) {
    onChange(nextDraft);
    onDecisionFlowChange((previous) => markDecisionStepDirty(previous, step));
  }

  const previousStep = getPreviousDecisionStep(activeStep);
  const nextStep = getNextDecisionStep(activeStep);

  const governmentPointPreview = calculateGovernmentPointPreview(workspace, draft);
  const spendSummary = calculateDecisionSpendSummary(workspace, draft);
  return (
    <section data-testid="decision-workbench" className="gp-section">
      <DecisionStepTabs activeStep={activeStep} onStepSelect={handleStepSwitch} />
      {activeStep === "factory" ? (
        <FactoryPanel
          workspace={workspace}
          draft={draft}
          remainingFactoryBudget={workspace.budgetPools.factory - spendSummary.factorySpend}
          onProductionQuantityChange={(goodsId, quantity) => {
            handleDraftChange("factory", setProductionOrderQuantity(draft, goodsId, quantity));
          }}
          onConstructionQuantityChange={(routeId, kind, quantity) => {
            const field =
              kind === "expansion"
                ? "expansionOrders"
                : kind === "upgrade"
                  ? "upgradeOrders"
                  : "newFactoryOrders";
            handleDraftChange("factory", setRouteDecisionOrderQuantity(draft, field, routeId, quantity));
          }}
          onTechnologyToggle={(techId, checked) => {
            handleDraftChange("factory", toggleTechResearchSelection(draft, techId, checked));
          }}
          onPhase1RawMaterialAssignmentChange={(mode, quantity) => {
            handleDraftChange("factory", setPhase1RawMaterialAssignment(draft, mode, quantity));
          }}
        />
      ) : activeStep === "domestic" ? (
        <DomesticPanel
          workspace={workspace}
          draft={draft}
          remainingDomesticBudget={workspace.budgetPools.domesticMarket - spendSummary.domesticSpend}
          onActionToggle={(actionId, checked) => {
            handleDraftChange("domestic", toggleDomesticMarketActionSelection(draft, actionId, checked));
          }}
          onResearchToggle={(techId, checked) => {
            handleDraftChange("domestic", toggleTechResearchSelection(draft, techId, checked));
          }}
        />
      ) : activeStep === "government" ? (
        <>
          <GovernmentPanel
            workspace={workspace}
            draft={draft}
            remainingGovernmentBudget={workspace.budgetPools.governmentFiscal - spendSummary.governmentSpend}
            onAbilityTargetChange={(ideology) => {
              if (!workspace.nationalAbility) {
                return;
              }
              handleDraftChange("government", setAbilitySelectionTarget(draft, workspace.nationalAbility.abilityId, ideology));
            }}
            onResearchToggle={(techId, checked) => {
              handleDraftChange("government", toggleTechResearchSelection(draft, techId, checked));
            }}
            onStrategyToggle={(actionId, checked) => {
              handleDraftChange("government", toggleGovernmentStrategySelection(draft, actionId, checked));
            }}
            onTechPurchase={() => {
              handleDraftChange("government", addPointPurchase(draft, "tech"));
            }}
            onTechRefund={() => {
              handleDraftChange("government", removePointPurchase(draft, "tech"));
            }}
            onToggleAbility={(checked) => {
              handleDraftChange(
                "government",
                workspace.nationalAbility
                  ? toggleNationalAbilitySelection(draft, workspace.nationalAbility, checked)
                  : draft,
              );
            }}
          />
          {workspace.governmentReforms ? (
            <GovernmentReformPanel
              reforms={workspace.governmentReforms}
              draft={draft}
              onChange={(next) => handleDraftChange("government", next)}
            />
          ) : null}
        </>
      ) : activeStep === "military" ? (
        <MilitaryPanel
          workspace={workspace}
          draft={draft}
          remainingGovernmentBudget={workspace.budgetPools.governmentFiscal - spendSummary.governmentSpend}
          onAddMilitary={(actionId) => handleDraftChange("military", addMilitaryActionSelection(draft, actionId))}
          onRemoveMilitary={(actionId) => handleDraftChange("military", removeMilitaryActionSelection(draft, actionId))}
          onToggleDiplomacy={(actionId, checked) => handleDraftChange("military", toggleDiplomacyActionSelection(draft, actionId, checked))}
          onToggleColonizationUnlock={(checked) => handleDraftChange("military", setColonizationUnlockSelection(draft, checked))}
          onColonize={(regionId) => handleDraftChange("military", addColonizationAction(draft, regionId))}
          onCancelColonize={(regionId) => handleDraftChange("military", removeColonizationAction(draft, regionId))}
          onNavalDeploymentChange={(nodeId, count) => handleDraftChange("military", setNavalDeployment(draft, nodeId, count))}
          onConquestChange={(regionId, infantry, artillery) => handleDraftChange("military", setConquestAction(draft, regionId, infantry, artillery))}
          onLootingToggle={(regionId, resourceType) => handleDraftChange("military", toggleLootingAction(draft, regionId, resourceType))}
        />
      ) : (
        <TalentTreePanel
          branches={workspace.researchWorkspace?.talentBranches ?? []}
          projectedTechPoints={governmentPointPreview.techPoints}
          techCostPerPoint={workspace.governmentActions?.pointPurchaseCosts?.tech ?? 10}
          unlockedTalentCount={workspace.researchWorkspace?.unlockedTalentCount ?? 0}
          selectedNodeIds={new Set(draft.talentPlan?.talentUnlocks?.map((u) => u.nodeId) ?? [])}
          activeBranchId={decisionFlowState.activeResearchBranch}
          onSelectBranch={(id) => onDecisionFlowChange((prev) => ({ ...prev, activeResearchBranch: id }))}
          onToggleNode={(nodeId, checked) => {
            onChange(toggleTalentUnlockSelection(draft, nodeId, checked));
            onDecisionFlowChange((prev) => markDecisionStepDirty(prev, "research"));
          }}
        />
      )}
      <DecisionStepFooter
        activeStep={activeStep}
        activeStepReviewState={activeStepReviewState}
        nextStep={nextStep}
        onComplete={onComplete}
        onMarkChecked={handleStepChecked}
        onMarkNoOp={handleStepNoOp}
        onStepChange={handleStepSwitch}
        previousStep={previousStep}
      />
    </section>
  );
}

export function FactoryDecisionStep({
  workspace,
  draft,
  onChange,
  routeSummaries,
  unlockedProductionGroups,
  lockedProductionOptions,
  expansionOptions,
  upgradeOptions,
  newFactoryOptions,
  productionOptions,
  spendSummary,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  onChange: (value: PhaseDraftByPhase["decision"]) => void;
  routeSummaries: DecisionPlayerPhaseWorkspace["routeSummaries"];
  unlockedProductionGroups: Array<[string, FactoryProductionOption[]]>;
  lockedProductionOptions: FactoryProductionOption[];
  expansionOptions: FactoryExpansionOption[];
  upgradeOptions: FactoryUpgradeOption[];
  newFactoryOptions: FactoryNewFactoryOption[];
  productionOptions: FactoryProductionOption[];
  spendSummary: ReturnType<typeof calculateDecisionSpendSummary>;
}) {
  const remainingFactoryBudget = workspace.budgetPools.factory - spendSummary.factorySpend;

  return (
    <>
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">步骤 1 / 4</p>
            <h2 className="gp-step-title">工厂决策</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">预算剩余 <strong>{remainingFactoryBudget}</strong></span>
            <span className="gp-step-pill">已排产 <strong>{spendSummary.productionBatches}</strong> 批</span>
            {routeSummaries.map((summary) => {
              const allocated = getAllocatedProductionBatchesForRoute(draft, productionOptions, summary.routeId);
              return (
                <span key={`route-pill-${summary.routeId}`} className="gp-step-pill" title={`当前产能 ${summary.currentCapacity} / 下回合变化 ${summary.pendingCapacity >= 0 ? `+${summary.pendingCapacity}` : summary.pendingCapacity}`}>
                  {summary.routeLabel} <strong>{Math.max(summary.availableBatchesThisRound - allocated, 0)}</strong> 批
                </span>
              );
            })}
          </div>
        </div>
      </article>
      <article className="gp-card">
        <div className="gp-inner-group" style={{ gap: 18 }}>
          {unlockedProductionGroups.map(([routeId, options]) => {
            const routeSummary = routeSummaries.find((summary) => summary.routeId === routeId);
            return (
              <section key={routeId} className="gp-inner-group">
                <div>
                  <strong>{routeSummary?.routeLabel ?? routeId}</strong>
                  <p className="gp-step-desc" style={{ marginTop: 2 }}>共享 {routeSummary?.routeLabel ?? routeId} 产能 {routeSummary?.availableBatchesThisRound ?? 0}。</p>
                </div>
                <div className="gp-grid">
                  {options.map((option) => (
                    <QuantityCard
                      key={option.goodsId}
                      feedback={buildProductionFeedback(option, draft, productionOptions, routeSummary?.availableBatchesThisRound ?? 0)}
                      hint={buildProductionHint(option, routeSummary?.availableBatchesThisRound ?? 0)}
                      label={`安排生产 ${option.label}`}
                      max={option.maxQuantity}
                      maxLabel={`/ ${option.maxQuantity} 批`}
                      stats={`成本 ${option.unitBudgetCost} 预算/批 · 国内参考价 ${option.domesticReferencePrice} · ${formatPriceTrendText(option.priceTrend, option.priceAdjustment)}`}
                      value={getProductionOrderQuantity(draft, option.goodsId)}
                      onChange={(quantity) => onChange(setProductionOrderQuantity(draft, option.goodsId, quantity))}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </article>
      <details className="gp-card">
        <summary className="gp-collapse">
          建设动作 <span className="gp-collapse__hint">扩产 / 升级 / 新建（影响下一回合）</span>
        </summary>
        <div className="gp-grid" style={{ marginTop: 14 }}>
          {expansionOptions.map((option) => (
            <QuantityCard
              key={`expansion-${option.routeId}`}
              feedback={buildExpansionFeedback(getRouteOrderQuantity(draft.factoryPlan.expansionOrders, option.routeId), option)}
              hint={buildExpansionHint(option)}
              label={`扩产 ${option.routeLabel}`}
              max={option.maxQuantity}
              maxLabel={`/ ${option.maxQuantity} 次`}
              stats={`成本 ${option.unitBudgetCost} 预算 · 产能 +${option.capacityDelta}`}
              value={getRouteOrderQuantity(draft.factoryPlan.expansionOrders, option.routeId)}
              onChange={(quantity) => onChange(setRouteDecisionOrderQuantity(draft, "expansionOrders", option.routeId, quantity))}
            />
          ))}
          {upgradeOptions.map((option) => (
            <QuantityCard
              key={`upgrade-${option.routeId}`}
              feedback={buildUpgradeFeedback(getRouteOrderQuantity(draft.factoryPlan.upgradeOrders, option.routeId), option)}
              hint={buildUpgradeHint(option)}
              label={`升级到 ${option.routeLabel}`}
              max={option.maxQuantity}
              maxLabel={`/ ${option.maxQuantity} 次`}
              stats={`成本 ${option.unitBudgetCost} 预算 · ${option.sourceRouteLabel} -> ${option.routeLabel}`}
              value={getRouteOrderQuantity(draft.factoryPlan.upgradeOrders, option.routeId)}
              onChange={(quantity) => onChange(setRouteDecisionOrderQuantity(draft, "upgradeOrders", option.routeId, quantity))}
            />
          ))}
          {newFactoryOptions.map((option) => (
            <QuantityCard
              key={`new-factory-${option.routeId}`}
              feedback={buildNewFactoryFeedback(getRouteOrderQuantity(draft.factoryPlan.newFactoryOrders, option.routeId), option)}
              hint={buildNewFactoryHint(option)}
              label={`新建 ${option.routeLabel}工厂`}
              max={option.maxQuantity}
              maxLabel={`/ ${option.maxQuantity} 次`}
              stats={`成本 ${option.unitBudgetCost} 预算 · 产能 +${option.capacityDelta}`}
              value={getRouteOrderQuantity(draft.factoryPlan.newFactoryOrders, option.routeId)}
              onChange={(quantity) => onChange(setRouteDecisionOrderQuantity(draft, "newFactoryOrders", option.routeId, quantity))}
            />
          ))}
        </div>
      </details>
      {lockedProductionOptions.length > 0 ? (
        <details className="gp-card">
          <summary className="gp-collapse">未解锁商品</summary>
          <div className="gp-grid" style={{ marginTop: 14 }}>
            {lockedProductionOptions.map((option) => (
              <article key={`locked-${option.goodsId}`} className="gp-metric">
                <strong>{option.label}</strong>
                <span className="gp-metric__hint">所属路线 {option.routeLabel}</span>
                <span style={{ color: "var(--game-text-warn)", fontSize: 13 }}>{option.lockedReason}</span>
                <span className="gp-metric__hint">国内参考价 {option.domesticReferencePrice} / 海外参考价区间 {option.overseasReferencePriceMin}-{option.overseasReferencePriceMax} / {formatPriceTrendText(option.priceTrend, option.priceAdjustment)}</span>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

export function DomesticDecisionStep({
  actions,
  budget,
  currentSpend,
  draft,
  onChange,
}: {
  actions: DecisionPlayerPhaseWorkspace["domesticMarketActions"];
  budget: number;
  currentSpend: number;
  draft: PhaseDraftByPhase["decision"];
  onChange: (value: PhaseDraftByPhase["decision"]) => void;
}) {
  const selectedActions = draft.domesticMarketPlan.domesticMarketActions.length;

  return (
    <>
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">步骤 2 / 4</p>
            <h2 className="gp-step-title">国民消费</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">预算剩余 <strong>{budget - currentSpend}</strong></span>
            <span className="gp-step-pill">预计消耗 <strong>{currentSpend}</strong></span>
            <span className="gp-step-pill">已选 <strong>{selectedActions}</strong> 项</span>
          </div>
        </div>
      </article>
      <article className="gp-card">
        <div className="gp-grid">
          {actions.map((action) => {
            const checked = draft.domesticMarketPlan.domesticMarketActions.some((item) => item.actionId === action.actionId);
            return (
              <ActionToggleCard
                key={action.actionId}
                checked={checked}
                description={action.description}
                feedback={action.lockedReason ?? (checked ? `已纳入本轮，国内消费市场预算 -${action.cost}。` : undefined)}
                hint={action.lockedReason ?? `消耗国内市场预算 ${action.cost}`}
                isDisabled={Boolean(action.lockedReason)}
                label={action.label}
                onChange={(nextChecked) => onChange(toggleDomesticMarketActionSelection(draft, action.actionId, nextChecked))}
              />
            );
          })}
        </div>
      </article>
    </>
  );
}

export function GovernmentDecisionStep({
  workspace,
  draft,
  onChange,
  currentSpend,
  ratioPreview,
  strategies,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  onChange: (value: PhaseDraftByPhase["decision"]) => void;
  currentSpend: number;
  ratioPreview: IncomeAllocationRatio;
  strategies: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"];
}) {
  const selectedStrategies = draft.governmentPlan.strategySelections.length;
  const selectedResearch = draft.governmentPlan.techResearch.length;
  const selectedAbility = workspace.nationalAbility && draft.abilitySelection?.abilityId === workspace.nationalAbility.abilityId
    ? draft.abilitySelection
    : null;
  const governmentPointPreview = calculateGovernmentPointPreview(workspace, draft);
  const techResearchPreview = calculateTechResearchPreview(workspace, draft);
  const techSections = buildTechTreeSections(workspace);

  return (
    <>
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">步骤 3 / 4</p>
            <h2 className="gp-step-title">政府政策</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">财政剩余 <strong>{workspace.budgetPools.governmentFiscal - currentSpend}</strong></span>
            <span className="gp-step-pill">预计消耗 <strong>{currentSpend}</strong></span>
            <span className="gp-step-pill">比例 <strong>{formatRatio(ratioPreview)}</strong></span>
            <span className="gp-step-pill">科技点 <strong>{governmentPointPreview.techPoints}</strong></span>
            <span className="gp-step-pill">军事点 <strong>{governmentPointPreview.militaryPoints}</strong></span>
            <span className="gp-step-pill">策略 <strong>{selectedStrategies}</strong></span>
            <span className="gp-step-pill">研究 <strong>{selectedResearch}</strong></span>
            <span className="gp-step-pill">能力 <strong>{selectedAbility ? "已启用" : "未启用"}</strong></span>
          </div>
        </div>
      </article>
      <article className="gp-card">
        <div className="gp-inner-group" style={{ gap: 18 }}>
          <div>
            <p className="gp-step-eyebrow">科技研究</p>
            <h3 style={{ margin: "4px 0 0" }}>科技解锁</h3>
            <p className="gp-step-desc" style={{ marginTop: 6 }}>
              花费对应预算池解锁新的商品、路线或策略。前置科技加入队列后，后续节点会立即可选。
            </p>
          </div>
          {techSections.map((section) => (
            <section key={section.title} className="gp-inner-group">
              <div>
                <strong>{section.title}</strong>
                <p className="gp-step-desc" style={{ marginTop: 2 }}>{section.description}</p>
              </div>
              <div className="gp-grid">
                {section.nodes.map((tech) => {
                  const queued = draft.governmentPlan.techResearch.some((item) => item.techId === tech.techId);
                  const lockedReason = getTechResearchLockedReason(tech, techResearchPreview, workspace);
                  const description = buildTechResearchDescription(tech, lockedReason, workspace, queued);
                  return (
                    <ActionToggleCard
                      key={tech.techId}
                      checked={tech.isUnlocked || queued}
                      description={description}
                      feedback={queued ? "已加入本轮研究队列，服务器会按你当前的顺序逐项处理。" : undefined}
                      hint={
                        tech.isUnlocked
                          ? "已解锁"
                          : queued
                            ? "已排入研究队列"
                            : lockedReason ?? `消耗 ${tech.budgetCost} ${getBudgetPoolLabel(tech.budgetPool)}`
                      }
                      isDisabled={tech.isUnlocked || (!queued && lockedReason !== null)}
                      label={`研究科技：${tech.label}`}
                      onChange={(nextChecked) => onChange(toggleTechResearchSelection(draft, tech.techId, nextChecked))}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </article>
      {workspace.nationalAbility ? (
        <article className="gp-card">
          <div className="gp-inner-group" style={{ gap: 14 }}>
            <div>
              <p className="gp-step-eyebrow">国家专属能力</p>
              <h3 style={{ margin: "4px 0 0" }}>{workspace.nationalAbility.label}</h3>
              <p className="gp-step-desc" style={{ marginTop: 6 }}>{workspace.nationalAbility.description}</p>
            </div>
            <ActionToggleCard
              checked={Boolean(selectedAbility)}
              description={
                workspace.nationalAbility.isAvailable
                  ? "这是一次性能力，本局使用后不可再次提交。"
                  : "本局已使用，当前只能查看效果描述。"
              }
              feedback={selectedAbility ? "本轮会把国家能力一起提交给服务器。": undefined}
              hint={workspace.nationalAbility.isAvailable ? "本轮启用国家能力" : "本局已使用"}
              isDisabled={!workspace.nationalAbility.isAvailable}
              label={`启用国家能力：${workspace.nationalAbility.label}`}
              onChange={(nextChecked) => onChange(toggleNationalAbilitySelection(draft, workspace.nationalAbility!, nextChecked))}
            />
            {selectedAbility && workspace.nationalAbility.requiresTargetIdeology ? (
              <div className="gp-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                {IDEOLOGY_OPTIONS.map((ideology) => (
                  <label key={ideology} className="gp-toggle">
                    <div className="gp-toggle__header">
                      <strong>{IDEOLOGY_LABELS[ideology]}</strong>
                      <span
                        className={
                          selectedAbility.targetIdeology === ideology
                            ? "gp-toggle__hint gp-toggle__hint--active"
                            : "gp-toggle__hint gp-toggle__hint--inactive"
                        }
                      >
                        额外 +3
                      </span>
                    </div>
                    <span className="gp-toggle__desc">会在三项意识形态重置为 3 后，对该项再额外提升。</span>
                    <input
                      aria-label={`目标意识形态 ${IDEOLOGY_LABELS[ideology]}`}
                      checked={selectedAbility.targetIdeology === ideology}
                      className="gp-toggle__check"
                      name="national-ability-target-ideology"
                      onChange={() => onChange(setAbilitySelectionTarget(draft, workspace.nationalAbility!.abilityId, ideology))}
                      type="radio"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      ) : null}
      <article className="gp-card">
        <div className="gp-grid">
          {strategies.map((action) => {
            const checked = draft.governmentPlan.strategySelections.some((item) => item.actionId === action.actionId);
            return (
              <ActionToggleCard
                key={action.actionId}
                checked={checked}
                description={buildGovernmentActionDescription(action)}
                feedback={action.lockedReason ?? (checked ? `已纳入本轮，政府财政 -${action.cost}。` : undefined)}
                hint={action.lockedReason ?? `政府财政 ${action.cost}`}
                isDisabled={Boolean(action.lockedReason)}
                label={action.label}
                onChange={(nextChecked) => onChange(toggleGovernmentStrategySelection(draft, action.actionId, nextChecked))}
              />
            );
          })}
        </div>
      </article>
    </>
  );
}

export function MilitaryDecisionStep({
  workspace,
  draft,
  onChange,
  currentSpend,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  onChange: (value: PhaseDraftByPhase["decision"]) => void;
  currentSpend: number;
}) {
  const militaryWorkspace = workspace.militaryWorkspace;
  const remainingBudget = workspace.budgetPools.governmentFiscal - currentSpend;
  const navalActions = militaryWorkspace.availableMilitaryActions.filter((action) => action.actionId === "naval_drill");
  const armyActions = militaryWorkspace.availableMilitaryActions.filter((action) => (
    action.actionId === "recruit_infantry" || action.actionId === "train_artillery"
  ));
  const supportActions = militaryWorkspace.availableMilitaryActions.filter((action) => (
    action.actionId !== "naval_drill" && action.actionId !== "recruit_infantry" && action.actionId !== "train_artillery"
  ));

  function getMilitarySelectionCount(actionId: string): number {
    return draft.militaryPlan.militaryActions.filter((item) => item.actionId === actionId).length;
  }

  function canAddMilitaryAction(actionId: string, cost: number, maxPerRound: number): boolean {
    const selectedCount = getMilitarySelectionCount(actionId);
    if (selectedCount >= maxPerRound) {
      return false;
    }
    return remainingBudget >= cost;
  }

  return (
    <>
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">步骤 4 / 4</p>
            <h2 className="gp-step-title">军事要塞</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">财政剩余 <strong>{remainingBudget}</strong></span>
            <span className="gp-step-pill">军事点 <strong>{militaryWorkspace.militaryPoints}</strong></span>
            <span className="gp-step-pill">海外承接 <strong>{militaryWorkspace.overseasCapacity}</strong></span>
            <span className="gp-step-pill">已建交 <strong>{militaryWorkspace.establishedDiplomacy.length}</strong> 区</span>
          </div>
        </div>
      </article>
      <article className="gp-card">
        <div className="gp-inner-group" style={{ gap: 14 }}>
          <div>
            <p className="gp-step-eyebrow">区域情报</p>
            <h3 style={{ margin: "4px 0 0" }}>海外区域状态</h3>
            <p className="gp-step-desc" style={{ marginTop: 6 }}>
              这里展示当前哪些区域已经开放、哪些仍依赖军事点或外交建交。
            </p>
          </div>
          <div className="gp-grid">
            {militaryWorkspace.regionAccessStatus.map((status) => (
              <article key={status.regionId} className="gp-metric">
                <span className="gp-metric__label">{status.label}</span>
                <strong className="gp-metric__value">{getRegionAccessLevelLabel(status.accessLevel)}</strong>
                <span className="gp-metric__hint">{buildRegionAccessDescription(status)}</span>
              </article>
            ))}
          </div>
        </div>
      </article>
      {navalActions.length > 0 ? (
        <article className="gp-card">
          <div className="gp-inner-group" style={{ gap: 14 }}>
            <div>
              <p className="gp-step-eyebrow">海军建设</p>
              <h3 style={{ margin: "4px 0 0" }}>海军建设</h3>
              <p className="gp-step-desc" style={{ marginTop: 6 }}>扩充舰队，直接抬升海外承接与投送能力。</p>
            </div>
            <div className="gp-grid">
              {navalActions.map((action) => (
                <ConfirmActionCard
                  key={action.actionId}
                  confirmLabel={`确认动作：${action.label}`}
                  count={getMilitarySelectionCount(action.actionId)}
                  description={buildMilitaryActionDescription(action)}
                  feedback={`当前已安排 ${getMilitarySelectionCount(action.actionId)} / ${action.maxPerRound} 次。`}
                  isConfirmDisabled={!canAddMilitaryAction(action.actionId, action.cost, action.maxPerRound)}
                  isRevokeDisabled={getMilitarySelectionCount(action.actionId) === 0}
                  onConfirm={() => onChange(addMilitaryActionSelection(draft, action.actionId))}
                  onRevoke={() => onChange(removeMilitaryActionSelection(draft, action.actionId))}
                />
              ))}
            </div>
          </div>
        </article>
      ) : null}
      {armyActions.length > 0 ? (
        <article className="gp-card">
          <div className="gp-inner-group" style={{ gap: 14 }}>
            <div>
              <p className="gp-step-eyebrow">陆军征募</p>
              <h3 style={{ margin: "4px 0 0" }}>陆军征募</h3>
              <p className="gp-step-desc" style={{ marginTop: 6 }}>补充陆军与重武器，提升军事影响力。</p>
            </div>
            <div className="gp-grid">
              {armyActions.map((action) => (
                <ConfirmActionCard
                  key={action.actionId}
                  confirmLabel={`确认动作：${action.label}`}
                  count={getMilitarySelectionCount(action.actionId)}
                  description={buildMilitaryActionDescription(action)}
                  feedback={`当前已安排 ${getMilitarySelectionCount(action.actionId)} / ${action.maxPerRound} 次。`}
                  isConfirmDisabled={!canAddMilitaryAction(action.actionId, action.cost, action.maxPerRound)}
                  isRevokeDisabled={getMilitarySelectionCount(action.actionId) === 0}
                  onConfirm={() => onChange(addMilitaryActionSelection(draft, action.actionId))}
                  onRevoke={() => onChange(removeMilitaryActionSelection(draft, action.actionId))}
                />
              ))}
            </div>
          </div>
        </article>
      ) : null}
      <article className="gp-card">
        <div className="gp-inner-group" style={{ gap: 14 }}>
          <div>
            <p className="gp-step-eyebrow">外交行动 / 军事远征</p>
            <h3 style={{ margin: "4px 0 0" }}>外交行动 / 军事远征</h3>
            <p className="gp-step-desc" style={{ marginTop: 6 }}>通过建交永久开放区域，或通过军事动作补充本轮海外投送与威慑能力。</p>
          </div>
          {supportActions.length > 0 ? (
            <div className="gp-grid">
              {supportActions.map((action) => (
                <ConfirmActionCard
                  key={action.actionId}
                  confirmLabel={`确认动作：${action.label}`}
                  count={getMilitarySelectionCount(action.actionId)}
                  description={buildMilitaryActionDescription(action)}
                  feedback={`当前已安排 ${getMilitarySelectionCount(action.actionId)} / ${action.maxPerRound} 次。`}
                  isConfirmDisabled={!canAddMilitaryAction(action.actionId, action.cost, action.maxPerRound)}
                  isRevokeDisabled={getMilitarySelectionCount(action.actionId) === 0}
                  onConfirm={() => onChange(addMilitaryActionSelection(draft, action.actionId))}
                  onRevoke={() => onChange(removeMilitaryActionSelection(draft, action.actionId))}
                />
              ))}
            </div>
          ) : null}
          <div className="gp-grid">
            {militaryWorkspace.availableDiplomacyActions.map((action) => {
              const checked = draft.militaryPlan.diplomacyActions.some((item) => item.actionId === action.actionId);
              const confirmDisabled = action.isEstablished || (!checked && remainingBudget < action.cost);
              return (
                <ConfirmActionCard
                  key={action.actionId}
                  confirmLabel={`确认动作：${action.label}`}
                  title="建立外交关系"
                  count={checked ? 1 : 0}
                  description={`永久开放贸易通道。消耗政府财政 ${action.cost}。`}
                  feedback={action.isEstablished ? "该区域已经完成建交，本轮不能重复提交。" : checked ? "已纳入本轮建交计划。" : undefined}
                  isConfirmDisabled={confirmDisabled}
                  isRevokeDisabled={!checked}
                  onConfirm={() => onChange(toggleDiplomacyActionSelection(draft, action.actionId, true))}
                  onRevoke={() => onChange(toggleDiplomacyActionSelection(draft, action.actionId, false))}
                />
              );
            })}
          </div>
        </div>
      </article>
    </>
  );
}

function DecisionStepFooter({
  activeStep,
  activeStepReviewState,
  previousStep,
  nextStep,
  onStepChange,
  onMarkChecked,
  onMarkNoOp,
  onComplete,
}: {
  activeStep: DecisionStepId;
  activeStepReviewState: DecisionFlowState["stepReviewStateByStep"][DecisionStepId];
  previousStep: DecisionStepId | null;
  nextStep: DecisionStepId | null;
  onStepChange: (step: DecisionStepId) => void;
  onMarkChecked: () => void;
  onMarkNoOp: () => void;
  onComplete?: () => void;
}) {
  return (
    <article className="decision-command-deck__footer">
      <div className="gp-footer-actions" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
        {previousStep ? (
          <button className="gp-btn" onClick={() => onStepChange(previousStep)} type="button">
            上一步：{getDecisionStepLabel(previousStep)}
          </button>
        ) : null}
        <div className="decision-command-deck__footer-spacer" />
        {nextStep ? (
          <button className="gp-btn gp-btn--primary" onClick={() => onStepChange(nextStep)} type="button">
            下一步：{getDecisionStepLabel(nextStep)}
          </button>
        ) : (
          <button className="gp-btn gp-btn--primary" onClick={onComplete} type="button">
            决策完成
          </button>
        )}
      </div>
    </article>
  );
}

export function MarketWorkbench({
  workspace,
  playerState,
  draft,
  onChange,
}: {
  workspace: MarketPlayerPhaseWorkspace;
  playerState: PlayerState | null;
  draft: PhaseDraftByPhase["market"];
  onChange: (value: PhaseDraftByPhase["market"]) => void;
}) {
  const marketViewModel = buildMarketDeckViewModelFn(workspace, draft);
  const riskLines = calculateMarketRiskLines(
    { ...workspace, sellableInventory: asArray(workspace.sellableInventory) },
    draft,
  );

  function handleQuantityChange(goodsId: string, regionId: string | null, quantity: number) {
    const market = regionId === null ? "domestic" : "overseas";
    onChange(setSaleOrderQuantity(draft, goodsId, market, Math.max(0, quantity), regionId ?? undefined));
  }

  function handlePhase1AllocationChange(domesticAllocation: number) {
    const previous = draft.phase1Market ?? {
      domesticAllocation: 0,
      externalAllocations: [],
    };
    onChange({
      ...draft,
      phase1Market: {
        ...previous,
        domesticAllocation: Math.max(0, Math.floor(domesticAllocation)),
      },
    });
  }

  function handlePhase1ExternalChange(marketId: string, quantity: number) {
    const previous = draft.phase1Market ?? {
      domesticAllocation: 0,
      externalAllocations: [],
    };
    const safe = Math.max(0, Math.floor(quantity));
    const filtered = previous.externalAllocations.filter((item) => item.marketId !== marketId);
    const next = safe > 0 ? [...filtered, { marketId, quantity: safe }] : filtered;
    onChange({
      ...draft,
      phase1Market: {
        ...previous,
        externalAllocations: next,
      },
    });
  }

  const phase1Economy = workspace.phase1Economy;
  const phase1GoodsInventory = workspace.phase1GoodsAvailable ?? phase1Economy?.goodsInventory ?? 0;
  const phase1Draft = draft.phase1Market ?? {
    domesticAllocation: 0,
    externalAllocations: [],
  };

  return (
    <section data-testid="market-workbench" className="gp-section">
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">市场出售台</p>
            <h2 className="gp-step-title">{workspace.countryLabel}的本轮销售</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">国内承接 <strong>{marketViewModel.domesticMarketCapacity}</strong></span>
            <span className="gp-step-pill">海外承接 <strong>{marketViewModel.overseasMarketCapacity}</strong></span>
            <span className="gp-step-pill">预计收入 <strong>{marketViewModel.totalNationalIncome}</strong></span>
          </div>
        </div>
      </article>

      {phase1Economy ? (
        <Phase1MarketPanel
          phase1Economy={phase1Economy}
          goodsInventory={phase1GoodsInventory}
          budgetPools={workspace.budgetPools}
          regionAccessStatus={workspace.regionAccessStatus ?? []}
          draftAllocation={phase1Draft.domesticAllocation}
          externalAllocations={phase1Draft.externalAllocations}
          onAllocationChange={handlePhase1AllocationChange}
          onExternalAllocationChange={handlePhase1ExternalChange}
        />
      ) : null}

      <div className="gp-section" style={{ gap: 16 }}>
        {marketViewModel.goodCards.map((card) => (
          <MarketSellCardComponent
            key={card.goodsId}
            card={card}
            onQuantityChange={handleQuantityChange}
          />
        ))}
      </div>

      {riskLines.length > 0 ? (
        <article className="gp-card">
          <h3 style={{ margin: 0 }}>压仓库风险</h3>
          <div className="gp-inner-group" style={{ gap: 8 }}>
            {riskLines.map((line) => (
              <div key={line} style={{ color: "var(--game-text-warn)" }}>{line}</div>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}

export function SettlementWorkbench({
  workspace,
  playerState,
}: {
  workspace: SettlementPlayerPhaseWorkspace;
  playerState: PlayerState | null;
}) {
  return (
    <section data-testid="settlement-workbench" className="gp-section">
      <article className="gp-card gp-card--primary">
        <div>
          <p className="gp-step-eyebrow">财政结算台</p>
          <h2 className="gp-step-title">{workspace.countryLabel}的国家收入分账结果</h2>
          <p className="gp-step-desc">本阶段为只读结算，展示本回合收入与三池分配。</p>
        </div>
        <div className="gp-grid">
          <MetricCard hint="当回合国内市场形成的销售额。" label="本回合国内销售额" value={workspace.domesticSalesRevenue} />
          <MetricCard hint="当回合海外市场形成的销售额。" label="本回合海外销售额" value={workspace.overseasSalesRevenue} />
          <MetricCard hint="财政结算前的国家收入总额。" label="本回合国家收入" value={workspace.nationalIncome} />
          <MetricCard hint="国内 / 工厂 / 政府财政。" label="下一轮收入分配比例" value={formatRatio(workspace.nextRatio)} />
          <MetricCard hint="终局主指标。" label="累计国家收入" value={playerState?.cumulativeNationalIncome ?? 0} />
          <MetricCard hint="结算完成后会进入下一轮国家决策。" label="当前国家" value={getCountryLabel(workspace.countryCode)} />
        </div>
      </article>
      <article className="gp-card">
        <h3 style={{ margin: 0 }}>三池重新分配结果</h3>
        <div className="gp-grid">
          <MetricCard hint="结算后回到国内消费市场预算池。" label="国内消费市场" value={workspace.budgetAllocation.domesticMarket} />
          <MetricCard hint="结算后回到工厂预算池。" label="工厂" value={workspace.budgetAllocation.factory} />
          <MetricCard hint="结算后回到政府财政预算池。" label="政府财政" value={workspace.budgetAllocation.governmentFiscal} />
        </div>
      </article>
      {workspace.phase1Economy?.poolDeltaPreview && (
        <article className="gp-card">
          <h3 style={{ margin: 0 }}>🏭 2.0 收入分配预览（5:3:2）</h3>
          <p className="gp-step-desc" style={{ marginTop: 4 }}>新经济模型：消费 : 投资 : 财政 = 5 : 3 : 2</p>
          <div className="gp-grid">
            <MetricCard hint="进入消费池，影响下一轮均衡价格。" label="消费池" value={Math.round(workspace.phase1Economy.poolDeltaPreview.consumption)} />
            <MetricCard hint="进入投资池，用于产能建设与升级。" label="投资池" value={Math.round(workspace.phase1Economy.poolDeltaPreview.investment)} />
            <MetricCard hint="进入财政池，用于科技、军事、政治。" label="财政池" value={Math.round(workspace.phase1Economy.poolDeltaPreview.fiscal)} />
          </div>
        </article>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <article className="gp-metric">
      <span className="gp-metric__label">{label}</span>
      <strong className="gp-metric__value">{value}</strong>
      <span className="gp-metric__hint">{hint}</span>
    </article>
  );
}

function QuantityCard({
  label,
  hint,
  stats,
  feedback,
  value,
  max,
  maxLabel,
  onChange,
}: {
  label: string;
  hint: string;
  stats?: string;
  feedback?: string;
  value: number;
  max?: number;
  maxLabel?: string;
  onChange: (value: number) => void;
}) {
  function handleChange(raw: number) {
    const clamped = max != null ? Math.min(Math.max(0, raw), max) : Math.max(0, raw);
    onChange(clamped);
  }

  return (
    <label className="gp-input-card">
      <span className="gp-input-card__label">{label}</span>
      {stats ? <span className="gp-input-card__stats">{stats}</span> : null}
      {feedback ? <span className="gp-input-card__feedback">{feedback}</span> : null}
      <div className="gp-input-card__row">
        <input aria-label={label} className="gp-input-card__input" max={max} min={0} onChange={(event) => handleChange(Number(event.target.value))} title={hint} type="number" value={value} />
        {maxLabel ? <span className="gp-input-card__max">{maxLabel}</span> : null}
      </div>
    </label>
  );
}

function ActionToggleCard({
  label,
  hint,
  description,
  feedback,
  checked,
  isDisabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  description?: string;
  feedback?: string;
  checked: boolean;
  isDisabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="gp-toggle">
      <div className="gp-toggle__header">
        <strong>{label}</strong>
        <span className={checked ? "gp-toggle__hint gp-toggle__hint--active" : "gp-toggle__hint gp-toggle__hint--inactive"}>{hint}</span>
      </div>
      {description ? <span className="gp-toggle__desc">{description}</span> : null}
      {feedback ? <span className="gp-input-card__feedback">{feedback}</span> : null}
      <input aria-label={label} className="gp-toggle__check" checked={checked} disabled={isDisabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function ConfirmActionCard({
  title,
  confirmLabel,
  description,
  feedback,
  count,
  isConfirmDisabled,
  isRevokeDisabled,
  onConfirm,
  onRevoke,
}: {
  title?: string;
  confirmLabel: string;
  description?: string;
  feedback?: string;
  count: number;
  isConfirmDisabled: boolean;
  isRevokeDisabled: boolean;
  onConfirm: () => void;
  onRevoke: () => void;
}) {
  return (
    <article className="gp-toggle">
      <div className="gp-toggle__header">
        <strong>{title ?? confirmLabel.replace("确认动作：", "")}</strong>
        <span className={count > 0 ? "gp-toggle__hint gp-toggle__hint--active" : "gp-toggle__hint gp-toggle__hint--inactive"}>
          已安排 {count}
        </span>
      </div>
      {description ? <span className="gp-toggle__desc">{description}</span> : null}
      {feedback ? <span className="gp-input-card__feedback">{feedback}</span> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          aria-label={confirmLabel}
          className="gp-btn gp-btn--primary"
          disabled={isConfirmDisabled}
          onClick={onConfirm}
          type="button"
        >
          确认
        </button>
        <button
          aria-label={confirmLabel.replace("确认动作", "撤回动作")}
          className="gp-btn"
          disabled={isRevokeDisabled}
          onClick={onRevoke}
          type="button"
        >
          撤回
        </button>
      </div>
    </article>
  );
}

const REFORM_PATH_LABELS: Record<"freedom" | "equality" | "national", string> = {
  freedom: "自由",
  equality: "平等",
  national: "民族",
};

function GovernmentReformPanel({
  reforms,
  draft,
  onChange,
}: {
  reforms: NonNullable<DecisionPlayerPhaseWorkspace["governmentReforms"]>;
  draft: PhaseDraftByPhase["decision"];
  onChange: (value: PhaseDraftByPhase["decision"]) => void;
}) {
  const queuedReformIds = new Set(draft.reforms ?? []);
  const queuedActivateIds = new Set(draft.activatePolicies ?? []);
  const queuedDeactivateIds = new Set(draft.deactivatePolicies ?? []);

  const isPolicyActiveAfter = (policyId: string, currentlyActive: boolean): boolean => {
    if (queuedActivateIds.has(policyId)) {
      return true;
    }
    if (queuedDeactivateIds.has(policyId)) {
      return false;
    }
    return currentlyActive;
  };

  function handleEnactReform(reformId: string) {
    if (queuedReformIds.has(reformId)) {
      onChange({
        ...draft,
        reforms: (draft.reforms ?? []).filter((id) => id !== reformId),
      });
      return;
    }
    onChange({
      ...draft,
      reforms: [...(draft.reforms ?? []), reformId],
    });
  }

  function handleTogglePolicy(policyId: string, active: boolean) {
    if (active) {
      onChange({
        ...draft,
        activatePolicies: [...(draft.activatePolicies ?? []), policyId],
        deactivatePolicies: (draft.deactivatePolicies ?? []).filter((id) => id !== policyId),
      });
      return;
    }
    onChange({
      ...draft,
      activatePolicies: (draft.activatePolicies ?? []).filter((id) => id !== policyId),
      deactivatePolicies: [...(draft.deactivatePolicies ?? []), policyId],
    });
  }

  const activePolicies = reforms.availablePolicies.filter((policy) => policy.isActive);
  const inactivePolicies = reforms.availablePolicies.filter((policy) => !policy.isActive);
  const queuedAdminCost = reforms.availableReforms
    .filter((reform) => queuedReformIds.has(reform.reformId))
    .reduce((sum, reform) => sum + reform.adminCost, 0);
  const remainingCapacity = reforms.administrationCapacity - queuedAdminCost;

  return (
    <article className="gp-card" data-testid="government-reform-panel">
      <div className="gp-step-header__top">
        <div>
          <p className="gp-step-eyebrow">改革与政策</p>
          <h3 style={{ margin: "4px 0 0" }}>政府改革 / 常规政策</h3>
          <p className="gp-step-desc" style={{ marginTop: 6 }}>
            实施改革会沿三条路径推进国家定型；常规政策每回合占用行政能力与预算。
          </p>
        </div>
        <div className="gp-step-header__pills">
          <span className="gp-step-pill">行政能力 <strong>{reforms.administrationCapacity}</strong></span>
          <span className="gp-step-pill">本轮剩余 <strong>{remainingCapacity}</strong></span>
          <span className="gp-step-pill">改革排队 <strong>{queuedReformIds.size}</strong></span>
          <span className="gp-step-pill">政策变更 <strong>{queuedActivateIds.size + queuedDeactivateIds.size}</strong></span>
        </div>
      </div>

      {reforms.availableReforms.length > 0 ? (
        <details open className="gp-card" style={{ marginTop: 12 }}>
          <summary className="gp-collapse">
            改革选项 <span className="gp-collapse__hint">推进自由 / 平等 / 民族路径</span>
          </summary>
          <div className="gp-grid" style={{ marginTop: 14 }}>
            {reforms.availableReforms.map((reform) => {
              const queued = queuedReformIds.has(reform.reformId);
              const overCapacity = !queued && remainingCapacity < reform.adminCost;
              const isDisabled = reform.isCompleted || reform.isBlocked || (overCapacity && !queued);
              const status = reform.isCompleted
                ? "已实施"
                : reform.isBlocked
                  ? "已封锁"
                  : queued
                    ? "本轮排入"
                    : overCapacity
                      ? "行政能力不足"
                      : `可实施（行政 ${reform.adminCost}）`;
              return (
                <article key={reform.reformId} className="gp-toggle">
                  <div className="gp-toggle__header">
                    <strong>{reform.label}</strong>
                    <span
                      className={
                        queued || reform.isCompleted
                          ? "gp-toggle__hint gp-toggle__hint--active"
                          : "gp-toggle__hint gp-toggle__hint--inactive"
                      }
                    >
                      {REFORM_PATH_LABELS[reform.path]}
                    </span>
                  </div>
                  <span className="gp-toggle__desc">行政能力消耗 {reform.adminCost}。</span>
                  {queued ? (
                    <span className="gp-input-card__feedback">已排入本轮，提交后将进入“{reform.label}”。</span>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span className="gp-toggle__hint">{status}</span>
                    <button
                      aria-label={`实施改革：${reform.label}`}
                      className={queued ? "gp-btn gp-btn--primary" : "gp-btn"}
                      disabled={isDisabled}
                      onClick={() => handleEnactReform(reform.reformId)}
                      type="button"
                    >
                      {reform.isCompleted ? "已实施" : reform.isBlocked ? "已封锁" : queued ? "撤回" : "实施"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}

      {activePolicies.length > 0 ? (
        <details open className="gp-card" style={{ marginTop: 12 }}>
          <summary className="gp-collapse">
            已生效政策 <span className="gp-collapse__hint">本轮可标记停用，下回合不再生效</span>
          </summary>
          <div className="gp-grid" style={{ marginTop: 14 }}>
            {activePolicies.map((policy) => {
              const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
              return (
                <article key={policy.policyId} className="gp-toggle">
                  <div className="gp-toggle__header">
                    <strong>{policy.label}</strong>
                    <span
                      className={
                        active
                          ? "gp-toggle__hint gp-toggle__hint--active"
                          : "gp-toggle__hint gp-toggle__hint--inactive"
                      }
                    >
                      {active ? "已激活" : "本轮停用"}
                    </span>
                  </div>
                  <span className="gp-toggle__desc">{policy.description}</span>
                  <span className="gp-toggle__desc">
                    每回合行政 {policy.adminCostPerTurn} · 预算 {policy.budgetCost}
                  </span>
                  {!active ? (
                    <span className="gp-input-card__feedback">已排入本轮停用。</span>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button
                      aria-label={`${active ? "停用政策" : "撤回停用"}：${policy.label}`}
                      className={active ? "gp-btn" : "gp-btn gp-btn--primary"}
                      onClick={() => handleTogglePolicy(policy.policyId, !active)}
                      type="button"
                    >
                      {active ? "停用" : "撤回停用"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}

      {inactivePolicies.length > 0 ? (
        <details open className="gp-card" style={{ marginTop: 12 }}>
          <summary className="gp-collapse">
            可激活政策 <span className="gp-collapse__hint">每回合占用行政能力与预算</span>
          </summary>
          <div className="gp-grid" style={{ marginTop: 14 }}>
            {inactivePolicies.map((policy) => {
              const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
              const lockedReason = !policy.isUnlocked
                ? policy.requiresReform
                  ? `需改革：${policy.requiresReform}`
                  : "未解锁"
                : null;
              const isDisabled = lockedReason !== null && !active;
              const hintText = active
                ? "本轮激活"
                : lockedReason ?? `每回合行政 ${policy.adminCostPerTurn} · 预算 ${policy.budgetCost}`;
              return (
                <article key={policy.policyId} className="gp-toggle">
                  <div className="gp-toggle__header">
                    <strong>{policy.label}</strong>
                    <span
                      className={
                        active
                          ? "gp-toggle__hint gp-toggle__hint--active"
                          : "gp-toggle__hint gp-toggle__hint--inactive"
                      }
                    >
                      {hintText}
                    </span>
                  </div>
                  <span className="gp-toggle__desc">{policy.description}</span>
                  <span className="gp-toggle__desc">
                    每回合行政 {policy.adminCostPerTurn} · 预算 {policy.budgetCost}
                  </span>
                  {active ? <span className="gp-input-card__feedback">已排入本轮激活。</span> : null}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button
                      aria-label={`激活政策：${policy.label}`}
                      className={active ? "gp-btn gp-btn--primary" : "gp-btn"}
                      disabled={isDisabled}
                      onClick={() => handleTogglePolicy(policy.policyId, !active)}
                      type="button"
                    >
                      {active ? "撤回激活" : "激活"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}
    </article>
  );
}

const IDEOLOGY_OPTIONS: IdeologyKey[] = ["liberalism", "egalitarianism", "nationalism"];

const IDEOLOGY_LABELS: Record<IdeologyKey, string> = {
  liberalism: "自由主义",
  egalitarianism: "平等主义",
  nationalism: "民族主义",
};

function buildTechTreeSections(workspace: DecisionPlayerPhaseWorkspace): Array<{
  title: string;
  description: string;
  nodes: TechTreeNode[];
}> {
  const governmentActionIds = new Set(workspace.governmentActions.strategies.map((action) => action.actionId));
  const domesticActionIds = new Set(workspace.domesticMarketActions.map((action) => action.actionId));

  return [
    {
      title: "工业链",
      description: "决定可生产商品与工业路线升级。",
      nodes: workspace.techTree.filter((node) => node.unlocksGoods.length > 0 || node.unlocksRoutes.length > 0),
    },
    {
      title: "政府策略链",
      description: "决定哪些政府政策卡可以进入本轮选择。",
      nodes: workspace.techTree.filter((node) => node.unlocksActions.some((actionId) => governmentActionIds.has(actionId))),
    },
    {
      title: "国内动作链",
      description: "决定哪些内需动作卡可以进入本轮选择。",
      nodes: workspace.techTree.filter((node) => node.unlocksActions.some((actionId) => domesticActionIds.has(actionId))),
    },
  ].filter((section) => section.nodes.length > 0);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function buildProductionHint(option: FactoryProductionOption, availableBatches: number): string {
  return [
    `1 批 = 花 ${option.unitBudgetCost} 工厂预算，产出 ${option.unitOutput} 件商品。`,
    `国内参考价 ${option.domesticReferencePrice}。`,
    `${formatPriceTrendText(option.priceTrend, option.priceAdjustment)}。`,
    `海外参考价区间 ${option.overseasReferencePriceMin}-${option.overseasReferencePriceMax}。`,
    `共享 ${option.routeLabel} 产能 ${availableBatches}。`,
    option.usageHint,
  ].join(" ");
}

function buildProductionFeedback(
  option: FactoryProductionOption,
  draft: PhaseDraftByPhase["decision"],
  productionOptions: FactoryProductionOption[],
  availableBatches: number,
): string | undefined {
  const quantity = getProductionOrderQuantity(draft, option.goodsId);
  if (quantity <= 0) {
    return undefined;
  }

  const allocatedOnRoute = getAllocatedProductionBatchesForRoute(draft, productionOptions, option.routeId);
  const remaining = Math.max(availableBatches - allocatedOnRoute, 0);
  return `已安排 ${quantity} 批，消耗 ${quantity * option.unitBudgetCost} 工厂预算，产出 ${quantity * option.unitOutput} 件商品，共享 ${option.routeLabel} 剩余 ${remaining} 批。`;
}

function buildExpansionHint(option: FactoryExpansionOption): string {
  return `你输入的数字 = 建设次数。1 次扩产花 ${option.unitBudgetCost} 工厂预算，下一回合 ${option.routeLabel} 产能 +${option.capacityDelta}。`;
}

function buildExpansionFeedback(quantity: number, option: FactoryExpansionOption): string | undefined {
  if (quantity <= 0) {
    return undefined;
  }
  return `已规划 ${quantity} 次扩产，工厂预算 -${quantity * option.unitBudgetCost}，下一回合 ${option.routeLabel} +${quantity * option.capacityDelta}。`;
}

function buildUpgradeHint(option: FactoryUpgradeOption): string {
  return `你输入的数字 = 建设次数。1 次升级花 ${option.unitBudgetCost} 工厂预算，下一回合 ${option.sourceRouteLabel} -${option.capacityDelta}，${option.routeLabel} +${option.capacityDelta}。`;
}

function buildUpgradeFeedback(quantity: number, option: FactoryUpgradeOption): string | undefined {
  if (quantity <= 0) {
    return undefined;
  }
  return `已规划 ${quantity} 次升级，工厂预算 -${quantity * option.unitBudgetCost}，下一回合 ${option.sourceRouteLabel} -${quantity * option.capacityDelta}，${option.routeLabel} +${quantity * option.capacityDelta}。`;
}

function buildNewFactoryHint(option: FactoryNewFactoryOption): string {
  return `你输入的数字 = 建设次数。1 次新建花 ${option.unitBudgetCost} 工厂预算，下一回合 ${option.routeLabel} 产能 +${option.capacityDelta}。`;
}

function buildNewFactoryFeedback(quantity: number, option: FactoryNewFactoryOption): string | undefined {
  if (quantity <= 0) {
    return undefined;
  }
  return `已规划 ${quantity} 次新建，工厂预算 -${quantity * option.unitBudgetCost}，下一回合 ${option.routeLabel} +${quantity * option.capacityDelta}。`;
}

function getPointPurchaseQuantity(
  draft: PhaseDraftByPhase["decision"],
  pointType: "tech" | "military",
): number {
  return draft.governmentPlan.pointPurchases.find((item) => item.pointType === pointType)?.quantity ?? 0;
}

function setPointPurchaseQuantity(
  draft: PhaseDraftByPhase["decision"],
  pointType: "tech" | "military",
  quantity: number,
): PhaseDraftByPhase["decision"] {
  const nextQuantity = normalizeQuantity(quantity);
  const remainingItems = draft.governmentPlan.pointPurchases.filter((item) => item.pointType !== pointType);
  const nextItems = nextQuantity > 0 ? [...remainingItems, { pointType, quantity: nextQuantity }] : remainingItems;

  return {
    ...draft,
    governmentPlan: {
      ...draft.governmentPlan,
      pointPurchases: nextItems,
    },
  };
}

function buildPointPurchaseFeedback(
  label: string,
  quantity: number,
  cost: number,
): string | undefined {
  if (quantity <= 0) {
    return undefined;
  }
  return `已购买 ${quantity} 点${label}，政府财政 -${quantity * cost}。`;
}

function getSaleOrderQuantity(
  draft: PhaseDraftByPhase["market"],
  goodsId: string,
  market: "domestic" | "overseas",
  regionId?: string,
): number {
  return draft.saleOrders.find((item) => {
    if (item.goodsId !== goodsId || item.market !== market) {
      return false;
    }
    return market === "domestic" ? true : item.regionId === regionId;
  })?.quantity ?? 0;
}

function setSaleOrderQuantity(
  draft: PhaseDraftByPhase["market"],
  goodsId: string,
  market: "domestic" | "overseas",
  quantity: number,
  regionId?: string,
): PhaseDraftByPhase["market"] {
  const nextQuantity = normalizeQuantity(quantity);
  const remainingOrders = draft.saleOrders.filter((item) => {
    if (item.goodsId !== goodsId || item.market !== market) {
      return true;
    }
    return market === "domestic" ? false : item.regionId !== regionId;
  });
  const nextOrders = nextQuantity > 0
    ? [
        ...remainingOrders,
        market === "domestic"
          ? { goodsId, market, quantity: nextQuantity }
          : { goodsId, market, quantity: nextQuantity, regionId },
      ]
    : remainingOrders;

  return {
    ...draft,
    saleOrders: nextOrders,
  };
}

function calculateMarketRevenuePreview(
  workspace: MarketPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["market"],
) {
  const domesticRevenue = draft.saleOrders
    .filter((item) => item.market === "domestic")
    .reduce((sum, item) => {
      const inventory = workspace.sellableInventory.find((candidate) => candidate.goodsId === item.goodsId);
      return sum + item.quantity * (inventory?.domesticReferencePrice ?? 0);
    }, 0);
  const overseasRevenue = draft.saleOrders
    .filter((item) => item.market === "overseas")
    .reduce((sum, item) => {
      const inventory = workspace.sellableInventory.find((candidate) => candidate.goodsId === item.goodsId);
      const price = inventory?.overseasReferencePrices.find((candidate) => candidate.regionId === item.regionId);
      return sum + item.quantity * (price?.unitPrice ?? 0);
    }, 0);

  return {
    domesticRevenue,
    overseasRevenue,
    nationalIncome: domesticRevenue + overseasRevenue,
  };
}

function calculateMarketRiskLines(
  workspace: MarketPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["market"],
): string[] {
  const lines: string[] = [];
  for (const item of workspace.sellableInventory) {
    const allocated = draft.saleOrders.filter((order) => order.goodsId === item.goodsId).reduce((sum, order) => sum + order.quantity, 0);
    if (allocated > item.quantity) {
      lines.push(`${item.label} 已分配 ${allocated}，超过当前库存 ${item.quantity}。`);
    } else if (allocated < item.quantity) {
      lines.push(`${item.label} 仍有 ${item.quantity - allocated} 件未安排卖向，可能继续压仓库。`);
    }
  }
  const domesticAllocated = draft.saleOrders.filter((order) => order.market === "domestic").reduce((sum, order) => sum + order.quantity, 0);
  if (domesticAllocated > workspace.domesticMarketCapacity) {
    lines.push(`国内卖量 ${domesticAllocated} 超过承接能力 ${workspace.domesticMarketCapacity}。`);
  }
  const overseasAllocated = draft.saleOrders.filter((order) => order.market === "overseas").reduce((sum, order) => sum + order.quantity, 0);
  if (overseasAllocated > workspace.overseasMarketCapacity) {
    lines.push(`海外卖量 ${overseasAllocated} 超过承接能力 ${workspace.overseasMarketCapacity}。`);
  }
  return lines;
}

function formatOverseasRange(prices: MarketRegionReferencePrice[]): string {
  if (prices.length === 0) {
    return "0";
  }
  const values = prices.map((item) => item.unitPrice);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? String(min) : `${min}-${max}`;
}

function normalizeQuantity(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function setPhase1RawMaterialAssignment(
  draft: PhaseDraftByPhase["decision"],
  mode: string,
  quantity: number,
): PhaseDraftByPhase["decision"] {
  const safe = Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0));
  const previousAssignments = draft.phase1Production?.rawMaterialAssignments ?? {};
  const nextAssignments: Record<string, number> = { ...previousAssignments };
  if (safe > 0) {
    nextAssignments[mode] = safe;
  } else {
    delete nextAssignments[mode];
  }
  return {
    ...draft,
    phase1Production: {
      rawMaterialAssignments: nextAssignments,
    },
  };
}
