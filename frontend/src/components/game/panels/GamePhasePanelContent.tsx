import type { Dispatch, SetStateAction } from "react";

import { Phase1MarketPanel } from "./Phase1MarketPanel";
import { MilitaryPanel } from "./MilitaryPanel";
import { GovernmentPanel } from "./GovernmentPanel";
import { DomesticPanel } from "./DomesticPanel";
import { DecisionStepTabs } from "./DecisionStepTabs";
import { DecisionResourceBar } from "./DecisionResourceBar";
import { FactoryPanel } from "./factory/FactoryPanel";
import { ResearchPanel } from "./ResearchPanel";
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
  removeColonizationAction,
  removeMilitaryActionSelection,
  setAdminPurchases,
  setColonizationUnlockSelection,
  setConquestAction,
  setNavalDeployment,
  setProductionOrderQuantity,
  setRouteDecisionOrderQuantity,
  toggleDiplomacyActionSelection,
  toggleDomesticMarketActionSelection,
  toggleGovernmentStrategySelection,
  toggleLootingAction,
  togglePolicyQueue,
  toggleReformQueue,
  toggleTalentUnlockSelection,
  toggleTechResearchSelection,
} from "../../../features/game/decisionDrafts";
import {
  buildMilitaryActionDescription,
  buildRegionAccessDescription,
  calculateDecisionSpendSummary,
  calculateGovernmentPointPreview,
  formatRatio,
  getRegionAccessLevelLabel,
} from "../../../features/game/decisionShared";
import type {
  DecisionPlayerPhaseWorkspace,
  GamePhase,
  MarketPlayerPhaseWorkspace,
  PlayerPhaseWorkspace,
  PlayerState,
  SettlementPlayerPhaseWorkspace,
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
  secondsRemaining?: number | null;
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
  secondsRemaining,
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
          secondsRemaining={secondsRemaining ?? null}
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
      <DecisionResourceBar workspace={workspace} draft={draft} activeStep={activeStep} />
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
        <GovernmentPanel
          workspace={workspace}
          draft={draft}
          remainingGovernmentBudget={workspace.budgetPools.governmentFiscal - spendSummary.governmentSpend}
          onAdminPurchase={(quantity) => {
            handleDraftChange("government", setAdminPurchases(draft, quantity));
          }}
          onEnactReform={(reformId, queued) => {
            handleDraftChange("government", toggleReformQueue(draft, reformId, queued));
          }}
          onTogglePolicy={(policyId, active) => {
            handleDraftChange("government", togglePolicyQueue(draft, policyId, active));
          }}
          onToggleStrategy={(actionId, checked) => {
            handleDraftChange("government", toggleGovernmentStrategySelection(draft, actionId, checked));
          }}
        />
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
      ) : activeStep === "research" ? (
        <ResearchPanel
          techTree={workspace.techTree}
          selectedTechIds={new Set(draft.governmentPlan.techResearch.map((t) => t.techId))}
          onToggleTech={(techId, checked) => handleDraftChange("research", toggleTechResearchSelection(draft, techId, checked))}
          view={decisionFlowState.activeResearchView}
          onViewChange={(view) => onDecisionFlowChange((prev) => ({ ...prev, activeResearchView: view }))}
          talentBranches={workspace.researchWorkspace?.talentBranches ?? []}
          projectedTechPoints={governmentPointPreview.techPoints}
          techCostPerPoint={workspace.governmentActions?.pointPurchaseCosts?.tech ?? 10}
          unlockedTalentCount={workspace.researchWorkspace?.unlockedTalentCount ?? 0}
          selectedTalentNodeIds={new Set(draft.talentPlan?.talentUnlocks?.map((u) => u.nodeId) ?? [])}
          activeBranchId={decisionFlowState.activeResearchBranch}
          onSelectBranch={(id) => onDecisionFlowChange((prev) => ({ ...prev, activeResearchBranch: id }))}
          onToggleTalentNode={(nodeId, checked) => {
            onChange(toggleTalentUnlockSelection(draft, nodeId, checked));
            onDecisionFlowChange((prev) => markDecisionStepDirty(prev, "research"));
          }}
        />
      ) : null}
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
  draft,
  onChange,
}: {
  workspace: MarketPlayerPhaseWorkspace;
  playerState: PlayerState | null;
  draft: PhaseDraftByPhase["market"];
  onChange: (value: PhaseDraftByPhase["market"]) => void;
}) {
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

  const externalTotal = phase1Draft.externalAllocations.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0,
  );
  const estimatedRevenue = phase1Economy
    ? calculatePhase1Revenue(
        phase1Draft.domesticAllocation,
        externalTotal,
        phase1Economy.domesticDemand ?? 0,
        phase1Economy.equilibriumPrice ?? 0,
      )
    : 0;

  return (
    <section data-testid="market-workbench" className="gp-section">
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">市场出售台</p>
            <h2 className="gp-step-title">{workspace.countryLabel}的本轮销售</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">商品库存 <strong>{phase1GoodsInventory}</strong></span>
            <span className="gp-step-pill">预计收入 <strong>{estimatedRevenue}</strong></span>
            <span className="gp-step-pill">国内投放 <strong>{phase1Draft.domesticAllocation}</strong></span>
            <span className="gp-step-pill">海外投放 <strong>{externalTotal}</strong></span>
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
    </section>
  );
}

export function SettlementWorkbench({
  workspace,
  playerState,
  secondsRemaining,
}: {
  workspace: SettlementPlayerPhaseWorkspace;
  playerState: PlayerState | null;
  secondsRemaining: number | null;
}) {
  return (
    <section data-testid="settlement-workbench" className="gp-section">
      <SettlementCountdownBanner secondsRemaining={secondsRemaining} />
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
      {workspace.phase1Economy?.consumptionPool != null && workspace.phase1Economy?.poolDeltaPreview && (
        <article className="gp-card">
          <h3 style={{ margin: 0 }}>💰 消费池变化</h3>
          <p className="gp-step-desc" style={{ marginTop: 4 }}>
            上期余额 {workspace.phase1Economy.consumptionPool} + 新增 {Math.round(workspace.phase1Economy.poolDeltaPreview.consumption)} = {workspace.phase1Economy.consumptionPool + Math.round(workspace.phase1Economy.poolDeltaPreview.consumption)}
            ，经过 30% 自然消费后结余 {Math.round((workspace.phase1Economy.consumptionPool + workspace.phase1Economy.poolDeltaPreview.consumption) * 0.7)}
          </p>
          <div className="gp-grid">
            <MetricCard hint="上一轮消费池余额。" label="上期余额" value={workspace.phase1Economy.consumptionPool} />
            <MetricCard hint="本回合收入按 5:3:2 分配到消费池的部分。" label="新增分配" value={Math.round(workspace.phase1Economy.poolDeltaPreview.consumption)} />
            <MetricCard hint="经过自然消费后的最终消费池。" label="结余" value={Math.round((workspace.phase1Economy.consumptionPool + workspace.phase1Economy.poolDeltaPreview.consumption) * 0.7)} />
          </div>
        </article>
      )}
    </section>
  );
}

function SettlementCountdownBanner({ secondsRemaining }: { secondsRemaining: number | null }) {
  if (secondsRemaining === null) {
    return null;
  }

  const message = secondsRemaining > 0
    ? `${secondsRemaining} 秒后进入下一回合…`
    : "进入下一回合…";

  return (
    <article
      className="gp-card"
      data-testid="settlement-countdown-banner"
      style={{ borderLeft: "3px solid var(--game-accent, #f0a020)", padding: "10px 14px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden="true" style={{ fontSize: 18 }}>⏳</span>
        <strong>{message}</strong>
      </div>
    </article>
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


function calculatePhase1Revenue(
  domesticAllocation: number,
  externalAllocation: number,
  demand: number,
  equilibriumPrice: number,
): number {
  const domesticSold = Math.min(domesticAllocation, demand);
  return domesticSold * equilibriumPrice + externalAllocation * Math.round(equilibriumPrice * 1.2);
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
