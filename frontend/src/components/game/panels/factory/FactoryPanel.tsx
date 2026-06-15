import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n, { translateBackend } from "../../../../i18n";
import type { DecisionPlayerPhaseWorkspace, FactoryExpansionOption, FactoryNewFactoryOption, FactoryUpgradeOption, Phase1ProductionMode } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import type { ParameterInspector } from "../../../../features/game/parameterInspector";
import {
  getRouteOrderQuantity,
} from "../../../../features/game/decisionDrafts";
import { getTechnologyLabel } from "../../../../features/game/panelGlossary";
import {
  buildEffectMetrics,
  calculatePhase1ProductionSpend,
  calculateTechResearchPreview,
  flattenTechTree,
  getSelectedRawMaterialPurchaseQuantity,
  getSelectedProductionCapacityDeltaByMode,
  sumSelectedFactoryActionEffect,
} from "../../../../features/game/decisionShared";
import { Phase1ProductionPanel } from "./Phase1ProductionPanel";
import "./FactoryPanel.css";

type ConstructionKind = "expansion" | "upgrade" | "newFactory";
type ConstructionOption = FactoryExpansionOption | FactoryUpgradeOption | FactoryNewFactoryOption;

const PRODUCTION_STAGE_ORDER = ["handicraft", "mechanized", "steam", "electrified"];

export function FactoryPanel({
  workspace,
  draft,
  remainingFactoryBudget,
  onProductionQuantityChange,
  onConstructionQuantityChange,
  onFactoryActionToggle,
  onTechnologyToggle,
  onPhase1RawMaterialAssignmentChange,
  onRawMaterialPurchaseQuantityChange,
  parameterInspector,
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
  onRawMaterialPurchaseQuantityChange?: (quantity: number) => void;
  parameterInspector?: ParameterInspector;
}) {
  const { t } = useTranslation();
  const techPreview = calculateTechResearchPreview(workspace, draft);
  const phase1Economy = workspace.phase1Economy;
  const factoryActions = (workspace.factoryActions ?? []).filter(
    (action) => action.actionId !== "industrial_upgrade"
      && action.actionId !== "factory_raw_procurement"
      && Number(action.effects?.techPointsDelta ?? 0) === 0,
  );
  const selectedFactoryActionIds = new Set((draft.factoryPlan.factoryActions ?? []).map((item) => item.actionId));
  const selectedRawMaterialPurchase = getSelectedRawMaterialPurchaseQuantity(workspace, draft);
  const rawMaterialsDelta = sumSelectedFactoryActionEffect(workspace, draft, "rawMaterialsDelta")
    + selectedRawMaterialPurchase;
  const productionCapacityDelta = sumSelectedFactoryActionEffect(
    workspace,
    draft,
    "phase1ProductionRawCapacityDelta",
  );
  const capacityDeltaByMode = getSelectedProductionCapacityDeltaByMode(workspace, draft);
  const productionModes = phase1Economy
    ? applyCapacityDeltasToProductionModes(phase1Economy.productionModes, capacityDeltaByMode)
    : [];
  const domesticDemand = phase1Economy
    ? phase1Economy.domesticDemand + calculateDomesticDemandDelta(phase1Economy.productionModes, capacityDeltaByMode)
    : 0;
  const outputMultiplier = factoryActions.reduce((value, action) => {
    if (!selectedFactoryActionIds.has(action.actionId)) {
      return value;
    }
    const multiplier = action.effects?.productionOutputMultiplier;
    return typeof multiplier === "number" && multiplier > 1 ? value * multiplier : value;
  }, 1);
  const phase1Assignments = draft.phase1Production?.rawMaterialAssignments ?? {};
  const phase1ProductionSpend = calculatePhase1ProductionSpend(workspace, draft);
  const rawMaterialPurchaseUnitCost = Math.max(0, phase1Economy?.rawMaterialPurchaseUnitCost ?? 1);
  const rawMaterialPurchaseCap = Math.max(0, phase1Economy?.materialPurchaseCapPerTurn ?? 0);
  const rawMaterialPurchaseMaxByBudget = rawMaterialPurchaseUnitCost > 0
    ? selectedRawMaterialPurchase + Math.floor(Math.max(0, remainingFactoryBudget) / rawMaterialPurchaseUnitCost)
    : rawMaterialPurchaseCap;
  const maxRawMaterialPurchase = Math.min(rawMaterialPurchaseCap, rawMaterialPurchaseMaxByBudget);

  const expansionOptionsByRoute = new Map(workspace.expansionOptions.map((option) => [option.routeId, option]));
  const upgradeOptionsByRoute = new Map(workspace.upgradeOptions.map((option) => [option.routeId, option]));
  const constructionStages = [...(phase1Economy?.productionModes ?? [])]
    .filter((mode) => mode.mode !== "idle")
    .sort((a, b) => getStageOrder(a.mode) - getStageOrder(b.mode));
  const hasConstructionStages = constructionStages.length > 0;
  const hasFactoryActions = factoryActions.length > 0;

  const renderConstructionControl = (
    option: ConstructionOption | null,
    kind: ConstructionKind,
    title: string,
    description: string,
    noOptionReason: string,
    routeId: string,
  ) => {
    const inspectorKey = `factory.construction.${kind}.${routeId}`;
    if (!option) {
      return (
        <article className="factory-stage-action factory-stage-action--disabled">
          <div>
            <strong>{title}</strong>
            <span>{description || noOptionReason}</span>
          </div>
          <div className="factory-command-row__stepper">
            <button type="button" disabled aria-label={title}>-</button>
            <strong>0</strong>
            <button type="button" disabled aria-label={title}>+</button>
          </div>
          {parameterInspector?.render(inspectorKey, {
            title,
            currentEffect: description || noOptionReason,
          })}
        </article>
      );
    }

    const quantity = getConstructionQuantity(draft, option.routeId, kind);
    const maxQuantity = Math.max(quantity, option.maxQuantity);
    const noBudget = quantity < maxQuantity && remainingFactoryBudget < option.unitBudgetCost;
    const lockedReason = option.lockedReason ? translateBackend(option.lockedReason) : null;
    const disabled = lockedReason !== null || noBudget;
    const costText = i18n.t("game:factory.costPerOrder", "{{cost}} Factory Budget/order", { cost: option.unitBudgetCost });
    const status = quantity > 0
      ? i18n.t("game:factory.plannedCount", "{{count}} planned", { count: quantity })
      : lockedReason ?? (noBudget ? t("game:factory.budgetInsufficient") : t("game:factory.available"));

    return (
      <article
        className={[
          "factory-stage-action",
          quantity > 0 && "factory-stage-action--selected",
          disabled && quantity === 0 && "factory-stage-action--disabled",
        ].filter(Boolean).join(" ")}
      >
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
          <em>{costText}</em>
        </div>
        <div className="factory-command-row__stepper">
          <span>{status}</span>
          <button
            type="button"
            disabled={quantity <= 0}
            onClick={() => onConstructionQuantityChange(option.routeId, kind, quantity - 1)}
            aria-label={formatFactoryAriaLabel(t("common:revoke"), title, translateBackend(option.routeLabel))}
          >
            -
          </button>
          <strong>{quantity}</strong>
          <button
            type="button"
            disabled={disabled || quantity >= maxQuantity}
            onClick={() => onConstructionQuantityChange(option.routeId, kind, quantity + 1)}
            aria-label={formatFactoryAriaLabel(t("common:select"), title, translateBackend(option.routeLabel))}
          >
            +
          </button>
        </div>
        {parameterInspector?.render(inspectorKey, {
          title,
          currentEffect: description,
        })}
      </article>
    );
  };

  return (
    <section className="factory-panel" data-testid="factory-panel">
      <div className="factory-panel__header">
        <h3 className="factory-panel__title">🏭 {t("game:factory.title")}</h3>
      </div>

      <div className="factory-panel--v2">
        <div className="factory-panel--v2__left">
          {phase1Economy && phase1Economy.productionModes && phase1Economy.productionModes.length > 0 ? (
            <>
              <FactoryCapacityOverview
                enabledCount={Math.max(0, (phase1Economy.factoryEnabledCount ?? 0) - Math.min(0, capacityDeltaByMode.idle ?? 0))}
                totalCap={phase1Economy.factoryTotalCap ?? 0}
                idleCapacity={Math.max(0, (phase1Economy.idleCapacity ?? 0) + (capacityDeltaByMode.idle ?? 0))}
                modes={productionModes}
              />
              <RawMaterialPurchaseControl
                currentRawMaterials={phase1Economy.rawMaterials}
                maxQuantity={maxRawMaterialPurchase}
                quantity={selectedRawMaterialPurchase}
                unitCost={rawMaterialPurchaseUnitCost}
                onChange={onRawMaterialPurchaseQuantityChange}
                parameterInspector={parameterInspector}
              />
              <Phase1ProductionPanel
                modes={productionModes}
                rawMaterials={Math.max(0, phase1Economy.rawMaterials + rawMaterialsDelta)}
                factoryBudget={Math.max(0, remainingFactoryBudget + phase1ProductionSpend)}
                factoryBudgetRemaining={Math.max(0, remainingFactoryBudget)}
                factoryBudgetTotal={Math.max(0, workspace.budgetPools.factory)}
                domesticDemand={domesticDemand}
                equilibriumPrice={phase1Economy.equilibriumPrice}
              domesticPricePreview={phase1Economy.domesticPricePreview}
              goodsInventory={phase1Economy.goodsInventory}
              assignments={phase1Assignments}
              productionCapacityDelta={productionCapacityDelta}
                outputMultiplier={outputMultiplier}
                onAssignmentChange={onPhase1RawMaterialAssignmentChange}
              />
            </>
          ) : null}
        </div>

        <div className="factory-panel--v2__right">
          {hasConstructionStages && (
            <div className="factory-panel__section factory-panel__section--stages">
              <h4 className="factory-section-label">
                <span className="factory-section-label__icon">🏗️</span>
                {t("game:factory.industrialDevelopment", "Industrial Development")}
              </h4>
              <div className="factory-stage-grid">
                {constructionStages.map((mode) => {
                  const expansionOption = expansionOptionsByRoute.get(mode.mode) ?? null;
                  const increaseOption = expansionOption;
                  const increaseKind: ConstructionKind = "expansion";
                  const upgradeOption = upgradeOptionsByRoute.get(mode.mode) ?? null;
                  const immediateDelta = capacityDeltaByMode[mode.mode] ?? 0;
                  const sameRoundDelta = immediateDelta;
                  const increaseDescription = increaseOption
                    ? buildFactoryIncreaseDescription(increaseOption, increaseKind, t)
                    : buildUnavailableFactoryIncreaseDescription(mode, t);
                  const upgradeDescription = upgradeOption
                    ? buildIndustryUpgradeDescription(upgradeOption, t)
                    : buildUnavailableIndustryUpgradeDescription(mode, constructionStages, t);

                  return (
                    <article
                      key={mode.mode}
                      className={[
                        "factory-stage-card",
                        !mode.isAvailable && "factory-stage-card--locked",
                      ].filter(Boolean).join(" ")}
                    >
                      <div className="factory-stage-card__header">
                        <div>
                          <h5>{translateBackend(mode.label)}</h5>
                          <p>{getStageAvailabilityText(mode, t)}</p>
                        </div>
                        <span>{t(`game:factory.modeHints.${mode.mode}`, mode.mode)}</span>
                      </div>
                      <div className="factory-stage-card__metrics">
                        <span>
                          {t("game:factory.currentCapacity", "Current Capacity")}
                          <strong>{formatCapacityPreview(mode.currentCapacity, immediateDelta)}</strong>
                        </span>
                        <span>
                          {t("game:factory.outputRatio", "Output Ratio")}
                          <strong>x{mode.outputRatio}</strong>
                        </span>
                        <span>
                          {t("game:factory.sameRoundCapacityDelta", "This-Round Capacity")}
                          <strong>{formatSignedNumber(sameRoundDelta)}</strong>
                        </span>
                      </div>
                      <div className="factory-stage-card__actions">
                        {renderConstructionControl(
                          increaseOption,
                          increaseKind,
                          t("game:factory.factoryIncrease", "Factory Increase"),
                          increaseDescription,
                          t("game:factory.noFactoryIncreasePath", "No factory increase path is currently available for this stage."),
                          mode.mode,
                        )}
                        {renderConstructionControl(
                          upgradeOption,
                          "upgrade",
                          t("game:factory.industryUpgrade", "Industry Upgrade"),
                          upgradeDescription,
                          mode.mode === "handicraft"
                            ? t("game:factory.baseStageNoUpgrade", "The base stage does not need an upgrade.")
                            : t("game:factory.noUpgradePath", "No upgrade path is currently available."),
                          mode.mode,
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
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
                          aria-label={formatFactoryAriaLabel(
                            selected ? t("common:revoke") : t("common:select"),
                            t("game:factory.factoryDispatch"),
                            translateBackend(action.label),
                          )}
                        >
                          {selected ? t("common:revoke") : t("common:select")}
                        </button>
                      </div>
                      {parameterInspector?.render(`factory.action.${action.actionId}`, {
                        title: translateBackend(action.label),
                        currentEffect: translateBackend(action.description) ?? undefined,
                      })}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function applyCapacityDeltasToProductionModes(
  modes: Phase1ProductionMode[],
  capacityDeltaByMode: Record<string, number>,
): Phase1ProductionMode[] {
  return modes.map((mode) => {
    const delta = capacityDeltaByMode[mode.mode] ?? 0;
    if (delta === 0) {
      return mode;
    }
    return {
      ...mode,
      currentCapacity: Math.max(0, mode.currentCapacity + delta),
    };
  });
}

function FactoryCapacityOverview({
  enabledCount,
  totalCap,
  idleCapacity,
  modes,
}: {
  enabledCount: number;
  totalCap: number;
  idleCapacity: number;
  modes: Phase1ProductionMode[];
}) {
  const { t } = useTranslation();
  const productiveModes = modes.filter((mode) => mode.mode !== "idle");
  return (
    <section className="factory-overview" aria-label={t("game:factory.capacityOverview", "Factory Capacity Overview")}>
      <div className="factory-overview__headline">
        <span>{t("game:factory.factoryTotalCap", "Enabled / Total Cap")}</span>
        <strong>{enabledCount} / {totalCap}</strong>
      </div>
      <div className="factory-overview__chips">
        <span>{t("game:factory.idleCapacity", "Idle Factories")} <strong>{idleCapacity}</strong></span>
        {productiveModes.map((mode) => (
          <span key={mode.mode}>
            {translateBackend(mode.label)} <strong>{mode.currentCapacity}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function RawMaterialPurchaseControl({
  currentRawMaterials,
  maxQuantity,
  quantity,
  unitCost,
  onChange,
  parameterInspector,
}: {
  currentRawMaterials: number;
  maxQuantity: number;
  quantity: number;
  unitCost: number;
  onChange?: (quantity: number) => void;
  parameterInspector?: ParameterInspector;
}) {
  const { t } = useTranslation();
  const disabled = !onChange;
  const nextRawMaterials = currentRawMaterials + quantity;
  return (
    <section className="factory-material-purchase">
      <div className="factory-material-purchase__main">
        <div>
          <h4>{t("game:factory.materialPurchase", "Material Purchase")}</h4>
          <p>
            {t("game:factory.materialPurchaseDesc", "Use Factory Budget to buy raw materials available this round without changing natural per-round growth.")}
          </p>
        </div>
        <div className="factory-material-purchase__metrics">
          <span>{t("game:factory.rawMaterials", "Raw Materials")} <strong>{currentRawMaterials} → {nextRawMaterials}</strong></span>
          <span>{t("game:factory.purchaseCap", "Round Cap")} <strong>{maxQuantity}</strong></span>
          <span>{t("game:factory.unitCost", "Unit Cost")} <strong>{unitCost}</strong></span>
        </div>
      </div>
      <div className="factory-command-row__stepper factory-material-purchase__stepper">
        <span>{quantity > 0 ? t("game:factory.plannedPurchase", "{{count}} purchased", { count: quantity }) : t("game:factory.available", "Available")}</span>
        <button
          type="button"
          disabled={disabled || quantity <= 0}
          onClick={() => onChange?.(quantity - 1)}
          aria-label={t("game:factory.decreaseMaterialPurchase", "Decrease material purchase")}
        >
          -
        </button>
        <strong>{quantity}</strong>
        <button
          type="button"
          disabled={disabled || quantity >= maxQuantity}
          onClick={() => onChange?.(quantity + 1)}
          aria-label={t("game:factory.increaseMaterialPurchase", "Increase material purchase")}
        >
          +
        </button>
      </div>
      {parameterInspector?.render("factory.rawMaterialPurchase", {
        title: t("game:factory.materialPurchase", "Material Purchase"),
        currentEffect: t("game:factory.materialPurchaseEffect", "Each raw material purchased immediately increases this round's available inputs and spends Factory Budget."),
      })}
    </section>
  );
}

function calculateDomesticDemandDelta(
  modes: Phase1ProductionMode[],
  capacityDeltaByMode: Record<string, number>,
): number {
  return modes.reduce((sum, mode) => {
    const delta = capacityDeltaByMode[mode.mode] ?? 0;
    return sum + delta * mode.demandCoefficient;
  }, 0);
}

function getStageOrder(mode: string): number {
  const index = PRODUCTION_STAGE_ORDER.indexOf(mode);
  return index === -1 ? PRODUCTION_STAGE_ORDER.length : index;
}

function getStageAvailabilityText(mode: Phase1ProductionMode, t: TFunction): string {
  if (mode.isAvailable) {
    return t("game:factory.stageAvailable", "Unlocked and available for construction.");
  }
  const techLabel = formatRequiredTechLabel(mode.requiredTech) ?? String(t("game:factory.notUnlocked"));
  return t("game:factory.stageLocked", "Requires {{tech}}", { tech: techLabel });
}

function buildFactoryIncreaseDescription(
  option: ConstructionOption,
  kind: ConstructionKind,
  t: TFunction,
): string {
  const key = kind === "newFactory" ? "game:factory.newFactoryIncreaseDescription" : "game:factory.factoryIncreaseDescription";
  const defaultValue = kind === "newFactory"
    ? "Directly build {{target}} factories: add {{delta}} capacity, effective this round; limited by national factory cap, idle slots, budget, and technology prerequisites."
    : "Expand {{target}} factories: add {{delta}} capacity, effective this round; limited by national factory cap, idle slots, budget, and technology prerequisites.";
  return t(key, {
    defaultValue,
    delta: option.capacityDelta,
    target: translateBackend(option.routeLabel),
  });
}

function buildUnavailableFactoryIncreaseDescription(
  mode: Phase1ProductionMode,
  t: TFunction,
): string {
  const target = translateBackend(mode.label);
  const tech = formatRequiredTechLabel(mode.requiredTech);
  if (!mode.isAvailable && tech) {
    return t("game:factory.factoryIncreaseLockedDescription", {
      defaultValue: "Factory Increase = directly build {{target}} factories, effective this round. Prerequisite: unlock {{target}} ({{tech}}) and keep idle slots in the national factory pool.",
      target,
      tech,
    });
  }
  return t("game:factory.factoryIncreaseUnavailableDescription", {
    defaultValue: "Factory Increase = directly build {{target}} factories, effective this round. Currently unavailable because the total cap, idle slots, budget, or technology prerequisite is not met.",
    target,
  });
}

function buildIndustryUpgradeDescription(
  option: FactoryUpgradeOption,
  t: TFunction,
): string {
  const delta = Math.max(1, option.capacityDelta ?? 1);
  const source = translateRouteLabel(option.sourceRouteLabel || option.sourceRouteId);
  const target = translateRouteLabel(option.routeLabel || option.routeId);
  return t("game:factory.industryUpgradeDescription", {
    defaultValue: "{{source}} → {{target}}: each order consumes {{delta}} {{source}} capacity and immediately converts it into {{delta}} {{target}} capacity; production is available this round and total factory count does not increase.",
    delta,
    source,
    target,
  });
}

function buildUnavailableIndustryUpgradeDescription(
  mode: Phase1ProductionMode,
  modes: Phase1ProductionMode[],
  t: TFunction,
): string {
  const target = translateBackend(mode.label);
  const sourceModeId = getUpgradeSourceMode(mode.mode);
  if (!sourceModeId) {
    return t("game:factory.baseStageNoUpgradeDescription", {
      defaultValue: "Industry Upgrade = convert the previous factory tier into this stage. Handicraft requires idle factories before idle capacity can be activated as handicraft.",
    });
  }

  const sourceMode = modes.find((candidate) => candidate.mode === sourceModeId);
  const source = sourceMode ? translateRouteLabel(sourceMode.label || sourceMode.mode) : translateRouteLabel(sourceModeId);
  const tech = formatRequiredTechLabel(mode.requiredTech);
  const prerequisite = tech
    ? t("game:factory.industryUpgradePrerequisiteWithTech", {
      defaultValue: "Unlock {{target}} ({{tech}}) + at least 1 {{source}} capacity",
      target,
      tech,
      source,
    })
    : t("game:factory.industryUpgradePrerequisiteWithoutTech", {
      defaultValue: "At least 1 {{source}} capacity",
      source,
    });

  return t("game:factory.industryUpgradeUnavailableDescription", {
    defaultValue: "Industry Upgrade = {{source}} → {{target}}. Prerequisite: {{prerequisite}}; after execution, consumes 1 {{source}} factory and immediately converts it into 1 {{target}} factory.",
    source,
    target,
    prerequisite,
  });
}

function getUpgradeSourceMode(targetMode: string): string | null {
  const order = ["idle", ...PRODUCTION_STAGE_ORDER];
  const targetIndex = order.indexOf(targetMode);
  if (targetIndex <= 0) {
    return null;
  }
  return order[targetIndex - 1] ?? null;
}

function translateRouteLabel(labelOrId: string | undefined | null): string {
  if (!labelOrId) {
    return "";
  }
  if (/^[a-z_]+$/.test(labelOrId)) {
    return i18n.t(`game:productionRoute.${labelOrId}`, labelOrId);
  }
  return translateBackend(labelOrId);
}

function formatRequiredTechLabel(requiredTech: Phase1ProductionMode["requiredTech"]): string | null {
  if (!requiredTech) {
    return null;
  }
  if (Array.isArray(requiredTech)) {
    return requiredTech.map((techId) => getTechnologyLabel(techId)).join(" + ");
  }
  return getTechnologyLabel(requiredTech);
}

function formatCapacityPreview(currentCapacity: number, delta: number): string {
  if (delta === 0) {
    return `${currentCapacity}`;
  }
  return `${currentCapacity} → ${Math.max(0, currentCapacity + delta)}`;
}

function formatSignedNumber(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function formatFactoryAriaLabel(action: string, subject: string, detail?: string | null) {
  const separator = i18n.language.startsWith("zh") ? "：" : ": ";
  const prefix = i18n.language.startsWith("zh") ? `${action}${subject}` : `${action} ${subject}`;
  return detail ? `${prefix}${separator}${detail}` : prefix;
}

function renderEffectTags(
  effects: { label: string; value: string | number; temporary?: boolean; tone?: "positive" | "negative" }[] | undefined,
) {
  if (!effects || effects.length === 0) {
    return null;
  }
  return (
    <div className="factory-command-row__effects">
      {effects.map((effect) => {
        const className = [
          effect.temporary && "factory-command-row__effect--temporary",
          effect.tone && `factory-command-row__effect--${effect.tone}`,
        ].filter(Boolean).join(" ");
        return (
          <span key={`${effect.label}-${effect.value}`} className={className || undefined}>
            {effect.value ? `${translateBackend(effect.label)} ${effect.value}` : translateBackend(effect.label)}
          </span>
        );
      })}
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
