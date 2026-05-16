import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../../i18n";
import type { DecisionPlayerPhaseWorkspace, FactoryExpansionOption, FactoryNewFactoryOption, FactoryUpgradeOption } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import {
  getProductionOrderQuantity,
  getRouteOrderQuantity,
} from "../../../../features/game/decisionDrafts";
import {
  buildEffectMetrics,
  calculatePhase1ProductionSpend,
  calculateTechResearchPreview,
  flattenTechTree,
} from "../../../../features/game/decisionShared";
import { Phase1ProductionPanel } from "./Phase1ProductionPanel";
import "./FactoryPanel.css";

export function FactoryPanel({
  workspace,
  draft,
  remainingFactoryBudget,
  onProductionQuantityChange,
  onConstructionQuantityChange,
  onFactoryActionToggle,
  onTechnologyToggle,
  onPhase1RawMaterialAssignmentChange,
}: {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingFactoryBudget: number;
  onProductionQuantityChange: (goodsId: string, quantity: number) => void;
  onConstructionQuantityChange: (
    routeId: string,
    kind: "expansion" | "upgrade" | "newFactory",
    quantity: number,
  ) => void;
  onFactoryActionToggle: (actionId: string, checked: boolean) => void;
  onTechnologyToggle: (techId: string, checked: boolean) => void;
  onPhase1RawMaterialAssignmentChange?: (mode: string, quantity: number) => void;
}) {
  const { t } = useTranslation();
  const techPreview = calculateTechResearchPreview(workspace, draft);
  const phase1Economy = workspace.phase1Economy;
  const factoryActions = (workspace.factoryActions ?? []).filter(
    (action) => Number(action.effects?.techPointsDelta ?? 0) === 0,
  );
  const selectedFactoryActionIds = new Set((draft.factoryPlan.factoryActions ?? []).map((item) => item.actionId));
  const rawMaterialsDelta = sumSelectedFactoryActionEffect(factoryActions, selectedFactoryActionIds, "rawMaterialsDelta");
  const productionCapacityDelta = sumSelectedFactoryActionEffect(
    factoryActions,
    selectedFactoryActionIds,
    "phase1ProductionRawCapacityDelta",
  );
  const outputMultiplier = factoryActions.reduce((value, action) => {
    if (!selectedFactoryActionIds.has(action.actionId)) {
      return value;
    }
    const multiplier = action.effects?.productionOutputMultiplier;
    return typeof multiplier === "number" && multiplier > 1 ? value * multiplier : value;
  }, 1);
  const phase1Assignments = draft.phase1Production?.rawMaterialAssignments ?? {};
  const phase1ProductionSpend = calculatePhase1ProductionSpend(workspace, draft);

  const hasConstructionOptions =
    workspace.expansionOptions.length > 0 ||
    workspace.upgradeOptions.length > 0 ||
    workspace.newFactoryOptions.length > 0;
  const hasFactoryActions = factoryActions.length > 0;

  return (
    <section className="factory-panel" data-testid="factory-panel">
      <div className="factory-panel__header">
        <h3 className="factory-panel__title">🏭 {t("game:factory.title")}</h3>
      </div>

      <div className="factory-panel--v2">
        <div className="factory-panel--v2__left">
          {phase1Economy && phase1Economy.productionModes && phase1Economy.productionModes.length > 0 ? (
              <Phase1ProductionPanel
                modes={phase1Economy.productionModes}
                rawMaterials={Math.max(0, phase1Economy.rawMaterials + rawMaterialsDelta)}
                factoryBudget={Math.max(0, remainingFactoryBudget + phase1ProductionSpend)}
                domesticDemand={phase1Economy.domesticDemand}
                equilibriumPrice={phase1Economy.equilibriumPrice}
              domesticPricePreview={phase1Economy.domesticPricePreview}
              goodsInventory={phase1Economy.goodsInventory}
              assignments={phase1Assignments}
              productionCapacityDelta={productionCapacityDelta}
              outputMultiplier={outputMultiplier}
              onAssignmentChange={onPhase1RawMaterialAssignmentChange}
            />
          ) : null}
        </div>

        <div className="factory-panel--v2__right">
          {hasFactoryActions && (
            <div className="factory-panel__section">
              <h4 className="factory-section-label">
                <span className="factory-section-label__icon">⚙️</span>
                {t("game:factory.factoryDispatch")}
              </h4>
              <div className="factory-command-list">
                {factoryActions.map((action) => {
                  const selected = selectedFactoryActionIds.has(action.actionId);
                  const isLocked = action.lockedReason !== null;
                  const noBudget = !selected && remainingFactoryBudget < action.cost;
                  const disabled = isLocked || noBudget;
                  const effects = buildEffectMetrics(action.effects);
                  return (
                    <article
                      key={action.actionId}
                      className={[
                        "factory-command-row",
                        selected && "factory-command-row--selected",
                        disabled && !selected && "factory-command-row--disabled",
                      ].filter(Boolean).join(" ")}
                    >
                      <div className="factory-command-row__main">
                        <div className="factory-command-row__title-line">
                          <h5>{translateBackend(action.label)}</h5>
                          <span>{action.cost > 0 ? `${action.cost} ${t("game:factory.factoryBudget")}` : t("game:factory.noCost")}</span>
                        </div>
                        <p>{isLocked ? `${t("common:decision.lockedBy", { reason: translateBackend(action.lockedReason) })}` : translateBackend(action.description)}</p>
                        {renderEffectTags(effects)}
                      </div>
                      <div className="factory-command-row__control">
                        <span>{selected ? t("game:factory.selectedForExecution") : noBudget ? t("game:factory.budgetInsufficient") : isLocked ? t("game:factory.notUnlocked") : t("game:factory.available")}</span>
                        <button
                          type="button"
                          disabled={disabled && !selected}
                          onClick={() => onFactoryActionToggle(action.actionId, !selected)}
                          aria-label={`${selected ? t("common:revoke") : t("common:select")}${t("game:factory.factoryDispatch")}：${action.label}`}
                        >
                          {selected ? t("common:revoke") : t("common:select")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {hasConstructionOptions && (
            <div className="factory-panel__section">
              <h4 className="factory-section-label">
                <span className="factory-section-label__icon">🏗️</span>
                {t("game:factory.constructionAndUpgrade")}
              </h4>
              <div className="factory-command-list">
                {workspace.expansionOptions.map((option) =>
                  renderConstructionCard(option, "expansion"),
                )}
                {workspace.upgradeOptions.map((option) =>
                  renderConstructionCard(option, "upgrade"),
                )}
                {workspace.newFactoryOptions.map((option) =>
                  renderConstructionCard(option, "newFactory"),
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  function renderConstructionCard(
    option: FactoryExpansionOption | FactoryUpgradeOption | FactoryNewFactoryOption,
    kind: "expansion" | "upgrade" | "newFactory",
  ) {
    const quantity = getConstructionQuantity(draft, option.routeId, kind);
    const isLocked = option.lockedReason !== null;
    const atMax = quantity >= option.maxQuantity;
    const noBudget = remainingFactoryBudget < option.unitBudgetCost;
    const canAdd = !isLocked && !atMax && !noBudget;
    const canRemove = quantity > 0;
    const title = getConstructionTitle(option, kind);

    const description = isLocked
      ? `🔒 ${translateBackend(option.lockedReason)}`
      : option.maxQuantity < 999
        ? `${i18n.t("common:max")} ${option.maxQuantity} ${i18n.t("game:times")}`
        : undefined;
    const effects = isLocked
      ? undefined
      : [{ label: `${t("game:factory.capacityLimit")} +${option.capacityDelta}`, value: "" }];
    return (
      <article
        key={`${kind}-${option.routeId}`}
        className={[
          "factory-command-row",
          "factory-command-row--construction",
          quantity > 0 && "factory-command-row--selected",
          isLocked && "factory-command-row--disabled",
        ].filter(Boolean).join(" ")}
      >
        <div className="factory-command-row__main">
          <div className="factory-command-row__title-line">
            <h5>{title}</h5>
            <span>{option.unitBudgetCost} {t("game:factory.factoryBudget")}</span>
          </div>
          <p>{description ?? `${getConstructionKindLabel(kind)}${t("game:factory.constructionLine")}`}</p>
          {renderEffectTags(effects)}
        </div>
        <div className="factory-command-row__stepper">
          <button
            type="button"
            disabled={!canRemove}
            onClick={() => onConstructionQuantityChange(option.routeId, kind, Math.max(0, quantity - 1))}
            aria-label={`${title} ${t("common:decrease")}`}
          >
            −
          </button>
          <strong>{quantity}</strong>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => onConstructionQuantityChange(option.routeId, kind, Math.min(option.maxQuantity, quantity + 1))}
            aria-label={`${title} ${t("common:increase")}`}
          >
            +
          </button>
          <span>{quantity > 0 ? t("game:factory.selectedCount", { count: quantity }) : noBudget ? t("game:factory.budgetInsufficient") : isLocked ? t("game:factory.notUnlocked") : t("game:factory.canBuild")}</span>
        </div>
      </article>
    );
  }
}

function renderEffectTags(effects: { label: string; value: string | number; temporary?: boolean }[] | undefined) {
  if (!effects || effects.length === 0) {
    return null;
  }
  return (
    <div className="factory-command-row__effects">
      {effects.map((effect) => (
        <span key={`${effect.label}-${effect.value}`}>
          {effect.value ? `${translateBackend(effect.label)} ${effect.value}` : translateBackend(effect.label)}
        </span>
      ))}
    </div>
  );
}

/* ── Helpers (kept for external use) ── */

export function resolveRouteLockedReason(
  routeId: string,
  lockedReason: string | null,
  workspace: DecisionPlayerPhaseWorkspace,
  unlockedTechIds: Set<string>,
): string | null {
  if (!lockedReason) {
    return null;
  }
  const unlockedByResearch = flattenTechTree(workspace.techTree).some(
    (tech) => unlockedTechIds.has(tech.techId) && (tech.unlocksRoutes ?? []).includes(routeId),
  );
  return unlockedByResearch ? null : lockedReason;
}

export function getConstructionQuantity(
  draft: PhaseDraftByPhase["decision"],
  routeId: string,
  kind: "expansion" | "upgrade" | "newFactory",
): number {
  if (kind === "expansion") {
    return getRouteOrderQuantity(draft.factoryPlan.expansionOrders, routeId);
  }
  if (kind === "upgrade") {
    return getRouteOrderQuantity(draft.factoryPlan.upgradeOrders, routeId);
  }
  return getRouteOrderQuantity(draft.factoryPlan.newFactoryOrders, routeId);
}

export function getConstructionTitle(
  option: FactoryExpansionOption | FactoryUpgradeOption | FactoryNewFactoryOption,
  kind: "expansion" | "upgrade" | "newFactory",
): string {
  if (kind === "expansion") {
    return i18n.t("game:factory.expandAction", { label: translateBackend(option.routeLabel) });
  }
  if (kind === "upgrade") {
    return i18n.t("game:factory.upgradeAction", { label: translateBackend(option.routeLabel) });
  }
  return i18n.t("game:factory.newFactoryAction", { label: translateBackend(option.routeLabel) });
}

export function getConstructionKindLabel(kind: "expansion" | "upgrade" | "newFactory"): string {
  switch (kind) {
    case "expansion": return i18n.t("game:factory.expandLabel");
    case "upgrade": return i18n.t("game:factory.upgradeLabel");
    case "newFactory": return i18n.t("game:factory.newFactoryLabel");
    default: return kind;
  }
}

function sumSelectedFactoryActionEffect(
  actions: NonNullable<DecisionPlayerPhaseWorkspace["factoryActions"]>,
  selectedActionIds: Set<string>,
  effectKey: string,
): number {
  return actions.reduce((sum, action) => {
    if (!selectedActionIds.has(action.actionId)) {
      return sum;
    }
    const value = action.effects?.[effectKey];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}
