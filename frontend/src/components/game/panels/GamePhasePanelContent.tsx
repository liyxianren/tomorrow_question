import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";
import { getReformLabel } from "../../../features/game/panelGlossary";

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
import type { ParameterInspector } from "../../../features/game/parameterInspector";
import {
  clearDecisionStepDraft,
  getDecisionStepLabel,
  getDecisionStepReviewLabel,
  hasDecisionStepContent,
  getNextDecisionStep,
  getPreviousDecisionStep,
  markDecisionStepDirty,
  markDecisionStepReviewed,
  setDecisionActiveStep,
} from "../../../features/game/flow/decisionFlow";
import {
  addMilitaryActionSelection,
  removeMilitaryActionSelection,
  setAbilitySelectionTarget,
  setAdminPurchases,
  setRegionBlockade,
  setProductionOrderQuantity,
  setRawMaterialPurchaseQuantity,
  setRouteDecisionOrderQuantity,
  toggleFactoryActionSelection,
  toggleGovernmentStrategySelection,
  toggleNationalAbilitySelection,
  togglePolicyQueue,
  toggleReformQueue,
  toggleTechResearchSelection,
} from "../../../features/game/decisionDrafts";
import {
  buildMilitaryActionDescription,
  buildRegionAccessDescription,
  calculateDecisionSpendSummary,
  calculateGovernmentFiscalState,
  clampDecisionPhase1ProductionDraft,
  getRegionAccessLevelLabel,
} from "../../../features/game/decisionShared";
import {
  calculatePhase1MarketRevenue,
  DOMESTIC_PRICE_CEILING_RATIO,
  DOMESTIC_PRICE_FLOOR_RATIO,
} from "../../../features/game/marketMath";
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
  isFinalRoundSettlement?: boolean;
  parameterInspector?: ParameterInspector;
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
  isFinalRoundSettlement = false,
  parameterInspector,
}: GamePhasePanelContentProps) {
  const { t } = useTranslation();

  if (!currentPhase || !currentPlayerWorkspace) {
    return (
      <div className="gp-card">
        <strong>{currentPhase ? getPhaseLabel(currentPhase) : t("game:government.syncingPhase", "Syncing current phase...")}</strong>
        <p style={{ margin: 0 }}>{t("game:government.syncingPhaseDesc", "Syncing current phase data...")}</p>
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
          parameterInspector={parameterInspector}
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
          isFinalRound={isFinalRoundSettlement}
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
  parameterInspector,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  decisionFlowState: DecisionFlowState;
  onChange: (value: PhaseDraftByPhase["decision"]) => void;
  onDecisionFlowChange: Dispatch<SetStateAction<DecisionFlowState>>;
  onComplete?: () => void;
  parameterInspector?: ParameterInspector;
}) {
  const { t } = useTranslation();

  const activeStep = decisionFlowState.activeStep;
  const activeStepReviewState = decisionFlowState.stepReviewStateByStep[activeStep];
  const stepContentContext = {
    activeResearch: workspace.techTree.activeResearch,
    requireFactoryReviewForPhase1: true,
  };
  const activeStepHasContent = hasDecisionStepContent(draft, activeStep, stepContentContext);
  const activeStepStatusLabel = activeStepHasContent
    ? t("game:stepStatus.decided", "Decided")
    : getDecisionStepReviewLabel(activeStepReviewState);
  const activeStepIsEmpty = !activeStepHasContent;

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

  function markEmptyActiveStepOnForward(previous: DecisionFlowState) {
    const reviewState = previous.stepReviewStateByStep[activeStep];
    if (activeStepHasContent || (reviewState !== "unreviewed" && reviewState !== "needs_recheck")) {
      return previous;
    }
    return markDecisionStepReviewed(previous, activeStep, "no_op");
  }

  function handleForwardStepSwitch(step: DecisionStepId) {
    onDecisionFlowChange((previous) => setDecisionActiveStep(markEmptyActiveStepOnForward(previous), step));
  }

  function handleDecisionComplete() {
    onDecisionFlowChange((previous) => markEmptyActiveStepOnForward(previous));
    onComplete?.();
  }

  function handleDraftChange(step: DecisionStepId, nextDraft: PhaseDraftByPhase["decision"]) {
    onChange(nextDraft);
    onDecisionFlowChange((previous) => markDecisionStepDirty(previous, step));
  }

  const previousStep = getPreviousDecisionStep(activeStep);
  const nextStep = getNextDecisionStep(activeStep);

  const spendSummary = calculateDecisionSpendSummary(workspace, draft);
  const fiscalState = calculateGovernmentFiscalState(workspace, draft);
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
            handleDraftChange(
              "factory",
              clampDecisionPhase1ProductionDraft(
                workspace,
                setRouteDecisionOrderQuantity(draft, field, routeId, quantity),
              ),
            );
          }}
          onFactoryActionToggle={(actionId, checked) => {
            handleDraftChange(
              "factory",
              clampDecisionPhase1ProductionDraft(
                workspace,
                toggleFactoryActionSelection(draft, actionId, checked),
              ),
            );
          }}
          onTechnologyToggle={(techId, checked) => {
            handleDraftChange("factory", toggleTechResearchSelection(draft, techId, checked));
          }}
          onPhase1RawMaterialAssignmentChange={(mode, quantity) => {
            handleDraftChange(
              "factory",
              clampDecisionPhase1ProductionDraft(
                workspace,
                setPhase1RawMaterialAssignment(draft, mode, quantity),
              ),
            );
          }}
          onRawMaterialPurchaseQuantityChange={(quantity) => {
            handleDraftChange(
              "factory",
              clampDecisionPhase1ProductionDraft(
                workspace,
                setRawMaterialPurchaseQuantity(draft, quantity),
              ),
            );
          }}
          parameterInspector={parameterInspector}
        />
      ) : activeStep === "domestic" ? (
        <DomesticPanel
          workspace={workspace}
          draft={draft}
          remainingDomesticBudget={workspace.budgetPools.domesticMarket - spendSummary.domesticSpend}
          parameterInspector={parameterInspector}
        />
      ) : activeStep === "government" ? (
        <GovernmentPanel
          workspace={workspace}
          draft={draft}
          remainingGovernmentBudget={fiscalState.effectiveGovernmentRemaining}
          onEnactReform={(reformId, queued) => {
            handleDraftChange("government", toggleReformQueue(draft, reformId, queued));
          }}
          onTogglePolicy={(policyId, active) => {
            handleDraftChange("government", togglePolicyQueue(draft, policyId, active));
          }}
          onToggleStrategy={(actionId, checked) => {
            handleDraftChange("government", toggleGovernmentStrategySelection(draft, actionId, checked));
          }}
          onAdminPurchasesChange={(quantity) => {
            handleDraftChange("government", setAdminPurchases(draft, quantity));
          }}
          onToggleAbility={(checked) => {
            if (!workspace.nationalAbility) return;
            handleDraftChange("government", toggleNationalAbilitySelection(draft, workspace.nationalAbility, checked));
          }}
          onAbilityTargetChange={(ideology) => {
            if (!workspace.nationalAbility) return;
            handleDraftChange("government", setAbilitySelectionTarget(draft, workspace.nationalAbility.abilityId, ideology));
          }}
          parameterInspector={parameterInspector}
        />
      ) : activeStep === "military" ? (
        <MilitaryPanel
          workspace={workspace}
          draft={draft}
          remainingGovernmentBudget={fiscalState.effectiveGovernmentRemaining}
          onAddMilitary={(actionId) => handleDraftChange("military", addMilitaryActionSelection(draft, actionId))}
          onRemoveMilitary={(actionId) => handleDraftChange("military", removeMilitaryActionSelection(draft, actionId))}
          onRegionBlockadeChange={(regionId, count) => handleDraftChange("military", setRegionBlockade(draft, regionId, count))}
          parameterInspector={parameterInspector}
        />
      ) : activeStep === "research" ? (
        <ResearchPanel
          techTree={workspace.techTree}
          selectedTechIds={new Set(draft.governmentPlan.techResearch.map((t) => t.techId))}
          onToggleTech={(techId, checked) => handleDraftChange("research", toggleTechResearchSelection(draft, techId, checked))}
          onToggleResearchFacility={(checked) => handleDraftChange("research", toggleGovernmentStrategySelection(draft, "expand_research", checked))}
          remainingGovernmentBudget={fiscalState.effectiveGovernmentRemaining}
          isResearchFacilitySelected={draft.governmentPlan.strategySelections.some((s) => s.actionId === "expand_research")}
          parameterInspector={parameterInspector}
        />
      ) : null}
      <DecisionStepFooter
        activeStep={activeStep}
        activeStepIsEmpty={activeStepIsEmpty}
        activeStepStatusLabel={activeStepStatusLabel}
        nextStep={nextStep}
        onComplete={handleDecisionComplete}
        onMarkChecked={handleStepChecked}
        onMarkNoOp={handleStepNoOp}
        onNextStepChange={handleForwardStepSwitch}
        onPreviousStepChange={handleStepSwitch}
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
  const fiscalState = calculateGovernmentFiscalState(workspace, draft);
  const remainingBudget = fiscalState.baseGovernmentRemaining;
  const remainingDecisionBudget = Math.max(0, fiscalState.effectiveGovernmentRemaining);
  const armyActions = militaryWorkspace.availableMilitaryActions.filter((action) => (
    action.actionId === "recruit_army"
  ));
  const supportActions = militaryWorkspace.availableMilitaryActions.filter((action) => (
    action.actionId !== "recruit_army"
  ));

  function getMilitarySelectionCount(actionId: string): number {
    return draft.militaryPlan.militaryActions.filter((item) => item.actionId === actionId).length;
  }

  function canAddMilitaryAction(actionId: string, cost: number, maxPerRound: number): boolean {
    const selectedCount = getMilitarySelectionCount(actionId);
    if (selectedCount >= maxPerRound) {
      return false;
    }
    return remainingDecisionBudget >= cost;
  }

  const { t } = useTranslation();
  return (
    <>
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">{t("game:military.stepEyebrow_military")}</p>
            <h2 className="gp-step-title">{t("game:military.stepTitle_military")}</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">{t("game:military.fiscalRemaining")} <strong>{remainingBudget}</strong></span>
            <span className="gp-step-pill">{t("game:military.decisionBudgetRemainingPill", "Decision budget remaining")} <strong>{remainingDecisionBudget}</strong></span>
            <span className="gp-step-pill">{t("game:military.overseasCapacityPill")} <strong>{militaryWorkspace.overseasCapacity}</strong></span>
            <span className="gp-step-pill">{t("game:military.overseasRegionsOpenPill")}</span>
          </div>
        </div>
      </article>
      <article className="gp-card">
        <div className="gp-inner-group" style={{ gap: 14 }}>
          <div>
            <p className="gp-step-eyebrow">{t("game:military.regionIntel")}</p>
            <h3 style={{ margin: "4px 0 0" }}>{t("game:military.overseasRegionStatus")}</h3>
            <p className="gp-step-desc" style={{ marginTop: 6 }}>
              {t("game:military.overseasRegionStatusDesc")}
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
      {armyActions.length > 0 ? (
        <article className="gp-card">
          <div className="gp-inner-group" style={{ gap: 14 }}>
            <div>
              <p className="gp-step-eyebrow">{t("game:military.armyRecruitment")}</p>
              <h3 style={{ margin: "4px 0 0" }}>{t("game:military.armyRecruitmentTitle")}</h3>
              <p className="gp-step-desc" style={{ marginTop: 6 }}>{t("game:military.armyRecruitmentDesc")}</p>
            </div>
            <div className="gp-grid">
              {armyActions.map((action) => (
                <ConfirmActionCard
                  key={action.actionId}
                  confirmLabel={t("game:military.confirmAction", { label: action.label })}
                  count={getMilitarySelectionCount(action.actionId)}
                  description={buildMilitaryActionDescription(action)}
                  feedback={t("game:military.actionScheduledCount", { current: getMilitarySelectionCount(action.actionId), max: action.maxPerRound })}
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
            <p className="gp-step-eyebrow">{t("game:military.supportAction")}</p>
            <h3 style={{ margin: "4px 0 0" }}>{t("game:military.supportActionTitle")}</h3>
            <p className="gp-step-desc" style={{ marginTop: 6 }}>{t("game:military.supportActionDesc")}</p>
          </div>
          {supportActions.length > 0 ? (
            <div className="gp-grid">
              {supportActions.map((action) => (
                <ConfirmActionCard
                  key={action.actionId}
                  confirmLabel={t("game:military.confirmAction", { label: action.label })}
                  count={getMilitarySelectionCount(action.actionId)}
                  description={buildMilitaryActionDescription(action)}
                  feedback={t("game:military.actionScheduledCount", { current: getMilitarySelectionCount(action.actionId), max: action.maxPerRound })}
                  isConfirmDisabled={!canAddMilitaryAction(action.actionId, action.cost, action.maxPerRound)}
                  isRevokeDisabled={getMilitarySelectionCount(action.actionId) === 0}
                  onConfirm={() => onChange(addMilitaryActionSelection(draft, action.actionId))}
                  onRevoke={() => onChange(removeMilitaryActionSelection(draft, action.actionId))}
                />
              ))}
            </div>
          ) : null}
        </div>
      </article>
    </>
  );
}

function DecisionStepFooter({
  activeStep,
  activeStepIsEmpty,
  activeStepStatusLabel,
  previousStep,
  nextStep,
  onNextStepChange,
  onPreviousStepChange,
  onMarkChecked,
  onMarkNoOp,
  onComplete,
}: {
  activeStep: DecisionStepId;
  activeStepIsEmpty: boolean;
  activeStepStatusLabel: string;
  previousStep: DecisionStepId | null;
  nextStep: DecisionStepId | null;
  onNextStepChange: (step: DecisionStepId) => void;
  onPreviousStepChange: (step: DecisionStepId) => void;
  onMarkChecked: () => void;
  onMarkNoOp: () => void;
  onComplete?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <article className="decision-command-deck__footer">
      <div className="gp-footer-actions" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
        {previousStep ? (
          <button className="gp-btn" onClick={() => onPreviousStepChange(previousStep)} type="button">
            {t("game:footer.previousStep", "Previous")}：{getDecisionStepLabel(previousStep)}
          </button>
        ) : null}
        <div className="decision-command-deck__footer-spacer" />
        <span className="gp-step-desc" data-testid="decision-step-footer-status" style={{ margin: 0 }}>
          {activeStepStatusLabel}
        </span>
        <button className="gp-btn" onClick={onMarkNoOp} type="button">
          {t("game:footer.skipStep", "Skip")}
        </button>
        <button className="gp-btn" onClick={onMarkChecked} type="button">
          {t("game:footer.markChecked", "Mark Checked")}
        </button>
        {nextStep ? (
          <button className="gp-btn gp-btn--primary" onClick={() => onNextStepChange(nextStep)} type="button">
            {t("game:footer.nextStep", "Next")}：{getDecisionStepLabel(nextStep)}
          </button>
        ) : (
          <button className="gp-btn gp-btn--primary" onClick={onComplete} type="button">
            {activeStep === "research" && activeStepIsEmpty
              ? t("game:footer.skipResearchAndComplete", "跳过研究并提交")
              : t("game:footer.decisionComplete", "Complete Decision")}
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
  readOnly = false,
}: {
  workspace: MarketPlayerPhaseWorkspace;
  playerState: PlayerState | null;
  draft: PhaseDraftByPhase["market"];
  onChange: (value: PhaseDraftByPhase["market"]) => void;
  readOnly?: boolean;
}) {
  function handlePhase1AllocationChange(domesticAllocation: number) {
    if (readOnly) {
      return;
    }
    const previous = draft.phase1Market ?? {
      domesticAllocation: 0,
      externalAllocations: [],
      externalCompetitionDeployments: [],
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
    if (readOnly) {
      return;
    }
    const previous = draft.phase1Market ?? {
      domesticAllocation: 0,
      externalAllocations: [],
      externalCompetitionDeployments: [],
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

  function handlePhase1CompetitionDeploymentChange(marketId: string, infantry: number, artillery: number) {
    if (readOnly) {
      return;
    }
    const previous = draft.phase1Market ?? {
      domesticAllocation: 0,
      externalAllocations: [],
      externalCompetitionDeployments: [],
    };
    const safeInfantry = Math.max(0, Math.floor(infantry));
    const safeArtillery = Math.max(0, Math.floor(artillery));
    const filtered = (previous.externalCompetitionDeployments ?? []).filter((item) => item.marketId !== marketId);
    const next = safeInfantry > 0 || safeArtillery > 0
      ? [...filtered, { marketId, infantry: safeInfantry, artillery: safeArtillery }]
      : filtered;
    onChange({
      ...draft,
      phase1Market: {
        ...previous,
        externalCompetitionDeployments: next,
      },
    });
  }

  const phase1Economy = workspace.phase1Economy;
  const phase1GoodsInventory = workspace.phase1GoodsAvailable ?? phase1Economy?.goodsInventory ?? 0;
  const phase1Draft = draft.phase1Market ?? {
    domesticAllocation: 0,
    externalAllocations: [],
    externalCompetitionDeployments: [],
  };

  const externalTotal = phase1Draft.externalAllocations.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0,
  );
  const domesticLimit = phase1Economy
    ? Math.floor(Math.max(0, phase1GoodsInventory - externalTotal))
    : phase1GoodsInventory;
  const displayDomesticAllocation = clampMarketQuantity(
    phase1Draft.domesticAllocation,
    0,
    domesticLimit,
  );
  const estimatedRevenue = phase1Economy
    ? calculatePhase1MarketRevenue({
        domesticAllocation: displayDomesticAllocation,
        externalAllocations: phase1Draft.externalAllocations,
        externalCompetitionDeployments: phase1Draft.externalCompetitionDeployments ?? [],
        regionAccessStatus: workspace.regionAccessStatus ?? [],
        overseasCompetition: workspace.overseasCompetition,
        overseasMarketCapacity: workspace.overseasMarketCapacity,
        domesticSoftCap: phase1Economy.domesticSoftCap
          ?? workspace.domesticMarketCapacity
          ?? phase1Economy.domesticDemand
          ?? 1,
        equilibriumPrice: phase1Economy.equilibriumPrice ?? 0,
        minimumDomesticPrice: phase1Economy.minimumDomesticPrice
          ?? Math.max(0, (phase1Economy.equilibriumPrice ?? 0) * DOMESTIC_PRICE_FLOOR_RATIO),
        maximumDomesticPrice: phase1Economy.domesticPriceCeiling
          ?? Math.max(0, (phase1Economy.equilibriumPrice ?? 0) * DOMESTIC_PRICE_CEILING_RATIO),
        domesticPriceBonus: phase1Economy.domesticPriceBonus ?? 0,
      })
    : 0;

  const { t } = useTranslation();

  return (
    <section data-testid="market-workbench" className="gp-section">
      <article className="gp-card gp-card--primary gp-step-header">
        <div className="gp-step-header__top">
          <div>
            <p className="gp-step-eyebrow">{t("game:market.title", "Market Sales Desk")}</p>
            <h2 className="gp-step-title">{t("game:market.countrySales", { country: workspace.countryLabel })}</h2>
          </div>
          <div className="gp-step-header__pills">
            <span className="gp-step-pill">{t("game:market.goodsInventory")} <strong>{phase1GoodsInventory}</strong></span>
            <span className="gp-step-pill">{t("game:market.estimatedRevenue")} <strong>{estimatedRevenue}</strong></span>
            <span className="gp-step-pill">{t("game:market.domesticAllocated")} <strong>{displayDomesticAllocation}</strong></span>
            <span className="gp-step-pill">{t("game:market.overseasAllocated")} <strong>{externalTotal}</strong></span>
          </div>
        </div>
      </article>

      {phase1Economy ? (
        <Phase1MarketPanel
          phase1Economy={phase1Economy}
          goodsInventory={phase1GoodsInventory}
          domesticMarketCapacity={workspace.domesticMarketCapacity}
          overseasMarketCapacity={workspace.overseasMarketCapacity}
          overseasCompetition={workspace.overseasCompetition}
          budgetPools={workspace.budgetPools}
          regionAccessStatus={workspace.regionAccessStatus ?? []}
          draftAllocation={phase1Draft.domesticAllocation}
          externalAllocations={phase1Draft.externalAllocations}
          competitionDeployments={phase1Draft.externalCompetitionDeployments ?? []}
          incomeAllocationRatio={workspace.effectiveIncomeAllocationRatio ?? workspace.incomeAllocationRatio}
          onAllocationChange={handlePhase1AllocationChange}
          onExternalAllocationChange={handlePhase1ExternalChange}
          onCompetitionDeploymentChange={handlePhase1CompetitionDeploymentChange}
          readOnly={readOnly}
        />
      ) : null}
    </section>
  );
}

export function SettlementWorkbench({
  workspace,
  playerState,
  secondsRemaining,
  isFinalRound = false,
}: {
  workspace: SettlementPlayerPhaseWorkspace;
  playerState: PlayerState | null;
  secondsRemaining: number | null;
  isFinalRound?: boolean;
}) {
  const { t } = useTranslation();
  const marketIncome = workspace.marketIncome ?? (workspace.domesticSalesRevenue + workspace.overseasSalesRevenue);
  const colonyIncome = workspace.colonyIncome ?? Math.max(0, workspace.nationalIncome - marketIncome);
  const projectedCumulativeIncome =
    (playerState?.cumulativeNationalIncome ?? 0) + Math.max(0, workspace.nationalIncome);
  const consumptionPoolBalance = workspace.phase1Economy?.consumptionPool ?? workspace.budgetAllocation.domesticMarket;
  const consumptionAllocation = workspace.phase1Economy?.poolDeltaPreview
    ? Math.round(workspace.phase1Economy.poolDeltaPreview.consumption)
    : 0;
  const nextConsumptionPool = consumptionPoolBalance + consumptionAllocation;
  const effectiveRatioText = formatSettlementAllocationRatio(workspace.nextRatio);
  const unsoldGoodsInventory = Math.max(0, workspace.phase1Economy?.goodsInventory ?? 0);

  return (
    <section data-testid="settlement-workbench" className="gp-section">
      <SettlementCountdownBanner isFinalRound={isFinalRound} secondsRemaining={secondsRemaining} />
      <article className="gp-card gp-card--primary">
        <div>
          <p className="gp-step-eyebrow">{t("game:settlement.eyebrow", "Fiscal Settlement Desk")}</p>
          <h2 className="gp-step-title">{t("game:settlement.countryResultTitle", { country: workspace.countryLabel, defaultValue: `${workspace.countryLabel}'s National Income Distribution Results` })}</h2>
          <p className="gp-step-desc">{t("game:settlement.readonlyHint", "This phase is read-only...")}</p>
        </div>
        <div className="gp-grid">
          <MetricCard hint={t("game:settlement.domesticSalesHint")} label={t("game:settlement.domesticSales")} value={`${workspace.domesticSalesRevenue} ${t("game:settlement.fiscalUnit")}`} />
          <MetricCard hint={t("game:settlement.overseasSalesHint")} label={t("game:settlement.overseasSales")} value={`${workspace.overseasSalesRevenue} ${t("game:settlement.fiscalUnit")}`} />
          {colonyIncome > 0 ? (
            <MetricCard hint={t("game:settlement.colonyIncomeHint")} label={t("game:settlement.colonyIncome")} value={`${colonyIncome} ${t("game:settlement.fiscalUnit")}`} />
          ) : null}
          <MetricCard
            hint={colonyIncome > 0 ? t("game:settlement.nationalIncomeHintWithColony") : t("game:settlement.nationalIncomeHint")}
            label={t("game:settlement.nationalIncome")}
            value={`${workspace.nationalIncome} ${t("game:settlement.fiscalUnit")}`}
          />
          <MetricCard
            hint={t("game:settlement.effectiveRatioHint", "售卖收入按有效比例回流到民间购买力、工厂预算和政府财政。")}
            label={t("game:settlement.effectiveRatio", "本轮有效回流比例")}
            value={effectiveRatioText}
          />
          <MetricCard hint={isFinalRound ? t("game:settlement.cumulativeIncomeHintFinal") : t("game:settlement.cumulativeIncomeHintNext")} label={t("game:settlement.cumulativeIncome")} value={`${projectedCumulativeIncome} ${t("game:settlement.fiscalUnit")}`} />
          <MetricCard
            hint={isFinalRound ? t("game:settlement.cumulativeIncomeHintFinal") : t("game:settlement.cumulativeIncomeHintNext")}
            label={t("game:settlement.currentCountry")}
            value={getCountryLabel(workspace.countryCode)}
          />
        </div>
      </article>
      <article className="gp-card">
        <h3 style={{ margin: 0 }}>{t("game:settlement.redistributionTitle")}</h3>
        <div className="gp-grid">
          <MetricCard hint={t("game:settlement.consumerPurchasingPowerHint", "本轮分配到民间购买力的份额，结算后并入下回合国内消费池。")} label={t("game:settlement.consumerPurchasingPower")} value={`${workspace.budgetAllocation.domesticMarket} ${t("game:settlement.fiscalUnit")}`} />
          <MetricCard hint={t("game:settlement.factoryBudgetHint")} label={t("game:settlement.factoryBudget")} value={`${workspace.budgetAllocation.factory} ${t("game:settlement.fiscalUnit")}`} />
          <MetricCard hint={t("game:settlement.governmentFiscalHint")} label={t("game:settlement.governmentFiscal")} value={`${workspace.budgetAllocation.governmentFiscal} ${t("game:settlement.fiscalUnit")}`} />
          {unsoldGoodsInventory > 0 ? (
            <MetricCard
              hint={t("game:settlement.unsoldInventoryHint", "未售出的商品不会消失，会作为下回合可售库存继续保留。")}
              label={t("game:settlement.unsoldInventory", "结转库存")}
              value={`${unsoldGoodsInventory} ${t("game:goods.phase1_goods", "商品")}`}
            />
          ) : null}
        </div>
      </article>
      {workspace.phase1Economy?.consumptionPool != null && workspace.phase1Economy?.poolDeltaPreview && (
        <article className="gp-card">
          <h3 style={{ margin: 0 }}>💰 {t("game:settlement.consumptionPoolTitle", "民间购买力回流")}</h3>
          <p className="gp-step-desc" style={{ marginTop: 4 }}>
            {t("game:settlement.consumptionPoolFormula", {
              prev: consumptionPoolBalance,
              add: consumptionAllocation,
              remainder: nextConsumptionPool,
              defaultValue: "上回合余额 {{prev}} + 本轮回流 {{add}} = 下回合民间购买力 {{remainder}}。",
            })}
          </p>
          <div className="gp-grid">
            <MetricCard hint={t("game:settlement.previousBalanceHint")} label={t("game:settlement.previousBalance")} value={`${workspace.phase1Economy.consumptionPool} ${t("game:settlement.fiscalUnit")}`} />
            <MetricCard hint={t("game:settlement.newAllocationHint", { ratio: effectiveRatioText, defaultValue: "国家收入按当前 {{ratio}} 分配到民间购买力的部分。" })} label={t("game:settlement.newAllocation")} value={`${consumptionAllocation} ${t("game:settlement.fiscalUnit")}`} />
            <MetricCard hint={t("game:settlement.remainderHint")} label={t("game:settlement.remainder")} value={`${nextConsumptionPool} ${t("game:settlement.fiscalUnit")}`} />
          </div>
        </article>
      )}
    </section>
  );
}

function SettlementCountdownBanner({
  secondsRemaining,
  isFinalRound,
}: {
  secondsRemaining: number | null;
  isFinalRound: boolean;
}) {
  const { t } = useTranslation();

  if (secondsRemaining === null) {
    return null;
  }

  const targetLabel = isFinalRound ? t("game:settlement.countdownFinalArchive", "Final Archive") : t("game:settlement.countdownNextRound", "Next Round");
  const message = secondsRemaining > 0
    ? t("game:settlement.countdownInSeconds", { seconds: secondsRemaining, target: targetLabel })
    : t("game:settlement.countdownEntering", { target: targetLabel });

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

function formatSettlementAllocationRatio(ratio: SettlementPlayerPhaseWorkspace["nextRatio"]): string {
  return `${formatRatioNumber(ratio.domesticMarket)} / ${formatRatioNumber(ratio.factory)} / ${formatRatioNumber(ratio.governmentFiscal)}`;
}

function formatRatioNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
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
  const { t } = useTranslation();

  const confirmPrefix = `${t("game:military.confirmAction", { label: "" })}`.replace(": ", "");
  const revokePrefix = `${t("game:military.revokeAction", { label: "" })}`.replace(": ", "");

  return (
    <article className="gp-toggle">
      <div className="gp-toggle__header">
        <strong>{title ?? confirmLabel.replace(confirmPrefix, "")}</strong>
        <span className={count > 0 ? "gp-toggle__hint gp-toggle__hint--active" : "gp-toggle__hint gp-toggle__hint--inactive"}>
          {t("common:decision.scheduled", { count })}
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
          {t("common:confirm")}
        </button>
        <button
          aria-label={confirmLabel.replace(confirmPrefix, revokePrefix)}
          className="gp-btn"
          disabled={isRevokeDisabled}
          onClick={onRevoke}
          type="button"
        >
          {t("common:revoke")}
        </button>
      </div>
    </article>
  );
}

const REFORM_PATH_LABELS: Record<"freedom" | "equality" | "national", string> = {
  freedom: i18n.t("game:government.reformPath.freedom", "自由"),
  equality: i18n.t("game:government.reformPath.equality", "平等"),
  national: i18n.t("game:government.reformPath.national", "民族"),
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
          <p className="gp-step-eyebrow">{i18n.t("game:government.reformAndPolicy", "改革与政策")}</p>
          <h3 style={{ margin: "4px 0 0" }}>{i18n.t("game:government.reformAndPolicyTitle", "政府改革 / 常规政策")}</h3>
          <p className="gp-step-desc" style={{ marginTop: 6 }}>
            {i18n.t("game:government.reformAndPolicyDesc", "实施改革会沿三条路径推进国家定型；常规政策消耗本回合行政力与预算。")}
          </p>
        </div>
        <div className="gp-step-header__pills">
          <span className="gp-step-pill">{i18n.t("game:government.adminCapacityLabel", "行政力")} <strong>{reforms.administrationCapacity}</strong></span>
          <span className="gp-step-pill">{i18n.t("game:government.remainingThisRoundLabel", "本轮剩余")} <strong>{remainingCapacity}</strong></span>
          <span className="gp-step-pill">{i18n.t("game:government.reformQueueLabel", "改革排队")} <strong>{queuedReformIds.size}</strong></span>
          <span className="gp-step-pill">{i18n.t("game:government.policyChangeLabel", "政策变更")} <strong>{queuedActivateIds.size + queuedDeactivateIds.size}</strong></span>
        </div>
      </div>

      {reforms.availableReforms.length > 0 ? (
        <details open className="gp-card" style={{ marginTop: 12 }}>
          <summary className="gp-collapse">
            {i18n.t("game:government.reformOptions", "改革选项")} <span className="gp-collapse__hint">{i18n.t("game:government.reformOptionsHint", "推进自由 / 平等 / 民族路径")}</span>
          </summary>
          <div className="gp-grid" style={{ marginTop: 14 }}>
            {reforms.availableReforms.map((reform) => {
              const queued = queuedReformIds.has(reform.reformId);
              const overCapacity = !queued && remainingCapacity < reform.adminCost;
              const isDisabled = reform.isCompleted || reform.isBlocked || (overCapacity && !queued);
              const status = reform.isCompleted
                ? i18n.t("game:government.statusImplemented", "已实施")
                : reform.isBlocked
                  ? i18n.t("game:government.statusBlocked", "已封锁")
                  : queued
                    ? i18n.t("game:government.statusQueued", "本轮排入")
                    : overCapacity
                      ? i18n.t("game:government.statusInsufficientCapacity", "行政力不足")
                      : i18n.t("game:government.statusCanImplement", { cost: reform.adminCost, defaultValue: `可实施（行政 ${reform.adminCost}）` });
              return (
                <article key={reform.reformId} className="gp-toggle">
                  <div className="gp-toggle__header">
                    <strong>{translateBackend(reform.label)}</strong>
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
                  <span className="gp-toggle__desc">{i18n.t("game:government.adminCostConsumed", { cost: reform.adminCost, defaultValue: `消耗 ${reform.adminCost} 行政力。` })}</span>
                  {queued ? (
                    <span className="gp-input-card__feedback">{i18n.t("game:government.queuedForSubmit", { label: reform.label, defaultValue: `已排入本轮，提交后将进入"${translateBackend(reform.label)}"。` })}</span>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span className="gp-toggle__hint">{status}</span>
                    <button
                      aria-label={i18n.t("game:government.ariaEnactReform", { label: reform.label, defaultValue: `实施改革：${translateBackend(reform.label)}` })}
                      className={queued ? "gp-btn gp-btn--primary" : "gp-btn"}
                      disabled={isDisabled}
                      onClick={() => handleEnactReform(reform.reformId)}
                      type="button"
                    >
                      {reform.isCompleted ? i18n.t("game:government.btnImplemented", "已实施") : reform.isBlocked ? i18n.t("game:government.btnBlocked", "已封锁") : queued ? i18n.t("game:government.btnRevoke", "撤回") : i18n.t("game:government.btnImplement", "实施")}
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
            {i18n.t("game:government.activePolicies", "已生效政策")} <span className="gp-collapse__hint">{i18n.t("game:government.activePoliciesHint", "本轮可标记停用，下回合不再生效")}</span>
          </summary>
          <div className="gp-grid" style={{ marginTop: 14 }}>
            {activePolicies.map((policy) => {
              const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
              return (
                <article key={policy.policyId} className="gp-toggle">
                  <div className="gp-toggle__header">
                    <strong>{translateBackend(policy.label)}</strong>
                    <span
                      className={
                        active
                          ? "gp-toggle__hint gp-toggle__hint--active"
                          : "gp-toggle__hint gp-toggle__hint--inactive"
                      }
                    >
                      {active ? i18n.t("game:government.statusActive", "本轮已选") : i18n.t("game:government.statusDeactivatedThisRound", "本轮停用")}
                    </span>
                  </div>
                  <span className="gp-toggle__desc">{translateBackend(policy.description)}</span>
                  <span className="gp-toggle__desc">
                    {i18n.t("game:government.perTurnAdminAndBudget", { admin: policy.adminCostPerTurn, budget: policy.budgetCost, defaultValue: `行政力 ${policy.adminCostPerTurn} · 预算 ${policy.budgetCost}` })}
                  </span>
                  {!active ? (
                    <span className="gp-input-card__feedback">{i18n.t("game:government.queuedForDeactivation", "已排入本轮停用。")}</span>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button
                      aria-label={active ? i18n.t("game:government.ariaDeactivatePolicy", { label: policy.label, defaultValue: `停用政策：${translateBackend(policy.label)}` }) : i18n.t("game:government.ariaUndoDeactivate", { label: policy.label, defaultValue: `撤回停用：${translateBackend(policy.label)}` })}
                      className={active ? "gp-btn" : "gp-btn gp-btn--primary"}
                      onClick={() => handleTogglePolicy(policy.policyId, !active)}
                      type="button"
                    >
                      {active ? i18n.t("game:government.btnDeactivate", "停用") : i18n.t("game:government.btnUndoDeactivate", "撤回停用")}
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
            {i18n.t("game:government.activatablePolicies", "可激活政策")} <span className="gp-collapse__hint">{i18n.t("game:government.activatablePoliciesHint", "消耗本回合行政力与预算")}</span>
          </summary>
          <div className="gp-grid" style={{ marginTop: 14 }}>
            {inactivePolicies.map((policy) => {
              const active = isPolicyActiveAfter(policy.policyId, policy.isActive);
              const lockedReason = !policy.isUnlocked
                ? policy.requiresReform
                  ? i18n.t("game:government.requiresReform", { reform: getReformLabel(policy.requiresReform), defaultValue: `需改革：${getReformLabel(policy.requiresReform)}` })
                  : i18n.t("game:government.notUnlocked", "未解锁")
                : null;
              const isDisabled = lockedReason !== null && !active;
              const hintText = active
                ? i18n.t("game:government.activatedThisRound", "本轮激活")
                : lockedReason ?? i18n.t("game:government.perTurnAdminAndBudget", { admin: policy.adminCostPerTurn, budget: policy.budgetCost, defaultValue: `行政力 ${policy.adminCostPerTurn} · 预算 ${policy.budgetCost}` });
              return (
                <article key={policy.policyId} className="gp-toggle">
                  <div className="gp-toggle__header">
                    <strong>{translateBackend(policy.label)}</strong>
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
                  <span className="gp-toggle__desc">{translateBackend(policy.description)}</span>
                  <span className="gp-toggle__desc">
                    {i18n.t("game:government.perTurnAdminAndBudget", { admin: policy.adminCostPerTurn, budget: policy.budgetCost, defaultValue: `行政力 ${policy.adminCostPerTurn} · 预算 ${policy.budgetCost}` })}
                  </span>
                  {active ? <span className="gp-input-card__feedback">{i18n.t("game:government.queuedForActivation", "已排入本轮激活。")}</span> : null}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button
                      aria-label={i18n.t("game:government.ariaActivatePolicy", { label: policy.label, defaultValue: `激活政策：${translateBackend(policy.label)}` })}
                      className={active ? "gp-btn gp-btn--primary" : "gp-btn"}
                      disabled={isDisabled}
                      onClick={() => handleTogglePolicy(policy.policyId, !active)}
                      type="button"
                    >
                      {active ? i18n.t("game:government.btnUndoActivate", "撤回激活") : i18n.t("game:government.btnActivate", "激活")}
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


function clampMarketQuantity(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
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
