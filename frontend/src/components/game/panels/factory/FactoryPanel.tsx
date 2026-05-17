import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n, { translateBackend } from "../../../../i18n";
import type { DecisionPlayerPhaseWorkspace, FactoryExpansionOption, FactoryNewFactoryOption, FactoryUpgradeOption, Phase1ProductionMode } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import {
  getRouteOrderQuantity,
} from "../../../../features/game/decisionDrafts";
import { getTechnologyLabel } from "../../../../features/game/panelGlossary";
import {
  buildEffectMetrics,
  calculatePhase1ProductionSpend,
  calculateTechResearchPreview,
  flattenTechTree,
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
    (action) => action.actionId !== "industrial_upgrade" && Number(action.effects?.techPointsDelta ?? 0) === 0,
  );
  const selectedFactoryActionIds = new Set((draft.factoryPlan.factoryActions ?? []).map((item) => item.actionId));
  const rawMaterialsDelta = sumSelectedFactoryActionEffect(workspace, draft, "rawMaterialsDelta");
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

  const expansionOptionsByRoute = new Map(workspace.expansionOptions.map((option) => [option.routeId, option]));
  const upgradeOptionsByRoute = new Map(workspace.upgradeOptions.map((option) => [option.routeId, option]));
  const newFactoryOptionsByRoute = new Map(workspace.newFactoryOptions.map((option) => [option.routeId, option]));
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
  ) => {
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
        </article>
      );
    }

    const quantity = getConstructionQuantity(draft, option.routeId, kind);
    const maxQuantity = Math.max(quantity, option.maxQuantity);
    const noBudget = quantity < maxQuantity && remainingFactoryBudget < option.unitBudgetCost;
    const lockedReason = option.lockedReason ? translateBackend(option.lockedReason) : null;
    const disabled = lockedReason !== null || noBudget;
    const costText = i18n.t("game:factory.costPerOrder", "{{cost}} 工厂预算/次", { cost: option.unitBudgetCost });
    const status = quantity > 0
      ? i18n.t("game:factory.plannedCount", "已安排 {{count}} 次", { count: quantity })
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
            aria-label={`${t("common:revoke")} ${title}：${translateBackend(option.routeLabel)}`}
          >
            -
          </button>
          <strong>{quantity}</strong>
          <button
            type="button"
            disabled={disabled || quantity >= maxQuantity}
            onClick={() => onConstructionQuantityChange(option.routeId, kind, quantity + 1)}
            aria-label={`${t("common:select")} ${title}：${translateBackend(option.routeLabel)}`}
          >
            +
          </button>
        </div>
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
          ) : null}
        </div>

        <div className="factory-panel--v2__right">
          {hasConstructionStages && (
            <div className="factory-panel__section factory-panel__section--stages">
              <h4 className="factory-section-label">
                <span className="factory-section-label__icon">🏗️</span>
                {t("game:factory.industrialDevelopment", "产业建设")}
              </h4>
              <div className="factory-stage-grid">
                {constructionStages.map((mode) => {
                  const expansionOption = expansionOptionsByRoute.get(mode.mode) ?? null;
                  const newFactoryOption = newFactoryOptionsByRoute.get(mode.mode) ?? null;
                  const increaseOption = expansionOption ?? newFactoryOption;
                  const increaseKind: ConstructionKind = expansionOption ? "expansion" : "newFactory";
                  const upgradeOption = upgradeOptionsByRoute.get(mode.mode) ?? null;
                  const immediateDelta = capacityDeltaByMode[mode.mode] ?? 0;
                  const expansionQuantity = expansionOption ? getConstructionQuantity(draft, mode.mode, "expansion") : 0;
                  const newFactoryQuantity = newFactoryOption ? getConstructionQuantity(draft, mode.mode, "newFactory") : 0;
                  const nextRoundDelta = expansionQuantity * (expansionOption?.capacityDelta ?? 0)
                    + newFactoryQuantity * (newFactoryOption?.capacityDelta ?? 0);
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
                          {t("game:factory.currentCapacity", "当前产能")}
                          <strong>{formatCapacityPreview(mode.currentCapacity, immediateDelta)}</strong>
                        </span>
                        <span>
                          {t("game:factory.outputRatio", "产出倍率")}
                          <strong>x{mode.outputRatio}</strong>
                        </span>
                        <span>
                          {t("game:factory.nextRoundCapacityDelta", "下回合产能")}
                          <strong>{formatSignedNumber(nextRoundDelta)}</strong>
                        </span>
                      </div>
                      <div className="factory-stage-card__actions">
                        {renderConstructionControl(
                          increaseOption,
                          increaseKind,
                          t("game:factory.factoryIncrease", "工厂增加"),
                          increaseDescription,
                          t("game:factory.noFactoryIncreasePath", "当前无法为该阶段增加工厂"),
                        )}
                        {renderConstructionControl(
                          upgradeOption,
                          "upgrade",
                          t("game:factory.industryUpgrade", "产业升级"),
                          upgradeDescription,
                          mode.mode === "handicraft"
                            ? t("game:factory.baseStageNoUpgrade", "基础阶段无需升级")
                            : t("game:factory.noUpgradePath", "当前没有可用升级路径"),
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
    return t("game:factory.stageAvailable", "已解锁，可投入建设");
  }
  const techLabel = formatRequiredTechLabel(mode.requiredTech) ?? String(t("game:factory.notUnlocked"));
  return t("game:factory.stageLocked", "需 {{tech}}", { tech: techLabel });
}

function buildFactoryIncreaseDescription(
  option: ConstructionOption,
  kind: ConstructionKind,
  t: TFunction,
): string {
  const key = kind === "newFactory" ? "game:factory.newFactoryIncreaseDescription" : "game:factory.factoryIncreaseDescription";
  const defaultValue = kind === "newFactory"
    ? "新建首座 {{target}} 工厂：新增 {{delta}} 点产能，下回合生效；用于从 0 打开该阶段，所以成本高于后续扩建。"
    : "扩建已有 {{target}} 工厂：新增 {{delta}} 点产能，下回合生效；不消耗已有产能。";
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
      defaultValue: "工厂增加 = 新增 {{target}} 产能，下回合生效。前置：先解锁 {{target}}（{{tech}}）。",
      target,
      tech,
    });
  }
  return t("game:factory.factoryIncreaseUnavailableDescription", {
    defaultValue: "工厂增加 = 新增 {{target}} 产能，下回合生效。当前不能增加：该阶段暂未开放新建或扩建工厂。",
    target,
  });
}

function buildIndustryUpgradeDescription(
  option: FactoryUpgradeOption,
  t: TFunction,
): string {
  const delta = Math.max(1, option.capacityDelta ?? 1);
  return t("game:factory.industryUpgradeDescription", {
    defaultValue: "{{source}} → {{target}}：每次消耗 {{delta}} 点 {{source}} 产能，立即转为 {{delta}} 点 {{target}} 产能；本回合可生产，不增加总产能。",
    delta,
    source: translateBackend(option.sourceRouteLabel),
    target: translateBackend(option.routeLabel),
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
      defaultValue: "产业升级 = 把上一级产能转成本阶段产能。手工业是基础阶段，没有更低级产能可升级。",
    });
  }

  const sourceMode = modes.find((candidate) => candidate.mode === sourceModeId);
  const source = sourceMode ? translateBackend(sourceMode.label) : sourceModeId;
  const tech = formatRequiredTechLabel(mode.requiredTech);
  const prerequisite = tech
    ? t("game:factory.industryUpgradePrerequisiteWithTech", {
      defaultValue: "解锁 {{target}}（{{tech}}） + 至少 1 点 {{source}} 产能",
      target,
      tech,
      source,
    })
    : t("game:factory.industryUpgradePrerequisiteWithoutTech", {
      defaultValue: "至少 1 点 {{source}} 产能",
      source,
    });

  return t("game:factory.industryUpgradeUnavailableDescription", {
    defaultValue: "产业升级 = {{source}} → {{target}}。前置：{{prerequisite}}；执行后消耗 1 点 {{source}} 产能，立即转为 1 点 {{target}} 产能。",
    source,
    target,
    prerequisite,
  });
}

function getUpgradeSourceMode(targetMode: string): string | null {
  const targetIndex = PRODUCTION_STAGE_ORDER.indexOf(targetMode);
  if (targetIndex <= 0) {
    return null;
  }
  return PRODUCTION_STAGE_ORDER[targetIndex - 1] ?? null;
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
